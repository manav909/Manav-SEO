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

  const system = `You are a senior digital marketing strategist preparing a client-ready Backlink Strategy Brief.

The reader is a senior practitioner OR a client. Match their level of sophistication — never patronise but never lose them in jargon.

This brief must reflect 2026 SEO and AI-search dynamics, not 2018 link-building tactics. Specifically:
- AI Overviews (Google) and LLM-search (ChatGPT, Claude, Gemini, Perplexity) now cite specific authoritative sources for answers. Getting cited there matters as much as ranking on the classic SERP.
- Topic relevance and entity association are now first-class — a relevant link from a topically-aligned site outweighs a higher-DA link from a tangentially-related site.
- E-E-A-T signals are interpreted across the web — what the client publishes, who quotes them, what schema they expose. Backlink strategy interacts with content strategy and structured data.
- Pure-quantity link building is dead. Pure-quality is the only path. Toxic and PBN-style links actively harm.
${lensBlock}
OUTPUT — return ONLY this JSON, no preamble:
{
  "title": "concise brief title (e.g. 'Backlink Strategy Brief: <client domain>')",
  "executive_summary": "3-5 sentence summary the C-level reader gets the entire picture from. Lead with the single most important takeaway.",
  "current_state": "markdown — honest assessment of where this client stands today: industry, audience, business model in plain English; brand-strength signals; existing PR signals; link-worthy assets; current gaps. Quote from the audit. 2-3 paragraphs.",
  "sections": [
    {
      "category": "Digital PR",
      "summary": "1-2 sentences on this category for this client",
      "opportunities": [
        { "title": "Specific opportunity", "rationale": "why for THIS client", "tactical_path": "concrete how-to", "effort": "low|medium|high", "realism": "high|medium|speculative", "example_targets": ["specific where applicable, empty array if you cannot name without inventing"], "lenses": ["lens label 1", "lens label 2"] }
      ]
    },
    {
      "category": "Resource Pages",
      "summary": "...",
      "opportunities": [...]
    },
    {
      "category": "Broken-link reclamation",
      "summary": "...",
      "opportunities": [...]
    },
    {
      "category": "Expert quotes (HARO/Featured/Connectively)",
      "summary": "...",
      "opportunities": [...]
    },
    {
      "category": "Topical co-citation + AI-Overview / LLM-search visibility",
      "summary": "...",
      "opportunities": [...]
    },
    {
      "category": "Partnerships / co-marketing",
      "summary": "...",
      "opportunities": [...]
    }
  ],
  "ninety_day_plan": "markdown — what the client / agency should actually do in the next 90 days, in order, with realistic effort estimates. Two paragraphs max.",
  "what_not_to_do": "markdown — explicit disqualifications: tactics that look attractive but won't work for THIS client, common mistakes in this industry, why some 'easy wins' are traps. One paragraph.",
  "honest_caveats": "what we cannot know without external tools (Ahrefs / Majestic / Moz), where this brief's confidence is lower, what the operator should verify before pitching it to the client.",
  "operator_notes": "anything ambiguous, anything that needs verification, anything that would change with more context — internal note, not shown to client"
}

RULES (absolute):
- Never invent publication names, journalist names, specific URLs, or specific tools. If you cannot name something honestly, say so or omit example_targets.
- Never claim a tactic will produce a specific result that you cannot back up. Use ranges ("3-7 high-quality links per quarter is realistic at this budget tier") not point estimates.
- If an opportunity is speculative, mark it speculative — do not gild it.
- Lens tagging on each opportunity is required when multiple lenses are selected.
- Do not use internal vocabulary like "pillar", "step report", "workspace".`;

  const userPayload = `INPUTS:\n${JSON.stringify({ ...inputs, lenses: undefined }, null, 2)}\n\nAUDIT:\n${JSON.stringify(audit, null, 2)}\n\nOPPORTUNITIES (raw, from research lanes — synthesise, de-duplicate, prioritise):\n${JSON.stringify(opps, null, 2)}\n\nProduce the brief as JSON per the system prompt schema.`;

  const parsed = await callAnthropicJson({ system, user: userPayload, label: "backlinks/synthesise", maxTokens: 14000 });
  if (!parsed || !parsed.executive_summary) {
    throw new Error("Backlink brief synthesis returned empty or malformed output. Try again; if persistent, paste this run's id for diagnosis.");
  }

  const brief_md = renderBacklinkBrief({
    inputs,
    audit,
    payload: parsed,
    lens_labels: resolvedLenses.map(l => l.label),
  });

  return {
    brief_md,
    title: parsed.title || `Backlink Strategy Brief · ${new URL(inputs.client_url.startsWith("http") ? inputs.client_url : "https://" + inputs.client_url).hostname.replace(/^www\./, "")}`,
    llm_calls: 1,
  };
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

  try {
    // Stage 1 — audit (respects path_filter when set)
    const audit = await auditWebsiteForBacklinks({
      client_url: opts.inputs.client_url,
      deep: opts.inputs.deep_audit === true,
      path_filter: opts.inputs.path_filter,
    });
    llm_calls_used += 1;
    web_searches_used += (audit as any).raw_pages_fetched?.length || 0;

    // Stage 2 — opportunities (6 parallel lanes)
    const opps = await findOpportunities({ audit, inputs: opts.inputs, provider });
    llm_calls_used += 6;

    // Stage 3 — brief synthesis
    const synth = await buildBacklinkBrief({ inputs: opts.inputs, audit, opportunities: opps });
    llm_calls_used += synth.llm_calls;

    // Persist to backlink_briefs (graceful fallback)
    let brief_id: string | undefined;
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
      const { data, error } = await db().from("backlink_briefs").insert(insertRow).select("id").single();
      if (error) {
        // Migration may not be applied — retry without 12.1 columns
        const fallback = {
          project_id: opts.projectId || null,    // still nullable iff migration applied col change
          campaign_id: opts.campaignId || null,
          client_url: opts.inputs.client_url,
          inputs_json: opts.inputs,
          audit_json: audit,
          opportunities_json: opps,
          brief_md: synth.brief_md,
          llm_calls_used,
          web_searches_used,
        };
        const retry = await db().from("backlink_briefs").insert(fallback).select("id").single();
        if (retry.error) console.warn(`[backlinks] could not persist to backlink_briefs: ${retry.error.message}`);
        else { brief_id = (retry.data as any).id; console.warn(`[backlinks] persisted without 12.1 columns; run the migration to enable scope/lead/path_filter`); }
      } else brief_id = (data as any).id;
    } catch (e: any) { console.warn(`[backlinks] backlink_briefs insert threw: ${e?.message}`); }

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

    console.log(`[backlinks] brief done in ${Math.round((Date.now() - startedAt) / 1000)}s · llm=${llm_calls_used} · brief_id=${brief_id} · report_id=${report_id} · assets=${assets_extracted}`);
    return { success: true, brief_id, report_id, title: synth.title, brief_md: synth.brief_md, assets_extracted };
  } catch (e: any) {
    return { success: false, error: e?.message || "Backlink brief failed." };
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
