// Provider contract. Usage data always comes from the provider's server API,
// never from local logs, so it is correct across all of the user's machines.
import type { AccountStatus, ProviderId, ProviderSnapshot } from "../core/types";
import type { CredentialStore } from "../core/credentials";

/**
 * Interactive sign-in variants:
 * - `paste`: open `url` in the browser; the user copies a code back into the app
 *   and we call `complete(code)` (Claude).
 * - `loopback`: open `url`; a local server captures the redirect (Codex, Gemini).
 * - `apiKey`: the user pastes a key we validate + store (Kimi, OpenRouter, z.ai).
 */
export type SignInFlow =
  | { kind: "paste"; url: string; complete: (input: string) => Promise<void> }
  | { kind: "loopback"; url: string; wait: () => Promise<void>; cancel: () => void }
  | { kind: "apiKey"; helpUrl?: string; save: (key: string) => Promise<void> };

export interface ProviderDefinition {
  id: ProviderId;
  /** Fetch floor in seconds; the scheduler never polls faster (Claude 180, others 60). */
  minIntervalSec: number;

  /** One client per tracked account; `credentials` is that account's encrypted slot. */
  create(credentials: CredentialStore): ProviderClient;
}

/** An account-scoped client. Never share one between trackers. */
export interface ProviderClient {
  getStatus(): Promise<AccountStatus>;
  beginSignIn(): Promise<SignInFlow>;
  signOut(): Promise<void>;
  /** ensureFreshToken() + fetch + parse. Throws on auth/network failure. */
  fetchSnapshot(): Promise<ProviderSnapshot>;

  // Optional CLI import (default auth is in-app OAuth per user preference).
  detectCliCredentials?(): Promise<boolean>;
  importFromCli?(): Promise<void>;
}

/** Thrown by fetchSnapshot when the account needs (re)authentication. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: AccountStatus = "signed_out",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Transport failure with an optional server retry deadline. */
export class FetchError extends Error {
  constructor(message: string, readonly retryAfterMs?: number, readonly status?: number) {
    super(message);
    this.name = "FetchError";
  }
}
