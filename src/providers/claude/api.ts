// Claude usage endpoint. The claude-code User-Agent is critical
// for rate limits (see docs/PROVIDERS.md).
import { httpJson, type HttpResult } from "../../platform/http";
import { CLAUDE_REQUEST_HEADERS } from "./client";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

export interface ClaudeUsageWindow {
  utilization: number;
  resets_at: string;
}

export interface ClaudeExtraUsage {
  is_enabled?: boolean;
  monthly_limit?: number | null;
  used_credits?: number | null;
  utilization?: number | null;
  currency?: string | null;
  decimal_places?: number | null;
}

export interface ClaudeCreditsResponse {
  amount?: number;
  currency?: string;
  balance?: { money?: { amount_minor: number; currency: string; exponent: number } | null } | null;
}

export interface ClaudeUsageResponse {
  five_hour?: ClaudeUsageWindow | null;
  seven_day?: ClaudeUsageWindow | null;
  seven_day_opus?: ClaudeUsageWindow | null;
  seven_day_sonnet?: ClaudeUsageWindow | null;
  extra_usage?: ClaudeExtraUsage | null;
  // Windows may evolve; treat unknown keys defensively.
  [key: string]: unknown;
}

export function fetchUsage(accessToken: string): Promise<HttpResult<ClaudeUsageResponse>> {
  return httpJson<ClaudeUsageResponse>(USAGE_URL, {
    method: "GET",
    headers: {
      ...CLAUDE_REQUEST_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      "anthropic-beta": "oauth-2025-04-20",
      "Content-Type": "application/json",
    },
  });
}

// Optional billing data must not make the account's usage limits unavailable.
export async function fetchCredits(accessToken: string): Promise<ClaudeCreditsResponse | null> {
  const headers = {
    ...CLAUDE_REQUEST_HEADERS,
    Authorization: `Bearer ${accessToken}`,
    "anthropic-beta": "oauth-2025-04-20",
    "anthropic-version": "2023-06-01",
  };
  try {
    const profile = await httpJson<{ organization?: { uuid?: string } }>("https://api.anthropic.com/api/oauth/profile", {
      headers, timeoutMs: 5000,
    });
    const org = profile.data?.organization?.uuid;
    if (!profile.ok || typeof org !== "string" || !org) return null;
    const credits = await httpJson<ClaudeCreditsResponse>(`https://api.anthropic.com/api/oauth/organizations/${encodeURIComponent(org)}/prepaid/credits`, {
      headers: { ...headers, "x-organization-uuid": org }, timeoutMs: 5000,
    });
    return credits.ok ? credits.data : null;
  } catch {
    return null;
  }
}
