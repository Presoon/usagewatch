import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackerRuntime } from "./trackerRuntime";
import { DEFAULT_CONFIG, parseConfig } from "./config";
import { useRuntimeStore } from "./store";
import type { ProviderDefinition, ProviderClient } from "../providers/types";
import { FetchError } from "../providers/types";
import { selectTrackerViews, visibleMeters } from "./trackers";

let runtime: TrackerRuntime;
afterEach(() => { runtime?.stop(); vi.restoreAllMocks(); });
async function setup() {
  const config = structuredClone(DEFAULT_CONFIG);
  config.trackers = config.trackers.slice(0, 1);
  const snapshot = { providerId: "claude" as const, planLabel: null, accountLabel: null, meters: [], infoRows: [], fetchedAt: new Date().toISOString() };
  const client: ProviderClient = { getStatus: vi.fn(), beginSignIn: vi.fn(), signOut: vi.fn().mockResolvedValue(undefined), fetchSnapshot: vi.fn().mockResolvedValue(snapshot) };
  const save = vi.fn().mockResolvedValue(undefined);
  const provider: ProviderDefinition = { id: "claude", minIntervalSec: 180, create: () => client };
  runtime = new TrackerRuntime({ providers: new Map([["claude", provider]]),
    credentials: () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }), loadConfig: async () => config, saveConfig: save });
  await runtime.start();
  return { client, save, id: config.trackers[0].id };
}
describe("tracker changes", () => {
  it.each([true, false])("handles 429 and recovers automatically (cached snapshot: %s)", async cached => {
    const { client, id } = await setup();
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    if (!cached) useRuntimeStore.getState().removeView(id);
    const previous = useRuntimeStore.getState().views[id]?.snapshot;
    vi.mocked(client.fetchSnapshot).mockRejectedValueOnce(new FetchError("usage HTTP 429", 900_000, 429));
    await runtime.refresh(id);
    expect(useRuntimeStore.getState().views[id]).toMatchObject({
      cardState: cached ? "stale" : "error", rateLimitedUntil: now + 900_000,
      errorMessage: "Too many usage checks. Updates will resume automatically.",
    });
    expect(useRuntimeStore.getState().views[id].snapshot).toBe(previous ?? null);
    await runtime.refresh(id);
    await runtime.refresh();
    await runtime.update({ intervalMinutes: 3 });
    now += 130_000;
    await runtime.tick();
    expect(client.fetchSnapshot).toHaveBeenCalledTimes(2);
    now += 770_000;
    await runtime.tick();
    expect(client.fetchSnapshot).toHaveBeenCalledTimes(3);
    expect(useRuntimeStore.getState().views[id].cardState).toBe("ok");
    expect(useRuntimeStore.getState().views[id].rateLimitedUntil).toBeUndefined();
  });
  it("does not publish unchanged polling clocks", async () => {
    await setup();
    const changed = vi.fn();
    const stop = useRuntimeStore.subscribe(changed);
    try {
      await runtime.tick();
      await runtime.tick();
      expect(changed).not.toHaveBeenCalled();
    } finally { stop(); }
  });
  it("preserves widget themes across saves, migrates old settings and rejects invalid themes", async () => {
    const { save } = await setup();
    const { theme: _theme, ...oldWidget } = DEFAULT_CONFIG.widget;
    expect(parseConfig({ ...DEFAULT_CONFIG, widget: oldWidget }).widget.theme).toBe("dark");
    for (const theme of ["light", "gray", "dark"] as const) {
      await runtime.update(current => ({ widget: { ...current.widget, theme } }));
      expect(parseConfig(JSON.parse(JSON.stringify(save.mock.lastCall?.[0]))).widget.theme).toBe(theme);
    }
    expect(() => parseConfig({ ...DEFAULT_CONFIG, widget: { ...oldWidget, theme: "auto" } })).toThrow("Invalid application settings");
    save.mockRejectedValueOnce(new Error("Disk full"));
    await expect(runtime.update(current => ({ widget: { ...current.widget, theme: "light" } }))).rejects.toThrow("Disk full");
    expect(useRuntimeStore.getState().config.widget.theme).toBe("dark");
  });
  it("persists per-account hidden limits, validates them and keeps raw data for restoring", async () => {
    const { id, save } = await setup();
    await runtime.update(current => ({ trackers: current.trackers.map(t => ({ ...t, hiddenMeterIds: ["spark", "spark"] })) }));
    const saved = parseConfig(JSON.parse(JSON.stringify(save.mock.lastCall?.[0])));
    expect(saved.trackers[0].hiddenMeterIds).toEqual(["spark"]);
    const snapshot = { providerId: "claude" as const, planLabel: null, accountLabel: null, fetchedAt: new Date().toISOString(), infoRows: [],
      meters: ["weekly", "spark"].map(id => ({ id, label: id, percentLeft: 50, state: "ok" as const, resetsAt: null })) };
    const raw = { trackerId: id, providerId: "claude" as const, displayName: "Work", snapshot, cardState: "ok" as const };
    const views = selectTrackerViews([...saved.trackers, { ...saved.trackers[0], id: "personal", hiddenMeterIds: [] }], { [id]: raw, personal: { ...raw, trackerId: "personal" } });
    expect(visibleMeters(views[0]).map(m => m.id)).toEqual(["weekly"]);
    expect(visibleMeters(views[1])).toHaveLength(2);
    expect(raw.snapshot.meters).toHaveLength(2);
    expect(() => parseConfig({ ...saved, trackers: [{ ...saved.trackers[0], hiddenMeterIds: [42] }] })).toThrow("Invalid hidden limits");
    save.mockRejectedValueOnce(new Error("Disk full"));
    await expect(runtime.update(current => ({ trackers: current.trackers.map(t => ({ ...t, hiddenMeterIds: [] })) }))).rejects.toThrow("Disk full");
    expect(useRuntimeStore.getState().config.trackers[0].hiddenMeterIds).toEqual(["spark"]);
  });
  it("starts new installs empty while preserving legacy accounts during migration", () => {
    expect(parseConfig(null).trackers).toEqual([]);
    const migrated = parseConfig({ version: 1, providers: { claude: { enabled: true }, codex: { enabled: false } } });
    expect(migrated.trackers.find(t => t.providerId === "claude")).toMatchObject({ id: "legacy-claude", enabled: true });
    expect(migrated.trackers.find(t => t.providerId === "codex")?.enabled).toBe(false);
    expect(parseConfig({ ...DEFAULT_CONFIG, trackers: [] }).trackers).toEqual([]);
  });
  it("preserves credentials and visible settings when persistence fails", async () => {
    const { client, save, id } = await setup();
    save.mockRejectedValueOnce(new Error("Disk full"));
    await expect(runtime.remove(id)).rejects.toThrow("Disk full");
    expect(client.signOut).not.toHaveBeenCalled();
    expect(useRuntimeStore.getState().config.trackers[0].id).toBe(id);
  });
  it("restores configuration after a credential deletion failure", async () => {
    const { client, save, id } = await setup();
    vi.mocked(client.signOut).mockRejectedValueOnce(new Error("Credential locked"));
    await expect(runtime.remove(id)).rejects.toThrow("Credential locked");
    expect(save.mock.lastCall?.[0].trackers[0].id).toBe(id);
    expect(useRuntimeStore.getState().config.trackers).toHaveLength(1);
    await runtime.remove(id);
    expect(useRuntimeStore.getState().config.trackers).toHaveLength(0);
    expect(useRuntimeStore.getState().views[id]).toBeUndefined();
  });
  it("applies queued edits against current settings without losing changes", async () => {
    const { id } = await setup();
    await Promise.all([
      runtime.update(current => ({ trackers: current.trackers.map(t => ({ ...t, name: "Work" })) })),
      runtime.update(current => ({ trackers: current.trackers.map(t => ({ ...t, enabled: false })) })),
    ]);
    expect(useRuntimeStore.getState().config.trackers[0]).toMatchObject({ id, name: "Work", enabled: false });
  });
  it("retains the last snapshot and failure reason until refresh succeeds", async () => {
    const { client, id } = await setup();
    vi.mocked(client.fetchSnapshot).mockRejectedValueOnce(new Error("Offline"));
    await runtime.refresh(id);
    expect(useRuntimeStore.getState().views[id]).toMatchObject({ cardState: "stale", errorMessage: "Offline" });
    expect(useRuntimeStore.getState().views[id].snapshot).not.toBeNull();
    await runtime.refresh(id);
    expect(useRuntimeStore.getState().views[id].cardState).toBe("ok");
    expect(useRuntimeStore.getState().views[id].errorMessage).toBeUndefined();
  });
});
