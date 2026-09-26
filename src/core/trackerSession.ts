import type { ProviderClient, SignInFlow } from "../providers/types";
import type { TrackerConfig } from "./trackers";

/** Serializes token reads/writes for one account; other trackers run independently. */
export class TrackerSession {
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private cancelSignIn: (() => void) | undefined;

  constructor(readonly config: TrackerConfig, readonly client: ProviderClient) {}

  run<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.tail.then(operation);
    this.tail = task.catch(() => undefined);
    return task;
  }

  async beginSignIn(afterSignIn: () => Promise<void>): Promise<SignInFlow> {
    this.cancel();
    const generation = this.generation;
    const flow = await this.run(() => this.client.beginSignIn());
    const assertCurrent = () => {
      if (generation !== this.generation) throw new Error("Sign-in was cancelled");
    };
    if (generation !== this.generation) {
      if (flow.kind === "loopback") flow.cancel();
      assertCurrent();
    }
    this.cancelSignIn = flow.kind === "loopback" ? flow.cancel : undefined;
    const complete = async (operation: () => Promise<void>) => {
      await this.run(async () => {
        assertCurrent();
        await operation();
        assertCurrent();
      });
      this.cancelSignIn = undefined;
      await afterSignIn();
    };
    if (flow.kind === "paste") return { ...flow, complete: (code) => complete(() => flow.complete(code)) };
    if (flow.kind === "apiKey") return { ...flow, save: (key) => complete(() => flow.save(key)) };
    return { ...flow, wait: () => complete(flow.wait), cancel: () => this.cancel() };
  }

  cancel(): void {
    this.generation += 1;
    this.cancelSignIn?.();
    this.cancelSignIn = undefined;
  }

  signOut(): Promise<void> {
    this.cancel();
    return this.run(() => this.client.signOut());
  }
}
