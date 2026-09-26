import type { CredentialStore } from "../core/credentials";
import { AuthError } from "./types";
import type { AccountStatus } from "../core/types";

export function createApiKeyAuth(credentials: CredentialStore, name: string) {
  return {
    async getApiKey(): Promise<string> {
      const key = (await credentials.get())?.trim();
      if (!key) throw new AuthError("not signed in", "signed_out");
      return key;
    },
    async saveApiKey(key: string): Promise<void> {
      const value = key.trim();
      if (!value) throw new Error(`${name} API key is required`);
      await credentials.set(value);
    },
    async getStatus(): Promise<AccountStatus> {
      return (await credentials.get())?.trim() ? "signed_in" : "signed_out";
    },
    signOut: () => credentials.delete(),
  };
}
