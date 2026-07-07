/* ════════════════════════════════════════════════════════════════
   api/lib/offsite-qa-engine.ts

   Finds REAL questions people are asking on Reddit and Quora about a
   topic, and drafts genuinely helpful answers for the operator to review
   and post manually.

   Honesty design (per "no synthesis in any module"):
   - The QUESTIONS are real. They come from a live SerpAPI search and each
     carries its actual thread URL — the operator can click through and
     verify every one. If the search returns nothing (or no key), the
     engine returns nothing. It NEVER invents a question or a URL.
   - The DRAFTS are clearly labelled drafts. The model may not fabricate
     facts, stats, or product claims — it uses [ADD SOURCE] markers. It
     writes genuine value, not a hidden advert.
   - POSTING IS MANUAL AND DISCLOSED. Reddit and Quora require disclosing a
     commercial relationship; undisclosed promotion breaks their rules and
     is astroturfing. The engine never posts; every output says so.

   Drafting runs through the metered llmComplete.
═══════════════════════════════════════════════════════════════ */

import { findForumQuestions } from "./serpapi.js";
import { llmComplete } from "./workspace/llm.js";

export async function draftOffsiteQa(opts: {
  projectId: string;
  topic: string;
  clientContext?: string;
  siteUrl?: string;
  country?: string;
  maxQuestions?: number;
}): Promise<{
  ok: boolean;
  topic: string;
  questions: Array<{ question: string; url: string; source: string; snippet: string; draft_answer: string }>;
  summary: string;
  notes: string[];
}> {
  const topic = (opts.topic || "").trim();
  const max = Math.max(1, Math.min(opts.maxQuestions || 6, 15));
  const base = { ok: false, topic, questions: [] as any[], summary: "", notes: [] as string[] };
  if (!topic) return { ...base, summary: "Supply a topic to search for real questions.", notes: ["topic required."] };

  /* 1. REAL questions only — from a live search, each with a verifiable URL. */
  const found = await findForumQuestions(topic, opts.projectId, { country: opts.country, limit: max });
  if (found.error && !found.questions.length) {
    return { ...base, summary: `No real questions retrieved: ${found.error}. Nothing is invented — connect SerpAPI or try a different topic.`, notes: [found.error] };
  }
  if (!found.questions.length) {
    return { ...base, summary: `No Reddit or Quora threads found for "${topic}". Nothing invented — try a broader or different phrasing.`, notes: ["No matching real threads in the search results."] };
  }

  /* 2. Draft an answer per REAL question in one grounded pass. */
  const system = [
    "You draft genuinely helpful answers to real questions asked on Reddit and Quora, for an expert to review and post manually.",
    "Write real value first — answer the person's actual question directly and usefully, the way a knowledgeable, generous human would.",
    "HONESTY (non-negotiable):",
    "- Never fabricate a statistic, price, date, or product claim. Where a real figure would help, write [ADD SOURCE: what is needed] for the operator to fill — never invent it.",
    "- Mention the client or its site ONLY where it is genuinely relevant to answering, and never as a disguised advert. If you mention it, add a brief '(disclosure: I work with them)' note in the draft so the operator posts it honestly.",
    "- Match the platform: Reddit answers are conversational and direct; Quora answers can be a little more structured.",
    "Return ONLY raw JSON: an array of objects {\"url\":\"<the question url exactly as given>\",\"draft_answer\":\"<the answer>\"}. No markdown fences.",
  ].join("\n");
  const user = [
    opts.clientContext ? `Client context (use only what is stated here for any client-specific claim):\n${opts.clientContext}\n` : "",
    opts.siteUrl ? `Client site: ${opts.siteUrl}\n` : "",
    `Draft one answer for each of these REAL questions (keep the url exactly):`,
    ...found.questions.map((q, i) => `${i + 1}. [${q.source}] ${q.question}\n   url: ${q.url}${q.snippet ? `\n   context: ${q.snippet}` : ""}`),
    `\nReturn the JSON array now.`,
  ].filter(Boolean).join("\n");

  const { text } = await llmComplete({ system, user, maxTokens: 8000, timeoutMs: 90000, label: "offsite-qa", maxSegments: 3 });
  let drafts: any[] = [];
  try { drafts = JSON.parse(String(text || "").replace(/```json|```/g, "").trim()); } catch { drafts = []; }
  const draftByUrl = new Map<string, string>();
  if (Array.isArray(drafts)) for (const d of drafts) if (d && d.url && d.draft_answer) draftByUrl.set(String(d.url), String(d.draft_answer));

  const questions = found.questions.map(q => ({ ...q, draft_answer: draftByUrl.get(q.url) || "" }));
  const drafted = questions.filter(q => q.draft_answer).length;

  return {
    ok: true,
    topic,
    questions,
    summary: `${questions.length} real question(s) found on Reddit/Quora for "${topic}", ${drafted} with a draft answer. Every question links to a live thread you can open and verify. Posting is manual and must be disclosed — the engine never posts.`,
    notes: [
      "Questions are real search results (verify each by opening its URL) — none are invented.",
      "Answers are DRAFTS: review for accuracy, fill any [ADD SOURCE] markers, and match your voice before posting.",
      "Post manually and disclose any commercial relationship — Reddit and Quora prohibit undisclosed promotion, and undisclosed posting is astroturfing that gets accounts banned.",
    ],
  };
}
