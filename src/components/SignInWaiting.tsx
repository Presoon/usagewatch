import { t } from "../i18n";
import { Modal } from "./Modal";

type SignInWaitingProps = {
  providerName: string;
  onCancel: () => void;
};

export function SignInWaiting({ providerName, onCancel }: SignInWaitingProps) {
  return (
    <Modal titleId="signin-wait-title" onCancel={onCancel}>
      <div className="signin-dialog signin-dialog--waiting">
        <div className="signin-dialog__spinner" aria-hidden="true" />
        <h2 id="signin-wait-title" className="signin-dialog__title">
          {t.signIn.waitingTitle(providerName)}
        </h2>
        <p className="signin-dialog__copy">{t.signIn.waitingInstructions}</p>
        <div className="signin-dialog__actions">
          <button className="btn" type="button" onClick={onCancel} autoFocus>
            {t.signIn.cancel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
