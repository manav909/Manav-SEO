/* Report: which AI and search crawlers read businesssanta.com, and which pages. Data from middleware.js.
   Open https://www.businesssanta.com/api/ai-bots (add ?days=7 for a shorter window). Not indexed. */
export const config = { runtime: "edge" };
import { BOTS } from "../middleware.js";

const LABEL = Object.fromEntries(BOTS);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const page = (body) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>AI crawlers on businesssanta.com</title>
<style>body{font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;max-width:980px;margin:32px auto;padding:0 16px}h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px}p{color:#475569;margin:0 0 12px}table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top}th{font-size:13px;color:#475569}td.n{text-align:right;font-variant-numeric:tabular-nums}.bar{height:10px;background:#FDB913;border-radius:5px}.note{background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 14px}</style></head><body>${body}</body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

export default async function handler(req) {
  const R = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const T = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!R || !T) {
    return page(`<h1>AI crawlers on businesssanta.com</h1><div class="note"><b>Storage is not connected yet.</b> Crawler visits are already written to Vercel's logs (search the Logs tab for <code>AI_BOT</code>). To keep 90 days of history here: Vercel, project <b>businesssanta</b>, <b>Storage</b>, create a free <b>Upstash for Redis</b> database and connect it to this project, then redeploy.</div>`);
  }
  const days = Math.min(90, Math.max(1, parseInt(new URL(req.url).searchParams.get("days") || "30", 10) || 30));
  const dates = [...Array(days)].map((_, i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  const cmds = dates.map((d) => ["HGETALL", "aibots:" + d]).concat([["LRANGE", "aibots:recent", 0, 49]]);
  let out;
  try {
    const r = await fetch(R.replace(/\/$/, "") + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + T, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
    out = await r.json();
  } catch (e) { return page(`<h1>AI crawlers</h1><p>Could not reach storage right now. Try again in a minute.</p>`); }
  const byBot = {}, byPage = {}, byDay = {};
  dates.forEach((d, i) => {
    const flat = (out[i] && out[i].result) || [];
    for (let j = 0; j < flat.length; j += 2) {
      const [bot, ...p] = flat[j].split(" "), path = p.join(" "), n = +flat[j + 1] || 0;
      byBot[bot] = (byBot[bot] || 0) + n;
      byDay[d] = (byDay[d] || 0) + n;
      const k = path; byPage[k] = byPage[k] || {}; byPage[k][bot] = (byPage[k][bot] || 0) + n;
    }
  });
  const recent = ((out[dates.length] && out[dates.length].result) || []).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  const total = Object.values(byBot).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(byBot));
  const isAI = (b) => !/^(Googlebot|bingbot)$/.test(b);
  const aiTotal = Object.entries(byBot).filter(([b]) => isAI(b)).reduce((a, [, n]) => a + n, 0);
  const botRows = Object.entries(byBot).sort((a, b) => b[1] - a[1]).map(([b, n]) => `<tr><td><b>${esc(b)}</b><br><span style="color:#475569;font-size:13px">${esc(LABEL[b] || "")}</span></td><td style="width:45%"><div class="bar" style="width:${Math.round(n / max * 100)}%"></div></td><td class="n">${n}</td></tr>`).join("");
  const pageRows = Object.entries(byPage).map(([p, m]) => [p, m, Object.entries(m).filter(([b]) => isAI(b)).reduce((a, [, n]) => a + n, 0), Object.values(m).reduce((a, b) => a + b, 0)])
    .sort((a, b) => b[2] - a[2] || b[3] - a[3]).slice(0, 40)
    .map(([p, m, ai, all]) => `<tr><td>${esc(p)}</td><td class="n">${ai}</td><td class="n">${all}</td><td style="font-size:13px;color:#475569">${esc(Object.entries(m).sort((a, b) => b[1] - a[1]).map(([b, n]) => b + " " + n).join(", "))}</td></tr>`).join("");
  const dayRows = dates.filter((d) => byDay[d]).map((d) => `<tr><td>${d}</td><td class="n">${byDay[d]}</td></tr>`).join("");
  const recentRows = recent.map((r) => `<tr><td>${esc(r.t.replace("T", " ").slice(0, 16))} UTC</td><td>${esc(r.bot)}</td><td>${esc(r.path)}</td></tr>`).join("");
  return page(`<h1>AI crawlers on businesssanta.com</h1><p>Last ${days} days. ${total} crawler visits, ${aiTotal} from AI tools (everything except Googlebot and Bingbot). Counted by user agent.</p>
<h2>Who is reading the site</h2><table><tr><th>Crawler</th><th></th><th class="n">Visits</th></tr>${botRows || '<tr><td colspan="3">No crawler visits yet.</td></tr>'}</table>
<h2>Which pages they read</h2><table><tr><th>Page</th><th class="n">AI visits</th><th class="n">All crawlers</th><th>Breakdown</th></tr>${pageRows || '<tr><td colspan="4">Nothing yet.</td></tr>'}</table>
<h2>By day</h2><table><tr><th>Day (UTC)</th><th class="n">Visits</th></tr>${dayRows || '<tr><td colspan="2">Nothing yet.</td></tr>'}</table>
<h2>Latest 50 visits</h2><table><tr><th>When</th><th>Crawler</th><th>Page</th></tr>${recentRows || '<tr><td colspan="3">Nothing yet.</td></tr>'}</table>`);
}
