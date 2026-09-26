import { AuthError, FetchError, type ProviderDefinition, type SignInFlow } from "../providers/types";
import { parseConfig, type AppConfig } from "./config";
import { Scheduler } from "./scheduler";
import { useRuntimeStore } from "./store";
import { TrackerSession } from "./trackerSession";
import { loadingView, type TrackerConfig, type TrackerId } from "./trackers";
import type { CredentialStore } from "./credentials";

export interface RuntimeDependencies {
  providers: Map<string, ProviderDefinition>;
  credentials(tracker: TrackerConfig): CredentialStore;
  loadConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
}

/** Account orchestration has no window, OS, IPC or persistence implementation. */
export class TrackerRuntime {
  private scheduler: Scheduler | null = null;
  private sessions = new Map<TrackerId, TrackerSession>();
  private inFlight = new Map<TrackerId, Promise<void>>();
  private startPromise: Promise<void> | null = null;
  private changes: Promise<unknown> = Promise.resolve();
  private epoch = 0;

  constructor(private readonly deps: RuntimeDependencies) {}

  start(): Promise<void> {
    if (!this.startPromise) {
      const epoch = this.epoch;
      this.startPromise = (async () => {
        const config = await this.deps.loadConfig();
        // Persist the validated migration before starting any token operations.
        await this.deps.saveConfig(config);
        if (epoch !== this.epoch) return;
        useRuntimeStore.getState().setConfig(config);
        this.reconcile(config);
        await this.tick();
      })().catch((error) => { this.startPromise = null; throw error; });
    }
    return this.startPromise;
  }

  private reconcile(config: AppConfig): void {
    const store = useRuntimeStore.getState();
    for (const [id, session] of this.sessions) {
      if (!config.trackers.some(t => t.id === id)) {
        session.cancel();
        this.sessions.delete(id);
        store.removeView(id);
      }
    }
    for (const tracker of config.trackers) {
      if (!this.sessions.has(tracker.id)) {
        const provider = this.deps.providers.get(tracker.providerId);
        if (!provider) throw new Error(`Unknown provider: ${tracker.providerId}`);
        this.sessions.set(tracker.id, new TrackerSession(tracker, provider.create(this.deps.credentials(tracker))));
      }
      if (!tracker.enabled) store.removeView(tracker.id);
      else if (!store.views[tracker.id]) store.setView(tracker.id, loadingView(tracker));
    }
    const previous = this.scheduler;
    this.scheduler = new Scheduler(config.trackers.filter(t => t.enabled).map(t => ({
      id: t.id, minIntervalMs: this.deps.providers.get(t.providerId)!.minIntervalSec * 1000,
    })), { intervalMs: config.intervalMinutes * 60_000 });
    // Preserve each remaining account's backoff/deadline when adding/reordering trackers.
    for (const tracker of config.trackers) {
      const prior = previous?.state(tracker.id);
      const next = this.scheduler.state(tracker.id);
      if (prior && next) Object.assign(next, prior);
    }
  }

  private session(id: TrackerId): TrackerSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown tracker: ${id}`);
    return session;
  }

  private updateClock(): void {
    const times = useRuntimeStore.getState().config.trackers.filter(t => t.enabled)
      .map(t => this.scheduler?.state(t.id)?.nextFetchAt)
      .filter((time): time is number => typeof time === "number" && Number.isFinite(time));
    useRuntimeStore.getState().setClock(times.length ? Math.min(...times) : null, this.inFlight.size > 0);
  }

  private fetch(id: TrackerId): Promise<void> {
    const existing = this.inFlight.get(id);
    if (existing) return existing;
    const session = this.session(id);
    const epoch = this.epoch;
    const current = () => epoch === this.epoch && this.sessions.get(id) === session &&
      useRuntimeStore.getState().config.trackers.some(t => t.id === id && t.enabled);
    const task = session.run(async () => {
      if (!current()) return;
      const store = useRuntimeStore.getState();
      const previous = store.views[id];
      const base = loadingView(session.config);
      try {
        const snapshot = await session.client.fetchSnapshot();
        if (!current()) return;
        store.setView(id, { ...base, snapshot,
          cardState: snapshot.meters.some(m => m.state === "limit") ? "limit" : "ok" });
        this.scheduler?.onSuccess(id, Date.now());
      } catch (error) {
        if (!current()) return;
        if (error instanceof AuthError) {
          store.setView(id, { ...base, cardState: error.status === "unsupported" ? "unsupported" : "signin-required",
            errorMessage: error.status === "unsupported" ? error.message : undefined });
          this.scheduler?.onSuccess(id, Date.now());
        } else {
          const retry = error && typeof error === "object" && "retryAfterMs" in error ? error.retryAfterMs : undefined;
          const rateLimited = error instanceof FetchError && error.status === 429;
          this.scheduler?.onFailure(id, Date.now(), typeof retry === "number" ? retry : undefined, rateLimited);
          const failure = {
            errorMessage: rateLimited ? "Too many usage checks. Updates will resume automatically."
              : error instanceof Error ? error.message : "Unable to update usage",
            rateLimitedUntil: rateLimited ? this.scheduler?.state(id)?.nextFetchAt : undefined,
          };
          store.setView(id, previous?.snapshot
            ? { ...previous, ...failure, cardState: "stale", staleSince: previous.snapshot.fetchedAt }
            : { ...base, ...failure, cardState: "error" });
        }
      }
    }).finally(() => {
      if (this.inFlight.get(id) === task) this.inFlight.delete(id);
      this.updateClock();
    });
    this.inFlight.set(id, task);
    return task;
  }

  async tick(): Promise<void> {
    if (!this.scheduler) return;
    const tasks = this.scheduler.due(Date.now()).map(id => this.fetch(id));
    this.updateClock();
    await Promise.allSettled(tasks);
    this.updateClock();
  }

  async refresh(id?: TrackerId): Promise<void> {
    await this.start();
    if (id) this.session(id);
    this.scheduler?.scheduleImmediate(Date.now(), id);
    await this.tick();
  }

  async beginSignIn(id: TrackerId): Promise<SignInFlow> {
    await this.start();
    return this.session(id).beginSignIn(() => this.refresh(id));
  }

  async signOut(id: TrackerId): Promise<void> {
    await this.start();
    await this.session(id).signOut();
    const tracker = useRuntimeStore.getState().config.trackers.find(t => t.id === id);
    if (tracker?.enabled) useRuntimeStore.getState().setView(id, { ...loadingView(tracker), cardState: "signin-required" });
    this.scheduler?.onSuccess(id, Date.now());
    this.updateClock();
  }

  update(patch: Partial<AppConfig> | ((config: AppConfig) => Partial<AppConfig>)): Promise<AppConfig> {
    const task = this.changes.then(async () => {
      await this.start();
      const previous = useRuntimeStore.getState().config;
      const config = parseConfig({ ...previous, ...(typeof patch === "function" ? patch(previous) : patch) });
      for (const tracker of config.trackers) {
        const old = previous.trackers.find(t => t.id === tracker.id);
        if (old && old.providerId !== tracker.providerId) throw new Error("A tracker's provider cannot be changed");
      }
      await this.deps.saveConfig(config);
      useRuntimeStore.getState().setConfig(config);
      this.reconcile(config);
      if (previous.intervalMinutes !== config.intervalMinutes) this.scheduler?.setInterval(config.intervalMinutes * 60_000, Date.now());
      // Settings must not wait for unrelated network requests.
      void this.tick();
      return config;
    });
    this.changes = task.catch(() => undefined);
    return task;
  }

  remove(id: TrackerId): Promise<void> {
    const task = this.changes.then(async () => {
      await this.start();
      const session = this.session(id);
      const previous = useRuntimeStore.getState().config;
      const config = { ...previous, trackers: previous.trackers.filter(t => t.id !== id) };
      // Verify persistence before touching credentials. Serialize against other settings edits.
      await this.deps.saveConfig(config);
      try { await session.signOut(); }
      catch (error) {
        try { await this.deps.saveConfig(previous); }
        catch { throw new Error("Could not remove sign-in or restore settings. Restart the app to reload the saved tracker list."); }
        throw error;
      }
      useRuntimeStore.getState().setConfig(config);
      this.reconcile(config);
      this.updateClock();
    });
    this.changes = task.catch(() => undefined);
    return task;
  }

  stop(): void {
    this.epoch += 1;
    for (const session of this.sessions.values()) session.cancel();
    this.sessions.clear();
    this.inFlight.clear();
    this.scheduler = null;
    this.startPromise = null;
    useRuntimeStore.setState({ views: {}, nextUpdateAt: null, isUpdating: false });
  }
}
