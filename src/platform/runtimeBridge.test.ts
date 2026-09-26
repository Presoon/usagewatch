import { expect, it, vi } from "vitest";
import { mirrorRuntime } from "./runtimeBridge";
import { runtimeSnapshot, useRuntimeStore } from "../core/store";

const listeners = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>());
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
    listeners.set(name, callback); return () => listeners.delete(name);
  }),
  emitTo: vi.fn(async () => undefined),
}));

it("accepts a restarted host and ignores late snapshots from its predecessor", async () => {
  const stop = await mirrorRuntime(vi.fn());
  const receive = listeners.get("runtime-snapshot")!;
  const snapshot = runtimeSnapshot();
  receive({ payload: { generation: 1, revision: 100, snapshot: { ...snapshot, nextUpdateAt: 100 } } });
  receive({ payload: { generation: 2, revision: 1, snapshot: { ...snapshot, nextUpdateAt: 200 } } });
  expect(useRuntimeStore.getState().nextUpdateAt).toBe(200);
  receive({ payload: { generation: 1, revision: 101, snapshot: { ...snapshot, nextUpdateAt: 300 } } });
  receive({ payload: { generation: 2, revision: 0, snapshot: { ...snapshot, nextUpdateAt: 400 } } });
  expect(useRuntimeStore.getState().nextUpdateAt).toBe(200);
  stop();
});
