/* ════════════════════════════════════════════════════════════════
   api/lib/url-inventory-export.ts

   BUILD 12.23b-2 — URL inventory export engine.

   Serialises the classified URL table (url-classifier.ts) into a client-
   ready spreadsheet: a multi-sheet .xlsx (URL Inventory, Cannibalisation,
   Notes & Limits) plus a CSV of the main sheet for quick use. This is the
   output half of an audit deliverable — the columns map directly to what
   a client like a finance brokerage asks for: URL, page type, clicks,
   impressions, CTR, average position, current issue, recommended action,
   priority, notes.

   Honesty carried through to the file: the recommended-action labels keep
   the classifier's distinctions (redirect is a candidate; pruning needs a
   crawl + sitemap), and the Notes & Limits sheet states what the data does
   and does not cover. Nothing in the file claims more certainty than the
   classifier produced.

   Uses the platform's existing SheetJS dependency (xlsx 0.18.5) via a
   dynamic import, matching pm-compare.ts. Zero new crawl cost — it runs
   the classifier, which reads stored GSC data. Multi-tenant: projectId
   only.
════════════════════════════════════════════════════════════════ */

import { classifyUrls, type UrlClassificationReport, type ClassifiedUrl, type UrlClassification } from "./url-classifier.js";

/* Human label for the recommended-action column — preserves the honest
   distinctions (redirect = candidate, pruning = needs more signal). */
const ACTION_LABEL: Record<UrlClassification, string> = {
  keep:               "Keep",
  improve:            "Improve",
  merge:              "Merge / consolidate",
  redirect:           "Redirect (candidate — confirm target)",
  review_for_pruning: "Review for pruning (noindex/delete — needs crawl + sitemap)",
};

const MAIN_HEADERS = [
  "URL", "Page Type", "Clicks", "Impressions", "CTR %", "Avg Position", "Query Count",
  "Current Issue", "Recommended Action", "Action Detail", "Priority", "Confidence", "Notes", "Data Source",
];

function mainRows(report: UrlClassificationReport): (string | number)[][] {
  return report.urls.map((u: ClassifiedUrl) => [
    u.url,
    u.page_type,
    u.clicks,
    u.impressions,
    u.ctr,
    u.avg_position,
    u.query_count,
    u.reason,
    ACTION_LABEL[u.classification],
    u.recommended_action,
    u.priority,
    u.confidence,
    u.notes || "",
    u.data_source === "gsc_page_total" ? "GSC page total" : "Derived from query-page pairs (approximate)",
  ]);
}

function cannibalRows(report: UrlClassificationReport): (string | number)[][] {
  const headers = ["Query", "Competing Pages", "Total Clicks", "Recommendation"];
  const rows: (string | number)[][] = [headers];
  for (const g of report.cannibalization_groups) {
    rows.push([
      g.query,
      g.pages.map(p => `${p.page} (${p.clicks} clicks, pos ${p.position})`).join("  |  "),
      g.pages.reduce((s, p) => s + (p.clicks || 0), 0),
      g.recommendation,
    ]);
  }
  if (rows.length === 1) rows.push(["(none detected)", "", "", ""]);
  return rows;
}

function notesRows(report: UrlClassificationReport): string[][] {
  const rows: string[][] = [["URL Inventory — notes and limits"], [""]];
  rows.push(["Generated", new Date(report.generated_at).toLocaleString()]);
  rows.push(["Project domain", report.project_domain || "(unknown)"]);
  rows.push(["URLs classified", String(report.total_urls)]);
  rows.push([""]);
  rows.push(["Classification meanings"]);
  rows.push(["keep", "Earning clicks at a healthy position; no issue detected. Confident."]);
  rows.push(["improve", "High impressions with a CTR or ranking gap — a recoverable opportunity. Confident."]);
  rows.push(["merge", "Competes with another page of the site for shared queries — consolidate. Confident from cannibalisation data."]);
  rows.push(["redirect", "Candidate to redirect/canonical to a stronger sibling. Confirm the canonical target before acting."]);
  rows.push(["review_for_pruning", "Possible noindex or delete — NOT decided here. Requires a content crawl and a sitemap diff to choose."]);
  rows.push([""]);
  rows.push(["Limits of this analysis"]);
  for (const l of report.limits) rows.push(["", l]);
  return rows;
}

/* CSV serialisation of the main sheet (RFC-4180 quoting). */
function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

export interface UrlInventoryExport {
  success:     boolean;
  filename:    string;
  mime_type:   string;
  xlsx_base64: string | null;   // null if the workbook build failed (CSV still returned)
  csv:         string;
  total_urls:  number;
  summary:     string;
  limits:      string[];
  error?:      string;
}

/* Serialise an already-computed report (so the orchestration can reuse a
   report it already has, with no second classification pass). */
export async function serializeUrlInventory(report: UrlClassificationReport): Promise<UrlInventoryExport> {
  const safeDomain = (report.project_domain || "site").replace(/[^a-z0-9.-]+/gi, "_");
  const date = new Date(report.generated_at).toISOString().slice(0, 10);
  const filename = `url-inventory-${safeDomain}-${date}.xlsx`;
  const csv = toCsv(MAIN_HEADERS, mainRows(report));

  let xlsx_base64: string | null = null;
  try {
    const XLSX: any = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([MAIN_HEADERS, ...mainRows(report)]), "URL Inventory");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cannibalRows(report)), "Cannibalisation");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(notesRows(report)), "Notes & Limits");
    xlsx_base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  } catch (e: any) {
    /* Non-fatal — the CSV is always returned even if the workbook fails. */
    return {
      success: true,
      filename: filename.replace(/\.xlsx$/, ".csv"),
      mime_type: "text/csv",
      xlsx_base64: null,
      csv,
      total_urls: report.total_urls,
      summary: report.summary,
      limits: report.limits,
      error: `xlsx build failed (${(e?.message || "unknown").slice(0, 120)}); CSV returned instead.`,
    };
  }

  return {
    success: true,
    filename,
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsx_base64,
    csv,
    total_urls: report.total_urls,
    summary: report.summary,
    limits: report.limits,
  };
}

/* Classify then serialise — the one-call path for the wizard action. */
export async function exportUrlInventory(opts: { projectId: string }): Promise<UrlInventoryExport> {
  const report = await classifyUrls({ projectId: opts.projectId });
  if (report.total_urls === 0) {
    return {
      success: false,
      filename: "url-inventory.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xlsx_base64: null,
      csv: "",
      total_urls: 0,
      summary: report.summary,
      limits: report.limits,
      error: "No GSC page data stored for this project — connect Search Console and run a pull first.",
    };
  }
  return serializeUrlInventory(report);
}
