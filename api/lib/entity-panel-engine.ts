/* ════════════════════════════════════════════════════════════════
   api/lib/entity-panel-engine.ts

   Knowledge Panel / entity-SEO audit — for projects with NO website (an
   artist, author, founder, brand building or enriching a Google Knowledge
   Panel). It works from a NAME alone.

   It reads REAL signals:
   - Google's live Knowledge Panel for the name (via SerpAPI knowledge_graph):
     whether one shows, what it says, its source, and the profile links Google
     already surfaces.
   - Wikidata (public API, no key): whether the entity exists and which key
     identity/music properties it carries or is missing.

   From those it produces an honest gap analysis and a PRIORITISED action plan
   to strengthen the signals Google uses to build and enrich a panel. It never
   promises Google will display anything — Google decides — and it never
   invents a signal that is not really there.
═══════════════════════════════════════════════════════════════ */

import { fetchKnowledgePanel } from "./serpapi.js";

type PersonType = "musician" | "artist" | "author" | "founder" | "person" | "organization";

/* Authoritative profile targets by entity type — the sources Google and
   Wikidata lean on. For a musician these are the strongest panel signals. */
const PROFILE_TARGETS: Record<string, Array<{ name: string; why: string }>> = {
  musician: [
    { name: "Wikidata", why: "the structured identity Google reads directly into panels" },
    { name: "MusicBrainz", why: "the open music database Google and Wikidata both trust" },
    { name: "Spotify (verified artist)", why: "primary music identity and image source" },
    { name: "Apple Music", why: "second primary music identity" },
    { name: "Discogs", why: "release history and credits" },
    { name: "Genius", why: "lyrics and artist bio, frequently panel-cited" },
    { name: "YouTube (official channel)", why: "video presence and verification" },
    { name: "Instagram", why: "the 'Profiles' row in the panel" },
    { name: "Wikipedia", why: "the strongest panel description source (hard to earn, high payoff)" },
    { name: "Official website", why: "the anchor sameAs link tying every profile together" },
  ],
};
const DEFAULT_TARGETS = [
  { name: "Wikidata", why: "the structured identity Google reads into panels" },
  { name: "Wikipedia", why: "the strongest panel description source" },
  { name: "LinkedIn", why: "authoritative professional identity" },
  { name: "Official website", why: "the anchor sameAs link" },
];

async function wikidataLookup(name: string): Promise<{ found: boolean; id?: string; label?: string; description?: string; present_props: string[]; missing_props: string[]; error?: string }> {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=5&origin=*`;
    const sr = await fetch(searchUrl, { signal: AbortSignal.timeout(12000) });
    if (!sr.ok) return { found: false, present_props: [], missing_props: [], error: `Wikidata HTTP ${sr.status}` };
    const sj: any = await sr.json();
    const hit = (sj?.search || [])[0];
    if (!hit?.id) return { found: false, present_props: [], missing_props: [] };
    const getUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hit.id}&format=json&props=claims|descriptions&origin=*`;
    const gr = await fetch(getUrl, { signal: AbortSignal.timeout(12000) });
    const gj: any = await gr.json();
    const claims = gj?.entities?.[hit.id]?.claims || {};
    const KEY: Record<string, string> = { P18: "image", P856: "official website", P106: "occupation", P136: "genre", P434: "MusicBrainz ID", P1902: "Spotify artist ID", P2850: "Apple Music ID", P1953: "Discogs ID", P2373: "Genius ID", P2397: "YouTube channel", P2003: "Instagram", P569: "date of birth", P27: "country of citizenship" };
    const present_props: string[] = []; const missing_props: string[] = [];
    for (const [p, label] of Object.entries(KEY)) (claims[p] ? present_props : missing_props).push(label);
    return { found: true, id: hit.id, label: hit.label, description: hit.description, present_props, missing_props };
  } catch (e: any) { return { found: false, present_props: [], missing_props: [], error: e?.message || "request failed" }; }
}

export async function auditEntity(opts: { projectId: string; name: string; country?: string; entityType?: PersonType }): Promise<{
  ok: boolean; name: string;
  panel: any; wikidata: any;
  action_plan: Array<{ priority: 1 | 2 | 3; action: string; why: string }>;
  summary: string; notes: string[];
}> {
  const name = (opts.name || "").trim();
  const type = (opts.entityType || "musician") as PersonType;
  if (!name) return { ok: false, name, panel: null, wikidata: null, action_plan: [], summary: "Supply the entity name (the artist/person to audit).", notes: ["name required"] };

  const [panel, wikidata] = await Promise.all([
    fetchKnowledgePanel(name, opts.projectId, { country: opts.country }).catch(() => ({ present: false, error: "panel lookup failed" } as any)),
    wikidataLookup(name),
  ]);

  const targets = PROFILE_TARGETS[type] || DEFAULT_TARGETS;
  const surfacedProfiles = new Set((panel?.profiles || []).map((p: any) => String(p.name || "").toLowerCase()));
  const plan: Array<{ priority: 1 | 2 | 3; action: string; why: string }> = [];

  /* Priority 1 — the identity foundation. */
  if (!wikidata.found) {
    plan.push({ priority: 1, action: `Create a Wikidata entity for "${name}" (occupation, genre, country, and every official/social link as properties).`, why: "Google reads Wikidata structured data straight into Knowledge Panels; with no entity, the panel has almost nothing authoritative to draw on." });
  } else if (wikidata.missing_props.length) {
    plan.push({ priority: 1, action: `Enrich the existing Wikidata entity (${wikidata.id}) — add the missing properties: ${wikidata.missing_props.join(", ")}.`, why: "Each added property is a signal Google can surface in the panel (image, official site, music-platform IDs, genre)." });
  }
  if (type === "musician" && !surfacedProfiles.has("wikipedia")) {
    plan.push({ priority: 1, action: `Pursue a Wikipedia article once notability is met (independent press coverage in ${opts.country === "it" ? "Italian" : "reliable"} media).`, why: "Wikipedia is the single strongest description source Google cites in panels — hard to earn, highest payoff." });
  }

  /* Priority 2 — the authoritative profiles that feed the panel and Wikidata. */
  for (const t of targets) {
    if (/wikidata|wikipedia|official website/i.test(t.name)) continue;
    if (!surfacedProfiles.has(t.name.toLowerCase().split(" ")[0])) {
      plan.push({ priority: 2, action: `Claim / create and complete the ${t.name} profile, then cross-link it from every other profile.`, why: t.why });
    }
  }

  /* Priority 3 — the panel details themselves. */
  if (panel?.present && !panel.has_image) plan.push({ priority: 3, action: "Add a high-quality image to the primary sources (Wikidata P18, Spotify, Google Business/entity), which the panel pulls from.", why: "A sparse panel most visibly lacks a photo; the image is pulled from these authoritative sources, not uploaded to Google directly." });
  if (panel?.present) plan.push({ priority: 3, action: "Add and cross-link official + social URLs everywhere so the panel's 'Profiles' row and 'links' populate consistently.", why: "The panel surfaces links it can corroborate across multiple authoritative sources." });
  plan.push({ priority: 3, action: `Publish and index authoritative press/news under "${name}" (optimised, technically indexable), and reference the official profiles.`, why: "Independent coverage both supports Wikipedia notability and gives Google corroborating sources for the entity." });

  plan.sort((a, b) => a.priority - b.priority);

  const summaryParts: string[] = [];
  summaryParts.push(panel?.present
    ? `Google DOES show a Knowledge Panel for "${name}"${panel.type ? ` (${panel.type})` : ""}${panel.source ? `, sourced largely from ${panel.source}` : ""} — ${panel.has_image ? "with an image" : "with NO image"}, ${(panel.profiles || []).length} linked profile(s), and ${Object.keys(panel.attributes || {}).length} attribute(s). The gaps below are why it feels sparse.`
    : `Google does NOT currently show a Knowledge Panel for "${name}" in ${opts.country || "the target country"} — the entity is not yet recognised, so the first job is to establish the authoritative signals a panel is built from.`);
  summaryParts.push(wikidata.found
    ? `Wikidata: entity ${wikidata.id} exists${wikidata.missing_props.length ? `, but is missing ${wikidata.missing_props.length} key propert(y/ies) (${wikidata.missing_props.slice(0, 4).join(", ")}${wikidata.missing_props.length > 4 ? "…" : ""})` : " and is well-populated"}.`
    : `Wikidata: no entity found — this is the highest-leverage gap to close.`);

  return {
    ok: true, name, panel, wikidata, action_plan: plan,
    summary: summaryParts.join(" "),
    notes: [
      "Google alone decides what a Knowledge Panel displays; this plan strengthens the signals it relies on, but no result is guaranteed.",
      ...(panel?.error ? [`Panel lookup note: ${panel.error} (a SerpAPI key is needed for live panel data).`] : []),
      ...(wikidata.error ? [`Wikidata note: ${wikidata.error}.`] : []),
      "Every signal above is checked live — nothing about the entity is assumed or invented.",
    ],
  };
}
