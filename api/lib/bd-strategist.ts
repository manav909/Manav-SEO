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
  deal_state:   { stage: string; temperature: string; summary: string };
  client_intel: { wants: string[]; pain_points: string[]; buying_signals: string[]; objections: string[]; budget_signals: string[] };
  next_move:    string;
  draft_reply:  string;
  action_items: Array<{ action: string; why: string; platform_can_help: boolean }>;
  call_script:  { needed: boolean; opening: string; discovery_questions: string[]; value_points: string[]; objection_handling: string[]; close: string };
  needs_attachments: Array<{ kind: string; what: string; note: string }>;
  reminders:    Array<{ text: string; when: string }>;
  deal_facts:   { budget: string; timeline: string; location: string; platform: string; service: string; deliverables: string[]; urls: string[]; competitors: string[]; prices_discussed: string[]; files_shared: string[]; key_dates: string[]; other_facts: string[] };
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
  `- deal_facts: EVERY concrete fact actually STATED in the chat (do not infer): budget (stated budget or price the client gave), timeline (deadlines/turnaround they mentioned), location (their location/timezone), platform (their CMS/platform), service (the gig or service requested), deliverables (the explicit list of things they asked for — each as a separate item, verbatim where possible), urls (every website or domain mentioned), competitors (competitor names or sites mentioned), prices_discussed (any prices or offers mentioned in the conversation), files_shared (files, documents, or links the client referenced or shared), key_dates (specific dates or times mentioned), other_facts (any other concrete detail worth keeping). Use empty string/array where a fact is not present. Capture, do not summarise.`,
  `- detected_client: the client's name or handle as it appears in the conversation (empty string if not stated).`,
  `- client_site: the client's website domain if mentioned anywhere (bare domain, no protocol; empty if none).`,
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
  `{"detected_client":"...","client_site":"...","deal_state":{"stage":"...","temperature":"...","summary":"..."},"client_intel":{"wants":["..."],"pain_points":["..."],"buying_signals":["..."],"objections":["..."],"budget_signals":["..."]},"next_move":"...","draft_reply":"...","action_items":[{"action":"...","why":"...","platform_can_help":false}],"call_script":{"needed":false,"opening":"...","discovery_questions":["..."],"value_points":["..."],"objection_handling":["..."],"close":"..."},"needs_attachments":[{"kind":"document","what":"...","note":"..."}],"reminders":[{"text":"...","when":"..."}],"deal_facts":{"budget":"","timeline":"","location":"","platform":"","service":"","deliverables":[],"urls":[],"competitors":[],"prices_discussed":[],"files_shared":[],"key_dates":[],"other_facts":[]},"risk_flags":["..."]}`,
].join("\n");

const EMPTY: DealStrategy = {
  detected_client: "", client_site: "",
  deal_state: { stage: "new_lead", temperature: "cold", summary: "" },
  client_intel: { wants: [], pain_points: [], buying_signals: [], objections: [], budget_signals: [] },
  next_move: "", draft_reply: "", action_items: [],
  call_script: { needed: false, opening: "", discovery_questions: [], value_points: [], objection_handling: [], close: "" },
  needs_attachments: [], reminders: [],
  deal_facts: { budget: "", timeline: "", location: "", platform: "", service: "", deliverables: [], urls: [], competitors: [], prices_discussed: [], files_shared: [], key_dates: [], other_facts: [] },
  risk_flags: [], generated_at: "",
};

const arr = (x: any): string[] => Array.isArray(x) ? x.filter((s: any) => typeof s === "string") : [];

/* ─── Conversion generators (offer, roadmap, reply variants) — grounded in
   the deal facts + conversation + any audit. ─── */
function ctxBlock(o: { conversation?: string; facts?: string; attachments?: string }): string {
  return [
    o.facts ? `Captured deal facts: ${String(o.facts).slice(0, 4000)}` : ``,
    o.attachments ? `Audit / shared files:\n${String(o.attachments).slice(0, 8000)}` : ``,
    o.conversation ? `Conversation:\n${String(o.conversation).slice(0, 20000)}` : ``,
  ].filter(Boolean).join("\n\n");
}

export interface OfferResult { recommended_package: string; price_band: string; delivery_time: string; scope: string[]; deliverables: string[]; addons: Array<{ name: string; price: string }>; rationale: string; offer_text: string }
export async function buildOffer(o: { conversation?: string; facts?: string; attachments?: string }): Promise<{ ok: boolean; offer?: OfferResult; error?: string }> {
  const system = [
    `You are a senior Fiverr SEO/AEO seller building a custom offer for a specific client. Use the deal facts (budget, requirements, timeline, platform), the conversation, and any audit findings.`,
    `Recommend a realistic Fiverr custom offer. If the client stated a budget, respect it or justify a sensible range around it. Scope must match the price — do not over-promise. Pricing should reflect typical Fiverr SEO/AEO ranges, not agency retainers.`,
    `Return: recommended_package (name), price_band (a USD range), delivery_time, scope (what is included, list), deliverables (concrete outputs, list), addons (optional extras with a price each), rationale (one short paragraph on why this scope/price fits), and offer_text (the exact message to send to the client alongside the Fiverr offer).`,
    `HARD RULES: no guaranteed rankings or fabricated outcomes; be honest about what is and is not included; keep it senior and practical.`,
    `Return ONLY JSON: {"recommended_package":"...","price_band":"...","delivery_time":"...","scope":["..."],"deliverables":["..."],"addons":[{"name":"...","price":"..."}],"rationale":"...","offer_text":"..."}`,
  ].join("\n");
  try {
    const raw = await llm({ system, user: ctxBlock(o) + `\n\nBuild the recommended custom offer.`, maxTokens: 2500, timeoutMs: 80000, label: "bd-build-offer" });
    const p = parseJsonResponse<any>(raw);
    if (!p) return { ok: false, error: "Could not build the offer. Try again." };
    return { ok: true, offer: { recommended_package: String(p.recommended_package || ""), price_band: String(p.price_band || ""), delivery_time: String(p.delivery_time || ""), scope: arr(p.scope), deliverables: arr(p.deliverables), addons: Array.isArray(p.addons) ? p.addons.map((a: any) => ({ name: String(a?.name || ""), price: String(a?.price || "") })).filter((a: any) => a.name) : [], rationale: String(p.rationale || ""), offer_text: String(p.offer_text || "") } };
  } catch (e: any) { return { ok: false, error: e?.message || "offer failed" }; }
}

export interface RoadmapResult { summary: string; phase_30: string[]; phase_60: string[]; phase_90: string[] }
export async function buildRoadmap(o: { conversation?: string; facts?: string; attachments?: string }): Promise<{ ok: boolean; roadmap?: RoadmapResult; error?: string }> {
  const system = [
    `You are a senior SEO/AEO strategist writing a credible 30/60/90-day plan for a specific client, to share during the sales conversation. Use the deal facts, the conversation, and any audit findings.`,
    `Be concrete and specific to this client (their platform, their issues, their goals) — not a generic template. Each phase is a short list of the actual work.`,
    `HARD RULES: honest and realistic; no guaranteed rankings; sequence the work sensibly (technical/foundation first, then content/authority, then AEO/scale).`,
    `Return ONLY JSON: {"summary":"...","phase_30":["..."],"phase_60":["..."],"phase_90":["..."]}`,
  ].join("\n");
  try {
    const raw = await llm({ system, user: ctxBlock(o) + `\n\nWrite the 30/60/90-day roadmap for this client.`, maxTokens: 2200, timeoutMs: 80000, label: "bd-build-roadmap" });
    const p = parseJsonResponse<any>(raw);
    if (!p) return { ok: false, error: "Could not build the roadmap. Try again." };
    return { ok: true, roadmap: { summary: String(p.summary || ""), phase_30: arr(p.phase_30), phase_60: arr(p.phase_60), phase_90: arr(p.phase_90) } };
  } catch (e: any) { return { ok: false, error: e?.message || "roadmap failed" }; }
}

export async function replyVariants(o: { conversation?: string; facts?: string; attachments?: string }): Promise<{ ok: boolean; variants?: Array<{ label: string; text: string }>; error?: string }> {
  const system = [
    `You are a senior Fiverr business developer. Given the conversation (and facts/audit), write THREE different strategic reply options to the client's latest message — each a distinct angle the seller could choose.`,
    `Make them genuinely different in approach (for example: "Answer + ask for the URL", "Answer + offer a quick free audit", "Answer + soft close toward an offer"). Each in a warm, confident seller voice.`,
    `HARD RULES: truthful — no guaranteed rankings or fabricated results; specific to this client.`,
    `Return ONLY JSON: {"variants":[{"label":"...","text":"..."},{"label":"...","text":"..."},{"label":"...","text":"..."}]}`,
  ].join("\n");
  try {
    const raw = await llm({ system, user: ctxBlock(o) + `\n\nWrite the three reply options.`, maxTokens: 2200, timeoutMs: 80000, label: "bd-reply-variants" });
    const p = parseJsonResponse<any>(raw);
    if (!p || !Array.isArray(p.variants)) return { ok: false, error: "Could not produce reply options. Try again." };
    return { ok: true, variants: p.variants.map((v: any) => ({ label: String(v?.label || ""), text: String(v?.text || "") })).filter((v: any) => v.text) };
  } catch (e: any) { return { ok: false, error: e?.message || "variants failed" }; }
}

export async function askExpert(opts: { question: string; conversation?: string; facts?: string; attachments?: string; strategySummary?: string }): Promise<{ ok: boolean; answer: string; client_reply: string; suggested_tools: string[]; error?: string }> {
  const q = String(opts.question || "").trim();
  if (!q) return { ok: false, answer: "", client_reply: "", suggested_tools: [], error: "Type your question or what you are thinking." };
  const system = [
    `You are a senior SEO and AEO technical expert AND a sharp Fiverr business developer, embedded inside a live client deal. The operator may be non-technical. They will ask you anything — a client's technical question, their own thinking, what to propose, or how to handle a tricky moment.`,
    `Use the FULL deal context (the conversation, the captured facts, any audit, shared files) to answer for THIS specific client.`,
    ``,
    `Return:`,
    `- answer: a clear, technically correct, senior-level answer or guidance — explained simply enough that a non-technical operator can both use it and relay it to the client. Be specific to this situation, not generic.`,
    `- client_reply: a ready-to-send message to the client when it helps (truthful, professional, no guaranteed rankings and no fabricated results). Empty string if not applicable.`,
    `- suggested_tools: any in-platform action that would strengthen the position right now, drawn from: "run the site audit", "pull a competitor snapshot", "check schema and AEO readiness", "review their GSC export", "build the offer". Empty if none.`,
    ``,
    `HARD RULES: be honest and accurate; never invent results, metrics, or capabilities; if you lack information, say what is needed; keep it practical and senior-grade.`,
    `Return ONLY valid JSON: {"answer":"...","client_reply":"...","suggested_tools":["..."]}`,
  ].join("\n");
  const user = [
    opts.strategySummary ? `Deal so far: ${opts.strategySummary}` : ``,
    opts.facts ? `Captured facts: ${String(opts.facts).slice(0, 4000)}` : ``,
    opts.attachments ? `Shared files / audit:\n${String(opts.attachments).slice(0, 10000)}` : ``,
    opts.conversation ? `Conversation:\n${String(opts.conversation).slice(0, 24000)}` : ``,
    ``,
    `The operator asks: ${q}`,
  ].filter(Boolean).join("\n\n");
  try {
    const raw = await llm({ system, user, maxTokens: 2500, timeoutMs: 80000, label: "bd-ask-expert" });
    const p = parseJsonResponse<any>(raw);
    if (!p) return { ok: false, answer: "", client_reply: "", suggested_tools: [], error: "Could not produce an answer. Try rephrasing." };
    return { ok: true, answer: String(p.answer || ""), client_reply: String(p.client_reply || ""), suggested_tools: arr(p.suggested_tools) };
  } catch (e: any) {
    return { ok: false, answer: "", client_reply: "", suggested_tools: [], error: e?.message || "ask failed" };
  }
}

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
      deal_state: { stage: String(p.deal_state?.stage || "new_lead"), temperature: String(p.deal_state?.temperature || ""), summary: String(p.deal_state?.summary || "") },
      client_intel: { wants: arr(p.client_intel?.wants), pain_points: arr(p.client_intel?.pain_points), buying_signals: arr(p.client_intel?.buying_signals), objections: arr(p.client_intel?.objections), budget_signals: arr(p.client_intel?.budget_signals) },
      next_move: String(p.next_move || ""),
      draft_reply: String(p.draft_reply || ""),
      action_items: Array.isArray(p.action_items) ? p.action_items.map((a: any) => ({ action: String(a?.action || ""), why: String(a?.why || ""), platform_can_help: Boolean(a?.platform_can_help) })).filter((a: any) => a.action) : [],
      call_script: { needed: Boolean(p.call_script?.needed), opening: String(p.call_script?.opening || ""), discovery_questions: arr(p.call_script?.discovery_questions), value_points: arr(p.call_script?.value_points), objection_handling: arr(p.call_script?.objection_handling), close: String(p.call_script?.close || "") },
      needs_attachments: Array.isArray(p.needs_attachments) ? p.needs_attachments.map((a: any) => ({ kind: String(a?.kind || "file"), what: String(a?.what || ""), note: String(a?.note || "") })).filter((a: any) => a.what) : [],
      reminders: Array.isArray(p.reminders) ? p.reminders.map((r: any) => ({ text: String(r?.text || ""), when: String(r?.when || "") })).filter((r: any) => r.text) : [],
      deal_facts: {
        budget: String(p.deal_facts?.budget || ""), timeline: String(p.deal_facts?.timeline || ""), location: String(p.deal_facts?.location || ""),
        platform: String(p.deal_facts?.platform || ""), service: String(p.deal_facts?.service || ""),
        deliverables: arr(p.deal_facts?.deliverables), urls: arr(p.deal_facts?.urls), competitors: arr(p.deal_facts?.competitors),
        prices_discussed: arr(p.deal_facts?.prices_discussed), files_shared: arr(p.deal_facts?.files_shared), key_dates: arr(p.deal_facts?.key_dates), other_facts: arr(p.deal_facts?.other_facts),
      },
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
