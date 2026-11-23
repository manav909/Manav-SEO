/* Operations store: the portal's own copy of everything the Control Room and Command Center hold.
   Scheduled tasks write here directly (header x-task-key); Manav reads it in the advanced panel (admin sign-in).
   Spaces: "cr" (Control Room) and "cc" (Command Center). Every record is collection/id, exactly as in those pages.
   POST {space, items:[{path:"meta/growthTargets", data:{...}}, {path:"history/<id>", data:{...}}]}  saves records
   POST {space, del:["notes/<id>"]}                                                                    removes records
   GET  ?a=col&space=cr&name=history | ?a=doc&space=cr&path=meta/x | ?a=snapshot&space=cr | ?a=beats    reads */
import crypto from "node:crypto";
import { store, cmd, pipe, whoIs } from "./_lib/store.mjs";

/* Only the fingerprint of the task key lives in code; the key itself sits in the Control Room's private storage. */
const TASK_KEY_SHA = "8ffd01a52576bbe8357092f83f1f387568e6a4758f92c3ef308c11d8f3ae0d8e";
const J = { "content-type":"application/json", "cache-control":"private, no-store", "x-robots-tag":"noindex" };
const out = (b, s) => new Response(JSON.stringify(b), { status:s || 200, headers:J });
const SPACES = ["cr", "cc"], NAME = /^[A-Za-z0-9_-]{1,60}$/, ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const H = (space, col) => "bsp:ops:" + space + ":" + col, IDX = space => "bsp:ops:" + space + ":_cols";
/* Busy collections keep their newest rows only (by the field the pages sort on). */
const KEEP = { history:[600, "lastRunAt"], notes:[400, "createdAt"], handoffdone:[400, "at"], help:[200, "at"], usageday:[90, "date"], optlog:[300, "at"], insights:[120, "at"], wins:[300, "at"], stock:[120, "madeAt"], meetings:[200, "at"], reports:[300, "at"] };

function taskOk(request){
  const k = request.headers.get("x-task-key") || "";
  if(!k) return false;
  const a = crypto.createHash("sha256").update(k).digest(), b = Buffer.from(TASK_KEY_SHA, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const split = p => { const s = String(p || "").replace(/^\/+|\/+$/g, "").split("/"); return s.length === 2 && NAME.test(s[0]) && ID.test(s[1]) ? s : null; };
async function trim(space, col){
  const k = KEEP[col]; if(!k) return;
  const n = await cmd("HLEN", H(space, col)); if(n <= k[0] + 20) return;
  const all = await cmd("HGETALL", H(space, col)), rows = [];
  for(let i = 0; i < all.length; i += 2){ let d = {}; try{ d = JSON.parse(all[i + 1]); }catch(e){} rows.push([all[i], String(d[k[1]] || "")]); }
  rows.sort((a, b) => b[1].localeCompare(a[1]));
  const drop = rows.slice(k[0]).map(r => r[0]); if(drop.length) await cmd("HDEL", H(space, col), ...drop);
}
async function readCol(space, col){
  const all = await cmd("HGETALL", H(space, col)), rows = [];
  for(let i = 0; i < all.length; i += 2){ try{ rows.push({ id:all[i], data:JSON.parse(all[i + 1]) }); }catch(e){} }
  return rows;
}

async function handle(request){
  if(!store()) return out({ ok:false, error:"Portal storage is not connected" }, 503);
  const u = new URL(request.url), task = taskOk(request), who = task ? null : await whoIs(request);
  const admin = !!(who && who.role === "admin");
  if(!task && !admin) return out({ ok:false, error:"Not allowed" }, 401);
  const space = (u.searchParams.get("space") || "cr").toLowerCase();

  if(request.method === "POST"){
    if(!task) return out({ ok:false, error:"Only scheduled tasks write here for now" }, 403);
    let q; try{ q = await request.json(); }catch(e){ return out({ ok:false, error:"Send JSON" }, 400); }
    const sp = String(q.space || space).toLowerCase(); if(!SPACES.includes(sp)) return out({ ok:false, error:"space must be cr or cc" }, 400);
    const items = Array.isArray(q.items) ? q.items : [], del = Array.isArray(q.del) ? q.del : [];
    if(items.length > 500 || del.length > 500) return out({ ok:false, error:"At most 500 records a call" }, 400);
    const ops = [], cols = new Set(), bad = []; let saved = 0;
    for(const it of items){
      const s = split(it && it.path), body = s && it.data !== undefined ? JSON.stringify(it.data) : null;
      if(!s || body == null || body.length > 400000){ bad.push(it && it.path); continue; }
      ops.push(["HSET", H(sp, s[0]), s[1], body], ["SADD", IDX(sp), s[0]]); cols.add(s[0]); saved++;
      if(s[0] === "history" && it.data && it.data.key) ops.push(["HSET", "bsp:ops:beats", String(it.data.key).slice(0, 80), JSON.stringify({ at:it.data.lastRunAt || new Date().toISOString(), result:String(it.data.result || "").slice(0, 160), name:String(it.data.name || "").slice(0, 120) })]);
    }
    for(const p of del){ const s = split(p); if(s) ops.push(["HDEL", H(sp, s[0]), s[1]]); else bad.push(p); }
    ops.push(["HSET", "bsp:ops:writes", sp, new Date().toISOString()]);
    for(let i = 0; i < ops.length; i += 200) await pipe(ops.slice(i, i + 200));
    for(const c of cols) await trim(sp, c).catch(() => {});
    return out({ ok:true, saved, removed:del.length - bad.length + (items.length - saved), rejected:bad });
  }

  const a = u.searchParams.get("a");
  if(!SPACES.includes(space)) return out({ ok:false, error:"space must be cr or cc" }, 400);
  if(a === "doc"){ const s = split(u.searchParams.get("path")); if(!s) return out({ ok:false, error:"path is collection/id" }, 400); const v = await cmd("HGET", H(space, s[0]), s[1]); return out({ ok:true, exists:!!v, data:v ? JSON.parse(v) : null }); }
  if(a === "col"){ const n = u.searchParams.get("name"); if(!NAME.test(n || "")) return out({ ok:false, error:"name" }, 400); return out({ ok:true, rows:await readCol(space, n) }); }
  if(a === "snapshot"){
    const cols = await cmd("SMEMBERS", IDX(space)), snap = { docs:{}, cols:{} };
    for(const c of cols){ const rows = await readCol(space, c); snap.cols[c] = rows; rows.forEach(r => { snap.docs[c + "/" + r.id] = r.data; }); }
    const w = await cmd("HGET", "bsp:ops:writes", space);
    return out({ ok:true, space, at:w || null, snap });
  }
  if(a === "beats"){ const all = await cmd("HGETALL", "bsp:ops:beats"), o = {}; for(let i = 0; i < all.length; i += 2){ try{ o[all[i]] = JSON.parse(all[i + 1]); }catch(e){} } return out({ ok:true, beats:o }); }
  return out({ ok:false, error:"Unknown request" }, 404);
}
export async function GET(request){ try{ return await handle(request); }catch(e){ return out({ ok:false, error:String(e.message || e) }, 500); } }
export async function POST(request){ try{ return await handle(request); }catch(e){ return out({ ok:false, error:String(e.message || e) }, 500); } }
