/**
 * ◈ MANAV BRAIN — RUNTIME COMPILER
 *
 * Pre-flight validation system that:
 *  1. Validates every API call BEFORE it fires (static schema rules)
 *  2. Checks known failure patterns BEFORE the call reaches the server
 *  3. Records every failure to Supabase so it learns from repetition
 *  4. Surfaces live interception stats to the System tab in the Brain panel
 *
 * Usage:
 *   const rc = getRuntimeCompiler(supabaseClient);
 *   await rc.init();                            // once, on mount
 *   const check = rc.validate('/api/x', 'action', payload);
 *   if (check.blocked) { showError(check.warnings[0]); return; }
 *   ...execute call...
 *   rc.recordSuccess('/api/x', 'action');
 *   // on error:
 *   rc.recordFailure('/api/x', 'action', error.message, payload);
 */

import { SupabaseClient } from "@supabase/supabase-js";

/* ─────────────────────── Types ─────────────────────── */

export interface ValidationResult {
  ok: boolean;
  blocked: boolean;          // hard-block — required params missing
  warnings: string[];        // soft warnings — known failure patterns
  knownIssues: LearnedPattern[];
}

export interface LearnedPattern {
  endpoint:    string;
  action:      string;
  errorMsg:    string;
  occurrences: number;
  lastSeen:    string;       // ISO
  suggestedFix?: string;
}

interface CompilerStats {
  checksThisSession:     number;
  interceptionsThisSession: number;
  patternCount:          number;
  lastCheck:             Date | null;
}

/* ─────────────────────── Static Validation Rules ─────────────────────── */
// If required fields are absent, the call is BLOCKED before fetch even fires.

interface ValidationRule {
  requiredFields: string[];
  notes?:         string;
}

const STATIC_RULES: Record<string, Record<string, ValidationRule>> = {
  "/api/market-researcher": {
    build_persona:         { requiredFields: ["projectId"], notes: "projectId is mandatory — persona is project-specific" },
    suggest_goals:         { requiredFields: ["projectId"], notes: "projectId required to build goal plan for this project" },
    cross_project_patterns:{ requiredFields: ["industry"],  notes: "industry string required for pattern synthesis" },
    research_market:       { requiredFields: ["projectId"], notes: "projectId required for market research context" },
  },
  "/api/algorithm-intel": {
    fetch_topic:   { requiredFields: ["topicId"],   notes: "topicId is required to fetch specific algorithm intel" },
    save_intel:    { requiredFields: ["title"],      notes: "title is required when saving algorithm intel" },
  },
  "/api/intelligence": {
    analyze:       { requiredFields: ["query"],      notes: "query string is required for intelligence analysis" },
  },
  "/api/task-engine": {
    create_task:   { requiredFields: ["project_id", "card_type", "card_title"], notes: "task creation requires project_id, card_type, and card_title" },
    get_all_learnings: { requiredFields: ["project_id"], notes: "project_id required to load learnings" },
    save_learning: { requiredFields: ["project_id"], notes: "project_id required to save a learning" },
  },
  "/api/control": {
    get_context:   { requiredFields: ["projectId"],  notes: "projectId required to load project context" },
    save_context:  { requiredFields: ["projectId"],  notes: "projectId required to save project context" },
  },
};

/* ─────────────────────── Singleton ─────────────────────── */

let _instance: RuntimeCompiler | null = null;

export function getRuntimeCompiler(sb?: SupabaseClient): RuntimeCompiler {
  if (!_instance) {
    _instance = new RuntimeCompiler(sb ?? null);
  } else if (sb && !_instance.sb) {
    _instance.sb = sb;
  }
  return _instance;
}

/* ─────────────────────── RuntimeCompiler Class ─────────────────────── */

export class RuntimeCompiler {
  sb: SupabaseClient | null;
  private patterns: LearnedPattern[] = [];
  private initialized = false;
  private stats: CompilerStats = {
    checksThisSession: 0,
    interceptionsThisSession: 0,
    patternCount: 0,
    lastCheck: null,
  };
  private listeners: Array<(stats: CompilerStats) => void> = [];

  constructor(sb: SupabaseClient | null) {
    this.sb = sb;
  }

  /* ── init: load learned patterns from Supabase once ── */
  async init(): Promise<void> {
    if (this.initialized || !this.sb) return;
    this.initialized = true;
    try {
      const { data } = await this.sb
        .from("brain_learnings")
        .select("card_title, what_missed, context_summary, tags, updated_at")
        .eq("source", "runtime_compiler")
        .order("updated_at", { ascending: false })
        .limit(200);

      if (data) {
        const map = new Map<string, LearnedPattern>();
        for (const row of data) {
          // card_title = "RC: /api/x :: action_name"
          const key = (row.card_title || "").replace(/^RC:\s*/, "").trim();
          const [endpoint, action] = key.split(" :: ");
          if (!endpoint || !action) continue;
          const errorMsg = (row.what_missed || [])[0] || "unknown error";
          const fix = (row.what_missed || [])[1] || "";
          // Count occurrences by checking context_summary
          const ctx: string = row.context_summary || "";
          const occMatch = ctx.match(/occurrences:\s*(\d+)/);
          const occurrences = occMatch ? parseInt(occMatch[1], 10) : 1;
          const k = `${endpoint}::${action}`;
          const existing = map.get(k);
          if (!existing || occurrences > existing.occurrences) {
            map.set(k, {
              endpoint, action, errorMsg,
              occurrences,
              lastSeen: row.updated_at || new Date().toISOString(),
              suggestedFix: fix || undefined,
            });
          }
        }
        this.patterns = Array.from(map.values()).sort((a, b) => b.occurrences - a.occurrences);
        this.stats.patternCount = this.patterns.length;
        this._notify();
      }
    } catch (_e) {
      // silent — compiler degrades gracefully if DB unavailable
    }
  }

  /* ── validate: pre-flight check ── */
  validate(endpoint: string, action: string, payload: Record<string, any>): ValidationResult {
    this.stats.checksThisSession++;
    this.stats.lastCheck = new Date();
    const warnings: string[] = [];
    const knownIssues: LearnedPattern[] = [];
    let blocked = false;

    // 1) Static schema check
    const rule = STATIC_RULES[endpoint]?.[action];
    if (rule) {
      for (const field of rule.requiredFields) {
        const val = payload[field];
        const missing = val === undefined || val === null || val === "";
        if (missing) {
          blocked = true;
          warnings.push(`BLOCKED: "${field}" is required for ${action} (${rule.notes || ""})`);
        }
      }
    }

    // 2) Known failure pattern check
    const matching = this.patterns.filter(
      p => p.endpoint === endpoint && p.action === action,
    );
    if (matching.length > 0) {
      for (const p of matching) {
        knownIssues.push(p);
        if (p.occurrences >= 3) {
          warnings.push(
            `⚠ KNOWN ISSUE (${p.occurrences}× seen): ${p.errorMsg}` +
            (p.suggestedFix ? ` — Fix: ${p.suggestedFix}` : ""),
          );
        }
      }
    }

    if (warnings.length > 0) this.stats.interceptionsThisSession++;
    this._notify();

    return { ok: !blocked, blocked, warnings, knownIssues };
  }

  /* ── recordFailure: called after a real error ── */
  async recordFailure(
    endpoint: string,
    action: string,
    errorMsg: string,
    payload?: Record<string, any>,
    suggestedFix?: string,
  ): Promise<void> {
    // Update in-memory pattern
    const key = `${endpoint}::${action}`;
    const existing = this.patterns.find(p => p.endpoint === endpoint && p.action === action && p.errorMsg === errorMsg);
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date().toISOString();
      if (suggestedFix) existing.suggestedFix = suggestedFix;
    } else {
      this.patterns.unshift({
        endpoint, action, errorMsg,
        occurrences: 1,
        lastSeen: new Date().toISOString(),
        suggestedFix,
      });
    }
    this.stats.patternCount = this.patterns.length;
    this._notify();

    // Persist to Supabase
    if (!this.sb) return;
    try {
      const occurrences = existing ? existing.occurrences : 1;
      const payloadSummary = payload
        ? Object.keys(payload).filter(k => k !== "existingPersona").join(", ")
        : "";

      const row: any = {
        card_type: "technical",
        card_title: `RC: ${endpoint} :: ${action}`,
        what_missed: [
          errorMsg,
          suggestedFix || "",
        ].filter(Boolean),
        what_worked: [],
        improvement: suggestedFix || `Investigate: ${errorMsg.slice(0, 200)}`,
        context_summary: `Runtime Compiler pattern — occurrences: ${occurrences} — payload keys: [${payloadSummary}] — last seen: ${new Date().toISOString()}`,
        tags: ["runtime_compiler", endpoint.replace(/\//g, "_"), action, "auto_captured"],
        source: "runtime_compiler",
        applied_count: occurrences,
        updated_at: new Date().toISOString(),
      };

      // Upsert by matching card_title
      const { data: existing_rows } = await this.sb
        .from("brain_learnings")
        .select("id")
        .eq("source", "runtime_compiler")
        .eq("card_title", row.card_title)
        .limit(1);

      if (existing_rows && existing_rows.length > 0) {
        await this.sb.from("brain_learnings").update(row).eq("id", existing_rows[0].id);
      } else {
        try {
          await this.sb.from("brain_learnings").insert({
            ...row, status: "active", auto_captured: true, confidence_score: 99,
          });
        } catch (_e) {
          await this.sb.from("brain_learnings").insert(row);
        }
      }
    } catch (_e) {
      // silent
    }
  }

  /* ── recordSuccess: clear/reduce failure count for a pattern ── */
  recordSuccess(endpoint: string, action: string): void {
    const p = this.patterns.find(p => p.endpoint === endpoint && p.action === action);
    if (p && p.occurrences > 0) {
      // Don't erase history, just note it worked this time
      // The pattern stays so we know it HAS failed before
    }
    this._notify();
  }

  /* ── Stats accessors ── */
  getStats(): CompilerStats {
    return { ...this.stats };
  }

  getPatterns(): LearnedPattern[] {
    return [...this.patterns];
  }

  getTopPatterns(n = 5): LearnedPattern[] {
    return this.patterns.slice(0, n);
  }

  /* ── Listeners for UI reactivity ── */
  subscribe(fn: (stats: CompilerStats) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private _notify() {
    const s = this.getStats();
    this.listeners.forEach(fn => { try { fn(s); } catch (_e) {} });
  }
}
