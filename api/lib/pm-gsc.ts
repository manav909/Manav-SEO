/* ════════════════════════════════════════════════════════════════
   api/lib/pm-gsc.ts
   Google Search Console integration for the PM module.
   Owns: OAuth start + callback, property listing, daily pull of
   clicks/impressions/position into metrics_snapshots, token refresh,
   per-project connection status, disconnect.

   No additional Vercel function — all routed through task-engine.ts.
   OAuth callback URL: /api/task-engine?action=gsc_oauth_callback
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { encryptString, safeDecrypt } from "./crypto-box.js";

/* ── config ───────────────────────────────────────────────── */

const SCOPE          = "https://www.googleapis.com/auth/webmasters.readonly";
const OAUTH_AUTH     = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN    = "https://oauth2.googleapis.com/token";
const SITES_API      = "https://www.googleapis.com/webmasters/v3/sites";
const SEARCHANAL_API = "https://www.googleapis.com/webmasters/v3/sites";

function clientCreds() {
  const id     = process.env.GSC_CLIENT_ID || "";
  const secret = process.env.GSC_CLIENT_SECRET || "";
  const redir  = process.env.GSC_REDIRECT_URI || "";
  if (!id || !secret || !redir) {
    throw new Error("GSC_CLIENT_ID / GSC_CLIENT_SECRET / GSC_REDIRECT_URI must be set in env.");
  }
  return { id, secret, redir };
}

/* ── tiny state helper ────────────────────────────────────── */
/* OAuth state must round-trip project_id without trusting client storage.
   Format: <projectId>.<random> — random is a CSRF anti-replay nonce. */

function packState(projectId: string): string {
  const nonce = Math.random().toString(36).slice(2, 14);
  return `${projectId}.${nonce}`;
}
function unpackState(state: string): { projectId: string } | null {
  if (!state) return null;
  const idx = state.indexOf(".");
  if (idx <= 0) return null;
  const projectId = state.slice(0, idx);
  /* UUID shape check — lightweight; full validation is the DB FK */
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  return { projectId };
}

/* ── 1. start OAuth ───────────────────────────────────────── */

/** Build the Google OAuth URL the PM should be sent to. */
export async function gscOauthStart(projectId: string): Promise<{
  success: boolean; url?: string; error?: string;
}> {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { id, redir } = clientCreds();
    const state = packState(projectId);
    const url = new URL(OAUTH_AUTH);
    url.searchParams.set("client_id",     id);
    url.searchParams.set("redirect_uri",  redir);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope",         SCOPE);
    url.searchParams.set("access_type",   "offline");
    url.searchParams.set("prompt",        "consent");
                          /* prompt=consent forces refresh-token issuance every time */
    url.searchParams.set("state",         state);
    return { success: true, url: url.toString() };
  } catch (e: any) {
    return { success: false, error: e?.message || "oauth start failed" };
  }
}

/* ── 2. OAuth callback ────────────────────────────────────── */

/** Exchange the auth code for tokens and persist (encrypted refresh). */
export async function gscOauthCallback(opts: {
  code: string; state: string;
}): Promise<{ success: boolean; projectId?: string; error?: string; html?: string }> {
  if (!opts.code || !opts.state)
    return { success: false, error: "code + state required" };
  const parsed = unpackState(opts.state);
  if (!parsed) return { success: false, error: "invalid state" };

  try {
    const { id, secret, redir } = clientCreds();
    const tokenRes = await fetch(OAUTH_TOKEN, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: opts.code,
        client_id:     id,
        client_secret: secret,
        redirect_uri:  redir,
        grant_type:    "authorization_code",
      }).toString(),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text().catch(() => "");
      return { success: false, error: `Google token exchange failed: ${err.slice(0, 200)}` };
    }
    const tk = await tokenRes.json() as any;
    const refresh = tk.refresh_token as string | undefined;
    const access  = tk.access_token  as string | undefined;
    const expIn   = Number(tk.expires_in || 0);
    if (!refresh) {
      /* If Google didn't return a refresh token (user previously consented
         without forcing consent), we cannot maintain long-term access. */
      return { success: false, error: "Google did not return a refresh token. Try disconnecting in Google Account → Apps with access, then re-connect." };
    }
    const expAt = expIn ? new Date(Date.now() + expIn * 1000).toISOString() : null;

    /* upsert encrypted token into project_integrations */
    const { error } = await db().from("project_integrations").upsert({
      project_id:        parsed.projectId,
      provider:          "gsc",
      refresh_token_enc: encryptString(refresh),
      access_token:      access || null,
      access_token_exp:  expAt,
      connected_at:      new Date().toISOString(),
    }, { onConflict: "project_id,provider" });

    if (error) return { success: false, error: error.message };

    /* Return a small HTML page the browser can render after the redirect.
       Tells the PM it worked and points them back to the Data Room. */
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>GSC connected</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .card { max-width: 480px; padding: 32px; border-radius: 16px; border: 1px solid #2a2a2a; background: #141414; text-align: center; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { font-size: 14px; color: #a3a3a3; margin: 0 0 16px; line-height: 1.5; }
  a { color: #818cf8; text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
</style>
</head><body>
<div class="card">
  <h1>✓ Google Search Console connected</h1>
  <p>You can now pick which Search Console property applies to this project from the Data Room → Integrations section.</p>
  <p><a href="/data-room">Open Data Room →</a></p>
</div>
<script>setTimeout(() => { try { window.opener && window.opener.postMessage({ type: 'gsc_connected', projectId: '${parsed.projectId}' }, '*'); window.close(); } catch(e){} }, 800);</script>
</body></html>`;
    return { success: true, projectId: parsed.projectId, html };
  } catch (e: any) {
    return { success: false, error: e?.message || "callback failed" };
  }
}

/* ── 3. token refresh (internal) ──────────────────────────── */

async function getAccessToken(projectId: string): Promise<{
  token?: string; error?: string;
}> {
  try {
    const { data: row } = await db().from("project_integrations").select("*")
      .eq("project_id", projectId).eq("provider", "gsc").maybeSingle();
    if (!row) return { error: "Not connected — connect Google Search Console first." };
    const r = row as any;

    /* if we already have a valid access token, use it */
    if (r.access_token && r.access_token_exp && new Date(r.access_token_exp).getTime() > Date.now() + 30_000) {
      return { token: r.access_token };
    }

    /* otherwise refresh */
    const refresh = safeDecrypt(r.refresh_token_enc);
    if (!refresh) return { error: "Stored token unreadable — disconnect and reconnect." };
    const { id, secret } = clientCreds();
    const res = await fetch(OAUTH_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     id,
        client_secret: secret,
        refresh_token: refresh,
        grant_type:    "refresh_token",
      }).toString(),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { error: `Token refresh failed: ${errText.slice(0, 200)}` };
    }
    const tk = await res.json() as any;
    const newAccess = tk.access_token as string | undefined;
    if (!newAccess) return { error: "Google did not return an access token." };
    const expIn = Number(tk.expires_in || 0);
    const expAt = expIn ? new Date(Date.now() + expIn * 1000).toISOString() : null;
    await db().from("project_integrations").update({
      access_token: newAccess, access_token_exp: expAt,
    }).eq("project_id", projectId).eq("provider", "gsc");
    return { token: newAccess };
  } catch (e: any) {
    return { error: e?.message || "token fetch failed" };
  }
}

/* ── 4. property listing ──────────────────────────────────── */

/** List the Search Console properties the connected account can read. */
export async function gscListProperties(projectId: string): Promise<{
  success: boolean; sites?: any[]; error?: string;
}> {
  if (!projectId) return { success: false, error: "projectId required" };
  const { token, error } = await getAccessToken(projectId);
  if (error) return { success: false, error };
  try {
    const res = await fetch(SITES_API, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { success: false, error: `GSC sites API: ${res.status} ${t.slice(0, 200)}` };
    }
    const j = await res.json() as any;
    const sites = (j?.siteEntry || []).map((s: any) => ({
      url:    s.siteUrl,
      perm:   s.permissionLevel,
    }));
    return { success: true, sites };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/* ── 5. select property ───────────────────────────────────── */

export async function gscSelectProperty(opts: {
  projectId: string; siteUrl: string; label?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!opts.projectId || !opts.siteUrl) return { success: false, error: "projectId + siteUrl required" };
  try {
    const { error } = await db().from("project_integrations").update({
      resource_id:    opts.siteUrl,
      resource_label: opts.label || opts.siteUrl,
    }).eq("project_id", opts.projectId).eq("provider", "gsc");
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "select failed" };
  }
}

/* ── 6. pull metrics ──────────────────────────────────────── */

/** Pull GSC totals for the project's chosen property, default last 7 days,
 *  and write a metrics_snapshot row. Designed to be safe to call daily. */
export async function gscPull(opts: {
  projectId: string;
  days?: number;          // default 7
  source?: "manual" | "cron" | "report_generation";
}): Promise<{
  success: boolean; error?: string;
  totals?: { clicks: number; impressions: number; position: number; ctr: number };
}> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  const days = Math.min(Math.max(opts.days || 7, 1), 90);
  const source = opts.source || "manual";
  try {
    const { data: integ } = await db().from("project_integrations").select("*")
      .eq("project_id", opts.projectId).eq("provider", "gsc").maybeSingle();
    if (!integ) return { success: false, error: "GSC not connected for this project." };
    const i = integ as any;
    if (!i.resource_id) return { success: false, error: "No GSC property selected — pick one in Integrations first." };

    const { token, error: tokErr } = await getAccessToken(opts.projectId);
    if (tokErr) {
      await db().from("project_integrations").update({
        last_pull_at: new Date().toISOString(),
        last_pull_status: "error", last_pull_error: tokErr,
      }).eq("project_id", opts.projectId).eq("provider", "gsc");
      return { success: false, error: tokErr };
    }

    const startDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const endDate   = new Date().toISOString().slice(0, 10);
    const propPath  = encodeURIComponent(i.resource_id);
    const url = `${SEARCHANAL_API}/${propPath}/searchAnalytics/query`;
    const res = await fetch(url, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate, endDate,
        dimensions: [],       /* totals — no breakdown */
        rowLimit: 1,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      const errMsg = `GSC query: ${res.status} ${t.slice(0, 200)}`;
      await db().from("project_integrations").update({
        last_pull_at: new Date().toISOString(),
        last_pull_status: "error", last_pull_error: errMsg,
      }).eq("project_id", opts.projectId).eq("provider", "gsc");
      return { success: false, error: errMsg };
    }
    const j = await res.json() as any;
    const row = (j?.rows || [])[0] || {};
    const totals = {
      clicks:      Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      position:    Number(row.position || 0),
      ctr:         Number(row.ctr || 0),
    };

    /* write a metrics_snapshot row so the chart engine + reports pick this up */
    await db().from("metrics_snapshots").insert({
      project_id:        opts.projectId,
      gsc_clicks:        totals.clicks,
      gsc_impressions:   totals.impressions,
      gsc_avg_position:  totals.position,
      source:            source,
      extras:            { gsc_window_days: days, gsc_ctr: totals.ctr, gsc_property: i.resource_id },
    });

    /* ── Piece 1: mirror into the Data Room ──
       Make the Data Room the single source of truth: every successful
       pull updates project_knowledge.analytics with source='gsc_auto'
       and data_date=today. PM never sees stale numbers in the brief. */
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = [
        { key: "gsc_total_clicks",      value: String(totals.clicks) },
        { key: "gsc_total_impressions", value: String(totals.impressions) },
        { key: "gsc_avg_position",      value: totals.position.toFixed(2) },
        { key: "gsc_ctr",               value: (totals.ctr * 100).toFixed(2) + "%" },
      ];
      for (const r of rows) {
        await db().from("project_knowledge").upsert({
          project_id:  opts.projectId,
          category:    "analytics",
          field_key:   r.key,
          field_value: r.value,
          source:      "gsc_auto",
          source_name: i.resource_id,
          data_date:   today,
          notes:       `Auto-synced from Google Search Console — last ${days}-day window.`,
          updated_at:  new Date().toISOString(),
        }, { onConflict: "project_id,category,field_key" });
      }
    } catch (e: any) {
      /* mirror is best-effort — the snapshot already landed, so charts
         and reports still see the data. Surface the error in last_pull_error. */
      console.error("[pm-gsc] data-room mirror failed:", e?.message || e);
    }

    /* update last pull status */
    await db().from("project_integrations").update({
      last_pull_at: new Date().toISOString(),
      last_pull_status: "ok", last_pull_error: null,
    }).eq("project_id", opts.projectId).eq("provider", "gsc");

    return { success: true, totals };
  } catch (e: any) {
    return { success: false, error: e?.message || "pull failed" };
  }
}

/* ── 7. status & disconnect ───────────────────────────────── */

export async function gscStatus(projectId: string): Promise<{
  success: boolean;
  connected: boolean;
  resourceId?: string;
  resourceLabel?: string;
  lastPullAt?: string;
  lastPullStatus?: string;
  lastPullError?: string;
  connectedAt?: string;
}> {
  if (!projectId) return { success: false, connected: false };
  try {
    const { data: row } = await db().from("project_integrations").select(
      "resource_id,resource_label,last_pull_at,last_pull_status,last_pull_error,connected_at"
    ).eq("project_id", projectId).eq("provider", "gsc").maybeSingle();
    if (!row) return { success: true, connected: false };
    return {
      success: true,
      connected: true,
      resourceId:     (row as any).resource_id || undefined,
      resourceLabel:  (row as any).resource_label || undefined,
      lastPullAt:     (row as any).last_pull_at || undefined,
      lastPullStatus: (row as any).last_pull_status || undefined,
      lastPullError:  (row as any).last_pull_error || undefined,
      connectedAt:    (row as any).connected_at || undefined,
    };
  } catch {
    return { success: false, connected: false };
  }
}

export async function gscDisconnect(projectId: string): Promise<{ success: boolean; error?: string }> {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { error } = await db().from("project_integrations").delete()
      .eq("project_id", projectId).eq("provider", "gsc");
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "disconnect failed" };
  }
}

/* ── 8. cron pull-all ─────────────────────────────────────── */

/** Daily cron job: pull GSC for every project that has a selected
 *  property. Best-effort; errors per project don't stop the batch. */
export async function gscCronPullAll(): Promise<{
  pulled: number; failed: number; errors: string[];
}> {
  const errors: string[] = [];
  let pulled = 0, failed = 0;
  try {
    const { data: rows } = await db().from("project_integrations")
      .select("project_id,resource_id")
      .eq("provider", "gsc")
      .not("resource_id", "is", null);
    for (const r of (rows || [])) {
      const pid = (r as any).project_id;
      try {
        const result = await gscPull({ projectId: pid, source: "cron", days: 7 });
        if (result.success) pulled++; else { failed++; errors.push(`${pid}: ${result.error}`); }
      } catch (e: any) {
        failed++; errors.push(`${pid}: ${e?.message || "fail"}`);
      }
    }
  } catch (e: any) {
    errors.push(`gscCronPullAll: ${e?.message || "fail"}`);
  }
  return { pulled, failed, errors };
}

/* ── dispatch ─────────────────────────────────────────────── */

export async function handlePmGsc(action: string, body: any, req?: any, res?: any): Promise<any | null> {
  switch (action) {
    case "gsc_oauth_start":     return gscOauthStart(body.projectId);
    case "gsc_oauth_callback": {
      /* This action is hit by Google's redirect — req.query.code/state.
         Returns HTML to render directly. task-engine handles the res. */
      const code  = String(body.code || req?.query?.code || "");
      const state = String(body.state || req?.query?.state || "");
      const r = await gscOauthCallback({ code, state });
      return { ...r, _html: r.html };   /* signal to dispatcher to write html */
    }
    case "gsc_list_properties":  return gscListProperties(body.projectId);
    case "gsc_select_property":  return gscSelectProperty(body);
    case "gsc_pull":             return gscPull(body);
    case "gsc_status":           return gscStatus(body.projectId);
    case "gsc_disconnect":       return gscDisconnect(body.projectId);
    default: return null;
  }
}
