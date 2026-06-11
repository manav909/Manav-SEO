/* ════════════════════════════════════════════════════════════════
   api/lib/bd-strategist.ts

   BUILD 12.39 — Business-development conversation strategist.

   The brain of the deal workspace. Given the running client conversation
   (the seller's and the client's messages) plus the brief and any context,
   it reads the whole thread and returns a conversion strategy: where the
   deal stands, what the client actually wants, the single best next move,
   a ready-to-send reply in the seller's voice, concrete action items
   (including what the platform can do — run a demo audit, ingest their
   files, connect GSC), a call script for any upcoming call, and risk flags.

   Honest by design: it strategises to WIN the order, but the draft reply
   never promises results or capabilities that are not real, and it flags
   where a claim would be dishonest. It is a sales-and-senior-DMS adviser,
   not a fabricator.
════════════════════════════════════════════════════════════════ */

import { llm, parseJsonResponse } from "./workspace/llm.js";

export interface DealStrategy {
  detected_client: string;
  client_site:     string;
  messages:     Array<{ sender: string; text: string }>;
  deal_state:   { stage: string; temperature: string; summary: string };
  client_intel: { wants: string[]; pain_points: string[]; buying_signals: string[]; objections: string[]; budget_signals: string[] };
  next_move:    string;
  draft_reply:  string;
  action_items: Array<{ action: string; why: string; platform_can_help: boolean }>;
  call_script:  { needed: boolean; opening: string; discovery_questions: string[]; value_points: string[]; objection_handling: string[]; close: string };
  needs_attachments: Array<{ kind: string; what: string; note: string }>;
  reminders:    Array<{ text: string; when: string }>;
  risk_flags:   string[];
  generated_at: string;
}

const SYSTEM = [
  `You are an elite Fiverr business-development strategist AND a senior digital-marketing / SEO-AEO technical expert. You are helping a freelancer (the SELLER) convert a client conversation into a hired order, deliver well, and earn repeat orders.`,
  `You are given the running conversation (label whose message is whose), the brief, and any context. Read the WHOLE thread and strategise the seller's next move.`,
  ``,
  `Fiverr context and rules to respect:`,
  `- Keep all communication and payment ON Fiverr; never suggest moving off-platform (it risks the seller's account).`,
  `- Fiverr call recordings are available for about 30 days only. If a call happened or is scheduled, remind the seller to save or transcribe it before it expires, and to add the transcript to this deal.`,
  `- A custom offer defines the scope; extra requests beyond it should become a new offer/order, not free work — flag scope creep.`,
  `- Orders have delivery deadlines and revision limits; respect them and flag risks.`,
  ``,
  `Produce:`,
  `- needs_attachments: anything the conversation REFERENCES that the seller should add to this deal so it can be used — a brief/document the client shared, a file to review before a call, a call transcript, screenshots. Each {"kind":"document"|"transcript"|"file","what":"...","note":"..."}. Empty if none referenced.`,
  `- reminders: time-sensitive things to remember, each {"text":"...","when":"..."}. Include the 30-day call-recording save when a call is involved, and follow-up timing if the client may go quiet.`,
  `- detected_client: the client's name or handle as it appears in the conversation (empty string if not stated).`,
  `- client_site: the client's website domain if mentioned anywhere (bare domain, no protocol; empty if none).`,
  `- messages: the conversation parsed into ordered turns, each {"sender":"client" or "seller","text":"..."}. 'seller' is the freelancer (often labelled 'Me'); 'client' is the buyer. Strip timestamps and labels from the text.`,
  `- deal_state: stage (one of: new_lead, qualifying, proposal, negotiating, demo_requested, closing, hired, in_delivery, repeat, stalled, lost), temperature (hot/warm/cold), and a one-line summary of where it stands.`,
  `- client_intel: what the client wants, their pain points, buying signals, objections (stated or likely), and any budget signals — all read from the conversation.`,
  `- next_move: the single best thing the seller should do next, and why, in plain terms.`,
  `- draft_reply: a ready-to-send message in a warm, confident, professional seller voice — specific to this client, moving the deal forward. Conversion-focused but NEVER pushy, and NEVER promising results, timelines, or capabilities that are not real. If the client asked something technical, answer it credibly at a senior-SEO level.`,
  `- action_items: concrete things to do now. For each, set platform_can_help true if the seller's own SEO platform can do it (for example: run a live demo audit of the client's site, ingest a document/transcript the client shared, pull Search Console data if the client granted access, build a sample deliverable).`,
  `- call_script: if a call is upcoming or likely, set needed true and give an opening, discovery questions, value points, objection handling, and a close. Otherwise needed false.`,
  `- risk_flags: anything that could lose the deal or that the seller should be careful about (scope creep, unrealistic expectations, price sensitivity, ghosting risk, a request that would require over-promising).`,
  ``,
  `HARD RULES: base everything on the actual conversation and context. Do not invent client statements. The draft reply must be truthful — no fake case studies, no guaranteed rankings, no invented results. If winning the deal seems to need a claim that is not true, flag it in risk_flags instead of writing it.`,
  ``,
  `Return ONLY valid JSON, no prose, no fences:`,
  `{"detected_client":"...","client_site":"...","messages":[{"sender":"client","text":"..."}],"deal_state":{"stage":"...","temperature":"...","summary":"..."},"client_intel":{"wants":["..."],"pain_points":["..."],"buying_signals":["..."],"objections":["..."],"budget_signals":["..."]},"next_move":"...","draft_reply":"...","action_items":[{"action":"...","why":"...","platform_can_help":false}],"call_script":{"needed":false,"opening":"...","discovery_questions":["..."],"value_points":["..."],"objection_handling":["..."],"close":"..."},"needs_attachments":[{"kind":"document","what":"...","note":"..."}],"reminders":[{"text":"...","when":"..."}],"risk_flags":["..."]}`,
].join("\n");

const EMPTY: DealStrategy = {
  detected_client: "", client_site: "", messages: [],
  deal_state: { stage: "new_lead", temperature: "cold", summary: "" },
  client_intel: { wants: [], pain_points: [], buying_signals: [], objections: [], budget_signals: [] },
  next_move: "", draft_reply: "", action_items: [],
  call_script: { needed: false, opening: "", discovery_questions: [], value_points: [], objection_handling: [], close: "" },
  needs_attachments: [], reminders: [],
  risk_flags: [], generated_at: "",
};

const arr = (x: any): string[] => Array.isArray(x) ? x.filter((s: any) => typeof s === "string") : [];

export async function strategizeDeal(opts: { conversation: string; brief?: string; clientName?: string; context?: string }): Promise<{ ok: boolean; strategy: DealStrategy; error?: string }> {
  const now = new Date().toISOString();
  const convo = String(opts.conversation || "").trim();
  if (!convo) return { ok: false, strategy: { ...EMPTY, generated_at: now }, error: "Paste the client conversation first." };

  const user = [
    opts.clientName ? `Client: ${opts.clientName}.` : ``,
    opts.brief ? `Brief / service:\n${String(opts.brief).slice(0, 6000)}` : ``,
    opts.context ? `Context (the seller's platform, prior research, shared documents and call transcripts):\n${String(opts.context).slice(0, 16000)}` : ``,
    `Conversation so far (strategise the seller's next move):\n${convo.slice(0, 40000)}`,
  ].filter(Boolean).join("\n\n");

  const run = async (): Promise<DealStrategy | null> => {
    const raw = await llm({ system: SYSTEM, user, maxTokens: 4500, timeoutMs: 90000, label: "bd-strategist" });
    const p = parseJsonResponse<any>(raw);
    if (!p || !p.deal_state) return null;
    return {
      detected_client: String(p.detected_client || "").slice(0, 120),
      client_site: String(p.client_site || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""),
      messages: Array.isArray(p.messages) ? p.messages.map((m: any) => ({ sender: m?.sender === "seller" ? "seller" : "client", text: String(m?.text || "") })).filter((m: any) => m.text) : [],
      deal_state: { stage: String(p.deal_state?.stage || "new_lead"), temperature: String(p.deal_state?.temperature || ""), summary: String(p.deal_state?.summary || "") },
      client_intel: { wants: arr(p.client_intel?.wants), pain_points: arr(p.client_intel?.pain_points), buying_signals: arr(p.client_intel?.buying_signals), objections: arr(p.client_intel?.objections), budget_signals: arr(p.client_intel?.budget_signals) },
      next_move: String(p.next_move || ""),
      draft_reply: String(p.draft_reply || ""),
      action_items: Array.isArray(p.action_items) ? p.action_items.map((a: any) => ({ action: String(a?.action || ""), why: String(a?.why || ""), platform_can_help: Boolean(a?.platform_can_help) })).filter((a: any) => a.action) : [],
      call_script: { needed: Boolean(p.call_script?.needed), opening: String(p.call_script?.opening || ""), discovery_questions: arr(p.call_script?.discovery_questions), value_points: arr(p.call_script?.value_points), objection_handling: arr(p.call_script?.objection_handling), close: String(p.call_script?.close || "") },
      needs_attachments: Array.isArray(p.needs_attachments) ? p.needs_attachments.map((a: any) => ({ kind: String(a?.kind || "file"), what: String(a?.what || ""), note: String(a?.note || "") })).filter((a: any) => a.what) : [],
      reminders: Array.isArray(p.reminders) ? p.reminders.map((r: any) => ({ text: String(r?.text || ""), when: String(r?.when || "") })).filter((r: any) => r.text) : [],
      risk_flags: arr(p.risk_flags),
      generated_at: now,
    };
  };

  try {
    let s = await run();
    if (!s) s = await run();
    if (!s) return { ok: false, strategy: { ...EMPTY, generated_at: now }, error: "Could not produce a strategy this time. Try again." };
    return { ok: true, strategy: s };
  } catch (e: any) {
    return { ok: false, strategy: { ...EMPTY, generated_at: now }, error: e?.message || "strategist failed" };
  }
}
