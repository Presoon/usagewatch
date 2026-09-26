import { httpJson, type HttpResult } from "../../platform/http";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

export interface CodexRateLimitWindow {
  used_percent?: number;
  usedPercent?: number;
  limit_window_seconds?: number;
  window_minutes?: number;
  windowDurationMins?: number;
  reset_at?: number | string;
  resets_at?: number | string;
  resetsAt?: number | string;
}

export interface CodexRateLimit {
  primary_window?: CodexRateLimitWindow | null;
  secondary_window?: CodexRateLimitWindow | null;
  primary?: CodexRateLimitWindow | null;
  secondary?: CodexRateLimitWindow | null;
}

export interface CodexResetCredits {
  applicable_available_count?: number;
  available_count?: number;
  availableCount?: number;
  credits?: number;
}

export interface CodexAdditionalLimit {
  limit_name?: string;
  model_name?: string;
  model_id?: string;
  rate_limit?: CodexRateLimit | null;
}

export interface CodexUsageResponse {
  email?: string;
  plan_type?: string;
  rate_limit?: CodexRateLimit | null;
  rateLimits?: CodexRateLimit | null;
  rate_limit_reset_credits?: CodexResetCredits | null;
  rateLimitResetCredits?: CodexResetCredits | null;
  credits?: { balance?: string | number | null; unlimited?: boolean } | null;
  additional_rate_limits?: CodexAdditionalLimit[] | null;
  [key: string]: unknown;
}

export function fetchUsage(
  accessToken: string,
  accountId: string,
): Promise<HttpResult<CodexUsageResponse>> {
  return httpJson<CodexUsageResponse>(USAGE_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "ChatGPT-Account-ID": accountId,
      "OpenAI-Beta": "codex-1",
      originator: "Codex Desktop",
      Accept: "application/json",
      "User-Agent": "codex_cli_rs/0.144.6",
    },
  });
}
