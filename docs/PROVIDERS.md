# Provider reference

How each integration reads quota data. Most of these endpoints are
**undocumented** and can change without notice; parsers are written
defensively and a broken provider only affects its own card.

## Ground rules for every provider

- **Server-side data only.** Usage is read from the provider's account API, so
  it is correct across every machine the user works on. Never compute usage
  from local logs (Claude Code JSONL, Codex sessions, …).
- **In-app sign-in only.** OAuth tokens and API keys are obtained inside
  UsageWatch and stored encrypted (Windows DPAPI) in the account's credential
  slot. Do not read other tools' credential files at runtime.
- **Read-only.** Never call inference or any endpoint that spends quota.
- **Be polite.** Respect `Retry-After`, set a realistic `minIntervalSec`, and do
  not retry auth failures in a loop.
- **Honest User-Agent** for API-key providers (`UsageWatch/<version>`). Only
  impersonate an official client when the endpoint rejects anything else, and
  document why here.

## Summary

| Provider | Usage endpoint | Sign-in | Meters |
|---|---|---|---|
| Claude | `GET https://api.anthropic.com/api/oauth/usage` | OAuth PKCE, paste code | Session (5h), Weekly, per-model weekly, extra usage |
| Codex / ChatGPT | `GET https://chatgpt.com/backend-api/wham/usage` | OAuth PKCE, loopback `localhost:1455` | Session, Weekly, per-model limits, reset credits |
| Gemini *(experimental)* | `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota` | OAuth PKCE, loopback (random port) | Pro, Flash, Lite |
| Kimi Code | `GET https://api.kimi.com/coding/v1/usages` | API key | Session (5h), Weekly |
| OpenRouter | `GET https://openrouter.ai/api/v1/credits` | API key | Credits balance |
| z.ai Coding Plan | `GET https://api.z.ai/api/monitor/usage/quota/limit` | API key | Session (5h), Weekly, monthly tool quota |

## Claude

- Headers: `Authorization: Bearer <oauth token>`, `anthropic-beta: oauth-2025-04-20`
  and a `claude-code/<version>` User-Agent (see `src/providers/claude/client.ts`).
  Without that User-Agent the endpoint rate-limits aggressively.
- Response: a map of window name → `{ utilization, resets_at }`, where
  `utilization` is **percent used**. `null` windows are inactive on the plan.
  Unknown window keys are ignored.
- Rate limits are per access token; the provider floor is **180 s**.
- Sign-in: PKCE "paste code" flow against `claude.ai/oauth/authorize` with the
  public Claude Code client ID. Claude requires `state` to equal the code
  verifier. Tokens are exchanged/refreshed at `platform.claude.com/v1/oauth/token`,
  which can be slow (up to ~60 s) and return 429.
- The Tauri HTTP client must strip its automatic `Origin` header; Anthropic
  rejects valid tokens with 401 when it is present.

## Codex / ChatGPT

- Headers: `Authorization: Bearer <access token>`, `chatgpt-account-id`.
- `rate_limit.primary_window` / `secondary_window` carry `used_percent` and
  reset times; `additional_rate_limits[]` holds per-model limits. Windows are
  classified by **duration** (~300 min → Session, ~10080 min → Weekly), not by
  slot name.
- Optional reset credits: `GET …/backend-api/wham/rate-limit-reset-credits`.
- Plan and account ID come from the `id_token` claim `https://api.openai.com/auth`.
- Sign-in: PKCE with the public Codex client; the redirect **must** be
  `http://localhost:1455/auth/callback` (fixed by the client registration), so
  the port can collide with a running Codex CLI login.

## Gemini (experimental)

- `POST …/v1internal:loadCodeAssist` returns the tier and the Code Assist
  project, which is then passed to `retrieveUserQuota`. Buckets carry
  `modelId`, `remainingFraction` (0–1) and `resetTime`; the lowest fraction per
  model family is shown.
- Sign-in uses the public installed-app client of gemini-cli (the client secret
  in `src/providers/gemini/auth.ts` is intentionally public, as in gemini-cli)
  and a loopback redirect on a random port.
- Google ended consumer "Login with Google" access for Gemini CLI in 2026 and
  calls third-party use of these endpoints unsupported. Accounts without
  access (`403`, `UNSUPPORTED_CLIENT`, `IneligibleTierError`) end in the
  `unsupported` state without retries.

## Kimi Code

- `Authorization: Bearer <API key>` from the Kimi Code console.
- `usage` holds the weekly quota; `limits[]` holds rate windows, of which the
  5-hour one becomes the Session meter. Numbers may arrive as strings, and the
  reset field has several spellings; the parser accepts all of them.

## OpenRouter

- `Authorization: Bearer <API key>`. `data.total_credits` and
  `data.total_usage` give the remaining balance.

## z.ai Coding Plan

- `Authorization: Bearer <API key>`. The response wraps `data.limits[]`; auth
  failures may come back as HTTP 200 with `code` 401/403/1002/1003.
- `TOKENS_LIMIT` entries become Session/Weekly meters and `TIME_LIMIT` the
  monthly tool quota; `percentage` is percent used.

## Refreshing test fixtures

`npm run probe` (see `scripts/probe.ts`) dumps real responses for Claude,
Codex, Gemini and Kimi to the git-ignored `fixtures/real/` directory using the
official CLIs' local credentials. **Anonymise** anything you copy from there
into a test.

## Prior art

- [OpenUsage](https://github.com/robinebers/openusage) and
  [CodexBar](https://github.com/steipete/CodexBar) document several of these
  endpoints.
- [gemini-cli](https://github.com/google-gemini/gemini-cli) (`packages/core/src/code_assist/`)
  for the Code Assist API and OAuth client.
- [Kimi Code docs](https://www.kimi.com/code/docs/en/), [OpenRouter API](https://openrouter.ai/docs).
