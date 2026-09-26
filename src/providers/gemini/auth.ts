import { startLoopback } from "../../platform/loopback";
import { httpJson, type HttpResult } from "../../platform/http";
import { challengeS256, generateState, generateVerifier } from "../../core/pkce";
import type { CredentialStore } from "../../core/credentials";
import type { AccountStatus } from "../../core/types";
import { AuthError, FetchError } from "../types";

const CLIENT_ID = "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALLBACK_PATH = "/oauth/callback";
const SCOPES =
  "https://www.googleapis.com/auth/cloud-platform openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";

interface StoredCreds {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
  email: string;
  hostedDomain: string | null;
  projectId: string | null;
  tierId: string | null;
  tierName: string | null;
  source: "in-app";
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export interface GeminiAccount {
  email: string;
  hostedDomain: string | null;
  projectId: string | null;
  tierId: string | null;
  tierName: string | null;
}

export interface GeminiAuthStart {
  url: string;
  wait: () => Promise<void>;
  cancel: () => void;
}

function decodeJwt(token: string): Record<string, unknown> | null {
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

function identityFromToken(idToken: string): { email: string; hostedDomain: string | null } {
  const claims = decodeJwt(idToken);
  const email = typeof claims?.email === "string" ? claims.email.trim() : "";
  if (!email) throw new Error("Gemini sign-in succeeded, but the Google account email was missing");
  return {
    email,
    hostedDomain: typeof claims?.hd === "string" && claims.hd ? claims.hd : null,
  };
}

export function createAuth(credentials: CredentialStore) {
  async function loadCreds(): Promise<StoredCreds | null> {
    const raw = await credentials.get();
    if (!raw) return null;
    try {
      const creds = JSON.parse(raw) as StoredCreds;
      return creds.accessToken && creds.refreshToken && creds.email ? creds : null;
    } catch {
      return null;
    }
  }

  async function saveCreds(creds: StoredCreds): Promise<void> {
    await credentials.set(JSON.stringify(creds));
  }

  function tokenError(prefix: string, result: HttpResult<TokenResponse>): Error {
    const data = result.data as unknown;
    const detail =
      data && typeof data === "object"
        ? ((data as TokenResponse).error_description ?? (data as TokenResponse).error)
        : typeof data === "string"
          ? data.slice(0, 200)
          : null;
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

  async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<void> {
    const result = await postToken({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
    });
    if (
      !result.ok ||
      !result.data?.access_token ||
      !result.data.refresh_token ||
      !result.data.id_token
    ) {
      throw tokenError("Gemini token exchange", result);
    }
    const identity = identityFromToken(result.data.id_token);
    await saveCreds({
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token,
      idToken: result.data.id_token,
      expiresAt: Date.now() + Math.max(60, result.data.expires_in ?? 3600) * 1000,
      email: identity.email,
      hostedDomain: identity.hostedDomain,
      projectId: null,
      tierId: null,
      tierName: null,
      source: "in-app",
    });
  }

  async function refresh(creds: StoredCreds): Promise<StoredCreds> {
    const result = await postToken({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });
    if (!result.ok || !result.data?.access_token) {
      if (result.status === 429) throw new FetchError(tokenError("Gemini token refresh", result).message, result.retryAfterMs, result.status);
      throw new AuthError(tokenError("Gemini token refresh", result).message, "expired");
    }
    const idToken = result.data.id_token ?? creds.idToken;
    const identity = identityFromToken(idToken);
    const updated: StoredCreds = {
      ...creds,
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token ?? creds.refreshToken,
      idToken,
      expiresAt: Date.now() + Math.max(60, result.data.expires_in ?? 3600) * 1000,
      email: identity.email,
      hostedDomain: identity.hostedDomain,
    };
    await saveCreds(updated);
    return updated;
  }

  async function beginAuth(): Promise<GeminiAuthStart> {
    const verifier = generateVerifier();
    const challenge = await challengeS256(verifier);
    const state = generateState();
    const loopback = await startLoopback({
      port: 0,
      callbackPath: CALLBACK_PATH,
      expectedState: state,
    });
    const redirectUri = `http://localhost:${loopback.port}${CALLBACK_PATH}`;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      scope: SCOPES,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      access_type: "offline",
      prompt: "consent",
    });
    return {
      url: `${AUTHORIZE_URL}?${params.toString()}`,
      wait: async () => {
        const code = await loopback.wait();
        await exchangeCode(code, verifier, redirectUri);
      },
      cancel: () => {
        loopback.cancel();
      },
    };
  }

  async function ensureFreshToken(): Promise<string> {
    let creds = await loadCreds();
    if (!creds) throw new AuthError("not signed in", "signed_out");
    if (Date.now() >= creds.expiresAt - 5 * 60_000) creds = await refresh(creds);
    return creds.accessToken;
  }

  async function forceRefresh(): Promise<string> {
    const creds = await loadCreds();
    if (!creds) throw new AuthError("not signed in", "signed_out");
    return (await refresh(creds)).accessToken;
  }

  async function getAccount(): Promise<GeminiAccount> {
    const creds = await loadCreds();
    if (!creds) throw new AuthError("not signed in", "signed_out");
    return {
      email: creds.email,
      hostedDomain: creds.hostedDomain,
      projectId: creds.projectId,
      tierId: creds.tierId,
      tierName: creds.tierName,
    };
  }

  async function updateMetadata(metadata: {
    projectId: string | null;
    tierId: string | null;
    tierName: string | null;
  }): Promise<void> {
    const creds = await loadCreds();
    if (creds) await saveCreds({ ...creds, ...metadata });
  }

  async function getStatus(): Promise<AccountStatus> {
    return (await loadCreds()) ? "signed_in" : "signed_out";
  }

  async function signOut(): Promise<void> {
    await credentials.delete();
  }

  return { beginAuth, ensureFreshToken, forceRefresh, getAccount, updateMetadata, getStatus, signOut };
}
