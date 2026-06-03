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
/* OAuth state round-trips either project_id or site_id.
   Format: <type>:<id>.<nonce>
   type = 'p' for project, 's' for site */

function packState(id: string, type: 'p' | 's' = 'p'): string {
  const nonce = Math.random().toString(36).slice(2, 14);
  return `${type}:${id}.${nonce}`;
}
function unpackState(state: string): { projectId?: string; siteId?: string } | null {
  if (!state) return null;
  // New format: type:id.nonce
  const colonIdx = state.indexOf(':');
  const dotIdx   = state.lastIndexOf('.');
  if (colonIdx > 0 && dotIdx > colonIdx) {
    const type = state.slice(0, colonIdx);
    const id   = state.slice(colonIdx + 1, dotIdx);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    if (type === 's') return { siteId: id };
    return { projectId: id };
  }
  // Legacy format: projectId.nonce
  const idx = state.indexOf('.');
  if (idx <= 0) return null;
  const projectId = state.slice(0, idx);
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

/** Build the Google OAuth URL for a site workspace (no project needed). */
export async function gscOauthStartForSite(siteId: string): Promise<{
  success: boolean; url?: string; error?: string;
}> {
  if (!siteId) return { success: false, error: "siteId required" };
  try {
    const { id, redir } = clientCreds();
    const state = packState(siteId, 's');
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

    if (parsed.siteId) {
      /* Site workspace GSC — save to dev_sites AND to project_integrations
         so all audit check functions (checkCoreWebVitals, checkIndexability etc)
         work immediately without any extra setup. */
      const { error: siteErr } = await db().from("dev_sites").update({
        gsc_access_token:  access || null,
        gsc_refresh_token: refresh,
        gsc_token_expiry:  expAt,
        gsc_connected_at:  new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }).eq("id", parsed.siteId);
      if (siteErr) return { success: false, error: siteErr.message };

      // Also mirror to project_integrations if site has a linked project
      try {
        const { data: site } = await db().from("dev_sites")
          .select("project_id").eq("id", parsed.siteId).maybeSingle();
        if ((site as any)?.project_id) {
          await db().from("project_integrations").upsert({
            project_id:        (site as any).project_id,
            provider:          "gsc",
            refresh_token_enc: encryptString(refresh),
            access_token:      access || null,
            access_token_exp:  expAt,
            connected_at:      new Date().toISOString(),
          }, { onConflict: "project_id,provider" });
        }
      } catch { /* mirror is best-effort — site tokens already saved */ }

      // Re-seed Data Room now that GSC is connected — fills access.gsc_access
      try {
        const pid = (await db().from("dev_sites").select("project_id").eq("id", parsed.siteId).maybeSingle())?.data;
        if ((pid as any)?.project_id) {
          const { seedV2DataRoom } = await import("./pm-dataroom-seed.js");
          await seedV2DataRoom({ projectId: (pid as any).project_id });
        }
      } catch { /* non-blocking */ }
      const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>GSC connected</title>
<style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}.card{max-width:480px;padding:32px;border-radius:16px;border:1px solid #2a2a2a;background:#141414;text-align:center}h1{font-size:20px;margin:0 0 12px}p{font-size:14px;color:#a3a3a3;margin:0 0 16px;line-height:1.5}a{color:#818cf8;text-decoration:none;font-weight:600}</style>
</head><body><div class="card">
  <h1>✓ Google Search Console connected</h1>
  <p>GSC is now linked to this site workspace. Return to Site Manager and select a GSC property to complete setup.</p>
  <p><a href="/site-manager">Open Site Manager →</a></p>
</div>
<script>setTimeout(()=>{try{window.opener&&window.opener.postMessage({type:'gsc_connected',siteId:'${parsed.siteId}'},'*');window.close();}catch(e){}},800);</script>
</body></html>`;
      return { success: true, siteId: parsed.siteId, html };
    }

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
      const isInvalidGrant = res.status === 400 && /invalid_grant/i.test(errText);
      if (isInvalidGrant) {
        try {
          await db().from("project_integrations").update({
            access_token: null,
            access_token_exp: null,
            last_error: "Refresh token revoked or expired. Reconnect Google Search Console to restore the link.",
            connection_state: "needs_reconnect",
          }).eq("project_id", projectId).eq("provider", "gsc");
        } catch { /* graceful — column may not exist on older schema */ }
        return { error: "Google Search Console connection has expired. Disconnect and reconnect the integration to restore access. (Refresh tokens expire after 6 months of inactivity, on password change, or if access was revoked from the Google account.)" };
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

/** Phase 1I — full-coverage GSC pull.
 *
 *  Each pull runs SIX search-analytics queries against the chosen
 *  property and writes the results into:
 *    1. `metrics_snapshots`  — point-in-time totals (legacy, kept for
 *                              dashboards still wired to it)
 *    2. `metrics`            — one row per day in the window with
 *                              daily clicks/impressions/position/ctr
 *                              so the resolver returns proper time
 *                              series for the scope picker
 *    3. `project_knowledge.analytics` — totals + JSON-encoded top-N
 *                                       lists (queries, pages,
 *                                       countries, devices) so the
 *                                       Data Room shows real insights
 *
 *  Designed to be safe to call daily. Falls back gracefully if any
 *  individual sub-query fails — the totals path is guaranteed to
 *  complete so dashboards never go dark. */
export async function gscPull(opts: {
  projectId: string;
  days?: number;          // default 7
  source?: "manual" | "cron" | "report_generation";
}): Promise<{
  success: boolean; error?: string;
  totals?: { clicks: number; impressions: number; position: number; ctr: number };
  fetched?: {
    totals?:         boolean;
    daily_trend?:    boolean;
    top_queries?:    number;
    top_pages?:      number;
    top_countries?:  number;
    top_devices?:    number;
  };
}> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  const days = Math.min(Math.max(opts.days || 28, 1), 90);
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
    /* For multi-period intelligence we ALSO pull a 365d daily trend
       in parallel — one query, all windows derived by aggregation. */
    const trendStart = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    /* Previous-30d queries for rising/falling star detection */
    const prevQStart = new Date(Date.now() - 60  * 86_400_000).toISOString().slice(0, 10);
    const prevQEnd   = new Date(Date.now() - 30  * 86_400_000).toISOString().slice(0, 10);

    const propPath  = encodeURIComponent(i.resource_id);
    const url       = `${SEARCHANAL_API}/${propPath}/searchAnalytics/query`;

    const fetched: any = {};

    /* ── Helper: run one searchAnalytics query, return parsed rows ── */
    const runQuery = async (queryBody: any, customDates?: { startDate: string; endDate: string }): Promise<any[] | null> => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            startDate: customDates?.startDate || startDate,
            endDate:   customDates?.endDate   || endDate,
            ...queryBody,
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error(`[pm-gsc] sub-query failed: ${res.status} ${t.slice(0, 200)}`);
          return null;
        }
        const j = await res.json() as any;
        return Array.isArray(j?.rows) ? j.rows : [];
      } catch (e: any) {
        console.error(`[pm-gsc] sub-query exception: ${e?.message || e}`);
        return null;
      }
    };

    /* ── 1. Totals (the historical query — must succeed for the pull
              to be considered successful) ────────────────────────── */
    const totalsRow = await runQuery({ dimensions: [], rowLimit: 1 });
    if (totalsRow === null) {
      const errMsg = `GSC totals query failed`;
      await db().from("project_integrations").update({
        last_pull_at: new Date().toISOString(),
        last_pull_status: "error", last_pull_error: errMsg,
      }).eq("project_id", opts.projectId).eq("provider", "gsc");
      return { success: false, error: errMsg };
    }
    const tRow = totalsRow[0] || {};
    const totals = {
      clicks:      Number(tRow.clicks || 0),
      impressions: Number(tRow.impressions || 0),
      position:    Number(tRow.position || 0),
      ctr:         Number(tRow.ctr || 0),
    };
    fetched.totals = true;

    /* ── 2-8. Top N by dimensions + 365d daily trend + prev-30d
              queries + query×page pairs (parallel) ─────────────── */
    const [topQueries, topPages, topCountries, topDevices, dailyTrend, fullTrend365, prevPeriodQueries, queryPagePairs] = await Promise.all([
      runQuery({ dimensions: ["query"],   rowLimit: 50 }),
      runQuery({ dimensions: ["page"],    rowLimit: 50 }),
      runQuery({ dimensions: ["country"], rowLimit: 20 }),
      runQuery({ dimensions: ["device"],  rowLimit: 5  }),
      runQuery({ dimensions: ["date"],    rowLimit: 1000 }),
      /* 365d daily trend — used by intel engine to derive every time window */
      runQuery(
        { dimensions: ["date"], rowLimit: 1000 },
        { startDate: trendStart, endDate },
      ),
      /* Previous 30d query set — used for rising/falling star detection */
      runQuery(
        { dimensions: ["query"], rowLimit: 100 },
        { startDate: prevQStart, endDate: prevQEnd },
      ),
      /* Query×Page pairs — needed by detectCannibalization AND the
         per-URL query distribution check in the technical audit.
         Raised from 200 to 1000: at 200, low-traffic pages (brand-new pages
         getting only a handful of impressions) fall off the list entirely
         when a site has many higher-traffic pages. 1000 rows covers all but
         the largest sites without meaningful payload cost (~80-120KB JSON). */
      runQuery({ dimensions: ["query", "page"], rowLimit: 1000 }),
    ]);

    /* ── Shape helpers ───────────────────────────────────────────── */
    const shapeDim = (rows: any[] | null, keyField: string): any[] => {
      if (!rows) return [];
      return rows.map((r) => ({
        [keyField]:  r.keys?.[0] || "(unknown)",
        clicks:      Number(r.clicks || 0),
        impressions: Number(r.impressions || 0),
        ctr:         Number(((r.ctr || 0) * 100).toFixed(2)),
        position:    Number((r.position || 0).toFixed(2)),
      }));
    };
    const topQueriesShaped   = shapeDim(topQueries,   "query");
    const topPagesShaped     = shapeDim(topPages,     "page");
    const topCountriesShaped = shapeDim(topCountries, "country");
    const topDevicesShaped   = shapeDim(topDevices,   "device");
    fetched.top_queries   = topQueriesShaped.length;
    fetched.top_pages     = topPagesShaped.length;
    fetched.top_countries = topCountriesShaped.length;
    fetched.top_devices   = topDevicesShaped.length;
    fetched.daily_trend   = Array.isArray(dailyTrend) && dailyTrend.length > 0;

    /* write a metrics_snapshot row so the chart engine + reports pick this up */
    await db().from("metrics_snapshots").insert({
      project_id:        opts.projectId,
      gsc_clicks:        totals.clicks,
      gsc_impressions:   totals.impressions,
      gsc_avg_position:  totals.position,
      source:            source,
      extras: {
        gsc_window_days: days,
        gsc_ctr:         totals.ctr,
        gsc_property:    i.resource_id,
        top_queries:     topQueriesShaped.slice(0, 10),
        top_pages:       topPagesShaped.slice(0, 10),
      },
    });

    /* ── Piece 2: write daily trend to `metrics` table ───────────────
       This is what the Phase 1H scope picker reads. One row per day
       in the window, upserted by (project_id, recorded_at, source). */
    if (dailyTrend && dailyTrend.length > 0) {
      const dayRows = dailyTrend.map((r: any) => {
        const date = r.keys?.[0];
        if (!date) return null;
        return {
          project_id:       opts.projectId,
          recorded_at:      new Date(`${date}T12:00:00.000Z`).toISOString(),
          gsc_clicks:       Number(r.clicks || 0),
          gsc_impressions:  Number(r.impressions || 0),
          gsc_avg_position: Number(r.position || 0),
          gsc_ctr:          Number(((r.ctr || 0) * 100).toFixed(4)),
          source:           "gsc_daily",
        };
      }).filter(Boolean);

      /* Upsert: same (project_id, recorded_at, source) row gets
         overwritten on subsequent pulls. We do a delete-then-insert
         for the window to avoid duplicate rows piling up. */
      try {
        await db().from("metrics")
          .delete()
          .eq("project_id", opts.projectId)
          .eq("source",     "gsc_daily")
          .gte("recorded_at", new Date(`${startDate}T00:00:00.000Z`).toISOString())
          .lte("recorded_at", new Date(`${endDate}T23:59:59.999Z`).toISOString());
        await db().from("metrics").insert(dayRows as any);
      } catch (e: any) {
        console.error("[pm-gsc] daily trend write failed:", e?.message || e);
      }
    }

    /* ── Piece 3: mirror everything into the Data Room ────────────
       Scalar totals + JSON-encoded top-N lists + raw daily trend for
       intel computation. Source='gsc_auto' so the NEVER_OVERWRITE
       guard in ingest/H5 protects these against AI extraction stomp. */
    try {
      const today = new Date().toISOString().slice(0, 10);

      /* Scalar fields */
      const scalarRows = [
        { key: "gsc_total_clicks",      value: String(totals.clicks) },
        { key: "gsc_total_impressions", value: String(totals.impressions) },
        { key: "gsc_avg_position",      value: totals.position.toFixed(2) },
        { key: "gsc_ctr",               value: (totals.ctr * 100).toFixed(2) + "%" },
      ];

      /* JSON-encoded top-N fields — stored as JSON strings so downstream
         consumers (data-table directives, chart renderers, intel engine)
         can parse them. */
      const jsonRows: { key: string; value: string }[] = [];
      if (topQueriesShaped.length   > 0) jsonRows.push({ key: "gsc_top_queries",   value: JSON.stringify(topQueriesShaped) });
      if (topPagesShaped.length     > 0) jsonRows.push({ key: "gsc_top_pages",     value: JSON.stringify(topPagesShaped) });
      if (topCountriesShaped.length > 0) jsonRows.push({ key: "gsc_top_countries", value: JSON.stringify(topCountriesShaped) });
      if (topDevicesShaped.length   > 0) jsonRows.push({ key: "gsc_top_devices",   value: JSON.stringify(topDevicesShaped) });

      /* Phase 1J — Raw data used by intel engine. Stored as JSON so the
         intel recompute can read them without re-querying GSC. */
      if (Array.isArray(fullTrend365) && fullTrend365.length > 0) {
        const trendShaped = fullTrend365
          .map((r: any) => ({
            date:        r.keys?.[0],
            clicks:      Number(r.clicks || 0),
            impressions: Number(r.impressions || 0),
            position:    Number((r.position || 0).toFixed(2)),
            ctr:         Number(((r.ctr || 0) * 100).toFixed(4)),
          }))
          .filter((r) => r.date);
        jsonRows.push({ key: "gsc_daily_trend_365d", value: JSON.stringify(trendShaped) });
      }
      if (Array.isArray(prevPeriodQueries) && prevPeriodQueries.length > 0) {
        const prevShaped = prevPeriodQueries.map((r: any) => ({
          query:       r.keys?.[0] || "(unknown)",
          clicks:      Number(r.clicks || 0),
          impressions: Number(r.impressions || 0),
          ctr:         Number(((r.ctr || 0) * 100).toFixed(2)),
          position:    Number((r.position || 0).toFixed(2)),
        }));
        jsonRows.push({ key: "gsc_queries_previous_30d", value: JSON.stringify(prevShaped) });
      }

      /* Query×Page pairs — multi-dimension shape: keys[0]=query, keys[1]=page.
         Persisted as the input data for detectCannibalization in the intel
         engine (finds queries where 2+ pages compete for the same term). */
      if (Array.isArray(queryPagePairs) && queryPagePairs.length > 0) {
        const pairsShaped = queryPagePairs
          .map((r: any) => ({
            query:       r.keys?.[0] || "(unknown)",
            page:        r.keys?.[1] || "(unknown)",
            clicks:      Number(r.clicks || 0),
            impressions: Number(r.impressions || 0),
            ctr:         Number(((r.ctr || 0) * 100).toFixed(2)),
            position:    Number((r.position || 0).toFixed(2)),
          }))
          .filter((r) => r.query !== "(unknown)" && r.page !== "(unknown)");
        if (pairsShaped.length > 0) {
          jsonRows.push({ key: "gsc_query_page_pairs", value: JSON.stringify(pairsShaped) });
          fetched.query_page_pairs = pairsShaped.length;
        }
      }

      const allRows = [...scalarRows, ...jsonRows];
      for (const r of allRows) {
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
      console.error("[pm-gsc] data-room mirror failed:", e?.message || e);
    }

    /* update last pull status */
    await db().from("project_integrations").update({
      last_pull_at: new Date().toISOString(),
      last_pull_status: "ok", last_pull_error: null,
    }).eq("project_id", opts.projectId).eq("provider", "gsc");

    /* Phase 1J — recompute the analytics intelligence layer (KPIs,
       rising/falling stars, period summaries). Best-effort: if GA4
       hasn't pulled yet, intel runs with GSC-only data. */
    try {
      const { recomputeAnalyticsIntel } = await import("./pm-analytics-intel-orchestrator.js");
      await recomputeAnalyticsIntel(opts.projectId);
    } catch (e: any) {
      console.error("[pm-gsc] intel recompute failed:", e?.message || e);
    }

    return { success: true, totals, fetched };
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
  connectionState?: string;
  lastError?: string;
}> {
  if (!projectId) return { success: false, connected: false };
  try {
    let row: any = null;
    try {
      const { data } = await db().from("project_integrations").select(
        "resource_id,resource_label,last_pull_at,last_pull_status,last_pull_error,connected_at,connection_state,last_error"
      ).eq("project_id", projectId).eq("provider", "gsc").maybeSingle();
      row = data;
    } catch {
      const { data } = await db().from("project_integrations").select(
        "resource_id,resource_label,last_pull_at,last_pull_status,last_pull_error,connected_at"
      ).eq("project_id", projectId).eq("provider", "gsc").maybeSingle();
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

/** Get GSC status for a site workspace */
export async function gscStatusForSite(siteId: string): Promise<{
  success: boolean; connected?: boolean; resourceId?: string; error?: string;
}> {
  try {
    const { data } = await db().from("dev_sites")
      .select("gsc_resource_id,gsc_connected_at,gsc_access_token")
      .eq("id", siteId).maybeSingle();
    if (!data) return { success: true, connected: false };
    return {
      success:    true,
      connected:  !!(data as any).gsc_connected_at,
      resourceId: (data as any).gsc_resource_id || null,
    };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

/** Get valid access token for a site workspace */
export async function getAccessTokenForSite(siteId: string): Promise<{
  token?: string; error?: string;
}> {
  try {
    const { data: site } = await db().from("dev_sites")
      .select("gsc_access_token,gsc_refresh_token,gsc_token_expiry")
      .eq("id", siteId).maybeSingle();
    if (!site || !(site as any).gsc_refresh_token) return { error: "GSC not connected" };

    const expiry   = (site as any).gsc_token_expiry ? new Date((site as any).gsc_token_expiry) : null;
    const isExpired = !expiry || expiry <= new Date(Date.now() + 60_000);

    if (!isExpired && (site as any).gsc_access_token) {
      return { token: (site as any).gsc_access_token };
    }

    // Refresh token
    const { id: clientId, secret } = clientCreds();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: (site as any).gsc_refresh_token,
        client_id:     clientId,
        client_secret: secret,
      }).toString(),
    });
    if (!res.ok) return { error: "Token refresh failed" };
    const tk = await res.json() as any;
    const newToken = tk.access_token as string;
    const expIn    = Number(tk.expires_in || 3600);
    const newExpiry = new Date(Date.now() + expIn * 1000).toISOString();

    await db().from("dev_sites").update({
      gsc_access_token: newToken,
      gsc_token_expiry: newExpiry,
    }).eq("id", siteId);

    return { token: newToken };
  } catch (e: any) {
    return { error: e?.message || "token failed" };
  }
}

/** List GSC properties for a site workspace */
export async function gscListPropertiesForSite(siteId: string): Promise<{
  success: boolean; sites?: { url: string; perm: string }[]; error?: string;
}> {
  const { token, error } = await getAccessTokenForSite(siteId);
  if (!token) return { success: false, error: error || "Not connected" };
  try {
    const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { success: false, error: `GSC API ${res.status}` };
    const data = await res.json() as any;
    const sites = (data.siteEntry || []).map((s: any) => ({
      url:  s.siteUrl,
      perm: s.permissionLevel,
    }));
    return { success: true, sites };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

export async function handlePmGsc(action: string, body: any, req?: any, res?: any): Promise<any | null> {
  switch (action) {
    case "gsc_oauth_start":         return gscOauthStart(body.projectId);
    case "site_gsc_oauth_start":    return gscOauthStartForSite(body.siteId);
    case "site_gsc_status":         return gscStatusForSite(body.siteId);
    case "site_gsc_list_properties": return gscListPropertiesForSite(body.siteId);
    case "site_gsc_select_property": {
      const { siteId, siteUrl } = body;
      if (!siteId || !siteUrl) return { success: false, error: "siteId and siteUrl required" };
      const { error } = await db().from("dev_sites").update({ gsc_resource_id: siteUrl, updated_at: new Date().toISOString() }).eq("id", siteId);
      if (error) return { success: false, error: error.message };
      // Also update project_integrations.resource_id so checkIndexability and GSC pulls work
      try {
        const { data: site } = await db().from("dev_sites").select("project_id").eq("id", siteId).maybeSingle();
        if ((site as any)?.project_id) {
          await db().from("project_integrations")
            .update({ resource_id: siteUrl, updated_at: new Date().toISOString() })
            .eq("project_id", (site as any).project_id).eq("provider", "gsc");
          // Re-seed: gsc_access now confirmed with property
          const { seedV2DataRoom } = await import("./pm-dataroom-seed.js");
          await seedV2DataRoom({ projectId: (site as any).project_id });
        }
      } catch { /* non-blocking */ }
      return { success: true };
    }
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
