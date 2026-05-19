/* ════════════════════════════════════════════════════════════════
   src/components/pm/caps.ts
   PM Module — per-card-type capability data.

   Recovered from the original AI_CAPABILITIES design. Drives the
   honest time comparison (human vs AI vs verify) and the input fields
   the project manager fills before execution.

   All times are in minutes.
════════════════════════════════════════════════════════════════ */

import type { CardType } from './types';

export interface InputField {
  key:         string;
  label:       string;
  why:         string;
  placeholder: string;
}

export interface CardCapability {
  /* Honest time model — minutes */
  timeHuman:  number;   // a person doing it manually, start to finish
  timeAI:     number;   // AI producing the work product
  timeVerify: number;   // the PM checking/approving the AI output
  /* What the AI can and cannot do — set expectations honestly */
  produces:   string[];
  cannotDo:   string[];
  /* Fields the PM fills before running */
  inputs:     InputField[];
}

const CAPS: Record<string, CardCapability> = {
  technical: {
    timeHuman: 240, timeAI: 20, timeVerify: 20,
    produces: [
      'Copy-paste ready code / config (redirects, schema, robots.txt)',
      'Step-by-step deployment instructions',
      'Test commands and a rollback plan',
    ],
    cannotDo: [
      'Push changes live — that needs your CMS login',
      'Control when Google re-crawls',
    ],
    inputs: [
      { key: 'affected_urls',    label: 'Which URLs are affected?',  why: 'Exact paths are needed to generate the correct fix', placeholder: '/old-page, /broken-redirect' },
      { key: 'current_behavior', label: 'What is currently happening?', why: 'The error type determines the fix', placeholder: '404 on /old-page, redirect loop' },
    ],
  },
  content: {
    timeHuman: 480, timeAI: 15, timeVerify: 30,
    produces: [
      'Full content draft at your target word count',
      'H1-H3 structure with keyword placement',
      'Meta title, description, schema, internal link map',
    ],
    cannotDo: [
      'Invent original statistics — share data or it uses public figures',
      'Match brand voice without one example of the brand writing',
    ],
    inputs: [
      { key: 'target_keyword',     label: 'Primary keyword + 3-5 related', why: 'Everything is built around these', placeholder: 'mobile forms app, online form builder' },
      { key: 'search_intent',      label: 'What is the reader trying to do?', why: 'Informational vs commercial changes the structure', placeholder: 'compare options (commercial)' },
      { key: 'word_count_target',  label: 'Target word count', why: 'Determines how deep the draft goes', placeholder: '1200 words' },
      { key: 'brand_voice_example',label: 'One example of how this brand writes', why: 'Without this the output is generic', placeholder: 'Paste a URL or a paragraph' },
    ],
  },
  geo: {
    timeHuman: 180, timeAI: 12, timeVerify: 15,
    produces: [
      'Rewritten intro in direct-answer format for AI extraction',
      'FAQ section (5-8 Q&A) with FAQPage schema',
      'Entity-rich summary block optimised for AI citation',
    ],
    cannotDo: [
      'Guarantee an AI citation — citation depends on many factors',
      'Check Perplexity in real time — you confirm that after',
    ],
    inputs: [
      { key: 'target_query', label: 'Exact query to appear for in AI search', why: 'GEO is query-specific', placeholder: 'best mobile form app for small business' },
      { key: 'ai_platform',  label: 'Which platform matters most?', why: 'Perplexity, ChatGPT, Google AI cite differently', placeholder: 'Perplexity' },
    ],
  },
  'quick-win': {
    timeHuman: 60, timeAI: 5, timeVerify: 10,
    produces: [
      'Meta title & description — before/after for each URL',
      'H1 rewrites where needed',
      'Per-CMS implementation instructions',
    ],
    cannotDo: [
      'Apply the changes in your CMS — instructions take ~2 min',
      'Guarantee a CTR lift — measured together after 7 days',
    ],
    inputs: [
      { key: 'target_urls',   label: 'URLs to optimise — paste 1 to 10', why: 'Each is fetched for a specific before/after', placeholder: 'https://yourdomain.com/page-1' },
      { key: 'target_metric', label: 'What metric are we trying to move?', why: 'CTR vs rankings need different approaches', placeholder: 'click-through rate' },
    ],
  },
  competitive: {
    timeHuman: 300, timeAI: 20, timeVerify: 25,
    produces: [
      'Gap analysis: topics the competitor ranks for and you do not',
      'Content brief for the highest-opportunity gap',
      'Prioritised keyword targeting list',
    ],
    cannotDo: [
      'See Semrush/Ahrefs data without an export',
      'Build backlinks — that is relationship work',
    ],
    inputs: [
      { key: 'competitor_url',  label: 'Competitor domain to analyse', why: 'Their pages are fetched to find the gaps', placeholder: 'competitor.com' },
      { key: 'target_keywords', label: 'Keywords you want to outrank them on', why: 'Keeps the analysis focused enough to act on', placeholder: 'mobile form builder' },
    ],
  },
  insight: {
    timeHuman: 120, timeAI: 10, timeVerify: 15,
    produces: ['A focused analysis answering your question', 'Evidence drawn from project data', 'A clear recommendation'],
    cannotDo: ['Analyse data it has not been pointed to'],
    inputs: [
      { key: 'specific_question', label: 'What do you want analysed?', why: 'A focused question gives a useful answer', placeholder: 'Why are we losing rankings for X?' },
    ],
  },
  weekly: {
    timeHuman: 120, timeAI: 10, timeVerify: 15,
    produces: ['Step-by-step execution brief', 'Required tools and settings', 'Definition of done'],
    cannotDo: ['Do the clicking inside your CMS', 'Make creative calls needing client sign-off'],
    inputs: [
      { key: 'task_context', label: 'More context about what needs doing', why: 'Weekly tasks vary — context determines the approach', placeholder: 'Describe what specifically needs to happen' },
    ],
  },
};

/* Fallback for kpi / monthly / custom — modest, honest defaults. */
const DEFAULT_CAP: CardCapability = {
  timeHuman: 90, timeAI: 10, timeVerify: 15,
  produces: ['A structured work product for this task'],
  cannotDo: ['Anything requiring access or data not provided'],
  inputs: [
    { key: 'task_context', label: 'Context for this task', why: 'Helps produce something specific and useful', placeholder: 'Describe what this task needs' },
  ],
};

export function getCapability(type: CardType): CardCapability {
  return CAPS[type] || DEFAULT_CAP;
}

/* Format minutes as a human-friendly string. */
export function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* The honest saving: human time minus (AI time + verify time). */
export function netSaving(cap: CardCapability): { saved: number; pct: number } {
  const aiTotal = cap.timeAI + cap.timeVerify;
  const saved = Math.max(0, cap.timeHuman - aiTotal);
  const pct = cap.timeHuman > 0 ? Math.round((saved / cap.timeHuman) * 100) : 0;
  return { saved, pct };
}
