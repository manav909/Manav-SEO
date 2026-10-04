/* ════════════════════════════════════════════════════════════════
   api/lib/site-foundations.ts
   Site health & the "new website" checklist.

   Honest foundations every site needs, each one either checked by the
   server against the live website or ticked by the team:
     automatic — secure address, homepage loads, page title, description,
                 one main heading, mobile-friendly setup, not hidden from
                 Google, robots.txt, sitemap, mobile speed (PageSpeed),
                 Search Console connected, pages appearing in Google
     team      — Google Business Profile, reviews, same name/address/phone
                 everywhere (no API gives us these reliably, so a person
                 confirms them)
   Runs on demand and weekly in the nightly job.
   Table: supabase-migrations/site_checks.sql
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { withClientSession } from "./brand-studio-client.js";
import { getPanelPlan } from "./panel-plans.js";

const MIGRATION_HINT = "Site checks aren't set up yet. Run supabase-migrations/site_checks.sql in the Supabase SQL editor.";
type Status = "good" | "todo" | "in_progress" | "unknown";
interface Check { key: string; label: string; status: Status; detail: string; source: "auto" | "team"; why: string }

export const TEAM_CHECKS: Omit<Check, "status" | "detail" | "source">[] = [
  { key: "gbp", label: "Google Business Profile", why: "The map listing local customers look at first." },
  { key: "reviews", label: "Google reviews", why: "The biggest local trust signal — for Google and for people." },
  { key: "nap", label: "Same name, address and phone everywhere", why: "Google trusts businesses whose details match across the web." },
];

const AUTO_WHY: Record<string, string> = {
  https: "A secure address (https) is expected by Google and by visitors.",
  loads: "If the homepage doesn't load, nothing else matters.",
  title: "The page title is the blue headline people click in Google.",
  description: "The description is the text under the headline — it wins the click.",
  h1: "One clear main heading tells Google what the page is about.",
  viewport: "Makes the site display properly on phones.",
  indexable: "The site must not be hidden from Google.",
  robots: "robots.txt tells search engines what they may read.",
  sitemap: "A sitemap lists your pages so Google finds them faster.",
  speed: "Most visitors are on phones; slow pages lose them.",
  gsc: "Search Console is how we see what Google sees.",
  pages_in_google: "Pages that showed up in Google searches in the last 30 days.",
};

function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    /* Never let a project URL point the server at internal addresses. */
    if (h === "localhost" || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith(".internal") || h === "[::1]") return null;
    return u;
  } catch { return null; }
}

async function fetchText(url: string, ms = 12_000): Promise<{ status: number; text: string; headers: Headers; finalUrl: string } | null> {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(ms), headers: { "User-Agent": "SEOSeasonBot/1.0 (+https://seoseason.com)" } });
    const text = (await r.text()).slice(0, 600_000);
    return { status: r.status, text, headers: r.headers, finalUrl: r.url || url };
  } catch { return null; }
}

const tag = (html: string, re: RegExp) => (html.match(re)?.[1] || "").replace(/\s+/g, " ").trim();

export async function runAutoChecks(projectId: string): Promise<Check[]> {
  const { data: project } = await db().from("projects").select("url").eq("id", projectId).maybeSingle();
  const u = safeUrl(String((project as any)?.url || ""));
  const out: Check[] = [];
  const add = (key: string, label: string, status: Status, detail: string) => out.push({ key, label, status, detail, source: "auto", why: AUTO_WHY[key] || "" });
  if (!u) { add("loads", "Homepage loads", "unknown", "No valid website address on file yet."); return out; }

  const home = await fetchText(u.toString());
  const finalHttps = home ? home.finalUrl.startsWith("https://") : u.protocol === "https:";
  add("https", "Secure address (https)", finalHttps ? "good" : "todo", finalHttps ? "Your site uses https." : "Your site isn't on https yet.");
  if (!home || home.status >= 400) {
    add("loads", "Homepage loads", "todo", home ? `The homepage answered with error ${home.status}.` : "The homepage didn't respond in time.");
  } else {
    add("loads", "Homepage loads", "good", "Your homepage loads.");
    const html = home.text;
    const title = tag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    add("title", "Page title", !title ? "todo" : title.length > 65 ? "in_progress" : "good",
      !title ? "Your homepage has no title." : title.length > 65 ? `Title is ${title.length} characters — Google cuts it off after about 60.` : `“${title}”`);
    const desc = tag(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || tag(html, /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
    add("description", "Search description", !desc ? "todo" : desc.length < 50 || desc.length > 170 ? "in_progress" : "good",
      !desc ? "No description — Google will pick random text." : desc.length < 50 ? "Description is very short." : desc.length > 170 ? "Description is long — Google will cut it." : "Good length.");
    const h1s = (html.match(/<h1[\s>]/gi) || []).length;
    add("h1", "One main heading", h1s === 1 ? "good" : h1s === 0 ? "todo" : "in_progress", h1s === 1 ? "Found one main heading." : h1s === 0 ? "No main heading (H1) on the homepage." : `${h1s} main headings — one is clearer.`);
    const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    add("viewport", "Phone-friendly setup", viewport ? "good" : "todo", viewport ? "Set up for phones." : "Missing the phone (viewport) setting.");
    const robotsMeta = tag(html, /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i).toLowerCase();
    const xRobots = String(home.headers.get("x-robots-tag") || "").toLowerCase();
    const hidden = robotsMeta.includes("noindex") || xRobots.includes("noindex");
    add("indexable", "Visible to Google", hidden ? "todo" : "good", hidden ? "The homepage tells Google not to list it (noindex)." : "Google is allowed to list your homepage.");
  }

  const origin = `${u.protocol}//${u.host}`;
  const robots = await fetchText(`${origin}/robots.txt`, 8_000);
  let sitemapFromRobots = "";
  if (robots && robots.status < 400) {
    const blocksAll = /user-agent:\s*\*[\s\S]*?\ndisallow:\s*\/\s*(\n|$)/i.test(robots.text);
    sitemapFromRobots = (robots.text.match(/^\s*sitemap:\s*(\S+)/im)?.[1] || "").trim();
    add("robots", "robots.txt", blocksAll ? "todo" : "good", blocksAll ? "robots.txt blocks all search engines." : "Found and not blocking Google.");
  } else add("robots", "robots.txt", "in_progress", "No robots.txt — not urgent, but good to have.");
  const smUrl = safeUrl(sitemapFromRobots || "") ? sitemapFromRobots : `${origin}/sitemap.xml`;
  const sm = await fetchText(smUrl, 8_000);
  const smOk = !!sm && sm.status < 400 && /<(urlset|sitemapindex)/i.test(sm.text);
  add("sitemap", "Sitemap", smOk ? "good" : "todo", smOk ? `Found (${(sm!.text.match(/<loc>/gi) || []).length} entries).` : "No sitemap found.");

  /* Mobile speed — Google's own PageSpeed test. */
  const psiKey = process.env.PAGESPEED_API_KEY ? `&key=${encodeURIComponent(process.env.PAGESPEED_API_KEY)}` : "";
  try {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(u.toString())}&strategy=mobile&category=performance${psiKey}`, { signal: AbortSignal.timeout(60_000) });
    const j: any = r.ok ? await r.json() : null;
    const score = j?.lighthouseResult?.categories?.performance?.score;
    if (typeof score === "number") {
      const s = Math.round(score * 100);
      add("speed", "Mobile speed", s >= 70 ? "good" : s >= 45 ? "in_progress" : "todo", `PageSpeed score ${s} of 100 on phones.`);
    } else add("speed", "Mobile speed", "unknown", "Google's speed test didn't answer — we'll try again next week.");
  } catch { add("speed", "Mobile speed", "unknown", "Google's speed test didn't answer — we'll try again next week."); }

  /* Search Console. */
  try {
    const { gscStatus } = await import("./pm-gsc.js");
    const g = await gscStatus(projectId);
    const ready = g.connected && !!g.resourceId;
    add("gsc", "Google Search Console connected", ready ? "good" : "todo", ready ? "Connected — we see your Google data." : "Not connected yet — your team can do this with you in 5 minutes.");
    if (ready) {
      const { data: pk } = await db().from("project_knowledge").select("field_value").eq("project_id", projectId).eq("category", "analytics").eq("field_key", "gsc_top_pages").maybeSingle();
      let pages: any[] = [];
      try { pages = JSON.parse(String((pk as any)?.field_value || "[]")); } catch { pages = []; }
      const n = Array.isArray(pages) ? pages.length : 0;
      add("pages_in_google", "Pages showing in Google", n > 0 ? "good" : "in_progress", n > 0 ? `${n} page${n > 1 ? "s" : ""} appeared in Google searches in the last 30 days.` : "No pages in Google searches yet — normal for a new site (2–6 weeks).");
    }
  } catch { /* GSC module unavailable — skip */ }
  return out;
}

export async function saveChecks(projectId: string, checks: Check[]) {
  if (!checks.length) return null;
  const now = new Date().toISOString();
  const { error } = await db().from("site_checks").upsert(
    checks.map((c) => ({ project_id: projectId, check_key: c.key, label: c.label, status: c.status, detail: c.detail, source: c.source, updated_at: now })),
    { onConflict: "project_id,check_key" },
  );
  return error;
}

export async function listChecks(projectId: string) {
  const { data, error } = await db().from("site_checks").select("check_key,label,status,detail,source,updated_at").eq("project_id", projectId);
  if (error) return { error };
  const rows = (data || []) as any[];
  /* Team checks always appear, even before anyone has ticked them. */
  for (const t of TEAM_CHECKS) if (!rows.find((r) => r.check_key === t.key)) rows.push({ check_key: t.key, label: t.label, status: "todo", detail: "Your team will check this with you.", source: "team", updated_at: null });
  const why: Record<string, string> = { ...AUTO_WHY, ...Object.fromEntries(TEAM_CHECKS.map((t) => [t.key, t.why])) };
  const items = rows.map((r) => ({ key: r.check_key, label: r.label, status: r.status, detail: r.detail, source: r.source, updatedAt: r.updated_at, why: why[r.check_key] || "" }));
  const order: Record<string, number> = { todo: 0, in_progress: 1, unknown: 2, good: 3 };
  items.sort((a, b) => order[a.status] - order[b.status]);
  const scored = items.filter((i) => i.status !== "unknown");
  const score = scored.length ? Math.round((scored.filter((i) => i.status === "good").length + 0.5 * scored.filter((i) => i.status === "in_progress").length) / scored.length * 100) : null;
  const lastChecked = rows.filter((r) => r.source === "auto").map((r) => r.updated_at).sort().pop() || null;
  return { items, score, done: items.filter((i) => i.status === "good").length, total: items.length, lastChecked };
}

export async function siteChecksCronTick() {
  const { data } = await db().from("project_entitlements").select("project_id").eq("client_portal_enabled", true).limit(300);
  let ran = 0;
  for (const { project_id } of (data || []) as any[]) {
    const { data: last } = await db().from("site_checks").select("updated_at").eq("project_id", project_id).eq("source", "auto").order("updated_at", { ascending: false }).limit(1);
    const at = (last as any[])?.[0]?.updated_at;
    if (at && Date.now() - new Date(at).getTime() < 6.5 * 86400_000) continue;
    const err = await saveChecks(project_id, await runAutoChecks(project_id).catch(() => []));
    if (!err) ran++;
    if (ran >= 25) break;
  }
  return { ran };
}

/* ─── Actions ─────────────────────────────────────────────────── */

export async function handleSiteFoundations(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "cp_site_health": {
      const { user, error } = await withClientSession(body);
      if (!user) return { success: false, error: error || "Please sign in again.", code: "session" };
      const panel = await getPanelPlan(user.project_id);
      if (!panel.features.site_health) return { success: false, error: "This isn't part of your plan yet.", code: "not_in_plan" };
      const r = await listChecks(user.project_id);
      if ("error" in r && r.error) return { success: true, items: [], score: null, hint: "pending" };
      return { success: true, ...r };
    }
    case "cps_site_checks_get": {
      const pid = String(body?.projectId || "");
      if (!pid) return { success: false, error: "projectId required" };
      const r = await listChecks(pid);
      return "error" in r && r.error ? { success: false, error: MIGRATION_HINT } : { success: true, ...r };
    }
    case "cps_site_checks_run": {
      const pid = String(body?.projectId || "");
      if (!pid) return { success: false, error: "projectId required" };
      const err = await saveChecks(pid, await runAutoChecks(pid));
      if (err) return { success: false, error: MIGRATION_HINT };
      return { success: true, ...(await listChecks(pid)) };
    }
    case "cps_site_check_set": {
      const pid = String(body?.projectId || "");
      const def = TEAM_CHECKS.find((t) => t.key === body?.key);
      const status = String(body?.status || "");
      if (!pid || !def) return { success: false, error: "Unknown check" };
      if (!["good", "todo", "in_progress"].includes(status)) return { success: false, error: "Unknown status" };
      const err = await saveChecks(pid, [{ ...def, status: status as Status, detail: String(body?.detail || "").trim().slice(0, 300) || (status === "good" ? "Checked by your team." : "Your team is on it."), source: "team" }]);
      return err ? { success: false, error: MIGRATION_HINT } : { success: true };
    }
    default: return null;
  }
}
