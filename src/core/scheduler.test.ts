import { describe, it, expect } from "vitest";
import { Scheduler, withJitter, effectiveIntervalMs, type SchedulerOptions } from "./scheduler";

const noJitter = () => 0.5; // rng 0.5 => zero jitter delta

describe("withJitter", () => {
  it("is a no-op at rng=0.5", () => expect(withJitter(1000, 0.1, () => 0.5)).toBe(1000));
  it("is at the low bound at rng=0", () => expect(withJitter(1000, 0.1, () => 0)).toBe(900));
  it("is at the high bound at rng→1", () => expect(withJitter(1000, 0.1, () => 1)).toBe(1100));
});

describe("effectiveIntervalMs", () => {
  it("enforces the provider floor", () => expect(effectiveIntervalMs(60_000, 180_000)).toBe(180_000));
  it("uses the global interval when above the floor", () =>
    expect(effectiveIntervalMs(300_000, 180_000)).toBe(300_000));
});

const providers = [
  { id: "claude", minIntervalMs: 180_000 },
  { id: "codex", minIntervalMs: 60_000 },
];
const opts: SchedulerOptions = { intervalMs: 300_000, jitterRatio: 0.1, rng: noJitter };

describe("Scheduler.due", () => {
  it("marks all providers due initially", () => {
    const s = new Scheduler(providers, opts);
    expect(s.due(1000).sort()).toEqual(["claude", "codex"]);
  });

  it("does not re-fetch a provider right after success", () => {
    const s = new Scheduler(providers, opts);
    s.due(1000);
    s.onSuccess("claude", 1000);
    expect(s.due(2000)).toEqual(["codex"]);
  });
});

describe("Scheduler.onSuccess", () => {
  it("keeps negative jitter above the provider floor", () => {
    const s = new Scheduler(providers, { intervalMs: 180_000, rng: () => 0 });
    s.onSuccess("claude", 1000);
    expect(s.state("claude")!.nextFetchAt).toBe(181_000);
  });
  it("schedules one interval out and clears backoff", () => {
    const s = new Scheduler(providers, opts);
    s.onSuccess("codex", 10_000);
    const st = s.state("codex")!;
    expect(st.backoffMs).toBe(0);
    expect(st.nextFetchAt).toBe(10_000 + 300_000);
  });

  it("enforces the Claude floor over a smaller global interval", () => {
    const s = new Scheduler(providers, { intervalMs: 60_000, jitterRatio: 0.1, rng: noJitter });
    s.onSuccess("claude", 0);
    expect(s.state("claude")!.nextFetchAt).toBe(180_000);
  });
});

describe("Scheduler.onFailure", () => {
  it("protects rate-limit cooldowns from refresh, interval changes and wake", () => {
    const s = new Scheduler(providers, opts);
    s.due(0);
    s.onFailure("claude", 0, 900_000, true);
    s.scheduleImmediate(1000, "claude");
    s.scheduleImmediate(2000);
    s.setInterval(180_000, 3000);
    expect(s.due(130_000)).not.toContain("claude");
    expect(s.state("claude")!.nextFetchAt).toBe(900_000);
    expect(s.due(900_000)).toContain("claude");
    s.onSuccess("claude", 900_000);
    s.scheduleImmediate(900_001, "claude");
    expect(s.due(900_001)).toContain("claude");
  });

  it("uses growing backoff for 429 responses without Retry-After", () => {
    const s = new Scheduler(providers, opts);
    s.onFailure("claude", 0, undefined, true);
    expect(s.state("claude")!.retryNotBefore).toBe(300_000);
    s.onFailure("claude", 300_000, undefined, true);
    expect(s.state("claude")!.retryNotBefore).toBe(900_000);
  });
  it("ignores non-finite retry delays instead of stopping polling forever", () => {
    for (const retry of [NaN, Infinity, -Infinity]) {
      const s = new Scheduler(providers, opts);
      s.onFailure("claude", 0, retry);
      expect(s.state("claude")!.nextFetchAt).toBe(300_000);
    }
  });
  const single = [{ id: "codex", minIntervalMs: 60_000 }];
  const backoffOpts: SchedulerOptions = {
    intervalMs: 120_000,
    jitterRatio: 0.1,
    rng: noJitter,
    backoffCapMs: 600_000,
  };

  it("doubles backoff per failure, caps it, and resets on success", () => {
    const s = new Scheduler(single, backoffOpts);
    s.onFailure("codex", 0);
    expect(s.state("codex")!.backoffMs).toBe(120_000);
    expect(s.state("codex")!.nextFetchAt).toBe(120_000);

    s.onFailure("codex", 120_000);
    expect(s.state("codex")!.backoffMs).toBe(240_000);

    s.onFailure("codex", 0);
    expect(s.state("codex")!.backoffMs).toBe(480_000);

    s.onFailure("codex", 0);
    expect(s.state("codex")!.backoffMs).toBe(600_000); // 960k capped to 600k

    s.onSuccess("codex", 1000);
    expect(s.state("codex")!.backoffMs).toBe(0);
  });

  it("honors Retry-After when it exceeds the backoff", () => {
    const s = new Scheduler(single, backoffOpts);
    s.onFailure("codex", 0, 500_000);
    expect(s.state("codex")!.nextFetchAt).toBe(500_000);
  });
});

describe("wake-from-sleep detection", () => {
  it("marks all providers due after a tick gap over the threshold", () => {
    const s = new Scheduler(providers, opts);
    s.due(0);
    s.onSuccess("claude", 0);
    s.onSuccess("codex", 0);
    expect(s.due(30_000)).toEqual([]); // small gap
    expect(s.due(130_000).sort()).toEqual(["claude", "codex"]); // 100s gap → wake
  });
});

describe("Scheduler.setInterval", () => {
  it("makes every provider due immediately", () => {
    const s = new Scheduler(providers, opts);
    s.due(0);
    s.onSuccess("claude", 0);
    s.onSuccess("codex", 0);
    s.setInterval(600_000, 5000);
    expect(s.due(5000).sort()).toEqual(["claude", "codex"]);
  });
});
