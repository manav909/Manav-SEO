/* Follows the team's own work for each order, read-only, through the connected team accounts (e.g. seo@indiit.com):
   the project's Drive folder, emails the account is copied on, and Google Chat spaces it is a member of.
   Orders are matched by order number (O-1001) or the client's site (pwmania.com / pwmania). */
import { apiAs, accounts } from "./google.mjs";
import { officeText } from "./orderai.mjs";
/* A Google Sheet as text, every tab (the plain-text export gives only the first tab) */
async function sheetText(id, tok){
  const r = await fetch("https://www.googleapis.com/drive/v3/files/" + id + "/export?mimeType=" + encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), { headers:{ authorization:"Bearer " + tok } });
  if(!r.ok) return ""; return officeText(Buffer.from(await r.arrayBuffer()), "sheet.xlsx");
}

const host = u => { try{ return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); }catch(e){ return ""; } };
const keysOf = o => { const h = host(o.client.website), root = h.split(".")[0]; return { id:o.id, h, root:root && root.length >= 4 ? root : "" }; };
const hits = (text, k) => { const t = String(text || "").toLowerCase(); return t.includes(k.id.toLowerCase()) || (k.h && t.includes(k.h)) || (k.root && new RegExp("\\b" + k.root + "\\b").test(t)); };
const b64 = s => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function bodyOf(p){
  if(!p) return ""; if(p.mimeType === "text/plain" && p.body && p.body.data) return b64(p.body.data);
  for(const x of p.parts || []){ const t = bodyOf(x); if(t) return t; }
  if(p.mimeType === "text/html" && p.body && p.body.data) return b64(p.body.data).replace(/<[^>]+>/g, " ");
  return "";
}
const clean = t => String(t).split(/\r?\n/).filter(l => !/^\s*>/.test(l)).join("\n").split(/\nOn .{5,80}wrote:\n/)[0].replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);

/* Passwords, keys, tokens and logins never leave the chat: masked before the order desk keeps or reads a message */
export const maskCreds = (t, files) => { const x = String(t || "")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email hidden]")
  .replace(/\b(pass(word)?|pwd|passcode|pin|otp|user ?name|username|login|user|id|api ?key|key|token|secret|app(lication)? password)\s*[:=-]\s*\S+/gi, "$1: [hidden]")
  .replace(/(^|\n)(\s*(password|pass|pwd|key|token)\s*:?\s*\n)([^\n]+)/gi, "$1$2[hidden]")
; return files ? x : x.replace(/(^|\s)(?!https?:)(?=\S*\d)(?=\S*[A-Za-z])(?=\S*[^A-Za-z0-9\s.,/])\S{8,64}(?=\s|$)/g, "$1[hidden]"); };
export function accessPrompt(o, items, msgs){
  const system = `You read messages from an agency's internal project access group, where sales and the project team share and fix client access (Search Console, Analytics, CMS logins, hosting). Credentials are already hidden; never repeat any. For the order below, decide what the messages show for each access item: "received" (access is shared and works at the right level), "wrong" (shared but the wrong level, or it does not work), "asked" (requested, not given yet). Only items the messages clearly speak about. Each item shows its current status and when it was set: a message older than that never changes it, because newer information already settled it. List as open problems only what is still open given the current statuses. Give the time of the message each update rests on. No dashes.
Answer with one JSON object only: {"updates":[{"id":"access item id","status":"received | wrong | asked","at":"time of the message it rests on","note":"one plain line: who, when, what"}],"newItems":[{"item":"access the messages show that is not on the list","status":"received | asked","note":""}],"issues":["open access problem, with who must act"],"summary":"one line"}`;
  const user = `Order ${o.id}, site ${o.client.website}, client ${o.client.name || ""}.
ACCESS ITEMS:
${items.map(a => `${a.id}: ${a.item} (level needed: ${a.level || "?"}) now ${a.status}${a.receivedAt || a.atS ? " since " + (a.receivedAt || a.atS) : ""}${a.note ? " (" + a.note.slice(0, 120) + ")" : ""}`).join("\n")}
MESSAGES:
${msgs.map(m => `${m.at} ${m.by}: ${m.text}${(m.files || []).length ? " [files: " + m.files.join(", ") + "]" : ""}`).join("\n")}`.slice(0, 60000);
  return { system, user };
}
export async function syncOrder(o){
  const k = keysOf(o), out = { at:new Date().toISOString(), folder:o.folder || null, files:[], mails:[], chat:[], access:[], errors:{} }, since = o.syncAt || o.at;
  const accs = (await accounts()).filter(a => !a.primary || a.drive);
  for(const a of accs){
    // Drive: the project folder, named with the order number or the site
    if(a.drive && !out.folder){
      try{ const q = "mimeType='application/vnd.google-apps.folder' and trashed=false and (name contains '" + k.id + "'" + (k.root ? " or name contains '" + k.root + "'" : "") + ")";
        const r = await apiAs(a.email, "https://www.googleapis.com/drive/v3/files?pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink,modifiedTime)&q=" + encodeURIComponent(q));
        const f = (r.files || []).sort((x, y) => (x.name.includes(k.id) ? -1 : 0) - (y.name.includes(k.id) ? -1 : 0))[0];
        if(f) out.folder = { id:f.id, name:f.name, link:f.webViewLink, via:a.email }; }catch(e){ out.errors.drive = e.message; }
    }
    // Gmail: messages this account received or was copied on about the order
    if(a.gmail){
      try{ const q = "(" + [k.id, k.h, k.root].filter(Boolean).map(x => '"' + x + '"').join(" OR ") + ") newer_than:60d";
        const l = await apiAs(a.email, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=" + encodeURIComponent(q));
        for(const m of (l.messages || []).slice(0, 15)){
          if((o.mails || []).some(x => x.id === m.id)) continue;
          const g = await apiAs(a.email, "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + m.id + "?format=full");
          const hd = n => ((g.payload.headers || []).find(h => h.name.toLowerCase() === n) || {}).value || "";
          out.mails.push({ id:m.id, via:a.email, from:hd("from"), to:hd("to"), cc:hd("cc"), subject:hd("subject"), date:new Date(Number(g.internalDate)).toISOString(), text:maskCreds(clean(bodyOf(g.payload)) || g.snippet || ""),
            files:(function walk(p, acc){ (p.parts || []).forEach(x => { if(x.filename) acc.push(x.filename); walk(x, acc); }); return acc; })(g.payload, []).slice(0, 10) });
        } }catch(e){ out.errors.gmail = e.message; }
    }
    // Google Chat: spaces named after the order or site that this account is in
    if(a.chat){
      try{ const sp = await apiAs(a.email, "https://chat.googleapis.com/v1/spaces?pageSize=100");
        for(const s of (sp.spaces || []).filter(s => hits(s.displayName, k)).slice(0, 3)){
          const ms = await apiAs(a.email, "https://chat.googleapis.com/v1/" + s.name + "/messages?pageSize=50&orderBy=createTime%20desc&filter=" + encodeURIComponent('createTime > "' + since + '"'));
          for(const m of (ms.messages || []).reverse()) if(!(o.teamChat || []).some(x => x.id === m.name))
            out.chat.push({ id:m.name, space:s.displayName, spaceId:s.name, thread:m.thread ? m.thread.name : "", sender:m.sender ? m.sender.name : "", via:a.email, by:(m.sender && (m.sender.displayName || m.sender.name)) || "", at:m.createTime, text:maskCreds(String(m.text || m.formattedText || "")).slice(0, 3000), files:(m.attachment || []).map(x => x.contentName).filter(Boolean),
              links:(m.attachment || []).filter(x => x.driveDataRef && x.driveDataRef.driveFileId).map(x => ({ name:x.contentName || "", url:"https://drive.google.com/file/d/" + x.driveDataRef.driveFileId + "/view", id:x.driveDataRef.driveFileId })) });
        } }catch(e){ out.errors.chat = e.message; }
    }
  }
  // The project access group (a Google Chat space with "access" in its name, where sales and the project team share and fix access):
  // messages naming this order's site, client or number, plus the rest of their threads. Credentials are masked before anything is kept.
  for(const a of accs.filter(x => x.chat)){
    try{ const sp = await apiAs(a.email, "https://chat.googleapis.com/v1/spaces?pageSize=100");
      for(const s of (sp.spaces || []).filter(s => /access/i.test(s.displayName || "")).slice(0, 3)){
        const from = o.accessSyncAt || new Date(Date.parse(o.at) - 30 * 864e5).toISOString();
        const ms = await apiAs(a.email, "https://chat.googleapis.com/v1/" + s.name + "/messages?pageSize=200&orderBy=createTime%20desc&filter=" + encodeURIComponent('createTime > "' + from + '"'));
        const list = (ms.messages || []).reverse(), cname = String(o.client.name || "").toLowerCase();
        const hit = m => hits(m.text, k) || (cname.length >= 4 && String(m.text || "").toLowerCase().includes(cname));
        const threads = new Set(list.filter(hit).map(m => m.thread && m.thread.name).filter(Boolean));
        for(const m of list) if((hit(m) || (m.thread && threads.has(m.thread.name))) && !(o.accessChat || []).some(x => x.id === m.name))
          out.access.push({ id:m.name, space:s.displayName, via:a.email, by:(m.sender && m.sender.displayName) || "", at:m.createTime, text:maskCreds(String(m.text || "")).slice(0, 2000), files:(m.attachment || []).map(x => x.contentName).filter(Boolean) });
      } }catch(e){ out.errors.access = e.message; }
  }
  if(out.folder){
    const a = out.folder.via;
    try{ const r = await apiAs(a, "https://www.googleapis.com/drive/v3/files?pageSize=60&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,modifiedTime,webViewLink,lastModifyingUser(displayName))&q=" + encodeURIComponent("'" + out.folder.id + "' in parents and trashed=false"));
      out.files = (r.files || []).map(f => ({ id:f.id, name:f.name, mime:f.mimeType, modified:f.modifiedTime, by:f.lastModifyingUser ? f.lastModifyingUser.displayName : "", link:f.webViewLink })); }catch(e){ out.errors.folder = e.message; }
  }
  return out;
}

/* Our documents, found by what is in them, not by how they are named: recent files the team accounts own or that are
   shared with them, files that mention the client's site, and Drive links in team emails and chats. */
export async function docCandidates(orders){
  const accs = (await accounts()).filter(a => a.drive), out = new Map(), oldest = orders.reduce((m, o) => o.at < m ? o.at : m, new Date().toISOString());
  const since = new Date(Date.parse(oldest) - 7 * 864e5).toISOString();
  const F = "files(id,name,mimeType,modifiedTime,createdTime,webViewLink,owners(displayName,emailAddress),lastModifyingUser(displayName))";
  const add = (f, via, why) => { if(!f || !f.id || /folder$/.test(f.mimeType || "")) return; const c = out.get(f.id) || { id:f.id, name:f.name, mime:f.mimeType, modified:f.modifiedTime, created:f.createdTime, link:f.webViewLink, by:f.lastModifyingUser ? f.lastModifyingUser.displayName : "", owner:(f.owners || [])[0] ? f.owners[0].displayName || f.owners[0].emailAddress : "", via, why:[] }; c.why.push(why); out.set(f.id, c); };
  for(const a of accs){
    const list = q => apiAs(a.email, "https://www.googleapis.com/drive/v3/files?pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=modifiedTime%20desc&fields=" + encodeURIComponent(F) + "&q=" + encodeURIComponent(q)).then(r => r.files || []).catch(() => []);
    (await list("trashed=false and modifiedTime > '" + since + "' and (sharedWithMe or 'me' in owners)")).forEach(f => add(f, a.email, "recent"));
    for(const o of orders){ const k = keysOf(o); const terms = [k.h, k.root, o.id].filter(Boolean);
      (await list("trashed=false and (" + terms.map(t => "fullText contains '" + t.replace(/'/g, "") + "'").join(" or ") + ")")).forEach(f => add(f, a.email, "its text contains this client's site")); }
  }
  // Drive links the team wrote in emails and chats
  const F1 = "id,name,mimeType,modifiedTime,createdTime,webViewLink,owners(displayName,emailAddress),lastModifyingUser(displayName)";
  for(const o of orders){
    const msgs = [].concat((o.mails || []).map(m => ({ t:m.text, via:m.via, where:"an email (" + (m.subject || "") + ")", by:m.from, links:[] })), (o.teamChat || []).map(m => ({ t:m.text, via:m.via, where:"the project group " + (m.space || ""), by:m.by, links:m.links || [] })));
    for(const g of msgs){ const ids = new Set(g.links.map(l => l.id));
      for(const m of String(g.t || "").matchAll(/https?:\/\/(?:drive|docs)\.google\.com\/[^\s)>"]+/g)){ const id = (m[0].match(/\/d\/([\w-]{15,})|[?&]id=([\w-]{15,})/) || []).slice(1).find(Boolean); if(id) ids.add(id); }
      for(const id of ids){ if(out.has(id)){ out.get(id).posted = "posted in " + g.where + " by " + g.by; continue; }
        let f = null; if(g.via) try{ f = await apiAs(g.via, "https://www.googleapis.com/drive/v3/files/" + id + "?supportsAllDrives=true&fields=" + encodeURIComponent(F1)); }catch(e){}
        out.set(id, f && f.id ? { id, name:f.name, mime:f.mimeType, modified:f.modifiedTime, created:f.createdTime, link:f.webViewLink, by:f.lastModifyingUser ? f.lastModifyingUser.displayName : "", owner:(f.owners || [])[0] ? f.owners[0].displayName || f.owners[0].emailAddress : "", via:g.via, why:["posted in " + g.where + " by " + g.by], posted:"posted in " + g.where + " by " + g.by, order:o.id }
          : { id, name:"(linked in a team message)", link:"https://drive.google.com/file/d/" + id + "/view", via:g.via || "", why:["posted in " + g.where + " by " + g.by], posted:"posted in " + g.where + " by " + g.by, order:o.id }); } } }
  return [...out.values()];
}
export async function docPeek(c){
  // First words of the file, so the AI can tell which order it belongs to
  if(!c.via) return "";
  const D = "https://www.googleapis.com/drive/v3/files/" + c.id;
  try{
    const tok = await (await import("./google.mjs")).accessTokenAs(c.via);
    if(/spreadsheet$/.test(c.mime || "")){ const t = await sheetText(c.id, tok); if(t) return maskCreds(t.replace(/\s+/g, " "), true).slice(0, 1500); }
    const url = /document$|presentation$/.test(c.mime || "") ? D + "/export?mimeType=text/plain" : /spreadsheet$/.test(c.mime || "") ? D + "/export?mimeType=text/csv" : /^text\/|csv/.test(c.mime || "") ? D + "?alt=media" : "";
    if(!url) return ""; const r = await fetch(url, { headers:{ authorization:"Bearer " + tok } }); if(!r.ok) return "";
    return maskCreds((await r.text()).replace(/\s+/g, " "), true).slice(0, 1500);
  }catch(e){ return ""; }
}
export function docPrompt(orders, cands){
  const system = `You sort documents from an SEO, web and ads agency's Google Drive into the client orders they belong to. File names are often wrong or vague, so judge mainly by the content and the client's site, brand and the work described.
For each file, pick the order it belongs to or none (internal, personal or unrelated files get none). confidence is 0 to 1: 0.85 or more only when the content clearly names the client's site, brand or exact work. kind is what the file is for the order.
Answer with one JSON object only: {"files":[{"id":"","order":"order id or empty","confidence":0,"kind":"report | audit | proof | requirements | content | data | recording | other","why":"short reason"}]}`;
  const user = `ORDERS:\n${orders.map(o => `${o.id}: client ${o.client.name}, site ${o.client.website}, work: ${((o.ai && o.ai.summary) || "").slice(0, 200)} Deliverables: ${(o.deliverables || []).map(d => d.text).join("; ").slice(0, 300)}`).join("\n")}
\nFILES:\n${cands.map(c => `${c.id} | name: ${c.name} | type: ${c.mime || ""} | owner: ${c.owner || ""} | changed ${c.modified || ""} by ${c.by || ""} | found: ${c.why.join(", ")} | starts: ${c.peek || "(no text)"}`).join("\n")}`;
  return { system, user };
}

/* Versions: copies of the same document are grouped (dates, "copy of", (1) and version words ignored; http and https stay apart, as they are different Search Console properties); the newest is the one we read. */
export const docGroup = d => (d.kind || "other") + ":" + String(d.name || "").toLowerCase()
  .replace(/^copy of\s+/, "").replace(/(https?):\/\/(www\.)?/g, "$1 ").replace(/\(\d+\)/g, "").replace(/\d{4}[-_.]\d{1,2}[-_.]\d{1,2}|\d{1,2}[-_.]\d{1,2}[-_.]\d{2,4}/g, "")
  .replace(/\b(v|ver|version|final|draft|new|latest|updated)\s*\d*\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export async function docText(d, max){
  if(!d.via) return "";
  const tok = await (await import("./google.mjs")).accessTokenAs(d.via), D = "https://www.googleapis.com/drive/v3/files/" + d.id;
  if(/spreadsheet$/.test(d.mime || "")){ const t = await sheetText(d.id, tok); if(t) return maskCreds(t, true).slice(0, max || 20000); }
  const url = /document$|presentation$/.test(d.mime || "") ? D + "/export?mimeType=text/plain" : /spreadsheet$/.test(d.mime || "") ? D + "/export?mimeType=text/csv" : /^text\/|csv/.test(d.mime || "") ? D + "?alt=media" : "";
  if(!url) return ""; const r = await fetch(url, { headers:{ authorization:"Bearer " + tok } }); return r.ok ? maskCreds(await r.text(), true).slice(0, max || 20000) : "";
}
/* The two newest saved versions of one Google Doc, as text */
export async function revisionTexts(d){
  if(!d.via || !/document$/.test(d.mime || "")) return null;
  const tok = await (await import("./google.mjs")).accessTokenAs(d.via), D = "https://www.googleapis.com/drive/v3/files/" + d.id;
  const l = await fetch(D + "/revisions?pageSize=200&fields=revisions(id,modifiedTime,lastModifyingUser(displayName),exportLinks)", { headers:{ authorization:"Bearer " + tok } }).then(r => r.json()).catch(() => ({}));
  const rv = (l.revisions || []).filter(x => x.exportLinks && x.exportLinks["text/plain"]); if(rv.length < 2) return null;
  const [a, b] = rv.slice(-2), get = u => fetch(u, { headers:{ authorization:"Bearer " + tok } }).then(r => r.ok ? r.text() : "").then(t => maskCreds(t, true));
  return { before:{ at:a.modifiedTime, by:(a.lastModifyingUser || {}).displayName || "", text:(await get(a.exportLinks["text/plain"])).slice(0, 20000) },
    after:{ at:b.modifiedTime, by:(b.lastModifyingUser || {}).displayName || "", text:(await get(b.exportLinks["text/plain"])).slice(0, 20000) }, count:(l.revisions || []).length };
}
export function diffPrompt(o, name, before, after){
  const system = `You compare two versions of one document from an SEO, web and ads agency's work for a client. Say plainly what changed from the older to the newer version: sections added or removed, statements changed, and every number that changed (before and after). First decide if these really are two versions of ONE document, or two DIFFERENT documents that only share a name (common with tool exports: Search Console names every issue drilldown the same way, so two different issue reasons or properties look alike; a whole series at a different scale with the same dates usually means a different report, not an edit). Then judge if the newer one is the one to use, and flag anything suspicious (numbers improved without a reason, client name or site changed, content copied from another client). No dashes.
Answer with one JSON object only: {"summary":"one or two lines","changes":["each change"],"numbers":[{"what":"","before":"","after":""}],"sameDoc":true,"whatEach":"only when sameDoc is false: what each file most likely is, in one line","useNewer":true,"flags":["anything suspicious, empty if none"]}`;
  const user = `Order ${o.id}, client site ${o.client.website}. Document: ${name}
OLDER VERSION (${before.at}${before.by ? ", " + before.by : ""}):
${before.text}

NEWER VERSION (${after.at}${after.by ? ", " + after.by : ""}):
${after.text}`;
  return { system, user };
}

/* New work found by the team accounts: every new email, group chat message and Drive file since the last sweep, with the client sites it names.
   Used to open draft orders for sites that have no order yet. */
const TLD = "com|net|org|io|co|us|uk|ca|au|in|de|biz|info|store|shop|app|ai|me|nz|ie|online|site|tech|agency|law|dental|clinic|realty|homes|health|care|studio|media|design|solutions|services|group|pro|club|life|today|world|space|website";
const NOISE = /(^|\.)(google|googleapis|googleusercontent|gstatic|gmail|youtube|youtu|indiit|businesssanta|seoseason|manuvishranti|fiverr|facebook|fb|instagram|linkedin|twitter|x|bing|microsoft|outlook|office|live|apple|icloud|w3|schema|gravatar|wordpress|wp|cloudflare|godaddy|zoom|calendly|whatsapp|t|bit|goo|tinyurl|example|amazonaws|amazon|vercel|github|slack|notion|canva|semrush|ahrefs|moz|yoast|hubspot|mailchimp|sendgrid|paypal|stripe|yahoo|hotmail|w3schools|wikipedia|pinterest|tiktok|reddit|medium|shopify|wix|squarespace|elementor|hostinger|bluehost|namecheap|ubersuggest|similarweb|gtmetrix|pagespeed|web)\.[a-z.]+$/i;
export const sitesIn = t => [...new Set((String(t || "").match(new RegExp("\\b(?:https?:\\/\\/)?(?:www\\.)?[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:" + TLD + ")(?:\\.[a-z]{2})?\\b", "gi")) || [])
  .map(x => host(x.replace(/^.*@/, ""))).filter(h => h && h.includes(".") && !NOISE.test(h)))].slice(0, 8);
const nameOnly = s => String(s || "").replace(/<[^>]*>/g, "").replace(/"/g, "").trim();
export async function sweepSignals(since){
  const accs = (await accounts()).filter(a => !a.primary && (a.gmail || a.chat || a.drive)), items = [], errors = {}, after = Math.floor(Date.parse(since) / 1000);
  for(const a of accs){
    if(a.gmail) try{ const l = await apiAs(a.email, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q=" + encodeURIComponent("after:" + after + " -category:promotions -category:social -category:forums"));
      for(const m of (l.messages || []).slice(0, 30)){ const g = await apiAs(a.email, "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + m.id + "?format=full");
        const hd = n => ((g.payload.headers || []).find(h => h.name.toLowerCase() === n) || {}).value || "", text = maskCreds(clean(bodyOf(g.payload)) || g.snippet || "").slice(0, 1500);
        items.push({ key:"m:" + m.id, kind:"email", via:a.email, from:nameOnly(hd("from")), subject:hd("subject"), at:new Date(Number(g.internalDate)).toISOString(), text, sites:sitesIn(hd("subject") + " " + text + " " + hd("from") + " " + hd("to") + " " + hd("cc")) }); } }catch(e){ errors.gmail = e.message; }
    if(a.chat) try{ const sp = await apiAs(a.email, "https://chat.googleapis.com/v1/spaces?pageSize=100");
      for(const s of (sp.spaces || []).slice(0, 25)){ const ms = await apiAs(a.email, "https://chat.googleapis.com/v1/" + s.name + "/messages?pageSize=30&orderBy=createTime%20desc&filter=" + encodeURIComponent('createTime > "' + since + '"')).catch(() => ({}));
        for(const m of (ms.messages || []).reverse()){ const text = maskCreds(String(m.text || m.formattedText || "")).slice(0, 1500);
          items.push({ key:"c:" + m.name, kind:"group chat", via:a.email, space:s.displayName || "Direct chat", from:(m.sender && m.sender.displayName) || "", at:m.createTime, text, sites:sitesIn((s.displayName || "") + " " + text) }); } } }catch(e){ errors.chat = e.message; }
    if(a.drive) try{ const r = await apiAs(a.email, "https://www.googleapis.com/drive/v3/files?pageSize=30&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,modifiedTime,webViewLink,lastModifyingUser(displayName))&q=" + encodeURIComponent("trashed=false and mimeType != 'application/vnd.google-apps.folder' and modifiedTime > '" + since + "' and (sharedWithMe or 'me' in owners)"));
      for(const f of r.files || []){ const peek = await docPeek({ id:f.id, mime:f.mimeType, via:a.email });
        items.push({ key:"f:" + f.id + ":" + f.modifiedTime, kind:"Drive file", via:a.email, name:f.name, link:f.webViewLink, from:f.lastModifyingUser ? f.lastModifyingUser.displayName : "", at:f.modifiedTime, text:peek, sites:sitesIn(f.name + " " + peek) }); } }catch(e){ errors.drive = e.message; }
  }
  return { items, errors };
}
export function signalsPrompt(items, known){
  const system = `You sort new emails, group chat messages and Drive files seen by the team account of an SEO, web and ads agency. For each item decide if it is client work, and which client website it is about. Client work includes: a client's site or Search Console or Analytics access being shared (for example "you have been added as an owner" for a site), a project chat or email about a client's site, a report or audit for a client site. Not client work: newsletters, tool notices about our own sites, internal admin, spam. Use only sites that appear in the item. A known site means we already have an order for it. "source" is "person" when a person wrote or edited it (a colleague, the client, a forwarded order), or "tool" for automatic notices (Search Console, Analytics, Semrush, Bing, any report or alert email). A tool notice only proves we have access to a site, which old clients leave behind too, so it is never a new order. "newOrder" is true only when a person's item shows new or running work for a site that has no open order: a new order or gig forwarded, access being shared or asked for it, the team working on its files, the client asking to start or resume. "strength": "strong" for a forwarded new order or gig, "likely" for access being set up or work going on, "possible" for a client asking to start or resume. No dashes.
Answer with one JSON object only: {"items":[{"i":0,"work":"client work | internal | noise","site":"domain or empty","client":"client or business name if stated, else empty","country":"if stated","what":"one plain line: what this item shows","source":"person | tool","newOrder":false,"strength":"strong | likely | possible","why":"one line: why this is or is not a running order"}]}`;
  const user = "Sites with an order already: " + (known.join(", ") || "none") + "\n\nITEMS:\n" + items.map((x, i) => `[${i}] ${x.kind}${x.space ? " in " + x.space : ""}${x.name ? " named " + x.name : ""}${x.subject ? " subject: " + x.subject : ""} from ${x.from || "?"} on ${String(x.at).slice(0, 10)}. Sites named: ${x.sites.join(", ")}\n${String(x.text || "").slice(0, 700)}`).join("\n\n");
  return { system, user };
}

/* Everything the team accounts hold about one client site, for clients who reach the order desk on their second or later order */
export async function siteHistory(site){
  const h = host(site), root = h.split(".")[0], out = { mails:[], files:[], chat:[] }, accs = await accounts();
  for(const a of accs){
    if(a.gmail) try{ const l = await apiAs(a.email, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=40&q=" + encodeURIComponent('"' + h + '"' + (root.length >= 5 ? ' OR "' + root + '"' : "")));
      for(const m of (l.messages || []).slice(0, 30)){ const g = await apiAs(a.email, "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + m.id + "?format=full");
        const hd = n => ((g.payload.headers || []).find(x => x.name.toLowerCase() === n) || {}).value || "";
        out.mails.push({ at:new Date(Number(g.internalDate)).toISOString(), from:nameOnly(hd("from")), subject:hd("subject"), text:maskCreds(clean(bodyOf(g.payload)) || g.snippet || "").slice(0, 700) }); } }catch(e){}
    if(a.drive) try{ const r = await apiAs(a.email, "https://www.googleapis.com/drive/v3/files?pageSize=40&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,createdTime,modifiedTime,webViewLink,lastModifyingUser(displayName))&q=" + encodeURIComponent("trashed=false and (fullText contains '" + h + "'" + (root.length >= 5 ? " or name contains '" + root + "'" : "") + ")"));
      for(const [i, f] of (r.files || []).entries()) out.files.push({ id:f.id, name:f.name, link:f.webViewLink, created:f.createdTime, modified:f.modifiedTime, by:f.lastModifyingUser ? f.lastModifyingUser.displayName : "", peek:i < 10 ? (await docPeek({ id:f.id, mime:f.mimeType, via:a.email })).slice(0, 500) : "" }); }catch(e){}
    if(a.chat) try{ const sp = await apiAs(a.email, "https://chat.googleapis.com/v1/spaces?pageSize=100");
      for(const s of (sp.spaces || []).filter(s => hits(s.displayName, { id:"\u0000", h, root:root.length >= 4 ? root : "" })).slice(0, 3)){
        const ms = await apiAs(a.email, "https://chat.googleapis.com/v1/" + s.name + "/messages?pageSize=100&orderBy=createTime%20desc").catch(() => ({}));
        for(const m of (ms.messages || []).reverse()) out.chat.push({ at:m.createTime, space:s.displayName, by:(m.sender && m.sender.displayName) || "", text:maskCreds(String(m.text || "")).slice(0, 400) }); } }catch(e){}
  }
  const seen = new Set(); out.files = out.files.filter(f => !seen.has(f.id) && seen.add(f.id));
  return out;
}
export function historyPrompt(site, h, known){
  const system = `You rebuild the history of the work an SEO, web and ads agency has done for one client website, from the team's emails, group chats and Drive files. The agency may be starting to use its order desk from this client's second or later order, so find the past orders and work already done, what is still open, and what the next order should keep in mind. Only state what the material shows; say "unclear" when it is. Never include email addresses, phone numbers, passwords or prices. No dashes.
Answer with one JSON object only: {"summary":"two or three lines","since":"YYYY-MM when work with this client started, or empty","pastOrders":[{"when":"YYYY-MM","what":"","status":"delivered | ongoing | unclear","evidence":["email subject, chat or file name that shows it"]}],"workDone":["each piece of work done, with month"],"openItems":["promised or started but not finished"],"forNextOrder":["what the team must keep in mind, and good next work to offer"],"files":["names of the most useful files"]}`;
  const user = `Client site: ${site}
Orders already on the order desk: ${known.join(", ") || "none"}
EMAILS (${h.mails.length}):
${h.mails.map(m => `${m.at.slice(0, 10)} from ${m.from}: ${m.subject}\n${m.text}`).join("\n---\n")}
DRIVE FILES (${h.files.length}):
${h.files.map(f => `${String(f.created || "").slice(0, 10)} to ${String(f.modified || "").slice(0, 10)} ${f.name}${f.by ? " (last by " + f.by + ")" : ""}${f.peek ? "\n" + f.peek : ""}`).join("\n---\n")}
GROUP CHAT (${h.chat.length}):
${h.chat.map(m => `${String(m.at).slice(0, 10)} ${m.space} ${m.by}: ${m.text}`).join("\n")}`.slice(0, 120000);
  return { system, user };
}

/* Post in a Google Chat space as the connected account (a reply goes into the given thread) */
export async function postChat(email, space, text, thread){
  const tok = await (await import("./google.mjs")).accessTokenAs(email);
  const r = await fetch("https://chat.googleapis.com/v1/" + space + "/messages" + (thread ? "?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD" : ""), { method:"POST", headers:{ authorization:"Bearer " + tok, "content-type":"application/json" }, body:JSON.stringify(Object.assign({ text:String(text).slice(0, 4000) }, thread ? { thread:{ name:thread } } : {})) });
  const j = await r.json().catch(() => ({})); if(!r.ok) throw new Error("Google Chat " + r.status + ": " + ((j.error || {}).message || "").slice(0, 160)); return j;
}
export async function chatSince(email, space, since){
  const r = await apiAs(email, "https://chat.googleapis.com/v1/" + space + "/messages?pageSize=50&orderBy=createTime%20asc&filter=" + encodeURIComponent('createTime > "' + since + '"'));
  return (r.messages || []).map(m => ({ id:m.name, at:m.createTime, by:(m.sender && m.sender.displayName) || "", sender:m.sender ? m.sender.name : "", thread:m.thread ? m.thread.name : "", text:maskCreds(String(m.text || "")).slice(0, 2000) }));
}

/* Spaces the posting account is in, and messages since a time in each (for @mentions) */
export async function mySpaces(email){ const r = await apiAs(email, "https://chat.googleapis.com/v1/spaces?pageSize=100"); return (r.spaces || []).map(x => ({ id:x.name, name:x.displayName || "Direct chat", type:x.spaceType || x.type || "" })); }
