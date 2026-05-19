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
        | 'sales' | 'client_note' | 'scope' | 'metric';
  refId?: string;     // row id in the source table, when applicable
  label:  string;     // human-readable description of the source
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
}
