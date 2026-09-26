/**
 * probe.ts — dump real provider usage responses for parser development.
 *
 * Run by the USER (`npm run probe`) on a machine where the provider CLIs are
 * signed in. It is READ-ONLY: it reads local CLI credential files and makes one
 * request per provider, then writes the responses to `fixtures/real/<p>.json`.
 * It never refreshes or writes back tokens — if a
 * token is expired, just use the CLI once and re-run.
 *
 * Endpoints/headers come from docs/PROVIDERS.md — do not guess.
 *
 * PRIVACY: responses can contain account identifiers. `fixtures/real/` is
 * git-ignored. Review/anonymise before sharing (see the note printed at the end).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CLAUDE_CODE_USER_AGENT } from "../src/providers/claude/client";

const HOME = homedir();
const OUT_DIR = join(process.cwd(), "fixtures", "real");

type ProbeResult = {
  provider: string;
  ok: boolean;
  note?: string;
  requests?: unknown[];
};

// --- helpers ----------------------------------------------------------------

async function readJson<T = any>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function decodeJwtPayload(jwt: string | undefined): any {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function httpJson(
  url: string,
  init: RequestInit,
): Promise<{ url: string; status: number; ok: boolean; headers: Record<string, string>; body: unknown }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* leave as text */
  }
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    if (/^(x-ratelimit|retry-after|content-type)/i.test(k)) headers[k] = v;
  });
  return { url, status: res.status, ok: res.ok, headers, body };
}

async function save(name: string, result: ProbeResult): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, `${name}.json`), JSON.stringify(result, null, 2), "utf8");
  console.log(`  → wrote fixtures/real/${name}.json  (${result.ok ? "ok" : "no data: " + (result.note ?? "")})`);
}

// --- Claude ---------------------------------------------------

async function probeClaude(): Promise<void> {
  console.log("Claude…");
  const dir = process.env.CLAUDE_CONFIG_DIR || join(HOME, ".claude");
  const creds = await readJson(join(dir, ".credentials.json"));
  const oauth = creds?.claudeAiOauth;
  const token = oauth?.accessToken || process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) {
    return save("claude", { provider: "claude", ok: false, note: "no .credentials.json / token found" });
  }
  const req = await httpJson("https://api.anthropic.com/api/oauth/usage", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": CLAUDE_CODE_USER_AGENT,
      "Content-Type": "application/json",
    },
  });
  await save("claude", {
    provider: "claude",
    ok: req.ok,
    note: req.ok ? `subscriptionType=${oauth?.subscriptionType ?? "?"}` : `HTTP ${req.status} (expired token? run \`claude\` then retry)`,
    requests: [req],
  });
}

// --- Codex / ChatGPT ------------------------------------------

async function probeCodex(): Promise<void> {
  console.log("Codex…");
  const dir = process.env.CODEX_HOME || join(HOME, ".codex");
  const auth = await readJson(join(dir, "auth.json"));
  const tokens = auth?.tokens;
  const token = tokens?.access_token;
  if (!token) {
    return save("codex", { provider: "codex", ok: false, note: "no .codex/auth.json / access_token" });
  }
  const claims = decodeJwtPayload(tokens?.id_token);
  const accountId =
    tokens?.account_id || claims?.["https://api.openai.com/auth"]?.chatgpt_account_id || "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "codex_cli_rs/0.1.0",
  };
  if (accountId) headers["chatgpt-account-id"] = accountId;

  const usage = await httpJson("https://chatgpt.com/backend-api/wham/usage", { method: "GET", headers });
  const credits = await httpJson("https://chatgpt.com/backend-api/wham/rate-limit-reset-credits", {
    method: "GET",
    headers,
  });
  await save("codex", {
    provider: "codex",
    ok: usage.ok,
    note: usage.ok
      ? `plan=${claims?.["https://api.openai.com/auth"]?.chatgpt_plan_type ?? "?"}, accountId ${accountId ? "present" : "MISSING"}`
      : `HTTP ${usage.status} (expired token? run \`codex\` then retry)`,
    requests: [usage, credits],
  });
}

// --- Gemini ---------------------------------------------------

async function probeGemini(): Promise<void> {
  console.log("Gemini…");
  const dir = join(HOME, ".gemini");
  const creds = await readJson(join(dir, "oauth_creds.json"));
  const settings = await readJson(join(dir, "settings.json"));
  const token = creds?.access_token;
  if (!token) {
    return save("gemini", { provider: "gemini", ok: false, note: "no .gemini/oauth_creds.json / access_token" });
  }
  const authType = settings?.selectedAuthType || settings?.security?.auth?.selectedType;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = await httpJson("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", {
    method: "POST",
    headers,
    body: JSON.stringify({ metadata: { ideType: "GEMINI_CLI", pluginType: "GEMINI" } }),
  });
  const project =
    (load.body as any)?.cloudaicompanionProject || (load.body as any)?.project || undefined;
  const quota = await httpJson("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota", {
    method: "POST",
    headers,
    body: JSON.stringify(project ? { project } : {}),
  });
  await save("gemini", {
    provider: "gemini",
    ok: quota.ok,
    note: quota.ok
      ? `authType=${authType ?? "?"} (expect oauth-personal), project ${project ? "found" : "none"}`
      : `HTTP ${quota.status} (403 => enterprise/unsupported, or expired token? run \`gemini\` then retry)`,
    requests: [load, quota],
  });
}

// --- Kimi -----------------------------------------------------

async function probeKimi(): Promise<void> {
  console.log("Kimi…");
  const fileKey = (await readJson(join(HOME, ".kimi-code", "credentials", "kimi-code.json")))?.apiKey;
  const key = process.env.KIMI_CODE_API_KEY || process.env.KIMI_API_KEY || fileKey;
  if (!key) {
    return save("kimi", {
      provider: "kimi",
      ok: false,
      note: "no API key (set KIMI_CODE_API_KEY env or ~/.kimi-code/credentials/kimi-code.json)",
    });
  }
  const req = await httpJson("https://api.kimi.com/coding/v1/usages", {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });
  await save("kimi", {
    provider: "kimi",
    ok: req.ok,
    note: req.ok ? "ok" : `HTTP ${req.status} (check the API key)`,
    requests: [req],
  });
}

// --- main -------------------------------------------------------------------

async function main() {
  console.log("UsageWatch probe — reading local CLI credentials (read-only)\n");
  for (const fn of [probeClaude, probeCodex, probeGemini, probeKimi]) {
    try {
      await fn();
    } catch (e) {
      console.error(`  ! ${(e as Error).message}`);
    }
  }
  console.log(
    [
      "",
      "Done. Files are in fixtures/real/ (git-ignored).",
      "Before sharing them, redact identifiers: account_id / chatgpt_account_id,",
      "project ids, and any email fields. The usage numbers themselves are safe.",
      "If a provider shows an expired-token error, use its CLI once and re-run.",
    ].join("\n"),
  );
}

main();
