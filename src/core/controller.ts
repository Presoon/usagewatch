import { providerById } from "../providers";
import { trackerCredentials } from "../platform/credentials";
import { loadConfig, saveConfig } from "../platform/configStorage";
import { startRuntimeHost } from "../platform/runtimeBridge";
import { TrackerRuntime } from "./trackerRuntime";
import type { TrackerId } from "./trackers";
import type { ProviderId } from "./types";
import type { ConfigUpdate } from "./config";

const runtime = new TrackerRuntime({ providers: providerById, credentials: trackerCredentials, loadConfig, saveConfig });
let host: Promise<() => void> | null = null;

export async function startController(): Promise<void> {
  if (!host) host = startRuntimeHost(runtime).catch(error => { host = null; throw error; });
  await host;
  await runtime.start();
}
export async function beginSignIn(id: TrackerId) { await startController(); return runtime.beginSignIn(id); }
export async function refreshNow(id?: TrackerId) { await startController(); return runtime.refresh(id); }
export async function refreshDue() { await startController(); return runtime.tick(); }
export async function signOutTracker(id: TrackerId) { await startController(); return runtime.signOut(id); }
export async function updateAppConfig(patch: ConfigUpdate) { await startController(); return runtime.update(patch); }
export async function addTracker(providerId: ProviderId, name: string): Promise<void> {
  await startController();
  await runtime.update(config => ({ trackers: [...config.trackers, {
    id: crypto.randomUUID(), providerId, name, enabled: true,
  }] }));
}
export async function removeTracker(id: TrackerId): Promise<void> { await startController(); await runtime.remove(id); }
export function stopController(): void {
  void host?.then(stop => stop());
  host = null;
  runtime.stop();
}
