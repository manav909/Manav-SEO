/* QA Desk engine.

   A standing quality assurance operation over delivery workbooks, not a one shot
   check. The design points that matter:

   AGENDA FIRST. Before anything is checked, an agenda is built from the client
   persona, the project and the commitment mail. Every row is then judged against
   that agenda, so the pass is what a senior practitioner would actually look for
   on this account rather than a generic sweep. The agenda is stored and reused on
   every later round so successive checks stay consistent.

   ONE TAB PER SLOT. A workbook can carry many tabs and thousands of rows. Each
   call processes a bounded slice of a single tab and returns a cursor, so the
   work spreads across as many calls as it needs and no single call can time out.
   Progress is persisted, so an interrupted review resumes where it stopped.

   ROUNDS. When an executive resubmits after fixing remarks, the review moves to a
   recheck round. Only unresolved findings are re examined, findings that now pass
   are marked resolved against the round that fixed them, and the history stays.

   PROFILES. Every finding carries a mistake category, so an executive profile is
   the accumulated record of their real work rather than an opinion. */

import { db } from "./db.js";
import { checkOne } from "./report-verify.js";
import { llmComplete } from "./workspace/llm.js";

const ROWS_PER_SLOT = 25;                 // bounded slice: comfortably inside the function budget
const norm = (s: any) => String(s || "").toLowerCase().trim();

/* Deterministic tab classification. The tab name is the strongest signal, the
   headers are the tie breaker. No model call is needed for this. */
export function classifyTab(tabName: string, headers: string[]): string {
  const hay = norm(tabName) + " " + headers.map(norm).join(" ");
  if (/back ?link|off.?page|guest post|directory|citation|outreach|gmb|google business/.test(hay)) return "offpage";
  if (/meta desc|description/.test(hay)) return "meta_description";
  if (/title/.test(hay)) return "title";
  if (/\bh1\b|heading/.test(hay)) return "h1";
  if (/schema|structured data|rich result/.test(hay)) return "schema";
  if (/canonical/.test(hay)) return "canonical";
  if (/alt|image/.test(hay)) return "image_alt";
  if (/internal link|interlink|internal_link/.test(hay)) return "internal_link";
  if (/redirect|301|302/.test(hay)) return "redirect";
  if (/index|robots|noindex/.test(hay)) return "indexing";
  if (/keyword|rank|position/.test(hay)) return "keyword";
  if (/blog|content|article|copy|page created/.test(hay)) return "content";
  return "other";
}

/* Find the column that holds the page, and the column that holds the value the
   executive says they implemented. Workbooks are never uniform, so this reads the
   headers and falls back to reading the data itself. */
export function detectColumns(rows: any[]): { urlKey: string; valueKey: string; itemKey: string } {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const find = (re: RegExp) => keys.find((k) => re.test(norm(k))) || "";
  let urlKey = find(/^url$|page url|landing page|\burl\b|\bpage\b|link|address|slug/);
  if (!urlKey) {
    for (const k of keys) {
      const hit = rows.slice(0, 8).filter((r) => /^https?:\/\/|^www\.|\.[a-z]{2,}\//i.test(String(r[k] || ""))).length;
      if (hit >= 2) { urlKey = k; break; }
    }
  }
  const valueKey =
    find(/new (title|meta|value|content|h1)|updated|implemented|optimi[sz]ed|revised|final|after/) ||
    find(/^title$|^meta|description|^h1$|value|content|anchor|text/) || "";
  const itemKey = find(/task|item|activity|work|deliverable|type|description of work/) || "";
  return { urlKey, valueKey, itemKey };
}

/* Category of mistake, which is what makes an executive profile meaningful. */
function mistakeCategory(status: string, type: string, quality: string[]): string {
  if (status === "verified") return "";
  if (status === "unverifiable") return "unverifiable_claim";
  if (status === "failed") return "not_implemented";
  const q = quality.join(" ").toLowerCase();
  if (/noindex/.test(q)) return "indexation_risk";
  if (/thin|only about/.test(q)) return "thin_content";
  if (/keyword does not appear/.test(q)) return "keyword_missing";
  if (/short at|long at/.test(q)) return "length_out_of_range";
  if (/duplicate/.test(q)) return "duplication";
  if (/alt text/.test(q)) return "incomplete_execution";
  return "below_standard";
}

function severityOf(status: string, onAgenda: boolean): string {
  if (status === "verified") return "";
  if (status === "failed") return onAgenda ? "high" : "medium";
  if (status === "partial") return onAgenda ? "medium" : "low";
  return onAgenda ? "medium" : "low";
}

/* The remark the executive reads in the returned sheet. Written from observed
   evidence, so it is specific and actionable rather than a generic flag. */
function remarkOf(status: string, expected: string, observed: string, evidence: string, quality: string[]): string {
  if (status === "verified") return "Confirmed live and within standard.";
  if (status === "unverifiable") return evidence;
  if (status === "failed") return `Not live. ${expected ? `Committed: ${expected}. ` : ""}${evidence}`;
  const q = quality.length ? ` ${quality.join(" ")}` : "";
  return `Live but needs work. Observed: ${observed || "nothing usable"}.${q}`;
}

/* ---- 1. Create the review and build the agenda ------------------------------ */

export async function qaCreateReview(opts: {
  projectId?: string; siteUrl: string; clientName?: string; executiveName?: string;
  title?: string; clientContext?: string; mailText?: string;
  tabs: Array<{ name: string; headers: string[]; rowCount: number }>;
}) {
  const siteUrl = String(opts.siteUrl || "").trim();
  if (!siteUrl) return { success: false, error: "A client site URL is required." };
  const tabs = Array.isArray(opts.tabs) ? opts.tabs : [];
  if (!tabs.length) return { success: false, error: "No sheet tabs were supplied." };

  /* The agenda is the difference between a senior pass and a random one. */
  let agenda: any[] = [];
  try {
    const sys = "You are a Senior Digital Marketing Specialist setting the quality assurance agenda for one client account, before reviewing an executive's delivery workbook. From the client background and the commitment mail, decide what a senior reviewer must check thoroughly on THIS account and why, in the client's terms. Return ONLY JSON: {\"agenda\":[{\"id\":\"a1\",\"focus\":\"the specific thing to check\",\"why\":\"the client reason it matters\",\"applies_to\":[\"title\",\"meta_description\",\"h1\",\"content\",\"schema\",\"image_alt\",\"internal_link\",\"canonical\",\"indexing\",\"keyword\",\"offpage\",\"redirect\",\"other\"],\"weight\":\"high|medium|low\"}]}. Six to ten items. Ground every item in the supplied text and never invent a client requirement.";
    const user = [
      `Client: ${opts.clientName || siteUrl}. Site: ${siteUrl}.`,
      opts.clientContext ? `Client background, chat and call:\n${String(opts.clientContext).slice(0, 10000)}` : "No client background supplied.",
      opts.mailText ? `Commitment mail to the project manager:\n${String(opts.mailText).slice(0, 10000)}` : "No commitment mail supplied.",
      `Workbook tabs being reviewed: ${tabs.map((t) => t.name).join(", ")}.`,
    ].join("\n\n");
    const { text } = await llmComplete({ system: sys, user, maxTokens: 1400, timeoutMs: 60000, label: "qa-agenda", maxSegments: 1 });
    const m = String(text || "").match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : {};
    agenda = Array.isArray(parsed.agenda) ? parsed.agenda.slice(0, 10) : [];
  } catch { agenda = []; }

  const { data: rev, error } = await db().from("qa_reviews").insert({
    project_id: opts.projectId || null,
    client_name: opts.clientName || null,
    site_url: siteUrl,
    executive_name: opts.executiveName || null,
    title: opts.title || `QA of ${opts.clientName || siteUrl}`,
    status: "checking",
    round: 1,
    agenda,
    client_context: opts.clientContext || null,
    mail_text: opts.mailText || null,
    submitted_at: new Date().toISOString(),
  }).select().single();
  if (error || !rev) return { success: false, error: error?.message || "Could not create the review." };

  const tabRows = tabs.map((t, i) => ({
    review_id: (rev as any).id, tab_index: i, tab_name: t.name,
    tab_type: classifyTab(t.name, t.headers || []), row_count: Number(t.rowCount) || 0,
    status: "queued", round: 1,
  }));
  const { data: savedTabs } = await db().from("qa_tabs").insert(tabRows).select();

  return { success: true, review: rev, agenda, tabs: savedTabs || tabRows, rows_per_slot: ROWS_PER_SLOT };
}

/* ---- 2. Check one bounded slice of one tab (its own slot) ------------------- */

export async function qaCheckTab(opts: {
  reviewId: string; tabIndex: number; rowOffset?: number; rows: any[]; totalRows?: number;
}) {
  const reviewId = String(opts.reviewId || "").trim();
  const tabIndex = Number(opts.tabIndex) || 0;
  const offset = Number(opts.rowOffset) || 0;
  /* rows carries ONLY this slot's slice, so a tab with thousands of rows never
     ships its whole body on every call. totalRows is what the tab holds overall. */
  const rows = Array.isArray(opts.rows) ? opts.rows : [];
  const totalRows = Number(opts.totalRows) || (offset + rows.length);
  if (!reviewId) return { success: false, error: "reviewId is required." };

  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const { data: tabRec } = await db().from("qa_tabs").select("*").eq("review_id", reviewId).eq("tab_index", tabIndex).maybeSingle();
  if (!tabRec) return { success: false, error: "Tab not found on this review." };

  const review: any = rev; const tab: any = tabRec;
  const round = Number(review.round) || 1;
  const agenda: any[] = Array.isArray(review.agenda) ? review.agenda : [];
  const onAgenda = agenda.filter((a) => Array.isArray(a.applies_to) && a.applies_to.includes(tab.tab_type));
  const agendaRef = onAgenda.length ? String(onAgenda[0].id || "") : "";
  const agendaHigh = onAgenda.some((a) => norm(a.weight) === "high");

  const slice = rows.slice(0, ROWS_PER_SLOT);
  const { urlKey, valueKey, itemKey } = detectColumns(slice);
  const findings: any[] = [];

  for (let i = 0; i < slice.length; i++) {
    const r = slice[i] || {};
    const rowIndex = offset + i;
    const url = String(urlKey ? r[urlKey] || "" : "").trim();
    const expected = String(valueKey ? r[valueKey] || "" : "").trim();
    const item = String(itemKey ? r[itemKey] || "" : "").trim() || `${tab.tab_name} row ${rowIndex + 1}`;

    const check = await checkOne(
      { id: `${tabIndex}-${rowIndex}`, title: item, type: tab.tab_type, url, expected, keywords: [], committed: true, claimed: true },
      review.site_url,
    );
    const cat = mistakeCategory(check.status, tab.tab_type, check.quality || []);
    findings.push({
      review_id: reviewId, tab_id: tab.id, tab_name: tab.tab_name, row_index: rowIndex,
      item, check_type: tab.tab_type, url: check.url || url, expected, observed: check.observed || "",
      status: check.status, severity: severityOf(check.status, agendaHigh),
      mistake_category: cat || null, agenda_ref: agendaRef || null, round,
      remark: remarkOf(check.status, expected, check.observed || "", check.evidence, check.quality || []),
      resolved_round: check.status === "verified" ? round : null,
    });
  }

  if (findings.length) await db().from("qa_findings").insert(findings);

  const rowsChecked = offset + slice.length;
  const done = rowsChecked >= totalRows;
  await db().from("qa_tabs").update({
    rows_checked: rowsChecked, row_count: totalRows,
    status: done ? "done" : "checking",
    checked_at: done ? new Date().toISOString() : null,
  }).eq("id", tab.id);
  await db().from("qa_reviews").update({ updated_at: new Date().toISOString() }).eq("id", reviewId);

  /* One short QA remark per tab, written once the tab completes. */
  let tabRemark = "";
  if (done) {
    try {
      const { data: all } = await db().from("qa_findings").select("status,mistake_category,item,observed").eq("review_id", reviewId).eq("tab_id", tab.id).eq("round", round);
      const list: any[] = (all as any[]) || [];
      const bad = list.filter((f) => f.status !== "verified");
      if (bad.length) {
        const sys = "You are a Senior Digital Marketing Specialist writing the reviewer remark for one tab of a delivery workbook. State plainly what is wrong, the pattern behind it if there is one, and what the executive must do. Two to four sentences. Never use an em-dash.";
        const user = `Tab: ${tab.tab_name} (${tab.tab_type}). ${list.length} rows checked, ${bad.length} not clean. Examples: ${bad.slice(0, 8).map((f) => `${f.item}: ${f.status}, ${f.mistake_category || "issue"}`).join("; ")}.`;
        const { text } = await llmComplete({ system: sys, user, maxTokens: 300, timeoutMs: 40000, label: "qa-tab-remark", maxSegments: 1 });
        tabRemark = String(text || "").trim();
      } else tabRemark = "Every row in this tab is confirmed live and within standard.";
      await db().from("qa_tabs").update({ remarks: tabRemark }).eq("id", tab.id);
    } catch { /* remark is a nicety, never block the pass */ }
  }

  return {
    success: true, tab_name: tab.tab_name, tab_type: tab.tab_type,
    rows_checked: rowsChecked, row_count: totalRows, done,
    next_offset: done ? null : rowsChecked, tab_remark: tabRemark,
    findings: findings.map((f) => ({ row_index: f.row_index, item: f.item, url: f.url, status: f.status, severity: f.severity, mistake_category: f.mistake_category, remark: f.remark, observed: f.observed })),
  };
}

/* ---- 3. Finalise the round -------------------------------------------------- */

export async function qaFinalize(opts: { reviewId: string }) {
  const reviewId = String(opts.reviewId || "").trim();
  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const review: any = rev; const round = Number(review.round) || 1;
  const { data: f } = await db().from("qa_findings").select("*").eq("review_id", reviewId).eq("round", round);
  const list: any[] = (f as any[]) || [];
  const totals = {
    total: list.length,
    verified: list.filter((x) => x.status === "verified").length,
    failed: list.filter((x) => x.status === "failed").length,
    partial: list.filter((x) => x.status === "partial").length,
    unverifiable: list.filter((x) => x.status === "unverifiable").length,
  };
  const open = totals.failed + totals.partial;
  const status = open === 0 ? "passed" : "awaiting_fix";
  await db().from("qa_reviews").update({
    totals, status, updated_at: new Date().toISOString(),
    completed_at: open === 0 ? new Date().toISOString() : null,
  }).eq("id", reviewId);

  const byCat: Record<string, number> = {};
  for (const x of list) { if (x.mistake_category) byCat[x.mistake_category] = (byCat[x.mistake_category] || 0) + 1; }
  return {
    success: true, status, round, totals,
    open_items: list.filter((x) => x.status === "failed" || x.status === "partial")
      .map((x) => ({ tab: x.tab_name, item: x.item, url: x.url, status: x.status, severity: x.severity, remark: x.remark })),
    mistake_pattern: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ category: k, count: v })),
    verdict: open === 0
      ? `Round ${round} passes. All ${totals.verified} checked items are confirmed live and within standard.${totals.unverifiable ? ` ${totals.unverifiable} item(s) need their own proof because they are not visible on the site.` : ""}`
      : `Round ${round} is not clean. ${totals.failed} item(s) are not live and ${totals.partial} need work. Send the remarks back to the executive, then start a recheck once they resubmit.`,
  };
}

/* ---- 4. Recheck round after the executive resubmits ------------------------- */

export async function qaRecheck(opts: { reviewId: string }) {
  const reviewId = String(opts.reviewId || "").trim();
  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const review: any = rev; const nextRound = (Number(review.round) || 1) + 1;

  const { data: prior } = await db().from("qa_findings").select("*").eq("review_id", reviewId).eq("round", Number(review.round) || 1);
  const open = ((prior as any[]) || []).filter((x) => x.status === "failed" || x.status === "partial");
  if (!open.length) return { success: false, error: "Nothing is open on the current round, so there is nothing to recheck." };

  await db().from("qa_reviews").update({ round: nextRound, status: "rechecking", updated_at: new Date().toISOString(), submitted_at: new Date().toISOString() }).eq("id", reviewId);
  await db().from("qa_tabs").update({ status: "queued", rows_checked: 0, round: nextRound }).eq("review_id", reviewId);

  return {
    success: true, round: nextRound, status: "rechecking", to_recheck: open.length,
    items: open.map((x) => ({ tab: x.tab_name, row_index: x.row_index, item: x.item, url: x.url, expected: x.expected, previous_status: x.status, previous_remark: x.remark })),
    note: `Round ${nextRound} is open and marked as rechecking. Only the ${open.length} item(s) that were not clean need to be resubmitted and checked again.`,
  };
}

/* Recheck a single previously failing item, so a partial resubmission is fine. */
export async function qaRecheckItems(opts: { reviewId: string; items: Array<{ row_index: number; tab_name: string; url: string; expected: string; item?: string; check_type?: string }> }) {
  const reviewId = String(opts.reviewId || "").trim();
  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const review: any = rev; const round = Number(review.round) || 1;
  const items = Array.isArray(opts.items) ? opts.items : [];
  const out: any[] = [];
  const rows: any[] = [];
  for (const it of items) {
    const type = String(it.check_type || "other");
    const check = await checkOne({ id: `r-${it.row_index}`, title: it.item || `${it.tab_name} row ${it.row_index + 1}`, type, url: it.url, expected: it.expected, keywords: [], committed: true, claimed: true }, review.site_url);
    const cat = mistakeCategory(check.status, type, check.quality || []);
    rows.push({
      review_id: reviewId, tab_id: null, tab_name: it.tab_name, row_index: it.row_index,
      item: it.item || `${it.tab_name} row ${it.row_index + 1}`, check_type: type, url: check.url || it.url,
      expected: it.expected, observed: check.observed || "", status: check.status,
      severity: severityOf(check.status, false), mistake_category: cat || null, round,
      remark: remarkOf(check.status, it.expected, check.observed || "", check.evidence, check.quality || []),
      resolved_round: check.status === "verified" ? round : null,
    });
    out.push({ item: it.item, url: it.url, status: check.status, remark: rows[rows.length - 1].remark });
  }
  if (rows.length) await db().from("qa_findings").insert(rows);
  await db().from("qa_reviews").update({ updated_at: new Date().toISOString() }).eq("id", reviewId);
  return { success: true, round, checked: out.length, results: out };
}

/* ---- 5. Work list: what is open, what moved today, with timestamps ---------- */

export async function qaWorklist(opts: { day?: string }) {
  const day = String(opts.day || "").trim() || new Date().toISOString().slice(0, 10);
  const from = `${day}T00:00:00.000Z`, to = `${day}T23:59:59.999Z`;
  const { data: open } = await db().from("qa_reviews").select("*").in("status", ["queued", "checking", "awaiting_fix", "rechecking"]).order("updated_at", { ascending: false }).limit(100);
  const { data: today } = await db().from("qa_reviews").select("*").gte("updated_at", from).lte("updated_at", to).order("updated_at", { ascending: false }).limit(100);
  const shape = (r: any) => ({
    id: r.id, title: r.title, client: r.client_name, site: r.site_url, executive: r.executive_name,
    status: r.status, round: r.round, totals: r.totals || {},
    submitted_at: r.submitted_at, updated_at: r.updated_at, completed_at: r.completed_at,
  });
  return {
    success: true, day,
    open: ((open as any[]) || []).map(shape),
    touched_today: ((today as any[]) || []).map(shape),
    counts: {
      awaiting_fix: ((open as any[]) || []).filter((r) => r.status === "awaiting_fix").length,
      rechecking: ((open as any[]) || []).filter((r) => r.status === "rechecking").length,
      in_progress: ((open as any[]) || []).filter((r) => r.status === "checking" || r.status === "queued").length,
      closed_today: ((today as any[]) || []).filter((r) => r.status === "passed").length,
    },
  };
}

/* ---- 6. Executive profile, built from their real QA history ----------------- */

export async function qaExecutiveProfile(opts: { executiveName?: string }) {
  const name = String(opts.executiveName || "").trim();
  const { data: revs } = name
    ? await db().from("qa_reviews").select("*").eq("executive_name", name).order("created_at", { ascending: false }).limit(200)
    : await db().from("qa_reviews").select("*").order("created_at", { ascending: false }).limit(200);
  const reviews: any[] = (revs as any[]) || [];
  if (!reviews.length) return { success: true, executives: [], note: "No QA history yet for this name." };

  const byExec = new Map<string, any[]>();
  for (const r of reviews) { const k = r.executive_name || "unattributed"; byExec.set(k, (byExec.get(k) || []).concat(r)); }

  const out: any[] = [];
  for (const [execName, list] of byExec) {
    const ids = list.map((r) => r.id);
    const { data: f } = await db().from("qa_findings").select("status,mistake_category,check_type,round,created_at").in("review_id", ids).limit(4000);
    const finds: any[] = (f as any[]) || [];
    const total = finds.length;
    /* First pass rate must measure the FIRST round only. Counting later rounds
       would dilute the score of someone who corrected their work properly, which
       would misrepresent them on a profile that follows their career. */
    const firstRound = finds.filter((x) => (Number(x.round) || 1) === 1);
    const firstClean = firstRound.filter((x) => x.status === "verified").length;
    const cleanOverall = finds.filter((x) => x.status === "verified").length;
    const byCat: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const x of finds) {
      if (x.mistake_category) byCat[x.mistake_category] = (byCat[x.mistake_category] || 0) + 1;
      if (x.status !== "verified" && x.check_type) byType[x.check_type] = (byType[x.check_type] || 0) + 1;
    }
    const rounds = list.map((r) => Number(r.round) || 1);
    out.push({
      executive: execName,
      reviews: list.length,
      projects: Array.from(new Set(list.map((r) => r.client_name || r.site_url).filter(Boolean))),
      items_checked: total,
      first_pass_rate: firstRound.length ? Math.round((firstClean / firstRound.length) * 100) : 0,
      clean_rate_all_rounds: total ? Math.round((cleanOverall / total) * 100) : 0,
      average_rounds: rounds.length ? Math.round((rounds.reduce((a, b) => a + b, 0) / rounds.length) * 10) / 10 : 1,
      recurring_mistakes: Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ category: k, count: v })),
      weakest_areas: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ area: k, issues: v })),
      open_reviews: list.filter((r) => r.status === "awaiting_fix" || r.status === "rechecking").map((r) => ({ id: r.id, client: r.client_name, status: r.status, round: r.round })),
    });
  }
  out.sort((a, b) => b.items_checked - a.items_checked);
  return { success: true, executives: out };
}

/* ---- 7. Load a saved review in full (reusable, nothing is temporary) -------- */

export async function qaLoadReview(opts: { reviewId: string }) {
  const reviewId = String(opts.reviewId || "").trim();
  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const { data: tabs } = await db().from("qa_tabs").select("*").eq("review_id", reviewId).order("tab_index", { ascending: true });
  const { data: finds } = await db().from("qa_findings").select("*").eq("review_id", reviewId).order("round", { ascending: true }).limit(5000);
  return { success: true, review: rev, tabs: tabs || [], findings: finds || [] };
}
