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
  | 'todo' | 'doing' | 'review' | 'waiting' | 'verified' | 'done'
  /* Phase B lifecycle states */
  | 'planned' | 'in_progress' | 'executed' | 'reviewed'
  | 'shipped' | 'measured' | 'archived';

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
  impact?:      string;      // algorithm: impact level
  practices?:   string[];    // algorithm: best practices (when saved)
  checklist?:   string[];    // algorithm: checklist items (when saved)
  rankingFactors?: string[]; // algorithm: ranking factors (when saved)
  cardType?:    string;      // brain_learning: the card type this learning applies to
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
  /* the project brief — for the strategist's overview block */
  client?:      { name: string; company: string; industry: string };
  baselineDate?: string;
  currentPhase?: number | null;
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
    /* V2 additions on existing section — all optional for backwards compat */
    primaryGoalNarrative?: string; secondaryGoals?: string;
    antiGoals?: string; reportAudience?: string;
  };
  tech: {
    cms: string; cmsVersion: string; theme: string; seoPlugin: string;
    hosting: string; pagespeedMobile: string; pagespeedDesktop: string; ssl: string;
  };
  access: {
    gsc: string; ga4: string; ahrefs: string; cmsAdmin: string; hosting: string;
    /* V2 additions */
    dns?: string; schemaEdit?: string; robotsEdit?: string;
    sitemapRegeneration?: string; deploy?: string; notes?: string;
  };
  analytics: {
    organicSessions: string; topLandingPages: string; bounceRate: string;
    conversions: string; gscImpressions: string; gscClicks: string; gscPosition: string;
    /* V2 additions */
    gscCtr?: string; ga4ConversionEvents?: string;
    valuePerLead?: string; valuePerCustomer?: string;
    rankTrackerSource?: string; lastManualRankCheck?: string; lastManualRankNotes?: string;
  };
  technical: {
    pagesIndexed: string; pagesSubmitted: string; crawlErrors: string;
    brokenLinks: string; duplicateContent: string; schemaMarkup: string;
    robotsTxt: string; canonicalIssues: string;
    /* V2 additions */
    cwvLcp?: string; cwvInp?: string; cwvCls?: string;
    mobileUsability?: string; hreflangSetup?: string;
    httpsStatus?: string; jsRendering?: string;
  };

  /* ── V2 sections (entirely new; all optional to keep gather backwards-compatible) ── */
  identity?: {
    clientName?: string; legalEntity?: string;
    industry?: string; industrySpecific?: string;
    businessModel?: string; lifecycleStage?: string;
    primaryOffering?: string; uniqueValueProp?: string;
    annualRevenue?: string; geographicMarkets?: string;
    languages?: string; yearFounded?: string;
    headcount?: string; publicOrPrivate?: string;
  };
  audience?: {
    icp?: string;
    persona1Name?: string; persona1Motivations?: string; persona1Objections?: string;
    persona2Name?: string; persona2Motivations?: string;
    persona3Name?: string;
    searchIntentSplit?: string; funnelFocus?: string;
    positioningStatement?: string;
  };
  content?: {
    brandVoice?: string; brandToneWords?: string; readingLevel?: string;
    prohibitedTopics?: string; requiredDisclaimers?: string;
    contentThemes?: string; contentGapsKnown?: string;
    contentCapacity?: string; contentHoursWeekly?: string;
    editorialCalendar?: string; publishingWorkflow?: string;
  };
  backlinks?: {
    drAhrefs?: string; daMoz?: string; trustFlowMajestic?: string;
    referringDomains?: string; highQualityLinks?: string;
    anchorTextHealth?: string; linkBuildingApproach?: string;
    linkBuildingCapacity?: string; backlinkAuditDate?: string;
    toxicLinks?: string;
  };
  commercial?: {
    engagementType?: string; monthlyHours?: string;
    contractStart?: string; contractRenewal?: string;
    pointOfContactRole?: string; decisionMakerRole?: string;
    communicationChannel?: string; commsResponseSla?: string;
    deliverablesExpected?: string; escalationPath?: string;
    invoiceTerms?: string;
  };
  history?: {
    priorSeoWork?: string; priorAgencyName?: string;
    whatWorked?: string; whatDidntWork?: string;
    activePenalties?: string; penaltyNotes?: string;
    recentMigrations?: string; recentRedesigns?: string;
    algorithmImpacts?: string; businessChanges?: string;
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

/* ═══════════════════════════════════════════════════════════
   Client report types
═══════════════════════════════════════════════════════════ */

export type ReportBlockType = 'narrative' | 'kpi' | 'chart' | 'table' | 'matrix' | 'embed';
export type ReportBlockCategory = 'summary' | 'delivery' | 'performance' | 'competitive' | 'next';

export interface ReportBlock {
  id:        string;
  type:      ReportBlockType;
  title:     string;
  category:  ReportBlockCategory;
  available: boolean;
  hint?:     string;
  content?:  string;          // narrative blocks: the text
  data?:     any;             // structured blocks: chart/table/kpi/matrix data
}

export interface Sliders {
  tone?:           number;    // 0=casual → 100=formal
  technicalDepth?: number;    // 0=plain-English → 100=technical
  confidence?:     number;    // 0=cautious → 100=confident
  emotion?:        number;    // 0=reserved → 100=warm
  length?:         number;    // 0=brief → 100=comprehensive
}

export interface PmContext {
  emphasize?:  string;
  downplay?:   string;
  mood?:       '' | 'steady' | 'launching' | 'under_pressure' | 'celebrating';
  customNote?: string;
}

export interface ReportSummary {
  id:           string;
  title:        string;
  period_start: string | null;
  period_end:   string | null;
  status:       'draft' | 'finalized' | 'shared';
  share_token:  string | null;
  shared_at:    string | null;
  created_at:   string;
  updated_at:   string;
}

export interface FullReport extends ReportSummary {
  project_id:      string;
  sliders:         Sliders;
  pm_context:      PmContext;
  selected_blocks: string[];
  blocks:          ReportBlock[];
}

export interface SharedReport {
  title:        string;
  period_start: string | null;
  period_end:   string | null;
  blocks:       ReportBlock[];
  shared_at:    string;
  project_name: string;
  client:       string;
}

/* ═══════════════════════════════════════════════════════════
   Lifecycle types (Phase B — execution loop)
═══════════════════════════════════════════════════════════ */

export type LifecycleState =
  | 'planned' | 'in_progress' | 'executed' | 'reviewed'
  | 'shipped' | 'measured' | 'blocked' | 'archived'
  /* legacy still seen on old rows */
  | 'todo'    | 'doing'      | 'done';

export interface CardBlocker {
  id:     string;
  title:  string;
  status: string;
}

export interface CardShipment {
  id:                 string;
  card_id:            string;
  project_id:         string;
  shipped_at:         string;
  shipped_by:         string | null;
  affected_urls:      string[];
  actual_shipped_url: string | null;
  changes_summary:    string;
  evidence_url:       string | null;
  baseline_metrics:   Record<string, any>;
  baseline_captured_at: string | null;
  post_metrics:       Record<string, any>;
  post_captured_at:   string | null;
  force_ship_reason:  string | null;
}

export interface CardActivity {
  id:         string;
  card_id:    string;
  project_id: string;
  kind:       string;
  from_state: string | null;
  to_state:   string | null;
  detail:     any;
  message:    string;
  actor:      string | null;
  created_at: string;
}

export interface CardDetail {
  card:       any;
  blockers:   CardBlocker[];
  isBlocked:  boolean;
  shipments:  CardShipment[];
  activity:   CardActivity[];
}

export interface LifecycleMap {
  blockedByCard:        Record<string, { blockers: CardBlocker[] }>;
  shipmentCountsByCard: Record<string, number>;
}

/* ═══════════════════════════════════════════════════════════
   Auto-pilot (Phase F) — rules, suggestions, alerts
═══════════════════════════════════════════════════════════ */

export type RuleType =
  | 'monthly_audit'
  | 'quarterly_crawl'
  | 'weekly_report_draft'
  | 'monthly_report_draft'
  | 'rank_drop_alert'
  | 'click_drop_alert'
  | 'audit_score_drop_alert';

export interface ProjectRule {
  id:                string;
  project_id:        string;
  rule_type:         RuleType;
  enabled:           boolean;
  schedule:          any;
  config:            any;
  last_fired_at:     string | null;
  last_fire_status:  string | null;
  last_fire_error:   string | null;
  last_fire_summary: any;
  created_at:        string;
  updated_at:        string;
}

export interface CardSuggestion {
  id:                string;
  project_id:        string;
  source_rule_id:    string | null;
  source_kind:       string;
  card_type:         string | null;
  priority:          string | null;
  title:             string;
  description:       string | null;
  requirements:      any;
  source_refs:       any[];
  estimated_hours:   number | null;
  status:            'pending' | 'accepted' | 'dismissed';
  accepted_card_id:  string | null;
  dismiss_reason:    string | null;
  created_at:        string;
}

export interface ProjectAlert {
  id:               string;
  project_id:       string;
  source_rule_id:   string | null;
  alert_type:       string;
  severity:         'info' | 'warn' | 'critical';
  title:            string;
  detail:           any;
  dedupe_key:       string;
  status:           'open' | 'acknowledged' | 'resolved';
  acknowledged_by:  string | null;
  acknowledged_at:  string | null;
  resolved_at:      string | null;
  resolution_note:  string | null;
  created_at:       string;
}
