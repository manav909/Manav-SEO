/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/pillar-scientist.ts

   THE PILLARS (scientists / quantum brain).

   Contract: solvePillar({ projectId, campaignId, pillar, panelQuestions?,
   manavContext?, targetUrls? }). Self-sufficient:
     • Path A — rich panel questions to answer.
     • Path B — bare target (Manav points it at pages directly, no panel).
   Either way it gathers whatever verified data the work needs (fresh-when-
   required) and produces a structured, fully-sourced solution with live
   status. Every claim traces to a source. No assumptions.

   This slice implements the VISIBILITY pillar's data gathering in full; the
   structure generalises to the other six (their gather() blocks are added
   when the slice is approved).

   Project-agnostic throughout.
════════════════════════════════════════════════════════════════ */

import { db } from "../db.js";
import { llm, parseJsonResponse } from "./llm.js";
import {
  loadGsc, siteCtrCurve, fetchPageFacts, resolveTargetUrls,
  fetchSerpFeatures, type SourcedFact,
} from "./shared.js";

const norm = (u: string) => (u || "").replace(/\/$/, "").toLowerCase();
const pathOf = (u: string) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/* Interrogation definition per pillar — expert lens + data scope. */
interface Interrogation { expert_role: string; data_sources: string[]; default_questions: string[]; }

const INTERROGATIONS: Record<string, Interrogation> = {
  visibility: {
    expert_role: "Senior Technical SEO scientist specialising in indexation, crawl and visibility",
    data_sources: ["GSC pages", "GSC query-page pairs", "this site's CTR curve", "live HTML crawl", "SerpAPI"],
    default_questions: [
      "Which target pages are invisible to Google and what is each one's verified indexation state (reachable / noindex / canonicalised)?",
      "For near-ranking pages, what specifically do the competitors ranking above have that this page lacks?",
      "What is the realistic click ceiling if priority pages reach their target position, using THIS site's own CTR curve (not generic benchmarks)?",
      "Which single fix unlocks the most impressions for the least effort?",
    ],
  },
  // Other pillars added when the slice is approved — same shape.
};

/** Gather the verified data the visibility scientist needs. Returns a sourced
    evidence block (string) plus the structured facts for forecasting. */
async function gatherVisibilityData(projectId: string, targetUrls: string[]): Promise<{ block: string; provenance: SourcedFact[] }> {
  const now = new Date().toISOString();
  const targetSet = new Set(targetUrls.map(norm));
  const gsc = await loadGsc(projectId);
  const provenance: SourcedFact[] = [];

  const visible = gsc.topPages.filter((p: any) => targetSet.has(norm(p.page || p.url || "")));
  const invisible = targetUrls.filter(u => !gsc.topPages.some((p: any) => norm(p.page || p.url || "") === norm(u)));
  const pairs = gsc.queryPagePairs.filter((p: any) => targetSet.has(norm(p.page)))
    .sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0));
  const curve = siteCtrCurve(gsc.queryPagePairs);
  provenance.push({ value: gsc.topPages.length, source: "GSC top pages", fetched_at: gsc.fetchedAt });
  provenance.push({ value: pairs.length, source: "GSC query-page pairs", fetched_at: gsc.fetchedAt });

  // Live indexation check on invisible pages (fresh, since this is the crux)
  const checks = await Promise.race([
    Promise.all(invisible.slice(0, 15).map(async (u) => {
      const f = await fetchPageFacts(u);
      return { url: u, loaded: f.loaded, noindex: f.noindex, canonical: f.canonical };
    })),
    new Promise<any[]>((res) => setTimeout(() => res([]), 50000)),
  ]) as any[];
  if (checks.length) provenance.push({ value: checks.length, source: "live HTML crawl", fetched_at: new Date().toISOString(), note: "indexation checks" });

  // Competitor verification for the top near-ranking query (fresh SerpAPI + crawl)
  const projDomain = domainOf(targetUrls[0] || "");
  const nearQ = pairs.find((p: any) => (p.position || 0) >= 4 && (p.position || 0) <= 20);
  let compBlock = "";
  if (nearQ?.query) {
    const serp: any = await fetchSerpFeatures(nearQ.query, projectId, {}).catch(() => null);
    if (serp) {
      provenance.push({ value: nearQ.query, source: "SerpAPI", fetched_at: serp.fetched_at || now });
      const compUrls = ((serp.top_100_urls || serp.top_10_urls || []) as string[])
        .filter(u => domainOf(u) && domainOf(u) !== projDomain).slice(0, 3);
      const comps = await Promise.race([
        Promise.all(compUrls.map(async (u) => { const f = await fetchPageFacts(u); return { domain: domainOf(u), words: f.word_count, schema: f.schema, loaded: f.loaded }; })),
        new Promise<any[]>((res) => setTimeout(() => res([]), 35000)),
      ]) as any[];
      if (comps.length) provenance.push({ value: comps.length, source: "live HTML crawl", fetched_at: new Date().toISOString(), note: "competitor pages" });
      compBlock = `\nCOMPETITORS for "${nearQ.query}" (this site pos ${(nearQ.position || 0).toFixed(1)}), SERP features: ${[serp.ai_overview && "AI Overview", serp.featured_snippet && "Featured snippet", serp.people_also_ask && "PAA", serp.shopping_carousel && "Shopping"].filter(Boolean).join(", ") || "none"}\n` +
        comps.map(c => `- ${c.domain}: ${c.loaded ? `${c.words} words, schema ${c.schema ? "yes" : "no"}` : "fetch failed"}`).join("\n");
    }
  }

  const block =
    `## VERIFIED DATA (sources tagged)\n` +
    `Target pages: ${targetUrls.length} | Visible in GSC: ${visible.length} | Invisible (0 impressions): ${invisible.length} [source: GSC top pages]\n\n` +
    `INVISIBLE PAGES with live indexation check [source: live HTML crawl]:\n` +
    (checks.length ? checks.map(c => `- ${pathOf(c.url)}: ${c.loaded ? "reachable" : "FETCH FAILED"}, ${c.noindex ? "NOINDEX" : "indexable"}${c.canonical ? `, canonical→${pathOf(c.canonical)}` : ""}`).join("\n") : invisible.slice(0, 15).map(u => `- ${pathOf(u)} (not yet crawled)`).join("\n")) + "\n\n" +
    `THIS SITE'S OWN CTR CURVE [source: GSC query-page pairs] (position: median CTR):\n` +
    Object.keys(curve).map(Number).filter(p => p <= 10).sort((a, b) => a - b).map(p => `- pos ${p}: ${curve[p].ctr}% (n=${curve[p].samples})`).join("\n") + "\n\n" +
    `TOP REAL QUERY→PAGE PAIRS [source: GSC query-page pairs]:\n` +
    pairs.slice(0, 25).map((p: any) => `- "${p.query}" → ${pathOf(p.page)}: ${p.impressions} impr, ${p.clicks} clicks, CTR ${p.ctr}%, pos ${(p.position || 0).toFixed(1)}`).join("\n") +
    compBlock;

  return { block, provenance };
}

export async function solvePillar(opts: {
  projectId: string;
  campaignId?: string;
  pillar: string;
  panelQuestions?: Array<{ role: string; pillar: string; question: string; why: string }>;
  manavContext?: string;
  targetUrls?: string[];
  runId?: string;
  onStatus?: (s: string) => Promise<void>;
}): Promise<{ success: boolean; report_id?: string; error?: string }> {
  const interro = INTERROGATIONS[opts.pillar];
  if (!interro) return { success: false, error: `Pillar "${opts.pillar}" not yet implemented in this slice (Visibility is the proven slice).` };

  const status = async (s: string) => { try { await opts.onStatus?.(s); } catch { /* non-fatal */ } };

  await status("Resolving target pages");
  let targetUrls = opts.targetUrls?.length ? opts.targetUrls : (await resolveTargetUrls(opts.campaignId, opts.projectId)).urls;
  if (!targetUrls.length) return { success: false, error: "No target pages to analyse." };

  await status("Gathering verified data (GSC, live crawl, SerpAPI)");
  const { block, provenance } = await gatherVisibilityData(opts.projectId, targetUrls);

  // Build the question set: panel questions for this pillar (Path A) or defaults (Path B)
  const pillarQs = (opts.panelQuestions || []).filter(q => q.pillar === opts.pillar);
  const questions = pillarQs.length
    ? pillarQs.map(q => `  - [asked by ${q.role}] ${q.question}${q.why ? ` (why: ${q.why})` : ""}`)
    : interro.default_questions.map(q => `  - ${q}`);

  await status("Solving each question against the evidence");
  const system = `You are a ${interro.expert_role}. You answer the panel's questions about the "${opts.pillar}" pillar using ONLY the verified data provided, at a scientist's standard of rigour.

ABSOLUTE RULES:
- Every claim must cite its source inline, e.g. "13 of 17 pages invisible (source: GSC top pages)". Never state a number without its source.
- Use ONLY the data given. If a question cannot be fully answered from it, say exactly what additional verification is required — never assume.
- Forecasts are CEILINGS and MUST use this site's own CTR curve from the data, not generic benchmarks. State the curve value you used.
- Be honest and specific. No fluff, no generic SEO advice.
- Tag each insight with the stakeholder roles it serves: client, dms, writer, brand, pm, investor.

Respond with ONLY valid JSON (no prose, no fences):
{
  "headline": "one-sentence verdict citing the key sourced number",
  "state_of_play": "2-3 sentence factual summary with sources",
  "answers": [
    {"question":"the panel question or default","roles":["client","dms"],"answer":"sourced answer","evidence":"the specific sourced figures","action":"what to do","impact":"ceiling, with the CTR-curve value used","effort":"low|medium|high","priority":1,"confidence":"high|medium|low"}
  ],
  "open_questions": ["what still needs verification, honestly"],
  "ninety_day_plan": "prioritised week1 / month1 / quarter1 sequence grounded in the answers"
}`;

  let user = `PILLAR: ${opts.pillar}\nData sources available: ${interro.data_sources.join(", ")}\nTarget pages: ${targetUrls.length}\n\n${block}\n\nQUESTIONS TO SOLVE:\n${questions.join("\n")}\n`;
  if (opts.manavContext) user += `\nADDITIONAL CONTEXT FROM MANAV (the operator) — address this too:\n"""\n${opts.manavContext}\n"""\n`;
  user += `\nProduce the JSON solution now. Cite a source inline for every figure.`;

  const raw = await llm({ system, user, maxTokens: 8000, timeoutMs: 150000, label: `pillar-${opts.pillar}` });
  if (!raw) return { success: false, error: "Pillar analysis returned empty (LLM timeout or error)." };
  const parsed = parseJsonResponse<any>(raw);
  if (!parsed) return { success: false, error: "Pillar analysis returned unparseable output." };

  await status("Writing report");
  const md = renderPillarReport(opts.pillar, interro, parsed, provenance);

  // Persist — constraint-valid values; project_id is required (NOT NULL).
  try {
    const { data: panel } = await db().from("seo_campaign_panels")
      .select("id").eq("campaign_id", opts.campaignId || "").eq("pillar", opts.pillar).maybeSingle();

    const row: any = {
      campaign_id: opts.campaignId || null,
      project_id: opts.projectId,
      panel_id: (panel as any)?.id || null,
      pillar: opts.pillar,
      report_kind: "deep_analysis",
      title: (parsed.headline ? String(parsed.headline).slice(0, 200) : "") || `${opts.pillar} analysis`,
      summary: parsed.state_of_play ? String(parsed.state_of_play).slice(0, 500) : null,
      body_md: md,
      confidence_rating: avgConfidence(parsed.answers),
      generated_by: "manual",
      data_sources: interro.data_sources,
    };
    let { data: inserted, error } = await db().from("seo_campaign_reports").insert(row).select("id").single();
    if (error && /report_kind/i.test(error.message || "")) {
      const retry = await db().from("seo_campaign_reports").insert({ ...row, report_kind: "manual_refresh" }).select("id").single();
      inserted = retry.data; error = retry.error;
    }
    if (error) return { success: false, error: `report insert failed: ${error.message}` };

    if ((panel as any)?.id) {
      try {
        await db().from("seo_campaign_panels").update({
          current_summary: parsed.headline ? String(parsed.headline).slice(0, 500) : null,
          current_status: "covered",
          current_findings: parsed.answers || null,
          last_assessed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", (panel as any).id);
      } catch (e: any) { console.warn(`[pillar-scientist] panel update non-fatal: ${e?.message}`); }
    }
    await status("Done");
    return { success: true, report_id: (inserted as any).id };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

function renderPillarReport(pillar: string, interro: Interrogation, p: any, provenance: SourcedFact[]): string {
  const roleLabel: Record<string, string> = { client: "CLIENT", dms: "SPECIALIST", writer: "WRITER", brand: "BRAND", pm: "PM", investor: "INVESTOR", dev: "DEV" };
  const L: string[] = [];
  L.push(`# ${pillar.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} — Scientist Solution`);
  L.push("");
  if (p._raw) { L.push(`**Analyst:** ${interro.expert_role}`); L.push(""); L.push(p._raw); return L.join("\n"); }
  L.push(`> ${p.headline || ""}`);
  L.push("");
  L.push(`**Analyst:** ${interro.expert_role}`);
  L.push(`**Data sources:** ${interro.data_sources.join(", ")}`);
  L.push("");
  if (p.state_of_play) { L.push(`## State of play`); L.push(p.state_of_play); L.push(""); }
  const answers = (p.answers || []).slice().sort((a: any, b: any) => (a.priority || 5) - (b.priority || 5));
  L.push(`## Solved questions (${answers.length})`);
  L.push("");
  for (const a of answers) {
    const tags = (a.roles || []).map((r: string) => `[${roleLabel[r] || r.toUpperCase()}]`).join(" ");
    L.push(`### ${tags} ${a.question || ""}`);
    if (a.answer) L.push(`- **Answer:** ${a.answer}`);
    if (a.evidence) L.push(`- **Evidence:** ${a.evidence}`);
    if (a.action) L.push(`- **Action:** ${a.action}`);
    if (a.impact) L.push(`- **Impact:** ${a.impact}`);
    L.push(`- **Effort:** ${a.effort || "—"} · **Priority:** ${a.priority || "—"} · **Confidence:** ${a.confidence || "—"}`);
    L.push("");
  }
  if ((p.open_questions || []).length) { L.push(`## Open questions (need verification)`); for (const q of p.open_questions) L.push(`- ${q}`); L.push(""); }
  if (p.ninety_day_plan) { L.push(`## 90-day plan`); L.push(p.ninety_day_plan); L.push(""); }
  L.push(`## Provenance`);
  for (const f of provenance) L.push(`- ${f.source}: ${typeof f.value === "number" ? f.value : JSON.stringify(f.value)}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  return L.join("\n");
}

function avgConfidence(answers: any[]): string {
  if (!answers || !answers.length) return "medium";
  const score: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const avg = answers.reduce((s, a) => s + (score[a.confidence] || 2), 0) / answers.length;
  return avg >= 2.5 ? "high" : avg >= 1.5 ? "medium" : "low";
}
