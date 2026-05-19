/* ════════════════════════════════════════════════════════════════
   src/components/pm/types.ts
   PM Module — shared type definitions.

   These types are storage-agnostic: they describe the shape of a task
   card and its surrounding data as the UI and engine see it, regardless
   of which database table backs it.
════════════════════════════════════════════════════════════════ */

/* ── Card classification ── */
export type CardType =
  | 'quick-win' | 'weekly' | 'monthly' | 'technical' | 'content'
  | 'geo' | 'competitive' | 'insight' | 'kpi' | 'custom';

export type Priority = 'high' | 'medium' | 'low';

/* Lifecycle status of a card.
   todo → doing → review → waiting (on verification window) → verified → done */
export type CardStatus =
  | 'todo' | 'doing' | 'review' | 'waiting' | 'verified' | 'done';

/* Placement quality returned by the expert engine when a card is
   dropped into a given week column. */
export type SuggestionLevel = 'best' | 'good' | 'ok' | 'caution';

/* How a card gets done. */
export type ExecutionMode =
  | 'ai_execute'   // AI performs the task directly (hard-fact, no assumptions)
  | 'human_guide'; // AI writes a complete step-by-step guide for a non-technical person

/* The six expert "voices" the AI can take when executing a card. */
export type ExecRole =
  | 'senior_seo' | 'content_writer' | 'team_lead'
  | 'project_manager' | 'executive' | 'biz_dev';

/* ── The task card ──
   The central entity of the PM module. One card = one unit of project work. */
export interface TaskCard {
  id:          string;
  projectId:   string;
  type:        CardType;
  title:       string;
  content:     string;          // description / brief
  priority:    Priority;
  status:      CardStatus;
  week:        number;          // 1-4 = week columns, 5 = backlog
  placed:      boolean;         // false = in library, true = on the board

  /* effort & impact */
  effortHours?:  number;        // estimated hours (engine-computed or override)
  impact?:       string;        // projected metric impact

  /* execution */
  executionMode?: ExecutionMode;
  assignedTo?:    string | null;  // staff member id
  output?:        string;         // AI execution result / generated guide
  executedAt?:    string | null;
  executedRole?:  ExecRole;

  /* verification */
  verifiedAt?:   string | null;
  verifyNotes?:  string;

  /* requirements & dependencies */
  requirements?: CardRequirement[];   // what's needed before this can be done
  dependsOn?:    string[];            // ids of cards that must complete first

  /* provenance */
  source?:       string;        // where this card came from (audit, brain, manual, etc.)
  sourceRefs?:   SourceRef[];    // specific intelligence that informed this card
  aiAssisted?:   boolean;

  /* reporting */
  reportedAt?:   string | null;  // last time included in a client report
  invoiceItem?:  boolean;        // counts as a billable line

  tags?:         string[];
  createdAt?:    string;
  updatedAt?:    string;
}

/* A prerequisite for a card — data, access, content, etc. */
export interface CardRequirement {
  id:        string;
  label:     string;
  category:  'general' | 'data' | 'access' | 'content' | 'technical';
  met:       boolean;
}

/* A pointer to the intelligence that informed a card —
   makes every card traceable back to its source. */
export interface SourceRef {
  kind:   'audit' | 'algorithm' | 'brain_learning' | 'competitor'
        | 'sales' | 'client_note' | 'scope' | 'metric' | 'document';
  refId?: string;     // row id in the source table, when applicable
  label:  string;     // human-readable description of the source
  overview?:   string;   // a short summary of what this source actually says
  highlights?: string[]; // key takeaways (wins, gaps, opportunities)
  url?:        string;   // the audited / referenced URL, when applicable
  competitors?: string[];   // audit: the competitors analysed
  keywords?:    string[];   // audit: the keywords analysed
  detail?:      AuditDetail; // audit: the full extracted findings
  saved?:       boolean;     // algorithm: backed by a saved Library row
}

/* ── Expert engine output ── */
export interface PlacementSuggestion {
  level:    SuggestionLevel;
  headline: string;
  reason:   string;
  impact:   string;
  best:     string;   // human-readable "best week(s)" label
}

export interface NextMove {
  card:    TaskCard;
  week:    number;
  reason:  string;
  impact:  string;
  metric:  string;
}

/* ── Requirement-gathering bundle ──
   The aggregated project intelligence the AI uses to create/enhance cards. */
export interface RequirementContext {
  projectId:    string;
  projectName:  string;
  url:          string;
  goal:         string;
  scope:        string;
  audits:       SourceRef[];
  algorithm:    SourceRef[];
  brain:        SourceRef[];
  competitors:  SourceRef[];
  sales:        SourceRef[];
  clientNotes:  SourceRef[];
  gaps:         string[];   // what's missing for high-quality card generation
  keywords?:    string[];
  hasAnalysis?: boolean;
  projError?:   string;
  documents?:           SourceRef[];
  contentGapKeywords?:  string[];
  dataRoom?:            DataRoomContext;
  crawlPages?:          CrawlPage[];
  keywordMap?:          KeywordPageMapping[];
  unmatchedPages?:      CrawlPage[];
  crawlSummary?:        { total: number; ours: number; competitor: number; lastCrawled: string };
  crawlComparison?:     CrawlComparison | null;
  crawlComparisonAt?:   string;
}

/* The AI competitive comparison — from the crawl's compare_analysis. */
export interface CrawlComparison {
  executive_summary?: string;
  overall_score?:     number;
  comparison_matrix?: {
    headers: string[];
    rows: { signal: string; values: string[]; verdict: string }[];
  };
  errors?:           { severity: string; issue: string; affected_urls?: string[]; fix?: string; quick_fix?: boolean }[];
  opportunities?:    { rank?: number; title: string; description?: string; affected_urls?: string[]; effort?: string; impact?: string; data_basis?: string }[];
  competitive_gaps?: { gap: string; evidence?: string; action?: string; priority?: string }[];
  advantages?:       { advantage: string; urls?: string[]; how_to_leverage?: string }[];
  geo_analysis?:     any;
}

/* The Data Room — the project's deliberate, structured definition. */
export interface DataRoomContext {
  goal: {
    primaryGoal: string; timeline: string; successMetric: string;
    baseline: string; budget: string; reportingCadence: string;
  };
  tech: {
    cms: string; cmsVersion: string; theme: string; seoPlugin: string;
    hosting: string; pagespeedMobile: string; pagespeedDesktop: string; ssl: string;
  };
  access: {
    gsc: string; ga4: string; ahrefs: string; cmsAdmin: string; hosting: string;
  };
  analytics: {
    organicSessions: string; topLandingPages: string; bounceRate: string;
    conversions: string; gscImpressions: string; gscClicks: string; gscPosition: string;
  };
  technical: {
    pagesIndexed: string; pagesSubmitted: string; crawlErrors: string;
    brokenLinks: string; duplicateContent: string; schemaMarkup: string;
    robotsTxt: string; canonicalIssues: string;
  };
}

/* A single page from the live crawl. */
export interface CrawlPage {
  url:             string;
  owner:           'ours' | 'competitor' | 'other';
  contentType:     string;
  crawlStatus:     string;
  crawledAt:       string;
  keywords:        string[];
  keywordsInferred: boolean;   // true = page->keyword match was inferred, not explicit
  targetsKeywords: string[];
  titleIssues:     string;
  contentQuality:  string;
  wordCount:       number | null;
}

/* keyword -> our landing page vs competitor pages, from the crawl. */
export interface KeywordPageMapping {
  keyword:          string;
  ourPage:          CrawlPage | null;
  competitorPages:  CrawlPage[];
  anyInferred:      boolean;
  manuallyLinked:   boolean;
}

/* The detailed findings extracted from an audit's sections jsonb. */
export interface AuditDetail {
  verdict:       string;
  biggestWin:    string;
  urgentGap:     string;
  strengths:     string[];
  opportunities: string[];
  technical:     string;
  content:       string;
  visibility:    string;
  competitive:   string;
}
