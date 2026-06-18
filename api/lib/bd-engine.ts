/* ════════════════════════════════════════════════════════════════
   api/lib/bd-engine.ts

   BUILD 12.39 — Deal workspace backend.

   Manages inbound client deals: each deal holds the running conversation,
   brief, status, notes, reminders, and the latest conversion strategy.
   Actions (dispatched via task-engine on the bd_ prefix):
     bd_deal_save       create or update a deal (conversation/status/notes/...)
     bd_deal_list       list deals, filter by status, search by text
     bd_deal_get        fetch one deal
     bd_strategize      run the strategist on a deal and store the result
     bd_deal_delete     remove a deal

   Storage: bd_deals (migration run in Supabase first).
   Multi-tenant: project_id optional; deals are the unit of work.
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { computeActivity, digestOf, vaultAsk, vaultReport, vaultGaps, vaultTrain, engagementSummary, VaultDigest } from "./vault-engine.js";

const STATUSES = ["lead", "qualifying", "proposal", "negotiating", "demo_requested", "closing", "hired", "in_delivery", "repeat", "stalled", "lost", "archived"];

async function dealContext(id: string, conversation: string): Promise<{ conversation: string; facts: string; attachments: string; strategySummary: string; callScript: string; operatorContext: string }> {
  let facts = ""; let attachments = ""; let strategySummary = ""; let callScript = ""; let operatorContext = "";
  if (id) {
    try {
      const { data } = await db().from("bd_deals").select("conversation, strategy, attachments, notes").eq("id", id).single();
      const d = data as any;
      if (d) {
        conversation = conversation || d.conversation || "";
        operatorContext = String(d.notes || "");
        facts = JSON.stringify(d.strategy?.deal_facts || {});
        strategySummary = String(d.strategy?.deal_state?.summary || "");
        const cs = d.strategy?.call_script;
        if (cs && cs.needed) {
          const parts: string[] = [];
          if (cs.opening) parts.push(`Opening: ${cs.opening}`);
          if (Array.isArray(cs.discovery_questions) && cs.discovery_questions.length) parts.push(`Discovery questions: ${cs.discovery_questions.join("; ")}`);
          if (Array.isArray(cs.value_points) && cs.value_points.length) parts.push(`Value points: ${cs.value_points.join("; ")}`);
          if (Array.isArray(cs.objection_handling) && cs.objection_handling.length) parts.push(`Objection handling: ${cs.objection_handling.join("; ")}`);
          if (cs.close) parts.push(`Close: ${cs.close}`);
          callScript = parts.join("\n");
        }
        if (Array.isArray(d.attachments)) attachments = d.attachments.map((a: any) => `[${a.kind}: ${a.name}]\n${String(a.text || "").slice(0, 5000)}`).join("\n\n");
      }
    } catch { /* ignore */ }
  }
  noteCall(id);
  return { conversation, facts, attachments, strategySummary, callScript, operatorContext };
}

// Lead priority from the client's country + your editable deprioritised-regions list, grounded in your real conversion from the same region.
async function leadPriorityFor(country: string): Promise<{ priority: string; reason: string }> {
  const cl = String(country || "").trim().toLowerCase();
  if (!cl) return { priority: "", reason: "" };
  let deprio = ["bangladesh", "pakistan", "india"]; // default; editable via bd_settings key 'lead_priority'
  try {
    const { data } = await db().from("bd_settings").select("value").eq("key", "lead_priority").single();
    const v: any = (data as any)?.value;
    if (v && Array.isArray(v.deprioritized) && v.deprioritized.length) deprio = v.deprioritized.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean);
  } catch { /* table may not exist yet — use default */ }
  const matched = deprio.find((rg) => rg && cl.includes(rg));
  const region = matched || cl;
  let won = 0, total = 0;
  try {
    const { data } = await db().from("bd_deals").select("country, status, outcome");
    for (const d of (Array.isArray(data) ? data : [])) {
      const c = String((d as any).country || "").trim().toLowerCase();
      if (!c || !c.includes(region)) continue;
      total++;
      const st = String((d as any).status || "").toLowerCase(); const oc = String((d as any).outcome || "").toLowerCase();
      if (st === "hired" || st === "repeat" || st === "in_delivery" || oc === "won" || oc === "hired") won++;
    }
  } catch { /* ignore */ }
  const label = (matched || country).replace(/\b\w/g, (m) => m.toUpperCase());
  const convNote = total >= 2 ? ` You have won ${won} of ${total} leads from ${label}.` : "";
  if (matched) return { priority: "low", reason: `Deprioritised region (your setting).${convNote}` };
  if (total >= 3 && won / total >= 0.4) return { priority: "high", reason: `Strong region for you.${convNote}` };
  return { priority: "normal", reason: convNote.trim() };
}

// The seller's learned patterns (from bd_learn), injected into strategize + ask so advice tracks what works for THEM.
async function learningsContext(): Promise<string> {
  try {
    const { data } = await db().from("bd_settings").select("value").eq("key", "lead_learnings").single();
    const v: any = (data as any)?.value;
    if (v && Array.isArray(v.learnings) && v.learnings.length) return v.learnings.map((x: any) => `- ${String(x)}`).join("\n");
  } catch { /* none yet */ }
  return "";
}
function noteCall(id: string) { if (id) bumpApiCalls(id).catch(() => { }); }

async function bumpApiCalls(id: string, n = 1): Promise<void> {
  if (!id) return;
  try { const { data } = await db().from("bd_deals").select("api_calls").eq("id", id).single(); const cur = Number((data as any)?.api_calls || 0); await db().from("bd_deals").update({ api_calls: cur + n }).eq("id", id); } catch { /* non-fatal */ }
}
async function appendStage(id: string, stage: string): Promise<void> {
  if (!id || !stage) return;
  try {
    const { data } = await db().from("bd_deals").select("stage_history").eq("id", id).single();
    const hist = Array.isArray((data as any)?.stage_history) ? (data as any).stage_history : [];
    if (hist.length && hist[hist.length - 1]?.stage === stage) return;
    hist.push({ stage, at: new Date().toISOString() });
    await db().from("bd_deals").update({ stage_history: hist }).eq("id", id);
  } catch { /* non-fatal */ }
}
function aggBy(list: any[], key: string): Array<{ key: string; count: number; value: number }> {
  const m = new Map<string, { count: number; value: number }>();
  for (const d of list) { const k = (d[key] || "Unknown").toString().trim() || "Unknown"; const e = m.get(k) || { count: 0, value: 0 }; e.count++; e.value += Number(d.deal_value || 0); m.set(k, e); }
  return [...m.entries()].map(([k, v]) => ({ key: k, count: v.count, value: v.value })).sort((a, b) => b.count - a.count).slice(0, 12);
}

// Win rate by a dimension (country, client_type) across DECIDED deals only — the real "what converts" signal.
function winRateBy(list: any[], key: string): Array<{ key: string; won: number; total: number; rate: number }> {
  const m = new Map<string, { won: number; total: number }>();
  for (const d of list) {
    if (d.outcome !== "won" && d.outcome !== "lost") continue;
    const k = (d[key] || "Unknown").toString().trim() || "Unknown";
    const e = m.get(k) || { won: 0, total: 0 }; e.total++; if (d.outcome === "won") e.won++; m.set(k, e);
  }
  return [...m.entries()].map(([k, v]) => ({ key: k, won: v.won, total: v.total, rate: v.total ? Math.round((v.won / v.total) * 100) : 0 })).filter(x => x.total >= 1).sort((a, b) => b.total - a.total).slice(0, 10);
}

// Render one lead digest into a compact line the LLM can read (empties dropped).
function vaultDigestLine(dg: VaultDigest): string {
  const bits = [dg.name + (dg.handle ? ` (@${dg.handle})` : ""), dg.status, dg.temperature, dg.health, dg.country, dg.value ? `$${dg.value}` : "", dg.idleDays != null ? `idle ${dg.idleDays}d` : ""].filter(Boolean);
  let line = bits.join(" · ");
  if (dg.next_move) line += ` · next: ${dg.next_move}`;
  if (dg.timing) line += ` · timing: ${dg.timing}`;
  if (dg.summary) line += ` — ${dg.summary}`;
  return line;
}

// Load bd_deals for Vault WITH the engagement (timing) column when it exists, falling back
// gracefully when the column has not been migrated yet so the query never errors out.
async function vaultLoadDeals(extraCols: string): Promise<any[]> {
  const base = "id, client_name, client_handle, status, outcome, deal_value, country, industry, client_type, created_at, updated_at, last_message_at, strategy";
  const extra = extraCols ? ", " + extraCols : "";
  try {
    const r = await db().from("bd_deals").select(base + ", engagement" + extra).limit(2000);
    if (!r.error) return (r.data as any[]) || [];
  } catch { /* engagement column may not exist yet — fall through */ }
  const r2 = await db().from("bd_deals").select(base + extra).limit(2000);
  return (r2.data as any[]) || [];
}


async function persistDiag(id: string, kind: string, name: string, text: string): Promise<void> {
  if (!id) return;
  try {
    const { data } = await db().from("bd_deals").select("attachments").eq("id", id).single();
    const existing = Array.isArray((data as any)?.attachments) ? (data as any).attachments.filter((a: any) => a.kind !== kind) : [];
    await db().from("bd_deals").update({ attachments: [...existing, { name, kind, text, added_at: new Date().toISOString() }], updated_at: new Date().toISOString() }).eq("id", id);
  } catch { /* non-fatal */ }
}

function cleanHost(s: string): string {
  return String(s || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").replace(/[?#].*$/, "").replace(/\.$/, "").toLowerCase();
}

/* Clean, professional, print-ready document renderer for generated client docs. */
function renderDocHtml(doc: { title: string; subtitle: string; recipient: string; sections: Array<{ heading: string; body: string }>; footer: string }, brand: string, language: string): string {
  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  const rtl = /Arabic|Urdu/i.test(language);
  const body = (txt: string): string => {
    const lines = String(txt || "").split("\n"); let out = ""; let inList = false;
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) { if (inList) { out += "</ul>"; inList = false; } continue; }
      if (/^[-*•]\s+/.test(t)) { if (!inList) { out += "<ul>"; inList = true; } out += "<li>" + inline(t.replace(/^[-*•]\s+/, "")) + "</li>"; }
      else { if (inList) { out += "</ul>"; inList = false; } out += "<p>" + inline(t) + "</p>"; }
    }
    if (inList) out += "</ul>";
    return out;
  };
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const sections = (doc.sections || []).map(s => `<section>${s.heading ? `<h2>${esc(s.heading)}</h2>` : ""}${body(s.body)}</section>`).join("");
  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--ink:#1a1a2e;--muted:#5b5b78;--accent:#6366f1;--line:#e7e7f0;--bg:#ffffff}
*{box-sizing:border-box}
body{margin:0;background:#f4f4f8;color:var(--ink);font-family:Georgia,'Times New Roman',serif;line-height:1.7;font-size:15px}
.page{max-width:780px;margin:24px auto;background:var(--bg);padding:56px 64px;box-shadow:0 4px 24px rgba(20,20,50,.08);border-radius:4px}
.eyebrow{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700;margin:0 0 10px}
h1{font-size:30px;line-height:1.2;margin:0 0 8px;letter-spacing:-.01em}
.sub{font-size:16px;color:var(--muted);margin:0 0 20px;font-style:italic}
.meta{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;color:var(--muted);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:12px 0;margin:0 0 28px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
h2{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin:30px 0 10px;font-weight:700}
section:first-of-type h2{margin-top:0}
p{margin:0 0 12px}
ul{margin:0 0 14px;padding-${rtl ? "right" : "left"}:20px}
li{margin:0 0 7px}
strong{color:var(--ink);font-weight:700}
.footer{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:var(--muted);border-top:2px solid var(--accent);margin-top:34px;padding-top:16px;font-style:italic}
.brand{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-weight:700;color:var(--ink);font-style:normal}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;padding:0}}
</style></head>
<body><div class="page">
<div class="eyebrow">${esc(brand)} · SEO &amp; AEO</div>
<h1>${esc(doc.title)}</h1>
${doc.subtitle ? `<div class="sub">${esc(doc.subtitle)}</div>` : ""}
<div class="meta"><span>${doc.recipient ? "Prepared for " + esc(doc.recipient) : "Prepared by " + esc(brand)}</span><span>${today}</span></div>
${sections}
${doc.footer ? `<div class="footer">${inline(doc.footer)}<br><span class="brand">${esc(brand)}</span></div>` : `<div class="footer"><span class="brand">${esc(brand)}</span></div>`}
</div></body></html>`;
}

export async function handleBd(action: string, body: any): Promise<any> {
  if (action === "bd_deal_save") {
    const d = body || {};
    const row: any = {
      client_name: String(d.client_name || "Untitled lead").slice(0, 200),
      client_handle: d.client_handle ? String(d.client_handle).slice(0, 120) : null,
      platform: String(d.platform || "fiverr").slice(0, 40),
      brief: d.brief != null ? String(d.brief) : null,
      conversation: d.conversation != null ? String(d.conversation) : null,
      status: STATUSES.includes(d.status) ? d.status : "lead",
      notes: d.notes != null ? String(d.notes) : null,
      reminders: Array.isArray(d.reminders) ? d.reminders : [],
      tags: Array.isArray(d.tags) ? d.tags : [],
      project_id: d.projectId || d.project_id || null,
      last_message_at: d.conversation ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const upd: any = {}; for (const k of Object.keys(row)) { if (row[k] !== null && row[k] !== undefined) upd[k] = row[k]; } upd.updated_at = new Date().toISOString();
    try {
      let sid = d.id;
      if (!sid && row.client_handle) {
        const { data: ex } = await db().from("bd_deals").select("id").eq("client_handle", row.client_handle).eq("platform", row.platform).order("updated_at", { ascending: false }).limit(1);
        if (Array.isArray(ex) && ex.length) sid = ex[0].id; // an existing deal for this handle — update it instead of making a duplicate
      }
      if (sid) {
        const { data, error } = await db().from("bd_deals").update(upd).eq("id", sid).select().single();
        if (error) return { success: false, error: error.message };
        return { success: true, deal: data };
      }
      const insRes = await db().from("bd_deals").insert(row).select().single();
      if (insRes.error) {
        if (row.client_handle) {
          const { data: ex2 } = await db().from("bd_deals").select("id").eq("client_handle", row.client_handle).eq("platform", row.platform).order("updated_at", { ascending: false }).limit(1);
          if (Array.isArray(ex2) && ex2.length) { const u = await db().from("bd_deals").update(upd).eq("id", ex2[0].id).select().single(); if (!u.error) return { success: true, deal: u.data }; }
        }
        return { success: false, error: insRes.error.message };
      }
      return { success: true, deal: insRes.data };
    } catch (e: any) { return { success: false, error: e?.message || "save failed" }; }
  }

  if (action === "bd_deal_update") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    const upd: any = { updated_at: new Date().toISOString() };
    if (typeof body?.status === "string" && STATUSES.includes(body.status)) upd.status = body.status;
    if (Array.isArray(body?.tags)) upd.tags = body.tags.map((t: any) => String(t).slice(0, 40)).filter(Boolean).slice(0, 20);
    if (typeof body?.client_name === "string" && body.client_name.trim()) upd.client_name = body.client_name.slice(0, 200);
    if (typeof body?.conversation === "string" && body.conversation.trim()) { upd.conversation = body.conversation; upd.last_message_at = new Date().toISOString(); }
    if (body?.engagement && typeof body.engagement === "object") upd.engagement = body.engagement;
    if (typeof body?.client_site === "string" && body.client_site.trim()) upd.client_site = body.client_site.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").slice(0, 200);
    if (typeof body?.notes === "string") upd.notes = body.notes.slice(0, 8000);
    try {
      let { data, error } = await db().from("bd_deals").update(upd).eq("id", id).select().single();
      let degraded: string[] = [];
      if (error && /column|schema cache|does not exist/i.test(String(error.message || ""))) {
        // A newer optional column (engagement / client_site) is not in this database yet. Strip ONLY those
        // and keep everything else (notes, status, tags, conversation) so nothing is collaterally lost, and
        // report what was dropped so the loss is never silent. Run the bd_deals migration to stop this.
        const safe: any = { ...upd };
        if ("engagement" in safe) { delete safe.engagement; degraded.push("engagement"); }
        if ("client_site" in safe) { delete safe.client_site; degraded.push("client_site"); }
        ({ data, error } = await db().from("bd_deals").update(safe).eq("id", id).select().single());
      }
      if (error) return { success: false, error: error.message };
      if (upd.status) appendStage(id, upd.status);
      return { success: true, deal: data, ...(degraded.length ? { degraded } : {}) };
    } catch (e: any) { return { success: false, error: e?.message || "update failed" }; }
  }

  if (action === "bd_settings_get") {
    const key = String(body?.key || "").trim();
    if (!key) return { success: false, error: "key required." };
    try { const { data } = await db().from("bd_settings").select("value").eq("key", key).single(); return { success: true, value: (data as any)?.value ?? null }; }
    catch { return { success: true, value: null }; } // table may not exist yet
  }

  if (action === "bd_settings_set") {
    const key = String(body?.key || "").trim();
    if (!key) return { success: false, error: "key required." };
    try {
      const { error } = await db().from("bd_settings").upsert({ key, value: body?.value ?? null, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) { return { success: false, error: e?.message || "settings save failed" }; }
  }

  if (action === "bd_learn") {
    try {
      const { data } = await db().from("bd_deals").select("client_name, country, outcome, deal_value, status, conversation, strategy, attachments").order("updated_at", { ascending: false }).limit(60);
      const rows = (Array.isArray(data) ? data : []).filter((d: any) => String(d.conversation || "").length > 200);
      if (!rows.length) return { success: false, error: "No deals with enough conversation yet to learn from. Sync a few client chats first." };
      const deals = rows.slice(0, 25).map((d: any) => ({
        name: String(d.client_name || ""), country: String(d.country || ""), outcome: String(d.outcome || ""), value: String(d.deal_value || ""), status: String(d.status || ""),
        conversation: String(d.conversation || ""), facts: JSON.stringify(d.strategy?.deal_facts || {}),
        transcripts: Array.isArray(d.attachments) ? d.attachments.filter((a: any) => a.kind === "transcript" || a.kind === "call").map((a: any) => String(a.text || "")).join("\n").slice(0, 4000) : "",
      }));
      let existing: string[] = [];
      try { const { data: st } = await db().from("bd_settings").select("value").eq("key", "lead_learnings").single(); const v: any = (st as any)?.value; if (v && Array.isArray(v.learnings)) existing = v.learnings.map((x: any) => String(x)); } catch { /* none yet */ }
      const { learnFromDeals } = await import("./bd-strategist.js");
      const r = await learnFromDeals(deals, existing);
      if (!r.ok) return { success: false, error: r.error };
      try { await db().from("bd_settings").upsert({ key: "lead_learnings", value: { learnings: r.learnings, updated_at: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "key" }); }
      catch (e: any) { return { success: false, error: "Learned, but could not save (run the bd_settings migration): " + (e?.message || "") }; }
      return { success: true, learnings: r.learnings, analysed: deals.length };
    } catch (e: any) { return { success: false, error: e?.message || "learn failed" }; }
  }

  if (action === "bd_dedupe_deals") {
    try {
      let optCols = true;
      let res = await db().from("bd_deals").select("id, client_name, client_handle, platform, status, strategy, conversation, attachments, engagement, client_site, tags, updated_at, last_message_at, created_at");
      if (res.error && /column|schema cache|does not exist/i.test(String(res.error.message || ""))) {
        optCols = false; // engagement / client_site not in this database yet — dedupe still merges everything else
        res = await db().from("bd_deals").select("id, client_name, client_handle, platform, status, strategy, conversation, attachments, tags, updated_at, last_message_at, created_at");
      }
      const data = res.data;
      const rows = Array.isArray(data) ? data : [];
      const ORDER = ["lead", "qualifying", "proposal", "negotiating", "demo_requested", "closing", "hired", "in_delivery", "repeat"]; // active advancement; terminal (stalled/lost/archived) rank -1
      const rank = (s: any) => { const i = ORDER.indexOf(String(s || "").toLowerCase()); return i >= 0 ? i : -1; };
      const groups = new Map<string, any[]>();
      for (const r of rows) {
        const h = String(r.client_handle || "").trim().toLowerCase();
        const nm = String(r.client_name || "").trim().toLowerCase();
        const generic = !nm || nm === "untitled lead" || nm === "untitled" || nm === "new lead" || nm === "lead";
        const base = h || (!generic ? nm : ""); // group by handle, else by a specific client name — so a no-handle row merges with the handle row for the same client
        if (!base) continue;
        const key = base + "|" + String(r.platform || "fiverr").toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        (groups.get(key) as any[]).push(r);
      }
      let merged_groups = 0, deleted = 0;
      const attSig = (a: any) => String(a?.kind || "") + "|" + String(a?.name || "") + "|" + String(a?.text || "").slice(0, 80);
      for (const grp of groups.values()) {
        if (grp.length < 2) continue;
        grp.sort((a, b) => ((b.client_handle ? 1 : 0) - (a.client_handle ? 1 : 0)) || rank(b.status) - rank(a.status) || ((b.strategy && b.strategy.deal_state ? 1 : 0) - (a.strategy && a.strategy.deal_state ? 1 : 0)) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
        const win = grp[0]; const losers = grp.slice(1);
        let conversation = win.conversation || "";
        const attachments = Array.isArray(win.attachments) ? [...win.attachments] : [];
        const seen = new Set(attachments.map(attSig));
        let engTimes: string[] = (win.engagement && Array.isArray(win.engagement.times)) ? [...win.engagement.times] : [];
        let strategy = (win.strategy && win.strategy.deal_state) ? win.strategy : null;
        let client_site = win.client_site || "";
        const tags = Array.isArray(win.tags) ? [...win.tags] : [];
        let status = win.status; let lastMsg = win.last_message_at || "";
        for (const L of losers) {
          if ((L.conversation || "").length > conversation.length) conversation = L.conversation;
          if (Array.isArray(L.attachments)) for (const a of L.attachments) { const s = attSig(a); if (!seen.has(s)) { seen.add(s); attachments.push(a); } }
          if (L.engagement && Array.isArray(L.engagement.times)) engTimes = engTimes.concat(L.engagement.times);
          if (!strategy && L.strategy && L.strategy.deal_state) strategy = L.strategy;
          if (!client_site && L.client_site) client_site = L.client_site;
          if (Array.isArray(L.tags)) for (const t of L.tags) if (!tags.includes(t)) tags.push(t);
          if (rank(L.status) > rank(status)) status = L.status;
          if (String(L.last_message_at || "") > String(lastMsg)) lastMsg = L.last_message_at;
        }
        const engagement = (win.engagement || engTimes.length) ? Object.assign({}, win.engagement || {}, { times: Array.from(new Set(engTimes)).slice(-400) }) : null;
        const upd: any = { conversation, attachments, tags, status, last_message_at: lastMsg || null, updated_at: new Date().toISOString() };
        if (optCols) { upd.engagement = engagement; upd.client_site = client_site || null; }
        if (strategy) upd.strategy = strategy;
        await db().from("bd_deals").update(upd).eq("id", win.id);
        const loserIds = losers.map((L) => L.id);
        if (loserIds.length) { await db().from("bd_deals").delete().in("id", loserIds); deleted += loserIds.length; }
        merged_groups++;
      }
      return { success: true, merged_groups, deleted };
    } catch (e: any) { return { success: false, error: e?.message || "dedupe failed" }; }
  }

  if (action === "bd_deal_find") {
    const handle = String(body?.client_handle || "").trim().slice(0, 120);
    const platform = String(body?.platform || "fiverr").trim().slice(0, 40);
    const name = String(body?.client_name || "").trim().slice(0, 200);
    if (!handle) return { success: false, error: "No client handle to identify the deal." };
    try {
      const { data: found } = await db().from("bd_deals").select("*").eq("client_handle", handle).eq("platform", platform).order("updated_at", { ascending: false }).limit(1);
      if (Array.isArray(found) && found.length) return { success: true, deal: found[0], created: false };
      const row: any = { client_name: name || handle, client_handle: handle, platform, status: "lead", updated_at: new Date().toISOString() };
      const ins = await db().from("bd_deals").insert(row).select().single();
      if (ins.error) {
        // a concurrent create won the race (or the unique index rejected a dup) — return the existing row, never duplicate
        const hEsc = handle.replace(/([%_\\])/g, "\\$1");
        const { data: again } = await db().from("bd_deals").select("*").ilike("client_handle", hEsc).eq("platform", platform).order("updated_at", { ascending: false }).limit(1);
        if (Array.isArray(again) && again.length) return { success: true, deal: again[0], created: false };
        return { success: false, error: ins.error.message };
      }
      return { success: true, deal: ins.data, created: true };
    } catch (e: any) { return { success: false, error: e?.message || "deal find failed" }; }
  }

  if (action === "bd_deal_lookup") {
    const platform = String(body?.platform || "fiverr").trim().slice(0, 40);
    const handles = (Array.isArray(body?.handles) ? body.handles : []).map((h: any) => String(h || "").trim().slice(0, 120)).filter(Boolean).slice(0, 500);
    if (!handles.length) return { success: true, deals: [] };
    try {
      const { data } = await db().from("bd_deals").select("client_handle, client_name, status, strategy, last_message_at, updated_at, attachments").eq("platform", platform).in("client_handle", handles);
      const deals = (Array.isArray(data) ? data : []).map((d: any) => ({
        client_handle: d.client_handle,
        client_name: d.client_name || d.client_handle,
        status: d.status || "",
        stage: d.strategy?.deal_state?.stage || "",
        temperature: d.strategy?.deal_state?.temperature || "",
        next_move: d.strategy?.next_move || "",
        last_message_at: d.last_message_at || d.updated_at || null,
        has_intel: Array.isArray(d.attachments) && d.attachments.length > 0,
        evaluated: Boolean(d.strategy && d.strategy.deal_state),
      }));
      return { success: true, deals };
    } catch (e: any) { return { success: false, error: e?.message || "lookup failed" }; }
  }

  if (action === "bd_deal_list") {
    try {
      let q = db().from("bd_deals").select("id, client_name, client_handle, platform, brief, status, tags, last_message_at, updated_at, strategy").order("updated_at", { ascending: false }).limit(200);
      const status = String(body?.status || "").trim();
      if (status && status !== "all") {
        if (status === "active") q = q.not("status", "in", "(hired,repeat,lost,archived)");
        else if (status === "won") q = q.in("status", ["hired", "repeat", "in_delivery"]);
        else if (status === "archived") q = q.eq("status", "archived");
        else q = q.eq("status", status);
      }
      const search = String(body?.search || "").trim();
      if (search) q = q.or(`client_name.ilike.%${search}%,brief.ilike.%${search}%,conversation.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) return { success: false, error: error.message };
      return { success: true, deals: data || [] };
    } catch (e: any) { return { success: false, error: e?.message || "list failed" }; }
  }

  if (action === "bd_deal_get") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    try {
      const { data, error } = await db().from("bd_deals").select("*").eq("id", id).single();
      if (error) return { success: false, error: error.message };
      return { success: true, deal: data };
    } catch (e: any) { return { success: false, error: e?.message || "get failed" }; }
  }

  if (action === "bd_casestudy_save") {
    const cs = body || {};
    const row: any = { title: String(cs.title || "").slice(0, 200), summary: String(cs.summary || ""), results: String(cs.results || ""), industry: String(cs.industry || "").slice(0, 120), tags: Array.isArray(cs.tags) ? cs.tags.map((t: any) => String(t).slice(0, 40)).filter(Boolean) : [] };
    if (!row.title && !row.summary) return { success: false, error: "Add at least a title or summary." };
    try {
      if (cs.id) { const { data, error } = await db().from("bd_case_studies").update(row).eq("id", cs.id).select().single(); if (error) return { success: false, error: error.message }; return { success: true, case_study: data }; }
      const { data, error } = await db().from("bd_case_studies").insert(row).select().single(); if (error) return { success: false, error: error.message }; return { success: true, case_study: data };
    } catch (e: any) { return { success: false, error: e?.message || "save failed" }; }
  }
  if (action === "bd_casestudy_list") {
    try { const { data, error } = await db().from("bd_case_studies").select("*").order("created_at", { ascending: false }).limit(200); if (error) return { success: false, error: error.message }; return { success: true, case_studies: data || [] }; }
    catch (e: any) { return { success: false, error: e?.message || "list failed" }; }
  }
  if (action === "bd_casestudy_delete") {
    const id = String(body?.id || "").trim(); if (!id) return { success: false, error: "id required." };
    try { await db().from("bd_case_studies").delete().eq("id", id); return { success: true }; } catch (e: any) { return { success: false, error: e?.message || "delete failed" }; }
  }
  if (action === "bd_casestudy_match") {
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    try {
      const { data } = await db().from("bd_case_studies").select("*").order("created_at", { ascending: false }).limit(100);
      const list = (data as any[]) || [];
      if (!list.length) return { success: false, error: "No case studies in your library yet — add one first." };
      const { matchCaseStudy } = await import("./bd-strategist.js");
      const r = await matchCaseStudy({ caseStudies: list.map(x => ({ id: x.id, title: x.title, summary: x.summary, results: x.results, industry: x.industry, tags: x.tags || [] })), conversation: c.conversation, facts: c.facts });
      if (!r.ok) return { success: false, error: r.error };
      const matched = list.find(x => x.id === r.best_id) || list[0];
      return { success: true, matched: { title: matched.title, industry: matched.industry }, why: r.why, client_snippet: r.client_snippet };
    } catch (e: any) { return { success: false, error: e?.message || "match failed" }; }
  }

  if (action === "bd_casestudy_generate") {
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    if (!c.conversation.trim() && !c.facts) return { success: false, error: "Analyse the chat first so I can tailor the case study." };
    try {
      const { generateCaseStudy } = await import("./bd-strategist.js");
      const r = await generateCaseStudy({ conversation: c.conversation, facts: c.facts });
      return r.ok ? { success: true, draft: r.draft } : { success: false, error: r.error };
    } catch (e: any) { return { success: false, error: e?.message || "generate failed" }; }
  }

  if (action === "bd_generate_doc") {
    const id = String(body?.id || "").trim();
    const docType = String(body?.docType || "proposal");
    const c = await dealContext(id, String(body?.conversation || ""));
    let deal: any = null; let strategy: any = null;
    if (id) { try { const { data } = await db().from("bd_deals").select("*").eq("id", id).single(); deal = data; strategy = (deal as any)?.strategy; } catch { /* ignore */ } }
    if (!c.conversation.trim() && !c.facts && !strategy) return { success: false, error: "Analyse the chat first so the document has real context to work from." };
    // Auto-gather: if this doc benefits from site data and none is on the deal yet, run a fresh audit.
    let auditText = c.attachments || "";
    const siteUrl = String(body?.siteUrl || strategy?.client_site || (strategy?.deal_facts?.urls || [])[0] || "").trim();
    const needsSite = ["proposal", "audit_report", "strategy_brief", "pitch_email"].includes(docType);
    const hasAuditCtx = /\b(audit|crawl|pages|schema|performance|aeo|readiness)\b/i.test(auditText);
    if (needsSite && !hasAuditCtx && siteUrl) {
      try {
        const { crawlSite } = await import("./site-crawler.js");
        const report = await crawlSite({ projectId: id, siteUrl, maxPages: 80 });
        if (report && report.pages_reachable > 0) {
          const issues = Object.entries(report.issues || {}).map(([k, v]: any) => `${(v as any).count} ${String(k).replace(/_/g, " ")}`).join(", ");
          const fresh = `Site audit of ${report.project_domain} — crawled ${report.pages_reachable} pages. Issues found: ${issues || "none of the tracked issues"}.${report.performance ? ` Performance ${report.performance.performance_score}/100, LCP ${report.performance.lcp}.` : ""} Schema present: ${Object.keys(report.schema_coverage || {}).join(", ") || "none"}.`;
          auditText = fresh + (auditText ? "\n\n" + auditText : "");
          await persistDiag(id, "audit", "Quick site audit", fresh);
        }
      } catch { /* non-fatal — generate from conversation/facts */ }
    }
    // Real, traceable grounding: current algorithm knowledge + proven results.
    const [algoR, brainR] = await Promise.allSettled([
      db().from("algorithm_knowledge").select("topic,summary,recommendations").order("freshness_score", { ascending: false }).limit(8),
      db().from("brain_learnings").select("card_title,improvement,what_worked").order("applied_count", { ascending: false }).limit(8),
    ]);
    const algorithmKnowledge = algoR.status === "fulfilled" ? ((algoR.value.data as any[]) || []).map((a: any) => `${a.topic}: ${a.summary}${a.recommendations ? ` (Do: ${a.recommendations})` : ""}`).join("\n") : "";
    const provenResults = brainR.status === "fulfilled" ? ((brainR.value.data as any[]) || []).map((b: any) => `${b.card_title}: ${b.improvement}${Array.isArray(b.what_worked) && b.what_worked.length ? ` — what worked: ${b.what_worked.join(", ")}` : ""}`).join("\n") : "";
    try {
      const { generateDoc } = await import("./bd-strategist.js");
      const r = await generateDoc({ docType, brandName: "Manav S", conversation: c.conversation, strategy, facts: c.facts, auditText, leadInfo: { url: siteUrl, name: (deal as any)?.client_name || "", industry: strategy?.deal_facts?.industry || "" }, language: String(body?.language || "US English"), currency: String(body?.currency || "USD"), algorithmKnowledge, provenResults });
      if (!r.ok || !r.doc) return { success: false, error: r.error || "Could not generate the document." };
      const html = renderDocHtml(r.doc, "Manav S", String(body?.language || "US English"));
      const plain = r.doc.sections.map(s => (s.heading ? s.heading + "\n" : "") + s.body).join("\n\n");
      if (id) { try { await persistDiag(id, "doc:" + docType, r.doc.title || docType, plain.slice(0, 8000)); } catch { /* ignore */ } }
      return { success: true, html, title: r.doc.title, docType };
    } catch (e: any) { return { success: false, error: e?.message || "doc generation failed" }; }
  }

  if (action === "bd_ingest_order") {
    const id = String(body?.id || "").trim();
    const text = String(body?.orderText || body?.text || "").trim();
    if (!id) return { success: false, error: "Save the deal first, then paste the order." };
    if (!text) return { success: false, error: "Paste the Fiverr Order page content." };
    try {
      const { extractOrder } = await import("./bd-strategist.js");
      const r = await extractOrder(text);
      if (!r.ok || !r.order) return { success: false, error: r.error || "Could not read the order page." };
      const summary = r.summary || "Fiverr order";
      const { data } = await db().from("bd_deals").select("attachments, status").eq("id", id).single();
      const existing = Array.isArray((data as any)?.attachments) ? (data as any).attachments.filter((a: any) => a.kind !== "order") : [];
      const orderAtt = { name: "Fiverr order" + (r.order.order_number ? ` ${r.order.order_number}` : ""), kind: "order", text: summary, order: r.order, added_at: new Date().toISOString() };
      const curStatus = String((data as any)?.status || "");
      const nextStatus = ["repeat", "completed", "hired"].includes(curStatus) ? curStatus : "in_delivery";
      const { data: updated } = await db().from("bd_deals").update({ attachments: [...existing, orderAtt], status: nextStatus, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).select().single();
      return { success: true, order: r.order, summary, deal: updated };
    } catch (e: any) { return { success: false, error: e?.message || "order ingest failed" }; }
  }

  if (action === "bd_engagement") {
    const id = String(body?.id || "").trim();
    const c = await dealContext(id, String(body?.conversation || ""));
    if (!c.conversation.trim() && !c.facts) return { success: false, error: "Analyse the chat first so there is a history to track." };
    let deal: any = null; let strategy: any = null;
    if (id) { try { const { data } = await db().from("bd_deals").select("*").eq("id", id).single(); deal = data; strategy = (deal as any)?.strategy; } catch { /* ignore */ } }
    const atts = Array.isArray((deal as any)?.attachments) ? (deal as any).attachments : [];
    const orderInfo = (atts.find((a: any) => a.kind === "order") as any)?.order || null;
    const deliveredDocs = atts.filter((a: any) => ["delivered", "doc", "file"].includes(a.kind) || String(a.kind || "").startsWith("doc:")).map((a: any) => `[${a.name || a.kind}]\n${String(a.text || "").slice(0, 4000)}`).join("\n\n");
    try {
      const { analyzeEngagement } = await import("./bd-strategist.js");
      const r = await analyzeEngagement({ conversation: c.conversation, orderInfo, deliveredDocs, facts: c.facts, strategySummary: c.strategySummary });
      if (!r.ok || !r.engagement) return { success: false, error: r.error || "Could not build the engagement picture." };
      const e = r.engagement;
      const summary = [
        e.client_mood ? `Client mood: ${e.client_mood}` : "",
        e.delivered?.length ? `Delivered (closed): ${e.delivered.join("; ")}` : "",
        e.open_items?.length ? `Still open: ${e.open_items.join("; ")}` : "",
        e.needs_shift ? `Needs shift: ${e.needs_shift}` : "",
        e.missed_or_at_risk?.length ? `Missed / at risk: ${e.missed_or_at_risk.join("; ")}` : "",
        e.next_offer?.what ? `Next offer: ${e.next_offer.what}. How to win: ${e.next_offer.how_to_win || ""}` : "",
      ].filter(Boolean).join("\n");
      if (id) {
        try {
          const { data: cur } = await db().from("bd_deals").select("attachments").eq("id", id).single();
          const existing = Array.isArray((cur as any)?.attachments) ? (cur as any).attachments.filter((a: any) => a.kind !== "engagement") : [];
          const att = { name: "Engagement timeline", kind: "engagement", text: summary, engagement: e, added_at: new Date().toISOString() };
          const { data: updated } = await db().from("bd_deals").update({ attachments: [...existing, att], updated_at: new Date().toISOString() }).eq("id", id).select().single();
          return { success: true, engagement: e, deal: updated };
        } catch { /* ignore persist */ }
      }
      return { success: true, engagement: e };
    } catch (e: any) { return { success: false, error: e?.message || "engagement failed" }; }
  }

  if (action === "bd_aeo_check") {
    const siteUrl = String(body?.siteUrl || "").trim();
    if (!siteUrl) return { success: false, error: "No client site URL — detect it from the chat or add it." };
    try {
      const { aeoReadinessCheck } = await import("./bd-diagnostics.js");
      const r = await aeoReadinessCheck(siteUrl);
      if (!r.ok || !r.report) return { success: false, error: r.error || "AEO check failed." };
      const rep = r.report;
      noteCall(String(body?.id || "").trim()); await persistDiag(String(body?.id || "").trim(), "aeo", "AEO/GEO readiness", `AEO/GEO readiness for ${rep.site}: ${rep.signals.filter(s => s.ok).length}/${rep.signals.length} signals OK. Schema: ${rep.schema_types.join(", ") || "none"}. llms.txt: ${rep.llms_txt ? "yes" : "no"}. ${rep.robots_ai}. Top fixes: ${rep.recommendations.slice(0, 3).join("; ")}.`);
      return { success: true, report: rep };
    } catch (e: any) { return { success: false, error: e?.message || "AEO check failed" }; }
  }

  if (action === "bd_suggest_competitors") {
    const id = String(body?.id || "").trim();
    const c = await dealContext(id, String(body?.conversation || ""));
    let site = "", industry = "", country = "", existingKw: string[] = [];
    try {
      const { data } = await db().from("bd_deals").select("client_site, industry, country, strategy").eq("id", id).single();
      const d: any = data || {};
      site = String(d.client_site || "").trim(); industry = String(d.industry || "").trim(); country = String(d.country || "").trim();
      const f = (d.strategy && d.strategy.deal_facts) || {};
      if (Array.isArray(f.target_keywords)) existingKw = f.target_keywords.map((x: any) => String(x).trim()).filter(Boolean);
      if (!site && d.strategy && d.strategy.client_site) site = String(d.strategy.client_site).trim();
    } catch { /* ignore */ }
    const { llm } = await import("./workspace/llm.js");
    // 1) target keywords — use stated ones, else derive from context (descriptive, low-risk)
    let keywords = existingKw.slice(0, 10);
    if (keywords.length < 3) {
      const kwRaw = await llm({ system: "You are a senior SEO strategist. From the client context, output ONLY a JSON array of 6-8 commercial, buyer-intent search phrases this client's own customers would type to find them (include the city/region when the business is local). No prose, no backticks.", user: `Client site: ${site || "unknown"}\nIndustry: ${industry || "unknown"}\nLocation: ${country || "unknown"}\nFacts: ${c.facts.slice(0, 2000)}\nConversation:\n${c.conversation.slice(0, 8000)}`, maxTokens: 400, timeoutMs: 45000, label: "bd-suggest-keywords" });
      try { const a = JSON.parse(String(kwRaw || "[]").replace(/```json|```/g, "").trim()); if (Array.isArray(a)) keywords = a.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 10); } catch { /* ignore */ }
    }
    // 2) competitors — prefer REAL domains ranking for those keywords (SERP), else LLM-suggested
    let competitors: string[] = []; let source = "ai_suggested";
    const self = cleanHost(site);
    const AGG = /(google|youtube|facebook|instagram|linkedin|twitter|x\.com|yelp|tripadvisor|wikipedia|amazon|reddit|pinterest|maps\.|bing\.|apple\.|fiverr|upwork|glassdoor|indeed|justdial|yellowpages|bbb\.org|trustpilot|crunchbase|medium\.com|quora|cloudinary|booking\.com|expedia)/i;
    try {
      const { fetchSerpFeatures } = await import("./serpapi.js");
      const tally = new Map<string, number>();
      for (const kw of keywords.slice(0, 3)) {
        const r: any = await fetchSerpFeatures(kw, "", {}).catch(() => null);
        const org = (r && Array.isArray(r.organic_results)) ? r.organic_results : [];
        for (const o of org.slice(0, 8)) { const h = cleanHost(o.link || o.displayed_link || ""); if (!h || h === self || AGG.test(h)) continue; tally.set(h, (tally.get(h) || 0) + 1); }
      }
      competitors = [...tally.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 5);
      if (competitors.length >= 2) source = "serp";
    } catch { /* serp unavailable */ }
    if (competitors.length < 2) {
      const compRaw = await llm({ system: "You are a senior SEO competitive analyst. From the client context, output ONLY a JSON array of 4-5 LIKELY direct-competitor website domains (bare domains, no scheme, real and well-known where possible) for this business in its market. No prose, no backticks.", user: `Client site: ${site || "unknown"}\nIndustry: ${industry || "unknown"}\nLocation: ${country || "unknown"}\nKeywords: ${keywords.join(", ")}\nFacts: ${c.facts.slice(0, 2000)}`, maxTokens: 300, timeoutMs: 45000, label: "bd-suggest-competitors" });
      try { const a = JSON.parse(String(compRaw || "[]").replace(/```json|```/g, "").trim()); if (Array.isArray(a)) { const llmC = a.map((x: any) => cleanHost(x)).filter((h: string) => h && h.includes(".") && h !== self && !AGG.test(h)); competitors = Array.from(new Set([...competitors, ...llmC])).slice(0, 5); } } catch { /* ignore */ }
    }
    return { success: true, competitors, keywords, source };
  }

  if (action === "bd_attach") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    const kind = String(body?.kind || "note").trim().slice(0, 40);
    const name = String(body?.name || "Attachment").trim().slice(0, 200);
    const text = String(body?.text || "").trim();
    if (!text) return { success: false, error: "Nothing to attach." };
    try {
      const { data } = await db().from("bd_deals").select("attachments").eq("id", id).single();
      const existing = Array.isArray((data as any)?.attachments) ? (data as any).attachments : [];
      const sig = text.slice(0, 200);
      if (existing.some((a: any) => a && a.kind === kind && String(a.text || "").slice(0, 200) === sig)) return { success: true, deal: data, deduped: true };
      const att = { name, kind, text: text.slice(0, 100000), added_at: new Date().toISOString() };
      const { data: updated, error } = await db().from("bd_deals").update({ attachments: [...existing, att], updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, deal: updated };
    } catch (e: any) { return { success: false, error: e?.message || "attach failed" }; }
  }

  if (action === "bd_competitor_snapshot") {
    const siteUrl = String(body?.siteUrl || "").trim();
    const competitors = (Array.isArray(body?.competitors) ? body.competitors : []).map((c: any) => String(c).trim()).filter(Boolean);
    const keywords = (Array.isArray(body?.keywords) ? body.keywords : []).map((k: any) => String(k).trim()).filter(Boolean);
    if (!competitors.length) return { success: false, error: "Add at least one competitor domain (detected from the chat or typed)." };
    if (!keywords.length) return { success: false, error: "Add a few target keywords to compare on." };
    try {
      const { benchmarkCompetitors } = await import("./competitor-benchmark.js");
      const report = await benchmarkCompetitors({ projectId: String(body?.projectId || ""), competitors, keywords, siteUrl, maxQueries: 8, maxContentGaps: 5 });
      noteCall(String(body?.id || "").trim()); await persistDiag(String(body?.id || "").trim(), "competitor", "Competitor snapshot", report.summary || `Competitor snapshot vs ${competitors.join(", ")}.`);
      return { success: true, report };
    } catch (e: any) { return { success: false, error: e?.message || "competitor snapshot failed" }; }
  }

  if (action === "bd_build_offer") {
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    if (!c.conversation.trim() && !c.facts) return { success: false, error: "Analyse the chat first so I have the facts to price." };
    try { const { buildOffer } = await import("./bd-strategist.js"); const r = await buildOffer(c); return r.ok ? { success: true, offer: r.offer } : { success: false, error: r.error }; }
    catch (e: any) { return { success: false, error: e?.message || "offer failed" }; }
  }

  if (action === "bd_build_roadmap") {
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    if (!c.conversation.trim() && !c.facts) return { success: false, error: "Analyse the chat first." };
    try { const { buildRoadmap } = await import("./bd-strategist.js"); const r = await buildRoadmap(c); return r.ok ? { success: true, roadmap: r.roadmap } : { success: false, error: r.error }; }
    catch (e: any) { return { success: false, error: e?.message || "roadmap failed" }; }
  }

  if (action === "bd_reply_variants") {
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    if (!c.conversation.trim()) return { success: false, error: "Paste the conversation first." };
    const replyLanguage = String(body?.reply_language || "").toLowerCase() === "english" ? "english" : "client";
    let clientLanguage = String(body?.client_language || "").trim();
    if (!clientLanguage && String(body?.id || "").trim()) {
      try { const { data } = await db().from("bd_deals").select("strategy").eq("id", String(body.id).trim()).single(); clientLanguage = String((data?.strategy as any)?.conversation_language || "").trim(); } catch { /* ignore */ }
    }
    try { const { replyVariants } = await import("./bd-strategist.js"); const r = await replyVariants({ ...c, replyLanguage, clientLanguage }); return r.ok ? { success: true, variants: r.variants } : { success: false, error: r.error }; }
    catch (e: any) { return { success: false, error: e?.message || "variants failed" }; }
  }

  if (action === "bd_translate") {
    const text = String(body?.text || "").trim();
    if (!text) return { success: false, error: "Nothing to translate." };
    try {
      const { llm } = await import("./workspace/llm.js");
      const out = await llm({
        system: [
          `You translate a client conversation into clear, natural English for a senior operator who reads English only. The operator needs to understand exactly what was said.`,
          `Preserve the structure: if the original labels who said what (the seller versus the client), keep those labels. Keep line breaks and message order.`,
          `KEEP EXACTLY AS WRITTEN, never translate or alter: urls, email addresses, domains, keywords the client is targeting, brand names, product names, numbers, prices, currency, dates, and technical terms.`,
          `If a passage is already in English, leave it exactly as it is. Do not summarise, do not add commentary. Return ONLY the English version of the conversation, nothing else.`,
        ].join("\n"),
        user: text.slice(0, 24000), maxTokens: 3000, timeoutMs: 80000, label: "bd-translate",
      });
      const translation = String(out || "").trim();
      if (!translation) return { success: false, error: "Translation came back empty. Try again." };
      return { success: true, translation };
    } catch (e: any) { return { success: false, error: e?.message || "translate failed" }; }
  }

  if (action === "bd_ask") {
    const question = String(body?.question || "").trim();
    if (!question) return { success: false, error: "Type your question or what you are thinking." };
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    try {
      const { askExpert } = await import("./bd-strategist.js");
      const r = await askExpert({ question, conversation: c.conversation, facts: c.facts, attachments: c.attachments, strategySummary: c.strategySummary, callScript: c.callScript, operatorContext: c.operatorContext, learnings: await learningsContext() });
      if (!r.ok) return { success: false, error: r.error };
      return { success: true, answer: r.answer, client_reply: r.client_reply, suggested_tools: r.suggested_tools };
    } catch (e: any) { return { success: false, error: e?.message || "ask failed" }; }
  }

  if (action === "bd_run_audit") {
    const siteUrl = String(body?.siteUrl || "").trim();
    if (!siteUrl) return { success: false, error: "No client site URL to audit — add it or detect it from the chat." };
    try {
      const { crawlSite } = await import("./site-crawler.js");
      const report = await crawlSite({ projectId: String(body?.projectId || ""), siteUrl, maxPages: Math.min(Number(body?.maxPages) || 120, 120) });
      /* Persist a concise summary on the deal so it informs future strategy. */
      const id = String(body?.id || "").trim();
      if (id && report.pages_reachable > 0) {
        try {
          noteCall(id); const issues = Object.entries(report.issues || {}).map(([k, v]: any) => `${v.count} ${String(k).replace(/_/g, " ")}`).join(", ");
          const text = `Quick site audit of ${report.project_domain} — crawled ${report.pages_reachable} pages. Issues: ${issues || "none of the tracked issues"}.${report.performance ? ` Performance ${report.performance.performance_score}/100, LCP ${report.performance.lcp}.` : ""} Schema found: ${Object.keys(report.schema_coverage || {}).join(", ") || "none"}.`;
          const { data: deal } = await db().from("bd_deals").select("attachments").eq("id", id).single();
          const existing = Array.isArray((deal as any)?.attachments) ? (deal as any).attachments.filter((a: any) => a.kind !== "audit") : [];
          await db().from("bd_deals").update({ attachments: [...existing, { name: "Quick site audit", kind: "audit", text, added_at: new Date().toISOString() }], updated_at: new Date().toISOString() }).eq("id", id);
        } catch { /* non-fatal */ }
      }
      return { success: report.pages_reachable > 0, report };
    } catch (e: any) { return { success: false, error: e?.message || "audit failed" }; }
  }

  if (action === "bd_deal_attach") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    const att = { name: String(body?.name || "attachment").slice(0, 200), kind: String(body?.kind || "file"), text: String(body?.text || "").slice(0, 120000), added_at: new Date().toISOString() };
    if (!att.text.trim()) return { success: false, error: "No readable text in the attachment (images need their text pasted)." };
    try {
      const { data: deal } = await db().from("bd_deals").select("attachments").eq("id", id).single();
      const existing = Array.isArray((deal as any)?.attachments) ? (deal as any).attachments : [];
      const { data, error } = await db().from("bd_deals").update({ attachments: [...existing, att], updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, deal: data };
    } catch (e: any) { return { success: false, error: e?.message || "attach failed" }; }
  }

  if (action === "bd_strategize") {
    const id = String(body?.id || "").trim();
    let conversation = String(body?.conversation || "");
    let brief = String(body?.brief || "");
    let clientName = String(body?.client_name || "");
    let deal: any = null;
    if (id) {
      try { const { data } = await db().from("bd_deals").select("*").eq("id", id).single(); deal = data; } catch { /* ignore */ }
      if (deal) { conversation = conversation || deal.conversation || ""; brief = brief || deal.brief || ""; clientName = clientName || deal.client_name || ""; }
    }
    if (!conversation.trim()) return { success: false, error: "No conversation to strategise. Paste the client chat first." };
    try {
      const { strategizeDeal } = await import("./bd-strategist.js");
      let context = String(body?.context || "");
      if (deal && Array.isArray(deal.attachments) && deal.attachments.length) {
        const fromAtt = deal.attachments.map((a: any) => `[${a.kind || "file"}: ${a.name || "attachment"}]\n${String(a.text || "").slice(0, 12000)}`).join("\n\n");
        context = fromAtt + (context ? "\n\n" + context : "");
      }
      const r = await strategizeDeal({ conversation, brief, clientName, context, operatorContext: String(deal?.notes || ""), learnings: await learningsContext() });
      if (!r.ok) return { success: false, error: r.error, strategy: r.strategy };
      if (id && deal) {
        try {
          const detected = String(r.strategy.detected_client || "").trim();
          const curName = String(deal.client_name || "").trim();
          const nameUpdate = (detected && (!curName || curName === "Untitled lead")) ? { client_name: detected } : {};
          const f: any = r.strategy.deal_facts || {};
          const newStatus = STATUSES.includes(r.strategy.deal_state.stage) ? r.strategy.deal_state.stage : deal.status;
          const cleanConv = String(body?.clean_conversation || "").trim();
          const existingConv = String(deal.conversation || "");
          const convUpdate = (cleanConv && cleanConv.length >= existingConv.length) ? { conversation: cleanConv, last_message_at: new Date().toISOString() } : {}; // grow-only: never overwrite a longer saved chat with a partial grab
          const dealCountry = String(f.country || f.location || deal.country || "").trim();
          try { const pr = await leadPriorityFor(dealCountry); if (pr.priority) { r.strategy.verdict = r.strategy.verdict || ({} as any); (r.strategy.verdict as any).priority = pr.priority; (r.strategy.verdict as any).priority_reason = pr.reason; } } catch { /* non-fatal */ }
          await db().from("bd_deals").update({ strategy: r.strategy, status: newStatus, ...nameUpdate, ...convUpdate, industry: f.industry || deal.industry || null, country: dealCountry || deal.country || null, client_type: f.client_type || deal.client_type || null, updated_at: new Date().toISOString() }).eq("id", id);
          appendStage(id, newStatus);
        } catch { /* non-fatal */ }
        noteCall(id);
      }
      return { success: true, strategy: r.strategy };
    } catch (e: any) { return { success: false, error: e?.message || "strategize failed" }; }
  }

  if (action === "bd_deal_delete") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    try { await db().from("bd_deals").delete().eq("id", id); return { success: true }; }
    catch (e: any) { return { success: false, error: e?.message || "delete failed" }; }
  }

  if (action === "bd_deal_outcome") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    const outcome = body?.outcome === "won" ? "won" : "lost";
    const dealValue = Number(body?.deal_value) || null;
    const reason = String(body?.reason || "");
    const status = outcome === "won" ? "hired" : "lost";
    try {
      const { data: deal } = await db().from("bd_deals").select("*").eq("id", id).single();
      const d = deal as any;
      const baseUpd: any = { outcome, deal_value: dealValue, status, updated_at: new Date().toISOString() };
      let { error: oerr } = await db().from("bd_deals").update({ ...baseUpd, ...(outcome === "won" ? { won_reason: reason } : { lost_reason: reason }) }).eq("id", id);
      if (oerr && /column|schema cache|does not exist/i.test(String(oerr.message || ""))) {
        // won_reason / lost_reason may not be migrated yet — never let that block recording the outcome, since HoD conversion data and learnings depend on it. The reason still flows into the learning below.
        ({ error: oerr } = await db().from("bd_deals").update(baseUpd).eq("id", id));
      }
      if (oerr) return { success: false, error: oerr.message };
      appendStage(id, status);
      try {
        const { analyzeOutcome } = await import("./bd-strategist.js");
        const a = await analyzeOutcome({ conversation: d?.conversation, outcome, dealValue: dealValue || undefined, reason, facts: JSON.stringify(d?.strategy?.deal_facts || {}) });
        if (a.ok) await db().from("bd_learnings").insert({ deal_id: id, client_name: d?.client_name || null, client_type: d?.client_type || d?.strategy?.deal_facts?.client_type || null, industry: d?.industry || d?.strategy?.deal_facts?.industry || null, project_type: a.project_type || null, outcome, deal_value: dealValue, what_worked: a.what_worked, what_failed: a.what_failed, why: a.why });
      } catch { /* learning is best-effort */ }
      return { success: true };
    } catch (e: any) { return { success: false, error: e?.message || "outcome failed" }; }
  }

  if (action === "bd_hod_report") {
    try {
      const { data: deals } = await db().from("bd_deals").select("id, client_name, status, outcome, deal_value, industry, country, client_type, api_calls, created_at, updated_at, stage_history").limit(2000);
      let learnings: any[] = [];
      try { const { data: lr } = await db().from("bd_learnings").select("*").order("created_at", { ascending: false }).limit(60); if (Array.isArray(lr)) learnings = lr; } catch { /* bd_learnings table may not be migrated — HoD still works without the per-deal outcome log */ }
      const list = (deals as any[]) || [];
      const now = Date.now();
      const won = list.filter(d => d.outcome === "won");
      const lost = list.filter(d => d.outcome === "lost");
      const active = list.filter(d => !["hired", "repeat", "lost", "archived"].includes(d.status));
      const earnings = won.reduce((s, d) => s + Number(d.deal_value || 0), 0);
      const lostValue = lost.reduce((s, d) => s + Number(d.deal_value || 0), 0);
      const decided = won.length + lost.length;
      const winRate = decided ? Math.round((won.length / decided) * 100) : 0;
      const totalApi = list.reduce((s, d) => s + Number(d.api_calls || 0), 0);
      const stages = ["lead", "qualifying", "proposal", "negotiating", "demo_requested", "closing", "hired", "repeat", "lost"];
      const funnel = stages.map(st => ({ stage: st, count: list.filter(d => d.status === st).length }));
      const convTimes = won.map(d => (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 86400000).filter(x => x > 0);
      const avgConvDays = convTimes.length ? Math.round((convTimes.reduce((a, b) => a + b, 0) / convTimes.length) * 10) / 10 : 0;
      const hanging = active.filter(d => (now - new Date(d.updated_at).getTime()) > 4 * 86400000).map(d => ({ client_name: d.client_name, status: d.status, days: Math.floor((now - new Date(d.updated_at).getTime()) / 86400000) })).sort((a, b) => b.days - a.days).slice(0, 20);
      const byHour = Array(24).fill(0); // lead activity by hour, IST (UTC+5:30)
      for (const d of list) { const t = d.created_at ? new Date(d.created_at).getTime() : 0; if (t) { const ist = new Date(t + 330 * 60000); byHour[ist.getUTCHours()]++; } }
      const winByCountry = winRateBy(list, "country");
      const winByType = winRateBy(list, "client_type");
      let patterns: string[] = [];
      try { const { data: st } = await db().from("bd_settings").select("value").eq("key", "lead_learnings").single(); const v: any = (st as any)?.value; if (v && Array.isArray(v.learnings)) patterns = v.learnings.map((x: any) => String(x)); } catch { /* none yet */ }
      const todo: string[] = [];
      if (hanging.length) todo.push(`Follow up on ${hanging.length} hanging lead${hanging.length === 1 ? "" : "s"} — the oldest has been quiet ${hanging[0].days} days.`);
      for (const c of winByCountry.filter(c => c.total >= 3 && c.rate < 30 && c.key !== "Unknown").slice(0, 2)) todo.push(`${c.key}: only ${c.rate}% of ${c.total} decided deals won — consider deprioritising or tightening qualification.`);
      for (const c of winByCountry.filter(c => c.total >= 3 && c.rate >= 50 && c.key !== "Unknown").slice(0, 1)) todo.push(`${c.key} converts well (${c.rate}% of ${c.total}) — prioritise leads from there.`);
      if (decided >= 3 && winRate < 30) todo.push(`Overall win rate is ${winRate}% — tighten the early qualify/offer step; the patterns below show where deals slip.`);
      if (lost.length && lostValue > earnings) todo.push(`Lost pipeline value exceeds won value — review the loss reasons below.`);
      return { success: true, report: { total: list.length, active: active.length, won: won.length, lost: lost.length, winRate, earnings, lostValue, totalApi, avgApi: list.length ? Math.round(totalApi / list.length) : 0, funnel, byIndustry: aggBy(list, "industry"), byCountry: aggBy(won, "country"), winByCountry, winByType, byHour, patterns, todo, avgConvDays, hanging, learnings: learnings || [] } };
    } catch (e: any) { return { success: false, error: e?.message || "report failed" }; }
  }

  if (action === "bd_vault_ask") {
    const question = String(body?.question || "").trim();
    if (!question) return { success: false, error: "Ask a question." };
    const config = body?.config || {};
    const history = String(body?.history || "").slice(0, 4000);
    let target = String(body?.client || "").trim();
    // if no client was named, try to detect a known client name/handle inside the question
    if (!target) {
      try {
        const { data: roster } = await db().from("bd_deals").select("client_name, client_handle").limit(2000);
        const ql = question.toLowerCase();
        const hit = ((roster as any[]) || []).find((n) => (n.client_handle && ql.includes(String(n.client_handle).toLowerCase())) || (n.client_name && String(n.client_name).trim().length > 2 && ql.includes(String(n.client_name).toLowerCase())));
        if (hit) target = String(hit.client_handle || hit.client_name);
      } catch { /* roster read failed — fall through to population */ }
    }
    if (target) {
      const safe = target.replace(/[%,]/g, "");
      const { data: rows } = await db().from("bd_deals").select("*").or(`client_name.ilike.%${safe}%,client_handle.ilike.%${safe}%`).limit(1);
      const d = ((rows as any[]) || [])[0];
      if (d) {
        const s = d.strategy && typeof d.strategy === "object" ? d.strategy : {};
        const fmtDate = (x: any) => { const t = x ? new Date(x).getTime() : 0; return !t || isNaN(t) ? "" : new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC"; };
        const eng = engagementSummary(d.engagement);
        const atts = Array.isArray(d.attachments) ? d.attachments : [];
        let attText = "";
        for (const a of atts) { if (a && a.text) { const block = `\n--- ${a.kind || "doc"}${a.name ? " (" + a.name + ")" : ""} ---\n${String(a.text).slice(0, 3000)}`; if (attText.length + block.length > 9000) break; attText += block; } }
        const ctx = [
          `Client: ${d.client_name || d.client_handle} (@${d.client_handle || ""})`,
          `Status: ${d.status || ""} · Outcome: ${d.outcome || "open"} · Value: ${d.deal_value || 0} · Country: ${d.country || "unknown"} · Industry: ${d.industry || ""} · Type: ${d.client_type || ""}`,
          `Lead created: ${fmtDate(d.created_at) || "unknown"} · Last updated: ${fmtDate(d.updated_at) || "unknown"} · Last message: ${fmtDate(d.last_message_at) || "unknown"}`,
          `Timing and availability (IST is your clock): ${eng || "no activity timing captured for this client yet"}`,
          s.verdict ? `Verdict: ${JSON.stringify(s.verdict)}` : "",
          s.deal_state ? `Deal state: ${JSON.stringify(s.deal_state)}` : "",
          s.client_intel ? `Client intel: ${JSON.stringify(s.client_intel)}` : "",
          s.deal_facts ? `Deal facts: ${JSON.stringify(s.deal_facts)}` : "",
          Array.isArray(d.stage_history) && d.stage_history.length ? `Stage history: ${d.stage_history.map((h: any) => String((h && (h.status || h.stage)) || "") + (h && (h.at || h.when) ? "@" + fmtDate(h.at || h.when) : "")).filter(Boolean).join(" -> ")}` : "",
          d.notes ? `Operator notes: ${String(d.notes).slice(0, 1500)}` : "",
          atts.length ? `Attachments on file: ${atts.map((a: any) => (a.kind || "doc") + (a.name ? ":" + a.name : "")).join(", ")}` : "",
          attText ? `Attachment contents:${attText}` : "",
          d.conversation ? `Conversation (most recent excerpt):\n${String(d.conversation).slice(-6000)}` : "",
        ].filter(Boolean).join("\n");
        const r = await vaultAsk({ question, scope: "client", context: ctx, history, config });
        return { success: true, answer: r.answer, used: [String(d.client_name || d.client_handle)] };
      }
    }
    // population
    try {
      const all = await vaultLoadDeals("");
      const now = Date.now();
      const digs = all.map((d) => digestOf(d, now)).sort((a, b) => (a.idleDays == null ? 1 : a.idleDays) - (b.idleDays == null ? 1 : b.idleDays));
      const lines = digs.slice(0, 120).map(vaultDigestLine).join("\n");
      const ctx = `Total leads on file: ${digs.length}. Showing the ${Math.min(120, digs.length)} most recently active, each with status, temperature, health, country, value, idle days, next move and activity timing.\n${lines}`;
      const r = await vaultAsk({ question, scope: "population", context: ctx, history, config });
      return { success: true, answer: r.answer, used: [] };
    } catch (e: any) { return { success: false, error: e?.message || "Could not read the lead data." }; }
  }

  if (action === "bd_vault_report") {
    const kind = String(body?.kind || "daily");
    const scope = body?.scope || {};
    const config = body?.config || {};
    const force = !!body?.force;
    const now = Date.now();
    const windows: Record<string, number> = { hourly: 3600000, daily: 86400000, weekly: 7 * 86400000 };
    const span = windows[kind] || 86400000;
    const startMs = now - span;
    const windowLabel = kind === "hourly" ? "last hour" : kind === "weekly" ? "last 7 days" : "last 24 hours";
    const scopeKey = `${kind}|${scope.status || "all"}|${scope.country || "all"}|${scope.problem || "all"}`;
    // serve the most recent cached report for this scope if it is still fresh (half the window), unless forced
    if (!force) {
      try {
        const freshAfter = new Date(now - Math.min(span, 86400000) / 2).toISOString();
        const { data: cached } = await db().from("vault_reports").select("*").eq("scope", scopeKey).gte("created_at", freshAfter).order("created_at", { ascending: false }).limit(1);
        const c = ((cached as any[]) || [])[0];
        if (c) return { success: true, report: { kind, windowLabel, scopeKey, stats: c.stats, narrative: c.narrative, generated_at: c.created_at, cached: true } };
      } catch { /* vault_reports may not be migrated yet — compute fresh */ }
    }
    let list: any[] = [];
    try {
      list = await vaultLoadDeals("stage_history");
    } catch (e: any) { return { success: false, error: e?.message || "Could not read the lead data." }; }
    if (scope.status && scope.status !== "all") list = list.filter((d) => String(d.status || "") === scope.status);
    if (scope.country && scope.country !== "all") list = list.filter((d) => String(d.country || "").toLowerCase().includes(String(scope.country).toLowerCase()));
    const stats = computeActivity(list, startMs, now);
    let attention = stats.inPlay;
    if (scope.problem === "hanging") attention = stats.hanging;
    else if (scope.problem === "at_risk") attention = stats.atRisk;
    else if (scope.problem === "hot") attention = stats.hot;
    const digestText = attention.slice(0, 40).map(vaultDigestLine).join("\n") || "No leads match this filter for this period.";
    const scopeLabel = `${windowLabel}${scope.status && scope.status !== "all" ? " · status=" + scope.status : ""}${scope.country && scope.country !== "all" ? " · country=" + scope.country : ""}${scope.problem && scope.problem !== "all" ? " · focus=" + scope.problem : ""}`;
    const r = await vaultReport({ kind, windowLabel, scopeLabel, stats, digests: digestText, config });
    const generated_at = new Date().toISOString();
    try { await db().from("vault_reports").insert({ kind, scope: scopeKey, window_start: new Date(startMs).toISOString(), window_end: new Date(now).toISOString(), params: scope, stats, narrative: r.narrative, created_at: generated_at }); } catch { /* table may not exist — report still returned, just not cached */ }
    return { success: true, report: { kind, windowLabel, scopeKey, stats, narrative: r.narrative, generated_at, cached: false } };
  }

  if (action === "bd_vault_gaps") {
    const config = body?.config || {};
    const scope = body?.scope || {};
    try {
      const { data } = await db().from("bd_deals").select("client_name, client_handle, status, outcome, conversation, updated_at").not("conversation", "is", null).order("updated_at", { ascending: false }).limit(60);
      let list = ((data as any[]) || []).filter((d) => d.conversation && String(d.conversation).trim().length > 80);
      if (scope.status && scope.status !== "all") list = list.filter((d) => String(d.status || "") === scope.status);
      list = list.slice(0, 40);
      if (!list.length) return { success: true, analysis: "No conversations with enough content on file yet to analyse handling. Sync some Fiverr chats first.", count: 0 };
      let corpus = "";
      for (const d of list) {
        const block = `### ${d.client_name || d.client_handle} [${d.status || ""}${d.outcome ? "/" + d.outcome : ""}]\n${String(d.conversation).slice(-2000)}\n\n`;
        if (corpus.length + block.length > 42000) break;
        corpus += block;
      }
      const r = await vaultGaps({ corpus, count: list.length, config });
      return { success: true, analysis: r.analysis, count: list.length };
    } catch (e: any) { return { success: false, error: e?.message || "Could not analyse handling." }; }
  }

  if (action === "bd_vault_train") {
    const config = body?.config || {};
    const target = String(body?.client || "").trim();
    if (!target) return { success: false, error: "Name a client to build the tutorial from." };
    try {
      const safe = target.replace(/[%,]/g, "");
      const { data: rows } = await db().from("bd_deals").select("*").or(`client_name.ilike.%${safe}%,client_handle.ilike.%${safe}%`).limit(1);
      const d = ((rows as any[]) || [])[0];
      if (!d) return { success: false, error: `No client matching "${target}" on file.` };
      if (!d.conversation || String(d.conversation).trim().length < 80) return { success: false, error: `${d.client_name || target} has no conversation on file to train from yet.` };
      const s = d.strategy && typeof d.strategy === "object" ? d.strategy : {};
      let callText = "";
      if (Array.isArray(d.attachments)) {
        const call = d.attachments.find((a: any) => /transcript|call|zoom|meeting/i.test(String((a && (a.kind || a.label || a.type)) || "")));
        if (call && (call.text || call.content)) callText = String(call.text || call.content).slice(0, 8000);
      }
      const ctx = [
        `Client: ${d.client_name || d.client_handle} (@${d.client_handle || ""})`,
        `Status: ${d.status || ""} · Outcome: ${d.outcome || "open"} · Value: ${d.deal_value || 0} · Country: ${d.country || ""} · Service: ${(s.deal_facts && s.deal_facts.service) || d.industry || ""}`,
        s.deal_facts ? `Deal facts: ${JSON.stringify(s.deal_facts)}` : "",
        d.won_reason ? `Won reason: ${d.won_reason}` : "",
        d.lost_reason ? `Lost reason: ${d.lost_reason}` : "",
        `\nCHAT CONVERSATION:\n${String(d.conversation).slice(-12000)}`,
        callText ? `\nCALL TRANSCRIPT:\n${callText}` : "",
      ].filter(Boolean).join("\n");
      const r = await vaultTrain({ clientName: String(d.client_name || d.client_handle), context: ctx, hasCall: !!callText, config });
      return { success: true, tutorial: r.tutorial, client: String(d.client_name || d.client_handle), hasCall: !!callText };
    } catch (e: any) { return { success: false, error: e?.message || "Could not build the tutorial." }; }
  }

  return { success: false, error: `Unknown bd action: ${action}` };
}
