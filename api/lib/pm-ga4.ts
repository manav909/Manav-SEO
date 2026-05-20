/* ════════════════════════════════════════════════════════════════
   api/lib/pm-ga4.ts
   Google Analytics 4 integration for the PM module.
   Owns: OAuth start + callback, property listing, daily pull of
   organic sessions, users, conversions, bounce rate into
   metrics_snapshots, token refresh, status, disconnect.

   Critical detail: pulls are FILTERED TO ORGANIC TRAFFIC ONLY.
   The Data Room field is "Organic Sessions" — most agencies get
   this wrong by pulling total sessions. We filter on sessionMedium
   = "organic" so the number is the metric we actually care about.

   No additional Vercel function — all routed through task-engine.ts.
   OAuth callback URL: /api/task-engine?action=ga4_oauth_callback
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { encryptString, safeDecrypt } from "./crypto-box.js";

/* ── config ───────────────────────────────────────────────── */

const SCOPE       = "https://www.googleapis.com/auth/analytics.readonly";
const OAUTH_AUTH  = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const ADMIN_API   = "https://analyticsadmin.googleapis.com/v1beta";
const DATA_API    = "https://analyticsdata.googleapis.com/v1beta";

/* GA4 shares OAuth credentials with GSC — same Google Cloud project,
   same client ID/secret. The redirect URI per provider differentiates
   the callback flow via the ?action= param. */
function clientCreds() {
  const id     = process.env.GSC_CLIENT_ID || "";
  const secret = process.env.GSC_CLIENT_SECRET || "";
  const redir  = process.env.GA4_REDIRECT_URI || (process.env.GSC_REDIRECT_URI || "").replace("gsc_oauth_callback", "ga4_oauth_callback");
  if (!id || !secret || !redir) {
    throw new Error("GSC_CLIENT_ID / GSC_CLIENT_SECRET / GA4_REDIRECT_URI (or GSC_REDIRECT_URI fallback) must be set in env.");
  }
  return { id, secret, redir };
}

/* ── state ────────────────────────────────────────────────── */

function packState(projectId: string): string {
  const nonce = Math.random().toString(36).slice(2, 14);
  return `${projectId}.${nonce}`;
}
function unpackState(state: string): { projectId: string } | null {
  if (!state) return null;
  const idx = state.indexOf(".");
  if (idx <= 0) return null;
  const projectId = state.slice(0, idx);
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  return { projectId };
}

/* ── 1. start OAuth ───────────────────────────────────────── */

export async function ga4OauthStart(projectId: string): Promise<{
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
    url.searchParams.set("state",         state);
    return { success: true, url: url.toString() };
  } catch (e: any) {
    return { success: false, error: e?.message || "oauth start failed" };
  }
}

/* ── 2. OAuth callback ────────────────────────────────────── */

export async function ga4OauthCallback(opts: {
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
      return { success: false, error: "Google did not return a refresh token. Disconnect in Google Account → Apps with access, then reconnect." };
    }
    const expAt = expIn ? new Date(Date.now() + expIn * 1000).toISOString() : null;

    const { error } = await db().from("project_integrations").upsert({
      project_id:        parsed.projectId,
      provider:          "ga4",
      refresh_token_enc: encryptString(refresh),
      access_token:      access || null,
      access_token_exp:  expAt,
      connected_at:      new Date().toISOString(),
    }, { onConflict: "project_id,provider" });

    if (error) return { success: false, error: error.message };

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>GA4 connected</title>
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
  <h1>✓ Google Analytics 4 connected</h1>
  <p>Pick which GA4 property applies to this project from the Integrations section.</p>
  <p><a href="/pm">Open PM module →</a></p>
</div>
<script>setTimeout(() => { try { window.opener && window.opener.postMessage({ type: 'ga4_connected', projectId: '${parsed.projectId}' }, '*'); window.close(); } catch(e){} }, 800);</script>
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
      .eq("project_id", projectId).eq("provider", "ga4").maybeSingle();
    if (!row) return { error: "Not connected — connect Google Analytics 4 first." };
    const r = row as any;

    if (r.access_token && r.access_token_exp && new Date(r.access_token_exp).getTime() > Date.now() + 30_000) {
      return { token: r.access_token };
    }

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
    }).eq("project_id", projectId).eq("provider", "ga4");
    return { token: newAccess };
  } catch (e: any) {
    return { error: e?.message || "token fetch failed" };
  }
}

/* ── 4. property listing ──────────────────────────────────── */

/** List the GA4 properties the connected account can access.
 *  GA4's admin API is two-level: account → properties. We list all
 *  accounts the user can read, then list properties under each. */
export async function ga4ListProperties(projectId: string): Promise<{
  success: boolean; properties?: { id: string; name: string; account: string }[]; error?: string;
}> {
  if (!projectId) return { success: false, error: "projectId required" };
  const { token, error } = await getAccessToken(projectId);
  if (error) return { success: false, error };
  try {
    /* fetch accountSummaries — returns accounts + properties in one call */
    const res = await fetch(`${ADMIN_API}/accountSummaries`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { success: false, error: `GA4 admin API: ${res.status} ${t.slice(0, 200)}` };
    }
    const j = await res.json() as any;
    const properties: { id: string; name: string; account: string }[] = [];
    for (const acc of (j?.accountSummaries || [])) {
      for (const p of (acc?.propertySummaries || [])) {
        /* p.property is like "properties/123456789" */
        properties.push({
          id:      p.property,
          name:    p.displayName || p.property,
          account: acc.displayName || acc.account || "",
        });
      }
    }
    return { success: true, properties };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/* ── 5. select property ───────────────────────────────────── */

export async function ga4SelectProperty(opts: {
  projectId: string; propertyId: string; label?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!opts.projectId || !opts.propertyId) return { success: false, error: "projectId + propertyId required" };
  try {
    const { error } = await db().from("project_integrations").update({
      resource_id:    opts.propertyId,
      resource_label: opts.label || opts.propertyId,
    }).eq("project_id", opts.projectId).eq("provider", "ga4");
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "select failed" };
  }
}

/* ── 6. pull metrics — ORGANIC TRAFFIC ONLY ──────────────── */

/** Pull GA4 organic-traffic metrics for the project's chosen property,
 *  default last 7 days. Filters to sessionMedium=organic so the Data
 *  Room "organic sessions" field is what the PM expects.
 *
 *  Metrics pulled: sessions, totalUsers, engagedSessions, conversions,
 *  bounceRate, averageSessionDuration. Mirror writes to Data Room
 *  fields: organic_sessions_monthly, conversions_monthly, bounce_rate. */
export async function ga4Pull(opts: {
  projectId: string;
  days?: number;
  source?: "manual" | "cron" | "report_generation";
}): Promise<{
  success: boolean; error?: string;
  totals?: { sessions: number; users: number; conversions: number; bounceRate: number; engagedSessions: number; avgSessionSec: number };
}> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  const days = Math.min(Math.max(opts.days || 7, 1), 90);
  const source = opts.source || "manual";
  try {
    const { data: integ } = await db().from("project_integrations").select("*")
      .eq("project_id", opts.projectId).eq("provider", "ga4").maybeSingle();
    if (!integ) return { success: false, error: "GA4 not connected for this project." };
    const i = integ as any;
    if (!i.resource_id) return { success: false, error: "No GA4 property selected — pick one in Integrations first." };

    const { token, error: tokErr } = await getAccessToken(opts.projectId);
    if (tokErr) {
      await db().from("project_integrations").update({
        last_pull_at: new Date().toISOString(),
        last_pull_status: "error", last_pull_error: tokErr,
      }).eq("project_id", opts.projectId).eq("provider", "ga4");
      return { success: false, error: tokErr };
    }

    const startDate = `${days}daysAgo`;
    const endDate   = "yesterday";          /* GA4 has reporting latency — yesterday is the safe most-recent boundary */
    const url = `${DATA_API}/${i.resource_id}:runReport`;

    /* ── Build the request — ORGANIC FILTER is the key strategic detail ── */
    const body = {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "engagedSessions" },
        { name: "conversions" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
      ],
      dimensionFilter: {
        filter: {
          fieldName: "sessionMedium",
          stringFilter: { matchType: "EXACT", value: "organic", caseSensitive: false },
        },
      },
    };

    const res = await fetch(url, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      const errMsg = `GA4 query: ${res.status} ${t.slice(0, 200)}`;
      await db().from("project_integrations").update({
        last_pull_at: new Date().toISOString(),
        last_pull_status: "error", last_pull_error: errMsg,
      }).eq("project_id", opts.projectId).eq("provider", "ga4");
      return { success: false, error: errMsg };
    }
    const j = await res.json() as any;
    const row = (j?.rows || [])[0];
    const vals = (row?.metricValues || []).map((v: any) => Number(v?.value || 0));
    /* metric order must match the request above */
    const totals = {
      sessions:        vals[0] || 0,
      users:           vals[1] || 0,
      engagedSessions: vals[2] || 0,
      conversions:     vals[3] || 0,
      bounceRate:      vals[4] || 0,    /* GA4 returns bounce rate as 0..1 */
      avgSessionSec:   vals[5] || 0,
    };

    /* write a metrics_snapshot row */
    await db().from("metrics_snapshots").insert({
      project_id:       opts.projectId,
      organic_sessions: totals.sessions,
      conversions:      totals.conversions,
      bounce_rate:      totals.bounceRate * 100,    /* normalise to %, matches GSC mirror convention */
      source:           source,
      extras: {
        ga4_window_days:     days,
        ga4_users:           totals.users,
        ga4_engaged_sessions: totals.engagedSessions,
        ga4_avg_session_sec: totals.avgSessionSec,
        ga4_property:        i.resource_id,
        ga4_filter:          "organic",
      },
    });

    /* mirror into the Data Room — same approach as GSC */
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = [
        { key: "organic_sessions_monthly", value: String(totals.sessions) },
        { key: "conversions_monthly",      value: String(totals.conversions) },
        { key: "bounce_rate",              value: (totals.bounceRate * 100).toFixed(2) + "%" },
      ];
      for (const r of rows) {
        await db().from("project_knowledge").upsert({
          project_id:  opts.projectId,
          category:    "analytics",
          field_key:   r.key,
          field_value: r.value,
          source:      "ga4_auto",
          source_name: i.resource_id,
          data_date:   today,
          notes:       `Auto-synced from Google Analytics 4 (organic traffic only, last ${days}-day window).`,
          updated_at:  new Date().toISOString(),
        }, { onConflict: "project_id,category,field_key" });
      }
    } catch (e: any) {
      console.error("[pm-ga4] data-room mirror failed:", e?.message || e);
    }

    /* update last pull status */
    await db().from("project_integrations").update({
      last_pull_at: new Date().toISOString(),
      last_pull_status: "ok", last_pull_error: null,
    }).eq("project_id", opts.projectId).eq("provider", "ga4");

    return { success: true, totals };
  } catch (e: any) {
    return { success: false, error: e?.message || "pull failed" };
  }
}

/* ── 7. status & disconnect ───────────────────────────────── */

export async function ga4Status(projectId: string): Promise<{
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
    ).eq("project_id", projectId).eq("provider", "ga4").maybeSingle();
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

export async function ga4Disconnect(projectId: string): Promise<{ success: boolean; error?: string }> {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { error } = await db().from("project_integrations").delete()
      .eq("project_id", projectId).eq("provider", "ga4");
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "disconnect failed" };
  }
}

/* ── 8. cron pull-all ─────────────────────────────────────── */

export async function ga4CronPullAll(): Promise<{
  pulled: number; failed: number; errors: string[];
}> {
  const errors: string[] = [];
  let pulled = 0, failed = 0;
  try {
    const { data: rows } = await db().from("project_integrations")
      .select("project_id,resource_id")
      .eq("provider", "ga4")
      .not("resource_id", "is", null);
    for (const r of (rows || [])) {
      const pid = (r as any).project_id;
      try {
        const result = await ga4Pull({ projectId: pid, source: "cron", days: 7 });
        if (result.success) pulled++; else { failed++; errors.push(`${pid}: ${result.error}`); }
      } catch (e: any) {
        failed++; errors.push(`${pid}: ${e?.message || "fail"}`);
      }
    }
  } catch (e: any) {
    errors.push(`ga4CronPullAll: ${e?.message || "fail"}`);
  }
  return { pulled, failed, errors };
}

/* ── dispatch ─────────────────────────────────────────────── */

export async function handlePmGa4(action: string, body: any, req?: any, res?: any): Promise<any | null> {
  switch (action) {
    case "ga4_oauth_start":     return ga4OauthStart(body.projectId);
    case "ga4_oauth_callback": {
      const code  = String(body.code || req?.query?.code || "");
      const state = String(body.state || req?.query?.state || "");
      const r = await ga4OauthCallback({ code, state });
      return { ...r, _html: r.html };
    }
    case "ga4_list_properties":  return ga4ListProperties(body.projectId);
    case "ga4_select_property":  return ga4SelectProperty(body);
    case "ga4_pull":             return ga4Pull(body);
    case "ga4_status":           return ga4Status(body.projectId);
    case "ga4_disconnect":       return ga4Disconnect(body.projectId);
    default: return null;
  }
}
