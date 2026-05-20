/* ════════════════════════════════════════════════════════════════
   api/lib/pm-dataroom-seed.ts
   One-shot seed migration: populate V2 Data Room categories
   (identity / commercial / access / goal-narrative) from data that
   already exists elsewhere in the database.

   Strategic principles enforced in code:
   1. NEVER overwrite existing data. Every upsert checks whether the
      target field already has a non-empty value; if it does, skip.
   2. NEVER fabricate. Only seed from real, existing rows.
   3. Idempotent. Safe to run multiple times. Already-seeded fields
      are detected as "already filled" and skipped on subsequent runs.
   4. Auditable. Every seeded field carries source='seed_migration'
      and a notes string explaining its origin.

   Public action: pm_seed_v2_dataroom
     - projectId optional. If provided, seeds just that project.
     - If omitted, seeds every active project.
   Returns: per-project report of fields seeded vs skipped.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

interface SeedReport {
  project_id:    string;
  project_name?: string;
  client_name?:  string;
  fields_seeded: string[];
  fields_skipped_existing: string[];
  fields_skipped_no_source: string[];
}

/* ── industry mapping — normalise free-text to our select options ── */

const INDUSTRY_OPTIONS = [
  'SaaS', 'E-commerce', 'Professional Services', 'Healthcare', 'Finance/Fintech',
  'Education', 'Travel/Hospitality', 'Real Estate', 'Manufacturing', 'Marketplace',
  'Media/Publishing', 'Nonprofit', 'Retail', 'Legal', 'Other',
] as const;

function normaliseIndustry(raw: string): { mapped: string; specific: string } {
  if (!raw || !raw.trim()) return { mapped: '', specific: '' };
  const lower = raw.toLowerCase().trim();

  /* exact match against our options first */
  for (const opt of INDUSTRY_OPTIONS) {
    if (opt.toLowerCase() === lower) return { mapped: opt, specific: '' };
  }

  /* fuzzy mapping by keyword. Returns the mapped option plus the
     original text as the "specific" sub-field so detail is preserved. */
  const map: Array<[RegExp, typeof INDUSTRY_OPTIONS[number]]> = [
    [/\b(saas|software|platform|app)\b/, 'SaaS'],
    [/\b(e-?commerce|dtc|d2c|shop|store|retail.*online)\b/, 'E-commerce'],
    [/\b(consult|agency|service|professional)\b/, 'Professional Services'],
    [/\b(health|medical|pharma|clinic|wellness)\b/, 'Healthcare'],
    [/\b(finance|fintech|bank|invest|insurance|crypto)\b/, 'Finance/Fintech'],
    [/\b(educat|school|university|college|edtech|course)\b/, 'Education'],
    [/\b(travel|hotel|hospitality|tourism|booking)\b/, 'Travel/Hospitality'],
    [/\b(real ?estate|property|realty)\b/, 'Real Estate'],
    [/\b(manufactur|factory|industrial)\b/, 'Manufacturing'],
    [/\b(marketplace|platform.*vendor|two.?sided)\b/, 'Marketplace'],
    [/\b(media|publish|news|magazine|blog.*network)\b/, 'Media/Publishing'],
    [/\b(non.?profit|charity|ngo)\b/, 'Nonprofit'],
    [/\b(retail|store|shop)\b/, 'Retail'],
    [/\b(legal|law firm|solicitor|barrister|attorney)\b/, 'Legal'],
  ];
  for (const [re, opt] of map) {
    if (re.test(lower)) return { mapped: opt, specific: raw.trim() };
  }
  return { mapped: 'Other', specific: raw.trim() };
}

/* ── compose a goal narrative from primary_goal + success_metric ── */

function composeGoalNarrative(primary?: string, success?: string): string {
  const p = (primary || '').trim();
  const s = (success || '').trim();
  if (!p && !s) return '';
  if (!s)  return `Achieve ${p}.`;
  if (!p)  return `Success: ${s}.`;
  return `Achieve ${p} — measured by ${s}.`;
}

/* ── helper: upsert a Data Room field if and only if it's empty ── */

async function seedField(opts: {
  projectId: string; category: string; fieldKey: string;
  value: string; sourceName: string; notes: string;
  existingValues: Record<string, Record<string, string>>;
  report: SeedReport;
}): Promise<void> {
  const { projectId, category, fieldKey, value } = opts;

  /* skip if no value to seed */
  if (!value || !value.trim()) {
    opts.report.fields_skipped_no_source.push(`${category}.${fieldKey}`);
    return;
  }

  /* skip if the field already has a value — NEVER overwrite */
  const existing = opts.existingValues[category]?.[fieldKey];
  if (existing && existing.trim()) {
    opts.report.fields_skipped_existing.push(`${category}.${fieldKey}`);
    return;
  }

  /* upsert with source='seed_migration' for auditability */
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db().from('project_knowledge').upsert({
      project_id:  projectId,
      category,
      field_key:   fieldKey,
      field_value: value.trim(),
      source:      'seed_migration',
      source_name: opts.sourceName,
      data_date:   today,
      notes:       opts.notes,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'project_id,category,field_key' });
    opts.report.fields_seeded.push(`${category}.${fieldKey}`);
  } catch (e: any) {
    /* non-fatal — just don't claim we seeded it */
    console.error('[seed] upsert failed:', category, fieldKey, e?.message);
  }
}

/* ── seed one project ─────────────────────────────────────── */

async function seedOneProject(projectId: string): Promise<SeedReport> {
  const report: SeedReport = {
    project_id: projectId,
    fields_seeded: [],
    fields_skipped_existing: [],
    fields_skipped_no_source: [],
  };

  try {
    /* fetch the project, its client, and all current project_knowledge rows */
    const [{ data: project }, { data: knowledge }, { data: integrations }] = await Promise.all([
      db().from('projects').select('id,name,url,client_id,keywords').eq('id', projectId).maybeSingle(),
      db().from('project_knowledge').select('category,field_key,field_value')
        .eq('project_id', projectId),
      db().from('project_integrations').select('provider,resource_id,last_pull_at')
        .eq('project_id', projectId),
    ]);

    if (!project) {
      report.fields_skipped_no_source.push('project not found');
      return report;
    }
    const p = project as any;
    report.project_name = p.name;

    /* fetch the client row if linked */
    let client: any = null;
    if (p.client_id) {
      const { data: c } = await db().from('clients')
        .select('name,company,industry,website,email').eq('id', p.client_id).maybeSingle();
      client = c;
      report.client_name = (c as any)?.name;
    }

    /* index existing knowledge by category -> field_key */
    const existingValues: Record<string, Record<string, string>> = {};
    for (const k of (knowledge || [])) {
      const r = k as any;
      (existingValues[r.category] ||= {})[r.field_key] = r.field_value || '';
    }

    /* ── SEED 1: identity.client_name ──
       From clients.name. If no client linked, fall back to the project
       name itself (better than empty). */
    await seedField({
      projectId, category: 'identity', fieldKey: 'client_name',
      value: client?.name || p.name,
      sourceName: client ? `clients.${p.client_id}` : `projects.${projectId}`,
      notes: client ? 'Seeded from clients table during V2 migration.' : 'Seeded from projects.name (no client record linked).',
      existingValues, report,
    });

    /* ── SEED 2: identity.legal_entity ──
       From clients.company, only if different from clients.name. */
    if (client?.company && client.name && client.company.trim().toLowerCase() !== client.name.trim().toLowerCase()) {
      await seedField({
        projectId, category: 'identity', fieldKey: 'legal_entity',
        value: client.company,
        sourceName: `clients.${p.client_id}`,
        notes: 'Seeded from clients.company during V2 migration.',
        existingValues, report,
      });
    }

    /* ── SEED 3: identity.industry + identity.industry_specific ──
       From clients.industry — mapped to our select options. The raw
       value goes into industry_specific to preserve detail. */
    if (client?.industry) {
      const { mapped, specific } = normaliseIndustry(client.industry);
      if (mapped) {
        await seedField({
          projectId, category: 'identity', fieldKey: 'industry',
          value: mapped,
          sourceName: `clients.${p.client_id}.industry`,
          notes: `Seeded from clients.industry "${client.industry}" mapped to closest option.`,
          existingValues, report,
        });
      }
      if (specific) {
        await seedField({
          projectId, category: 'identity', fieldKey: 'industry_specific',
          value: specific,
          sourceName: `clients.${p.client_id}.industry`,
          notes: 'Original industry description preserved here for detail.',
          existingValues, report,
        });
      }
    }

    /* ── SEED 4: goal.primary_goal_narrative ──
       Composed from existing goal.primary_goal + goal.success_metric. */
    const primaryGoal   = existingValues.goal?.primary_goal;
    const successMetric = existingValues.goal?.success_metric;
    const composed = composeGoalNarrative(primaryGoal, successMetric);
    if (composed) {
      await seedField({
        projectId, category: 'goal', fieldKey: 'primary_goal_narrative',
        value: composed,
        sourceName: 'goal.primary_goal + goal.success_metric',
        notes: 'Composed from existing primary_goal and success_metric. Refine for richer phrasing if needed.',
        existingValues, report,
      });
    }

    /* ── SEED 5: access.gsc_access ──
       If a project_integrations row exists for GSC with a chosen
       property, the project is connected via OAuth — reflect this. */
    const gsc = (integrations || []).find((i: any) => i.provider === 'gsc') as any;
    if (gsc?.resource_id) {
      await seedField({
        projectId, category: 'access', fieldKey: 'gsc_access',
        value: 'Connected via OAuth',
        sourceName: 'project_integrations.gsc',
        notes: 'OAuth connection live — auto-detected during V2 migration.',
        existingValues, report,
      });
    }

    /* ── SEED 6: access.ga4_access ── */
    const ga4 = (integrations || []).find((i: any) => i.provider === 'ga4') as any;
    if (ga4?.resource_id) {
      await seedField({
        projectId, category: 'access', fieldKey: 'ga4_access',
        value: 'Connected via OAuth',
        sourceName: 'project_integrations.ga4',
        notes: 'OAuth connection live — auto-detected during V2 migration.',
        existingValues, report,
      });
    }

    return report;
  } catch (e: any) {
    report.fields_skipped_no_source.push(`error: ${e?.message || 'seed failed'}`);
    return report;
  }
}

/* ── seed all projects or a single one ────────────────────── */

export async function seedV2DataRoom(opts: {
  projectId?: string;
}): Promise<{
  success: boolean; error?: string;
  reports?: SeedReport[];
  totals?: {
    projects:                 number;
    fields_seeded_total:      number;
    fields_skipped_existing:  number;
    fields_skipped_no_source: number;
  };
}> {
  try {
    let projectIds: string[] = [];
    if (opts.projectId) {
      projectIds = [opts.projectId];
    } else {
      const { data: projects } = await db().from('projects')
        .select('id').neq('status', 'archived');
      projectIds = (projects || []).map((p: any) => p.id);
    }

    if (!projectIds.length) {
      return { success: true, reports: [], totals: { projects: 0, fields_seeded_total: 0, fields_skipped_existing: 0, fields_skipped_no_source: 0 } };
    }

    /* run sequentially to avoid contention on project_knowledge upserts */
    const reports: SeedReport[] = [];
    for (const pid of projectIds) {
      reports.push(await seedOneProject(pid));
    }

    const totals = {
      projects: reports.length,
      fields_seeded_total:      reports.reduce((s, r) => s + r.fields_seeded.length, 0),
      fields_skipped_existing:  reports.reduce((s, r) => s + r.fields_skipped_existing.length, 0),
      fields_skipped_no_source: reports.reduce((s, r) => s + r.fields_skipped_no_source.length, 0),
    };

    return { success: true, reports, totals };
  } catch (e: any) {
    return { success: false, error: e?.message || 'seed failed' };
  }
}

/* ── dispatch ─────────────────────────────────────────────── */

export async function handlePmSeed(action: string, body: any): Promise<any | null> {
  switch (action) {
    case 'pm_seed_v2_dataroom': return seedV2DataRoom({ projectId: body.projectId });
    default: return null;
  }
}
