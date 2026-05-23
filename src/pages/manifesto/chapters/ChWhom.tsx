/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChWhom.tsx
   Chapter 10 — For Whom This Was Built. Harvest.

   Five client archetypes. Different scales, different business
   models, different goals. The infrastructure underneath is the
   same; what shifts is the lens the client brings to it.

   Reframed from a role-based audience map (clients / customers /
   investors / stakeholders / team) to a client-archetype map that
   helps a prospect identify themselves and see how SEASON serves
   their specific situation.

   Ordered by recognition speed — most readers find themselves in
   1 or 2 before continuing:
     1. The founder building organic on limited runway
     2. The marketing leader who reports to a board
     3. The local business that has to be the obvious choice
     4. The ecommerce operator competing in the AI-search era
     5. The agency or consultancy that needs operating infrastructure
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface ClientArchetype {
  title: string;
  body:  string;
}

const ARCHETYPES: ClientArchetype[] = [
  {
    title: 'The founder building organic on limited runway',
    body:  "You can't gamble on six-month retainers that ship PDFs instead of progress. SEASON shows every task done this week, every metric refreshed today, every gap acknowledged. SEO becomes an asset on your balance sheet — spend defensible to you, your team, and the next round of investors.",
  },
  {
    title: 'The marketing leader who reports to a board',
    body:  "Your CFO asks where the number came from. SEASON's answer is: from this source, at this timestamp, traceable to this action. Every chart cites itself. Every metric is defensible. Channel-of-record reporting, not retrospective storytelling. The board update writes itself; you frame the narrative.",
  },
  {
    title: 'The local business that has to be the obvious choice',
    body:  "Your customers find you through \u201cnear me,\u201d map packs, voice queries, AI-generated answers \u2014 usually before they ever land on your site. SEASON treats local search with the same rigor as enterprise organic: entity consistency, schema correctness, review velocity, citation density. With weekly visibility into where you rank against the firms you actually compete with.",
  },
  {
    title: 'The ecommerce operator competing in the AI-search era',
    body:  "When ChatGPT names brands in your category, is yours among them? When Google's AI Overview compiles \u201cbest [your product]\u201d guides, are your pages cited? Commercial intent is increasingly resolved before the click. SEASON tracks AI-engine citation alongside traditional rankings and structures your pages for what AI engines actually consume.",
  },
  {
    title: 'The agency or consultancy that needs operating infrastructure',
    body:  "You sold the engagement on strategy and judgment. You don't want to build a crawl orchestration, a data layer, or an audit framework to deliver it. SEASON is the substrate \u2014 white-label or co-branded. You bring the client relationship; SEASON brings the always-on intelligence. Your client sees one consistent operation.",
  },
];

export function ChWhom({ t }: { t: TFn }) {
  return (
    <ChapterShell id="whom" no="10" season="harvest" titleKey="ch10" t={t}>
      <WhomStyles />

      <Prose delay={0.4}>
        Five archetypes &mdash; from the founder funding growth on limited
        runway to the consultancy delivering client work on borrowed
        infrastructure. The system underneath is the same; what shifts
        is the goal it serves. Find the one closest to your situation;
        the rest will still hold.
      </Prose>

      <div className="whom-stack mt-14">
        {ARCHETYPES.map((a, i) => (
          <WhomBlock key={i} archetype={a} index={i} />
        ))}
      </div>
    </ChapterShell>
  );
}

function WhomBlock({ archetype, index }: { archetype: ClientArchetype; index: number }) {
  return (
    <motion.div
      className="whom-block"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.1, ease: FEATHER, delay: 0.1 + index * 0.08 }}
    >
      <div className="whom-marker" />
      <div className="whom-body">
        <div className="whom-title">{archetype.title}</div>
        <div className="whom-text">{archetype.body}</div>
      </div>
    </motion.div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

function WhomStyles() {
  return (
    <style>{`
      .whom-stack {
        display: flex;
        flex-direction: column;
        gap: 1.8rem;
      }
      .whom-block {
        display: grid;
        grid-template-columns: 28px 1fr;
        gap: 1.4rem;
        align-items: flex-start;
        padding: 1.4rem 0;
        border-top: 0.5px solid var(--m-hairline);
      }
      .whom-block:first-of-type {
        border-top: none;
      }
      .whom-marker {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.95);
        box-shadow: 0 0 14px hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.5);
        margin-top: 0.7rem;
        margin-left: 8px;
      }
      .whom-title {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.4rem;
        line-height: 1.3;
        color: var(--m-ink-strong);
        font-weight: 500;
        letter-spacing: -0.015em;
        margin-bottom: 0.7rem;
        max-width: 52ch;
      }
      .whom-text {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.08rem;
        line-height: 1.65;
        color: var(--m-ink-medium);
        max-width: 64ch;
      }
      @media (max-width: 720px) {
        .whom-block { grid-template-columns: 20px 1fr; gap: 1rem; }
        .whom-title { font-size: 1.18rem; }
        .whom-text  { font-size: 1rem; }
      }
    `}</style>
  );
}
