import type { ProviderSnapshot } from "../../core/types";
import { AuthError, FetchError, type ProviderDefinition, type SignInFlow } from "../types";
import { createApiKeyAuth } from "../apiKeyAuth";
import { fetchQuotaLimit, type ZaiQuotaLimitResponse } from "./api";
import { parseZaiQuotaLimit } from "./parse";

const API_KEYS_URL = "https://z.ai/manage-apikey/apikey-list";

function isAuthFailure(status: number, data: ZaiQuotaLimitResponse | undefined): boolean {
  if (status === 401 || status === 403) return true;
  const code = data?.code;
  return code === 401 || code === 403 || code === 1002 || code === 1003;
}

function hasUsableLimits(data: ZaiQuotaLimitResponse): boolean {
  return Array.isArray(data?.data?.limits);
}

export const zaiProvider: ProviderDefinition = {
  id: "zai",
  minIntervalSec: 60,

  create(credentials) {
    const auth = createApiKeyAuth(credentials, "Z.Ai");
    async function validateAndSave(key: string): Promise<void> {
      const value = key.trim();
      if (!value) throw new Error("Z.Ai API key is required");
      const result = await fetchQuotaLimit(value);
      if (isAuthFailure(result.status, result.data)) {
        throw new Error(`Invalid Z.Ai API key${result.data?.msg ? ` (${result.data.msg})` : ""}`);
      }
      if (!result.ok) throw new Error(`Could not validate Z.Ai API key (HTTP ${result.status})`);
      if (result.data?.success === false) {
        throw new Error(`Z.Ai rejected the request: ${result.data.msg ?? "unknown error"}`);
      }
      if (!hasUsableLimits(result.data)) throw new Error("Z.Ai returned an unexpected quota response");
      await auth.saveApiKey(value);
    }

    return {
      getStatus: auth.getStatus,
      signOut: auth.signOut,

      async beginSignIn(): Promise<SignInFlow> {
        return { kind: "apiKey", helpUrl: API_KEYS_URL, save: validateAndSave };
      },

      async fetchSnapshot(): Promise<ProviderSnapshot> {
        const key = await auth.getApiKey();
        const result = await fetchQuotaLimit(key);
        if (isAuthFailure(result.status, result.data)) {
          throw new AuthError("Z.Ai API key is invalid", "expired");
        }
        if (!result.ok) {
          throw new FetchError(`Z.Ai quota HTTP ${result.status}`, result.retryAfterMs, result.status);
        }
        const snapshot = parseZaiQuotaLimit(result.data);
        if (snapshot.meters.length === 0) {
          throw new FetchError("Z.Ai returned no quota limit data");
        }
        return snapshot;
      },
    };
  },
};
