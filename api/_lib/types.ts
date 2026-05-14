/* ═══════════════════════════════════════════════════════════
   Shared types across all api/ serverless functions.
   Import with: import type { BrainContext, ... } from './_lib/types'
═══════════════════════════════════════════════════════════ */

export interface ProjectMetrics {
  llmVisibility:   number | null;
  algorithmHealth: number | null;
  eeat:            number | null;
  authority:       number | null;
  growth:          number | null;
  indexed:         number | null;
  submitted:       number | null;
  mentions:        number | null;
  recordedAt:      string;
}

export interface AuditSummary {
  id:       string;
  date:     string;
  score:    number | null;
  sections: Record<string, string>; // section name → 400-char snippet
}

export interface LearningSummary {
  id:               string;
  card_type:        string;
  card_title:       string;
  improvement:      string;
  confidence_score: number;
  applied_count:    number;
  tags:             string[];
  what_worked:      string[];
  what_missed:      string[];
}

export interface AlgoTopic {
  id:              string;
  topic:           string;
  summary:         string;
  freshness_score: number;
  impact_level:    "high" | "medium" | "low";
  engine:          string;
}

export interface TaskSummary {
  id:         string;
  task_type:  string;
  status:     string;
  created_at: string;
}

export interface ContextGaps {
  noGoal:        boolean;
  noCMS:         boolean;
  noAnalytics:   boolean;
  noCompetitors: boolean;
  noMetrics:     boolean;
  noAudit:       boolean;
  noLearnings:   boolean;
}

/* Full brain context — everything an AI call needs to know about a project */
export interface BrainContext {
  // Identity
  projectId:   string;
  projectName: string;
  clientName:  string;
  url:         string;
  industry:    string;
  country:     string;

  // Tech + strategy
  cms:        string;
  seoPlugin:  string;
  keywords:   string[];
  competitors: string[];
  goals:      string;
  targetTimeline: string;

  // Live signals (may be null if not yet recorded)
  metrics:    ProjectMetrics | null;
  latestAudit: AuditSummary | null;

  // Knowledge base
  learnings:  LearningSummary[];  // top active learnings, sorted by applied_count
  algoTopics: AlgoTopic[];
  tasks:      TaskSummary[];      // recent task executions
  canvas:     any[];              // playground_canvas blocks

  // Analytics (from project_knowledge)
  analytics: {
    organicMonthly:  string;
    gscClicks:       string;
    gscImpressions:  string;
    gscAvgPosition:  string;
    topPages:        string;
  };

  // Tech details (from project_knowledge)
  tech: {
    cms:           string;
    seoPlugin:     string;
    hosting:       string;
    pagespdMobile: string;
    pagespdDesk:   string;
  };

  // Competitor details (from project_knowledge)
  competitorData: {
    c1: string; c1dr: string;
    c2: string; ourDR: string; ourRD: string;
    gaps: string;
  };

  gaps: ContextGaps;
  brainScore: number; // 0-100 completeness score
}

/* Learning classification result */
export interface LearningClass {
  shouldSave:       boolean;
  category:         string;    // card_type to store
  isSystemLevel:    boolean;   // true → project_id forced to null
  confidence:       number;    // 0-100
  autoApprove:      boolean;
  rejectionReason?: string;
}

/* Post-pipeline result for monitoring */
export interface PipelineResult {
  auditId:        string;
  projectId:      string;
  learningSaved:  number;
  learningSkipped: number;
  metricsAutoSynced: boolean;
  launchpadMarkedStale: boolean;
  errors:         string[];
  timestamp:      string;
}

/* Unified API response envelope */
export interface ApiResponse<T = any> {
  success: boolean;
  data?:   T;
  error?:  string;
  meta?: {
    projectId?: string;
    timestamp:  string;
    cached?:    boolean;
  };
}
