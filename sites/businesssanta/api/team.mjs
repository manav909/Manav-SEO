/* Team order desk API (businesssanta.com/team): hired orders from sales to delivery, with gates that stop the usual mistakes.
   Access gate (work starts only when every access item is received at the right level), proof gate (QA only gets work with
   a proof link per deliverable), QA gate (delivery only after QA passes). Every order carries its own scorecard and economy.
   Manav signs in with his admin session; team members sign in with a personal code he creates. */
import crypto from "node:crypto";
import { store, cmd, pipe, getJ, setJ, mgetJ, rid, cookieOf, setCookie, clearCookie, rateLimit, P } from "./_lib/store.mjs";
import { GIGS } from "./_lib/gigs.mjs";
import { ACCESS, siteCheck, aiOn, askAI, orderPrompt, leadPrompt, replyPrompt, formatPrompt, redact, checkLink, proofCheck, intakePrompt, rethinkPrompt } from "./_lib/orderai.mjs";
import { isDrive, driveMeta, driveRead } from "./_lib/drive.mjs";
import { verifyOrder, verifyText } from "./_lib/verify.mjs";

const T = { people:P + "tm:people", code:h => P + "tm:code:" + h, cfg:P + "tm:cfg", ord:id => P + "ord:" + id, ords:P + "ords", seq:P + "ordseq", leads:P + "tm:leads", sess:t => P + "sess:" + t };
const TTL = 60 * 60 * 24 * 14;
const ROLES = ["sales", "comms", "pm", "qa", "manager"];
const CAN = { create:["sales"], lead:["sales"], comms:["comms"], pm:["pm"], qa:["qa"], assign:["manager"], admin:[] };
const can = (w, what) => w.role === "admin" || w.role === "manager" && what !== "admin" || (CAN[what] || []).includes(w.role);
const H = { "content-type":"application/json", "cache-control":"no-store" };
const out = (d, s, h) => new Response(JSON.stringify(d), { status:s || 200, headers:Object.assign({}, H, h || {}) });
const bad = (m, s) => out({ ok:false, error:m }, s || 400);
const str = (v, n) => String(v == null ? "" : v).replace(/\u0000/g, "").trim().slice(0, n || 200);
const num = (v, d) => { const x = Number(v); return isFinite(x) ? x : d; };
const now = () => new Date().toISOString();
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const DEF = { fee:20, hourly:8 };
const cfgOf = async () => Object.assign({}, DEF, await getJ(T.cfg) || {});

async function who(request){
  const t = cookieOf(request); if(!t) return null;
  const s = await getJ(T.sess(t)); if(!s) return null;
  if(s.role === "admin") return { role:"admin", uid:"manav", name:"Manav", tok:t };
  if(s.role !== "team") return null;
  const raw = await cmd("HGET", T.people, s.uid); const p = raw ? JSON.parse(raw) : null;
  if(!p || p.off || (p.rev || 1) !== (s.rev || 1)) return null;
  return { role:p.role, uid:p.id, name:p.name, tok:t };
}
async function people(){ const h = await cmd("HGETALL", T.people); const o = []; for(let i = 0; i < h.length; i += 2) o.push(JSON.parse(h[i + 1])); return o.sort((a, b) => a.name.localeCompare(b.name)); }

/* Order helpers */
const gigOf = id => GIGS.find(g => g.id === id);
const nid = p => p + crypto.randomBytes(3).toString("hex");
function econ(o, cfg){
  const price = num(o.price, 0), fee = price * (o.fee != null ? o.fee : cfg.fee) / 100, hrs = (o.hours || []).reduce((s, h) => s + num(h.h, 0), 0);
  const team = hrs * cfg.hourly, ai = num(o.aiUsd, 0), net = price - fee - team - ai;
  const planH = o.ai && o.ai.price ? num(o.ai.price.hours, 0) : 0, planNet = price - fee - planH * cfg.hourly - ai;
  return { price, fee:+fee.toFixed(2), hours:+hrs.toFixed(2), team:+team.toFixed(2), ai:+ai.toFixed(3), net:+net.toFixed(2), margin:price ? Math.round(net / price * 100) : 0,
    planHours:planH, planNet:+planNet.toFixed(2), planMargin:price ? Math.round(planNet / price * 100) : 0 };
}
function flags(o){
  const f = [], left = Date.parse(o.deadline + "T23:59:00") - Date.now(), open = !["delivered", "done", "cancelled"].includes(o.stage);
  if(open && left < 0) f.push({ k:"bad", t:"Late" });
  else if(open && left < 864e5 && ["access", "work"].includes(o.stage)) f.push({ k:"bad", t:"Due within 24 hours" });
  else if(open && left < 2 * 864e5 && o.stage === "access") f.push({ k:"warn", t:"Due soon, access still missing" });
  if(o.stage === "access" && Date.now() - Date.parse(o.at) > 864e5) f.push({ k:"warn", t:"Waiting for access over a day" });
  const q = (o.queue || []).filter(x => !x.sent).length; if(q) f.push({ k:"y", t:q + " message" + (q > 1 ? "s" : "") + " to send" });
  const r = (o.queue || []).filter(x => x.reply && !x.seen).length; if(r) f.push({ k:"y", t:"New client reply" });
  if(o.alert) f.push({ k:"bad", t:o.alert });
  if(open){ const last = Date.parse(o.lastUpdateAt || o.at), hrs = (Date.now() - last) / 36e5; if(hrs > 24) f.push({ k:"bad", t:"No update for " + Math.round(hrs) + " h: paste the latest messages" }); else if(hrs > 8) f.push({ k:"warn", t:"Last update " + Math.round(hrs) + " h ago" }); }
  const bl = (o.actions || []).filter(a => a.status === "blocked").length; if(bl) f.push({ k:"bad", t:bl + " action" + (bl > 1 ? "s" : "") + " blocked" });
  const hr = ((o.ai || {}).risks || []).filter(r => r.level === "high" && /open|happened/.test(r.status || "open")).length; if(open && hr) f.push({ k:"warn", t:hr + " high risk" + (hr > 1 ? "s" : "") + " open" });
  const today = new Date().toISOString().slice(0, 10);
  if(open && o.ai && Array.isArray(o.ai.promises)) o.ai.promises.filter(p => p.by && !/kept/i.test(p.status || "") && p.by <= today).slice(0, 2)
    .forEach(p => f.push({ k:"bad", t:(p.by < today ? "Promise overdue: " : "Promised for today: ") + String(p.what).slice(0, 70) }));
  return f;
}
const summary = (o, cfg) => ({ id:o.id, at:o.at, client:o.client, gig:o.gig, gigName:(gigOf(o.gig) || {}).name || "", pkg:o.pkg, price:o.price, deadline:o.deadline, stage:o.stage,
  pm:o.pm, qa:o.qa, by:o.by, byName:o.byName, revisions:(o.revisions || []).length, accessLeft:(o.access || []).filter(a => !["received", "skip"].includes(a.status)).length,
  flags:flags(o), econ:econ(o, cfg), verdict:o.ai && o.ai.price ? o.ai.price.verdict : "" });
const log = (o, w, what) => { (o.timeline = o.timeline || []).unshift({ at:now(), who:w.name, what }); o.timeline = o.timeline.slice(0, 300); };
const saveO = o => setJ(T.ord(o.id), o);
async function loadAll(n){ const ids = await cmd("ZREVRANGE", T.ords, 0, (n || 300) - 1); return (await mgetJ(ids.map(T.ord))).filter(Boolean); }

async function analyse(o, cfg){
  const gig = gigOf(o.gig);
  if(!o.site || !o.site.at){ o.site = await siteCheck(o.client.website); if(o.site) o.site.at = now(); }
  if(!aiOn()) return { ok:false, why:"AI helpers are off until the API key is added in Vercel" };
  const p = orderPrompt(o, gig, o.site, cfg);
  const r = await askAI("order", "claude-sonnet-5-5", p.system, p.user, 32000);
  const d = r.data || {};
  o.ai = Object.assign(d, { at:now(), model:r.model, usd:+r.usd.toFixed(4) });
  o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  // Merge AI access and deliverables into the live checklists without losing anything already ticked
  if(Array.isArray(d.access) && d.access.length){
    const have = new Map((o.access || []).map(a => [a.item.toLowerCase(), a]));
    o.access = d.access.slice(0, 15).map(a => { const old = have.get(String(a.item).toLowerCase()); return old ? Object.assign(old, { level:str(a.level, 200) || old.level, why:str(a.why, 200) || old.why })
      : { id:nid("a"), item:str(a.item, 120), level:str(a.level, 200), why:str(a.why, 200), status:"needed" }; });
    d.access.forEach((a, i) => { const x = o.access[i]; if(x && /received/i.test(a.status || "") && x.status !== "wrong"){ x.status = "received"; x.note = x.note || ("From the chat: " + str(a.evidence, 200)); x.by = x.by || "Order desk"; } });
    for(const a of have.values()) if(["received", "skip"].includes(a.status) && !o.access.includes(a)) o.access.push(a);
  }
  if(Array.isArray(d.deliverables) && d.deliverables.length && !(o.deliverables || []).some(x => x.done || x.proof))
    o.deliverables = d.deliverables.slice(0, 25).map(t => ({ id:nid("d"), text:str(t, 300), done:false, proof:"", qa:"" }));
  if(Array.isArray(d.actions)) mergeActions(o, d.actions, true);
  if(d.msgs && !(o.queue || []).some(q => q.auto)){
    o.queue = o.queue || [];
    if(d.msgs.access) o.queue.push({ id:nid("q"), auto:true, kind:"access", text:str(d.msgs.access, 4000), at:now(), by:"Order desk", sent:false });
    if(d.msgs.questions) o.queue.push({ id:nid("q"), auto:true, kind:"question", text:str(d.msgs.questions, 4000), at:now(), by:"Order desk", sent:false });
  }
  if(o.stage === "access" && o.access.length && o.access.every(y => ["received", "skip"].includes(y.status))){ o.stage = "work"; log(o, { name:"Order desk" }, "The chat shows all access is already in. Work can start."); }
  return { ok:true, usd:r.usd };
}

async function formatConvo(o){
  if(!aiOn() || !o.chat) return { ok:false };
  const p = formatPrompt(o.chat), r = await askAI("format", "claude-haiku-5-5", p.system, p.user, 32000);
  const m = Array.isArray(r.data.messages) ? r.data.messages : [];
  if(!m.length) throw new Error("The conversation could not be laid out, the original paste is still there");
  o.convo = { at:now(), client:str(r.data.client, 80), us:str(r.data.us, 80), usd:+r.usd.toFixed(4),
    messages:m.slice(0, 2000).map(x => ({ who:x.who === "us" ? "us" : "client", name:str(x.name, 80), time:str(x.time, 60), text:String(x.text || "").slice(0, 20000), files:(Array.isArray(x.files) ? x.files : []).slice(0, 10).map(f => str(f, 120)) })) };
  o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  return { ok:true };
}

/* Proof of work: Drive links (read with the portal's Google sign-in) and live links, checked by the order desk before QA */
const proofsOf = d => d.proofs || (d.proof ? [{ id:"p0", kind:"link", url:d.proof }] : []);
const trimMeta = m => Object.assign({}, m, { history:m.history ? { versions:(m.history.versions || []).slice(-60), activity:(m.history.activity || []).slice(0, 60), versionsError:m.history.versionsError, activityError:m.history.activityError } : null });
function histText(m){
  const h = m.history || {}, v = h.versions || [], a = h.activity || [];
  return `Drive history of "${m.name}": created ${m.created || "?"} (owner ${m.owner || "?"}), last changed ${m.modified || "?"} by ${m.lastBy || "?"}, ${v.length} saved versions` +
    (v.length ? ` from ${v[0].at} to ${v[v.length - 1].at}; editors: ${[...new Set(v.map(x => x.by).filter(Boolean))].join(", ")}` : "") +
    (a.length ? `. Activity (newest first): ` + a.slice(0, 25).map(x => `${x.at} ${x.what}`).join("; ") : "");
}
async function runProofCheck(o, d){
  if(!aiOn()) return;
  const items = [];
  for(const p of proofsOf(d)){
    if(p.kind === "drive" && p.meta){ const fresh = await driveMeta(p.url); if(fresh.ok) p.meta = trimMeta(fresh);
      (await driveRead(p.meta)).forEach(x => items.push(x)); items.push({ kind:"file", name:p.meta.name + " (history)", note:histText(p.meta) }); }
    else items.push({ kind:"link", url:p.url, check:p.check || await checkLink(p.url) });
  }
  const timing = `Order created ${o.at}. Deadline ${o.deadline}. Today ${now()}.` + ((o.qaRounds || []).length ? " QA rounds: " + o.qaRounds.map(q => q.at + " " + q.result).join("; ") : "");
  if(o.verify) items.unshift({ kind:"file", name:"Live verification at the source", note:verifyText(o.verify) + "\nUse this to judge claims in the proof. Work done by us but not yet shown by Google is fine if the proof says so honestly; claiming Google already shows it when it does not is a red flag." });
  items.unshift({ kind:"file", name:"Order timing", note:timing + " Flag work that was made in a rush just before delivery, edited after QA passed, or made by someone outside the order." });
  const r = await proofCheck(o, d, items);
  d.check = Object.assign(r.data || {}, { at:now(), usd:+r.usd.toFixed(4) });
  o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
}

/* Actions: every risk, remark and open promise turned into a step with an owner, a status and a ready message */
const ASTAT = ["open", "sent", "waiting", "done", "blocked"];
function mergeActions(o, list, fresh){
  o.actions = o.actions || [];
  for(const x of (list || []).slice(0, 40)){
    const cur = x.id && o.actions.find(a => a.id === x.id);
    if(cur){
      cur.title = str(x.title, 200) || cur.title; cur.message = x.message != null ? String(x.message).slice(0, 4000) : cur.message; cur.severity = x.severity || cur.severity;
      const st = ASTAT.includes(x.status) ? x.status : cur.status;
      if(cur.status !== "done" && st !== cur.status && (cur.by === "Order desk" || st === "done" || !cur.by)){ cur.status = st; cur.statusWhy = str(x.statusWhy, 300); cur.at = now(); cur.by = "Order desk"; }
    } else if(fresh || !x.id){
      if(o.actions.some(a => a.title.toLowerCase() === String(x.title || "").toLowerCase())) continue;
      o.actions.push({ id:nid("x"), title:str(x.title, 200), why:str(x.why, 300), owner:["comms", "pm", "qa", "manager"].includes(x.owner) ? x.owner : "comms", type:["client", "internal", "task"].includes(x.type) ? x.type : "task",
        to:str(x.to, 60), severity:["high", "medium", "low"].includes(x.severity) ? x.severity : "medium", message:String(x.message || "").slice(0, 4000), status:ASTAT.includes(x.status) ? x.status : "open", statusWhy:str(x.statusWhy, 300), at:now(), by:"Order desk" });
    }
  }
}
const norm = t => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 400);
async function intake(o, raw, w){
  const p = intakePrompt(raw), r = await askAI("intake", "claude-haiku-5-5", p.system, p.user, 32000); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  const d = r.data || {}, kind = ["chat", "call", "team", "media", "note"].includes(d.kind) ? d.kind : "note"; let fresh = "", added = 0;
  if(kind === "chat"){
    o.convo = o.convo || { at:now(), client:o.client.name, us:"", messages:[] };
    const have = o.convo.messages.map(m => norm(m.text));
    for(const m of (d.messages || [])){
      const n = norm(m.text); if(!n) continue;
      if(have.some(h => h === n || (n.length > 30 && (h.includes(n) || n.includes(h))))) continue;
      const msg = { who:m.who === "us" ? "us" : "client", name:str(m.name, 80), time:str(m.time, 60), text:String(m.text || "").slice(0, 20000), files:(m.files || []).slice(0, 10).map(f => str(f, 160)), added:now(), addedBy:w.name };
      o.convo.messages.push(msg); have.push(n); added++; fresh += `${msg.who === "us" ? "US" : "CLIENT"} ${msg.time}: ${msg.text}\n`;
    }
    o.chat = (o.chat || "") + "\n\n" + raw;
  } else {
    const n = d.note || {}; o.notes = o.notes || [];
    o.notes.push({ id:nid("n"), kind, title:str(n.title, 120) || { call:"Call notes", team:"Team update", media:"Files shared", note:"Note" }[kind], text:String(n.text || raw).slice(0, 20000), from:str(n.from, 80), files:(d.files || []).slice(0, 20).map(f => str(f, 300)), at:now(), by:w.name });
    added = 1; fresh = `${kind.toUpperCase()} (${n.from || w.name}): ${n.title || ""}\n${n.text || raw}`;
  }
  return { kind, added, fresh };
}
async function rethink(o, fresh){
  const p = rethinkPrompt(o, fresh), r = await askAI("rethink", "claude-sonnet-5-5", p.system, p.user, 16000); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  const d = r.data || {}; o.ai = o.ai || {};
  ["promises", "risks", "done", "askNext"].forEach(k => { if(Array.isArray(d[k])) o.ai[k] = d[k]; });
  if(d.next) o.ai.next = d.next; if(d.health) o.ai.health = d.health; if(d.mood) o.ai.mood = d.mood; o.ai.changed = d.changed || ""; o.ai.rethinkAt = now();
  if(d.scopeChange) o.alert = "Client asked for something new: " + str(d.scopeChange, 140);
  if(Array.isArray(d.actions)) mergeActions(o, d.actions, false);
  return d;
}

function score(orders, cfg, month){
  const inM = orders.filter(o => o.at.slice(0, 7) === month && o.stage !== "cancelled");
  const deliv = orders.filter(o => o.deliveredAt && o.deliveredAt.slice(0, 7) === month);
  const pct = (a, b) => b ? Math.round(a / b * 100) : null;
  const onTime = deliv.filter(o => o.deliveredAt.slice(0, 10) <= o.deadline).length;
  const ftr = deliv.filter(o => !(o.revisions || []).some(r => r.ours) && !(o.qaRounds || []).some(q => q.result === "fail")).length;
  const clientRight = deliv.filter(o => !(o.revisions || []).some(r => r.ours)).length;
  const qa1 = deliv.filter(o => (o.qaRounds || [])[o.qaRounds.length - 1] && o.qaRounds[o.qaRounds.length - 1].result === "pass" && o.qaRounds.length === 1).length;
  const rated = orders.filter(o => o.rating && o.closedAt && o.closedAt.slice(0, 7) === month), closed = orders.filter(o => o.stage === "done" && o.closedAt && o.closedAt.slice(0, 7) === month);
  const ec = deliv.map(o => econ(o, cfg)), sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
  const reasons = {}; orders.forEach(o => (o.revisions || []).filter(r => r.at.slice(0, 7) === month).forEach(r => { reasons[r.reason] = (reasons[r.reason] || 0) + 1; }));
  orders.forEach(o => (o.qaRounds || []).filter(q => q.result === "fail" && q.at.slice(0, 7) === month).forEach(() => { reasons["Caught by QA"] = (reasons["Caught by QA"] || 0) + 1; }));
  const byPm = {}; deliv.forEach(o => { const k = o.pmName || "Not assigned"; const x = byPm[k] = byPm[k] || { orders:0, revisions:0, qaFails:0, late:0 };
    x.orders++; x.revisions += (o.revisions || []).filter(r => r.ours).length; x.qaFails += (o.qaRounds || []).filter(q => q.result === "fail").length; if(o.deliveredAt.slice(0, 10) > o.deadline) x.late++; });
  const bySales = {}; inM.forEach(o => { const k = o.byName || "?"; const x = bySales[k] = bySales[k] || { orders:0, value:0, under:0 }; x.orders++; x.value += num(o.price, 0); if(/under/i.test(o.ai && o.ai.price ? o.ai.price.verdict : "")) x.under++; });
  return { month, orders:inM.length, value:sum(inM.map(o => ({ v:num(o.price, 0) })), "v"), delivered:deliv.length, onTime:pct(onTime, deliv.length), firstTimeRight:pct(ftr, deliv.length), clientRight:pct(clientRight, deliv.length),
    qaFirstPass:pct(qa1, deliv.length), revisions:orders.reduce((s, o) => s + (o.revisions || []).filter(r => r.at.slice(0, 7) === month).length, 0),
    rating:rated.length ? +(rated.reduce((s, o) => s + o.rating, 0) / rated.length).toFixed(2) : null, retained:pct(closed.filter(o => o.repeat || o.retainer).length, closed.length),
    net:+sum(ec, "net").toFixed(2), netPerOrder:ec.length ? +(sum(ec, "net") / ec.length).toFixed(2) : null, margin:ec.length ? Math.round(sum(ec, "net") / Math.max(1, sum(ec, "price")) * 100) : null,
    aiPerOrder:inM.length ? +(inM.reduce((s, o) => s + num(o.aiUsd, 0), 0) / inM.length).toFixed(3) : null, reasons, byPm, bySales };
}

async function handle(request){
  if(!store()) return bad("Storage is not connected", 503);
  const url = new URL(request.url), a = url.searchParams.get("a") || "me";
  let q = {}; if(request.method === "POST"){ q = await request.json().catch(() => ({})); }
  const ip = request.headers.get("x-forwarded-for") || "x";

  if(a === "login"){
    if(await rateLimit("tmlogin:" + ip.split(",")[0], 10, 900)) return bad("Too many tries. Wait 15 minutes.", 429);
    const code = str(q.code, 60).replace(/\s+/g, "").toUpperCase(); if(code.length < 8) return bad("Type your full sign-in code");
    const uid = await cmd("GET", T.code(sha(code))); if(!uid) return bad("That code is not right", 401);
    const raw = await cmd("HGET", T.people, uid); const p = raw ? JSON.parse(raw) : null; if(!p || p.off) return bad("This sign-in is switched off. Ask Manav.", 401);
    const t = rid(32); await setJ(T.sess(t), { role:"team", uid, rev:p.rev || 1, at:now() }, TTL);
    return out({ ok:true }, 200, { "set-cookie":setCookie(t, TTL) });
  }
  const w = await who(request);
  if(a === "logout"){ if(w) await cmd("DEL", T.sess(w.tok)); return out({ ok:true }, 200, { "set-cookie":clearCookie() }); }
  if(!w) return out({ ok:false, signin:true }, 401);
  const cfg = await cfgOf();

  if(a === "me") return out({ ok:true, me:{ name:w.name, role:w.role, uid:w.uid }, ai:aiOn(), accessEmail:"manavs909@gmail.com", cfg, gigs:GIGS, roles:ROLES,
    people:(await people()).filter(p => !p.off).map(p => ({ id:p.id, name:p.name, role:p.role })), access:ACCESS });

  if(a === "list"){ const all = await loadAll(); return out({ ok:true, orders:all.map(o => summary(o, cfg)) }); }
  if(a === "order"){ const o = await getJ(T.ord(str(url.searchParams.get("id"), 20))); if(!o) return bad("Order not found", 404); return out({ ok:true, order:o, econ:econ(o, cfg), flags:flags(o) }); }

  if(a === "queue"){ const all = await loadAll(); const items = [];
    all.filter(o => !['done', 'cancelled'].includes(o.stage)).forEach(o => (o.queue || []).forEach(x => { if(!x.sent || (x.reply && !x.seen)) items.push(Object.assign({ order:o.id, client:o.client.name, stage:o.stage }, x)); }));
    return out({ ok:true, items:items.sort((x, y) => x.at.localeCompare(y.at)) }); }

  if(a === "score"){ if(!can(w, "assign")) return bad("Only Manav and managers see the scorecard", 403);
    const m = str(url.searchParams.get("m"), 7) || now().slice(0, 7), all = await loadAll(1000);
    const ai = await cmd("HGETALL", "bsp:ai:" + m); const aiu = {}; for(let i = 0; i < ai.length; i += 2) aiu[ai[i]] = Number(ai[i + 1]);
    return out({ ok:true, score:score(all, cfg, m), ai:{ calls:aiu.calls || 0, usd:+((aiu.micro || 0) / 1e6).toFixed(3), order:+((aiu["micro:order"] || 0) / 1e6).toFixed(3),
      lead:+((aiu["micro:lead"] || 0) / 1e6).toFixed(3), format:+((aiu["micro:format"] || 0) / 1e6).toFixed(3), reply:+((aiu["micro:reply"] || 0) / 1e6).toFixed(3), credit:200 } }); }

  if(a === "leads"){ const l = (await cmd("LRANGE", T.leads, 0, 99)).map(x => JSON.parse(x)); return out({ ok:true, leads:w.role === "admin" || w.role === "manager" ? l : l.filter(x => x.by === w.uid) }); }
  if(a === "lead"){ if(!can(w, "lead")) return bad("Lead help is for sales", 403);
    if(!aiOn()) return bad("AI helpers are off until the API key is added in Vercel", 503);
    if(await rateLimit("tmlead:" + w.uid, 40, 3600)) return bad("Too many lead checks this hour", 429);
    const chat = redact(str(q.chat, 50000)); if(chat.length < 40) return bad("Paste the whole chat first");
    const p = leadPrompt(chat, GIGS, str(q.note, 1000)); const r = await askAI("lead", "claude-sonnet-5-5", p.system, p.user, 4000);
    const item = { id:nid("L"), at:now(), by:w.uid, byName:w.name, title:str(q.title, 80) || "Lead", note:str(q.note, 1000), chat:chat.slice(0, 8000), result:r.data, usd:+r.usd.toFixed(4) };
    await pipe([["LPUSH", T.leads, JSON.stringify(item)], ["LTRIM", T.leads, 0, 299]]);
    return out({ ok:true, lead:item }); }

  if(a === "create"){ if(!can(w, "create")) return bad("Only sales can create orders", 403);
    const gig = gigOf(str(q.gig, 8)); if(!gig) return bad("Pick the gig");
    const pkg = ["basic", "standard", "premium", "custom"].includes(q.pkg) ? q.pkg : "standard";
    const price = num(q.price, 0); if(price <= 0) return bad("Type the price the client paid");
    const deadline = str(q.deadline, 10); if(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return bad("Pick the deadline");
    const chat = redact(str(q.chat, 80000)); if(chat.length < 40) return bad("Paste the whole client chat. The order desk works from it.");
    const n = await cmd("INCR", T.seq), id = "O-" + (1000 + Number(n));
    const o = { id, at:now(), by:w.uid, byName:w.name, gig:gig.id, pkg, price, extras:str(q.extras, 500), deadline, chat, calls:redact(str(q.calls, 20000)), remarks:redact(str(q.remarks, 4000)),
      client:{ name:str(q.client, 80), country:str(q.country, 40), website:str(q.website, 200) }, stage:"access", fee:cfg.fee,
      access:(ACCESS[gig.cat] || []).map(x => Object.assign({ id:nid("a"), status:"needed" }, x)),
      deliverables:[{ id:nid("d"), text:(gig.packages[pkg] || {}).what || gig.name, done:false, proof:"", qa:"" }], queue:[], hours:[], revisions:[], qaRounds:[], timeline:[] };
    log(o, w, "Order created: " + gig.name + " (" + pkg + ") for $" + price);
    let ai = null;
    const [an, fm] = await Promise.allSettled([analyse(o, cfg), formatConvo(o)]);
    if(an.status === "fulfilled"){ ai = an.value; if(ai.ok) log(o, { name:"Order desk" }, "Brief, access list, client profile and price check ready"); } else ai = { ok:false, why:an.reason.message };
    if(!ai.ok && ai.why) log(o, { name:"Order desk" }, "Brief not made: " + ai.why);
    if(fm.status === "fulfilled" && fm.value.ok) log(o, { name:"Order desk" }, "Client conversation laid out (" + o.convo.messages.length + " messages)");
    await pipe([["SET", T.ord(id), JSON.stringify(o)], ["ZADD", T.ords, Date.now(), id]]);
    return out({ ok:true, id, ai }); }

  if(a === "person" || a === "personOff" || a === "newCode" || a === "cfg"){
    if(w.role !== "admin") return bad("Only Manav can change people and settings", 403);
    if(a === "cfg"){ const c = { fee:Math.min(50, Math.max(0, num(q.fee, cfg.fee))), hourly:Math.min(200, Math.max(0, num(q.hourly, cfg.hourly))) }; await setJ(T.cfg, c); return out({ ok:true, cfg:c }); }
    let p;
    if(a === "person"){ const role = ROLES.includes(q.role) ? q.role : ""; const name = str(q.name, 60); if(!name || !role) return bad("Type the name and pick the role"); p = { id:nid("u"), name, role, rev:1, at:now() }; }
    else { const raw = await cmd("HGET", T.people, str(q.uid, 20)); p = raw ? JSON.parse(raw) : null; if(!p) return bad("Person not found", 404); }
    if(a === "personOff"){ p.off = !p.off; p.rev = (p.rev || 1) + 1; await cmd("HSET", T.people, p.id, JSON.stringify(p)); return out({ ok:true }); }
    if(p.codeHash) await cmd("DEL", T.code(p.codeHash));
    const code = crypto.randomBytes(8).toString("base64").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 10).padEnd(10, "7");
    p.codeHash = sha(code); p.rev = (p.rev || 1) + (a === "newCode" ? 1 : 0);
    await pipe([["HSET", T.people, p.id, JSON.stringify(p)], ["SET", T.code(p.codeHash), p.id]]);
    return out({ ok:true, id:p.id, code }); }
  if(a === "people"){ if(w.role !== "admin") return bad("Only Manav", 403); return out({ ok:true, people:(await people()).map(p => ({ id:p.id, name:p.name, role:p.role, off:!!p.off, at:p.at })) }); }

  if(a === "do"){
    const o = await getJ(T.ord(str(q.id, 20))); if(!o) return bad("Order not found", 404);
    const op = str(q.op, 20), find = (list, id) => (o[list] || []).find(x => x.id === id);
    const need = what => { if(!can(w, what)) throw new Error("Your role cannot do this step"); };
    if(op === "analyse"){ need("pm"); if(!o.site || o.site.error || Date.now() - Date.parse(o.site.at || 0) > 7 * 864e5) o.site = null; o.chat = redact(o.chat); o.calls = redact(o.calls); const r = await analyse(o, cfg); if(!r.ok) return bad(r.why, 503); log(o, w, "Order desk ran again"); }
    else if(op === "site"){ need("pm"); o.site = await siteCheck(o.client.website); if(o.site) o.site.at = now(); log(o, w, "Website checked again" + (o.site && o.site.error ? ": did not open" : "")); }
    else if(op === "format"){ await formatConvo(o); log(o, w, "Client conversation laid out again"); }
    else if(op === "access"){ need("pm"); const x = find("access", q.aid); if(!x) return bad("Not found");
      x.status = ["needed", "asked", "received", "wrong", "skip"].includes(q.status) ? q.status : x.status; x.note = str(q.note, 300); x.by = w.name; x.atS = now();
      log(o, w, "Access " + x.item + ": " + x.status + (x.note ? " (" + x.note + ")" : ""));
      if(o.stage === "access" && o.access.every(y => ["received", "skip"].includes(y.status))){ o.stage = "work"; log(o, { name:"Order desk" }, "All access received at the right level. Work can start."); } }
    else if(op === "addAccess"){ need("pm"); o.access.push({ id:nid("a"), item:str(q.item, 120), level:str(q.level, 200), why:str(q.why, 200), status:"needed" }); log(o, w, "Added access item " + str(q.item, 120)); }
    else if(op === "startAnyway"){ need("assign"); const why = str(q.why, 300); if(!why) return bad("Write why work starts before all access is in"); o.stage = "work"; log(o, w, "Started before all access was in: " + why); }
    else if(op === "deliv"){ need("pm"); const x = find("deliverables", q.did); if(!x) return bad("Not found");
      if(q.text != null) x.text = str(q.text, 300);
      if(q.done != null){ if(q.done && !proofsOf(x).length) return bad("Add the proof first: a Google Drive link or a live link"); x.done = !!q.done;
        if(x.done){ try{ await runProofCheck(o, x); }catch(e){ x.check = { verdict:"", summary:"The order desk could not check this proof: " + e.message, at:now() }; } } }
      log(o, w, (x.done ? "Done: " : "Updated: ") + x.text + (x.check && x.check.verdict ? " (order desk check: " + x.check.verdict + ")" : "")); }
    else if(op === "proofAdd"){ need("pm"); const x = find("deliverables", q.did); if(!x) return bad("Not found"); const url = str(q.url, 600); if(!/^https?:\/\/\S+$/i.test(url)) return bad("Paste the full link, starting with https://");
      let p;
      if(isDrive(url)){ const m = await driveMeta(url); if(!m.ok) return bad(m.error || "This Drive link cannot be opened"); p = { id:nid("p"), kind:"drive", url, name:m.name, meta:trimMeta(m), at:now(), by:w.name }; }
      else { const c = await checkLink(url); if(!c.ok) return bad(c.private ? "This link needs a login, so QA and the client cannot open it. Share it publicly or put the file in Drive." : "This link does not open: " + (c.error || "status " + c.status)); p = { id:nid("p"), kind:"link", url, name:c.title || url, check:{ status:c.status, ok:c.ok, title:c.title, final:c.final }, at:now(), by:w.name }; }
      x.proofs = proofsOf(x).concat(p); delete x.proof; if(x.done) x.check = null;
      log(o, w, "Proof added to \"" + x.text.slice(0, 60) + "\": " + p.name); }
    else if(op === "proofDel"){ need("pm"); const x = find("deliverables", q.did); if(!x) return bad("Not found"); x.proofs = proofsOf(x).filter(p => p.id !== q.pid); delete x.proof; x.done = x.done && x.proofs.length > 0; x.check = null; log(o, w, "Proof removed from \"" + x.text.slice(0, 60) + "\""); }
    else if(op === "update"){ if(!can(w, "comms") && !can(w, "pm")) return bad("Your role cannot do this step"); if(!aiOn()) return bad("The AI helpers are off", 503);
      const raw = redact(str(q.text, 90000)); if(raw.length < 3) return bad("Paste something first");
      const k = await intake(o, raw, w); o.lastUpdateAt = now(); o.lastUpdateBy = w.name;
      if(!k.added){ log(o, w, "Pasted the conversation again: nothing new found"); await saveO(o); return out({ ok:true, order:o, econ:econ(o, cfg), flags:flags(o), info:"Nothing new in that paste. The thread is already up to date." }); }
      const d = await rethink(o, k.fresh);
      log(o, w, (k.kind === "chat" ? k.added + " new message" + (k.added > 1 ? "s" : "") + " added" : { call:"Call notes", team:"Team update", media:"Files shared", note:"Note" }[k.kind] + " added") + (d.changed ? ". " + str(d.changed, 300) : ""));
      await saveO(o); return out({ ok:true, order:o, econ:econ(o, cfg), flags:flags(o), info:(k.kind === "chat" ? k.added + " new message" + (k.added > 1 ? "s" : "") : "Added") + ". " + (d.changed || "") }); }
    else if(op === "action"){ const x = find("actions", q.aid); if(!x) return bad("Not found"); if(!ASTAT.includes(q.status)) return bad("Unknown status");
      x.status = q.status; x.note = str(q.note, 500) || x.note; x.at = now(); x.by = w.name; x.statusWhy = ""; log(o, w, "Action \"" + x.title.slice(0, 70) + "\": " + x.status + (q.note ? " (" + str(q.note, 200) + ")" : "")); }
    else if(op === "verify"){ if(!can(w, "pm") && !can(w, "qa")) return bad("Your role cannot do this step"); const v = await verifyOrder(o.client.website); o.verify = v; (o.verifyLog = o.verifyLog || []).unshift(v); o.verifyLog = o.verifyLog.slice(0, 12);
      const bad1 = v.live.filter(x => !x.ok).length, idx = v.pages.filter(p => /^Submitted and indexed|PASS/i.test(p.state || p.verdict || "")).length;
      log(o, w, "Live check: " + (v.live.length - bad1) + " of " + v.live.length + " site checks fine" + (v.gsc && v.gsc.ok ? ", " + idx + " of " + v.pages.length + " sample pages indexed by Google" : ", Search Console not shared with us")); }
    else if(op === "proofCheck"){ need("pm"); const x = find("deliverables", q.did); if(!x) return bad("Not found"); if(!proofsOf(x).length) return bad("No proof to check yet"); await runProofCheck(o, x); log(o, w, "Order desk checked the proof of \"" + x.text.slice(0, 60) + "\": " + (x.check.verdict || "done")); }
    else if(op === "qaMark"){ need("qa"); if(o.stage !== "qa") return bad("This order is not waiting for QA"); const x = find("deliverables", q.did); if(!x) return bad("Not found");
      if(!q.ok && !str(q.note, 10)) return bad("Write what is wrong so the team can fix it"); x.qa = q.ok ? "pass" : "fail"; x.qaNote = str(q.note, 500); x.qaBy = w.name; x.qaAt = now(); }
    else if(op === "addDeliv"){ need("pm"); o.deliverables.push({ id:nid("d"), text:str(q.text, 300), done:false, proof:"", qa:"" }); log(o, w, "Added deliverable " + str(q.text, 300)); }
    else if(op === "hours"){ need("pm"); const h = num(q.h, 0); if(h <= 0 || h > 24) return bad("Hours between 0 and 24"); o.hours.push({ who:w.name, h, note:str(q.note, 200), at:now() }); log(o, w, "Logged " + h + " h " + str(q.note, 200)); }
    else if(op === "ask"){ need("pm"); const t = str(q.text, 4000); if(!t) return bad("Write the message"); o.queue.push({ id:nid("q"), kind:str(q.kind, 20) || "question", text:t, at:now(), by:w.name, sent:false }); log(o, w, "Asked comms to send a message to the client"); }
    else if(op === "sent"){ need("comms"); const x = find("queue", q.qid); if(!x) return bad("Not found"); x.sent = true; x.sentAt = now(); x.sentBy = w.name;
      if(x.kind === "access") o.access.forEach(y => { if(y.status === "needed") y.status = "asked"; }); log(o, w, "Sent to client: " + x.kind); }
    else if(op === "reply"){ need("comms"); const t = str(q.text, 12000); if(!t) return bad("Paste the client's message");
      const x = { id:nid("q"), kind:"reply", text:"", at:now(), by:w.name, sent:true, reply:t, replyAt:now(), seen:false };
      if(aiOn()){ try{ const p = replyPrompt(o, t); const r = await askAI("reply", "claude-haiku-5-5", p.system, p.user, 1500); x.digest = r.data; o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
        if(r.data.scopeChange) o.alert = "Client asked for something new: check scope"; }catch(e){} }
      o.queue.push(x); log(o, w, "Client replied" + (x.digest ? ": " + str(x.digest.summary, 200) : "")); }
    else if(op === "drop"){ need("pm"); const x = find("queue", q.qid); if(!x || x.sent) return bad("Only unsent messages can be dropped"); o.queue = o.queue.filter(y => y !== x); log(o, w, "Dropped a message that is not needed: " + x.kind); }
    else if(op === "seen"){ const x = find("queue", q.qid); if(x){ x.seen = true; x.seenBy = w.name; } if(q.clearAlert) o.alert = ""; }
    else if(op === "toQA"){ need("pm"); const left = o.deliverables.filter(d => !d.done || !proofsOf(d).length); if(left.length) return bad("Every deliverable needs proof and Done first (" + left.length + " left)");
      o.deliverables.forEach(d => { d.qa = ""; d.qaNote = ""; });
      o.stage = "qa"; log(o, w, "Sent to QA"); }
    else if(op === "qa"){ need("qa"); if(o.stage !== "qa") return bad("This order is not waiting for QA");
      const unmarked = o.deliverables.filter(d => !d.qa); if(unmarked.length) return bad("Mark every deliverable Pass or Fail first (" + unmarked.length + " left)");
      const fails = o.deliverables.filter(d => d.qa === "fail"), res = fails.length ? "fail" : "pass", note = fails.map(d => d.text.slice(0, 60) + ": " + d.qaNote).join(" | ");
      o.qaRounds.push({ at:now(), by:w.name, result:res, note }); o.stage = res === "pass" ? "ready" : "work";
      fails.forEach(d => { d.done = false; d.check = null; });
      log(o, w, res === "pass" ? "QA passed every deliverable. Ready to deliver." : "QA sent back " + fails.length + ": " + note); }
    else if(op === "deliver"){ need("comms"); if(o.stage !== "ready") return bad("Deliver only after QA passes");
      const passAt = ((o.qaRounds || []).filter(r => r.result === "pass").pop() || {}).at || "", changed = [];
      for(const d of o.deliverables) for(const p of proofsOf(d)) if(p.kind === "drive"){ const m = await driveMeta(p.url); if(m.ok && passAt && m.modified > passAt) changed.push(m.name); }
      if(changed.length){ o.stage = "qa"; o.deliverables.forEach(d => { d.qa = ""; }); log(o, { name:"Order desk" }, "Changed after QA passed: " + changed.join(", ") + ". Sent back to QA."); await saveO(o); return bad("These were changed after QA passed: " + changed.join(", ") + ". The order went back to QA."); }
      o.stage = "delivered"; o.deliveredAt = now(); o.rechecks = [3, 7, 14].map(n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10));
      log(o, w, "Delivered to the client. The order desk will recheck Google on " + o.rechecks.join(", ") + " and draft an update for the client."); }
    else if(op === "revision"){ need("comms"); const reason = str(q.reason, 40), ours = !/client changed/i.test(reason);
      o.revisions.push({ at:now(), by:w.name, reason, note:str(q.note, 2000), ours }); o.stage = "work"; o.deliverables.forEach(d => { d.qa = ""; });
      log(o, w, "Revision: " + reason + (q.note ? ". " + str(q.note, 300) : "")); }
    else if(op === "close"){ need("comms"); o.rating = Math.min(5, Math.max(0, num(q.rating, 0))) || null; o.repeat = !!q.repeat; o.retainer = !!q.retainer; o.stage = "done"; o.closedAt = now();
      log(o, w, "Closed" + (o.rating ? ", rating " + o.rating : "") + (o.retainer ? ", retainer agreed" : o.repeat ? ", ordered again" : "")); }
    else if(op === "assign"){ need("assign"); const ps = await people();
      if(q.pm != null){ const p = ps.find(x => x.id === q.pm); o.pm = p ? p.id : ""; o.pmName = p ? p.name : ""; }
      if(q.qa != null){ const p = ps.find(x => x.id === q.qa); o.qa = p ? p.id : ""; o.qaName = p ? p.name : ""; }
      log(o, w, "Team: PM " + (o.pmName || "none") + ", QA " + (o.qaName || "none")); }
    else if(op === "note"){ const t = str(q.text, 2000); if(!t) return bad("Write the note"); log(o, w, "Note: " + t); }
    else if(op === "edit"){ need("create"); ["extras", "remarks"].forEach(k => { if(q[k] != null) o[k] = str(q[k], 4000); }); if(q.deadline && /^\d{4}-\d{2}-\d{2}$/.test(q.deadline)){ log(o, w, "Deadline " + o.deadline + " to " + q.deadline); o.deadline = q.deadline; }
      if(q.price != null && num(q.price, 0) > 0){ o.price = num(q.price, 0); } log(o, w, "Order details edited"); }
    else if(op === "cancel"){ need("assign"); o.stage = "cancelled"; log(o, w, "Cancelled: " + str(q.why, 300)); }
    else return bad("Unknown step");
    await saveO(o);
    return out({ ok:true, order:o, econ:econ(o, cfg), flags:flags(o) });
  }
  return bad("Unknown request", 404);
}
const run = async request => { try{ return await handle(request); }catch(e){ return bad(String(e.message || e).slice(0, 300), /role/.test(e.message) ? 403 : 500); } };
export const GET = run, POST = run;

/* Daily (from the portal cron): delivered orders get rechecked on their dates; the result and a ready client update land on the order. */
export async function recheckDue(){
  const today = now().slice(0, 10), done = [];
  for(const o of await loadAll(300)){
    if(!o.rechecks || !o.rechecks.length || o.rechecks[0] > today || !o.client.website) continue;
    try{
      const v = await verifyOrder(o.client.website); o.verify = v; (o.verifyLog = o.verifyLog || []).unshift(v); o.verifyLog = o.verifyLog.slice(0, 12); o.rechecks.shift();
      let text = "";
      if(aiOn()){ try{ const r = await askAI("recheck", "claude-haiku-5-5", `Write a short, warm progress update to a client in simple US English, no dashes, no promises of rankings, no contact details or outside links.
Say what Google now shows compared with when we delivered, in plain words, and what we keep watching. Answer with one JSON object only: {"message":""}`, `Client: ${o.client.name}. Delivered: ${o.deliveredAt}.\n${verifyText(v)}`, 1200);
        text = r.data.message || ""; o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4); }catch(e){} }
      if(text) o.queue.push({ id:nid("q"), kind:"update", text, at:now(), by:"Order desk", sent:false });
      log(o, { name:"Order desk" }, "Rechecked Google after delivery" + (text ? " and drafted a client update" : ""));
      await saveO(o); done.push(o.id);
    }catch(e){ done.push(o.id + ": " + e.message); }
  }
  return done;
}
