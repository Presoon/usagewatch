import type { TrackerConfig } from "./trackers";
import type { ProviderId } from "./types";

export interface CredentialStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  delete(): Promise<void>;
}

// Frozen: storage locations from before multi-account support. New providers
// do not need an entry here.
const legacyKeys: Partial<Record<ProviderId, string>> = {
  claude: "claude_credentials",
  codex: "codex_credentials",
  gemini: "gemini_credentials",
  kimi: "kimi_api_key",
  openrouter: "openrouter_api_key",
  zai: "zai_api_key",
};

/** Legacy trackers retain their DPAPI location; newly added accounts never inherit it. */
export function credentialKey(tracker: Pick<TrackerConfig, "id" | "providerId">): string {
  if (tracker.id === `legacy-${tracker.providerId}`) {
    return legacyKeys[tracker.providerId] ?? `${tracker.providerId}_credentials`;
  }
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(tracker.id) || tracker.id.startsWith("legacy-")) {
    throw new Error("Invalid tracker ID");
  }
  return `tracker_${tracker.id}_credentials`;
}
