// HTTP wrapper over tauri-plugin-http. Requests go through reqwest in
// Rust, so we can set a custom User-Agent and there is no CORS — required for
// the Claude usage endpoint. 15s timeout.
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { debug, warn } from "@tauri-apps/plugin-log";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface HttpResult<T> {
  status: number;
  ok: boolean;
  data: T;
  /** Parsed Retry-After (ms) if the server sent one. */
  retryAfterMs?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const secs = Number(raw);
  if (!Number.isNaN(secs)) return secs * 1000;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function requestLabel(url: string, method: string | undefined): string {
  try {
    const parsed = new URL(url);
    return `${method ?? "GET"} ${parsed.origin}${parsed.pathname}`;
  } catch {
    return method ?? "GET";
  }
}

export async function httpJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<HttpResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const label = requestLabel(url, rest.method);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await tauriFetch(url, { ...rest, signal: controller.signal });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    const log = res.ok ? debug : warn;
    void log(`[http] ${label} -> ${res.status}`).catch(() => undefined);
    return {
      status: res.status,
      ok: res.ok,
      data: data as T,
      retryAfterMs: parseRetryAfter(res.headers),
    };
  } catch (error) {
    const kind = error instanceof Error ? error.name : "unknown error";
    void warn(`[http] ${label} failed (${kind})`).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
