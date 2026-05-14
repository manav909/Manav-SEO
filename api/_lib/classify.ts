/* ═══════════════════════════════════════════════════════════
   Learning Classification Engine — canonical single source.
   All API routes import from here. Never copy-paste this logic.

   Pipeline:
   1. Too short               → reject
   2. System error pattern    → save as system record (project_id=null)
   3. System warning pattern  → save as system_warning (project_id=null)
   4. AI refusal / error msg  → reject
   5. Boilerplate opener      → reject if content is short
   6. No actionable content   → reject if content is short
   7. Classify category       → technical / algorithm / quick-win / geo /
                                 competitive / content / strategy / insight
   8. Score confidence        → 0-100, signals from content + source
   9. Auto-approve?           → technical/algorithm/quick-win or score ≥ 85
═══════════════════════════════════════════════════════════ */

import type { LearningClass } from "./types";
import { db } from "./db";

/* ── Patterns ── */
const SYS_ERR_PAT = [
  /supabase.*error/i, /api.?key.*missing/i, /anthropic.*key/i,
  /enotfound/i, /connection.*refused/i, /ETIMEDOUT/i,
  /fetch.*failed/i, /environment.*variable/i, /process\.env\./i,
  /module.*not.*found/i, /cannot.*find.*module/i,
  /internal.*server.*error/i, /5\d\d\s+error/i,
];
const SYS_WARN_PAT = [
  /max_tokens/i, /token.*limit.*reached/i,
  /output.*truncated/i, /partial.*result/i,
  /rate.?limit/i, /\b429\b/, /\b503\b/,
];
const REJECT_PAT = [
  /^error:/i, /^failed:/i, /^cannot/i, /^undefined$/i,
  /as an ai.{0,20}(i |,)/i, /i'm sorry,? i (can't|cannot)/i,
  /i don't have (access|real|live)/i, /i'm not able to/i,
  /no (data|context|information) (was|is|has been) provided/i,
];
const BOILERPLATE_PAT = [
  /^here (is|are) (my|the|a)/i, /^based on (the |your )/i,
  /^i'll (analyze|help|provide|look)/i, /^let me (help|analyze|look)/i,
  /^great (question|point)/i, /^of course/i, /^certainly/i,
  /^to answer your/i,
];

const ACTIONABLE_WORDS = [
  "improve","optimise","optimize","fix","add","remove","create","implement",
  "increase","decrease","update","change","build","write","publish","target",
  "monitor","test","analyse","analyze","launch","migrate","rewrite",
  "restructure","prioritise","prioritize","rank","index","crawl","audit",
  "deploy","configure","enable","disable","consolidate",
];

function hasActionableContent(text: string): boolean {
  const l = text.toLowerCase();
  return ACTIONABLE_WORDS.some(w => l.includes(w));
}

export function detectCategory(content: string, source: string, requested?: string): string {
  const c = content.toLowerCase();
  const s = source.toLowerCase();

  if (s.includes("audit") || s.includes("crawl") || s.includes("seo_agent")) return "technical";
  if (s.includes("algorithm_intel"))                                          return "algorithm";

  if (/llm.{0,20}visib|ai.overview|perplexity|chatgpt.{0,20}cit|geo\b|ai.engine|cited.by.ai|llm.cit/i.test(c))
    return "geo";
  if (/core.?web.?vital|\blcp\b|\bfcp\b|\bcls\b|page.?speed|crawl.?budget|index.{0,10}cover|robots\.txt|sitemap|schema.?markup|canonical|technical.?seo|crawl.?error|structured.?data/i.test(c))
    return "technical";
  if (/core.?update|helpful.?content|\bhcu\b|e-e-a-t|\beeat\b|algorithm.?signal|ranking.?factor|spam.?polic|google.?update|search.?signal/i.test(c))
    return "algorithm";
  if (/quick.?win|low.?hanging|easy.?fix|simple.?change|implement.{0,20}(week|day)|within.{0,10}(week|day)/i.test(c))
    return "quick-win";
  if (/competitor|outrank|market.?share|\bvs\.?\s+\w|compared.?to.{0,30}site|competitor.?gap|steal.{0,20}traffic/i.test(c))
    return "competitive";
  if (/topical.?authorit|keyword.?cluster|content.?gap|pillar.?page|content.?strateg|publish.{0,20}frequenc|word.?count\b|readabilit|internal.?link/i.test(c))
    return "content";
  if (/roadmap|long.?term|phase\s+\d|quarter|annual.?goal|strategic.?priorit|6.month|12.month/i.test(c))
    return "strategy";

  const valid = ["technical","quick-win","content","geo","competitive","insight","strategy","algorithm"];
  return requested && valid.includes(requested) ? requested : "insight";
}

export function scoreConfidence(content: string, source: string, base = 65): number {
  let s = base;
  if (/\d+[\.\,]?\d*\s*%/.test(content))                         s += 10;
  if (/https?:\/\/\S+/.test(content))                             s +=  8;
  if (content.length > 400)                                        s +=  5;
  if (content.length > 800)                                        s +=  5;
  if (/audit|crawl|pagespeed|gsc|search.?console/i.test(source))  s += 12;
  if (/manual|brain_chat/.test(source))                            s +=  5;
  if (hasActionableContent(content))                               s +=  5;
  if (content.split(/\s+/).length > 30)                            s +=  3;
  return Math.min(100, Math.max(0, s));
}

export function shouldAutoApprove(cardType: string, source: string, confidence: number): boolean {
  const autoTypes   = ["technical", "quick-win", "algorithm"];
  const autoSources = ["audit_streaming", "seo_agent_audit", "crawl_analysis", "algorithm_intel"];
  if (autoTypes.includes(cardType))   return true;
  if (autoSources.includes(source))   return true;
  if (confidence >= 85)               return true;
  return false;
}

export function classifyLearning(opts: {
  content: string;
  source: string;
  title?: string;
  requestedType?: string;
  projectId?: string | null;
}): LearningClass {
  const { content, source, requestedType } = opts;
  const trimmed = (content || "").trim();

  if (trimmed.length < 60)
    return { shouldSave: false, category: "insight", isSystemLevel: false, confidence: 0, autoApprove: false, rejectionReason: "Too short" };

  if (SYS_ERR_PAT.some(p => p.test(trimmed)))
    return { shouldSave: true, category: "system", isSystemLevel: true, confidence: 90, autoApprove: false };

  if (SYS_WARN_PAT.some(p => p.test(trimmed)))
    return { shouldSave: true, category: "system_warning", isSystemLevel: true, confidence: 88, autoApprove: false };

  if (REJECT_PAT.some(p => p.test(trimmed)))
    return { shouldSave: false, category: "insight", isSystemLevel: false, confidence: 0, autoApprove: false, rejectionReason: "Error or AI refusal" };

  if (BOILERPLATE_PAT.some(p => p.test(trimmed)) && trimmed.length < 250)
    return { shouldSave: false, category: "insight", isSystemLevel: false, confidence: 0, autoApprove: false, rejectionReason: "Generic opener, no insight" };

  if (!hasActionableContent(trimmed) && trimmed.length < 180)
    return { shouldSave: false, category: "insight", isSystemLevel: false, confidence: 0, autoApprove: false, rejectionReason: "No actionable content" };

  const category   = detectCategory(trimmed, source, requestedType);
  const confidence = scoreConfidence(trimmed, source);
  const approve    = shouldAutoApprove(category, source, confidence);

  return { shouldSave: true, category, isSystemLevel: false, confidence, autoApprove: approve };
}

/* Extract the most actionable sentences from a long AI output */
export function extractImprovement(text: string, maxChars = 400): string {
  const sentences = text
    .replace(/#{1,6}\s+/g, "")    // strip markdown headers
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")  // strip bold/italic
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 500);

  const actionable = sentences.filter(s =>
    ACTIONABLE_WORDS.some(w => s.toLowerCase().includes(w))
  );
  const pool = actionable.length ? actionable : sentences;

  let result = "";
  for (const s of pool) {
    if ((result + " " + s).length > maxChars) break;
    result += (result ? " " : "") + s;
  }
  return result.trim() || text.slice(0, maxChars);
}

/* Duplicate/contradiction check before insert */
export async function checkForConflicts(
  projectId: string | null, cardType: string, title: string, improvement: string | null
): Promise<{ isDuplicate: boolean; isContradiction: boolean; existingId: string | null }> {
  try {
    const { data: existing } = await db()
      .from("brain_learnings")
      .select("id, card_title, improvement, status")
      .eq("card_type", cardType)
      .in("status", ["active", "pending_review"])
      .limit(20);

    if (!existing?.length) return { isDuplicate: false, isContradiction: false, existingId: null };

    const titleLower   = title.toLowerCase();
    const improveLower = (improvement || "").toLowerCase();

    for (const l of existing as any[]) {
      const lTitle   = (l.card_title   || "").toLowerCase();
      const lImprove = (l.improvement  || "").toLowerCase();

      const titleWords = titleLower.split(/\W+/).filter(Boolean);
      const lWords     = lTitle.split(/\W+/).filter(Boolean);
      const overlap    = titleWords.filter(w => lWords.includes(w)).length;
      if (titleWords.length > 0 && overlap / titleWords.length > 0.7)
        return { isDuplicate: true, isContradiction: false, existingId: l.id };

      const pairs = [
        ["increase","decrease"],["add","remove"],["enable","disable"],
        ["fast","slow"],["more","less"],["do not","should"],
      ];
      for (const [a, b] of pairs) {
        if ((improveLower.includes(a) && lImprove.includes(b)) ||
            (improveLower.includes(b) && lImprove.includes(a)))
          return { isDuplicate: false, isContradiction: true, existingId: l.id };
      }
    }
    return { isDuplicate: false, isContradiction: false, existingId: null };
  } catch (_e) {
    return { isDuplicate: false, isContradiction: false, existingId: null };
  }
}
