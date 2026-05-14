/* ═══════════════════════════════════════════════════════════
   /api/audit-orchestrator — page-aware, algorithm-driven audit.

   POST body:
   {
     projectId:  string           (required)
     urls:       string[]         (required, max 10)
     pageSpecs?: PageSpec[]       (optional — per-page keyword + question overrides)
     mode?:      "quick"|"standard"|"deep"   (default: standard)
   }

   If pageSpecs not provided: every URL gets the site-level keywords.

   Streams NDJSON — one event per line:
   { type: "start"|"page_crawling"|"page_analysing"|"page_done"|
           "page_failed"|"synthesizing"|"pipeline_done"|"complete",
     url?, progress?, result?, summary?, timestamp }
═══════════════════════════════════════════════════════════ */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./_lib/db";
import { runAuditOrchestrator } from "./_lib/audit-orchestrator";
import type { PageSpec } from "./_lib/audit-orchestrator";
import type { AlgoTopic } from "./_lib/types";

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _handler(req, res); }
  catch (e: any) {
    try {
      res.status(200).json({ error: "Unexpected: " + (e?.message || "unknown"), healthy: false });
    } catch (_) {}
  }
}

async function _handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });

  const { projectId, urls, pageSpecs, mode = "standard" } = req.body;

  if (!projectId)                                 return res.status(200).json({ error: "projectId required" });
  if (!Array.isArray(urls) || !urls.length)       return res.status(200).json({ error: "urls array required" });
  if (!["quick", "standard", "deep"].includes(mode)) return res.status(200).json({ error: "mode must be quick|standard|deep" });

  /* ── Load project + algo knowledge from DB ── */
  const [projectR, algoR] = await Promise.allSettled([
    db()
      .from("projects")
      .select("name,industry,goals,keywords,competitors,url,cms")
      .eq("id", projectId)
      .single(),
    db()
      .from("algorithm_knowledge")
      .select("id,topic,summary,freshness_score,impact_level,engine")
      .order("freshness_score", { ascending: false })
      .limit(8),
  ]);

  const project = projectR.status === "fulfilled" ? (projectR.value.data as any) : null;

  const algoTopics: AlgoTopic[] = algoR.status === "fulfilled"
    ? (algoR.value.data || []).map((a: any) => ({
        id:              a.id,
        topic:           a.topic           || "",
        summary:         a.summary         || "",
        freshness_score: a.freshness_score ?? 5,
        impact_level:    (a.freshness_score ?? 5) >= 7 ? "high"
                       : (a.freshness_score ?? 5) >= 4 ? "medium" : "low",
        engine:          a.engine          || "google",
      }))
    : [];

  /* ── Build concise project context string ── */
  const projectContext = project
    ? [
        `Project: ${project.name || "Unknown"}`,
        project.industry ? `Industry: ${project.industry}` : "",
        project.goals    ? `Goals: ${String(project.goals).slice(0, 200)}` : "",
        (project.competitors || []).length
          ? `Competitors: ${(project.competitors as string[]).slice(0, 5).join(", ")}`
          : "",
        (project.keywords || []).length
          ? `Site keywords: ${(project.keywords as string[]).slice(0, 10).join(", ")}`
          : "",
        project.cms ? `CMS: ${project.cms}` : "",
      ].filter(Boolean).join(" | ")
    : `Project: ${projectId}`;

  /* ── Build page specs ── */
  const siteKeywords: string[] = (project?.keywords || []).slice(0, 5);

  const pages: PageSpec[] = Array.isArray(pageSpecs) && pageSpecs.length
    ? pageSpecs.map((ps: any) => ({
        url:            ps.url?.startsWith("http") ? ps.url : `https://${ps.url}`,
        targetKeywords: Array.isArray(ps.targetKeywords) ? ps.targetKeywords : siteKeywords,
        contentType:    ps.contentType,
        questions:      Array.isArray(ps.questions) ? ps.questions : undefined,
        notes:          ps.notes,
      }))
    : urls.slice(0, 10).map((url: string) => ({
        url: url.startsWith("http") ? url : `https://${url}`,
        targetKeywords: siteKeywords,
      }));

  /* ── Start streaming NDJSON ── */
  res.writeHead(200, {
    "Content-Type":     "application/x-ndjson",
    "X-Accel-Buffering": "no",
    "Cache-Control":    "no-cache, no-transform",
    "Transfer-Encoding": "chunked",
  });

  await runAuditOrchestrator({
    projectId,
    pages,
    projectContext,
    algoTopics,
    mode: mode as "quick" | "standard" | "deep",
    onProgress: (event) => {
      try { res.write(JSON.stringify(event) + "\n"); } catch (_) {}
    },
  });

  res.end();
}
