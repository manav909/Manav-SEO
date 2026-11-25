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
