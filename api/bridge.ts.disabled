/* ═══════════════════════════════════════════════════════════
   api/bridge.ts — Claude Bridge endpoint.

   Stand-alone Lambda (no ./lib/ imports — matches our proven pattern).

   Auth model:
     • Write actions  (post, mark_read, delete) require BRIDGE_SECRET
     • Read  actions  (list, get)               require BRIDGE_READ_TOKEN
       (Read token is also accepted on write actions for convenience —
        but the secret is the only way to delete.)

   Authorization is sent in the `Authorization: Bearer <token>` header.

   Actions (POST body { action: "..." }):
     post       — { kind, title?, body, metadata?, created_by?, in_reply_to? }
     list       — { kind?, limit?, unread_only? }
     get        — { id }
     mark_read  — { id, read_by? }
     delete     — { id }                    (SECRET only)
     ping       — health check (no auth)
═══════════════════════════════════════════════════════════ */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 30 };

let _supa: any = null;
function db(): any {
  if (_supa) return _supa;
  try {
    _supa = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder"
    );
  } catch (e) { console.error("[bridge] db init failed:", (e as any)?.message); }
  return _supa;
}

function getBearer(req: VercelRequest): string {
  const h = (req.headers["authorization"] || req.headers["Authorization"]) as string | undefined;
  if (!h) return "";
  return h.replace(/^Bearer\s+/i, "").trim();
}

function authWrite(req: VercelRequest): { ok: boolean; reason?: string } {
  const expected = process.env.BRIDGE_SECRET || "";
  if (!expected) return { ok: false, reason: "BRIDGE_SECRET not configured on server" };
  const token = getBearer(req);
  if (!token) return { ok: false, reason: "Missing Authorization: Bearer <BRIDGE_SECRET>" };
  if (token !== expected) return { ok: false, reason: "Invalid bridge secret" };
  return { ok: true };
}

function authRead(req: VercelRequest): { ok: boolean; reason?: string } {
  const expectedRead   = process.env.BRIDGE_READ_TOKEN || "";
  const expectedSecret = process.env.BRIDGE_SECRET     || "";
  if (!expectedRead && !expectedSecret) return { ok: false, reason: "Bridge tokens not configured on server" };
  const token = getBearer(req) || ((req.query?.token as string) || "");
  if (!token) return { ok: false, reason: "Missing Authorization: Bearer <BRIDGE_READ_TOKEN> or ?token= query param" };
  if (token !== expectedRead && token !== expectedSecret) return { ok: false, reason: "Invalid bridge token" };
  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _handler(req, res); }
  catch (e: any) {
    console.error("[bridge] unhandled:", e?.message, e?.stack?.slice(0, 400));
    try {
      if (!res.headersSent) res.status(200).json({ error: e?.message || "unknown crash" });
    } catch (_) {}
  }
}

async function _handler(req: VercelRequest, res: VercelResponse) {
  /* ── CORS ── */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "x-read-token,x-bridge-secret,Authorization,Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  /* ── GET — markdown feed reader (token via x-read-token header or ?token= query param) ── */
  if (req.method === "GET") {
    const token = (req.headers["x-read-token"] as string) || (req.query?.token as string) || "";
    const expected = process.env.BRIDGE_READ_TOKEN || process.env.BRIDGE_SECRET || "";
    if (!expected) return res.status(401).send("# Error\nBRIDGE_READ_TOKEN not configured on server.");
    if (!token)    return res.status(401).send("# Error\nMissing token. Pass ?token=<BRIDGE_READ_TOKEN> or X-Read-Token header.");
    if (token !== expected && token !== (process.env.BRIDGE_SECRET || "")) {
      return res.status(401).send("# Error\nInvalid token.");
    }
    const sbc = db();
    if (!sbc) return res.status(500).send("# Error\nDatabase unavailable.");
    const { data, error } = await sbc
      .from("claude_bridge")
      .select("id, kind, title, body, metadata, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return res.status(500).send(`# Error\n${error.message}`);
    const rows = data || [];
    const lines: string[] = [
      `# Claude Bridge — Latest 50 Messages`,
      `_Generated: ${new Date().toISOString()} · ${rows.length} rows_`,
      ``,
    ];
    for (const m of rows) {
      const ts   = new Date(m.created_at).toISOString().replace("T", " ").slice(0, 19);
      const meta = m.metadata && Object.keys(m.metadata).length
        ? `  \`${JSON.stringify(m.metadata).slice(0, 120)}\``
        : "";
      lines.push(`---`);
      lines.push(`### [${m.kind}] ${m.title || "(no title)"}`);
      lines.push(`**by** \`${m.created_by}\` · **at** \`${ts}\` · **id** \`${m.id}\``);
      if (meta) lines.push(meta);
      lines.push(``);
      if (m.body) lines.push((m.body as string).slice(0, 600) + ((m.body as string).length > 600 ? "\n…(truncated)" : ""));
      lines.push(``);
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(lines.join("\n"));
  }

  if (req.method !== "POST") return res.status(200).json({ error: "GET or POST only" });
  const body = req.body || {};
  const action = body.action;
  if (!action) return res.status(200).json({ error: "Missing action" });

  /* ── PING (no auth — used by deploy verification) ── */
  if (action === "ping") {
    return res.status(200).json({
      ok:                true,
      service:           "claude-bridge",
      timestamp:         new Date().toISOString(),
      bridge_secret_set: !!process.env.BRIDGE_SECRET,
      bridge_read_set:   !!process.env.BRIDGE_READ_TOKEN,
    });
  }

  const sbc = db();
  if (!sbc) return res.status(200).json({ error: "Database client unavailable" });

  /* ── POST (write — Claude Code or Manav post; Claude Chat may also post replies) ── */
  if (action === "post") {
    const a = authWrite(req);
    if (!a.ok) return res.status(200).json({ error: a.reason });
    const { kind, title, body: payload, metadata, created_by, in_reply_to } = body;
    if (!kind || !payload) return res.status(200).json({ error: "kind and body are required" });
    try {
      const { data, error } = await sbc.from("claude_bridge").insert({
        kind:        String(kind).slice(0, 32),
        title:       title ? String(title).slice(0, 200) : null,
        body:        String(payload).slice(0, 500000),       // hard cap ~500 KB per message
        metadata:    metadata || {},
        created_by:  created_by ? String(created_by).slice(0, 32) : "claude_code",
        in_reply_to: in_reply_to || null,
      }).select("id, created_at, kind, title").single();
      if (error) return res.status(200).json({ error: error.message });
      return res.status(200).json({ ok: true, message: data });
    } catch (e: any) { return res.status(200).json({ error: e?.message || "insert failed" }); }
  }

  /* ── LIST (read — newest first; filter by kind / unread) ── */
  if (action === "list") {
    const a = authRead(req);
    if (!a.ok) return res.status(200).json({ error: a.reason });
    const { kind, limit, unread_only } = body;
    let q = sbc.from("claude_bridge")
      .select("id, kind, title, created_by, in_reply_to, read_at, read_by, created_at, metadata")
      .order("created_at", { ascending: false })
      .limit(Math.min(200, Math.max(1, Number(limit) || 50)));
    if (kind)        q = q.eq("kind", String(kind));
    if (unread_only) q = q.is("read_at", null);
    const { data, error } = await q;
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ ok: true, count: data?.length || 0, messages: data || [] });
  }

  /* ── GET (read one — includes full body) ── */
  if (action === "get") {
    const a = authRead(req);
    if (!a.ok) return res.status(200).json({ error: a.reason });
    const { id } = body;
    if (!id) return res.status(200).json({ error: "id is required" });
    const { data, error } = await sbc.from("claude_bridge").select("*").eq("id", id).maybeSingle();
    if (error) return res.status(200).json({ error: error.message });
    if (!data)  return res.status(200).json({ error: "Not found" });
    return res.status(200).json({ ok: true, message: data });
  }

  /* ── MARK_READ (audit trail — who consumed which message) ── */
  if (action === "mark_read") {
    const a = authRead(req);
    if (!a.ok) return res.status(200).json({ error: a.reason });
    const { id, read_by } = body;
    if (!id) return res.status(200).json({ error: "id is required" });
    const { error } = await sbc.from("claude_bridge").update({
      read_at: new Date().toISOString(),
      read_by: read_by ? String(read_by).slice(0, 32) : "unknown",
    }).eq("id", id);
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  /* ── DELETE (SECRET-only) ── */
  if (action === "delete") {
    const a = authWrite(req);
    if (!a.ok) return res.status(200).json({ error: a.reason });
    const { id } = body;
    if (!id) return res.status(200).json({ error: "id is required" });
    const { error } = await sbc.from("claude_bridge").delete().eq("id", id);
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  /* ── USAGE (read — aggregate stats for dashboard) ── */
  if (action === "usage") {
    const a = authRead(req);
    if (!a.ok) return res.status(200).json({ error: a.reason });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthISO = monthStart.toISOString();

    try {
      // Total message count
      const { count: totalMessages } = await sbc
        .from("claude_bridge")
        .select("*", { count: "exact", head: true });

      // Claude Code responses completed today
      const { count: completedToday } = await sbc
        .from("claude_bridge")
        .select("*", { count: "exact", head: true })
        .eq("created_by", "claude_code")
        .eq("kind", "response")
        .gte("created_at", todayISO);

      // All messages today — for token sum + blocked count
      const { data: todayMsgs } = await sbc
        .from("claude_bridge")
        .select("metadata")
        .gte("created_at", todayISO);

      const tokensToday = (todayMsgs || []).reduce((sum: number, m: any) => {
        return sum + (Number(m.metadata?.tokens_estimated) || 0);
      }, 0);

      const blockedToday = (todayMsgs || []).filter(
        (m: any) => m.metadata?.status === "blocked"
      ).length;

      const costTodayUsd = Number((tokensToday * 0.000003).toFixed(4));

      // Monthly cost from api_cost_log (graceful — table may not exist)
      let monthCostUsd: number | null = null;
      try {
        const { data: monthLogs } = await sbc
          .from("api_cost_log")
          .select("cost_usd")
          .gte("created_at", monthISO);
        if (monthLogs) {
          monthCostUsd = Number(
            (monthLogs as any[]).reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0).toFixed(4)
          );
        }
      } catch { /* table doesn't exist yet */ }

      return res.status(200).json({
        ok: true,
        usage: {
          total_messages:    totalMessages  || 0,
          completed_today:   completedToday || 0,
          tokens_today:      tokensToday,
          cost_today_usd:    costTodayUsd,
          blocked_today:     blockedToday,
          month_cost_usd:    monthCostUsd,
          generated_at:      new Date().toISOString(),
        },
      });
    } catch (e: any) {
      return res.status(200).json({ error: e?.message || "usage query failed" });
    }
  }

  return res.status(200).json({ error: `Unknown action: ${action}` });
}
