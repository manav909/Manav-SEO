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
  if (req.method !== "POST") return res.status(200).json({ error: "POST only" });
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

  return res.status(200).json({ error: `Unknown action: ${action}` });
}
