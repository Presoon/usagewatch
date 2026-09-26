// Scheduler timing logic. Pure and clock-injectable so it can be
// unit-tested without real timers. The Rust ticker emits `poll-tick` every 30s;
// the app calls `due(now)` on each tick and fetches whatever it returns.

export interface ProviderScheduleState {
  /** Epoch ms of the next allowed fetch. */
  nextFetchAt: number;
  /** Current backoff in ms; 0 when healthy. */
  backoffMs: number;
  /** A rate-limit cooldown cannot be bypassed by manual refresh or wake. */
  retryNotBefore?: number;
}

export interface ProviderTiming {
  id: string;
  /** Provider floor, e.g. Claude 180_000 ms. */
  minIntervalMs: number;
}

export interface SchedulerOptions {
  /** Global refresh interval (ms). */
  intervalMs: number;
  /** ± jitter fraction applied to each interval (default 0.1). */
  jitterRatio?: number;
  /** Backoff cap (default 30 min). */
  backoffCapMs?: number;
  /** Gap between ticks that counts as a wake-from-sleep (default 90 s). */
  wakeThresholdMs?: number;
  /** Injectable RNG in [0,1) for deterministic tests. */
  rng?: () => number;
}

const DEFAULT_JITTER = 0.1;
const DEFAULT_BACKOFF_CAP_MS = 30 * 60_000;
const DEFAULT_WAKE_THRESHOLD_MS = 90_000;

/** Apply ±jitterRatio to a base duration. */
export function withJitter(baseMs: number, jitterRatio: number, rng: () => number): number {
  const delta = (rng() * 2 - 1) * jitterRatio; // [-r, +r]
  return Math.round(baseMs * (1 + delta));
}

/** Effective interval for a provider: never below its floor. */
export function effectiveIntervalMs(intervalMs: number, minIntervalMs: number): number {
  return Math.max(intervalMs, minIntervalMs);
}

export class Scheduler {
  private readonly states = new Map<string, ProviderScheduleState>();
  private readonly jitterRatio: number;
  private readonly backoffCapMs: number;
  private readonly wakeThresholdMs: number;
  private readonly rng: () => number;
  private intervalMs: number;
  private lastTickAt: number | null = null;

  constructor(
    private readonly providers: ProviderTiming[],
    opts: SchedulerOptions,
  ) {
    this.intervalMs = opts.intervalMs;
    this.jitterRatio = opts.jitterRatio ?? DEFAULT_JITTER;
    this.backoffCapMs = opts.backoffCapMs ?? DEFAULT_BACKOFF_CAP_MS;
    this.wakeThresholdMs = opts.wakeThresholdMs ?? DEFAULT_WAKE_THRESHOLD_MS;
    this.rng = opts.rng ?? Math.random;
    // Start every provider due immediately (initial fetch on app start).
    for (const p of providers) {
      this.states.set(p.id, { nextFetchAt: -Infinity, backoffMs: 0 });
    }
  }

  private floor(id: string): number {
    const p = this.providers.find((x) => x.id === id);
    return p ? p.minIntervalMs : 0;
  }

  state(id: string): ProviderScheduleState | undefined {
    return this.states.get(id);
  }

  /** Provider ids due for a fetch at `now`. A wake-from-sleep marks all due. */
  due(now: number): string[] {
    const woke = this.lastTickAt !== null && now - this.lastTickAt > this.wakeThresholdMs;
    this.lastTickAt = now;
    if (woke) {
      for (const p of this.providers) this.scheduleImmediate(now, p.id);
    }
    return this.providers.filter((p) => now >= (this.states.get(p.id)?.nextFetchAt ?? now)).map((p) => p.id);
  }

  /** Reset backoff and schedule the next fetch one jittered interval out. */
  onSuccess(id: string, now: number): void {
    const base = effectiveIntervalMs(this.intervalMs, this.floor(id));
    this.states.set(id, {
      nextFetchAt: now + Math.max(this.floor(id), withJitter(base, this.jitterRatio, this.rng)),
      backoffMs: 0,
    });
  }

  /**
   * Exponential backoff: base interval, then ×2 per failure, capped. 429s pass
   * a Retry-After that wins when longer.
   */
  onFailure(id: string, now: number, retryAfterMs?: number, rateLimited = false): void {
    const base = effectiveIntervalMs(this.intervalMs, this.floor(id));
    const prev = this.states.get(id)?.backoffMs ?? 0;
    let backoff = prev === 0 ? base : Math.min(this.backoffCapMs, prev * 2);
    backoff = Math.min(this.backoffCapMs, backoff);
    const delay = retryAfterMs !== undefined && Number.isFinite(retryAfterMs) ? Math.max(backoff, retryAfterMs) : backoff;
    this.states.set(id, { nextFetchAt: now + delay, backoffMs: backoff,
      ...(rateLimited ? { retryNotBefore: now + delay } : {}) });
  }

  /** Force one (or all) providers due now — start, Refresh now, sign-in, etc. */
  scheduleImmediate(now: number, id?: string): void {
    const ids = id ? [id] : this.providers.map((p) => p.id);
    for (const pid of ids) {
      const cur = this.states.get(pid);
      if (cur?.retryNotBefore !== undefined && now < cur.retryNotBefore) continue;
      this.states.set(pid, { nextFetchAt: now, backoffMs: cur?.backoffMs ?? 0 });
    }
  }

  /** Changing the interval takes effect immediately. */
  setInterval(intervalMs: number, now: number): void {
    this.intervalMs = intervalMs;
    this.scheduleImmediate(now);
  }
}
