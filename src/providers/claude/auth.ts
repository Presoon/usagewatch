// Claude OAuth (in-app PKCE "paste code" flow). Tokens live
// in DPAPI (secrets.ts), never in config. This is the CLI-free sign-in path.
import type { CredentialStore } from "../../core/credentials";
import { httpJson, type HttpResult } from "../../platform/http";
import { generateVerifier, challengeS256 } from "../../core/pkce";
import type { AccountStatus } from "../../core/types";
import { AuthError, FetchError } from "../types";
import { CLAUDE_REQUEST_HEADERS } from "./client";

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const SCOPES = "org:create_api_key user:profile user:inference";

interface StoredCreds {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  subscriptionType?: string | null;
  source: "in-app" | "cli";
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  account?: { subscription_type?: string | null } | null;
}

interface OAuthErrorResponse {
  error?: string | { message?: string };
  error_description?: string;
  message?: string;
}

const TOKEN_TIMEOUT_MS = 120_000;
const MAX_INLINE_RETRY_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function oauthErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const value = data as OAuthErrorResponse;
  if (typeof value.error === "object" && typeof value.error?.message === "string") {
    return value.error.message;
  }
  if (typeof value.error_description === "string") return value.error_description;
  if (typeof value.message === "string") return value.message;
  if (typeof value.error === "string") return value.error;
  return null;
}

function tokenFailure(prefix: string, res: HttpResult<unknown>): string {
  const detail = oauthErrorMessage(res.data);
  if (res.status === 429) {
    if (res.retryAfterMs !== undefined) {
      const seconds = Math.max(1, Math.ceil(res.retryAfterMs / 1000));
      return `${prefix} rate-limited (HTTP 429). Try again in ${seconds}s with a new code.`;
    }
    return `${prefix} rate-limited (HTTP 429). Wait 15–30 minutes, then start sign-in again.`;
  }
  return `${prefix} failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`;
}

async function postToken(body: Record<string, string>): Promise<HttpResult<TokenResponse>> {
  const request = () =>
    httpJson<TokenResponse>(TOKEN_URL, {
      method: "POST",
      headers: {
        ...CLAUDE_REQUEST_HEADERS,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: TOKEN_TIMEOUT_MS,
    });

  let res = await request();
  if (
    res.status === 429 &&
    res.retryAfterMs !== undefined &&
    res.retryAfterMs > 0 &&
    res.retryAfterMs <= MAX_INLINE_RETRY_MS
  ) {
    await sleep(res.retryAfterMs);
    res = await request();
  }
  return res;
}

export function createAuth(credentials: CredentialStore) {
  let pending: { verifier: string; state: string } | null = null;

  async function loadCreds(): Promise<StoredCreds | null> {
    const raw = await credentials.get();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredCreds;
    } catch {
      return null;
    }
  }

  async function saveCreds(creds: StoredCreds): Promise<void> {
    await credentials.set(JSON.stringify(creds));
  }

  /** Build the authorize URL and remember the PKCE verifier/state. */
  async function beginAuth(): Promise<string> {
    const verifier = generateVerifier();
    // Claude Code's hosted paste-code flow is intentionally non-standard here:
    // Anthropic expects state to be the same 43-char base64url value as the
    // verifier. An independent/shorter OAuth nonce is rejected by the authorize
    // page as "Invalid request format".
    const state = verifier;
    pending = { verifier, state };
    const challenge = await challengeS256(verifier);
    const params = new URLSearchParams({
      code: "true",
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Exchange the pasted `code#state` for tokens and store them. */
  async function completeAuth(pasted: string): Promise<void> {
    if (!pending) throw new Error("no sign-in in progress");
    const [code, returnedState] = pasted.trim().split("#");
    if (!code || !returnedState) throw new Error("invalid code (expected code#state)");
    if (returnedState !== pending.state) throw new Error("state mismatch");

    const res = await postToken({
      grant_type: "authorization_code",
      code,
      state: pending.state,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: pending.verifier,
    });
    if (!res.ok || !res.data?.access_token) {
      throw new Error(tokenFailure("Token exchange", res));
    }
    await saveCreds({
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token ?? "",
      expiresAt: Date.now() + (res.data.expires_in ?? 3600) * 1000,
      subscriptionType: res.data.account?.subscription_type ?? null,
      source: "in-app",
    });
    pending = null;
  }

  async function refresh(creds: StoredCreds): Promise<StoredCreds> {
    if (!creds.refreshToken) throw new AuthError("no refresh token", "expired");
    const res = await postToken({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
      client_id: CLIENT_ID,
    });
    if (!res.ok || !res.data?.access_token) {
      if (res.status === 429) throw new FetchError(tokenFailure("Token refresh", res), res.retryAfterMs, res.status);
      throw new AuthError(tokenFailure("Token refresh", res), "expired");
    }
    const updated: StoredCreds = {
      ...creds,
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token ?? creds.refreshToken,
      expiresAt: Date.now() + (res.data.expires_in ?? 3600) * 1000,
      subscriptionType: res.data.account?.subscription_type ?? creds.subscriptionType,
    };
    await saveCreds(updated);
    return updated;
  }

  /** A valid access token, refreshing if within 60s of expiry. */
  async function ensureFreshToken(): Promise<string> {
    let creds = await loadCreds();
    if (!creds) throw new AuthError("not signed in", "signed_out");
    if (Date.now() > creds.expiresAt - 60_000) creds = await refresh(creds);
    return creds.accessToken;
  }

  /** Force a refresh (used on a 401 retry). */
  async function forceRefresh(): Promise<string> {
    const creds = await loadCreds();
    if (!creds) throw new AuthError("not signed in", "signed_out");
    return (await refresh(creds)).accessToken;
  }

  async function getStatus(): Promise<AccountStatus> {
    return (await loadCreds()) ? "signed_in" : "signed_out";
  }

  async function getSubscriptionType(): Promise<string | null> {
    return (await loadCreds())?.subscriptionType ?? null;
  }

  async function signOut(): Promise<void> {
    await credentials.delete();
    pending = null;
  }

  return { beginAuth, completeAuth, ensureFreshToken, forceRefresh, getStatus, getSubscriptionType, signOut };
}
