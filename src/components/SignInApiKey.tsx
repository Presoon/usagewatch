import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { t } from "../i18n";
import { Modal } from "./Modal";

type SignInApiKeyProps = {
  providerName: string;
  helpUrl?: string;
  onSave: (key: string) => Promise<void>;
  onCancel: () => void;
};

export function SignInApiKey({ providerName, helpUrl, onSave, onCancel }: SignInApiKeyProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = key.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSave(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.signIn.failed);
      setSubmitting(false);
    }
  };

  const openConsole = async () => {
    if (!helpUrl) return;
    setError(null);
    try {
      await openUrl(helpUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.signIn.browserFailed);
    }
  };

  return (
    <Modal titleId="api-key-title" busy={submitting} onCancel={onCancel}>
      <form className="signin-dialog" onSubmit={submit}>
        <h2 id="api-key-title" className="signin-dialog__title">
          {t.apiKey.title(providerName)}
        </h2>
        <p className="signin-dialog__copy">{t.apiKey.instructions(providerName)}</p>
        {helpUrl && (
          <button className="btn" type="button" onClick={() => void openConsole()} disabled={submitting}>
            {t.apiKey.openConsole(providerName)}
          </button>
        )}
        <label className="signin-dialog__label" htmlFor="provider-api-key">
          {t.apiKey.label}
        </label>
        <input
          id="provider-api-key"
          className="signin-dialog__input"
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder={t.apiKey.placeholder(providerName)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          disabled={submitting}
        />
        {error && <div role="alert" className="signin-dialog__error">{error}</div>}
        <div className="signin-dialog__actions">
          <button className="btn" type="button" onClick={onCancel} disabled={submitting}>
            {t.signIn.cancel}
          </button>
          <button className="btn btn--primary" type="submit" disabled={!key.trim() || submitting}>
            {submitting ? t.apiKey.saving : t.apiKey.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}
