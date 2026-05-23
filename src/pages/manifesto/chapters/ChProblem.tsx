/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChProblem.tsx
   Chapter 01 — The Problem We Solve. Winter.

   The single hardest sentence of the whole codex lives here:
   "The agency knows what's happening. The client doesn't. That
   asymmetry is the entire business."

   Prose only. The Winter ambient atmosphere does the visual work.
   No custom UI elements — the cold air and the words carry it.
══════════════════════════════════════════════════════════════════════ */

import { ChapterShell, Prose, Statement } from '../shared';
import type { TFn } from '../types';

export function ChProblem({ t }: { t: TFn }) {
  return (
    <ChapterShell id="problem" no="01" season="winter" titleKey="ch01" t={t}>
      <Prose delay={0.4}>
        Every SEO engagement begins the same way. The agency arrives. Promises are
        made. A deck is prepared. The work begins. Six weeks later, the client
        doesn't know what was done — only what was promised.
      </Prose>

      <Prose delay={0.6}>
        By month four, monthly reports look identical: a screenshot of a rank
        tracker, the same top-ten keywords, a chart labeled "impressions." By
        month eight, the client switches agencies. The next agency promises the
        same things. The cycle starts over.
      </Prose>

      <Prose delay={0.8}>
        <em>The agency knows what's happening. The client doesn't.</em> That
        asymmetry is the entire business. It is the reason SEO has a reputation
        for being a black box held together by trust and screenshots.
      </Prose>

      <Statement delay={1.0}>
        SEO SEASON exists because the asymmetry shouldn't.
      </Statement>
    </ChapterShell>
  );
}
