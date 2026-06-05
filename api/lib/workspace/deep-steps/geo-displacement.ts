/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/deep-steps/geo-displacement.ts

   BUILD 12.20 — DEEP STEP — Competitor citation displacement + future
   AI Overview emergence detection.

   Two related forward-looking GEO capabilities in one deep step:

   1. DISPLACEMENT — aggregate AI Overview citations across the project's
      target queries to identify which competitor domains hold the citation
      slots. Ranks competitors by citation count, computes citation share,
      and produces a displacement priority list with realistic estimates.

   2. EMERGENCE — read the gsc_search_appearance history captured by pm-gsc
      (Build 12.20 history capture) and compare the latest snapshot to the
      prior one. Identify AI Overview surfaces that emerged this period —
      these are the leading indicator before classic CTR collapse.

   Both capabilities are project-agnostic. Takes projectId +
   targetKeywords (or falls back to top GSC queries when keywords absent).
════════════════════════════════════════════════════════════════ */

import { db } from "../../db.js";
import { loadGsc, type SourcedFact } from "../shared.js";
import { runDisplacementAnalysis, detectFutureAiOverview, type DisplacementReport, type FutureAiOverviewSignal } from "../../geo-displacement.js";

const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export interface GeoDisplacementEvidence {
  step_key: "geo_displacement";
  generated_at: string;
  project_domain: string;
  displacement: DisplacementReport | null;
  emergence: FutureAiOverviewSignal[] | null;
  provenance: SourcedFact[];
  worth_deeper: string[];
}

export async function gatherGeoDisplacement(opts: {
  projectId:       string;
  targetUrls:      string[];
  targetKeywords?: string[];
}): Promise<{ evidence: GeoDisplacementEvidence; report_md: string }> {
  const now = new Date().toISOString();
  const { projectId, targetUrls, targetKeywords } = opts;
  const projectDomain = domainOf(targetUrls[0] || "");
  const provenance: SourcedFact[] = [];

  /* Resolve the query set: prefer explicitly-supplied targetKeywords;
     fall back to top GSC queries by impressions when not supplied. */
  let queries: string[] = (targetKeywords || []).map(k => String(k).trim()).filter(Boolean);
  if (queries.length === 0) {
    const gsc = await loadGsc(projectId);
    queries = gsc.topQueries
      .filter((q: any) => q.query && Number(q.impressions || 0) > 0)
      .sort((a: any, b: any) => Number(b.impressions || 0) - Number(a.impressions || 0))
      .slice(0, 20)
      .map((q: any) => String(q.query));
    if (queries.length > 0) {
      provenance.push({ value: queries.length, source: "GSC top queries", fetched_at: gsc.fetchedAt, note: "fallback when targetKeywords not supplied" });
    }
  } else {
    provenance.push({ value: queries.length, source: "operator-supplied target keywords", fetched_at: now });
  }

  /* ── 1. DISPLACEMENT ANALYSIS ─────────────────────────────────── */
  let displacement: DisplacementReport | null = null;
  if (queries.length > 0) {
    displacement = await runDisplacementAnalysis({ projectId, projectDomain, queries });
    provenance.push({
      value: displacement.queries_analyzed,
      source: "SerpAPI",
      fetched_at: displacement.generated_at,
      note: "citation list extraction across query set",
    });
  }

  /* ── 2. EMERGENCE DETECTION ───────────────────────────────────── */
  let emergence: FutureAiOverviewSignal[] | null = null;
  try {
    const { data } = await db()
      .from("project_knowledge")
      .select("field_value, updated_at")
      .eq("project_id", projectId)
      .eq("category", "analytics")
      .eq("field_key", "gsc_search_appearance_history")
      .maybeSingle();
    const raw = (data as any)?.field_value;
    if (raw) {
      const history = JSON.parse(raw);
      if (Array.isArray(history) && history.length >= 2) {
        /* Latest = last item; prior = second-to-last */
        const latest = history[history.length - 1];
        const prior  = history[history.length - 2];
        emergence = detectFutureAiOverview({
          currentSearchAppearance: latest?.appearances || null,
          priorSearchAppearance:   prior?.appearances || null,
        });
        provenance.push({
          value: `${prior?.captured_at?.slice(0, 10)} → ${latest?.captured_at?.slice(0, 10)}`,
          source: "GSC searchAppearance history",
          fetched_at: latest?.captured_at || now,
          note: `comparing ${history.length}-entry history`,
        });
      }
    }
  } catch (e) {
    /* History capture may not yet exist on projects that haven't had a
       post-Build 12.20 pull. Honest negative result. */
  }

  /* Worth-deeper signals */
  const worth_deeper: string[] = [];
  if (!displacement) {
    worth_deeper.push("Displacement analysis could not run — no target queries supplied and no GSC top queries available. Supply target keywords or run a GSC pull first.");
  } else if (displacement.competitors.length === 0 && displacement.total_citation_slots === 0) {
    worth_deeper.push("No AI Overview citations detected across the analyzed queries — niche is still classic SEO territory. Re-run in 6-12 weeks as AI Overview rollout continues.");
  } else if (displacement.competitors.length > 0) {
    const directCandidates = displacement.competitors.filter(c => c.displacement.project_ranks_top_10 > 0);
    if (directCandidates.length > 0) {
      worth_deeper.push(`${directCandidates.length} competitor ${directCandidates.length === 1 ? "domain" : "domains"} have queries where you already rank top-10 but are not cited. These are immediate displacement targets — run the citation gap analysis on the top 3-5 most-impacted queries.`);
    }
  }
  if (!emergence) {
    worth_deeper.push("Future-AI-Overview emergence detection requires at least 2 historical GSC searchAppearance snapshots. The first snapshot was captured this period — re-run the workspace after the next GSC pull to enable emergence detection.");
  } else if (emergence.length === 0) {
    worth_deeper.push("No AI Overview surface emergence detected in the comparison window. Surface stability suggests Google has not adjusted AI Overview triggering for this site's queries recently.");
  } else {
    const newSurfaces = emergence.filter(e => e.previously_zero);
    if (newSurfaces.length > 0) {
      worth_deeper.push(`${newSurfaces.length} AI Overview surface(s) emerged this period — this is the leading indicator. Take action in the next 4-8 weeks before classic CTR begins shifting for affected queries.`);
    }
  }

  const evidence: GeoDisplacementEvidence = {
    step_key: "geo_displacement",
    generated_at: now,
    project_domain: projectDomain,
    displacement,
    emergence,
    provenance,
    worth_deeper,
  };

  /* Build 12.21 — persist a compact summary to project_knowledge so the
     scenario engine can fire geo:ai_overview_displaced and
     geo:ai_overview_strong triggers without re-running SerpAPI. The
     summary is small (citation share + top 3 competitors + emergence
     flag) and the field overwrites on each run so storage stays bounded.
     Failure is non-fatal — trigger firing degrades gracefully. */
  if (displacement) {
    try {
      const summary = {
        captured_at: now,
        queries_analyzed: displacement.queries_analyzed,
        project_citation_count: displacement.project_citation_count,
        project_citation_share_pct: displacement.project_citation_share_pct,
        total_citation_slots: displacement.total_citation_slots,
        top_competitors: displacement.competitors.slice(0, 3).map(c => ({
          domain: c.domain,
          citation_count: c.citation_count,
          citation_share_pct: c.citation_share_pct,
          project_ranks_top_10: c.displacement.project_ranks_top_10,
        })),
        emergence_signal_count: emergence?.filter(e => e.previously_zero).length || 0,
      };
      await db().from("project_knowledge")
        .upsert({
          project_id: projectId,
          category:   "analytics",
          field_key:  "geo_displacement_summary",
          field_value: JSON.stringify(summary),
          source:     "geo_displacement_deep_step",
          source_name: "GEO Displacement Analysis",
          data_date: now.slice(0, 10),
          updated_at: now,
        }, { onConflict: "project_id,category,field_key" });
    } catch (e) {
      /* Best-effort — failure doesn't block the deep-step output */
      console.warn("[geo_displacement] summary persist failed:", (e as any)?.message || e);
    }
  }

  return { evidence, report_md: renderReport(evidence) };
}

function renderReport(e: GeoDisplacementEvidence): string {
  const L: string[] = [];
  L.push(`# GEO Displacement & Future-AI-Overview Detection`);
  L.push(``);
  L.push(`_Generated ${new Date(e.generated_at).toLocaleString()}. Forward-looking GEO analysis: who holds your citation slots now, and what AI surfaces are emerging on your tracked queries. Acted on in the next 4-8 weeks, this is the highest-leverage GEO intelligence the platform produces._`);
  L.push(``);

  /* ── DISPLACEMENT ───────────────────────────────────────────── */
  L.push(`## Citation Displacement Snapshot`);
  L.push(``);
  if (!e.displacement) {
    L.push(`_Displacement analysis did not run. ${e.worth_deeper[0] || "Insufficient data."}_`);
    L.push(``);
  } else {
    const d = e.displacement;
    L.push(`**Narrative:** ${d.narrative}`);
    L.push(``);
    L.push(`- **Project domain:** ${d.project_domain}`);
    L.push(`- **Queries analyzed:** ${d.queries_analyzed}`);
    L.push(`- **Total citation slots observed:** ${d.total_citation_slots}`);
    L.push(`- **Your citations:** ${d.project_citation_count} (${d.project_citation_share_pct}% of slots)`);
    L.push(``);

    if (d.competitors.length > 0) {
      L.push(`### Top competitors by citation count`);
      L.push(``);
      L.push(`| Domain | Citations | Share | Project top-10 | Displaceable estimate |`);
      L.push(`| --- | --- | --- | --- | --- |`);
      for (const c of d.competitors) {
        L.push(`| ${c.domain} | ${c.citation_count} | ${c.citation_share_pct}% | ${c.displacement.project_ranks_top_10} | ${c.displacement.estimated_displaceable} |`);
      }
      L.push(``);

      L.push(`### Per-competitor displacement paths`);
      L.push(``);
      for (const c of d.competitors.slice(0, 8)) {
        L.push(`**${c.domain}** — cited on ${c.citation_count} ${c.citation_count === 1 ? "query" : "queries"} (${c.citation_share_pct}% share)`);
        L.push(`- Path: ${c.displacement.primary_path}`);
        if (c.cited_queries.length > 0) {
          L.push(`- Cited for: ${c.cited_queries.slice(0, 6).join(", ")}${c.cited_queries.length > 6 ? "…" : ""}`);
        }
        L.push(``);
      }
    } else {
      L.push(`_No competitor citations detected across analyzed queries._`);
      L.push(``);
    }

    if (d.project_cited_queries.length > 0) {
      L.push(`### Your existing citations (defenders)`);
      L.push(``);
      L.push(`_These queries cite your site in AI Overview. Document the patterns on these pages and replicate site-wide:_`);
      for (const q of d.project_cited_queries.slice(0, 10)) L.push(`- "${q}"`);
      if (d.project_cited_queries.length > 10) L.push(`- _… and ${d.project_cited_queries.length - 10} more_`);
      L.push(``);
    }

    if (d.recommended_priorities.length > 0) {
      L.push(`### Recommended priority order`);
      for (const p of d.recommended_priorities) L.push(`- ${p}`);
      L.push(``);
    }
  }

  /* ── EMERGENCE ──────────────────────────────────────────────── */
  L.push(`## Future-AI-Overview Surface Emergence`);
  L.push(``);
  if (!e.emergence) {
    L.push(`_Emergence detection requires at least 2 historical GSC searchAppearance snapshots (captured automatically by GSC pulls from Build 12.20 onward). First snapshot was captured this period — re-run the workspace after the next pull to enable comparison._`);
    L.push(``);
  } else if (e.emergence.length === 0) {
    L.push(`_No AI Overview surface activity detected in this comparison window. Stable state — surface presence unchanged._`);
    L.push(``);
  } else {
    L.push(`| Surface | Status | Prior impr | Current impr | Delta | Recommendation |`);
    L.push(`| --- | --- | --- | --- | --- | --- |`);
    for (const s of e.emergence) {
      const status = s.previously_zero
        ? "**EMERGED**"
        : (s.delta_pct !== null && s.delta_pct >= 50)
          ? "Growing"
          : (s.delta_pct !== null && s.delta_pct <= -30)
            ? "Contracting"
            : "Stable";
      L.push(`| ${s.surface_type} | ${status} | ${s.prior_impressions} | ${s.current_impressions} | ${s.delta_pct == null ? "n/a" : `${s.delta_pct > 0 ? "+" : ""}${s.delta_pct}%`} | ${s.recommendation} |`);
    }
    L.push(``);
  }

  /* ── WORTH DEEPER + PROVENANCE ─────────────────────────────── */
  if (e.worth_deeper.length > 0) {
    L.push(`## Worth investigating further`);
    for (const w of e.worth_deeper) L.push(`- ${w}`);
    L.push(``);
  }

  L.push(`## Provenance`);
  for (const f of e.provenance) {
    L.push(`- ${f.source}: ${typeof f.value === "number" ? f.value : JSON.stringify(f.value)}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  }

  return L.join("\n");
}
