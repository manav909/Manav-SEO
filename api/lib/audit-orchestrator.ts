/* ═══════════════════════════════════════════════════════════
   Audit Orchestrator — page-aware, algorithm-driven audit engine.

   The "showroom" model: every page is a room, audited against:
   1. Its own target keywords (not site-level — per-page)
   2. Questions it should answer (per-page intent)
   3. Algorithm knowledge from algorithm_knowledge table

   Flow per page:
   Phase 1 — Crawl   : fetch HTML (multi-strategy fallback)
   Phase 2 — Analyse : Claude extracts signals + algo compliance
   Phase 3 — Save    : classify + save learnings to brain

   After all pages:
   Phase 4 — Synthesize : cross-page patterns → brain_desk
   Phase 5 — Pipeline   : runPostAuditPipeline (metrics sync, staleness)
═══════════════════════════════════════════════════════════ */

import Anthropic from "@anthropic-ai/sdk";
import { fetchUrl, parseJson } from "./fetch";
import { saveLearning, saveToDesk } from "./save";
import { runPostAuditPipeline } from "./pipeline";
import { db } from "./db";
import type { AlgoTopic } from "./types";

/* ── Per-page specification ─────────────────────────────────── */
export interface PageSpec {
  url:            string;
  targetKeywords: string[];     // keywords this specific page targets
  contentType?:   string;       // landing_page | blog | product | service | home | about
  questions?:     string[];     // questions this page should directly answer
  notes?:         string;       // extra context (e.g. "client's highest-traffic page")
}

/* ── Structured signals extracted per page ──────────────────── */
export interface KeywordCoverage {
  keyword:    string;
  in_title:   boolean;
  in_h1:      boolean;
  in_meta:    boolean;
  in_h2:      boolean;
  in_content: boolean;
  score:      number;   // 0-100
}

export interface AlgoComplianceItem {
  topic:    string;
  status:   "compliant" | "partial" | "failing" | "unknown";
  evidence: string;
  action?:  string;
}

export interface PageIssue {
  severity: "critical" | "high" | "medium" | "low";
  detail:   string;
  fix:      string;
}

export interface PageOpportunity {
  action:   string;
  impact:   string;
  effort:   "low" | "medium" | "high";
  evidence: string;
}

export interface PageAuditSignals {
  title_tag:               string;
  title_length:            number;
  title_issues:            string;
  meta_description:        string;
  meta_desc_length:        number;
  meta_desc_issues:        string;
  h1:                      string;
  h1_issues:               string;
  h2s:                     string[];
  word_count:              number;
  content_type:            string;
  schema_types:            string[];
  structured_data_quality: string;
  has_og_tags:             boolean;
  internal_links:          number;
  external_links:          number;
  images_no_alt:           number;
  faqs_detected:           string[];
  answer_format_quality:   string;
  content_quality:         "high" | "medium" | "low";
  data_confidence:         "high" | "medium" | "low";
  keyword_coverage:        KeywordCoverage[];
  algo_compliance:         AlgoComplianceItem[];
  issues:                  PageIssue[];
  opportunities:           PageOpportunity[];
  page_score:              number;   // 0-100
}

/* ── Per-page audit result ───────────────────────────────────── */
export interface PageAuditResult {
  url:             string;
  status:          "success" | "failed" | "blocked";
  signals?:        PageAuditSignals;
  error?:          string;
  fetch_strategy?: string;
  learningSaved:   number;
  learningSkipped: number;
  cached:          boolean;
}

/* ── Progress events ─────────────────────────────────────────── */
export type OrchestratorEventType =
  | "start"
  | "page_crawling"
  | "page_analysing"
  | "page_done"
  | "page_failed"
  | "synthesizing"
  | "pipeline_done"
  | "complete"
  | "error";

export interface OrchestratorEvent {
  type:      OrchestratorEventType;
  url?:      string;
  progress?: string;
  result?:   PageAuditResult;
  summary?:  string;
  timestamp: string;
}

/* ── Final result ─────────────────────────────────────────────── */
export interface OrchestratorResult {
  auditId:        string;
  projectId:      string;
  pages:          PageAuditResult[];
  score:          number;
  totalLearnings: number;
  synthesis?:     string;
  timestamp:      string;
}

/* ── Options ──────────────────────────────────────────────────── */
export interface OrchestratorOpts {
  projectId:      string;
  pages:          PageSpec[];
  projectContext: string;      // condensed: project name, industry, goals, competitors
  algoTopics:     AlgoTopic[]; // from algorithm_knowledge — drives audit checklist
  mode?:          "quick" | "standard" | "deep";
  onProgress?:    (event: OrchestratorEvent) => void;
}

/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */

function emit(fn: OrchestratorOpts["onProgress"], event: Omit<OrchestratorEvent, "timestamp">) {
  fn?.({ ...event, timestamp: new Date().toISOString() });
}

function buildAlgoChecklist(topics: AlgoTopic[]): string {
  const fresh = topics.filter(t => t.freshness_score >= 5).slice(0, 6);
  if (!fresh.length) return "No algorithm updates loaded. Audit against general best practices.";
  return fresh.map((t, i) => [
    `${i + 1}. [${t.impact_level.toUpperCase()} IMPACT] ${t.topic} (freshness ${t.freshness_score}/10)`,
    `   ${t.summary.slice(0, 200)}`,
  ].join("\n")).join("\n\n");
}

function buildPageAuditPrompt(
  url: string, html: string,
  spec: PageSpec, projectContext: string,
  algoChecklist: string,
): string {
  const kwLines = spec.targetKeywords.length
    ? spec.targetKeywords.map((k, i) => `  ${i + 1}. "${k}"`).join("\n")
    : "  (Infer from URL slug and page title)";

  const qLines = spec.questions?.length
    ? spec.questions.map((q, i) => `  ${i + 1}. ${q}`).join("\n")
    : "  (Infer from page content)";

  return `You are an SEO audit engine. Audit this single page against its specific target keywords and algorithm compliance checklist.

PROJECT: ${projectContext}
URL: ${url}
CONTENT TYPE: ${spec.contentType || "infer from URL"}
${spec.notes ? `NOTES: ${spec.notes}` : ""}

TARGET KEYWORDS FOR THIS PAGE (page-level — not the whole site):
${kwLines}

QUESTIONS THIS PAGE SHOULD ANSWER DIRECTLY:
${qLines}

ALGORITHM COMPLIANCE CHECKLIST (audit against EVERY item):
${algoChecklist}

HTML:
${html}

Return ONLY valid JSON (no markdown fences, no prose before or after):
{
  "title_tag": "exact <title> text or Not found",
  "title_length": 0,
  "title_issues": "OK | Too long | Too short | Missing keyword | Duplicate",
  "meta_description": "exact content or Not found",
  "meta_desc_length": 0,
  "meta_desc_issues": "OK | Missing | Too long | Not compelling",
  "h1": "exact first <h1> or Not found",
  "h1_issues": "OK | Missing | Multiple | Too generic | Missing keyword",
  "h2s": ["up to 6 exact <h2> texts"],
  "word_count": 0,
  "content_type": "landing_page|blog|product|service|home|about|other",
  "schema_types": ["exact @type values from JSON-LD scripts"],
  "structured_data_quality": "comprehensive|partial|minimal|none",
  "has_og_tags": false,
  "internal_links": 0,
  "external_links": 0,
  "images_no_alt": 0,
  "faqs_detected": ["up to 5 exact FAQ question texts visible on page"],
  "answer_format_quality": "high|medium|low|none",
  "content_quality": "high|medium|low",
  "data_confidence": "high|medium|low",
  "keyword_coverage": [
    {
      "keyword": "each target keyword listed above",
      "in_title": false, "in_h1": false, "in_meta": false,
      "in_h2": false, "in_content": false,
      "score": 0
    }
  ],
  "algo_compliance": [
    {
      "topic": "algorithm update topic name from checklist",
      "status": "compliant|partial|failing|unknown",
      "evidence": "What you found on this specific page (cite exact text or elements)",
      "action": "What to do if partial or failing — be specific and page-level"
    }
  ],
  "issues": [
    {"severity": "critical|high|medium|low", "detail": "specific observation citing page content", "fix": "exact step to fix"}
  ],
  "opportunities": [
    {"action": "specific step", "impact": "SEO or conversion impact", "effort": "low|medium|high", "evidence": "what in page suggests this"}
  ],
  "page_score": 0
}

RULES:
- keyword_coverage: one entry for EVERY keyword in the target list above
- algo_compliance: one entry for EVERY algorithm item in the checklist above
- page_score: 0-100 based on keyword coverage average + algo compliance + on-page signals
- issues: 3-6 items minimum, ordered critical→low
- opportunities: 3-5 items minimum, ordered by highest impact`;
}

/* ─────────────────────────────────────────────────────────────
   Save page findings to brain_learnings
───────────────────────────────────────────────────────────── */
async function savePageLearnings(
  projectId: string, url: string,
  spec: PageSpec, signals: PageAuditSignals,
): Promise<{ saved: number; skipped: number }> {
  let saved = 0;
  let skipped = 0;

  /* Critical + high issues → technical learnings */
  const criticalIssues = signals.issues.filter(i => i.severity === "critical" || i.severity === "high");
  for (const issue of criticalIssues.slice(0, 3)) {
    const content = `[${issue.severity.toUpperCase()}] ${issue.detail} Fix: ${issue.fix}`;
    const r = await saveLearning({
      source: "audit_orchestrator",
      projectId,
      content,
      title: issue.detail.slice(0, 80),
      cardType: "technical",
      contextSummary: `Page audit: ${url}`,
      tags: ["audit", spec.contentType || "page"],
    });
    if (r.saved) saved++; else skipped++;
  }

  /* Low-effort opportunities → quick-win learnings */
  const quickOpps = signals.opportunities.filter(o => o.effort === "low");
  for (const opp of quickOpps.slice(0, 2)) {
    const content = `${opp.action}. Impact: ${opp.impact}. Evidence: ${opp.evidence}`;
    const r = await saveLearning({
      source: "audit_orchestrator",
      projectId,
      content,
      title: opp.action.slice(0, 80),
      cardType: "quick-win",
      contextSummary: `Page audit opportunity: ${url}`,
      tags: ["opportunity", "audit"],
    });
    if (r.saved) saved++; else skipped++;
  }

  /* Algorithm compliance failures → algorithm learnings */
  const failing = signals.algo_compliance.filter(a => a.status === "failing" || a.status === "partial");
  for (const f of failing.slice(0, 2)) {
    if (!f.action) continue;
    const content = `Algorithm compliance on ${url} — "${f.topic}": ${f.status}. ${f.evidence}. Action: ${f.action}`;
    const r = await saveLearning({
      source: "audit_orchestrator",
      projectId,
      content,
      title: `${f.topic} compliance: ${f.status}`,
      cardType: "algorithm",
      contextSummary: `Algorithm audit: ${url}`,
      tags: ["algorithm", "compliance", "audit"],
    });
    if (r.saved) saved++; else skipped++;
  }

  /* Keyword gaps → content learnings */
  const kgaps = signals.keyword_coverage.filter(k => k.score < 40);
  if (kgaps.length > 0) {
    const content = `Keyword coverage gaps on ${url}: ${kgaps.map(k => `"${k.keyword}" (score ${k.score}/100 — missing in: ${[!k.in_title && "title", !k.in_h1 && "H1", !k.in_meta && "meta"].filter(Boolean).join(", ")})`).join("; ")}. Add these keywords to the listed elements.`;
    const r = await saveLearning({
      source: "audit_orchestrator",
      projectId,
      content,
      title: `Keyword gaps: ${kgaps.map(k => `"${k.keyword}"`).join(", ").slice(0, 60)}`,
      cardType: "content",
      contextSummary: `Keyword coverage audit: ${url}`,
      tags: ["keyword", "content", "audit"],
    });
    if (r.saved) saved++; else skipped++;
  }

  return { saved, skipped };
}

/* ─────────────────────────────────────────────────────────────
   Main orchestrator
───────────────────────────────────────────────────────────── */
export async function runAuditOrchestrator(opts: OrchestratorOpts): Promise<OrchestratorResult> {
  const { projectId, pages, projectContext, algoTopics, mode = "standard", onProgress } = opts;

  const ai           = new Anthropic();
  const auditId      = `orch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const algoChecklist = buildAlgoChecklist(algoTopics);
  const pageResults: PageAuditResult[] = [];

  const maxTokens = mode === "deep" ? 4000 : mode === "quick" ? 2000 : 3000;

  emit(onProgress, { type: "start", summary: `Starting audit of ${pages.length} page${pages.length !== 1 ? "s" : ""}` });

  /* ── Phase 1-3: Per-page crawl → analyse → save ── */
  for (let i = 0; i < pages.length; i++) {
    const spec     = pages[i];
    const { url }  = spec;
    const progress = `${i + 1}/${pages.length}`;

    /* Phase 1 — Crawl */
    emit(onProgress, { type: "page_crawling", url, progress });
    const fetched = await fetchUrl(url);

    if (!fetched.html) {
      const result: PageAuditResult = {
        url, status: fetched.status === 403 ? "blocked" : "failed",
        error: fetched.error, learningSaved: 0, learningSkipped: 0, cached: false,
      };
      pageResults.push(result);
      emit(onProgress, { type: "page_failed", url, progress, result });
      continue;
    }

    /* Phase 2 — Analyse */
    emit(onProgress, { type: "page_analysing", url, progress });
    let signals: PageAuditSignals | undefined;

    try {
      const prompt = buildPageAuditPrompt(url, fetched.html, spec, projectContext, algoChecklist);
      const msg = await ai.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system: "You are a precise SEO audit engine. Return ONLY valid JSON. No prose. No markdown fences. Every audit field must have a value.",
        messages: [{ role: "user", content: prompt }],
      });

      if (msg.stop_reason === "max_tokens") {
        console.warn(`[orchestrator] max_tokens hit for ${url}`);
      }

      const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
      signals = parseJson(raw) ?? undefined;
    } catch (err: any) {
      console.error(`[orchestrator] Claude failed for ${url}:`, err.message);
    }

    /* Phase 3 — Save learnings */
    let learningSaved = 0;
    let learningSkipped = 0;

    if (signals) {
      const counts = await savePageLearnings(projectId, url, spec, signals);
      learningSaved   = counts.saved;
      learningSkipped = counts.skipped;

      /* Persist signals to crawled_pages */
      try {
        await db().from("crawled_pages").upsert({
          project_id:    projectId,
          url,
          page_analysis: signals,
          knowledge_fields: [],
          fetch_status:  200,
          fetch_error:   null,
          html_chars:    fetched.chars,
          crawl_status:  "success",
          crawled_at:    new Date().toISOString(),
        }, { onConflict: "project_id,url" });
      } catch (_e) {}
    }

    const result: PageAuditResult = {
      url,
      status:          signals ? "success" : "failed",
      signals,
      fetch_strategy:  fetched.strategy,
      learningSaved,
      learningSkipped,
      cached: false,
    };
    pageResults.push(result);
    emit(onProgress, { type: "page_done", url, progress, result });
  }

  /* ── Phase 4 — Cross-page synthesis ── */
  const successPages = pageResults.filter(r => r.status === "success" && r.signals);
  let synthesis = "";

  if (successPages.length > 0) {
    emit(onProgress, { type: "synthesizing", summary: `Synthesizing ${successPages.length} page results` });

    const pageBriefs = successPages.map(r => {
      const s = r.signals!;
      const kwScores = s.keyword_coverage
        ?.map(k => `"${k.keyword}":${k.score}`)
        .join(" | ") || "—";
      const algoFails = s.algo_compliance
        ?.filter(a => a.status === "failing" || a.status === "partial")
        .map(a => `${a.topic}(${a.status})`)
        .join(", ") || "none";
      return [
        `URL: ${r.url}`,
        `Score: ${s.page_score}/100 | Words: ${s.word_count} | Quality: ${s.content_quality}`,
        `H1: ${s.h1.slice(0, 60)} | Title: ${s.title_issues}`,
        `Keywords: ${kwScores}`,
        `Algo issues: ${algoFails}`,
        `Top issues: ${s.issues.slice(0, 2).map(i => `[${i.severity}] ${i.detail.slice(0, 60)}`).join(" | ")}`,
      ].join("\n");
    }).join("\n\n---\n\n");

    try {
      const synthMsg = await ai.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: mode === "deep" ? 3000 : 1500,
        system: "You are Manav Brain, senior SEO strategist. Be specific. Cite page URLs. Give exact implementation steps.",
        messages: [{
          role: "user",
          content: `Project: ${projectContext}

AUDIT RESULTS (${successPages.length} pages audited):
${pageBriefs}

Write a synthesis report with these sections:
## Site-Wide Patterns
Issues appearing across multiple pages (name the URLs).

## Top 5 Priority Actions
Highest impact changes ranked. Be specific — include exact element to change, exact new value, and which URL.

## Quick Wins (< 2 hours total)
Changes requiring minimal effort. Include exact implementation steps.

## Algorithm Compliance Gaps
Most critical algorithm failures across all pages. Group by topic.`,
        }],
      });
      synthesis = synthMsg.content[0].type === "text" ? synthMsg.content[0].text : "";
    } catch (_e) {}

    if (synthesis.length > 200) {
      await saveToDesk({
        projectId,
        title: `Audit Synthesis — ${pages.length} pages — ${new Date().toLocaleDateString()}`,
        content: synthesis,
        contentType: "audit_synthesis",
        source: "audit_orchestrator",
        tags: ["audit", "synthesis", "strategy"],
      });
    }
  }

  /* ── Phase 5 — Pipeline (metrics sync, staleness marking, log) ── */
  const avgScore = successPages.length
    ? Math.round(successPages.reduce((sum, r) => sum + (r.signals?.page_score || 0), 0) / successPages.length)
    : null;

  let savedAuditId = auditId;
  try {
    /* Build proper sections — not a 500-char blob. Each section
       carries the data a strategist needs: scores, per-page detail,
       the full synthesis, the algorithm topics applied. The synthesis
       block itself uses the same shape as run-analysis so the reader
       code is uniform across audit sources. */
    const perPage = successPages.map((p: any) => ({
      url:        p.url,
      score:      p.score ?? p.signals?.confidence ?? null,
      signals:    p.signals || {},
      issues:     p.signals?.issues || [],
      strengths:  p.signals?.strengths || [],
      opportunities: p.signals?.opportunities || [],
    }));

    /* Try to parse the synthesis text for the structured pieces the
       UI surfaces — verdict, biggest win, urgent gap, opportunities.
       The synthesis is markdown-ish text; we extract what we can. */
    const synthLower = (synthesis || "").toLowerCase();
    const extractAfter = (heading: string): string => {
      const idx = synthLower.indexOf(heading.toLowerCase());
      if (idx < 0) return "";
      const after = synthesis.slice(idx + heading.length);
      const next = after.search(/\n#{1,3}\s|\n\*\*[A-Z]/);
      return (next > 0 ? after.slice(0, next) : after).trim().slice(0, 600);
    };
    const sectionsRich = {
      synthesis: {
        overall_verdict:       extractAfter("Overall verdict")
                            || extractAfter("Verdict")
                            || (synthesis || "").slice(0, 600),
        biggest_verified_win:  extractAfter("Biggest verified win")
                            || extractAfter("Biggest win"),
        most_urgent_gap:       extractAfter("Most urgent gap")
                            || extractAfter("Urgent gap"),
        verified_strengths:    [],
        growth_opportunities:  [],
        full_text:             synthesis || "",
      },
      technical:  { data: { summary: perPage.map(p => `${p.url}: ${p.issues?.length || 0} issues, ${p.strengths?.length || 0} strengths`).join("; ") }},
      content:    { data: { summary: "" }},
      visibility: { data: { summary: "" }},
      ranking:    { data: { competitor_comparison: "" }},
      per_page:   perPage,
    };

    const { data } = await db().from("audit_reports").insert({
      project_id:    projectId,
      url:           pages[0]?.url || "",
      keywords:      Array.from(new Set(pages.flatMap(p => p.targetKeywords || []))).slice(0, 20),
      competitors:   [],   // orchestrator gets competitors via projectContext string, not structured per-page
      sections:      sectionsRich,
      overall_score: avgScore,
      data_sources:  { mode, algo_topics_used: algoTopics.length, pages_audited: successPages.length, pages_failed: pageResults.filter(r => r.status === "failed").length },
      saved_by:      "orchestrator",
      created_at:    new Date().toISOString(),
    }).select("id").single();
    if (data) savedAuditId = (data as any).id;
  } catch (e: any) {
    console.error("[orchestrator] audit_reports insert failed:", e?.message || e);
  }

  await runPostAuditPipeline({
    projectId,
    auditId: savedAuditId,
    url:     pages[0]?.url || "",
    sections: synthesis ? { synthesis } : {},
    score:   avgScore,
  });

  const totalLearnings = pageResults.reduce((sum, r) => sum + r.learningSaved, 0);
  emit(onProgress, { type: "pipeline_done", summary: `Pipeline complete. ${totalLearnings} learnings saved.` });

  const result: OrchestratorResult = {
    auditId: savedAuditId,
    projectId,
    pages: pageResults,
    score: avgScore ?? 0,
    totalLearnings,
    synthesis,
    timestamp: new Date().toISOString(),
  };

  emit(onProgress, {
    type: "complete",
    summary: `Audit complete. Score: ${avgScore ?? "n/a"}/100. Learnings: ${totalLearnings}.`,
  });
  return result;
}
