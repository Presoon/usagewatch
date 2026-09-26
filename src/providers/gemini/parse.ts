import type { Meter, ProviderSnapshot } from "../../core/types";
import { meterState } from "../../core/usage";
import type { GeminiCodeAssistResponse, GeminiQuotaBucket, GeminiQuotaResponse } from "./api";

type Family = "pro" | "flash" | "lite";

function familyOf(modelId: string): Family | null {
  const model = modelId.toLowerCase();
  if (model.includes("flash-lite")) return "lite";
  if (model.includes("flash")) return "flash";
  if (model.includes("pro")) return "pro";
  return null;
}

function validReset(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return new Date(parsed).toISOString();
}

function pickWorst(buckets: GeminiQuotaBucket[]): Map<Family, GeminiQuotaBucket> {
  const picked = new Map<Family, GeminiQuotaBucket>();
  for (const bucket of buckets) {
    if (!bucket.modelId || typeof bucket.remainingFraction !== "number") continue;
    const family = familyOf(bucket.modelId);
    if (!family) continue;
    const current = picked.get(family);
    if (!current || bucket.remainingFraction < (current.remainingFraction ?? 1)) picked.set(family, bucket);
  }
  return picked;
}

function planLabel(
  codeAssist: GeminiCodeAssistResponse,
  hostedDomain: string | null,
): string | null {
  if (codeAssist.paidTier?.name) return codeAssist.paidTier.name;
  const tier = codeAssist.currentTier?.id;
  if (tier === "free-tier") return "Free";
  if (tier === "standard-tier") return hostedDomain ? "Workspace" : "Pro";
  if (tier === "legacy-tier") return "Legacy";
  return codeAssist.currentTier?.name ?? null;
}

export function parseGeminiUsage(
  quota: GeminiQuotaResponse,
  codeAssist: GeminiCodeAssistResponse,
  account: { email: string; hostedDomain: string | null },
): ProviderSnapshot {
  const tierId = codeAssist.currentTier?.id ?? null;
  const grouped = pickWorst(quota.buckets ?? []);
  const order: Array<{ family: Family; label: string }> = [
    { family: "pro", label: "Pro" },
    { family: "flash", label: "Flash" },
    { family: "lite", label: "Lite" },
  ];
  const meters: Meter[] = [];
  for (const { family, label } of order) {
    const bucket = grouped.get(family);
    if (!bucket || typeof bucket.remainingFraction !== "number") continue;
    const resetsAt = validReset(bucket.resetTime);
    if (family === "pro" && tierId === "free-tier") continue;
    if (bucket.remainingFraction <= 0 && resetsAt === null) continue;
    const percentLeft = Math.max(0, Math.min(100, Math.round(bucket.remainingFraction * 100)));
    meters.push({ id: family, label, percentLeft, resetsAt, state: meterState(percentLeft) });
  }

  return {
    providerId: "gemini",
    planLabel: planLabel(codeAssist, account.hostedDomain),
    accountLabel: account.email,
    meters,
    infoRows: [],
    fetchedAt: new Date().toISOString(),
  };
}
