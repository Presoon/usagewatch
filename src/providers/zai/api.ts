import { httpJson, type HttpResult } from "../../platform/http";

const QUOTA_LIMIT_URL = "https://api.z.ai/api/monitor/usage/quota/limit";

export interface ZaiLimitItem {
  type: "CREDIT_LIMIT" | "TOKENS_LIMIT" | "TIME_LIMIT" | string;
  unit?: number;
  percentage?: number;
  currentValue?: number;
  usage?: number;
  nextResetTime?: number;
  usageDetails?: unknown[];
  [key: string]: unknown;
}

export interface ZaiQuotaLimitData {
  limits?: ZaiLimitItem[];
  plan?: string;
  [key: string]: unknown;
}

export interface ZaiQuotaLimitResponse {
  code?: number;
  msg?: string;
  success?: boolean;
  data?: ZaiQuotaLimitData;
  [key: string]: unknown;
}

export function fetchQuotaLimit(apiKey: string): Promise<HttpResult<ZaiQuotaLimitResponse>> {
  const token = apiKey.trim().startsWith("Bearer ") ? apiKey.trim() : `Bearer ${apiKey.trim()}`;
  return httpJson<ZaiQuotaLimitResponse>(QUOTA_LIMIT_URL, {
    method: "GET",
    headers: {
      Authorization: token,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "UsageWatch/0.1.6",
    },
  });
}
