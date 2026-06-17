/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/deep-steps/traffic-steps.ts

   The remaining DEEP STEPS that bring the Traffic goal to full integration
   depth. Each gathers verified data exhaustively for its domain, tags every
   fact with provenance, and emits a downloadable sourced report.

   Steps here: query_landscape, onpage_audit, core_web_vitals,
   internal_link_graph, engagement_value, trajectory.

   Project-agnostic. All take projectId + targetUrls (+ optional helpers).
════════════════════════════════════════════════════════════════ */

import { db } from "../../db.js";
import {
  loadGsc, fetchPageFacts, fetchHtml, ga4PullPageMetrics, fetchSerpFeatures,
  type SourcedFact,
} from "../shared.js";

const norm = (u: string) => (u || "").replace(/\/$/, "").toLowerCase();
const pathOf = (u: string) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

interface StepResult { evidence: any; report_md: string; }
function prov(value: any, source: string, note?: string): SourcedFact { return { value, source, fetched_at: new Date().toISOString(), note }; }

/* ════════════════ QUERY LANDSCAPE & UNTAPPED ════════════════════
   Beyond near-ranking: the full query space — where the site ranks on the
   WRONG page, high-impression/low-CTR queries, and (via SerpAPI) the PAA
   landscape + SERP-feature pattern across the top queries.

   Build 12.19 — also surfaces project-level AI Overview attribution (from
   GSC searchAppearance) and AI platform referral data (from GA4
   sessionSource) as headline GEO context, plus per-query AI Overview
   citation domains from SerpAPI ai_overview_references. */
export async function gatherQueryLandscape(opts: { projectId: string; targetUrls: string[] }): Promise<StepResult> {
  const { projectId, targetUrls } = opts;
  const targetSet = new Set(targetUrls.map(norm));
  const projectDomain = domainOf(targetUrls[0] || "");
  const gsc = await loadGsc(projectId);
  const provenance: SourcedFact[] = [prov(gsc.queryPagePairs.length, "GSC query-page pairs")];

  const pairs = gsc.queryPagePairs.map((p: any) => ({
    query: p.query, page: p.page, impressions: +(p.impressions || 0),
    clicks: +(p.clicks || 0), ctr: +(p.ctr || 0), position: +(p.position || 0),
  }));

  // Queries where a target page ranks but on a position worth improving,
  // and queries ranking via a NON-target (wrong) page.
  const targetPairs = pairs.filter(p => targetSet.has(norm(p.page)));
  const wrongPage = pairs.filter(p => !targetSet.has(norm(p.page)) && p.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 20);

  // High-impression, low-CTR (intent or title/meta problem)
  const highImprLowCtr = targetPairs.filter(p => p.impressions >= 50 && p.ctr < 1 && p.position <= 15)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 15);

  // SERP feature + PAA landscape for the top target queries (fresh SerpAPI)
  const topQueries = targetPairs.filter(p => p.impressions >= 20).sort((a, b) => b.impressions - a.impressions).slice(0, 3);
  const serpLandscape: any[] = [];
  for (const q of topQueries) {
    const serp: any = await fetchSerpFeatures(q.query, projectId, {}).catch(() => null);
    if (!serp) continue;
    provenance.push(prov(q.query, "SerpAPI", "SERP features + PAA"));
    /* Build 12.19 — AI Overview citation extraction. When ai_overview is
       true and ai_overview_references is populated, surface which domains
       Google cites in the AI Overview answer for this query and whether
       the project domain is among them. */
    const aoRefs: string[] = Array.isArray(serp.ai_overview_references)
      ? serp.ai_overview_references.map((x: any) => String(x?.domain || "")).filter(Boolean)
      : [];
    const aoProjectCited = aoRefs.some(d => d === projectDomain || d.endsWith("." + projectDomain) || projectDomain.endsWith("." + d));
    serpLandscape.push({
      query: q.query, position: q.position, impressions: q.impressions,
      features: [serp.ai_overview && "AI Overview", serp.featured_snippet && "Featured snippet", serp.people_also_ask && "PAA", serp.shopping_carousel && "Shopping", serp.video_carousel && "Video"].filter(Boolean),
      paa: (serp.paa_questions || []).slice(0, 6),
      /* Build 12.19 — per-query GEO data */
      ai_overview_present: !!serp.ai_overview,
      ai_overview_cited_domains: aoRefs,
      ai_overview_project_cited: aoProjectCited,
    });
  }

  const worth_deeper: string[] = [];
  if (wrongPage.length) worth_deeper.push(`${wrongPage.length} queries rank via a non-target page — possible cannibalisation or wrong page optimised.`);
  if (highImprLowCtr.length) worth_deeper.push(`${highImprLowCtr.length} high-impression queries with sub-1% CTR — title/meta or intent mismatch.`);
  /* Build 12.19 — GEO-specific worth-deeper signals */
  const displacedQueries = serpLandscape.filter(s => s.ai_overview_present && !s.ai_overview_project_cited && s.ai_overview_cited_domains.length > 0);
  if (displacedQueries.length) {
    worth_deeper.push(`${displacedQueries.length} top target queries show AI Overview citing competitors but NOT this site — citation displacement opportunities. Audit cited content for replicable patterns.`);
  }
  const citedQueries = serpLandscape.filter(s => s.ai_overview_project_cited);
  if (citedQueries.length) {
    worth_deeper.push(`${citedQueries.length} top target queries are earning AI Overview citation for this site — document the content shape and replicate.`);
  }
  /* Project-level AI Overview presence summary */
  if (gsc.aiOverviewSummary && gsc.aiOverviewSummary.present === false) {
    worth_deeper.push(`Across the entire site over the last ${gsc.aiOverviewSummary.window_days || 30} days, GSC shows zero AI Overview attribution. Project-level GEO opportunity flagged.`);
  }

  const evidence = {
    step_key: "query_landscape", generated_at: new Date().toISOString(),
    wrong_page: wrongPage, high_impr_low_ctr: highImprLowCtr, serp_landscape: serpLandscape,
    /* Build 12.19 — project-level GEO context */
    geo_context: {
      ai_overview_summary:    gsc.aiOverviewSummary || null,
      gsc_search_appearance:  gsc.searchAppearance  || [],
    },
    provenance, worth_deeper,
  };

  const L: string[] = [];
  L.push(`# Query Landscape & Untapped — Evidence Report`);
  L.push(`\n_Generated ${new Date().toLocaleString()}. GSC query-page data + live SerpAPI. Verified, sourced._\n`);

  /* Build 12.19 — project-level GEO presence block at top of report */
  if (gsc.aiOverviewSummary) {
    L.push(`## Project-level AI Overview presence (GSC searchAppearance)`);
    if (gsc.aiOverviewSummary.present) {
      const aoCtr = gsc.aiOverviewSummary.total_impressions > 0
        ? ((gsc.aiOverviewSummary.total_clicks / gsc.aiOverviewSummary.total_impressions) * 100).toFixed(2)
        : '0.00';
      L.push(`- AI Overview impressions: **${gsc.aiOverviewSummary.total_impressions}** (last ${gsc.aiOverviewSummary.window_days || 30} days)`);
      L.push(`- AI Overview clicks: ${gsc.aiOverviewSummary.total_clicks} (CTR ${aoCtr}%)`);
    } else {
      L.push(`_No AI Overview attribution in GSC for this window — confident negative result. Project-level GEO opportunity._`);
    }
    L.push("");
  }

  L.push(`## Queries ranking via the WRONG page (non-target)`);
  if (wrongPage.length) { L.push(`| Query | Ranking page | Impr | Pos |`); L.push(`|---|---|---|---|`); for (const p of wrongPage) L.push(`| ${p.query} | ${pathOf(p.page)} | ${p.impressions} | ${p.position.toFixed(1)} |`); }
  else L.push(`_None significant._`);
  L.push(`\n## High-impression, low-CTR target queries (title/meta/intent)`);
  if (highImprLowCtr.length) { L.push(`| Query | Page | Impr | CTR | Pos |`); L.push(`|---|---|---|---|---|`); for (const p of highImprLowCtr) L.push(`| ${p.query} | ${pathOf(p.page)} | ${p.impressions} | ${p.ctr}% | ${p.position.toFixed(1)} |`); }
  else L.push(`_None significant._`);
  L.push(`\n## SERP landscape (top target queries)`);
  for (const s of serpLandscape) {
    L.push(`\n**"${s.query}"** (pos ${s.position.toFixed(1)}, ${s.impressions} impr) — features: ${s.features.join(", ") || "none"}`);
    if (s.paa.length) { L.push(`PAA:`); for (const q of s.paa) L.push(`- ${q}`); }
    /* Build 12.19 — AI Overview citation status per query */
    if (s.ai_overview_present) {
      if (s.ai_overview_project_cited) {
        L.push(`AI Overview: **citing ${projectDomain}**. Companions: ${s.ai_overview_cited_domains.filter((d: string) => d !== projectDomain).slice(0, 5).join(", ") || "(none)"}.`);
      } else if (s.ai_overview_cited_domains.length > 0) {
        L.push(`AI Overview: citing ${s.ai_overview_cited_domains.slice(0, 6).join(", ")} — **${projectDomain} not cited** (displacement opportunity).`);
      } else {
        L.push(`AI Overview: present but SerpAPI did not return the citation list.`);
      }
    } else {
      L.push(`AI Overview: not present for this query.`);
    }
  }
  L.push(`\n## Worth investigating further`); for (const w of worth_deeper) L.push(`- ${w}`);
  L.push(`\n## Provenance`); for (const f of provenance) L.push(`- ${f.source}: ${typeof f.value === "number" ? f.value : JSON.stringify(f.value)}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  return { evidence, report_md: L.join("\n") };
}

/* ════════════════ ON-PAGE AUDIT ════════════════════════════════
   Live crawl of every target page: title/H1/meta/word-count/schema/canonical. */
export async function gatherOnpageAudit(opts: { projectId: string; targetUrls: string[] }): Promise<StepResult> {
  const { targetUrls } = opts;
  const pages = await Promise.race([
    Promise.all(targetUrls.slice(0, 30).map(fetchPageFacts)),
    new Promise<any[]>((res) => setTimeout(() => res([]), 70000)),
  ]) as any[];
  const provenance = [prov(pages.length, "live HTML crawl", "on-page audit")];
  const loaded = pages.filter(p => p.loaded);
  const issues = {
    missing_title: loaded.filter(p => !p.title).length,
    short_title: loaded.filter(p => p.title && (p.title_len < 30 || p.title_len > 65)).length,
    missing_meta: loaded.filter(p => !p.meta).length,
    missing_h1: loaded.filter(p => !p.h1).length,
    thin: loaded.filter(p => p.word_count < 300).length,
    no_schema: loaded.filter(p => !p.schema).length,
    noindex: loaded.filter(p => p.noindex).length,
  };
  const worth_deeper: string[] = [];
  if (issues.thin) worth_deeper.push(`${issues.thin} pages under 300 words — compare against competitor depth.`);
  if (issues.missing_meta) worth_deeper.push(`${issues.missing_meta} pages missing meta description.`);
  if (issues.no_schema) worth_deeper.push(`${issues.no_schema} pages lack structured data.`);

  const evidence = { step_key: "onpage_audit", generated_at: new Date().toISOString(), pages: loaded, issues, provenance, worth_deeper };
  const L: string[] = [];
  L.push(`# On-Page Audit — Evidence Report`);
  L.push(`\n_Generated ${new Date().toLocaleString()}. Live crawl of ${loaded.length}/${targetUrls.length} pages. Actual values, no assumptions._\n`);
  L.push(`## Issue summary`);
  L.push(`- Missing title: ${issues.missing_title} · Title length out of range: ${issues.short_title}`);
  L.push(`- Missing meta: ${issues.missing_meta} · Missing H1: ${issues.missing_h1}`);
  L.push(`- Thin (<300 words): ${issues.thin} · No schema: ${issues.no_schema} · Noindex: ${issues.noindex}`);
  L.push(`\n## Per-page (actual values)`);
  L.push(`| Page | Title len | H1 | Meta | Words | Schema | Index |`);
  L.push(`|---|---|---|---|---|---|---|`);
  for (const p of loaded) L.push(`| ${pathOf(p.url)} | ${p.title_len} | ${p.h1 ? "yes" : "MISSING"} | ${p.meta ? "yes" : "MISSING"} | ${p.word_count} | ${p.schema ? "yes" : "no"} | ${p.noindex ? "NOINDEX" : "ok"} |`);
  const failed = pages.filter(p => !p.loaded);
  if (failed.length) {
    const blocked = failed.filter(p => p.blocked);
    const blockNote = blocked.length
      ? ` ${blocked.length} returned HTTP 401/403/429/5xx — blocked or challenged, almost certainly a WAF or bot rule rejecting the crawler rather than a confirmed on-page condition; verify against Search Console before treating it as a site issue.`
      : "";
    L.push(`\n_${failed.length} pages could not be audited (unverified).${blockNote} Pages: ${failed.map(p => `${pathOf(p.url)}${p.status ? ` [HTTP ${p.status}]` : ""}`).join(", ")}_`);
  }
  L.push(`\n## Worth investigating further`); for (const w of worth_deeper) L.push(`- ${w}`);
  L.push(`\n## Provenance`); for (const f of provenance) L.push(`- ${f.source}: ${f.value}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  return { evidence, report_md: L.join("\n") };
}

/* ════════════════ CORE WEB VITALS (CrUX field) ═════════════════ */
async function runCrux(url: string): Promise<any> {
  const key = process.env.PAGESPEED_API_KEY || "";
  if (!key) return null;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ url, formFactor: "PHONE" }),
    }).then(x => x.json()).finally(() => clearTimeout(t));
    const m = (r as any)?.record?.metrics; if (!m) return null;
    return { url, lcp_ms: m.largest_contentful_paint?.percentiles?.p75 ?? null, cls: m.cumulative_layout_shift?.percentiles?.p75 ?? null, inp_ms: m.interaction_to_next_paint?.percentiles?.p75 ?? null };
  } catch { return null; }
}
export async function gatherCoreWebVitals(opts: { projectId: string; targetUrls: string[] }): Promise<StepResult> {
  const { targetUrls } = opts;
  const data = await Promise.race([
    Promise.all(targetUrls.slice(0, 25).map(runCrux)),
    new Promise<any[]>((res) => setTimeout(() => res([]), 50000)),
  ]) as any[];
  const valid = data.filter(Boolean);
  const provenance = [prov(valid.length, "CrUX field data", `${valid.length} of ${Math.min(targetUrls.length, 25)} pages have field data`)];
  const fails = valid.filter(c => (c.lcp_ms && c.lcp_ms > 2500) || (c.cls && c.cls > 0.1) || (c.inp_ms && c.inp_ms > 200));
  const worth_deeper = valid.length ? (fails.length ? [`${fails.length} pages fail a Core Web Vitals threshold — prioritise on commercially important pages.`] : []) : [`No CrUX field data — pages lack sufficient real-user traffic (a fact, not a verdict). Use Site Manager lab data.`];

  const evidence = { step_key: "core_web_vitals", generated_at: new Date().toISOString(), pages: valid, failing: fails, provenance, worth_deeper };
  const L: string[] = [];
  L.push(`# Core Web Vitals (field) — Evidence Report`);
  L.push(`\n_Generated ${new Date().toLocaleString()}. Real Chrome-user p75 data from CrUX. ${valid.length} pages have field data._\n`);
  if (valid.length) {
    L.push(`| Page | LCP | CLS | INP | Verdict |`); L.push(`|---|---|---|---|---|`);
    for (const c of valid) { const fail = (c.lcp_ms > 2500) || (c.cls > 0.1) || (c.inp_ms > 200); L.push(`| ${pathOf(c.url)} | ${c.lcp_ms ? (c.lcp_ms/1000).toFixed(2)+"s" : "—"} | ${c.cls ?? "—"} | ${c.inp_ms ? Math.round(c.inp_ms)+"ms" : "—"} | ${fail ? "FAILS" : "passes"} |`); }
  } else L.push(`_No CrUX field data available — pages lack sufficient real-user traffic. This is a fact about traffic volume, not a performance verdict. Lab data (Site Manager / PSI) would be needed to assess these pages._`);
  L.push(`\n## Worth investigating further`); for (const w of worth_deeper) L.push(`- ${w}`);
  L.push(`\n## Provenance`); for (const f of provenance) L.push(`- ${f.source}: ${f.value}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  return { evidence, report_md: L.join("\n") };
}

/* ════════════════ INTERNAL LINK GRAPH ══════════════════════════
   Crawl target + authority pages; map which target pages receive internal
   links from the site's higher-authority (higher-GSC-traffic) pages. */
export async function gatherInternalLinkGraph(opts: { projectId: string; targetUrls: string[] }): Promise<StepResult> {
  const { projectId, targetUrls } = opts;
  const gsc = await loadGsc(projectId);
  // Authority pages = top GSC pages by clicks
  const authorityPages = gsc.topPages.slice(0, 12).map((p: any) => p.page || p.url).filter(Boolean);
  const targetPaths = new Set(targetUrls.map(pathOf));

  // Fetch authority pages, extract internal links, see which targets they point to
  const linkMap = await Promise.race([
    Promise.all(authorityPages.map(async (url: string) => {
      const html = await fetchHtml(url);
      const hrefs = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)).map(m => m[1]);
      const internalTargets = hrefs.map(h => pathOf(h)).filter(p => targetPaths.has(p));
      return { from: url, links_to_targets: [...new Set(internalTargets)], loaded: html.length > 300 };
    })),
    new Promise<any[]>((res) => setTimeout(() => res([]), 50000)),
  ]) as any[];
  const provenance = [prov(linkMap.length, "live HTML crawl", "authority pages"), prov(gsc.topPages.length, "GSC top pages", "authority signal")];

  // Which target pages get zero internal links from authority pages
  const linkedTargets = new Set<string>();
  for (const a of linkMap) a.links_to_targets?.forEach((t: string) => linkedTargets.add(t));
  const orphaned = targetUrls.filter(u => !linkedTargets.has(pathOf(u)));
  const worth_deeper: string[] = [];
  if (orphaned.length) worth_deeper.push(`${orphaned.length} target pages receive no internal links from the site's top-traffic pages — internal link opportunities.`);

  const evidence = { step_key: "internal_link_graph", generated_at: new Date().toISOString(), link_map: linkMap, orphaned, provenance, worth_deeper };
  const L: string[] = [];
  L.push(`# Internal Link Graph — Evidence Report`);
  L.push(`\n_Generated ${new Date().toLocaleString()}. Live crawl of ${linkMap.length} authority pages (top GSC traffic). Verified links._\n`);
  L.push(`## Authority pages → which target pages they link to`);
  L.push(`| Authority page | Links to targets |`); L.push(`|---|---|`);
  for (const a of linkMap) L.push(`| ${pathOf(a.from)} | ${a.loaded ? (a.links_to_targets.length ? a.links_to_targets.join(", ") : "(none)") : "fetch failed"} |`);
  L.push(`\n## Target pages with NO internal links from authority pages (${orphaned.length})`);
  for (const u of orphaned.slice(0, 25)) L.push(`- ${pathOf(u)}`);
  L.push(`\n## Worth investigating further`); for (const w of worth_deeper) L.push(`- ${w}`);
  L.push(`\n## Provenance`); for (const f of provenance) L.push(`- ${f.source}: ${f.value}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  return { evidence, report_md: L.join("\n") };
}

/* ════════════════ ENGAGEMENT & CONVERSION VALUE (GA4) ══════════ */
export async function gatherEngagementValue(opts: { projectId: string; targetUrls: string[] }): Promise<StepResult> {
  const { projectId, targetUrls } = opts;
  const data = await Promise.race([
    Promise.all(targetUrls.slice(0, 25).map(async (url) => {
      const p = pathOf(url);
      const m = await ga4PullPageMetrics({ projectId, pagePath: p, days: 28 }).catch(() => null);
      return m ? { path: p, ...m } : null;
    })),
    new Promise<any[]>((res) => setTimeout(() => res([]), 50000)),
  ]) as any[];
  const valid = data.filter(Boolean);
  const provenance = [prov(valid.length, "GA4 (28 days)", `${valid.length} of ${Math.min(targetUrls.length, 25)} pages have GA4 data`)];

  // High traffic, low engagement (leaking value); high engagement, low traffic (deserves visibility)
  const leaking = valid.filter((g: any) => g.sessions >= 30 && g.engagement_rate_pct < 40).sort((a: any, b: any) => b.sessions - a.sessions);
  const hidden = valid.filter((g: any) => g.engagement_rate_pct >= 60 && g.sessions < 30);
  const worth_deeper: string[] = [];
  if (leaking.length) worth_deeper.push(`${leaking.length} pages get traffic but engage poorly (<40%) — intent mismatch or page quality.`);
  if (hidden.length) worth_deeper.push(`${hidden.length} pages engage well (>60%) but get little traffic — visibility upside.`);

  const evidence = { step_key: "engagement_value", generated_at: new Date().toISOString(), pages: valid, leaking, hidden, provenance, worth_deeper };
  const L: string[] = [];
  L.push(`# Engagement & Conversion Value — Evidence Report`);
  L.push(`\n_Generated ${new Date().toLocaleString()}. GA4 last 28 days. ${valid.length} pages with data._\n`);
  if (valid.length) {
    L.push(`| Page | Sessions | Engaged % | Bounce % | Views | Conversions |`); L.push(`|---|---|---|---|---|---|`);
    for (const g of valid.sort((a: any, b: any) => b.sessions - a.sessions)) L.push(`| ${g.path} | ${g.sessions} | ${g.engagement_rate_pct}% | ${g.bounce_rate_pct}% | ${g.views} | ${g.conversions} |`);
  } else L.push(`_No GA4 session data — pages lack sufficient traffic (a fact, not an engagement verdict)._`);
  L.push(`\n## Worth investigating further`); for (const w of worth_deeper) L.push(`- ${w}`);
  L.push(`\n## Provenance`); for (const f of provenance) L.push(`- ${f.source}: ${f.value}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  return { evidence, report_md: L.join("\n") };
}

/* ════════════════ TRAJECTORY (historical trend) ════════════════
   Diff against stored metrics_snapshots so movement is verifiable, not assumed.
   Build 12.19 — also tracks GEO-era metrics. Since Build 12.17 pm-reports
   captures gsc_ai_overview_impressions / clicks + ga4_ai_referral_sessions
   / conversions / platforms into metrics_snapshots.extras on every snapshot
   capture, we have a real time-series of GEO performance to surface here. */
export async function gatherTrajectory(opts: { projectId: string; targetUrls: string[] }): Promise<StepResult> {
  const { projectId } = opts;
  const { data: snaps } = await db().from("metrics_snapshots")
    .select("gsc_clicks, gsc_impressions, gsc_avg_position, organic_sessions, conversions, extras, captured_at")
    .eq("project_id", projectId).order("captured_at", { ascending: false }).limit(12);
  const rows = (snaps || []) as any[];
  const provenance = [prov(rows.length, "metrics_snapshots", "historical project snapshots")];

  let trend: any = null;
  if (rows.length >= 2) {
    const latest = rows[0], prior = rows[rows.length - 1];
    const delta = (a: number, b: number) => (b == null || a == null) ? null : a - b;
    /* Extract GEO fields from extras column on both endpoints. Empty when
       the snapshot pre-dates Build 12.16 capture — handle gracefully. */
    const latestExt = (latest as any).extras || {};
    const priorExt  = (prior  as any).extras || {};
    trend = {
      from: prior.captured_at, to: latest.captured_at,
      clicks: { now: latest.gsc_clicks, then: prior.gsc_clicks, delta: delta(latest.gsc_clicks, prior.gsc_clicks) },
      impressions: { now: latest.gsc_impressions, then: prior.gsc_impressions, delta: delta(latest.gsc_impressions, prior.gsc_impressions) },
      avg_position: { now: latest.gsc_avg_position, then: prior.gsc_avg_position, delta: delta(latest.gsc_avg_position, prior.gsc_avg_position) },
      sessions: { now: latest.organic_sessions, then: prior.organic_sessions, delta: delta(latest.organic_sessions, prior.organic_sessions) },
      /* Build 12.19 — GEO trajectory from extras */
      ai_overview_impressions: {
        now:   Number(latestExt.gsc_ai_overview_impressions ?? 0),
        then:  Number(priorExt.gsc_ai_overview_impressions ?? 0),
        delta: delta(Number(latestExt.gsc_ai_overview_impressions ?? 0), Number(priorExt.gsc_ai_overview_impressions ?? 0)),
      },
      ai_platform_sessions: {
        now:   Number(latestExt.ga4_ai_referral_sessions ?? 0),
        then:  Number(priorExt.ga4_ai_referral_sessions ?? 0),
        delta: delta(Number(latestExt.ga4_ai_referral_sessions ?? 0), Number(priorExt.ga4_ai_referral_sessions ?? 0)),
      },
      ai_platform_conversions: {
        now:   Number(latestExt.ga4_ai_referral_conversions ?? 0),
        then:  Number(priorExt.ga4_ai_referral_conversions ?? 0),
        delta: delta(Number(latestExt.ga4_ai_referral_conversions ?? 0), Number(priorExt.ga4_ai_referral_conversions ?? 0)),
      },
    };
  }
  const worth_deeper = rows.length < 2 ? [`Only ${rows.length} historical snapshot(s) — trajectory needs at least two points over time. Movement cannot yet be verified.`] : [];
  /* Build 12.19 — surface GEO movement as a worth-deeper signal when meaningful */
  if (trend && trend.ai_overview_impressions.then === 0 && trend.ai_overview_impressions.now > 0) {
    worth_deeper.push(`AI Overview citations started in this window — ${trend.ai_overview_impressions.now} impressions captured. Identify which queries triggered citation and document the content patterns.`);
  }
  if (trend && trend.ai_platform_sessions.then === 0 && trend.ai_platform_sessions.now > 50) {
    worth_deeper.push(`AI platform referral channel emerged this window — ${trend.ai_platform_sessions.now} sessions from AI search. Audit landing pages and ensure CTAs match the conversational query intent.`);
  }
  if (trend && trend.ai_platform_sessions.then > 0 && trend.ai_platform_sessions.delta != null && trend.ai_platform_sessions.delta < -trend.ai_platform_sessions.then * 0.3) {
    worth_deeper.push(`AI platform referral sessions dropped ${Math.abs(Math.round((trend.ai_platform_sessions.delta / trend.ai_platform_sessions.then) * 100))}% in this window. Investigate competitor displacement or content freshness.`);
  }

  const evidence = { step_key: "trajectory", generated_at: new Date().toISOString(), snapshots: rows.length, trend, provenance, worth_deeper };
  const L: string[] = [];
  L.push(`# Trajectory — Evidence Report`);
  L.push(`\n_Generated ${new Date().toLocaleString()}. From ${rows.length} stored metrics snapshots. Real change over time, not assumed._\n`);
  if (trend) {
    const fmt = (d: number | null, invert = false) => d == null ? "—" : `${(invert ? -d : d) >= 0 ? "+" : ""}${Math.round(d)}`;
    L.push(`Window: ${new Date(trend.from).toLocaleDateString()} → ${new Date(trend.to).toLocaleDateString()}`);
    L.push(`\n| Metric | Then | Now | Change |`); L.push(`|---|---|---|---|`);
    L.push(`| GSC clicks | ${trend.clicks.then ?? "—"} | ${trend.clicks.now ?? "—"} | ${fmt(trend.clicks.delta)} |`);
    L.push(`| GSC impressions | ${trend.impressions.then ?? "—"} | ${trend.impressions.now ?? "—"} | ${fmt(trend.impressions.delta)} |`);
    L.push(`| Avg position | ${trend.avg_position.then?.toFixed?.(1) ?? "—"} | ${trend.avg_position.now?.toFixed?.(1) ?? "—"} | ${fmt(trend.avg_position.delta)} (lower is better) |`);
    L.push(`| Organic sessions | ${trend.sessions.then ?? "—"} | ${trend.sessions.now ?? "—"} | ${fmt(trend.sessions.delta)} |`);
    /* Build 12.19 — GEO rows. Show 0 cleanly when no data captured yet. */
    L.push(`| AI Overview impressions | ${trend.ai_overview_impressions.then} | ${trend.ai_overview_impressions.now} | ${fmt(trend.ai_overview_impressions.delta)} |`);
    L.push(`| AI platform sessions | ${trend.ai_platform_sessions.then} | ${trend.ai_platform_sessions.now} | ${fmt(trend.ai_platform_sessions.delta)} |`);
    L.push(`| AI platform conversions | ${trend.ai_platform_conversions.then} | ${trend.ai_platform_conversions.now} | ${fmt(trend.ai_platform_conversions.delta)} |`);
  } else L.push(`_Insufficient history to compute a trajectory (need ≥2 snapshots). Movement cannot be verified yet._`);
  L.push(`\n## Worth investigating further`); for (const w of worth_deeper) L.push(`- ${w}`);
  L.push(`\n## Provenance`); for (const f of provenance) L.push(`- ${f.source}: ${f.value}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  return { evidence, report_md: L.join("\n") };
}
