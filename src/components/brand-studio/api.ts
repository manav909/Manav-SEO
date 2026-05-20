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

/* ═══════════════════════════════════════════════════════════
   H.1 — Ingest V2
═══════════════════════════════════════════════════════════ */

export interface DocTypeOption {
  key:               string;
  label:             string;
  description:       string;
  target_categories: string[];
  stakeholder_hint:  string;
}

export interface DocTypeDetection {
  detected:   string;
  confidence: 'high' | 'medium' | 'low';
  reason:     string;
}

export interface FieldExtractionDetail {
  category:         string;
  field_key:        string;
  value:            string;
  confidence:       'high' | 'medium' | 'low';
  evidence:         string;
  source_location?: string;
  action?:          'written' | 'skipped_existing' | 'failed';
  existing_source?: string;
  error?:           string;
}

export interface IngestResult {
  document_id?:    string;
  document?:       BrandStudioDocument;
  detection?:      DocTypeDetection;
  parsed_text_preview?: string;
  pdf_in_memory?:  boolean;          // signal — extract step needs base64
  error?:          string;
}

export interface ExtractResult {
  summary?:         string;
  data_quality?:    'high' | 'medium' | 'low';
  fields_extracted?: number;
  fields_written?:   number;
  fields_skipped?:   number;
  key_findings?:    string[];
  open_questions?:  string[];
  write_details?:   FieldExtractionDetail[];
  error?:           string;
}

export interface FieldProvenance {
  document_id:     string;
  document_name?:  string;
  doc_type?:       string;
  stakeholder?:    string;
  extracted_value: string;
  extracted_at:    string;
  source_location?: string;
}

export async function getDocTypes(): Promise<{ doc_types: DocTypeOption[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_doc_types' });
  if (!r?.success) return { doc_types: [], error: r?.error };
  return { doc_types: Array.isArray(r.doc_types) ? r.doc_types : [] };
}

export async function detectDocType(opts: { filename: string; contentSample?: string }): Promise<DocTypeDetection | null> {
  const r = await post(ENGINE, { action: 'bs_detect_doc_type', filename: opts.filename, contentSample: opts.contentSample || '' });
  if (!r?.success) return null;
  return { detected: r.detected, confidence: r.confidence, reason: r.reason };
}

export async function ingestFile(opts: {
  projectId: string;
  fileName:  string;
  base64?:   string;
  text?:     string;
  mimeType:  string;
  stakeholderRole: string;
  providedBy?:     string;
  audienceRole?:   string;
}): Promise<IngestResult> {
  const r = await post(ENGINE, { action: 'bs_ingest_file', ...opts });
  if (!r?.success) return { error: r?.error || 'Ingest failed.' };
  return {
    document_id: r.document_id, document: r.document, detection: r.detection,
    parsed_text_preview: r.parsed_text_preview, pdf_in_memory: r.pdf_in_memory,
  };
}

export async function ingestUrl(opts: {
  projectId: string;
  url:       string;
  stakeholderRole: string;
  providedBy?:     string;
  audienceRole?:   string;
}): Promise<IngestResult> {
  const r = await post(ENGINE, { action: 'bs_ingest_url', ...opts });
  if (!r?.success) return { error: r?.error || 'URL ingest failed.' };
  return {
    document_id: r.document_id, document: r.document, detection: r.detection,
    parsed_text_preview: r.parsed_text_preview,
  };
}

export async function ingestExtract(opts: {
  documentId:      string;
  docTypeOverride?: string;
  pdfBase64?:      string;
}): Promise<ExtractResult> {
  const r = await post(ENGINE, { action: 'bs_ingest_extract', ...opts });
  if (!r?.success) return { error: r?.error || 'Extraction failed.' };
  return {
    summary: r.summary, data_quality: r.data_quality,
    fields_extracted: r.fields_extracted, fields_written: r.fields_written, fields_skipped: r.fields_skipped,
    key_findings: r.key_findings, open_questions: r.open_questions, write_details: r.write_details,
  };
}

export async function getDocumentDetail(documentId: string): Promise<{
  document?: BrandStudioDocument; provenance?: any[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_document', documentId });
  if (!r?.success) return { error: r?.error || 'Failed to load document.' };
  return { document: r.document, provenance: r.provenance || [] };
}

export async function deleteDocument(documentId: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_delete_document', documentId });
  if (!r?.success) return { success: false, error: r?.error || 'Delete failed.' };
  return { success: true };
}

export async function getFieldProvenance(opts: {
  projectId: string; category: string; fieldKey: string;
}): Promise<{ sources: FieldProvenance[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_field_provenance', ...opts });
  if (!r?.success) return { sources: [], error: r?.error };
  return { sources: Array.isArray(r.sources) ? r.sources : [] };
}

/* ═══════════════════════════════════════════════════════════
   H.1.5 — Client portal
═══════════════════════════════════════════════════════════ */

export interface ClientPortalToken {
  id:               string;
  label?:           string;
  client_id?:       string;
  created_at:       string;
  created_by?:      string;
  expires_at?:      string;
  revoked:          boolean;
  revoked_at?:      string;
  revoked_reason?:  string;
  last_accessed_at?: string;
  access_count:     number;
  token?:           string;       // only returned on creation
}

export interface ClientPortalContext {
  project: { id: string; name: string; url?: string };
  client?: { name?: string; company?: string };
  tier:    string;
  client_visible_features: Record<string, boolean>;
  brand_assets: BrandAssets | null;
}

/* ── PM-side: token management ── */

export async function createClientToken(opts: {
  projectId: string;
  clientId?: string;
  label?:    string;
  expiresInDays?: number;
  createdBy?: string;
}): Promise<{ token?: ClientPortalToken; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_create_client_token', ...opts });
  if (!r?.success) return { error: r?.error || 'Token creation failed.' };
  return { token: r.token };
}

export async function listClientTokens(projectId: string): Promise<{
  tokens: ClientPortalToken[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_client_tokens', projectId });
  if (!r?.success) return { tokens: [], error: r?.error };
  return { tokens: Array.isArray(r.tokens) ? r.tokens : [] };
}

export async function getTokenById(tokenId: string): Promise<{ token?: string; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_token_by_id', tokenId });
  if (!r?.success) return { error: r?.error || 'Token not found.' };
  return { token: r.token };
}

export async function revokeClientToken(opts: { tokenId: string; reason?: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_revoke_client_token', ...opts });
  if (!r?.success) return { success: false, error: r?.error || 'Revoke failed.' };
  return { success: true };
}

/* ── PM-side: publishing ── */

export async function publishDocument(opts: {
  documentId: string; publish: boolean;
}): Promise<{ success: boolean; published?: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_publish_document', ...opts });
  if (!r?.success) return { success: false, error: r?.error || 'Publish failed.' };
  return { success: true, published: r.published };
}

export async function publishDocumentsBulk(opts: {
  documentIds: string[]; publish: boolean;
}): Promise<{ success: boolean; count?: number; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_publish_bulk', ...opts });
  if (!r?.success) return { success: false, error: r?.error || 'Bulk publish failed.' };
  return { success: true, count: r.count };
}

/* ── PM-side: update entitlements convenience ── */

export async function setClientPortalEnabled(opts: {
  projectId: string; enabled: boolean;
}): Promise<{ success: boolean; error?: string }> {
  /* Reuse the existing entitlement update endpoint */
  const r = await post(ENGINE, {
    action: 'bs_update_entitlements',
    projectId: opts.projectId,
    clientPortalEnabled: opts.enabled,
  });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

/* ── Client-side: token-gated calls ── */

export async function clientResolve(token: string): Promise<{
  context?: ClientPortalContext; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_resolve', token });
  if (!r?.success) return { error: r?.error || 'Invalid or expired access link' };
  return { context: r.context };
}

export async function clientListDocuments(token: string): Promise<{
  documents: BrandStudioDocument[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_list_documents', token });
  if (!r?.success) return { documents: [], error: r?.error };
  return { documents: Array.isArray(r.documents) ? r.documents : [] };
}

export async function clientGetDocument(opts: { token: string; documentId: string }): Promise<{
  document?: BrandStudioDocument & { raw_content?: string }; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_get_document', ...opts });
  if (!r?.success) return { error: r?.error };
  return { document: r.document };
}
