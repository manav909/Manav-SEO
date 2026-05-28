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

/** Call the model with a hard timeout. Returns text or "" on any failure. */
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
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error(`[workspace/${label}] LLM ${r.status}: ${t.slice(0, 300)}`);
      return "";
    }
    const d = await r.json();
    return (d?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  } catch (e: any) {
    console.error(`[workspace/${label}] exc ${e?.message}${controller.signal.aborted ? ` (timeout ${timeoutMs}ms)` : ""}`);
    return "";
  } finally {
    clearTimeout(timer);
  }
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
