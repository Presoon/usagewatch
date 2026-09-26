import { invoke } from "@tauri-apps/api/core";
import type { TrackerConfig } from "../core/trackers";
import { credentialKey, type CredentialStore } from "../core/credentials";

export function trackerCredentials(tracker: TrackerConfig): CredentialStore {
  const name = credentialKey(tracker);
  return {
    get: async () => (await invoke<string | null>("secure_get", { name })) ?? null,
    set: async (value) => { await invoke("secure_set", { name, value }); },
    delete: async () => { await invoke("secure_delete", { name }); },
  };
}
