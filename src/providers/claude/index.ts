import { AuthError, FetchError, type ProviderDefinition, type SignInFlow } from "../types";
import type { ProviderSnapshot } from "../../core/types";
import { createAuth } from "./auth";
import { fetchCredits, fetchUsage } from "./api";
import { parseClaudeUsage } from "./parse";

export const claudeProvider: ProviderDefinition = {
  id: "claude",
  minIntervalSec: 180, // usage endpoint rate-limits per token; see docs/PROVIDERS.md

  create(credentials) {
    const auth = createAuth(credentials);
    return {
      getStatus: auth.getStatus,
      signOut: auth.signOut,

      async beginSignIn(): Promise<SignInFlow> {
        const url = await auth.beginAuth();
        return { kind: "paste", url, complete: (input) => auth.completeAuth(input) };
      },

      async fetchSnapshot(): Promise<ProviderSnapshot> {
        let token = await auth.ensureFreshToken(); // throws AuthError when signed out
        let res = await fetchUsage(token);
        if (res.status === 401) {
          token = await auth.forceRefresh(); // one refresh + retry
          res = await fetchUsage(token);
        }
        if (res.status === 401 || res.status === 403) {
          throw new AuthError(`usage unauthorized (HTTP ${res.status})`, "expired");
        }
        if (!res.ok) {
          throw new FetchError(`usage HTTP ${res.status}`, res.retryAfterMs, res.status);
        }
        const [subscriptionType, credits] = await Promise.all([auth.getSubscriptionType(), fetchCredits(token)]);
        return parseClaudeUsage(res.data, subscriptionType, credits);
      },
    };
  },
};
