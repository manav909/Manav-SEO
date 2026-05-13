/**
 * health-diagnostic.ts
 * Deploy this to api/health-diagnostic.ts
 * Call: POST /api/health-diagnostic
 * Returns: complete diagnosis of what Vercel can and cannot access
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 15 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const results: Record<string, any> = {};

  // 1. Environment variables
  results.env = {
    SUPABASE_URL:               !!process.env.SUPABASE_URL,
    SUPABASE_URL_value:         (process.env.SUPABASE_URL || "").slice(0, 30) + "...",
    VITE_SUPABASE_URL:          !!process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_URL_value:    (process.env.VITE_SUPABASE_URL || "").slice(0, 30) + "...",
    SUPABASE_ANON_KEY:          !!process.env.SUPABASE_ANON_KEY,
    VITE_SUPABASE_ANON_KEY:     !!process.env.VITE_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_KEY:       !!process.env.SUPABASE_SERVICE_KEY,
    ANTHROPIC_API_KEY:          !!process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_KEY_PREFIX:       (process.env.ANTHROPIC_API_KEY || "").slice(0, 12),
    JINA_API_KEY:               !!process.env.JINA_API_KEY,
    NODE_VERSION:               process.version,
    NODE_ENV:                   process.env.NODE_ENV || "unknown",
    VERCEL_ENV:                 process.env.VERCEL_ENV || "unknown",
    VERCEL_REGION:              process.env.VERCEL_REGION || "unknown",
  };

  // 2. Supabase connectivity
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl) {
    results.supabase = { status: "ERROR", reason: "No SUPABASE_URL or VITE_SUPABASE_URL env var found" };
  } else {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await sb.from("brain_learnings").select("id").limit(1);
      results.supabase = error
        ? { status: "ERROR", reason: error.message, code: error.code }
        : { status: "OK", rows: data?.length ?? 0 };
    } catch (e: any) {
      results.supabase = { status: "CRASH", reason: e.message };
    }
  }

  // 3. Anthropic connectivity (no actual API call - just validate key format)
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
  results.anthropic = {
    key_present:     !!anthropicKey,
    key_valid_format: anthropicKey.startsWith("sk-ant-"),
    key_prefix:       anthropicKey.slice(0, 12),
    note: anthropicKey
      ? (anthropicKey.startsWith("sk-ant-") ? "Key looks valid" : "WARNING: Key should start with sk-ant-")
      : "MISSING — Anthropic calls will fail with authentication error",
  };

  // 4. Test a simple Anthropic API call (1 token max) to confirm it works
  if (anthropicKey) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: anthropicKey });
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
      results.anthropic_live_test = { status: "OK", stop_reason: msg.stop_reason };
    } catch (e: any) {
      results.anthropic_live_test = {
        status: "ERROR",
        reason: e.message.slice(0, 200),
        is_auth_error: e.message.includes("401") || e.message.includes("authentication"),
        is_rate_limit: e.message.includes("429") || e.message.includes("rate"),
        is_model_error: e.message.includes("model") || e.message.includes("404"),
      };
    }
  }

  // 5. Network connectivity
  try {
    const r = await fetch("https://api.anthropic.com/health", { signal: AbortSignal.timeout(3000) });
    results.network = { anthropic_reachable: r.status < 500, status: r.status };
  } catch (e: any) {
    results.network = { anthropic_reachable: false, reason: e.message };
  }

  // 6. Memory
  const mem = process.memoryUsage();
  results.memory = {
    rss_mb:      Math.round(mem.rss / 1024 / 1024),
    heap_mb:     Math.round(mem.heapUsed / 1024 / 1024),
    heap_max_mb: Math.round(mem.heapTotal / 1024 / 1024),
  };

  return res.status(200).json({
    timestamp:  new Date().toISOString(),
    diagnosis:  results,
    summary: {
      can_reach_supabase:  results.supabase?.status === "OK",
      can_reach_anthropic: results.anthropic_live_test?.status === "OK",
      env_vars_ok:         results.env.SUPABASE_URL && results.env.ANTHROPIC_API_KEY,
      critical_issues: [
        !results.env.SUPABASE_URL && !results.env.VITE_SUPABASE_URL ? "SUPABASE_URL missing" : null,
        !results.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY missing" : null,
        results.anthropic?.key_present && !results.anthropic?.key_valid_format ? "ANTHROPIC_API_KEY wrong format (should start sk-ant-)" : null,
        results.anthropic_live_test?.is_auth_error ? "ANTHROPIC_API_KEY invalid - authentication rejected" : null,
      ].filter(Boolean),
    },
  });
}
