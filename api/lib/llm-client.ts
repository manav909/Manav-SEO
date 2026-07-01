/* ════════════════════════════════════════════════════════════════
   api/lib/llm-client.ts
   KEYSTONE — single central entry point for every Anthropic call.

   WHY THIS EXISTS
     Before this module, ~119 call sites across 40+ engines each spoke to
     api.anthropic.com directly. There was no single place to control
     model choice, caching, spend ceiling, or cost logging. This module
     is that single place. Engines migrate onto it one by one.

   SAFETY CONTRACT (non-negotiable — this runs on a live system)
     Every value-add path here (response cache, prompt cache, daily cap,
     metering) is wrapped so that any failure degrades to a plain direct
     call — the SAME request the engine made before migrating. This module
     can make a call cheaper or skip it; it can NEVER break a call that
     would otherwise have succeeded.

   WHAT IT ADDS
     • Model tiering   — economy (Haiku) / standard (Sonnet) / premium
     • Prompt caching  — caches a large static system prefix (auto-skipped
                         below the API cache floor, where it is a no-op)
     • Response cache  — opt-in reuse of an identical prior generation
     • Daily cap       — opt-in central spend ceiling per project
     • Metering        — opt-in usage breadcrumb for before/after analysis,
                         logged under source "llm_usage" so it NEVER
                         collides with the cap counter (source "llm")
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { logLlmUsage } from "./llm-usage.js";

/* ─── Tiering ────────────────────────────────────────────────────
   Standard maps to the model every engine used before migration, so a
   default migration changes cost behaviour without changing output.
   Overridable via env so model swaps need no redeploy of code. */
export type LlmTier = "economy" | "standard" | "premium";

const MODEL_BY_TIER: Record<LlmTier, string> = {
  economy:  process.env.SEASON_MODEL_ECONOMY  || "claude-haiku-4-5-20251001",
  standard: process.env.SEASON_MODEL_STANDARD || "claude-sonnet-4-6",
  premium:  process.env.SEASON_MODEL_PREMIUM  || "claude-sonnet-4-6",
};

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const DEFAULT_CAP       = Number(process.env.SEASON_LLM_DAILY_CAP || 50);

/* Anthropic ephemeral prompt caching only pays off above a sizable static
   prefix. Below this, adding a cache_control block is a no-op at the API
   level, so we skip it to keep requests clean. ~4000 chars ≈ ~1000 tokens. */
const CACHE_MIN_CHARS = 4000;

/* ─── Public types ───────────────────────────────────────────────── */

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmCallOpts {
  /* model selection — explicit `model` wins, else `tier`, else standard */
  tier?: LlmTier;
  model?: string;

  /* payload */
  system?: string;
  messages: LlmMessage[];
  maxTokens: number;
  temperature?: number;

  /* prompt caching — cache the large static system prefix */
  cacheSystem?: boolean;

  /* response caching — reuse an identical prior generation (deterministic
     engines only). Omit for anything conversational or time-sensitive. */
  responseCache?: { key: string; projectId?: string | null; ttlMinutes?: number };

  /* central daily-cap enforcement (opt-in). Engines that already enforce
     their own cap leave this unset to avoid double counting. */
  capProjectId?: string;
  capLimit?: number;

  /* metering — usage breadcrumb for before/after analysis. Default on. */
  meter?: boolean;
  engine?: string;
  projectId?: string | null;
}

export interface LlmUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface LlmCallResult {
  ok: boolean;
  text: string;
  raw: any;
  model: string;
  fromCache: boolean;
  rateLimited: boolean;
  usage: LlmUsage;
  error?: string;
}

/* ─── Main entry ─────────────────────────────────────────────────── */

export async function callLLM(opts: LlmCallOpts): Promise<LlmCallResult> {
  const model =
    opts.model ||
    MODEL_BY_TIER[opts.tier || "standard"] ||
    MODEL_BY_TIER.standard;

  const base: LlmCallResult = {
    ok: false, text: "", raw: null, model,
    fromCache: false, rateLimited: false, usage: {},
  };
  const _callStart = Date.now();

  if (!ANTHROPIC_API_KEY) {
    return { ...base, error: "no_api_key" };
  }

  /* ── 1. Daily cap (opt-in, fail-open) ───────────────────────────
     A cap-check failure must never block live work, so any error here
     proceeds to the call rather than rejecting it. */
  if (opts.capProjectId) {
    try {
      const used = await countCallsToday(opts.capProjectId);
      const limit = opts.capLimit ?? DEFAULT_CAP;
      if (used >= limit) {
        return { ...base, rateLimited: true, error: "rate_limited" };
      }
    } catch {
      /* fail open — proceed to the call */
    }
  }

  /* ── 2. Response cache read (opt-in, fail-open) ─────────────────── */
  if (opts.responseCache?.key) {
    try {
      const hit = await readResponseCache(opts.responseCache);
      if (hit) {
        return { ...base, ok: true, text: hit, raw: { cached: true }, fromCache: true };
      }
    } catch {
      /* miss or error — proceed to the call */
    }
  }

  /* ── 3. Build + send, with prompt-cache safety net ──────────────
     If a cached request comes back non-OK, we retry once WITHOUT the
     cache_control block. This guarantees prompt caching can never turn a
     would-be-successful call into a failure. */
  const wantCache =
    !!opts.cacheSystem && !!opts.system && opts.system.length >= CACHE_MIN_CHARS;

  let attempt = await sendOnce(model, opts, wantCache);
  if (!attempt.ok && wantCache) {
    attempt = await sendOnce(model, opts, false);
  }
  const latencyMs = Date.now() - _callStart;
  if (!attempt.ok) {
    return { ...base, error: attempt.error || "anthropic_error" };
  }

  const raw = attempt.json;
  const text = extractText(raw);
  const usage: LlmUsage = raw?.usage || {};

  /* ── 4. Response cache write (opt-in, non-fatal) ────────────────── */
  if (opts.responseCache?.key && text) {
    try { await writeResponseCache(opts.responseCache, text, usage); } catch { /* non-fatal */ }
  }

  /* ── 5. Metering (default on, non-fatal, isolated source) ─────────
     Routed through the shared ledger so cost (USD) and latency are recorded
     alongside tokens, identically to every other metered path. */
  if (opts.meter !== false) {
    await logLlmUsage({
      engine: opts.engine || "llm-client",
      model,
      usage,
      latencyMs,
      projectId: opts.projectId ?? null,
      fromCache: false,
    });
  }

  return { ok: true, text, raw, model, fromCache: false, rateLimited: false, usage };
}

/* ─── One physical request to Anthropic ──────────────────────────── */

async function sendOnce(
  model: string,
  opts: LlmCallOpts,
  useCache: boolean,
): Promise<{ ok: boolean; json?: any; error?: string }> {
  const body: any = {
    model,
    max_tokens: opts.maxTokens,
    messages: opts.messages,
  };
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;

  if (opts.system) {
    body.system = useCache
      ? [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }]
      : opts.system;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `anthropic_${res.status}:${errText.slice(0, 160)}` };
    }
    const json = await res.json();
    return { ok: true, json };
  } catch (e: any) {
    return { ok: false, error: `network:${e?.message || "unknown"}` };
  }
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function extractText(raw: any): string {
  return (raw?.content || [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("");
}

/* Cap counter — mirrors the existing season-llm convention exactly:
   counts rows in activity_log with source "llm" in the last 24h. */
async function countCallsToday(projectId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { count } = await db().from("activity_log")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("source", "llm")
    .gte("created_at", since);
  return count || 0;
}

/* Response cache uses the generic (cache_key, response, project_id) shape
   already present in ai_content_cache. Any schema mismatch throws and is
   caught upstream, degrading to a live call. */
async function readResponseCache(
  rc: { key: string; projectId?: string | null; ttlMinutes?: number },
): Promise<string | null> {
  const { data } = await db().from("ai_content_cache")
    .select("response, created_at")
    .eq("cache_key", rc.key)
    .limit(1)
    .maybeSingle();
  if (!data?.response) return null;
  if (rc.ttlMinutes && data.created_at) {
    const ageMin = (Date.now() - new Date(data.created_at).getTime()) / 60000;
    if (ageMin > rc.ttlMinutes) return null;
  }
  return typeof data.response === "string" ? data.response : JSON.stringify(data.response);
}

async function writeResponseCache(
  rc: { key: string; projectId?: string | null },
  text: string,
  usage: LlmUsage,
): Promise<void> {
  await db().from("ai_content_cache").insert({
    cache_key: rc.key,
    response: text,
    project_id: rc.projectId ?? null,
    estimated_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
  });
}

/* Metering writes under source "llm_usage" — deliberately distinct from
   the cap source "llm" — so it provides a clean cost ledger for before/after
   analysis without ever inflating the daily-cap counter. */
async function meterUsage(): Promise<void> {
  /* Deprecated — usage metering now lives in ./llm-usage.ts (logLlmUsage),
     which records cost and latency in addition to tokens. Kept as a no-op
     to avoid touching any unexpected caller; safe to delete once confirmed
     unreferenced. */
}
void meterUsage;
