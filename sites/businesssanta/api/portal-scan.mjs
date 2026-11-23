/* Business Santa client portal: live preview from public information.
   Reads only what anyone can see in public: the business's own website, Google's PageSpeed test,
   and (when this project has SERPAPI_KEY and the sales code matches PORTAL_DEMO_CODE) Google Maps results.
   Nothing is stored. Every number goes back with where it came from and when it was read. */

const UA = "Mozilla/5.0 (compatible; BusinessSantaCheck/1.0; +https://www.businesssanta.com)";
const SOCIAL = { facebook: /facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)[^"'\s<>?#]+/i, instagram: /instagram\.com\/(?!p\/|reel\/|explore)[^"'\s<>?#]+/i,
  youtube: /youtube\.com\/(?:@|c\/|channel\/|user\/)[^"'\s<>?#]+/i, linkedin: /linkedin\.com\/(?:company|in)\/[^"'\s<>?#]+/i, tiktok: /tiktok\.com\/@[^"'\s<>?#]+/i,
  x: /(?:twitter|x)\.com\/(?!intent|share|home)[A-Za-z0-9_]{2,}/i, yelp: /yelp\.com\/biz\/[^"'\s<>?#]+/i, pinterest: /pinterest\.com\/(?!pin\/)[^"'\s<>?#]+/i };

function normUrl(u){
  let s = String(u || "").trim(); if(!s) return null;
  if(!/^https?:\/\//i.test(s)) s = "https://" + s;
  try{ const x = new URL(s); const h = x.hostname.toLowerCase();
    if(!h.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith(".internal") || h.endsWith(".local")) return null;
    x.hash = ""; return x; }catch(e){ return null; }
}
async function get(url, ms, max){
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try{
    const r = await fetch(url, { headers:{ "user-agent":UA, accept:"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }, redirect:"follow", signal:ac.signal });
    const reader = r.body && r.body.getReader ? r.body.getReader() : null; let text = "";
    if(reader){ const dec = new TextDecoder(); let n = 0; for(;;){ const { done, value } = await reader.read(); if(done) break; n += value.length; text += dec.decode(value, { stream:true }); if(n > (max || 1500000)){ try{ ac.abort(); }catch(e){} break; } } }
    else text = await r.text();
    return { ok:r.ok, status:r.status, url:r.url || String(url), text };
  }catch(e){ return { ok:false, status:0, url:String(url), text:"", error:String(e && e.name === "AbortError" ? "took too long" : (e && e.message) || e) }; }
  finally{ clearTimeout(t); }
}
const strip = s => String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const pick = (re, s) => { const m = String(s || "").match(re); return m ? strip(m[1]) : ""; };

function readSite(html, finalUrl){
  const head = html.slice(0, 200000);
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i, head);
  const desc = pick(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i, head) || pick(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i, head);
  const h1 = pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html);
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(head);
  const tel = /href=["']tel:/i.test(html);
  const phone = (strip(html).match(/\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/) || [""])[0];
  const types = [];
  const walk = o => { if(!o || typeof o !== "object") return; if(Array.isArray(o)){ o.forEach(walk); return; } const t = o["@type"]; (Array.isArray(t) ? t : [t]).forEach(v => { if(typeof v === "string" && !types.includes(v)) types.push(v); }); Object.values(o).forEach(v => { if(v && typeof v === "object") walk(v); }); };
  (html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []).forEach(b => { const inner = b.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, ""); try{ walk(JSON.parse(inner)); }catch(e){ (inner.match(/"@type"\s*:\s*"([^"]+)"/g) || []).forEach(x => { const v = x.replace(/.*:\s*"/, "").replace(/"$/, ""); if(!types.includes(v)) types.push(v); }); } });
  const local = types.some(t => /LocalBusiness|Plumber|Dentist|Attorney|LegalService|Restaurant|Store|HVAC|Electrician|Roofing|HomeAndConstructionBusiness|MedicalBusiness|BeautySalon|HairSalon|DaySpa|AutoRepair|ProfessionalService|Organization/i.test(t));
  const socials = {}; Object.entries(SOCIAL).forEach(([k, re]) => { const m = html.match(re); if(m) socials[k] = "https://www." + m[0].replace(/^www\./i, ""); });
  const imgs = html.match(/<img\b[^>]*>/gi) || [], noAlt = imgs.filter(i => !/\balt=["'][^"']+["']/i.test(i)).length;
  const words = strip(html).split(" ").filter(Boolean).length;
  const map = /google\.com\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(html);
  return { finalUrl, https:String(finalUrl).startsWith("https://"), title, desc, h1, viewport, tel, phone, schema:types.slice(0, 12), localSchema:local, socials, images:imgs.length, imagesNoAlt:noAlt, words, mapLink:map };
}
async function readSitemap(origin){
  let urls = [], found = "";
  const r = await get(origin + "/robots.txt", 6000, 200000);
  if(r.ok) (r.text.match(/^\s*sitemap:\s*(\S+)/gim) || []).forEach(l => urls.push(l.replace(/^\s*sitemap:\s*/i, "").trim()));
  if(!urls.length) urls = [origin + "/sitemap.xml", origin + "/sitemap_index.xml", origin + "/wp-sitemap.xml"];
  for(const u of urls.slice(0, 3)){
    const s = await get(u, 8000, 3000000); if(!s.ok || !/<(urlset|sitemapindex)/i.test(s.text)) continue;
    found = u;
    if(/<sitemapindex/i.test(s.text)){
      const kids = (s.text.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi) || []).map(x => x.replace(/<\/?loc>/gi, "").trim()).slice(0, 6); let n = 0;
      const parts = await Promise.all(kids.map(k => get(k, 8000, 3000000)));
      parts.forEach(p => { if(p.ok) n += (p.text.match(/<loc>/gi) || []).length; });
      return { count:n, source:found, partial:(s.text.match(/<loc>/gi) || []).length > 6 };
    }
    return { count:(s.text.match(/<loc>/gi) || []).length, source:found, partial:false };
  }
  return { count:0, source:"", partial:false };
}
async function pageSpeed(url){
  const k = process.env.PAGESPEED_API_KEY ? "&key=" + encodeURIComponent(process.env.PAGESPEED_API_KEY) : "";
  const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&url=" + encodeURIComponent(url) + k;
  const r = await get(api, 60000, 8000000);
  if(!r.ok) return { status:"unavailable", why:r.status === 429 ? "Google's test is busy, try again in a minute" : (r.error || "Google's test did not answer"), proof:"https://pagespeed.web.dev/analysis?url=" + encodeURIComponent(url) };
  try{ const j = JSON.parse(r.text), L = j.lighthouseResult || {}, A = L.audits || {};
    return { status:"ok", score:Math.round(((L.categories && L.categories.performance && L.categories.performance.score) || 0) * 100),
      lcp:(A["largest-contentful-paint"] || {}).displayValue || "", cls:(A["cumulative-layout-shift"] || {}).displayValue || "", tbt:(A["total-blocking-time"] || {}).displayValue || "",
      proof:"https://pagespeed.web.dev/analysis?url=" + encodeURIComponent(url) + "&form_factor=mobile" };
  }catch(e){ return { status:"unavailable", why:"Google's answer could not be read" }; }
}
async function serp(params){
  const key = process.env.SERPAPI_KEY; if(!key) return null;
  const q = new URLSearchParams(Object.assign({ api_key:key, hl:"en", gl:"us" }, params));
  const r = await get("https://serpapi.com/search.json?" + q.toString(), 25000, 4000000);
  if(!r.ok) return { error:r.error || ("status " + r.status) };
  try{ return JSON.parse(r.text); }catch(e){ return { error:"unreadable answer" }; }
}
const host = u => { try{ return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); }catch(e){ return ""; } };
const simple = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function google(name, city, service, siteHost){
  const out = { status:"ok", place:null, rank:null };
  const a = await serp({ engine:"google_maps", type:"search", q:(name + " " + city).trim() });
  if(a && a.error) return { status:"unavailable", why:a.error };
  const cand = a ? (a.place_results ? [a.place_results] : (a.local_results || [])) : [];
  const me = cand.find(p => siteHost && host(p.website) === siteHost) || cand.find(p => simple(p.title).includes(simple(name).split(" ")[0] || "~")) || cand[0];
  if(me) out.place = { name:me.title, rating:me.rating || null, reviews:me.reviews || 0, type:me.type || (me.types || [])[0] || "", address:me.address || "", phone:me.phone || "", website:me.website || "", hours:me.open_state || "", id:me.place_id || me.data_id || "",
    proof:"https://www.google.com/maps/search/" + encodeURIComponent((me.title || name) + " " + city) };
  if(service && city){
    const query = service + " in " + city, b = await serp({ engine:"google_maps", type:"search", q:query });
    const list = (b && b.local_results) || [];
    const idx = list.findIndex(p => (out.place && out.place.id && (p.place_id === out.place.id || p.data_id === out.place.id)) || (siteHost && host(p.website) === siteHost) || (out.place && simple(p.title) === simple(out.place.name)));
    out.rank = { query, position:idx >= 0 ? idx + 1 : null, checked:list.length, competitors:list.filter((p, i) => i !== idx).slice(0, 3).map(p => ({ name:p.title, rating:p.rating || null, reviews:p.reviews || 0 })),
      proof:"https://www.google.com/maps/search/" + encodeURIComponent(query) };
  }
  return out;
}
function findings(d){
  const F = [], add = (module, level, text, proof, kind) => F.push({ module, level, text, proof:proof || "", kind:kind || "" });
  const s = d.site, c = d.input.city, sv = d.input.service;
  if(!s){ add("site", "gap", "Your website did not open for us. Visitors and Google may see the same.", d.input.website); return F; }
  if(!s.https) add("site", "gap", "Your website is not on a secure (https) address, so browsers warn visitors.", s.finalUrl, "tech");
  if(!s.title) add("site", "gap", "Your home page has no title for Google to show.", s.finalUrl, "page");
  else if(c && !simple(s.title).includes(simple(c).split(" ")[0])) add("site", "gap", `Your home page title does not mention ${c}, the place people search for.`, s.finalUrl, "page");
  if(!s.desc) add("site", "gap", "Your home page has no description, so Google writes its own snippet.", s.finalUrl, "page");
  if(!s.tel) add("site", "gap", "There is no tap-to-call phone link on your home page, so phone visitors cannot call in one tap.", s.finalUrl, "page");
  if(!s.localSchema) add("site", "gap", "Your site does not tell Google its business details in code (no LocalBusiness data).", s.finalUrl, "tech");
  if(!s.viewport) add("site", "gap", "Your home page is not set up for phones.", s.finalUrl, "tech");
  if(s.images > 4 && s.imagesNoAlt / s.images > .3) add("site", "gap", `${s.imagesNoAlt} of ${s.images} images on your home page have no description for Google.`, s.finalUrl, "page");
  if(d.speed && d.speed.status === "ok"){ const p = d.speed.score;
    if(p < 50) add("site", "gap", `Your site is slow on phones: ${p} out of 100 in Google's own test.`, d.speed.proof, "tech");
    else if(p < 90) add("site", "gap", `Your site could be faster on phones: ${p} out of 100 in Google's own test.`, d.speed.proof, "tech");
    else add("site", "good", `Your site is fast on phones: ${p} out of 100.`, d.speed.proof); }
  if(d.sitemap){ if(!d.sitemap.count) add("site", "gap", "We found no sitemap, the list that helps Google find all your pages.", d.input.website, "tech"); else add("site", "good", `Google can be pointed to ${d.sitemap.count} pages from your sitemap.`, d.sitemap.source); }
  const sc = Object.keys(s.socials || {}); if(!s.socials.facebook && !s.socials.instagram) add("social", "gap", "Your website does not link to a Facebook or Instagram page.", s.finalUrl); else add("social", "good", `Your site links to ${sc.length} social profile${sc.length === 1 ? "" : "s"}.`, s.finalUrl);
  const g = d.google;
  if(g && g.status === "ok"){
    if(!g.place) add("maps", "gap", "We could not find your Google Business Profile, so you may be missing from Maps.", "");
    else {
      const comp = (g.rank && g.rank.competitors) || [], topRev = Math.max(0, ...comp.map(x => x.reviews || 0));
      if(g.place.reviews < topRev) add("reviews", "gap", `You have ${g.place.reviews.toLocaleString("en-US")} Google reviews. ${comp.find(x => x.reviews === topRev).name} has ${topRev.toLocaleString("en-US")}.`, g.place.proof);
      else if(g.place.reviews) add("reviews", "good", `You have ${g.place.reviews} Google reviews, as many as the top nearby competitors or more.`, g.place.proof);
      if(g.place.rating && g.place.rating < 4.5) add("reviews", "gap", `Your Google rating is ${g.place.rating}. Most people choose from businesses rated 4.5 or more.`, g.place.proof);
    }
    if(g.rank){ const r = g.rank;
      if(!r.position) add("maps", "gap", `You are not in the first ${r.checked || 20} Google Maps results for "${r.query}".`, r.proof);
      else if(r.position > 3) add("maps", "gap", `You are number ${r.position} on Google Maps for "${r.query}". The top 3 get most of the calls.`, r.proof);
      else add("maps", "good", `You are number ${r.position} on Google Maps for "${r.query}".`, r.proof); }
  }
  if(sv) add("ai", "info", `We check whether ChatGPT and Google's AI answers name you for "${sv} in ${c || "your city"}" once you start.`, "");
  return F;
}

async function handle(request){
  const hdr = { "content-type":"application/json", "cache-control":"private, no-store", "x-robots-tag":"noindex" };
  const u = new URL(request.url); let body = {};
  if(request.method === "POST"){ try{ body = await request.json(); }catch(e){ body = {}; } }
  const q = Object.assign(Object.fromEntries(u.searchParams.entries()), body || {});
  const name = String(q.name || "").slice(0, 120).trim(), city = String(q.city || "").slice(0, 80).trim(), service = String(q.service || "").slice(0, 60).trim();
  const url = normUrl(q.website);
  if(!url && !name) return new Response(JSON.stringify({ ok:false, error:"Give a website or a business name." }), { status:400, headers:hdr });
  const codeOk = !!(process.env.PORTAL_DEMO_CODE && String(q.code || request.headers.get("x-demo-code") || "") === process.env.PORTAL_DEMO_CODE);
  const at = new Date().toISOString(), d = { ok:true, at, input:{ name, city, service, website:url ? url.toString() : "" }, site:null, sitemap:null, speed:null, google:null };
  const jobs = [];
  if(url){
    jobs.push(get(url.toString(), 12000).then(r => { d.siteFetch = { status:r.status, error:r.error || "" }; if(r.ok && r.text) d.site = readSite(r.text, r.url); }));
    jobs.push(readSitemap(url.origin).then(x => { d.sitemap = x; }));
    jobs.push(pageSpeed(url.toString()).then(x => { d.speed = x; }));
  }
  if(codeOk && process.env.SERPAPI_KEY && (name || url)) jobs.push(google(name || host(url && url.toString()), city, service, url ? host(url.toString()) : "").then(x => { d.google = x; }).catch(e => { d.google = { status:"unavailable", why:String(e && e.message || e) }; }));
  else d.google = { status:"locked", why:process.env.SERPAPI_KEY ? "Sales code needed for Google Maps data" : "Google Maps data is not switched on for this site yet" };
  await Promise.all(jobs);
  d.findings = findings(d);
  d.searchesUsed = d.google && d.google.status === "ok" ? (service && city ? 2 : 1) : 0;
  return new Response(JSON.stringify(d), { status:200, headers:hdr });
}
export async function GET(request){ return handle(request); }
export async function POST(request){ return handle(request); }
