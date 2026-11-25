/* Google Drive proof reader for the order desk. The team keeps proof in their own Drive and shares it with the portal's
   Google account (the access email). With read-only access the order desk reads the file itself (Docs, Sheets, Slides,
   Word, Excel, PowerPoint, PDF, images), its version history and its activity (created, edited, renamed, moved, shared,
   commented). Recordings: name, length and history only; a person must watch them. Nothing in Drive is ever changed. */
import { api, accessToken } from "./google.mjs";
import { officeText } from "./orderai.mjs";

const D = "https://www.googleapis.com/drive/v3/files/";
const FIELDS = "id,name,mimeType,size,createdTime,modifiedTime,webViewLink,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress),videoMediaMetadata(durationMillis),imageMediaMetadata(width,height),trashed";
export const isDrive = u => /(?:drive|docs)\.google\.com/i.test(String(u || ""));
export function driveId(u){
  const s = String(u || "");
  const m = s.match(/\/(?:file|document|spreadsheets|presentation|forms|drawings)\/d\/([A-Za-z0-9_-]{15,})/) || s.match(/\/folders\/([A-Za-z0-9_-]{15,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{15,})/);
  return m ? m[1] : "";
}
async function raw(url, max){
  // Binary download with the same Google sign-in; gives up above max bytes
  const t = await accessToken();
  const r = await fetch(url, { headers:{ authorization:"Bearer " + t } });
  if(!r.ok) throw new Error("Google answered " + r.status);
  const len = Number(r.headers.get("content-length") || 0); if(len && len > max) return null;
  const b = Buffer.from(await r.arrayBuffer()); return b.length > max ? null : b;
}
const KIND = m => /folder$/.test(m) ? "Folder" : /document$/.test(m) ? "Google Doc" : /spreadsheet$/.test(m) ? "Google Sheet" : /presentation$/.test(m) ? "Google Slides"
  : /pdf$/.test(m) ? "PDF" : /^image\//.test(m) ? "Image" : /^video\//.test(m) ? "Recording" : /wordprocessingml/.test(m) ? "Word file" : /spreadsheetml/.test(m) ? "Excel file"
  : /presentationml/.test(m) ? "PowerPoint file" : /^text\/|csv/.test(m) ? "Text file" : "File";

/* Quick look when a link is added: does it open with our access, what is it, who made it, when was it last changed */
export async function driveMeta(url){
  const id = driveId(url); if(!id) return { ok:false, error:"This does not look like a Google Drive link" };
  try{
    const f = await api(D + id + "?supportsAllDrives=true&fields=" + encodeURIComponent(FIELDS));
    const meta = { ok:!f.trashed, id, name:f.name, mime:f.mimeType, kind:KIND(f.mimeType), size:Number(f.size || 0), created:f.createdTime, modified:f.modifiedTime,
      owner:(f.owners || [])[0] ? f.owners[0].displayName || f.owners[0].emailAddress : "", lastBy:f.lastModifyingUser ? f.lastModifyingUser.displayName || f.lastModifyingUser.emailAddress : "",
      duration:f.videoMediaMetadata ? Math.round(Number(f.videoMediaMetadata.durationMillis || 0) / 1000) : 0, link:f.webViewLink };
    if(f.trashed) meta.error = "This file is in the Drive trash";
    if(meta.kind === "Folder"){
      const l = await api(D + "?supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=60&q=" + encodeURIComponent("'" + id + "' in parents and trashed=false") + "&fields=" + encodeURIComponent("files(" + FIELDS + ")"));
      meta.files = (l.files || []).map(x => ({ id:x.id, name:x.name, kind:KIND(x.mimeType), mime:x.mimeType, modified:x.modifiedTime, lastBy:x.lastModifyingUser ? x.lastModifyingUser.displayName : "", size:Number(x.size || 0) }));
    }
    meta.history = await driveHistory(id).catch(e => ({ error:e.message }));
    return meta;
  }catch(e){
    if(e.status === 404 || e.status === 403) return { ok:false, id, error:"The order desk cannot open this. In Drive, share it with the access email as Viewer (or put it in the order folder that is shared)." };
    if(/insufficient|scope/i.test(e.message)) return { ok:false, id, error:"Drive reading is not switched on yet. Manav must reconnect Google once in the admin console." };
    return { ok:false, id, error:e.message };
  }
}

/* Versions and activity: every save with who and when, plus created, renamed, moved, shared, commented */
export async function driveHistory(id){
  const out = { versions:[], activity:[] };
  try{
    const r = await api(D + id + "/revisions?pageSize=200&fields=" + encodeURIComponent("revisions(id,modifiedTime,lastModifyingUser(displayName,emailAddress))"));
    out.versions = (r.revisions || []).map(v => ({ at:v.modifiedTime, by:v.lastModifyingUser ? v.lastModifyingUser.displayName || v.lastModifyingUser.emailAddress : "" }));
  }catch(e){ out.versionsError = e.message; }
  try{
    const a = await api("https://driveactivity.googleapis.com/v2/activity:query", { itemName:"items/" + id, pageSize:100 });
    out.activity = (a.activities || []).map(x => {
      const p = x.primaryActionDetail || {}, k = Object.keys(p)[0] || "change";
      const what = { create:"Created", edit:"Edited", move:"Moved", rename:"Renamed" + (p.rename ? " to " + p.rename.newTitle : ""), delete:"Deleted", restore:"Restored",
        permissionChange:"Sharing changed", comment:"Comment", dlpChange:"Policy change", reference:"Linked", settingsChange:"Settings changed" }[k] || k;
      const who = ((x.actors || [])[0] || {}).user, name = who && who.knownUser ? (who.knownUser.isCurrentUser ? "Order desk account" : "Team member") : who && who.deletedUser ? "Deleted user" : "Someone";
      return { at:x.timestamp || (x.timeRange || {}).endTime, what, by:name };
    });
  }catch(e){ out.activityError = e.message; }
  return out;
}

/* Full read for the AI check. Returns items in the same shape the proof check uses. */
export async function driveRead(meta){
  const items = [], files = meta.kind === "Folder" ? (meta.files || []).slice(0, 12) : [meta];
  for(const f of files){
    const it = { kind:"file", name:f.name, type:f.mime, size:f.size, drive:true };
    try{
      if(f.mime === "application/vnd.google-apps.document" || f.mime === "application/vnd.google-apps.presentation"){
        const b = await raw(D + f.id + "/export?mimeType=text/plain", 4e6); it.text = b ? b.toString("utf8").slice(0, 40000) : ""; }
      else if(f.mime === "application/vnd.google-apps.spreadsheet"){
        const b = await raw(D + f.id + "/export?mimeType=" + encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), 8e6); it.text = b ? officeText(b, "x.xlsx") : ""; }
      else if(/^image\/(png|jpeg|gif|webp)$/.test(f.mime)){ const b = await raw(D + f.id + "?alt=media&supportsAllDrives=true", 4.5e6); if(b){ it.image = true; it.b64 = b.toString("base64"); } else it.note = "Image too large to read; a person must look at it."; }
      else if(f.mime === "application/pdf"){ const b = await raw(D + f.id + "?alt=media&supportsAllDrives=true", 10e6); if(b){ it.pdf = true; it.b64 = b.toString("base64"); } else it.note = "PDF too large to read; a person must check it."; }
      else if(/officedocument|^text\/|csv/.test(f.mime)){ const b = await raw(D + f.id + "?alt=media&supportsAllDrives=true", 15e6); it.text = b ? officeText(b, f.name) : ""; if(!it.text) it.note = "Could not read the text of this file."; }
      else if(/^video\//.test(f.mime)) it.note = "Recording" + (meta.duration ? " of " + Math.round(meta.duration / 60) + " min" : "") + ". You cannot watch it; a person must.";
      else it.note = "File type the order desk cannot read; a person must check it.";
    }catch(e){ it.note = "Could not read: " + e.message; }
    items.push(it);
  }
  return items;
}
