/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/FloatingNav.tsx
   Left rail. Thirteen dots, one per chapter. Each dot binds to its
   chapter's season for color. On hover or when active, the dot
   expands sideways to show a labeled pill with chapter number and
   localized title. Click teleports.

   Active-chapter detection lives in the root Manifesto component
   (IntersectionObserver); this component just renders.
══════════════════════════════════════════════════════════════════════ */

import type { ChapterDef, TFn } from './types';
import { SEASONS } from './seasons';

export function FloatingNav({
  chapters, activeId, onJump, t,
}: {
  chapters: ChapterDef[];
  activeId: string;
  onJump:   (id: string) => void;
  t:        TFn;
}) {
  return (
    <nav className="floating-nav" aria-label={t('nav_aria')}>
      {chapters.map((c) => {
        const season = SEASONS[c.season];
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            className={`nav-dot ${active ? 'nav-dot-active' : ''}`}
            onClick={() => onJump(c.id)}
            style={{
              ['--dot-hue' as any]:   season.hue,
              ['--dot-sat' as any]:   `${season.sat}%`,
              ['--dot-light' as any]: `${season.light}%`,
            } as React.CSSProperties}
            aria-label={`${t('chapter')} ${c.no} — ${t(c.titleKey)}`}
            aria-current={active ? 'true' : 'false'}
          >
            <span className="nav-dot-circle" />
            <span className="nav-dot-label">
              <span className="nav-dot-no">{c.no}</span>
              <span className="nav-dot-title">{t(c.titleKey)}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
