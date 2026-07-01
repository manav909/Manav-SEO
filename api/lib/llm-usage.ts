/* ════════════════════════════════════════════════════════════════
   api/lib/llm-usage.ts
   Single source of truth for LLM cost accounting and usage logging.

   Every logged call records what it was for (purpose), which model, how
   many tokens (fresh/cached/output), the dollar cost, and the latency —
   written to activity_log under source "llm_usage" so it never collides
   with the daily-cap counter (source "llm").

   Logging is fully fail-safe: any error here is swallowed, because a
   bookkeeping failure must never break a live call.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* Rates in USD per 1,000,000 tokens. Verified against Anthropic pricing:
   Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5, Opus 4.8 $5/$25; cache read = 0.1x
   input, 5-minute cache write = 1.25x input. Any rate can be overridden at
   runtime via env (LLM_PRICE_<MODEL>_IN / _OUT, dollars per million) so a
   price change needs no redeploy. */
interface Rate { in: number; out: number; cacheRead: number; cacheWrite: number; }

const BASE_RATES: Record<string, Rate> = {
  "claude-sonnet-4-6":         { in: 3, out: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5,  cacheRead: 0.10, cacheWrite: 1.25 },
  "claude-haiku-4-5":          { in: 1, out: 5,  cacheRead: 0.10, cacheWrite: 1.25 },
  "claude-opus-4-8":           { in: 5, out: 25, cacheRead: 0.50, cacheWrite: 6.25 },
};
const DEFAULT_RATE: Rate = { in: 3, out: 15, cacheRead: 0.30, cacheWrite: 3.75 };

function rateFor(model: string): Rate {
  const base =
    BASE_RATES[model] ||
    (/haiku/i.test(model) ? BASE_RATES["claude-haiku-4-5"]
      : /opus/i.test(model) ? BASE_RATES["claude-opus-4-8"]
      : /sonnet/i.test(model) ? BASE_RATES["claude-sonnet-4-6"]
      : DEFAULT_RATE);
  /* Env override for input/output, keeping cache ratios (0.1x / 1.25x). */
  const key = (model || "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const envIn = Number(process.env[`LLM_PRICE_${key}_IN`]);
  const envOut = Number(process.env[`LLM_PRICE_${key}_OUT`]);
  const inRate = Number.isFinite(envIn) && envIn > 0 ? envIn : base.in;
  const outRate = Number.isFinite(envOut) && envOut > 0 ? envOut : base.out;
  return { in: inRate, out: outRate, cacheRead: inRate * 0.1, cacheWrite: inRate * 1.25 };
}

export interface UsageTokens {
  input_tokens?: number;              // Anthropic reports fresh (non-cached) input here
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/* USD cost for a single call, accounting for cached vs fresh input. */
export function costOf(model: string, u: UsageTokens): number {
  const r = rateFor(model);
  const cost =
    ((u.input_tokens || 0)              * r.in)         / 1e6 +
    ((u.cache_read_input_tokens || 0)   * r.cacheRead)  / 1e6 +
    ((u.cache_creation_input_tokens || 0) * r.cacheWrite) / 1e6 +
    ((u.output_tokens || 0)             * r.out)        / 1e6;
  return Math.round(cost * 1e6) / 1e6;   // 6 decimals (micro-dollar precision)
}

/* Log one LLM call with full detail. Never throws. */
export async function logLlmUsage(o: {
  engine: string;                 // purpose / label (e.g. "vault-train", "season-llm")
  model: string;
  usage: UsageTokens;
  latencyMs?: number;
  projectId?: string | null;
  fromCache?: boolean;            // response-cache hit — no API cost incurred
}): Promise<void> {
  try {
    const u = o.usage || {};
    const cost = o.fromCache ? 0 : costOf(o.model, u);
    const inTok = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    const outTok = u.output_tokens || 0;
    const ms = o.latencyMs != null ? Math.round(o.latencyMs) : null;
    await db().from("activity_log").insert({
      project_id: o.projectId ?? null,
      event_type: "llm_call",
      source: "llm_usage",
      headline: `LLM ${o.engine || "call"} · ${o.model} · $${cost.toFixed(4)} · ${ms != null ? ms + "ms" : "n/a"}`,
      detail: `purpose=${o.engine || "unknown"} in=${inTok} out=${outTok} cost_usd=${cost.toFixed(6)} latency_ms=${ms ?? ""}${o.fromCache ? " cached=true" : ""}`,
      technical: {
        purpose: o.engine || null,
        model: o.model,
        input_tokens: u.input_tokens || 0,
        cache_read_input_tokens: u.cache_read_input_tokens || 0,
        cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
        total_input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: cost,
        latency_ms: ms,
        from_cache: !!o.fromCache,
      },
      severity: "info",
    });
  } catch {
    /* bookkeeping must never break a live call */
  }
}
