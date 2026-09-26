import { useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { TrackerId, TrackerConfig } from "../core/trackers";
import type { SignInFlow } from "../providers/types";
import { getCapabilities } from "../platform/capabilities";
import { beginSignIn } from "../core/controller";
import { SignInPaste } from "../components/SignInPaste";
import { SignInWaiting } from "../components/SignInWaiting";
import { SignInApiKey } from "../components/SignInApiKey";

type PasteDialog = {
  providerName: string;
  flow: Extract<SignInFlow, { kind: "paste" }>;
};

type LoopbackDialog = {
  providerName: string;
  onCancel: () => void;
};

type ApiKeyDialog = {
  providerName: string;
  flow: Extract<SignInFlow, { kind: "apiKey" }>;
};
export function useSignIn(trackers: TrackerConfig[], setSignInError: (value: string | null) => void, mock: boolean) {
  const [pasteDialog, setPasteDialog] = useState<PasteDialog | null>(null);
  const [loopbackDialog, setLoopbackDialog] = useState<LoopbackDialog | null>(null);
  const [apiKeyDialog, setApiKeyDialog] = useState<ApiKeyDialog | null>(null);
  const busy = useRef(false);
  const signIn = async (id: TrackerId) => {
    if (busy.current || pasteDialog || loopbackDialog || apiKeyDialog) return;
    busy.current = true;
    setSignInError(null);
    try {
      if (mock) throw new Error("Sign-in is unavailable in preview mode");
      if (!(await getCapabilities()).secureStorage) throw new Error("Secure credential storage is not implemented on this platform");
      const flow = await beginSignIn(id);
      const tracker = trackers.find(tracker => tracker.id === id);
      const providerName = tracker?.name ?? id;
      if (flow.kind === "paste") {
        setPasteDialog({ providerName, flow });
        await openUrl(flow.url);
      } else if (flow.kind === "loopback") {
        let cancelled = false;
        setLoopbackDialog({
          providerName,
          onCancel: () => {
            cancelled = true;
            flow.cancel();
            setLoopbackDialog(null);
          },
        });
        try {
          await openUrl(flow.url);
          await flow.wait();
        } catch (cause) {
          flow.cancel();
          if (!cancelled) throw cause;
        } finally {
          setLoopbackDialog(null);
        }
      } else {
        setApiKeyDialog({ providerName, flow });
      }
    } catch (cause) {
      setSignInError(cause instanceof Error ? cause.message : "Sign-in failed");
    } finally { busy.current = false; }
  };
  const dialogs = <>
      {pasteDialog && (
        <SignInPaste
          providerName={pasteDialog.providerName}
          onOpenBrowser={() => openUrl(pasteDialog.flow.url)}
          onComplete={async (code) => {
            await pasteDialog.flow.complete(code);
            setPasteDialog(null);
          }}
          onCancel={() => setPasteDialog(null)}
        />
      )}
      {loopbackDialog && (
        <SignInWaiting
          providerName={loopbackDialog.providerName}
          onCancel={loopbackDialog.onCancel}
        />
      )}
      {apiKeyDialog && (
        <SignInApiKey
          providerName={apiKeyDialog.providerName}
          helpUrl={apiKeyDialog.flow.helpUrl}
          onSave={async (key) => {
            await apiKeyDialog.flow.save(key);
            setApiKeyDialog(null);
          }}
          onCancel={() => setApiKeyDialog(null)}
        />
      )}
  </>;
  return { signIn, dialogs };
}
