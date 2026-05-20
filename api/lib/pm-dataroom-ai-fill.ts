/* ════════════════════════════════════════════════════════════════
   api/lib/pm-dataroom-ai-fill.ts
   AI-driven Data Room field fill — for fields that have honest
   sources of truth in the system (website content, competitors,
   existing knowledge, audits) but the client hasn't provided yet.

   Two actions:
     pm_ai_fill_preview(projectId)
       → Generates a proposal WITHOUT writing. PM reviews in UI.
     pm_ai_fill_apply(projectId, selectedFields)
       → Writes ONLY the PM-approved fields with full provenance.

   Strategic discipline enforced:
   - TIER 1+2 fields only. Tier 3 (client-only knowledge) is NOT in
     the schema — AI literally cannot generate them. Instead, the AI
     produces client_questions for Tier 3 fields.
   - NEVER overwrites existing data (manual, seed, GSC, GA4 — any
     existing value is left alone).
   - Full provenance: source='ai_inferred', notes contains JSON with
     confidence, reasoning, sources_used.
   - Honest gaps: AI returns null when evidence is too thin. We
     never fabricate.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

/* ── field schema definition — the contract with the AI ──────
   Only Tier 1+2 fields. Each field declares its category, options
   (for selects), and a short prompt hint to guide the AI. */

type FieldType = "text" | "select";

interface FieldSpec {
  category: string;
  key:      string;
  type:     FieldType;
  options?: readonly string[];
  hint:     string;
  tier:     1 | 2;     /* 1 = directly observable, 2 = reasoned inference */
}

const FIELDS: FieldSpec[] = [
  /* ── IDENTITY ── */
  { category: "identity", key: "industry_specific",  type: "text",
    hint: "Specific industry description, more granular than the select option (e.g. 'B2B SaaS for SEO agencies', 'DTC men's skincare', 'RIA financial advisor')",
    tier: 2 },
  { category: "identity", key: "business_model",     type: "select",
    options: ["B2B", "B2C", "B2B2C", "Marketplace", "DTC", "Agency", "Nonprofit", "Government"],
    hint: "Inferable from website language: who they sell to, pricing model, audience phrasing.",
    tier: 1 },
  { category: "identity", key: "lifecycle_stage",    type: "select",
    options: ["Pre-launch", "Early traction", "Growth", "Mature", "Pivoting", "Acquired/being acquired"],
    hint: "Hints from website: testimonials count, team page size, funding mentions, copyright year, brand maturity of design.",
    tier: 2 },
  { category: "identity", key: "primary_offering",   type: "text",
    hint: "One-paragraph description of what they sell and to whom — extractable from homepage hero + product pages.",
    tier: 1 },
  { category: "identity", key: "unique_value_prop",  type: "text",
    hint: "One sentence — what makes them different/better. Usually explicit in the homepage hero or above-the-fold copy.",
    tier: 1 },
  { category: "identity", key: "geographic_markets", type: "text",
    hint: "Extractable from website: hreflang setup, currency symbols, contact addresses, mentions of cities/regions, language variants.",
    tier: 1 },
  { category: "identity", key: "languages",          type: "text",
    hint: "Languages targeted, based on actual website language(s) detected from supplied pages.",
    tier: 1 },
  { category: "identity", key: "year_founded",       type: "text",
    hint: "Often in the footer ('© 2018'), About page, or 'Since YYYY' badges. Return only if directly observed.",
    tier: 2 },
  { category: "identity", key: "public_or_private",  type: "select",
    options: ["Private", "Public (listed)", "Private equity backed", "VC-backed", "Bootstrapped"],
    hint: "Public if listed on a stock exchange (ticker visible). VC-backed if funding rounds mentioned. Default to Private if no signal.",
    tier: 2 },

  /* ── AUDIENCE ── */
  { category: "audience", key: "ideal_customer_profile", type: "text",
    hint: "B2B: firmographics (industry, size, role, geography). B2C: demographics (age, life stage, interests). Ground in who the website actually addresses.",
    tier: 2 },
  { category: "audience", key: "persona_1_name", type: "text",
    hint: "Title/role of the primary buyer persona (e.g. 'Marketing Director at mid-market SaaS'). Inferred from website language and CTAs.",
    tier: 2 },
  { category: "audience", key: "persona_1_motivations", type: "text",
    hint: "What pain are they solving / what outcome do they want? Extract from pain-point language used in the website copy.",
    tier: 2 },
  { category: "audience", key: "persona_2_name", type: "text",
    hint: "Only propose if the website shows clear evidence of a second distinct audience (e.g. separate landing pages, different CTAs, different value props).",
    tier: 2 },
  { category: "audience", key: "persona_2_motivations", type: "text",
    hint: "Only if persona_2_name is proposed.",
    tier: 2 },
  { category: "audience", key: "search_intent_split", type: "select",
    options: ["Mostly informational (TOFU)", "Mostly commercial/transactional (BOFU)", "Balanced TOFU + BOFU", "Mostly navigational (brand)", "Mixed — depends on persona"],
    hint: "Infer from target keywords mix and the type of pages on the site (blog-heavy vs product-heavy vs landing-page-heavy).",
    tier: 2 },
  { category: "audience", key: "funnel_focus", type: "select",
    options: ["TOFU — awareness/education", "MOFU — consideration", "BOFU — decision/conversion", "Full-funnel"],
    hint: "From CTA patterns: 'Read guide' = TOFU, 'Compare options' = MOFU, 'Buy/Book/Sign up' = BOFU. Mix = Full-funnel.",
    tier: 2 },
  { category: "audience", key: "positioning_statement", type: "text",
    hint: "Format: 'For [audience] who [need], [brand] is the [category] that [unique benefit]'. Synthesize from UVP + audience.",
    tier: 2 },

  /* ── CONTENT & EDITORIAL ── */
  { category: "content", key: "brand_voice", type: "text",
    hint: "1-2 sentences describing the brand's voice. Analyze actual copy patterns: formal/casual, technical/plain, warm/direct, etc.",
    tier: 2 },
  { category: "content", key: "brand_tone_words", type: "text",
    hint: "3-5 adjectives describing brand tone (e.g. 'warm, direct, evidence-based, occasionally witty'). Extract from actual copy.",
    tier: 2 },
  { category: "content", key: "reading_level", type: "select",
    options: ["Plain English (Grade 6-8)", "Professional (Grade 9-12)", "Specialist (industry-aware)", "Academic/technical (postgrad)"],
    hint: "Objectively measurable from supplied copy: sentence length, vocabulary complexity, industry jargon density.",
    tier: 1 },
  { category: "content", key: "content_themes", type: "text",
    hint: "Top 3-5 content themes — cluster from page titles and topics of supplied pages. Comma-separated.",
    tier: 1 },

  /* ── GOAL ── */
  { category: "goal", key: "secondary_goals", type: "text",
    hint: "Hints from website CTAs and content focus. ONLY propose if confident — better to return null than guess. Prefer 'low' confidence.",
    tier: 2 },

  /* ── COMPETITOR (positions + differentiation) ── */
  { category: "competitor", key: "competitor_1_position", type: "text",
    hint: "Where competitor 1 wins / their positioning. Based on their site language vs ours. Only propose if competitor 1 URL is supplied.",
    tier: 2 },
  { category: "competitor", key: "competitor_2_position", type: "text",
    hint: "Same as above for competitor 2.",
    tier: 2 },
  { category: "competitor", key: "competitor_3_position", type: "text",
    hint: "Same as above for competitor 3.",
    tier: 2 },
  { category: "competitor", key: "differentiation", type: "text",
    hint: "One-sentence differentiation: what makes US different from competitors. Synthesize from UVP + competitor positioning.",
    tier: 2 },
];

/* Tier 3 fields → ask the client. Used to generate client_questions list. */
const CLIENT_QUESTION_FIELDS = [
  { category: "goal",      key: "anti_goals",            question_template: "Are there things you specifically do NOT want our content or strategy to do? (Topics to avoid, claims to never make, comparisons to never draw, etc.)" },
  { category: "goal",      key: "report_audience",       question_template: "Who reads our reports? (Job titles, not names — calibrates the depth and tone we use.)" },
  { category: "content",   key: "prohibited_topics",     question_template: "Are there topics or claims we should never make? (E.g. medical advice, financial guarantees, comparisons by competitor name.)" },
  { category: "content",   key: "required_disclaimers",  question_template: "Any legal disclaimers we must include? (GDPR notices, regulatory language, illustrative-only disclaimers, etc.)" },
  { category: "audience",  key: "persona_1_objections",  question_template: "What objections do you hear most often from your primary buyer? (E.g. 'price too high', 'switching cost', 'unsure of fit'.)" },
  { category: "analytics", key: "value_per_lead",        question_template: "What's the average value of a lead from organic search? (Lets us translate traffic gains into revenue claims.)" },
  { category: "analytics", key: "value_per_customer",    question_template: "What's the lifetime value of a typical customer? (Same — lets reports talk in revenue terms.)" },
  { category: "history",   key: "prior_seo_work",        question_template: "What previous SEO work has been done — in-house, agency, freelance, or none?" },
  { category: "history",   key: "what_worked",           question_template: "What previous SEO efforts worked? (We should double down on these patterns.)" },
  { category: "history",   key: "what_didnt_work",       question_template: "What previous SEO efforts did NOT work, or caused problems? (We need to avoid repeating these.)" },
  { category: "history",   key: "active_penalties",      question_template: "Has the site ever had a manual action or algorithmic penalty? (Affects how aggressive we can be with link-building.)" },
  { category: "history",   key: "recent_migrations",     question_template: "Have you had a platform migration or major URL restructure in the last 2 years?" },
  { category: "history",   key: "business_changes",      question_template: "Any business changes coming (new product, geographic expansion, rebrand) that should shape SEO strategy?" },
  { category: "commercial", key: "engagement_type",      question_template: "How is our engagement structured — monthly retainer, project, performance-based?" },
  { category: "commercial", key: "monthly_hours",        question_template: "How many hours per month or per week do we have available for this engagement?" },
  { category: "commercial", key: "point_of_contact_role",question_template: "Who is our primary contact, by job title? (Not name — title determines how we calibrate communication.)" },
  { category: "commercial", key: "decision_maker_role",  question_template: "Who is the final decision maker for strategic shifts, by job title?" },
  { category: "commercial", key: "deliverables_expected",question_template: "What deliverables are formally expected? (E.g. monthly PDF + quarterly review.)" },
  { category: "backlinks", key: "domain_rating_ahrefs",  question_template: "Latest Ahrefs Domain Rating? (Quarterly refresh is fine.)" },
  { category: "backlinks", key: "referring_domains",     question_template: "Current count of referring domains from Ahrefs/Semrush?" },
  { category: "backlinks", key: "link_building_approach",question_template: "What's the current link-building approach (digital PR, outreach, guest posts, none)?" },
];

/* ── source aggregation ──────────────────────────────────── */

interface SourceBundle {
  project:      any;
  client:       any;
  competitors:  Array<{ id: string; url: string; label: string }>;
  existingKnowledge: Record<string, Record<string, string>>;
  pages:        Array<{
    id:        string;
    url:       string;
    owner:     "ours" | "competitor";
    title:     string;
    content:   string;          /* trimmed to ~1200 chars */
    word_count?: number;
  }>;
  latestAudit?: { synthesis?: string; overall_score?: number; created_at: string };
}

async function gatherSources(projectId: string): Promise<SourceBundle | null> {
  /* fetch the project + client */
  const { data: project } = await db().from("projects")
    .select("id,name,url,keywords,client_id,competitors")
    .eq("id", projectId).maybeSingle();
  if (!project) return null;
  const p = project as any;

  let client: any = null;
  if (p.client_id) {
    const { data } = await db().from("clients")
      .select("name,company,industry,website").eq("id", p.client_id).maybeSingle();
    client = data;
  }

  /* existing knowledge — needed both to detect already-filled fields
     and to provide context to the AI */
  const { data: knowledge } = await db().from("project_knowledge")
    .select("category,field_key,field_value,source")
    .eq("project_id", projectId);
  const existingKnowledge: Record<string, Record<string, string>> = {};
  for (const k of (knowledge || [])) {
    const r = k as any;
    (existingKnowledge[r.category] ||= {})[r.field_key] = r.field_value || "";
  }

  /* competitor list from project_knowledge (preferred) or projects.competitors fallback */
  const competitors: Array<{ id: string; url: string; label: string }> = [];
  for (const k of ["competitor_1", "competitor_2", "competitor_3"]) {
    const url = existingKnowledge.competitor?.[k];
    if (url) {
      const id = k;          /* "competitor_1" etc. — used as source identifier in AI output */
      const dr = existingKnowledge.competitor?.[`${k}_dr`] || "";
      competitors.push({ id, url, label: dr ? `${url} (${dr})` : url });
    }
  }

  /* crawled pages — ours first (homepage prioritized), then competitors */
  const { data: crawledRaw } = await db().from("crawled_pages")
    .select("id,url,owner,title,content,word_count,crawled_at")
    .eq("project_id", projectId)
    .order("crawled_at", { ascending: false })
    .limit(50);

  const pages: SourceBundle["pages"] = [];
  const cr = (crawledRaw || []) as any[];

  /* prioritise: our homepage > our other pages > competitor pages.
     Cap at 10 ours + 1 per competitor (max ~13 pages) for token budget. */
  const isHomepage = (url: string): boolean => {
    try {
      const u = new URL(url);
      return u.pathname === "/" || u.pathname === "";
    } catch { return false; }
  };
  const ours = cr.filter((c) => c.owner === "ours");
  const oursHome = ours.find((c) => isHomepage(c.url));
  const oursRest = ours.filter((c) => !isHomepage(c.url)).slice(0, 9);
  const ourPages = oursHome ? [oursHome, ...oursRest] : oursRest.slice(0, 10);

  for (const c of ourPages) {
    pages.push({
      id:         `page:ours:${pages.length + 1}${isHomepage(c.url) ? "_homepage" : ""}`,
      url:        c.url,
      owner:      "ours",
      title:      c.title || "",
      content:    String(c.content || "").slice(0, 1200),
      word_count: c.word_count || undefined,
    });
  }

  /* one page per competitor */
  for (const comp of competitors) {
    const compPage = cr.find((c) =>
      c.owner === "competitor" && c.url && c.url.includes(stripScheme(comp.url))
    );
    if (compPage) {
      pages.push({
        id:         `page:${comp.id}_homepage`,
        url:        compPage.url,
        owner:      "competitor",
        title:      compPage.title || "",
        content:    String(compPage.content || "").slice(0, 800),
        word_count: compPage.word_count || undefined,
      });
    }
  }

  /* latest audit synthesis — best-effort, may not exist */
  const { data: auditRows } = await db().from("audit_reports")
    .select("created_at,overall_score,sections")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false }).limit(1);
  let latestAudit: SourceBundle["latestAudit"] | undefined;
  if (auditRows && auditRows.length) {
    const a = auditRows[0] as any;
    /* sections is jsonb; look for a "synthesis" key if present */
    const syn = a.sections?.synthesis || a.sections?.summary || "";
    latestAudit = {
      synthesis:     typeof syn === "string" ? syn.slice(0, 1500) : "",
      overall_score: a.overall_score,
      created_at:    a.created_at,
    };
  }

  return { project: p, client, competitors, existingKnowledge, pages, latestAudit };
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/* ── prompt building ──────────────────────────────────────── */

function buildContextBlock(bundle: SourceBundle): string {
  const lines: string[] = [];
  const p = bundle.project;
  lines.push(`PROJECT: ${p.name || ""}`);
  lines.push(`URL: ${p.url || "not set"}`);
  if (Array.isArray(p.keywords) && p.keywords.length) {
    lines.push(`TARGET KEYWORDS: ${p.keywords.join(", ")}`);
  }

  if (bundle.client) {
    lines.push("");
    lines.push("CLIENT RECORD:");
    lines.push(`  Name: ${bundle.client.name || ""}`);
    if (bundle.client.company) lines.push(`  Legal entity: ${bundle.client.company}`);
    if (bundle.client.industry) lines.push(`  Industry (raw): ${bundle.client.industry}`);
    if (bundle.client.website)  lines.push(`  Website: ${bundle.client.website}`);
  }

  /* existing knowledge — only categories that are filled */
  const filledCats = Object.entries(bundle.existingKnowledge)
    .filter(([_, fields]) => Object.values(fields).some((v) => v && v.trim()));
  if (filledCats.length) {
    lines.push("");
    lines.push("EXISTING KNOWLEDGE (already in Data Room — do NOT propose values that contradict these):");
    for (const [cat, fields] of filledCats) {
      const filled = Object.entries(fields).filter(([_, v]) => v && v.trim());
      if (!filled.length) continue;
      lines.push(`  [${cat}]`);
      for (const [k, v] of filled) {
        lines.push(`    ${k}: ${String(v).slice(0, 250)}`);
      }
    }
  }

  if (bundle.competitors.length) {
    lines.push("");
    lines.push("COMPETITORS (known):");
    for (const c of bundle.competitors) {
      lines.push(`  ${c.id}: ${c.label}`);
    }
  }

  if (bundle.pages.length) {
    lines.push("");
    lines.push("WEBSITE PAGES (source content for analysis):");
    for (const page of bundle.pages) {
      lines.push("");
      lines.push(`--- ${page.id} (${page.owner}) ---`);
      lines.push(`URL: ${page.url}`);
      if (page.title)      lines.push(`Title: ${page.title}`);
      if (page.word_count) lines.push(`Word count: ${page.word_count}`);
      lines.push(`Content excerpt:`);
      lines.push(page.content || "(no content captured)");
    }
  } else {
    lines.push("");
    lines.push("WEBSITE PAGES: NONE crawled yet — many fields will require null because there's no evidence to ground them in.");
  }

  if (bundle.latestAudit?.synthesis) {
    lines.push("");
    lines.push(`LATEST AUDIT SYNTHESIS (score ${bundle.latestAudit.overall_score ?? "?"} on ${bundle.latestAudit.created_at?.slice(0, 10)}):`);
    lines.push(bundle.latestAudit.synthesis);
  }

  return lines.join("\n");
}

function buildSystemPrompt(): string {
  /* enumerate every field in the schema, with its options/hints, so
     the AI knows exactly the structure expected and which select
     options are valid. */
  const fieldSchemaText = FIELDS.map((f) => {
    const opts = f.options ? `\n      options (use one EXACTLY): ${JSON.stringify(f.options)}` : "";
    return `  ${f.category}.${f.key}  (${f.type}, tier ${f.tier})\n    hint: ${f.hint}${opts}`;
  }).join("\n");

  const clientQText = CLIENT_QUESTION_FIELDS.map((q) =>
    `  ${q.category}.${q.key}: "${q.question_template}"`
  ).join("\n");

  return [
    "You are a senior digital marketing strategist analysing a client to populate their Data Room.",
    "",
    "You will be given evidence about a client: their website pages (with content excerpts), competitors, existing knowledge, audit findings.",
    "",
    "Your task: PROPOSE values for specific Data Room fields. For each, provide an explicit CONFIDENCE LEVEL and REASONING citing the evidence you used.",
    "",
    "You MUST call the `submit_proposals` tool with your full output. Do not write any prose outside the tool call.",
    "",
    "HARD RULES:",
    "1. Only propose fields listed in the FIELD SCHEMA below. Use the exact `category.field_key` format for `field_path`.",
    "2. OMIT any field where evidence is insufficient. Do NOT include null entries or guess to fill space — just leave the field out of your proposals array.",
    "3. CONFIDENCE LEVELS:",
    "   - 'high': directly observable in the evidence (e.g. UVP from homepage hero, language from page detection)",
    "   - 'medium': reasonable inference from the evidence (e.g. persona from website language patterns)",
    "   - 'low': educated guess with limited evidence (rare — usually omit instead)",
    "4. NEVER fabricate specific numbers (employee counts, revenue figures, percentages). Omit those fields.",
    "5. For brand voice / tone, analyse actual word patterns and sentence structures in the supplied copy.",
    "6. For audience inference, ground in the actual language used on the website — who they're addressing, what pain points they highlight, what CTAs they use.",
    "7. For SELECT fields, the value MUST exactly match one of the listed options. If none fit, omit the field.",
    "8. NEVER propose values that contradict the EXISTING KNOWLEDGE section.",
    "9. If website pages are empty/missing, omit any field that requires website evidence — return only what existing knowledge supports.",
    "10. CLIENT QUESTIONS: include well-phrased questions for the listed Tier-3 fields (only the client knows). Include all of them — the PM will pick which to send.",
    "",
    "FIELD SCHEMA (eligible fields to propose):",
    fieldSchemaText,
    "",
    "CLIENT QUESTIONS (Tier 3 — include as questions, NOT values):",
    clientQText,
  ].join("\n");
}

/* ── AI generation ────────────────────────────────────────── */

interface FieldProposal {
  value:      string;
  confidence: "high" | "medium" | "low";
  reasoning:  string;
  sources:    string[];
}

interface ClientQuestion {
  field_path:      string;
  question:        string;
  why_we_need_it:  string;
}

interface AIFillResult {
  fields:           Record<string, FieldProposal | null>;
  client_questions: ClientQuestion[];
}

function parseJson(raw: string): any {
  if (!raw) return null;
  /* try plain parse first */
  try { return JSON.parse(raw); } catch { /* fall through */ }
  /* strip common LLM wrappers: markdown fences, leading prose */
  let clean = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(clean); } catch { /* fall through */ }
  /* locate the first {...} block — handles preamble like "Here is the JSON:" */
  const obj = clean.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch { /* fall through */ } }
  /* aggressive repair — drop trailing prose after the last balanced } */
  const lastBrace = clean.lastIndexOf("}");
  if (lastBrace > 0) {
    try { return JSON.parse(clean.slice(0, lastBrace + 1)); } catch { /* fall through */ }
  }
  return null;
}

/* ── AI generation ────────────────────────────────────────── */

interface FieldProposal {
  value:      string;
  confidence: "high" | "medium" | "low";
  reasoning:  string;
  sources:    string[];
}

interface ClientQuestion {
  field_path:      string;
  question:        string;
  why_we_need_it:  string;
}

interface AIFillResult {
  fields:           Record<string, FieldProposal | null>;
  client_questions: ClientQuestion[];
}

/* Schema for the submit_proposals tool. Defining the tool's input as
   JSON Schema forces the AI to produce structured output that the SDK
   parses for us — no manual JSON parsing required. */
function buildToolSchema() {
  return {
    type: "object" as const,
    properties: {
      proposals: {
        type: "array",
        description: "One entry per Data Room field you can credibly propose. Omit any field where evidence is insufficient — DO NOT include null entries.",
        items: {
          type: "object",
          properties: {
            field_path: {
              type: "string",
              description: "category.field_key — must match one of the fields listed in the system prompt's FIELD SCHEMA exactly.",
            },
            value: {
              type: "string",
              description: "Your proposed value. For select fields, must exactly match one of the listed options.",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "high = directly observable; medium = reasoned inference; low = educated guess (rare).",
            },
            reasoning: {
              type: "string",
              description: "1-2 sentences citing specific evidence.",
            },
            sources: {
              type: "array",
              items: { type: "string" },
              description: "Source identifiers used (e.g. 'page:ours:1_homepage', 'competitor_1', 'existing:goal.primary_goal').",
            },
          },
          required: ["field_path", "value", "confidence", "reasoning", "sources"],
        },
      },
      client_questions: {
        type: "array",
        description: "Well-phrased questions for Tier 3 fields the client must answer. Include the Tier 3 fields listed in the system prompt.",
        items: {
          type: "object",
          properties: {
            field_path:     { type: "string", description: "category.field_key being asked about." },
            question:       { type: "string", description: "The question to send to the client." },
            why_we_need_it: { type: "string", description: "Short rationale, 1 sentence." },
          },
          required: ["field_path", "question", "why_we_need_it"],
        },
      },
    },
    required: ["proposals", "client_questions"],
  };
}

async function generateProposals(bundle: SourceBundle): Promise<{
  result?: AIFillResult; error?: string; tokensUsed?: any; rawDebug?: string;
}> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system    = buildSystemPrompt();
  const userMsg   = buildContextBlock(bundle);

  try {
    const resp = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: userMsg }],
      tools: [{
        name: "submit_proposals",
        description: "Submit your Data Room field proposals and client questions. Call this tool exactly once with your full output.",
        input_schema: buildToolSchema() as any,
      }],
      tool_choice: { type: "tool", name: "submit_proposals" },
    });

    /* find the tool_use block — that's where the structured JSON lives */
    let toolInput: any = null;
    let textFallback = "";
    for (const block of (resp.content || [])) {
      if ((block as any).type === "tool_use" && (block as any).name === "submit_proposals") {
        toolInput = (block as any).input;
        break;
      }
      if ((block as any).type === "text") {
        textFallback += (block as any).text || "";
      }
    }

    /* fallback: if for any reason the tool wasn't called, attempt to
       parse JSON out of any text block the model returned. */
    if (!toolInput && textFallback) {
      toolInput = parseJson(textFallback);
    }

    if (!toolInput || typeof toolInput !== "object") {
      return {
        error: "AI did not return structured output",
        rawDebug: textFallback.slice(0, 500),
      };
    }

    /* normalize: tool output uses arrays; convert to the {fields, client_questions} shape */
    const fields: Record<string, FieldProposal | null> = {};
    const validKeys = new Set(FIELDS.map((f) => `${f.category}.${f.key}`));

    const proposalsIn = Array.isArray(toolInput.proposals) ? toolInput.proposals : [];
    for (const p of proposalsIn) {
      if (!p || typeof p !== "object") continue;
      const fieldPath = String(p.field_path || "").trim();
      if (!validKeys.has(fieldPath)) continue;
      if (typeof p.value !== "string" || !p.value.trim()) continue;

      /* select-type validation */
      const spec = FIELDS.find((f) => `${f.category}.${f.key}` === fieldPath);
      if (spec?.type === "select" && spec.options) {
        if (!spec.options.includes(p.value.trim() as any)) continue;
      }

      const conf = String(p.confidence || "").toLowerCase();
      fields[fieldPath] = {
        value:      p.value.trim(),
        confidence: (conf === "high" || conf === "medium" || conf === "low") ? conf : "medium",
        reasoning:  String(p.reasoning || "").slice(0, 600),
        sources:    Array.isArray(p.sources) ? p.sources.slice(0, 8).map((s: any) => String(s)) : [],
      };
    }

    const clientQuestions: ClientQuestion[] = [];
    const qsIn = Array.isArray(toolInput.client_questions) ? toolInput.client_questions : [];
    for (const q of qsIn) {
      if (typeof q?.field_path === "string" && typeof q?.question === "string") {
        clientQuestions.push({
          field_path:      q.field_path,
          question:        q.question,
          why_we_need_it:  String(q.why_we_need_it || "").slice(0, 400),
        });
      }
    }

    return {
      result: { fields, client_questions: clientQuestions },
      tokensUsed: resp.usage,
    };
  } catch (e: any) {
    return { error: e?.message || "AI generation failed" };
  }
}

/* ── preview action ──────────────────────────────────────── */

export async function aiFillPreview(projectId: string): Promise<{
  success: boolean; error?: string;
  proposals?: Array<{
    category: string; field_key: string;
    field_label: string;
    proposal: FieldProposal;
    field_type: FieldType;
    options?: readonly string[];
    already_filled: boolean;
    existing_source?: string;
  }>;
  client_questions?: ClientQuestion[];
  source_summary?: { pages: number; competitors: number; has_audit: boolean };
  tokens?: any;
}> {
  if (!projectId) return { success: false, error: "projectId required" };

  const bundle = await gatherSources(projectId);
  if (!bundle) return { success: false, error: "project not found" };

  const { result, error, tokensUsed, rawDebug } = await generateProposals(bundle);
  if (error || !result) {
    return {
      success: false,
      error: rawDebug
        ? `${error || "generation failed"} (raw: ${rawDebug.slice(0, 200)})`
        : (error || "generation failed"),
    };
  }

  /* map field keys → display info, mark already-filled fields */
  const proposals: any[] = [];
  for (const spec of FIELDS) {
    const key = `${spec.category}.${spec.key}`;
    const proposal = result.fields[key];
    if (!proposal) continue;        /* AI returned null — skip */

    const existing = bundle.existingKnowledge[spec.category]?.[spec.key];
    const isFilled = !!(existing && String(existing).trim());

    /* fetch source name for the already-filled field, if we can */
    let existingSource: string | undefined;
    if (isFilled) {
      const { data: row } = await db().from("project_knowledge")
        .select("source").eq("project_id", projectId)
        .eq("category", spec.category).eq("field_key", spec.key).maybeSingle();
      existingSource = (row as any)?.source;
    }

    proposals.push({
      category:        spec.category,
      field_key:       spec.key,
      field_label:     `${spec.category}.${spec.key}`,
      proposal,
      field_type:      spec.type,
      options:         spec.options,
      already_filled:  isFilled,
      existing_source: existingSource,
    });
  }

  return {
    success:          true,
    proposals,
    client_questions: result.client_questions,
    source_summary: {
      pages:        bundle.pages.length,
      competitors:  bundle.competitors.length,
      has_audit:    !!bundle.latestAudit?.synthesis,
    },
    tokens: tokensUsed,
  };
}

/* ── apply action ────────────────────────────────────────── */

export async function aiFillApply(opts: {
  projectId: string;
  selectedFields: Array<{
    category: string; field_key: string;
    value: string;
    confidence: string;
    reasoning: string;
    sources: string[];
  }>;
}): Promise<{
  success: boolean; error?: string;
  applied: number;
  skipped_existing: number;
}> {
  const { projectId, selectedFields } = opts;
  if (!projectId) return { success: false, error: "projectId required", applied: 0, skipped_existing: 0 };
  if (!Array.isArray(selectedFields) || !selectedFields.length) {
    return { success: false, error: "no fields selected", applied: 0, skipped_existing: 0 };
  }

  /* re-fetch existing knowledge to enforce the never-overwrite rule at the
     moment of write (in case PM modified something in the meantime) */
  const { data: existing } = await db().from("project_knowledge")
    .select("category,field_key,field_value").eq("project_id", projectId);
  const existingMap: Record<string, Record<string, string>> = {};
  for (const k of (existing || [])) {
    const r = k as any;
    (existingMap[r.category] ||= {})[r.field_key] = r.field_value || "";
  }

  let applied = 0;
  let skippedExisting = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const f of selectedFields) {
    /* enforce never-overwrite at write time */
    const ex = existingMap[f.category]?.[f.field_key];
    if (ex && ex.trim()) { skippedExisting++; continue; }

    /* validate select fields against schema once more */
    const spec = FIELDS.find((s) => s.category === f.category && s.key === f.field_key);
    if (!spec) continue;
    if (spec.type === "select" && spec.options && !spec.options.includes(f.value as any)) {
      continue;
    }

    const notes = JSON.stringify({
      confidence:   f.confidence,
      reasoning:    f.reasoning,
      sources_used: f.sources,
      inferred_at:  new Date().toISOString(),
    });

    try {
      await db().from("project_knowledge").upsert({
        project_id:  projectId,
        category:    f.category,
        field_key:   f.field_key,
        field_value: f.value,
        source:      "ai_inferred",
        source_name: "Data Room AI Fill",
        data_date:   today,
        notes,
        updated_at:  new Date().toISOString(),
      }, { onConflict: "project_id,category,field_key" });
      applied++;
    } catch (e: any) {
      console.error("[ai-fill] upsert failed:", f.category, f.field_key, e?.message);
    }
  }

  return { success: true, applied, skipped_existing: skippedExisting };
}

/* ── dispatch ─────────────────────────────────────────────── */

export async function handlePmAiFill(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "pm_ai_fill_preview": return aiFillPreview(body.projectId);
    case "pm_ai_fill_apply":   return aiFillApply({
      projectId:      body.projectId,
      selectedFields: body.selectedFields || [],
    });
    default: return null;
  }
}
