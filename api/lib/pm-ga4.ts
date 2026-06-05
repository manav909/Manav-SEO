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
      // Detect invalid_grant — refresh token is dead (revoked, expired,
      // password changed, client secret rotated). The token will NEVER
      // succeed again; reconnection is required. Mark the integration so
      // the UI shows a clear "Reconnect" prompt instead of repeatedly
      // hammering Google with a known-bad token.
      const isInvalidGrant = res.status === 400 && /invalid_grant/i.test(errText);
      if (isInvalidGrant) {
        try {
          await db().from("project_integrations").update({
            access_token: null,
            access_token_exp: null,
            last_error: "Refresh token revoked or expired. Reconnect Google Analytics 4 to restore the link.",
            connection_state: "needs_reconnect",
          }).eq("project_id", projectId).eq("provider", "ga4");
        } catch { /* graceful — column may not exist on older schema */ }
        return { error: "Google Analytics 4 connection has expired. Disconnect and reconnect the integration to restore access. (Refresh tokens expire after 6 months of inactivity, on password change, or if access was revoked from the Google account.)" };
      }
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
  fetched?: {
    totals?:               boolean;
    daily_trend?:          boolean;
    top_landing_pages?:    number;
    top_countries?:        number;
    top_devices?:          number;
    top_traffic_sources?:  number;
  };
}> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  const days = Math.min(Math.max(opts.days || 28, 1), 90);
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
    const url       = `${DATA_API}/${i.resource_id}:runReport`;
    const fetched: any = {};

    /* Reusable filter: organic traffic only */
    const organicFilter = {
      filter: {
        fieldName: "sessionMedium",
        stringFilter: { matchType: "EXACT", value: "organic", caseSensitive: false },
      },
    };

    /* ── Helper: run one Data API query, return parsed rows ── */
    const runReport = async (body: any): Promise<any | null> => {
      try {
        const res = await fetch(url, {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error(`[pm-ga4] sub-query failed: ${res.status} ${t.slice(0, 200)}`);
          return null;
        }
        return await res.json();
      } catch (e: any) {
        console.error(`[pm-ga4] sub-query exception: ${e?.message || e}`);
        return null;
      }
    };

    /* ── 1. Totals (must succeed) ────────────────────────────────── */
    const totalsResp = await runReport({
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "engagedSessions" },
        { name: "conversions" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
      ],
      dimensionFilter: organicFilter,
    });
    if (!totalsResp) {
      const errMsg = `GA4 totals query failed`;
      await db().from("project_integrations").update({
        last_pull_at: new Date().toISOString(),
        last_pull_status: "error", last_pull_error: errMsg,
      }).eq("project_id", opts.projectId).eq("provider", "ga4");
      return { success: false, error: errMsg };
    }
    const tRow = (totalsResp?.rows || [])[0];
    const tVals = (tRow?.metricValues || []).map((v: any) => Number(v?.value || 0));
    const totals = {
      sessions:        tVals[0] || 0,
      users:           tVals[1] || 0,
      engagedSessions: tVals[2] || 0,
      conversions:     tVals[3] || 0,
      bounceRate:      tVals[4] || 0,    /* GA4 returns bounce rate as 0..1 */
      avgSessionSec:   tVals[5] || 0,
    };
    fetched.totals = true;

    /* ── 2-7. Top N by dimensions + daily trend + 365d trend (parallel) ─── */
    const [topPages, topCountries, topDevices, topSources, dailyTrend, fullTrend365, aiReferralSources, aiReferralDaily] = await Promise.all([
      runReport({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "landingPagePlusQueryString" }],
        metrics:    [{ name: "sessions" }, { name: "conversions" }, { name: "bounceRate" }],
        dimensionFilter: organicFilter,
        orderBys:   [{ desc: true, metric: { metricName: "sessions" } }],
        limit:      25,
      }),
      runReport({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "country" }],
        metrics:    [{ name: "sessions" }, { name: "totalUsers" }],
        dimensionFilter: organicFilter,
        orderBys:   [{ desc: true, metric: { metricName: "sessions" } }],
        limit:      15,
      }),
      runReport({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "deviceCategory" }],
        metrics:    [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
        dimensionFilter: organicFilter,
        orderBys:   [{ desc: true, metric: { metricName: "sessions" } }],
        limit:      5,
      }),
      runReport({
        /* No organic filter — we want the full traffic source breakdown */
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics:    [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
        orderBys:   [{ desc: true, metric: { metricName: "sessions" } }],
        limit:      10,
      }),
      runReport({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics:    [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "engagedSessions" },
          { name: "conversions" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
        dimensionFilter: organicFilter,
        orderBys:   [{ dimension: { dimensionName: "date" } }],
        limit:      1000,
      }),
      /* Phase 1J — 365d trend for the intelligence engine */
      runReport({
        dateRanges: [{ startDate: "365daysAgo", endDate: "yesterday" }],
        dimensions: [{ name: "date" }],
        metrics:    [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "engagedSessions" },
          { name: "conversions" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
        dimensionFilter: organicFilter,
        orderBys:   [{ dimension: { dimensionName: "date" } }],
        limit:      1000,
      }),
      /* Build 12.16 — AI platform referral sources. Filter sessionSource
         to the known AI platforms emitting referral traffic. No medium
         filter because GA4 categorises these inconsistently (sometimes
         referral, sometimes organic). The dimension is sessionSource
         with a contains-OR pattern. */
      runReport({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionSource" }],
        metrics:    [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "engagedSessions" },
          { name: "conversions" },
        ],
        dimensionFilter: {
          orGroup: {
            expressions: [
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "chatgpt",    caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "perplexity", caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "gemini",     caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "claude",     caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "copilot",    caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "character.ai", caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "you.com",    caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "neeva",      caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "phind",      caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "kagi",       caseSensitive: false } } },
            ],
          },
        },
        orderBys: [{ desc: true, metric: { metricName: "sessions" } }],
        limit:    20,
      }),
      /* Build 12.16 — daily series of AI-platform referrals so the
         chart engine can render the growth curve over time */
      runReport({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics:    [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
        dimensionFilter: {
          orGroup: {
            expressions: [
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "chatgpt",    caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "perplexity", caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "gemini",     caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "claude",     caseSensitive: false } } },
              { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "copilot",    caseSensitive: false } } },
            ],
          },
        },
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit:    1000,
      }),
    ]);

    /* ── Shape helpers ───────────────────────────────────────────── */
    const shapeDim = (resp: any, dimKey: string, metricNames: string[]): any[] => {
      if (!resp?.rows) return [];
      return resp.rows.map((r: any) => {
        const out: any = { [dimKey]: r.dimensionValues?.[0]?.value || "(unknown)" };
        (r.metricValues || []).forEach((v: any, idx: number) => {
          const name = metricNames[idx] || `m${idx}`;
          /* Convert bounce rate (0..1) to % for readability */
          if (name === "bounceRate") {
            out[name] = Number(((Number(v?.value || 0)) * 100).toFixed(2));
          } else if (name === "averageSessionDuration") {
            out[name] = Number((Number(v?.value || 0)).toFixed(1));
          } else {
            out[name] = Number(v?.value || 0);
          }
        });
        return out;
      });
    };

    const topPagesShaped     = shapeDim(topPages,     "page",    ["sessions","conversions","bounceRate"]);
    const topCountriesShaped = shapeDim(topCountries, "country", ["sessions","users"]);
    const topDevicesShaped   = shapeDim(topDevices,   "device",  ["sessions","users","conversions"]);
    const topSourcesShaped   = shapeDim(topSources,   "channel", ["sessions","users","conversions"]);
    fetched.top_landing_pages   = topPagesShaped.length;
    fetched.top_countries       = topCountriesShaped.length;
    fetched.top_devices         = topDevicesShaped.length;
    fetched.top_traffic_sources = topSourcesShaped.length;
    fetched.daily_trend         = !!(dailyTrend?.rows?.length);

    /* write a metrics_snapshot row */
    /* Build 12.16 — compute AI referral totals locally for ride-along on snapshot row */
    const aiReferralTotalSessions = aiReferralSources?.rows?.reduce((s: number, r: any) =>
      s + Number(r.metricValues?.[0]?.value || 0), 0) || 0;
    const aiReferralTotalConversions = aiReferralSources?.rows?.reduce((s: number, r: any) =>
      s + Number(r.metricValues?.[3]?.value || 0), 0) || 0;
    const aiPlatformsList = (aiReferralSources?.rows || []).map((r: any) => r.dimensionValues?.[0]?.value).filter(Boolean);

    await db().from("metrics_snapshots").insert({
      project_id:       opts.projectId,
      organic_sessions: totals.sessions,
      conversions:      totals.conversions,
      bounce_rate:      totals.bounceRate * 100,    /* normalise to %, matches GSC mirror convention */
      source:           source,
      extras: {
        ga4_window_days:      days,
        ga4_users:            totals.users,
        ga4_engaged_sessions: totals.engagedSessions,
        ga4_avg_session_sec:  totals.avgSessionSec,
        ga4_property:         i.resource_id,
        ga4_filter:           "organic",
        top_landing_pages:    topPagesShaped.slice(0, 10),
        /* Build 12.16 — AI referral attribution */
        ga4_ai_referral_sessions:    aiReferralTotalSessions,
        ga4_ai_referral_conversions: aiReferralTotalConversions,
        ga4_ai_platforms_detected:   aiPlatformsList,
      },
    });

    /* ── Piece 2: write daily trend to `metrics` table ───────────────
       This is what the Phase 1H scope picker reads to chart organic
       sessions / conversions over time. */
    if (dailyTrend?.rows?.length > 0) {
      const dayRows = dailyTrend.rows.map((r: any) => {
        const date = r.dimensionValues?.[0]?.value;
        if (!date || date.length !== 8) return null;
        /* GA4 returns date as YYYYMMDD — reformat to ISO */
        const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T12:00:00.000Z`;
        const v = (r.metricValues || []).map((x: any) => Number(x?.value || 0));
        return {
          project_id:           opts.projectId,
          recorded_at:          iso,
          organic_sessions:     v[0] || 0,
          total_users:          v[1] || 0,
          engaged_sessions:     v[2] || 0,
          conversions:          v[3] || 0,
          bounce_rate:          Number(((v[4] || 0) * 100).toFixed(4)),
          avg_session_duration: Number((v[5] || 0).toFixed(2)),
          source:               "ga4_daily",
        };
      }).filter(Boolean);

      try {
        /* Delete-then-insert in the window — keeps the trend free of dupes */
        const startIso = new Date(Date.now() - days * 86_400_000).toISOString();
        const endIso   = new Date().toISOString();
        await db().from("metrics")
          .delete()
          .eq("project_id", opts.projectId)
          .eq("source",     "ga4_daily")
          .gte("recorded_at", startIso)
          .lte("recorded_at", endIso);
        await db().from("metrics").insert(dayRows as any);
      } catch (e: any) {
        console.error("[pm-ga4] daily trend write failed:", e?.message || e);
      }
    }

    /* ── Piece 3: mirror everything into the Data Room ─────────────
       Scalar totals (including the previously-DROPPED avg_session_duration!)
       + JSON-encoded top-N lists. Source='ga4_auto' protected by guards. */
    try {
      const today = new Date().toISOString().slice(0, 10);

      const scalarRows = [
        { key: "organic_sessions_monthly", value: String(totals.sessions) },
        { key: "conversions_monthly",      value: String(totals.conversions) },
        { key: "bounce_rate",              value: (totals.bounceRate * 100).toFixed(2) + "%" },
        /* PHASE 1I FIX — was fetched but never written before! */
        { key: "avg_session_duration",     value: totals.avgSessionSec.toFixed(1) + "s" },
        { key: "ga4_users_monthly",        value: String(totals.users) },
        { key: "ga4_engaged_sessions_monthly", value: String(totals.engagedSessions) },
        { key: "ga4_engagement_rate",      value: totals.sessions > 0
            ? ((totals.engagedSessions / totals.sessions) * 100).toFixed(2) + "%"
            : "0%" },
      ];

      const jsonRows: { key: string; value: string }[] = [];
      if (topPagesShaped.length     > 0) jsonRows.push({ key: "top_landing_pages",     value: JSON.stringify(topPagesShaped) });
      if (topCountriesShaped.length > 0) jsonRows.push({ key: "ga4_top_countries",     value: JSON.stringify(topCountriesShaped) });
      if (topDevicesShaped.length   > 0) jsonRows.push({ key: "ga4_top_devices",       value: JSON.stringify(topDevicesShaped) });
      if (topSourcesShaped.length   > 0) jsonRows.push({ key: "ga4_top_traffic_sources", value: JSON.stringify(topSourcesShaped) });

      /* Phase 1J — raw 365d daily trend for intel engine */
      if (fullTrend365?.rows?.length) {
        const trendShaped = fullTrend365.rows.map((r: any) => {
          const date = r.dimensionValues?.[0]?.value;
          if (!date || date.length !== 8) return null;
          const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
          const v = (r.metricValues || []).map((x: any) => Number(x?.value || 0));
          return {
            date:               iso,
            sessions:           v[0] || 0,
            users:              v[1] || 0,
            engagedSessions:    v[2] || 0,
            conversions:        v[3] || 0,
            bounceRate:         Number(((v[4] || 0) * 100).toFixed(2)),
            avgSessionDuration: Number((v[5] || 0).toFixed(1)),
          };
        }).filter(Boolean);
        jsonRows.push({ key: "ga4_daily_trend_365d", value: JSON.stringify(trendShaped) });
      }

      /* Build 12.16 — AI platform referrals (sessions, users, engaged, conv per source) */
      if (aiReferralSources?.rows?.length) {
        const aiSourcesShaped = aiReferralSources.rows.map((r: any) => {
          const v = (r.metricValues || []).map((x: any) => Number(x?.value || 0));
          return {
            source:           r.dimensionValues?.[0]?.value || "(unknown)",
            sessions:         v[0] || 0,
            totalUsers:       v[1] || 0,
            engagedSessions:  v[2] || 0,
            conversions:      v[3] || 0,
          };
        });
        const aiTotals = aiSourcesShaped.reduce((acc: any, r: any) => ({
          sessions:        acc.sessions        + r.sessions,
          totalUsers:      acc.totalUsers      + r.totalUsers,
          engagedSessions: acc.engagedSessions + r.engagedSessions,
          conversions:     acc.conversions     + r.conversions,
        }), { sessions: 0, totalUsers: 0, engagedSessions: 0, conversions: 0 });
        jsonRows.push({ key: "ga4_ai_platform_referrals", value: JSON.stringify(aiSourcesShaped) });
        jsonRows.push({ key: "ga4_ai_platform_summary", value: JSON.stringify({
          ...aiTotals,
          source_count: aiSourcesShaped.length,
          window_days:  days,
          measured_at:  new Date().toISOString(),
          platforms_detected: aiSourcesShaped.map((r: any) => r.source),
        }) });
      } else {
        /* Explicitly mark "no AI traffic detected" so the audit / workspace
           surfaces can render that as a confident negative result rather
           than a "data missing" hedge. */
        jsonRows.push({ key: "ga4_ai_platform_summary", value: JSON.stringify({
          sessions:           0,
          totalUsers:         0,
          engagedSessions:    0,
          conversions:        0,
          source_count:       0,
          window_days:        days,
          measured_at:        new Date().toISOString(),
          platforms_detected: [],
          note:               "No referral traffic from AI search platforms detected in this window. Either the site is not yet being cited in AI search surfaces, or visit volume is too low to register.",
        }) });
      }

      /* Build 12.16 — AI referral daily series for chart engine */
      if (aiReferralDaily?.rows?.length) {
        const aiDailyShaped = aiReferralDaily.rows.map((r: any) => {
          const date = r.dimensionValues?.[0]?.value;
          if (!date || date.length !== 8) return null;
          const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
          const v = (r.metricValues || []).map((x: any) => Number(x?.value || 0));
          return {
            date:        iso,
            sessions:    v[0] || 0,
            users:       v[1] || 0,
            conversions: v[2] || 0,
          };
        }).filter(Boolean);
        if (aiDailyShaped.length > 0) {
          jsonRows.push({ key: "ga4_ai_platform_daily", value: JSON.stringify(aiDailyShaped) });
        }
      }

      const allRows = [...scalarRows, ...jsonRows];
      for (const r of allRows) {
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

      /* ── Auto-set baseline date if not present ─────────────────
         The scope picker's "Since baseline" preset needs a date here.
         On the first successful pull, set it to (today - days) — that's
         the start of the earliest window we have data for. PM can
         override manually anytime. */
      const { data: existingBaseline } = await db().from("project_knowledge")
        .select("field_value,source")
        .eq("project_id", opts.projectId)
        .eq("category",   "analytics")
        .eq("field_key",  "organic_sessions_baseline_date")
        .maybeSingle();
      if (!existingBaseline?.field_value) {
        const baselineDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
        await db().from("project_knowledge").upsert({
          project_id:  opts.projectId,
          category:    "analytics",
          field_key:   "organic_sessions_baseline_date",
          field_value: baselineDate,
          source:      "ga4_auto",
          source_name: i.resource_id,
          data_date:   today,
          notes:       `Auto-set on first GA4 pull — start of the initial ${days}-day window. Override manually if your project's measurement baseline is different.`,
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

    /* Phase 1J — recompute the analytics intelligence layer (KPIs,
       rising/falling stars, period summaries) using the freshly stored
       GA4 trend + whatever GSC already wrote. */
    try {
      const { recomputeAnalyticsIntel } = await import("./pm-analytics-intel-orchestrator.js");
      await recomputeAnalyticsIntel(opts.projectId);
    } catch (e: any) {
      console.error("[pm-ga4] intel recompute failed:", e?.message || e);
    }

    return { success: true, totals, fetched };
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
  connectionState?: string;
  lastError?: string;
}> {
  if (!projectId) return { success: false, connected: false };
  try {
    // Try the richer column set first; fall back if the columns don't yet
    // exist (Build 10h migration not applied).
    let row: any = null;
    try {
      const { data } = await db().from("project_integrations").select(
        "resource_id,resource_label,last_pull_at,last_pull_status,last_pull_error,connected_at,connection_state,last_error"
      ).eq("project_id", projectId).eq("provider", "ga4").maybeSingle();
      row = data;
    } catch {
      const { data } = await db().from("project_integrations").select(
        "resource_id,resource_label,last_pull_at,last_pull_status,last_pull_error,connected_at"
      ).eq("project_id", projectId).eq("provider", "ga4").maybeSingle();
      row = data;
    }
    if (!row) return { success: true, connected: false };
    return {
      success: true,
      connected: true,
      resourceId:     row.resource_id || undefined,
      resourceLabel:  row.resource_label || undefined,
      lastPullAt:     row.last_pull_at || undefined,
      lastPullStatus: row.last_pull_status || undefined,
      lastPullError:  row.last_pull_error || undefined,
      connectedAt:    row.connected_at || undefined,
      connectionState: row.connection_state || undefined,
      lastError:       row.last_error || undefined,
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

/* ── 9. per-page metrics for tech-audit (Phase 16.5 Tier 2) ─────────── */

/** Pull per-URL engagement metrics for a single page from GA4.
 *  Used by seo-technical-audit's checkEngagementSignals to replace the
 *  site-wide hedge with real page-level data. Filters by pagePath
 *  dimension on the URL's pathname.
 *
 *  Returns null on any failure (no connection, no resource_id, query
 *  failure, no rows for this pagePath) — callers fall back gracefully
 *  to the site-wide signal. Best-effort, never throws. */
export async function ga4PullPageMetrics(opts: {
  projectId: string;
  pagePath:  string;        // e.g. "/power-apps-pricing-what-you-should-know..."
  days?:     number;        // default 28
}): Promise<{
  page_path:               string;
  sessions:                number;
  engaged_sessions:        number;
  engagement_rate_pct:     number;
  avg_session_sec:         number;
  bounce_rate_pct:         number;
  views:                   number;
  conversions:             number;
  date_range_days:         number;
  data_freshness:          string;   // "yesterday" — GA4's standard reporting boundary
} | null> {
  if (!opts.projectId || !opts.pagePath) return null;
  const days = opts.days || 28;
  try {
    const { data: integ } = await db().from("project_integrations").select("*")
      .eq("project_id", opts.projectId).eq("provider", "ga4").maybeSingle();
    if (!integ) return null;
    const i = integ as any;
    if (!i.resource_id) return null;

    const { token, error: tokErr } = await getAccessToken(opts.projectId);
    if (tokErr || !token) return null;

    const startDate = `${days}daysAgo`;
    const endDate   = "yesterday";
    const url       = `${DATA_API}/${i.resource_id}:runReport`;

    /* Filter by exact pagePath match — pathname only (strip query strings
       since GA4's pagePath dimension is the path component). */
    const cleanPagePath = opts.pagePath.split('?')[0].split('#')[0];

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "screenPageViews" },
        { name: "conversions" },
      ],
      dimensionFilter: {
        filter: {
          fieldName: "pagePath",
          stringFilter: { matchType: "EXACT", value: cleanPagePath, caseSensitive: false },
        },
      },
    };

    const res = await fetch(url, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.log(`[ga4PullPageMetrics] HTTP ${res.status} for project ${opts.projectId} path ${cleanPagePath}`);
      return null;
    }
    const json = await res.json();
    const rows = json?.rows || [];
    if (rows.length === 0) {
      /* No data for this exact pagePath in the date range — page may be
         new, low-traffic, or pathname doesn't match GA4's recording. */
      return null;
    }
    /* Take the first (and typically only) row since we filtered EXACT. */
    const row = rows[0];
    const vals = (row?.metricValues || []).map((v: any) => Number(v?.value || 0));
    return {
      page_path:           cleanPagePath,
      sessions:            vals[0] || 0,
      engaged_sessions:    vals[1] || 0,
      engagement_rate_pct: Number(((vals[2] || 0) * 100).toFixed(1)),
      avg_session_sec:     Number((vals[3] || 0).toFixed(1)),
      bounce_rate_pct:     Number(((vals[4] || 0) * 100).toFixed(1)),
      views:               vals[5] || 0,
      conversions:         vals[6] || 0,
      date_range_days:     days,
      data_freshness:      endDate,
    };
  } catch (e: any) {
    console.log(`[ga4PullPageMetrics] exception: ${e?.message || 'unknown'}`);
    return null;
  }
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
