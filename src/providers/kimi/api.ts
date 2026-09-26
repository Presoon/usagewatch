import { httpJson, type HttpResult } from "../../platform/http";

const USAGE_URL = "https://api.kimi.com/coding/v1/usages";

export type KimiNumber = string | number;

export interface KimiUsageDetail {
  limit?: KimiNumber;
  used?: KimiNumber;
  remaining?: KimiNumber;
  resetTime?: string;
  resetAt?: string;
  reset_time?: string;
  reset_at?: string;
}

export interface KimiRateLimit {
  window?: {
    duration?: KimiNumber;
    timeUnit?: string;
    time_unit?: string;
  };
  detail?: KimiUsageDetail;
}

export interface KimiUsageResponse {
  usage?: KimiUsageDetail;
  limits?: KimiRateLimit[];
  plan?: string;
  planName?: string;
  tier?: string;
  [key: string]: unknown;
}

export function fetchUsage(apiKey: string): Promise<HttpResult<KimiUsageResponse>> {
  return httpJson<KimiUsageResponse>(USAGE_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": "UsageWatch/0.1.6",
    },
  });
}
