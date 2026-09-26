import type { ProviderSnapshot } from "../../core/types";
import { fetchUsage } from "./api";
import { createAuth } from "./auth";
import { parseCodexUsage } from "./parse";
import { AuthError, FetchError, type ProviderDefinition, type SignInFlow } from "../types";

export const codexProvider: ProviderDefinition = {
  id: "codex",
  minIntervalSec: 60,

  create(credentials) {
    const auth = createAuth(credentials);
    return {
      getStatus: auth.getStatus,
      signOut: auth.signOut,

      async beginSignIn(): Promise<SignInFlow> {
        const flow = await auth.beginAuth();
        return { kind: "loopback", ...flow };
      },

      async fetchSnapshot(): Promise<ProviderSnapshot> {
        const account = await auth.getAccount();
        let token = await auth.ensureFreshToken();
        let result = await fetchUsage(token, account.accountId);
        if (result.status === 401) {
          token = await auth.forceRefresh();
          result = await fetchUsage(token, account.accountId);
        }
        if (result.status === 401 || result.status === 403) {
          throw new AuthError(`usage unauthorized (HTTP ${result.status})`, "expired");
        }
        if (!result.ok) {
          throw new FetchError(`usage HTTP ${result.status}`, result.retryAfterMs, result.status);
        }
        return parseCodexUsage(result.data, account);
      },
    };
  },
};
