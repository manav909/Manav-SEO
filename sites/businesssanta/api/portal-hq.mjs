/* Advanced panel API and pages (Manav only).
   ?a=pub   public key (safe to share: it can only lock data, not open it)
   ?a=data  the decrypted snapshot, admin only
   ?p=cr|cc the Control Room or Command Center page, served read-only from the snapshot, admin only */
import { store, whoIs } from "./_lib/store.mjs";
import { hqKeys, fingerprint, hqSnapshot, hqPages } from "./_lib/hq.mjs";

const J = { "content-type":"application/json", "cache-control":"private, no-store", "x-robots-tag":"noindex" };
const out = (b, s) => new Response(JSON.stringify(b), { status:s || 200, headers:J });
const PAGES = { cr:{ file:"cr.html", name:"Control Room", url:"https://claude.ai/artifact/QZ85AbUMdCujjKRDRhZtdk" }, cc:{ file:"cc.html", name:"Command Center", url:"" } };

function shim(page, info){
  return `<script>
(() => {
  /* Read-only stand-in for the Claude app data layer: the same page, fed from the latest portal snapshot. */
  const PAGE = ${JSON.stringify(page)}, INFO = ${JSON.stringify(info)};
  let SNAP = null; const waiting = [];
  /* Two sources, merged: the locked snapshot (everything, as of its time) and the live store the tasks write to (newer records win). */
  const J = u => fetch(u, { credentials:"same-origin" }).then(r => r.json()).catch(e => ({ ok:false, error:String(e) }));
  const ready = Promise.all([J("/api/portal-hq?a=data"), J("/api/ops?a=snapshot&space=" + PAGE)]).then(([h, o]) => {
    const base = (h && h.ok && h.snap && h.snap[PAGE]) || { docs:{}, cols:{} }, live = (o && o.snap) || { docs:{}, cols:{} };
    const cols = {}; Object.keys(base.cols || {}).forEach(c => { cols[c] = (base.cols[c] || []).slice(); });
    Object.keys(live.cols || {}).forEach(c => { const m = new Map((cols[c] || []).map(r => [r.id, r])); (live.cols[c] || []).forEach(r => m.set(r.id, r)); cols[c] = [...m.values()]; });
    SNAP = { docs:Object.assign({}, base.docs || {}, live.docs || {}), cols };
    const at = [h && h.snap && h.snap.at, o && o.at].filter(Boolean).sort().pop();
    bar({ ok:!!((h && h.ok) || (o && o.ok)), error:(o && o.error) || (h && h.error), snap:{ at } });
  });
  /* Connector answers the tasks saved (mcp/<tool>--<brand>--<network>), so the calendar and stats show real Metricool data here too. */
  const NETP = { IGEV:"instagram", FBEV:"facebook", YTEV:"youtube", THEV:"threads", PIEV:"pinterest", LIEV:"linkedin" };
  const mcp = { callTool:(server, tool, input) => ready.then(() => {
    input = input || {}; const net = Array.isArray(input.metrics) && input.metrics[0] ? (NETP[String(input.metrics[0]).slice(0, 4)] || "all") : "all";
    const k = "mcp/" + tool + "--" + (input.brandId || "all") + "--" + net;
    let d = (SNAP.docs || {})[k]; if(d === undefined){ const r = ((SNAP.cols || {}).mcp || []).find(x => x.id === k.slice(4)); d = r ? r.data : undefined; }
    if(d === undefined) return Promise.reject(Object.assign(new Error("Saved by the tasks only: not in the latest update"), { code:"unavailable" }));
    if(tool === "getAnalyticsDataByMetrics" && d && Array.isArray(d.ids) && Array.isArray(d.rows)){ const ids = input.metrics; d = { rows:d.rows.map(r => ids.map(id => { const i = d.ids.indexOf(id); return i >= 0 ? r[i] : null; }).concat([r[r.length - 1]])) }; }
    return { payload:d };
  }) };
  function bar(j){ const go = () => { const b = document.createElement("div"); b.setAttribute("style", "position:sticky;top:0;z-index:99999;background:#FDB913;color:#0b0d14;font:600 13px -apple-system,Segoe UI,Arial,sans-serif;padding:8px 14px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between");
    const at = j && j.snap && j.snap.at ? new Date(j.snap.at).toLocaleString("en-IN", { timeZone:"Asia/Kolkata", day:"numeric", month:"short", hour:"numeric", minute:"2-digit" }) + " IST" : "not yet";
    b.innerHTML = "<span>" + INFO.name + ", read-only for now. Last update from the tasks " + at + (j && j.ok === false ? " (" + (j.error || "no data") + ")" : "") + ".</span><span style='display:flex;gap:10px'><a href='/portal/hq' style='color:#0b0d14'>Advanced panel</a>" + (INFO.url ? "<a href='" + INFO.url + "' target='_blank' rel='noopener' style='color:#0b0d14'>Open the live " + INFO.name + " to act</a>" : "") + "</span>";
    document.body.prepend(b); }; if(document.body) go(); else document.addEventListener("DOMContentLoaded", go); }
  const RO = () => Promise.reject(Object.assign(new Error("This mirror is read-only. Open the live page to make changes."), { code:"read-only" }));
  const docSnap = (id, data) => ({ id, exists:data != null, data:() => data == null ? undefined : JSON.parse(JSON.stringify(data)), get:k => data ? data[k] : undefined, ref:{ id } });
  const val = (o, f) => o == null ? undefined : o[f];
  function query(name, ops){
    const q = {
      where:(f, op, v) => query(name, ops.concat([["w", f, op, v]])), orderBy:(f, dir) => query(name, ops.concat([["o", f, dir || "asc"]])), limit:n => query(name, ops.concat([["l", n]])),
      doc:id => docRef(name + "/" + id), add:RO,
      get:() => ready.then(() => snapOf(name, ops)),
      onSnapshot:(cb, err) => { ready.then(() => { try{ cb(snapOf(name, ops)); }catch(e){ console.error(e); } }); return () => {}; }
    };
    return q;
  }
  function snapOf(name, ops){
    let rows = ((SNAP.cols || {})[name] || []).slice();
    ops.forEach(o => {
      if(o[0] === "w"){ const [, f, op, v] = o; rows = rows.filter(r => { const x = val(r.data, f); return op === "==" ? x === v : op === "!=" ? x !== v : op === "<" ? x < v : op === "<=" ? x <= v : op === ">" ? x > v : op === ">=" ? x >= v : op === "in" ? (v || []).includes(x) : op === "array-contains" ? Array.isArray(x) && x.includes(v) : true; }); }
      if(o[0] === "o"){ const [, f, dir] = o; rows.sort((a, b) => { const x = val(a.data, f), y = val(b.data, f); return (x > y ? 1 : x < y ? -1 : 0) * (dir === "desc" ? -1 : 1); }); }
      if(o[0] === "l") rows = rows.slice(0, o[1]);
    });
    const docs = rows.map(r => docSnap(r.id, r.data));
    return { docs, size:docs.length, empty:!docs.length, forEach:fn => docs.forEach(fn), docChanges:() => docs.map(d => ({ type:"added", doc:d })) };
  }
  function docRef(path){
    const parts = path.split("/"), id = parts.pop(), col = parts.join("/");
    const find = () => { const d = (SNAP.docs || {})[path]; if(d !== undefined) return d; const r = ((SNAP.cols || {})[col] || []).find(x => x.id === id); return r ? r.data : null; };
    return { id, set:RO, update:RO, delete:RO, collection:n => query(path + "/" + n, []),
      get:() => ready.then(() => docSnap(id, find())), onSnapshot:(cb, err) => { ready.then(() => { try{ cb(docSnap(id, find())); }catch(e){ console.error(e); } }); return () => {}; } };
  }
  const db = { collection:n => query(n, []), doc:docRef };
  window.claude = { use:n => Promise.resolve(n === "db" ? db : n === "mcp" ? mcp : null) };
})();
</script>`;
}

async function handle(request){
  const u = new URL(request.url), a = u.searchParams.get("a"), p = u.searchParams.get("p");
  if(!store()) return out({ ok:false, error:"Portal storage is not connected" }, 503);
  if(a === "pub"){ const k = await hqKeys(); return out({ ok:true, pub:k.pub, fp:fingerprint(k.pub) }); }
  const who = await whoIs(request);
  if(!who || who.role !== "admin"){
    if(p) return new Response(null, { status:302, headers:{ location:"/portal?team=1", "cache-control":"no-store" } });
    return out({ ok:false, error:"Admin only" }, 401);
  }
  if(a === "data"){ try{ return out({ ok:true, snap:await hqSnapshot(u.searchParams.has("fresh")) }); }catch(e){ return out({ ok:false, error:String(e.message || e) }, 200); } }
  if(PAGES[p]){
    let html; try{ html = (await hqPages())[p].html; }catch(e){ return new Response("<!doctype html><meta name=robots content=noindex><body style='font:16px sans-serif;background:#0b0d14;color:#f7f7f9;padding:40px'><h1>Not ready yet</h1><p>" + String(e.message || e) + "</p><p><a style='color:#FDB913' href='/portal/hq'>Back to the advanced panel</a></p>", { status:200, headers:{ "content-type":"text/html; charset=utf-8", "cache-control":"no-store" } }); }
    const s = shim(p, PAGES[p]), i = html.search(/<script\b/i);
    html = i >= 0 ? html.slice(0, i) + s + html.slice(i) : html.replace(/<\/head>/i, s + "</head>");
    html = html.replace(/<head>/i, '<head><meta name="robots" content="noindex, nofollow">');
    return new Response(html, { status:200, headers:{ "content-type":"text/html; charset=utf-8", "cache-control":"private, no-store", "x-robots-tag":"noindex, nofollow" } });
  }
  return out({ ok:false, error:"Unknown request" }, 404);
}
export async function GET(request){ try{ return await handle(request); }catch(e){ return out({ ok:false, error:String(e.message || e) }, 500); } }
