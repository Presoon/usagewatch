import { invoke } from "@tauri-apps/api/core";

/** Each callback has an owner, so cancelling one login cannot cancel another. */
export async function startLoopback(options: {
  port: number;
  callbackPath: string;
  expectedState: string;
}) {
  const sessionId = crypto.randomUUID();
  const port = await invoke<number>("oauth_loopback_start", { ...options, sessionId });
  return {
    port,
    wait: () => invoke<string>("oauth_loopback_wait", { sessionId }),
    cancel: () => { void invoke("oauth_loopback_cancel", { sessionId }).catch(() => undefined); },
  };
}
