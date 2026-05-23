/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChVision.tsx
   Chapter 02 — The Vision. Spring.

   Anchored by the founding quote — the single sentence every
   architectural decision in SEO SEASON descends from. The body
   paragraphs name a few of those descents.
══════════════════════════════════════════════════════════════════════ */

import { ChapterShell, Prose, FoundingQuote } from '../shared';
import type { TFn } from '../types';

export function ChVision({ t }: { t: TFn }) {
  return (
    <ChapterShell id="vision" no="02" season="spring" titleKey="ch02" t={t}>
      <FoundingQuote delay={0.4}>
        Make the inside of an SEO engagement so transparent that the client can
        verify every claim, every action, every change — in real time, from the
        same dashboard the operator uses.
      </FoundingQuote>

      <Prose delay={0.9}>
        Every architectural decision below descends from that single sentence.
        Per-campaign baselines. An activity log every action writes to. A live
        data layer that refreshes in minutes, not weeks. Source citations on
        every chart. Honest gaps acknowledged. Methodology documented.
      </Prose>

      <Prose delay={1.1}>
        Transparency isn't a feature in this software. It's the substrate
        everything else is built on. The product wasn't shaped to look
        transparent; it was shaped <em>around</em> transparency, and the look
        followed.
      </Prose>

      <Prose delay={1.3}>
        When a client opens their SEO SEASON dashboard, they see the same view
        their account manager opens. Not a sanitized client portal. Not a slide
        with last week's screenshots. The same operator interface, with the
        same data, refreshed at the same cadence.
      </Prose>
    </ChapterShell>
  );
}
