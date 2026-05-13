/**
 * HelpPanel — collapsible help section for every page.
 * Stays in sync with feature updates. Auto-persists collapsed state per page.
 */
import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Info, Zap } from 'lucide-react';

export interface HelpSection {
  title:   string;
  icon:    '✅' | '⚠️' | 'ℹ️' | '⚡' | '🧠' | '📊' | '🎯' | '🔧';
  items:   string[];
  type?:   'what' | 'how' | 'gap' | 'tip';
}

interface HelpPanelProps {
  pageId:    string;
  pageTitle: string;
  tagline:   string;
  sections:  HelpSection[];
}

const ICON_COLOR: Record<HelpSection['icon'], string> = {
  '✅': '#10b981', '⚠️': '#f59e0b', 'ℹ️': '#6366f1',
  '⚡': '#f59e0b', '🧠': '#a78bfa', '📊': '#60a5fa',
  '🎯': '#f472b6', '🔧': '#06b6d4',
};

const TYPE_BG: Record<string, string> = {
  what: 'rgba(99,102,241,0.06)',
  how:  'rgba(16,185,129,0.06)',
  gap:  'rgba(245,158,11,0.06)',
  tip:  'rgba(6,182,212,0.06)',
};
const TYPE_BORDER: Record<string, string> = {
  what: 'rgba(99,102,241,0.2)',
  how:  'rgba(16,185,129,0.2)',
  gap:  'rgba(245,158,11,0.2)',
  tip:  'rgba(6,182,212,0.2)',
};

export default function HelpPanel({ pageId, pageTitle, tagline, sections }: HelpPanelProps) {
  const key = `help_open_${pageId}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(key) !== 'false'; } catch { return true; }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(key, String(next)); } catch { /* ignore */ }
  };

  return (
    <div style={{
      background:   'rgba(255,255,255,0.02)',
      border:       '1px solid rgba(99,102,241,0.18)',
      borderRadius: 12,
      marginBottom: 20,
      overflow:     'hidden',
      fontFamily:   'system-ui, sans-serif',
    }}>
      {/* Header */}
      <button
        onClick={toggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <HelpCircle size={14} style={{ color: '#a5b4fc', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(165,180,252,0.9)', letterSpacing: '0.06em' }}>
            HOW {pageTitle.toUpperCase()} WORKS
          </span>
          {!open && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>
              {tagline}
            </span>
          )}
        </div>
        <div style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', marginRight: 4 }}>
          {open ? 'HIDE' : 'SHOW'}
        </div>
        {open
          ? <ChevronUp   size={12} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
          : <ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />}
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0, paddingBottom: 6,
            borderBottom: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.5 }}>
            {tagline}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 10 }}>
            {sections.map((s, i) => (
              <div key={i} style={{
                background:   TYPE_BG[s.type || 'what'],
                border:       `1px solid ${TYPE_BORDER[s.type || 'what']}`,
                borderRadius: 9, padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <span style={{ fontSize: 13 }}>{s.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: ICON_COLOR[s.icon] || '#a5b4fc',
                    letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {s.title}
                  </span>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {s.items.map((item, j) => (
                    <li key={j} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ color: ICON_COLOR[s.icon] || '#a5b4fc', fontSize: 9, marginTop: 2, flexShrink: 0 }}>›</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Pre-built help configs for every page ── */

export const HELP: Record<string, { pageTitle: string; tagline: string; sections: HelpSection[] }> = {

  'brain-learning': {
    pageTitle: 'Brain Learning',
    tagline:   'Permanent memory pathways for Manav Brain. Every active learning is referenced in every AI response — the more you have, the smarter Brain gets about your specific project.',
    sections: [
      {
        title: 'What it is', icon: 'ℹ️', type: 'what',
        items: [
          'A database of structured SEO insights specific to your project',
          'Brain reads ALL active learnings before answering any question',
          'Learnings compound — 50 learnings = much sharper strategy than 5',
          'Separate from general knowledge — this is your project\'s institutional memory',
        ],
      },
      {
        title: 'How learnings are created', icon: '🧠', type: 'how',
        items: [
          'AUTO: Brain captures learnings after every task execution, audit, and analysis',
          'MANUAL: Ask Brain to "learn everything about [project]" — it saves structured learnings',
          'MANUAL: Click "Save Learning" after any Brain response worth keeping',
          'Brain Command: Every executed task auto-saves a learning pathway',
        ],
      },
      {
        title: 'Status workflow', icon: '🔧', type: 'how',
        items: [
          'pending_review → Brain captured it, waiting for your approval',
          'active → Brain uses this in every response (approve to activate)',
          'rejected → Discarded, Brain ignores it',
          'Approve good learnings to build up Brain\'s intelligence over time',
        ],
      },
      {
        title: 'Current gaps', icon: '⚠️', type: 'gap',
        items: [
          '0 learnings = Brain gives generic SEO advice, not project-specific advice',
          'All pending_review = Brain still can\'t use them — you must approve',
          'Missing learning types: what failed historically, competitor moves, algorithm responses',
          'Fix: Tell Brain "learn everything about [project]" after filling the Data Room',
        ],
      },
    ],
  },

  'brain-command': {
    pageTitle: 'Brain Command',
    tagline:   'Automation mission control. Select canvas cards, queue them up, and Brain executes them in parallel — up to 4 at once — with full streaming output saved automatically to your Desk.',
    sections: [
      {
        title: 'How it works', icon: '⚡', type: 'how',
        items: [
          '1. Select a project from the dropdown (top right)',
          '2. Click canvas cards in the left panel to add them to the queue',
          '3. Hit RUN ALL — up to 4 tasks execute simultaneously',
          '4. Watch live streaming output per task in the Gantt-style centre panel',
          '5. All outputs auto-saved to Brain Desk after completion',
        ],
      },
      {
        title: 'Brain chat', icon: '🧠', type: 'what',
        items: [
          'Right panel: command Brain in plain English or by voice',
          'Brain knows your current queue status and can add/reorder tasks',
          'Say "run all quick-win cards" or "what should I execute first"',
          'Brain uses your project context, canvas, and learnings in every reply',
        ],
      },
      {
        title: 'Task execution quality', icon: '🎯', type: 'tip',
        items: [
          'Brain needs project context to give precise output — fill the Data Room first',
          'Technical cards output ready-to-deploy code or config',
          'Content cards output full drafts with meta titles and schema',
          'Verify outputs using the checklist before deploying anything live',
        ],
      },
      {
        title: 'Current gaps', icon: '⚠️', type: 'gap',
        items: [
          'No canvas cards = nothing to queue — go to Playground and create cards first',
          'No project selected = Brain has no context, responses will be generic',
          'FUNCTION_INVOCATION_FAILED = API error, check Vercel logs',
          'Outputs not in Desk = task failed or project_id missing from request',
        ],
      },
    ],
  },

  'playground': {
    pageTitle: 'Strategy Canvas',
    tagline:   'Your SEO execution plan visualised as cards on a weekly timeline. Brain reads your entire canvas in real-time — every card, every status, every priority — and uses it in every response.',
    sections: [
      {
        title: 'Card lifecycle', icon: '🎯', type: 'how',
        items: [
          'Create → Place on a week → Execute with AI → Human review → Mark done → Verify',
          'Drag cards between weeks to reprioritise',
          'Card types: technical, content, geo, quick-win, competitive, insight, weekly, monthly',
          'Status: todo → doing → done → verified (only verified cards count as complete)',
        ],
      },
      {
        title: 'Brain integration', icon: '🧠', type: 'what',
        items: [
          'Brain sees ALL placed cards with type, status, priority, title, and content',
          'Unplaced library cards are visible to Brain but lower priority',
          'Brain can CREATE cards via add_card ACTION tags — they appear instantly',
          'Brain reads canvas structure to identify bottlenecks and sequencing issues',
        ],
      },
      {
        title: 'AI execution', icon: '⚡', type: 'how',
        items: [
          'Click any card → Execute with AI → Brain produces task-specific output',
          'Role selector changes how Brain frames the output (Content Writer vs Executive)',
          'Output streams in real time — scroll to watch Brain work',
          'Save to Cache → output stored for reference; Submit for Verification → starts verify flow',
        ],
      },
      {
        title: 'Current gaps', icon: '⚠️', type: 'gap',
        items: [
          '61 cards, 0 completed = strategy built but execution not started',
          'Cards in backlog (week 5) = Brain deprioritises them in planning',
          'No done/verified cards = Brain can\'t identify what\'s working',
          'Fix: Execute 1 quick-win card this week, mark done, verify → builds momentum',
        ],
      },
    ],
  },

  'desk': {
    pageTitle: 'Brain Desk',
    tagline:   'Organised storage for every Brain output. Every task execution, audit, analysis, and Brain chat response that Brain saves ends up here — searchable, filterable, and downloadable.',
    sections: [
      {
        title: 'How files get here', icon: '🔧', type: 'how',
        items: [
          'AUTO: Every task executed in Brain Command is auto-saved here',
          'AUTO: Every substantial Brain chat response gets a "Save to Desk" button',
          'AUTO: Audit outputs saved after completion',
          'MANUAL: Brain can save any content via save_to_desk ACTION tag',
        ],
      },
      {
        title: 'Organisation', icon: '📊', type: 'what',
        items: [
          'Filter by project, date range, content type (report, code, audit, analysis)',
          'Filter by tags — Brain auto-tags by card type and source',
          'Pin important outputs to the top',
          'All outputs downloadable as text files',
        ],
      },
      {
        title: 'Content types', icon: '🎯', type: 'what',
        items: [
          'report: strategic analysis, priority recommendations, weekly plans',
          'code: technical fixes, schema markup, redirect rules, robots.txt',
          'audit: full site audit outputs from seo-agent or run-analysis',
          'analysis: competitive analysis, keyword research, content gaps',
          'note: manual Brain notes and saved chat excerpts',
        ],
      },
      {
        title: 'Current gaps', icon: '⚠️', type: 'gap',
        items: [
          'Empty Desk = no tasks have been executed yet via Brain Command or Playground',
          'Missing outputs = task failed (check Brain Command error state)',
          'No project filter = you may be looking at wrong project\'s outputs',
          'Fix: Run any task in Brain Command and the output will appear here automatically',
        ],
      },
    ],
  },

  'data-room': {
    pageTitle: 'Data Room',
    tagline:   'The knowledge base Brain reads for every single response. Empty Data Room = generic advice. Fully filled Data Room = Brain gives specific, data-driven recommendations using your actual numbers.',
    sections: [
      {
        title: 'What to fill', icon: '🎯', type: 'what',
        items: [
          'Goals: primary goal, timeline, success metrics, target keywords',
          'Analytics: organic sessions/mo, GSC clicks, average position',
          'Technical: pages indexed, crawl errors, CMS, SEO plugin, PageSpeed',
          'Competitors: up to 3 competitor domains + your Domain Rating',
          'Documents: upload audit PDFs, GSC exports, keyword research files',
        ],
      },
      {
        title: 'Impact on Brain', icon: '🧠', type: 'how',
        items: [
          'Every Brain response includes "DATA ROOM KNOWLEDGE:" section with your data',
          'Brain uses your organic traffic numbers in every calculation and recommendation',
          'Competitor domains allow Brain to reference gap analysis directly',
          'Uploaded documents get extracted and Brain can reference specific findings',
        ],
      },
      {
        title: 'Priority order', icon: '⚡', type: 'tip',
        items: [
          '1st: Goals + Keywords (5 mins) — Brain needs this most',
          '2nd: Analytics baseline (5 mins) — Brain needs numbers to calculate impact',
          '3rd: Technical config (5 mins) — identifies immediate technical gaps',
          '4th: Competitors (2 mins) — enables competitive intelligence',
          '5th: Document uploads (ongoing) — deepens Brain\'s specific knowledge',
        ],
      },
      {
        title: 'Current gaps', icon: '⚠️', type: 'gap',
        items: [
          'SEO plugin: NOT SET — Brain flags this in every technical recommendation',
          'No uploaded documents — Brain cannot reference audit findings',
          'Competitor backlink gap analysis not uploaded — Brain estimates instead',
          'Fix: Fill Goals and Analytics first — 10 minutes of input = weeks of better output',
        ],
      },
    ],
  },

  'algorithm-intel': {
    pageTitle: 'Algorithm Intelligence',
    tagline:   'Brain\'s knowledge of Google and AI search engine algorithm updates. The more topics loaded, the more precisely Brain can align your strategy with current ranking signals.',
    sections: [
      {
        title: 'How it works', icon: '🔧', type: 'how',
        items: [
          'Browse the catalog of known algorithm updates and AI search changes',
          'Click "Fetch" to load the full intelligence brief on any topic',
          'Brain references loaded topics in every strategic recommendation',
          'Custom topic: enter any SEO topic and Brain researches it live',
        ],
      },
      {
        title: 'What Brain uses it for', icon: '🧠', type: 'what',
        items: [
          'Aligning card types with current algorithm priorities (e.g. E-E-A-T signals)',
          'GEO strategy: knowing which AI engines use which citation patterns',
          'Technical fixes: understanding what Core Web Vitals score matters most now',
          'Content: knowing which content formats get AI Overview citations currently',
        ],
      },
      {
        title: 'Priority topics', icon: '🎯', type: 'tip',
        items: [
          'HubSpot SEO best practices (your CMS is HubSpot)',
          'No-code/Low-code SERP behavior (your primary keyword vertical)',
          'Enterprise mobile apps ranking patterns (your target market)',
          'AI Overviews citation triggers (critical for your LLM score of 20/100)',
          'Google March 2024 + November 2024 Core Updates (most recent core updates)',
        ],
      },
      {
        title: 'Current gaps', icon: '⚠️', type: 'gap',
        items: [
          'Only 3 topics loaded — Brain\'s algorithm knowledge is limited',
          'HubSpot SEO not loaded — Brain can\'t give HubSpot-specific technical advice',
          'No-code SERP behavior not loaded — Brain estimates keyword competition',
          'Fix: Fetch 5 priority topics above — takes 10 minutes, pays off in every response',
        ],
      },
    ],
  },

  'dashboard': {
    pageTitle: 'Dashboard',
    tagline:   'Real-time health scores and execution metrics for your project. Brain reads these scores in every response — low scores trigger proactive recommendations.',
    sections: [
      {
        title: 'Score meanings', icon: '📊', type: 'what',
        items: [
          'LLM Score (0–100): visibility to AI engines — Perplexity, ChatGPT, Google AI Overviews',
          'Algorithm Health (0–100): alignment with current Google ranking signals',
          'E-E-A-T Score (0–100): Experience, Expertise, Authoritativeness, Trustworthiness signals',
          'Authority Score (0–100): domain authority + backlink quality composite',
        ],
      },
      {
        title: 'How scores update', icon: '🔧', type: 'how',
        items: [
          'Scores update after you run a new audit or manually update metrics in Data Room',
          'LLM Score requires GEO-specific audit (not standard technical audit)',
          'Algorithm Health updates after each Core Web Vitals and crawl check',
          'Scores reflect what was last measured — run fresh audits regularly',
        ],
      },
      {
        title: 'Current state', icon: '⚠️', type: 'gap',
        items: [
          'LLM Score 20/100: critical — site not cited by AI engines',
          'Health Score 68/100: technical debt present, not blocking but degrading rankings',
          '0 keywords ranking: no organic rankings on any of 5 target keywords',
          'Fix priority: LLM → fix GEO cards in canvas; Technical → execute Week 1 cards',
        ],
      },
    ],
  },

  'audit': {
    pageTitle: 'SEO Audit',
    tagline:   'Comprehensive site audit that streams results in real time. Outputs are automatically saved to Brain Desk and can be sent directly to Brain for strategic interpretation.',
    sections: [
      {
        title: 'How to use', icon: '🔧', type: 'how',
        items: [
          'Enter any URL (your site or a competitor)',
          'Select audit depth: standard (5 min), deep (15 min), or custom',
          'Results stream in real time — no page reload needed',
          'Output auto-saved to Brain Desk after completion',
        ],
      },
      {
        title: 'What it checks', icon: '📊', type: 'what',
        items: [
          'Technical: crawlability, indexation, redirect chains, canonical issues',
          'Content: thin content, duplicate pages, keyword coverage gaps',
          'Performance: Core Web Vitals, PageSpeed scores, largest contentful paint',
          'Schema: structured data validation, missing schema types',
          'LLM: AI engine citation signals, FAQ schema, conversational content',
        ],
      },
      {
        title: 'After the audit', icon: '🧠', type: 'tip',
        items: [
          'Open Brain and say "interpret the latest audit results for [project]"',
          'Brain will prioritise fixes based on your current canvas and goals',
          'Upload the audit PDF to Data Room → Brain references specific findings',
          'Create canvas cards directly from audit findings via Brain Command',
        ],
      },
    ],
  },

  'admin': {
    pageTitle: 'Admin',
    tagline:   'Client and project management. Every project created here is available to Brain — Brain uses the project name, URL, and configuration in every strategic response.',
    sections: [
      {
        title: 'Structure', icon: '🔧', type: 'what',
        items: [
          'Clients contain Projects (one client can have multiple projects)',
          'Each project has its own: canvas, data room, brain learnings, desk, audit history',
          'Brain context is per-project — selecting a project loads that project\'s full intelligence',
          'Approved users only — manage access here',
        ],
      },
      {
        title: 'Project setup checklist', icon: '🎯', type: 'tip',
        items: [
          '1. Create client → create project with correct domain',
          '2. Open Data Room → fill goals, analytics, technical, competitors',
          '3. Open Playground → ask Brain to generate initial strategy canvas',
          '4. Open Algorithm Intel → load 5 relevant topics',
          '5. Tell Brain to "learn everything about [project]" → activates all learnings',
        ],
      },
    ],
  },
};
