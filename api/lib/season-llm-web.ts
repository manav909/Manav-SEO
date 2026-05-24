/* ════════════════════════════════════════════════════════════════
   api/lib/season-llm-web.ts
   Phase 11 — Web-enabled S.E.A.S.O.N. brain.

   Wraps the Anthropic Messages API with the web_search tool enabled.
   The model can run multiple searches per query, read snippets, and
   cite sources. Citations come back as URL+title pairs that the
   frontend can render as clickable pills.

   When to call this vs. the regular seasonLlmHandle:
     • User asks about live external info: news, current pricing,
       algorithm updates, competitor moves, industry trends
     • The orchestrator's web-intent router catches this and routes here

   COST: each web call is more expensive than a plain LLM call. The
   same daily_llm_cap applies — web calls count the same. Track them.

   HONESTY: if web access is disabled in settings, we never call this
   path. If the search returns nothing useful, we say so plainly.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { PLATFORM_SELF_KNOWLEDGE } from "./season-self-knowledge.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const DAILY_CAP = Number(process.env.SEASON_LLM_DAILY_CAP || 50);
const MODEL     = "claude-sonnet-4-6";
const MAX_TOK   = 3000;
const MAX_USES  = 5;  // max web_search calls per response

/* ─── Public types ───────────────────────────────────────────── */

export interface WebCitation {
  url:    string;
  title?: string;
  cited_text?: string;
}

export interface WebLlmResponse {
  intent:        string;
  confidence:    number;
  chunks:        Array<{ kind: string; content: string; detail?: any }>;
  artifacts?:    Array<{ kind: string; title: string; body: string }>;
  actions?:      Array<{ id: string; label: string; payload?: any }>;
  honest_note?:  string;
  sources_used:  string[];   // includes "web_search" when web was actually used
  citations:     WebCitation[];
  web_used:      boolean;
  rate_limited?: boolean;
}

/* ─── Main entry ─────────────────────────────────────────────── */

export async function seasonLlmWebHandle(opts: {
  projectId: string;
  input: string;
  awareness?: any;
  projectContextBundle?: string;  // pre-built context block from regular gatherContext
  priorTurns?: Array<{ input: string; responseText: string }>;
}): Promise<WebLlmResponse> {
  const { projectId, input, awareness, projectContextBundle, priorTurns } = opts;

  if (!ANTHROPIC_API_KEY) {
    return softFail("Web access requires ANTHROPIC_API_KEY (currently missing). Ask your admin to set it in Vercel env.", "no_api_key");
  }
  const used = await countCallsToday(projectId);
  if (used >= DAILY_CAP) {
    return rateLimited(used);
  }

  const systemPrompt = buildWebSystemPrompt();
  const userMessage  = buildWebUserMessage(input, awareness, projectContextBundle);

  /* Phase 21 Block 2.5c — V2 conversation memory for web-routed turns.
     Same pattern as season-llm.ts: prepend up to 6 prior {user, assistant}
     pairs as native messages so the model has actual continuity. */
  const messagesPayload: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (Array.isArray(priorTurns) && priorTurns.length > 0) {
    for (const t of priorTurns.slice(-6)) {
      if (!t?.input || !t?.responseText) continue;
      messagesPayload.push({ role: 'user',      content: String(t.input).slice(0, 2000) });
      messagesPayload.push({ role: 'assistant', content: String(t.responseText).slice(0, 4000) });
    }
  }
  messagesPayload.push({ role: 'user', content: userMessage });

  /* ─── Call Anthropic with web_search tool enabled ─── */
  let raw: any;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOK,
        system: systemPrompt,
        messages: messagesPayload,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: MAX_USES,
        }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return softFail(`Anthropic web-search returned ${res.status}. Body: ${body.slice(0, 200)}`, "anthropic_error");
    }
    raw = await res.json();
  } catch (e: any) {
    return softFail(`Network error reaching Anthropic web search: ${e?.message || "unknown"}`, "network_error");
  }

  /* ─── Parse: extract text + citations from response content ─── */
  const text = (raw?.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  const citations: WebCitation[] = [];
  for (const block of (raw?.content || [])) {
    if (block.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c.type === "web_search_result_location" && c.url) {
          citations.push({
            url:        c.url,
            title:      c.title || undefined,
            cited_text: c.cited_text ? String(c.cited_text).slice(0, 240) : undefined,
          });
        }
      }
    }
  }
  /* Dedupe citations by URL */
  const seenUrls = new Set<string>();
  const dedupedCitations: WebCitation[] = [];
  for (const c of citations) {
    if (seenUrls.has(c.url)) continue;
    seenUrls.add(c.url);
    dedupedCitations.push(c);
  }

  /* Did the model actually call web_search? */
  const webUsed = (raw?.content || []).some((b: any) =>
    b.type === "tool_use" && b.name === "web_search"
  );

  if (!text) {
    return softFail("Web search returned no text response. Strange but recoverable. Try rephrasing.", "empty_response");
  }

  /* Parse the JSON envelope */
  let parsed: any;
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    /* Non-JSON response — wrap as plain chunk. Intent is "unknown" rather
       than guessed; we couldn't even parse the response, so claiming we
       know its intent would be synthesis-as-fact. honest_note flags the
       degradation; downstream code can route on intent === "unknown". */
    return {
      intent: "unknown",
      confidence: 0.55,
      chunks: [{ kind: "plain", content: text.slice(0, 2000) }],
      sources_used: webUsed ? ["web_search"] : [],
      citations: dedupedCitations,
      web_used: webUsed,
      honest_note: "I answered from web sources but couldn't structure my output cleanly. Citations are below.",
    };
  }

  /* Log the call */
  try {
    await db().from("activity_log").insert({
      project_id: projectId,
      event_type: "intent_handled",
      source:     "llm",
      headline:   `Web brain handled: "${input.slice(0, 80)}${input.length > 80 ? '…' : ''}"`,
      detail:     `Intent: ${parsed?.intent || 'unknown'} · web_used: ${webUsed} · citations: ${dedupedCitations.length}`,
      technical:  { input, intent: parsed?.intent, web_used: webUsed, citation_count: dedupedCitations.length, tokens_in: raw?.usage?.input_tokens, tokens_out: raw?.usage?.output_tokens },
      severity:   "info",
    });
  } catch { /* non-fatal */ }

  return {
    intent:        String(parsed.intent || "unknown"),
    confidence:    Number(parsed.confidence ?? 0.7),
    chunks:        Array.isArray(parsed.chunks) ? parsed.chunks.slice(0, 12) : [],
    artifacts:     Array.isArray(parsed.artifacts) ? parsed.artifacts.slice(0, 4) : undefined,
    actions:       Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5) : undefined,
    honest_note:   parsed.honest_note ? String(parsed.honest_note).slice(0, 500) : undefined,
    sources_used:  webUsed
      ? Array.from(new Set([...(Array.isArray(parsed.sources_used) ? parsed.sources_used : []), "web_search"]))
      : (Array.isArray(parsed.sources_used) ? parsed.sources_used : []),
    citations:     dedupedCitations,
    web_used:      webUsed,
  };
}

/* ─── System prompt — web-aware variant ─────────────────────── */

function buildWebSystemPrompt(): string {
  return `${PLATFORM_SELF_KNOWLEDGE}

# YOU NOW HAVE LIVE WEB SEARCH

A web_search tool is available. Use it when the user asks about live external information — news, current SEO algorithm updates, industry trends, competitor moves, current pricing, anything time-sensitive.

WHEN TO SEARCH:
- "What's happening with..." / "What's new in..." / "Latest on..."
- Questions about specific competitors, products, news
- Industry-current questions (Google's recent updates, SEO trends this quarter)
- Anything you don't reliably know from training

WHEN NOT TO SEARCH:
- Questions answerable from PROJECT CONTEXT (their cards, strategies, GSC data)
- General SEO best practices you reliably know
- Definitions, explanations of stable concepts

ALWAYS CITE SOURCES:
- When you use a web search result, the citation will be attached automatically.
- In your response chunks, refer to sources as "according to [source]" — the user sees them as numbered pills.
- Never invent a citation. If you didn't see it from a search, don't claim it.

YOUR HONESTY CONTRACT — REINFORCED FOR WEB:
- If a search returns nothing useful, say so plainly. Don't pad with general knowledge labeled as web.
- If you searched but the answer isn't clear, note that the sources were ambiguous.
- Cite a source only when your claim genuinely comes from it.

# YOUR OUTPUT FORMAT — STRICT JSON
Reply ONLY with a single JSON object. No markdown fences around the whole thing.

{
  "intent": "web_research | web_news | web_competitor | web_pricing | web_algorithm | web_open_question | other",
  "confidence": 0.0-1.0,
  "chunks": [
    { "kind": "plain", "content": "direct answer using web findings + project context" },
    { "kind": "plain", "content": "supporting detail with source references" },
    { "kind": "verify", "content": "summary of where this came from", "detail": {...} }
  ],
  "honest_note": "when web returned nothing useful, when sources conflicted, when info was time-stale",
  "sources_used": ["web_search", "project_self_knowledge"]
}

CHUNK RULES:
- First chunk: direct answer in 1-3 sentences. Cite key claims.
- Detail chunks: deeper synthesis with more citations.
- Verify chunk: name which searches you ran.
- FORMATTING: keep prose readable. If you have 3+ steps or items, put each "**N. Header**" as the start of its own chunk, NOT inline in one paragraph. Use **bold** sparingly. Aim for 1-4 sentences per chunk — walls of text are unreadable.

ACTIONS — same catalog as the regular brain (navigate, refresh, etc.).

REMEMBER:
- Be useful, honest, well-sourced.
- Don't fabricate.
- If web didn't help, say so.`;
}

/* ─── User message — input + project context + awareness ─────── */

function buildWebUserMessage(input: string, awareness?: any, projectContext?: string): string {
  const parts: string[] = [`USER INPUT:\n"${input}"`, ''];

  if (awareness && awareness.page) {
    const lines = ['─── WHAT THE USER IS LOOKING AT RIGHT NOW ───'];
    lines.push(`Page: ${awareness.page_label || awareness.page}`);
    if (awareness.selected) {
      const s = awareness.selected;
      const bits = [`type=${s.type}`];
      if (s.id)     bits.push(`id=${s.id}`);
      if (s.title)  bits.push(`title="${s.title}"`);
      lines.push(`Selected: ${bits.join(' · ')}`);
    }
    parts.push(lines.join('\n'), '');
  }

  if (projectContext) {
    parts.push(projectContext, '');
  }

  parts.push('─── INSTRUCTIONS ───');
  parts.push('Use the web_search tool when the question genuinely needs external info. Cite every source. If you can answer from project context alone without searching, do that and say so. Reply with valid JSON only.');

  return parts.join('\n');
}

/* ─── Cost protection helpers ───────────────────────────────── */

async function countCallsToday(projectId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  try {
    const { count } = await db().from("activity_log")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("source", "llm")
      .gte("created_at", since);
    return count || 0;
  } catch { return 0; }
}

function rateLimited(used: number): WebLlmResponse {
  return {
    intent: "rate_limited",
    confidence: 1,
    chunks: [
      { kind: "plain", content: `I've already made ${used} LLM calls for this project today (cap: ${DAILY_CAP}). Web searches count too. Try again tomorrow, or raise SEASON_LLM_DAILY_CAP in Vercel env.` },
    ],
    sources_used: ["activity_log"],
    citations: [],
    web_used: false,
    rate_limited: true,
  };
}

function softFail(reason: string, code: string): WebLlmResponse {
  return {
    intent: "web_unavailable",
    confidence: 0,
    chunks: [
      { kind: "plain", content: "I couldn't reach my web brain just now." },
      { kind: "plain", content: reason },
    ],
    sources_used: [],
    citations: [],
    web_used: false,
    honest_note: `Diagnostic code: ${code}. The non-web brain and keyword router still work — try a different question or check the diagnose command.`,
  };
}
