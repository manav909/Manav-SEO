/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/llm.ts

   Shared LLM utility for the Quantum Intelligence Workspace.
   - Single working model string.
   - Hard AbortController timeout so a stalled API call can never hang a
     serverless invocation up to Vercel's function limit.
   - Robust JSON extraction + truncation repair so a large structured
     response is never silently discarded.

   Multi-tenant: holds NO project-specific values. Pure utility.
════════════════════════════════════════════════════════════════ */

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

/** Call the model with a hard timeout. Returns text or "" on any failure.
    Retries on Anthropic overload responses (529/503/429 or "overloaded_error")
    up to 3 attempts with backoff so transient infra blips don't surface to
    the operator. */
export async function llm(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
  label?: string;
}): Promise<string> {
  const { system, user, maxTokens = 6000, timeoutMs = 120000, label = "llm" } = opts;
  if (!ANTHROPIC_API_KEY) {
    console.error(`[workspace/${label}] ANTHROPIC_API_KEY missing`);
    return "";
  }

  const RETRYABLE_HTTP = new Set([429, 503, 529]);
  const MAX_ATTEMPTS = 3;
  const BACKOFFS_MS = [1000, 4000];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, BACKOFFS_MS[attempt - 2]));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
      });
      if (r.ok) {
        const d = await r.json();
        clearTimeout(timer);
        return (d?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      }
      const t = await r.text().catch(() => "");
      const isOverload = RETRYABLE_HTTP.has(r.status) || /overload/i.test(t);
      if (isOverload && attempt < MAX_ATTEMPTS) {
        console.warn(`[workspace/${label}] attempt ${attempt}/${MAX_ATTEMPTS} got HTTP ${r.status} (overloaded). Retrying after ${BACKOFFS_MS[attempt - 1]}ms…`);
        clearTimeout(timer);
        continue;
      }
      console.error(`[workspace/${label}] LLM ${r.status}: ${t.slice(0, 300)}`);
      clearTimeout(timer);
      return "";
    } catch (e: any) {
      const isTimeout = controller.signal.aborted;
      clearTimeout(timer);
      // Timeouts aren't overloads — don't retry them; they'd just hit the same wall.
      if (isTimeout || attempt === MAX_ATTEMPTS) {
        console.error(`[workspace/${label}] exc ${e?.message}${isTimeout ? ` (timeout ${timeoutMs}ms)` : ""}`);
        return "";
      }
      console.warn(`[workspace/${label}] attempt ${attempt}/${MAX_ATTEMPTS} threw: ${(e?.message || "unknown").slice(0, 80)}. Retrying…`);
    }
  }
  return "";
}

/** Repair a JSON string truncated at the token limit: trim to the last clean
    boundary (after a complete element/field at any depth >= 1) and close all
    still-open brackets. Preserves every complete field, drops only the tail. */
export function repairTruncatedJson(s: string): string {
  let depth = 0, inStr = false, esc = false, lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth >= 1) lastSafe = i + 1; }
    else if (c === "," && depth >= 1) lastSafe = i;
  }
  let out = s;
  if (lastSafe > 0 && (inStr || depth > 0)) out = s.slice(0, lastSafe).replace(/,\s*$/, "");
  else out = s.replace(/,\s*$/, "");
  inStr = false; esc = false;
  const open: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") open.push("}");
    else if (c === "[") open.push("]");
    else if (c === "}" || c === "]") open.pop();
  }
  if (inStr) out += '"';
  while (open.length) out += open.pop();
  return out;
}

/** Parse a model response into an object: strip fences, extract the outermost
    object, parse; on failure repair-then-parse. Returns null if unrecoverable. */
export function parseJsonResponse<T = any>(raw: string): T | null {
  if (!raw) return null;
  let clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = clean.indexOf("{");
  if (first === -1) return null;
  clean = clean.slice(first);
  try { return JSON.parse(clean) as T; } catch { /* try repair */ }
  try { return JSON.parse(repairTruncatedJson(clean)) as T; } catch { return null; }
}

/* ════════════ Tool-use LLM call ═════════════════════════════════
   Single round-trip of an Anthropic Messages API call that can include tool
   definitions. Returns the full content blocks and stop_reason so the caller
   can implement a tool-use loop (model requests tool → caller executes →
   feeds tool_result back → model continues).
══════════════════════════════════════════════════════════════════ */
export interface ToolUseLlmResult {
  content: Array<any>;     // raw content blocks (text, tool_use, ...)
  stop_reason: string;     // "end_turn" | "tool_use" | "max_tokens" | "stop_sequence"
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function llmWithTools(opts: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: any }>;
  tools?: Array<{ name: string; description: string; input_schema: any }>;
  maxTokens?: number;
  timeoutMs?: number;
  label?: string;
}): Promise<ToolUseLlmResult | null> {
  const { system, messages, tools, maxTokens = 6000, timeoutMs = 120000, label = "llm-tools" } = opts;
  if (!ANTHROPIC_API_KEY) { console.error(`[workspace/${label}] ANTHROPIC_API_KEY missing`); return null; }

  const RETRYABLE_HTTP = new Set([429, 503, 529]);
  const MAX_ATTEMPTS = 3;
  const BACKOFFS_MS = [1000, 4000];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, BACKOFFS_MS[attempt - 2]));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body: any = { model: MODEL, max_tokens: maxTokens, system, messages };
      if (tools && tools.length) body.tools = tools;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: controller.signal,
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json();
        clearTimeout(timer);
        return { content: d?.content || [], stop_reason: d?.stop_reason || "end_turn", usage: d?.usage };
      }
      const t = await r.text().catch(() => "");
      const isOverload = RETRYABLE_HTTP.has(r.status) || /overload/i.test(t);
      if (isOverload && attempt < MAX_ATTEMPTS) {
        console.warn(`[workspace/${label}] attempt ${attempt}/${MAX_ATTEMPTS} got HTTP ${r.status} (overloaded). Retrying after ${BACKOFFS_MS[attempt - 1]}ms…`);
        clearTimeout(timer);
        continue;
      }
      console.error(`[workspace/${label}] LLM ${r.status}: ${t.slice(0, 400)}`);
      clearTimeout(timer);
      return null;
    } catch (e: any) {
      const isTimeout = controller.signal.aborted;
      clearTimeout(timer);
      if (isTimeout || attempt === MAX_ATTEMPTS) {
        console.error(`[workspace/${label}] exc ${e?.message}${isTimeout ? ` (timeout ${timeoutMs}ms)` : ""}`);
        return null;
      }
      console.warn(`[workspace/${label}] attempt ${attempt}/${MAX_ATTEMPTS} threw: ${(e?.message || "unknown").slice(0, 80)}. Retrying…`);
    }
  }
  return null;
}
