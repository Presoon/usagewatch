/**
 * Anthropic assigns Claude Code OAuth traffic to the expected rate-limit pool
 * based on this product-shaped User-Agent. Keep every Claude OAuth request on
 * the same value; a generic or missing User-Agent can cause persistent 429s.
 */
export const CLAUDE_CODE_USER_AGENT = "claude-code/2.0.0";

/**
 * The Tauri HTTP plugin mirrors browser fetch and otherwise adds
 * `Origin: http://tauri.localhost`. Anthropic rejects an otherwise valid OAuth
 * token when that header is present. With the plugin's `unsafe-headers`
 * feature, an empty Origin means "remove this header" on the Rust side.
 */
export const CLAUDE_REQUEST_HEADERS = {
  Origin: "",
  "User-Agent": CLAUDE_CODE_USER_AGENT,
} as const;
