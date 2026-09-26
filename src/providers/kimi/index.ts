import type { ProviderSnapshot } from "../../core/types";
import { AuthError, FetchError, type ProviderDefinition, type SignInFlow } from "../types";
import { createApiKeyAuth } from "../apiKeyAuth";
import { fetchUsage, type KimiUsageResponse } from "./api";
import { parseKimiUsage } from "./parse";

const CONSOLE_URL = "https://www.kimi.com/code/console";

function hasUsableUsage(data: KimiUsageResponse): boolean {
  return !!data?.usage && data.usage.limit !== undefined;
}

export const kimiProvider: ProviderDefinition = {
  id: "kimi",
  minIntervalSec: 60,

  create(credentials) {
    const auth = createApiKeyAuth(credentials, "Kimi Code");
    async function validateAndSave(key: string): Promise<void> {
      const value = key.trim();
      if (!value) throw new Error("Kimi Code API key is required");
      const result = await fetchUsage(value);
      if (result.status === 401) throw new Error("Invalid Kimi Code API key");
      if (result.status === 403) {
        throw new Error("This API key does not have access to Kimi Code usage. Check your Kimi Code subscription.");
      }
      if (!result.ok) throw new Error(`Could not validate Kimi Code API key (HTTP ${result.status})`);
      if (!hasUsableUsage(result.data)) throw new Error("Kimi Code returned an unexpected usage response");
      await auth.saveApiKey(value);
    }

    return {
      getStatus: auth.getStatus,
      signOut: auth.signOut,

      async beginSignIn(): Promise<SignInFlow> {
        return { kind: "apiKey", helpUrl: CONSOLE_URL, save: validateAndSave };
      },

      async fetchSnapshot(): Promise<ProviderSnapshot> {
        const key = await auth.getApiKey();
        const result = await fetchUsage(key);
        if (result.status === 401) throw new AuthError("Kimi Code API key is invalid", "expired");
        if (result.status === 403) {
          throw new AuthError(
            "Kimi Code usage is not available for this API key. Check your subscription or reconnect with another key.",
            "expired",
          );
        }
        if (!result.ok) throw new FetchError(`Kimi usage HTTP ${result.status}`, result.retryAfterMs, result.status);
        const snapshot = parseKimiUsage(result.data);
        if (snapshot.meters.length === 0) throw new FetchError("Kimi returned no usable quota data");
        return snapshot;
      },
    };
  },
};
