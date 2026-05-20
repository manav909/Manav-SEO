/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/api.ts
   Brand Studio — typed API client.

   All Brand Studio backend calls go through here. The component layer
   never touches fetch() directly. All calls fail soft — on error they
   resolve to a safe empty shape so the UI never crashes.
═══════════════════════════════════════════════════════════════ */

import type {
  EntitlementResolution, BrandAssets, BrandStudioDocument,
  BrandStudioCatalogs,
} from './types';

const ENGINE = '/api/task-engine';

async function post(url: string, body: any): Promise<any> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let errMsg = text.slice(0, 200);
      try { const j = JSON.parse(text); errMsg = j.error || j.message || errMsg; } catch {}
      return { success: false, error: errMsg };
    }
    try { return JSON.parse(text); } catch { return { success: false, error: 'Invalid JSON response' }; }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

/* ── entitlements ─────────────────────────────────────────── */

export async function getEntitlements(projectId: string): Promise<{
  entitlements?: EntitlementResolution; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_entitlements', projectId });
  if (!r?.success) return { error: r?.error || 'Failed to load entitlements.' };
  return { entitlements: r.entitlements };
}

export async function updateEntitlements(opts: {
  projectId: string;
  tier?: string;
  customFeatures?: Record<string, boolean>;
  clientVisibleFeatures?: Record<string, boolean>;
  clientPortalEnabled?: boolean;
  planNotes?: string;
}): Promise<{ entitlements?: EntitlementResolution; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_update_entitlements', ...opts });
  if (!r?.success) return { error: r?.error || 'Failed to update entitlements.' };
  return { entitlements: r.entitlements };
}

/* ── brand assets ─────────────────────────────────────────── */

export async function getBrandAssets(projectId: string): Promise<{
  assets?: BrandAssets; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_brand_assets', projectId });
  if (!r?.success) return { error: r?.error || 'Failed to load brand assets.' };
  return { assets: r.assets };
}

export async function updateBrandAssets(opts: {
  projectId: string;
  patch: Partial<BrandAssets>;
}): Promise<{ assets?: BrandAssets; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_update_brand_assets', projectId: opts.projectId, patch: opts.patch });
  if (!r?.success) return { error: r?.error || 'Failed to update brand assets.' };
  return { assets: r.assets };
}

/* ── library ─────────────────────────────────────────────── */

export async function listDocuments(opts: {
  projectId: string;
  kind?: 'ingested' | 'generated';
  stakeholderRole?: string;
  audienceRole?: string;
  publishedOnly?: boolean;
  limit?: number;
}): Promise<{ documents: BrandStudioDocument[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_documents', ...opts });
  if (!r?.success) return { documents: [], error: r?.error || 'Failed to load documents.' };
  return { documents: Array.isArray(r.documents) ? r.documents : [] };
}

/* ── catalogs (stakeholder roles, audience roles, tier names) ── */

export async function getCatalogs(): Promise<{
  catalogs?: BrandStudioCatalogs; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_catalogs' });
  if (!r?.success) return { error: r?.error || 'Failed to load catalogs.' };
  return {
    catalogs: {
      stakeholder_roles: Array.isArray(r.stakeholder_roles) ? r.stakeholder_roles : [],
      audience_roles:    Array.isArray(r.audience_roles)    ? r.audience_roles    : [],
      tiers:             Array.isArray(r.tiers)             ? r.tiers             : [],
    },
  };
}
