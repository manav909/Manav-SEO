/* Business Santa client portal API: sign-in, client dashboards and the admin console.
   One function, action chosen by ?a=. Clients only ever see the businesses assigned to them. */
import { runScan, serpAccount, normUrl } from "./_lib/scan.mjs";
import { store, cmd, pipe, K, getJ, setJ, mgetJ, listJ, rid, slug, sameSecret, countSearches, ym,
  ADMIN_TTL, CLIENT_TTL, setCookie, clearCookie, newSession, whoIs, rateLimit } from "./_lib/store.mjs";

const HDR = { "content-type":"application/json", "cache-control":"private, no-store", "x-robots-tag":"noindex" };
const out = (body, status, extra) => new Response(JSON.stringify(body), { status:status || 200, headers:Object.assign({}, HDR, extra || {}) });
const bad = (msg, status) => out({ ok:false, error:msg }, status || 400);
const go = (loc, cookie) => new Response(null, { status:302, headers:Object.assign({ location:loc, "cache-control":"no-store" }, cookie ? { "set-cookie":cookie } : {}) });
const MODS = ["maps", "site", "reviews", "ai", "social", "ads"];
const str = (v, n) => String(v == null ? "" : v).slice(0, n || 200).trim();
const SERP_FLOOR = +(process.env.SERPAPI_KEEP_FREE || 25);

/* A short record of one check, kept for the trend lines. */
export function compact(d){
  const g = d.google && d.google.status === "ok" ? d.google : null, F = d.findings || [];
  return { at:d.at, speed:d.speed && d.speed.status === "ok" ? d.speed.score : null, lcp:d.speed && d.speed.lcp || "",
    reviews:g && g.place ? g.place.reviews || 0 : null, rating:g && g.place ? g.place.rating || null : null,
    rank:g && g.rank ? g.rank.position : null, rankOf:g && g.rank ? g.rank.checked : null, query:g && g.rank ? g.rank.query : "",
    pages:d.sitemap ? d.sitemap.count : null, socials:d.site ? Object.keys(d.site.socials || {}).length : null,
    gaps:F.filter(f => f.level === "gap").map(f => f.code), good:F.filter(f => f.level === "good").map(f => f.code), google:!!g };
}
export async function saveScan(id, d){
  const c = compact(d), first = await cmd("EXISTS", K.first(id));
  const ops = [["LPUSH", K.scans(id), JSON.stringify(d)], ["LTRIM", K.scans(id), 0, 11], ["LPUSH", K.scans(id) + ":c", JSON.stringify(c)], ["LTRIM", K.scans(id) + ":c", 0, 199]];
  if(!first) ops.push(["SET", K.first(id), JSON.stringify(d)]);
  await pipe(ops);
  const b = await getJ(K.brand(id)); if(b){ b.lastScanAt = d.at; b.lastGoogleAt = c.google ? d.at : b.lastGoogleAt || null; await setJ(K.brand(id), b); }
  return c;
}
export async function scanBrand(b, why){
  let withGoogle = !!process.env.SERPAPI_KEY, lockWhy = "";
  if(withGoogle){ const a = await serpAccount().catch(() => null); if(a && a.left != null && a.left < SERP_FLOOR){ withGoogle = false; lockWhy = `Google Maps check paused: only ${a.left} SerpAPI searches left this month`; } }
  const d = await runScan({ name:b.name, website:b.website, city:b.city, service:b.service }, { withGoogle, lockWhy });
  if(!d.ok) throw new Error(d.error || "Check failed");
  if(d.searchesUsed) await countSearches(d.searchesUsed, why || "admin");
  await saveScan(b.id, d);
  return d;
}

async function brandView(id, role){
  const [b, work, todo, first, conn] = await mgetJ([K.brand(id), K.work(id), K.todo(id), K.first(id), K.conn(id)]);
  if(!b) return null;
  const [latest] = await listJ(K.scans(id), 1);
  const series = (await listJ(K.scans(id) + ":c", 200)).reverse();
  const brand = Object.assign({}, b); if(role !== "admin") delete brand.notes;
  const users = (await mgetJ((await cmd("SMEMBERS", K.users)).map(K.user))).filter(u => u && !u.revoked && (u.brands || []).includes(id));
  const people = users.map(u => ({ name:u.name, role:u.role || "owner", lastSeen:u.lastSeen || null }));
  return { brand, latest:latest || null, first:first || null, series, work:work || [], todo:todo || [], conn:conn || { items:{}, team:[] }, people };
}
async function allBrands(){ const ids = await cmd("SMEMBERS", K.brands); return (await mgetJ(ids.map(K.brand))).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)); }
async function summaries(brands){
  if(!brands.length) return [];
  const heads = await pipe(brands.map(b => ["LINDEX", K.scans(b.id) + ":c", 0]));
  const conns = await mgetJ(brands.map(b => K.conn(b.id)));
  return brands.map((b, i) => ({ pending:pendingOf(conns[i]), id:b.id, name:b.name, city:b.city, website:b.website, service:b.service, type:b.type || "", modules:b.modules || {}, lastScanAt:b.lastScanAt || null, latest:heads[i] ? JSON.parse(heads[i]) : null }));
}
const CONN = ["gbp", "gsc", "ga", "web", "meta", "gads"], ANS = ["added", "help", "notsure", "none", "someone", "skip"];
function pendingOf(c){
  if(!c) return 0;
  return Object.values(c.items || {}).filter(it => it.at && (!it.adminAt || it.at > it.adminAt)).length + (c.team || []).filter(t => !t.done).length + (c.calls || []).filter(t => !t.done).length;
}
function cleanBrand(x, old){
  const url = normUrl(x.website);
  const b = Object.assign({}, old || {}, { name:str(x.name, 120), website:url ? url.toString() : "", city:str(x.city, 80), service:str(x.service, 60), type:str(x.type, 60), contact:str(x.contact, 120), notes:str(x.notes, 2000), startedAt:str(x.startedAt, 10) || (old && old.startedAt) || new Date().toISOString().slice(0, 10) });
  b.modules = {}; MODS.forEach(m => { if(x.modules && x.modules[m]) b.modules[m] = true; });
  return b;
}
function cleanItem(x, kind){
  const it = { id:str(x.id, 40) || rid(6), at:str(x.at, 30) || new Date().toISOString() };
  if(kind === "work") Object.assign(it, { title:str(x.title, 160), detail:str(x.detail, 1200), module:MODS.includes(x.module) ? x.module : "", status:["done", "doing", "next"].includes(x.status) ? x.status : "done", proof:str(x.proof, 500), date:str(x.date, 10) });
  else Object.assign(it, { text:str(x.text, 200), steps:str(x.steps, 1500), link:str(x.link, 500), due:str(x.due, 10), who:x.who === "us" ? "us" : "you", done:!!x.done, doneAt:x.done ? (str(x.doneAt, 30) || new Date().toISOString()) : "" });
  return it;
}
async function saveList(key, item, del){
  const list = (await getJ(key)) || [];
  const i = list.findIndex(x => x.id === item.id);
  if(del){ if(i >= 0) list.splice(i, 1); } else if(i >= 0) list[i] = Object.assign(list[i], item); else list.unshift(item);
  await setJ(key, list.slice(0, 300)); return list;
}
const publicUser = u => ({ uid:u.uid, name:u.name, email:u.email, role:u.role || "owner", brands:u.brands || [], createdAt:u.createdAt, lastSeen:u.lastSeen || null, revoked:!!u.revoked, link:u.link || null });
const linkUrl = (request, t) => new URL("/portal/in/" + t, request.url).toString();

async function handle(request){
  const u = new URL(request.url), a = u.searchParams.get("a") || "";
  const post = request.method === "POST";
  if(post && !/application\/json/i.test(request.headers.get("content-type") || "")) return bad("Send JSON", 415);
  let q = {}; if(post){ try{ q = await request.json(); }catch(e){ q = {}; } }
  const P = k => q[k] != null ? q[k] : u.searchParams.get(k);

  if(a === "health") return out({ ok:true, storage:!!store(), adminKey:!!process.env.PORTAL_ADMIN_KEY, google:!!process.env.SERPAPI_KEY, speedKey:!!process.env.PAGESPEED_API_KEY, taskKey:(process.env.PORTAL_TASK_KEY || "").length >= 16, taskKeyState:!process.env.PORTAL_TASK_KEY ? "missing" : process.env.PORTAL_TASK_KEY.length < 16 ? "too short (needs 16 or more characters)" : "ok", env:process.env.VERCEL_ENV || "" });
  if(!store()) return bad("Portal storage is not connected yet", 503);

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "x";
  if(a === "login" && post){
    if(!process.env.PORTAL_ADMIN_KEY) return bad("The admin key is not set on this project yet", 503);
    if(await rateLimit("login:" + ip, 8, 900)) return bad("Too many tries. Wait 15 minutes.", 429);
    if(!sameSecret(str(q.key, 300), process.env.PORTAL_ADMIN_KEY)) return bad("That key is not right", 401);
    const t = await newSession({ role:"admin" }, ADMIN_TTL);
    return out({ ok:true, role:"admin" }, 200, { "set-cookie":setCookie(t, ADMIN_TTL) });
  }
  if(a === "open"){
    const t = str(u.searchParams.get("t"), 80);
    if(await rateLimit("open:" + ip, 30, 900)) return go("/portal?link=busy");
    const uid = t.length >= 20 ? await cmd("GET", K.link(t)) : null;
    const user = uid ? await getJ(K.user(uid)) : null;
    if(!user || user.revoked) return go("/portal?link=bad");
    user.lastSeen = new Date().toISOString(); await setJ(K.user(uid), user);
    const s = await newSession({ role:"client", uid, rev:user.rev || 1 }, CLIENT_TTL);
    return go("/portal/app", setCookie(s, CLIENT_TTL));
  }
  const who = await whoIs(request);
  if(a === "logout"){ if(who) await cmd("DEL", K.sess(who.tok)); return out({ ok:true }, 200, { "set-cookie":clearCookie() }); }

  /* The sales team can save a live preview as a new client with the sales code. */
  if(a === "demo-save" && post){
    const codeOk = !!(process.env.PORTAL_DEMO_CODE && str(q.code, 200) === process.env.PORTAL_DEMO_CODE);
    if(!codeOk && !(who && who.role === "admin")) return bad("Sales code needed", 401);
    const d = q.scan; if(!d || !d.ok || !d.input || !Array.isArray(d.findings) || JSON.stringify(d).length > 400000) return bad("Run a preview first");
    const b = cleanBrand({ name:q.name || (d.google && d.google.place && d.google.place.name) || d.input.name, website:d.input.website, city:d.input.city, service:d.input.service, type:q.type, modules:q.modules });
    if(!b.name) return bad("The business needs a name");
    b.id = slug(b.name); b.createdAt = new Date().toISOString(); b.source = "preview";
    await setJ(K.brand(b.id), b); await cmd("SADD", K.brands, b.id); await saveScan(b.id, d);
    return out({ ok:true, id:b.id, admin:!!(who && who.role === "admin") });
  }

  if(!who) return bad("Please sign in", 401);
  const isAdmin = who.role === "admin";
  const mine = id => isAdmin || (who.user.brands || []).includes(id);

  if(a === "me"){
    const brands = isAdmin ? await allBrands() : (await mgetJ((who.user.brands || []).map(K.brand))).filter(Boolean);
    return out({ ok:true, role:who.role, user:isAdmin ? { name:"Manav", admin:true } : { name:who.user.name }, brands:await summaries(brands) });
  }
  if(a === "brand"){
    const id = str(P("id"), 60); if(!mine(id)) return bad("Not found", 404);
    const v = await brandView(id, who.role); return v ? out(Object.assign({ ok:true }, v)) : bad("Not found", 404);
  }
  if(a === "conn-answer" && post){
    const id = str(q.brand, 60), key = str(q.key, 10); if(!mine(id)) return bad("Not found", 404);
    if(!CONN.includes(key) || !ANS.includes(q.answer)) return bad("Choose one of the options");
    const c = (await getJ(K.conn(id))) || { items:{}, team:[] }, old = c.items[key] || {};
    const it = Object.assign({}, old, { answer:q.answer, note:str(q.note, 800), contactName:str(q.contactName, 120), contactEmail:str(q.contactEmail, 200), callWhen:str(q.callWhen, 120), tz:str(q.tz, 60), at:new Date().toISOString(), by:isAdmin ? "Business Santa" : who.user.name });
    if(old.status === "issue" || old.status === "optional") delete it.status;
    it.history = (old.history || []).concat([{ at:it.at, by:it.by, answer:it.answer, note:it.note }]).slice(-20);
    c.items[key] = it; await setJ(K.conn(id), c); return out({ ok:true, conn:c });
  }
  if(a === "team-ask" && post){
    const id = str(q.brand, 60); if(!mine(id)) return bad("Not found", 404);
    const name = str(q.name, 120); if(!name) return bad("Tell us the person's name");
    const c = (await getJ(K.conn(id))) || { items:{}, team:[] };
    c.team = (c.team || []).concat([{ id:rid(6), name, email:str(q.email, 200), role:q.role === "owner" ? "owner" : "team", note:str(q.note, 500), at:new Date().toISOString(), by:isAdmin ? "Business Santa" : who.user.name, done:false }]).slice(-50);
    await setJ(K.conn(id), c); return out({ ok:true, conn:c });
  }
  if(a === "call-ask" && post){
    const id = str(q.brand, 60); if(!mine(id)) return bad("Not found", 404);
    const when = str(q.when, 120); if(!when) return bad("Pick a time that works for you");
    const c = (await getJ(K.conn(id))) || { items:{}, team:[] };
    c.calls = (c.calls || []).concat([{ id:rid(6), when, tz:str(q.tz, 60), topic:str(q.topic, 120), phone:str(q.phone, 40), note:str(q.note, 600), at:new Date().toISOString(), by:isAdmin ? "Business Santa" : who.user.name, done:false }]).slice(-30);
    await setJ(K.conn(id), c); return out({ ok:true, conn:c });
  }
  if(a === "todo-done" && post){
    const id = str(q.brand, 60); if(!mine(id)) return bad("Not found", 404);
    const list = (await getJ(K.todo(id))) || [], it = list.find(x => x.id === q.id);
    if(!it) return bad("Not found", 404); if(!isAdmin && it.who !== "you") return bad("Only Business Santa can tick this one", 403);
    it.done = !!q.done; it.doneAt = it.done ? new Date().toISOString() : ""; it.doneBy = isAdmin ? "Business Santa" : who.user.name;
    await setJ(K.todo(id), list); return out({ ok:true, todo:list });
  }

  if(!isAdmin) return bad("Not allowed", 403);
  if(a === "brand-save" && post){
    const id = str(q.id, 60), old = id ? await getJ(K.brand(id)) : null;
    if(id && !old) return bad("Not found", 404);
    const b = cleanBrand(q, old); if(!b.name) return bad("The business needs a name");
    if(!old){ b.id = slug(b.name); b.createdAt = new Date().toISOString(); }
    await setJ(K.brand(b.id), b); await cmd("SADD", K.brands, b.id);
    return out({ ok:true, brand:b });
  }
  if(a === "brand-delete" && post){
    const id = str(q.id, 60);
    await pipe([["SREM", K.brands, id], ["DEL", K.brand(id), K.scans(id), K.scans(id) + ":c", K.first(id), K.work(id), K.todo(id), K.conn(id)]]);
    const users = (await mgetJ((await cmd("SMEMBERS", K.users)).map(K.user))).filter(Boolean);
    for(const usr of users) if((usr.brands || []).includes(id)){ usr.brands = usr.brands.filter(x => x !== id); await setJ(K.user(usr.uid), usr); }
    return out({ ok:true });
  }
  if(a === "scan" && post){
    const b = await getJ(K.brand(str(q.id, 60))); if(!b) return bad("Not found", 404);
    if(await rateLimit("scan:" + b.id, 6, 3600)) return bad("This business was checked many times this hour. Try later.", 429);
    try{ const d = await scanBrand(b, "admin"); return out({ ok:true, at:d.at, searchesUsed:d.searchesUsed, google:d.google && d.google.status }); }
    catch(e){ return bad("The check did not finish: " + (e.message || e), 502); }
  }
  if((a === "work-save" || a === "work-del" || a === "todo-save" || a === "todo-del") && post){
    const id = str(q.brand, 60); if(!(await getJ(K.brand(id)))) return bad("Not found", 404);
    const kind = a.startsWith("work") ? "work" : "todo", del = a.endsWith("del");
    const item = del ? { id:str(q.item && q.item.id, 40) } : cleanItem(q.item || {}, kind);
    if(!del && kind === "work" && !item.title) return bad("Give it a title");
    if(!del && kind === "todo" && !item.text) return bad("Write the to-do");
    const list = await saveList(kind === "work" ? K.work(id) : K.todo(id), item, del);
    return out({ ok:true, list });
  }
  if(a === "conn-set" && post){
    const id = str(q.brand, 60), key = str(q.key, 10); if(!(await getJ(K.brand(id)))) return bad("Not found", 404);
    const c = (await getJ(K.conn(id))) || { items:{}, team:[] };
    if(q.team || q.call){ const t = (q.team ? c.team || [] : c.calls || []).find(x => x.id === (q.team || q.call)); if(t){ t.done = true; t.doneAt = new Date().toISOString(); t.reply = str(q.adminNote, 400); } }
    else { if(!CONN.includes(key)) return bad("Unknown account");
      const it = c.items[key] || {}, st = str(q.status, 12);
      if(["connected", "issue", "optional"].includes(st)) it.status = st; else delete it.status;
      it.adminNote = str(q.adminNote, 800); it.adminAt = new Date().toISOString(); c.items[key] = it; }
    await setJ(K.conn(id), c); return out({ ok:true, conn:c });
  }
  if(a === "users"){
    const users = (await mgetJ((await cmd("SMEMBERS", K.users)).map(K.user))).filter(Boolean).map(publicUser);
    users.forEach(x => { if(x.link) x.url = linkUrl(request, x.link); });
    return out({ ok:true, users });
  }
  if(a === "user-save" && post){
    const uid = str(q.uid, 40), old = uid ? await getJ(K.user(uid)) : null; if(uid && !old) return bad("Not found", 404);
    const ids = new Set(await cmd("SMEMBERS", K.brands));
    const usr = Object.assign({}, old || { uid:rid(8), createdAt:new Date().toISOString(), rev:1 }, { name:str(q.name, 120), email:str(q.email, 200), role:q.role === "team" ? "team" : "owner", brands:(Array.isArray(q.brands) ? q.brands : []).map(x => str(x, 60)).filter(x => ids.has(x)) });
    if(!usr.name) return bad("Give the person's name");
    await setJ(K.user(usr.uid), usr); await cmd("SADD", K.users, usr.uid);
    return out({ ok:true, user:publicUser(usr) });
  }
  if(a === "link-new" && post){
    const usr = await getJ(K.user(str(q.uid, 40))); if(!usr) return bad("Not found", 404);
    const t = rid(24), ops = [["SET", K.link(t), usr.uid]]; if(usr.link) ops.push(["DEL", K.link(usr.link)]);
    usr.link = t; usr.revoked = false; usr.rev = (usr.rev || 1) + 1; ops.push(["SET", K.user(usr.uid), JSON.stringify(usr)]);
    await pipe(ops); return out({ ok:true, url:linkUrl(request, t) });
  }
  if(a === "user-revoke" && post){
    const usr = await getJ(K.user(str(q.uid, 40))); if(!usr) return bad("Not found", 404);
    const ops = []; if(usr.link) ops.push(["DEL", K.link(usr.link)]);
    usr.link = null; usr.revoked = true; usr.rev = (usr.rev || 1) + 1; ops.push(["SET", K.user(usr.uid), JSON.stringify(usr)]);
    await pipe(ops); return out({ ok:true });
  }
  if(a === "user-delete" && post){
    const usr = await getJ(K.user(str(q.uid, 40))); if(!usr) return bad("Not found", 404);
    await pipe([usr.link ? ["DEL", K.link(usr.link), K.user(usr.uid)] : ["DEL", K.user(usr.uid)], ["SREM", K.users, usr.uid]]);
    return out({ ok:true });
  }
  if(a === "usage"){
    const [serp, ours, up] = await Promise.all([serpAccount().catch(e => ({ error:String(e.message || e) })), cmd("HGETALL", K.usage("serpapi", ym())), cmd("HGETALL", K.usage("upstash", ym()))]);
    const hash = a => { const o = {}; for(let i = 0; i < (a || []).length; i += 2) o[a[i]] = +a[i + 1]; return o; };
    return out({ ok:true, month:ym(), serpapi:serp, portalSearches:hash(ours), storage:hash(up), storageLimit:500000, floor:SERP_FLOOR });
  }
  return bad("Unknown request", 404);
}
export async function GET(request){ try{ return await handle(request); }catch(e){ return bad("Something went wrong: " + (e.message || e), 500); } }
export async function POST(request){ try{ return await handle(request); }catch(e){ return bad("Something went wrong: " + (e.message || e), 500); } }
