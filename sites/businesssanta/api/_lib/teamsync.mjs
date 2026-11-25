/* Follows the team's own work for each order, read-only, through the connected team accounts (e.g. seo@indiit.com):
   the project's Drive folder, emails the account is copied on, and Google Chat spaces it is a member of.
   Orders are matched by order number (O-1001) or the client's site (pwmania.com / pwmania). */
import { apiAs, accounts } from "./google.mjs";

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

export async function syncOrder(o){
  const k = keysOf(o), out = { at:new Date().toISOString(), folder:o.folder || null, files:[], mails:[], chat:[], errors:{} }, since = o.syncAt || o.at;
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
          out.mails.push({ id:m.id, via:a.email, from:hd("from"), to:hd("to"), cc:hd("cc"), subject:hd("subject"), date:new Date(Number(g.internalDate)).toISOString(), text:clean(bodyOf(g.payload)) || g.snippet || "",
            files:(function walk(p, acc){ (p.parts || []).forEach(x => { if(x.filename) acc.push(x.filename); walk(x, acc); }); return acc; })(g.payload, []).slice(0, 10) });
        } }catch(e){ out.errors.gmail = e.message; }
    }
    // Google Chat: spaces named after the order or site that this account is in
    if(a.chat){
      try{ const sp = await apiAs(a.email, "https://chat.googleapis.com/v1/spaces?pageSize=100");
        for(const s of (sp.spaces || []).filter(s => hits(s.displayName, k)).slice(0, 3)){
          const ms = await apiAs(a.email, "https://chat.googleapis.com/v1/" + s.name + "/messages?pageSize=50&orderBy=createTime%20desc&filter=" + encodeURIComponent('createTime > "' + since + '"'));
          for(const m of (ms.messages || []).reverse()) if(!(o.teamChat || []).some(x => x.id === m.name))
            out.chat.push({ id:m.name, space:s.displayName, via:a.email, by:(m.sender && (m.sender.displayName || m.sender.name)) || "", at:m.createTime, text:String(m.text || m.formattedText || "").slice(0, 3000), files:(m.attachment || []).map(x => x.contentName).filter(Boolean) });
        } }catch(e){ out.errors.chat = e.message; }
    }
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
  for(const o of orders) for(const t of [].concat((o.mails || []).map(m => m.text), (o.teamChat || []).map(m => m.text))){
    for(const m of String(t || "").matchAll(/https?:\/\/(?:drive|docs)\.google\.com\/[^\s)>"]+/g)){ const id = (m[0].match(/\/d\/([\w-]{15,})|[?&]id=([\w-]{15,})/) || []).slice(1).find(Boolean); if(id && !out.has(id)) out.set(id, { id, name:"(linked in a team message)", link:m[0], via:"", why:["linked in " + o.id] }); } }
  return [...out.values()];
}
export async function docPeek(c){
  // First words of the file, so the AI can tell which order it belongs to
  if(!c.via) return "";
  const D = "https://www.googleapis.com/drive/v3/files/" + c.id;
  try{
    const tok = await (await import("./google.mjs")).accessTokenAs(c.via);
    const url = /document$|presentation$/.test(c.mime || "") ? D + "/export?mimeType=text/plain" : /spreadsheet$/.test(c.mime || "") ? D + "/export?mimeType=text/csv" : /^text\/|csv/.test(c.mime || "") ? D + "?alt=media" : "";
    if(!url) return ""; const r = await fetch(url, { headers:{ authorization:"Bearer " + tok } }); if(!r.ok) return "";
    return (await r.text()).replace(/\s+/g, " ").slice(0, 1500);
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
  const url = /document$|presentation$/.test(d.mime || "") ? D + "/export?mimeType=text/plain" : /spreadsheet$/.test(d.mime || "") ? D + "/export?mimeType=text/csv" : /^text\/|csv/.test(d.mime || "") ? D + "?alt=media" : "";
  if(!url) return ""; const r = await fetch(url, { headers:{ authorization:"Bearer " + tok } }); return r.ok ? (await r.text()).slice(0, max || 20000) : "";
}
/* The two newest saved versions of one Google Doc, as text */
export async function revisionTexts(d){
  if(!d.via || !/document$/.test(d.mime || "")) return null;
  const tok = await (await import("./google.mjs")).accessTokenAs(d.via), D = "https://www.googleapis.com/drive/v3/files/" + d.id;
  const l = await fetch(D + "/revisions?pageSize=200&fields=revisions(id,modifiedTime,lastModifyingUser(displayName),exportLinks)", { headers:{ authorization:"Bearer " + tok } }).then(r => r.json()).catch(() => ({}));
  const rv = (l.revisions || []).filter(x => x.exportLinks && x.exportLinks["text/plain"]); if(rv.length < 2) return null;
  const [a, b] = rv.slice(-2), get = u => fetch(u, { headers:{ authorization:"Bearer " + tok } }).then(r => r.ok ? r.text() : "");
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
