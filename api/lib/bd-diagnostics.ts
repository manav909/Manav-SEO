/* ════════════════════════════════════════════════════════════════
   api/lib/bd-diagnostics.ts

   BUILD 12.50 — inline AEO/GEO readiness check for the Deal Workspace.
   Fetches the client's homepage, llms.txt, and robots.txt and reports
   concrete AI-search readiness signals + fixes. Self-contained (no project,
   no SerpAPI); designed to run on demand and be persisted on the deal.
════════════════════════════════════════════════════════════════ */

function normBase(url: string): string {
  let u = (url || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  return u.replace(/\/+$/, "");
}

async function fetchText(url: string, ms = 9000): Promise<{ status: number; text: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" } });
    const text = await r.text().catch(() => "");
    return { status: r.status, text };
  } catch {
    return { status: 0, text: "" };
  } finally { clearTimeout(t); }
}

export interface AeoReport {
  site: string;
  reachable: boolean;
  llms_txt: boolean;
  robots_ai: string;
  schema_types: string[];
  has_faq_schema: boolean;
  has_org_schema: boolean;
  title_len: number;
  meta_description: boolean;
  headings_h1: number;
  signals: Array<{ label: string; ok: boolean }>;
  recommendations: string[];
}

export async function aeoReadinessCheck(siteUrl: string): Promise<{ ok: boolean; report?: AeoReport; error?: string }> {
  const base = normBase(siteUrl);
  if (!base) return { ok: false, error: "No client site URL to check." };

  const home = await fetchText(base + "/");
  if (!home.status || !home.text) return { ok: false, error: `Could not fetch ${base} (it may block bots or be down).` };
  const html = home.text;

  // structured data
  const ldBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const types = new Set<string>();
  for (const b of ldBlocks) {
    for (const m of b.matchAll(/"@type"\s*:\s*"([^"]+)"/g)) types.add(m[1]);
  }
  const schema_types = [...types];
  const has_faq_schema = schema_types.some(t => /FAQPage|Question/i.test(t));
  const has_org_schema = schema_types.some(t => /Organization|LocalBusiness/i.test(t));

  // basic on-page
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title_len = titleMatch ? titleMatch[1].trim().length : 0;
  const meta_description = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{1,}["']/i.test(html);
  const headings_h1 = (html.match(/<h1[\s>]/gi) || []).length;

  // llms.txt
  const llms = await fetchText(base + "/llms.txt", 6000);
  const llms_txt = llms.status === 200 && llms.text.trim().length > 0;

  // robots.txt AI bots
  const robots = await fetchText(base + "/robots.txt", 6000);
  const aiBots = /GPTBot|ClaudeBot|PerplexityBot|Google-Extended|CCBot|anthropic-ai/i.test(robots.text);
  const robots_ai = robots.status === 200 ? (aiBots ? "AI-crawler rules present in robots.txt" : "No explicit AI-crawler rules in robots.txt") : "robots.txt not found";

  const signals = [
    { label: "Structured data (schema) present", ok: schema_types.length > 0 },
    { label: "Organization/LocalBusiness schema", ok: has_org_schema },
    { label: "llms.txt published", ok: llms_txt },
    { label: "Title tag set", ok: title_len > 0 },
    { label: "Meta description set", ok: meta_description },
    { label: "Single clear H1", ok: headings_h1 === 1 },
  ];

  const recommendations: string[] = [];
  if (!schema_types.length) recommendations.push("Add structured data (schema.org) so AI engines can parse the business and its services.");
  if (!has_org_schema) recommendations.push("Add Organization (or LocalBusiness) schema with name, logo, sameAs and contact details.");
  if (!llms_txt) recommendations.push("Publish an llms.txt to guide AI crawlers to the key pages and positioning.");
  if (!meta_description) recommendations.push("Add meta descriptions — AI overviews and snippets draw on them.");
  if (headings_h1 !== 1) recommendations.push(headings_h1 === 0 ? "Add a single descriptive H1." : "Reduce to one H1 per page for a clear topic signal.");
  if (!has_faq_schema) recommendations.push("Consider concise Q&A content with clear headings to be quotable in AI answers (note: FAQ rich results were deprecated, but the Q&A structure still helps AEO).");

  return { ok: true, report: { site: base, reachable: true, llms_txt, robots_ai, schema_types, has_faq_schema, has_org_schema, title_len, meta_description, headings_h1, signals, recommendations } };
}
