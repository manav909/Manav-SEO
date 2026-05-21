/* ════════════════════════════════════════════════════════════════
   api/lib/pm-action-templates.ts
   Phase 5 — Action library resolution-template overlay.

   Lives alongside pm-action-library.ts WITHOUT modifying it. Maps
   each action_id → the resolution items it needs from the 4 stores.

   When a card is pushed (or a store changes), the matcher uses this
   to compute which deps are RESOLVED (an item exists in the store
   in the right state) vs UNRESOLVED (a blocker — PM needs to add
   the item to the relevant store).

   Labels are the SOURCE OF TRUTH for matching. They must be:
     - Exact strings the matcher compares case-insensitively
     - Consistent across all actions that share a need
       (e.g., "CMS publishing access" is reused everywhere)
     - The same labels the PM will see in the Resolution Store panels

   To match: a card's template { store:"access", label:"X" } resolves
   if the project's access store has an item with label X AND status=held.
═══════════════════════════════════════════════════════════════ */

export type ResolutionStore = "access" | "content" | "info" | "approval";

export interface ResolutionTemplate {
  store:     ResolutionStore;
  label:     string;
  required:  boolean;   // false = "nice to have", doesn't block execution
  notes?:    string;    // why this is needed (shown in tooltips)
}

/* ─── Canonical labels (single source of truth) ─────────────── */
/* Reuse these constants across templates so spell-drift never
   silently breaks matching. */

const ACCESS = {
  CMS:           "CMS publishing access",
  DEV:           "Developer access (code repo, server)",
  GSC:           "Google Search Console access",
  GA4:           "Google Analytics 4 access",
  OUTREACH:      "Outreach platform access (Ahrefs, HARO, etc.)",
};

const CONTENT = {
  REFRESHED_COPY: "Refreshed copy approved by editor",
  NEW_COPY:       "New copy approved by editor",
  CTA_COPY:       "CTA copy and design",
  FAQ_QUESTIONS:  "FAQ questions curated and answered",
  PAA_ANSWERS:    "PAA questions answered",
  COMPARISON_BRIEF:"Comparison page brief",
  CLUSTER_BRIEFS: "Content briefs per cluster article",
  SERIES_BRIEFS:  "Content briefs per series piece",
  ANCHOR_PLAN:    "Internal link plan with anchor texts",
  ILLUSTRATIONS:  "Illustrations / graphics",
};

const INFO = {
  PSI_BASELINE:   "PageSpeed Insights baseline per affected page",
  PROSPECT_LIST:  "Target prospect list (DR 50+, topically relevant)",
  STRONGER_PAGE:  "Which page has stronger backlink profile",
  CHANNEL_AUDIENCE:"Existing audience size on chosen channel",
};

const APPROVAL = {
  TITLE_SIGNOFF:     "Client sign-off on new titles",
  META_SIGNOFF:      "Client sign-off on new meta descriptions",
  CONTENT_ANGLE:     "Client approval of content angle / messaging",
  CTA_MESSAGING:     "Client approval on CTA messaging",
  REDIRECT:          "Client approval for URL redirects / removal",
  BULK_TITLES:       "Client approval on bulk title changes",
  PAGE_REMOVAL:      "Client approval for page removal / redirect",
  BUDGET:            "Budget approval (if outreach is outsourced)",
  STRATEGY:          "Strategy approval for new channel",
  SERIES:            "Client approval of content angles (series)",
};

/* ─── Templates per action ──────────────────────────────────── */

export const ACTION_RESOLUTION_TEMPLATES: Record<string, ResolutionTemplate[]> = {
  optimize_title_tag: [
    { store: "access",   label: ACCESS.CMS,           required: true,  notes: "To publish the new title" },
    { store: "access",   label: ACCESS.GSC,           required: true,  notes: "To verify CTR change post-publish" },
    { store: "approval", label: APPROVAL.TITLE_SIGNOFF, required: true, notes: "Client should sign off on visible SERP titles" },
  ],

  rewrite_meta_description: [
    { store: "access",   label: ACCESS.CMS,            required: true },
    { store: "approval", label: APPROVAL.META_SIGNOFF, required: false, notes: "Optional — meta descriptions are less sensitive than titles" },
  ],

  add_faq_section: [
    { store: "access",  label: ACCESS.CMS,            required: true },
    { store: "content", label: CONTENT.FAQ_QUESTIONS, required: true },
  ],

  add_internal_links: [
    { store: "access",  label: ACCESS.CMS,         required: true },
    { store: "content", label: CONTENT.ANCHOR_PLAN, required: true, notes: "Pre-decide anchor text to avoid SEO mistakes" },
  ],

  refresh_content: [
    { store: "access",   label: ACCESS.CMS,            required: true },
    { store: "content",  label: CONTENT.REFRESHED_COPY, required: true },
    { store: "approval", label: APPROVAL.CONTENT_ANGLE, required: true, notes: "Especially when refresh substantially changes messaging" },
  ],

  consolidate_cannibalized_pages: [
    { store: "access",   label: ACCESS.CMS,           required: true },
    { store: "access",   label: ACCESS.DEV,           required: true, notes: "For 301 redirects" },
    { store: "approval", label: APPROVAL.REDIRECT,    required: true },
    { store: "info",     label: INFO.STRONGER_PAGE,   required: true, notes: "Pick the winner first to avoid wasted work" },
  ],

  improve_core_web_vitals: [
    { store: "access", label: ACCESS.DEV,          required: true },
    { store: "info",   label: INFO.PSI_BASELINE,   required: true, notes: "Without baseline we can't measure improvement" },
  ],

  fix_indexation_issues: [
    { store: "access", label: ACCESS.GSC, required: true },
    { store: "access", label: ACCESS.DEV, required: true, notes: "For robots.txt / canonical fixes" },
  ],

  add_xml_sitemap: [
    { store: "access", label: ACCESS.GSC, required: true },
    { store: "access", label: ACCESS.DEV, required: true },
  ],

  build_topic_cluster: [
    { store: "access",  label: ACCESS.CMS,             required: true },
    { store: "content", label: CONTENT.CLUSTER_BRIEFS, required: true },
    { store: "content", label: CONTENT.ILLUSTRATIONS,  required: false },
  ],

  create_comparison_page: [
    { store: "access",   label: ACCESS.CMS,             required: true },
    { store: "content",  label: CONTENT.COMPARISON_BRIEF, required: true },
    { store: "approval", label: APPROVAL.CONTENT_ANGLE,  required: true, notes: "Comparison pages compare you with competitors — client must sign off on positioning" },
  ],

  answer_paa_questions: [
    { store: "access",  label: ACCESS.CMS,          required: true },
    { store: "content", label: CONTENT.PAA_ANSWERS, required: true },
  ],

  build_quality_backlinks: [
    { store: "access",   label: ACCESS.OUTREACH,    required: true },
    { store: "info",     label: INFO.PROSPECT_LIST, required: true },
    { store: "approval", label: APPROVAL.BUDGET,    required: false, notes: "Required if outsourcing outreach" },
  ],

  reclaim_unlinked_mentions: [
    { store: "access", label: ACCESS.OUTREACH, required: true, notes: "Ahrefs / Mention / Google Alerts" },
  ],

  reduce_bounce_landing_pages: [
    { store: "access", label: ACCESS.CMS, required: true },
    { store: "access", label: ACCESS.GA4, required: true, notes: "To verify bounce-rate change" },
  ],

  add_clear_cta: [
    { store: "access",   label: ACCESS.CMS,           required: true },
    { store: "content",  label: CONTENT.CTA_COPY,     required: true },
    { store: "approval", label: APPROVAL.CTA_MESSAGING, required: true },
  ],

  launch_brand_content_series: [
    { store: "access",   label: ACCESS.CMS,           required: true },
    { store: "content",  label: CONTENT.SERIES_BRIEFS, required: true },
    { store: "approval", label: APPROVAL.SERIES,      required: true },
  ],

  diversify_traffic_channels: [
    { store: "info",     label: INFO.CHANNEL_AUDIENCE, required: true },
    { store: "approval", label: APPROVAL.STRATEGY,     required: true },
  ],

  target_rising_star_query: [
    { store: "access", label: ACCESS.CMS, required: true },
    { store: "access", label: ACCESS.GSC, required: true },
  ],

  recover_falling_query: [
    { store: "access",  label: ACCESS.CMS,            required: true },
    { store: "access",  label: ACCESS.GSC,            required: true },
    { store: "content", label: CONTENT.REFRESHED_COPY, required: false, notes: "Only if cause is content-related" },
  ],

  title_audit_bulk: [
    { store: "access",   label: ACCESS.CMS,         required: true },
    { store: "access",   label: ACCESS.GSC,         required: true },
    { store: "approval", label: APPROVAL.BULK_TITLES, required: true, notes: "Bulk changes have higher impact — get sign-off first" },
  ],

  prune_low_quality_pages: [
    { store: "access",   label: ACCESS.CMS,         required: true },
    { store: "access",   label: ACCESS.DEV,         required: true },
    { store: "approval", label: APPROVAL.PAGE_REMOVAL, required: true },
  ],
};

/* ─── Lookup helpers ──────────────────────────────────────── */

export function getTemplatesForAction(actionId: string): ResolutionTemplate[] {
  return ACTION_RESOLUTION_TEMPLATES[actionId] || [];
}

/** Unique store-item references across the entire action library — used
 *  by the Resolution Store panels to suggest "labels other actions need". */
export function getAllTemplateLabels(): Array<{ store: ResolutionStore; label: string; used_by_actions: string[] }> {
  const map = new Map<string, { store: ResolutionStore; label: string; used_by_actions: string[] }>();
  for (const [actionId, templates] of Object.entries(ACTION_RESOLUTION_TEMPLATES)) {
    for (const t of templates) {
      const key = `${t.store}::${t.label}`;
      if (!map.has(key)) {
        map.set(key, { store: t.store, label: t.label, used_by_actions: [] });
      }
      map.get(key)!.used_by_actions.push(actionId);
    }
  }
  return Array.from(map.values());
}
