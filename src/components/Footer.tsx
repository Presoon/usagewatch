import { useEffect, useRef, useState } from "react";
import { t, APP_VERSION } from "../i18n";
import { formatCountdown } from "../core/format";
import { EllipsisIcon } from "../assets/icons";

type FooterProps = {
  secondsLeft: number | null;
  isUpdating: boolean;
  onRefresh?: () => void;
  onSettings?: () => void;
  onAbout?: () => void;
  onQuit?: () => void;
};

export function footerStatus(secondsLeft: number | null, isUpdating: boolean): string {
  if (isUpdating || secondsLeft === 0) return t.footer.updating;
  if (secondsLeft === null) return t.footer.noUpdates;
  return t.footer.nextUpdateIn(formatCountdown(secondsLeft));
}

// Version left; countdown + overflow menu (⋯) right.
export function Footer({ secondsLeft, isUpdating, onRefresh, onSettings, onAbout, onQuit }: FooterProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const item = (label: string, fn?: () => void) => (
    <button
      className="menu__item"
      onClick={() => {
        setMenuOpen(false);
        fn?.();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="footer">
      <span className="footer__version" title={t.footer.version(APP_VERSION)}>v{APP_VERSION}</span>
      <div className="footer__right">
        <span className="footer__countdown">
          {footerStatus(secondsLeft, isUpdating)}
        </span>
        {onRefresh && <button className="footer__menu-btn" title={t.menu.refresh} aria-label={t.menu.refresh}
          disabled={isUpdating} onClick={onRefresh}>↻</button>}
        {onSettings && <button className="footer__menu-btn" title={t.menu.settings} aria-label={t.menu.settings} onClick={onSettings}>⚙</button>}
        <div className="footer__menu-wrap" ref={menuRef} onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
        }} onKeyDown={event => {
          if (event.key === "Escape") { setMenuOpen(false); triggerRef.current?.focus(); }
        }}>
          <button
            ref={triggerRef}
            className="footer__menu-btn"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <EllipsisIcon />
          </button>
          {menuOpen && (
            <div className="menu">
              {item(t.menu.about, onAbout)}
              <div className="menu__sep" />
              {item(t.menu.quit, onQuit)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
