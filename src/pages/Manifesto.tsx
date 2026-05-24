/* ════════════════════════════════════════════════════════════════════
   src/pages/Manifesto.tsx
   THE METHOD — root orchestrator for the SEO SEASON operating manifesto.

   Thin file by design. Owns:
     - Active language state (persists for this page session).
     - Active chapter state, driven by an IntersectionObserver
       watching all 15 chapter sections.
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
import { ChWhom }       from './manifesto/chapters/ChWhom';
import { ChFounder }    from './manifesto/chapters/ChFounder';
import { ChFAQ }        from './manifesto/chapters/ChFAQ';
import { ChInPractice } from './manifesto/chapters/ChInPractice';
import { ChFuture }     from './manifesto/chapters/ChFuture';

import {
  LocaleDateline,
  InterstitialA,
  InterstitialB,
  InterstitialC,
} from './manifesto/LocaleInterstitial';

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

  /* Sync the document's <html lang="..."> attribute and the browser tab
     title with the active language. The lang attribute matters for
     screen readers (so they pronounce text correctly), font selection,
     hyphenation, and SEO. The title gives reader confidence that they're
     on the localized page. Both restore when leaving the manifesto. */
  useEffect(() => {
    const prevLang = document.documentElement.lang;
    const prevTitle = document.title;
    document.documentElement.lang = t('html_lang') || 'en';
    document.title = t('meta_title') || prevTitle;
    return () => {
      document.documentElement.lang = prevLang;
      document.title = prevTitle;
    };
  }, [lang, t]);

  /* Active-chapter detection. A scroll-spy (rAF-throttled) replaces the
     prior IntersectionObserver, which became unreliable as chapters grew
     in length — long chapters could never cross a 25% intersection ratio
     threshold, leaving the season state stale.

     The rule is now simple and height-agnostic: at any scroll position,
     the active chapter is the one whose top edge is the highest above
     (or at) a fixed trigger line 35% from the top of the viewport. As
     the user scrolls down, each chapter's top eventually crosses this
     line — that's the moment the chapter becomes active, and the
     ambient season cross-fades. As they scroll back up, the trigger
     line passes back over earlier chapters in reverse, so the seasons
     unwind in the same order they arrived. Smooth in both directions. */
  useEffect(() => {
    let rafId: number | null = null;

    const computeActive = () => {
      const triggerY = window.innerHeight * 0.35;
      let candidate: string | null = null;
      let candidateTop = -Infinity;

      for (const c of CHAPTERS) {
        const el = document.getElementById(c.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        /* The chapter we want is the one whose top has just passed the
           trigger line. Among all chapters with top <= triggerY, pick
           the one with the LARGEST top (the most recent to cross). */
        if (top <= triggerY && top > candidateTop) {
          candidate = c.id;
          candidateTop = top;
        }
      }

      /* Edge case at the very top of the page (before the first chapter
         crosses the trigger). Default to the first chapter so the
         ambient season matches the cold open immediately. */
      if (!candidate) candidate = CHAPTERS[0]?.id ?? null;

      if (candidate) {
        setActiveChapter((prev) => (prev === candidate ? prev : candidate));
      }
      rafId = null;
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(computeActive);
    };

    window.addEventListener('scroll',  onScroll, { passive: true });
    window.addEventListener('resize',  onScroll, { passive: true });
    computeActive();   // initial computation

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
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
          <LocaleDateline lang={lang} t={t} />
          <ChProblem   t={t} />
          <ChVision    t={t} />
          <ChHowSearch t={t} />
          <ChPillars   t={t} />
          <InterstitialA lang={lang} t={t} />
          <ChJourney   t={t} />
          <ChEngine    t={t} />
          <ChCompare   t={t} />
          <ChEthics    t={t} />
          <InterstitialB lang={lang} t={t} />
          <ChData      t={t} />
          <ChWhom        t={t} />
          <ChFounder     t={t} />
          <ChFAQ         t={t} />
          <InterstitialC lang={lang} t={t} />
          <ChInPractice  t={t} />
          <ChFuture      t={t} />
        </main>

        <FooterMark t={t} />
      </div>
    </MotionConfig>
  );
}

// build:20260523-145449
