import { useState } from "react";
import { t } from "../i18n";
import { Modal } from "./Modal";

type SignInPasteProps = {
  providerName: string;
  onOpenBrowser: () => Promise<void>;
  onComplete: (code: string) => Promise<void>;
  onCancel: () => void;
};

export function SignInPaste({ providerName, onOpenBrowser, onComplete, onCancel }: SignInPasteProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onComplete(code.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.signIn.failed);
      setSubmitting(false);
    }
  };

  const reopen = async () => {
    setError(null);
    try {
      await onOpenBrowser();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.signIn.browserFailed);
    }
  };

  return (
    <Modal titleId="signin-title" busy={submitting} onCancel={onCancel}>
      <form className="signin-dialog" onSubmit={submit}>
        <h2 id="signin-title" className="signin-dialog__title">
          {t.signIn.title(providerName)}
        </h2>
        <p className="signin-dialog__copy">{t.signIn.instructions}</p>
        <button className="btn" type="button" onClick={() => void reopen()} disabled={submitting}>
          {t.signIn.openBrowser}
        </button>
        <label className="signin-dialog__label" htmlFor="signin-code">
          {t.signIn.codeLabel}
        </label>
        <input
          id="signin-code"
          className="signin-dialog__input"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t.signIn.codePlaceholder}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          autoFocus
          disabled={submitting}
        />
        {error && <div role="alert" className="signin-dialog__error">{error}</div>}
        <div className="signin-dialog__actions">
          <button className="btn" type="button" onClick={onCancel} disabled={submitting}>
            {t.signIn.cancel}
          </button>
          <button className="btn btn--primary" type="submit" disabled={!code.trim() || submitting}>
            {submitting ? t.signIn.completing : t.signIn.complete}
          </button>
        </div>
      </form>
    </Modal>
  );
}
