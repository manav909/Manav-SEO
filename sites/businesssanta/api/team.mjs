/* Team order desk API (businesssanta.com/team): hired orders from sales to delivery, with gates that stop the usual mistakes.
   Access gate (work starts only when every access item is received at the right level), proof gate (QA only gets work with
   a proof link per deliverable), QA gate (delivery only after QA passes). Every order carries its own scorecard and economy.
   Manav signs in with his admin session; team members sign in with a personal code he creates. */
import crypto from "node:crypto";
import { store, cmd, pipe, getJ, setJ, mgetJ, rid, cookieOf, setCookie, clearCookie, rateLimit, P } from "./_lib/store.mjs";
import { GIGS } from "./_lib/gigs.mjs";
import { ACCESS, siteCheck, aiOn, askAI as rawAsk, orderPrompt, leadPrompt, replyPrompt, formatPrompt, redact, checkLink, proofCheck, intakePrompt, rethinkPrompt, teamReplyPrompt, fitText } from "./_lib/orderai.mjs";
import { isDrive, driveMeta, driveRead } from "./_lib/drive.mjs";
import { verifyOrder, verifyText } from "./_lib/verify.mjs";
import { accounts as gAccounts, props as gProps, refreshProps } from "./_lib/google.mjs";
import { gather, intelPrompt, propsFor } from "./_lib/intel.mjs";
import { syncOrder, docCandidates, docPeek, docPrompt, docGroup, docText, docModified, docAccess, fileBytes, allSpaces, spaceMessages, revisionTexts, diffPrompt, sweepSignals, signalsPrompt, siteHistory, historyPrompt, accessPrompt, postChat, chatSince, mySpaces, editChat, deleteChat } from "./_lib/teamsync.mjs";
import { accessTokenAs } from "./_lib/google.mjs";
import { planPrompt, probe, judgePrompt } from "./_lib/ordercheck.mjs";

const T = { people:P + "tm:people", code:h => P + "tm:code:" + h, cfg:P + "tm:cfg", ord:id => P + "ord:" + id, ords:P + "ords", seq:P + "ordseq", leads:P + "tm:leads", sess:t => P + "sess:" + t };
const TTL = 60 * 60 * 24 * 14;
const ROLES = ["sales", "comms", "pm", "qa", "manager"];
const CAN = { create:["sales"], lead:["sales"], comms:["comms", "sales"], pm:["pm"], qa:["qa"], assign:["manager"], admin:[] };
const rolesOf = p => (Array.isArray(p.roles) && p.roles.length ? p.roles : [p.role]).filter(r => ROLES.includes(r));
const isMgrW = w => w.role === "admin" || (w.roles || [w.role]).includes("manager");
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
  // A scope warning holds only until the next order check, which reads the client chat and carries any new ask in its own lists
  if(o.scopePending) f.push({ k:"warn", t:"Scope changed: a manager to look" });
  (o.blockers || []).filter(b => b.open).slice(-2).forEach(b => f.push({ k:"bad", t:"Blocked (" + String(b.by || "").split(" ")[0] + "): " + String(b.text).slice(0, 70) }));
  if(o.alert && !(/something new/i.test(o.alert) && o.checkAt && (!o.alertAt || o.checkAt > o.alertAt))) f.push({ k:"bad", t:o.alert });
  if(open){ const last = Date.parse(o.lastUpdateAt || o.at), hrs = (Date.now() - last) / 36e5; if(hrs > 24) f.push({ k:"bad", t:"No update for " + Math.round(hrs) + " h: paste the latest messages" }); else if(hrs > 8) f.push({ k:"warn", t:"Last update " + Math.round(hrs) + " h ago" }); }
  const dc = (o.actions || []).filter(a => a.status === "decide").length; if(dc) f.push({ k:"bad", t:dc + " step" + (dc > 1 ? "s need" : " needs") + " a decision" });
  const bl = (o.actions || []).filter(a => a.status === "blocked").length; if(bl) f.push({ k:"bad", t:bl + " action" + (bl > 1 ? "s" : "") + " blocked" });
  const hr = ((o.ai || {}).risks || []).filter(r => r.level === "high" && /open|happened/.test(r.status || "open")).length; if(open && hr) f.push({ k:"warn", t:hr + " high risk" + (hr > 1 ? "s" : "") + " open" });
  const today = new Date().toISOString().slice(0, 10);
  ((o.retention || {}).reminders || []).filter(x => x.status === "open" && x.due <= today).slice(0, 2).forEach(x => f.push({ k:x.due < today ? "bad" : "y", t:(x.due < today ? "Client care overdue: " : "Client care today: ") + String(x.what).slice(0, 70) }));
  if(open && o.ai && Array.isArray(o.ai.promises)) o.ai.promises.filter(p => p.by && !/kept|outdated/i.test(p.status || "") && p.by <= today).slice(0, 2)
    .forEach(p => f.push({ k:"bad", t:(p.by < today ? "Promise overdue: " : "Promised for today: ") + String(p.what).slice(0, 70) }));
  return f;
}
const summary = (o, cfg) => ({ id:o.id, at:o.at, client:o.client, gig:o.gig, gigName:(gigOf(o.gig) || {}).name || "", pkg:o.pkg, price:o.price, deadline:o.deadline, stage:o.stage,
  pm:o.pm, qa:o.qa, by:o.by, byName:o.byName, revisions:(o.revisions || []).length, accessLeft:(o.access || []).filter(a => !["received", "skip"].includes(a.status)).length,
  flags:flags(o), econ:econ(o, cfg), verdict:o.ai && o.ai.price ? o.ai.price.verdict : "", strength:o.draft && o.stage === "details" ? o.draft.strength || "" : "" });
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
    const cAct = re => (d.actions || []).some(a => a.type === "client" && re.test((a.title || "") + " " + (a.message || "")));
    if(d.msgs.access && !cAct(/access|search console|login|admin/i)) o.queue.push({ id:nid("q"), auto:true, kind:"access", text:str(d.msgs.access, 4000), at:now(), by:"Order desk", sent:false });
    if(d.msgs.questions && !cAct(/question|confirm|clarif/i)) o.queue.push({ id:nid("q"), auto:true, kind:"question", text:str(d.msgs.questions, 4000), at:now(), by:"Order desk", sent:false });
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
  if(d.scopeChange){ o.alert = "Client asked for something new: " + str(d.scopeChange, 140); o.alertAt = now(); }
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
  const id = o.cid || (o.cid = cidOf(o.client.name || domOf(o.client.website))); const c = (await getJ(CK(id))) || { id, name:o.client.name || domOf(o.client.website), first:o.at, orders:[], sites:[], notes:"", tags:[] };
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
    check:o.check ? Object.assign({}, o.check, { chatNotInMail:undefined }) : null,
    draftReport:o.draftReport, deskPosts:o.deskPosts, stepLog:o.stepLog, overrides:o.overrides, discarded:o.discarded,
    pack:o.pack ? { at:o.pack.at, summary:o.pack.summary, final:o.pack.final, notUse:o.pack.notUse, qa:o.pack.qa } : null, accessChat:o.accessChat, accessIssues:o.accessIssues,
    access:o.access, deliverables:o.deliverables, hours:o.hours, revisions:(o.revisions || []).map(r => ({ at:r.at, reason:r.reason, note:r.note, ours:r.ours })), qaRounds:o.qaRounds, verify:o.verify, site:o.site, google:o.google, rechecks:o.rechecks,
    ai:{ kt:ai.kt, qa:ai.qa, done:ai.done, next:ai.next, deliverables:ai.deliverables, health:ai.health },
    folder:o.folder, folderFiles:o.folderFiles, docs:o.docs, docGroups:o.docGroups, mails:o.mails, teamChat:o.teamChat, syncAt:o.syncAt, syncErrors:o.syncErrors, chatStatus:o.chatStatus, chatFull:o.chatFull, readLog:o.readLog, groupCands:o.groupCands, scopePending:o.scopePending, deskPosts:o.deskPosts, seen:o.seen, lastFresh:o.lastFresh, reportQA:o.reportQA, blockers:o.blockers, teamNotes:o.teamNotes,
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
/* Google Chat groups, sorted by WHAT IS WRITTEN IN THEM (the people, the site, the work, the files), never by the group's name:
   a name is only a hint. Each group is read again only when it had new activity or the list of orders changed. A manager or Manav
   can confirm or reject a match; their word stays. */
const GMK = P + "chatmap";
async function mapGroups(force){
  const cur = (await getJ(GMK)) || { at:"", spaces:{} }; cur.spaces = cur.spaces || {};
  const orders = (await loadAll(300, true)).filter(o => o.stage !== "cancelled" && o.client), ofp = sha(orders.map(o => o.id + domOf(o.client.website)).join(",")).slice(0, 10);
  const accs = (await gAccounts()).filter(a => a.chat), todo = [], seen = new Set();
  for(const a of accs){ let sps = []; try{ sps = await allSpaces(a.email); }catch(e){ continue; }
    for(const sp of sps){ if(sp.spaceType === "DIRECT_MESSAGE" || seen.has(sp.name)) continue; seen.add(sp.name);
      const c = cur.spaces[sp.name];
      if(!force && c && c.last === (sp.lastActiveTime || "") && c.ofp === ofp) continue;
      let first = [], last = []; try{ first = await spaceMessages(a.email, sp.name, "asc", 25); last = await spaceMessages(a.email, sp.name, "desc", 20); }catch(e){ continue; }
      todo.push({ id:sp.name, name:sp.displayName || "", via:a.email, last:sp.lastActiveTime || "", first, latest:last.reverse() }); } }
  for(const k of Object.keys(cur.spaces)) if(!seen.has(k)) delete cur.spaces[k];
  cur.seen = seen.size;
  if(todo.length && aiOn()){
    const system = `You sort the Google Chat groups of an SEO, web and ads agency by WHAT IS WRITTEN IN THEM, never by the group's name alone: a name is only a hint and is often vague or wrong.
For each group decide its kind: "project" (the working group of ONE client order: the team discusses that one client's site, work and files), "shared" (a common team group where several clients' orders are discussed), "access" (where logins and access are shared), "client" (talking with a client directly), or "other".
For a project group give the order id it belongs to, judged by the client's site, the client's name, the work and the files discussed, and dates that fit the order. For a shared group list every order it discusses. confidence is 0 to 1: 0.8 or more only when the messages clearly point at that order (its site, client or exact work); 0.5 to 0.8 when it is likely but not sure.
"why" says in a few plain words what IN THE MESSAGES shows it (the site, people, work or files they mention); never give the group's name as the reason; at most 30 words. Answer with one JSON object only: {"groups":[{"id":"group id as given","kind":"project | shared | access | client | other","order":"order id or empty","orders":["order ids, for a shared group"],"confidence":0,"why":""}]}`;
    const ol = orders.map(o => `${o.id} | client ${o.client.name || ""} | site ${domOf(o.client.website)} | since ${String(o.at).slice(0, 10)} | stage ${o.stage} | work: ${str(((o.ai || {}).summary) || (o.deliverables || []).map(d => d.text).join("; "), 220)}`).join("\n");
    for(let i = 0; i < todo.length; i += 6){ const batch = todo.slice(i, i + 6);
      const line = m => `${String(m.at).slice(0, 10)} ${m.by}: ${String(m.text).replace(/\s+/g, " ").slice(0, 260)}${m.files.length ? " [files: " + m.files.join(", ") + "]" : ""}`;
      const user = `ORDERS:\n${ol}\n\nGROUPS:\n` + batch.map(g => `GROUP ${g.id} (name hint: "${g.name}")\nFIRST MESSAGES:\n${g.first.map(line).join("\n") || "(empty)"}\nLATEST MESSAGES:\n${g.latest.map(line).join("\n") || "(empty)"}`).join("\n\n");
      try{ const r = await askAI("groupmap", "claude-sonnet-5-5", system, user.slice(0, 120000), 2500);
        for(const g of batch){ const d = ((r.data || {}).groups || []).find(x => x.id === g.id) || {}, man = (cur.spaces[g.id] || {}).manual;
          cur.spaces[g.id] = { name:g.name, via:g.via, last:g.last, ofp, at:now(), kind:str(d.kind, 12) || "other", order:str(d.order, 20), orders:(d.orders || []).map(x => str(x, 20)).slice(0, 30), confidence:Math.max(0, Math.min(1, num(d.confidence, 0))), why:str(d.why, 400), manual:man || null }; } }
      catch(e){ for(const g of batch) cur.spaces[g.id] = Object.assign(cur.spaces[g.id] || {}, { name:g.name, via:g.via, error:str(e.message, 120) }); } } }
  cur.at = now(); await setJ(GMK, cur); return todo.length;
}
/* The project groups of one order, from the content map: confirmed by a person, or sure by content */
async function groupsOf(o){
  let m = await getJ(GMK); if(!m || !m.at || Date.now() - Date.parse(m.at) > 60 * 6e4){ try{ await mapGroups(); m = await getJ(GMK); }catch(e){} }
  if(!m || !m.spaces) return null;
  const own = [], maybe = [];
  for(const [id, g] of Object.entries(m.spaces)){
    const man = g.manual;
    if(man && man.yes){ if(man.order === o.id) own.push({ id, name:g.name, via:g.via, why:"confirmed by " + man.by, confidence:1, manual:true }); continue; }
    if(man && !man.yes && man.order === o.id) continue;
    // A group this order was already read from stays, unless the content clearly shows it belongs to another order
    if((o.chatFull || {})[id] && !["shared", "access", "client"].includes(g.kind) && !(g.kind === "project" && g.order && g.order !== o.id && g.confidence >= 0.75) && !(g.kind === "project" && g.order === o.id)){ own.push({ id, name:g.name, via:g.via, why:"read before for this order" + (g.why ? "; " + g.why : ""), confidence:g.confidence || 0.75 }); continue; }
    if(g.kind !== "project" || g.order !== o.id) continue;
    (g.confidence >= 0.75 ? own : maybe).push({ id, name:g.name, via:g.via, why:g.why, confidence:g.confidence });
  }
  own.spacesSeen = m.seen || Object.keys(m.spaces).length; own.access = Object.entries(m.spaces).filter(([, g]) => g.kind === "access").map(([id]) => id);
  o.groupCands = maybe; return own;
}
async function syncTeam(o){
  let groups = null; try{ groups = await groupsOf(o); }catch(e){}
  const r = await syncOrder(o, groups), fresh = [];
  if(r.folder && (!o.folder || o.folder.id !== r.folder.id)){ o.folder = r.folder; fresh.push("PROJECT FOLDER linked: " + r.folder.name); }
  const old = new Map((o.folderFiles || []).map(f => [f.id, f.modified]));
  for(const f of r.files){ const was = old.get(f.id); if(!was) fresh.push("NEW FILE in the project folder: " + f.name + " (by " + f.by + ")"); else if(was !== f.modified) fresh.push("FILE CHANGED: " + f.name + " (by " + f.by + ")"); }
  if(r.files.length) o.folderFiles = r.files;
  const passAt = ((o.qaRounds || []).filter(q => q.result === "pass").pop() || {}).at;
  const changedAfterQA = passAt && ["ready", "delivered"].includes(o.stage) ? r.files.filter(f => f.modified > passAt) : [];
  if(changedAfterQA.length) o.alert = "Changed after QA passed: " + changedAfterQA.map(f => f.name).join(", ").slice(0, 140);
  if(r.mails.length){ o.mails = (o.mails || []).concat(r.mails).sort((a, b) => a.date.localeCompare(b.date)).slice(-80); r.mails.forEach(m => fresh.push("TEAM EMAIL " + m.date + " from " + m.from + ", subject \"" + m.subject + "\":\n" + m.text.slice(0, 2500) + (m.files.length ? "\nAttachments: " + m.files.join(", ") : ""))); }
  const newGroup = !!r.chatFull && Object.keys(r.chatFull).some(k2 => !(o.chatFull || {})[k2]);
  if(r.chatFull) o.chatFull = Object.assign(o.chatFull || {}, r.chatFull);
  // What the desk could and could not read in Google Chat, kept on the order so the portal always shows the true source status
  if(r.chatScan) o.chatScan = r.chatScan;
  // When each channel was last read, so the portal always says how fresh every source is
  o.seen = Object.assign(o.seen || {}, { folder:r.at }, (r.errors || {}).gmail ? {} : { email:r.at }, (r.errors || {}).chat ? {} : { group:r.at }, (r.errors || {}).access ? {} : { access:r.at });
  o.chatStatus = { at:r.at, accounts:r.chatStatus || [], groups:Object.entries(r.chatSpaces || {}).map(([id, g]) => Object.assign({ id }, g)), error:(r.errors || {}).chat || "" };
  if(r.chat.length){ o.teamChat = (o.teamChat || []).concat(r.chat).sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-800); fresh.push("TEAM CHAT (" + r.chat[0].space + "):\n" + r.chat.map(m => m.at + " " + m.by + ": " + m.text).join("\n").slice(0, 20000)); }
  try{ await introGroups(o); }catch(e){}   // after the newest messages are in, and safePost reads the group live anyway
  // Project access group: keep the (masked) messages, and update the access checklist from what they show
  if(r.access.length){ o.accessChat = (o.accessChat || []).concat(r.access).sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-200);
    if(aiOn() && (o.access || []).length) try{ const p = accessPrompt(o, o.access, r.access), x = await askAI("accesschat", "claude-haiku-5-5", p.system, p.user, 3000); o.aiUsd = +(num(o.aiUsd, 0) + x.usd).toFixed(4);
      const d = x.data || {}, ch = [];
      for(const u of d.updates || []){ const a = o.access.find(y => y.id === u.id); if(!a || !["received", "wrong", "asked"].includes(u.status) || a.status === u.status || (a.status === "skip")) continue;
        if(u.status === "asked" && ["received", "wrong"].includes(a.status)) continue;
        { const set = a.receivedAt || a.atS || "", msgAt = String(u.at || ""), newest = r.access.reduce((m2, z) => z.at > m2 ? z.at : m2, "");
          if(set && ((msgAt && msgAt < set) || (!msgAt && newest < set))) continue; }   // older news never undoes a newer status
        a.status = u.status; a.note = "From the access group: " + str(u.note, 200); if(u.status === "received"){ a.receivedAt = now(); a.atS = now(); } ch.push(a.item + ": " + u.status); }
      for(const n2 of (d.newItems || []).slice(0, 3)){ if(o.access.some(y => y.item.toLowerCase() === String(n2.item || "").toLowerCase())) continue;
        o.access.push({ id:nid("a"), item:str(n2.item, 120), level:"", why:"Seen in the access group", status:n2.status === "received" ? "received" : "asked", note:"From the access group: " + str(n2.note, 200) }); ch.push(n2.item + ": added"); }
      o.accessIssues = (d.issues || []).slice(0, 6).map(x2 => str(x2, 240));
      if(ch.length) log(o, { name:"Order desk" }, "Access group: " + ch.join("; "));
      if(o.access.every(y => ["received", "skip"].includes(y.status))) o.accessIssues = [];
      if(o.stage === "access" && o.access.every(y => ["received", "skip"].includes(y.status))){ setStage(o, "work"); log(o, { name:"Order desk" }, "Every access item is in. Work can start."); }
      if((d.issues || []).length) fresh.push("ACCESS GROUP, open problems: " + d.issues.join("; "));
    }catch(e){} }
  o.accessSyncAt = r.at;
  o.syncAt = r.at; o.syncErrors = r.errors;
  // New information starts a new check (the check re-reads everything); right after a check, the 10 minute re-read job picks it up instead
  if(fresh.length && !o._noCheck && ["access", "work", "qa"].includes(o.stage) && aiOn() && (newGroup || !o.checkAt || Date.now() - Date.parse(o.checkAt) > 10 * 6e4)){ o._fresh = true; try{ await buildCheck(o); }catch(e){} finally{ delete o._fresh; } }
  if(fresh.length){ log(o, { name:"Order desk" }, "From the team's folder, email and chat: " + fresh.length + " new item(s)"); if(aiOn()) try{ await rethink(o, fresh.join("\n\n")); }catch(e){} }
  return { new:fresh.length, errors:r.errors };
}
export async function hourlySync(){
  const done = [];
  try{ done.push("new work: " + await discover()); }catch(e){ done.push("new work: " + e.message); }
  try{ done.push("groups sorted by content: " + await mapGroups()); }catch(e){ done.push("groups: " + e.message); }
  try{ done.push("senior groups: " + await readCommon()); }catch(e){ done.push("senior groups: " + e.message); }
  const open = (await loadAll(300, true)).filter(x => !["done", "cancelled"].includes(x.stage)).slice(0, 40);
  for(const o of open){ try{ const r = await syncTeam(o); done.push(o.id + ":" + r.new); }catch(e){ done.push(o.id + ": " + e.message); } }
  try{ done.push("docs:" + await matchDocs(open)); }catch(e){ done.push("docs: " + e.message); }
  // Changes on the client's site or in Search Console leave no message: recheck work orders every 3 hours (two a run)
  { let n2 = 0; for(const o of open){ if(n2 >= 2) break; if(["work", "qa"].includes(o.stage) && o.check && (!o.checkAt || Date.now() - Date.parse(o.checkAt) > 3 * 36e5)) try{ await buildCheck(o); n2++; done.push(o.id + " rechecked"); }catch(e){ done.push(o.id + " recheck: " + e.message); } } }
  for(const o of open) if(o.stage === "work") try{ const n = await autoProof(o); if(n) done.push(o.id + " proofs:" + n); }catch(e){ done.push(o.id + " proofs: " + e.message); }
  { let n3 = 0; for(const o of open){ if(n3 >= 8) break; try{ const c = await reconcile(o, "hourly"); if(o.recon && o.recon.at && Date.now() - Date.parse(o.recon.at) < 6e4) n3++; if(c) done.push(o.id + " kept current:" + c); }catch(e){ done.push(o.id + " current: " + e.message); } } }
  for(const o of open) if(["qa", "ready"].includes(o.stage)) try{ await buildGuides(o); }catch(e){}
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
  const ownIds = new Set(Object.values(((await getJ(REPK)) || {}).files || {}).map(f => f.id).filter(Boolean));
  for(const c of cands){ if(ownIds.has(c.id) || /^Business Santa order desk/i.test(c.name || "")) continue; if(!c.posted && await cmd("GET", DK(c.id))) continue;
    if(c.posted && orders.some(o2 => (o2.docs || []).some(x => x.id === c.id && x.status !== "rejected"))) continue;
    if(c.posted && c.order){ const o2 = orders.find(x => x.id === c.order); if(o2){ o2.docs = o2.docs || [];
      o2.docs.push({ id:c.id, name:c.name, mime:c.mime, media:c.media, link:c.link, modified:c.modified, by:c.by, owner:c.owner, via:c.via, kind:/report|audit/i.test(c.name || "") ? "report" : /drilldown|export|\.csv$/i.test(c.name || "") ? "data" : "other", why:str(c.posted.charAt(0).toUpperCase() + c.posted.slice(1), 240), confidence:1, status:"linked", at:now() }); o2._docsNew = (o2._docsNew || 0) + 1; continue; } }
    if(fresh.length < 40){ c.peek = await docPeek(c); fresh.push(c); } }
  if(!fresh.length || !aiOn()){ for(const o of orders){ groupDocs(o); if(o._docsNew){ log(o, { name:"Order desk" }, o._docsNew + " document(s) from the project group added"); delete o._docsNew; } } return 0; }
  const p = docPrompt(orders, fresh), r = await askAI("docs", "claude-haiku-5-5", p.system, p.user, 6000), byId = new Map(orders.map(o => [o.id, o]));
  let n = 0; const ops = [];
  for(const d of (r.data && r.data.files) || []){
    const c = fresh.find(x => x.id === d.id); if(!c) continue; ops.push(["SET", DK(c.id), JSON.stringify({ order:d.order || "", confidence:d.confidence || 0, at:now() }), "EX", 60 * 60 * 24 * 120]);
    const o = byId.get(d.order); if(!o || (d.confidence || 0) < 0.5) continue;
    o.docs = o.docs || []; if(o.docs.some(x => x.id === c.id)) continue;
    const inTime = !c.modified || c.modified >= new Date(Date.parse(o.at) - 3 * 864e5).toISOString(), posted = c.posted && c.order === o.id, sure = posted || ((d.confidence || 0) >= 0.85 && inTime && /\S/.test(c.peek || ""));
    o.docs.push({ id:c.id, name:c.name, mime:c.mime, media:c.media, link:c.link, modified:c.modified, by:c.by, owner:c.owner, via:c.via, kind:d.kind || "other", why:posted ? str("Posted " + c.posted.replace(/^posted /, "") + ". " + (d.why || ""), 240) : str(d.why, 200) + (inTime ? "" : " (older than the order)"), confidence:+(d.confidence || 0).toFixed(2), status:sure ? "linked" : "suggested", at:now() });
    o._docsNew = (o._docsNew || 0) + 1; n++;
  }
  if(ops.length) await pipe(ops);
  for(const o of orders) groupDocs(o);
  for(const o of orders) if(o._docsNew){ log(o, { name:"Order desk" }, o._docsNew + " document(s) recognised as ours for this order"); delete o._docsNew; }
  return n;
}

/* Copies of the same document form one group; the newest is current (read for QA, proof and analysis), the rest are versions */
function groupDocs(o){
  o.docs = (o.docs || []).filter(d => !/^O-\d+ · \S+$/.test(d.name || "") && !/^HoD report|register$|^Team performance$|^Delays and misses$|^Found by the team account/i.test(d.name || ""));
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
      const toolMail = it.kind === "email" && /google|search console|analytics|semrush|bing|ahrefs|moz|ubersuggest|no-?reply|notification|alerts?@|report/i.test((it.from || "") + " " + (it.subject || ""));
      if(!x.newOrder || x.source === "tool" || toolMail) continue;   // a tool notice proves access, not a running order
      const n = await cmd("INCR", T.seq), id = "O-" + (1000 + Number(n)), past = list.filter(o => o.stage !== "cancelled").map(o => o.id);
      const o = { id, at:now(), by:"desk", byName:"Order desk", gig:"", pkg:"", price:0, deadline:"", chat:"", calls:"", remarks:"", fee:cfg.fee,
        client:{ name:str(x.client, 80), country:str(x.country, 40), website:site }, stage:"details", draft:{ found:now(), via:it.via, evidence:[evOf(it, x)], past, strength:["strong", "likely", "possible"].includes(x.strength) ? x.strength : "possible", why:str(x.why, 240) },
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
    // The analysis follows the situation: when any open order moved (stage, check, messages, steps, group chat) it is redone, at most every 30 minutes
    const fp = sha(JSON.stringify(open.map(o => [o.id, o.stage, o.checkAt || "", (o.queue || []).filter(x => !x.sent).length, (o.actions || []).filter(a2 => !["done", "skipped"].includes(a2.status)).length, (o.teamChat || []).length, (o.convo && o.convo.messages || []).length]))).slice(0, 12);
    const moved = insight && insight.fp !== fp && Date.now() - Date.parse(insight.at || 0) > 30 * 6e4;
    if((!insight || refresh || moved) && aiOn() && ds.length){
      try{ const r = await askAI("hod", "claude-sonnet-5-5", `You are the delivery analyst for the HoD of an SEO, web and ads agency. From the order timings below, find where time is lost and why: client side (access, replies), sales side (messages not sent, updates not pasted), project team (slow answers, slow work, rework), QA. Name orders and people. Be specific, fair and short. No dashes.
Answer with one JSON object only: {"headline":"one line for the HoD","sides":[{"side":"client | sales | project team | QA","finding":""}],"missed":["what was missed or broken, with the order"],"people":[{"name":"","note":"fair, specific"}],"improve":[{"what":"concrete change","impact":"expected effect, e.g. saves about 1 day per order"}],"todayForHod":["at most 3 things only the HoD should do today"]}`,
        JSON.stringify(ds.map(x => ({ order:x.id, site:x.site, stage:x.stage, deadline:x.deadline, pm:x.pm, sales:x.sales, late:x.late, qaFails:x.fails, revisions:x.revisions, broken:x.broken.slice(0, 4), hours:x.hours, worst:Object.fromEntries(Object.entries(x.items).map(([k, v]) => [k, v.sort((a2, b) => b.h - a2.h).slice(0, 3)])) }))), 6000);
        insight = Object.assign(r.data || {}, { at:now(), usd:+r.usd.toFixed(4), fp }); await setJ(key, insight, 60 * 60 * 24 * 40); }catch(e){ insight = { error:e.message }; } }
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
    { const pf = await perfData(30); wrote += await gPut(email, st, "scores", "Team scores (last 30 days)", st.folder.id, "sheet", csvOf([["Name", "Overall", "Response", "Accuracy", "Sincerity", "Delivery", "Avg reply minutes", "Claims confirmed", "Claims not proven", "Claims contradicted", "Tasks done", "Avg task hours", "Questions", "Genuine questions", "Learning topics", "Desk cost USD", "Orders"]]
      .concat(pf.map(p => [p.name, p.overall ?? "", p.scores.response ?? "", p.scores.accuracy ?? "", p.scores.sincerity ?? "", p.scores.delivery ?? "", p.avgReplyMin ?? "", p.claims.confirmed, p.claims.unproven, p.claims.contradicted, p.tasksDone, p.avgTaskHours ?? "", p.queries, p.genuine, p.learning.map(l => l.topic + (l.repeat ? " (x" + l.times + ")" : "")).join("; "), p.usd, p.orders.join(" ")])))) ? 1 : 0;
      const dl = ((await cmd("LRANGE", DL, 0, 999)) || []).map(x => JSON.parse(x));
      wrote += await gPut(email, st, "deskchat", "Order desk in project groups (log)", st.folder.id, "sheet", csvOf([["When", "Group", "Order", "Kind", "Who", "Question", "Desk reply", "Skipped", "Cost USD"]].concat(dl.map(e => [String(e.at).slice(0, 16).replace("T", " "), e.group, e.order, e.kind, e.by, e.q, e.a, e.skipped || "", e.usd || 0])))) ? 1 : 0; }
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

/* Proof found in what the team shares (our documents, project folder files, links in team emails and chats) is attached to the
   deliverable it proves, checked, and the deliverable is marked done when the check says complete. When every deliverable is done
   with checked proof, the order moves to QA by itself. QA's pass and the delivery stay human. */
async function autoProof(o){
  if(o.stage !== "work" || !aiOn() || !(o.deliverables || []).length) return 0;
  const ev = [], seen = new Set(), add = (url, title, ctx, at) => { if(!url || seen.has(url)) return; seen.add(url); ev.push({ url, title:str(title, 140), ctx:str(ctx, 300), at:at || "" }); };
  for(const d of (o.docs || []).filter(x => x.status === "linked" && x.current !== false)) add(d.link, d.name, (d.kind || "") + " file, " + (d.why || ""), d.modified);
  for(const f of o.folderFiles || []) add(f.link, f.name, "file in the project folder" + (f.by ? ", by " + f.by : ""), f.modified);
  const links = (t, title, at) => (String(t || "").match(/https?:\/\/[^\s)>"']+/g) || []).slice(0, 4).forEach(u => add(u.replace(/[.,]+$/, ""), title, String(t).slice(0, 300), at));
  for(const m of (o.mails || []).slice(-20)) links(m.text, "Email: " + (m.subject || ""), m.date);
  for(const m of (o.teamChat || []).slice(-60)){ links(m.text, "Project group, " + (m.by || ""), m.at); (m.links || []).forEach(l => add(l.url, l.name + " (attached in the project group by " + (m.by || "") + ")", String(m.text || "").slice(0, 200), m.at)); }
  const used = new Set((o.deliverables || []).flatMap(d => proofsOf(d).map(p => p.url)));
  const cand = ev.filter(e => !used.has(e.url) && !/accounts\.google|\/signin|login/i.test(e.url)).slice(0, 30);
  const key = sha(cand.map(e => e.url).join("|") + "|" + o.deliverables.map(d => d.id + (d.done ? 1 : 0)).join(",")).slice(0, 16);
  if(!cand.length || o.autoProofKey === key) return 0; o.autoProofKey = key;
  const system = `You match evidence the project team shared to the deliverables of one order of an SEO, web and ads agency. A match means this file or link is the proof that the deliverable was done (the report, the sheet of fixes, the live page). Not a match: requirement emails, client briefs, raw exports that only show the problem, tool notices. Be strict. No dashes.
Answer with one JSON object only: {"matches":[{"d":"deliverable id","e":0,"confidence":0.9,"why":"one line"}]}`;
  const user = `Order ${o.id}, site ${o.client.website}.\nDELIVERABLES:\n${o.deliverables.map(d => `${d.id}: ${d.text}${d.done ? " (done)" : ""}${proofsOf(d).length ? " [proof: " + proofsOf(d).map(p => p.name).join(", ") + "]" : ""}`).join("\n")}\nEVIDENCE:\n${cand.map((e, i) => `[${i}] ${e.title} ${e.at ? "(" + String(e.at).slice(0, 10) + ")" : ""} ${e.url}\n${e.ctx}`).join("\n")}`;
  const r = await askAI("autoproof", "claude-haiku-5-5", system, user, 2000); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  let n = 0;
  for(const m of (r.data && r.data.matches) || []){
    const d = o.deliverables.find(x => x.id === m.d), e = cand[m.e]; if(!d || !e || d.done || (m.confidence || 0) < 0.8 || proofsOf(d).some(p => p.url === e.url)) continue;
    let p = null;
    try{ if(isDrive(e.url)){ const mt = await driveMeta(e.url); if(mt.ok) p = { id:nid("p"), kind:"drive", url:e.url, name:mt.name, meta:trimMeta(mt), at:now(), by:"Order desk", auto:str(m.why, 200) }; }
      else { const c = await checkLink(e.url); if(c.ok) p = { id:nid("p"), kind:"link", url:e.url, name:c.title || e.url, check:{ status:c.status, ok:c.ok, title:c.title, final:c.final }, at:now(), by:"Order desk", auto:str(m.why, 200) }; } }catch(x){}
    if(!p) continue;
    d.proofs = proofsOf(d).concat(p); delete d.proof; n++;
    try{ await runProofCheck(o, d); }catch(x){}
    const ok = d.check && /complete/i.test(d.check.verdict || "");
    if(ok) d.done = true;
    log(o, { name:"Order desk" }, "Proof found in what the team shared for \"" + d.text.slice(0, 60) + "\": " + p.name + (ok ? ". Checked complete, marked done." : ". Check found gaps, so it stays open for the PM."));
  }
  groupDocs(o);
  if(o.deliverables.every(d => d.done && proofsOf(d).length) && !staleProofs(o).length){
    o.deliverables.forEach(d => { d.qa = ""; d.qaNote = ""; }); setStage(o, "qa"); log(o, { name:"Order desk" }, "Every deliverable is done with checked proof. Sent to QA."); try{ await buildPack(o); }catch(e){}
  }
  return n;
}

/* Delivery pack: from everything the desk knows, the one final file per deliverable, what not to send, what QA checks, and the client's delivery message */
/* REPORT QUALITY CHECK: every file the client will receive is checked against the same ten points before delivery. A file is client
   ready only when every point passes. The points are shown to QA on the order, so anyone can see what "client ready" means. */
const RQ_PARAMS = [
  ["scope", "Covers every task asked", "Each task in the brief has its own clear part in the file, in the order of the brief"],
  ["accuracy", "Numbers are right", "Every figure matches the source it names (Search Console, Semrush, the live site), and our own reads agree"],
  ["evidence", "Each finding has proof", "Data, a screenshot or the page address, with the date and the tool it came from"],
  ["why", "Explains why it matters", "Every issue says its effect on the client's business in plain words"],
  ["action", "Clear next steps", "Every issue has its fix, its priority, and whether it is done, coming next, or a later phase"],
  ["honesty", "Honest about results", "No guarantees; it says Google needs time; done and not done are clearly apart"],
  ["consistency", "Same facts everywhere", "Site name, addresses, dates and numbers match across every file sent"],
  ["clean", "Nothing internal", "No team names, internal notes or chat, prices, other clients' data, passwords, or contact details outside the marketplace"],
  ["finish", "Finished and professional", "A title with the client's site and the date, a summary first, tidy headings and tables, no placeholders, no typos, no broken links"],
  ["access", "The client can open it", "The link opens without asking for access, or the file is attached, with a professional file name"]
];
async function reportQA(o, force){
  const docs = (o.docs || []).filter(d => d.status === "linked" && d.current !== false && (d.kind === "report" || (((o.pack || {}).final || []).some(f => (f.use || []).some(u => u.id === d.id || u.name === d.name)))));
  if(!docs.length){ o.reportQA = { at:now(), files:[], ready:false, none:true }; return o.reportQA; }
  const fpNow = sha(JSON.stringify(docs.map(d => [d.id, d.modified || ""]).concat([(o.check || {}).at || ""]))).slice(0, 12);
  if(!force && o.reportQA && o.reportQA.fp === fpNow) return o.reportQA;
  const team = (await people()).map(p2 => p2.name).filter(Boolean), reqs = ((o.check || {}).requirements || []).filter(r => r.phase !== "client");
  const own = { searchConsole:o.verify ? { at:o.verify.at, summary:str(JSON.stringify(o.verify.gsc || o.verify.summary || {}), 3000) } : null, liveChecks:((o.check || {}).probes || []).slice(0, 30) };
  const files = [];
  for(const d of docs.slice(0, 6)){
    let txt = ""; try{ txt = fitText(await docText(d, 300000), 60000); }catch(e){ files.push({ id:d.id, name:d.name, link:d.link, verdict:"fix", score:0, params:[], fixes:[{ where:"the file", problem:"The desk could not open it: " + str(e.message, 120), fix:"Share it with the team account, then check again" }] }); continue; }
    const acc = await docAccess(d);
    const hints = []; if(/\b(TBD|TODO|lorem ipsum|\[insert[^\]]*\]|xx+\b|placeholder)\b/i.test(txt)) hints.push("placeholder text found");
    const tn = team.filter(n => n.length > 3 && new RegExp("\\b" + n.split(" ")[0].replace(/[^\w]/g, "") + "\\b", "i").test(txt)); if(tn.length) hints.push("team names appear: " + tn.join(", "));
    if(/[\w.+-]+@[\w-]+\.[\w.]+/.test(txt) || /\+?\d[\d\s-]{9,}\d/.test(txt)) hints.push("an email address or phone number appears");
    const system = `You are the senior quality checker of an SEO, web and ads agency. Before delivery you check ONE file the client will receive, against ten points, as the client would read it. Be strict and fair: a point passes only when the file truly meets it. For every point that fails, give the exact place (tab, heading or the words) and the fix in one plain sentence. Never invent problems; never ask for something the file already has. Use the requirement list, our own Search Console and live checks to test the numbers. The client receives several files together: judge "scope" for the whole set (fail it only for a task that none of the files covers, and say which), and judge every other point for this file alone, as its kind of file needs (a fix log sheet needs clear rows and statuses, not an essay). Answer with one JSON object only: {"verdict":"ready | fix","score":0,"params":[{"key":"scope","ok":true,"note":"short"}],"fixes":[{"where":"","problem":"","fix":""}]}. "score" is 0 to 100. Keys: ${RQ_PARAMS.filter(p2 => p2[0] !== "access").map(p2 => p2[0] + " (" + p2[2] + ")").join("; ")}.`;
    const user = `CLIENT SITE: ${o.client.website}\nFILE: ${d.name}\nTHE OTHER FILES SENT WITH IT: ${docs.filter(x => x !== d).map(x => x.name).join("; ") || "none"}\nREQUIREMENTS THE CLIENT PAID FOR: ${JSON.stringify(reqs.map(r => ({ task:r.text, phase:r.phase })))}\nOUR OWN READS: ${JSON.stringify(own).slice(0, 8000)}\nHINTS FROM A SIMPLE SCAN: ${hints.join("; ") || "none"}\nTEAM MEMBERS (their names must not appear): ${team.join(", ")}\nFILE CONTENT:\n${txt}`;
    try{ const r = await askAI("reportqa", "claude-sonnet-5-5", system, user, 3000); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
      const dd = r.data || {}, params = (dd.params || []).filter(x => RQ_PARAMS.some(p2 => p2[0] === x.key)).map(x => ({ key:x.key, ok:x.ok === true ? true : x.ok === false ? false : null, note:str(x.note, 240) }));
      const accOk = acc.known ? (acc.anyone ? true : false) : null;
      params.push({ key:"access", ok:accOk, note:acc.known ? (acc.anyone ? "Anyone with the link can open it" : "Only named people can open it: set sharing to anyone with the link, or attach it as a file") : "Sharing could not be read; open the link in a private window to make sure" });
      const fixes = (dd.fixes || []).slice(0, 10).map(f => ({ where:str(f.where, 160), problem:str(f.problem, 420), fix:str(f.fix, 320) }));
      if(accOk === false) fixes.push({ where:"Sharing", problem:"The client cannot open the link", fix:"Set sharing to anyone with the link (viewer), or attach the file" });
      const ready = params.every(x => x.ok !== false) && !fixes.length && dd.verdict === "ready";
      files.push({ id:d.id, name:d.name, link:d.link, verdict:ready ? "ready" : "fix", score:Math.max(0, Math.min(100, num(dd.score, 0))), params, fixes }); }
    catch(e){ files.push({ id:d.id, name:d.name, link:d.link, verdict:"fix", score:0, params:[], fixes:[{ where:"the check", problem:"The quality check could not finish: " + str(e.message, 100), fix:"Press Check the reports again" }] }); }
  }
  o.reportQA = { at:now(), fp:fpNow, files, ready:files.length > 0 && files.every(f => f.verdict === "ready") };
  log(o, { name:"Order desk" }, "Report quality check: " + files.map(f => f.name + " " + (f.verdict === "ready" ? "client ready" : f.fixes.length + " fix(es)")).join("; "));
  return o.reportQA;
}
async function buildPack(o){
  if(!aiOn()) return null; groupDocs(o);
  const dl = o.deliverables.map(d => ({ id:d.id, text:d.text, done:d.done, qa:d.qa || "", qaNote:d.qaNote || "", proofs:proofsOf(d).map(p => ({ name:p.name, url:p.url, kind:p.kind, modified:(p.meta || {}).modified || "", newer:p.newer ? p.newer.name : "" })),
    check:d.check ? { verdict:d.check.verdict, summary:d.check.summary, missing:d.check.missing, redFlags:d.check.redFlags } : null }));
  const docs = (o.docs || []).filter(d => d.status === "linked").map(d => ({ name:d.name, url:d.link, kind:d.kind, modified:d.modified, by:d.by, current:d.current !== false, copies:d.versions || 1, otherReport:d.split ? d.splitWhy || "different report with the same name" : "", compared:((o.docGroups || {})[d.group] || {}).summary || "", flags:((o.docGroups || {})[d.group] || {}).flags || [] }));
  // Read what is inside the newest reports, audits and work files (not exports), so the judgement rests on content, not names
  const reads = [];
  for(const d of (o.docs || []).filter(x => x.status === "linked" && x.current !== false && x.kind !== "data").sort((a, b) => String(b.modified).localeCompare(String(a.modified))).slice(0, 4)){
    try{ const t = await docText(d, 7000); if(t) reads.push({ name:d.name, kind:d.kind, modified:d.modified, by:d.by, content:t }); }catch(e){} }
  const ai = o.ai || {};
  const system = `You are the delivery lead of an SEO, web and ads agency. Decide, for one order, exactly what is delivered. You only see what was shared with the team account and attached on the order: "missing" means not found in that, never that the work was not done, so say "not found" rather than "not done". For each deliverable pick the final file or link to use (the newest, checked copy that really shows the work), and say clearly what is ready, what needs a fix and what is missing. List files that must NOT be sent (old copies, raw exports, other reports with the same name, unchecked drafts) with the reason. Give QA short exact checks per deliverable. Then write the delivery message for the client on the marketplace: warm, plain, professional; what was done, which files are attached, results stated honestly (what we did is done now; what Google shows can take days or weeks, and we will check again); the next step. Never put an email address, phone number, or a link to anything other than the final files in the client message. Never mention tools that write for us. In summary, fix and why lines, name deliverables and files in plain words, never by id or code. No dashes.
Answer with one JSON object only: {"summary":"one line: is this order ready for QA or for delivery, and what blocks it","final":[{"d":"deliverable id","what":"what this item is, in a few words","use":[{"name":"","url":"","why":"one line"}],"status":"ready | needs fix | missing","fix":"what to fix or add, empty if ready","basis":"what this item rests on, in plain words: the package, the client chat (with date), the live check (with time), or a file"}],"notUse":[{"name":"","why":""}],"qa":[{"d":"deliverable id","check":["exact check"]}],"client":{"message":"","attach":["file names to attach to the delivery"]}}`;
  const user = `Order ${o.id} for ${o.client.name || "the client"}, site ${o.client.website}. Stage: ${o.stage}. Deadline ${o.deadline}.
WHAT WAS SOLD: ${ai.summary || ""}
DELIVERY NOTE ITEMS (tell the client these as recommended next steps in the delivery message; they are not part of this delivery): ${JSON.stringify([].concat((o.deferred || []).map(x => x.part), ((o.check || {}).deliveryNotes || [])))}
PROMISES: ${JSON.stringify((ai.promises || []).map(p => ({ what:p.what, by:p.by, status:p.status })))}
DELIVERABLES WITH PROOF AND THE DESK'S CHECK:
${JSON.stringify(dl)}
DISCARDED BY A MANAGER OR MANAV (never a fix, task or delivery item; leave them out completely): ${JSON.stringify(discTexts(o))}
MOVED TO THE DELIVERY NOTE (only mentioned to the client as next steps, never a task): ${JSON.stringify((o.deferred || []).map(x => x.part))}
OUR DOCUMENTS FOR THIS ORDER:
${JSON.stringify(docs)}
SHARED BY THE TEAM IN THE PROJECT GROUP AND EMAILS (newest last):
${JSON.stringify([].concat((o.teamChat || []).slice(-40).map(m => ({ at:m.at, by:m.by, where:m.space, text:String(m.text || "").slice(0, 400), files:(m.links || []).map(l => ({ name:l.name, url:l.url })).concat((m.files || []).filter(n => !(m.links || []).some(l => l.name === n)).map(n => ({ name:n }))) })), (o.mails || []).slice(-15).map(m => ({ at:m.date, by:m.from, where:"email: " + (m.subject || ""), text:String(m.text || "").slice(0, 300), files:(m.files || []).map(n => ({ name:n })) }))).sort((a, b) => String(a.at).localeCompare(String(b.at))))}
LIVE CHECK AT THE SOURCE:
${o.verify ? verifyText(o.verify) : "not run yet"}
WHAT IS INSIDE OUR NEWEST FILES (read before judging; a file counts for every deliverable its content covers, whatever its name):
${reads.map(x => "FILE: " + x.name + " (" + x.kind + ", changed " + x.modified + (x.by ? " by " + x.by : "") + ")\n" + x.content).join("\n\n") || "none readable"}`.slice(0, 160000);
  const r = await askAI("pack", "claude-sonnet-5-5", system, user, 8000); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  o.pack = Object.assign(r.data || {}, { at:now(), stage:o.stage, usd:+r.usd.toFixed(4) });
  // Each final row names what it is: the AI may answer with a requirement id instead of the deliverable id
  (o.pack.final || []).forEach(f => { const d = (o.deliverables || []).find(x => x.id === f.d) || (o.deliverables || []).find(x => x.req === f.d); if(d){ f.d = d.id; f.text = d.text; } else if(!f.text) f.text = str(f.what || ((f.use || [])[0] || {}).why || "", 120); });
  log(o, { name:"Order desk" }, "Delivery pack ready: " + str(o.pack.summary, 200));
  try{ await buildGuides(o); }catch(e){}
  return o.pack;
}

/* Learnings brain: every lesson from the owner's reviews, kept as a rule and given to every judging and writing job of the desk,
   so a mistake corrected once is not made again on any order. The owner adds, edits or retires lessons on the "How we work" page. */
const LK = P + "learn";
const LSEED = [
  ["reading", "Read the project group from its very first message, not only from when the order reached the portal: work, files and instructions start there before the order is added. Read every file posted or uploaded in it (Google Docs, Sheets, Slides, Word, Excel, PDF).", "O-1001: only 3 of 26 group messages were read and the GSC report Doc was missed."],
  ["reading", "Before saying a report or file lacks something, look through every file of the order (a Doc report and an Excel sheet can each hold part of the work). Name the file where you found it, or say you looked in all of them.", "O-1001: the GSC section was in the Doc report and the issues list in the Excel; the desk said both were missing."],
  ["scope", "Respect the limits written in the requirement email. If it says quick or straightforward fixes, only quick fixes are expected; larger work (for example fixing every duplicate title) is a next step to recommend in the report, not missing work.", "O-1001: the desk asked for all duplicate titles to be fixed though only quick fixes were asked."],
  ["proof", "A quote proves a point only when that line asks for that exact point. A line that describes the client's problem, or speaks of the work in general, is not proof. Copy it word for word.", "O-1001: a timing note was cited with the client's problem line as proof."],
  ["message", "One point per problem. Never repeat an item in two points, and never ask for something already verified done.", "O-1001: the robots.txt line appeared twice; an already removed plugin was asked again."],
  ["message", "Use exact values only, as one file states them. Never join numbers from different files into a range, never round or guess.", "O-1001: \"about 7,000 to 17,000 affected pages\" mixed two files."],
  ["message", "When you call something a mistake, say exactly what says it is done and what shows it is not, in one clear sentence.", "O-1001: \"the sitemap line must be exact\" made no sense to the reader."],
  ["message", "Items not in the requirement email are asked separately, with where they were asked (follow up email, KT note, earlier in the group, client chat). Anything nobody asked for is not demanded from the team.", ""],
  ["message", "In group messages: bold for headings and item titles, italic for the reference with its proving line. Simple, human, task only, no meta.", ""],
  ["message", "Edit our own group message only while nobody has written after it; otherwise post a new one.", ""],
  ["people", "Instructions in a group are open to the PM's approval; weigh a PM's counter fairly, argue once politely, then accept. The manager's (Jyoti's) word settles a situation.", ""],
  ["qa", "Client communication and the demo recording are delivery parts: they never stop an order from reaching QA.", ""],
  ["owners", "The demo or walkthrough recording is always made by QA, a manager or Sales, never by the working executive: never ask the executive for it, in the group or anywhere.", ""]
];
async function learnList(){ let l = await getJ(LK); if(!Array.isArray(l)){ l = LSEED.map(([k, rule, why], i) => ({ id:"L" + (i + 1), kind:k, rule, why, by:"Manav (review of O-1001)", at:now(), on:true })); await setJ(LK, l); } return l; }
let LEARN = { at:0, txt:"" };
const LJOBS = new Set(["check1", "check2", "groupmsg", "quickfix", "reconcile", "deskanswer", "draftreport", "pack", "autoproof", "history"]);
async function learnTxt(){ if(Date.now() - LEARN.at < 60000) return LEARN.txt; let l = []; try{ l = (await learnList()).filter(x => x.on !== false); }catch(e){}
  LEARN = { at:Date.now(), txt:l.length ? "\n\nLESSONS FROM THE OWNER'S REVIEWS (always follow these; they come from real mistakes):\n" + l.map((x, i) => `${i + 1}. ${x.rule}`).join("\n") : "" }; return LEARN.txt; }
async function askAI(job, model, system, user, max, ...rest){ return rawAsk(job, model, LJOBS.has(job) ? system + await learnTxt() : system, user, max, ...rest); }

/* Strip internal task ids (r1, r2) from text people read */
const noId = t => String(t || "").replace(/\s*\((?:r\d+(?:\s*(?:,|and)\s*)?)+[^)]*\)/gi, "").replace(/\br\d+\b,?\s*/g, "").replace(/\s{2,}/g, " ").trim();

/* Before delivery: a checklist anyone can tick, with help on any item, saved for the next person */
const dKey = t => sha(String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).slice(0, 10);
/* Who does what is a fixed rule, not the AI's guess: a demo or walkthrough recording is always made by QA, a manager or Sales, never by the
   working executive, so it is never asked from the executive and never stops the project work. */
const REC0 = /\b(record(ing|ed)?|demo|walk ?through|loom|screen ?cast|video (call|walk))\b/i, REC_WHO = "QA, manager or Sales";
const REC = { test:t => REC0.test(String(t || "")) && !/\b(dns|txt|cname|mx|a record|search console record|schema|structured data)\b/i.test(String(t || "")) };
const ownerOf = (who, what) => REC.test(String(what || "")) ? REC_WHO : who;
const STOPW = new Set("a an the to of and or in on for with by it its this that is are be as at from all any our your their send make made short client clients".split(" "));
const wordsOf = t => new Set(String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(x => x.length > 2 && !STOPW.has(x)).map(x => x.replace(/(ings?|ed|s)$/, "")));
const sameJob = (a, b) => { if(REC.test(a) && REC.test(b) && !/report/i.test(a + " " + b)) return true; const A = wordsOf(a), B = wordsOf(b); if(!A.size || !B.size) return false; let n = 0; for(const x of A) if(B.has(x)) n++; return n / Math.min(A.size, B.size) >= 0.6; };
/* Tasks a manager or Manav discarded, as text (older records are read back from the order history) */
function discTexts(o){ return Object.entries(o.discarded || {}).map(([id, d]) => d.task || (((o.timeline || []).find(t => /^Discarded the task "/.test(t.what || "") && Math.abs(Date.parse(t.at) - Date.parse(d.at)) < 12e4) || {}).what || "").replace(/^Discarded the task "(.*?)"\. Reason:.*$/s, "$1")).filter(Boolean); }
function deliveryList(o){ const ck = o.check || {}, list = [], seen = new Set(), gone = discTexts(o);
  // The delivery pack is used only when it was made from the latest check: an older pack's fixes are history, not tasks
  const pk = o.pack && (!ck.at || String(o.pack.at || "") >= String(ck.at)) ? o.pack : {};
  const add = (who, what, from) => { const k = dKey(what); if(!what || seen.has(k)) return; if(from !== "task" && gone.some(g2 => sameJob(g2, what) || (/robots\.txt/i.test(g2) && /robots\.txt/i.test(what)))) return; if(list.some(x => sameJob(x.what, what))) return; seen.add(k); const t = (o.deliveryTicks || {})[k], gd = (o.deliveryGuide || {})[k]; if((o.deliveryDiscard || {})[k]) return; who = ownerOf(who, what);
    // The owner is shown once, in front: "QA, a manager or Sales records ..." becomes "Records ..."
    if(who === REC_WHO) what = String(what).replace(/^QA,? (a )?manager,? or Sales (should )?(\w)/i, (m0, a1, a2, c) => c.toUpperCase());
    list.push({ key:k, who:who || "", what, from, done:!!t, by:t ? t.by : "", at:t ? t.at : "", help:gd ? gd.text : "" }); };
  (ck.rows || []).filter(r => r.status !== "done" && ((ck.requirements || []).find(q => q.id === r.r) || {}).phase === "delivery").forEach(r => add(r.who, r.toPass || ((ck.requirements || []).find(q => q.id === r.r) || {}).text, "task"));
  (ck.beforeDelivery || []).forEach(b => add(b.who, b.do, "check"));
  (o.mgrTasks || []).filter(m => m.phase === "delivery").forEach(m => add(m.who || "Sales", m.text, "added by " + m.by));
  (pk.final || []).filter(f => f.status !== "ready" && f.fix).forEach(f => add("QA", f.fix, "delivery pack"));
  if(pk.client && pk.client.message) add("Sales", "Send the delivery message from the delivery pack on the marketplace" + ((pk.client.attach || []).length ? ", with " + pk.client.attach.join(", ") : ""), "delivery pack");
  if((o.deferred || []).length || (ck.deliveryNotes || []).length) add("Sales", "Tell the client the recommended next steps (the delivery note) in the delivery message", "delivery note");
  return list; }
async function deliveryHelp(o, item, question, w){
  const system = `A demo or walkthrough recording, and its link, goes only to the client with the delivery (the marketplace delivery message); never tell anyone to share it in the project group. You help a team member deliver one SEO order. Answer like a patient senior colleague sitting next to them: first line is the direct answer, then short numbered steps with the exact place (marketplace order page, Drive file, group) and exact text to copy in backticks. Use only the facts given; if something is unknown, say who to ask. Very simple English. No dashes. Answer with one JSON object only: {"answer":""}`;
  const pk = o.pack || {}, ck = o.check || {};
  const user = `ORDER ${o.id} for ${o.client.name || "the client"}, site ${o.client.website}. Stage ${o.stage}. Marketplace: ${o.gig || "Fiverr"}.
CHECKLIST ITEM: ${item ? item.who + ": " + item.what : "none"}
QUESTION from ${w.name} (${(w.roles || [w.role]).join("+")}): ${question || "How do I do this item?"}
FINAL FILES: ${JSON.stringify((pk.final || []).map(f => ({ files:(f.use || []).map(u => u.name + " " + u.url), status:f.status, fix:f.fix })))}
DELIVERY MESSAGE: ${(pk.client || {}).message || "not built yet"}
ATTACH: ${JSON.stringify((pk.client || {}).attach || [])}
DELIVERY NOTE (next steps for the client): ${JSON.stringify([].concat((o.deferred || []).map(x => x.part), ck.deliveryNotes || []))}
TASKS: ${JSON.stringify((ck.rows || []).map(r => ({ status:r.status, open:r.toPass })))}
LAST CLIENT MESSAGES: ${JSON.stringify((o.convo ? o.convo.messages : []).slice(-8).map(m => (m.time || "") + " " + m.who + ": " + str(m.text, 300)))}`;
  const r = await askAI("deskanswer", "claude-sonnet-5-5", system, user, 1500); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  return noId(str((r.data || {}).answer, 3000)) || "I could not write help for this. Ask the PM in the project group.";
}

/* Written help for every before-delivery item, made ahead of time (one call for all new items) so it is there when someone looks */
async function buildGuides(o){
  if(!aiOn()) return 0; const list = deliveryList(o), g = o.deliveryGuide = o.deliveryGuide || {};
  Object.keys(g).forEach(k => { const it = list.find(x => x.key === k); if(!it || (g[k].who !== undefined && g[k].who !== it.who) || (g[k].who === undefined && it.who === REC_WHO)) delete g[k]; });
  const need = list.filter(x => !g[x.key]); if(!need.length) return 0;
  const pk = o.pack || {}, ck = o.check || {};
  const system = `A demo or walkthrough recording, and its link, goes only to the client with the delivery (the marketplace delivery message); never tell anyone to share it in the project group. For each before-delivery item of one SEO order, write the help a team member needs to do it without asking anyone: short numbered steps, each with the exact place (the marketplace order page and its Deliver button, the Drive file by name, the project group) and any exact text to copy in backticks. Use only the facts given; where something is unknown say who to ask. At most 6 steps per item, very simple English, no dashes. Answer with one JSON object only: {"guides":[{"key":"","steps":"1. ...\n2. ..."}]}`;
  const user = `ORDER ${o.id} for ${o.client.name || "the client"}, site ${o.client.website}, marketplace ${o.gig || "Fiverr"}, stage ${o.stage}.
ITEMS: ${JSON.stringify(need.map(x => ({ key:x.key, who:x.who, what:x.what })))}
FINAL FILES: ${JSON.stringify((pk.final || []).map(f => ({ files:(f.use || []).map(u => u.name + " " + (u.url || "")), status:f.status, fix:f.fix })))}
DELIVERY MESSAGE: ${(pk.client || {}).message || "not built yet"}
ATTACH: ${JSON.stringify((pk.client || {}).attach || [])}
DELIVERY NOTE: ${JSON.stringify([].concat((o.deferred || []).map(x => x.part), ck.deliveryNotes || []))}
LINKED FILES: ${JSON.stringify((o.docs || []).filter(d => d.status === "linked" && d.current !== false).map(d => d.name + " " + (d.link || "")))}`;
  const r = await askAI("deskanswer", "claude-sonnet-5-5", system, user, 3500); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  let n = 0; for(const x of ((r.data || {}).guides || [])) if(need.some(y => y.key === x.key) && x.steps){ g[x.key] = { text:noId(str(x.steps, 2500)), at:now(), who:(need.find(y => y.key === x.key) || {}).who || "" }; n++; }
  return n;
}

/* Talk to an order: anyone asks anything about it in plain words and gets an answer from everything on the order. Read only. */
function orderFacts(o, full){
  const ck = o.check || {}, reqs = ck.requirements || [], cut = (t, n) => str(t, n);
  return `ORDER ${o.id} for ${o.client.name || "the client"}, site ${o.client.website}. Stage: ${o.stage}. Deadline: ${o.deadline}. Price ${o.price || ""}. PM ${o.pmName || "none"}, QA ${o.qaName || "none"}. Today ${new Date().toISOString().slice(0, 10)}.
WHAT WAS SOLD: ${(o.ai || {}).summary || ""}
PROMISES: ${JSON.stringify(((o.ai || {}).promises || []).map(p => ({ what:p.what, by:p.by, status:p.status })))}
REQUIREMENT EMAIL: ${cut((ck.reqMail || {}).text || "", 6000)}
TASKS (latest check ${ck.at || "none"}): ${JSON.stringify((ck.rows || []).map(r => { const q = reqs.find(x => x.id === r.r) || {}; return { task:q.text, phase:q.phase, status:r.status, found:cut(r.found, 300), open:cut(r.toPass, 300), who:r.who }; }))}
VERDICT: ${ck.verdict || ""}
QUICK FIXES: ${JSON.stringify((ck.quickFixes || []).map(q => ({ what:q.what, status:q.status })))}
DELIVERY NOTE: ${JSON.stringify([].concat((o.deferred || []).map(x => x.part), ck.deliveryNotes || []))}
BEFORE DELIVERY: ${JSON.stringify(deliveryList(o).map(x => ({ who:x.who, what:x.what, done:x.done })))}
FILES: ${JSON.stringify((o.docs || []).filter(d => d.status === "linked").map(d => ({ name:d.name, kind:d.kind, modified:d.modified, by:d.by, current:d.current !== false })))}
ACCESS: ${JSON.stringify((o.access || []).map(a => ({ item:a.item, status:a.status, note:a.note || "" })))}
OPEN MESSAGES TO SEND: ${JSON.stringify((o.queue || []).filter(m => !m.sent).map(m => cut(m.text, 400)))}
OPEN ACTIONS: ${JSON.stringify((o.actions || []).filter(a => !["done", "skipped"].includes(a.status)).map(a => ({ title:a.title, type:a.type, needBy:a.needBy || "" })))}
CLIENT CARE: ${o.retention ? JSON.stringify({ summary:o.retention.summary, keep:o.retention.keep, reminders:(o.retention.reminders || []).map(x => ({ due:x.due, what:x.what, status:x.status })) }) : "none yet"}
CLIENT CHAT (newest last): ${(o.convo ? o.convo.messages : []).slice(-40).map(m => `${m.time || ""} ${m.who === "us" ? "US" : "CLIENT"}: ${cut(m.text, 500)}`).join("\n") || cut(o.chat || "", 8000)}
CALL NOTES: ${cut(o.calls || "", 3000)}
PROJECT GROUP (newest last): ${(o.teamChat || []).slice(-40).map(m => `${m.at} ${m.by}: ${cut(m.text, 500)}`).join("\n")}
${full ? "HISTORY (newest first): " + (o.timeline || []).slice(0, 40).map(t => `${t.at} ${t.who}: ${cut(t.what, 200)}`).join("\n") : ""}`;
}
async function askOrder(o, question, w, isA){
  const pj = isProj(w);
  const system = `You are the order desk. A team member asks about one order. Answer from the FACTS only, like a colleague who has read everything: the direct answer first in one or two sentences, then only the details that help (who, what, when, where it is written, with dates). If the facts do not say, answer "The order does not say" and who would know. Never invent. Simple English, short. No dashes.${pj ? " The asker is on the project team: talk about the work only, never about prices, payments or what sales told the client privately." : ""} Answer with one JSON object only: {"answer":""}`;
  const r = await askAI("deskanswer", "claude-sonnet-5-5", system, orderFacts(o, isA).slice(0, 120000) + "\n\nQUESTION from " + w.name + ": " + question, 1800);
  o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  return noId(str((r.data || {}).answer, 4000)) || "I could not answer that. Ask the PM in the project group.";
}

/* After delivery the order is kept as a client care record (what was done, what to remember, next steps) with a loop of
   reminders that stay current: the keep-current step re-judges them whenever the client chat or another order changes things. */
async function buildRetention(o, why){
  const ck = o.check || {}, pk = o.pack || {}, today = new Date().toISOString().slice(0, 10);
  const system = `You write the client care record for one delivered SEO order, so the business keeps this client for years. Retention is the plan: every client is important.
Write: "summary" (what we did and what it achieved, 3 short plain sentences, facts only), "keep" (up to 6 facts to remember about this client: how they like to talk, what they care about, their site, anything promised for later), and "reminders" (4 to 7 dated follow ups for sales, each with "inDays" from today, "what" to do in one plain line, "why"). Always include: a check that the client is happy and has what they need (2 to 4 days), a results update from Search Console or the live site (about 14 days), the recommended next steps from the delivery note as a friendly offer (about 21 to 30 days), and a later check in (about 60 to 90 days). Add any promise made for later and any good date for this client (for example their busy season). Never pushy, never invent facts. No dashes. Answer with one JSON object only: {"summary":"","keep":[""],"reminders":[{"inDays":3,"what":"","why":""}]}`;
  const user = `ORDER ${o.id} for ${o.client.name || "the client"}, site ${o.client.website}, delivered ${o.deliveredAt || today}${o.closedAt ? ", closed " + o.closedAt : ""}${o.rating ? ", rating " + o.rating : ""}. Today ${today}.
WHAT WAS SOLD: ${(o.ai || {}).summary || ""}
WORK CHECK: ${ck.verdict || ""}; tasks ${JSON.stringify((ck.rows || []).map(r => ({ task:((ck.requirements || []).find(q => q.id === r.r) || {}).text, status:r.status, found:str(r.found, 200) })))}
DELIVERY MESSAGE: ${str((pk.client || {}).message || "", 1500)}
DELIVERY NOTE (next steps for the client): ${JSON.stringify([].concat((o.deferred || []).map(x => x.part), ck.deliveryNotes || []))}
PROMISES: ${JSON.stringify(((o.ai || {}).promises || []).map(p => ({ what:p.what, by:p.by, status:p.status })))}
CLIENT CHAT (last 20): ${JSON.stringify((o.convo ? o.convo.messages : []).slice(-20).map(m => (m.time || "") + " " + m.who + ": " + str(m.text, 300)))}`;
  const r = await askAI("retention", "claude-sonnet-5-5", system, user, 2500); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  const d = r.data || {}, old = (o.retention || {}).reminders || [];
  o.retention = { at:now(), why:str(why, 60), summary:noId(str(d.summary, 900)), keep:(d.keep || []).map(x => noId(str(x, 240))).filter(Boolean).slice(0, 6),
    reminders:old.filter(x => x.status !== "open").concat((d.reminders || []).slice(0, 7).map(x => ({ id:nid("rm"), due:new Date(Date.now() + Math.max(1, Math.min(365, num(x.inDays, 7))) * 864e5).toISOString().slice(0, 10), what:noId(str(x.what, 240)), why:noId(str(x.why, 240)), who:"sales", status:"open" }))) };
  log(o, { name:"Order desk" }, "Client care record saved with " + o.retention.reminders.filter(x => x.status === "open").length + " reminders, first on " + (o.retention.reminders.filter(x => x.status === "open").map(x => x.due).sort()[0] || "none"));
  if(o.cid) try{ const c = await getJ(CK(o.cid)); if(c){ c.care = { order:o.id, at:o.retention.at, summary:o.retention.summary, keep:o.retention.keep }; await setJ(CK(o.cid), c); } }catch(e){}
}

/* Keep every open item true to the current situation. Messages to send, team asks, tasks and the check's lists are re-judged
   against the latest client chat, project group, check, stage and today's date whenever any of those changed (or once a day as
   time passes): each is kept, rewritten for today, or closed with its reason. Nothing is deleted without a record. */
async function reconcile(o, why){
  if(!aiOn()) return 0;
  const ck = o.check || {}, items = [], msgs = o.convo ? (o.convo.messages || []) : [];
  (o.queue || []).filter(m => !m.sent && !m.reply).forEach(m => items.push({ id:"q:" + m.id, kind:"client message to send", made:m.at, by:m.by || "", text:str(m.text, 1500) }));
  (o.actions || []).filter(a => !["done", "skipped"].includes(a.status)).forEach(a => items.push({ id:"a:" + a.id, kind:a.type === "client" ? "client message to send" : a.type === "internal" ? "message to the team" : "task", made:a.at, by:a.by || "Order desk", title:a.title, needBy:a.needBy || "", text:str(a.message || a.why || "", 1200) }));
  (ck.beforeDelivery || []).forEach((x, i) => items.push({ id:"b:" + i, kind:"before delivery", made:ck.at, by:"Order desk", text:(x.who ? x.who + ": " : "") + (x.do || "") }));
  (ck.waitingOnClient || []).forEach((x, i) => items.push({ id:"w:" + i, kind:"waiting on the client", made:ck.at, by:"Order desk", text:String(x) }));
  (ck.problems || []).forEach((x, i) => items.push({ id:"p:" + i, kind:"problem", made:ck.at, by:"Order desk", text:(x.step ? x.step + ": " : "") + (x.text || "") }));
  ((o.retention || {}).reminders || []).filter(x => x.status === "open").forEach(x => items.push({ id:"r:" + x.id, kind:"client care reminder", made:(o.retention || {}).at, by:"Order desk", needBy:x.due, text:x.what + " (" + x.why + ")" }));
  // The board's warnings are judged too: an alert, a high risk or a promise that the situation has moved past must not stay on the card
  if(o.alert) items.push({ id:"al:0", kind:"warning on the order card", made:o.alertAt || ck.at || "", by:"Order desk", text:o.alert });
  ((o.ai || {}).risks || []).forEach((x, i) => { if(x.level === "high" && /open|happened/.test(x.status || "open")) items.push({ id:"rk:" + i, kind:"high risk", made:(o.ai || {}).at || "", by:"Order desk", text:str(x.risk || x.text || x.what || JSON.stringify(x), 400) }); });
  ((o.ai || {}).promises || []).forEach((x, i) => { if(x.by && !/kept|outdated/i.test(x.status || "")) items.push({ id:"pm:" + i, kind:"promise to the client", made:(o.ai || {}).at || "", by:"Order desk", needBy:x.by, text:str(x.what, 400) }); });
  if(["delivered", "done"].includes(o.stage)) for(let i = items.length - 1; i >= 0; i--) if(/^[bwp]:/.test(items[i].id)) items.splice(i, 1);
  if(!items.length) return 0;
  const today = new Date().toISOString().slice(0, 10), lastC = msgs.slice(-1)[0] || {};
  const key = sha(JSON.stringify([items.map(x => x.id + ":" + String(x.text).length), msgs.length, lastC.time || "", (o.teamChat || []).length, ck.at || "", o.stage, (o.deliverables || []).filter(d => d.done).length, (o.deferred || []).length, today])).slice(0, 16);
  if(o.recon && o.recon.key === key) return 0;
  const rows = (ck.rows || []).map(r => { const q = (ck.requirements || []).find(x => x.id === r.r) || {}; return { task:q.text, phase:q.phase, status:r.status, open:r.toPass || "" }; });
  const system = `You keep one order's open items true to the situation NOW. Today is ${today} (India). For each item decide:
"keep": still right and still needed, as written.
"update": still needed, but its words, facts or date are out of date. Give the full new "text" (and "title" or "needBy" if they changed). A client care reminder may get a new date ("needBy") or wording when the situation changed (for example the client wrote again, or ordered again). A client message is rewritten whole from the latest situation, in the same warm voice, honest about anything late (say it plainly, with the new time), never promising what the facts do not support.
"done": the facts show it was done or already said (for example the same update was already sent in the client chat after the item was made).
"outdated": no longer true or needed (superseded by a newer item, the situation moved on, or a later item says the same).
For a "warning on the order card", a "high risk" or a "promise to the client": "done" when what it warns about is handled (the work is done, the decision made, the promise kept); "outdated" when the situation moved past it (the work was moved to the delivery note or discarded, or a newer item says the same). Keep it only while someone still has to act on it, and "update" its words when the facts behind it changed.
Rules: base every decision on the FACTS only and say why in one plain sentence. Never mark an item a person made (by is not "Order desk") as done or outdated unless the facts clearly show it. Two items that ask for the same thing: keep the better one, mark the other outdated. No dashes. Answer with one JSON object only: {"items":[{"id":"","decision":"keep | update | done | outdated","why":"","title":"","text":"","needBy":"YYYY-MM-DD or empty"}]}`;
  const user = `ORDER ${o.id} for ${o.client.name || "the client"}, site ${o.client.website}. Stage: ${o.stage}. Deadline: ${o.deadline}. Today: ${today}.
CLIENT CHAT (newest last, with times):
${msgs.slice(-25).map(m => `${m.time || ""} ${m.who === "us" ? "US" : "CLIENT"}: ${str(m.text, 600)}`).join("\n") || "none"}
PROJECT GROUP (newest last):
${(o.teamChat || []).slice(-15).map(m => `${m.at} ${m.by}: ${str(m.text, 400)}`).join("\n") || "none"}
LATEST CHECK (${ck.at || "none"}): ${ck.verdict || ""}
TASKS NOW: ${JSON.stringify(rows)}
DELIVERABLES: ${JSON.stringify((o.deliverables || []).map(d => ({ text:d.text, done:!!d.done })))}
MOVED TO THE DELIVERY NOTE: ${JSON.stringify((o.deferred || []).map(x => x.part))}
QUICK FIXES: ${JSON.stringify((ck.quickFixes || []).map(q => ({ what:q.what, status:q.status })))}
PROMISES TO THE CLIENT: ${JSON.stringify(((o.ai || {}).promises || []).map(p => ({ what:p.what, by:p.by, status:p.status })))}
OPEN ITEMS TO JUDGE: ${JSON.stringify(items)}`;
  const r = await askAI("reconcile", "claude-sonnet-5-5", system, user, 5000);
  o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  const out2 = ((r.data || {}).items || []).filter(x => items.some(y => y.id === x.id));
  const by = { name:"Order desk (kept current)" }, rec = [];
  const drop = { b:new Set(), w:new Set(), p:new Set() };
  for(const x of out2){ const [t, id] = String(x.id).split(/:(.*)/s), dec = x.decision, w2 = noId(str(x.why, 240));
    if(!["update", "done", "outdated"].includes(dec)) continue;
    if(t === "q"){ const m = (o.queue || []).find(y => y.id === id); if(!m) continue;
      if(dec === "update" && x.text){ m.text = str(x.text, 4000); m.updatedAt = now(); m.updatedWhy = w2; rec.push({ what:"Client message rewritten for today", why:w2 }); }
      else if(dec !== "update"){ o.queue = o.queue.filter(y => y !== m); (o.closedItems = o.closedItems || []).push({ kind:"client message", text:str(m.text, 600), why:w2, decision:dec, at:now() }); rec.push({ what:"Client message closed (" + dec + ")", why:w2 }); } }
    else if(t === "a"){ const a = (o.actions || []).find(y => y.id === id); if(!a) continue;
      if(dec === "update"){ if(x.text) a.message = str(x.text, 4000); if(x.title) a.title = str(x.title, 200); if(/^\d{4}-\d{2}-\d{2}$/.test(x.needBy || "")) a.needBy = x.needBy; a.updatedAt = now(); a.updatedWhy = w2; rec.push({ what:"Updated: " + str(a.title, 100), why:w2 }); }
      else { a.status = dec === "done" ? "done" : "skipped"; a.statusWhy = w2; a.note = (dec === "done" ? "Done: " : "Outdated: ") + w2; a.closedBy = by.name; a.closedAt = now(); rec.push({ what:(dec === "done" ? "Closed as done: " : "Closed as outdated: ") + str(a.title, 100), why:w2 }); } }
    else if(t === "al"){ if(dec === "update" && x.text){ o.alert = str(x.text, 200); rec.push({ what:"Warning updated", why:w2 }); } else if(dec !== "update"){ (o.closedItems = o.closedItems || []).push({ kind:"warning", text:o.alert, why:w2, decision:dec, at:now() }); delete o.alert; rec.push({ what:"Warning removed (" + dec + ")", why:w2 }); } }
    else if(t === "rk"){ const x2 = ((o.ai || {}).risks || [])[+id]; if(!x2) continue; if(dec !== "update"){ x2.status = dec === "done" ? "handled" : "outdated"; x2.statusWhy = w2; rec.push({ what:"Risk closed (" + dec + "): " + str(x2.risk || x2.text || "", 80), why:w2 }); } }
    else if(t === "pm"){ const x2 = ((o.ai || {}).promises || [])[+id]; if(!x2) continue;
      if(dec === "update"){ if(x.text) x2.what = str(x.text, 240); if(/^\d{4}-\d{2}-\d{2}$/.test(x.needBy || "")) x2.by = x.needBy; rec.push({ what:"Promise updated: " + str(x2.what, 80), why:w2 }); }
      else { x2.status = dec === "done" ? "kept" : "outdated"; x2.statusWhy = w2; rec.push({ what:"Promise closed (" + (dec === "done" ? "kept" : "outdated") + "): " + str(x2.what, 80), why:w2 }); } }
    else if(t === "r"){ const x2 = ((o.retention || {}).reminders || []).find(y => y.id === id); if(!x2) continue;
      if(dec === "update"){ if(x.text) x2.what = str(x.text, 240); if(/^\d{4}-\d{2}-\d{2}$/.test(x.needBy || "")) x2.due = x.needBy; x2.updatedWhy = w2; rec.push({ what:"Client care reminder updated: " + str(x2.what, 90), why:w2 }); }
      else { x2.status = dec === "done" ? "done" : "skipped"; x2.note = w2; x2.doneBy = by.name; x2.doneAt = now(); rec.push({ what:"Client care reminder closed (" + dec + ")", why:w2 }); } }
    else if(drop[t]){ const i = +id; if(dec === "update" && x.text){ if(t === "b" && ck.beforeDelivery[i]) ck.beforeDelivery[i].do = str(x.text, 400); if(t === "w" && ck.waitingOnClient[i] != null) ck.waitingOnClient[i] = str(x.text, 400); if(t === "p" && ck.problems[i]) ck.problems[i].text = str(x.text, 400); }
      else if(dec !== "update") drop[t].add(i); } }
  if(drop.b.size) ck.beforeDelivery = ck.beforeDelivery.filter((_, i) => !drop.b.has(i));
  if(drop.w.size) ck.waitingOnClient = ck.waitingOnClient.filter((_, i) => !drop.w.has(i));
  if(drop.p.size) ck.problems = ck.problems.filter((_, i) => !drop.p.has(i));
  const nList = drop.b.size + drop.w.size + drop.p.size;
  if(nList) rec.push({ what:nList + " outdated line(s) removed from the check's lists", why:"the situation changed since the check" });
  o.recon = { key, at:now(), why:str(why, 60), judged:items.length, changed:rec.length, log:rec.concat((o.recon || {}).log || []).slice(0, 30) };
  if(o.closedItems) o.closedItems = o.closedItems.slice(-40);
  if(rec.length) log(o, by, "Kept the order current (" + why + "): " + rec.map(x => x.what).join("; ").slice(0, 400));
  return rec.length;
}

/* Before the desk sends or hands over ANYTHING (a group message, a client message, the delivery message), it reads every channel again
   and, when something changed since its last reading, judges the order again, so nothing goes out from an old picture */
async function ensureCurrent(o, why){
  await freshen(o); const nw = [...new Set(await newerThanRead(o))];
  if(nw.length){ const q0 = o._quiet; o._quiet = true; o._regated = true; try{ await checkNow(o); }finally{ o._quiet = q0; delete o._regated; } }
  else { try{ await reconcile(o, why || "before sending"); }catch(e){} }
  return nw;
}
/* Current sources, right now: the group, emails, the folder and files newly posted, without starting a check of their own */
async function freshen(o){
  let n = 0; o._noCheck = true; try{ n = (await syncTeam(o)).new; }catch(e){} finally{ delete o._noCheck; }
  try{ n += await matchDocs([o]); }catch(e){} groupDocs(o); return n;
}
/* A message the desk itself wrote: one of its recorded posts, or one carrying its "Order desk:" tag. A person typing from the same
   Google account (for example Manav using seo@indiit.com) is a person, and their commands count. */
const isDeskMsg = (o, m) => { const id = m.id || m.name || ""; return (!!id && (o.deskPosts || []).some(x => x.name && x.name === id)) || /^\s*(Order desk|SEO Desk):/i.test(m.text || m.full || ""); };
/* Anything a person said, sent, posted or edited after the desk last read the order (messages, emails, new files, edited files) */
async function newerThanRead(o){
  const at = (o.readLog || {}).at || o.checkAt || ""; if(!at) return ["nothing read yet"];
  const out = [];
  for(const m of o.teamChat || []) if(m.at > at && !isDeskMsg(o, m)) out.push("a message from " + String(m.by || "").split(" ")[0]);
  for(const m of o.mails || []) if(m.date > at) out.push("an email (" + str(m.subject, 50) + ")");
  if(o.lastUpdateAt && o.lastUpdateAt > at) out.push("new client chat pasted by sales");
  for(const d of (o.docs || []).filter(x => x.status === "linked" && x.current !== false)){
    if(d.at && d.at > at){ out.push("a new file (" + str(d.name, 50) + ")"); continue; }
    try{ const md = await docModified(d); if(md && md.at){ if(md.at > at) out.push("an edited file (" + str(d.name, 50) + (md.by ? ", by " + md.by.split(" ")[0] : "") + ")"); d.modified = md.at; if(md.by) d.by = md.by; } }catch(e){} }
  return out;
}

/* The order check: requirement email first, then what the team says, the work report, and the client's live site and Google data.
   It always starts from current sources: the group, emails and files are read again first, so it never judges from an old copy. */
async function buildCheck(o, fresh){
  if(!aiOn()) return null; const own = !o._fresh;
  if(own){ o._fresh = true; try{ await freshen(o); }catch(e){} }
  try{ return await checkNow(o, fresh); }finally{ if(own) delete o._fresh; }
}
async function checkNow(o, fresh){
  groupDocs(o);
  const gig = gigOf(o.gig), convoText = o.convo ? o.convo.messages.map(m => `${m.time || ""} ${m.who === "us" ? "US" : "CLIENT"} ${m.name || ""}: ${m.text}`).join("\n") : o.chat;
  // Requirements stay fixed once set from the requirement email, until that email changes or "fresh" is asked for
  const prev = o.check && o.check.reqMail && (o.check.requirements || []).length && !fresh ? o.check : null;
  const p1 = planPrompt(o, gig, convoText, prev ? prev.requirements : null), r1 = await askAI("check1", "claude-sonnet-5-5", p1.system, p1.user, 8000), plan = r1.data || {};
  const ri = plan.reqMail && Number.isInteger(plan.reqMail.index) ? plan.reqMail.index : -1, reqMail = ri >= 0 ? (o.mails || [])[ri] || null : null;
  if(prev && reqMail && reqMail.id === prev.reqMail.id) plan.requirements = prev.requirements.map(r => { const nw = (plan.requirements || []).find(x => x.id === r.id) || {}; return Object.assign({}, r, { phase:nw.managerSaid && nw.phase ? nw.phase : r.phase || nw.phase, managerSaid:nw.managerSaid || r.managerSaid || "", askedIn:nw.askedIn && nw.askedIn.where ? nw.askedIn : r.askedIn, why:r.why || nw.why }); });
  // Tasks the manager added are requirements of this order from now on, checked like every other
  plan.requirements = (plan.requirements || []).filter(r => !(o.mgrTasks || []).some(m => m.id === r.id)).concat((o.mgrTasks || []).filter(m => !(o.discarded || {})[m.id]).map(m => ({ id:m.id, text:m.text, source:"manager", type:"", phase:m.phase, doneWhen:"", askedIn:{ where:"Added by " + m.by + " (manager)", when:String(m.at).slice(0, 10), quote:m.text } })));
  const reads = [];
  // Every current document is read (no file is skipped): reports in full first, then data files share what is left; pictures are looked at
  const cur = (o.docs || []).filter(x => x.status === "linked" && x.current !== false).sort((a, b) => (a.kind === "data") - (b.kind === "data") || String(b.modified).localeCompare(String(a.modified)));
  const isPic = d => /^image\//.test(d.mime || "") || /\.(png|jpe?g|gif|webp)$/i.test(d.name || "");
  let budget = 140000; const readLog = [], pics = [];
  const txtDocs = cur.filter(d => !isPic(d)), nData = txtDocs.filter(d => d.kind === "data").length;
  for(const [i, d] of txtDocs.entries()){ const left = txtDocs.length - i, dataLeft = txtDocs.slice(i).filter(x => x.kind === "data").length;
    const cap = d.kind === "data" ? Math.max(2500, Math.min(12000, Math.floor(budget / Math.max(1, dataLeft)))) : Math.max(4000, Math.min(40000, budget - 3000 * dataLeft));
    try{ const full = await docText(d, 400000), t = fitText(full, cap); budget -= t.length;
      readLog.push({ id:d.id, name:d.name, chars:full.length, used:t.length, whole:t.length >= full.length, ok:!!full, kind:d.kind });
      if(t) reads.push({ name:d.name, link:d.link, modified:d.modified, by:d.by, kind:d.kind, full, content:t }); }
    catch(e){ readLog.push({ id:d.id, name:d.name, chars:0, used:0, whole:false, ok:false, err:str(e.message, 80) }); } }
  for(const d of cur.filter(isPic).slice(0, 8)){
    try{ const b = await fileBytes(d); if(b && b.length < 4.5e6){ const mt = /^image\//.test(d.mime || "") ? d.mime : "image/" + (String(d.name).split(".").pop().toLowerCase().replace("jpg", "jpeg"));
        pics.push({ name:d.name, by:d.by, modified:d.modified, why:d.why, mt, b64:b.toString("base64") }); readLog.push({ id:d.id, name:d.name, picture:true, ok:true, whole:true, chars:0, used:0 }); }
      else readLog.push({ id:d.id, name:d.name, picture:true, ok:false, err:"picture too large" }); }
    catch(e){ readLog.push({ id:d.id, name:d.name, picture:true, ok:false, err:str(e.message, 80) }); } }
  o.readLog = { at:now(), docs:readLog, messages:(o.teamChat || []).length, groups:Object.values(o.chatFull || {}).map(g => g) };
  o.seen = Object.assign(o.seen || {}, { files:now(), site:now() });
  const probes = [];
  for(const pr of (plan.probes || []).slice(0, 12)) probes.push(Object.assign({ r:pr.r, expect:str(pr.expect, 200) }, await probe(o.client.website, pr)));
  // Quick fixes already asked: their pages are read live so the desk knows when each is done
  for(const qf of ((o.check || {}).quickFixes || []).filter(q => q.status !== "done").slice(0, 6)) for(const u of (qf.pages || []).slice(0, 8))
    try{ probes.push(Object.assign({ r:"quick fix " + qf.id, expect:qf.what }, await probe(o.client.website, { url:u, look:qf.look || "description" }))); }catch(e){}
  // Pages the team's files say were changed are read live by the desk itself, so nobody is asked to "confirm" what the desk can see
  { const h = domOf(o.client.website), seen = new Set(probes.map(p => p.url)), cands = [], tcount = {};
    const abs = raw => /^\//.test(raw) ? (() => { try{ return new URL(/^https?:/i.test(o.client.website) ? o.client.website : "https://" + o.client.website).origin + raw; }catch(e){ return ""; } })() : raw;
    for(const x of reads.filter(x2 => x2.kind !== "data")) for(const ln of String(x.full || x.content).split("\n")){ if(!/updated|done|fixed|changed|title|duplicate|rewritten/i.test(ln)) continue;
      const cells = ln.split("\t");
      cells.forEach((c, i) => { const raw = c.trim().replace(/[.)]+$/, ""); if(!/^(https?:\/\/\S+|\/[a-z0-9][\w\-\/]*)$/i.test(raw)) return; const u = abs(raw);
        if(!u || domOf(u) !== h || seen.has(u) || /\.(xml|txt|jpg|png|pdf)$/i.test(u)) return; seen.add(u);
        const title = String(cells[i + 1] || "").trim().toLowerCase(); if(title) tcount[title] = (tcount[title] || 0) + 1; cands.push({ u, title }); }); }
    // Pages whose title repeats in the team's sheet (real duplicates) are read first
    cands.sort((p, q) => ((tcount[q.title] || 0) > 1) - ((tcount[p.title] || 0) > 1));
    const pick = cands.slice(0, 40);
    for(let i = 0; i < pick.length; i += 8) (await Promise.all(pick.slice(i, i + 8).map(c => probe(o.client.website, { url:c.u, look:"title" }).catch(() => null))))
      .forEach(r => { if(r) probes.push(Object.assign({ r:"files", expect:"the title the team's file gives for this page, unique" }, r)); }); }
  if(!o.verify || Date.now() - Date.parse(o.verify.at || 0) > 30 * 6e4) try{ const v = await verifyOrder(o.client.website, o.google && o.google.gsc); o.verify = v; }catch(e){}
  if(o.verify && o.verify.at) o.seen = Object.assign(o.seen || {}, { gsc:o.verify.at });
  reads.forEach(x => delete x.full);
  const p2 = judgePrompt(o, plan, reqMail, reads, probes, o.verify ? verifyText(o.verify) : ""), r2 = await askAI("check2", "claude-sonnet-5-5", p2.system, pics.length ? [{ type:"text", text:p2.user + "\n\nPICTURES THE TEAM SHARED (look at each; a screenshot can be proof):" }].concat(pics.flatMap(x => [{ type:"text", text:"PICTURE: " + x.name + " (" + (x.why || "") + ", " + (x.modified || "") + ")" }, { type:"image", source:{ type:"base64", media_type:x.mt, data:x.b64 } }])) : p2.user, 10000);
  o.aiUsd = +(num(o.aiUsd, 0) + r1.usd + r2.usd).toFixed(4);
  const phaseOf = r => r.source === "manager" && r.phase ? r.phase : REC.test((r.text || "") + " " + (r.type || "")) && !/report|audit|sheet/i.test(r.text || "") ? "delivery" : ["project", "delivery", "client"].includes(r.phase) ? r.phase : /confirm|approv|client (gives|shares|sends)/i.test((r.text || "") + " " + (r.doneWhen || "")) && !/report|review/i.test(r.type || "") ? "client" : ["file or recording", "communication"].includes(r.type) ? "delivery" : "project";
  const aIn = a => a && typeof a === "object" ? { where:str(a.where, 40), when:str(a.when, 40), quote:str(a.quote, 240) } : null;
  const mIds = new Set((o.mgrTasks || []).map(m => m.id));
  const reqs = (plan.requirements || []).filter(r => !mIds.has(r.id)).slice(0, 25).concat((plan.requirements || []).filter(r => mIds.has(r.id))).map(r => ({ id:str(r.id, 12), text:str(r.text, 300), source:str(r.source, 40), type:str(r.type, 30), phase:phaseOf(r), doneWhen:str(r.doneWhen, 240), askedIn:aIn(r.askedIn), why:str(r.why, 240), note:str(r.note, 200), managerSaid:str(r.managerSaid, 400) }));

  // The scope never changes silently: any task added, dropped or moved (for example by a manager's instruction) is recorded with its reason,
  // shown on the order, and nothing is posted to the group about the new scope until a manager or Manav has seen it
  { const before = ((o.check || {}).requirements || []).filter(r => !(o.mgrTasks || []).some(m => m.id === r.id));
    if(before.length){ const after = reqs.filter(r => !(o.mgrTasks || []).some(m => m.id === r.id)), ch = [];
      for(const r of after){ const b = before.find(x => x.id === r.id); if(!b) ch.push({ kind:"added", text:r.text });
        else if((b.phase || "project") !== (r.phase || "project")) ch.push({ kind:"moved", text:r.text, from:b.phase || "project", to:r.phase || "project", why:r.managerSaid || "" }); }
      for(const b of before) if(!after.some(x => x.id === b.id)) ch.push({ kind:"dropped", text:b.text });
      if(ch.length){ o.scopePending = { at:now(), changes:ch.slice(0, 12) }; log(o, { name:"Order desk" }, "Scope changed by the check (waits for a manager to see it): " + ch.map(c => c.kind + ": " + str(c.text, 70) + (c.why ? " (" + str(c.why, 120) + ")" : "")).join("; ")); } } }
  // Roles, not personal names, for our sales side
  const seller = new Set(["Manav", "Manav Sharma"].concat((await people()).filter(p => rolesOf(p).some(r => ["sales", "comms", "admin"].includes(r))).map(p => p.name).filter(Boolean)));
  const role = t => { let x = String(t || ""); for(const n of seller) x = x.replace(new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"), "Sales"); return x.replace(/\bSales Sharma\b/g, "Sales"); };
  const walk = v => typeof v === "string" ? role(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k2, v2]) => [k2, walk(v2)])) : v;
  const d2 = walk(r2.data || {}); d2.verdict = noId(d2.verdict); d2.verdictTeam = noId(d2.verdictTeam); (d2.problems || []).forEach(p => p.text = noId(p.text)); (d2.rows || []).forEach(x => { x.found = noId(x.found); x.toPass = noId(x.toPass); x.where = noId(x.where); x.check = noId(x.check); });
  (d2.rows || []).forEach(x => { const q = (plan.requirements || []).find(y => y.id === x.r) || {}; x.who = ownerOf(x.who, (q.text || "") + " " + (x.toPass || "")); });
  d2.pathToQA = (d2.pathToQA || []).filter(p => !REC.test(String(p.do || ""))).slice(0, 5).map(p => ({ who:str(p.who, 40), do:noId(str(p.do, 300)), where:noId(str(p.where, 200)), check:noId(str(p.check, 200)), closes:num(p.closes, 0) }));
  d2.beforeDelivery = (d2.beforeDelivery || []).slice(0, 6).map(p => ({ who:str(ownerOf(p.who, p.do), 40), do:noId(str(p.do, 300)) })); d2.waitingOnClient = (d2.waitingOnClient || []).slice(0, 6).map(t => noId(str(t, 240)));
  // Quick fixes get their own focused look: small fixes the team's reports found, invited by the client's own words
  d2.quickFixes = ((o.check || {}).quickFixes || []).slice();   // keep tracking what was already asked
  // Only when a person (the client, the manager, sales, the PM) asked for small fixes: never on the desk's own initiative or its own messages
  try{ const deskIds = new Set((o.deskPosts || []).map(x => x.sender).filter(Boolean));
    const voices = [((reqMail || {}).text || "")].concat((o.teamChat || []).filter(m => !(m.sender && deskIds.has(m.sender)) && !/order desk|seo desk|^indi ?it\b/i.test(m.by || "")).map(m => m.text), o.convo ? o.convo.messages.filter(m => m.who !== "us").map(m => m.text) : [String(convoText || "")]);
    const inv = voices.join("\n").split(/\n|(?<=[.!?])\s+/).filter(l => /\bfix/i.test(l) && /quick|straightforward|small|easy|minor|while you.re (in )?there/i.test(l)).slice(0, 6);
    if(inv.length){ const old = (o.check || {}).quickFixes || [];
      const pp = await people(), roleOfBy = by => { const p2 = pp.find(x => x.name && String(by || "").toLowerCase().startsWith(x.name.toLowerCase().split(" ")[0])); const rs = p2 ? rolesOf(p2) : []; return rs.includes("manager") ? "manager" : rs.includes("pm") ? "PM" : "team"; };
      const dq = o.discardedQF || {}, dqTxt = Object.values(dq).map(x => String(x.what || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40));
      const firstAsk = old.reduce((m2, q) => q.at && q.at < m2 ? q.at : m2, new Date(Date.now() - 5 * 864e5).toISOString());
      const said = (o.teamChat || []).filter(m => m.at >= firstAsk && !isDeskMsg(o, m)).slice(-30).map(m => String(m.at).slice(0, 16).replace("T", " ") + " " + m.by + " (" + roleOfBy(m.by) + "): " + str(m.text, 700));
      const sysQ = `You pick QUICK FIXES for one SEO order: small fixes (minutes each, a handful of pages) that the team's own reports found and that the client's words invite. They are asked from the team in parallel and never stop QA. Big work (dozens of pages, page speed, content rewrites) is NOT a quick fix; it stays a next step. Writing a new page or new content (a privacy policy, an about page, a blog post) is never a quick fix. Never pick what the requirements already cover.
WHAT THE TEAM SAID decides scope and status, newest word first. When the PM or a manager says which quick fixes were agreed (for example "as discussed with the manager, we needed to fix A, B and C"), only those are quick fixes: drop every other one, even one already asked. When a team member says a fix is done and the team's file marks it done or updated, it is done, unless a live check shows that exact problem still on the page. Never ask again for something a person said is done when you have no live proof against it. Name the exact pages when a report lists them. For each fix already asked, keep its id and set status from the live checks: "done" only when the live check shows it fixed. At most 4 fixes. Plain words. Answer with one JSON object only: {"quickFixes":[{"id":"q1 or the id it already has","what":"what to fix and how many pages","pages":["page address or path"],"look":"description | title | h1","status":"open | done","found":"what the live check shows now, or empty","invitedBy":"the inviting words, copied word for word"}]}`;
      const userQ = `SITE: ${o.client.website}\nTHE CLIENT'S INVITING WORDS: ${JSON.stringify(inv)}\nREQUIREMENTS (already covered, not quick fixes): ${JSON.stringify(reqs.map(r => r.text))}\nDISCARDED BY THE MANAGER (never pick these again): ${JSON.stringify(Object.values(dq).map(x => x.what))}\nQUICK FIXES ALREADY ASKED: ${JSON.stringify(old.filter(q => !dq[q.id]).map(q => ({ id:q.id, what:q.what, pages:q.pages, look:q.look, status:q.status })))}\nLIVE CHECKS OF THEIR PAGES: ${JSON.stringify(probes.filter(p => /^quick fix/.test(p.r || "")))}\nWHAT THE TEAM SAID SINCE THE FIRST QUICK FIX WAS ASKED (oldest first):\n${said.join("\n") || "(nothing)"}\nTHE TEAM'S REPORTS:\n${reads.filter(x => x.kind !== "data").map(x => "FILE: " + x.name + "\n" + fitText(x.content, 25000)).join("\n\n").slice(0, 90000)}`;
      const rq = await askAI("quickfix", "claude-sonnet-5-5", sysQ, userQ, 2500); o.aiUsd = +(num(o.aiUsd, 0) + rq.usd).toFixed(4);
      if(Array.isArray((rq.data || {}).quickFixes)) d2.quickFixes = rq.data.quickFixes.filter(q => !dq[q.id] && !dqTxt.includes(String(q.what || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40))); } }catch(e){}
  d2.deliveryNotes = (d2.deliveryNotes || []).map(x => noId(str(x, 300))).filter(Boolean).slice(0, 8);
  const prevQF = (o.check || {}).quickFixes || [];
  d2.quickFixes = (d2.quickFixes || []).slice(0, 6).map((q, i) => { const old = prevQF.find(x => x.id === q.id);
    return { id:old ? old.id : "q" + (Math.max(0, ...prevQF.map(x => parseInt(String(x.id).slice(1)) || 0)) + i + 1), what:noId(str(q.what, 700)), pages:(q.pages || []).map(u => str(u, 300)).slice(0, 12), look:["description", "title", "h1"].includes(q.look) ? q.look : "description",
      status:q.status === "done" ? "done" : "open", found:noId(str(q.found, 240)), invitedBy:str(q.invitedBy, 300), at:old ? old.at : now(), doneAt:q.status === "done" ? (old && old.doneAt) || now() : "" }; });
  o.check = Object.assign(d2, { claims:(plan.claims || []).slice(0, 40).map(c => ({ r:str(c.r, 12), by:role(str(c.by, 60)), at:str(c.at, 40), what:str(c.what, 240) })), at:now(), usd:+(r1.usd + r2.usd).toFixed(4), requirements:reqs, chatNotInMail:(plan.chatNotInMail || []).slice(0, 10), outOfScope:(plan.outOfScope || []).slice(0, 10), reqWhy:plan.reqMail ? str(plan.reqMail.why, 240) : "",
    reqMail:reqMail ? { id:reqMail.id, subject:reqMail.subject, from:reqMail.from, to:reqMail.to, date:reqMail.date, text:str(reqMail.text, 6000) } : null,
    probes, files:reads.map(x => ({ name:x.name, link:x.link, modified:x.modified, by:x.by })) });
  // Scope follows the requirement email: when nothing has been ticked yet, the deliverables become its requirements
  const untouched = !(o.deliverables || []).some(d => d.done || proofsOf(d).length || d.qa);
  if(reqMail && reqs.length && untouched && !(o.deliverables || []).every(d => d.req)){
    o.deliverables = reqs.filter(r => r.phase === "project").map(r => ({ id:nid("d"), text:r.text, done:false, proof:"", qa:"", req:r.id }));
    log(o, { name:"Order desk" }, "Deliverables set from the requirement email \"" + str(reqMail.subject, 80) + "\": " + o.deliverables.length + " project requirements");
  }
  // Only project work goes through QA: delivery and client items leave the deliverables (kept with their proof if any)
  if((o.deliverables || []).every(d => d.req)){ const proj = new Set(reqs.filter(r => r.phase === "project").map(r => r.id)), out = o.deliverables.filter(d => !proj.has(d.req));
    if(out.length){ o.deliverables = o.deliverables.filter(d => proj.has(d.req)); log(o, { name:"Order desk" }, "Moved out of the QA gate (delivery or client items): " + out.map(d => str(d.text, 60)).join("; ")); } }
  // Tasks discarded by the team (with a recorded reason) leave the checks and the QA gate
  const dis = o.discarded || {};
  o.check.rows = (o.check.rows || []).filter(r => !dis[r.r]);
  if((o.deliverables || []).some(d => d.req && dis[d.req])) o.deliverables = o.deliverables.filter(d => !(d.req && dis[d.req]));
  // A manager's word in the project group settles a requirement either way
  for(const row of o.check.rows || []){ const ov = (o.overrides || {})[row.r]; if(!ov) continue;
    if(ov.decision === "accepted" && row.status !== "done"){ row.status = "done"; row.found = "Accepted by " + ov.by + " (manager) in the project group" + (ov.note ? ": " + ov.note : ""); row.toPass = ""; row.where = ""; row.check = ""; row.proofUrl = ""; }
    if(ov.decision === "reopened" && row.status === "done"){ row.status = "partly"; row.toPass = "Reopened by " + ov.by + " (manager): " + (ov.note || "see the project group"); } }
  // The group message decides what the team is asked for. An open item nobody asked for (no email, KT note, group message or client chat
  // asks for it) is not asked from the team, so it does not block QA either: the portal and the group always say the same thing.
  try{ o.groupMsg = await writeGroupMsg(o); o.groupMsgAt = now(); }catch(e){}
  const notAsked = new Set((o.groupMsgLeftOut || []).map(x => x.id));
  for(const row of o.check.rows || []){ if(notAsked.has(row.r) && row.status !== "done") row.notAsked = true; else delete row.notAsked; }
  for(const d of o.deliverables || []){ if(d.req && notAsked.has(d.req) && !d.done) d.notAsked = true; else delete d.notAsked; }
  if((o.check.rows || []).length && (o.check.rows || []).every(r => r.status === "done" || r.notAsked || ((o.check.requirements || []).find(q => q.id === r.r) || {}).phase !== "project")) o.check.readyForQA = true;
  // A requirement the check finds done is ticked, with what proved it; when every one is done the order moves to QA
  let ticked = 0;
  for(const row of o.check.rows || []){ const d = (o.deliverables || []).find(x => x.req === row.r); if(!d) continue; row.d = d.id; d.status = row.status;
    if(row.status === "done" && !d.done){ d.done = true; ticked++;
      const u = /^https?:\/\//.test(row.proofUrl || "") ? row.proofUrl : "";
      if(u && !proofsOf(d).some(p => p.url === u)){ d.proofs = proofsOf(d).concat({ id:nid("p"), kind:/google\.com/.test(u) ? "drive" : "link", url:u, name:str(row.found, 90) || u, at:now(), by:"Order check", auto:str(row.found, 200) }); delete d.proof; }
      else if(!u){ d.proofs = proofsOf(d).concat({ id:nid("p"), kind:"check", url:"", name:"Order check: " + str(row.found, 120), at:now(), by:"Order check", auto:str(row.found, 200) }); delete d.proof; } }
    if(["not done", "partly"].includes(row.status) && d.done && proofsOf(d).every(p => p.by === "Order check")){ d.done = false; } }
  if(ticked) log(o, { name:"Order desk" }, ticked + " requirement" + (ticked > 1 ? "s" : "") + " confirmed done by the order check");
  if(o.stage === "work" && o.deliverables.length && o.deliverables.every(d => d.done || d.notAsked) && o.deliverables.some(d => d.done) && !staleProofs(o).length){
    o.deliverables.forEach(d => { d.qa = ""; d.qaNote = ""; }); setStage(o, "qa"); log(o, { name:"Order desk" }, "Every requirement is confirmed done. Sent to QA."); try{ await buildPack(o); }catch(e){} }
  for(const e of perfFromCheck(o)) await perfEv(e);
  o.checkAt = now(); log(o, { name:"Order desk" }, "Order checked: " + str(o.check.verdict, 200));
  try{ await reconcile(o, "new check"); }catch(e){}
  if(["qa", "ready"].includes(o.stage)) try{ await buildPack(o); }catch(e){}   // the delivery pack always follows the newest check
  if(["qa", "ready"].includes(o.stage)) try{ await reportQA(o); }catch(e){}   // every file for the client checked on the ten points (again only when a file or the check changed)
  // A draft work report not yet approved is rewritten when the task statuses it was written from have changed
  if(o.draftReport && !o.draftReport.approved && o.draftReport.fp !== rowsFp(o) && !["delivered", "done", "cancelled"].includes(o.stage)) try{ await draftReport(o); log(o, { name:"Order desk" }, "Work report draft rewritten: the task statuses changed since it was written"); }catch(e){}
  try{ await buildGuides(o); }catch(e){}
  // Auto-post only a check that could judge everything: if any item could not be checked, or a file could not be opened, a person looks first
  const unsure = (o.check.rows || []).some(r => /cannot/i.test(r.status || "") || (r.status !== "done" && /not (been )?read|will read|not checked|could not (read|open|check)/i.test(r.found || ""))) || ((o.readLog || {}).docs || []).some(d => !d.ok);
  o.check.autoPostHeld = unsure ? "Not sent to the group by itself: the check could not verify every item. Read it, then post it yourself." : "";
  try{ const cfg2 = await cfgOf(), why = postReason(o); if(cfg2.autoPost && !o._quiet && !unsure && why) await postSteps(o, cfg2, null, why); }catch(e){}
  return o.check;
}

const rowsFp = o => sha(JSON.stringify(((o.check || {}).rows || []).map(r => [r.r, r.status]))).slice(0, 12);
/* Work report draft: when work is visibly done but missing from the team's report, the desk writes those parts from what it verified
   itself (live site, Search Console, the team's files), each with its source and date. Nothing unverified is claimed. A person approves
   it before it counts as the work report. */
async function draftReport(o){
  if(!aiOn()) throw new Error("The AI helpers are off");
  const ck = o.check; if(!ck || !(ck.rows || []).length) throw new Error("Run Check the order first");
  const acc = (await gAccounts()).find(x => x.primary); if(!acc || !acc.write) throw new Error("Reconnect your Google account on the HoD report page so the desk can save the draft in your Drive");
  const reqs = ck.requirements || [], rows = ck.rows.map(r => Object.assign({ req:(reqs.find(q => q.id === r.r) || {}) }, r)).filter(r => (r.req.phase || "project") === "project");
  const system = `You write the work report the client receives at delivery, for one order of an SEO, web and ads agency. It is TASK BY TASK: one part per task, in the order given, using the task names as given (plain words for a business owner). For each task: status ("done" when the evidence shows it, "in progress" when part is shown, "not verified yet" when nothing shows it), what we did, what we found, the evidence with source and date in brackets (for example: live check of robots.txt, 25 Nov; Search Console, sitemap read 23 Nov; our on page sheet, tab Long Meta Titles), and the next step if any. Write ONLY what the evidence shows; never claim what it does not show. Never invent numbers. Explain honestly that Google takes time to recrawl and index. Plain, warm, professional English. Never mention tools that write for us, internal order numbers, email addresses or names of our accounts (say "our access"). No dashes.
Answer with one JSON object only: {"title":"","intro":"two or three lines","tasks":[{"r":"task id as given","title":"task name","status":"done | in progress | not verified yet","did":["what we did, with source and date"],"found":["what we found, with numbers and source"],"next":"next step, or empty"}],"timing":"one honest paragraph about Google's timing","nextSteps":[{"step":"","priority":"high | medium | low"}]}`;
  const user = `Site ${o.client.website}, client ${o.client.name || ""}, date ${now().slice(0, 10)}.
TASKS IN ORDER, WITH WHAT THE ORDER CHECK FOUND:
${JSON.stringify(rows.map(r => ({ id:r.r, task:r.req.text, type:r.req.type, status:r.status, found:r.found, live:r.live, report:r.report, team:r.team })))}
LIVE CHECKS ON THE CLIENT'S SITE: ${JSON.stringify(ck.probes || [])}
SEARCH CONSOLE AND SITE CHECK: ${o.verify ? verifyText(o.verify) : "not available"}
TEAM FILES READ: ${JSON.stringify(ck.files || [])}`.slice(0, 90000);
  const r = await askAI("draftreport", "claude-sonnet-5-5", system, user, 9000), d = r.data || {}; o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  const h = t => String(t == null ? "" : t).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "our access").replace(/\bO-\d{4,}\b,?\s*/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const SN2 = { done:"Done", "in progress":"In progress", "not verified yet":"Not verified yet" }, tasks = d.tasks || [];
  const html = `<h1>${h(d.title || "Work report: " + domOf(o.client.website))}</h1><p>${h(d.intro || "")}</p>
    <h2>Summary</h2><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th style="background:#eef2f7">#</th><th style="background:#eef2f7">Task</th><th style="background:#eef2f7">Status</th></tr>${tasks.map((t, i) => `<tr><td>${i + 1}</td><td>${h(t.title)}</td><td>${h(SN2[t.status] || t.status)}</td></tr>`).join("")}</table>` +
    tasks.map((t, i) => `<h2>${i + 1}. ${h(t.title)}</h2><p><b>Status:</b> ${h(SN2[t.status] || t.status)}</p>${(t.did || []).length ? `<p><b>What we did</b></p><ul>${t.did.map(x => `<li>${h(x)}</li>`).join("")}</ul>` : ""}${(t.found || []).length ? `<p><b>What we found</b></p><ul>${t.found.map(x => `<li>${h(x)}</li>`).join("")}</ul>` : ""}${t.next ? `<p><b>Next step:</b> ${h(t.next)}</p>` : ""}`).join("") +
    (d.timing ? `<h2>About Google's timing</h2><p>${h(d.timing)}</p>` : "") +
    ((d.nextSteps || []).length ? `<h2>Recommended next steps</h2><ol>${d.nextSteps.map(x => `<li>${h(x.step)} (${h(x.priority)} priority)</li>`).join("")}</ol>` : "");
  d.notVerified = tasks.filter(t => t.status !== "done").map(t => t.title + ": " + (SN2[t.status] || t.status).toLowerCase());
  const st = Object.assign({ files:{} }, (await getJ(REPK)) || {});
  if(!st.folder) await driveReports(true); const st2 = Object.assign({ files:{} }, (await getJ(REPK)) || {});
  if(!st2.drafts){ st2.drafts = await gFolder(acc.email, "Work report drafts", st2.folder.id); }
  const key = "rep:" + o.id, name = o.id + " · " + domOf(o.client.website) + " · work report draft";
  await gPut(acc.email, st2, key, name, st2.drafts.id, "doc", html); await setJ(REPK, st2);
  const f = st2.files[key];
  o.draftReport = { at:now(), id:f.id, link:f.link, name, html, approved:false, via:acc.email, notVerified:d.notVerified || [], fp:rowsFp(o) };
  log(o, { name:"Order desk" }, "Work report draft written from verified work only: " + name);
  return o.draftReport;
}

/* Which order a message is about: its order number, the client's site or the client's name */
function orderInText(text, orders){
  const t = String(text || "").toLowerCase();
  return orders.find(o => t.includes(o.id.toLowerCase())) || orders.find(o => { const d = domOf(o.client.website); return d && (t.includes(d) || (d.split(".")[0].length >= 5 && t.includes(d.split(".")[0]))); }) || orders.find(o => (o.client.name || "").length >= 5 && t.includes(o.client.name.toLowerCase())) || null;
}
/* Common groups of seniors (not one order's project group, not the access group): messages about an order become senior notes on it */
async function readCommon(){
  const cfg = await cfgOf(), as = await poster(cfg) || cfg.chatAs; if(!as) return "no account";
  const since = (await cmd("GET", P + "common:at")) || new Date(Date.now() - 3 * 864e5).toISOString(), started = now();
  const orders = (await loadAll(300)).filter(o => !["done", "cancelled"].includes(o.stage)), own = new Set(orders.map(o => (groupOf(o) || {}).id).filter(Boolean));
  const gm = ((await getJ(GMK)) || {}).spaces || {}, kindOf = id => (gm[id] || {}).kind || "";
  const spaces = (await mySpaces(as)).filter(x => !/^DIRECT_MESSAGE$/i.test(x.type) && !own.has(x.id) && !["access", "client", "project"].includes(kindOf(x.id)) && !(!kindOf(x.id) && /access/i.test(x.name))).slice(0, 15); let n = 0; const touched = new Set();
  for(const sp of spaces){ let msgs = []; try{ msgs = await chatSince(as, sp.id, since); }catch(e){ continue; }
    for(const m of msgs){ const o = orderInText(m.text, orders); if(!o || /^Order desk:/.test(m.text)) continue;
      if((o.seniorNotes || []).some(x => x.id === m.id)) continue;
      (o.seniorNotes = o.seniorNotes || []).push({ id:m.id, at:m.at, by:m.by, group:sp.name, text:str(m.text, 1500) }); o.seniorNotes = o.seniorNotes.slice(-60); touched.add(o); n++; } }
  for(const o of touched){ log(o, { name:"Order desk" }, "New senior discussion about this order in " + [...new Set(o.seniorNotes.slice(-5).map(x => x.group))].join(", ")); o.checkAt = ""; await saveO(o); }
  await cmd("SET", P + "common:at", started);
  return n + " senior notes";
}

/* The order desk in the project group: posts the steps to reach QA, and answers the team's questions in the thread.
   It posts as the account chosen in Team and settings (Manav's), and starts each message with "Order desk:" unless that is turned off. */
const groupOf = o => { const n = {}; (o.teamChat || []).filter(m => m.spaceId && !/access/i.test(m.space || "")).forEach(m => n[m.spaceId] = (n[m.spaceId] || 0) + 1); const id = Object.keys(n).sort((a, b) => n[b] - n[a])[0]; return id ? { id, name:((o.teamChat || []).find(m => m.spaceId === id) || {}).space || "" } : null; };
async function poster(cfg){ const as = cfg.chatAs; if(!as) return null; const a = (await gAccounts()).find(x => x.email === as); return a && a.post ? a.email : null; }
const deskSay = (cfg, t) => (cfg.deskTag === true ? "Order desk: " : "") + t;
async function writeGroupMsg(o, opts){ opts = opts || {};
  const ck = o.check || {}, reqs = ck.requirements || [], ph = r => ((reqs.find(q => q.id === r.r) || {}).phase) || "project";
  const proj = (ck.rows || []).filter(r => ph(r) === "project" && !/sales/i.test(r.who || ""));
  const open = proj.filter(r => r.status !== "done" && (!opts.only || opts.only.includes(r.r))).map(r => { const q = reqs.find(x => x.id === r.r) || {};
    return { id:r.r, asked:q.text, status:r.status, found:r.found, missing:r.toPass, live:r.live, report:r.report, who:r.who }; });
  if(!open.length && !(ck.quickFixes || []).some(q => q.status !== "done")){ o.groupMsgLeftOut = []; return ""; }
  const done = proj.filter(r => r.status === "done").map(r => ({ asked:((reqs.find(x => x.id === r.r) || {}).text) || "", found:r.found }));
  // The sources a point may quote from, word for word
  const fwdD = m => { if(!m) return ""; const x = String(m.text || "").slice(0, 2000).match(/\nDate:\s*([^\n]+)/); const t = x ? Date.parse(x[1].replace(/\s+at\s+/, " ")) : NaN; return isNaN(t) ? m.date : new Date(t).toISOString(); };
  const rm0 = ck.reqMail || null, rm = rm0 ? Object.assign({}, rm0, { date:/^(fwd?|fw):/i.test(rm0.subject || "") ? fwdD(rm0) : rm0.date }) : null, fmtD = w => { const t = Date.parse(w); return isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10); };
  const src = [];
  if(rm) src.push({ key:"requirement email", date:fmtD(rm.date), text:rm.text || "" });
  const nm = f => String(f || "").replace(/<.*>/, "").replace(/"/g, "").trim().split(/[ @]/)[0];
  (o.mails || []).filter(m => !rm || m.id !== rm.id).forEach(m => src.push({ key:/\bKT\b|knowledge transfer/i.test(m.subject + " " + m.text.slice(0, 300)) ? "KT note" : "follow up email", date:fmtD(m.date), by:nm(m.from), text:"Subject: " + (m.subject || "") + "\n" + (m.text || "") }));
  const deskIds = new Set((o.deskPosts || []).map(x => x.sender).filter(Boolean));
  (o.teamChat || []).filter(m => !(m.sender && deskIds.has(m.sender)) && !/order desk|seo desk|^indi ?it\b/i.test(m.by || "") && !/^(Indi IT Solutions|Order desk|SEO Desk):/i.test(m.text || "")).forEach(m => src.push({ key:"project group", date:fmtD(m.at), by:String(m.by || "").split(" ")[0], text:m.by + ": " + (m.text || "") }));
  const cc = o.convo ? o.convo.messages.map(m => `${m.time || ""} ${m.who === "us" ? "US" : "CLIENT"}: ${m.text}`).join("\n") : (o.chat || "");
  if(cc) src.push({ key:"client chat", date:"", text:cc });
  const pm = (o.pmName || "").split(" ")[0];
  const system = `Never put in the message: a deadline or due date, a price, or client details (the client's name, contact, location, or the client's own words). You write the points of one team chat message to working professionals (SEO executives and their PM) about work still open before QA. They already have the emails and the group: never teach them how to work, no click steps.
Write ONE point per problem. Never put the same thing in two points (for example the robots.txt line belongs to exactly one point). Never mention anything in ALREADY VERIFIED DONE, not even "also confirm". When a team member, the PM or a manager said in the group that an item is done, fixed or agreed (see LATEST FROM THE TEAM), make NO point about it unless the findings hold live proof that it is still not done; then the point names who said done and states exactly what the live check shows. State only what the findings VERIFIED: when the findings say something was not read, not checked, or will be read later, make NO point about it (the desk checks it itself) and never write it as not done.
Each point: "title" (two to five words), for a quick fix list its pages (short paths) in "now", "now" (one short sentence: what is there now, as a plain fact), "expected" (one short sentence: what must be done or be there, as a plain instruction, for example "set the line to: Sitemap: https://site/sitemap_index.xml"). Say what is wrong in words anyone understands, and in a few words why it matters (for example: "the sitemap line in robots.txt is missing the word Sitemap: at the start, so search engines skip it"). Never write a bare web address as if it were the problem. Put any exact text the person must type or paste inside backticks, for example \`Sitemap: https://site/sitemap_index.xml\`. Use exact values only when the findings state them once and clearly; never join numbers from different files into a range, never round or guess. If it is a mistake (the team or a file says done but it is not), say exactly what says done and what shows it is not, for example: "The sheet's index tab says titles are Updated, but its title list marks every title Not Updated." No vague words like "must be exact", "still open", "needs work". Very simple, respectful English, at most 18 words a sentence. No dashes, no emojis, no asterisks or underscores.
Then the proof of who asked for it: "source" is where it was asked (requirement email, follow up email, KT note, project group, client chat) and "quote" is the shortest full sentence COPIED WORD FOR WORD from that source that asks for THIS point; a line that only describes the client's problem, or speaks of the work in general, is not proof. Prefer the requirement email, then follow up email or KT note, then project group, then client chat. If no source asks for it, set source "none" and quote "": the desk will not ask the team for it.
Answer with one JSON object only: {"person":"first name if every point is for one person, else empty","points":[{"id":"item id","title":"","now":"","expected":"","source":"","quote":""}]}`;
  const user = `SITE: ${o.client.website}
OPEN ITEMS (findings from the check): ${JSON.stringify(open)}
QUICK FIXES (small, they do not stop QA; write a point for each with id as given): ${JSON.stringify(((ck.quickFixes || []).filter(q => q.status !== "done" && !opts.only)).map(q => ({ id:q.id, fix:q.what, pages:q.pages, now:q.found, invited:q.invitedBy })))}
ALREADY VERIFIED DONE (never mention): ${JSON.stringify(done)}
LATEST FROM THE TEAM (people's messages since the desk's last message, newest last): ${JSON.stringify((o.teamChat || []).filter(m => !isDeskMsg(o, m) && m.at > (((o.deskPosts || []).slice(-1)[0] || {}).at || "")).slice(-15).map(m => String(m.at).slice(0, 16) + " " + m.by + ": " + str(m.text, 500)))}
SOURCES:
${src.map(x => `[${x.key}${x.date ? ", " + x.date : ""}]\n${String(x.text).slice(0, x.key === "requirement email" ? 8000 : 2500)}`).join("\n\n").slice(0, 70000)}`;
  const r = await askAI("groupmsg", "claude-sonnet-5-5", system, user, 3000);
  o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
  const d = r.data || {}; d.points = d.points || [];
  // Every open item gets its point: anything the first answer skipped is asked for once more on its own
  const miss = open.filter(x => !d.points.some(p2 => p2.id === x.id));
  if(miss.length) try{ const r2 = await askAI("groupmsg", "claude-sonnet-5-5", system, user.replace(/^OPEN ITEMS[^\n]*$/m, "OPEN ITEMS (findings from the check): " + JSON.stringify(miss)), 2000);
    o.aiUsd = +(num(o.aiUsd, 0) + r2.usd).toFixed(4); d.points = d.points.concat(((r2.data || {}).points || []).filter(p2 => miss.some(x => x.id === p2.id))); }catch(e){}
  const clean = t => String(t || "").replace(/\*/g, "").replace(/(^|\s)_+|_+(?=\s|$|[.,;:])/g, "$1").replace(/\s+/g, " ").replace(/(https?:\/\/\S+?)\.(\s|$)/g, "$1$2").trim();
  // A quote counts only if it is really in the source it names (or another source, which then becomes the source)
  const norm = t => String(t || "").toLowerCase().replace(/[\u2018\u2019\u201c\u201d'"]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const prove = p2 => { const mt = (o.mgrTasks || []).find(m => m.id === p2.id); if(mt) return { key:"manager", date:String(mt.at).slice(0, 10), by:String(mt.by || "").split(" ")[0], quote:mt.text };
    const q = norm(p2.quote); if(q.split(" ").length < 4) return null;
    const order = ["requirement email", "follow up email", "KT note", "project group", "client chat"], want = String(p2.source || "").toLowerCase();
    const hit = src.filter(x => norm(x.text).includes(q)).sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key))[0];
    return hit ? { key:hit.key, date:hit.date, by:hit.by || "", quote:clean(p2.quote) } : null; };
  const seen = new Set(), pts = [], left = [];
  const qfs = (ck.quickFixes || []).filter(q => q.status !== "done" && !opts.only);
  for(const p2 of d.points || []){ const qf = qfs.find(x => x.id === p2.id), it = open.find(x => x.id === p2.id) || (qf ? { id:qf.id, quick:true } : null); if(!it) continue;
    const ex = clean(p2.expected).replace(/^(needed|expected|it should)\s*:?\s*/i, ""), title = clean(p2.title), text = [clean(p2.now), ex ? "Needed: " + ex.charAt(0).toLowerCase() + ex.slice(1) : ""].filter(Boolean).join(" "), k = norm(title);
    if(!text || seen.has(k)) continue; seen.add(k);
    const pr = prove(p2); if(!pr){ left.push({ id:it.id, title, text }); continue; }
    pts.push({ it, title, text, pr }); }
  o.groupMsgLeftOut = left;
  if(!pts.length) return "";
  const fmtW = w => { const t = Date.parse(w); return isNaN(t) ? "" : new Date(t).toLocaleDateString("en-GB", { day:"numeric", month:"short" }); };
  // Each item says where and by whom it was asked; nothing that was already asked is called extra
  const WHERE = { "requirement email":"Requirement email", "follow up email":"Follow up email", "KT note":"KT note", "project group":"Asked in the group", "client chat":"Asked by the client, shared by sales" };
  const ref = pr => pr.key === "manager" ? `_(Added by ${pr.by || "the manager"}${pr.date ? ", " + fmtW(pr.date) : ""})_` : pr.key === "client chat" ? "_(Asked by the client, shared by sales)_"
    : `_(${WHERE[pr.key] || pr.key}${pr.by && pr.key !== "requirement email" ? " by " + pr.by : ""}${pr.date ? ", " + fmtW(pr.date) : ""}: "${pr.quote.replace(/"/g, "'")}")_`;
  const line = p2 => `**${p2.title || "Item"}:** ${p2.text} ${ref(p2.pr)}`;
  const HEAD = { "requirement email":"Still open from the requirement email" + (rm && rm.date ? " (" + fmtW(rm.date) + ")" : ""), "follow up email":"Still open from the follow up emails", "KT note":"Still open from the KT note", "project group":"Still open, already asked here in the group", "manager":"Added by the manager", "client chat":"Still open, asked by the client" };
  let n = 0; const who = str(d.person, 30).split(" ")[0];
  let msg = opts.intro || `Hi ${who || "team"}, for ${domOf(o.client.website)}:`;
  for(const k of Object.keys(HEAD)){ const g = pts.filter(p2 => p2.pr.key === k && !p2.it.quick); if(g.length) msg += `\n\n**${HEAD[k]}**\n\n` + g.map(p2 => `${++n}. ${line(p2)}`).join("\n"); }
  { const g = pts.filter(p2 => p2.it.quick); if(g.length) msg += `\n\n**Quick fixes, please do these too (they do not stop QA)**\n\n` + g.map(p2 => `${++n}. ${line(p2)}`).join("\n"); }
  return msg + `\n\n${pm ? pm + ", please check this list is right.\n" : ""}Reply "done" here when an item is finished.`;
}
function stepsText(o){
  if(o.groupMsg && o.groupMsgAt && o.check && o.groupMsgAt >= o.check.at) return o.groupMsg;
  const ck = o.check || {}, reqs = ck.requirements || [], ph = r => ((reqs.find(q => q.id === r.r) || {}).phase) || "project";
  const path = (ck.pathToQA || []).filter(p => !/sales/i.test(p.who || ""));
  const open = (ck.rows || []).filter(r => ph(r) === "project" && r.status !== "done" && r.toPass && !/sales/i.test(r.who || ""));
  if(!path.length && !open.length) return "";
  const line = (who, what, where) => { const w = String(what || "").trim().replace(/\.$/, ""); return `${who ? who + ": " : ""}${w.charAt(0).toLowerCase() + w.slice(1)}${where && !w.toLowerCase().includes(String(where).toLowerCase().slice(0, 18)) ? " (" + (x => x.charAt(0).toLowerCase() + x.slice(1))(String(where).replace(/\.$/, "")).replace(/^(the|in|on) /i, m2 => m2.toLowerCase()) + ")" : ""}.`; };
  const lines = (path.length ? path.map(p => line(p.who, p.do, p.where)) : open.map(r => line(r.who, r.toPass, r.where))).map((t, i) => `${i + 1}. ${t}`);
  const pm = (o.pmName || "").split(" ")[0];
  return `Hi team, for ${domOf(o.client.website)} we still need:\n${lines.join("\n")}\n${pm ? pm + ", does this plan work for you? " : ""}Write "done" here when a step is finished.`;
}
/* EVERY message the desk sends to a group passes here. Right before sending, the group is read live (its latest messages, not a stored copy):
   nothing is sent that the desk has already said there, nothing new is put on top of the desk's own latest message, and nothing new is
   dropped into a conversation that is going on right now. An answer to someone's request goes in their thread and is only stopped if the
   same answer was just given there. */
const wordsSet = t => new Set(String(t || "").toLowerCase().replace(/\*|`|_/g, "").replace(/^order desk:\s*/i, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length > 3));
const overlap = (a, b) => { const A = wordsSet(a), B = wordsSet(b); if(!A.size || !B.size) return 0; let n = 0; for(const x of A) if(B.has(x)) n++; return n / Math.min(A.size, B.size); };
async function safePost(o, as, gid, text, opts){
  opts = opts || {};
  let recent = []; try{ recent = (await spaceMessages(as, gid, "desc", 60)).reverse(); }catch(e){ throw new Error("Could not read the group just before posting, so nothing was sent: " + e.message); }
  const isDesk = m => isDeskMsg(o, m);
  const deskMsgs = recent.filter(isDesk), win = opts.answer ? deskMsgs.filter(m => m.thread === opts.thread && Date.now() - Date.parse(m.at) < 15 * 6e4) : deskMsgs;
  const dup = win.find(m => overlap(text, m.full || m.text) >= 0.8);
  if(dup) throw new Error("Not sent: the desk already said this in the group (" + new Date(dup.at).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Kolkata" }) + ")");
  if(!opts.thread && !opts.answer){
    const last = recent[recent.length - 1]; if(last && isDesk(last)) throw new Error("Not sent: the desk's own message is still the latest in the group, so the team has not answered yet");
    const lp = recent.filter(m => !isDesk(m)).slice(-1)[0]; if(lp && Date.now() - Date.parse(lp.at) < 3 * 6e4) throw new Error("Not sent yet: people are talking in the group right now");
  }
  const sent = await postChat(as, gid, text, opts.thread || undefined);
  if(opts.answer && sent && sent.name) o.deskPosts = (o.deskPosts || []).concat({ name:sent.name, thread:opts.thread || "", sender:sent.sender ? sent.sender.name : "", at:now(), kind:"answer", hash:sha(text).slice(0, 12) }).slice(-60);
  return sent;
}

/* The desk writes in a project group ONLY for an important reason, never to repeat the requirement email (the team works from it already):
   a "done" the desk's own live check does not confirm, every requirement verified (ready for QA), a task a manager added, or a deadline close
   with work still open (one polite note, and not while the PM has just said the work is going on, unless it is a day away). Never in the
   access stage, never while a scope change waits for a manager, never twice for the same reason and items. */
function postReason(o){
  const ck = o.check || {}, posts = (o.deskPosts || []).filter(p => p.kind === "steps"), last = posts.slice(-1)[0], lastAt = last ? last.at : "";
  if(!["access", "work", "qa"].includes(o.stage)) return null;
  const reqs = ck.requirements || [], ph = r => ((reqs.find(q => q.id === r.r) || {}).phase) || "project", rows = (ck.rows || []).filter(r => ph(r) === "project" && !r.notAsked);
  const same = (kind, ids) => posts.some(p => p.reason === kind && p.items === ids.slice().sort().join(","));
  const people = (o.teamChat || []).filter(m => !isDeskMsg(o, m) && !/access/i.test(m.space || "")), after = m => !lastAt || m.at > lastAt;
  const wrong = rows.filter(r => ["not done", "partly"].includes(r.status) && (ck.claims || []).some(c => { const t = Date.parse(c.at); return c.r === r.r && (!lastAt || (!isNaN(t) && new Date(t).toISOString() > lastAt)); }));
  if(o.stage === "work" && !o.scopePending && wrong.length && !same("claim", wrong.map(r => r.r))){ const by = (ck.claims || []).filter(c => wrong.some(r => r.r === c.r)).map(c => String(c.by || "").split(" ")[0].toLowerCase()), m = people.filter(after).reverse().find(x => by.includes(String(x.by || "").split(" ")[0].toLowerCase()));
    return { kind:"claim", ids:wrong.map(r => r.r), thread:m ? m.thread : "" }; }
  // A report or file a person shared in the group since our last message: read it, and reply in its thread only with input that helps
  const shared = people.filter(after).filter(m => (m.links || []).length || (m.files || []).length || /docs\.google|drive\.google/.test(m.text || ""));
  for(const m of shared.reverse()){ const ids = (m.links || []).map(l => l.id).concat([...String(m.text || "").matchAll(/\/d\/([\w-]{15,})/g)].map(x => x[1]));
    const d = (o.docs || []).find(x => x.status === "linked" && ids.includes(x.id)); if(d && !same("report", [d.id]) && ((o.readLog || {}).docs || []).some(x => x.id === d.id && x.ok)) return { kind:"report", ids:[d.id], thread:m.thread, by:m.by, msg:m.id }; }
  if(o.stage !== "work" || o.scopePending) return null;   // the rest only once the work has started, and never while a scope change waits
  if(ck.readyForQA && !posts.some(p => p.reason === "ready")) return { kind:"ready", ids:[] };
  const mt = (o.mgrTasks || []).filter(m => m.phase === "project" && (!lastAt || m.at > lastAt) && !(o.discarded || {})[m.id]);
  if(mt.length && !same("added", mt.map(m => m.id))) return { kind:"added", ids:mt.map(m => m.id) };
  const open = rows.filter(r => r.status !== "done"), hrs = (Date.parse(String(o.deadline) + "T23:59:00Z") - Date.now()) / 36e5;
  const busy = (o.teamChat || []).some(m => !isDeskMsg(o, m) && Date.now() - Date.parse(m.at) < 12 * 36e5 && /in progress|progress mode|working on|on it|will (share|update|send)|kaam chal|kar rah|kr rh|ho rha|ho raha/i.test(m.text || ""));
  if(open.length && hrs > 0 && hrs < 48 && (!busy || hrs < 24) && !posts.some(p => p.reason === "deadline" && Date.now() - Date.parse(p.at) < 20 * 36e5)) return { kind:"deadline", ids:open.map(r => r.r) };
  return null;
}
const ck0 = o => o.check || {};
async function reasonText(o, why){
  const site = domOf(o.client.website), pm = (o.pmName || "").split(" ")[0];
  if(why.kind === "claim") return await writeGroupMsg(o, { only:why.ids, intro:`Thanks for the update on ${site}. The desk checked the items marked done, and ${why.ids.length > 1 ? "these are" : "this one is"} not showing yet:` });
  if(why.kind === "report"){ const d = (o.docs || []).find(x => x.id === why.ids[0]); if(!d) return "";
    let txt = ""; try{ txt = fitText(await docText(d, 200000), 30000); }catch(e){ return ""; }
    const reqs = ck0(o).requirements || [], rows = ck0(o).rows || [];
    const system = `You are the order desk of an SEO, web and ads agency, replying in the project group's thread to a team member who just shared a report or file. Write like a respectful senior colleague: thank them in a few words, then give ONLY input that adds value: what the file covers against the order's requirements, and at most two concrete gaps or fixes that matter, each naming the exact place in the file. If the file covers what is asked and nothing important is missing, say so in one line. Never repeat the requirement list, never teach basics, never ask for something another file already has. Two to five short lines, simple English, no dashes. If nothing useful can be said, answer with an empty reply. Answer with one JSON object only: {"reply":""}`;
    const user = `SITE: ${o.client.website}\nSHARED BY: ${why.by}\nFILE: ${d.name}\nREQUIREMENTS AND WHAT THE CHECK FOUND: ${JSON.stringify(rows.map(r => ({ task:((reqs.find(q => q.id === r.r) || {}).text) || "", phase:((reqs.find(q => q.id === r.r) || {}).phase) || "", status:r.status, found:str(r.found, 240) })))}\nTHE MANAGER'S LATEST WORD: ${JSON.stringify(reqs.filter(q => q.managerSaid).map(q => q.managerSaid).slice(0, 2))}\nFILE CONTENT:\n${txt}`;
    try{ const r = await askAI("deskanswer", "claude-sonnet-5-5", system, user, 1200); o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4); return str((r.data || {}).reply, 1200).trim(); }catch(e){ return ""; } }
  if(why.kind === "ready") return `Thank you, team. For ${site}, every requirement is now verified on the live site and in the files. The order moves to QA.`;
  if(why.kind === "added"){ const mt = (o.mgrTasks || []).filter(m => why.ids.includes(m.id)); return `Hi team, for ${site}: ${mt.map(m => String(m.by || "the manager").split(" ")[0] + " added a task: **" + m.text + "**" + (m.who ? " (for " + m.who + ")" : "")).join("\n")}\n\nIt is part of this order before QA.`; }
  if(why.kind === "deadline"){ const d = new Date(String(o.deadline) + "T12:00:00Z").toLocaleDateString("en-GB", { day:"numeric", month:"short" });
    return `Hi team, a gentle note for ${site}: this order is getting close to its due time. When you get a moment, please share where the work stands, or post the files here. Thank you.`; }
  return "";
}
async function postSteps(o, cfg, by, why){
  const as = await poster(cfg); if(!as) throw new Error("Choose the account to post as in Team and settings, and connect it with Google Chat permission");
  let g = groupOf(o);
  if(!g){ const names = [...new Set((o.teamChat || []).map(m => m.space).filter(n2 => n2 && !/access/i.test(n2)))], sp = (await mySpaces(as)).find(x => names.includes(x.name));
    if(sp){ g = { id:sp.id, name:sp.name }; (o.teamChat || []).forEach(m => { if(m.space === sp.name && !m.spaceId) m.spaceId = sp.id; }); } }
  if(!g) throw new Error("No project group found for this order yet. Add seo@indiit.com to the project's Google Chat group");
  // Never post from an old reading: the group, emails and files are read again now, and anything newer than the check means a new check first
  if(!o._regated){ await freshen(o); const nw = await newerThanRead(o);
    if(nw.length){ log(o, by || { name:"Order desk" }, "Before posting, found " + [...new Set(nw)].slice(0, 5).join(", ") + " after the last check: read everything again");
      const q0 = o._quiet; o._quiet = true; o._regated = true; try{ await checkNow(o); }finally{ o._quiet = q0; delete o._regated; }
      if(by) throw new Error("New information came in after the last check (" + [...new Set(nw)].slice(0, 3).join(", ") + "). The desk read everything again: look at the updated message, then post it.");
      if(o.check && o.check.autoPostHeld) throw new Error(o.check.autoPostHeld); } }
  if(!o.groupMsg || !o.groupMsgAt || (o.check && o.groupMsgAt < o.check.at)){ try{ o.groupMsg = await writeGroupMsg(o); o.groupMsgAt = now(); }catch(e){} }
  // By itself the desk posts only for its reason, with only what that reason needs; a person pressing Post sends the full list they looked at
  if(!by){ why = postReason(o); if(!why) return; }   // the reason is weighed again on the current picture, never taken from before
  const t = why ? await reasonText(o, why) : stepsText(o);
  // Nothing worth saying for this reason: remember it was weighed, so it is not weighed again, and stay quiet
  if(!t && why){ o.deskPosts = (o.deskPosts || []).concat({ name:"", at:now(), kind:"steps", reason:why.kind, items:why.ids.slice().sort().join(","), skipped:true }).slice(-30); return; }
  if(!t) throw new Error("No open project steps to post");
  // One living message per order: edit the desk's last steps message instead of posting a repeat
  const last = (o.deskPosts || []).filter(p => p.kind === "steps" && p.name && p.name.startsWith(g.id + "/")).slice(-1)[0];
  let quiet = false;
  if(last){ try{ const after = await chatSince(as, g.id, last.at); quiet = !after.some(m2 => m2.id !== last.name && m2.sender !== last.sender); }catch(e){ quiet = false; } }
  if(last && quiet && !why){ if(last.hash === sha(t).slice(0, 12)) throw new Error("The group already has these exact steps");
    try{ await editChat(as, last.name, deskSay(cfg, t)); }catch(e){ if(/insufficient authentication scopes|403/.test(e.message)) throw new Error("To edit its own message, " + as + " needs one more permission. Reconnect it in Team and settings (Connect a Google account), then try again. Nothing was sent."); throw e; }
    last.hash = sha(t).slice(0, 12); last.editedAt = now();
    log(o, by || { name:"Order desk" }, "Updated the steps message in the project group " + (g.name || "") + " (no new message sent)");
    await deskLog({ kind:"steps", group:g.name, space:g.id, order:o.id, by:(by && by.name) || "Order desk", q:"", a:"(edited) " + str(t, 780), usd:0 }); return; }
  const m = await safePost(o, as, g.id, deskSay(cfg, t), { thread:why && why.thread ? why.thread : "" });
  o.deskPosts = (o.deskPosts || []).concat({ name:m.name, thread:m.thread ? m.thread.name : "", sender:m.sender ? m.sender.name : "", at:now(), kind:"steps", hash:sha(t).slice(0, 12), reason:why ? why.kind : "person", items:why ? why.ids.slice().sort().join(",") : "" }).slice(-30);
  if(why) log(o, { name:"Order desk" }, "Posted in the project group because: " + ({ claim:"an item marked done is not showing yet", ready:"every requirement is verified", added:"a manager added a task", deadline:"the deadline is close with work open" })[why.kind]);
  o.chatPollAt = o.chatPollAt || now();
  log(o, by || { name:"Order desk" }, "Steps to reach QA posted in the project group " + (g.name || ""));
  await deskLog({ kind:"steps", group:g.name, space:g.id, order:o.id, by:(by && by.name) || "Order desk", q:"", a:str(t, 800), usd:0 });
}
/* People performance: what each working professional asks, how fast they reply, whether their "done" holds up, how fast tasks close */
const PF = P + "perf";
async function perfEv(e){ if(!e.who) return; await cmd("LPUSH", PF, JSON.stringify(Object.assign({ at:now() }, e))); await cmd("LTRIM", PF, 0, 4999); }
function perfFromCheck(o){
  const ck = o.check || {}, reqs = ck.requirements || [], evs = []; o.perfSeen = o.perfSeen || {}; o.tasks = o.tasks || {};
  const sellers = /^(sales|manav)/i;
  for(const c of ck.claims || []){ const r = (ck.rows || []).find(x => x.r === c.r), q = reqs.find(x => x.id === c.r) || {}, who = String(c.by || "").trim();
    if(!r || !who || sellers.test(who) || (q.phase || "project") !== "project") continue;
    const cr = String(r.claimResult || ""), res = /^contradicted/.test(cr) ? "contradicted" : /^confirmed/.test(cr) || r.status === "done" ? "confirmed" : "unproven", k = c.r + ":" + who + ":" + res;
    if(!o.perfSeen[k]){ o.perfSeen[k] = 1; evs.push({ type:"claim", who, order:o.id, task:str(q.text, 160), said:str(c.what, 160), result:res }); } }
  for(const r of ck.rows || []){ const q = reqs.find(x => x.id === r.r) || {}; if((q.phase || "project") !== "project") continue;
    const who = "";
    if(who){ const cr = String(r.claimResult || ""), res = /^contradicted/.test(cr) ? "contradicted" : /^confirmed/.test(cr) || r.status === "done" ? "confirmed" : "unproven", k = r.r + ":" + who + ":" + res;
      if(!o.perfSeen[k]){ o.perfSeen[k] = 1; evs.push({ type:"claim", who, order:o.id, task:str(q.text, 160), result:res }); } }
    const owner = String(r.who || "").trim();
    if(r.status !== "done" && owner && !/^(sales|pm|qa|team)$/i.test(owner) && !o.tasks[r.r]) o.tasks[r.r] = { who:owner, openAt:now(), task:str(q.text, 160) };
    const t = o.tasks[r.r]; if(t && r.status === "done" && !t.doneAt){ t.doneAt = now(); evs.push({ type:"task", who:t.who, order:o.id, task:t.task, hours:+((Date.now() - Date.parse(t.openAt)) / 36e5).toFixed(1) }); } }
  return evs;
}
async function perfData(days){
  const since = new Date(Date.now() - (days || 30) * 864e5).toISOString(), ev = ((await cmd("LRANGE", PF, 0, 4999)) || []).map(x => JSON.parse(x)).filter(e => e.at >= since);
  const P2 = {}, get = w => P2[w] = P2[w] || { name:w, queries:0, genuine:0, topics:{}, kinds:{}, replies:[], claims:{ confirmed:0, unproven:0, contradicted:0 }, tasks:[], usd:0, orders:new Set(), recent:[] };
  for(const e of ev){ const p = get(e.who); if(e.order) p.orders.add(e.order);
    if(e.type === "query"){ p.queries++; if(e.genuine !== false) p.genuine++; if(e.topic) p.topics[e.topic] = (p.topics[e.topic] || 0) + 1; if(e.qtype) p.kinds[e.qtype] = (p.kinds[e.qtype] || 0) + 1; p.usd += e.usd || 0; if(p.recent.length < 25) p.recent.push(e); }
    else if(e.type === "reply") p.replies.push(e.minutes);
    else if(e.type === "claim") p.claims[e.result] = (p.claims[e.result] || 0) + 1;
    else if(e.type === "task") p.tasks.push(e.hours); }
  const cl = (x, a, b) => Math.max(0, Math.min(100, Math.round(x)));
  return Object.values(P2).map(p => {
    const avgR = p.replies.length ? p.replies.reduce((a, b) => a + b, 0) / p.replies.length : null, c = p.claims, nC = c.confirmed + c.unproven + c.contradicted, avgT = p.tasks.length ? p.tasks.reduce((a, b) => a + b, 0) / p.tasks.length : null;
    const sc = { response:avgR == null ? null : cl(avgR <= 15 ? 100 : 100 - (avgR - 15) / (225) * 100), accuracy:nC ? cl((c.confirmed + c.unproven * 0.5) / nC * 100) : null, sincerity:nC ? cl(100 - c.contradicted * 20 - c.unproven * 5) : null, delivery:avgT == null ? null : cl(avgT <= 24 ? 100 : 100 - (avgT - 24) / 96 * 100) };
    const w = { response:0.25, accuracy:0.3, sincerity:0.25, delivery:0.2 }, have = Object.keys(w).filter(k => sc[k] != null), tot = have.reduce((a, k) => a + w[k], 0);
    const learn = Object.entries(p.topics).sort((a, b) => b[1] - a[1]);
    return { name:p.name, overall:have.length ? cl(have.reduce((a, k) => a + sc[k] * w[k], 0) / tot) : null, scores:sc, queries:p.queries, genuine:p.genuine, kinds:p.kinds, learning:learn.slice(0, 8).map(([t, n]) => ({ topic:t, times:n, repeat:n > 1 })),
      avgReplyMin:avgR == null ? null : Math.round(avgR), claims:c, tasksDone:p.tasks.length, avgTaskHours:avgT == null ? null : +avgT.toFixed(1), usd:+p.usd.toFixed(3), orders:[...p.orders], recent:p.recent };
  }).sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
}

/* Usage of the desk in project groups: every reply and skip is logged with its cost, and daily limits hold (total, per group, per person) */
const DL = P + "desklog";
async function deskAllowed(cfg, space, by){
  const d = now().slice(0, 10), [t, g, pp] = await Promise.all([cmd("GET", P + "desk:" + d), cmd("GET", P + "desk:" + d + ":" + space), cmd("GET", P + "desk:" + d + ":p:" + String(by).toLowerCase())]);
  if(num(t, 0) >= num(cfg.deskDaily, 40)) return "daily limit for all groups reached";
  if(num(g, 0) >= num(cfg.deskPerGroup, 15)) return "daily limit for this group reached";
  if(num(pp, 0) >= num(cfg.deskPerPerson, 8)) return "daily limit for this person reached";
  return "";
}
async function deskCount(space, by){ const d = now().slice(0, 10); await pipe([["INCR", P + "desk:" + d], ["EXPIRE", P + "desk:" + d, 3 * 864e2], ["INCR", P + "desk:" + d + ":" + space], ["EXPIRE", P + "desk:" + d + ":" + space, 3 * 864e2], ["INCR", P + "desk:" + d + ":p:" + String(by).toLowerCase()], ["EXPIRE", P + "desk:" + d + ":p:" + String(by).toLowerCase(), 3 * 864e2]]); }
async function deskLog(e){ await cmd("LPUSH", DL, JSON.stringify(Object.assign({ at:now() }, e))); await cmd("LTRIM", DL, 0, 999); }

/* @Manav in any project group: the desk replies in the thread at once (checked every 2 minutes) and, when Manav must decide,
   says so in the thread and puts the mention on his Orders page */
const MK = P + "mentions", MP = P + "mentions:at";
async function mentionsRun(cfg, as){
  const since = (await cmd("GET", MP)) || new Date(Date.now() - 10 * 6e4).toISOString(), started = now(), out = [];
  const spaces = (await mySpaces(as)).filter(x => !/^DIRECT_MESSAGE$/i.test(x.type)).slice(0, 40);
  const orders = (await loadAll(300)).filter(o => !["done", "cancelled"].includes(o.stage)), bySpace = {};
  orders.forEach(o => { const g = groupOf(o); if(g) bySpace[g.id] = o; (o.accessChat || []).forEach(m => m.spaceId && !bySpace[m.spaceId] && (bySpace[m.spaceId] = null)); });
  for(const sp of spaces){
    let msgs = []; try{ msgs = await chatSince(as, sp.id, since); }catch(e){ continue; }
    const callRe = new RegExp("@(manav|seo desk|order desk|desk|indi ?it( solutions)?|" + String(as).split("@")[0].replace(/[^a-z0-9]/gi, "") + ")(\\b|\\s|$)", "i");
    for(const m of msgs.filter(x => callRe.test(x.text) && !/^Order desk:/.test(x.text))){
      const o = bySpace[sp.id] || orderInText(m.text, orders), ck = (o && o.check) || {};
      const system = `Someone in an agency's team chat group mentioned the order desk or @Manav, the head of the department. You answer as the order desk, in the same thread, so work does not wait. Read what they need. If you can answer from the order facts (what to do, where, access status, files, live checks), answer like a friendly colleague in one to four short lines, only what they need to act. No meta talk (never explain why a task exists or how the desk checks things). If it is a technical question (SEO, WordPress and its plugins, Search Console, Analytics, Tag Manager, ads, website fixes), guide them like a senior expert: numbered steps with exact menu and button names, as short as possible. If it needs Manav himself (an approval, money, prices, scope change, anything about or with the client, hiring, people problems), say kindly that Manav will reply soon, and set needsManav. Never share passwords, logins, prices or the client's own messages. Use VERY SIMPLE English a 4th grade child can follow. No dashes.
First decide if it is GENUINE: a real question or request about project work, a client order, access, or a technical task. Greetings, thanks, jokes, chit chat and topics outside work are not genuine: then leave answer empty.
Answer with one JSON object only: {"genuine":true,"topic":"two to four words, for example robots.txt or Search Console access","qtype":"work | technical | access | client | other","answer":"","needsManav":false,"summary":"one line for Manav: who needs what"}`;
      const user = `GROUP: ${sp.name}\nMESSAGE from ${m.by}: ${m.text}\n` + (o ? `ORDER for this group: site ${o.client.website}, stage ${o.stage}.\nREQUIREMENTS: ${JSON.stringify((ck.rows || []).map(r => ({ requirement:((ck.requirements || []).find(q => q.id === r.r) || {}).text, status:r.status, toPass:r.toPass, where:r.where, check:r.check })))}\nACCESS: ${JSON.stringify((o.access || []).map(a => ({ item:a.item, status:a.status })))}\nFILES: ${JSON.stringify(ck.files || [])}` : "No order is linked to this group.");
      const lim = await deskAllowed(cfg, sp.id, m.by);
      if(lim){ await deskLog({ kind:"mention", group:sp.name, space:sp.id, order:o ? o.id : "", by:m.by, q:str(m.text, 500), a:"", usd:0, skipped:lim });
        await cmd("LPUSH", MK, JSON.stringify({ id:nid("m"), at:m.at, by:m.by, group:sp.name, space:sp.id, order:o ? o.id : "", text:str(m.text, 600), answer:"", needsManav:true, summary:"Not answered: " + lim, handled:false })); continue; }
      try{ const r = await askAI("deskanswer", "claude-sonnet-5-5", system, user, 1500), d = r.data || {};
        if(d.genuine === false){ await deskLog({ kind:"mention", group:sp.name, space:sp.id, order:o ? o.id : "", by:m.by, q:str(m.text, 500), a:"", usd:+r.usd.toFixed(4), skipped:"not a work question" }); continue; }
        if(d.answer){ await postChat(as, sp.id, deskSay(cfg, d.answer), m.thread); await deskCount(sp.id, m.by); }
        await deskLog({ kind:"mention", group:sp.name, space:sp.id, order:o ? o.id : "", by:m.by, q:str(m.text, 500), a:str(d.answer, 800), usd:+r.usd.toFixed(4), needsManav:!!d.needsManav });
        await perfEv({ type:"query", who:m.by, order:o ? o.id : "", group:sp.name, q:str(m.text, 300), topic:str(d.topic, 40), qtype:str(d.qtype, 12), genuine:d.genuine !== false, usd:+r.usd.toFixed(4) });
        const rec = { id:nid("m"), at:m.at, by:m.by, group:sp.name, space:sp.id, order:o ? o.id : "", text:str(m.text, 600), answer:str(d.answer, 600), needsManav:!!d.needsManav, summary:str(d.summary, 200), handled:!d.needsManav };
        await cmd("LPUSH", MK, JSON.stringify(rec)); await cmd("LTRIM", MK, 0, 199);
        if(o){ log(o, { name:"Order desk" }, "@Manav from " + m.by + " in the project group: " + (d.needsManav ? "waiting for Manav. " : "answered. ") + str(d.summary || m.text, 140)); await saveO(o); }
        out.push((o ? o.id : sp.name) + (d.needsManav ? " needs Manav" : " answered")); }catch(e){ out.push(sp.name + ": " + e.message); }
    }
  }
  await cmd("SET", MP, started);
  return out;
}

/* Every 10 minutes: an order whose group got a person's message, or whose files were edited, after the check read it is read and judged
   again (after 3 quiet minutes, so a person can finish what they are writing). The group message then always follows the newest word. */
export async function recheckStale(){
  if(!aiOn()) return ["off"]; if(await cmd("GET", "bsp:teamsync:lock")) return ["hourly sync running"];
  const cfg = await cfgOf(), as = await poster(cfg), out = [], ripe = t => Date.now() - Date.parse(t) > 3 * 6e4;
  const open = (await loadAll(300, true)).filter(o => ["work", "qa"].includes(o.stage) && o.check);
  let n = 0;
  for(const o of open.concat((await loadAll(300, true)).filter(x => !["work", "qa", "done", "cancelled"].includes(x.stage) && (x.deskJobs || []).length))) if((o.deskJobs || []).length && n < 2){
    if(await cmd("SET", "bsp:chk:" + o.id, "1", "NX", "EX", 280) !== "OK") continue;
    try{ const k = await runDeskJobs(o, cfg, as); await saveO(o); n++; out.push(o.id + " answered " + k + " request(s)"); }catch(e){ out.push(o.id + ": " + e.message); }finally{ await cmd("DEL", "bsp:chk:" + o.id); } }
  for(const o of open){ if(n >= 2) break; const at = (o.readLog || {}).at || o.checkAt; if(!at) continue;
    let why = [], touched = false;
    const g = groupOf(o); if(as && g) try{ const ms = (await chatSince(as, g.id, at)).filter(m => !isDeskMsg(o, m)); (o.seen = o.seen || {}).group = now(); touched = true; if(ms.length && ms.every(m => ripe(m.at))) why.push(ms.length + " new message(s) in the group"); else if(ms.length){ await saveO(o); continue; } }catch(e){}
    if(!why.length){ let ok2 = false; for(const d of (o.docs || []).filter(x => x.status === "linked" && x.current !== false && !x.media).slice(0, 30)){ try{ const md = await docModified(d); ok2 = true; if(md && md.at > at && ripe(md.at)) why.push("file edited: " + d.name); }catch(e){} } if(ok2){ (o.seen = o.seen || {}).files = now(); touched = true; } }
    if(!why.length){ if(touched) await saveO(o); continue; }
    if(await cmd("SET", "bsp:chk:" + o.id, "1", "NX", "EX", 280) !== "OK") continue;
    try{ log(o, { name:"Order desk" }, "Read the order again: " + why.slice(0, 3).join("; ")); await buildCheck(o); await saveO(o); n++; out.push(o.id + " read again"); }
    catch(e){ out.push(o.id + ": " + e.message); }finally{ await cmd("DEL", "bsp:chk:" + o.id); } }
  return out.length ? out : ["nothing new"];
}

/* How to greet the person: their first name, or nothing when they wrote from the desk's own account (the account's name is not theirs) */
const greetName = by => /indi ?it|order desk|seo desk|solutions/i.test(String(by || "")) ? "" : String(by || "").split(" ")[0];
/* Commands people can use in a project group. Deadlines, prices and client details (name, contact, what the client wrote) simply never
   appear in a team group, and the desk never announces that it keeps anything back. */
const CMDS = new Set(["help", "commands", "status", "update", "check", "done", "review", "how", "note", "blocked", "block", "ask"]);
const HELP_CARD = `**Order desk: how to use me in this group**

Start your message with **desk**, then one word:

- \`desk help\`: show this list
- \`desk status\`: what is still open here, and anything I noticed
- \`desk check\`: I read the group, the files and the live site again, then reply with what is verified
- \`desk done\` and what you finished: I check it and confirm in your thread
- \`desk review\`: I read the latest report or file shared here and give my input
- \`desk how\` and the task: step by step help for that task
- \`desk note\` and your note: tell me an update or a decision, and I add it to the order
- \`desk blocked\` and the reason: something stops your work, and I tell the PM and the manager
- \`desk\` and any question: ask me anything about the work`;
async function deskCommand(o, cw, rest, m){
  const ck = o.check || {}, reqs = ck.requirements || [], ph = r => ((reqs.find(q => q.id === r.r) || {}).phase) || "project", who = greetName(m.by);
  if(cw === "help" || cw === "commands") return HELP_CARD;
  if((cw === "status" || cw === "update") && (!ck.at || Date.now() - Date.parse(ck.at) > 45 * 6e4 || (o.teamChat || []).some(x => !isDeskMsg(o, x) && x.at > ((o.readLog || {}).at || "")) || (o.lastUpdateAt || "") > ((o.readLog || {}).at || ""))){
    (o.deskJobs = o.deskJobs || []).push({ kind:"check", by:m.by, thread:m.thread, text:"status", at:now() });
    return `Thanks${who ? " " + who : ""}. Some things changed since my last read, so I am reading the group, the files and the live site again. I will reply in this thread within about ten minutes.`; }
  if(cw === "status" || cw === "update"){
    const open = (ck.rows || []).filter(r => ph(r) === "project" && r.status !== "done" && !r.notAsked), qf = (ck.quickFixes || []).filter(q => q.status !== "done");
    const notes = [];
    if(o.scopePending) notes.push("The scope changed after a manager's message; the PM or manager will confirm it.");
    const lines = open.map(r => "- " + ((reqs.find(q => q.id === r.r) || {}).text || r.r) + (r.status === "partly" ? " (partly done)" : "")).concat(qf.map(q => "- Quick fix: " + q.what.split(". ")[0]));
    return lines.length ? `Hi${who ? " " + who : ""}, here is where this order stands (as of my last read, ${new Date(ck.at || Date.now()).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Kolkata" })}):\n\n**Still open**\n${lines.join("\n")}${notes.length ? "\n\n**Also**\n" + notes.map(x => "- " + x).join("\n") : ""}\n\nWrite \`desk check\` when you finish something and I will read it again.` : `Hi${who ? " " + who : ""}, everything asked on this order is verified done. Thank you!`; }
  if(["check", "done", "review"].includes(cw)){
    (o.deskJobs = o.deskJobs || []).push({ kind:cw, by:m.by, thread:m.thread, text:str(rest, 600), at:now() });
    return cw === "review" ? `Thanks${who ? " " + who : ""}. I am reading the latest file shared here and will reply in this thread within about ten minutes.` : `Thanks${who ? " " + who : ""}. I am reading the group, the files and the live site again, and will reply in this thread within about ten minutes.`; }
  if(cw === "note"){ if(rest.length < 3) return "Please write the note after the word note, for example: `desk note client approved the new titles`.";
    (o.teamNotes = o.teamNotes || []).push({ at:now(), by:m.by, text:rest }); log(o, { name:"Order desk" }, "Note from " + m.by + " in the project group: " + str(rest, 300)); o.checkAt = "";
    return `Noted, thank you${who ? " " + who : ""}. I have added it to the order for the PM and the manager.`; }
  if(cw === "blocked" || cw === "block"){ if(rest.length < 3) return "Please write what is stopping the work, for example: `desk blocked Shopify staff access is missing`.";
    (o.blockers = o.blockers || []).push({ id:nid("bl"), at:now(), by:m.by, text:rest, open:true, thread:m.thread || "" }); log(o, { name:"Order desk" }, "Blocked, said by " + m.by + ": " + str(rest, 300));
    return `Thanks${who ? " " + who : ""}, I have flagged this to the PM and the manager: "${str(rest, 200)}". I will update here when it is cleared.`; }
  return "";   // "ask" and plain questions go to the normal answer below
}
/* The desk's first message in every project group it joins: who it is and how to use it (posted once per group, for open orders) */
async function introGroups(o){
  if(["done", "cancelled", "delivered"].includes(o.stage)) return 0;
  const gs = ((o.chatStatus || {}).groups || []); if(!gs.length) return 0;
  const cfg = await cfgOf(), as = await poster(cfg); if(!as) return 0; let n = 0;
  for(const g of gs){ if(g.via && g.via !== as) continue; if((o.introduced || {})[g.id]) continue;
    const said = (o.teamChat || []).some(m => m.spaceId === g.id && isDeskMsg(o, m) && /how to use me in this group/i.test(m.text || "")) || (o.deskPosts || []).some(p => p.kind === "intro" && String(p.name || "").startsWith(g.id + "/"));
    if(said){ (o.introduced = o.introduced || {})[g.id] = now(); continue; }
    const t = `Hello team, I will follow ${domOf(o.client.website)} with you here. I read this group, the files you share and the live site, and I help wherever you need me.\n\n` + HELP_CARD;
    try{ const m = await safePost(o, as, g.id, deskSay(cfg, t)); (o.introduced = o.introduced || {})[g.id] = now();
      o.deskPosts = (o.deskPosts || []).concat({ name:m.name, thread:m.thread ? m.thread.name : "", sender:m.sender ? m.sender.name : "", at:now(), kind:"intro", hash:sha(t).slice(0, 12) }).slice(-30);
      log(o, { name:"Order desk" }, "Introduced itself in the project group " + (g.name || "") + " with how to use it"); n++; }catch(e){} }
  return n;
}
/* Jobs people asked for in a group ("desk check", "desk done", "desk review", or a plain "done"): run by the 10 minute job, answered in the thread */
async function runDeskJobs(o, cfg, as){
  const jobs = (o.deskJobs || []).splice(0); if(!jobs.length) return 0; const g = groupOf(o); if(!g) return 0;
  const before = new Map(((o.check || {}).rows || []).map(r => [r.r, r.status]));
  const q0 = o._quiet; o._quiet = true; try{ await buildCheck(o); }finally{ o._quiet = q0; }   // the answer goes in the asker's thread, not as a new post
  const ck = o.check || {}, reqs = ck.requirements || [], ph = r => ((reqs.find(q => q.id === r.r) || {}).phase) || "project", T = r => (reqs.find(q => q.id === r.r) || {}).text || r.r;
  const rows = (ck.rows || []).filter(r => ph(r) === "project" && !r.notAsked), nowDone = rows.filter(r => r.status === "done" && before.get(r.r) !== "done"), open = rows.filter(r => r.status !== "done");
  for(const j of jobs){ const who = greetName(j.by); let say = "";
    if(j.kind === "review"){ const m2 = (o.teamChat || []).filter(m => !isDeskMsg(o, m) && ((m.links || []).length || /docs\.google|drive\.google/.test(m.text || ""))).slice(-1)[0];
      const ids = m2 ? (m2.links || []).map(l => l.id).concat([...String(m2.text || "").matchAll(/\/d\/([\w-]{15,})/g)].map(x => x[1])) : [], d = (o.docs || []).find(x => ids.includes(x.id));
      say = d ? await reasonText(o, { kind:"report", ids:[d.id], by:j.by }) : ""; if(!say) say = d ? `Thanks${who ? " " + who : ""}, I read ${d.name}. It covers what is asked; nothing important to add.` : `Thanks${who ? " " + who : ""}. I could not find a shared file in this group yet. Share the link here and write \`desk review\` again.`; }
    else say = `Thanks${who ? " " + who : ""}, I have read everything again.` + (nowDone.length ? `\n\n**Now verified done**\n${nowDone.map(r => "- " + T(r)).join("\n")}` : "") + (open.length ? `\n\n**Still open**\n${open.map(r => "- " + T(r) + (r.toPass ? ": " + str(noId(r.toPass), 160) : "")).join("\n")}` : `\n\nEverything asked is verified done.`);
    try{ await safePost(o, as, g.id, deskSay(cfg, say), { thread:j.thread, answer:true }); log(o, { name:"Order desk" }, "Answered " + j.by + "'s " + j.kind + " in the project group"); }catch(e){} }
  return jobs.length;
}

/* Every 10 minutes: questions to the desk in project groups get an answer in their thread */
export async function chatAnswers(){
  const cfg = await cfgOf(), as = await poster(cfg); if(!as || !aiOn()) return "off";
  let men = []; try{ men = await mentionsRun(cfg, as); }catch(e){ men = ["mentions: " + e.message]; }
  // questions in the desk's own threads: every 10 minutes is enough
  // Commands and questions to the desk are answered within about two minutes
  const open = (await loadAll(300)).filter(o => ["access", "work", "qa", "ready", "delivered"].includes(o.stage) && groupOf(o)), done = [];
  for(const o of open.slice(0, 25)){
    const g = groupOf(o); if(!g) continue; let msgs = [];
    try{ msgs = await chatSince(as, g.id, o.chatPollAt || new Date(Date.now() - 15 * 6e4).toISOString()); }catch(e){ done.push(o.id + ": " + e.message); continue; }
    if(!msgs.length) continue; o.chatPollAt = msgs[msgs.length - 1].at;
    const mine = new Set((o.deskPosts || []).map(p => p.sender).filter(Boolean)), threads = new Set((o.deskPosts || []).map(p => p.thread).filter(Boolean));
    let changed = false;
    for(const m of msgs){
      if(isDeskMsg(o, m)) continue;
      const asked = threads.has(m.thread) || /\b(order )?desk\b/i.test(m.text);
      // Commands: "desk <word> ..." anywhere in the first words of the message (after an @mention, if any)
      const cm = String(m.text || "").replace(/\*/g, "").replace(/^\s*[A-Z][\w .'-]{1,40}:\s+(?=(?:@|order\s+)?desk\b)/i, "").match(/^\s*(?:@[^\n]{0,40}?\s+)?(?:order\s+)?desk\b[\s,:.\-]*([a-z]+)?\b\s*([\s\S]*)$/i), cw = cm ? String(cm[1] || "").toLowerCase() : "", rest = cm ? str(cm[2], 1500).trim() : "";
      if(cm && (!cw || CMDS.has(cw))){ let said = false; try{ const say = await deskCommand(o, cw || (rest ? "ask" : "help"), rest, m); if(say){ await safePost(o, as, g.id, deskSay(cfg, say), { thread:m.thread, answer:true }); said = true;
            await deskLog({ kind:"command", group:g.name, space:g.id, order:o.id, by:m.by, q:str(m.text, 500), a:str(say, 800), usd:0 }); } changed = true; }catch(e){ done.push(o.id + " command: " + e.message); }
        if(said) continue; }   // "desk how ..." and plain questions get the normal answer below
      if(/^\s*done\b/i.test(m.text)){ o.checkAt = ""; (o.deskJobs = o.deskJobs || []).push({ kind:"done", by:m.by, thread:m.thread, text:str(m.text, 600), at:now() }); changed = true; }   // a "done" is checked within ten minutes and answered in its thread
      if(!mine.has(m.sender) && (threads.has(m.thread) || /^\s*done\b/i.test(m.text))){ const lp = (o.deskPosts || []).filter(p => p.at <= m.at).slice(-1)[0]; if(lp && !(o.replied || {})[lp.name + m.by]){ (o.replied = o.replied || {})[lp.name + m.by] = 1; await perfEv({ type:"reply", who:m.by, order:o.id, minutes:Math.round((Date.parse(m.at) - Date.parse(lp.at)) / 6e4) }); } }
      const sRole = ((await people()).find(p2 => p2.name && String(m.by || "").toLowerCase().startsWith(p2.name.toLowerCase().split(" ")[0])) || {}), sRoles = sRole.id ? rolesOf(sRole) : [];
      const isMgr = sRoles.includes("manager"), isPM = sRoles.includes("pm");
      if(!asked && !((isMgr || isPM) && threads.has(m.thread))) continue;
      if(isDeskMsg(o, m)) continue;
      const ck = o.check || {}, pv = projView(o);
      const system = `Never share in this team group: the deadline or due date, the price or money, or client details (the client's name, contact, location, or what the client wrote). Never say that you cannot or will not share something: if someone asks about the deadline or the client, answer the work part naturally and say, like a colleague, that the PM will confirm that with them. You are the order desk of an SEO, web and ads agency, answering a project team member's question in the order's project group chat. Talk like a friendly colleague in a team chat: one to four short lines, only what they need to do the task. No meta talk (never explain why a task exists or how the desk checks things). Answer from the order facts given: the requirements and how each passes (where to do it, how it is checked), access status, files read, live check results. Give exact values when you have them. If it is a technical how to question (SEO, WordPress and its plugins, Search Console, Analytics, Tag Manager, ads, website fixes), guide them like a senior expert: numbered steps with exact menu and button names. Never share passwords, logins, prices, money or the client's own messages; never promise anything to or about the client. If the question needs a decision you cannot make (scope change, asking the client, a deadline), say who decides (Sales for anything with the client, the PM for team work) and set needsHuman. Use VERY SIMPLE English a 4th grade child can follow: short sentences, common words, exact button and setting names. No dashes.
First decide if it is GENUINE: a real question about this order's work or a technical task. Thanks, greetings, chit chat and topics outside work are not genuine: then leave answer empty.
Every step you give is a proposal open to the PM's approval. The SENDER ROLE tells you who wrote:
If the PM approves, thank them in one line and record it. If the PM disagrees or suggests another way, judge it fairly against the requirement and what the client needs: if their way still gets the work done right, accept it warmly and say what changes; if not, politely give ONE clear reason and a helpful option. If you already argued this point before (see EARLIER), accept the PM's decision, say you have noted the risk, and do not argue again.
A MANAGER has the final word on any situation, because they know how to handle the client: if the manager says something is fine, accepted, or to go ahead, accept it, thank them and record it; if they reopen something, accept that too. For each requirement they settle, add it to "settled".
Always be polite, kind and respectful to everyone.
Answer with one JSON object only: {"genuine":true,"intent":"question | approval | counter | manager decision | done | other","topic":"two to four words","qtype":"work | technical | access | client | other","answer":"","argued":false,"accepted":false,"settled":[{"r":"requirement id","decision":"accepted | reopened","note":""}],"record":"one line for the order history","needsHuman":false,"who":"Sales | PM | manager"}`;
      const user = `SENDER ROLE: ${isMgr ? "manager" : isPM ? "PM" : sRoles.join(", ") || "team member"}
EARLIER ON THIS ORDER (PM and manager responses): ${JSON.stringify((o.stepLog || []).slice(-8))}
REQUIREMENT IDS: ${JSON.stringify((ck.requirements || []).map(q => ({ id:q.id, text:q.text })))}
THE CONVERSATION JUST BEFORE THIS MESSAGE (read it, answer in its flow, never repeat what someone already said): ${JSON.stringify(msgs.filter(x => x.at <= m.at).slice(-10).map(x => String(x.at).slice(11, 16) + " " + x.by + ": " + str(x.text, 300)))}
WHAT THE DESK KNOWS IS AS OF: ${((o.readLog || {}).at || o.checkAt || "never")}
MESSAGE from ${m.by}: ${m.text}
ORDER FACTS: site ${o.client.website}, stage ${o.stage}.
REQUIREMENTS AND STATUS: ${JSON.stringify((ck.rows || []).map(r => ({ requirement:((ck.requirements || []).find(q => q.id === r.r) || {}).text, phase:((ck.requirements || []).find(q => q.id === r.r) || {}).phase, doneWhen:((ck.requirements || []).find(q => q.id === r.r) || {}).doneWhen, status:r.status, found:r.found, toPass:r.toPass, where:r.where, check:r.check })))}
ACCESS: ${JSON.stringify((pv.access || []).map(a => ({ item:a.item, level:a.level, status:a.status })))}
FILES READ: ${JSON.stringify(ck.files || [])}
LIVE CHECKS: ${JSON.stringify(ck.probes || []).slice(0, 6000)}
SITE CHECK: ${o.verify ? verifyText(o.verify).slice(0, 4000) : ""}`;
      const lim = await deskAllowed(cfg, g.id, m.by);
      if(lim){ await deskLog({ kind:"thread", group:g.name, space:g.id, order:o.id, by:m.by, q:str(m.text, 500), a:"", usd:0, skipped:lim }); continue; }
      try{ const r = await askAI("deskanswer", "claude-sonnet-5-5", system, user, 1500), d = r.data || {}; o.aiUsd = +(num(o.aiUsd, 0) + r.usd).toFixed(4);
        if(d.genuine === false || !d.answer){ await deskLog({ kind:"thread", group:g.name, space:g.id, order:o.id, by:m.by, q:str(m.text, 500), a:"", usd:+r.usd.toFixed(4), skipped:"not a work question" }); continue; }
        await deskCount(g.id, m.by); await deskLog({ kind:"thread", group:g.name, space:g.id, order:o.id, by:m.by, q:str(m.text, 500), a:str(d.answer, 800), usd:+r.usd.toFixed(4), needsHuman:!!d.needsHuman });
        await perfEv({ type:"query", who:m.by, order:o.id, group:g.name, q:str(m.text, 300), topic:str(d.topic, 40), qtype:str(d.qtype, 12), genuine:true, usd:+r.usd.toFixed(4) });
        await safePost(o, as, g.id, deskSay(cfg, (d.needsHuman ? d.answer + (d.who ? " (" + d.who + " will confirm.)" : "") : d.answer)), { answer:true, thread:m.thread });
        log(o, { name:"Order desk" }, "Answered " + m.by + " in the project group: " + str(d.answer, 160));
        if(d.needsHuman) (o.deskAsks = o.deskAsks || []).push({ at:now(), by:m.by, q:str(m.text, 400), who:str(d.who, 20), answer:str(d.answer, 400) });
        if(["approval", "counter", "manager decision"].includes(d.intent)) (o.stepLog = o.stepLog || []).push({ at:now(), by:m.by, role:isMgr ? "manager" : isPM ? "PM" : "team", intent:d.intent, said:str(m.text, 300), argued:!!d.argued, accepted:!!d.accepted, record:str(d.record, 240) });
        // A PM counter the desk accepted, or a manager's decision, is a lesson candidate: kept switched off until the owner turns it on
        if((d.intent === "manager decision" || (d.intent === "counter" && d.accepted)) && d.record) try{ const l = await learnList();
          l.push({ id:"L" + (Math.max(0, ...l.map(x => parseInt(String(x.id).slice(1)) || 0)) + 1), kind:"from the team", rule:str(d.record, 400), why:str(o.id + ", " + m.by + " (" + (isMgr ? "manager" : "PM") + "): " + m.text, 300), by:"Order desk (suggested)", at:now(), on:false, suggested:true });
          await setJ(LK, l); }catch(e){}
        if(isMgr) for(const st2 of (d.settled || []).slice(0, 10)){ if(!(ck.requirements || []).some(q => q.id === st2.r)) continue; (o.overrides = o.overrides || {})[st2.r] = { decision:st2.decision === "reopened" ? "reopened" : "accepted", by:m.by, at:now(), note:str(st2.note, 240) };
          log(o, { name:"Order desk" }, "Manager " + m.by + " " + (st2.decision === "reopened" ? "reopened" : "accepted") + ": " + str(((ck.requirements || []).find(q => q.id === st2.r) || {}).text, 100) + (st2.note ? " (" + str(st2.note, 120) + ")" : "")); }
        if(d.record) log(o, { name:"Order desk" }, m.by + ": " + str(d.record, 200));
        if(isMgr && (d.settled || []).length) o.checkAt = "";
        changed = true; done.push(o.id + " answered"); }catch(e){ done.push(o.id + " answer: " + e.message); }
    }
    await saveO(o);
  }
  return men.concat(done).join(", ") || "nothing new";
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
  let w = await who(request);
  /* Owner "view as": Manav sees exactly what a role or a person sees, read-only, to spot where someone is stuck */
  { const asV = request.headers.get("x-view-as") || "";
    if(w && w.role === "admin" && asV && a !== "logout"){
      const ps = (await people()).filter(p => !p.off), RN = { sales:"Sales", comms:"Client messages", pm:"PM", qa:"QA", manager:"Manager" };
      const p = asV.startsWith("u:") ? ps.find(x => x.id === asV.slice(2)) : ROLES.includes(asV) ? ps.find(x => rolesOf(x).includes(asV)) : null;
      if(p){ const rs = asV.startsWith("u:") ? rolesOf(p) : [asV]; w = { role:rs[0], roles:rs, uid:p.id, name:p.name, tok:w.tok, viewAs:true, viewer:"Manav" }; }
      else if(ROLES.includes(asV)) w = { role:asV, roles:[asV], uid:"view-" + asV, name:RN[asV], tok:w.tok, viewAs:true, viewer:"Manav" };
      if(w.viewAs && request.method === "POST") return bad("You are viewing as " + w.name + ". Switch back to the Owner view to make changes.", 403);
    } }
  if(a === "logout"){ if(w) await cmd("DEL", T.sess(w.tok)); return out({ ok:true }, 200, { "set-cookie":clearCookie() }); }
  if(!w) return out({ ok:false, signin:true }, 401);
  const cfg = await cfgOf();

  if(a === "me") return out({ ok:true, me:{ name:w.name, role:w.role, myRoles:w.roles || [w.role], uid:w.uid, viewAs:!!w.viewAs }, ai:aiOn(), accessEmail:"manavs909@gmail.com", cfg, gigs:GIGS, roles:ROLES,
    people:(await people()).filter(p => !p.off).map(p => ({ id:p.id, name:p.name, role:rolesOf(p)[0], roles:rolesOf(p) })), access:ACCESS });

  if(a === "gaccs"){ const ac = await gAccounts(); let pr = { items:[], at:"" }; try{ pr = url.searchParams.get("refresh") && w.role === "admin" ? await refreshProps() : await gProps(); }catch(e){ pr.error = e.message; }
    return out({ ok:true, accounts:ac.map(x => Object.assign(x, { gsc:pr.items.filter(i => i.email === x.email && i.kind === "gsc").length, ga:pr.items.filter(i => i.email === x.email && i.kind === "ga").length })), at:pr.at, errors:pr.errors || {} }); }
  if(a === "access"){ const site = str(url.searchParams.get("site"), 200), d = domOf(site); let gp = [];
    try{ gp = (await gProps()).items.filter(i => { const h = domOf(i.id.replace(/^sc-domain:/, "https://")); return i.kind === "gsc" ? h === d : (i.name || "").toLowerCase().includes(d.split(".")[0]); }); }catch(e){}
    return out({ ok:true, domain:d, register:await regOf(site), google:gp }); }
  const isA = w.role === "admin";
  const strip = o => { const dl = deliveryList(o); if(isA) return Object.assign({}, o, { deliveryList:dl }); const c = Object.assign({}, isProj(w) ? projView(o) : o); delete c.pay; c.timeline = []; c.deliveryList = dl; c.deliveryHelp = o.deliveryHelp || []; c.asks = (o.asks || []).filter(k => !isProj(w) || !/sales|comms|admin|manager/.test(k.role || "")); return c; };
  if(a === "file"){ const v = await getJ(IK(str(url.searchParams.get("id"), 20))); if(!v) return bad("File not found", 404);
    return new Response(Buffer.from(v.data, "base64"), { headers:{ "content-type":v.type, "cache-control":"private, max-age=86400", "x-content-type-options":"nosniff", "content-disposition":"inline; filename=\"" + v.name.replace(/[^\w. -]/g, "") + "\"" } }); }
  if(isProj(w) && ["queue", "clients", "client", "clientSave", "leads", "lead", "score", "payments", "hod", "create"].includes(a)) return bad("This is for the sales team", 403);
  if(a === "list"){ const all = await loadAll(300, !isProj(w)); return out({ ok:true, orders:all.map(o => { const x = summary(o, cfg); if(!isA) delete x.econ; if(isProj(w)){ delete x.price; delete x.verdict; x.flags = x.flags.filter(f => !/message|reply/i.test(f.t)); } return x; }) }); }
  if(a === "hod"){ if(!isA) return bad("This report is for Manav only", 403); return out(Object.assign({ ok:true }, await hodData(!!url.searchParams.get("refresh")), { reports:await reportsState() })); }
  if(a === "docFind"){ if(!isA) return bad("For Manav only", 403); const o2 = await getJ(T.ord(str(url.searchParams.get("id"), 20))); if(!o2) return bad("Not found", 404);
    const qx = str(url.searchParams.get("q"), 80).toLowerCase(), hits2 = [];
    for(const d of (o2.docs || []).filter(x => x.status === "linked" && x.current !== false)){ let t = ""; try{ t = await docText(d, 300000); }catch(e){}
      t.split("\n").forEach((ln, i) => { if(qx && ln.toLowerCase().includes(qx) && hits2.length < 60) hits2.push({ file:d.name, line:i + 1, text:str(ln, 400) }); }); }
    return out({ ok:true, hits:hits2 }); }
  if(a === "groupPeek"){ if(!isA) return bad("For Manav only", 403); const o = await getJ(T.ord(url.searchParams.get("id") || "")); if(!o) return bad("Order not found"); const g = groupOf(o), as = await poster(await cfgOf()); if(!g || !as) return bad("No group");
    const ms = (await spaceMessages(as, g.id, "desc", 15)).reverse(); return out({ ok:true, group:g.name || g.id, messages:ms.map(m => ({ at:m.at, by:m.by, desk:isDeskMsg(o, m), thread:m.thread, text:str(m.full || m.text, 300) })) }); }
  if(a === "groupMap"){ if(!isA) return bad("For Manav only", 403); if(url.searchParams.get("refresh")) await mapGroups(true); const m = (await getJ(GMK)) || { spaces:{} };
    return out({ ok:true, at:m.at || "", groups:Object.entries(m.spaces || {}).map(([id, g]) => ({ id, name:g.name, kind:g.kind, order:g.order, orders:g.orders || [], confidence:g.confidence, why:g.why, via:g.via, manual:g.manual || null, error:g.error || "" })) }); }
  if(a === "learn"){ if(!isA) return out({ ok:true, lessons:[], admin:false }); const l = await learnList();
    if(request.method === "POST"){ if(!isA) return bad("For Manav only", 403);
      if(q.op === "add"){ const rule = str(q.rule, 600).trim(); if(rule.length < 12) return bad("Write the lesson as one clear rule");
        l.push({ id:"L" + (Math.max(0, ...l.map(x => parseInt(String(x.id).slice(1)) || 0)) + 1), kind:str(q.kind, 20) || "general", rule, why:str(q.why, 300), by:w.name, at:now(), on:true }); }
      else { const x = l.find(y => y.id === q.lid); if(!x) return bad("Not found");
        if(q.op === "edit"){ const rule = str(q.rule, 600).trim(); if(rule.length < 12) return bad("Write the lesson as one clear rule"); x.rule = rule; x.editedAt = now(); x.editedBy = w.name; }
        else if(q.op === "toggle") x.on = x.on === false; else if(q.op === "del") l.splice(l.indexOf(x), 1); }
      await setJ(LK, l); LEARN.at = 0; }
    return out({ ok:true, lessons:l, admin:isA }); }
  if(a === "perfReset"){ if(!isA) return bad("For Manav only", 403); await cmd("DEL", PF); for(const o2 of await loadAll(1000, true)) if(o2.perfSeen || o2.tasks){ delete o2.perfSeen; delete o2.tasks; delete o2.replied; await saveO(o2); } return out({ ok:true }); }
  if(a === "perf"){ if(!isA) return bad("For Manav only", 403); return out({ ok:true, people:await perfData(num(url.searchParams.get("days"), 30)) }); }
  if(a === "deskUsage"){ if(!isA) return bad("For Manav only", 403); const l = ((await cmd("LRANGE", DL, 0, 999)) || []).map(x => JSON.parse(x)), d = now().slice(0, 10), m = d.slice(0, 7), by = {};
    for(const e of l){ const k = e.group || "?"; const b = by[k] = by[k] || { group:k, today:0, month:0, usdToday:0, usdMonth:0, skipped:0 }; if(String(e.at).startsWith(m)){ b.usdMonth += e.usd || 0; if(!e.skipped && e.kind !== "steps") b.month++; } if(String(e.at).startsWith(d)){ b.usdToday += e.usd || 0; if(!e.skipped && e.kind !== "steps") b.today++; if(e.skipped) b.skipped++; } }
    return out({ ok:true, groups:Object.values(by).map(b => Object.assign(b, { usdToday:+b.usdToday.toFixed(3), usdMonth:+b.usdMonth.toFixed(3) })), log:l.slice(0, 60), limits:{ daily:num(cfg.deskDaily, 40), group:num(cfg.deskPerGroup, 15), person:num(cfg.deskPerPerson, 8) } }); }
  if(a === "askDesk"){ if(request.method !== "POST") return bad("Use POST"); if(!aiOn()) return bad("The AI helpers are off", 503); const qq = str(q.question, 800).trim(); if(qq.length < 4) return bad("Write your question");
    const all = (await loadAll(1000)).filter(o2 => !isProj(w) || [o2.pm, o2.qa].includes(w.id) || (o2.team || []).includes(w.id));
    const words = qq.toLowerCase().split(/[^a-z0-9.]+/).filter(x => x.length > 3);
    const score = o2 => words.reduce((n, x) => n + ((String(o2.id).toLowerCase() === x || String(o2.client.name || "").toLowerCase().includes(x) || String(o2.client.website || "").toLowerCase().includes(x)) ? 5 : 0), 0);
    const hit = all.map(o2 => [score(o2), o2]).filter(x => x[0] > 0).sort((p2, q2) => q2[0] - p2[0]).slice(0, 3).map(x => x[1]);
    const board = all.slice(0, 80).map(o2 => ({ id:o2.id, client:o2.client.name, site:o2.client.website, stage:o2.stage, deadline:o2.deadline, pm:o2.pmName, flags:flags(o2).map(f => f.t).slice(0, 4), verdict:str((o2.check || {}).verdict, 160) }));
    const system = `You are the order desk for the whole team. Answer the question from the FACTS only: the direct answer first, then the orders it is about (with their ids), dates and who acts. If the facts do not say, say so. Never invent. Simple English, short. No dashes.${isProj(w) ? " The asker is on the project team: work only, never prices or payments." : ""} Answer with one JSON object only: {"answer":"","orders":["order ids the answer is about"]}`;
    const user = `ALL ORDERS (newest first): ${JSON.stringify(board)}\n\n${hit.map(o2 => orderFacts(o2, false).slice(0, 30000)).join("\n\n---\n\n")}\n\nQUESTION from ${w.name}: ${qq}`;
    const r = await askAI("deskanswer", "claude-sonnet-5-5", system, user.slice(0, 140000), 1800);
    return out({ ok:true, answer:noId(str((r.data || {}).answer, 4000)), orders:((r.data || {}).orders || []).map(x => str(x, 20)).slice(0, 6) }); }
  if(a === "care"){ const all = await loadAll(1000), today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), l = [];
    for(const o2 of all) ((o2.retention || {}).reminders || []).filter(x => x.status === "open" && x.due <= soon).forEach(x => l.push({ order:o2.id, client:o2.client.name, site:o2.client.website, id:x.id, due:x.due, what:x.what, why:x.why, late:x.due < today }));
    l.sort((p2, q2) => String(p2.due).localeCompare(String(q2.due))); return out({ ok:true, reminders:l.slice(0, 60) }); }
  if(a === "mentions"){ if(!isA) return bad("For Manav only", 403); const l = ((await cmd("LRANGE", MK, 0, 49)) || []).map(x => JSON.parse(x)); return out({ ok:true, mentions:l }); }
  if(a === "mentionDone"){ if(!isA) return bad("For Manav only", 403); const l = ((await cmd("LRANGE", MK, 0, 199)) || []).map(x => JSON.parse(x)); const i = l.findIndex(x => x.id === q.id); if(i < 0) return bad("Not found");
    l[i].handled = true; await cmd("LSET", MK, i, JSON.stringify(l[i])); return out({ ok:true }); }
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
    return out({ ok:true, order:strip(o), econ:isA ? econ(o, cfg) : null, pay:isA ? payNums(o, cfg) : null, flags:isProj(w) ? flags(o).filter(f => !/message|reply|update|promise/i.test(f.t)) : flags(o), client:c && !isProj(w) ? { id:c.id, orders:c.orders.length, first:c.first } : null, history:await getJ(HK(domOf(o.client.website))), stepsPreview:stepsText(o) }); }
  if(a === "clients"){ const all = await loadAll(1000);
    for(const o of all) if(!o.cid || (o.cid === "unknown" && !o.client.name && o.client.website)){ o.cid = cidOf(o.client.name || domOf(o.client.website)); await touchClient(o); await saveO(o); }
    { const u = await getJ(CK("unknown")); if(u && !all.some(o => o.cid === "unknown")){ await cmd("DEL", CK("unknown")); await cmd("SREM", CLS, "unknown"); } }
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
    // Client messages the desk prepared as steps on the order count here too, so this page and the order page always agree
    all.filter(o => !['done', 'cancelled'].includes(o.stage)).forEach(o => (o.actions || []).filter(x => x.type === "client" && !["done", "skipped"].includes(x.status) && x.message).forEach(x => items.push({ order:o.id, client:o.client.name, stage:o.stage, id:x.id, at:x.at || o.at, by:x.by || "Order desk", title:x.title || "", text:x.message, kind:"step", needBy:x.needBy || "" })));
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
    if(a === "cfg"){ const c = Object.assign({}, cfg, { fee:Math.min(50, Math.max(0, num(q.fee, cfg.fee))), hourly:Math.min(200, Math.max(0, num(q.hourly, cfg.hourly))) },
        q.chatAs !== undefined ? { chatAs:str(q.chatAs, 120) } : {}, q.autoPost !== undefined ? { autoPost:!!q.autoPost } : {}, q.deskTag !== undefined ? { deskTag:!!q.deskTag } : {},
        q.deskDaily !== undefined ? { deskDaily:Math.min(500, Math.max(0, num(q.deskDaily, 40))), deskPerGroup:Math.min(200, Math.max(0, num(q.deskPerGroup, 15))), deskPerPerson:Math.min(100, Math.max(0, num(q.deskPerPerson, 8))) } : {}); await setJ(T.cfg, c); return out({ ok:true, cfg:c }); }
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
      const ai = await launch(o, w, cfg); return out({ ok:true, order:strip(o), econ:isA ? econ(o, cfg) : null, pay:isA ? payNums(o, cfg) : null, flags:flags(o), ai, history:await getJ(HK(domOf(o.client.website))), stepsPreview:stepsText(o) }); }
    else if(op === "notOrder"){ need("create"); if(o.stage !== "details") return bad("Only a draft can be marked as not an order");
      setStage(o, "cancelled"); o.cancelWhy = "Not an order: " + str(q.why, 200); log(o, w, o.cancelWhy);
      if(q.ignoreSite){ await cmd("SADD", DIGN, domOf(o.client.website)); log(o, w, "The order desk will not open drafts for " + domOf(o.client.website) + " again"); } }
    else if(op === "history"){ if(isProj(w) && !can(w, "pm")) return bad("Not for this role", 403); const site = domOf(o.client.website); if(!site) return bad("This order has no site");
      const all = await loadAll(1000, true); const hv = await buildHistory(site, all.filter(x => domOf(x.client.website) === site).map(x => x.id)); if(!hv) return bad("The AI helpers are off", 503);
      log(o, w, "Work history for " + site + " rebuilt from the team's emails, chats and files"); }
    else if(op === "analyse"){ need("pm"); if(!o.site || o.site.error || Date.now() - Date.parse(o.site.at || 0) > 7 * 864e5) o.site = null; o.chat = redact(o.chat); o.calls = redact(o.calls); const r = await analyse(o, cfg); if(!r.ok) return bad(r.why, 503); log(o, w, "Order desk ran again"); }
    else if(op === "site"){ need("pm"); o.site = await siteCheck(o.client.website); if(o.site) o.site.at = now(); log(o, w, "Website checked again" + (o.site && o.site.error ? ": did not open" : "")); }
    else if(op === "format"){ await formatConvo(o); log(o, w, "Client conversation laid out again"); try{ await reconcile(o, "chat laid out"); }catch(e){} }
    else if(op === "guides"){ const n = await buildGuides(o); if(n) log(o, { name:"Order desk" }, "Wrote the steps for " + n + " before-delivery item" + (n > 1 ? "s" : "")); }
    else if(op === "askOrder"){ if(!aiOn()) return bad("The AI helpers are off", 503); const qq = str(q.question, 800).trim(); if(qq.length < 4) return bad("Write your question");
      const a2 = await askOrder(o, qq, w, isA); (o.asks = o.asks || []).push({ id:nid("k"), q:qq, a:a2, by:w.name, role:(w.roles || [w.role]).join("+"), at:now() }); o.asks = o.asks.slice(-40); }
    else if(op === "dTick"){ const k = str(q.key, 20); if(!k) return bad("Missing item"); o.deliveryTicks = o.deliveryTicks || {};
      const it = deliveryList(o).find(x => x.key === k); if(q.on === false){ delete o.deliveryTicks[k]; log(o, w, "Unticked before delivery: " + str(it ? it.what : k, 140)); }
      else { o.deliveryTicks[k] = { by:w.name, at:now(), what:str(it ? it.what : "", 300) }; log(o, w, "Done before delivery: " + str(it ? it.what : k, 140)); } }
    else if(op === "dHelp"){ if(!aiOn()) return bad("The AI helpers are off", 503); const it = deliveryList(o).find(x => x.key === str(q.key, 20)) || null, qq = str(q.question, 600);
      if(!it && !qq) return bad("Write your question"); const a2 = await deliveryHelp(o, it, qq, w);
      (o.deliveryHelp = o.deliveryHelp || []).push({ id:nid("h"), key:it ? it.key : "", q:qq || ("How do I do this: " + (it ? it.what : "")), a:a2, by:w.name, at:now() }); o.deliveryHelp = o.deliveryHelp.slice(-30); }
    else if(op === "careSet"){ const x2 = ((o.retention || {}).reminders || []).find(y => y.id === q.rid); if(!x2) return bad("Not found");
      if(q.status === "snooze"){ x2.due = new Date(Date.now() + Math.max(1, Math.min(60, num(q.days, 7))) * 864e5).toISOString().slice(0, 10); log(o, w, "Client care reminder moved to " + x2.due + ": " + x2.what); }
      else { x2.status = q.status === "done" ? "done" : "skipped"; x2.note = str(q.note, 400); x2.doneBy = w.name; x2.doneAt = now(); log(o, w, "Client care " + x2.status + ": " + x2.what + (x2.note ? ". " + x2.note : "")); } }
    else if(op === "careBuild"){ if(!aiOn()) return bad("The AI helpers are off", 503); await buildRetention(o, "rebuilt by " + w.name); }
    else if(op === "reconcile"){ if(o.recon) o.recon.key = ""; const c = await reconcile(o, "asked by " + w.name); if(!c) log(o, w, "Checked that every open item is current: nothing to change"); }
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
      try{ await reconcile(o, "new client chat"); }catch(e){}
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
    else if(op === "sync"){ const r = await syncTeam(o); try{ r.new += await matchDocs([o]); }catch(e){} try{ o.autoProofKey = ""; r.new += await autoProof(o); }catch(e){} log(o, w, "Checked the team's folder, email and chat: " + r.new + " new" + (Object.keys(r.errors || {}).length ? " (some sources could not be read)" : "")); }
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
        if(r.data.scopeChange){ o.alert = "Client asked for something new: check scope"; o.alertAt = now(); } }catch(e){} }
      o.queue.push(x); log(o, w, "Client replied" + (x.digest ? ": " + str(x.digest.summary, 200) : "")); }
    else if(op === "drop"){ need("pm"); const x = find("queue", q.qid); if(!x || x.sent) return bad("Only unsent messages can be dropped"); o.queue = o.queue.filter(y => y !== x); log(o, w, "Dropped a message that is not needed: " + x.kind); }
    else if(op === "seen"){ const x = find("queue", q.qid); if(x){ x.seen = true; x.seenBy = w.name; } if(q.clearAlert) o.alert = ""; }
    else if(op === "proofNewest"){ need("pm"); const d = find("deliverables", q.did); if(!d) return bad("Not found"); groupDocs(o);
      const p = proofsOf(d).find(x => x.id === q.pid); if(!p || !p.newer) return bad("This proof is already the newest copy");
      const cur = find("docs", p.newer.id); d.proofs = proofsOf(d); delete d.proof;
      Object.assign(p, { url:cur.link, name:cur.name, meta:{ ok:true, id:cur.id, name:cur.name, kind:cur.kind, modified:cur.modified, lastBy:cur.by, via:cur.via }, at:now(), by:w.name }); delete p.newer; delete d.check;
      log(o, w, "Proof switched to the newest copy: " + cur.name); }
    else if(op === "check"){ if(!(can(w, "pm") || can(w, "qa") || can(w, "comms"))) return bad("Your role cannot do this step"); if(!aiOn()) return bad("The AI helpers are off", 503); o._quiet = !!q.quiet; try{ await buildCheck(o, !!q.fresh); }finally{ delete o._quiet; } }
    else if(op === "draftReport"){ if(!(can(w, "pm") || can(w, "assign"))) return bad("Your role cannot do this step"); try{ await draftReport(o); }catch(e){ return bad(e.message); } }
    else if(op === "approveReport"){ if(!(can(w, "pm") || can(w, "assign"))) return bad("Your role cannot do this step"); const dr = o.draftReport; if(!dr) return bad("No draft yet");
      dr.approved = true; dr.approvedBy = w.name; dr.approvedAt = now();
      o.docs = (o.docs || []).filter(d => d.id !== dr.id).concat({ id:dr.id, name:dr.name.replace(/ draft$/, ""), mime:"application/vnd.google-apps.document", link:dr.link, modified:now(), by:"Order desk, approved by " + w.name, via:dr.via, kind:"report", why:"Work report written from verified work, approved by " + w.name, confidence:1, status:"linked", at:now() });
      groupDocs(o); log(o, w, "Approved the work report written from verified work. It now counts as our work report."); try{ await buildCheck(o); }catch(e){} }
    else if(op === "unblock"){ if(!(isMgrW(w) || can(w, "pm") || can(w, "comms"))) return bad("Your role cannot do this step"); const b = (o.blockers || []).find(x => x.id === q.bid && x.open); if(!b) return bad("Not found");
      b.open = false; b.clearedBy = w.name; b.clearedAt = now(); log(o, w, "Cleared the blocker: " + str(b.text, 200));
      try{ const as = await poster(cfg), g = groupOf(o); if(as && g && b.thread) await safePost(o, as, g.id, deskSay(cfg, "Update: this is cleared now (" + String(w.name || "").split(" ")[0] + "). Thank you for waiting."), { thread:b.thread, answer:true }); }catch(e){} }
    else if(op === "scopeOk"){ if(!(isMgrW(w) || can(w, "pm"))) return bad("Only a manager, the PM or Manav", 403); if(!o.scopePending) return bad("Nothing to confirm");
      log(o, w, "Saw the scope change: " + o.scopePending.changes.map(c => c.kind + ": " + str(c.text, 60)).join("; ")); (o.scopeLog = o.scopeLog || []).push(Object.assign({ seenBy:w.name, seenAt:now() }, o.scopePending)); delete o.scopePending; }
    else if(op === "groupLink"){ if(!(isMgrW(w) || can(w, "pm"))) return bad("Only a manager, the PM or Manav", 403); const m = (await getJ(GMK)) || { spaces:{} }, g = (m.spaces || {})[str(q.space, 80)]; if(!g) return bad("Group not found");
      g.manual = { order:o.id, yes:!!q.yes, by:w.name, at:now() }; await setJ(GMK, m);
      log(o, w, (q.yes ? "Confirmed" : "Rejected") + " the group \"" + str(g.name, 80) + "\" as this order's project group");
      if(q.yes){ try{ await syncTeam(o); }catch(e){} } else o.groupCands = (o.groupCands || []).filter(x => x.id !== q.space); }
    else if(op === "mgrAdd"){ if(!isMgrW(w)) return bad("Only a manager or Manav can add tasks", 403); if(o.stage === "cancelled") return bad("This order is cancelled");
      const text = str(q.text, 400).trim(), phase = q.phase === "delivery" ? "delivery" : "project", who = str(q.who, 40).trim(); if(text.length < 8) return bad("Write the task in a short sentence");
      const id = "m" + (Math.max(0, ...(o.mgrTasks || []).map(m => parseInt(String(m.id).slice(1)) || 0)) + 1), m = { id, text, phase, who, by:w.name, at:now() };
      (o.mgrTasks = o.mgrTasks || []).push(m);
      if(phase === "project"){ o.deliverables = (o.deliverables || []).concat({ id:nid("d"), text, done:false, proof:"", qa:"", req:id });
        if(o.check){ (o.check.requirements = o.check.requirements || []).push({ id, text, source:"manager", type:"", phase, doneWhen:"", askedIn:{ where:"Added by " + w.name + " (manager)", when:now().slice(0, 10), quote:text } });
          (o.check.rows = o.check.rows || []).push({ r:id, status:"not done", found:"Added by " + w.name + ", " + now().slice(0, 10), toPass:text, who:ownerOf(who, text), where:"", check:"" }); o.check.readyForQA = false; }
        if(["qa", "ready", "delivered", "done"].includes(o.stage)){ log(o, w, "Back to work from " + o.stage + ": the manager added a task"); setStage(o, "work"); } }
      log(o, w, "Added a task (" + (phase === "project" ? "project work, it must be done before QA" : "before delivery") + (who ? ", for " + who : "") + "): " + text); }
    else if(op === "mgrDiscard"){ if(!isMgrW(w)) return bad("Only a manager or Manav can discard this", 403); const why = str(q.reason, 400).trim(); if(why.length < 10) return bad("Write the reason (at least a short sentence)");
      const rec = { by:w.name, role:(w.roles || [w.role]).join("+"), at:now(), reason:why }, k = str(q.key, 40);
      if(q.kind === "qf"){ const x = ((o.check || {}).quickFixes || []).find(y => y.id === k); if(!x) return bad("Quick fix not found"); (o.discardedQF = o.discardedQF || {})[k] = Object.assign({ what:x.what }, rec); o.check.quickFixes = o.check.quickFixes.filter(y => y.id !== k); log(o, w, "Discarded the quick fix \"" + str(x.what, 120) + "\". Reason: " + why); }
      else if(q.kind === "dl"){ const x = deliveryList(o).find(y => y.key === k); if(!x) return bad("Item not found"); (o.deliveryDiscard = o.deliveryDiscard || {})[k] = Object.assign({ what:x.what }, rec); const mt = (o.mgrTasks || []).find(m => dKey(m.text) === k); if(mt) (o.discarded = o.discarded || {})[mt.id] = rec; log(o, w, "Discarded the before-delivery item \"" + str(x.what, 120) + "\". Reason: " + why); }
      else return bad("Unknown item");
      o.groupMsgAt = ""; }
    else if(op === "discardReq"){ if(!(can(w, "pm") || can(w, "assign") || can(w, "comms"))) return bad("Your role cannot do this step"); const ck = o.check || {}, rq = (ck.requirements || []).find(x => x.id === q.r);
      if(!rq) return bad("Task not found"); const why = str(q.reason, 400).trim(); if(why.length < 10) return bad("Write the reason for discarding this task (at least a short sentence)");
      (o.discarded = o.discarded || {})[rq.id] = { by:w.name, role:(w.roles || [w.role]).join("+"), at:now(), reason:why, task:str(rq.text, 300) };
      o.check.rows = (ck.rows || []).filter(r => r.r !== rq.id); o.deliverables = (o.deliverables || []).filter(d => d.req !== rq.id);
      log(o, w, "Discarded the task \"" + str(rq.text, 120) + "\". Reason: " + why);
      if(o.stage === "work" && o.deliverables.length && o.deliverables.every(d => d.done) && (o.check.rows || []).filter(r => ((ck.requirements || []).find(x => x.id === r.r) || {}).phase === "project").every(r => r.status === "done")){ o.deliverables.forEach(d => { d.qa = ""; d.qaNote = ""; }); setStage(o, "qa"); log(o, { name:"Order desk" }, "Every remaining requirement is done. Sent to QA."); } }
    else if(op === "deferReq"){ if(!(can(w, "pm") || can(w, "assign") || can(w, "comms"))) return bad("Your role cannot do this step"); const ck = o.check || {}, rq = (ck.requirements || []).find(x => x.id === q.r);
      if(!rq) return bad("Task not found"); const why = str(q.reason, 400).trim(), part = str(q.part, 400).trim();
      if(why.length < 10) return bad("Write why this goes to the delivery note (at least a short sentence)");
      (o.deferred = o.deferred || []).push({ id:nid("dn"), r:rq.id, task:str(rq.text, 200), part:part || str(rq.text, 200), whole:!part, reason:why, by:w.name, role:(w.roles || [w.role]).join("+"), at:now() });
      log(o, w, "Moved to the delivery note: \"" + (part || str(rq.text, 120)) + "\". It does not stop QA. Reason: " + why);
      if(!part){ o.check.rows = (ck.rows || []).filter(r => r.r !== rq.id); o.deliverables = (o.deliverables || []).filter(d => d.req !== rq.id); } }
    else if(op === "undefer"){ if(!(can(w, "pm") || can(w, "assign") || can(w, "comms"))) return bad("Your role cannot do this step"); const i = (o.deferred || []).findIndex(x => x.id === q.did); if(i < 0) return bad("Not found");
      const x = o.deferred.splice(i, 1)[0]; log(o, w, "Took back from the delivery note: \"" + x.part + "\"");
      if(x.whole){ const rq = ((o.check || {}).requirements || []).find(y => y.id === x.r) || {}; if(rq.phase === "project" && !(o.deliverables || []).some(d => d.req === x.r)) o.deliverables.push({ id:nid("d"), text:rq.text || "", done:false, proof:"", qa:"", req:x.r }); } }
    else if(op === "restoreReq"){ if(!(can(w, "pm") || can(w, "assign") || can(w, "comms"))) return bad("Your role cannot do this step"); const dd = (o.discarded || {})[q.r]; if(!dd) return bad("Not discarded");
      delete o.discarded[q.r]; const rq = ((o.check || {}).requirements || []).find(x => x.id === q.r) || {};
      if(rq.phase === "project" && !(o.deliverables || []).some(d => d.req === q.r)) o.deliverables.push({ id:nid("d"), text:rq.text || "", done:false, proof:"", qa:"", req:q.r });
      log(o, w, "Restored the task \"" + str(rq.text, 120) + "\" (discarded earlier by " + dd.by + ")"); o.checkAt = ""; }
    else if(op === "redoMsg"){ if(!(can(w, "pm") || can(w, "assign") || can(w, "comms"))) return bad("Your role cannot do this step"); o.groupMsg = await writeGroupMsg(o); o.groupMsgAt = now(); }
    else if(op === "deskDelete"){ if(w.role !== "admin") return bad("For Manav only", 403); const p2 = (o.deskPosts || []).find(x => x.name === q.name); if(!p2) return bad("Only the desk's own messages can be removed");
      const as = await poster(cfg); await deleteChat(as, p2.name); o.deskPosts = o.deskPosts.filter(x => x !== p2); o.teamChat = (o.teamChat || []).filter(m => m.id !== p2.name); log(o, w, "Removed the desk's duplicate message from the project group"); }
    else if(op === "fresh"){ const kind = str(q.kind, 12), id = str(q.id, 40), nw = await ensureCurrent(o, "before sending");
      let text = "", gone = "";
      if(kind === "queue"){ const m = (o.queue || []).find(x => x.id === id); if(!m) gone = "This message is no longer needed: the situation moved on. See the order history."; else text = m.text; }
      else if(kind === "action"){ const a = (o.actions || []).find(x => x.id === id); if(!a || ["done", "skipped"].includes(a.status)) gone = "No longer needed: " + ((a && a.statusWhy) || "the situation moved on"); else text = a.message || ""; }
      else if(kind === "delivery"){ if(!o.pack || (o.check && String(o.pack.at || "") < String(o.check.at || "")) || nw.length) try{ await buildPack(o); }catch(e){} text = ((o.pack || {}).client || {}).message || ""; }
      o.lastFresh = { at:now(), kind, id, text, gone, news:nw }; log(o, w, "Made sure the " + (kind === "delivery" ? "delivery message" : "client message") + " is current before copying" + (nw.length ? " (new: " + nw.slice(0, 4).join(", ") + ")" : "")); }
    else if(op === "repoll"){ if(w.role !== "admin") return bad("For Manav only", 403); o.chatPollAt = str(q.since, 40) || new Date(Date.now() - 3 * 36e5).toISOString(); log(o, w, "Asked the desk to read the group's messages again from " + o.chatPollAt); }
    else if(op === "reportQA"){ if(!(can(w, "qa") || can(w, "pm") || isMgrW(w))) return bad("Your role cannot do this step"); await reportQA(o, true); }
    else if(op === "deskEdit"){ if(w.role !== "admin") return bad("For Manav only", 403); const t = str(q.text, 3000).trim(); if(t.length < 10) return bad("Write the message");
      const last = (o.deskPosts || []).filter(p => p.kind === "note" && p.name).slice(-1)[0]; if(!last) return bad("No desk note to edit");
      const as = await poster(cfg); await editChat(as, last.name, t); last.hash = sha(t).slice(0, 12); last.editedAt = now(); log(o, w, "Edited the desk's note in the project group"); }
    else if(op === "deskSay"){ if(w.role !== "admin") return bad("For Manav only", 403); const t = str(q.text, 3000).trim(); if(t.length < 10) return bad("Write the message");
      // A note from the owner, posted as the desk. Current sources are read first: if a person wrote after the last reading, nothing is sent
      await freshen(o); const nw = (await newerThanRead(o)).filter(x => /message|email/.test(x));
      if(nw.length && !q.anyway) return bad("New in the group since the last reading: " + [...new Set(nw)].join(", ") + ". Read it first, then send again.");
      const as = await poster(cfg), g = groupOf(o); if(!as || !g) return bad("No project group or posting account");
      let m; try{ m = await safePost(o, as, g.id, t, { allowAfterDesk:!!q.anyway }); }catch(e){ return bad(e.message); }
      o.deskPosts = (o.deskPosts || []).concat({ name:m.name, thread:m.thread ? m.thread.name : "", sender:m.sender ? m.sender.name : "", at:now(), kind:"note", hash:sha(t).slice(0, 12) }).slice(-30);
      log(o, w, "Posted a note in the project group as the desk: " + str(t, 200)); await deskLog({ kind:"note", group:g.name, space:g.id, order:o.id, by:w.name, q:"", a:str(t, 800), usd:0 }); }
    else if(op === "postSteps"){ if(!(can(w, "pm") || can(w, "assign") || can(w, "comms"))) return bad("Your role cannot do this step"); try{ await postSteps(o, cfg, w); }catch(e){ return bad(e.message); } }
    else if(op === "pack"){ if(!(can(w, "pm") || can(w, "qa") || can(w, "comms"))) return bad("Your role cannot do this step"); if(!aiOn()) return bad("The AI helpers are off", 503); await buildPack(o); }
    else if(op === "toQA"){ need("pm"); groupDocs(o); { const st = staleProofs(o); if(st.length) return bad("A newer copy exists for: " + st.join(", ") + ". Switch to the newest first (Use the newest, under the proof)."); } const left = o.deliverables.filter(d => !d.done || !proofsOf(d).length); if(left.length) return bad("Every deliverable needs proof and Done first (" + left.length + " left)");
      o.deliverables.forEach(d => { d.qa = ""; d.qaNote = ""; });
      setStage(o, "qa"); log(o, w, "Sent to QA"); try{ await buildPack(o); }catch(e){} }
    else if(op === "qa"){ need("qa"); if(o.stage !== "qa") return bad("This order is not waiting for QA");
      const unmarked = o.deliverables.filter(d => !d.qa); if(unmarked.length) return bad("Mark every deliverable Pass or Fail first (" + unmarked.length + " left)");
      const fails = o.deliverables.filter(d => d.qa === "fail"), res = fails.length ? "fail" : "pass", note = fails.map(d => d.text.slice(0, 60) + ": " + d.qaNote).join(" | ");
      o.qaRounds.push({ at:now(), by:w.name, result:res, note }); o.stage = res === "pass" ? "ready" : "work"; if(res === "pass") try{ await buildPack(o); }catch(e){}
      fails.forEach(d => { d.done = false; d.check = null; });
      log(o, w, res === "pass" ? "QA passed every deliverable. Ready to deliver." : "QA sent back " + fails.length + ": " + note); }
    else if(op === "deliver"){ need("comms"); if(o.stage !== "ready") return bad("Deliver only after QA passes");
      groupDocs(o); { const st = staleProofs(o); if(st.length){ setStage(o, "qa"); o.deliverables.forEach(d => { d.qa = ""; }); log(o, { name:"Order desk" }, "A newer copy appeared for: " + st.join(", ") + ". Sent back to QA."); await saveO(o); return bad("A newer copy of " + st.join(", ") + " appeared after QA. The order went back to QA so the newest is checked."); } }
      const passAt = ((o.qaRounds || []).filter(r => r.result === "pass").pop() || {}).at || "", changed = [];
      for(const d of o.deliverables) for(const p of proofsOf(d)) if(p.kind === "drive"){ const m = await driveMeta(p.url); if(m.ok && passAt && m.modified > passAt) changed.push(m.name); }
      if(changed.length){ setStage(o, "qa"); o.deliverables.forEach(d => { d.qa = ""; }); log(o, { name:"Order desk" }, "Changed after QA passed: " + changed.join(", ") + ". Sent back to QA."); await saveO(o); return bad("These were changed after QA passed: " + changed.join(", ") + ". The order went back to QA."); }
      setStage(o, "delivered"); o.deliveredAt = now(); o.rechecks = [3, 7, 14].map(n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10));
      log(o, w, "Delivered to the client. The order desk will recheck Google on " + o.rechecks.join(", ") + " and draft an update for the client.");
      try{ await buildRetention(o, "delivered"); }catch(e){} }
    else if(op === "revision"){ need("comms"); const reason = str(q.reason, 40), ours = !/client changed/i.test(reason);
      o.revisions.push({ at:now(), by:w.name, reason, note:str(q.note, 2000), ours }); setStage(o, "work"); o.deliverables.forEach(d => { d.qa = ""; });
      log(o, w, "Revision: " + reason + (q.note ? ". " + str(q.note, 300) : "")); }
    else if(op === "close"){ need("comms"); o.rating = Math.min(5, Math.max(0, num(q.rating, 0))) || null; o.repeat = !!q.repeat; o.retainer = !!q.retainer; setStage(o, "done"); o.closedAt = now();
      log(o, w, "Closed" + (o.rating ? ", rating " + o.rating : "") + (o.retainer ? ", retainer agreed" : o.repeat ? ", ordered again" : ""));
      try{ await buildRetention(o, "closed"); }catch(e){} }
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
    return out({ ok:true, order:strip(o), econ:isA ? econ(o, cfg) : null, pay:isA ? payNums(o, cfg) : null, flags:isProj(w) ? flags(o).filter(f => !/message|reply|update|promise/i.test(f.t)) : flags(o), history:await getJ(HK(domOf(o.client.website))), stepsPreview:stepsText(o) });
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
