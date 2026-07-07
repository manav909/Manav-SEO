/* ════════════════════════════════════════════════════════════════
   api/lib/aeo-article-engine.ts

   Drafts an AEO (Answer Engine Optimization) article — content shaped to
   be cited by AI answer engines and to win featured snippets.

   Honesty design:
   - GROUNDED: it pulls the real SERP for the topic (People-Also-Ask
     questions, AI-Overview citations, featured-snippet owner) and writes
     the article to answer those actual questions. Without a SerpAPI key it
     still drafts, but says plainly it is ungrounded and weaker for it.
   - NO FABRICATION: the model is forbidden to invent statistics, prices,
     dates, or claims. Where a real figure would help, it inserts an
     [ADD SOURCE] marker for the operator — it never makes one up.
   - It is a DRAFT for human review, and publishing is CMS-dependent. Both
     are stated in the output, never implied as "done and live".

   Generation runs through llmComplete, so it is metered and never
   truncated mid-article.
═══════════════════════════════════════════════════════════════ */

import { fetchSerpFeatures } from "./serpapi.js";
import { llmComplete } from "./workspace/llm.js";

type Depth = "brief" | "standard" | "deep";
const DEPTH_TOKENS: Record<Depth, number> = { brief: 2500, standard: 5000, deep: 8000 };

export async function draftAeoArticle(opts: {
  projectId: string;
  topic: string;
  siteUrl?: string;
  clientContext?: string;
  country?: string;
  depth?: Depth;
}): Promise<{
  ok: boolean;
  topic: string;
  title: string;
  meta_description: string;
  article_markdown: string;
  faq: Array<{ q: string; a: string }>;
  suggested_schema: any[];
  grounded_on: string[];
  notes: string[];
}> {
  const topic = (opts.topic || "").trim();
  const depth = opts.depth || "standard";
  const base = { ok: false, topic, title: "", meta_description: "", article_markdown: "", faq: [] as any[], suggested_schema: [] as any[], grounded_on: [] as string[], notes: [] as string[] };
  if (!topic) return { ...base, notes: ["Supply a topic or target keyword to draft an article."] };

  /* Real SERP grounding. */
  const serp = await fetchSerpFeatures(topic, opts.projectId, { country: opts.country || "us" }).catch(() => null);
  const paa = (serp?.paa_questions || []).slice(0, 8);
  const grounded: string[] = [];
  const serpNotes: string[] = [];
  if (serp) {
    if (paa.length) grounded.push(`${paa.length} real People-Also-Ask question(s) from the live SERP`);
    if (serp.ai_overview) grounded.push(`AI Overview present for this query${serp.ai_overview_reference_count ? ` (cites ${serp.ai_overview_reference_count} source[s])` : ""} — structured to be citable`);
    if (serp.featured_snippet) grounded.push(`featured snippet present${serp.featured_snippet_owner ? ` (held by ${serp.featured_snippet_owner})` : ""} — structured to compete for it`);
  } else {
    serpNotes.push("No SERP data was available (add a SerpAPI key to ground the article in real ranking questions). Drafted from the topic and client context — weaker targeting without it.");
  }

  const serpBlock = [
    paa.length ? `Real People-Also-Ask questions to answer directly (each becomes an H2 and an FAQ entry):\n${paa.map(q => `- ${q}`).join("\n")}` : "",
    serp?.ai_overview && serp.ai_overview_references?.length ? `The AI Overview for this query cites: ${serp.ai_overview_references.map(r => r.domain).slice(0, 6).join(", ")}. Match that depth and directness so this article is citable too.` : "",
    serp?.featured_snippet_owner ? `The featured snippet is currently held by ${serp.featured_snippet_owner}; open with a crisp, snippet-shaped answer to beat it.` : "",
  ].filter(Boolean).join("\n\n");

  const system = [
    "You are a senior AEO (Answer Engine Optimization) writer. You write articles built to be cited by AI answer engines (Google AI Overviews, ChatGPT, Perplexity) and to win featured snippets.",
    "STRUCTURE: open with a direct, self-contained answer to the core question in 2-3 sentences (snippet-shaped). Then depth: each real People-Also-Ask question becomes an H2 answered directly and concisely first, then expanded. Scannable — short paragraphs, clear headings, lists where they help.",
    "GROUNDING AND HONESTY (non-negotiable):",
    "- Do NOT invent statistics, prices, dates, study results, or specific claims. If a real figure would strengthen a point, write an [ADD SOURCE: what is needed] marker for the operator to fill — never fabricate the number.",
    "- Write accurate, genuinely useful content a knowledgeable human would stand behind. No fluff, no keyword stuffing, no false authority.",
    "- Stay on the client and topic; use the client context where given, but do not assert client facts that were not provided.",
    "Return ONLY raw JSON, no markdown fences, in exactly this shape:",
    `{"title":"<compelling, accurate, <=60 chars>","meta_description":"<<=155 chars>","article_markdown":"<full article in markdown with ## H2s>","faq":[{"q":"<question>","a":"<concise answer>"}],"human_todo":"<one line: what a human must check or add before publishing>"}`,
  ].join("\n");

  const user = [
    `Topic / target keyword: ${topic}`,
    opts.siteUrl ? `Client site: ${opts.siteUrl}` : "",
    opts.clientContext ? `Client context (use only what is stated here for client-specific claims):\n${opts.clientContext}` : "",
    serpBlock ? `\nLive SERP grounding:\n${serpBlock}` : "\nNo live SERP grounding available — answer the topic thoroughly and note where ranking-question research would sharpen it.",
    "\nWrite the article now, at full depth, as valid JSON only.",
  ].filter(Boolean).join("\n");

  const { text } = await llmComplete({ system, user, maxTokens: DEPTH_TOKENS[depth], timeoutMs: 90000, label: "aeo-article", maxSegments: 3 });

  /* Parse JSON safely; if the model returns prose, keep it as the article body
     rather than failing. Never fabricate structure that is not there. */
  let parsed: any = null;
  try { parsed = JSON.parse(String(text || "").replace(/```json|```/g, "").trim()); } catch { parsed = null; }

  const title = parsed?.title || topic;
  const meta_description = parsed?.meta_description || "";
  const article_markdown = parsed?.article_markdown || String(text || "").trim();
  const faq: Array<{ q: string; a: string }> = Array.isArray(parsed?.faq)
    ? parsed.faq.filter((f: any) => f && f.q && f.a).map((f: any) => ({ q: String(f.q), a: String(f.a) }))
    : [];
  const humanTodo = parsed?.human_todo || "Review every factual claim, fill any [ADD SOURCE] markers with real citations, and set the brand voice before publishing.";

  /* Deterministic suggested schema from the generated, grounded FAQ + article. */
  const suggested_schema: any[] = [];
  if (faq.length) {
    suggested_schema.push({
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }
  suggested_schema.push({
    "@context": "https://schema.org", "@type": "Article",
    headline: title, description: meta_description || undefined,
  });

  const hasSourceMarkers = /\[ADD SOURCE/i.test(article_markdown);
  return {
    ok: !!article_markdown,
    topic, title, meta_description, article_markdown, faq, suggested_schema,
    grounded_on: grounded,
    notes: [
      `DRAFT for review — ${humanTodo}`,
      ...(hasSourceMarkers ? ["Contains [ADD SOURCE] markers: the writer flagged where a real statistic or citation is needed rather than inventing one. Fill these before publishing."] : []),
      ...serpNotes,
      "Publishing is CMS-dependent: auto-push where a CMS API is connected (e.g. Webflow), otherwise paste into the CMS and add the suggested JSON-LD to the page head.",
    ],
  };
}
