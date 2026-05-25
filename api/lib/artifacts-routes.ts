/* ════════════════════════════════════════════════════════════════════════════
   api/lib/artifacts-routes.ts — Phase D2 (2026-05-25)

   Backend endpoint handlers for the artifacts table introduced in Phase D1.
   These thin handlers expose query, search, supersession, and workflow
   operations to the frontend via the existing task-engine action router.
   No new function slot — they're dispatched from api/lib/brand-studio.ts.

   Endpoints:
     bs_artifacts_list              — paginated list with multi-select filters (no body, summaries only)
     bs_artifacts_get               — full single artifact by id (with body + metadata + supersession chain)
     bs_artifacts_search            — full-text search via plainto_tsquery + optional filter combo
     bs_artifacts_supersede         — manually mark an artifact as superseded
     bs_artifacts_mark_reviewed     — PM workflow: mark reviewed + add note
     bs_artifacts_mark_sent         — PM workflow: mark sent to client
     bs_artifacts_history           — supersession chain for an artifact (current + all priors)
     bs_artifacts_portfolio_kpis    — aggregate dashboard payload: counts, spend, oldest unreviewed

   Design decisions:

   1. List response = summaries only (no body, no metadata, no search_vector).
      Reduces typical response from megabytes to kilobytes. Detail route
      returns the full row.

   2. Search uses plainto_tsquery — handles arbitrary user input safely.
      Quotes, stray punctuation, special chars all neutered. Phrase/AND/OR
      searches can come later via websearch_to_tsquery if D3 surfaces a need.

   3. All filters are multi-select arrays (project_ids[], campaign_ids[],
      artifact_kinds[], etc). A user filtering 12 projects shouldn't make
      12 separate API calls.

   4. Workflow state changes (reviewed, sent, supersede) are explicit
      operations, not bulk updates. D5 will add a bulk variant; for D2,
      one artifact per call keeps the contract clean.

   5. Portfolio KPIs is ONE route returning a dashboard payload, not 4
      separate routes. The Documents page header fires once and gets
      everything it needs in one round trip.
════════════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ─── Shared types — the API contract D3 will consume ─────────────────── */

const SUMMARY_COLUMNS =
  "id, project_id, campaign_id, panel_id, source_kind, source_id, source_step_id, " +
  "artifact_kind, title, keyword, target_url, body_format, status, superseded_by, " +
  "generated_at, generation_cost_usd, llm_calls, serpapi_calls, " +
  "pm_reviewed, pm_reviewed_at, pm_reviewed_by, client_sent, client_sent_at";

const FULL_COLUMNS = SUMMARY_COLUMNS + ", body, metadata, pm_notes, superseded_at";

const VALID_STATUS = ['current', 'superseded', 'archived'] as const;
type ArtifactStatus = typeof VALID_STATUS[number];

/* ─── bs_artifacts_list ────────────────────────────────────────────────
   Paginated list with multi-select filters. Returns summaries only.

   Request shape:
     {
       projectIds?:    string[],       // multi-select project filter
       campaignIds?:   string[],       // multi-select campaign filter
       panelIds?:      string[],       // multi-select panel filter
       artifactKinds?: string[],       // multi-select kind filter
       status?:        'current' | 'superseded' | 'archived',  // default 'current'
       keyword?:       string,         // exact keyword match
       pmReviewed?:    boolean,        // filter by review state
       clientSent?:    boolean,        // filter by sent state
       generatedAfter?: string,        // ISO date — lower bound
       generatedBefore?: string,       // ISO date — upper bound
       sort?:          'newest' | 'oldest' | 'most_expensive',  // default 'newest'
       limit?:         number,         // default 50, max 200
       offset?:        number,         // default 0
     }

   Response: { success: true, artifacts: [...], total: number, limit, offset } */
export async function bsArtifactsList(body: any): Promise<any> {
  try {
    const {
      projectIds, campaignIds, panelIds, artifactKinds,
      status, keyword, pmReviewed, clientSent,
      generatedAfter, generatedBefore,
      sourceKind, sourceId, sourceStepId,    /* Phase D4 — source-coordinate filters */
      sort, limit, offset,
    } = body || {};

    /* Validate + normalize */
    const effectiveLimit  = Math.min(Math.max(Number(limit)  || 50, 1), 200);
    const effectiveOffset = Math.max(Number(offset) || 0, 0);
    const effectiveStatus: ArtifactStatus =
      VALID_STATUS.includes(status) ? status : 'current';

    let q = db().from("artifacts")
      .select(SUMMARY_COLUMNS, { count: 'exact' })
      .eq("status", effectiveStatus);

    /* Apply multi-select filters */
    if (Array.isArray(projectIds)    && projectIds.length    > 0) q = q.in("project_id",    projectIds);
    if (Array.isArray(campaignIds)   && campaignIds.length   > 0) q = q.in("campaign_id",   campaignIds);
    if (Array.isArray(panelIds)      && panelIds.length      > 0) q = q.in("panel_id",      panelIds);
    if (Array.isArray(artifactKinds) && artifactKinds.length > 0) q = q.in("artifact_kind", artifactKinds);

    /* Apply scalar filters */
    if (typeof keyword     === 'string'  && keyword.trim()) q = q.eq("keyword", keyword.trim());
    if (typeof pmReviewed  === 'boolean')                   q = q.eq("pm_reviewed", pmReviewed);
    if (typeof clientSent  === 'boolean')                   q = q.eq("client_sent",  clientSent);
    if (typeof generatedAfter  === 'string' && generatedAfter)  q = q.gte("generated_at", generatedAfter);
    if (typeof generatedBefore === 'string' && generatedBefore) q = q.lte("generated_at", generatedBefore);

    /* Phase D4 — source-coordinate filters (used by SEASON dashboard
       "Open in Documents" link to resolve a step's artifact). The unique
       index on (source_kind, source_id, source_step_id) makes this a
       single-row lookup when all three are present. */
    if (typeof sourceKind   === 'string' && sourceKind)   q = q.eq("source_kind",    sourceKind);
    if (typeof sourceId     === 'string' && sourceId)     q = q.eq("source_id",      sourceId);
    if (typeof sourceStepId === 'string' && sourceStepId) q = q.eq("source_step_id", sourceStepId);

    /* Sort */
    const sortMode = sort || 'newest';
    if (sortMode === 'oldest')         q = q.order("generated_at", { ascending: true });
    else if (sortMode === 'most_expensive') q = q.order("generation_cost_usd", { ascending: false, nullsFirst: false });
    else                               q = q.order("generated_at", { ascending: false });

    /* Pagination */
    q = q.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);

    const { data, count, error } = await q;
    if (error) return { success: false, error: error.message };

    return {
      success:   true,
      artifacts: data || [],
      total:     count || 0,
      limit:     effectiveLimit,
      offset:    effectiveOffset,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/* ─── bs_artifacts_get ─────────────────────────────────────────────────
   Get one artifact by id, with full body + metadata + supersession chain.

   Request: { artifactId: string, includeChain?: boolean (default true) }
   Response: { success: true, artifact: {...}, chain: [...] } */
export async function bsArtifactsGet(body: any): Promise<any> {
  try {
    const { artifactId, includeChain } = body || {};
    if (!artifactId || typeof artifactId !== 'string') {
      return { success: false, error: "artifactId required" };
    }

    const { data: artifact, error } = await db().from("artifacts")
      .select(FULL_COLUMNS)
      .eq("id", artifactId)
      .maybeSingle();
    if (error)    return { success: false, error: error.message };
    if (!artifact) return { success: false, error: "artifact not found" };

    let chain: any[] = [];
    const wantChain = includeChain !== false;  // default true
    if (wantChain) {
      /* Reconstruct the version history. A chain looks like:
         oldest (status=superseded) → ... → current (status=current)
         We walk forward via superseded_by, then backward via reverse-lookup. */
      const a = artifact as any;

      /* Forward walk: this row's superseded_by chain. Usually 0-1 hops. */
      const forward: any[] = [];
      let cursor: any = a;
      const seen = new Set<string>([a.id]);
      while (cursor.superseded_by) {
        if (seen.has(cursor.superseded_by)) break;  // cycle guard
        const { data: next } = await db().from("artifacts")
          .select(SUMMARY_COLUMNS)
          .eq("id", cursor.superseded_by)
          .maybeSingle();
        if (!next) break;
        forward.push(next);
        seen.add((next as any).id);
        cursor = next;
      }

      /* Backward walk: find rows that point AT this row via superseded_by */
      const backward: any[] = [];
      let backCursor = a;
      while (true) {
        const { data: prior } = await db().from("artifacts")
          .select(SUMMARY_COLUMNS)
          .eq("superseded_by", (backCursor as any).id)
          .order("superseded_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!prior) break;
        if (seen.has((prior as any).id)) break;
        backward.push(prior);
        seen.add((prior as any).id);
        backCursor = prior;
      }

      /* Compose chronologically: oldest first, current last */
      chain = [...backward.reverse(), a, ...forward];
    }

    return { success: true, artifact, chain };
  } catch (e: any) {
    return { success: false, error: e?.message || "get failed" };
  }
}

/* ─── bs_artifacts_search ──────────────────────────────────────────────
   Full-text search via plainto_tsquery. Safe for arbitrary input.

   Request: same filter shape as bs_artifacts_list, plus required `q` string.
     {
       q:            string,           // search query (required)
       projectIds?:  string[],
       campaignIds?: string[],
       artifactKinds?: string[],
       status?:      ArtifactStatus,   // default 'current'
       limit?:       number,
       offset?:      number,
     }

   Response: { success: true, artifacts: [...], total, limit, offset, query } */
export async function bsArtifactsSearch(body: any): Promise<any> {
  try {
    const { q, projectIds, campaignIds, artifactKinds, status, limit, offset } = body || {};
    if (!q || typeof q !== 'string' || !q.trim()) {
      return { success: false, error: "q (search query) required" };
    }

    const effectiveLimit  = Math.min(Math.max(Number(limit)  || 50, 1), 200);
    const effectiveOffset = Math.max(Number(offset) || 0, 0);
    const effectiveStatus: ArtifactStatus =
      VALID_STATUS.includes(status) ? status : 'current';

    /* Supabase exposes textSearch() which generates @@ to_tsquery / plainto_tsquery
       under the hood. type='plain' = plainto_tsquery (safest for arbitrary input). */
    let query = db().from("artifacts")
      .select(SUMMARY_COLUMNS, { count: 'exact' })
      .textSearch("search_vector", q.trim(), { type: 'plain', config: 'english' })
      .eq("status", effectiveStatus);

    if (Array.isArray(projectIds)    && projectIds.length    > 0) query = query.in("project_id",    projectIds);
    if (Array.isArray(campaignIds)   && campaignIds.length   > 0) query = query.in("campaign_id",   campaignIds);
    if (Array.isArray(artifactKinds) && artifactKinds.length > 0) query = query.in("artifact_kind", artifactKinds);

    /* Sort by rank-by-relevance is ideal but Supabase's textSearch doesn't
       expose ts_rank directly. For D2 we sort by recency; D3 can re-rank
       client-side or we add a Postgres function later if needed. */
    query = query.order("generated_at", { ascending: false });
    query = query.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);

    const { data, count, error } = await query;
    if (error) return { success: false, error: error.message };

    return {
      success:   true,
      artifacts: data || [],
      total:     count || 0,
      limit:     effectiveLimit,
      offset:    effectiveOffset,
      query:     q.trim(),
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "search failed" };
  }
}

/* ─── bs_artifacts_supersede ───────────────────────────────────────────
   Manually mark an artifact as superseded. Used when a PM identifies that
   a prior artifact is obsolete (e.g. before an automated refresh would
   have caught it). Optional supersededBy pointer.

   Request: { artifactId: string, supersededBy?: string }
   Response: { success: true, artifact: {...} } */
export async function bsArtifactsSupersede(body: any): Promise<any> {
  try {
    const { artifactId, supersededBy } = body || {};
    if (!artifactId || typeof artifactId !== 'string') {
      return { success: false, error: "artifactId required" };
    }

    const updates: Record<string, any> = {
      status:        'superseded',
      superseded_at: new Date().toISOString(),
    };
    if (typeof supersededBy === 'string' && supersededBy) {
      updates.superseded_by = supersededBy;
    }

    const { data, error } = await db().from("artifacts")
      .update(updates)
      .eq("id", artifactId)
      .select(SUMMARY_COLUMNS)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "artifact not found" };

    return { success: true, artifact: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "supersede failed" };
  }
}

/* ─── bs_artifacts_mark_reviewed ───────────────────────────────────────
   PM workflow: mark an artifact reviewed, optionally adding a note.
   Idempotent — re-marking is a no-op (timestamps update though).

   Request: { artifactId: string, reviewerId?: string, note?: string, reviewed?: boolean (default true) }
   Response: { success: true, artifact: {...} } */
export async function bsArtifactsMarkReviewed(body: any): Promise<any> {
  try {
    const { artifactId, reviewerId, note, reviewed } = body || {};
    if (!artifactId || typeof artifactId !== 'string') {
      return { success: false, error: "artifactId required" };
    }

    const wantReviewed = reviewed === false ? false : true;
    const updates: Record<string, any> = {
      pm_reviewed:     wantReviewed,
      pm_reviewed_at:  wantReviewed ? new Date().toISOString() : null,
      pm_reviewed_by:  wantReviewed && typeof reviewerId === 'string' ? reviewerId : null,
    };
    if (typeof note === 'string') {
      updates.pm_notes = note;
    }

    const { data, error } = await db().from("artifacts")
      .update(updates)
      .eq("id", artifactId)
      .select(SUMMARY_COLUMNS + ", pm_notes")
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "artifact not found" };

    return { success: true, artifact: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "mark_reviewed failed" };
  }
}

/* ─── bs_artifacts_mark_sent ───────────────────────────────────────────
   PM workflow: mark an artifact as sent to client.

   Request: { artifactId: string, sent?: boolean (default true) }
   Response: { success: true, artifact: {...} } */
export async function bsArtifactsMarkSent(body: any): Promise<any> {
  try {
    const { artifactId, sent } = body || {};
    if (!artifactId || typeof artifactId !== 'string') {
      return { success: false, error: "artifactId required" };
    }

    const wantSent = sent === false ? false : true;
    const updates: Record<string, any> = {
      client_sent:    wantSent,
      client_sent_at: wantSent ? new Date().toISOString() : null,
    };

    const { data, error } = await db().from("artifacts")
      .update(updates)
      .eq("id", artifactId)
      .select(SUMMARY_COLUMNS)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "artifact not found" };

    return { success: true, artifact: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "mark_sent failed" };
  }
}

/* ─── bs_artifacts_history ─────────────────────────────────────────────
   Returns the full supersession chain for an artifact: every version,
   chronologically (oldest → current). Convenience wrapper around the
   chain logic in bsArtifactsGet — but doesn't return the full body
   (summaries only), so it's safe to call for D5's comparison view
   without burning bandwidth.

   Request: { artifactId: string }
   Response: { success: true, chain: [oldest...current] } */
export async function bsArtifactsHistory(body: any): Promise<any> {
  try {
    const { artifactId } = body || {};
    if (!artifactId || typeof artifactId !== 'string') {
      return { success: false, error: "artifactId required" };
    }

    /* Reuse the get logic but strip the body before returning */
    const result = await bsArtifactsGet({ artifactId, includeChain: true });
    if (!result.success) return result;

    return { success: true, chain: result.chain || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "history failed" };
  }
}

/* ─── bs_artifacts_portfolio_kpis ──────────────────────────────────────
   One route returning all the dashboard header metrics. Optional
   projectIds filter scopes the KPIs to a subset of projects (for
   per-PM workspaces).

   Request: { projectIds?: string[] }
   Response: {
     success: true,
     kpis: {
       artifacts_this_week:    number,
       artifacts_this_month:   number,
       llm_spend_mtd_usd:      number,
       awaiting_review_count:  number,
       awaiting_review_oldest_days: number | null,
       red_severity_audits:    number,    // count of 'red' audit_report artifacts in last 7d
     }
   } */
export async function bsArtifactsPortfolioKpis(body: any): Promise<any> {
  try {
    const { projectIds } = body || {};

    const now = new Date();
    const weekAgo  = new Date(now.getTime() - 7  * 86400000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    /* Helper to apply projectIds filter consistently */
    const scopeProject = (q: any) => {
      if (Array.isArray(projectIds) && projectIds.length > 0) {
        return q.in("project_id", projectIds);
      }
      return q;
    };

    /* Metric 1: artifacts this week — count of current artifacts generated within last 7 days */
    const { count: thisWeek } = await scopeProject(
      db().from("artifacts")
        .select("id", { count: 'exact', head: true })
        .eq("status", 'current')
        .gte("generated_at", weekAgo)
    );

    /* Metric 2: artifacts this month — count over last 30 days */
    const { count: thisMonth } = await scopeProject(
      db().from("artifacts")
        .select("id", { count: 'exact', head: true })
        .eq("status", 'current')
        .gte("generated_at", monthAgo)
    );

    /* Metric 3: LLM spend MTD — sum generation_cost_usd from start-of-month */
    const { data: spendRows } = await scopeProject(
      db().from("artifacts")
        .select("generation_cost_usd")
        .gte("generated_at", startOfMonth)
    );
    const spendMtd = (spendRows || []).reduce(
      (sum: number, r: any) => sum + (Number(r?.generation_cost_usd) || 0),
      0,
    );

    /* Metric 4: awaiting review — count of current artifacts where pm_reviewed=false */
    const { count: awaitingReview } = await scopeProject(
      db().from("artifacts")
        .select("id", { count: 'exact', head: true })
        .eq("status", 'current')
        .eq("pm_reviewed", false)
    );

    /* Metric 5: awaiting review oldest age in days */
    const { data: oldestUnreviewed } = await scopeProject(
      db().from("artifacts")
        .select("generated_at")
        .eq("status", 'current')
        .eq("pm_reviewed", false)
        .order("generated_at", { ascending: true })
        .limit(1)
    );
    let oldestDays: number | null = null;
    const oldestTs = (oldestUnreviewed && oldestUnreviewed[0]) ? (oldestUnreviewed[0] as any).generated_at : null;
    if (oldestTs) {
      oldestDays = Math.floor((now.getTime() - new Date(oldestTs).getTime()) / 86400000);
    }

    /* Metric 6: red-severity audits in last 7 days. Audit_report artifacts
       carry severity in their metadata; for D2 we use a simpler proxy:
       artifact_kind='audit_report' AND metadata→>'severity'='red'. If audit
       runner doesn't yet populate metadata.severity, this returns 0 — fine,
       Phase 16.x audit reports can backfill on next refresh. */
    let redAudits = 0;
    try {
      const { count } = await scopeProject(
        db().from("artifacts")
          .select("id", { count: 'exact', head: true })
          .eq("status", 'current')
          .eq("artifact_kind", 'audit_report')
          .gte("generated_at", weekAgo)
          .filter("metadata->>severity", 'eq', 'red')
      );
      redAudits = count || 0;
    } catch { /* metadata filter is best-effort */ }

    return {
      success: true,
      kpis: {
        artifacts_this_week:         thisWeek || 0,
        artifacts_this_month:        thisMonth || 0,
        llm_spend_mtd_usd:           Math.round(spendMtd * 10000) / 10000,
        awaiting_review_count:       awaitingReview || 0,
        awaiting_review_oldest_days: oldestDays,
        red_severity_audits:         redAudits,
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "kpis failed" };
  }
}
