/* ════════════════════════════════════════════════════════════════
   api/lib/copy-review-gate.ts

   BUILD 13.08. Copy review gate (client sign-off before implementation).

   Two things are fused in this module, and they are kept deliberately apart
   because they carry different levels of certainty:

   1. THE GATE. Compile every proposed copy change into a numbered review
      document, track the client's decision per item, and refuse to mark the
      set implementation ready until every item is approved. This is pure
      workflow: deterministic, auditable, and nothing about it is inferred.

   2. THE LANGUAGE LAYER, in two tiers that are never mixed on the page:
      - MECHANICAL findings are rule based and reproducible. A Latin letter
        inside a Greek word either is there or is not. These are stated as
        facts and are safe to gate on.
      - ADVISORY findings are judgement: register, idiom, whether the copy
        reads as machine translated. These are marked as advisory, are never
        gated on, and always carry the instruction that a native speaker
        confirms them. The platform does not get to overrule a Greek client
        on their own language.

   The distinction matters because this document is what a client signs. A
   mechanical finding presented with false confidence would put the operator's
   reputation behind a guess.

   Locale: built for Greek (el) first, since that is what the order needed.
   The gate itself is language neutral and other locales fall back to the
   mechanical checks that are not Greek specific.

   Multi-tenant: holds no client values, everything arrives as arguments.
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { llmComplete } from "./workspace/llm.js";

/* ── Character classes ──────────────────────────────────────────────────── */

/* Greek and Coptic, plus Greek Extended which is the polytonic range. */
const GREEK_ANY = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const GREEK_G = /[\u0370-\u03FF\u1F00-\u1FFF]/g;
const LATIN_ANY = /[A-Za-z]/;
const POLYTONIC = /[\u1F00-\u1FFF]/;

/* Uppercase Greek vowels carrying the tonos. The dieresis pair is excluded on
   purpose: a dieresis is kept in capitals and is correct there. */
const UPPER_TONOS = /[\u0386\u0388\u0389\u038A\u038C\u038E\u038F]/;
/* Explicit rather than a range, because the range 0386 to 03AB also contains
   0390, which is a LOWERCASE iota with dialytika and tonos, and would let a
   lower case word through as if it were capitals. */
const GREEK_UPPER = /^[\u0391-\u03A9\u0386\u0388-\u038A\u038C\u038E\u038F\u03AA\u03AB]+$/;

/* Accent-insensitive folding, for MATCHING only. Never for display, and never
   for the accent rules themselves, which exist precisely to judge accents.

   This is not a nicety. Greek nouns move their accent as they decline:
   παπούτσια in the nominative becomes παπουτσιών in the genitive, where the
   tonos jumps from the ου to the ω. A stem comparison that respects accents
   therefore fails on the ACCENT rather than the ending, and reports a target
   term as missing from copy that is squarely on target. Decomposing and
   stripping the combining marks removes the whole class of that error at once,
   including the dialytika pairs, and the final sigma is folded with it so that
   a word matches whether or not it sits at the end of a phrase. */
export const foldGreek = (s: string): string =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036F]/g, "").toLowerCase().replace(/\u03C2/g, "\u03C3");

const isGreekText = (s: string): boolean => {
  const letters = String(s || "").match(/[\p{L}]/gu) || [];
  if (!letters.length) return false;
  const greek = letters.filter((c) => GREEK_ANY.test(c)).length;
  return greek / letters.length >= 0.4;
};

/* ── Register markers ───────────────────────────────────────────────────── */

/* The plural of politeness against the singular. Greek commercial copy picks
   one and holds it. Mixing the two inside one page is the error a Greek reader
   notices immediately, and it is the commonest tell of copy assembled by
   several hands or run through machine translation.

   Ambiguous forms are deliberately left out. "σε" is also the preposition, so
   it is not a marker. Every entry below is unambiguous in running copy. */
const FORMAL_MARKERS = [
  "εσείς", "εσάς", "σας", "είστε", "έχετε", "μπορείτε", "θέλετε", "βρείτε",
  "επικοινωνήστε", "καλέστε", "επιλέξτε", "δείτε", "μάθετε", "κάντε",
  "ανακαλύψτε", "αποκτήστε", "παραγγείλτε", "εγγραφείτε", "επισκεφθείτε",
  "επισκεφτείτε", "ενημερωθείτε", "συμπληρώστε", "πατήστε", "ζητήστε",
  "στείλτε", "διαβάστε", "κλείστε", "δοκιμάστε", "γνωρίζετε",
];
const INFORMAL_MARKERS = [
  "εσύ", "εσένα", "σου", "είσαι", "έχεις", "μπορείς", "θέλεις", "βρεις",
  "επικοινώνησε", "κάλεσε", "επίλεξε", "δες", "μάθε", "κάνε",
  "ανακάλυψε", "απόκτησε", "παράγγειλε", "γράψου", "επισκέψου",
  "ενημερώσου", "συμπλήρωσε", "πάτα", "ζήτα", "στείλε", "διάβασε",
  "κλείσε", "δοκίμασε", "γνωρίζεις",
];

/* Latin-script terms that belong in Greek marketing copy and are not Greeklish.
   Kept short and obvious on purpose: anything not listed is REPORTED for the
   reviewer to confirm rather than judged, because a brand name and a piece of
   Greeklish look identical to a rule. */
const ACCEPTED_LATIN = new Set([
  "seo", "google", "facebook", "instagram", "tiktok", "youtube", "linkedin",
  "email", "e-mail", "online", "offline", "web", "website", "site", "blog",
  "click", "wifi", "app", "apps", "smartphone", "tablet", "laptop", "pc",
  "eshop", "e-shop", "shop", "check", "in", "out", "ok", "vip", "diy",
  "gps", "usb", "led", "hd", "tv", "dvd", "cd", "pdf", "url", "html", "css",
  "meta", "title", "description", "alt", "h1", "h2", "cta", "roi", "b2b", "b2c",
]);

/* ── Finding shape ──────────────────────────────────────────────────────── */

export type FindingTier = "mechanical" | "advisory";
export type FindingLevel = "error" | "warning" | "note";

export interface CopyFinding {
  code: string;
  tier: FindingTier;
  level: FindingLevel;
  message: string;
  evidence?: string;
  /* Only mechanical errors may hold an item back from being sent. Advisory
     findings never gate, by design. */
  blocking: boolean;
}

const find = (
  code: string, tier: FindingTier, level: FindingLevel, message: string, evidence?: string,
): CopyFinding => ({ code, tier, level, message, evidence, blocking: tier === "mechanical" && level === "error" });

/* ── The mechanical checks ──────────────────────────────────────────────── */

/* Alphabetic runs, split on anything that is not a letter. A hyphen separates
   runs on purpose, so "SEO-φιλικό" is two clean runs rather than one mixed one. */
const letterRuns = (text: string): string[] => (String(text || "").match(/[\p{L}]+/gu) || []);

/* THE MOST IMPORTANT CHECK IN THIS FILE. A Latin letter sitting inside a Greek
   word is invisible to the eye, because Α and A, Ο and O, Ε and E, Ρ and P, Τ
   and T, Υ and Y, Χ and X, Ι and I, Κ and K, Μ and M, Ν and N, Β and B, Ζ and Z,
   Η and H are drawn identically. The word looks perfect and matches nothing:
   no search query, no internal search, no filter. It survives copy and paste
   between tools and it is the single most damaging thing that can be signed
   off unnoticed. Detected by mixed script rather than by a homoglyph table, so
   it catches every pair rather than the ones somebody remembered. */
export function mixedScriptRuns(text: string): string[] {
  const bad: string[] = [];
  for (const run of letterRuns(text)) {
    if (GREEK_ANY.test(run) && LATIN_ANY.test(run) && !bad.includes(run)) bad.push(run);
  }
  return bad;
}

/* Greek drops the tonos when a word is set in capitals. ΕΛΛΑΔΑ is correct,
   ΕΛΛΆΔΑ is not. The dieresis is kept, which is why it is excluded above. Note
   the honest limit recorded in the message: copy that is lowercase in the
   source and capitalised by CSS is correct at the source and is not flagged,
   because the rule only sees what is written. */
export function capsWithTonos(text: string): string[] {
  const bad: string[] = [];
  for (const run of letterRuns(text)) {
    if (run.length < 2) continue;
    if (!GREEK_UPPER.test(run)) continue;
    if (UPPER_TONOS.test(run) && !bad.includes(run)) bad.push(run);
  }
  return bad;
}

/* Final sigma. ς closes a word, σ does everything else. A σ at the end or a ς
   in the middle is the classic signature of text that has been through a tool
   that does not understand Greek. */
export function sigmaErrors(text: string): string[] {
  const bad: string[] = [];
  for (const run of letterRuns(text)) {
    const last = run.length - 1;
    for (let i = 0; i < run.length; i++) {
      const ch = run[i];
      if (ch === "\u03C3" && i === last && !bad.includes(run)) bad.push(run);        // σ closing a word
      if (ch === "\u03C2" && i !== last && !bad.includes(run)) bad.push(run);        // ς inside a word
    }
  }
  return bad;
}

/* In Greek the question mark is the semicolon character. A Latin question mark
   in Greek prose is a typography error that every Greek reader sees. */
export function latinQuestionMarks(text: string): number {
  const s = String(text || "");
  if (!isGreekText(s)) return 0;
  return (s.match(/\?/g) || []).length;
};

/* Greek writes one thousand two hundred and thirty four point five six as
   1.234,56 and puts the euro sign after the number. English formatting inside
   Greek copy reads as untranslated and, on a price, as wrong. */
export function numberFormatIssues(text: string): string[] {
  const s = String(text || "");
  if (!isGreekText(s)) return [];
  const out: string[] = [];
  for (const m of s.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g)) out.push(m[0]);        // 1,234.56
  for (const m of s.matchAll(/[€$]\s?\d/g)) out.push(m[0]);                            // currency before the number
  return Array.from(new Set(out));
}

/* Latin-script words inside Greek copy. REPORTED, never judged, because a brand
   name, an accepted loan word and a piece of Greeklish are indistinguishable to
   a rule. The reviewer confirms which is which. */
export function latinWordsInGreek(text: string): string[] {
  const s = String(text || "");
  if (!isGreekText(s)) return [];
  const out: string[] = [];
  for (const run of letterRuns(s)) {
    if (GREEK_ANY.test(run)) continue;
    if (!LATIN_ANY.test(run)) continue;
    if (ACCEPTED_LATIN.has(run.toLowerCase())) continue;
    if (run.length < 3) continue;
    if (!out.includes(run)) out.push(run);
  }
  return out;
}

const markersPresent = (text: string, markers: string[]): string[] => {
  const words = new Set((String(text || "").toLowerCase().match(/[\p{L}]+/gu) || []));
  return markers.filter((m) => words.has(m));
};

/* Greek meta lengths. Google truncates on rendered pixel width, not characters,
   and Greek glyphs average wider than Latin while Greek words run roughly a
   fifth longer than their English equivalents. So the safe character budget is
   lower than the English rule of thumb. Stated as an estimate in the message,
   because the honest limit is that only a pixel measurement is exact. */
const META_LIMITS: Record<string, { min: number; max: number; label: string }> = {
  meta_title: { min: 25, max: 57, label: "meta title" },
  meta_description: { min: 70, max: 152, label: "meta description" },
};

export interface CheckOptions {
  element?: string;
  locale?: string;
  keyword?: string;
}

/* Every mechanical rule, run over one piece of copy. Pure, synchronous, no
   network and no model, which is what makes it safe to gate on and trivial to
   test. */
export function greekCopyChecks(text: string, opts: CheckOptions = {}): CopyFinding[] {
  const s = String(text || "");
  const out: CopyFinding[] = [];
  const locale = String(opts.locale || "el").toLowerCase();
  const element = String(opts.element || "");

  if (!s.trim()) {
    out.push(find("empty", "mechanical", "error", "There is no proposed text for this item, so there is nothing for the client to approve."));
    return out;
  }

  const mixed = mixedScriptRuns(s);
  if (mixed.length) {
    out.push(find(
      "mixed_script", "mechanical", "error",
      `${mixed.length} word(s) contain both Greek and Latin letters. Greek and Latin capitals such as Α and A, Ο and O, Ε and E, Ρ and P are drawn identically, so the word looks correct and matches nothing: not a search query, not on-site search, not a filter. Retype the affected word or words entirely in Greek.`,
      mixed.slice(0, 6).join(", "),
    ));
  }

  if (locale.startsWith("el")) {
    const caps = capsWithTonos(s);
    if (caps.length) {
      out.push(find(
        "caps_tonos", "mechanical", "error",
        "Greek drops the accent when a word is written in capitals, so ΕΛΛΑΔΑ is correct and ΕΛΛΆΔΑ is not. The dieresis is the exception and is kept. If this text is written in lower case and capitalised by the stylesheet instead, the source is correct and this can be dismissed.",
        caps.slice(0, 6).join(", "),
      ));
    }

    const sig = sigmaErrors(s);
    if (sig.length) {
      out.push(find(
        "final_sigma", "mechanical", "error",
        "The final sigma is used wrongly. A word ends in ς and uses σ everywhere else. This is usually a sign that the text has passed through a tool that does not handle Greek.",
        sig.slice(0, 6).join(", "),
      ));
    }

    if (POLYTONIC.test(s)) {
      out.push(find(
        "polytonic", "mechanical", "warning",
        "The text contains polytonic accents. Greek has used the monotonic system since 1982, so unless this is deliberately classical or liturgical copy, these characters should be replaced with their monotonic equivalents.",
      ));
    }

    const qm = latinQuestionMarks(s);
    if (qm > 0) {
      out.push(find(
        "latin_question_mark", "mechanical", "warning",
        `The Latin question mark appears ${qm} time(s) in Greek prose. In Greek the question mark is the semicolon character, so a question should close with the Greek question mark rather than the Latin one.`,
      ));
    }

    const nums = numberFormatIssues(s);
    if (nums.length) {
      out.push(find(
        "number_format", "mechanical", "warning",
        "Numbers or prices are written in the English convention. Greek uses the comma as the decimal separator and the full stop for thousands, so one thousand two hundred and thirty four and a half is 1.234,50, and the euro sign follows the number.",
        nums.slice(0, 5).join(", "),
      ));
    }

    const formal = markersPresent(s, FORMAL_MARKERS);
    const informal = markersPresent(s, INFORMAL_MARKERS);
    if (formal.length && informal.length) {
      out.push(find(
        "register_mixed", "mechanical", "error",
        "The text addresses the reader formally and informally in the same piece. Greek commercial copy picks one and holds it throughout. Which of the two suits this brand is a judgement for the client, but using both is an error either way.",
        `formal: ${formal.slice(0, 4).join(", ")} / informal: ${informal.slice(0, 4).join(", ")}`,
      ));
    }

    const latin = latinWordsInGreek(s);
    if (latin.length) {
      out.push(find(
        "latin_words", "mechanical", "note",
        "Latin-script words appear in Greek copy. These are reported rather than judged, because a brand name, an accepted loan word and Greeklish look the same to a rule. Confirm each one is intentional and not Greek typed in Latin characters.",
        latin.slice(0, 8).join(", "),
      ));
    }
  }

  const limit = META_LIMITS[element];
  if (limit) {
    const n = s.length;
    if (n > limit.max) {
      out.push(find(
        "length_long", "mechanical", "warning",
        `The ${limit.label} runs to ${n} characters. Google truncates on rendered width rather than character count, and Greek glyphs are wider than Latin while Greek words run roughly a fifth longer, so about ${limit.max} characters is the safe ceiling in Greek. This is an estimate: only a pixel measurement is exact.`,
      ));
    } else if (n < limit.min) {
      out.push(find(
        "length_short", "mechanical", "note",
        `The ${limit.label} is ${n} characters, which leaves room unused. About ${limit.min} to ${limit.max} characters is the useful range in Greek.`,
      ));
    }
  }

  /* Keyword presence by stem, so an inflected Greek form still counts. Greek
     nouns decline, and a target term will legitimately appear as a different
     ending than the one researched, so a literal match would report a false
     miss on perfectly good copy. */
  const kw = String(opts.keyword || "").trim();
  if (kw) {
    const stem = (w: string) => { const f = foldGreek(w); return f.slice(0, Math.max(4, Math.ceil(f.length * 0.7))); };
    const parts = kw.split(/\s+/).filter((w) => w.length > 2);
    const folded = foldGreek(s);
    const missing = parts.filter((w) => !folded.includes(stem(w)));
    if (missing.length === parts.length && parts.length) {
      out.push(find(
        "keyword_absent", "mechanical", "warning",
        `The target term does not appear in this text, in any inflected form. Greek nouns decline, so the match is made on word stems rather than exact forms, and nothing matching was found.`,
        kw,
      ));
    }
  }

  return out;
}

/* ── The advisory layer ─────────────────────────────────────────────────── */

/* Judgement, not rules. Kept in its own function, returned under its own tier
   and never allowed to block, because being wrong here is a matter of taste
   and being wrong in the mechanical layer is a matter of fact. The prompt is
   written to make the model report uncertainty rather than smooth over it. */
export async function greekCopyAdvisory(opts: {
  items: Array<{ index: number; element: string; proposed: string; page?: string }>;
  business?: string;
  audience?: string;
  locale?: string;
}): Promise<{ ok: boolean; note: string; perItem: Record<number, string[]>; overall: string }> {
  const items = (opts.items || []).slice(0, 40);
  if (!items.length) return { ok: false, note: "There was no copy to review.", perItem: {}, overall: "" };

  const system = [
    "You are a native Greek copy editor reviewing SEO copy before it goes to the client for approval.",
    "Comment ONLY on things a rule cannot catch: whether the register suits the business, whether the phrasing sounds natural to a Greek reader or reads as translated from English, whether an idiom lands, and whether a term is the one Greek buyers actually use for the thing being sold.",
    "Mechanical matters are already handled elsewhere and must not be repeated: accents in capitals, the final sigma, mixed alphabets, number formatting, meta length.",
    "Where you are not certain, say so in the note itself rather than stating it firmly. Being useful here means being honest about confidence.",
    "Never rewrite the copy. Point at what a native reviewer should look at and why.",
    "Return ONLY JSON, with no prose around it: {\"overall\":\"two or three sentences on the copy as a whole\",\"items\":[{\"index\":0,\"notes\":[\"one short observation\"]}]}. An item with nothing worth saying is omitted entirely rather than padded.",
    "Write the notes in English, because the operator reads them. Never use an em-dash.",
  ].join(" ");

  const user = [
    opts.business ? `The business: ${opts.business}.` : "",
    opts.audience ? `The audience: ${opts.audience}.` : "",
    "The proposed copy:",
    ...items.map((it) => `[${it.index}] ${it.element}${it.page ? ` on ${it.page}` : ""}: ${String(it.proposed).slice(0, 600)}`),
  ].filter(Boolean).join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text } = await llmComplete({
        system: attempt === 0 ? system : `${system} Your previous answer could not be parsed. Return the JSON object and nothing else.`,
        user, maxTokens: 1600, timeoutMs: 60000, label: "greek-copy-advisory", maxSegments: 1,
      });
      const m = String(text || "").match(/\{[\s\S]*\}/);
      if (!m) continue;
      const parsed = JSON.parse(m[0]);
      const perItem: Record<number, string[]> = {};
      for (const row of (Array.isArray(parsed.items) ? parsed.items : [])) {
        const i = Number(row?.index);
        const notes = (Array.isArray(row?.notes) ? row.notes : []).map(String).filter(Boolean);
        if (Number.isFinite(i) && notes.length) perItem[i] = notes;
      }
      return { ok: true, note: "", perItem, overall: String(parsed.overall || "") };
    } catch { /* retried once, then reported honestly below */ }
  }
  /* An advisory that could not run is reported as absent, never as a clean
     result. A blank advisory section that looks like approval would be worse
     than no advisory section at all. */
  return {
    ok: false,
    note: "The language advisory could not be produced this run, so this document carries the mechanical findings only. The mechanical findings stand on their own and are unaffected.",
    perItem: {}, overall: "",
  };
}

/* ── The gate ───────────────────────────────────────────────────────────── */

export type ItemDecision = "pending" | "approved" | "changes_requested" | "rejected";

export interface GateItemInput {
  page_url?: string;
  element?: string;
  current_value?: string;
  proposed_value?: string;
  rationale?: string;
  keyword?: string;
}

const ELEMENT_EL: Record<string, string> = {
  meta_title: "Τίτλος σελίδας (meta title)",
  meta_description: "Περιγραφή σελίδας (meta description)",
  h1: "Επικεφαλίδα H1",
  h2: "Επικεφαλίδα H2",
  body: "Κείμενο σελίδας",
  alt: "Εναλλακτικό κείμενο εικόνας (alt)",
  slug: "Διεύθυνση URL",
  cta: "Κείμενο κουμπιού (CTA)",
};

const DECISION_EL: Record<ItemDecision, string> = {
  pending: "Εκκρεμεί",
  approved: "Εγκρίνεται",
  changes_requested: "Ζητούνται αλλαγές",
  rejected: "Απορρίπτεται",
};

/* Build the gate: run the mechanical checks over every item, attach the
   advisory where it ran, and persist. Items start pending. Nothing is
   implementation ready until a decision says so. */
export async function buildCopyReviewGate(opts: {
  projectId?: string;
  clientId?: string;
  title?: string;
  locale?: string;
  business?: string;
  audience?: string;
  items: GateItemInput[];
  skipAdvisory?: boolean;
}) {
  const items = Array.isArray(opts.items) ? opts.items : [];
  if (!items.length) return { success: false, error: "There is no copy to review. Supply the proposed items first." };
  const locale = String(opts.locale || "el");

  const checked = items.map((it, i) => {
    const findings = greekCopyChecks(String(it.proposed_value || ""), {
      element: String(it.element || ""), locale, keyword: String(it.keyword || ""),
    });
    return { index: i, input: it, findings };
  });

  let advisory: Awaited<ReturnType<typeof greekCopyAdvisory>> = { ok: false, note: "", perItem: {}, overall: "" };
  if (!opts.skipAdvisory) {
    advisory = await greekCopyAdvisory({
      items: checked.map((c) => ({ index: c.index, element: String(c.input.element || "copy"), proposed: String(c.input.proposed_value || ""), page: c.input.page_url })),
      business: opts.business, audience: opts.audience, locale,
    });
  }

  try {
    const { data: gate, error } = await db().from("copy_review_gates").insert({
      project_id: opts.projectId || null,
      client_id: opts.clientId || null,
      title: opts.title || `Copy review for ${opts.clientId || "this client"}`,
      locale,
      status: "draft",
      advisory_ok: advisory.ok,
      advisory_note: advisory.note || null,
      advisory_overall: advisory.overall || null,
    }).select().single();
    if (error || !gate) return { success: false, error: error?.message || "Could not create the review gate." };

    const rows = checked.map((c) => ({
      gate_id: (gate as any).id,
      item_index: c.index,
      page_url: c.input.page_url || null,
      element: c.input.element || "copy",
      current_value: c.input.current_value || null,
      proposed_value: c.input.proposed_value || null,
      rationale: c.input.rationale || null,
      keyword: c.input.keyword || null,
      findings: c.findings,
      advisory_notes: advisory.perItem[c.index] || [],
      status: "pending",
      round: 1,
    }));
    const { error: iErr } = await db().from("copy_review_items").insert(rows);
    if (iErr) return { success: false, error: iErr.message };

    /* The freshly computed state IS the answer, with the id added. Spreading it
       over a literal `success: true` would have let a failed state read as a
       success, or the reverse, depending on key order. */
    const state: any = await gateState((gate as any).id);
    if (!state?.success) return state;
    return { ...state, gateId: (gate as any).id };
  } catch (e: any) {
    return { success: false, error: e?.message || "Could not build the review gate." };
  }
}

/* The state of a gate, computed rather than stored, so it can never drift from
   the decisions underneath it. Implementation ready has exactly one meaning:
   every item approved, and no blocking mechanical error left unresolved. */
export async function gateState(gateId: string) {
  const { data: gate } = await db().from("copy_review_gates").select("*").eq("id", gateId).maybeSingle();
  if (!gate) return { success: false, error: "That review gate no longer exists." };
  const { data: rows } = await db().from("copy_review_items").select("*").eq("gate_id", gateId).order("item_index", { ascending: true });
  const items = (rows as any[]) || [];

  const counts = {
    total: items.length,
    approved: items.filter((i) => i.status === "approved").length,
    changes_requested: items.filter((i) => i.status === "changes_requested").length,
    rejected: items.filter((i) => i.status === "rejected").length,
    pending: items.filter((i) => i.status === "pending").length,
  };

  const blockingItems = items.filter((i) =>
    (Array.isArray(i.findings) ? i.findings : []).some((f: any) => f && f.blocking) && i.status !== "rejected");

  const implementation_ready = counts.total > 0 && counts.approved === counts.total && blockingItems.length === 0;

  /* Said in words rather than left to be inferred from four numbers. */
  const verdict = implementation_ready
    ? `All ${counts.total} item(s) are approved by the client and no mechanical error is outstanding. This set is ready to implement.`
    : blockingItems.length
    ? `NOT ready. ${blockingItems.length} item(s) carry a mechanical error that must be corrected before the client is asked to approve them, because approving text with a Latin letter inside a Greek word, or a mixed form of address, signs off something that will not work. ${counts.pending} item(s) are still pending, ${counts.changes_requested} have changes requested.`
    : counts.pending
    ? `NOT ready. ${counts.approved} of ${counts.total} item(s) approved, ${counts.pending} still awaiting the client's decision.`
    : `NOT ready. ${counts.changes_requested} item(s) need changes and ${counts.rejected} were rejected. Revise those and send a new round.`;

  return {
    success: true,
    gate: {
      id: (gate as any).id, title: (gate as any).title, locale: (gate as any).locale,
      status: (gate as any).status, client_id: (gate as any).client_id, project_id: (gate as any).project_id,
      advisory_ok: (gate as any).advisory_ok, advisory_note: (gate as any).advisory_note,
      advisory_overall: (gate as any).advisory_overall,
    },
    counts, implementation_ready, verdict,
    blocking_item_indexes: blockingItems.map((i) => i.item_index),
    items: items.map((i) => ({
      item_index: i.item_index, page_url: i.page_url, element: i.element,
      current_value: i.current_value, proposed_value: i.proposed_value,
      rationale: i.rationale, keyword: i.keyword,
      findings: i.findings || [], advisory_notes: i.advisory_notes || [],
      status: i.status, client_comment: i.client_comment,
      decided_by: i.decided_by, decided_at: i.decided_at, round: i.round,
    })),
  };
}

/* One item, one decision, recorded with who and when. A decision on an item
   that still carries a blocking mechanical error is refused rather than
   accepted quietly, because the whole point of the gate is that nobody signs
   off something known to be broken. */
export async function recordCopyDecision(opts: {
  gateId: string; itemIndex: number; decision: ItemDecision;
  comment?: string; decidedBy?: string; override?: boolean;
}) {
  const gateId = String(opts.gateId || "").trim();
  const decision = String(opts.decision || "") as ItemDecision;
  if (!gateId) return { success: false, error: "A review gate is required." };
  if (!["pending", "approved", "changes_requested", "rejected"].includes(decision)) {
    return { success: false, error: "That is not a decision this gate recognises." };
  }
  try {
    const { data: item } = await db().from("copy_review_items").select("*")
      .eq("gate_id", gateId).eq("item_index", Number(opts.itemIndex)).maybeSingle();
    if (!item) return { success: false, error: "That item is not part of this review gate." };

    const blocking = (Array.isArray((item as any).findings) ? (item as any).findings : []).filter((f: any) => f && f.blocking);
    if (decision === "approved" && blocking.length && !opts.override) {
      return {
        success: false,
        error: `This item cannot be approved while it carries ${blocking.length} mechanical error(s): ${blocking.map((f: any) => f.code).join(", ")}. Correct the text and rebuild the round, or record the decision with an explicit override if the finding has been checked and is wrong.`,
        blocking,
      };
    }

    await db().from("copy_review_items").update({
      status: decision,
      client_comment: opts.comment || null,
      decided_by: opts.decidedBy || null,
      decided_at: new Date().toISOString(),
      overridden: Boolean(opts.override && blocking.length),
    }).eq("gate_id", gateId).eq("item_index", Number(opts.itemIndex));

    const state = await gateState(gateId);
    const nextStatus = (state as any).implementation_ready ? "implementation_ready" : "in_review";
    await db().from("copy_review_gates").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", gateId);
    return { ...state, recorded: decision };
  } catch (e: any) {
    return { success: false, error: e?.message || "Could not record the decision." };
  }
}

/* ── The documents ──────────────────────────────────────────────────────── */

/* The client-facing sheet, written in Greek because the person signing it is
   Greek. The fixed labels below are the only Greek this module generates, and
   they are fixed strings rather than generated prose, which is what makes them
   safe. The rationale written by the operator is passed through untranslated
   rather than machine translated into the client's own language, because a
   clumsy translation of the reasoning is worse than plain English next to it. */
export function renderClientDoc(state: any): string {
  const g = state?.gate || {};
  const items: any[] = state?.items || [];
  const lines: string[] = [];

  lines.push(`# Έγκριση κειμένων SEO`);
  lines.push("");
  lines.push(`Παρακάτω θα βρείτε κάθε αλλαγή κειμένου που προτείνουμε, μία προς μία. **Δεν εφαρμόζεται καμία αλλαγή πριν από την έγκρισή σας.**`);
  lines.push("");
  lines.push(`Σύνολο στοιχείων προς έγκριση: ${items.length}`);
  lines.push("");
  lines.push(`Για κάθε στοιχείο σημειώστε μία από τις εξής απαντήσεις: **${DECISION_EL.approved}**, **${DECISION_EL.changes_requested}**, **${DECISION_EL.rejected}**.`);
  lines.push("");
  lines.push("---");

  for (const it of items) {
    const label = ELEMENT_EL[String(it.element)] || String(it.element || "Κείμενο");
    lines.push("");
    lines.push(`## ${it.item_index + 1}. ${label}`);
    if (it.page_url) lines.push(`**Σελίδα:** ${it.page_url}`);
    lines.push("");
    if (it.current_value) {
      lines.push(`**Τρέχον κείμενο:**`);
      lines.push("");
      lines.push(`> ${String(it.current_value).replace(/\n/g, "\n> ")}`);
      lines.push("");
    }
    lines.push(`**Προτεινόμενο κείμενο:**`);
    lines.push("");
    lines.push(`> ${String(it.proposed_value || "").replace(/\n/g, "\n> ")}`);
    lines.push("");
    if (it.rationale) {
      lines.push(`**Αιτιολόγηση:** ${it.rationale}`);
      lines.push("");
    }
    lines.push(`**Η απόφασή σας:** ${DECISION_EL[(it.status as ItemDecision)] || DECISION_EL.pending}`);
    lines.push("");
    lines.push(`**Σχόλια:** ${it.client_comment || "..............................................."}`);
    lines.push("");
    lines.push("---");
  }

  lines.push("");
  lines.push(`_Ημερομηνία: ${new Date().toLocaleDateString("el-GR")}_`);
  return lines.join("\n");
}

/* The internal sheet. Everything the client sheet deliberately leaves out: the
   mechanical findings, the advisory notes, and the gate verdict. The two tiers
   are printed under separate headings so nobody reads a judgement call as a
   fact, which is the whole reason they are tracked separately. */
export function renderInternalDoc(state: any): string {
  const g = state?.gate || {};
  const items: any[] = state?.items || [];
  const c = state?.counts || {};
  const lines: string[] = [];

  lines.push(`# Copy review gate: ${g.title || "untitled"}`);
  lines.push("");
  lines.push(`**Status:** ${state?.implementation_ready ? "IMPLEMENTATION READY" : "NOT READY"}`);
  lines.push("");
  lines.push(state?.verdict || "");
  lines.push("");
  lines.push(`Approved ${c.approved || 0} of ${c.total || 0}. Pending ${c.pending || 0}. Changes requested ${c.changes_requested || 0}. Rejected ${c.rejected || 0}.`);
  lines.push("");

  if (g.advisory_note) {
    lines.push(`> ${g.advisory_note}`);
    lines.push("");
  } else if (g.advisory_overall) {
    lines.push(`## Language advisory, overall`);
    lines.push("");
    lines.push(`${g.advisory_overall}`);
    lines.push("");
    lines.push(`_Advisory notes are judgement, not rules. They never hold an item back and a native speaker confirms them._`);
    lines.push("");
  }

  const withErrors = items.filter((i) => (i.findings || []).some((f: any) => f.blocking));
  if (withErrors.length) {
    lines.push(`## Correct these before the client sees them (${withErrors.length})`);
    lines.push("");
    lines.push(`These carry mechanical errors. Sending them for approval asks the client to sign off text that will not work.`);
    lines.push("");
    for (const it of withErrors) {
      lines.push(`- **Item ${it.item_index + 1}, ${it.element}${it.page_url ? ` on ${it.page_url}` : ""}:** ${(it.findings || []).filter((f: any) => f.blocking).map((f: any) => f.message).join(" ")}`);
    }
    lines.push("");
  }

  lines.push(`## Item by item`);
  lines.push("");
  for (const it of items) {
    lines.push(`### ${it.item_index + 1}. ${it.element}${it.page_url ? ` on ${it.page_url}` : ""} [${it.status}]`);
    lines.push("");
    lines.push(`Proposed: ${String(it.proposed_value || "").slice(0, 400)}`);
    lines.push("");
    const mech = (it.findings || []).filter((f: any) => f.tier === "mechanical");
    if (mech.length) {
      lines.push(`**Mechanical findings (rule based, reproducible):**`);
      for (const f of mech) lines.push(`- [${f.level}] ${f.message}${f.evidence ? ` Found: ${f.evidence}.` : ""}`);
      lines.push("");
    }
    if ((it.advisory_notes || []).length) {
      lines.push(`**Advisory (judgement, confirm with a native speaker):**`);
      for (const n of it.advisory_notes) lines.push(`- ${n}`);
      lines.push("");
    }
    if (!mech.length && !(it.advisory_notes || []).length) {
      lines.push(`Nothing flagged.`);
      lines.push("");
    }
    if (it.client_comment) { lines.push(`Client comment: ${it.client_comment}`); lines.push(""); }
  }

  lines.push(`_The mechanical findings above are rule based and reproducible. The advisory findings are judgement and are never gated on. A native Greek speaker confirms the language before this goes to the client._`);
  return lines.join("\n");
}
