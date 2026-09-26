import { startLoopback } from "../../platform/loopback";
import { httpJson, type HttpResult } from "../../platform/http";
import { challengeS256, generateState, generateVerifier } from "../../core/pkce";
import type { CredentialStore } from "../../core/credentials";
import type { AccountStatus } from "../../core/types";
import { AuthError, FetchError } from "../types";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const CALLBACK_PORT = 1455;
const CALLBACK_PATH = "/auth/callback";
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPES = "openid profile email offline_access api.connectors.read api.connectors.invoke";

interface StoredCreds {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt: number;
  accountId: string;
  planType: string | null;
  email: string | null;
  source: "in-app";
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  message?: string;
}

export interface CodexAccount {
  accountId: string;
  planType: string | null;
  email: string | null;
}

export interface CodexAuthStart {
  url: string;
  wait: () => Promise<void>;
  cancel: () => void;
}

function decodeJwt(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringClaim(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function tokenMetadata(accessToken: string, idToken?: string): {
  accountId: string | null;
  planType: string | null;
  email: string | null;
  expiresAt: number | null;
} {
  const access = decodeJwt(accessToken);
  const identity = decodeJwt(idToken);
  const claims = [access, identity].filter((value): value is Record<string, unknown> => value !== null);
  let accountId: string | null = null;
  let planType: string | null = null;
  let email: string | null = null;
  let expiresAt: number | null = null;

  for (const payload of claims) {
    const namespaced = payload["https://api.openai.com/auth"];
    const auth = namespaced && typeof namespaced === "object" ? (namespaced as Record<string, unknown>) : null;
    const namespacedProfile = payload["https://api.openai.com/profile"];
    const profile =
      namespacedProfile && typeof namespacedProfile === "object"
        ? (namespacedProfile as Record<string, unknown>)
        : null;
    accountId ??=
      stringClaim(auth, "chatgpt_account_id") ??
      stringClaim(payload, "chatgpt_account_id") ??
      stringClaim(payload, "account_id");
    planType ??= stringClaim(auth, "chatgpt_plan_type") ?? stringClaim(payload, "chatgpt_plan_type");
    email ??= stringClaim(profile, "email") ?? stringClaim(payload, "email");
    if (expiresAt === null && typeof payload.exp === "number") expiresAt = payload.exp * 1000;
  }
  return { accountId, planType, email, expiresAt };
}

export function createAuth(credentials: CredentialStore) {
  async function loadCreds(): Promise<StoredCreds | null> {
    const raw = await credentials.get();
    if (!raw) return null;
    try {
      const creds = JSON.parse(raw) as StoredCreds;
      return creds.accessToken && creds.accountId ? creds : null;
    } catch {
      return null;
    }
  }

  async function saveCreds(creds: StoredCreds): Promise<void> {
    await credentials.set(JSON.stringify(creds));
  }

  function tokenError(prefix: string, result: HttpResult<TokenResponse>): Error {
    const detail = result.data?.error_description ?? result.data?.message ?? result.data?.error;
    return new Error(`${prefix} failed (HTTP ${result.status})${detail ? `: ${detail}` : ""}`);
  }

  function postToken(body: Record<string, string>): Promise<HttpResult<TokenResponse>> {
    return httpJson<TokenResponse>(TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      timeoutMs: 30_000,
    });
  }

  async function exchangeCode(code: string, verifier: string): Promise<void> {
    const result = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    });
    if (!result.ok || !result.data?.access_token || !result.data.refresh_token) {
      throw tokenError("Token exchange", result);
    }
    const metadata = tokenMetadata(result.data.access_token, result.data.id_token);
    if (!metadata.accountId) {
      throw new Error("Codex sign-in succeeded, but the ChatGPT account ID was missing from the token");
    }
    await saveCreds({
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token,
      idToken: result.data.id_token,
      expiresAt:
        metadata.expiresAt ?? Date.now() + Math.max(60, result.data.expires_in ?? 3600) * 1000,
      accountId: metadata.accountId,
      planType: metadata.planType,
      email: metadata.email,
      source: "in-app",
    });
  }

  async function refresh(creds: StoredCreds): Promise<StoredCreds> {
    const result = await postToken({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
      client_id: CLIENT_ID,
    });
    if (!result.ok || !result.data?.access_token) {
      if (result.status === 429) throw new FetchError(tokenError("Token refresh", result).message, result.retryAfterMs, result.status);
      throw new AuthError(tokenError("Token refresh", result).message, "expired");
    }
    const idToken = result.data.id_token ?? creds.idToken;
    const metadata = tokenMetadata(result.data.access_token, idToken);
    const updated: StoredCreds = {
      ...creds,
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token ?? creds.refreshToken,
      idToken,
      expiresAt:
        metadata.expiresAt ?? Date.now() + Math.max(60, result.data.expires_in ?? 3600) * 1000,
      accountId: metadata.accountId ?? creds.accountId,
      planType: metadata.planType ?? creds.planType,
      email: metadata.email ?? creds.email,
    };
    await saveCreds(updated);
    return updated;
  }

  async function beginAuth(): Promise<CodexAuthStart> {
    const verifier = generateVerifier();
    const challenge = await challengeS256(verifier);
    const state = generateState();
    const loopback = await startLoopback({
      port: CALLBACK_PORT,
      callbackPath: CALLBACK_PATH,
      expectedState: state,
    });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge: challenge,
      code_challenge_method: "S256",
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      state,
      originator: "codex_cli_rs",
    });
    return {
      url: `${AUTHORIZE_URL}?${params.toString()}`,
      wait: async () => {
        const code = await loopback.wait();
        await exchangeCode(code, verifier);
      },
      cancel: () => {
        loopback.cancel();
      },
    };
  }

  async function ensureFreshToken(): Promise<string> {
    let creds = await loadCreds();
    if (!creds) throw new AuthError("not signed in", "signed_out");
    if (Date.now() >= creds.expiresAt - 60_000) creds = await refresh(creds);
    return creds.accessToken;
  }

  async function forceRefresh(): Promise<string> {
    const creds = await loadCreds();
    if (!creds) throw new AuthError("not signed in", "signed_out");
    return (await refresh(creds)).accessToken;
  }

  async function getAccount(): Promise<CodexAccount> {
    const creds = await loadCreds();
    if (!creds) throw new AuthError("not signed in", "signed_out");
    return { accountId: creds.accountId, planType: creds.planType, email: creds.email };
  }

  async function getStatus(): Promise<AccountStatus> {
    return (await loadCreds()) ? "signed_in" : "signed_out";
  }

  async function signOut(): Promise<void> {
    await credentials.delete();
  }

  return { beginAuth, ensureFreshToken, forceRefresh, getAccount, getStatus, signOut };
}
