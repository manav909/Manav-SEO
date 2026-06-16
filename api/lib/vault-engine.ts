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

import { llm } from "./workspace/llm.js";

export interface VaultDeal {
  id?: string; client_name?: string; client_handle?: string; status?: string; outcome?: string;
  deal_value?: number; country?: string; industry?: string; client_type?: string;
  created_at?: string; updated_at?: string; last_message_at?: string;
  strategy?: any; stage_history?: any;
}

export interface VaultDigest {
  name: string; handle: string; status: string; temperature: string; health: string;
  country: string; value: number; idleDays: number | null; next_move: string; summary: string;
}

const CLOSED = ["hired", "repeat", "lost", "archived"];

function asTime(s: any): number { const t = s ? new Date(s).getTime() : 0; return isNaN(t) ? 0 : t; }
function strat(d: VaultDeal): any { return d && d.strategy && typeof d.strategy === "object" ? d.strategy : null; }
function tempOf(d: VaultDeal): string { const s = strat(d); return String((s && s.deal_state && s.deal_state.temperature) || "").toLowerCase(); }
function healthOf(d: VaultDeal): string { const s = strat(d); return String((s && s.verdict && s.verdict.health) || "").toLowerCase(); }
function nextMoveOf(d: VaultDeal): string { const s = strat(d); return String((s && ((s.verdict && s.verdict.next_move) || s.next_move)) || "").trim(); }
function summaryOf(d: VaultDeal): string { const s = strat(d); return String((s && ((s.verdict && s.verdict.headline) || (s.deal_state && s.deal_state.summary))) || "").trim(); }
function idleDaysOf(d: VaultDeal, now: number): number | null { const t = asTime(d.updated_at) || asTime(d.last_message_at); return t ? Math.floor((now - t) / 86400000) : null; }

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
    "You have been given the agency own CRM data about its clients and leads. Answer the operator question GROUNDED ONLY in the data provided below.",
    "Rules you must follow:",
    "- Use only the supplied data. If the answer is not in it, say so plainly and say what is missing. Never invent a fact, a number, a status, a date, or a client.",
    "- Name the specific client or clients your answer is about. Any status, value, country, or next move you state must come from the data.",
    "- Think like a senior digital-marketing strategist and sales lead: direct, specific, decision-useful. Lead with the answer, then the reason.",
    "- When asked what to do, give the concrete next action grounded in where the deal actually stands.",
    depth === "brief" ? "- Keep it tight: a few sentences." : depth === "deep" ? "- Be thorough: cover the relevant clients, the evidence, and the recommended actions." : "- Be concise but complete.",
    "- No sycophancy, no filler. Plain text with light markdown is fine. Do not fabricate.",
  ].join("\n");
  const user = (o.history ? `Recent conversation for context:\n${o.history}\n\n` : "") +
    `CRM DATA (${o.scope === "client" ? "the client in focus" : "the client and lead population"}):\n${o.context}\n\nOperator question:\n${o.question}\n\nAnswer grounded only in the data above.`;
  const answer = await llm({ system, user, maxTokens: depth === "deep" ? 2200 : 1400, timeoutMs: 90000, label: "vault-ask" });
  return { answer: String(answer || "").trim() || "I could not produce an answer from the data on file. Try rephrasing, or confirm the client exists in the workspace." };
}

// ---------- windowed / on-demand report ----------
export async function vaultReport(o: { kind: string; windowLabel: string; scopeLabel: string; stats: any; digests: string; config?: any }): Promise<{ narrative: string }> {
  const depth = String((o.config && o.config.depth) || "standard");
  const system = [
    "You are Vault, the senior business-intelligence brain for a Fiverr SEO and digital-marketing agency run by Manav S.",
    `Write the ${o.windowLabel} activity report for the agency Fiverr leads, GROUNDED ONLY in the real numbers and lead digests provided.`,
    "Structure it as plain text with short clear headers:",
    "1. Bottom line — two or three sentences on the state of play this period.",
    "2. What moved — new leads, activity, status changes, wins and losses this period, citing the real counts.",
    "3. Needs attention now — the hanging, at-risk and hot leads that need action, named, each with the one concrete next move, prioritised by money and urgency.",
    "4. Recommendations — the few highest-leverage actions for the operator and the BDM team for the next period.",
    "Rules: use only the supplied numbers and leads; never invent a client, a metric, or a trend. If a section has nothing, say so in one line. Be specific and decision-useful, senior-strategist tone, no filler, no sycophancy.",
    depth === "brief" ? "Keep the whole thing tight." : depth === "deep" ? "Be thorough across every named lead that needs attention." : "Be concise but complete.",
    o.config && o.config.sections ? `The operator wants these emphasised: ${o.config.sections}.` : "",
  ].filter(Boolean).join("\n");
  const user = `Scope: ${o.scopeLabel}\n\nReal activity numbers:\n${JSON.stringify(o.stats.counts)}\nActive by status: ${JSON.stringify(o.stats.byStatus)}\nActive by country: ${JSON.stringify(o.stats.byCountry)}\n\nLeads needing attention:\n${o.digests}\n\nWrite the ${o.windowLabel} report now.`;
  const narrative = await llm({ system, user, maxTokens: depth === "deep" ? 2600 : 1700, timeoutMs: 100000, label: "vault-report" });
  return { narrative: String(narrative || "").trim() || "Could not generate the report narrative just now. The activity numbers above are still accurate." };
}
