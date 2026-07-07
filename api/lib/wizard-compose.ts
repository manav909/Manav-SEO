/* ════════════════════════════════════════════════════════════════
   api/lib/wizard-compose.ts

   BUILD 12.24 — Dynamic wizard composition.

   Replaces force-fitting a brief into one of five fixed archetypes with
   a bespoke, per-brief plan: decompose the brief into the client's
   ACTUAL requested deliverables, then map each one to a real engine in
   the capability registry — or flag it as an explicit gap.

   The hard rule, and the whole point: a generated stage is ONLY valid if
   it maps to a real registry capability. The LLM may decompose and map;
   it may NOT invent a capability, and it never produces the deliverable
   content itself. Execution happens later through the real engines
   (wizard_run_stage). A requested deliverable with no engine becomes a
   gap with an honest note on what engine would be needed — never a
   fabricated stage. This is flexible planning bounded by real capability,
   which is the opposite of presenting work that was never done.

   Multi-tenant: the brief is input only; no client values are stored.
════════════════════════════════════════════════════════════════ */

import { llm, parseJsonResponse } from "./workspace/llm.js";
import { CAPABILITY_REGISTRY, getCapability, MODE_SEVERITY, type ExecutionMode } from "./capability-registry.js";

export type StageReadiness = "ready" | "needs_connection" | "needs_input" | "manual_review" | "blocked" | "gap";

const SEV_TO_READINESS: Record<number, Exclude<StageReadiness, "gap">> = {
  0: "ready", 1: "needs_connection", 2: "needs_input", 3: "manual_review", 4: "blocked",
};

export interface DynamicStage {
  id:             string;
  label:          string;        // the client's requested deliverable, in their terms
  intent:         string;        // what they want from it
  capability_ids: string[];      // mapped real capabilities (empty => gap)
  capabilities:   Array<{ id: string; label: string; engine: string; mode: ExecutionMode; limits: string }>;
  readiness:      StageReadiness;
  is_gap:         boolean;
  needed_engine?: string;        // for gaps: what would have to be built
  note:           string;
}

export interface DynamicPlan {
  archetype_label:    string;    // "Custom plan (dynamic)" — keeps UI compatibility
  confidence:         number;    // coverage % (deliverables mapped to a real engine)
  summary:            string;
  ymyl:               boolean;
  business_type:      string;
  platform:           string;
  client_domain:      string;     // extracted from the brief — for active-project mismatch warning
  suggested_keywords: string[];   // keywords the brief mentioned — for field auto-fill
  competitor_domains: string[];   // competitors the brief named — for field auto-fill
  exclusions:         string[];
  deliverables_count: number;
  stages:             DynamicStage[];
  gaps:               Array<{ stage: string; note: string }>;
  manual_calls:       string[];
  coverage:           { runnable: number; needs_input_or_connection: number; manual: number; gaps: number; total: number };
}

/* Compact registry description the model maps against (ids are the only
   vocabulary it is allowed to use). */
function registryForPrompt(): string {
  return Object.values(CAPABILITY_REGISTRY)
    .map(c => `- ${c.id}: ${c.label}. Produces: ${c.output} (mode: ${c.mode})`)
    .join("\n");
}

const COMPOSE_SYSTEM = [
  `You decompose an SEO/marketing client brief into the client's ACTUAL requested deliverables, then map each one to the platform capabilities that can produce it.`,
  ``,
  `You are given a fixed list of real platform capabilities. These ids are the ONLY vocabulary you may map to:`,
  `__REGISTRY__`,
  ``,
  `Rules — follow exactly:`,
  `- Decompose the brief into the discrete deliverables the client actually asked for, in their own terms and order. Do not invent deliverables they did not request, and do not drop ones they did.`,
  `- For each deliverable, set capability_ids to the registry id(s) that genuinely produce it. Use ONLY ids from the list above, verbatim.`,
  `- If NO listed capability genuinely produces a deliverable, set gap=true, leave capability_ids empty, and in needed_engine describe briefly what engine would have to exist. Do NOT force an unrelated capability to avoid a gap, and do NOT invent an id.`,
  `- You are mapping only. You must NOT write or summarise the deliverable content itself.`,
  `- Capture business_type (e.g. ecommerce, lead-gen, SaaS, local), platform (e.g. Shopify, WordPress, custom), ymyl (true for finance/health/legal), client_domain (the client's website domain if mentioned anywhere — bare domain, no protocol or path, e.g. example.com), suggested_keywords (any target keywords or search terms the client explicitly mentioned — bare terms, may be empty), competitor_domains (any competitor websites the client explicitly named — bare domains, may be empty), and explicit exclusions.`,
  ``,
  `Return ONLY valid JSON, no prose, no markdown fences:`,
  `{"business_type":"...","platform":"...","ymyl":false,"client_domain":"...","suggested_keywords":["..."],"competitor_domains":["..."],"exclusions":["..."],"deliverables":[{"title":"...","intent":"...","capability_ids":["..."],"gap":false,"needed_engine":""}]}`,
].join("\n");

function readinessOf(capIds: string[], ymyl: boolean): { readiness: StageReadiness; caps: DynamicStage["capabilities"] } {
  const caps = capIds.map(id => {
    const c = getCapability(id);
    return c ? { id: c.id, label: c.label, engine: c.engine, mode: c.mode, limits: c.limits } : null;
  }).filter(Boolean) as DynamicStage["capabilities"];
  if (caps.length === 0) return { readiness: "gap", caps };
  let worst = 0;
  for (const c of caps) worst = Math.max(worst, MODE_SEVERITY[c.mode]);
  if (ymyl && caps.some(c => c.id === "eeat_ymyl_assessment")) worst = Math.max(worst, MODE_SEVERITY.manual_dms);
  return { readiness: SEV_TO_READINESS[worst], caps };
}

const slug = (s: string, i: number) => (String(s || "stage").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "stage") + "_" + i;

export async function composeDynamicPlan(brief: string): Promise<DynamicPlan> {
  const raw = await llm({
    system: COMPOSE_SYSTEM.replace("__REGISTRY__", registryForPrompt()),
    user: `Client brief / conversation:\n\n${String(brief || "").slice(0, 24000)}`,
    maxTokens: 3000,
    timeoutMs: 60000,
    label: "wizard-compose",
  });

  const parsed = parseJsonResponse<any>(raw);
  const rawDeliverables: any[] = Array.isArray(parsed?.deliverables) ? parsed.deliverables : [];

  const ymyl = Boolean(parsed?.ymyl);
  const gaps: DynamicPlan["gaps"] = [];
  const manual_calls: string[] = [];

  const stages: DynamicStage[] = rawDeliverables.map((d: any, i: number) => {
    const title = String(d?.title || `Deliverable ${i + 1}`).trim();
    /* Validate mapped ids against the real registry — drop anything invented. */
    const validIds: string[] = (Array.isArray(d?.capability_ids) ? d.capability_ids : [])
      .map((x: any) => String(x))
      .filter((id: string) => Boolean(getCapability(id)));
    const { readiness, caps } = readinessOf(validIds, ymyl);
    /* A deliverable that maps to at least one REAL registry capability is NOT a
       gap — even if the model also set gap=true wishing for a more perfect
       dedicated engine. Real coverage wins; the honest limits of that engine
       (e.g. "posting is manual", "informs the edit, does not auto-apply it")
       live in the capability's own `limits`, not as a phantom "No engine".
       Only a deliverable with ZERO real capabilities is a true gap. This kills
       the incoherent "Requires: Ready" + "No engine" state. */
    const is_gap = validIds.length === 0;

    let note: string;
    if (is_gap) {
      const needed = String(d?.needed_engine || "").trim() || "a dedicated engine that does not exist yet";
      gaps.push({ stage: title, note: `No engine produces this — would need ${needed}.` });
      note = `Gap: the platform has no engine for this. Honest options — handle manually, build ${needed}, or scope it out of the order.`;
    } else if (readiness === "manual_review") {
      manual_calls.push(title);
      note = `Human judgement call. The platform assists with data; a senior practitioner decides.`;
    } else if (readiness === "needs_connection") {
      note = `Runs once the required integration is connected (${caps.filter(c => c.mode === "needs_connection").map(c => c.label).join(", ")}).`;
    } else if (readiness === "needs_input") {
      note = `Runs once the required input is supplied (${caps.filter(c => c.mode === "needs_input").map(c => c.label).join(", ")}).`;
    } else {
      note = `Runs on existing engines: ${caps.map(c => c.engine).join(", ")}.`;
    }

    return {
      id: slug(title, i),
      label: title,
      intent: String(d?.intent || "").trim(),
      capability_ids: validIds,
      capabilities: caps,
      readiness,
      is_gap,
      needed_engine: is_gap ? (String(d?.needed_engine || "").trim() || undefined) : undefined,
      note,
    };
  });

  /* Order: connect/data first, analysis next, synthesis last, gaps/manual keep their slot. */
  const orderWeight = (s: DynamicStage): number => {
    if (s.capability_ids.some(id => id === "gsc_metrics_per_url" || id === "gsc_query_page_pairs" || id === "gsc_csv_ingestion")) return 0;
    if (s.capability_ids.some(id => id === "client_report_narrative")) return 3;
    if (s.is_gap || s.readiness === "manual_review") return 2;
    return 1;
  };
  stages.sort((a, b) => orderWeight(a) - orderWeight(b));

  const total = stages.length;
  const runnable = stages.filter(s => s.readiness === "ready").length;
  const needs = stages.filter(s => s.readiness === "needs_connection" || s.readiness === "needs_input").length;
  const manual = stages.filter(s => s.readiness === "manual_review").length;
  const gapCount = stages.filter(s => s.is_gap).length;
  const mapped = total - gapCount;
  const confidence = total > 0 ? Math.round((mapped / total) * 100) : 0;

  const summaryParts: string[] = [];
  summaryParts.push(`Composed ${total} stage(s) directly from the brief${parsed?.business_type ? ` (${parsed.business_type}${parsed?.platform ? ` on ${parsed.platform}` : ""})` : ""}.`);
  summaryParts.push(`${mapped} of ${total} map to real engines (${runnable} runnable now, ${needs} need connection/input, ${manual} are human calls); ${gapCount} have no engine and are flagged as gaps${gapCount ? `: ${gaps.map(g => g.stage).join(", ")}` : ""}.`);
  if (ymyl) summaryParts.push(`YMYL/regulated — trust decisions held for human review.`);
  if (gapCount) summaryParts.push(`The gaps are exactly what to build (or scope out) before promising this brief in full.`);

  return {
    archetype_label: "Custom plan (dynamic)",
    confidence,
    summary: summaryParts.join(" "),
    ymyl,
    business_type: String(parsed?.business_type || "").trim(),
    platform: String(parsed?.platform || "").trim(),
    client_domain: String(parsed?.client_domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""),
    suggested_keywords: Array.isArray(parsed?.suggested_keywords) ? parsed.suggested_keywords.filter((x: any) => typeof x === "string").slice(0, 30) : [],
    competitor_domains: Array.isArray(parsed?.competitor_domains) ? parsed.competitor_domains.filter((x: any) => typeof x === "string").slice(0, 20) : [],
    exclusions: Array.isArray(parsed?.exclusions) ? parsed.exclusions.filter((x: any) => typeof x === "string") : [],
    deliverables_count: total,
    stages,
    gaps,
    manual_calls,
    coverage: { runnable, needs_input_or_connection: needs, manual, gaps: gapCount, total },
  };
}
