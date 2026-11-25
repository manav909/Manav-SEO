/* Client business intelligence: as soon as any connected Google account can see a client's Search Console or Analytics,
   the order desk reads the numbers and builds a SWOT, quick wins, a retention plan and pitches for sales. Read-only. */
import { apiAs, props, refreshProps } from "./google.mjs";

const host = u => { try{ return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); }catch(e){ return ""; } };
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/* Every property any connected account can see for this site (no limit on accounts) */
export async function propsFor(website, fresh){
  const h = host(website); if(!h) return { gsc:[], ga:[] };
  let idx = fresh ? await refreshProps() : await props();
  const match = i => i.kind === "gsc" ? host(i.id.replace(/^sc-domain:/, "https://")) === h : (i.sites || []).some(x => x === h || x.endsWith("." + h));
  if(!idx.items.some(match) && !fresh){ idx = await refreshProps(); }
  return { gsc:idx.items.filter(i => i.kind === "gsc" && match(i)), ga:idx.items.filter(i => i.kind === "ga" && match(i)) };
}
async function gscData(p){
  const u = "https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(p.id) + "/searchAnalytics/query", q = b => apiAs(p.email, u, b).then(j => j.rows || []).catch(() => []);
  const cur = { startDate:day(30), endDate:day(3) }, prev = { startDate:day(58), endDate:day(31) };
  const [tot, totP, qs, pages, dev, cty] = await Promise.all([q(Object.assign({ dimensions:[] }, cur)), q(Object.assign({ dimensions:[] }, prev)),
    q(Object.assign({ dimensions:["query"], rowLimit:60 }, cur)), q(Object.assign({ dimensions:["page"], rowLimit:30 }, cur)), q(Object.assign({ dimensions:["device"] }, cur)), q(Object.assign({ dimensions:["country"], rowLimit:5 }, cur))]);
  const t = r => r[0] ? { clicks:r[0].clicks, impressions:r[0].impressions, ctr:+(r[0].ctr * 100).toFixed(2), position:+r[0].position.toFixed(1) } : { clicks:0, impressions:0 };
  const row = r => ({ k:r.keys[0], clicks:r.clicks, impressions:r.impressions, ctr:+(r.ctr * 100).toFixed(1), position:+r.position.toFixed(1) });
  const Q = qs.map(row);
  return { property:p.id, via:p.email, range:cur, now:t(tot), before:t(totP), queries:Q.slice(0, 25), pages:pages.map(row).slice(0, 15),
    nearPage1:Q.filter(x => x.position > 8 && x.position <= 20 && x.impressions >= 20).slice(0, 12), lowCtr:Q.filter(x => x.position <= 8 && x.ctr < 2 && x.impressions >= 50).slice(0, 10),
    devices:dev.map(row), countries:cty.map(row) };
}
async function gaData(p){
  const u = "https://analyticsdata.googleapis.com/v1beta/" + p.id + ":runReport", r = b => apiAs(p.email, u, b).catch(() => ({}));
  const dr = [{ startDate:"28daysAgo", endDate:"yesterday" }, { startDate:"56daysAgo", endDate:"29daysAgo" }];
  const [tot, ch, pg] = await Promise.all([r({ dateRanges:dr, metrics:[{ name:"activeUsers" }, { name:"sessions" }, { name:"keyEvents" }, { name:"engagementRate" }] }),
    r({ dateRanges:[dr[0]], dimensions:[{ name:"sessionDefaultChannelGroup" }], metrics:[{ name:"sessions" }, { name:"keyEvents" }], limit:8 }),
    r({ dateRanges:[dr[0]], dimensions:[{ name:"pagePath" }], metrics:[{ name:"sessions" }, { name:"keyEvents" }], limit:10, orderBys:[{ metric:{ metricName:"sessions" }, desc:true }] })]);
  const m = (rows, i) => rows && rows[i] ? rows[i].metricValues.map(v => +(+v.value).toFixed(3)) : null;
  return { property:p.name, via:p.email, now:m(tot.rows, 0), before:m(tot.rows, 1), metrics:["users", "sessions", "keyEvents", "engagementRate"],
    channels:(ch.rows || []).map(x => ({ k:x.dimensionValues[0].value, sessions:+x.metricValues[0].value, keyEvents:+x.metricValues[1].value })),
    pages:(pg.rows || []).map(x => ({ k:x.dimensionValues[0].value, sessions:+x.metricValues[0].value, keyEvents:+x.metricValues[1].value })) };
}
export async function gather(website, pick){
  const ps = await propsFor(website), out = { at:new Date().toISOString(), site:host(website), gsc:null, ga:null, seen:{ gsc:ps.gsc.map(x => ({ id:x.id, email:x.email, level:x.level })), ga:ps.ga.map(x => ({ id:x.id, name:x.name, email:x.email })) } };
  const g = (pick && pick.gsc && ps.gsc.find(x => x.id === pick.gsc.id && x.email === pick.gsc.email)) || ps.gsc.find(x => /^sc-domain:/.test(x.id)) || ps.gsc.find(x => /^https:/.test(x.id)) || ps.gsc[0];
  if(g) out.gsc = await gscData(g).catch(e => ({ error:e.message }));
  const a = ps.ga[0]; if(a) out.ga = await gaData(a).catch(e => ({ error:e.message }));
  return out;
}
export function intelPrompt(o, data, site){
  const system = `You are a senior SEO and digital marketing strategist for an agency. From real Google data (Search Console and Analytics) and the order, understand the client's business and write what sales and the team need.
Be specific: name queries, pages and numbers from the data. Never invent numbers. If data is missing, say what is missing. No dashes. Pitches must be honest and fit what the agency sells (SEO, technical SEO, content, GEO and AI search visibility, Google Ads, web design).
Answer with one JSON object only:
{"business":{"what":"what the business does and sells","audience":"who searches for it and where","model":"how it makes money, if visible"},
"numbers":["the 4 to 6 numbers that matter most, in plain words, with the change versus the 28 days before"],
"swot":{"strengths":[""],"weaknesses":[""],"opportunities":[""],"threats":[""]},
"quickWins":[{"what":"","why":"the data behind it","effort":"small | medium"}],
"retention":{"plan":"a 3 month plan that keeps this client with us, step by step in plain words","offer":"the monthly service to offer","price":"USD per month","when":"the right moment to offer it","line":"one sentence sales can say"},
"pitches":[{"title":"","why":"data behind it","price":"USD","message":"short message sales can send on the marketplace, warm, no outside contact details"}],
"forQA":["checks QA can do with this data to verify our work, e.g. sitemap read, pages indexed, clicks on fixed pages"]}`;
  const user = `Client ${o.client.name}, site ${site}. Order: ${(o.ai && o.ai.summary) || ""}
Client profile from the chat: ${JSON.stringify((o.ai && o.ai.profile) || {})}
Website check: ${JSON.stringify(o.site || {})}
Google data: ${JSON.stringify(data).slice(0, 45000)}`;
  return { system, user };
}
