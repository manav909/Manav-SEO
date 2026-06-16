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
  verdict:      { headline: string; scope_change: string; health: string; health_reason: string; next_move: string; play: string; priority: string; priority_reason: string };
  deal_state:   { stage: string; temperature: string; summary: string };
  client_intel: { wants: string[]; pain_points: string[]; buying_signals: string[]; objections: string[]; budget_signals: string[]; tone: string };
  next_move:    string;
  expectations: string;
  draft_reply:  string;
  action_items: Array<{ action: string; why: string; platform_can_help: boolean }>;
  call_script:  { needed: boolean; opening: string; discovery_questions: string[]; value_points: string[]; objection_handling: string[]; close: string };
  needs_attachments: Array<{ kind: string; what: string; note: string }>;
  reminders:    Array<{ text: string; when: string }>;
  deal_facts:   { budget: string; timeline: string; location: string; country: string; platform: string; service: string; industry: string; client_type: string; deliverables: string[]; urls: string[]; competitors: string[]; target_keywords: string[]; prices_discussed: string[]; files_shared: string[]; key_dates: string[]; other_facts: string[] };
  risk_flags:   string[];
  generated_at: string;
}

const SYSTEM = [
  `You are an elite Fiverr business-development strategist AND a senior digital-marketing / SEO-AEO technical expert. You are helping a freelancer (the SELLER) convert a client conversation into a hired order, deliver well, and earn repeat orders.`,
  `You are given the running conversation (label whose message is whose), the brief, and any context. Read the WHOLE thread and strategise the seller's next move.`,
  `If the seller has added their OWN context or read of this client (shown as "SELLER'S OWN CONTEXT"), treat it as AUTHORITATIVE — it reflects their direct knowledge and instructions — and let it lead your analysis, next move, and draft reply, even where it overrides what the chat alone would suggest.`,
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
  `- deal_facts: EVERY concrete fact actually STATED in the chat (do not infer the facts): budget, timeline, location, platform, service, deliverables (each verbatim), urls (every website/domain mentioned), competitors (competitor names/sites mentioned), prices_discussed, files_shared, key_dates, other_facts. PLUS target_keywords (3-6 derived keyword phrases), industry (the client's business sector, e.g. 'interior design', derive it), client_type (e.g. 'small business', 'agency', 'ecommerce', 'enterprise' — derive it), and country (the client's country as a normalized country name — derive it from any stated location, currency, phone code, language, or timezone; empty only if genuinely unknown). Use empty string/array where absent.`,
  `- detected_client: the client's name or handle as it appears in the conversation (empty string if not stated).`,
  `- client_site: the client's OWN website domain (bare domain, no protocol). Extract it from any URL they shared or mentioned anywhere in the chat. Only empty if they truly never gave a site.`,
  `- deal_state: stage (one of: new_lead, qualifying, proposal, negotiating, demo_requested, closing, hired, in_delivery, repeat, stalled, lost), temperature (hot/warm/cold), and a one-line summary of where it stands.`,
  `- verdict: the senior-DMS top-line read, written for a 10-second glance and compressed (do NOT repeat the detailed fields verbatim): headline (one line — where this stands and how hot it is), scope_change (one line — what the client ORIGINALLY asked for versus what the engagement has become NOW; write "First contact" if brand new, or "No change since the initial ask" if scope is steady), health (exactly one of: healthy, watch, at_risk), health_reason (one line — the single biggest reason for that health), next_move (the ONE next action, in a few words), play (one line — the strategic posture: qualify / grow / retain / close / recover, and the gist of how).`,
  `- client_intel: what the client wants, their pain points, buying signals, objections (stated or likely), any budget signals, and tone — a one-line read of the client's current emotion and communication style (e.g. 'Impatient and price-focused, warming since the audit offer'). All read from the conversation.`,
  `- expectations: one or two lines on what THIS client is expecting or has been led to expect (timeline, results, scope), and whether that is realistic or needs gentle managing. Specific to what was actually said — not generic.`,
  `- next_move: the single best thing the seller should do next, and why, in plain terms.`,
  `- draft_reply: a ready-to-send message in a warm, confident, professional seller voice — specific to this client, moving the deal forward. Conversion-focused but NEVER pushy, and NEVER promising results, timelines, or capabilities that are not real. If the client asked something technical, answer it credibly at a senior-SEO level.`,
  `- action_items: concrete things to do now. For each, set platform_can_help true if the seller's own SEO platform can do it (for example: run a live demo audit of the client's site, ingest a document/transcript the client shared, pull Search Console data if the client granted access, build a sample deliverable).`,
  `- call_script: if a call is upcoming or likely, set needed true and give an opening, discovery questions, value points, objection handling, and a close. Otherwise needed false.`,
  `- risk_flags: anything that could lose the deal or that the seller should be careful about (scope creep, unrealistic expectations, price sensitivity, ghosting risk, a request that would require over-promising).`,
  ``,
  `HARD RULES: base everything on the actual conversation and context. Do not invent client statements. The draft reply must be truthful — no fake case studies, no guaranteed rankings, no invented results. If winning the deal seems to need a claim that is not true, flag it in risk_flags instead of writing it.`,
  ``,
  `Return ONLY valid JSON, no prose, no fences:`,
  `{"detected_client":"...","client_site":"...","verdict":{"headline":"...","scope_change":"...","health":"healthy","health_reason":"...","next_move":"...","play":"..."},"deal_state":{"stage":"...","temperature":"...","summary":"..."},"client_intel":{"wants":["..."],"pain_points":["..."],"buying_signals":["..."],"objections":["..."],"budget_signals":["..."],"tone":"..."},"next_move":"...","expectations":"...","draft_reply":"...","action_items":[{"action":"...","why":"...","platform_can_help":false}],"call_script":{"needed":false,"opening":"...","discovery_questions":["..."],"value_points":["..."],"objection_handling":["..."],"close":"..."},"needs_attachments":[{"kind":"document","what":"...","note":"..."}],"reminders":[{"text":"...","when":"..."}],"deal_facts":{"budget":"","timeline":"","location":"","country":"","platform":"","service":"","industry":"","client_type":"","deliverables":[],"urls":[],"competitors":[],"target_keywords":[],"prices_discussed":[],"files_shared":[],"key_dates":[],"other_facts":[]},"risk_flags":["..."]}`,
].join("\n");

const EMPTY: DealStrategy = {
  detected_client: "", client_site: "",
  verdict: { headline: "", scope_change: "", health: "", health_reason: "", next_move: "", play: "", priority: "", priority_reason: "" },
  deal_state: { stage: "new_lead", temperature: "cold", summary: "" },
  client_intel: { wants: [], pain_points: [], buying_signals: [], objections: [], budget_signals: [], tone: "" },
  next_move: "", expectations: "", draft_reply: "", action_items: [],
  call_script: { needed: false, opening: "", discovery_questions: [], value_points: [], objection_handling: [], close: "" },
  needs_attachments: [], reminders: [],
  deal_facts: { budget: "", timeline: "", location: "", country: "", platform: "", service: "", industry: "", client_type: "", deliverables: [], urls: [], competitors: [], target_keywords: [], prices_discussed: [], files_shared: [], key_dates: [], other_facts: [] },
  risk_flags: [], generated_at: "",
};

const arr = (x: any): string[] => Array.isArray(x) ? x.filter((s: any) => typeof s === "string") : [];

/* ─── Conversion generators (offer, roadmap, reply variants) — grounded in
   the deal facts + conversation + any audit. ─── */
function ctxBlock(o: { conversation?: string; facts?: string; attachments?: string; operatorContext?: string }): string {
  return [
    o.operatorContext ? `Seller's own context for this client (authoritative — let it lead): ${String(o.operatorContext).slice(0, 4000)}` : ``,
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

export async function replyVariants(o: { conversation?: string; facts?: string; attachments?: string; callScript?: string; operatorContext?: string }): Promise<{ ok: boolean; variants?: Array<{ label: string; text: string }>; error?: string }> {
  const system = [
    `You are a senior Fiverr business developer. Given the conversation (and facts/audit), write THREE different strategic reply options to the client's latest message — each a distinct angle the seller could choose.`,
    `Make them genuinely different in approach (for example: "Answer + ask for the URL", "Answer + offer a quick free audit", "Answer + soft close toward an offer"). Each in a warm, confident seller voice.`,
    `HARD RULES: truthful — no guaranteed rankings or fabricated results; specific to this client.`,
    `Return ONLY JSON: {"variants":[{"label":"...","text":"..."},{"label":"...","text":"..."},{"label":"...","text":"..."}]}`,
  ].join("\n");
  try {
    const raw = await llm({ system, user: ctxBlock(o) + (o.callScript ? `\n\nSaved call script for this deal:\n${String(o.callScript).slice(0, 3000)}` : "") + `\n\nWrite the three reply options.`, maxTokens: 2200, timeoutMs: 80000, label: "bd-reply-variants" });
    const p = parseJsonResponse<any>(raw);
    if (!p || !Array.isArray(p.variants)) return { ok: false, error: "Could not produce reply options. Try again." };
    return { ok: true, variants: p.variants.map((v: any) => ({ label: String(v?.label || ""), text: String(v?.text || "") })).filter((v: any) => v.text) };
  } catch (e: any) { return { ok: false, error: e?.message || "variants failed" }; }
}

export async function analyzeOutcome(opts: { conversation?: string; outcome: string; dealValue?: number; reason?: string; facts?: string }): Promise<{ ok: boolean; what_worked: string; what_failed: string; why: string; project_type: string; error?: string }> {
  const system = [
    `You are a senior Fiverr business-development coach extracting a reusable LEARNING from a finished deal (won or lost).`,
    `Be specific and honest. Identify what actually worked, what did not, and WHY — so the seller can repeat wins and avoid losses on similar future leads.`,
    `Return ONLY JSON: {"what_worked":"...","what_failed":"...","why":"...","project_type":"<short label, e.g. 'Wix local SEO + AEO'>"}`,
  ].join("\n");
  const user = [
    `Outcome: ${opts.outcome}${opts.dealValue ? ` (value ${opts.dealValue})` : ""}.`,
    opts.reason ? `Seller's note on why: ${opts.reason}` : ``,
    opts.facts ? `Deal facts: ${String(opts.facts).slice(0, 2000)}` : ``,
    opts.conversation ? `Conversation:\n${String(opts.conversation).slice(0, 16000)}` : ``,
  ].filter(Boolean).join("\n\n");
  try {
    const raw = await llm({ system, user, maxTokens: 1200, timeoutMs: 70000, label: "bd-analyze-outcome" });
    const p = parseJsonResponse<any>(raw);
    if (!p) return { ok: false, what_worked: "", what_failed: "", why: "", project_type: "", error: "Could not analyse the outcome." };
    return { ok: true, what_worked: String(p.what_worked || ""), what_failed: String(p.what_failed || ""), why: String(p.why || ""), project_type: String(p.project_type || "") };
  } catch (e: any) { return { ok: false, what_worked: "", what_failed: "", why: "", project_type: "", error: e?.message || "analyze failed" }; }
}

export async function matchCaseStudy(opts: { caseStudies: Array<{ id: string; title: string; summary: string; results: string; industry: string; tags: string[] }>; conversation?: string; facts?: string }): Promise<{ ok: boolean; best_id: string; why: string; client_snippet: string; error?: string }> {
  const cs = opts.caseStudies || [];
  if (!cs.length) return { ok: false, best_id: "", why: "", client_snippet: "", error: "No case studies in your library yet — add one first." };
  const system = [
    `You are a Fiverr business developer choosing which of the seller's REAL case studies to reference with a specific client, and writing a short, honest mention to share.`,
    `Pick the single most relevant case study to this client's situation. Write a 1-3 sentence client-facing snippet that references ONLY what the chosen case study actually says — never invent metrics or outcomes. If none is a good fit, pick the closest and keep the snippet modest.`,
    `Return ONLY JSON: {"best_id":"<the id>","why":"<one line on why it fits>","client_snippet":"<the message to share>"}`,
  ].join("\n");
  const user = [
    opts.facts ? `Client facts: ${String(opts.facts).slice(0, 2000)}` : ``,
    opts.conversation ? `Conversation:\n${String(opts.conversation).slice(0, 8000)}` : ``,
    `Case studies (choose by id):`,
    JSON.stringify(cs.map(c => ({ id: c.id, title: c.title, summary: c.summary, results: c.results, industry: c.industry, tags: c.tags })) ).slice(0, 12000),
  ].filter(Boolean).join("\n\n");
  try {
    const raw = await llm({ system, user, maxTokens: 900, timeoutMs: 60000, label: "bd-casestudy-match" });
    const p = parseJsonResponse<any>(raw);
    if (!p) return { ok: false, best_id: "", why: "", client_snippet: "", error: "Could not match a case study. Try again." };
    return { ok: true, best_id: String(p.best_id || cs[0].id), why: String(p.why || ""), client_snippet: String(p.client_snippet || "") };
  } catch (e: any) { return { ok: false, best_id: "", why: "", client_snippet: "", error: e?.message || "match failed" }; }
}

/* Generate a tailored case-study DRAFT when the library has no real match. Honest by
   design: it never invents specific metrics or client names as fact — it produces a
   relevant structure with bracketed placeholders the seller fills with their REAL results. */
export interface CaseDraft { title: string; situation: string; approach: string[]; results_template: string[]; client_snippet: string; note: string }
export async function generateCaseStudy(o: { conversation?: string; facts?: string }): Promise<{ ok: boolean; draft?: CaseDraft; error?: string }> {
  const system = [
    `You are a senior SEO/AEO consultant drafting a CASE STUDY TEMPLATE tailored to a specific prospect, for the seller (a freelancer) to adapt with their OWN REAL results before sharing.`,
    `You do NOT have the seller's real client data. You must NOT invent specific metrics, client names, dates, or outcomes as if they were real. Instead, use clearly-bracketed placeholders such as "[client industry]", "[+X% organic traffic]", "[N months]", "[#1 for 'keyword']" that the seller will replace with true figures.`,
    `Make the draft genuinely relevant to THIS prospect's industry, platform, and problem. Describe a credible approach based on standard, real SEO/AEO methodology (technical fixes, content, authority, AEO/schema) — specific to their situation, not generic.`,
    `Return: title (short, with a placeholder result), situation (the kind of client and problem, matched to this prospect), approach (3-6 concrete real steps), results_template (3-5 outcome lines written as placeholders the seller fills), client_snippet (a 2-4 sentence message the seller can adapt and send — written so that once the placeholders are filled with real numbers it is fully honest), and note (one line reminding the seller to replace placeholders with real results and never claim outcomes they did not achieve).`,
    `Return ONLY JSON: {"title":"...","situation":"...","approach":["..."],"results_template":["..."],"client_snippet":"...","note":"..."}`,
  ].join("\n");
  const user = [
    o.facts ? `Prospect facts: ${String(o.facts).slice(0, 3000)}` : ``,
    o.conversation ? `Conversation:\n${String(o.conversation).slice(0, 12000)}` : ``,
    `Draft a tailored, honest case-study template for this prospect.`,
  ].filter(Boolean).join("\n\n");
  try {
    const raw = await llm({ system, user, maxTokens: 1800, timeoutMs: 75000, label: "bd-casestudy-generate" });
    const p = parseJsonResponse<any>(raw);
    if (!p) return { ok: false, error: "Could not draft a case study. Try again." };
    return { ok: true, draft: { title: String(p.title || "Tailored case study (draft)"), situation: String(p.situation || ""), approach: arr(p.approach), results_template: arr(p.results_template), client_snippet: String(p.client_snippet || ""), note: String(p.note || "Draft — replace the bracketed placeholders with your real results before sharing.") } };
  } catch (e: any) { return { ok: false, error: e?.message || "generate failed" }; }
}

/* ─── High-quality, HONEST client document generator. Uses the FULL real context of
   the deal (conversation, full strategy, real audit findings, real proven results,
   current algorithm knowledge). Never fabricates metrics or leaves placeholders. ─── */
function strategyDigest(s: any): string {
  if (!s) return "";
  const ci = s.client_intel || {}; const f = s.deal_facts || {};
  const L = (label: string, a: any) => (Array.isArray(a) && a.length) ? `${label}: ${a.join("; ")}` : "";
  return [
    s.deal_state?.summary ? `Where the deal stands: ${s.deal_state.summary}` : "",
    s.deal_state?.stage ? `Stage: ${s.deal_state.stage}${s.deal_state.temperature ? ` (${s.deal_state.temperature})` : ""}` : "",
    s.next_move ? `Recommended next move: ${s.next_move}` : "",
    L("What they want", ci.wants),
    L("Their pain points", ci.pain_points),
    L("Buying signals", ci.buying_signals),
    L("Their objections / concerns", ci.objections),
    L("Budget signals", ci.budget_signals),
    f.budget ? `Budget: ${f.budget}` : "",
    f.timeline ? `Timeline: ${f.timeline}` : "",
    f.platform ? `Platform / CMS: ${f.platform}` : "",
    f.service ? `Service they want: ${f.service}` : "",
    f.location ? `Location: ${f.location}` : "",
    f.client_type ? `Client type: ${f.client_type}` : "",
    L("Deliverables discussed", f.deliverables),
    L("Their competitors", f.competitors),
    L("Target keywords", f.target_keywords),
    L("Prices discussed", f.prices_discussed),
    L("Key dates", f.key_dates),
    L("Other facts captured", f.other_facts),
  ].filter(Boolean).join("\n");
}

const DOC_TASKS: Record<string, string> = {
  proposal: "Write a complete, persuasive SEO/AEO PROPOSAL for this exact client. Sections: (1) 'Where you are today' — open with what they actually told you and what the real audit found on their site; make them recognise their own situation. (2) 'What this is costing you' — explain, in plain business terms, what the real issues found mean for customers finding them; be concrete about impact without inventing numbers. (3) 'The plan' — a sequenced plan built from the ACTUAL issues found and their stated goals (foundation/technical first, then content/authority, then AEO/AI-search), and for the key moves explain WHY using current algorithm knowledge. (4) 'Why me' — your real differentiators; reference your real proven results only if provided. (5) 'Investment' — a realistic figure or range in the client's currency that fits this scope and what they signalled about budget; state clearly what is included; never guarantee results. (6) 'Next step' — one clear, low-friction action. 600-900 words. Specific to them throughout.",
  audit_report: "Write a client-ready SEO/AEO AUDIT REPORT of THEIR website using ONLY the real audit findings provided. For each real issue: name it in plain English, explain what it means for their customers and rankings, state how it gets fixed and the rough effort. Add a short 'Quick wins' list (the fixes with the most upside soonest) and a grounded 'The bigger picture' close tied to current algorithm knowledge. If the audit data is limited, say honestly what was checked and what a deeper audit would add. Do not invent issues that were not found.",
  pitch_email: "Write a short, specific PITCH MESSAGE/EMAIL. Open by referencing one real, concrete finding from their audit or one specific thing they said. Show you understand their business and how their customers search. Make one honest, relevant point of proof (use real proven results if provided; otherwise speak from the specific analysis of their site — no invented case numbers). Close with a low-pressure, specific ask. Under 220 words.",
  followup_email: "Write a FOLLOW-UP MESSAGE after the conversation so far. Reference specific things they actually said and the real opportunities you identified for them. Propose a clear next step with a sensible timeframe. Honest pricing indication in their currency only if it fits naturally. Warm and specific. 180-260 words.",
  message: "Write a SHORT, PERSONAL MESSAGE (chat/WhatsApp style, under 110 words). Reference something specific and real about their site or their message so it is obviously written for them. One clear, easy call to action. No fabrication, no templated feel.",
  objection_response: "Write an honest OBJECTION RESPONSE addressing their REAL concern (from the conversation and risk flags). Genuinely acknowledge it, reframe it with real logic or a real finding, remove the risk (e.g. a sensible first step or review point), and close with one easy ask. Truthful — no fake evidence. 130-180 words.",
  strategy_brief: "Write a focused TECHNICAL STRATEGY BRIEF for this client: their goal, the real issues standing in the way (from the audit), the prioritised technical and content moves to fix them, and the reasoning tied to current algorithm/AI-search knowledge. Specific and credible; senior-grade; no fluff. 400-600 words.",
  case_study: "If real proven results are provided, write a truthful CASE STUDY from them — situation, what was done, the real results, and how it relates to this client. If NO real results are provided, do NOT invent a past client; instead write a 'How I'd approach a business like yours' piece that honestly walks through the methodology applied to THEIR specific situation and real findings, clearly framed as the approach (not a fabricated past outcome). 350-500 words.",
};

export interface GenDoc { title: string; subtitle: string; recipient: string; sections: Array<{ heading: string; body: string }>; footer: string }
export async function generateDoc(opts: {
  docType: string; brandName?: string; conversation?: string; strategy?: any; facts?: string; auditText?: string;
  leadInfo?: { url?: string; name?: string; industry?: string }; language?: string; currency?: string; algorithmKnowledge?: string; provenResults?: string;
}): Promise<{ ok: boolean; doc?: GenDoc; error?: string }> {
  const brand = opts.brandName || "Manav S";
  const language = opts.language || "US English";
  const currency = opts.currency || "USD";
  const system = [
    `You are ${brand} — a senior SEO and AEO consultant and a trusted partner, writing a real client document for a specific client who has trusted you with their business and their own customers. This document is the centrepiece of your credibility: it must feel personal, expert, specific, and completely trustworthy. Never stiff, never templated, never generic.`,
    `HONESTY IS ABSOLUTE and non-negotiable:`,
    `- Use ONLY the real information provided below: what the client actually said, the real audit findings from their site, the captured facts, your real proven results, and current algorithm knowledge.`,
    `- NEVER invent or estimate specific metrics, traffic figures, rankings, search volumes, client names, dates, or outcomes and present them as fact. NEVER promise or guarantee rankings or results.`,
    `- NEVER leave a placeholder, a bracket like [X], or a blank. Write complete, finished prose. If you do not have a precise number, make the point qualitatively and truthfully instead of inventing one.`,
    `- Make every important claim TRACEABLE to something real provided here — a specific issue found on their site, a specific thing they said, a specific fact they shared. They should recognise their own situation on the page.`,
    `- If proven results are provided, you may reference them truthfully. If none are provided, show expertise through the specific analysis of THEIR situation and current algorithm knowledge — not through fabricated examples.`,
    `Write the ENTIRE document in fluent, natural ${language} (not translated English). Use ${currency} for any money. Voice: confident, warm, precise, human. Active voice. No corporate filler ("leverage", "cutting-edge", "synergy", "robust"), no "we believe/we think/it is important to", and never mention AI, automation, or software tools.`,
    `Return ONLY valid JSON (no markdown): {"title":"...","subtitle":"...","recipient":"client name if known","sections":[{"heading":"SECTION HEADING","body":"full text — use \\n for line breaks and lines starting with '- ' for bullets"}],"footer":"a short, warm, personal closing line"}`,
  ].join("\n");
  const user = [
    opts.leadInfo?.name ? `CLIENT NAME: ${opts.leadInfo.name}` : ``,
    opts.leadInfo?.industry ? `INDUSTRY: ${opts.leadInfo.industry}` : ``,
    opts.leadInfo?.url ? `THEIR WEBSITE: ${opts.leadInfo.url}` : ``,
    opts.strategy ? `WHAT WE KNOW ABOUT THIS DEAL (from analysis of the conversation):\n${strategyDigest(opts.strategy)}` : (opts.facts ? `CAPTURED FACTS: ${String(opts.facts).slice(0, 2500)}` : ``),
    opts.auditText && opts.auditText.trim() ? `REAL AUDIT / DIAGNOSTIC FINDINGS ON THEIR SITE:\n${String(opts.auditText).slice(0, 9000)}` : `(No site audit data available — do not invent findings; work from the conversation and facts, and where relevant note that a full audit would add detail.)`,
    opts.provenResults && opts.provenResults.trim() ? `YOUR REAL PROVEN RESULTS (truthful, may be referenced):\n${String(opts.provenResults).slice(0, 2500)}` : `(No proven-results data provided — do NOT fabricate past client outcomes.)`,
    opts.algorithmKnowledge && opts.algorithmKnowledge.trim() ? `CURRENT ALGORITHM / AI-SEARCH KNOWLEDGE (for technical credibility):\n${String(opts.algorithmKnowledge).slice(0, 3500)}` : ``,
    opts.conversation && opts.conversation.trim() ? `THE ACTUAL CONVERSATION SO FAR (what they really said — reference it specifically):\n${String(opts.conversation).slice(0, 16000)}` : ``,
    ``,
    `TASK: ${DOC_TASKS[opts.docType] || DOC_TASKS.proposal}`,
  ].filter(Boolean).join("\n\n");
  try {
    const raw = await llm({ system, user, maxTokens: 4000, timeoutMs: 110000, label: "bd-generate-doc" });
    const p = parseJsonResponse<any>(raw);
    if (!p) return { ok: false, error: "Could not generate the document. Try again." };
    const sections = Array.isArray(p.sections) ? p.sections.map((s: any) => ({ heading: String(s?.heading || ""), body: String(s?.body || "") })).filter((s: any) => s.body) : [];
    if (!sections.length && typeof p === "object" && p.body) sections.push({ heading: "", body: String(p.body) });
    if (!sections.length) return { ok: false, error: "The document came back empty. Try again." };
    return { ok: true, doc: { title: String(p.title || "Document"), subtitle: String(p.subtitle || ""), recipient: String(p.recipient || opts.leadInfo?.name || ""), sections, footer: String(p.footer || "") } };
  } catch (e: any) { return { ok: false, error: e?.message || "doc failed" }; }
}

/* ─── Fiverr ORDER PAGE reader. The order page (after a buyer places an order) holds the
   real, structured engagement data — dates, status, deliveries, and the requirements the
   client actually submitted — separate from the inbox chat. Factual extraction only. ─── */
export interface OrderInfo { order_number: string; status: string; package: string; price: string; ordered_at: string; due_at: string; delivered_at: string; delivery_time: string; revisions: string; requirements: string[]; deliverables: string[]; extras: string[]; key_dates: Array<{ label: string; date: string }>; notes: string[] }
export async function extractOrder(orderText: string): Promise<{ ok: boolean; order?: OrderInfo; summary?: string; error?: string }> {
  const t = String(orderText || "").trim();
  if (!t) return { ok: false, error: "Paste the Fiverr Order page content." };
  const system = [
    `You are reading a Fiverr ORDER page — the page that exists after a buyer places an order, separate from the inbox chat. Extract the REAL order details exactly as written. This is factual data: never invent, guess, or fill blanks. If a field is not present on the page, leave it empty.`,
    `Extract: order_number; status (e.g. active / in progress / delivered / completed / late / cancelled / revision requested); package or tier name; price or total (include the currency exactly as shown); ordered_at; due_at; delivered_at; delivery_time; revisions (allowed or used); requirements (each item the buyer submitted in the requirements/brief — this is what the client actually provided, as a list); deliverables or scope (what was ordered, as a list); extras / add-ons (list); key_dates (a list of {label, date} for any dated activity shown in the order activity); notes (anything important shown — late delivery, revision asked, extension granted, delivery sent, etc.).`,
    `Also write a concise plain-text summary of the order for context.`,
    `Return ONLY valid JSON: {"order":{"order_number":"","status":"","package":"","price":"","ordered_at":"","due_at":"","delivered_at":"","delivery_time":"","revisions":"","requirements":[],"deliverables":[],"extras":[],"key_dates":[{"label":"","date":""}],"notes":[]},"summary":"..."}`,
  ].join("\n");
  try {
    const raw = await llm({ system, user: `Fiverr order page content:\n${t.slice(0, 16000)}`, maxTokens: 1500, timeoutMs: 70000, label: "bd-extract-order" });
    const p = parseJsonResponse<any>(raw);
    if (!p) return { ok: false, error: "Could not read the order page. Try again." };
    const o = p.order || {};
    const order: OrderInfo = {
      order_number: String(o.order_number || ""), status: String(o.status || ""), package: String(o.package || ""), price: String(o.price || ""),
      ordered_at: String(o.ordered_at || ""), due_at: String(o.due_at || ""), delivered_at: String(o.delivered_at || ""), delivery_time: String(o.delivery_time || ""), revisions: String(o.revisions || ""),
      requirements: arr(o.requirements), deliverables: arr(o.deliverables), extras: arr(o.extras),
      key_dates: Array.isArray(o.key_dates) ? o.key_dates.map((k: any) => ({ label: String(k?.label || ""), date: String(k?.date || "") })).filter((k: any) => k.label || k.date) : [],
      notes: arr(o.notes),
    };
    return { ok: true, order, summary: String(p.summary || "") };
  } catch (e: any) { return { ok: false, error: e?.message || "order read failed" }; }
}

/* ─── Engagement tracker. Reads the inbox chat + order page + delivered documents as ONE
   timeline, distinguishes agreed/delivered/closed from genuinely-open, tracks how the
   client's mood and needs shift as work lands or slips, and (as a senior DMS) plans the
   next offer and how to win it. Grounded only in the real context — never fabricates. ─── */
export interface Engagement {
  timeline: Array<{ when: string; phase: string; what: string; status: string }>;
  agreed_scope: string[]; delivered: string[]; open_items: string[];
  client_mood: string; feedback: string[]; needs_shift: string; missed_or_at_risk: string[];
  next_offer: { what: string; why_now: string; how_to_win: string; upsells: string[] };
}
export async function analyzeEngagement(opts: { conversation?: string; orderInfo?: any; deliveredDocs?: string; facts?: string; strategySummary?: string }): Promise<{ ok: boolean; engagement?: Engagement; error?: string }> {
  const system = [
    `You are a senior digital-marketing / SEO delivery lead AND account strategist tracking a LIVE client engagement across BOTH the Fiverr inbox chat and the order page, plus any documents that were delivered. Build the full picture and reason like a senior DMS who also sees it through the client's own eyes.`,
    `Read EVERYTHING as one timeline, in sequence. Reconstruct, in order, what actually happened: what the client first wanted, what was offered (and in which package and at what price), what was agreed, what was actually delivered, the client's feedback and mood at each point, any revisions, and any NEW needs that emerged later.`,
    `CRITICAL — do not play dumb. Anything already discussed, agreed, or DELIVERED is CLOSED context, NOT a fresh requirement. Never list a delivered or resolved item as an open requirement. Keep three buckets clearly separate: agreed scope, what has been delivered (closed), and what is genuinely still open or newly requested.`,
    `Understand how the client's needs and wants SHIFTED as work was delivered or missed, and re-weight importance accordingly: what mattered at the start may be done; what matters now may be different. Flag anything promised but missed, or now at risk.`,
    `Capture the client's mood, satisfaction, feedback and comments honestly from what they actually said and how the order is going.`,
    `Then, as a senior strategist focused on growing this account, decide the NEXT move: what to offer next, why now, how to WIN it (the specific angle given their mood and what they value), and concrete upsell / cross-sell opportunities grounded in what they genuinely need next — never a generic upsell.`,
    `HARD RULES: ground everything in the real context provided. Never invent deliveries, feedback, dates, prices, or outcomes. If something is not in the context, leave it out rather than guessing.`,
    `Return ONLY valid JSON: {"timeline":[{"when":"<date or relative marker e.g. 'order placed' / 'after first delivery'>","phase":"<requested|offered|agreed|delivered|feedback|revision|new-need>","what":"...","status":"<open|closed|delivered|at-risk>"}],"agreed_scope":["..."],"delivered":["..."],"open_items":["..."],"client_mood":"...","feedback":["..."],"needs_shift":"...","missed_or_at_risk":["..."],"next_offer":{"what":"...","why_now":"...","how_to_win":"...","upsells":["..."]}}`,
  ].join("\n");
  const user = [
    opts.strategySummary ? `Deal summary so far: ${opts.strategySummary}` : ``,
    opts.facts ? `Captured facts: ${String(opts.facts).slice(0, 2500)}` : ``,
    opts.orderInfo ? `ORDER PAGE (the live order — dates, status, deliveries, and the requirements the client submitted):\n${JSON.stringify(opts.orderInfo).slice(0, 4000)}` : ``,
    opts.deliveredDocs && opts.deliveredDocs.trim() ? `DOCUMENTS DELIVERED (read carefully — this is what was actually delivered to the client):\n${String(opts.deliveredDocs).slice(0, 10000)}` : ``,
    opts.conversation ? `THE FULL CONVERSATION so far (inbox + order chat, in sequence — pay attention to who said what and when):\n${String(opts.conversation).slice(0, 22000)}` : ``,
    ``,
    `Build the engagement picture in sequence, keep delivered/closed separate from open, and decide the next move to win more.`,
  ].filter(Boolean).join("\n\n");
  try {
    const raw = await llm({ system, user, maxTokens: 3500, timeoutMs: 100000, label: "bd-engagement" });
    const p = parseJsonResponse<any>(raw);
    if (!p) return { ok: false, error: "Could not build the engagement picture. Try again." };
    const no = p.next_offer || {};
    const engagement: Engagement = {
      timeline: Array.isArray(p.timeline) ? p.timeline.map((t: any) => ({ when: String(t?.when || ""), phase: String(t?.phase || ""), what: String(t?.what || ""), status: String(t?.status || "") })).filter((t: any) => t.what) : [],
      agreed_scope: arr(p.agreed_scope), delivered: arr(p.delivered), open_items: arr(p.open_items),
      client_mood: String(p.client_mood || ""), feedback: arr(p.feedback), needs_shift: String(p.needs_shift || ""), missed_or_at_risk: arr(p.missed_or_at_risk),
      next_offer: { what: String(no.what || ""), why_now: String(no.why_now || ""), how_to_win: String(no.how_to_win || ""), upsells: arr(no.upsells) },
    };
    return { ok: true, engagement };
  } catch (e: any) { return { ok: false, error: e?.message || "engagement failed" }; }
}

export async function learnFromDeals(deals: Array<{ name: string; country: string; outcome: string; value: string; status: string; conversation: string; facts: string; transcripts: string }>, existing: string[]): Promise<{ ok: boolean; learnings?: string[]; error?: string }> {
  if (!deals.length) return { ok: false, error: "No closed deals with enough conversation to learn from yet." };
  const system = [
    `You are analysing a freelancer's past Fiverr DEALS to learn THEIR personal patterns as a seller — how they win, how they lose, and how they handle leads. The output is a short list of concrete learnings used to advise them on future leads in line with what actually works FOR THEM.`,
    `Look across the won and the lost deals for: what tends to CONVERT (openings, offers, moves, timing, client types, regions), what tends to LOSE (objections they mishandle, scope creep, price traps, ghosting patterns, over-promising), and recurring strengths or weaknesses in how they handle leads.`,
    `RULES: each learning is ONE short, plain-English, SPECIFIC sentence grounded in these deals — never generic sales advice ("be responsive" is useless). Prefer patterns that repeat across deals. If existing learnings are given, keep the ones still supported, refine them, drop duplicates and anything contradicted. Return at most 18, most useful first.`,
    `Return ONLY JSON: {"learnings":["...","..."]}`,
  ].join("\n");
  const dealsBlock = deals.map((d, i) => `DEAL ${i + 1} [${d.status}${d.outcome ? "/" + d.outcome : ""}${d.value ? ", value " + d.value : ""}${d.country ? ", " + d.country : ""}]\nFacts: ${String(d.facts).slice(0, 500)}\nChat: ${String(d.conversation).slice(0, 2500)}${d.transcripts ? "\nCall: " + String(d.transcripts).slice(0, 1500) : ""}`).join("\n\n---\n\n");
  const user = [existing.length ? `Existing learnings (refine / keep / dedupe):\n- ${existing.join("\n- ")}` : ``, `Deals:\n${dealsBlock}`].filter(Boolean).join("\n\n");
  try {
    const raw = await llm({ system, user, maxTokens: 1800, timeoutMs: 80000, label: "bd-learn" });
    const p = parseJsonResponse<any>(raw);
    if (!p || !Array.isArray(p.learnings)) return { ok: false, error: "Could not extract learnings this time. Try again." };
    return { ok: true, learnings: p.learnings.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 18) };
  } catch (e: any) { return { ok: false, error: e?.message || "learn failed" }; }
}

export async function askExpert(opts: { question: string; conversation?: string; facts?: string; attachments?: string; strategySummary?: string; callScript?: string; operatorContext?: string; learnings?: string }): Promise<{ ok: boolean; answer: string; client_reply: string; suggested_tools: string[]; error?: string }> {
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
    opts.operatorContext ? `The seller's own context for this client (authoritative — let it lead your answer):\n${String(opts.operatorContext).slice(0, 4000)}` : ``,
    opts.learnings ? `What has worked / not worked for this seller historically (their proven patterns — apply where relevant):\n${String(opts.learnings).slice(0, 3000)}` : ``,
    opts.strategySummary ? `Deal so far: ${opts.strategySummary}` : ``,
    opts.facts ? `Captured facts: ${String(opts.facts).slice(0, 4000)}` : ``,
    opts.callScript ? `Saved call script for this deal (reuse / adapt where it helps):\n${String(opts.callScript).slice(0, 4000)}` : ``,
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

export async function strategizeDeal(opts: { conversation: string; brief?: string; clientName?: string; context?: string; operatorContext?: string; learnings?: string }): Promise<{ ok: boolean; strategy: DealStrategy; error?: string }> {
  const now = new Date().toISOString();
  const convo = String(opts.conversation || "").trim();
  if (!convo) return { ok: false, strategy: { ...EMPTY, generated_at: now }, error: "Paste the client conversation first." };

  const user = [
    opts.clientName ? `Client: ${opts.clientName}.` : ``,
    opts.operatorContext ? `SELLER'S OWN CONTEXT for this client — authoritative; the seller knows this client directly, so let it lead your read, next move, and draft reply even where it overrides what the chat alone would suggest:\n${String(opts.operatorContext).slice(0, 4000)}` : ``,
    opts.learnings ? `What has worked / not worked for THIS seller historically — their proven patterns; apply where relevant when choosing the next move and draft reply:\n${String(opts.learnings).slice(0, 3000)}` : ``,
    opts.brief ? `Brief / service:\n${String(opts.brief).slice(0, 6000)}` : ``,
    opts.context ? `Context (the seller's platform, prior research, shared documents and call transcripts):\n${String(opts.context).slice(0, 12000)}` : ``,
    `Conversation so far (strategise the seller's next move):\n${convo.slice(0, 30000)}`,
  ].filter(Boolean).join("\n\n");

  const run = async (): Promise<DealStrategy | null> => {
    const raw = await llm({ system: SYSTEM, user, maxTokens: 4500, timeoutMs: 90000, label: "bd-strategist" });
    const p = parseJsonResponse<any>(raw);
    if (!p || !p.deal_state) return null;
    return {
      detected_client: String(p.detected_client || "").slice(0, 120),
      client_site: String(p.client_site || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""),
      verdict: { headline: String(p.verdict?.headline || ""), scope_change: String(p.verdict?.scope_change || ""), health: String(p.verdict?.health || "").toLowerCase(), health_reason: String(p.verdict?.health_reason || ""), next_move: String(p.verdict?.next_move || ""), play: String(p.verdict?.play || ""), priority: String(p.verdict?.priority || ""), priority_reason: String(p.verdict?.priority_reason || "") },
      deal_state: { stage: String(p.deal_state?.stage || "new_lead"), temperature: String(p.deal_state?.temperature || ""), summary: String(p.deal_state?.summary || "") },
      client_intel: { wants: arr(p.client_intel?.wants), pain_points: arr(p.client_intel?.pain_points), buying_signals: arr(p.client_intel?.buying_signals), objections: arr(p.client_intel?.objections), budget_signals: arr(p.client_intel?.budget_signals), tone: String(p.client_intel?.tone || "") },
      next_move: String(p.next_move || ""),
      expectations: String(p.expectations || ""),
      draft_reply: String(p.draft_reply || ""),
      action_items: Array.isArray(p.action_items) ? p.action_items.map((a: any) => ({ action: String(a?.action || ""), why: String(a?.why || ""), platform_can_help: Boolean(a?.platform_can_help) })).filter((a: any) => a.action) : [],
      call_script: { needed: Boolean(p.call_script?.needed), opening: String(p.call_script?.opening || ""), discovery_questions: arr(p.call_script?.discovery_questions), value_points: arr(p.call_script?.value_points), objection_handling: arr(p.call_script?.objection_handling), close: String(p.call_script?.close || "") },
      needs_attachments: Array.isArray(p.needs_attachments) ? p.needs_attachments.map((a: any) => ({ kind: String(a?.kind || "file"), what: String(a?.what || ""), note: String(a?.note || "") })).filter((a: any) => a.what) : [],
      reminders: Array.isArray(p.reminders) ? p.reminders.map((r: any) => ({ text: String(r?.text || ""), when: String(r?.when || "") })).filter((r: any) => r.text) : [],
      deal_facts: {
        budget: String(p.deal_facts?.budget || ""), timeline: String(p.deal_facts?.timeline || ""), location: String(p.deal_facts?.location || ""), country: String(p.deal_facts?.country || ""),
        platform: String(p.deal_facts?.platform || ""), service: String(p.deal_facts?.service || ""), industry: String(p.deal_facts?.industry || ""), client_type: String(p.deal_facts?.client_type || ""),
        deliverables: arr(p.deal_facts?.deliverables), urls: arr(p.deal_facts?.urls), competitors: arr(p.deal_facts?.competitors), target_keywords: arr(p.deal_facts?.target_keywords),
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
