import type { ProviderSnapshot } from "../../core/types";
import { AuthError, FetchError, type ProviderDefinition, type SignInFlow } from "../types";
import { createApiKeyAuth } from "../apiKeyAuth";
import { fetchCredits, type OpenRouterCreditsResponse } from "./api";
import { parseOpenRouterCredits } from "./parse";

const KEYS_URL = "https://openrouter.ai/settings/keys";

function hasUsableCredits(data: OpenRouterCreditsResponse): boolean {
  return typeof data?.data?.total_credits === "number";
}

export const openrouterProvider: ProviderDefinition = {
  id: "openrouter",
  minIntervalSec: 60,

  create(credentials) {
    const auth = createApiKeyAuth(credentials, "OpenRouter");
    async function validateAndSave(key: string): Promise<void> {
      const value = key.trim();
      if (!value) throw new Error("OpenRouter API key is required");
      const result = await fetchCredits(value);
      if (result.status === 401) throw new Error("Invalid OpenRouter API key");
      if (!result.ok) throw new Error(`Could not validate OpenRouter API key (HTTP ${result.status})`);
      if (!hasUsableCredits(result.data)) throw new Error("OpenRouter returned an unexpected credits response");
      await auth.saveApiKey(value);
    }

    return {
      getStatus: auth.getStatus,
      signOut: auth.signOut,

      async beginSignIn(): Promise<SignInFlow> {
        return { kind: "apiKey", helpUrl: KEYS_URL, save: validateAndSave };
      },

      async fetchSnapshot(): Promise<ProviderSnapshot> {
        const key = await auth.getApiKey();
        const result = await fetchCredits(key);
        if (result.status === 401) throw new AuthError("OpenRouter API key is invalid", "expired");
        if (!result.ok) throw new FetchError(`OpenRouter credits HTTP ${result.status}`, result.retryAfterMs, result.status);
        const snapshot = parseOpenRouterCredits(result.data);
        if (snapshot.meters.length === 0) throw new FetchError("OpenRouter returned no credit data");
        return snapshot;
      },
    };
  },
};
