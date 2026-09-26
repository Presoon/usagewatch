import type { ProviderSnapshot } from "../../core/types";
import { AuthError, FetchError, type ProviderDefinition, type SignInFlow } from "../types";
import { createAuth } from "./auth";
import {
  fetchCodeAssist,
  fetchProjects,
  fetchQuota,
  projectFromCodeAssist,
  projectFromList,
  type GeminiCodeAssistResponse,
  type GeminiQuotaResponse,
} from "./api";
import { parseGeminiUsage } from "./parse";

type PipelineResult =
  | {
      ok: true;
      codeAssist: GeminiCodeAssistResponse;
      quota: GeminiQuotaResponse;
      projectId: string | null;
    }
  | { ok: false; status: number; data: unknown; retryAfterMs?: number };

function failure(result: {
  status: number;
  data: unknown;
  retryAfterMs?: number;
}): Extract<PipelineResult, { ok: false }> {
  return {
    ok: false,
    status: result.status,
    data: result.data,
    retryAfterMs: result.retryAfterMs,
  };
}

async function fetchPipeline(accessToken: string, storedProjectId: string | null): Promise<PipelineResult> {
  const codeAssist = await fetchCodeAssist(accessToken);
  if (!codeAssist.ok) return failure(codeAssist);

  let projectId = projectFromCodeAssist(codeAssist.data) ?? storedProjectId;
  if (!projectId) {
    const projects = await fetchProjects(accessToken);
    if (projects.ok) projectId = projectFromList(projects.data);
    else if (projects.status === 401) return failure(projects);
  }

  let quota = await fetchQuota(accessToken, projectId);
  if (quota.status === 403 && projectId) quota = await fetchQuota(accessToken, null);
  if (!quota.ok) return failure(quota);
  return { ok: true, codeAssist: codeAssist.data, quota: quota.data, projectId };
}

function isUnsupported(result: Extract<PipelineResult, { ok: false }>): boolean {
  if (result.status === 403) return true;
  const body = JSON.stringify(result.data ?? "").toLowerCase();
  return (
    body.includes("unsupported_client") ||
    body.includes("ineligibletier") ||
    body.includes("not authorized")
  );
}

export const geminiProvider: ProviderDefinition = {
  id: "gemini",
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
        let result = await fetchPipeline(token, account.projectId);
        if (!result.ok && result.status === 401) {
          token = await auth.forceRefresh();
          result = await fetchPipeline(token, account.projectId);
        }
        if (!result.ok) {
          if (isUnsupported(result)) {
            throw new AuthError(
              "Gemini Code Assist quota is not available for this Google account. Consumer accounts may require Antigravity.",
              "unsupported",
            );
          }
          if (result.status === 401) {
            throw new AuthError("Gemini authorization expired", "expired");
          }
          throw new FetchError(`Gemini quota HTTP ${result.status}`, result.retryAfterMs, result.status);
        }

        const tierId = result.codeAssist.currentTier?.id ?? null;
        const tierName = result.codeAssist.paidTier?.name ?? result.codeAssist.currentTier?.name ?? null;
        await auth.updateMetadata({ projectId: result.projectId, tierId, tierName });
        const snapshot = parseGeminiUsage(result.quota, result.codeAssist, account);
        if (snapshot.meters.length === 0) throw new FetchError("Gemini returned no usable quota data");
        return snapshot;
      },
    };
  },
};
