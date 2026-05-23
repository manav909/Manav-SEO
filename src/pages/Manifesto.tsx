/* ════════════════════════════════════════════════════════════════════
   src/pages/Manifesto.tsx
   THE METHOD — root orchestrator for the SEO SEASON operating manifesto.

   Thin file by design. Owns:
     - Active language state (persists for this page session).
     - Active chapter state, driven by an IntersectionObserver
       watching all 14 chapter sections.
     - Jump-to-chapter callback for the floating nav.

   Everything else lives in /pages/manifesto/. Each chapter is a
   self-contained file that can be edited or expanded without
   touching the spine. The acronym S.E.A.S.O.N. expands to
   Strategic Execution & Analysis Support Operator's Network.
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';

import type { Lang } from './manifesto/types';
import { COPY } from './manifesto/copy';
import { CHAPTERS } from './manifesto/chapters';
import { SEASONS } from './manifesto/seasons';
import { ManifestoStyles } from './manifesto/styles';
import { AmbientCanvas } from './manifesto/AmbientCanvas';
import { ProgressBar } from './manifesto/ProgressBar';
import { TopBar } from './manifesto/TopBar';
import { FloatingNav } from './manifesto/FloatingNav';
import { FooterMark } from './manifesto/FooterMark';

import { ChColdOpen }  from './manifesto/chapters/ChColdOpen';
import { ChProblem }   from './manifesto/chapters/ChProblem';
import { ChVision }    from './manifesto/chapters/ChVision';
import { ChHowSearch } from './manifesto/chapters/ChHowSearch';
import { ChPillars }   from './manifesto/chapters/ChPillars';
import { ChJourney }   from './manifesto/chapters/ChJourney';
import { ChEngine }    from './manifesto/chapters/ChEngine';
import { ChCompare }   from './manifesto/chapters/ChCompare';
import { ChEthics }    from './manifesto/chapters/ChEthics';
import { ChData }      from './manifesto/chapters/ChData';
import { ChWhom }      from './manifesto/chapters/ChWhom';
import { ChFounder }   from './manifesto/chapters/ChFounder';
import { ChFAQ }       from './manifesto/chapters/ChFAQ';
import { ChFuture }    from './manifesto/chapters/ChFuture';

export default function Manifesto() {
  const [lang, setLang] = useState<Lang>('en');
  const [activeChapter, setActiveChapter] = useState<string>('cold-open');
  const navigate = useNavigate();

  /* Translator — looks up in active lang, falls back to en, then to the
     raw key itself if nothing matches. Memoized so chapter components
     don't re-render when something unrelated changes. */
  const t = useCallback(
    (key: string): string => COPY[lang][key] || COPY.en[key] || key,
    [lang]
  );

  /* Active-chapter detection. Observe all 14 chapter sections; the
     section with the highest intersectionRatio above 0.25 wins. Margin
     rule trims the trigger band so the active state changes near the
     vertical center of the viewport rather than on first touch. */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0 && visible[0].intersectionRatio > 0.25) {
          setActiveChapter(visible[0].target.id);
        }
      },
      { rootMargin: '-25% 0px -25% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    CHAPTERS.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const jumpToChapter = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /* Compute the ambient season from the active chapter. AmbientCanvas
     animates between seasons over 2.2s, so this just hands off the
     current target. */
  const currentSeason =
    SEASONS[CHAPTERS.find((c) => c.id === activeChapter)?.season || 'eternal-spring'];

  return (
    <MotionConfig reducedMotion="user">
      <div className="manifesto-root" data-season={currentSeason.id}>
        <ManifestoStyles />
        <AmbientCanvas season={currentSeason} />
        <ProgressBar />
        <TopBar lang={lang} setLang={setLang} t={t} onExit={() => navigate(-1)} />
        <FloatingNav
          chapters={CHAPTERS}
          activeId={activeChapter}
          onJump={jumpToChapter}
          t={t}
        />

        <main className="manifesto-stage">
          <ChColdOpen  t={t} lang={lang} />
          <ChProblem   t={t} />
          <ChVision    t={t} />
          <ChHowSearch t={t} />
          <ChPillars   t={t} />
          <ChJourney   t={t} />
          <ChEngine    t={t} />
          <ChCompare   t={t} />
          <ChEthics    t={t} />
          <ChData      t={t} />
          <ChWhom      t={t} />
          <ChFounder   t={t} />
          <ChFAQ       t={t} />
          <ChFuture    t={t} />
        </main>

        <FooterMark t={t} />
      </div>
    </MotionConfig>
  );
}

// build:20260523-145449
