/* Live verification for the order desk: checks the work at the source instead of trusting a screenshot.
   Search Console (read with the portal's Google sign-in, only when the client added our access email to the property):
   sitemaps (submitted, read by Google, errors, URLs) and URL Inspection on sample pages (indexed or not, last crawl,
   canonical, robots). The live site (no login needed): HTTP to HTTPS redirect, robots.txt, sitemap, sample pages.
   It separates "done by us" from "reflected by Google", because Google can take days or weeks to show the change. */
import { api } from "./google.mjs";

const host = u => { try{ return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, ""); }catch(e){ return ""; } };
async function get(u, ms){ try{ const r = await fetch(u, { redirect:"follow", signal:AbortSignal.timeout(ms || 12000), headers:{ "user-agent":"Mozilla/5.0 (compatible; BusinessSantaVerify/1.0)" } });
  return { status:r.status, final:r.url, text:(await r.text()).slice(0, 500000) }; }catch(e){ return { error:String(e.message || e).slice(0, 100) }; } }

export async function findProperty(website){
  const h = host(website); if(!h) return null;
  const j = await api("https://www.googleapis.com/webmasters/v3/sites");
  const all = (j.siteEntry || []).filter(s => s.permissionLevel !== "siteUnverifiedUser").map(s => s.siteUrl);
  return all.find(s => s === "sc-domain:" + h) || all.find(s => host(s) === h && /^https:/.test(s)) || all.find(s => host(s) === h) || null;
}

export async function verifyOrder(website){
  const out = { at:new Date().toISOString(), site:website, gsc:null, live:[], pages:[], notes:[] };
  const h = host(website); if(!h){ out.notes.push("No client website on this order"); return out; }
  const base = "https://www." + h, base2 = "https://" + h;
  // Live site checks, no login needed
  const http = await get("http://" + h + "/");
  out.live.push({ check:"HTTP goes to HTTPS", ok:!!(http.final && /^https:/.test(http.final)), detail:http.error || ("Ends at " + http.final + " (" + http.status + ")") });
  const home = await get(base2 + "/"); const root = home.final ? new URL(home.final).origin : base;
  out.live.push({ check:"Home page opens", ok:home.status === 200, detail:home.error || ("Status " + home.status + (home.final ? " at " + home.final : "")) });
  if(home.text) out.live.push({ check:"Home page can be indexed", ok:!/<meta[^>]+robots[^>]+noindex/i.test(home.text), detail:/<meta[^>]+robots[^>]+noindex/i.test(home.text) ? "noindex found" : "No noindex tag" });
  const rb = await get(root + "/robots.txt"); const smLines = (rb.text || "").split("\n").filter(l => /^sitemap:/i.test(l.trim())).map(l => l.split(/:(.+)/)[1].trim());
  out.live.push({ check:"robots.txt points to a sitemap", ok:smLines.length > 0, detail:rb.error || (smLines.length ? smLines.join(", ") : "No Sitemap line (status " + rb.status + ")") });
  if(/Disallow:\s*\/\s*$/im.test(rb.text || "")) out.live.push({ check:"robots.txt does not block the whole site", ok:false, detail:"Disallow: / found" });
  const smUrl = smLines[0] || root + "/sitemap_index.xml"; const sm = await get(smUrl);
  let urls = []; if(sm.text){ urls = [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]); }
  out.live.push({ check:"Sitemap opens and lists URLs", ok:sm.status === 200 && urls.length > 0, detail:sm.error || (smUrl + " · status " + sm.status + " · " + urls.length + " entries" + (urls.some(u => /^http:/.test(u)) ? " · some http:// URLs" : "")) });
  // Sample pages: follow a child sitemap if this is an index
  let pageUrls = urls.filter(u => !/\.xml(\?|$)/i.test(u));
  if(!pageUrls.length && urls.length){ const child = await get(urls.find(u => /post|page/i.test(u)) || urls[0]); pageUrls = [...(child.text || "").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]).filter(u => !/\.xml/i.test(u)); }
  const sample = [home.final || root + "/"].concat(pageUrls.slice(0, 4));
  // Search Console, only if our Google account can see the property
  let prop = null; try{ prop = await findProperty(website); }catch(e){ out.notes.push("Search Console not readable: " + e.message); }
  if(!prop){ out.gsc = { ok:false, detail:"The client's Search Console is not shared with our access email, so Google's side cannot be checked. Ask the client to add it as Full user." }; }
  else{
    out.gsc = { ok:true, property:prop, sitemaps:[] };
    try{ const s = await api("https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(prop) + "/sitemaps");
      out.gsc.sitemaps = (s.sitemap || []).map(x => ({ path:x.path, submitted:x.lastSubmitted, read:x.lastDownloaded, pending:!!x.isPending, errors:Number(x.errors || 0), warnings:Number(x.warnings || 0),
        urls:(x.contents || []).reduce((a, c) => a + Number(c.submitted || 0), 0) })); }catch(e){ out.gsc.sitemapError = e.message; }
    for(const u of sample){
      try{ const r = await api("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { inspectionUrl:u, siteUrl:prop, languageCode:"en-US" });
        const i = (r.inspectionResult || {}).indexStatusResult || {};
        out.pages.push({ url:u, verdict:i.verdict, state:i.coverageState, crawled:i.lastCrawlTime, robots:i.robotsTxtState, fetch:i.pageFetchState, canonical:i.googleCanonical, userCanonical:i.userCanonical, indexing:i.indexingState });
      }catch(e){ out.pages.push({ url:u, error:e.message }); }
    }
  }
  return out;
}

/* Plain words for the team and the AI: what is proven done, and what is waiting on Google */
export function verifyText(v){
  if(!v) return "";
  const l = v.live.map(x => (x.ok ? "OK " : "PROBLEM ") + x.check + ": " + x.detail);
  const g = !v.gsc ? [] : !v.gsc.ok ? [v.gsc.detail] : ["Search Console property " + v.gsc.property].concat((v.gsc.sitemaps || []).map(s => `Sitemap ${s.path}: submitted ${s.submitted || "never"}, read by Google ${s.read || "not yet"}${s.pending ? " (pending)" : ""}, ${s.errors} errors, ${s.warnings} warnings, ${s.urls} URLs`))
    .concat(v.pages.map(p => p.error ? `Inspect ${p.url}: ${p.error}` : `Inspect ${p.url}: ${p.state || p.verdict}, last crawl ${p.crawled || "never"}, robots ${p.robots || "?"}, Google canonical ${p.canonical || "none"}`));
  return `Live verification at ${v.at}:\n` + l.concat(g).join("\n");
}
