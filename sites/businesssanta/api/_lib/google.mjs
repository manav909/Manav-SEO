/* Google accounts behind the portal: Search Console, Analytics 4 and Business Profile, read with one Google sign-in.
   The admin signs in once with the Google account that clients add as a user (seo@businesssanta.com, or the owner's own
   account for Business Santa itself). Google gives a refresh token, kept in portal storage; the portal then reads each
   business's own property on a schedule. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel (typed by Manav). */
import { cmd, getJ, setJ, P } from "./store.mjs";

export const GK = { tok:P + "google", at:P + "google:at", state:s => P + "google:state:" + s, data:id => P + "gdata:" + id,
  accs:P + "gaccs", accAt:e => P + "google:at:" + e, props:P + "gprops" };
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.activity.readonly",   // Drive: read-only, for order proof (team order desk)
  "https://www.googleapis.com/auth/drive.file"];   // Drive: only files the portal itself creates (the HoD reports folder); it cannot change anyone else's files
// Team access accounts (e.g. seo@indiit.com) also read the project's Gmail and Google Chat, read-only, to follow the team's work
export const TEAM_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/chat.spaces.readonly", "https://www.googleapis.com/auth/chat.messages.readonly"];
export const REDIRECT = "https://www.businesssanta.com/api/portal?a=g-callback";
export const configured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function authUrl(state, team){
  const q = new URLSearchParams({ client_id:process.env.GOOGLE_CLIENT_ID, redirect_uri:REDIRECT, response_type:"code", scope:(team ? SCOPES.concat(TEAM_SCOPES) : SCOPES).join(" "),
    access_type:"offline", prompt:team ? "select_account consent" : "consent", include_granted_scopes:"true", state });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + q;
}
async function tokenCall(params){
  const r = await fetch("https://oauth2.googleapis.com/token", { method:"POST", headers:{ "content-type":"application/x-www-form-urlencoded" },
    body:new URLSearchParams(Object.assign({ client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET }, params)) });
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(j.error_description || j.error || "Google sign-in failed (" + r.status + ")");
  return j;
}
export async function exchange(code, team){
  const j = await tokenCall({ code, grant_type:"authorization_code", redirect_uri:REDIRECT });
  let email = "";
  try{ email = JSON.parse(Buffer.from(String(j.id_token || "").split(".")[1] || "", "base64url").toString()).email || ""; }catch(e){}
  const primary = (await getJ(GK.tok)) || {};
  if(team && email && email !== primary.email){
    // Another Google account the team uses for client access (Search Console, Analytics, Drive). The portal's main account is untouched.
    const prevRaw = await cmd("HGET", GK.accs, email), prev = prevRaw ? JSON.parse(prevRaw) : {};
    const rec = { refresh:j.refresh_token || prev.refresh, email, scope:j.scope || "", at:new Date().toISOString() };
    if(!rec.refresh) throw new Error("Google did not send a lasting key. Remove the portal from that Google account's third-party access and connect again.");
    await cmd("HSET", GK.accs, email, JSON.stringify(rec)); await cmd("SET", GK.accAt(email), j.access_token, "EX", Math.max(60, (j.expires_in || 3600) - 300));
    return rec;
  }
  const rec = { refresh:j.refresh_token || primary.refresh, email:email || primary.email || "", scope:j.scope || "", at:new Date().toISOString() };
  if(!rec.refresh) throw new Error("Google did not send a lasting key. Remove the portal from your Google account's third-party access and connect again.");
  await setJ(GK.tok, rec); await cmd("SET", GK.at, j.access_token, "EX", Math.max(60, (j.expires_in || 3600) - 300));
  return rec;
}
export async function status(){ const t = await getJ(GK.tok); return { configured:configured(), connected:!!(t && t.refresh), email:t ? t.email : "", since:t ? t.at : "", scope:t ? t.scope : "" }; }
export const accessToken = () => access();
async function access(){
  const c = await cmd("GET", GK.at); if(c) return c;
  const t = await getJ(GK.tok); if(!t || !t.refresh) throw new Error("Google is not connected yet");
  const j = await tokenCall({ refresh_token:t.refresh, grant_type:"refresh_token" });
  await cmd("SET", GK.at, j.access_token, "EX", Math.max(60, (j.expires_in || 3600) - 300));
  return j.access_token;
}
export async function api(url, body){
  const tok = await access();
  const r = await fetch(url, body ? { method:"POST", headers:{ authorization:"Bearer " + tok, "content-type":"application/json" }, body:JSON.stringify(body) } : { headers:{ authorization:"Bearer " + tok } });
  const j = await r.json().catch(() => ({}));
  if(!r.ok){ const e = new Error((j.error && (j.error.message || j.error.status)) || ("Google answered " + r.status)); e.status = r.status; throw e; }
  return j;
}

/* What the signed-in Google account can see, for the admin's pickers. Each list fails on its own. */
export async function lists(){
  const out = { sites:[], ga:[], gbp:[], errors:{} };
  await Promise.all([
    api("https://www.googleapis.com/webmasters/v3/sites").then(j => { out.sites = (j.siteEntry || []).filter(s => s.permissionLevel !== "siteUnverifiedUser").map(s => s.siteUrl).sort(); }).catch(e => { out.errors.gsc = e.message; }),
    api("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200").then(j => { (j.accountSummaries || []).forEach(a => (a.propertySummaries || []).forEach(p => out.ga.push({ id:p.property, name:p.displayName + " (" + a.displayName + ")" }))); }).catch(e => { out.errors.ga = e.message; }),
    (async () => {
      const acc = await api("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
      for(const a of (acc.accounts || []).slice(0, 10)){
        const l = await api("https://mybusinessbusinessinformation.googleapis.com/v1/" + a.name + "/locations?readMask=name,title,storefrontAddress&pageSize=100");
        (l.locations || []).forEach(x => out.gbp.push({ id:x.name, name:x.title + (x.storefrontAddress && x.storefrontAddress.locality ? ", " + x.storefrontAddress.locality : "") }));
      }
    })().catch(e => { out.errors.gbp = e.message; })
  ]);
  return out;
}

const day = n => { const d = new Date(Date.now() - n * 864e5); return d.toISOString().slice(0, 10); };
const ymd = s => { const [y, m, d] = s.split("-").map(Number); return { year:y, month:m, day:d }; };

/* Search Console: 28 days to the latest day Google has (data lags about 2 days), a daily line, totals and the top searches. */
async function gsc(site){
  const u = "https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(site) + "/searchAnalytics/query", rng = { startDate:day(30), endDate:day(2) };
  const [d, q, p] = await Promise.all([api(u, Object.assign({ dimensions:["date"], rowLimit:40 }, rng)), api(u, Object.assign({ dimensions:["query"], rowLimit:10 }, rng)),
    api(u, Object.assign({ dimensions:["page"], rowLimit:5 }, rng))]);
  const days = (d.rows || []).map(r => ({ d:r.keys[0], c:r.clicks, i:r.impressions, p:+r.position.toFixed(1) }));
  const sum = k => days.reduce((a, x) => a + x[k], 0), imp = sum("i");
  return { range:rng, days, clicks:sum("c"), impressions:imp, ctr:imp ? +(100 * sum("c") / imp).toFixed(2) : 0,
    position:imp ? +(days.reduce((a, x) => a + x.p * x.i, 0) / imp).toFixed(1) : null,
    queries:(q.rows || []).map(r => ({ q:r.keys[0], c:r.clicks, i:r.impressions, p:+r.position.toFixed(1) })).sort((x, y) => (y.c - x.c) || (y.i - x.i) || (x.p - y.p)),
    pages:(p.rows || []).map(r => ({ u:r.keys[0], c:r.clicks, i:r.impressions })) };
}
/* Analytics 4: visitors, visits and key events per day for 28 days, and where visits came from. */
async function ga(prop){
  const u = "https://analyticsdata.googleapis.com/v1beta/" + prop + ":runReport", dr = [{ startDate:"28daysAgo", endDate:"yesterday" }];
  const [d, ch] = await Promise.all([
    api(u, { dateRanges:dr, dimensions:[{ name:"date" }], metrics:[{ name:"activeUsers" }, { name:"sessions" }, { name:"keyEvents" }], orderBys:[{ dimension:{ dimensionName:"date" } }] }),
    api(u, { dateRanges:dr, dimensions:[{ name:"sessionDefaultChannelGroup" }], metrics:[{ name:"sessions" }], orderBys:[{ metric:{ metricName:"sessions" }, desc:true }], limit:6 })]);
  const days = (d.rows || []).map(r => ({ d:r.dimensionValues[0].value.replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3"), u:+r.metricValues[0].value, s:+r.metricValues[1].value, k:+r.metricValues[2].value }));
  const sum = k => days.reduce((a, x) => a + x[k], 0);
  return { days, users:sum("u"), sessions:sum("s"), keyEvents:sum("k"), channels:(ch.rows || []).map(r => ({ n:r.dimensionValues[0].value, s:+r.metricValues[0].value })) };
}
/* Business Profile: calls, website clicks, direction requests and views over 28 days (Google needs the API approved for the project). */
async function gbp(loc){
  const M = ["CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"];
  const s = ymd(day(31)), e = ymd(day(3)), q = new URLSearchParams();
  M.forEach(m => q.append("dailyMetrics", m));
  Object.entries({ "dailyRange.start_date.year":s.year, "dailyRange.start_date.month":s.month, "dailyRange.start_date.day":s.day,
    "dailyRange.end_date.year":e.year, "dailyRange.end_date.month":e.month, "dailyRange.end_date.day":e.day }).forEach(([k, v]) => q.append(k, v));
  const j = await api("https://businessprofileperformance.googleapis.com/v1/" + loc + ":fetchMultiDailyMetricsTimeSeries?" + q);
  const tot = {};
  (j.multiDailyMetricTimeSeries || []).forEach(g => (g.dailyMetricTimeSeries || []).forEach(t => { tot[t.dailyMetric] = (t.timeSeries && t.timeSeries.datedValues || []).reduce((a, v) => a + (+v.value || 0), 0); }));
  return { calls:tot.CALL_CLICKS || 0, site:tot.WEBSITE_CLICKS || 0, directions:tot.BUSINESS_DIRECTION_REQUESTS || 0,
    views:(tot.BUSINESS_IMPRESSIONS_MOBILE_MAPS || 0) + (tot.BUSINESS_IMPRESSIONS_DESKTOP_MAPS || 0) + (tot.BUSINESS_IMPRESSIONS_MOBILE_SEARCH || 0) + (tot.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH || 0) };
}
const plain = e => e.status === 403 ? "Google says the connected account cannot see this property yet" : e.status === 404 ? "Google could not find this property" : String(e.message || e).slice(0, 200);

/* Reads every property set on a business and keeps the result; returns which accounts worked. */
export async function syncBrand(b){
  const prev = (await getJ(GK.data(b.id))) || {}, d = { at:new Date().toISOString(), errors:{} }, ok = {};
  const jobs = [];
  if(b.gscSite) jobs.push(gsc(b.gscSite).then(x => { d.gsc = x; ok.gsc = true; }).catch(e => { d.errors.gsc = plain(e); ok.gsc = false; }));
  if(b.ga4Property) jobs.push(ga(b.ga4Property).then(x => { d.ga = x; ok.ga = true; }).catch(e => { d.errors.ga = plain(e); ok.ga = false; }));
  if(b.gbpLocation) jobs.push(gbp(b.gbpLocation).then(x => { d.gbp = x; ok.gbp = true; }).catch(e => { d.errors.gbp = plain(e); ok.gbp = false; }));
  await Promise.all(jobs);
  ["gsc", "ga", "gbp"].forEach(k => { if(!d[k] && prev[k] && ok[k] === false) d[k] = Object.assign({ stale:true }, prev[k]); });   // keep the last good numbers, marked
  await setJ(GK.data(b.id), d);
  return { data:d, ok };
}

/* Every connected Google account: the portal's main one plus the team's other access accounts */
export async function accounts(){
  const p = await getJ(GK.tok), h = await cmd("HGETALL", GK.accs), out = [];
  const fl = sc => ({ drive:/drive\.readonly/.test(sc || ""), write:/drive\.file/.test(sc || ""), gmail:/gmail\.readonly/.test(sc || ""), chat:/chat\.messages/.test(sc || "") });
  if(p && p.refresh) out.push(Object.assign({ email:p.email, primary:true, since:p.at }, fl(p.scope)));
  for(let i = 0; i < h.length; i += 2){ const r = JSON.parse(h[i + 1]); if(r.refresh) out.push(Object.assign({ email:r.email, primary:false, since:r.at }, fl(r.scope))); }
  return out;
}
async function accessAs(email){
  const p = await getJ(GK.tok); if(!email || (p && p.email === email)) return access();
  const c = await cmd("GET", GK.accAt(email)); if(c) return c;
  const raw = await cmd("HGET", GK.accs, email); const t = raw ? JSON.parse(raw) : null; if(!t || !t.refresh) throw new Error(email + " is not connected");
  const j = await tokenCall({ refresh_token:t.refresh, grant_type:"refresh_token" });
  await cmd("SET", GK.accAt(email), j.access_token, "EX", Math.max(60, (j.expires_in || 3600) - 300));
  return j.access_token;
}
export const accessTokenAs = email => accessAs(email);
export async function apiAs(email, url, body){
  const tok = await accessAs(email);
  const r = await fetch(url, body ? { method:"POST", headers:{ authorization:"Bearer " + tok, "content-type":"application/json" }, body:JSON.stringify(body) } : { headers:{ authorization:"Bearer " + tok } });
  const j = await r.json().catch(() => ({}));
  if(!r.ok){ const e = new Error((j.error && (j.error.message || j.error.status)) || ("Google answered " + r.status)); e.status = r.status; throw e; }
  return j;
}
/* Which Search Console properties and Analytics properties each account can see; kept so orders can reuse them */
export async function refreshProps(){
  const items = [], errors = {};
  for(const a of await accounts()){
    await apiAs(a.email, "https://www.googleapis.com/webmasters/v3/sites").then(j => (j.siteEntry || []).filter(x => x.permissionLevel !== "siteUnverifiedUser")
      .forEach(x => items.push({ email:a.email, kind:"gsc", id:x.siteUrl, name:x.siteUrl, level:x.permissionLevel }))).catch(e => { errors[a.email + " gsc"] = e.message; });
    const gas = [];
    await apiAs(a.email, "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200").then(j => (j.accountSummaries || []).forEach(ac => (ac.propertySummaries || [])
      .forEach(x => gas.push({ email:a.email, kind:"ga", id:x.property, name:x.displayName + " (" + ac.displayName + ")" })))).catch(e => { errors[a.email + " ga"] = e.message; });
    // Which website each Analytics property measures, so orders can find it by domain
    for(const g of gas.slice(0, 80)){ try{ const st = await apiAs(a.email, "https://analyticsadmin.googleapis.com/v1beta/" + g.id + "/dataStreams?pageSize=20");
      g.sites = (st.dataStreams || []).map(x => x.webStreamData && x.webStreamData.defaultUri).filter(Boolean).map(u => { try{ return new URL(u).hostname.replace(/^www\./, ""); }catch(e){ return ""; } }).filter(Boolean); }catch(e){} items.push(g); }
  }
  const rec = { at:new Date().toISOString(), items, errors }; await setJ(GK.props, rec); return rec;
}
export async function props(){ return (await getJ(GK.props)) || refreshProps(); }
