import { APP_VERSION, t } from "../i18n";
import usageWatchLogo from "../assets/usageWatch.png";
import { ArrowLeftIcon } from "../assets/icons";

type AboutViewProps = {
  onBack: () => void;
  onOpenRepository: () => void;
  onOpenResearch: () => void;
};

export function AboutView({ onBack, onOpenRepository, onOpenResearch }: AboutViewProps) {
  return (
    <div className="view about-view">
      <header className="view__header">
        <button className="view__back" type="button" onClick={onBack} aria-label={t.about.back}>
          <ArrowLeftIcon size={18} />
        </button>
        <h1 className="view__title">{t.about.title}</h1>
      </header>

      <div className="about-card">
        <img className="about-card__mark" src={usageWatchLogo} alt={t.appName} width={48} height={48} />
        <h2 className="about-card__name">{t.appName}</h2>
        <p className="about-card__version">{t.about.version(APP_VERSION)}</p>
        <p className="about-card__description">{t.about.description}</p>
      </div>

      <div className="about-panel">
        <button type="button" className="settings-action" onClick={onOpenRepository}>
          {t.about.repository}
        </button>
        <p>{t.about.licenses}</p>
        <p>{t.about.endpoints}</p>
        <button type="button" className="settings-action" onClick={onOpenResearch}>
          {t.about.research}
        </button>
      </div>
    </div>
  );
}
