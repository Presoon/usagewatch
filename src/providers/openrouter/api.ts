import { httpJson, type HttpResult } from "../../platform/http";

const CREDITS_URL = "https://openrouter.ai/api/v1/credits";

export interface OpenRouterCreditsResponse {
  data?: {
    total_credits?: number;
    total_usage?: number;
  };
  [key: string]: unknown;
}

export function fetchCredits(apiKey: string): Promise<HttpResult<OpenRouterCreditsResponse>> {
  return httpJson<OpenRouterCreditsResponse>(CREDITS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": "UsageWatch/0.1.6",
    },
  });
}
