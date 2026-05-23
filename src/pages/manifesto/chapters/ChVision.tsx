/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChVision.tsx
   Chapter 02 — The Vision. Spring.

   The founding quote, now attributed. Anonymous statements feel like
   product copy. Attributed ones feel like a person who can be called
   to account if they break the commitment.

   The body paragraphs reframe the agency as built backwards from a
   commitment, not forward from a technology stack.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose, FoundingQuote } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

export function ChVision({ t }: { t: TFn }) {
  return (
    <ChapterShell id="vision" no="02" season="spring" titleKey="ch02" t={t}>
      <VisionStyles />

      <FoundingQuote delay={0.4}>
        Make the inside of an SEO engagement so transparent that the client can
        verify every claim, every action, every change — in real time, from the
        same dashboard the operator uses.
      </FoundingQuote>

      <motion.div
        className="founding-attribution"
        initial={{ opacity: 0, x: -8 }}
        whileInView={{ opacity: 0.75, x: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 1.2, ease: FEATHER, delay: 0.9 }}
      >
        — Manav, on day one
      </motion.div>

      <Prose delay={1.1}>
        SEO SEASON was built backwards from that commitment, not forward from
        a technology stack. The agency exists first. The infrastructure exists
        to make the agency keep its word.
      </Prose>

      <Prose delay={1.3}>
        Per-campaign baselines, source-cited charts, audit trails the client can
        read, honest gaps acknowledged out loud — these aren't features added to
        a product. They're the rules the agency operates under, encoded so they
        cannot be quietly broken later.
      </Prose>

      <Prose delay={1.5}>
        When a client opens their SEO SEASON dashboard, they see the same view
        their account manager opens. Not a sanitized client portal. Not a slide
        with last week's screenshots. The same operator interface, with the
        same data, refreshed at the same cadence.
      </Prose>
    </ChapterShell>
  );
}

function VisionStyles() {
  return (
    <style>{`
      .founding-attribution {
        margin: 1.5rem 0 0 3rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: hsla(var(--ch-hue), 55%, 75%, 0.95);
      }
      @media (max-width: 720px) {
        .founding-attribution { margin-left: 1.5rem; }
      }
    `}</style>
  );
}
