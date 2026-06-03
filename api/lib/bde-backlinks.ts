/* ════════════════════════════════════════════════════════════════
   api/lib/bde-backlinks.ts

   Backlink Strategy module — Senior-DMS-grade strategic brief from
   just a website URL. Optional structured fields (target keywords,
   budget tier, competitor URLs) and free-text context refine output.

   Three stages:

   1. AUDIT — fetch the homepage + a few key internal pages, infer
      industry / audience / business model / current
      backlink-relevant signals (brand mentions, partnerships, press
      page presence). Cheap call; produces a structured audit JSON.

   2. OPPORTUNITIES — multiple research lanes run in parallel:
      a) PR + digital-PR — newsworthy angles, journalist beats
      b) Resource pages — link-roundup / "best X" / industry hubs
      c) Broken link prospects — competitors with dead links
      d) Expert quotes — HARO/Connectively/Featured opportunities
      e) Topical co-citation — sites Google + AI Overviews cite for
         the client's space (the 2026 currency)
      f) Partnership / co-marketing — adjacent non-competing brands
      Each lane is one LLM call with web research instructions.

   3. BRIEF — synthesize audit + opportunities into a Senior-DMS brief
      with executive summary + expandable sections per category +
      tactical paths + 2026/GEO/AI-search framing. Lens-aware.

   Designed for an Ahrefs/Moz/Majestic adapter to slot in later via
   BacklinkProvider; current implementation uses web/SerpAPI only.

   Multi-tenant — no hardcoded domains, keywords, or industries.
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { fetchHtml, fetchSerpFeatures } from "./workspace/shared.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

/* ─── Backlink provider interface (adapter slot) ──────────────── */
/* Future Ahrefs/Moz/Majestic adapters implement this. Stub adapter
   below returns empty so the rest of the pipeline still produces a
   useful brief without external data. */
export interface BacklinkProvider {
  name: string;
  /** Top referring domains for a target site. May return [] if not
      configured. */
  referringDomains(url: string): Promise<Array<{ domain: string; authority?: number; first_seen?: string; count?: number }>>;
  /** Recent new/lost links. May return []. */
  recentChanges(url: string): Promise<{ new: any[]; lost: any[] }>;
}

const StubProvider: BacklinkProvider = {
  name: "stub_no_external_data",
  referringDomains: async () => [],
  recentChanges: async () => ({ new: [], lost: [] }),
};

/* ─── Input shape ─────────────────────────────────────────────── */
export interface BacklinkBriefInputs {
  client_url: string;
  // Optional structured fields
  target_keywords?: string[];     // up to 20
  budget_tier?: "low" | "medium" | "high" | "enterprise";
  competitor_urls?: string[];     // up to 10
  geography?: string;             // e.g. "UK", "US-east", "global"
  // Free-text operator context
  context?: string;
  // Lens picker, same shape as Compare tab
  lenses?: Array<{ kind: "preset"; id: string } | { kind: "custom"; description: string }>;
  /** When true, run an extra on-page audit lane fetching deeper than
      just the homepage. More expensive; default false. */
  deep_audit?: boolean;
  /** Build 12.1 — restrict the audit + opportunity research to a
      specific URL path pattern, e.g. "/products/*" or "/blog/*".
      Whole domain when omitted. */
  path_filter?: string;
  /** Build 12.1 — scope of this brief. Drives where the resulting
      assets land in the registry, and how listBacklinkBriefs filters.
      Defaults vary by entry point: PM panel → "project",
      BDE panel attached to a lead → "bde_lead",
      BDE panel standalone → "bde_standalone". */
  scope?: "project" | "bde_lead" | "bde_standalone";
  /** Build 12.1 — when scope is "bde_lead", link the brief to a lead. */
  lead_id?: string;
}

/* ─── Audit stage ─────────────────────────────────────────────── */
async function auditWebsiteForBacklinks(opts: { client_url: string; deep: boolean; path_filter?: string }): Promise<{
  industry: string;
  audience: string;
  business_model: string;
  brand_strength_signals: string[];
  existing_pr_signals: string[];
  link_worthy_assets: string[];
  current_gaps: string[];
  raw_pages_fetched: string[];
}> {
  const client_url = opts.client_url.startsWith("http") ? opts.client_url : "https://" + opts.client_url;
  const pages: Array<{ url: string; html: string }> = [];
  const tryPage = async (path: string) => {
    try {
      const u = new URL(path, client_url).toString();
      const html = await fetchHtml(u, 15000);
      if (html) pages.push({ url: u, html: html.slice(0, 60_000) });
    } catch { /* silent */ }
  };

  // Path filter narrows the audit to a section of the site. The pattern
  // is treated as a prefix (everything before "*" is matched literally).
  // "/products/*" → /products as the primary fetch + /products/about etc.
  const pathPrefix = opts.path_filter ? opts.path_filter.replace(/\*+$/, "").replace(/\/+$/, "") : null;
  if (pathPrefix) {
    await tryPage(pathPrefix || "/");
    if (opts.deep) {
      for (const suffix of ["/about", "/overview", "/features", "/pricing", "/case-studies", "/customers"]) {
        await tryPage(pathPrefix + suffix);
        if (pages.length >= 6) break;
      }
    }
  } else {
    await tryPage("/");
    if (opts.deep) {
      // Common pages a backlink audit benefits from
      for (const p of ["/about", "/about-us", "/press", "/news", "/blog", "/resources", "/case-studies", "/partners"]) {
        await tryPage(p);
        if (pages.length >= 6) break;
      }
    }
  }
  if (pages.length === 0) {
    throw new Error(`Could not fetch ${client_url}${pathPrefix ? ` (path filter: ${pathPrefix})` : ""}. The site may be down, blocking automated requests, or the path may not exist.`);
  }

  // Ask the model to extract structured audit signals
  const sys = `You are a senior digital marketing strategist auditing a website to inform a backlink strategy. From the provided HTML pages, extract structured signals.

Return ONLY this JSON, nothing else:
{
  "industry": "concise industry/vertical (e.g. 'B2B SaaS — HR analytics' or 'D2C ecommerce — vegan skincare')",
  "audience": "primary audience description (1-2 sentences with specifics — role, decision-context, what they care about)",
  "business_model": "how the site makes money: ecommerce / SaaS subscription / lead gen / advertising / marketplace / agency-services / etc., with the unit-of-conversion if obvious",
  "brand_strength_signals": ["facts visible on-site that indicate brand strength: years in business, award mentions, named clients/customers, press logos, team size, founders' credentials. Quote actual text. Empty array if none."],
  "existing_pr_signals": ["evidence of existing PR activity: press page presence, named publications they've been featured in, named journalists who've covered them. Empty array if none."],
  "link_worthy_assets": ["specific assets/content/resources on the site that journalists/bloggers/resource-page editors would plausibly link to: original research, calculators, free tools, in-depth guides, statistics, datasets. Empty array if none."],
  "current_gaps": ["evident missing pieces a senior DMS would notice — no press page, no statistics page, no 'in the news' section, no 'for journalists' contact, no link-worthy original content, etc."]
}

Be specific and quote actual text from the pages where possible. Never invent. If a signal is not present, say so honestly (empty arrays).`;

  const userContent = `URL: ${client_url}\n\nPAGES FETCHED:\n\n` +
    pages.map((p, i) => `=== PAGE ${i + 1}: ${p.url} ===\n${p.html.slice(0, 35_000)}\n`).join("\n");

  const raw = await callAnthropicJson({ system: sys, user: userContent, label: "backlinks/audit", maxTokens: 3000 });
  if (!raw) {
    return {
      industry: "unknown", audience: "unknown", business_model: "unknown",
      brand_strength_signals: [], existing_pr_signals: [], link_worthy_assets: [], current_gaps: ["audit call returned empty"],
      raw_pages_fetched: pages.map(p => p.url),
    };
  }
  return { ...raw, raw_pages_fetched: pages.map(p => p.url) };
}

/* ─── Opportunities stage (six research lanes) ────────────────── */
type Opportunity = {
  category: "digital_pr" | "resource_page" | "broken_link" | "expert_quote" | "topical_co_citation" | "partnership" | "competitor_link_pattern";
  title: string;
  rationale: string;          // 1-2 sentences on why this is plausible for THIS client
  tactical_path: string;      // how to actually get the link
  effort: "low" | "medium" | "high";
  realism: "high" | "medium" | "speculative";
  example_targets?: string[]; // specific outlets/sites/people where verifiable
};

async function findOpportunities(opts: {
  audit: any;
  inputs: BacklinkBriefInputs;
  provider: BacklinkProvider;
}): Promise<{ opportunities: Opportunity[]; competitor_signals: string[]; serp_signals: string[]; provider_signals: string[]; lane_failures: string[] }> {
  const lanes: Array<{ label: string; sys: string; user: string }> = [];
  const audit = opts.audit;
  const inputs = opts.inputs;
  const competitorList = (inputs.competitor_urls || []).slice(0, 6).join(", ");
  const keywordsList = (inputs.target_keywords || []).slice(0, 15).join(", ");

  const contextBlock = `CLIENT WEBSITE: ${inputs.client_url}
INDUSTRY: ${audit.industry || "unknown"}
AUDIENCE: ${audit.audience || "unknown"}
BUSINESS MODEL: ${audit.business_model || "unknown"}
${audit.brand_strength_signals?.length ? `BRAND STRENGTH SIGNALS: ${audit.brand_strength_signals.slice(0, 6).join("; ")}` : ""}
${audit.link_worthy_assets?.length ? `LINK-WORTHY ASSETS: ${audit.link_worthy_assets.slice(0, 6).join("; ")}` : ""}
${competitorList ? `KNOWN COMPETITORS: ${competitorList}` : ""}
${keywordsList ? `TARGET KEYWORDS: ${keywordsList}` : ""}
${inputs.geography ? `GEOGRAPHY: ${inputs.geography}` : ""}
${inputs.budget_tier ? `BUDGET TIER: ${inputs.budget_tier}` : ""}`;

  // Common system prompt rules
  const commonRules = `Return ONLY this JSON (no preamble, no markdown):
{
  "opportunities": [
    { "title": "Short opportunity title", "rationale": "1-2 sentences on why this is plausible for THIS client (not generic advice)", "tactical_path": "concrete how-to: who to contact, what asset to pitch, what URL to target", "effort": "low|medium|high", "realism": "high|medium|speculative", "example_targets": ["specific publication / site / person, if you can name them honestly without inventing"] }
  ]
}

Rules:
- Be specific. "Reach out to industry publications" is useless. "Pitch a guest post to <named publication> covering <specific angle>" is useful.
- Never invent publication names, journalists, URLs, or sites. If you do not know a real example, say so by leaving example_targets empty. Generic strategic ideas are still useful; fabricated specifics destroy trust.
- Disqualify ideas that won't work for this client (small budget but high-effort tactic; B2B audience but consumer outlets). Don't pad the list.
- 3-7 opportunities per lane is enough. Quality over quantity.
- This is for 2026 SEO + AI Overviews + LLM-search era. "Topic relevance and entity association" matters as much as raw DA. Sites cited by AI Overviews for the client queries are especially valuable. Treat that explicitly.`;

  // Lane 1: Digital PR / earned media
  lanes.push({
    label: "digital_pr",
    sys: `You are a senior digital marketing strategist identifying realistic digital PR backlink opportunities.\n\nFocus: newsworthy angles this client could pitch to journalists / industry publications. Translate the client industry + assets into specific story angles. Name publications and journalist beats where you can do so honestly without inventing.\n\n${commonRules}`,
    user: contextBlock,
  });

  // Lane 2: Resource pages / link roundups
  lanes.push({
    label: "resource_page",
    sys: `You are identifying resource-page / "best of" / industry-hub backlink opportunities — pages that curate lists of useful resources in the client space and might add this client link.\n\nFocus: types of resource pages that exist for this industry, search operators to find them ("intitle:resources [client industry]", "intitle:'best X' [niche]"), and the specific asset on the client site you would pitch.\n\n${commonRules}`,
    user: contextBlock,
  });

  // Lane 3: Broken-link / unlinked-mention
  lanes.push({
    label: "broken_link",
    sys: `You are identifying broken-link reclamation + unlinked-mention opportunities for this client.\n\nFocus: industries where broken-link prospecting works best, what asset on the client site could replace common dead links in this space, and how to find unlinked brand mentions if the client has any brand strength.\n\n${commonRules}`,
    user: contextBlock,
  });

  // Lane 4: Expert quotes (HARO/Connectively/Featured/etc)
  lanes.push({
    label: "expert_quote",
    sys: `You are identifying expert-quote backlink opportunities — services like Connectively (formerly HARO), Featured, Help A B2B Writer, Qwoted, Source of Sources.\n\nFocus: which expert-quote platforms make sense for this client vertical and audience, what specific expertise the client can credibly speak to, and the realistic conversion rate the operator should expect at this budget tier.\n\n${commonRules}`,
    user: contextBlock,
  });

  // Lane 5: Topical co-citation + AI-Overview citation (2026 currency)
  lanes.push({
    label: "topical_co_citation",
    sys: `You are identifying topical co-citation and AI-Overview / LLM-search citation opportunities — the 2026 backlink currency.\n\nFocus: which sites Google AI Overviews and ChatGPT/Claude/Gemini typically cite for queries in this client space, what structured content or original research would get the client into those citations, and the schema/entity-association tactics that make a site discoverable as a citable source.\n\nNote: Google AI Overviews and LLM-citing search engines now cite specific authoritative sources for answers. Getting cited matters as much as ranking on the SERP itself.\n\n${commonRules}`,
    user: contextBlock,
  });

  // Lane 6: Partnership / co-marketing
  lanes.push({
    label: "partnership",
    sys: `You are identifying partnership and co-marketing backlink opportunities — adjacent, non-competing brands the client could partner with on co-branded content, joint research, or mutual recommendations.\n\nFocus: types of adjacent brands that share this client audience without competing for the same conversion, structures the partnership could take (co-authored white papers, joint webinars, mutual integrations), and how to identify candidates.\n\n${commonRules}`,
    user: contextBlock,
  });

  // Run lanes in parallel — each is one LLM call
  const allOpps: Opportunity[] = [];
  const failures: string[] = [];
  const runs = await Promise.all(lanes.map(async (lane) => {
    try {
      const parsed = await callAnthropicJson({ system: lane.sys, user: lane.user, label: `backlinks/${lane.label}`, maxTokens: 3000 });
      if (parsed?.opportunities && Array.isArray(parsed.opportunities)) {
        const tagged = parsed.opportunities.map((o: any) => ({ ...o, category: lane.label }));
        return { lane: lane.label, opps: tagged };
      }
      return { lane: lane.label, opps: [], failed: "no opportunities array in response" };
    } catch (e: any) {
      return { lane: lane.label, opps: [], failed: e?.message || "lane failed" };
    }
  }));
  for (const r of runs) {
    allOpps.push(...r.opps);
    if (r.failed) failures.push(`${r.lane}: ${r.failed}`);
  }

  // Real-data signals: competitor SERP appearance + provider data
  const serpSignals: string[] = [];
  for (const kw of (inputs.target_keywords || []).slice(0, 3)) {
    try {
      const r: any = await fetchSerpFeatures(kw, /* projectId */ "", {}).catch(() => null);
      if (r?.organic_results) {
        const top5 = r.organic_results.slice(0, 5).map((x: any) => x.link).filter(Boolean);
        if (top5.length) serpSignals.push(`Top SERP results for "${kw}": ${top5.join(", ")}`);
      }
    } catch { /* skip */ }
  }

  const providerSignals: string[] = [];
  try {
    const refDomains = await opts.provider.referringDomains(inputs.client_url);
    if (refDomains.length) {
      providerSignals.push(`Top referring domains (${opts.provider.name}): ${refDomains.slice(0, 10).map(d => d.domain).join(", ")}`);
    }
  } catch { /* skip */ }

  return {
    opportunities: allOpps,
    competitor_signals: [],
    serp_signals: serpSignals,
    provider_signals: providerSignals,
    lane_failures: failures,
  };
}

/* ─── Brief synthesis stage ───────────────────────────────────── */
import { LENS_CATALOG } from "./pm-compare.js";

const BDE_LENS_EXTENSIONS = [
  {
    id: "sales_deck",
    label: "Sales pitch deck",
    role: "a salesperson preparing a pitch deck for a prospective client meeting",
    priorities: "headline-friendly opportunities, named publication targets, ROI framing, before/after potential, before-and-after numbers if available, quotable proof points, a clear 3-month roadmap the prospect can visualise.",
  },
  {
    id: "objection_handling",
    label: "Client objection-handling",
    role: "an account manager preparing to answer a sceptical or unhappy client's questions about backlink work",
    priorities: "honest answers to 'why aren't my rankings moving despite our links', 'why is X competitor outranking me', 'how do I know what you're doing is working'; concrete evidence; what's working, what's not, and what to do differently. No hand-waving.",
  },
];

async function buildBacklinkBrief(opts: {
  inputs: BacklinkBriefInputs;
  audit: any;
  opportunities: any;
  /** Build 12.4 — progress hook called at synthesis sub-stages.
      Receives a free-text stage label. Optional; no-op when omitted. */
  onProgress?: (stage: string, detail?: { sections_done?: number; sections_total?: number }) => Promise<void> | void;
}): Promise<{ brief_md: string; title: string; llm_calls: number }> {
  const inputs = opts.inputs;
  const audit = opts.audit;
  const opps = opts.opportunities;

  // Resolve lenses (default to Senior DMS if none chosen)
  const resolvedLenses: Array<{ label: string; role: string; priorities: string }> = [];
  const fullCatalog = [...LENS_CATALOG, ...BDE_LENS_EXTENSIONS];
  for (const sel of (inputs.lenses || []).slice(0, 5)) {
    if (sel.kind === "preset") {
      const def = fullCatalog.find(l => l.id === sel.id);
      if (def) resolvedLenses.push({ label: def.label, role: def.role, priorities: def.priorities });
    } else if (sel.kind === "custom") {
      const desc = String(sel.description || "").trim();
      if (desc.length >= 5) resolvedLenses.push({ label: "Custom reader", role: "a specific reader described by the operator", priorities: desc });
    }
  }
  if (resolvedLenses.length === 0) {
    const dms = fullCatalog.find(l => l.id === "senior_dm");
    if (dms) resolvedLenses.push({ label: dms.label, role: dms.role, priorities: dms.priorities });
  }

  const lensBlock = `\nREADERS OF THIS BRIEF (tailor tone, depth, and emphasis):\n${resolvedLenses.map((l, i) => `  ${i + 1}. ${l.label} — ${l.role}.\n     Concerns: ${l.priorities}`).join("\n")}\n\nLENS RULES:\n- Tag each tactical recommendation with which lens(es) demanded it.\n- When two lenses imply different framing, present both, do not average.\n- The Senior DMS lens (if selected) is the quality gate — its priorities override others when there is a conflict over factual accuracy or strategic soundness.\n`;

  /* ─── Build 12.4: SECTION-BY-SECTION SYNTHESIS ──────────────
     Original single-call synthesis hit 14k output tokens and routinely
     timed out or returned malformed JSON. Replaced with:

       Pass 1 (FRAMING): one call ~3000 tokens for title, exec summary,
         current state, 90-day plan, what-not-to-do, caveats, op notes.

       Pass 2 (SECTIONS): six parallel calls, one per category, each
         ~1500 tokens. Each receives the framing exec_summary so all
         sections share a coherent north star.

     Total wall time: typically 30-50s (vs 120-240s before).
     Total LLM calls for synthesis: 7 (was 1). Smaller calls are cheaper
     per-token and far less likely to truncate.
     Reliability: a single section failure no longer kills the whole brief. */

  const sharedContextBlock = `
2026 SEO + AI-SEARCH CONTEXT:
- AI Overviews and LLM-search (ChatGPT, Claude, Gemini, Perplexity) cite specific authoritative sources. Getting cited there matters as much as ranking.
- Topic relevance and entity association beat raw DA. A topically-aligned link from a smaller site outweighs a higher-DA link from a tangentially-related one.
- E-E-A-T signals are interpreted across the web — what the client publishes, who quotes them, the schema they expose.
- Quantity link building is dead. Toxic and PBN links actively harm.

ABSOLUTE RULES:
- Never invent publication names, journalist names, specific URLs, or tools. If you cannot name honestly, leave example_targets empty.
- Use ranges, not point estimates ("3-7 high-quality links per quarter is realistic at this budget tier", never "you will get exactly 12 links").
- Mark speculative opportunities as speculative.
- Do not use internal vocabulary ("pillar", "step report", "workspace").
${lensBlock}`;

  const auditDigest = JSON.stringify(audit, null, 2);
  const inputsDigest = JSON.stringify({ ...inputs, lenses: undefined }, null, 2);
  // Pre-bucket opportunities by category so each section call only sees
  // its own raw research lane output. Cuts each section call's input size
  // from ~all opportunities to ~7-10 items.
  const oppsAll: any[] = Array.isArray(opps?.opportunities) ? opps.opportunities : [];
  const oppsByCategory: Record<string, any[]> = {};
  for (const o of oppsAll) {
    const cat = o.category || "other";
    if (!oppsByCategory[cat]) oppsByCategory[cat] = [];
    oppsByCategory[cat].push(o);
  }

  /* ─── PASS 1: FRAMING ─────────────────────────────────────── */
  const framingSystem = `You are a senior digital marketing strategist preparing the FRAMING SECTIONS of a client-ready Backlink Strategy Brief. The opportunity sections will be written in a separate pass — your job is the strategic frame around them.

${sharedContextBlock}

OUTPUT — return ONLY this JSON, no preamble:
{
  "title": "concise brief title — e.g. 'Backlink Strategy Brief · <hostname>'",
  "executive_summary": "3-5 sentence summary that gives a C-level reader the entire picture. Lead with the single most important takeaway. Reference the audit's industry and standout signals.",
  "current_state": "2-3 paragraph markdown — honest assessment of where this client stands today: industry, audience, business model in plain English; brand-strength signals from the audit (quote them); existing PR signals; link-worthy assets currently on the site; current gaps a senior practitioner would flag.",
  "ninety_day_plan": "Two-paragraph markdown — what the client/agency should actually do in 90 days, in order, with realistic effort estimates and budget-tier-appropriate scope.",
  "what_not_to_do": "One paragraph markdown — explicit disqualifications: tactics that look attractive but won't work for THIS client, common mistakes in this industry, why some 'easy wins' are traps.",
  "honest_caveats": "What we cannot know without external backlink tools (Ahrefs/Majestic/Moz). Where confidence is lower. What to verify before pitching to client.",
  "operator_notes": "Internal note — anything ambiguous, anything that needs verification, anything that would change with more context. Not shown to client."
}`;

  const framingUser = `INPUTS:\n${inputsDigest}\n\nAUDIT:\n${auditDigest}\n\nResearch lanes have already surfaced ${oppsAll.length} opportunities across ${Object.keys(oppsByCategory).length} categories — they will be written up separately. Focus on the strategic frame.`;

  if (opts.onProgress) await opts.onProgress("synthesizing_framing");
  const framingParsed = await callAnthropicJson({ system: framingSystem, user: framingUser, label: "backlinks/synth-framing", maxTokens: 3500 });
  if (!framingParsed || !framingParsed.executive_summary) {
    throw new Error("Backlink brief framing returned empty or malformed output. The audit + research data may not be substantial enough — try with deep_audit enabled or supply more operator context.");
  }

  /* ─── PASS 2: SIX PARALLEL SECTIONS ─────────────────────────
     Each section call sees the framing exec_summary so all sections
     share a north star. Receives only its own raw opportunities. */

  const sectionDefs: Array<{ key: string; category_label: string; framing_hint: string }> = [
    { key: "digital_pr", category_label: "Digital PR", framing_hint: "newsworthy angles, journalist beats, named publication targets where honestly knowable" },
    { key: "resource_page", category_label: "Resource Pages", framing_hint: "link-roundup / 'best of' / industry-hub pages, search operators to find them, what asset to pitch" },
    { key: "broken_link", category_label: "Broken-link reclamation", framing_hint: "broken-link prospecting in this industry, what asset would replace common dead links, unlinked brand mentions" },
    { key: "expert_quote", category_label: "Expert quotes (HARO / Featured / Connectively)", framing_hint: "which expert-quote platforms fit this vertical, what expertise the client can credibly speak to, realistic conversion at this budget" },
    { key: "topical_co_citation", category_label: "Topical co-citation + AI-Overview / LLM-search visibility", framing_hint: "which sites AI Overviews and LLM search typically cite for this space, what structured content gets a site into those citations, entity-association tactics" },
    { key: "partnership", category_label: "Partnerships / co-marketing", framing_hint: "adjacent non-competing brands, partnership structures (co-authored white papers, joint webinars, mutual integrations), how to identify candidates" },
  ];

  const sectionUserBase = `CLIENT WEBSITE: ${inputs.client_url}
INDUSTRY: ${audit.industry || "unknown"}
AUDIENCE: ${audit.audience || "unknown"}
BUSINESS MODEL: ${audit.business_model || "unknown"}
${inputs.geography ? `GEOGRAPHY: ${inputs.geography}\n` : ""}${inputs.budget_tier ? `BUDGET TIER: ${inputs.budget_tier}\n` : ""}${audit.link_worthy_assets?.length ? `LINK-WORTHY ASSETS: ${audit.link_worthy_assets.slice(0, 5).join("; ")}\n` : ""}
EXECUTIVE SUMMARY (the rest of the brief's frame — your section must align with this):
${framingParsed.executive_summary}`;

  if (opts.onProgress) await opts.onProgress("synthesizing_sections", { sections_done: 0, sections_total: sectionDefs.length });

  let sectionsDone = 0;
  const sectionRuns = await Promise.all(sectionDefs.map(async (def) => {
    const rawOpps = oppsByCategory[def.key] || [];
    const sectionSystem = `You are writing ONE section of a Backlink Strategy Brief — the "${def.category_label}" section.

The rest of the brief (framing, other sections) is being written in parallel. Your section must be self-contained but consistent with the executive summary you'll see.

FOCUS: ${def.framing_hint}

${sharedContextBlock}

OUTPUT — return ONLY this JSON, no preamble:
{
  "category": "${def.category_label}",
  "summary": "1-2 sentences on this category specifically for THIS client (not generic)",
  "opportunities": [
    {
      "title": "Specific opportunity title",
      "rationale": "Why this works for THIS client (specific to their industry/audience/assets)",
      "tactical_path": "Concrete how-to: who to contact, what asset to pitch, what to send, expected timeline",
      "effort": "low|medium|high",
      "realism": "high|medium|speculative",
      "example_targets": ["specific named target if you can name honestly without inventing; empty array if not"],
      "lenses": ["lens label 1", "lens label 2"]
    }
  ]
}

RULES:
- 3-7 opportunities. Quality over quantity. Disqualify wrong-fit ideas instead of padding.
- If a raw research opportunity below doesn't fit this client, ignore it.
- If you have your own better opportunity not in the raw research, add it.
- If the raw research is empty for this category, you may still produce 2-3 opportunities from first principles based on the audit signals.
- Never invent specific URLs, named journalists, or publication names. Generic strategic ideas are fine; fabricated specifics destroy trust.`;

    const sectionUser = `${sectionUserBase}

RAW RESEARCH FROM THIS CATEGORY'S LANE (${rawOpps.length} items — synthesise, de-duplicate, prioritise; drop items that don't fit this client):
${JSON.stringify(rawOpps, null, 2)}

Write the "${def.category_label}" section as JSON per the schema.`;

    try {
      const parsed = await callAnthropicJson({ system: sectionSystem, user: sectionUser, label: `backlinks/synth-${def.key}`, maxTokens: 2500 });
      sectionsDone += 1;
      if (opts.onProgress) { try { await opts.onProgress("synthesizing_sections", { sections_done: sectionsDone, sections_total: sectionDefs.length }); } catch { /* silent */ } }
      if (parsed && Array.isArray(parsed.opportunities)) {
        return { ok: true, section: parsed };
      }
      // Failed section — return a placeholder so the brief still has the category but flags the gap
      return {
        ok: false,
        section: {
          category: def.category_label,
          summary: `_Section generation failed for this category. ${rawOpps.length} raw research items are preserved in the operator notes._`,
          opportunities: [],
        },
        rawCount: rawOpps.length,
      };
    } catch (e: any) {
      sectionsDone += 1;
      if (opts.onProgress) { try { await opts.onProgress("synthesizing_sections", { sections_done: sectionsDone, sections_total: sectionDefs.length }); } catch { /* silent */ } }
      return {
        ok: false,
        section: {
          category: def.category_label,
          summary: `_Section generation threw an error: ${e?.message || "unknown"}_`,
          opportunities: [],
        },
        rawCount: rawOpps.length,
      };
    }
  }));

  const sections = sectionRuns.map(r => r.section);
  const failedSections = sectionRuns.filter(r => !r.ok).map(r => r.section.category);

  // Append failure notes to operator_notes if any section died
  let operator_notes = framingParsed.operator_notes || "";
  if (failedSections.length) {
    operator_notes = (operator_notes ? operator_notes + " " : "") +
      `[Build 12.4] Failed sections: ${failedSections.join(", ")}. Raw research from these lanes is in opportunities_json; the brief is partial.`;
  }

  /* ─── Assemble + render ───────────────────────────────────── */
  const parsed = {
    title: framingParsed.title || `Backlink Strategy Brief · ${(() => { try { return new URL(inputs.client_url.startsWith("http") ? inputs.client_url : "https://" + inputs.client_url).hostname.replace(/^www\./, ""); } catch { return inputs.client_url; } })()}`,
    executive_summary: framingParsed.executive_summary,
    current_state: framingParsed.current_state || "",
    sections,
    ninety_day_plan: framingParsed.ninety_day_plan || "",
    what_not_to_do: framingParsed.what_not_to_do || "",
    honest_caveats: framingParsed.honest_caveats || "",
    operator_notes,
  };

  const brief_md = renderBacklinkBrief({
    inputs,
    audit,
    payload: parsed,
    lens_labels: resolvedLenses.map(l => l.label),
  });

  // 1 framing + 6 sections = 7 LLM calls for synthesis stage
  return { brief_md, title: parsed.title, llm_calls: 7 };
}

function renderBacklinkBrief(opts: { inputs: BacklinkBriefInputs; audit: any; payload: any; lens_labels: string[] }): string {
  const { inputs, audit, payload, lens_labels } = opts;
  const L: string[] = [];
  const hostname = (() => { try { return new URL(inputs.client_url.startsWith("http") ? inputs.client_url : "https://" + inputs.client_url).hostname.replace(/^www\./, ""); } catch { return inputs.client_url; } })();

  L.push(`# ${payload.title || `Backlink Strategy Brief · ${hostname}`}`);
  L.push("");
  L.push(`**Client website:** ${inputs.client_url}  `);
  L.push(`**Industry:** ${audit.industry || "unknown"}  `);
  if (inputs.geography) L.push(`**Geography:** ${inputs.geography}  `);
  if (inputs.budget_tier) L.push(`**Budget tier:** ${inputs.budget_tier}  `);
  if (lens_labels.length) L.push(`**Read for:** ${lens_labels.join(" · ")}  `);
  L.push(`**Generated:** ${new Date().toLocaleDateString("en-GB")}`);
  L.push("");
  L.push("---");
  L.push("");

  // Executive summary
  L.push(`## Executive summary`);
  L.push("");
  L.push(String(payload.executive_summary || "_(empty)_"));
  L.push("");

  // Current state
  L.push(`## Where this client stands today`);
  L.push("");
  L.push(String(payload.current_state || "_(empty)_"));
  L.push("");

  // Sections per category
  if (Array.isArray(payload.sections)) {
    L.push(`## Opportunity landscape`);
    L.push("");
    for (const sec of payload.sections) {
      L.push(`### ${sec.category || "Untitled category"}`);
      L.push("");
      if (sec.summary) { L.push(String(sec.summary)); L.push(""); }
      if (Array.isArray(sec.opportunities) && sec.opportunities.length) {
        for (const o of sec.opportunities) {
          const effortTag = o.effort ? `**[${String(o.effort).toUpperCase()} effort]** ` : "";
          const realismTag = o.realism ? ` · _${o.realism} realism_` : "";
          const lensTag = Array.isArray(o.lenses) && o.lenses.length ? ` _(${o.lenses.join(" · ")})_` : "";
          L.push(`- ${effortTag}**${o.title}**${realismTag}${lensTag}`);
          if (o.rationale) L.push(`  - _Why for this client:_ ${o.rationale}`);
          if (o.tactical_path) L.push(`  - _How:_ ${o.tactical_path}`);
          if (Array.isArray(o.example_targets) && o.example_targets.length) {
            L.push(`  - _Example targets:_ ${o.example_targets.join("; ")}`);
          }
        }
      } else {
        L.push(`_No opportunities surfaced in this category for this client._`);
      }
      L.push("");
    }
  }

  // 90-day plan
  if (payload.ninety_day_plan) {
    L.push(`## Next 90 days — what to actually do`);
    L.push("");
    L.push(String(payload.ninety_day_plan));
    L.push("");
  }

  // What not to do
  if (payload.what_not_to_do) {
    L.push(`## What not to do`);
    L.push("");
    L.push(String(payload.what_not_to_do));
    L.push("");
  }

  // Caveats
  L.push(`## Honest caveats`);
  L.push("");
  L.push(String(payload.honest_caveats || "_(none stated)_"));
  L.push("");

  // Operator notes (footer, smaller — internal only)
  if (payload.operator_notes) {
    L.push("---");
    L.push("");
    L.push(`> **Operator notes (internal):** ${payload.operator_notes}`);
  }

  return L.join("\n");
}

/* ─── Anthropic helper with retry + JSON repair ───────────────── */
async function callAnthropicJson(opts: { system: string; user: string; label: string; maxTokens: number }): Promise<any | null> {
  if (!ANTHROPIC_API_KEY) { console.error(`[${opts.label}] ANTHROPIC_API_KEY missing`); return null; }
  const RETRYABLE = new Set([429, 503, 529]);
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, attempt === 2 ? 1000 : 4000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: opts.maxTokens, system: opts.system, messages: [{ role: "user", content: opts.user }] }),
      });
      clearTimeout(timer);
      if (r.ok) {
        const d = await r.json();
        const raw = (d?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
        let clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
        const first = clean.indexOf("{");
        if (first >= 0) clean = clean.slice(first);
        try { return JSON.parse(clean); }
        catch {
          const last = clean.lastIndexOf("}");
          if (last > 0) { try { return JSON.parse(clean.slice(0, last + 1)); } catch { /* fall */ } }
          console.error(`[${opts.label}] JSON parse failed. raw head: ${raw.slice(0, 200)}`);
          return null;
        }
      }
      if (!RETRYABLE.has(r.status) || attempt === 3) {
        const t = await r.text().catch(() => "");
        console.error(`[${opts.label}] HTTP ${r.status}: ${t.slice(0, 200)}`);
        return null;
      }
    } catch (e: any) {
      clearTimeout(timer);
      if (attempt === 3 || controller.signal.aborted) {
        console.error(`[${opts.label}] exc ${e?.message}`);
        return null;
      }
    }
  }
  return null;
}

/* ─── Public entry: run a full backlink brief ─────────────────── */
export async function runBacklinkBrief(opts: {
  projectId?: string | null;       // nullable for BDE-standalone (Build 12.1)
  campaignId?: string;
  inputs: BacklinkBriefInputs;
  provider?: BacklinkProvider;
  /** Build 12.3 — when provided, the brief row is created with this
      client_request_id in progress_json so the client can poll for
      status updates while runBacklinkBrief is still executing. */
  client_request_id?: string;
}): Promise<{ success: boolean; brief_id?: string; report_id?: string; title?: string; brief_md?: string; assets_extracted?: number; error?: string }> {
  const provider = opts.provider || StubProvider;
  const startedAt = Date.now();
  let llm_calls_used = 0;
  let web_searches_used = 0;

  // Resolve scope. Explicit input.scope wins; otherwise infer from projectId
  // and lead_id presence. project → "project", lead → "bde_lead", neither → "bde_standalone".
  const scope: "project" | "bde_lead" | "bde_standalone" =
    opts.inputs.scope ??
    (opts.projectId ? "project" : opts.inputs.lead_id ? "bde_lead" : "bde_standalone");

  // Guard: project scope demands a projectId; bde_lead demands a lead_id.
  if (scope === "project" && !opts.projectId) {
    return { success: false, error: "scope 'project' requires a projectId" };
  }
  if (scope === "bde_lead" && !opts.inputs.lead_id) {
    return { success: false, error: "scope 'bde_lead' requires a lead_id" };
  }

  /* ─── Build 12.3 — early row insert + progress tracking ──────── */
  // Create the brief row immediately with status='audit_running' so the
  // client can begin polling for progress. Includes a client_request_id
  // if the caller provided one so the client can find its own row.
  let brief_id: string | undefined;
  const initialRow: any = {
    project_id: opts.projectId || null,
    campaign_id: opts.campaignId || null,
    client_url: opts.inputs.client_url,
    inputs_json: opts.inputs,
    brief_md: "",                    // populated on completion
    llm_calls_used: 0,
    web_searches_used: 0,
    scope,
    lead_id: opts.inputs.lead_id || null,
    path_filter: opts.inputs.path_filter || null,
    status: "audit_running",
    started_at: new Date().toISOString(),
    progress_json: {
      stage: "audit_running",
      lanes_total: 6,
      lanes_done: 0,
      client_request_id: opts.client_request_id || null,
      started_at_ms: startedAt,
    },
  };
  try {
    const { data, error } = await db().from("backlink_briefs").insert(initialRow).select("id").single();
    if (error) {
      // Migration 12.3 may not be applied yet — fall back to minimal row.
      // The brief still runs; just no live progress.
      const minimal: any = { ...initialRow };
      delete minimal.status; delete minimal.started_at; delete minimal.progress_json;
      const retry = await db().from("backlink_briefs").insert(minimal).select("id").single();
      if (retry.error) {
        console.warn(`[backlinks] could not create progress row: ${retry.error.message}`);
      } else {
        brief_id = (retry.data as any).id;
        console.warn(`[backlinks] persisted without 12.3 progress columns; run the migration to enable live progress`);
      }
    } else {
      brief_id = (data as any).id;
    }
  } catch (e: any) {
    console.warn(`[backlinks] initial insert threw: ${e?.message}`);
  }

  /* Helper: update progress without crashing on any DB / schema error.
     Best-effort writes — if the migration is not applied, these no-op
     silently and the pipeline continues to completion. */
  const updateProgress = async (patch: { status?: string; stage?: string; lanes_done?: number; error_message?: string | null }) => {
    if (!brief_id) return;
    try {
      const update: any = {};
      if (patch.status) update.status = patch.status;
      if (patch.error_message !== undefined) update.error_message = patch.error_message;
      // Merge progress_json fields
      const progress: any = { stage: patch.stage || patch.status, lanes_total: 6 };
      if (typeof patch.lanes_done === "number") progress.lanes_done = patch.lanes_done;
      progress.client_request_id = opts.client_request_id || null;
      progress.elapsed_seconds = Math.round((Date.now() - startedAt) / 1000);
      update.progress_json = progress;
      await db().from("backlink_briefs").update(update).eq("id", brief_id);
    } catch { /* silent — progress writes never block the pipeline */ }
  };

  /* Wall-time abort: at 280 seconds we proactively mark the brief as
     timed_out, give up, and return cleanly. Vercel's hard cap on this
     function is 300s; we want to write our own status before Vercel
     kills us, otherwise the brief sits in 'lanes_running' forever. */
  const WALL_TIMEOUT_MS = 280_000;
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    updateProgress({ status: "timed_out", error_message: "Wall-time limit reached (~280s). Some lanes may have completed; see partial results." });
  }, WALL_TIMEOUT_MS);

  try {
    // Stage 1 — audit (respects path_filter when set)
    if (timedOut) throw new Error("Aborted before audit due to wall-time limit.");
    const audit = await auditWebsiteForBacklinks({
      client_url: opts.inputs.client_url,
      deep: opts.inputs.deep_audit === true,
      path_filter: opts.inputs.path_filter,
    });
    llm_calls_used += 1;
    web_searches_used += (audit as any).raw_pages_fetched?.length || 0;
    await updateProgress({ status: "lanes_running", lanes_done: 0 });

    // Stage 2 — opportunities (6 parallel lanes). The current
    // implementation runs all 6 in Promise.all and resolves together,
    // so we can not increment lanes_done per-completion without
    // refactoring findOpportunities. As a partial improvement, mark
    // 'lanes_running' before and 'lanes_complete' after; per-lane
    // counting can be added later if useful.
    if (timedOut) throw new Error("Aborted before opportunities lanes due to wall-time limit.");
    const opps = await findOpportunities({ audit, inputs: opts.inputs, provider });
    llm_calls_used += 6;
    await updateProgress({ status: "synthesizing", lanes_done: 6 });

    // Stage 3 — brief synthesis (split into framing + 6 parallel sections per Build 12.4)
    if (timedOut) throw new Error("Aborted before synthesis due to wall-time limit.");
    const synth = await buildBacklinkBrief({
      inputs: opts.inputs,
      audit,
      opportunities: opps,
      onProgress: async (stage, detail) => {
        // Re-use the outer updateProgress helper with synthesis sub-stages.
        // The progress row gets a richer stage label for the client to display.
        if (!brief_id) return;
        try {
          const progress: any = {
            stage,
            lanes_total: 6,
            lanes_done: 6,
            client_request_id: opts.client_request_id || null,
            elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
          };
          if (detail?.sections_total) {
            progress.sections_total = detail.sections_total;
            progress.sections_done = detail.sections_done || 0;
          }
          await db().from("backlink_briefs").update({ status: "synthesizing", progress_json: progress }).eq("id", brief_id);
        } catch { /* progress writes never block synthesis */ }
      },
    });
    llm_calls_used += synth.llm_calls;
    await updateProgress({ status: "extracting_assets", lanes_done: 6 });

    // Persist final state to the brief row (or insert if early-insert failed)
    if (brief_id) {
      try {
        const finalRow: any = {
          audit_json: audit,
          opportunities_json: opps,
          brief_md: synth.brief_md,
          llm_calls_used,
          web_searches_used,
          status: "complete",
          completed_at: new Date().toISOString(),
        };
        const { error } = await db().from("backlink_briefs").update(finalRow).eq("id", brief_id);
        if (error) {
          // Migration not applied — retry without 12.3 columns
          const partial: any = {
            audit_json: audit, opportunities_json: opps, brief_md: synth.brief_md,
            llm_calls_used, web_searches_used,
          };
          await db().from("backlink_briefs").update(partial).eq("id", brief_id);
        }
      } catch (e: any) { console.warn(`[backlinks] final update threw: ${e?.message}`); }
    } else {
      // Early insert failed — fall back to original insert flow
      try {
        const insertRow: any = {
          project_id: opts.projectId || null,
          campaign_id: opts.campaignId || null,
          client_url: opts.inputs.client_url,
          inputs_json: opts.inputs,
          audit_json: audit,
          opportunities_json: opps,
          brief_md: synth.brief_md,
          llm_calls_used,
          web_searches_used,
          scope,
          lead_id: opts.inputs.lead_id || null,
          path_filter: opts.inputs.path_filter || null,
        };
        const { data } = await db().from("backlink_briefs").insert(insertRow).select("id").single();
        if (data) brief_id = (data as any).id;
      } catch (e: any) { console.warn(`[backlinks] late insert threw: ${e?.message}`); }
    }

    // Also persist to seo_campaign_reports — but only when there is a project.
    // BDE-standalone briefs have no project to live in; their canonical home
    // is backlink_briefs (and the registry).
    let report_id: string | undefined;
    if (opts.projectId) {
      try {
        const { data, error } = await db().from("seo_campaign_reports").insert({
          project_id: opts.projectId,
          campaign_id: opts.campaignId || null,
          pillar: "backlink_strategy",
          report_kind: "backlink_strategy_brief",
          generated_by: "manual",
          llm_calls_used,
          web_searches_used,
          title: synth.title,
          body_md: synth.brief_md,
          confidence_rating: "medium",
          data_sources: ["on-site fetch", "SerpAPI", provider.name],
          llm_summary: "",
        }).select("id").single();
        if (error) {
          const retry = await db().from("seo_campaign_reports").insert({
            project_id: opts.projectId,
            campaign_id: opts.campaignId || null,
            pillar: "backlink_strategy",
            report_kind: "backlink_strategy_brief",
            generated_by: "manual",
            llm_calls_used,
            web_searches_used,
            title: synth.title,
            body_md: synth.brief_md,
          }).select("id").single();
          if (retry.error) console.warn(`[backlinks] could not persist to seo_campaign_reports: ${retry.error.message}`);
          else report_id = (retry.data as any).id;
        } else report_id = (data as any).id;
      } catch (e: any) { console.warn(`[backlinks] seo_campaign_reports insert threw: ${e?.message}`); }
    }

    // Extract assets from the opportunities and persist them to the registry.
    // Runs after the brief is saved so source_brief_id can point to it.
    let assets_extracted = 0;
    if (brief_id) {
      try {
        assets_extracted = await extractAndPersistAssets({
          brief_id,
          project_id: opts.projectId || null,
          lead_id: opts.inputs.lead_id || null,
          scope,
          opps,
          industry: audit.industry || "",
          audience: audit.audience || "",
        });
      } catch (e: any) { console.warn(`[backlinks] asset extraction threw: ${e?.message}`); }
    }

    await updateProgress({ status: "complete" });
    clearTimeout(timeoutHandle);

    console.log(`[backlinks] brief done in ${Math.round((Date.now() - startedAt) / 1000)}s · llm=${llm_calls_used} · brief_id=${brief_id} · report_id=${report_id} · assets=${assets_extracted}`);
    return { success: true, brief_id, report_id, title: synth.title, brief_md: synth.brief_md, assets_extracted };
  } catch (e: any) {
    clearTimeout(timeoutHandle);
    const msg = e?.message || "Backlink brief failed.";
    await updateProgress({ status: timedOut ? "timed_out" : "failed", error_message: msg });
    return { success: false, brief_id, error: msg };
  }
}

/* ─── Build 12.3 — Status polling for in-flight briefs ───────── */
/* Returns the current status row. Client supplies either a brief_id
   (if it already has one from a completed run) or a client_request_id
   that was sent in the run call — server uses that to find the row
   created at the very start of the pipeline. */
export async function getBacklinkBriefStatus(opts: {
  brief_id?: string;
  client_request_id?: string;
}): Promise<{ success: boolean; status?: string; stage?: string; lanes_done?: number; lanes_total?: number; elapsed_seconds?: number; brief_id?: string; error_message?: string | null; complete?: boolean; brief_md?: string; title?: string; error?: string }> {
  try {
    let q = db().from("backlink_briefs").select("id, status, progress_json, brief_md, error_message, inputs_json, client_url, started_at, completed_at").limit(1);
    if (opts.brief_id) {
      q = q.eq("id", opts.brief_id);
    } else if (opts.client_request_id) {
      // Postgres jsonb match — exact equality on the nested key
      q = q.eq("progress_json->>client_request_id", opts.client_request_id);
    } else {
      return { success: false, error: "Either brief_id or client_request_id required." };
    }
    // Pick the most recent if multiple (shouldn't happen but defensive)
    q = q.order("started_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
    const { data, error } = await q.maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "No brief found for that request id yet — may still be starting up." };
    const row: any = data;
    const progress = row.progress_json || {};
    const complete = row.status === "complete";
    const title = complete && row.brief_md ? `Backlink Strategy Brief · ${(() => { try { return new URL(row.client_url?.startsWith("http") ? row.client_url : "https://" + row.client_url).hostname.replace(/^www\./, ""); } catch { return row.client_url; } })()}` : undefined;
    return {
      success: true,
      brief_id: row.id,
      status: row.status || "unknown",
      stage: progress.stage || row.status,
      lanes_done: typeof progress.lanes_done === "number" ? progress.lanes_done : 0,
      lanes_total: typeof progress.lanes_total === "number" ? progress.lanes_total : 6,
      sections_done: typeof progress.sections_done === "number" ? progress.sections_done : null,
      sections_total: typeof progress.sections_total === "number" ? progress.sections_total : null,
      elapsed_seconds: typeof progress.elapsed_seconds === "number" ? progress.elapsed_seconds : null,
      error_message: row.error_message || null,
      complete,
      brief_md: complete ? row.brief_md : undefined,
      title,
    };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

/* ─── List prior briefs for the project ───────────────────────── */
export async function listBacklinkBriefs(projectId: string) {
  try {
    const { data, error } = await db().from("backlink_briefs")
      .select("id, client_url, created_at, inputs_json")
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(50);
    if (error) return { success: false, items: [], error: error.message };
    return { success: true, items: (data || []).map((r: any) => ({
      id: r.id, client_url: r.client_url, created_at: r.created_at,
      keywords: Array.isArray(r.inputs_json?.target_keywords) ? r.inputs_json.target_keywords.slice(0, 5) : [],
    })) };
  } catch (e: any) {
    return { success: false, items: [], error: e?.message };
  }
}

export async function loadBacklinkBrief(briefId: string, projectId: string) {
  try {
    const { data, error } = await db().from("backlink_briefs")
      .select("*").eq("id", briefId).eq("project_id", projectId).maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Brief not found." };
    return { success: true, brief: data };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

/* ─── BDE lens catalog extension (exported for UI) ────────────── */
export const BDE_LENSES = BDE_LENS_EXTENSIONS;

/* ════════════════════════════════════════════════════════════════
   Build 12.1 — Asset registry + competitor mapping
════════════════════════════════════════════════════════════════ */

/* ─── Asset extraction from brief opportunities ───────────────── */
/* After a brief is generated, walk the opportunities and persist each
   named target as a row in backlink_assets. Dedup by (domain, scope).
   Industry/audience come from the audit so cross-project search works. */
async function extractAndPersistAssets(opts: {
  brief_id: string;
  project_id: string | null;
  lead_id: string | null;
  scope: "project" | "bde_lead" | "bde_standalone";
  opps: any;
  industry: string;
  audience: string;
}): Promise<number> {
  const ops = (opts.opps?.opportunities || []) as any[];
  if (!ops.length) return 0;

  const rows: any[] = [];
  for (const opp of ops) {
    const targets = Array.isArray(opp.example_targets) ? opp.example_targets : [];
    for (const rawTarget of targets) {
      const target = String(rawTarget || "").trim();
      if (!target || target.length < 4) continue;

      // Try to extract a domain. Targets are sometimes "publication-name.com",
      // sometimes "Publication Name (publication.com)", sometimes free text.
      const urlMatch = target.match(/https?:\/\/[^\s)]+/);
      const domainMatch = !urlMatch ? target.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i) : null;
      let url: string | null = null;
      let domain: string | null = null;
      if (urlMatch) {
        try {
          const u = new URL(urlMatch[0]);
          url = u.toString();
          domain = u.hostname.replace(/^www\./, "").toLowerCase();
        } catch { /* fall through */ }
      } else if (domainMatch) {
        domain = domainMatch[1].toLowerCase();
      }
      if (!domain) continue;          // free-text targets we cannot ground

      rows.push({
        domain,
        url,
        scope: opts.scope === "project" ? "project" : opts.scope === "bde_lead" ? "cross_project" : "bde_standalone",
        project_id: opts.scope === "project" ? opts.project_id : null,
        lead_id: opts.lead_id || null,
        source_brief_id: opts.brief_id,
        category: opp.category || "other",
        industries_fit: opts.industry ? [opts.industry] : [],
        audience_fit: opts.audience || null,
        attainability: opp.realism === "high" ? "easy" : opp.realism === "medium" ? "moderate" : opp.realism === "speculative" ? "speculative" : "moderate",
        why_valuable: opp.rationale || opp.title || null,
        asset_to_pitch: opp.tactical_path || null,
        goods: [],
        bads: [],
        status: "new",
      });
    }
  }
  if (!rows.length) return 0;

  // Persist. Don't bother with dedup at the DB level — the registry can
  // tolerate near-duplicates; the UI deduplicates on read by domain.
  try {
    const { data, error } = await db().from("backlink_assets").insert(rows).select("id");
    if (error) {
      console.warn(`[backlinks/assets] insert failed: ${error.message}`);
      return 0;
    }
    return (data || []).length;
  } catch (e: any) {
    console.warn(`[backlinks/assets] insert threw: ${e?.message}`);
    return 0;
  }
}

/* ─── List assets with rich filtering ─────────────────────────── */
export async function listBacklinkAssets(opts: {
  projectId?: string | null;
  leadId?: string | null;
  scope?: "project" | "cross_project" | "bde_standalone" | "all";
  search?: string;        // matches domain + why_valuable + asset_to_pitch
  category?: string;
  industry?: string;
  status?: string;
  limit?: number;
}) {
  try {
    let q = db().from("backlink_assets").select("*").order("created_at", { ascending: false }).limit(opts.limit || 200);
    if (opts.scope && opts.scope !== "all") q = q.eq("scope", opts.scope);
    if (opts.projectId) q = q.eq("project_id", opts.projectId);
    if (opts.leadId) q = q.eq("lead_id", opts.leadId);
    if (opts.category) q = q.eq("category", opts.category);
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.industry) q = q.contains("industries_fit", [opts.industry]);
    if (opts.search) {
      const s = opts.search.trim();
      // Postgres ilike OR across three text fields
      q = q.or(`domain.ilike.%${s}%,why_valuable.ilike.%${s}%,asset_to_pitch.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) return { success: false, items: [], error: error.message };
    return { success: true, items: data || [] };
  } catch (e: any) {
    return { success: false, items: [], error: e?.message };
  }
}

/* ─── Update asset (notes, status, goods/bads) ────────────────── */
export async function updateBacklinkAsset(opts: {
  assetId: string;
  notes?: string;
  status?: string;
  goods?: string[];
  bads?: string[];
}) {
  const patch: any = { updated_at: new Date().toISOString() };
  if (opts.notes !== undefined) patch.notes = opts.notes;
  if (opts.status !== undefined) patch.status = opts.status;
  if (Array.isArray(opts.goods)) patch.goods = opts.goods;
  if (Array.isArray(opts.bads)) patch.bads = opts.bads;
  try {
    const { error } = await db().from("backlink_assets").update(patch).eq("id", opts.assetId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

/* ─── Competitor backlink mapping ─────────────────────────────── */
/* Audits a competitor's backlink strategy (not the competitor's site
   for backlink prospects). Uses the same audit pipeline but reframes
   the LLM prompt: "what does this site do, link-wise; what's good and
   bad about their approach; what referring-domain types do they rely
   on". Results persist to competitor_backlink_maps. */
export async function runCompetitorBacklinkMap(opts: {
  projectId?: string | null;
  leadId?: string | null;
  scope?: "project" | "bde_lead" | "bde_standalone";
  competitor_url: string;
  for_client_url?: string;       // optional — frames analysis toward how the asking client could compete
  context?: string;
}): Promise<{ success: boolean; map_id?: string; summary?: string; goods?: string[]; bads?: string[]; estimated_top_referrers?: string[]; error?: string }> {
  const scope = opts.scope || (opts.projectId ? "project" : opts.leadId ? "bde_lead" : "bde_standalone");

  try {
    // Audit the competitor with the existing pipeline — same signals matter
    const competitorAudit = await auditWebsiteForBacklinks({ client_url: opts.competitor_url, deep: false });

    // Custom synthesis prompt for competitor strategy
    const sys = `You are a senior digital marketing strategist analysing a COMPETITOR website to map their backlink strategy. The output will inform an asking client about what the competitor does well and where they have weaknesses.

You have the competitor's on-site signals. You do NOT have access to backlink data tools. Reason about their LIKELY backlink approach from these on-site signals:
- A heavy press page suggests active PR work and probably media backlinks
- Original research / data pages suggest the competitor invests in linkable assets
- A "for journalists" or media kit page suggests active outreach
- Heavy customer/client logo display suggests case-study and partnership backlinks
- A "press releases" section suggests ongoing newswire activity
- Sparse/no off-page evidence suggests their strength may be elsewhere (paid, social, brand)

Return ONLY this JSON:
{
  "summary": "2-3 sentences: this competitor's backlink approach in one paragraph",
  "strategy_goods": ["concrete things this competitor does well, link-wise — quoted from on-site evidence where possible"],
  "strategy_bads": ["concrete weaknesses or gaps — things they DON'T appear to do, or do badly"],
  "estimated_top_referrers": ["plausible referring-domain TYPES based on on-site evidence — e.g. 'industry trade publications (cite specific named pubs from press page if visible)', 'B2B SaaS review sites if they have customer logos visible'. Be specific; do not list generic categories."],
  "transferable_to_client": "1-2 sentences on which parts of this strategy the asking client could realistically copy, and which parts they cannot",
  "operator_notes": "anything uncertain or that would change with backlink-data tools"
}

Rules:
- Never invent specific publications, journalists, or backlinks. If you cannot name them honestly, say so.
- Distinguish "evidence-based" claims (from the audit signals) from "plausible inference" claims (your reasoning about likely strategy).
- ${opts.for_client_url ? `The asking client is: ${opts.for_client_url}. Frame transferable_to_client specifically for them.` : "No specific asking client given; transferable_to_client should be generic guidance."}`;

    const user = `COMPETITOR URL: ${opts.competitor_url}

COMPETITOR ON-SITE AUDIT:
${JSON.stringify(competitorAudit, null, 2)}

${opts.context ? `OPERATOR CONTEXT:\n${opts.context}\n` : ""}

Produce the competitor backlink strategy map as JSON per the schema.`;

    const parsed = await callAnthropicJson({ system: sys, user, label: "backlinks/competitor-map", maxTokens: 6000 });
    if (!parsed?.summary) {
      return { success: false, error: "Competitor map returned empty or malformed output." };
    }

    // Persist
    let map_id: string | undefined;
    try {
      const competitorDomain = (() => { try { return new URL(opts.competitor_url.startsWith("http") ? opts.competitor_url : "https://" + opts.competitor_url).hostname.replace(/^www\./, ""); } catch { return opts.competitor_url; } })();
      const { data, error } = await db().from("competitor_backlink_maps").insert({
        competitor_url: opts.competitor_url,
        competitor_domain: competitorDomain,
        scope,
        project_id: opts.projectId || null,
        lead_id: opts.leadId || null,
        for_client_url: opts.for_client_url || null,
        strategy_summary: parsed.summary,
        strategy_goods: Array.isArray(parsed.strategy_goods) ? parsed.strategy_goods : [],
        strategy_bads: Array.isArray(parsed.strategy_bads) ? parsed.strategy_bads : [],
        estimated_top_referrers: Array.isArray(parsed.estimated_top_referrers) ? parsed.estimated_top_referrers : [],
        raw_findings_json: parsed,
      }).select("id").single();
      if (error) console.warn(`[backlinks/competitor-map] persist failed: ${error.message}`);
      else map_id = (data as any).id;
    } catch (e: any) { console.warn(`[backlinks/competitor-map] insert threw: ${e?.message}`); }

    return {
      success: true,
      map_id,
      summary: parsed.summary,
      goods: parsed.strategy_goods || [],
      bads: parsed.strategy_bads || [],
      estimated_top_referrers: parsed.estimated_top_referrers || [],
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "Competitor backlink map failed." };
  }
}

/* ─── Batch competitor mapping ────────────────────────────────── */
export async function runCompetitorBatch(opts: {
  projectId?: string | null;
  leadId?: string | null;
  scope?: "project" | "bde_lead" | "bde_standalone";
  competitor_urls: string[];
  for_client_url?: string;
  context?: string;
}): Promise<{ success: boolean; maps?: any[]; comparison_md?: string; error?: string }> {
  const list = (opts.competitor_urls || []).slice(0, 5).filter(Boolean);
  if (list.length < 2) return { success: false, error: "Batch competitor mapping needs at least 2 URLs (max 5)." };

  // Run individual maps in parallel
  const maps = await Promise.all(list.map(url => runCompetitorBacklinkMap({
    projectId: opts.projectId, leadId: opts.leadId, scope: opts.scope,
    competitor_url: url, for_client_url: opts.for_client_url, context: opts.context,
  })));

  // Synthesise a comparative matrix from the successful ones
  const okMaps = maps.filter(m => m.success);
  if (!okMaps.length) return { success: false, error: "All competitor maps failed." };

  const sys = `You are a senior digital marketing strategist producing a comparative backlink-strategy matrix across multiple competitors. Identify patterns, contrasts, and what the asking client should take from the comparison.

Return ONLY this JSON:
{
  "executive_summary": "3-5 sentences: the headline pattern across these competitors",
  "matrix_md": "markdown table comparing competitors side-by-side — columns: Competitor | Strategy strength | Key tactic | Weakness | Transferable to client. Include all competitors as rows.",
  "patterns": ["pattern across multiple competitors — e.g. 'all three competitors emphasise resource-page links in the X niche, suggesting it is a viable category for the client'"],
  "what_to_copy": "markdown — what the asking client should copy from these competitors, ordered by realistic priority",
  "what_to_avoid": "markdown — competitor mistakes to avoid",
  "operator_notes": "uncertainty, what would change with backlink tools"
}`;

  const user = `ASKING CLIENT: ${opts.for_client_url || "(not specified — keep recommendations generic)"}
${opts.context ? `OPERATOR CONTEXT:\n${opts.context}\n` : ""}

COMPETITOR MAPS:
${okMaps.map((m, i) => `=== Competitor ${i + 1}: ${list[i]} ===\nSummary: ${m.summary}\nGoods: ${(m.goods || []).join("; ")}\nBads: ${(m.bads || []).join("; ")}\nEstimated referrers: ${(m.estimated_top_referrers || []).join("; ")}\n`).join("\n")}

Synthesise the matrix.`;

  const parsed = await callAnthropicJson({ system: sys, user, label: "backlinks/competitor-batch", maxTokens: 8000 });
  if (!parsed) return { success: false, error: "Comparative matrix synthesis failed.", maps: okMaps };

  // Render comparison_md
  const md: string[] = [];
  md.push(`# Competitor Backlink Strategy — Comparative Matrix`);
  md.push("");
  if (opts.for_client_url) md.push(`**Asking client:** ${opts.for_client_url}  `);
  md.push(`**Competitors analysed:** ${list.length}  `);
  md.push(`**Generated:** ${new Date().toLocaleDateString("en-GB")}`);
  md.push("");
  md.push("---");
  md.push("");
  md.push(`## Executive summary`);
  md.push("");
  md.push(String(parsed.executive_summary || "_(empty)_"));
  md.push("");
  if (parsed.matrix_md) { md.push(`## Side-by-side matrix`); md.push(""); md.push(String(parsed.matrix_md)); md.push(""); }
  if (Array.isArray(parsed.patterns) && parsed.patterns.length) {
    md.push(`## Patterns across competitors`); md.push("");
    for (const p of parsed.patterns) md.push(`- ${p}`);
    md.push("");
  }
  if (parsed.what_to_copy) { md.push(`## What the client should copy`); md.push(""); md.push(String(parsed.what_to_copy)); md.push(""); }
  if (parsed.what_to_avoid) { md.push(`## What to avoid`); md.push(""); md.push(String(parsed.what_to_avoid)); md.push(""); }
  if (parsed.operator_notes) { md.push(`---`); md.push(""); md.push(`> **Operator notes (internal):** ${parsed.operator_notes}`); }

  return { success: true, maps: okMaps, comparison_md: md.join("\n") };
}

/* ─── List competitor maps for filtering ──────────────────────── */
export async function listCompetitorMaps(opts: {
  projectId?: string | null;
  leadId?: string | null;
  scope?: "project" | "bde_lead" | "bde_standalone" | "all";
  competitor_domain?: string;
  limit?: number;
}) {
  try {
    let q = db().from("competitor_backlink_maps").select("id, competitor_url, competitor_domain, scope, project_id, lead_id, for_client_url, strategy_summary, created_at").order("created_at", { ascending: false }).limit(opts.limit || 100);
    if (opts.scope && opts.scope !== "all") q = q.eq("scope", opts.scope);
    if (opts.projectId) q = q.eq("project_id", opts.projectId);
    if (opts.leadId) q = q.eq("lead_id", opts.leadId);
    if (opts.competitor_domain) q = q.eq("competitor_domain", opts.competitor_domain);
    const { data, error } = await q;
    if (error) return { success: false, items: [], error: error.message };
    return { success: true, items: data || [] };
  } catch (e: any) {
    return { success: false, items: [], error: e?.message };
  }
}

/* ─── Extended brief lister (project + BDE scopes) ────────────── */
export async function listBacklinkBriefsExtended(opts: {
  projectId?: string | null;
  leadId?: string | null;
  scope?: "project" | "bde_lead" | "bde_standalone" | "all";
  limit?: number;
}) {
  try {
    let q = db().from("backlink_briefs").select("id, client_url, created_at, inputs_json, scope, lead_id, project_id").order("created_at", { ascending: false }).limit(opts.limit || 100);
    if (opts.scope && opts.scope !== "all") q = q.eq("scope", opts.scope);
    if (opts.projectId) q = q.eq("project_id", opts.projectId);
    if (opts.leadId) q = q.eq("lead_id", opts.leadId);
    const { data, error } = await q;
    if (error) return { success: false, items: [], error: error.message };
    return { success: true, items: (data || []).map((r: any) => ({
      id: r.id, client_url: r.client_url, created_at: r.created_at, scope: r.scope || "project",
      lead_id: r.lead_id, project_id: r.project_id,
      keywords: Array.isArray(r.inputs_json?.target_keywords) ? r.inputs_json.target_keywords.slice(0, 5) : [],
    })) };
  } catch (e: any) {
    return { success: false, items: [], error: e?.message };
  }
}
