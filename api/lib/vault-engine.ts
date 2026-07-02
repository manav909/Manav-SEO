/* ════════════════════════════════════════════════════════════════
   api/lib/vault-engine.ts

   VAULT — the client-intelligence brain.

   Pure compute + pure LLM. This file never touches the database;
   bd-engine.ts loads the CRM data (bd_deals / bd_learnings / bd_settings)
   and calls these functions, then handles caching and persistence.

   Build 1 capabilities:
     computeActivity()  deterministic activity stats over a time window
     vaultAsk()         ask anything about one client or the whole population
     vaultReport()      hourly / daily / weekly + on-demand report narrative

   Grounded by design: every answer and report is built ONLY from the
   supplied data. It never invents a client, a number, a status or a trend.
   Build 2 will add the coaching pair (BDM gap analysis + training tutorials).
════════════════════════════════════════════════════════════════ */

import { llm, llmComplete } from "./workspace/llm.js";

export interface VaultDeal {
  id?: string; client_name?: string; client_handle?: string; status?: string; outcome?: string;
  deal_value?: number; country?: string; industry?: string; client_type?: string;
  created_at?: string; updated_at?: string; last_message_at?: string;
  strategy?: any; stage_history?: any; engagement?: any;
}

export interface VaultDigest {
  name: string; handle: string; status: string; temperature: string; health: string;
  country: string; value: number; idleDays: number | null; next_move: string; summary: string; timing: string;
}

const CLOSED = ["hired", "repeat", "lost", "archived"];

function asTime(s: any): number { const t = s ? new Date(s).getTime() : 0; return isNaN(t) ? 0 : t; }
function strat(d: VaultDeal): any { return d && d.strategy && typeof d.strategy === "object" ? d.strategy : null; }
function tempOf(d: VaultDeal): string { const s = strat(d); return String((s && s.deal_state && s.deal_state.temperature) || "").toLowerCase(); }
function healthOf(d: VaultDeal): string { const s = strat(d); return String((s && s.verdict && s.verdict.health) || "").toLowerCase(); }
function nextMoveOf(d: VaultDeal): string { const s = strat(d); return String((s && ((s.verdict && s.verdict.next_move) || s.next_move)) || "").trim(); }
function summaryOf(d: VaultDeal): string { const s = strat(d); return String((s && ((s.verdict && s.verdict.headline) || (s.deal_state && s.deal_state.summary))) || "").trim(); }
function idleDaysOf(d: VaultDeal, now: number): number | null { const t = asTime(d.updated_at) || asTime(d.last_message_at); return t ? Math.floor((now - t) / 86400000) : null; }

// ---------- timing / availability summary (IST is the operator clock, fixed UTC+5:30) ----------
const IST_OFFSET = 330;
function istHourOf(d: Date): number { return Math.floor(((d.getUTCHours() * 60 + d.getUTCMinutes() + IST_OFFSET) % 1440) / 60); }
function fmtMin(mins: number): string { mins = ((Math.round(mins) % 1440) + 1440) % 1440; let hh = Math.floor(mins / 60); const ap = hh < 12 ? "am" : "pm"; hh = hh % 12 === 0 ? 12 : hh % 12; const mm = mins % 60; return hh + (mm ? ":" + String(mm).padStart(2, "0") : "") + ap; }

// Turn a stored engagement object { times[], last_seen, local_time, timezone } into a readable
// one-line timing summary so Vault can reason about when each client is active and their zone.
export function engagementSummary(e: any): string {
  if (!e || typeof e !== "object") return "";
  const times: any[] = Array.isArray(e.times) ? e.times : [];
  const hourly = new Array(24).fill(0); let count = 0;
  for (const t of times) {
    let hr = -1;
    if (typeof t === "string" && t[0] === "T") hr = parseInt(t.slice(1, 3), 10);
    else { const d = new Date(t); if (!isNaN(d.getTime())) hr = istHourOf(d); }
    if (hr >= 0 && hr < 24) { hourly[hr]++; count++; }
  }
  let peak = -1, peakSum = -1;
  for (let i = 0; i < 24; i++) { const s = hourly[i] + hourly[(i + 1) % 24] + hourly[(i + 2) % 24]; if (s > peakSum) { peakSum = s; peak = i; } }
  const istWindow = (count && peak >= 0 && peakSum > 0) ? (fmtMin(peak * 60) + "-" + fmtMin((peak + 3) * 60)) : "";
  const istNowMin = (Math.floor(Date.now() / 60000) % 1440 + IST_OFFSET) % 1440;
  let offsetMin: number | null = null;
  const lt = String(e.local_time || "").match(/(\d{1,2}):(\d{2})\s*([ap])?/i);
  if (lt) { let hh = parseInt(lt[1], 10) % 12; if (lt[3] && /p/i.test(lt[3])) hh += 12; let diff = (hh * 60 + parseInt(lt[2], 10)) - istNowMin; while (diff > 720) diff -= 1440; while (diff < -720) diff += 1440; offsetMin = Math.round(diff / 15) * 15; }
  else if (e.timezone) { const gm = String(e.timezone).match(/(?:GMT|UTC)\s*([+\-])\s*(\d{1,2})(?::?(\d{2}))?/i); if (gm) offsetMin = (parseInt(gm[2], 10) * 60 + (gm[3] ? parseInt(gm[3], 10) : 0)) * (gm[1] === "-" ? -1 : 1) - IST_OFFSET; }
  const parts: string[] = [];
  if (istWindow) parts.push(`usually messages around ${istWindow} IST` + (offsetMin != null ? ` (their ${fmtMin(peak * 60 + offsetMin)}-${fmtMin((peak + 3) * 60 + offsetMin)})` : ""));
  if (offsetMin != null) { const rel = offsetMin === 0 ? "same time as you" : ((Math.abs(offsetMin) % 60 === 0 ? String(Math.abs(offsetMin) / 60) : (Math.abs(offsetMin) / 60).toFixed(1)) + "h " + (offsetMin < 0 ? "behind you" : "ahead of you")); parts.push(`client local now ~${fmtMin(istNowMin + offsetMin)} (${rel})`); }
  else if (e.local_time) parts.push(`client local time ${e.local_time}`);
  if (e.last_seen) parts.push(String(e.last_seen));
  if (count) parts.push(`${count} activity points`);
  return parts.join(" · ");
}

export function digestOf(d: VaultDeal, now = Date.now()): VaultDigest {
  return {
    name: String(d.client_name || d.client_handle || "Unknown"),
    handle: String(d.client_handle || ""),
    status: String(d.status || "lead"),
    temperature: tempOf(d),
    health: healthOf(d),
    country: String(d.country || "").trim(),
    value: Number(d.deal_value || 0),
    idleDays: idleDaysOf(d, now),
    next_move: nextMoveOf(d),
    summary: summaryOf(d),
    timing: engagementSummary(d.engagement),
  };
}

// ---------- deterministic activity over a window (real numbers, no LLM) ----------
export function computeActivity(deals: VaultDeal[], startMs: number, endMs: number) {
  const now = Date.now();
  const inWin = (t: number) => t >= startMs && t <= endMs;
  const active = deals.filter((d) => !CLOSED.includes(String(d.status || "")));
  const newLeads = deals.filter((d) => inWin(asTime(d.created_at)));
  const touched = deals.filter((d) => inWin(asTime(d.updated_at)) || inWin(asTime(d.last_message_at)));
  const wonWin = deals.filter((d) => d.outcome === "won" && inWin(asTime(d.updated_at)));
  const lostWin = deals.filter((d) => d.outcome === "lost" && inWin(asTime(d.updated_at)));
  let statusChanges = 0;
  for (const d of deals) {
    const sh = Array.isArray(d.stage_history) ? d.stage_history : [];
    for (const ev of sh) { const t = asTime(ev && (ev.at || ev.when || ev.t)); if (t && inWin(t)) statusChanges++; }
  }
  const hanging = active
    .filter((d) => { const t = asTime(d.updated_at) || asTime(d.last_message_at); return t && now - t > 4 * 86400000; })
    .map((d) => digestOf(d, now)).sort((a, b) => (b.idleDays || 0) - (a.idleDays || 0)).slice(0, 25);
  const hot = active.filter((d) => ["hot", "warm"].includes(tempOf(d)))
    .map((d) => digestOf(d, now)).sort((a, b) => (a.temperature === "hot" ? 0 : 1) - (b.temperature === "hot" ? 0 : 1)).slice(0, 25);
  const atRisk = active.filter((d) => ["at_risk", "watch"].includes(healthOf(d))).map((d) => digestOf(d, now)).slice(0, 25);
  const inPlay = touched.filter((d) => !CLOSED.includes(String(d.status || ""))).map((d) => digestOf(d, now)).sort((a, b) => (a.idleDays == null ? 1 : a.idleDays) - (b.idleDays == null ? 1 : b.idleDays)).slice(0, 40);
  const tally = (arr: VaultDeal[], k: keyof VaultDeal) => {
    const m: Record<string, number> = {};
    for (const d of arr) { const key = (String(d[k] || "").trim() || "Unknown"); m[key] = (m[key] || 0) + 1; }
    return Object.entries(m).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  };
  return {
    counts: { total: deals.length, active: active.length, newLeads: newLeads.length, touched: touched.length, won: wonWin.length, lost: lostWin.length, statusChanges },
    byStatus: tally(active, "status"),
    byCountry: tally(active, "country"),
    hanging, hot, atRisk, inPlay,
  };
}

// ---------- omniscient ask (one client OR the population) ----------
export async function vaultAsk(o: { question: string; scope: "client" | "population"; context: string; history?: string; config?: any }): Promise<{ answer: string }> {
  const depth = String((o.config && o.config.depth) || "standard");
  const system = [
    "You are Vault, the senior business-intelligence brain for a Fiverr SEO and digital-marketing agency run by Manav S.",
    "You have been given the agency own CRM data, chat transcripts, and call notes about its clients and leads. Answer the operator question GROUNDED ONLY in the data provided below.",
    "",
    "GROUNDING (non-negotiable):",
    "- Use only the supplied data. If the answer is not in it, say so plainly and name what is missing. Never invent a fact, number, status, date, quote, or client.",
    "- Every claim must trace to the data. When a specific behaviour, quote, or moment is your evidence, cite it directly (a short verbatim quote from the transcript) rather than paraphrasing it away.",
    "- Name the specific client or lead the answer is about, and any status, value, country, or next move must come from the data.",
    "",
    "ANALYTICAL DEPTH (this is what the operator is paying for):",
    "- Think like a senior sales director reviewing a rep: causal, specific, decision-useful. Do not merely list what happened — explain WHY each move helped or hurt the outcome, and what it reveals about the rep's skill.",
    "- For a performance evaluation of a named team member (BDM / closer / rep), structure the analysis as four grounded sections:",
    "    1. What was done well — each point named, with the exact evidence (a quote or data point) that proves it and a one-line note on why it moved the deal forward.",
    "    2. What needs attention — each risk named, with the concrete consequence if left unaddressed AND the specific corrective action, timed and worded where useful.",
    "    3. What specifically brought this deal home — the two or three causal factors that actually closed it, each tied to evidence, ranked by impact.",
    "    4. What could make this deal fail — the live risks in chat, on the next call, or during delivery, each with how to defuse it.",
    "- Surface the non-obvious: patterns across messages, timing, tone shifts, what the client did NOT say, mismatches between what was promised verbally and contractually. This is where real depth lives.",
    "- Distinguish behaviours you can attribute from ones you cannot. If the data names a different operator than the one asked about, say so once, plainly, then evaluate the behaviour in the record.",
    "",
    "STYLE:",
    depth === "brief" ? "- Keep it tight: the decision and the one reason, a few sentences." : depth === "deep" ? "- Be thorough and complete: cover every relevant client, the evidence behind each point, and the recommended actions. Do not stop early or summarise away detail — but never pad. Depth means more grounded insight, not more words." : "- Be concise but complete: cover the answer, the key evidence, and the next move.",
    "- No sycophancy, no filler, no hedging boilerplate. Clean Markdown: bold key facts and client names, bullet lists where they aid scanning, and ## subheadings when the answer is long. Never fabricate to fill a section — if a section has no evidence, say the data does not support it.",
  ].join("\n");
  const user = (o.history ? `Recent conversation for context:\n${o.history}\n\n` : "") +
    `CRM DATA (${o.scope === "client" ? "the client in focus" : "the client and lead population"}):\n${o.context}\n\nOperator question:\n${o.question}\n\nAnswer grounded only in the data above, at full depth, and do not cut off before the analysis is complete.`;
  /* Continuation-safe so a full evaluation is never truncated at the token
     ceiling, with a raised base so a normal answer completes in one segment. */
  const { text } = await llmComplete({
    system, user,
    maxTokens: depth === "deep" ? 8000 : depth === "brief" ? 1200 : 4000,
    timeoutMs: 90000,
    label: "vault-ask",
    maxSegments: 3,
  });
  return { answer: String(text || "").trim() || "I could not produce an answer from the data on file. Try rephrasing, or confirm the client exists in the workspace." };
}

// ---------- windowed / on-demand report ----------
export async function vaultReport(o: { kind: string; windowLabel: string; scopeLabel: string; stats: any; digests: string; config?: any }): Promise<{ narrative: string }> {
  const depth = String((o.config && o.config.depth) || "standard");
  const system = [
    "You are Vault, the senior business-intelligence brain for a Fiverr SEO and digital-marketing agency run by Manav S.",
    `Write the ${o.windowLabel} activity report for the agency Fiverr leads, GROUNDED ONLY in the real numbers and lead digests provided.`,
    "Structure it as clean Markdown with a ## header for each section:",
    "## Bottom line — two or three sentences on the state of play this period.",
    "## What moved — new leads, activity, status changes, wins and losses this period as a bullet list, citing the real counts.",
    "## Needs attention now — the hanging, at-risk and hot leads that need action as a bullet list, each lead name in bold, with the one concrete next move, prioritised by money and urgency.",
    "## Recommendations — the few highest-leverage actions for the operator and the BDM team, as a numbered list.",
    "Use bold for lead names and key numbers throughout.",
    "Rules: use only the supplied numbers and leads; never invent a client, a metric, or a trend. If a section has nothing, say so in one line. Be specific and decision-useful, senior-strategist tone, no filler, no sycophancy.",
    depth === "brief" ? "Keep the whole thing tight." : depth === "deep" ? "Be thorough across every named lead that needs attention." : "Be concise but complete.",
    o.config && o.config.sections ? `The operator wants these emphasised: ${o.config.sections}.` : "",
  ].filter(Boolean).join("\n");
  const user = `Scope: ${o.scopeLabel}\n\nReal activity numbers:\n${JSON.stringify(o.stats.counts)}\nActive by status: ${JSON.stringify(o.stats.byStatus)}\nActive by country: ${JSON.stringify(o.stats.byCountry)}\n\nLeads needing attention:\n${o.digests}\n\nWrite the ${o.windowLabel} report now.`;
  const narrative = await llm({ system, user, maxTokens: depth === "deep" ? 2600 : 1700, timeoutMs: 100000, label: "vault-report" });
  return { narrative: String(narrative || "").trim() || "Could not generate the report narrative just now. The activity numbers above are still accurate." };
}

// ---------- BDM gap analysis (team handling quality across recent conversations) ----------
export async function vaultGaps(o: { corpus: string; count: number; config?: any }): Promise<{ analysis: string }> {
  const depth = String((o.config && o.config.depth) || "standard");
  const system = [
    "You are Vault, the senior sales-coaching brain for a Fiverr SEO and digital-marketing agency run by Manav S.",
    "You are reviewing how the agency BDMs (the seller side) actually handled recent client conversations, in order to coach the team.",
    "You are given a corpus of recent leads, each with its status and outcome and a recent excerpt of the conversation (both the BDM messages and the client messages).",
    "Find what the BDM team is MISSING and what needs to be corrected. Look specifically for: slow or absent first response; ignored buying signals; no clear call to action or next step; vague or generic replies; over-promising or dishonest claims; missed upsell or scope-expansion openings; weak or absent objection handling; failure to qualify or discover the client need; ghosted threads not followed up; talking about the agency instead of the client problem.",
    "Output clean Markdown with a ## header for each section:",
    "## Bottom line — the two or three biggest handling gaps across the team right now.",
    "## Gaps — a ### sub-header per gap, then under each: how often it shows up, which leads show it (names in bold), what correct looks like, and the specific fix.",
    "## What is working — handling strengths worth keeping, as a bullet list with examples.",
    "## Fix first — the highest-leverage corrections as a numbered list, in priority order.",
    "Rules: ground every point in the actual conversations supplied; name the real leads as evidence; never invent a quote, a lead, or a pattern that is not in the data. If the data is thin, say so. Senior sales-coach tone, direct and specific, no filler, no sycophancy.",
    depth === "brief" ? "Keep it tight." : depth === "deep" ? "Be thorough across every gap you can evidence." : "Be concise but complete.",
    o.config && o.config.sections ? `The operator also wants you to weigh: ${o.config.sections}.` : "",
  ].filter(Boolean).join("\n");
  const user = `Recent leads reviewed: ${o.count}.\n\nCONVERSATION CORPUS (most recent excerpts):\n${o.corpus}\n\nProduce the coaching analysis now, grounded only in these conversations.`;
  const analysis = await llm({ system, user, maxTokens: depth === "deep" ? 3000 : 2000, timeoutMs: 110000, label: "vault-gaps" });
  return { analysis: String(analysis || "").trim() || "Not enough conversation data on file yet to analyse handling gaps." };
}

// ---------- training tutorial from one real client chat + call ----------
export async function vaultTrain(o: { clientName: string; context: string; hasCall: boolean; config?: any }): Promise<{ tutorial: string }> {
  const depth = String((o.config && o.config.depth) || "standard");
  const system = [
    "You are Vault, the senior sales-trainer for a Fiverr SEO and digital-marketing agency run by Manav S.",
    `Build a TRAINING TUTORIAL for the agency BDMs from one real client: ${o.clientName}. Use the actual conversation${o.hasCall ? " and call transcript" : ""} provided.`,
    "This is internal coaching on the agency own client, so quote the real messages directly.",
    "Teach by walking the real interaction. Structure as clean Markdown:",
    "## Scenario — who the client was, what they wanted, and where the deal went, using the real facts and outcome.",
    "## Key moments — a ### sub-header per moment. Under each, put the real quoted excerpt (chat or call) in a > blockquote, then short bold-labelled lines: **What happened**, **Handled well**, **Missed**, **Better move**, **Principle**.",
    "Cover the full range present: the opening, qualifying and discovery, pricing or budget, objections or hesitation, scope, the close or commitment, and follow-up.",
    o.hasCall ? "Treat the call and the chat together; note where a call moment should have been handled differently." : "There is no call transcript on file, so train on the chat and say so once near the top.",
    "## Lessons — the handful of transferable takeaways as a bullet list.",
    "Rules: quote only real excerpts from the supplied material; never invent a line, a moment, or a fact. If something was handled well, say so plainly; if it was weak, be direct about why and give the fix. Senior-trainer tone, concrete and usable, no filler.",
    depth === "brief" ? "Keep it focused on the few most instructive moments." : depth === "deep" ? "Be thorough across every instructive moment in the interaction." : "Cover the main instructive moments.",
  ].filter(Boolean).join("\n");
  const user = `CLIENT MATERIAL for ${o.clientName}:\n${o.context}\n\nWrite the training tutorial now, grounded only in this material.`;
  /* Generated with continuation so the tutorial is never cut off at the token
     ceiling. A normal doc completes in one segment at this raised cap; longer
     interactions auto-continue to completion. */
  const { text } = await llmComplete({
    system, user,
    maxTokens: depth === "deep" ? 8000 : 6000,
    timeoutMs: 90000,
    label: "vault-train",
    maxSegments: 3,
  });
  const tutorial = text;
  return { tutorial: String(tutorial || "").trim() || `Not enough conversation data on file for ${o.clientName} to build a tutorial yet.` };
}
