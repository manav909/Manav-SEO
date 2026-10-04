/* ════════════════════════════════════════════════════════════════
   api/lib/ai-visibility.ts
   How AI assistants answer the questions real customers ask.

   • Questions come from the project's own Search Console searches
     (the words people already use to find the business), plus one
     "tell me about <business>" question; the team can replace them.
   • Each question goes to every AI assistant that has an API key set:
       ChatGPT  OPENAI_API_KEY      (OPENAI_VISIBILITY_MODEL, default gpt-4o-mini)
       Perplexity PERPLEXITY_API_KEY (searches the web, returns sources)
       Gemini   GEMINI_API_KEY      (GEMINI_VISIBILITY_MODEL, default gemini-2.0-flash)
       Claude   ANTHROPIC_API_KEY
     Assistants without a key are skipped and shown as "not checked" —
     we never guess an answer.
   • We record whether the business is named and whether its website
     appears in the answer or its sources. Runs at most weekly per
     project (nightly job) for plans with AI visibility switched on.

   Tables: supabase-migrations/ai_visibility.sql
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { withClientSession } from "./brand-studio-client.js";
import { getPanelPlan } from "./panel-plans.js";

const MIGRATION_HINT = "AI visibility isn't set up yet. Run supabase-migrations/ai_visibility.sql in the Supabase SQL editor.";
const TIMEOUT_MS = 25_000;
const MAX_QUESTIONS = 5;

export const ENGINES = [
  { key: "chatgpt",    label: "ChatGPT",    env: "OPENAI_API_KEY",     web: false },
  { key: "perplexity", label: "Perplexity", env: "PERPLEXITY_API_KEY", web: true },
  { key: "gemini",     label: "Gemini",     env: "GEMINI_API_KEY",     web: false },
  { key: "claude",     label: "Claude",     env: "ANTHROPIC_API_KEY",  web: false },
] as const;

export function enabledEngines() {
  return ENGINES.filter((e) => !!process.env[e.env]);
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);
}

/** Ask one engine one question → answer text + any source URLs. */
async function ask(engine: string, question: string): Promise<{ text: string; sources: string[] }> {
  const system = "Answer the user's question helpfully and concisely, the way you normally would. Name specific businesses where relevant.";
  if (engine === "chatgpt") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_VISIBILITY_MODEL || "gpt-4o-mini", max_tokens: 500, messages: [{ role: "system", content: system }, { role: "user", content: question }] }),
    });
    if (!r.ok) throw new Error(`chatgpt_${r.status}`);
    const j: any = await r.json();
    return { text: String(j?.choices?.[0]?.message?.content || ""), sources: [] };
  }
  if (engine === "perplexity") {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.PERPLEXITY_VISIBILITY_MODEL || "sonar", max_tokens: 500, messages: [{ role: "system", content: system }, { role: "user", content: question }] }),
    });
    if (!r.ok) throw new Error(`perplexity_${r.status}`);
    const j: any = await r.json();
    const sources = [
      ...(Array.isArray(j?.citations) ? j.citations : []),
      ...(Array.isArray(j?.search_results) ? j.search_results.map((s: any) => s?.url) : []),
    ].filter((u: any) => typeof u === "string");
    return { text: String(j?.choices?.[0]?.message?.content || ""), sources: [...new Set(sources)] as string[] };
  }
  if (engine === "gemini") {
    const model = process.env.GEMINI_VISIBILITY_MODEL || "gemini-2.0-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY || "")}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: question }] }], generationConfig: { maxOutputTokens: 500 } }),
    });
    if (!r.ok) throw new Error(`gemini_${r.status}`);
    const j: any = await r.json();
    return { text: (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || "").join(""), sources: [] };
  }
  if (engine === "claude") {
    const { callLLM } = await import("./llm-client.js");
    const r = await callLLM({ tier: "economy", system, maxTokens: 500, messages: [{ role: "user", content: question }], engine: "ai_visibility" });
    if (!r.ok) throw new Error(r.error || "claude_error");
    return { text: r.text, sources: [] };
  }
  throw new Error("unknown engine");
}

/* ─── Detecting the business ─────────────────────────────────── */

export function brandTerms(project: { name?: string; url?: string }) {
  const host = String(project.url || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase();
  const name = String(project.name || "").toLowerCase().replace(/\b(llc|inc|ltd|co|pllc|corp)\b\.?/g, "").replace(/[^\p{L}\p{N}\s&'-]/gu, " ").replace(/\s+/g, " ").trim();
  return { name, host };
}

export function detect(text: string, sources: string[], terms: { name: string; host: string }) {
  const t = text.toLowerCase();
  const mentioned = (!!terms.name && terms.name.length > 2 && t.includes(terms.name)) || (!!terms.host && t.includes(terms.host));
  const linked = !!terms.host && (t.includes(terms.host) || sources.some((s) => String(s).toLowerCase().includes(terms.host)));
  return { mentioned, linked };
}

/* ─── Questions ───────────────────────────────────────────────── */

export async function questionsFor(projectId: string): Promise<string[]> {
  const { data: custom } = await db().from("ai_visibility_questions").select("questions").eq("project_id", projectId).maybeSingle();
  const list = ((custom as any)?.questions || []).map((q: any) => String(q || "").trim()).filter(Boolean);
  if (list.length) return list.slice(0, MAX_QUESTIONS);

  const { data: project } = await db().from("projects").select("name,url,market,industry").eq("id", projectId).maybeSingle();
  const p = (project || {}) as any;
  const terms = brandTerms(p);
  const { data: kq } = await db().from("project_knowledge").select("field_value")
    .eq("project_id", projectId).eq("category", "analytics").eq("field_key", "gsc_top_queries").maybeSingle();
  let rows: any[] = [];
  try { rows = JSON.parse(String((kq as any)?.field_value || "[]")); } catch { rows = []; }
  /* Non-brand searches only — people who don't know the business yet. */
  const searches = (Array.isArray(rows) ? rows : [])
    .map((r) => String(r?.query || "").trim())
    .filter((q) => q && !(terms.name && q.toLowerCase().includes(terms.name)) && !(terms.host && q.toLowerCase().includes(terms.host.split(".")[0])))
    .slice(0, 3);
  const qs = searches.map((q) => `I'm looking for ${q}. Which businesses would you recommend, and why?`);
  if (p.name) qs.push(`What can you tell me about ${p.name}${p.market ? ` in ${p.market}` : ""}? Are they any good?`);
  if (qs.length < 2 && p.industry) qs.unshift(`Who are the best ${p.industry} businesses${p.market ? ` in ${p.market}` : ""}?`);
  return qs.slice(0, MAX_QUESTIONS);
}

/* ─── Running a check ─────────────────────────────────────────── */

export async function runVisibility(projectId: string, opts: { questions?: string[] } = {}) {
  const engines = enabledEngines();
  if (!engines.length) return { success: false, error: "No AI assistant keys are set. Add OPENAI_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY in Vercel." };
  const { data: project } = await db().from("projects").select("name,url").eq("id", projectId).maybeSingle();
  if (!project) return { success: false, error: "Project not found" };
  const terms = brandTerms(project as any);
  const questions = (opts.questions?.length ? opts.questions : await questionsFor(projectId)).slice(0, MAX_QUESTIONS);
  if (!questions.length) return { success: false, error: "No questions yet — connect Search Console or add questions for this client." };

  const runId = `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
  const jobs = engines.flatMap((e) => questions.map((q) => ({ engine: e.key, question: q })));
  const results = await Promise.all(jobs.map(async (j) => {
    try {
      const a = await withTimeout(ask(j.engine, j.question));
      const d = detect(a.text, a.sources, terms);
      return { ...j, ...d, excerpt: a.text.slice(0, 600), sources: a.sources.slice(0, 10), error: null };
    } catch (e: any) {
      return { ...j, mentioned: false, linked: false, excerpt: null, sources: [], error: String(e?.message || "failed").slice(0, 120) };
    }
  }));
  const { error } = await db().from("ai_visibility_checks").insert(results.map((r) => ({ project_id: projectId, run_id: runId, ...r })));
  if (error) return { success: false, error: /ai_visibility_checks/.test(error.message || "") ? MIGRATION_HINT : error.message };
  const ok = results.filter((r) => !r.error);
  return { success: true, runId, engines: engines.map((e) => e.key), checked: ok.length, mentioned: ok.filter((r) => r.mentioned).length, failed: results.length - ok.length };
}

/** Summary shaped for the client page: latest run + a score per run. */
export async function visibilitySummary(projectId: string) {
  const { data, error } = await db().from("ai_visibility_checks")
    .select("run_id,engine,question,mentioned,linked,excerpt,sources,error,created_at")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(400);
  if (error) return { runs: [], latest: null };
  const rows = ((data || []) as any[]).filter((r) => !r.error);
  const byRun: Record<string, any[]> = {};
  for (const r of rows) (byRun[r.run_id] ||= []).push(r);
  const runs = Object.entries(byRun).map(([id, rs]) => ({
    id, at: rs[0].created_at, total: rs.length, mentioned: rs.filter((r) => r.mentioned).length, linked: rs.filter((r) => r.linked).length,
  })).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const latestId = runs[runs.length - 1]?.id;
  const latestRows = latestId ? byRun[latestId] : [];
  const engines = [...new Set(latestRows.map((r) => r.engine))];
  const questions = [...new Set(latestRows.map((r) => r.question))];
  return {
    runs,
    latest: latestId ? {
      at: runs[runs.length - 1].at,
      engines: engines.map((e) => ({ key: e, label: ENGINES.find((x) => x.key === e)?.label || e, web: ENGINES.find((x) => x.key === e)?.web || false })),
      notChecked: ENGINES.filter((e) => !engines.includes(e.key)).map((e) => e.label),
      questions: questions.map((q) => ({
        question: q,
        answers: engines.map((e) => {
          const r = latestRows.find((x) => x.engine === e && x.question === q);
          return { engine: e, mentioned: !!r?.mentioned, linked: !!r?.linked, excerpt: r?.excerpt || "" };
        }),
      })),
    } : null,
  };
}

/** Nightly: projects with AI visibility switched on, at most once a week. */
export async function aiVisibilityCronTick() {
  if (!enabledEngines().length) return { skipped: "no engine keys" };
  const { data } = await db().from("project_entitlements").select("project_id").eq("client_portal_enabled", true).limit(300);
  let ran = 0;
  for (const { project_id } of (data || []) as any[]) {
    const panel = await getPanelPlan(project_id);
    if (!panel.features.ai_visibility) continue;
    const { data: last } = await db().from("ai_visibility_checks").select("created_at").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1);
    const lastAt = (last as any[])?.[0]?.created_at;
    if (lastAt && Date.now() - new Date(lastAt).getTime() < 6.5 * 86400_000) continue;
    const r = await runVisibility(project_id).catch(() => null);
    if (r?.success) ran++;
    if (ran >= 20) break;   /* stay well inside the cron's time limit */
  }
  return { ran };
}

/* ─── Actions ─────────────────────────────────────────────────── */

async function cpAiVisibility(body: any) {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error: error || "Please sign in again.", code: "session" };
  const panel = await getPanelPlan(user.project_id);
  if (!panel.features.ai_visibility) return { success: false, error: "This isn't part of your plan yet.", code: "not_in_plan" };
  return { success: true, ...(await visibilitySummary(user.project_id)) };
}

export async function handleAiVisibility(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "cp_ai_visibility": return cpAiVisibility(body);
    case "cps_ai_visibility_get": {
      const pid = String(body?.projectId || "");
      if (!pid) return { success: false, error: "projectId required" };
      return { success: true, engines: enabledEngines().map((e) => e.key), questions: await questionsFor(pid), ...(await visibilitySummary(pid)) };
    }
    case "cps_ai_visibility_run": {
      const pid = String(body?.projectId || "");
      if (!pid) return { success: false, error: "projectId required" };
      const qs = Array.isArray(body?.questions) ? body.questions.map((q: any) => String(q || "").trim().slice(0, 300)).filter(Boolean) : undefined;
      return runVisibility(pid, { questions: qs });
    }
    case "cps_ai_visibility_questions": {
      const pid = String(body?.projectId || "");
      const qs = (Array.isArray(body?.questions) ? body.questions : []).map((q: any) => String(q || "").trim().slice(0, 300)).filter(Boolean).slice(0, MAX_QUESTIONS);
      if (!pid) return { success: false, error: "projectId required" };
      const { error } = await db().from("ai_visibility_questions").upsert({ project_id: pid, questions: qs, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
      return error ? { success: false, error: /ai_visibility_questions/.test(error.message) ? MIGRATION_HINT : error.message } : { success: true, questions: qs };
    }
    default: return null;
  }
}
