/* Team order desk API (businesssanta.com/team): hired orders from sales to delivery, with gates that stop the usual mistakes.
   Access gate (work starts only when every access item is received at the right level), proof gate (QA only gets work with
   a proof link per deliverable), QA gate (delivery only after QA passes). Every order carries its own scorecard and economy.
   Manav signs in with his admin session; team members sign in with a personal code he creates. */
import crypto from "node:crypto";
import { store, cmd, pipe, getJ, setJ, mgetJ, rid, cookieOf, setCookie, clearCookie, rateLimit, P } from "./_lib/store.mjs";
import { GIGS } from "./_lib/gigs.mjs";
import { ACCESS, siteCheck, aiOn, askAI, orderPrompt, leadPrompt, replyPrompt, formatPrompt, redact, checkLink, proofCheck, intakePrompt, rethinkPrompt, teamReplyPrompt } from "./_lib/orderai.mjs";
import { isDrive, driveMeta, driveRead } from "./_lib/drive.mjs";
import { verifyOrder, verifyText } from "./_lib/verify.mjs";
import { accounts as gAccounts, props as gProps, refreshProps } from "./_lib/google.mjs";
import { gather, intelPrompt, propsFor } from "./_lib/intel.mjs";
import { syncOrder, docCandidates, docPeek, docPrompt, docGroup, docText, revisionTexts, diffPrompt, sweepSignals, signalsPrompt, siteHistory, historyPrompt, accessPrompt } from "./_lib/teamsync.mjs";
import { accessTokenAs } from "./_lib/google.mjs";

const T = { people:P + "tm:people", code:h => P + "tm:code:" + h, cfg:P + "tm:cfg", ord:id => P + "ord:" + id, ords:P + "ords", seq:P + "ordseq", leads:P + "tm:leads", sess:t => P + "sess:" + t };
const TTL = 60 * 60 * 24 * 14;
const ROLES = ["sales", "comms", "pm", "qa", "manager"];
const CAN = { create:["sales"], lead:["sales"], comms:["comms", "sales"], pm:["pm"], qa:["qa"], assign:["manager"], admin:[] };
const rolesOf = p => (Array.isArray(p.roles) && p.roles.length ? p.roles : [p.role]).filter(r => ROLES.includes(r));
const can = (w, what) => { const rs = w.roles || [w.role]; return w.role === "admin" || rs.includes("manager") && what !== "admin" || rs.some(r => (CAN[what] || []).includes(r)); };
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
  const rs = rolesOf(p); return { role:rs[0], roles:rs, uid:p.id, name:p.name, tok:t };
}
/* With only one active PM (or one QA), every order gets that person by default; with more, a manager picks */
function autoAssign(o, ps, w){
  let ch = false; const one = r => { const l = ps.filter(p => rolesOf(p).includes(r) && !p.off); return l.length === 1 ? l[0] : null; };
  const pm = one("pm"), qa = one("qa");
  if(!o.pm && pm){ o.pm = pm.id; o.pmName = pm.name; ch = true; }
  if(!o.qa && qa){ o.qa = qa.id; o.qaName = qa.name; ch = true; }
  if(ch) log(o, w || { name:"Order desk" }, "Team set by default: PM " + (o.pmName || "none") + ", QA " + (o.qaName || "none"));
  return ch;
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
  if(o.stage === "details") return [{ k:"y", t:"Needs order details" }];
  if(open && left < 0) f.push({ k:"bad", t:"Late" });
  else if(open && left < 864e5 && ["access", "work"].includes(o.stage)) f.push({ k:"bad", t:"Due within 24 hours" });
  else if(open && left < 2 * 864e5 && o.stage === "access") f.push({ k:"warn", t:"Due soon, access still missing" });
  if(o.stage === "access" && Date.now() - Date.parse(o.at) > 864e5) f.push({ k:"warn", t:"Waiting for access over a day" });
  const q = (o.queue || []).filter(x => !x.sent).length; if(q) f.push({ k:"y", t:q + " message" + (q > 1 ? "s" : "") + " to send" });
  const r = (o.queue || []).filter(x => x.reply && !x.seen).length; if(r) f.push({ k:"y", t:"New client reply" });
  if(o.alert) f.push({ k:"bad", t:o.alert });
  if(open){ const last = Date.parse(o.lastUpdateAt || o.at), hrs = (Date.now() - last) / 36e5; if(hrs > 24) f.push({ k:"bad", t:"No update for " + Math.round(hrs) + " h: paste the latest messages" }); else if(hrs > 8) f.push({ k:"warn", t:"Last update " + Math.round(hrs) + " h ago" }); }
  const dc = (o.actions || []).filter(a => a.status === "decide").length; if(dc) f.push({ k:"bad", t:dc + " step" + (dc > 1 ? "s need" : " needs") + " a decision" });
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
/* Draft orders (stage "details": found by the team account, waiting for sales to add the details) stay out of every count, report and score */
async function loadAll(n, drafts){ const ids = await cmd("ZREVRANGE", T.ords, 0, (n || 300) - 1); return (await mgetJ(ids.map(T.ord))).filter(o => o && (drafts || o.stage !== "details")); }

async function analyse(o, cfg){
  const gig = gigOf(o.gig);
  if(!aiOn()){ if(!o.site || !o.site.at){ o.site = await siteCheck(o.client.website); if(o.site) o.site.at = now(); } return { ok:false, why:"AI helpers are off until the API key is added in Vercel" }; }
  // The website check runs alongside the AI instead of before it (it can take up to 30 seconds on slow sites)
  const siteJob = (!o.site || !o.site.at) ? siteCheck(o.client.website).then(x => { if(x){ x.at = now(); o.site = x; } }).catch(() => {}) : Promise.resolve();
  const p = orderPrompt(o, gig, o.site && o.site.at ? o.site : { note:"Website check still running" }, cfg);
  const [r] = await Promise.all([askAI("order", "claude-sonnet-5-5", p.system, p.user, 32000), siteJob]);
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
  dedupeAccess(o); applyRegister(o, await regOf(o.client.website));
  if(Array.isArray(d.actions)){ o.actions = (o.actions || []).filter(a => !(a.by === "Order desk" && a.status === "open")); mergeActions(o, d.actions, true); }
  if(d.msgs && !(o.queue || []).some(q => q.auto)){
    o.queue = o.queue || [];
    if(d.msgs.access) o.queue.push({ id:nid("q"), auto:true, kind:"access", text:str(d.msgs.access, 4000), at:now(), by:"Order desk", sent:false });
    if(d.msgs.questions) o.queue.push({ id:nid("q"), auto:true, kind:"question", text:str(d.msgs.questions, 4000), at:now(), by:"Order desk", sent:false });
  }
  if(o.stage === "access" && o.access.length && o.access.every(y => ["received", "skip"].includes(y.status))){ setStage(o, "work"); log(o, { name:"Order desk" }, "The chat shows all access is already in. Work can start."); }
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
const ASTAT = ["open", "sent", "waiting", "done", "blocked", "decide", "skipped"];
const dshort = d => { try{ return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day:"numeric", month:"short" }); }catch(e){ return d; } };
function internalText(o, a){
  // Short and plain: the team works in a chat group per project, so only the site, the reply time and the numbered questions
  const qs = (a.questions || []).filter(q => (q.status || "") !== "answered"), site = domOf(o.client.website);
  return `${site ? site + ": " : ""}please reply by ${a.needBy || "today"}\n\n` + qs.map((q, i) => (i + 1) + ". " + (q.q || q)).join("\n");
}
const toQs = l => (Array.isArray(l) ? l : []).filter(Boolean).filter(q => !/package|gig|fiverr|marketplace|offer|price/i.test(typeof q === "string" ? q : q.q || "")).slice(0, 3).map(q => typeof q === "string" ? { q:str(q, 300), status:"" } : { q:str(q.q, 300), answer:str(q.answer, 400), status:q.status || "" });
function mergeActions(o, list, fresh){
  o.actions = o.actions || [];
  (list || []).forEach(x => { if(x && x.message) x.message = String(x.message).replace(/\[(order id|order number|order)\]/gi, o.id); });
  for(const x of (list || []).slice(0, 40)){
    const cur = x.id && o.actions.find(a => a.id === x.id);
    if(cur){
      cur.title = str(x.title, 200) || cur.title; cur.severity = x.severity || cur.severity;
      if(cur.type === "internal"){ if(Array.isArray(x.questions) && x.questions.length && !(cur.questions || []).some(q => q.answer)) cur.questions = toQs(x.questions); if(x.needBy) cur.needBy = str(x.needBy, 60); cur.message = internalText(o, cur); }
      else if(x.message != null) cur.message = String(x.message).slice(0, 4000);
      const st = ASTAT.includes(x.status) ? x.status : cur.status;
      if(!["done", "skipped", "decide"].includes(cur.status) && st !== cur.status && (cur.by === "Order desk" || st === "done" || !cur.by)){ cur.status = st; cur.statusWhy = str(x.statusWhy, 300); cur.at = now(); cur.by = "Order desk"; }
    } else if(fresh || !x.id){
      if(o.actions.some(a => a.title.toLowerCase() === String(x.title || "").toLowerCase())) continue;
      if(x.type === "internal" && Array.isArray(x.questions)){ const gone = (o.dropped || []).map(norm); x.questions = x.questions.filter(q => !gone.includes(norm(typeof q === "string" ? q : q.q))); if(!x.questions.length) continue; }
      o.actions.push({ id:nid("x"), title:str(x.title, 200), why:str(x.why, 300), owner:["comms", "pm", "qa", "manager"].includes(x.owner) ? x.owner : "comms", type:["client", "internal", "task"].includes(x.type) ? x.type : "task",
        to:str(x.to, 60), severity:["high", "medium", "low"].includes(x.severity) ? x.severity : "medium", message:String(x.message || "").slice(0, 4000), questions:toQs(x.questions), needBy:str(x.needBy, 60),
        status:ASTAT.includes(x.status) ? x.status : "open", statusWhy:str(x.statusWhy, 300), at:now(), created:now(), by:"Order desk" });
      const nw = o.actions[o.actions.length - 1]; if(nw.type === "internal"){ if(!nw.questions.length && nw.message) nw.questions = toQs(nw.message.split(/\n|(?<=\?)\s+/).filter(l => /\?\s*$/.test(l.trim()))); nw.message = internalText(o, nw); }
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

/* Access register: which account, login and level we hold for each client site, kept across orders. Never passwords. */
const domOf = u => { try{ return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); }catch(e){ return ""; } };
const RK = d => P + "areg:" + d;
const SYS = { "Google Search Console":/search console|gsc/i, "Google Analytics 4":/analytics|ga4/i, "Google Tag Manager":/tag manager|gtm/i, "Google Ads":/google ads|adwords/i,
  "Google Business Profile":/business profile|gbp|maps listing/i, "WordPress":/wordpress|wp admin|cms/i, "Shopify":/shopify|store staff/i, "Wix":/wix/i, "Squarespace":/squarespace/i, "Webflow":/webflow/i,
  "Hosting or DNS":/hosting|dns|domain|cpanel/i, "Figma":/figma/i, "Other":/^$/ };
async function regOf(site){ const d = domOf(site); if(!d) return []; return (await getJ(RK(d))) || []; }
function sysOfItem(item){ for(const [k, re] of Object.entries(SYS)) if(k !== "Other" && re.test(item)) return k; return ""; }
/* One access item per system: reruns of the order desk may name the same access differently */
function dedupeAccess(o){
  const rank = { received:5, skip:4, wrong:3, asked:2, needed:1 }, keyOf = a => (sysOfItem(a.item) || a.item.toLowerCase().replace(/\(.*?\)/g, "").trim()) + (/https/i.test(a.item) ? " https" : /\bhttp\b/i.test(a.item) ? " http" : "");
  const m = new Map();
  for(const a of o.access || []){ const k = keyOf(a), cur = m.get(k);
    if(!cur) m.set(k, a); else if((rank[a.status] || 0) > (rank[cur.status] || 0)) m.set(k, Object.assign({}, cur, a, { id:cur.id })); }
  o.access = [...m.values()];
}
function applyRegister(o, reg){
  for(const a of o.access || []){ if(a.status === "received" || a.status === "skip") continue;
    const sy = sysOfItem(a.item), hit = reg.find(r => r.active !== false && r.system === sy);
    if(hit){ a.status = "received"; a.by = "Order desk"; a.note = "On file: " + hit.account + (hit.level ? " (" + hit.level + ")" : "") + (hit.holder ? ", login kept in " + hit.holder : "") + ". Confirm it still works before starting."; }
  }
}

/* Clients: one record per marketplace username, holding every order. Payments are for Manav (HoD) only. */
const cidOf = n => String(n || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "unknown";
const CK = id => P + "cl:" + id, CLS = P + "clients";
async function touchClient(o){
  const id = o.cid || (o.cid = cidOf(o.client.name)); const c = (await getJ(CK(id))) || { id, name:o.client.name, first:o.at, orders:[], sites:[], notes:"", tags:[] };
  if(!c.orders.includes(o.id)) c.orders.push(o.id); if(o.client.website && !c.sites.includes(domOf(o.client.website))) c.sites.push(domOf(o.client.website));
  c.country = o.client.country || c.country; c.last = o.at > (c.last || "") ? o.at : c.last; if(o.ai && o.ai.profile) c.profile = o.ai.profile;
  await pipe([["SET", CK(id), JSON.stringify(c)], ["SADD", CLS, id]]); return c;
}
const payOf = o => Object.assign({ status:"paid", extras:[], tip:0, refund:0 }, o.pay || {});
function payNums(o, cfg){
  const p = payOf(o), feeR = (o.fee != null ? o.fee : cfg.fee) / 100, extras = (p.extras || []).reduce((a, x) => a + num(x.amount, 0), 0), gross = num(o.price, 0) + extras + num(p.tip, 0) - num(p.refund, 0);
  return { status:p.status, gross:+gross.toFixed(2), net:+(gross * (1 - feeR)).toFixed(2), extras:+extras.toFixed(2), tip:num(p.tip, 0), refund:num(p.refund, 0), clearsOn:p.clearsOn || "", clearedAt:p.clearedAt || "" };
}
function clientSummary(c, list, cfg, admin){
  const os = list.filter(o => o.cid === c.id || (!o.cid && cidOf(o.client.name) === c.id));
  const open = os.filter(o => !["done", "cancelled"].includes(o.stage)), rated = os.filter(o => o.rating);
  const r = { id:c.id, name:c.name, country:c.country, sites:c.sites, first:c.first, last:c.last, orders:os.length, open:open.length, tags:c.tags || [],
    rating:rated.length ? +(rated.reduce((a, o) => a + o.rating, 0) / rated.length).toFixed(1) : null, retainer:os.some(o => o.retainer), repeat:os.length > 1,
    revisions:os.reduce((a, o) => a + (o.revisions || []).filter(x => x.ours).length, 0), flags:open.flatMap(o => flags(o).filter(f => f.k === "bad")).length };
  if(admin){ const ps = os.filter(o => o.stage !== "cancelled").map(o => payNums(o, cfg)); r.gross = +ps.reduce((a, x) => a + x.gross, 0).toFixed(2); r.net = +ps.reduce((a, x) => a + x.net, 0).toFixed(2);
    r.pending = +ps.filter(x => x.status !== "cleared" && !/refund|cancel/.test(x.status)).reduce((a, x) => a + x.net, 0).toFixed(2); }
  return r;
}

/* Screenshots and files pasted with a team reply or an update: kept one per key (never inside the order), read by the AI */
const IK = id => P + "img:" + id;
async function saveFiles(list){
  const out = [], ops = [];
  for(const f of (Array.isArray(list) ? list : []).slice(0, 6)){
    const type = str(f.type, 60), data = String(f.data || "");
    if(!/^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(type) || !data || data.length > 3.2e6) continue;
    const id = nid("f"); ops.push(["SET", IK(id), JSON.stringify({ type, name:str(f.name, 120) || "screenshot", data })]); out.push({ id, name:str(f.name, 120) || "screenshot", type, kb:Math.round(data.length * 0.75 / 1024) });
  }
  if(ops.length) await pipe(ops);
  return out;
}
async function fileBlocks(files, text){
  const blocks = [];
  for(const f of files){ const v = await getJ(IK(f.id)); if(!v) continue;
    blocks.push({ type:"text", text:"ATTACHED FILE: " + f.name });
    blocks.push(v.type === "application/pdf" ? { type:"document", source:{ type:"base64", media_type:"application/pdf", data:v.data } } : { type:"image", source:{ type:"base64", media_type:v.type, data:v.data } }); }
  // Drive links written in the reply are opened and read too
  for(const u of (String(text || "").match(/https?:\/\/(?:drive|docs)\.google\.com\/\S+/g) || []).slice(0, 3)){
    try{ const m = await driveMeta(u); if(!m.ok){ blocks.push({ type:"text", text:"DRIVE LINK " + u + ": cannot be opened (" + m.error + ")" }); continue; }
      for(const it of await driveRead(m)){ blocks.push({ type:"text", text:"DRIVE FILE " + it.name + (it.text ? ":\n" + it.text.slice(0, 15000) : it.note ? ": " + it.note : "") });
        if(it.image) blocks.push({ type:"image", source:{ type:"base64", media_type:it.type, data:it.b64 } }); if(it.pdf) blocks.push({ type:"document", source:{ type:"base64", media_type:"application/pdf", data:it.b64 } }); }
    }catch(e){ blocks.push({ type:"text", text:"DRIVE LINK " + u + ": " + e.message }); }
  }
  return blocks;
}

/* What the project team (PM and QA) may see: the work, never the client chat, money or sales notes, except messages sales shared */
// Project-team limits apply only to people whose every role is PM or QA; anyone who also sells or talks to clients sees the client side
const isProj = w => (w.roles || [w.role]).every(r => r === "pm" || r === "qa");
function projView(o){
  const ai = o.ai || {};
  return { id:o.id, at:o.at, cid:o.cid, client:{ name:o.client.name, website:o.client.website, country:o.client.country }, gig:o.gig, pkg:o.pkg, deadline:o.deadline, stage:o.stage, pm:o.pm, pmName:o.pmName, qa:o.qa, qaName:o.qaName,
    access:o.access, deliverables:o.deliverables, hours:o.hours, revisions:(o.revisions || []).map(r => ({ at:r.at, reason:r.reason, note:r.note, ours:r.ours })), qaRounds:o.qaRounds, verify:o.verify, site:o.site, google:o.google, rechecks:o.rechecks,
    ai:{ kt:ai.kt, qa:ai.qa, done:ai.done, next:ai.next, deliverables:ai.deliverables, health:ai.health },
    folder:o.folder, folderFiles:o.folderFiles, docs:o.docs, docGroups:o.docGroups, mails:o.mails, teamChat:o.teamChat, syncAt:o.syncAt, syncErrors:o.syncErrors,
    intel:o.intel ? { at:o.intel.at, numbers:(o.intel.ai || {}).numbers || [], forQA:(o.intel.ai || {}).forQA || [], seen:o.intel.seen } : null,
    actions:(o.actions || []).filter(a => a.type === "internal" || (a.type === "task" && a.owner !== "comms") || a.byTeam), shared:o.shared || [],
    timeline:(o.timeline || []).filter(t => !/client replied|sent to client|payment|price|message|lead/i.test(t.what)), lastUpdateAt:o.lastUpdateAt, alert:o.alert && /scope/i.test(o.alert) ? "The client asked for something new: sales will confirm the scope" : "" };
}
function urgency(o, a){
  const due = Date.parse(o.deadline + "T23:59:00") - Date.now(), late = due < 0, soon = due < 864e5;
  const by = /today/i.test(a.needBy || "") || /\d{1,2}\s*(am|pm)/i.test(a.needBy || "") && !/tomorrow/i.test(a.needBy || "");
  return late || a.severity === "high" && (soon || by) ? "urgent" : a.severity === "high" || soon || by ? "important" : "normal";
}

/* Timing of every step, for the HoD report: stages, sends, replies, access */
function setStage(o, st){ if(o.stage !== st){ (o.stageLog = o.stageLog || [{ stage:o.stage || "access", at:o.at }]).push({ stage:st, at:now() }); } o.stage = st; }
const hrs = (a, b) => a && b ? Math.max(0, (Date.parse(b) - Date.parse(a)) / 36e5) : null;
function delays(o){
  const nowI = now(), d = { client:[], sales:[], team:[], qa:[] }, add = (side, what, h, open) => { if(h != null && h >= 0.5) d[side].push({ what, h:+h.toFixed(1), open:!!open }); };
  for(const a of o.access || []){ if(["received", "skip"].includes(a.status)){ const rec = a.receivedAt || a.atS; if(rec && !/on file|from the chat|found automatically/i.test(a.note || "")) add("client", "Access: " + a.item, hrs(o.at, rec)); continue; }
    add("client", "Access still missing: " + a.item, hrs(o.at, nowI), true); }
  for(const x of o.actions || []){
    const made = x.created || o.at;
    if(x.type !== "task"){ if(x.sentAt) add("sales", "Sending: " + x.title, hrs(made, x.sentAt)); else if(!["done", "skipped"].includes(x.status)) add("sales", "Not sent yet: " + x.title, hrs(made, nowI), true); }
    if(x.type === "internal" && x.sentAt){ const rep = (x.replies || [])[0]; add("team", "Answer: " + x.title, hrs(x.sentAt, rep ? rep.at : (["done", "skipped"].includes(x.status) ? null : nowI)), !rep && !["done", "skipped"].includes(x.status)); }
    if(x.type === "client" && x.sentAt){ const back = ((o.convo || {}).messages || []).find(m => m.who === "client" && m.added && m.added > x.sentAt); if(back) add("client", "Reply to: " + x.title, hrs(x.sentAt, back.added)); }
  }
  const sl = o.stageLog || [], at = st => (sl.find(z => z.stage === st) || {}).at, lastAt = st => ((sl.filter(z => z.stage === st).pop()) || {}).at;
  if(at("work")) add("team", "Work until sent to QA", hrs(at("work"), at("qa") || (o.stage === "work" ? nowI : null)), o.stage === "work");
  if(at("qa")) add("qa", "QA check", hrs(lastAt("qa"), at("ready") || (o.stage === "qa" ? nowI : null)), o.stage === "qa");
  const fails = (o.qaRounds || []).filter(r => r.result === "fail").length, revs = (o.revisions || []).filter(r => r.ours).length;
  const tot = k => +d[k].reduce((a2, x) => a2 + x.h, 0).toFixed(1);
  const late = !["done", "cancelled", "delivered"].includes(o.stage) && Date.parse(o.deadline + "T23:59:00") < Date.now();
  const broken = ((o.ai || {}).promises || []).filter(p => /broken/i.test(p.status || "") || (p.by && p.by < nowI.slice(0, 10) && !/kept/i.test(p.status || ""))).map(p => p.what);
  return { id:o.id, site:domOf(o.client.website), client:o.client.name, stage:o.stage, deadline:o.deadline, pm:o.pmName || "", sales:o.byName, late, fails, revisions:revs, broken,
    hours:{ client:tot("client"), sales:tot("sales"), team:tot("team"), qa:tot("qa") }, items:d };
}

/* Google access found automatically: any connected account that can see the client's property marks the access received */
function autoAccess(o, seen){
  let n = 0;
  for(const a of o.access || []){ if(["received", "skip"].includes(a.status)) continue;
    const isG = /search console|gsc/i.test(a.item), isA = /analytics|ga4/i.test(a.item), hit = isG ? (seen.gsc || [])[0] : isA ? (seen.ga || [])[0] : null;
    if(hit){ a.status = "received"; a.receivedAt = now(); a.by = "Order desk"; a.note = "Readable by " + hit.email + (hit.level ? " (" + ({ siteOwner:"Owner", siteFullUser:"Full user", siteRestrictedUser:"Restricted" }[hit.level] || hit.level) + ")" : "") + ", found automatically"; n++; }
  }
  if(n && o.stage === "access" && o.access.every(y => ["received", "skip"].includes(y.status))) setStage(o, "work");
  return n;
}
async function buildIntel(o){
  const data = await gather(o.client.website, o.google); const n = autoAccess(o, data.seen);
  if(!data.gsc && !data.ga){ o.intel = Object.assign(o.intel || {}, { checked:now(), seen:data.seen }); return { found:false, access:n }; }
  if(!aiOn()){ o.intel = { at:now(), data, seen:data.seen }; return { found:true, access:n }; }
  const p = intelPrompt(o, data, domOf(o.client.website)), r = await askAI("intel", "claude-sonnet-5-5", p.system, p.user, 12000); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  o.intel = { at:now(), checked:now(), data, seen:data.seen, ai:r.data || {}, usd:+r.usd.toFixed(4) };
  try{ const c = await getJ(CK(o.cid || cidOf(o.client.name))); if(c){ c.intel = { at:now(), order:o.id, ai:r.data || {}, numbers:(r.data || {}).numbers || [] }; await setJ(CK(c.id), c); } }catch(e){}
  return { found:true, access:n };
}
/* Daily: ask every connected account what it can see now, then read Google data for open orders that gained access or are a week old */
export async function dailyIntel(){
  const done = []; try{ await refreshProps(); }catch(e){ return ["props: " + e.message]; }
  for(const o of (await loadAll(300)).filter(x => !["done", "cancelled"].includes(x.stage) && x.client.website)){
    try{ const ps = await propsFor(o.client.website), seen = { gsc:ps.gsc.map(x => ({ id:x.id, email:x.email, level:x.level })), ga:ps.ga.map(x => ({ id:x.id, email:x.email })) };
      const before = autoAccess(o, seen), stale = !o.intel || !o.intel.at || Date.now() - Date.parse(o.intel.at) > 7 * 864e5;
      if((seen.gsc.length || seen.ga.length) && (stale || before)){ const r = await buildIntel(o); log(o, { name:"Order desk" }, "Read Google data" + (r.access ? " and found access for " + r.access + " item(s)" : "") + ": business analysis updated"); }
      else if(before) log(o, { name:"Order desk" }, "Access found automatically for " + before + " item(s)");
      if(before || stale) await saveO(o); done.push(o.id);
    }catch(e){ done.push(o.id + ": " + e.message); }
  }
  return done;
}

/* Team sources: project Drive folder, emails and Google Chat the team account is in. New items re-check the order. */
async function syncTeam(o){
  const r = await syncOrder(o), fresh = [];
  if(r.folder && (!o.folder || o.folder.id !== r.folder.id)){ o.folder = r.folder; fresh.push("PROJECT FOLDER linked: " + r.folder.name); }
  const old = new Map((o.folderFiles || []).map(f => [f.id, f.modified]));
  for(const f of r.files){ const was = old.get(f.id); if(!was) fresh.push("NEW FILE in the project folder: " + f.name + " (by " + f.by + ")"); else if(was !== f.modified) fresh.push("FILE CHANGED: " + f.name + " (by " + f.by + ")"); }
  if(r.files.length) o.folderFiles = r.files;
  const passAt = ((o.qaRounds || []).filter(q => q.result === "pass").pop() || {}).at;
  const changedAfterQA = passAt && ["ready", "delivered"].includes(o.stage) ? r.files.filter(f => f.modified > passAt) : [];
  if(changedAfterQA.length) o.alert = "Changed after QA passed: " + changedAfterQA.map(f => f.name).join(", ").slice(0, 140);
  if(r.mails.length){ o.mails = (o.mails || []).concat(r.mails).sort((a, b) => a.date.localeCompare(b.date)).slice(-80); r.mails.forEach(m => fresh.push("TEAM EMAIL " + m.date + " from " + m.from + ", subject \"" + m.subject + "\":\n" + m.text.slice(0, 2500) + (m.files.length ? "\nAttachments: " + m.files.join(", ") : ""))); }
  if(r.chat.length){ o.teamChat = (o.teamChat || []).concat(r.chat).slice(-300); fresh.push("TEAM CHAT (" + r.chat[0].space + "):\n" + r.chat.map(m => m.at + " " + m.by + ": " + m.text).join("\n").slice(0, 8000)); }
  // Project access group: keep the (masked) messages, and update the access checklist from what they show
  if(r.access.length){ o.accessChat = (o.accessChat || []).concat(r.access).sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-200);
    if(aiOn() && (o.access || []).length) try{ const p = accessPrompt(o, o.access, r.access), x = await askAI("accesschat", "claude-haiku-5-5", p.system, p.user, 3000); o.aiUsd = +(num(o.aiUsd, 0) + x.usd).toFixed(4);
      const d = x.data || {}, ch = [];
      for(const u of d.updates || []){ const a = o.access.find(y => y.id === u.id); if(!a || !["received", "wrong", "asked"].includes(u.status) || a.status === u.status || (a.status === "skip")) continue;
        if(u.status === "asked" && ["received", "wrong"].includes(a.status)) continue;
        a.status = u.status; a.note = "From the access group: " + str(u.note, 200); if(u.status === "received"){ a.receivedAt = now(); a.atS = now(); } ch.push(a.item + ": " + u.status); }
      for(const n2 of (d.newItems || []).slice(0, 3)){ if(o.access.some(y => y.item.toLowerCase() === String(n2.item || "").toLowerCase())) continue;
        o.access.push({ id:nid("a"), item:str(n2.item, 120), level:"", why:"Seen in the access group", status:n2.status === "received" ? "received" : "asked", note:"From the access group: " + str(n2.note, 200) }); ch.push(n2.item + ": added"); }
      o.accessIssues = (d.issues || []).slice(0, 6).map(x2 => str(x2, 240));
      if(ch.length) log(o, { name:"Order desk" }, "Access group: " + ch.join("; "));
      if(o.stage === "access" && o.access.every(y => ["received", "skip"].includes(y.status))){ setStage(o, "work"); log(o, { name:"Order desk" }, "Every access item is in. Work can start."); }
      if((d.issues || []).length) fresh.push("ACCESS GROUP, open problems: " + d.issues.join("; "));
    }catch(e){} }
  o.accessSyncAt = r.at;
  o.syncAt = r.at; o.syncErrors = r.errors;
  if(fresh.length){ log(o, { name:"Order desk" }, "From the team's folder, email and chat: " + fresh.length + " new item(s)"); if(aiOn()) try{ await rethink(o, fresh.join("\n\n")); }catch(e){} }
  return { new:fresh.length, errors:r.errors };
}
export async function hourlySync(){
  const done = [];
  try{ done.push("new work: " + await discover()); }catch(e){ done.push("new work: " + e.message); }
  const open = (await loadAll(300, true)).filter(x => !["done", "cancelled"].includes(x.stage)).slice(0, 40);
  for(const o of open){ try{ const r = await syncTeam(o); done.push(o.id + ":" + r.new); }catch(e){ done.push(o.id + ": " + e.message); } }
  try{ done.push("docs:" + await matchDocs(open)); }catch(e){ done.push("docs: " + e.message); }
  for(const o of open) await saveO(o);
  // Work history for every client site that has none yet (or older than 30 days), two a run
  { let n = 0; const all = await loadAll(1000, true);
    for(const site of [...new Set(open.map(o => domOf(o.client.website)).filter(Boolean))]){ if(n >= 2) break; const hv = await getJ(HK(site)); if(hv && Date.now() - Date.parse(hv.at) < 30 * 864e5) continue;
      try{ await buildHistory(site, all.filter(o => domOf(o.client.website) === site).map(o => o.id)); n++; done.push("history:" + site); }catch(e){ done.push("history " + site + ": " + e.message); } } }
  try{ done.push("reports: " + await driveReports()); }catch(e){ done.push("reports: " + e.message); }
  return done;
}

/* Our documents, matched to orders by content. Each file is judged once (remembered); sure matches link, unsure ones wait for a yes or no. */
const DK = id => P + "doc:" + id;
async function matchDocs(orders){
  const cands = await docCandidates(orders), fresh = [];
  for(const c of cands){ if(await cmd("GET", DK(c.id))) continue; c.peek = await docPeek(c); fresh.push(c); if(fresh.length >= 40) break; }
  if(!fresh.length || !aiOn()) return 0;
  const p = docPrompt(orders, fresh), r = await askAI("docs", "claude-haiku-5-5", p.system, p.user, 6000), byId = new Map(orders.map(o => [o.id, o]));
  let n = 0; const ops = [];
  for(const d of (r.data && r.data.files) || []){
    const c = fresh.find(x => x.id === d.id); if(!c) continue; ops.push(["SET", DK(c.id), JSON.stringify({ order:d.order || "", confidence:d.confidence || 0, at:now() }), "EX", 60 * 60 * 24 * 120]);
    const o = byId.get(d.order); if(!o || (d.confidence || 0) < 0.5) continue;
    o.docs = o.docs || []; if(o.docs.some(x => x.id === c.id)) continue;
    const inTime = !c.modified || c.modified >= new Date(Date.parse(o.at) - 3 * 864e5).toISOString(), sure = (d.confidence || 0) >= 0.85 && inTime && /\S/.test(c.peek || "");
    o.docs.push({ id:c.id, name:c.name, mime:c.mime, link:c.link, modified:c.modified, by:c.by, owner:c.owner, via:c.via, kind:d.kind || "other", why:str(d.why, 200) + (inTime ? "" : " (older than the order)"), confidence:+(d.confidence || 0).toFixed(2), status:sure ? "linked" : "suggested", at:now() });
    o._docsNew = (o._docsNew || 0) + 1; n++;
  }
  if(ops.length) await pipe(ops);
  for(const o of orders) groupDocs(o);
  for(const o of orders) if(o._docsNew){ log(o, { name:"Order desk" }, o._docsNew + " document(s) recognised as ours for this order"); delete o._docsNew; }
  return n;
}

/* Copies of the same document form one group; the newest is current (read for QA, proof and analysis), the rest are versions */
function groupDocs(o){
  const g = new Map();
  for(const d of (o.docs || []).filter(x => x.status !== "rejected")){ const k = docGroup(d) + (d.split ? "#" + d.id : ""); d.group = k; (g.get(k) || g.set(k, []).get(k)).push(d); }
  for(const l of g.values()){ l.sort((a, b) => String(b.modified || "").localeCompare(String(a.modified || ""))); l.forEach((d, i) => { d.current = i === 0; d.versions = l.length; }); }
  o.docGroups = o.docGroups || {};
  /* A proof that points to an older copy is flagged with the newest one, so nobody sends QA or the client an outdated file */
  const byId = new Map((o.docs || []).map(d => [d.id, d]));
  for(const dv of o.deliverables || []) for(const p of proofsOf(dv)){ const d = p.kind === "drive" && byId.get((p.meta || {}).id); if(!d) { delete p.newer; continue; }
    const cur = d.current ? null : (o.docs || []).find(x => x.group === d.group && x.current && x.status !== "rejected");
    if(cur && cur.id !== d.id) p.newer = { id:cur.id, name:cur.name, link:cur.link, modified:cur.modified, by:cur.by }; else delete p.newer; }
}
const staleProofs = o => (o.deliverables || []).flatMap(d => proofsOf(d).filter(p => p.newer).map(p => p.name || "a file"));

/* The fields sales types for an order, checked the same way for a new order and for completing a draft */
function orderFields(q){
  const gig = gigOf(str(q.gig, 8)); if(!gig) return { error:"Pick the gig" };
  const pkg = ["basic", "standard", "premium", "custom"].includes(q.pkg) ? q.pkg : "standard";
  const price = num(q.price, 0); if(price <= 0) return { error:"Type the price the client paid" };
  const deadline = str(q.deadline, 10); if(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { error:"Pick the deadline" };
  const chat = redact(str(q.chat, 80000)); if(chat.length < 40) return { error:"Paste the whole client chat. The order desk works from it." };
  return { fields:{ gig:gig.id, pkg, price, extras:str(q.extras, 500), deadline, chat, calls:redact(str(q.calls, 20000)), remarks:redact(str(q.remarks, 4000)),
    client:{ name:str(q.client, 80), country:str(q.country, 40), website:str(q.website, 200) }, stage:"access",
    access:(ACCESS[gig.cat] || []).map(x => Object.assign({ id:nid("a"), status:"needed" }, x)),
    deliverables:[{ id:nid("d"), text:(gig.packages[pkg] || {}).what || gig.name, done:false, proof:"", qa:"" }] } };
}
async function launch(o, w, cfg){
  const gig = gigOf(o.gig); log(o, w, "Order created: " + gig.name + " (" + o.pkg + ") for $" + o.price);
  const reg0 = await regOf(o.client.website); if(reg0.length){ applyRegister(o, reg0); log(o, { name:"Order desk" }, "Access already on file for " + domOf(o.client.website) + " was linked to this order"); }
  let ai = null;
  const [an, fm] = await Promise.allSettled([analyse(o, cfg), formatConvo(o)]);
  if(an.status === "fulfilled"){ ai = an.value; if(ai.ok) log(o, { name:"Order desk" }, "Brief, access list, client profile and price check ready"); } else ai = { ok:false, why:an.reason.message };
  if(!ai.ok && ai.why) log(o, { name:"Order desk" }, "Brief not made: " + ai.why);
  if(fm.status === "fulfilled" && fm.value.ok) log(o, { name:"Order desk" }, "Client conversation laid out (" + o.convo.messages.length + " messages)");
  autoAssign(o, await people());
  o.cid = cidOf(o.client.name || domOf(o.client.website)); await touchClient(o);
  await pipe([["SET", T.ord(o.id), JSON.stringify(o)], ["ZADD", T.ords, Date.now(), o.id]]);
  return ai;
}

/* New work the team account sees (emails, group chats, Drive files) for a site with no open order becomes a draft order,
   and sales is asked for the client chat, calls, package, price and deadline. */
const DS = P + "disc:since", DSEEN = P + "disc:seen", DIGN = P + "disc:ign", HK = d => P + "hist:" + d;
const evOf = (it, r) => ({ kind:it.kind, at:it.at, from:it.from || "", title:it.subject || it.name || it.space || "", link:it.link || "", what:str(r.what, 240), text:redact(str(it.text, 400)) });
export async function discover(){
  if(!aiOn()) return "ai off";
  const since = (await cmd("GET", DS)) || new Date(Date.now() - 3 * 864e5).toISOString(), started = now(), cfg = await cfgOf();
  const { items, errors } = await sweepSignals(since), fresh = [];
  for(const it of items) if(!(await cmd("SISMEMBER", DSEEN, it.key))) fresh.push(it);
  const all = await loadAll(1000, true), bySite = {}; all.forEach(o => { const d = domOf(o.client.website); if(d) (bySite[d] = bySite[d] || []).push(o); });
  const ign = new Set((await cmd("SMEMBERS", DIGN)) || []), cand = fresh.filter(it => it.sites.length).slice(0, 40); let made = 0, added = 0;
  if(cand.length){
    const p = signalsPrompt(cand, Object.keys(bySite)), r = await askAI("signals", "claude-haiku-5-5", p.system, p.user, 6000);
    for(const x of (r.data && r.data.items) || []){
      const it = cand[x.i], site = domOf(str(x.site, 200)); if(!it || x.work !== "client work" || !site || ign.has(site) || !it.sites.includes(site)) continue;
      const list = bySite[site] || [], open = list.find(o => !["delivered", "done", "cancelled"].includes(o.stage));
      if(open && open.stage !== "details") continue;   // the hourly sync already attaches it to that order
      if(open){ open.draft.evidence = [evOf(it, x)].concat(open.draft.evidence || []).slice(0, 20); log(open, { name:"Order desk" }, "More found in the team's " + it.kind + ": " + str(x.what, 160)); await saveO(open); added++; continue; }
      if(!x.newOrder) continue;
      const n = await cmd("INCR", T.seq), id = "O-" + (1000 + Number(n)), past = list.filter(o => o.stage !== "cancelled").map(o => o.id);
      const o = { id, at:now(), by:"desk", byName:"Order desk", gig:"", pkg:"", price:0, deadline:"", chat:"", calls:"", remarks:"", fee:cfg.fee,
        client:{ name:str(x.client, 80), country:str(x.country, 40), website:site }, stage:"details", draft:{ found:now(), via:it.via, evidence:[evOf(it, x)], past },
        access:[], deliverables:[], queue:[], hours:[], revisions:[], qaRounds:[], timeline:[] };
      log(o, { name:"Order desk" }, "Found in the team's " + it.kind + ": " + str(x.what, 160) + ". Waiting for sales to add the order details.");
      const known = list.find(o2 => o2.cid); if(known) o.cid = known.cid;
      await pipe([["SET", T.ord(id), JSON.stringify(o)], ["ZADD", T.ords, Date.now(), id]]); (bySite[site] = list).push(o); made++;
    }
  }
  if(fresh.length) await pipe(fresh.map(it => ["SADD", DSEEN, it.key]));
  await cmd("SET", DS, started);
  return "seen " + items.length + ", new " + fresh.length + ", drafts " + made + ", added " + added + (Object.keys(errors).length ? ", errors " + JSON.stringify(errors).slice(0, 200) : "");
}
/* Everything the team accounts hold about a site, turned into the client's work history (past orders, work done, open items) */
async function buildHistory(site, ids){
  if(!aiOn()) return null; const h = await siteHistory(site);
  if(!h.mails.length && !h.files.length && !h.chat.length){ const v = { at:now(), empty:true, counts:{ mails:0, files:0, chat:0 } }; await setJ(HK(site), v); return v; }
  const p = historyPrompt(site, h, ids || []), r = await askAI("history", "claude-sonnet-5-5", p.system, p.user, 8000);
  const v = Object.assign(r.data || {}, { at:now(), usd:+r.usd.toFixed(4), counts:{ mails:h.mails.length, files:h.files.length, chat:h.chat.length },
    links:h.files.slice(0, 12).map(f => ({ name:f.name, link:f.link, modified:f.modified })) });
  await setJ(HK(site), v); return v;
}

/* The HoD report: where time is lost on open orders, by side and person, with the analyst's reading (once a day) */
async function hodData(refresh){ const day = now().slice(0, 10), key = P + "hod:" + day;
    const all = (await loadAll(500)).filter(o => o.stage !== "cancelled"), open = all.filter(o => !["done"].includes(o.stage)), ds = open.map(delays);
    const sum = k => +ds.reduce((a2, x) => a2 + x.hours[k], 0).toFixed(1);
    const by = (f, side) => { const m = {}; ds.forEach(x => { const k = f(x) || "Not assigned"; const r = m[k] = m[k] || { orders:0, hours:0, open:0 }; r.orders++; r.hours += x.hours[side]; r.open += x.items[side].filter(i => i.open).length; }); return Object.entries(m).map(([name, r]) => ({ name, orders:r.orders, hours:+r.hours.toFixed(1), open:r.open })).sort((a2, b) => b.hours - a2.hours); };
    let insight = await getJ(key);
    if((!insight || refresh) && aiOn() && ds.length){
      try{ const r = await askAI("hod", "claude-sonnet-5-5", `You are the delivery analyst for the HoD of an SEO, web and ads agency. From the order timings below, find where time is lost and why: client side (access, replies), sales side (messages not sent, updates not pasted), project team (slow answers, slow work, rework), QA. Name orders and people. Be specific, fair and short. No dashes.
Answer with one JSON object only: {"headline":"one line for the HoD","sides":[{"side":"client | sales | project team | QA","finding":""}],"missed":["what was missed or broken, with the order"],"people":[{"name":"","note":"fair, specific"}],"improve":[{"what":"concrete change","impact":"expected effect, e.g. saves about 1 day per order"}],"todayForHod":["at most 3 things only the HoD should do today"]}`,
        JSON.stringify(ds.map(x => ({ order:x.id, site:x.site, stage:x.stage, deadline:x.deadline, pm:x.pm, sales:x.sales, late:x.late, qaFails:x.fails, revisions:x.revisions, broken:x.broken.slice(0, 4), hours:x.hours, worst:Object.fromEntries(Object.entries(x.items).map(([k, v]) => [k, v.sort((a2, b) => b.h - a2.h).slice(0, 3)])) }))), 6000);
        insight = Object.assign(r.data || {}, { at:now(), usd:+r.usd.toFixed(4) }); await setJ(key, insight, 60 * 60 * 24 * 40); }catch(e){ insight = { error:e.message }; } }
    return ({ day, totals:{ open:open.length, late:ds.filter(x => x.late).length, client:sum("client"), sales:sum("sales"), team:sum("team"), qa:sum("qa"), fails:ds.reduce((a2, x) => a2 + x.fails, 0), revisions:ds.reduce((a2, x) => a2 + x.revisions, 0) },
      orders:ds.sort((a2, b) => (b.late - a2.late) || (Object.values(b.hours).reduce((p, q) => p + q, 0) - Object.values(a2.hours).reduce((p, q) => p + q, 0))), team:by(x => x.pm, "team"), sales:by(x => x.sales, "sales"), insight }); }

/* HoD reports and records in Manav's own Google Drive: one folder the portal creates (it can only touch files it made), with
   the HoD report (latest and one per day), registers for orders, clients, payments, team, delays and drafts, and one record per order.
   Written hourly; a file is only rewritten when its content changed. */
const REPK = P + "rep:state";
const SNAME = { details:"Needs details", access:"Waiting for access", work:"In work", qa:"QA check", ready:"Ready to deliver", delivered:"Delivered", done:"Closed", cancelled:"Cancelled" };
const csvOf = rows => rows.map(r => r.map(v => { const t = String(v == null ? "" : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(",")).join("\n");
const hE = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hTable = (head, rows) => `<table border="1" cellpadding="5" style="border-collapse:collapse"><tr>${head.map(h => `<th style="background:#eef2f7">${hE(h)}</th>`).join("")}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${hE(c)}</td>`).join("")}</tr>`).join("")}</table>`;
async function gdrive(email, method, u, body, ctype){
  const tok = await accessTokenAs(email), r = await fetch(u, { method, headers:Object.assign({ authorization:"Bearer " + tok }, ctype ? { "content-type":ctype } : {}), body });
  const t = await r.text(); if(!r.ok) throw new Error("Drive " + r.status + ": " + t.slice(0, 180)); return t ? JSON.parse(t) : {};
}
async function gFolder(email, name, parent){
  const j = await gdrive(email, "POST", "https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", JSON.stringify(Object.assign({ name, mimeType:"application/vnd.google-apps.folder" }, parent ? { parents:[parent] } : {})), "application/json");
  return { id:j.id, link:j.webViewLink };
}
async function gPut(email, st, key, name, parent, type, content){
  const f = st.files[key] = st.files[key] || {}, h = sha(content).slice(0, 16); if(f.id && f.h === h) return false;
  const target = type === "doc" ? "application/vnd.google-apps.document" : "application/vnd.google-apps.spreadsheet", media = (type === "doc" ? "text/html" : "text/csv") + "; charset=UTF-8";
  if(f.id){ try{ await gdrive(email, "PATCH", "https://www.googleapis.com/upload/drive/v3/files/" + f.id + "?uploadType=media", content, media); f.h = h; f.at = now(); return true; }catch(e){ if(!/ 404| 403/.test(e.message)) throw e; } }
  const b = "bsx" + Date.now(), body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType:target, parents:[parent] })}\r\n--${b}\r\nContent-Type: ${media}\r\n\r\n${content}\r\n--${b}--`;
  const j = await gdrive(email, "POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", body, "multipart/related; boundary=" + b);
  Object.assign(f, { id:j.id, link:j.webViewLink, name, h, at:now() }); return true;
}
async function reportsState(){
  const st = (await getJ(REPK)) || {}, acc = (await gAccounts()).find(x => x.primary);
  const ready = !!(acc && acc.write);
  return { ready, account:acc ? acc.email : "", connect:ready ? "" : "/api/portal?a=g-start", folder:st.folder || null, at:st.at || "", error:st.error || "",
    files:Object.entries(st.files || {}).filter(([k]) => !k.startsWith("ord:") && !k.startsWith("day:")).map(([k, f]) => ({ key:k, name:f.name, link:f.link, at:f.at })),
    records:Object.keys(st.files || {}).filter(k => k.startsWith("ord:")).length, days:Object.keys(st.files || {}).filter(k => k.startsWith("day:")).length };
}
export async function driveReports(force){
  const acc = (await gAccounts()).find(x => x.primary); if(!acc || !acc.write) return "Drive reports wait for Manav to reconnect his Google account once";
  const st = Object.assign({ files:{} }, (await getJ(REPK)) || {}), email = acc.email, cfg = await cfgOf(), day = now().slice(0, 10); let wrote = 0;
  try{
    if(!st.folder || st.email !== email){ st.folder = await gFolder(email, "Business Santa order desk: HoD reports and records"); st.email = email; st.files = {};
      st.daily = await gFolder(email, "Daily HoD reports", st.folder.id); st.records = await gFolder(email, "Order records", st.folder.id); }
    const all = await loadAll(1000, true), live = all.filter(o => o.stage !== "details"), ps = await people(), nm = id => (ps.find(p => p.id === id) || {}).name || "";
    const dl = o => ((o.stageLog || []).find(z => z.stage === "delivered") || {}).at || "";
    const lateDays = o => { const end = dl(o) || now(); return o.deadline ? Math.max(0, Math.ceil((Date.parse(end) - Date.parse(o.deadline + "T23:59:00")) / 864e5)) : 0; };
    // Orders register
    wrote += await gPut(email, st, "orders", "Orders register", st.folder.id, "sheet", csvOf([["Order", "Client", "Site", "Gig", "Package", "Price USD", "Net after fee USD", "Margin %", "Stage", "Created", "Deadline", "Delivered", "Days late", "Sales", "PM", "QA", "QA rounds failed", "Client revisions", "Team hours", "Payment", "Rating"]]
      .concat(live.map(o => { const e = econ(o, cfg), pn = payNums(o, cfg); return [o.id, o.client.name, domOf(o.client.website), (gigOf(o.gig) || {}).name || "", o.pkg, o.price, pn.net, e.margin, SNAME[o.stage] || o.stage, o.at.slice(0, 10), o.deadline, dl(o).slice(0, 10), lateDays(o), o.byName || "", o.pmName || nm(o.pm), o.qaName || nm(o.qa),
        (o.qaRounds || []).filter(r => r.result !== "pass").length, (o.revisions || []).length, e.hours, pn.status, o.rating || ""]; })))) ? 1 : 0;
    // Clients register, with the work history found for each site
    const cids = await cmd("SMEMBERS", CLS), cs = (await mgetJ(cids.map(CK))).filter(Boolean), rows = [];
    for(const c of cs){ const sm = clientSummary(c, live, cfg, true), hs = []; for(const d of c.sites || []){ const hv = await getJ(HK(d)); if(hv && hv.summary) hs.push(d + ": " + hv.summary); }
      rows.push([c.name, (c.sites || []).join(" "), sm.orders, sm.open, String(c.first || "").slice(0, 10), String(c.last || "").slice(0, 10), sm.repeat ? "yes" : "no", sm.retainer ? "yes" : "no", sm.rating || "", sm.gross, sm.net, sm.pending, hs.join(" | ")]); }
    wrote += await gPut(email, st, "clients", "Clients register", st.folder.id, "sheet", csvOf([["Client", "Sites", "Orders", "Open", "First order", "Last order", "Repeat", "Retainer", "Rating", "Gross USD", "Net USD", "Pending USD", "Work history found"]].concat(rows))) ? 1 : 0;
    // Payments register
    wrote += await gPut(email, st, "payments", "Payments register", st.folder.id, "sheet", csvOf([["Order", "Client", "Created", "Status", "Gross USD", "Net USD", "Extras", "Tip", "Refund", "Clears on", "Cleared"]]
      .concat(live.filter(o => o.stage !== "cancelled").map(o => { const pn = payNums(o, cfg); return [o.id, o.client.name, o.at.slice(0, 10), pn.status, pn.gross, pn.net, pn.extras, pn.tip, pn.refund, pn.clearsOn, String(pn.clearedAt || "").slice(0, 10)]; })))) ? 1 : 0;
    // HoD data: team, delays, the report itself
    const hd = await hodData(false), ins = hd.insight || {};
    wrote += await gPut(email, st, "team", "Team performance", st.folder.id, "sheet", csvOf([["Name", "Side", "Open orders", "Hours lost on their side", "Open items"]]
      .concat(hd.team.map(r => [r.name, "Project team", r.orders, r.hours, r.open]), hd.sales.map(r => [r.name, "Sales", r.orders, r.hours, r.open]), (ins.people || []).map(p => [p.name, "Analyst note", "", "", p.note])))) ? 1 : 0;
    wrote += await gPut(email, st, "delays", "Delays and misses", st.folder.id, "sheet", csvOf([["Order", "Site", "Stage", "Deadline", "Late", "Sales", "PM", "Client hours", "Sales hours", "Team hours", "QA hours", "QA fails", "Revisions", "Broken or missed"]]
      .concat(hd.orders.map(x => [x.id, x.site, SNAME[x.stage] || x.stage, x.deadline, x.late ? "yes" : "", x.sales || "", x.pm || "", x.hours.client, x.hours.sales, x.hours.team, x.hours.qa, x.fails, x.revisions, (x.broken || []).join("; ")])))) ? 1 : 0;
    const drafts = all.filter(o => o.stage === "details");
    wrote += await gPut(email, st, "drafts", "Found by the team account (waiting for details)", st.folder.id, "sheet", csvOf([["Order", "Site", "Client", "Found", "What was found", "Past orders"]]
      .concat(drafts.map(o => [o.id, domOf(o.client.website), o.client.name, String(o.draft.found).slice(0, 10), ((o.draft.evidence || [])[0] || {}).what || "", (o.draft.past || []).join(" ")])))) ? 1 : 0;
    const T0 = hd.totals, hod = `<h1>HoD report, ${day}</h1><p><b>${hE(ins.headline || "No analyst reading yet today.")}</b></p>
      <p>Open orders: ${T0.open} · Late: ${T0.late} · Hours lost: client ${T0.client}, sales ${T0.sales}, project team ${T0.team}, QA ${T0.qa} · QA fails: ${T0.fails} · Client revisions: ${T0.revisions} · Drafts waiting for details: ${drafts.length}</p>
      ${(ins.todayForHod || []).length ? `<h2>For you today</h2><ol>${ins.todayForHod.map(x => `<li>${hE(x)}</li>`).join("")}</ol>` : ""}
      ${(ins.sides || []).length ? `<h2>Where time is lost</h2>${hTable(["Side", "Finding"], ins.sides.map(x => [x.side, x.finding]))}` : ""}
      ${(ins.missed || []).length ? `<h2>Missed or broken</h2><ul>${ins.missed.map(x => `<li>${hE(x)}</li>`).join("")}</ul>` : ""}
      ${(ins.improve || []).length ? `<h2>What would improve</h2>${hTable(["Change", "Expected effect"], ins.improve.map(x => [x.what, x.impact]))}` : ""}
      ${(ins.people || []).length ? `<h2>People</h2>${hTable(["Name", "Note"], ins.people.map(x => [x.name, x.note]))}` : ""}
      <h2>Open orders</h2>${hTable(["Order", "Site", "Stage", "Deadline", "Late", "PM", "Hours lost (client / sales / team / QA)"], hd.orders.map(x => [x.id, x.site, SNAME[x.stage] || x.stage, x.deadline, x.late ? "yes" : "", x.pm || "", [x.hours.client, x.hours.sales, x.hours.team, x.hours.qa].join(" / ")]))}
      ${drafts.length ? `<h2>Found by the team account, waiting for sales</h2>${hTable(["Order", "Site", "What was found"], drafts.map(o => [o.id, domOf(o.client.website), ((o.draft.evidence || [])[0] || {}).what || ""]))}` : ""}
      <p style="color:#777">Written by the order desk at ${hE(now().slice(0, 16).replace("T", " "))} UTC. Registers in this folder hold the full records.</p>`;
    wrote += await gPut(email, st, "hod", "HoD report (latest)", st.folder.id, "doc", hod) ? 1 : 0;
    wrote += await gPut(email, st, "day:" + day, "HoD report " + day, st.daily.id, "doc", hod) ? 1 : 0;
    // One record per order, rewritten when the order changed
    let n = 0;
    for(const o of live){ if(n >= (force ? 40 : 15)) break; const k = "ord:" + o.id, last = ((o.timeline || [])[0] || {}).at || o.at; if(st.files[k] && st.files[k].seen === last) continue;
      const ai = o.ai || {}, rec = `<h1>${hE(o.id)} · ${hE(domOf(o.client.website))}</h1>
        <p>${hE(o.client.name)} · ${hE((gigOf(o.gig) || {}).name || "")} (${hE(o.pkg)}) · $${hE(o.price)} · created ${hE(o.at.slice(0, 10))} · deadline ${hE(o.deadline)} · stage: <b>${hE(SNAME[o.stage] || o.stage)}</b></p>
        <p>Sales: ${hE(o.byName || "")} · PM: ${hE(o.pmName || nm(o.pm))} · QA: ${hE(o.qaName || nm(o.qa))}</p>
        ${ai.summary ? `<h2>Brief</h2><p>${hE(ai.summary)}</p>` : ""}
        <h2>Deliverables and proof</h2>${hTable(["Deliverable", "Done", "QA", "Proof"], (o.deliverables || []).map(d => [d.text, d.done ? "yes" : "", d.qa || "", proofsOf(d).map(p => (p.name || p.url) + (p.url ? " " + p.url : "")).join("; ")]))}
        <h2>Access</h2>${hTable(["Item", "Level", "Status"], (o.access || []).map(a => [a.item, a.level || "", a.status]))}
        <h2>Team questions</h2>${hTable(["Question set", "Status", "Answered"], (o.actions || []).filter(a => a.type === "internal").map(a => [a.title || "", a.status, (a.questions || []).filter(q => q.status === "answered").length + " of " + (a.questions || []).length]))}
        <h2>Timeline</h2><ul>${(o.timeline || []).slice(0, 80).map(t => `<li>${hE(String(t.at).slice(0, 16).replace("T", " "))} · ${hE(t.who)}: ${hE(t.what)}</li>`).join("")}</ul>`;
      if(await gPut(email, st, k, o.id + " · " + domOf(o.client.website), st.records.id, "doc", rec)){ wrote++; n++; } st.files[k].seen = last; }
    st.at = now(); st.error = ""; await setJ(REPK, st); return "wrote " + wrote + " files";
  }catch(e){ st.error = e.message; await setJ(REPK, st); throw e; }
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

  if(a === "me") return out({ ok:true, me:{ name:w.name, role:w.role, myRoles:w.roles || [w.role], uid:w.uid }, ai:aiOn(), accessEmail:"manavs909@gmail.com", cfg, gigs:GIGS, roles:ROLES,
    people:(await people()).filter(p => !p.off).map(p => ({ id:p.id, name:p.name, role:rolesOf(p)[0], roles:rolesOf(p) })), access:ACCESS });

  if(a === "gaccs"){ const ac = await gAccounts(); let pr = { items:[], at:"" }; try{ pr = url.searchParams.get("refresh") && w.role === "admin" ? await refreshProps() : await gProps(); }catch(e){ pr.error = e.message; }
    return out({ ok:true, accounts:ac.map(x => Object.assign(x, { gsc:pr.items.filter(i => i.email === x.email && i.kind === "gsc").length, ga:pr.items.filter(i => i.email === x.email && i.kind === "ga").length })), at:pr.at, errors:pr.errors || {} }); }
  if(a === "access"){ const site = str(url.searchParams.get("site"), 200), d = domOf(site); let gp = [];
    try{ gp = (await gProps()).items.filter(i => { const h = domOf(i.id.replace(/^sc-domain:/, "https://")); return i.kind === "gsc" ? h === d : (i.name || "").toLowerCase().includes(d.split(".")[0]); }); }catch(e){}
    return out({ ok:true, domain:d, register:await regOf(site), google:gp }); }
  const isA = w.role === "admin";
  const strip = o => { if(isA) return o; if(isProj(w)) return projView(o); const c = Object.assign({}, o); delete c.pay; return c; };
  if(a === "file"){ const v = await getJ(IK(str(url.searchParams.get("id"), 20))); if(!v) return bad("File not found", 404);
    return new Response(Buffer.from(v.data, "base64"), { headers:{ "content-type":v.type, "cache-control":"private, max-age=86400", "x-content-type-options":"nosniff", "content-disposition":"inline; filename=\"" + v.name.replace(/[^\w. -]/g, "") + "\"" } }); }
  if(isProj(w) && ["queue", "clients", "client", "clientSave", "leads", "lead", "score", "payments", "hod", "create"].includes(a)) return bad("This is for the sales team", 403);
  if(a === "list"){ const all = await loadAll(300, !isProj(w)); return out({ ok:true, orders:all.map(o => { const x = summary(o, cfg); if(!isA) delete x.econ; if(isProj(w)){ delete x.price; delete x.verdict; x.flags = x.flags.filter(f => !/message|reply/i.test(f.t)); } return x; }) }); }
  if(a === "hod"){ if(!isA) return bad("This report is for Manav only", 403); return out(Object.assign({ ok:true }, await hodData(!!url.searchParams.get("refresh")), { reports:await reportsState() })); }
  if(a === "reports"){ if(!isA) return bad("Reports are for Manav only", 403); return out({ ok:true, reports:await reportsState() }); }
  if(a === "reportsRun"){ if(!isA) return bad("Reports are for Manav only", 403); try{ const r = await driveReports(true); return out({ ok:true, info:r, reports:await reportsState() }); }catch(e){ return bad(e.message, 503); } }
  if(a === "inbox"){ const all = (await loadAll(400)).filter(o => !["done", "cancelled"].includes(o.stage)), items = [], mine = [];
    for(const o of all){
      const assigned = o.pm === w.uid || o.qa === w.uid || !isProj(w) || (!o.pm && (w.roles || []).includes("pm"));
      if(!assigned) continue;
      mine.push({ id:o.id, site:domOf(o.client.website), deadline:o.deadline, stage:o.stage, pmName:o.pmName || "", accessLeft:(o.access || []).filter(x => !["received", "skip"].includes(x.status)).length,
        done:(o.deliverables || []).filter(d => d.done).length, total:(o.deliverables || []).length, flags:flags(o).filter(f => !/message|reply|update/i.test(f.t)) });
      for(const x of (o.actions || []).filter(x => x.type === "internal" && !["done", "skipped"].includes(x.status)))
        items.push({ order:o.id, site:domOf(o.client.website), deadline:o.deadline, stage:o.stage, id:x.id, title:x.title, needBy:x.needBy, status:x.status, severity:x.severity, questions:x.questions || [], shared:x.shared || null, urgency:urgency(o, x), sentAt:x.at });
    }
    const rank = { urgent:0, important:1, normal:2 };
    return out({ ok:true, items:items.sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.deadline.localeCompare(b.deadline)), orders:mine.sort((a, b) => a.deadline.localeCompare(b.deadline)) }); }
  if(a === "order"){ const o = await getJ(T.ord(str(url.searchParams.get("id"), 20))); if(!o) return bad("Order not found", 404);
    (o.actions || []).forEach(x => { if(x.type === "internal" && (x.questions || []).length) x.message = internalText(o, x); });
    if((o.docs || []).length) groupDocs(o);
    { const n0 = (o.access || []).length; dedupeAccess(o); const ch = !["done", "cancelled", "details"].includes(o.stage) && autoAssign(o, await people()); if(o.access.length !== n0 || ch) await saveO(o); }
    const c = await getJ(CK(o.cid || cidOf(o.client.name)));
    return out({ ok:true, order:strip(o), econ:isA ? econ(o, cfg) : null, pay:isA ? payNums(o, cfg) : null, flags:isProj(w) ? flags(o).filter(f => !/message|reply|update|promise/i.test(f.t)) : flags(o), client:c && !isProj(w) ? { id:c.id, orders:c.orders.length, first:c.first } : null, history:await getJ(HK(domOf(o.client.website))) }); }
  if(a === "clients"){ const all = await loadAll(1000);
    for(const o of all) if(!o.cid){ o.cid = cidOf(o.client.name); await touchClient(o); await saveO(o); }
    const ids = await cmd("SMEMBERS", CLS), cs = (await mgetJ(ids.map(CK))).filter(Boolean);
    return out({ ok:true, clients:cs.map(c => clientSummary(c, all, cfg, isA)).sort((x, y) => (y.last || "").localeCompare(x.last || "")) }); }
  if(a === "client"){ const c = await getJ(CK(str(url.searchParams.get("id"), 80))); if(!c) return bad("Client not found", 404); const all = await loadAll(1000), os = all.filter(o => o.cid === c.id);
    const regs = {}; for(const d of c.sites || []) regs[d] = await regOf(d);
    const hist = {}; for(const d of c.sites || []) hist[d] = await getJ(HK(d));
    return out({ ok:true, client:c, history:hist, summary:clientSummary(c, all, cfg, isA), orders:os.map(o => Object.assign(summary(o, cfg), isA ? { pay:payNums(o, cfg) } : { econ:undefined })), register:regs,
      actions:os.flatMap(o => (o.actions || []).filter(x => x.status !== "done").map(x => Object.assign({ order:o.id }, x))).slice(0, 40) }); }
  if(a === "clientSave"){ if(!can(w, "assign")) return bad("Only Manav and managers", 403); const c = await getJ(CK(str(q.id, 80))); if(!c) return bad("Client not found", 404);
    if(q.notes != null) c.notes = redact(str(q.notes, 4000)); if(Array.isArray(q.tags)) c.tags = q.tags.slice(0, 10).map(t => str(t, 30)); await setJ(CK(c.id), c); return out({ ok:true, client:c }); }
  if(a === "payments"){ if(!isA) return bad("Payments are for Manav only", 403); const all = (await loadAll(1000)).filter(o => o.stage !== "cancelled"), m = str(url.searchParams.get("m"), 7) || now().slice(0, 7);
    const rows = all.map(o => Object.assign({ id:o.id, cid:o.cid, client:o.client.name, at:o.at, stage:o.stage, deliveredAt:o.deliveredAt || "", closedAt:o.closedAt || "" }, payNums(o, cfg)));
    const inM = rows.filter(r => r.at.slice(0, 7) === m), sum = (l, k) => +l.reduce((a, x) => a + x[k], 0).toFixed(2);
    const byC = {}; rows.forEach(r => { const x = byC[r.cid] = byC[r.cid] || { cid:r.cid, client:r.client, orders:0, gross:0, net:0, pending:0 }; x.orders++; x.gross += r.gross; x.net += r.net; if(r.status !== "cleared" && !/refund|cancel/.test(r.status)) x.pending += r.net; });
    return out({ ok:true, month:m, totals:{ orders:inM.length, gross:sum(inM, "gross"), net:sum(inM, "net"), tips:sum(inM, "tip"), refunds:sum(inM, "refund"),
      pending:sum(rows.filter(r => r.status !== "cleared" && !/refund|cancel/.test(r.status)), "net"), cleared:sum(rows.filter(r => r.status === "cleared" && (r.clearedAt || "").slice(0, 7) === m), "net") },
      rows:rows.sort((x, y) => y.at.localeCompare(x.at)), clients:Object.values(byC).map(x => Object.assign(x, { gross:+x.gross.toFixed(2), net:+x.net.toFixed(2), pending:+x.pending.toFixed(2) })).sort((a, b) => b.net - a.net) }); }

  if(a === "queue"){ const all = await loadAll(); const items = [];
    all.filter(o => !['done', 'cancelled'].includes(o.stage)).forEach(o => (o.queue || []).forEach(x => { if(!x.sent || (x.reply && !x.seen)) items.push(Object.assign({ order:o.id, client:o.client.name, stage:o.stage }, x)); }));
    return out({ ok:true, items:items.sort((x, y) => x.at.localeCompare(y.at)) }); }

  if(a === "score"){ if(!can(w, "assign")) return bad("Only Manav and managers see the scorecard", 403);
    const m = str(url.searchParams.get("m"), 7) || now().slice(0, 7), all = await loadAll(1000);
    const ai = await cmd("HGETALL", "bsp:ai:" + m); const aiu = {}; for(let i = 0; i < ai.length; i += 2) aiu[ai[i]] = Number(ai[i + 1]);
    return out({ ok:true, score:score(all, cfg, m), ai:{ calls:aiu.calls || 0, usd:+((aiu.micro || 0) / 1e6).toFixed(3), order:+((aiu["micro:order"] || 0) / 1e6).toFixed(3),
      lead:+((aiu["micro:lead"] || 0) / 1e6).toFixed(3), format:+((aiu["micro:format"] || 0) / 1e6).toFixed(3), reply:+((aiu["micro:reply"] || 0) / 1e6).toFixed(3), credit:200 } }); }

  /* One search over orders, clients and leads: name, username, site, order number, gig, notes and (for sales) what was said in the chat */
  if(a === "search"){ const t = str(url.searchParams.get("q"), 80).toLowerCase(); if(t.length < 2) return out({ ok:true, orders:[], clients:[], leads:[] });
    const PJ = isProj(w), hit = (...xs) => xs.some(x => String(x || "").toLowerCase().includes(t));
    const snip = x => { const s0 = String(x || ""), i = s0.toLowerCase().indexOf(t); return i < 0 ? "" : (i > 40 ? "…" : "") + s0.slice(Math.max(0, i - 40), i + t.length + 60).replace(/\s+/g, " ") + "…"; };
    const all = await loadAll(1000, !PJ), orders = [];
    for(const o of all){ const g = (gigOf(o.gig) || {}).name || "", base = hit(o.id, o.client.name, o.client.website, g, o.client.country);
      const inChat = !base && !PJ && (hit(o.chat, o.calls, o.remarks) ? snip(o.chat) || snip(o.calls) || snip(o.remarks) : "");
      if(base || inChat) orders.push({ id:o.id, client:o.client.name, site:domOf(o.client.website), gig:g, stage:o.stage, deadline:o.deadline, at:o.at, match:inChat ? "In the chat: " + inChat : "" }); }
    let clients = [], leads = [];
    if(!PJ){ const ids = await cmd("SMEMBERS", CLS), cs = (await mgetJ(ids.map(CK))).filter(Boolean);
      clients = cs.filter(c => hit(c.name, (c.sites || []).join(" "), c.notes, (c.tags || []).join(" "), c.country)).map(c => ({ id:c.id, name:c.name, sites:c.sites || [], orders:(c.orders || []).length, last:c.last, match:hit(c.notes) ? snip(c.notes) : "" }));
      if(can(w, "lead")){ const l = (await cmd("LRANGE", T.leads, 0, 299)).map(x => JSON.parse(x)).filter(x => can(w, "assign") || x.by === w.uid);
        leads = l.filter(x => hit(x.title, x.note, x.chat, x.byName)).map(x => ({ id:x.id, title:x.title, at:x.at, by:x.byName, stage:(x.result || {}).stage || "", match:hit(x.title) ? "" : snip(x.note) || snip(x.chat) })); } }
    return out({ ok:true, q:t, orders:orders.slice(0, 30), clients:clients.slice(0, 20), leads:leads.slice(0, 20) }); }
  if(a === "leads"){ const l = (await cmd("LRANGE", T.leads, 0, 99)).map(x => JSON.parse(x)); return out({ ok:true, leads:can(w, "assign") ? l : l.filter(x => x.by === w.uid) }); }
  if(a === "lead"){ if(!can(w, "lead")) return bad("Lead help is for sales", 403);
    if(!aiOn()) return bad("AI helpers are off until the API key is added in Vercel", 503);
    if(await rateLimit("tmlead:" + w.uid, 40, 3600)) return bad("Too many lead checks this hour", 429);
    const chat = redact(str(q.chat, 50000)); if(chat.length < 40) return bad("Paste the whole chat first");
    const p = leadPrompt(chat, GIGS, str(q.note, 1000)); const r = await askAI("lead", "claude-sonnet-5-5", p.system, p.user, 4000);
    const item = { id:nid("L"), at:now(), by:w.uid, byName:w.name, title:str(q.title, 80) || "Lead", note:str(q.note, 1000), chat:chat.slice(0, 8000), result:r.data, usd:+r.usd.toFixed(4) };
    await pipe([["LPUSH", T.leads, JSON.stringify(item)], ["LTRIM", T.leads, 0, 299]]);
    return out({ ok:true, lead:item }); }

  if(a === "create"){ if(!can(w, "create")) return bad("Only sales can create orders", 403);
    const f = orderFields(q); if(f.error) return bad(f.error);
    const n = await cmd("INCR", T.seq), id = "O-" + (1000 + Number(n));
    const o = Object.assign({ id, at:now(), by:w.uid, byName:w.name, fee:cfg.fee, queue:[], hours:[], revisions:[], qaRounds:[], timeline:[] }, f.fields);
    const ai = await launch(o, w, cfg); return out({ ok:true, id, ai }); }

  if(a === "person" || a === "personOff" || a === "newCode" || a === "cfg" || a === "personRoles"){
    if(w.role !== "admin") return bad("Only Manav can change people and settings", 403);
    if(a === "cfg"){ const c = { fee:Math.min(50, Math.max(0, num(q.fee, cfg.fee))), hourly:Math.min(200, Math.max(0, num(q.hourly, cfg.hourly))) }; await setJ(T.cfg, c); return out({ ok:true, cfg:c }); }
    let p;
    if(a === "person"){ const rs = (Array.isArray(q.roles) ? q.roles : [q.role]).filter(r => ROLES.includes(r)); const name = str(q.name, 60); if(!name || !rs.length) return bad("Type the name and pick at least one role"); p = { id:nid("u"), name, role:rs[0], roles:[...new Set(rs)], rev:1, at:now() }; }
    else { const raw = await cmd("HGET", T.people, str(q.uid, 20)); p = raw ? JSON.parse(raw) : null; if(!p) return bad("Person not found", 404); }
    if(a === "personRoles"){ const rs = (Array.isArray(q.roles) ? q.roles : []).filter(r => ROLES.includes(r)); if(!rs.length) return bad("Pick at least one role");
      p.roles = [...new Set(rs)]; p.role = p.roles[0]; await cmd("HSET", T.people, p.id, JSON.stringify(p));
      if(p.roles.some(r => r === "pm" || r === "qa")){ const ps = await people(); for(const o of (await loadAll(300)).filter(x => !["done", "cancelled"].includes(x.stage))) if(autoAssign(o, ps)) await saveO(o); }
      return out({ ok:true, roles:p.roles }); }
    if(a === "personOff"){ p.off = !p.off; p.rev = (p.rev || 1) + 1; await cmd("HSET", T.people, p.id, JSON.stringify(p)); return out({ ok:true }); }
    if(p.codeHash) await cmd("DEL", T.code(p.codeHash));
    const code = crypto.randomBytes(8).toString("base64").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 10).padEnd(10, "7");
    p.codeHash = sha(code); p.rev = (p.rev || 1) + (a === "newCode" ? 1 : 0);
    await pipe([["HSET", T.people, p.id, JSON.stringify(p)], ["SET", T.code(p.codeHash), p.id]]);
    if(rolesOf(p).some(r => r === "pm" || r === "qa")){ const ps = await people(); for(const o of (await loadAll(300)).filter(x => !["done", "cancelled"].includes(x.stage))) if(autoAssign(o, ps)) await saveO(o); }
    return out({ ok:true, id:p.id, code }); }
  if(a === "people"){ if(w.role !== "admin") return bad("Only Manav", 403); return out({ ok:true, people:(await people()).map(p => ({ id:p.id, name:p.name, role:rolesOf(p)[0], roles:rolesOf(p), off:!!p.off, at:p.at })) }); }

  if(a === "do"){
    const o = await getJ(T.ord(str(q.id, 20))); if(!o) return bad("Order not found", 404);
    const op = str(q.op, 20), find = (list, id) => (o[list] || []).find(x => x.id === id);
    if(isProj(w) && ["update", "reply", "sent", "share", "pay", "edit", "deliver", "revision", "close", "actEdit", "regOff"].includes(op)) return bad("This step is for the sales and client messages team", 403);
    const need = what => { if(!can(w, what)) throw new Error("Your role cannot do this step"); };
    if(o.stage === "details" && !["complete", "notOrder", "history", "note"].includes(op)) return bad("Add the order details first (client chat, package, price and deadline)");
    if(op === "complete"){ need("create"); if(o.stage !== "details") return bad("This order already has its details");
      const f = orderFields(Object.assign({ website:o.client.website, client:o.client.name, country:o.client.country }, q, { website:q.website || o.client.website })); if(f.error) return bad(f.error);
      Object.assign(o, f.fields, { by:w.uid, byName:w.name, completedAt:now() }); log(o, w, "Order details added");
      const ai = await launch(o, w, cfg); return out({ ok:true, order:strip(o), econ:isA ? econ(o, cfg) : null, pay:isA ? payNums(o, cfg) : null, flags:flags(o), ai, history:await getJ(HK(domOf(o.client.website))) }); }
    else if(op === "notOrder"){ need("create"); if(o.stage !== "details") return bad("Only a draft can be marked as not an order");
      setStage(o, "cancelled"); o.cancelWhy = "Not an order: " + str(q.why, 200); log(o, w, o.cancelWhy);
      if(q.ignoreSite){ await cmd("SADD", DIGN, domOf(o.client.website)); log(o, w, "The order desk will not open drafts for " + domOf(o.client.website) + " again"); } }
    else if(op === "history"){ if(isProj(w) && !can(w, "pm")) return bad("Not for this role", 403); const site = domOf(o.client.website); if(!site) return bad("This order has no site");
      const all = await loadAll(1000, true); const hv = await buildHistory(site, all.filter(x => domOf(x.client.website) === site).map(x => x.id)); if(!hv) return bad("The AI helpers are off", 503);
      log(o, w, "Work history for " + site + " rebuilt from the team's emails, chats and files"); }
    else if(op === "analyse"){ need("pm"); if(!o.site || o.site.error || Date.now() - Date.parse(o.site.at || 0) > 7 * 864e5) o.site = null; o.chat = redact(o.chat); o.calls = redact(o.calls); const r = await analyse(o, cfg); if(!r.ok) return bad(r.why, 503); log(o, w, "Order desk ran again"); }
    else if(op === "site"){ need("pm"); o.site = await siteCheck(o.client.website); if(o.site) o.site.at = now(); log(o, w, "Website checked again" + (o.site && o.site.error ? ": did not open" : "")); }
    else if(op === "format"){ await formatConvo(o); log(o, w, "Client conversation laid out again"); }
    else if(op === "access"){ need("pm"); const x = find("access", q.aid); if(!x) return bad("Not found");
      x.status = ["needed", "asked", "received", "wrong", "skip"].includes(q.status) ? q.status : x.status; if(x.status === "received" && !x.receivedAt) x.receivedAt = now(); x.note = str(q.note, 300); x.by = w.name; x.atS = now();
      log(o, w, "Access " + x.item + ": " + x.status + (x.note ? " (" + x.note + ")" : ""));
      if(x.status === "wrong" && !(o.actions || []).some(y => y.accessFix === x.id && !["done", "skipped"].includes(y.status))) (o.actions = o.actions || []).push({ id:nid("x"), accessFix:x.id, title:"Fix access: " + x.item, why:"The project team found the wrong level" + (x.note ? ": " + x.note : ""), owner:"comms", type:"client", to:"client", severity:"high",
        message:"Hi! Thank you for the access. One small thing: for " + x.item + " we need the level \"" + x.level + "\" so we can finish the work." + (x.note ? " (" + x.note + ")" : "") + " Could you update it when you have a moment? Thank you!", questions:[], status:"open", at:now(), created:now(), by:w.name, byTeam:true });
      if(o.stage === "access" && o.access.every(y => ["received", "skip"].includes(y.status))){ setStage(o, "work"); log(o, { name:"Order desk" }, "All access received at the right level. Work can start."); } }
    else if(op === "addAccess"){ need("pm"); o.access.push({ id:nid("a"), item:str(q.item, 120), level:str(q.level, 200), why:str(q.why, 200), status:"needed" }); log(o, w, "Added access item " + str(q.item, 120)); }
    else if(op === "startAnyway"){ need("assign"); const why = str(q.why, 300); if(!why) return bad("Write why work starts before all access is in"); setStage(o, "work"); log(o, w, "Started before all access was in: " + why); }
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
      const raw = redact(str(q.text, 90000)), ufiles = await saveFiles(q.files); if(raw.length < 3 && !ufiles.length) return bad("Paste something first");
      let k;
      if(raw.length >= 3) k = await intake(o, raw, w); else k = { kind:"media", added:0, fresh:"" };
      if(ufiles.length){
        const blocks = await fileBlocks(ufiles, raw), rr = await askAI("intake", "claude-sonnet-5-5", "You read screenshots or files shared on an order of an SEO, web and ads agency (from the client or our team). Say plainly what each shows, no dashes. Answer with one JSON object only: {\"items\":[{\"file\":\"\",\"shows\":\"\",\"from\":\"client | team | unclear\"}]}", [{ type:"text", text:"Order " + o.id + ". Note pasted with them: " + (raw || "none") }].concat(blocks), 2500);
        o.aiUsd = +(num(o.aiUsd, 0) + rr.usd).toFixed(4); const its = (rr.data && rr.data.items) || [];
        (o.notes = o.notes || []).push({ id:nid("n"), kind:"media", title:ufiles.length + " screenshot" + (ufiles.length > 1 ? "s or files" : " or file") + " shared", text:its.map(i => i.file + ": " + i.shows).join("\n"), files:ufiles, from:(its[0] || {}).from || "", at:now(), by:w.name });
        k.added = (k.added || 0) + 1; k.fresh = (k.fresh || "") + "\nFILES SHARED: " + its.map(i => i.file + " (" + i.from + "): " + i.shows).join("; ");
      }
      o.lastUpdateAt = now(); o.lastUpdateBy = w.name;
      if(!k.added){ log(o, w, "Pasted the conversation again: nothing new found"); await saveO(o); return out({ ok:true, order:strip(o), econ:isA ? econ(o, cfg) : null, pay:isA ? payNums(o, cfg) : null, flags:flags(o), info:"Nothing new in that paste. The thread is already up to date." }); }
      const d = await rethink(o, k.fresh);
      log(o, w, (k.kind === "chat" ? k.added + " new message" + (k.added > 1 ? "s" : "") + " added" : { call:"Call notes", team:"Team update", media:"Files shared", note:"Note" }[k.kind] + " added") + (d.changed ? ". " + str(d.changed, 300) : ""));
      await saveO(o); return out({ ok:true, order:strip(o), econ:isA ? econ(o, cfg) : null, pay:isA ? payNums(o, cfg) : null, flags:flags(o), info:(k.kind === "chat" ? k.added + " new message" + (k.added > 1 ? "s" : "") : "Added") + ". " + (d.changed || "") }); }
    else if(op === "actReply"){ if(!can(w, "comms") && !can(w, "pm")) return bad("Your role cannot do this step"); const x = find("actions", q.aid); if(!x) return bad("Not found");
      const text = redact(str(q.text, 12000)); if(text.length < 2 && !(q.files || []).length) return bad("Paste their reply or a screenshot first"); if(!aiOn()) return bad("The AI helpers are off", 503);
      if(!(x.questions || []).length) x.questions = [{ q:x.title, status:"" }];
      const files = await saveFiles(q.files), p = teamReplyPrompt(o, x, text || "(see the attached screenshots)"), extra = await fileBlocks(files, text);
      const r = await askAI("teamreply", "claude-sonnet-5-5", p.system, extra.length ? [{ type:"text", text:p.user }].concat(extra) : p.user, 5000); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
      const d = r.data || {}; (d.answers || []).forEach(an => { const qq = x.questions[(an.n || 0) - 1]; if(qq){ qq.answer = str(an.answer, 400) || qq.answer; qq.status = an.status || qq.status; if(an.status === "disagree") qq.reason = str(an.reason, 400) || qq.answer; } });
      (x.replies = x.replies || []).push({ text, files, evidence:(d.evidence || []).slice(0, 6).map(e => ({ file:str(e.file, 120), shows:str(e.shows, 400) })), at:now(), by:w.name, summary:str(d.summary, 300) });
      const left = x.questions.filter(qq => qq.status !== "answered" && qq.status !== "disagree"), dis = x.questions.filter(qq => qq.status === "disagree");
      x.status = dis.length ? "decide" : left.length ? "waiting" : "done";
      x.statusWhy = dis.length ? "The team disagrees on " + dis.length + ": " + dis.map(qq => qq.reason).join("; ").slice(0, 300) : left.length ? left.length + " of " + x.questions.length + " still open: follow-up ready" : "All answered"; x.at = now(); x.by = w.name;
      if(left.length){ (d.followUp || []).forEach((f, i) => { if(left[i]) left[i].q = str(f, 300) || left[i].q; }); x.message = internalText(o, x); }
      (o.notes = o.notes || []).push({ id:nid("n"), kind:"team", title:"Team reply: " + x.title.slice(0, 80), text, files, from:x.to || "Project team", at:now(), by:w.name });
      log(o, w, "Team replied to \"" + x.title.slice(0, 60) + "\": " + (d.summary || "") + (left.length ? " (" + left.length + " still open)" : " (all answered)"));
      try{ await rethink(o, "TEAM REPLY to \"" + x.title + "\": " + text + "\nFacts: " + (d.facts || []).join("; ") + ((d.evidence || []).length ? "\nScreenshots show: " + d.evidence.map(e => e.file + ": " + e.shows).join("; ") : "")); }catch(e){}
      o.lastUpdateAt = now(); o.lastUpdateBy = w.name; }
    else if(op === "share"){ if(!can(w, "comms") && !can(w, "create")) return bad("Your role cannot do this step"); const m = ((o.convo || {}).messages || [])[num(q.mi, -1)]; if(!m) return bad("Message not found");
      const item = { who:m.who, name:m.name, time:m.time, text:m.text, files:m.files || [], note:redact(str(q.note, 600)), at:now(), by:w.name }; (o.shared = o.shared || []).push(item);
      const qs = toQs((Array.isArray(q.questions) ? q.questions : [q.question]).filter(Boolean)); if(!qs.length) qs.push({ q:"Please read this client message and tell us how we should answer.", status:"" });
      const x = { id:nid("x"), title:"Client message for the team: " + String(m.text).replace(/\s+/g, " ").slice(0, 60), why:item.note || "Shared by sales", owner:"pm", type:"internal", to:"project team", severity:q.urgent ? "high" : "medium", message:"", questions:qs, needBy:str(q.needBy, 60) || "today", status:"open", at:now(), created:now(), by:w.name, shared:item };
      x.message = internalText(o, x) + "\n\nClient wrote" + (m.time ? " (" + m.time + ")" : "") + ":\n\"" + String(m.text).slice(0, 1500) + "\""; (o.actions = o.actions || []).push(x);
      log(o, w, "Shared a client message with the project team"); }
    else if(op === "pmAsk"){ if(!isProj(w) && !can(w, "assign")) return bad("This is for the project team"); const t = redact(str(q.text, 3000)); if(!t) return bad("Write what you need from the client");
      (o.actions = o.actions || []).push({ id:nid("x"), title:"Project team needs from the client", why:"Asked by " + w.name + " (" + (q.kind || "info") + ")", owner:"comms", type:"client", to:"client", severity:q.urgent ? "high" : "medium",
        message:t, questions:[], status:"open", at:now(), created:now(), by:w.name, byTeam:true, statusWhy:"Sales checks the wording and sends it on the marketplace" });
      log(o, w, "Asked sales to get something from the client: " + t.slice(0, 120)); }
    else if(op === "actEdit"){ if(!can(w, "comms") && !can(w, "pm")) return bad("Your role cannot do this step"); const x = find("actions", q.aid); if(!x) return bad("Not found");
      if(x.type === "internal"){ if(Array.isArray(q.questions)){ const before = (x.questions || []).map(qq => qq.q), keep = q.questions.map(t => str(t, 300)).filter(Boolean).slice(0, 5);
          before.filter(b => !keep.includes(b)).forEach(b => (o.dropped = o.dropped || []).push(b));
          x.questions = keep.map(t => (x.questions || []).find(qq => qq.q === t) || { q:t, status:"" }); }
        if(q.needBy != null) x.needBy = str(q.needBy, 60); if(!x.questions.length) return bad("Keep at least one question, or skip the step"); x.message = internalText(o, x); }
      else if(q.message != null){ x.message = String(q.message).slice(0, 4000); }
      x.edited = now(); x.editedBy = w.name; log(o, w, "Edited \"" + x.title.slice(0, 70) + "\" before sending"); }
    else if(op === "actSkip"){ const x = find("actions", q.aid); if(!x) return bad("Not found"); const why = str(q.why, 300); if(!why) return bad("Say why this step is not needed");
      x.status = "skipped"; x.note = why; x.at = now(); x.by = w.name; log(o, w, "Skipped \"" + x.title.slice(0, 70) + "\": " + why); }
    else if(op === "pmAnswer"){ if(!can(w, "pm") && !can(w, "comms")) return bad("Your role cannot do this step"); const x = find("actions", q.aid); if(!x) return bad("Not found");
      const list = Array.isArray(q.answers) ? q.answers : [], files = await saveFiles(q.files); let n = 0;
      for(const an of list){ const qq = (x.questions || [])[num(an.n, 0)]; if(!qq) continue;
        if(an.disagree){ const why = redact(str(an.reason, 400)); if(!why) return bad("Say why you disagree with question " + (num(an.n, 0) + 1)); qq.status = "disagree"; qq.reason = why; qq.by = w.name; n++; }
        else if(str(an.answer, 10)){ qq.status = "answered"; qq.answer = redact(str(an.answer, 600)); qq.by = w.name; n++; } }
      if(!n && !files.length) return bad("Answer at least one question, or say which ones you disagree with");
      const text = (x.questions || []).map((qq, i) => (i + 1) + ". " + (qq.status === "disagree" ? "Disagree: " + qq.reason : qq.answer || "(no answer yet)")).join("\n") + (str(q.note, 10) ? "\n\n" + redact(str(q.note, 1500)) : "");
      (x.replies = x.replies || []).push({ text, files, at:now(), by:w.name, summary:n + " of " + x.questions.length + " answered or disputed" });
      const dis = x.questions.filter(qq => qq.status === "disagree"), left = x.questions.filter(qq => !["answered", "disagree"].includes(qq.status));
      x.status = dis.length ? "decide" : left.length ? "waiting" : "done";
      x.statusWhy = dis.length ? w.name + " disagrees on " + dis.length + ": " + dis.map(qq => qq.reason).join("; ").slice(0, 300) : left.length ? left.length + " of " + x.questions.length + " still open" : "All answered by " + w.name; x.at = now(); x.by = w.name;
      if(left.length && !dis.length) x.message = internalText(o, x);
      (o.notes = o.notes || []).push({ id:nid("n"), kind:"team", title:"Team reply: " + x.title.slice(0, 80), text, files, from:w.name, at:now(), by:w.name });
      log(o, w, "Answered \"" + x.title.slice(0, 60) + "\": " + x.statusWhy);
      if(aiOn()) try{ await rethink(o, "TEAM ANSWERS to \"" + x.title + "\":\n" + text); }catch(e){}
      o.lastUpdateAt = now(); o.lastUpdateBy = w.name; }
    else if(op === "actObject"){ need("pm"); const x = find("actions", q.aid); if(!x) return bad("Not found"); const qq = (x.questions || [])[num(q.qn, 0)]; if(!qq) return bad("Not found");
      const why = str(q.why, 400); if(!why) return bad("Say why you do not agree"); qq.status = "disagree"; qq.reason = why; qq.by = w.name;
      x.status = "decide"; x.statusWhy = w.name + " disagrees: " + why; x.at = now(); x.by = w.name; log(o, w, "Disagrees with \"" + qq.q.slice(0, 80) + "\": " + why); }
    else if(op === "decide"){ const x = find("actions", q.aid); if(!x) return bad("Not found"); const note = str(q.note, 400);
      if(q.choice === "accept"){ (x.questions || []).filter(qq => qq.status === "disagree").forEach(qq => { qq.status = "answered"; qq.answer = "Agreed with the team: " + (qq.reason || ""); (o.dropped = o.dropped || []).push(qq.q); });
        x.decision = "Agreed with the team" + (note ? ": " + note : ""); const left = (x.questions || []).filter(qq => qq.status !== "answered"); x.status = left.length ? "waiting" : "done"; x.statusWhy = x.decision; }
      else { if(!can(w, "assign") && !note) return bad("Write why we still need it, for the manager");
        (x.questions || []).filter(qq => qq.status === "disagree").forEach(qq => { qq.status = ""; qq.q = qq.q + (note ? " (needed because: " + note + ")" : ""); });
        x.decision = "Kept" + (note ? ": " + note : ""); x.owner = can(w, "assign") ? x.owner : "manager"; x.status = "open"; x.statusWhy = can(w, "assign") ? "Decided to keep it" : "Passed to the manager to decide"; x.message = internalText(o, x); }
      x.at = now(); x.by = w.name; log(o, w, "Decision on \"" + x.title.slice(0, 70) + "\": " + x.decision); }
    else if(op === "action"){ const x = find("actions", q.aid); if(!x) return bad("Not found"); if(!ASTAT.includes(q.status)) return bad("Unknown status");
      x.status = q.status; x.note = str(q.note, 500) || x.note; x.at = now(); x.by = w.name; x.statusWhy = ""; if(q.status === "sent" && !x.sentAt){ x.sentAt = now(); x.sentBy = w.name; } log(o, w, "Action \"" + x.title.slice(0, 70) + "\": " + x.status + (q.note ? " (" + str(q.note, 200) + ")" : "")); }
    else if(op === "pay"){ if(w.role !== "admin") return bad("Payments are for Manav only", 403); const p = payOf(o);
      if(q.status && ["paid", "pending clearance", "cleared", "refunded", "cancelled"].includes(q.status)){ p.status = q.status; if(q.status === "cleared") p.clearedAt = now().slice(0, 10); }
      if(q.clearsOn && /^\d{4}-\d{2}-\d{2}$/.test(q.clearsOn)) p.clearsOn = q.clearsOn;
      if(q.extra && num(q.extra.amount, 0) > 0) p.extras.push({ what:str(q.extra.what, 120), amount:num(q.extra.amount, 0), at:now() });
      if(q.tip != null) p.tip = Math.max(0, num(q.tip, 0)); if(q.refund != null) p.refund = Math.max(0, num(q.refund, 0)); if(q.note != null) p.note = str(q.note, 400);
      o.pay = p; log(o, w, "Payment updated: " + p.status); }
    else if(op === "regAdd"){ if(!can(w, "pm") && !can(w, "comms")) return bad("Your role cannot do this step"); const d = domOf(o.client.website); if(!d) return bad("This order has no client website");
      const system = Object.keys(SYS).includes(q.system) ? q.system : "Other", account = redact(str(q.account, 120)); if(!account) return bad("Type which account or user we use (email or username), never the password");
      if(/pass(word)?|pwd/i.test(String(q.account) + String(q.note) + String(q.holder))) return bad("Do not type passwords here. Write only which account we use and where the login is kept.");
      const list = await regOf(o.client.website), e = { id:nid("r"), system, account, level:redact(str(q.level, 120)), holder:redact(str(q.holder, 120)), note:redact(str(q.note, 400)), at:now(), by:w.name, orders:[o.id], active:true };
      const same = list.find(x => x.system === system && x.account.toLowerCase() === account.toLowerCase()); if(same){ Object.assign(same, { level:e.level || same.level, holder:e.holder || same.holder, note:e.note || same.note, active:true }); if(!same.orders.includes(o.id)) same.orders.push(o.id); } else list.push(e);
      await setJ(RK(d), list); applyRegister(o, list); log(o, w, "Access on file for " + d + ": " + system + " via " + account); }
    else if(op === "regOff"){ if(!can(w, "pm")) return bad("Your role cannot do this step"); const d = domOf(o.client.website), list = await regOf(o.client.website), x = list.find(r => r.id === q.rid); if(!x) return bad("Not found");
      x.active = !x.active; x.offAt = now(); await setJ(RK(d), list); log(o, w, "Access " + x.system + " via " + x.account + (x.active ? " active again" : " marked removed")); }
    else if(op === "useProp"){ if(!can(w, "pm") && !can(w, "qa")) return bad("Your role cannot do this step"); o.google = o.google || {}; o.google[q.kind === "ga" ? "ga" : "gsc"] = { id:str(q.pid, 200), email:str(q.email, 120) };
      log(o, w, "Uses " + (q.kind === "ga" ? "Analytics " : "Search Console ") + str(q.pid, 200) + " through " + str(q.email, 120)); }
    else if(op === "sync"){ const r = await syncTeam(o); try{ r.new += await matchDocs([o]); }catch(e){} log(o, w, "Checked the team's folder, email and chat: " + r.new + " new" + (Object.keys(r.errors || {}).length ? " (some sources could not be read)" : "")); }
    else if(op === "doc"){ const x = find("docs", q.did); if(!x) return bad("Not found"); if(q.ours){ x.status = "linked"; x.by2 = w.name; } else { x.status = "rejected"; x.by2 = w.name; }
      await cmd("SET", DK(x.id), JSON.stringify({ order:q.ours ? o.id : "", confidence:q.ours ? 1 : 0, at:now(), by:w.name }), "EX", 60 * 60 * 24 * 365);
      if(q.ours && q.deliv){ const d = find("deliverables", q.deliv); if(d){ d.proofs = proofsOf(d).concat({ id:nid("p"), kind:"drive", url:x.link, name:x.name, meta:{ ok:true, id:x.id, name:x.name, kind:x.kind, modified:x.modified, lastBy:x.by, via:x.via }, at:now(), by:w.name }); delete d.proof; } }
      groupDocs(o); log(o, w, (q.ours ? "Confirmed our document: " : "Not this order: ") + x.name + (q.deliv ? " (used as proof)" : "")); }
    else if(op === "docDiff"){ const x = find("docs", q.did); if(!x) return bad("Not found"); if(!aiOn()) return bad("The AI helpers are off", 503); groupDocs(o);
      const gk = x.group; let splits = 0;
      /* Keep comparing the newest two copies; each copy that turns out to be a different report is split off, until the rest really are versions of one document */
      for(let round = 0; round < 6; round++){
      const same = (o.docs || []).filter(d => d.group === gk && d.status !== "rejected").sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
      if(round && same.length < 2) break;
      let pair = null, how = "";
      if(same.length >= 2){ pair = { after:{ at:same[0].modified, by:same[0].by, text:await docText(same[0]) }, before:{ at:same[1].modified, by:same[1].by, text:await docText(same[1]) } }; how = "newest copy against the one before"; }
      if((!pair || (!pair.after.text && !pair.before.text)) && /document$/.test(x.mime || "")){ const rv = await revisionTexts(same[0] || x); if(rv){ pair = rv; how = "the last two saved versions of the document (" + rv.count + " in all)"; } }
      if(!pair || (!pair.after.text && !pair.before.text)){ if(round) break; return bad("There is only one version to read so far, or this file type cannot be compared as text"); }
      if(pair.after.text === pair.before.text){ o.docGroups = o.docGroups || {}; o.docGroups[gk] = { at:now(), how, summary:"No change in the text between the two versions.", changes:[], numbers:[], useNewer:true, flags:[] }; }
      else { /* Long files: send only the lines that differ (plus the header), so the comparison is cheap, complete and exact */
        const big = (pair.before.text.length + pair.after.text.length) > 9000;
        if(big){ const A = pair.before.text.split(/\r?\n/), B = pair.after.text.split(/\r?\n/), sa = new Set(A), sb = new Set(B), head = B[0] || A[0] || "";
          const gone = A.filter(l => l.trim() && !sb.has(l)), added = B.filter(l => l.trim() && !sa.has(l));
          const cut = (l, n) => l.slice(0, n).join("\n") + (l.length > n ? "\n(+" + (l.length - n) + " more lines)" : "");
          pair.before = Object.assign({}, pair.before, { text:"First line: " + head + "\nLines only in this older version (" + gone.length + " of " + A.length + "):\n" + cut(gone, 120) });
          pair.after = Object.assign({}, pair.after, { text:"Lines only in this newer version (" + added.length + " of " + B.length + "):\n" + cut(added, 120) }); how += " (only the changed lines were read)"; }
        const p = diffPrompt(o, x.name, pair.before, pair.after), r = await askAI("diff", "claude-haiku-5-5", p.system, p.user, 8000); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
        o.docGroups = o.docGroups || {}; o.docGroups[gk] = Object.assign(r.data || {}, { at:now(), how });
        /* Same name, different report: split the newer one off so both are read */
        if(r.data && r.data.sameDoc === false && same.length >= 2){ same[0].split = true; same[0].splitWhy = str(r.data.whatEach || "Different report with the same name", 240); groupDocs(o); splits++;
          o.docGroups[same[0].group] = Object.assign({}, o.docGroups[gk], { summary:"Kept as its own report: " + same[0].splitWhy }); delete o.docGroups[gk]; continue; } }
      break; }
      log(o, w, "Compared versions of " + x.name + (splits ? ": " + splits + " cop" + (splits > 1 ? "ies were" : "y was") + " a different report and now " + (splits > 1 ? "are" : "is") + " read on " + (splits > 1 ? "their" : "its") + " own" : "") + (o.docGroups[gk] ? ": " + str(o.docGroups[gk].summary, 200) : "")); }
    else if(op === "intel"){ const r = await buildIntel(o); log(o, w, r.found ? "Read Google data and updated the business analysis" + (r.access ? "; access found for " + r.access + " item(s)" : "") : "No connected Google account can see this site's Search Console or Analytics yet"); }
    else if(op === "verify"){ if(!can(w, "pm") && !can(w, "qa")) return bad("Your role cannot do this step"); const v = await verifyOrder(o.client.website, o.google && o.google.gsc); o.verify = v; (o.verifyLog = o.verifyLog || []).unshift(v); o.verifyLog = o.verifyLog.slice(0, 12);
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
    else if(op === "proofNewest"){ need("pm"); const d = find("deliverables", q.did); if(!d) return bad("Not found"); groupDocs(o);
      const p = proofsOf(d).find(x => x.id === q.pid); if(!p || !p.newer) return bad("This proof is already the newest copy");
      const cur = find("docs", p.newer.id); d.proofs = proofsOf(d); delete d.proof;
      Object.assign(p, { url:cur.link, name:cur.name, meta:{ ok:true, id:cur.id, name:cur.name, kind:cur.kind, modified:cur.modified, lastBy:cur.by, via:cur.via }, at:now(), by:w.name }); delete p.newer; delete d.check;
      log(o, w, "Proof switched to the newest copy: " + cur.name); }
    else if(op === "toQA"){ need("pm"); groupDocs(o); { const st = staleProofs(o); if(st.length) return bad("A newer copy exists for: " + st.join(", ") + ". Switch to the newest first (Use the newest, under the proof)."); } const left = o.deliverables.filter(d => !d.done || !proofsOf(d).length); if(left.length) return bad("Every deliverable needs proof and Done first (" + left.length + " left)");
      o.deliverables.forEach(d => { d.qa = ""; d.qaNote = ""; });
      setStage(o, "qa"); log(o, w, "Sent to QA"); }
    else if(op === "qa"){ need("qa"); if(o.stage !== "qa") return bad("This order is not waiting for QA");
      const unmarked = o.deliverables.filter(d => !d.qa); if(unmarked.length) return bad("Mark every deliverable Pass or Fail first (" + unmarked.length + " left)");
      const fails = o.deliverables.filter(d => d.qa === "fail"), res = fails.length ? "fail" : "pass", note = fails.map(d => d.text.slice(0, 60) + ": " + d.qaNote).join(" | ");
      o.qaRounds.push({ at:now(), by:w.name, result:res, note }); o.stage = res === "pass" ? "ready" : "work";
      fails.forEach(d => { d.done = false; d.check = null; });
      log(o, w, res === "pass" ? "QA passed every deliverable. Ready to deliver." : "QA sent back " + fails.length + ": " + note); }
    else if(op === "deliver"){ need("comms"); if(o.stage !== "ready") return bad("Deliver only after QA passes");
      groupDocs(o); { const st = staleProofs(o); if(st.length){ setStage(o, "qa"); o.deliverables.forEach(d => { d.qa = ""; }); log(o, { name:"Order desk" }, "A newer copy appeared for: " + st.join(", ") + ". Sent back to QA."); await saveO(o); return bad("A newer copy of " + st.join(", ") + " appeared after QA. The order went back to QA so the newest is checked."); } }
      const passAt = ((o.qaRounds || []).filter(r => r.result === "pass").pop() || {}).at || "", changed = [];
      for(const d of o.deliverables) for(const p of proofsOf(d)) if(p.kind === "drive"){ const m = await driveMeta(p.url); if(m.ok && passAt && m.modified > passAt) changed.push(m.name); }
      if(changed.length){ setStage(o, "qa"); o.deliverables.forEach(d => { d.qa = ""; }); log(o, { name:"Order desk" }, "Changed after QA passed: " + changed.join(", ") + ". Sent back to QA."); await saveO(o); return bad("These were changed after QA passed: " + changed.join(", ") + ". The order went back to QA."); }
      setStage(o, "delivered"); o.deliveredAt = now(); o.rechecks = [3, 7, 14].map(n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10));
      log(o, w, "Delivered to the client. The order desk will recheck Google on " + o.rechecks.join(", ") + " and draft an update for the client."); }
    else if(op === "revision"){ need("comms"); const reason = str(q.reason, 40), ours = !/client changed/i.test(reason);
      o.revisions.push({ at:now(), by:w.name, reason, note:str(q.note, 2000), ours }); setStage(o, "work"); o.deliverables.forEach(d => { d.qa = ""; });
      log(o, w, "Revision: " + reason + (q.note ? ". " + str(q.note, 300) : "")); }
    else if(op === "close"){ need("comms"); o.rating = Math.min(5, Math.max(0, num(q.rating, 0))) || null; o.repeat = !!q.repeat; o.retainer = !!q.retainer; setStage(o, "done"); o.closedAt = now();
      log(o, w, "Closed" + (o.rating ? ", rating " + o.rating : "") + (o.retainer ? ", retainer agreed" : o.repeat ? ", ordered again" : "")); }
    else if(op === "assign"){ need("assign"); const ps = await people();
      if(q.pm != null){ const p = ps.find(x => x.id === q.pm); o.pm = p ? p.id : ""; o.pmName = p ? p.name : ""; }
      if(q.qa != null){ const p = ps.find(x => x.id === q.qa); o.qa = p ? p.id : ""; o.qaName = p ? p.name : ""; }
      log(o, w, "Team: PM " + (o.pmName || "none") + ", QA " + (o.qaName || "none")); }
    else if(op === "note"){ const t = str(q.text, 2000); if(!t) return bad("Write the note"); log(o, w, "Note: " + t); }
    else if(op === "edit"){ need("create"); ["extras", "remarks"].forEach(k => { if(q[k] != null) o[k] = str(q[k], 4000); }); if(q.deadline && /^\d{4}-\d{2}-\d{2}$/.test(q.deadline)){ log(o, w, "Deadline " + o.deadline + " to " + q.deadline); o.deadline = q.deadline; }
      if(q.price != null && num(q.price, 0) > 0){ o.price = num(q.price, 0); } log(o, w, "Order details edited"); }
    else if(op === "cancel"){ need("assign"); setStage(o, "cancelled"); log(o, w, "Cancelled: " + str(q.why, 300)); }
    else return bad("Unknown step");
    await saveO(o); if(o.cid) touchClient(o).catch(() => {});
    return out({ ok:true, order:strip(o), econ:isA ? econ(o, cfg) : null, pay:isA ? payNums(o, cfg) : null, flags:isProj(w) ? flags(o).filter(f => !/message|reply|update|promise/i.test(f.t)) : flags(o), history:await getJ(HK(domOf(o.client.website))) });
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
      const v = await verifyOrder(o.client.website, o.google && o.google.gsc); o.verify = v; (o.verifyLog = o.verifyLog || []).unshift(v); o.verifyLog = o.verifyLog.slice(0, 12); o.rechecks.shift();
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
