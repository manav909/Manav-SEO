/* ════════════════════════════════════════════════════════════════
   api/lib/audit-coverage.ts

   BUILD 12.34 — Data-coverage & "fill from the most trusted source".

   Source-agnostic honesty layer. For every requirement in the brief it
   declares, plainly, what is covering it:
     - a live engine in the platform, or
     - the operator's own uploaded reports/data (from ANY tool), or
     - nothing yet — in which case it states what data the requirement
       needs, what that data is effective for, and the most trusted
       sources to fill it (with the standing note that an export from any
       tool can fill it through the documents step).

   No tool is required. Semrush, Ahrefs, Moz, Screaming Frog, GA — any of
   them, or none. When none, the system says what is missing and how best
   to get it, rather than padding or pretending.
════════════════════════════════════════════════════════════════ */

export interface SourceRecommendation { data_need: string; effective_for: string; best_sources: string[]; }

/* Maps a requirement (by intent keywords) to the real data it needs and
   the most trusted sources to supply it. Order = most trusted first.
   The documents step can ingest an export from any of these. */
const NEED_RULES: Array<{ re: RegExp; rec: SourceRecommendation }> = [
  { re: /backlink|referring domain|link gap|authority score|domain authority|\bDA\b|\bDR\b/i,
    rec: { data_need: "Backlink / authority data", effective_for: "competitive authority benchmarking and link-building strategy", best_sources: ["Ahrefs (export or API)", "Semrush (export or API)", "Majestic"] } },
  { re: /keyword (volume|gap|research)|missing keyword|search volume|ranking keyword|keyword difficulty/i,
    rec: { data_need: "Keyword database (volumes, gaps, difficulty)", effective_for: "finding the keywords competitors rank for that the client does not, and sizing the opportunity", best_sources: ["Semrush (export or API)", "Ahrefs", "Google Keyword Planner export"] } },
  { re: /impression|click-through|\bCTR\b|average position|which pages.*index|indexed pages|search console|\bGSC\b/i,
    rec: { data_need: "Google Search Console data", effective_for: "seeing exactly what Google shows the site — impressions, CTR, positions, indexation", best_sources: ["Connect Google Search Console", "Upload a GSC performance export"] } },
  { re: /core web vital|\bCWV\b|field data|real user/i,
    rec: { data_need: "Core Web Vitals field data", effective_for: "real-user performance (not just lab), which affects rankings", best_sources: ["Connect Google Search Console (CrUX)", "PageSpeed / CrUX"] } },
  { re: /all (indexed |important )?url|full[- ]site crawl|every page|site-wide inventory|300\+|hundreds of pages/i,
    rec: { data_need: "Full-site crawl beyond the per-pass cap", effective_for: "a complete URL inventory on large sites", best_sources: ["Screaming Frog crawl export", "Sitebulb export"] } },
  { re: /traffic|analytics|conversion|revenue|sessions|engagement/i,
    rec: { data_need: "Analytics data", effective_for: "traffic, engagement and conversion context", best_sources: ["Connect Google Analytics", "Upload a GA export"] } },
];

export function recommendSource(requirement: string): SourceRecommendation {
  for (const r of NEED_RULES) if (r.re.test(requirement)) return r.rec;
  return { data_need: "Supporting data for this requirement", effective_for: "answering this point with evidence rather than opinion", best_sources: ["Upload the relevant report from any tool you use (Ahrefs, Moz, Semrush, Screaming Frog, GA, and so on)"] };
}

/* A DELIVERABLE is recurring work the provider performs (writing, publishing,
   link-building, forum posts, FAQ build-out) — NOT something audited with an
   uploaded report. Treating "8 blog articles per month" as an audit gap that
   needs an Ahrefs export is a category error; these are described by HOW they
   are delivered, not by what data is missing. */
const DELIVERABLE_RE = /\b(write|writing|written|copywrit\w*|publish\w*|blog|articles?|content (creation|production)|page enhancements?|text improvements?|rewrit\w*|enhance\w*|off[- ]?site|q ?& ?a|q and a|forum|reddit|quora|backlinks?|link[- ]building|outreach|faqs?|help[- ]?cent(er|re)|schema markup|llms)\b/i;
export function isDeliverable(requirement: string): boolean { return DELIVERABLE_RE.test(requirement); }

export function deliveryNoteFor(requirement: string): string {
  const r = requirement.toLowerCase();
  if (/article|blog|content (creation|production)|copywrit/.test(r)) return "Ongoing content production — each article drafted by the AEO engine from the live SERP's real People-Also-Ask questions, reviewed for accuracy, then published.";
  if (/backlink|link[- ]building|outreach/.test(r)) return "Ongoing link acquisition — real prospects surfaced from Semrush referring-domain gaps (sites linking to competitors, not you); outreach and placement performed manually, never automated.";
  if (/off[- ]?site|q&a|q and a|forum|reddit|quora/.test(r)) return "Ongoing off-site engagement — real Reddit/Quora questions found via live search and answers drafted; posting done manually and disclosed, per platform rules.";
  if (/faq|help[- ]?cent/.test(r)) return "Ongoing FAQ and help-centre development — structured, answer-engine-friendly Q&A built out each cycle.";
  if (/schema markup|llms/.test(r)) return "Structured-data and llms.txt generation — grounded in the site's real markup, deployed to each page head and the site root.";
  if (/page enhancement|text improvement|rewrite|enhance/.test(r)) return "Ongoing on-page enhancements — targeted copy improvements guided by the per-page technical audit.";
  return "Recurring delivery work performed each cycle in the monthly engagement.";
}

export interface CoverageItem { requirement: string; status: "engine" | "your_data" | "delivery" | "uncovered"; by?: string; recommendation?: SourceRecommendation; delivery_note?: string; }
export interface CoverageReport { items: CoverageItem[]; engine_count: number; your_data_count: number; delivery_count: number; uncovered_count: number; }

export function assessCoverage(opts: {
  requirements: string[];
  engineCovered: string[];      // requirement labels answered by a live engine that completed
  docAnswered: string[];        // requirements answered from uploaded materials
}): CoverageReport {
  const norm = (s: string) => s.toLowerCase().trim();
  const engine = new Set(opts.engineCovered.map(norm));
  const docs = new Set(opts.docAnswered.map(norm));
  const items: CoverageItem[] = (opts.requirements || []).map(req => {
    const n = norm(req);
    if (engine.has(n)) return { requirement: req, status: "engine" as const, by: "platform analysis" };
    if (docs.has(n)) return { requirement: req, status: "your_data" as const, by: "your uploaded reports" };
    /* A deliverable that was not analysed as a one-off is recurring work, not a
       missing-data gap — describe how it is delivered instead of asking for a report. */
    if (isDeliverable(req)) return { requirement: req, status: "delivery" as const, delivery_note: deliveryNoteFor(req) };
    return { requirement: req, status: "uncovered" as const, recommendation: recommendSource(req) };
  });
  return {
    items,
    engine_count: items.filter(i => i.status === "engine").length,
    your_data_count: items.filter(i => i.status === "your_data").length,
    delivery_count: items.filter(i => i.status === "delivery").length,
    uncovered_count: items.filter(i => i.status === "uncovered").length,
  };
}
