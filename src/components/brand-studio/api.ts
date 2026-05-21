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

/* H.3 — client-side investor data (token-gated, verified-only) */
export async function clientGetInvestorData(token: string): Promise<{
  traction_proof_points: TractionProofPoint[];
  market_intelligence:   MarketIntelEntry[];
  error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_get_investor_data', token });
  if (!r?.success) return { traction_proof_points: [], market_intelligence: [], error: r?.error };
  return {
    traction_proof_points: Array.isArray(r.traction_proof_points) ? r.traction_proof_points : [],
    market_intelligence:   Array.isArray(r.market_intelligence)   ? r.market_intelligence   : [],
  };
}

/* ═══════════════════════════════════════════════════════════
   H.2 — Generation engine
═══════════════════════════════════════════════════════════ */

export type TemplateCategory = 'strategic' | 'performance' | 'competitive' | 'forward_looking';

export interface PublicSectionSpec {
  key:         string;
  title:       string;
  description: string;
}

export interface PublicTemplate {
  id:                    string;
  label:                 string;
  description:           string;
  category:              TemplateCategory;
  required_categories:   string[];
  optional_categories:   string[];
  useful_doc_types:      string[];
  default_audience_role: string;
  verification_strictness: 'standard' | 'investor_grade';
  section_count:         number;
  section_outline:       PublicSectionSpec[];
}

export interface ReadinessReport {
  ready:                  boolean;
  missing_categories:     string[];
  populated_categories:   string[];
  populated_field_count:  number;
  document_count:         number;
  warning?:               string;
}

export interface GeneratedSection {
  key:           string;
  title:         string;
  content:       string;
  confidence:    'high' | 'medium' | 'low';
  sources_cited: string[];
  flagged?:      'uncited_strict' | null;
}

export interface GenerationPreview {
  template_id:        string;
  template_label:     string;
  audience_role:      string;
  pm_vision:          string | null;
  overall_summary:    string;
  overall_confidence: 'high' | 'medium' | 'low';
  sections:           GeneratedSection[];
  open_questions:     string[];
  readiness:          ReadinessReport;
}

export async function getTemplates(): Promise<{ templates: PublicTemplate[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_templates' });
  if (!r?.success) return { templates: [], error: r?.error };
  return { templates: Array.isArray(r.templates) ? r.templates : [] };
}

export async function checkReadiness(opts: { projectId: string; templateId: string }): Promise<{
  readiness?: ReadinessReport; template_label?: string; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_check_readiness', ...opts });
  if (!r?.success) return { error: r?.error };
  return { readiness: r.readiness, template_label: r.template_label };
}

export async function generatePreview(opts: {
  projectId:        string;
  templateId:       string;
  audienceRole?:    string;
  pmVision?:        string;
  specificDocIds?:  string[];
}): Promise<{ preview?: GenerationPreview; readiness?: ReadinessReport; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_generate_preview', ...opts });
  if (!r?.success) return { error: r?.error || 'Generation failed', readiness: r?.readiness };
  return { preview: r.preview };
}

export async function generateApply(opts: {
  projectId:          string;
  templateId:         string;
  audienceRole:       string;
  pmVision?:          string;
  sections:           Array<{
    key: string; content: string; confidence: string; sources_cited: string[]; flagged?: string | null;
  }>;
  overallSummary:     string;
  overallConfidence:  string;
  openQuestions?:     string[];
  parentDocumentId?:  string;
}): Promise<{ documentId?: string; version?: number; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_generate_apply', ...opts });
  if (!r?.success) return { error: r?.error || 'Save failed' };
  return { documentId: r.document_id, version: r.version };
}

export async function listGenerated(projectId: string): Promise<{
  documents: BrandStudioDocument[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_generated', projectId });
  if (!r?.success) return { documents: [], error: r?.error };
  return { documents: Array.isArray(r.documents) ? r.documents : [] };
}

/* ═══════════════════════════════════════════════════════════
   H.3 — Investor View (traction, market intel, research)
═══════════════════════════════════════════════════════════ */

export interface TractionProofPoint {
  id?:             string;
  project_id?:     string;
  category:        string;
  claim:           string;
  metric_value?:   string | null;
  metric_period?:  string | null;
  evidence_date:   string;        // ISO date
  effective_from?: string | null;
  effective_to?:   string | null;
  evidence_type:   string;
  source?:         string | null;
  source_name?:    string | null;
  source_url?:     string | null;
  source_excerpt?: string | null;
  confidence:      'high' | 'medium' | 'low';
  status:          'draft' | 'verified' | 'archived';
  notes?:          string | null;
  created_at?:     string;
  updated_at?:     string;
}

export const TRACTION_CATEGORIES = [
  { key: 'revenue',         label: 'Revenue' },
  { key: 'customers',       label: 'Customers' },
  { key: 'retention',       label: 'Retention' },
  { key: 'engagement',      label: 'Engagement' },
  { key: 'organic_growth',  label: 'Organic Growth' },
  { key: 'awards',          label: 'Awards' },
  { key: 'partnerships',    label: 'Partnerships' },
  { key: 'team',            label: 'Team' },
  { key: 'product',         label: 'Product' },
  { key: 'other',           label: 'Other' },
];

export const TRACTION_EVIDENCE_TYPES = [
  { key: 'verified_third_party',  label: 'Verified — Third Party' },
  { key: 'verified_internal',     label: 'Verified — Internal System' },
  { key: 'self_reported',         label: 'Self-Reported' },
  { key: 'estimate',              label: 'Estimate' },
];

export async function listTraction(opts: { projectId: string; includeArchived?: boolean }): Promise<{
  proof_points: TractionProofPoint[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_traction', ...opts });
  if (!r?.success) return { proof_points: [], error: r?.error };
  return { proof_points: Array.isArray(r.proof_points) ? r.proof_points : [] };
}

export async function upsertTraction(opts: { projectId: string } & TractionProofPoint): Promise<{
  proof_point?: TractionProofPoint; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_upsert_traction', ...opts });
  if (!r?.success) return { error: r?.error };
  return { proof_point: r.proof_point };
}

export async function deleteTraction(opts: { id: string; projectId: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_delete_traction', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export interface MarketIntelEntry {
  id?:             string;
  project_id?:     string;
  category:        string;
  claim:           string;
  metric_value?:   string | null;
  source_url?:     string | null;
  source_name?:    string | null;
  source_date?:    string | null;
  source_excerpt?: string | null;
  source_type?:    string | null;
  methodology?:    string | null;
  assumptions?:    string | null;
  confidence:      'high' | 'medium' | 'low';
  status:          'draft' | 'verified' | 'archived';
  competitor_name?: string | null;
  notes?:          string | null;
  created_at?:     string;
  updated_at?:     string;
}

export const MARKET_INTEL_CATEGORIES = [
  { key: 'tam',                 label: 'TAM (Total Addressable Market)' },
  { key: 'sam',                 label: 'SAM (Serviceable Addressable Market)' },
  { key: 'som',                 label: 'SOM (Serviceable Obtainable Market)' },
  { key: 'growth_rate',         label: 'Growth Rate' },
  { key: 'market_share',        label: 'Market Share' },
  { key: 'competitor_funding',  label: 'Competitor — Funding' },
  { key: 'competitor_metric',   label: 'Competitor — Metric' },
  { key: 'industry_trend',      label: 'Industry Trend' },
  { key: 'regulatory',          label: 'Regulatory' },
  { key: 'other',               label: 'Other' },
];

export const MARKET_INTEL_SOURCE_TYPES = [
  { key: 'gov_statistics',    label: 'Government Statistics' },
  { key: 'industry_research', label: 'Industry Research Firm' },
  { key: 'company_filing',    label: 'Company Filing (SEC, etc.)' },
  { key: 'press_release',     label: 'Press Release' },
  { key: 'third_party_db',    label: 'Third-Party Database' },
  { key: 'analyst_report',    label: 'Analyst Report' },
  { key: 'other',             label: 'Other' },
];

export async function listMarketIntel(opts: { projectId: string; includeArchived?: boolean }): Promise<{
  market_intel: MarketIntelEntry[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_market_intel', ...opts });
  if (!r?.success) return { market_intel: [], error: r?.error };
  return { market_intel: Array.isArray(r.market_intel) ? r.market_intel : [] };
}

export async function upsertMarketIntel(opts: { projectId: string } & MarketIntelEntry): Promise<{
  market_intel?: MarketIntelEntry; notice?: string; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_upsert_market_intel', ...opts });
  if (!r?.success) return { error: r?.error };
  return { market_intel: r.market_intel, notice: r.notice };
}

export async function deleteMarketIntel(opts: { id: string; projectId: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_delete_market_intel', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export interface ResearchExcerpt {
  excerpt: string;
  offset:  number;
}

export interface ResearchResult {
  url:               string;
  domain:            string;
  trusted:           boolean;
  untrusted_reason?: string | null;
  title?:            string;
  excerpts?:         ResearchExcerpt[];
  word_count_extracted?: number;
  full_text_preview?: string;
  error?:            string;
  status?:           number;
}

export async function researchFetch(opts: {
  url: string; query: string; allowUntrusted?: boolean; untrustedReason?: string;
}): Promise<ResearchResult & { success: boolean }> {
  const r = await post(ENGINE, { action: 'bs_research_fetch', ...opts });
  return { success: !!r?.success, ...r };
}

export async function researchBulk(opts: {
  urls: string[]; query: string; allowUntrusted?: boolean;
}): Promise<{ results: ResearchResult[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_research_bulk', ...opts });
  if (!r?.success) return { results: [], error: r?.error };
  return { results: Array.isArray(r.results) ? r.results : [] };
}

/* ═══════════════════════════════════════════════════════════
   H.4 — Market & Monitoring
═══════════════════════════════════════════════════════════ */

export interface InternetMonitor {
  id?:                     string;
  project_id?:             string;
  monitor_type:            string;
  url:                     string;
  label:                   string;
  why:                     string;
  competitor_name?:        string | null;
  watch_focus?:            string | null;
  enabled:                 boolean;
  check_frequency_hours:   number;
  last_check_at?:          string | null;
  next_check_due_at?:      string | null;
  last_content_hash?:      string | null;
  last_content_excerpt?:   string | null;
  last_ai_summary?:        string | null;
  consecutive_errors?:     number;
  last_error?:             string | null;
  last_error_at?:          string | null;
  created_at?:             string;
  updated_at?:             string;
}

export const MONITOR_TYPES = [
  { key: 'competitor_page',       label: 'Competitor Page',       desc: 'A specific competitor URL — pricing, comparison, features, or landing page.' },
  { key: 'industry_publication',  label: 'Industry Publication',  desc: 'A blog index, news landing, or RSS feed page — watch for new posts.' },
  { key: 'regulatory_source',     label: 'Regulatory Source',     desc: 'A gov/regulator page where guidance or compliance text may change.' },
  { key: 'general_url',           label: 'General URL',           desc: 'Any other URL where meaningful change matters.' },
];

export const MONITOR_FREQUENCY_PRESETS = [
  { hours: 6,    label: '6 hours'   },
  { hours: 12,   label: '12 hours'  },
  { hours: 24,   label: '1 day'     },
  { hours: 72,   label: '3 days'    },
  { hours: 168,  label: '1 week'    },
  { hours: 720,  label: '30 days'   },
];

export interface MonitorObservation {
  id:                    string;
  monitor_id:            string;
  monitor_label?:        string;
  monitor_url?:          string;
  monitor_type?:         string;
  competitor_name?:      string | null;
  observed_at:           string;
  change_classification: 'no_change' | 'cosmetic' | 'meaningful' | 'new_item' | 'error';
  summary_of_change?:    string | null;
  ai_assessment?:        string | null;
  suggested_action?:     string | null;
  suggested_template_id?: string | null;
  status:                'open' | 'reviewed' | 'acted' | 'dismissed';
  acted_document_id?:    string | null;
}

export interface StaleDoc {
  document_id:        string;
  document_name?:     string;
  template_id?:       string;
  version?:           number;
  most_recent_stale:  string;
  reasons:            string[];
}

export async function listMonitors(projectId: string): Promise<{
  monitors: InternetMonitor[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_monitors', projectId });
  if (!r?.success) return { monitors: [], error: r?.error };
  return { monitors: Array.isArray(r.monitors) ? r.monitors : [] };
}

export async function upsertMonitor(opts: { projectId: string } & InternetMonitor): Promise<{
  monitor?: InternetMonitor; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_upsert_monitor', ...opts });
  if (!r?.success) return { error: r?.error };
  return { monitor: r.monitor };
}

export async function deleteMonitor(opts: { id: string; projectId: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_delete_monitor', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function checkMonitorNow(opts: { id: string; projectId: string }): Promise<{
  success:                boolean;
  classification?:        string;
  summary_of_change?:     string;
  ai_assessment?:         string;
  suggested_action?:      string | null;
  suggested_template_id?: string | null;
  error?:                 string;
}> {
  const r = await post(ENGINE, { action: 'bs_check_monitor_now', ...opts });
  return { success: !!r?.success, ...r };
}

export async function listObservations(opts: {
  projectId:                string;
  status?:                  string;
  includeClassifications?:  string[];
  limit?:                   number;
}): Promise<{ observations: MonitorObservation[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_observations', ...opts });
  if (!r?.success) return { observations: [], error: r?.error };
  return { observations: Array.isArray(r.observations) ? r.observations : [] };
}

export async function updateObservationStatus(opts: {
  id: string; projectId: string; status: string; actedDocumentId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_update_observation_status', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function listStaleDocs(projectId: string): Promise<{
  stale_docs: StaleDoc[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_stale_docs', projectId });
  if (!r?.success) return { stale_docs: [], error: r?.error };
  return { stale_docs: Array.isArray(r.stale_docs) ? r.stale_docs : [] };
}

export async function dismissStale(opts: { documentId: string; projectId: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_dismiss_stale', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════
   H.5 — Stakeholders + synthesis + diff + re-extract + deps
═══════════════════════════════════════════════════════════ */

export interface StakeholderProfile {
  id?:                       string;
  project_id?:               string;
  display_name:              string;
  role_title?:               string | null;
  stakeholder_role:          string;
  email?:                    string | null;
  org?:                      string | null;
  communication_preference?: string | null;
  decision_style?:           string | null;
  focus_areas?:              string | null;
  what_they_care_about?:     string | null;
  language_patterns?:        string | null;
  interaction_history?:      string | null;
  watch_outs?:               string | null;
  preferred_format?:         string | null;
  active:                    boolean;
  notes?:                    string | null;
  created_at?:               string;
  updated_at?:               string;
}

export async function listStakeholders(opts: { projectId: string; includeInactive?: boolean }): Promise<{
  stakeholders: StakeholderProfile[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_stakeholders', ...opts });
  if (!r?.success) return { stakeholders: [], error: r?.error };
  return { stakeholders: Array.isArray(r.stakeholders) ? r.stakeholders : [] };
}

export async function upsertStakeholder(opts: { projectId: string } & StakeholderProfile): Promise<{
  stakeholder?: StakeholderProfile; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_upsert_stakeholder', ...opts });
  if (!r?.success) return { error: r?.error };
  return { stakeholder: r.stakeholder };
}

export async function deleteStakeholder(opts: { id: string; projectId: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_delete_stakeholder', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export interface SynthesisCandidate {
  id:               string;
  name:             string;
  doc_type:         string;
  stakeholder_role: string | null;
  summary:          string | null;
  key_findings:     string[];
  created_at:       string;
  char_count:       number;
}

export interface SynthesisField {
  field_key:                 string;
  value:                     string;
  confidence:                'high' | 'medium' | 'low';
  evidence:                  string[];
  reasoning:                 string;
  existing_value?:           string | null;
  existing_source?:          string | null;
  would_overwrite_protected?: boolean;
}

export interface SynthesisContradiction {
  topic:          string;
  views:          string[];
  recommendation: string;
}

export interface SynthesisResult {
  overall_summary:     string;
  synthesized_fields:  SynthesisField[];
  contradictions:      SynthesisContradiction[];
  open_questions:      string[];
}

export async function listSynthesisCandidates(projectId: string): Promise<{
  candidates: SynthesisCandidate[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_synthesis_candidates', projectId });
  if (!r?.success) return { candidates: [], error: r?.error };
  return { candidates: Array.isArray(r.candidates) ? r.candidates : [] };
}

export async function synthesizePersona(opts: {
  projectId: string; documentIds: string[]; pmGuidance?: string;
}): Promise<{ synthesis?: SynthesisResult; source_doc_ids?: string[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_synthesize_persona', ...opts });
  if (!r?.success) return { error: r?.error };
  return { synthesis: r.synthesis, source_doc_ids: r.source_doc_ids };
}

export async function applySynthesis(opts: {
  projectId: string; approvedFields: SynthesisField[]; sourceDocIds: string[];
}): Promise<{ written?: number; skipped?: number; details?: any[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_apply_synthesis', ...opts });
  if (!r?.success) return { error: r?.error };
  return { written: r.written, skipped: r.skipped, details: r.details };
}

export async function reextractDocument(documentId: string): Promise<{
  success: boolean; summary?: string; fields_written?: number; fields_skipped?: number;
  fields_extracted?: number; key_findings?: string[]; open_questions?: string[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_reextract_document', documentId });
  return { success: !!r?.success, ...r };
}

export interface VersionDiffSection {
  key:                 string;
  title:               string;
  change_type:         'added' | 'removed' | 'modified' | 'unchanged';
  earlier_content:     string | null;
  later_content:       string | null;
  earlier_confidence:  string | null;
  later_confidence:    string | null;
  earlier_sources:     string[];
  later_sources:       string[];
}

export interface VersionDiff {
  earlier:        { id: string; name: string; version: number; created_at: string; overall_summary: string | null };
  later:          { id: string; name: string; version: number; created_at: string; overall_summary: string | null };
  template_id?:   string;
  sections:       VersionDiffSection[];
  changed_count:  number;
}

export async function getVersionDiff(documentId: string): Promise<{ diff?: VersionDiff; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_version_diff', documentId });
  if (!r?.success) return { error: r?.error };
  return { diff: r.diff };
}

export interface Dependency {
  id:                string;
  subscription_type: string;
  target_id?:        string | null;
  target_category?:  string | null;
  target_field_key?: string | null;
  target_label:      string;
  target_detail:     string | null;
  target_kind:       string;
  stale_since?:      string | null;
  stale_reason?:     string | null;
}

export async function getDocumentDependencies(opts: { documentId: string; projectId: string }): Promise<{
  dependencies: Dependency[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_document_dependencies', ...opts });
  if (!r?.success) return { dependencies: [], error: r?.error };
  return { dependencies: Array.isArray(r.dependencies) ? r.dependencies : [] };
}

export interface FieldDependent {
  document_id:    string;
  document_name?: string;
  template_id?:   string;
  version?:       number;
  stale_since?:   string | null;
  stale_reason?:  string | null;
}

export async function getFieldDependents(opts: {
  projectId: string; category: string; fieldKey: string;
}): Promise<{ dependents: FieldDependent[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_field_dependents', ...opts });
  if (!r?.success) return { dependents: [], error: r?.error };
  return { dependents: Array.isArray(r.dependents) ? r.dependents : [] };
}

/* ═══════════════════════════════════════════════════════════
   H.6a — Client collaboration: users, sharing, comments,
   approvals, intake, uploads, notifications, audit
═══════════════════════════════════════════════════════════ */

export interface ClientUser {
  id?:                 string;
  project_id?:         string;
  email:               string;
  display_name?:       string | null;
  role:                'client_executive' | 'client_marketing' | 'client_legal' | 'client_designer' | 'client_internal' | 'client_press_contact';
  title?:              string | null;
  org?:                string | null;
  invite_token?:       string;
  invite_used?:        boolean;
  invite_sent_at?:     string;
  invite_expires_at?:  string | null;
  session_token?:      string | null;
  active?:             boolean;
  last_seen_at?:       string | null;
  visit_count?:        number;
  notes?:              string | null;
  created_at?:         string;
}

export const CLIENT_ROLES = [
  { key: 'client_executive',    label: 'Executive',    desc: 'Sees everything in the workspace, can approve all docs' },
  { key: 'client_marketing',    label: 'Marketing',    desc: 'Sees brand + library + investor (if enabled), approves marketing-relevant docs' },
  { key: 'client_legal',        label: 'Legal',        desc: 'Sees legal/compliance docs, can flag/approve press releases + case studies' },
  { key: 'client_designer',     label: 'Designer',     desc: 'Sees brand assets, can upload logo variants and brand visual files' },
  { key: 'client_internal',     label: 'Internal',     desc: 'Read-only generalist, no approval rights by default' },
  { key: 'client_press_contact',label: 'Press Contact',desc: 'Sees press releases only, can flag for review' },
];

export async function inviteClientUser(opts: {
  projectId: string; email: string; role: string;
  title?: string; org?: string; invitedBy?: string; notes?: string;
}): Promise<{ client_user?: ClientUser; invite_token?: string; was_regenerated?: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_invite_client_user', ...opts });
  if (!r?.success) return { error: r?.error };
  return { client_user: r.client_user, invite_token: r.invite_token, was_regenerated: r.was_regenerated };
}

export async function listClientUsers(opts: { projectId: string; includeInactive?: boolean }): Promise<{
  client_users: ClientUser[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_client_users', ...opts });
  if (!r?.success) return { client_users: [], error: r?.error };
  return { client_users: Array.isArray(r.client_users) ? r.client_users : [] };
}

export async function updateClientUser(opts: {
  id: string; projectId: string; role?: string; title?: string; org?: string; active?: boolean; notes?: string;
}): Promise<{ client_user?: ClientUser; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_update_client_user', ...opts });
  if (!r?.success) return { error: r?.error };
  return { client_user: r.client_user };
}

export async function revokeClientUser(opts: { id: string; projectId: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_revoke_client_user', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function redeemInvite(opts: { inviteToken: string; displayName: string }): Promise<{
  session_token?: string;
  session_expires_at?: string;
  client_user?: ClientUser;
  error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_redeem_invite', ...opts });
  if (!r?.success) return { error: r?.error };
  return { session_token: r.session_token, session_expires_at: r.session_expires_at, client_user: r.client_user };
}

/* ─── Share grants ─── */

export interface ShareGrant {
  id:                  string;
  document_id:         string;
  project_id:          string;
  granted_to_user_id:  string;
  granted_to_label?:   string;
  granted_to_email?:   string;
  granted_to_role?:    string;
  granted_to_active?:  boolean;
  access_level:        'view' | 'comment' | 'approve';
  granted_by_type:     'staff' | 'client';
  granted_by_id:       string;
  granted_by_label:    string;
  granted_at:          string;
  revoked:             boolean;
  revoked_at?:         string | null;
  revoked_by_label?:   string | null;
  revoke_reason?:      string | null;
}

export async function listShareGrants(opts: { documentId: string; projectId: string; includeRevoked?: boolean }): Promise<{
  grants: ShareGrant[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_share_grants', ...opts });
  if (!r?.success) return { grants: [], error: r?.error };
  return { grants: Array.isArray(r.grants) ? r.grants : [] };
}

export async function createShareGrant(opts: {
  documentId: string; projectId: string;
  grantedToUserId: string; accessLevel: 'view' | 'comment' | 'approve';
  grantedByType: 'staff' | 'client'; grantedById: string; grantedByLabel: string;
}): Promise<{ grant?: ShareGrant; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_create_share_grant', ...opts });
  if (!r?.success) return { error: r?.error };
  return { grant: r.grant };
}

export async function revokeShareGrant(opts: {
  id: string; projectId: string;
  revokedByType: 'staff' | 'client'; revokedById: string; revokedByLabel: string; reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_revoke_share_grant', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

/* ─── Comments ─── */

export interface DocumentComment {
  id:                string;
  document_id:       string;
  section_key?:      string | null;
  parent_comment_id?: string | null;
  author_type:       'staff' | 'client';
  author_id:         string;
  author_label:      string;
  body:              string;
  mentions?:         Array<{ type: string; id: string; label: string }>;
  resolved:          boolean;
  resolved_by_label?: string | null;
  resolved_at?:      string | null;
  edited_at?:        string | null;
  deleted_at?:       string | null;
  created_at:        string;
  updated_at:        string;
}

export async function listComments(opts: {
  documentId: string; projectId: string; includeResolved?: boolean; includeDeleted?: boolean;
}): Promise<{ comments: DocumentComment[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_comments', ...opts });
  if (!r?.success) return { comments: [], error: r?.error };
  return { comments: Array.isArray(r.comments) ? r.comments : [] };
}

export async function postComment(opts: {
  documentId: string; projectId: string;
  sectionKey?: string | null; parentCommentId?: string | null;
  bodyText: string; authorType: 'staff' | 'client'; authorId: string; authorLabel: string;
}): Promise<{ comment?: DocumentComment; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_post_comment', ...opts });
  if (!r?.success) return { error: r?.error };
  return { comment: r.comment };
}

export async function resolveComment(opts: {
  id: string; projectId: string; undo?: boolean;
  resolvedByType?: string; resolvedById?: string; resolvedByLabel?: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_resolve_comment', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function deleteComment(opts: { id: string; projectId: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_delete_comment', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

/* ─── Approvals ─── */

export interface DocumentApproval {
  id:                   string;
  document_id:          string;
  project_id:           string;
  document_version:     number;
  requested_by_id:      string;
  requested_by_label:   string;
  requested_at:         string;
  request_message?:     string | null;
  requested_from_user_id?: string | null;
  state:                'in_review' | 'approved' | 'needs_changes' | 'cancelled';
  responded_by_user_id?: string | null;
  responded_by_label?:  string | null;
  responded_at?:        string | null;
  response_message?:    string | null;
  linked_comment_id?:   string | null;
}

export async function listApprovals(opts: {
  projectId: string; documentId?: string; openOnly?: boolean;
}): Promise<{ approvals: DocumentApproval[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_approvals', ...opts });
  if (!r?.success) return { approvals: [], error: r?.error };
  return { approvals: Array.isArray(r.approvals) ? r.approvals : [] };
}

export async function requestApproval(opts: {
  documentId: string; projectId: string;
  requestedById: string; requestedByLabel: string;
  requestMessage?: string; requestedFromUserId?: string;
}): Promise<{ approval?: DocumentApproval; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_request_approval', ...opts });
  if (!r?.success) return { error: r?.error };
  return { approval: r.approval };
}

export async function cancelApproval(opts: { id: string; projectId: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_cancel_approval', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function respondApproval(opts: {
  id: string; projectId: string;
  decision: 'approved' | 'needs_changes';
  responseMessage?: string;
  respondedByUserId: string; respondedByLabel: string;
  linkedCommentId?: string;
}): Promise<{ approval?: DocumentApproval; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_respond_approval', ...opts });
  if (!r?.success) return { error: r?.error };
  return { approval: r.approval };
}

/* ─── Intake forms ─── */

export interface IntakeQuestion {
  key:                string;
  question_text:      string;
  response_type:      'short_text' | 'long_text' | 'multi_choice' | 'single_choice' | 'number' | 'date';
  required?:          boolean;
  target_category?:   string | null;
  target_field_key?:  string | null;
  options?:           string[] | null;
  help_text?:         string | null;
}

export interface IntakeForm {
  id?:                 string;
  project_id?:         string;
  title:               string;
  description?:        string | null;
  status:              'draft' | 'open' | 'closed';
  questions:           IntakeQuestion[];
  visible_to_roles:    string[];
  created_by?:         string | null;
  created_at?:         string;
  updated_at?:         string;
}

export interface IntakeResponse {
  id:                  string;
  form_id:             string;
  project_id:          string;
  responding_user_id:  string;
  responses:           Record<string, any>;
  status:              'in_progress' | 'submitted' | 'pm_reviewed';
  submitted_at?:       string | null;
  pm_reviewed_at?:     string | null;
  pm_reviewed_by?:     string | null;
  pm_review_notes?:    string | null;
  pm_apply_results?:   any;
  created_at:          string;
}

export const RESPONSE_TYPES = [
  { key: 'short_text',     label: 'Short text' },
  { key: 'long_text',      label: 'Long text' },
  { key: 'single_choice',  label: 'Single choice' },
  { key: 'multi_choice',   label: 'Multiple choice' },
  { key: 'number',         label: 'Number' },
  { key: 'date',           label: 'Date' },
];

export async function listIntakeForms(opts: { projectId: string; status?: string }): Promise<{
  forms: IntakeForm[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_intake_forms', ...opts });
  if (!r?.success) return { forms: [], error: r?.error };
  return { forms: Array.isArray(r.forms) ? r.forms : [] };
}

export async function upsertIntakeForm(opts: { projectId: string } & IntakeForm & { id?: string }): Promise<{
  form?: IntakeForm; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_upsert_intake_form', ...opts, visibleToRoles: opts.visible_to_roles });
  if (!r?.success) return { error: r?.error };
  return { form: r.form };
}

export async function deleteIntakeForm(opts: { id: string; projectId: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_delete_intake_form', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function listIntakeResponses(opts: {
  projectId: string; formId?: string; status?: string; pendingReviewOnly?: boolean;
}): Promise<{ responses: IntakeResponse[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_intake_responses', ...opts });
  if (!r?.success) return { responses: [], error: r?.error };
  return { responses: Array.isArray(r.responses) ? r.responses : [] };
}

export async function reviewIntakeResponse(opts: {
  id: string; projectId: string;
  applyMap?: Record<string, { skip?: boolean }>;
  reviewedBy?: string; reviewNotes?: string;
}): Promise<{ written?: number; skipped?: number; results?: any[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_review_intake_response', ...opts });
  if (!r?.success) return { error: r?.error };
  return { written: r.written, skipped: r.skipped, results: r.results };
}

/* ─── Notifications ─── */

export interface ClientNotification {
  id:              string;
  project_id:      string;
  recipient_type:  'staff' | 'client';
  recipient_id:    string;
  kind:            string;
  title:           string;
  body?:           string | null;
  payload?:        any;
  read_at?:        string | null;
  acted_at?:       string | null;
  created_at:      string;
}

export async function listNotifications(opts: {
  recipientType: 'staff' | 'client'; recipientId: string;
  projectId?: string; unreadOnly?: boolean; limit?: number;
}): Promise<{ notifications: ClientNotification[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_notifications', ...opts });
  if (!r?.success) return { notifications: [], error: r?.error };
  return { notifications: Array.isArray(r.notifications) ? r.notifications : [] };
}

export async function markNotificationRead(opts: {
  id?: string; recipientType: 'staff' | 'client'; recipientId: string; all?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_mark_notification_read', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

/* ─── Audit ─── */

export interface AuditEvent {
  kind:         string;
  id:           string;
  document_id?: string;
  actor:        string;
  body:         string;
  at:           string;
}

export async function listAuditLog(opts: { projectId: string; limit?: number }): Promise<{
  events: AuditEvent[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_audit_log', ...opts });
  if (!r?.success) return { events: [], error: r?.error };
  return { events: Array.isArray(r.events) ? r.events : [] };
}

/* ═══════════════════════════════════════════════════════════
   H.6a — Client-side session-token API
═══════════════════════════════════════════════════════════ */

const CLIENT_SESSION_STORAGE_KEY = 'bs_client_session';

export interface ClientSessionContext {
  user: {
    id: string;
    display_name: string;
    email: string;
    role: string;
    title?: string | null;
    org?: string | null;
  };
  project: { id: string; name: string; url?: string };
  brand: any;
  visible_features: Record<string, boolean>;
}

export function getStoredClientSession(): { token: string; expires_at: string } | null {
  try {
    const raw = window.localStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    if (parsed.expires_at && new Date(parsed.expires_at) < new Date()) {
      window.localStorage.removeItem(CLIENT_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

export function storeClientSession(token: string, expires_at: string) {
  try { window.localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, JSON.stringify({ token, expires_at })); } catch {}
}

export function clearClientSession() {
  try { window.localStorage.removeItem(CLIENT_SESSION_STORAGE_KEY); } catch {}
}

export async function clientSessionResolve(sessionToken: string): Promise<{
  context?: ClientSessionContext; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_session_resolve', sessionToken });
  if (!r?.success) return { error: r?.error };
  return { context: { user: r.user, project: r.project, brand: r.brand, visible_features: r.visible_features } };
}

export async function clientSessionListDocuments(sessionToken: string): Promise<{
  documents: any[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_session_list_documents', sessionToken });
  if (!r?.success) return { documents: [], error: r?.error };
  return { documents: Array.isArray(r.documents) ? r.documents : [] };
}

export async function clientSessionPostComment(opts: {
  sessionToken: string; documentId: string;
  sectionKey?: string | null; parentCommentId?: string | null; bodyText: string;
}): Promise<{ comment?: DocumentComment; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_client_session_post_comment', ...opts });
  if (!r?.success) return { error: r?.error };
  return { comment: r.comment };
}

export async function clientSessionListComments(opts: { sessionToken: string; documentId: string }): Promise<{
  comments: DocumentComment[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_session_list_comments', ...opts });
  if (!r?.success) return { comments: [], error: r?.error };
  return { comments: Array.isArray(r.comments) ? r.comments : [] };
}

export async function clientSessionRespondApproval(opts: {
  sessionToken: string; id: string;
  decision: 'approved' | 'needs_changes';
  responseMessage?: string; linkedCommentId?: string;
}): Promise<{ approval?: DocumentApproval; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_client_session_respond_approval', ...opts });
  if (!r?.success) return { error: r?.error };
  return { approval: r.approval };
}

export async function clientSessionListApprovals(opts: { sessionToken: string; documentId?: string; openOnly?: boolean }): Promise<{
  approvals: DocumentApproval[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_session_list_approvals', ...opts });
  if (!r?.success) return { approvals: [], error: r?.error };
  return { approvals: Array.isArray(r.approvals) ? r.approvals : [] };
}

export async function clientSessionShareDoc(opts: {
  sessionToken: string; documentId: string;
  grantedToUserId: string; accessLevel: 'view' | 'comment' | 'approve';
}): Promise<{ grant?: ShareGrant; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_client_session_share_doc', ...opts });
  if (!r?.success) return { error: r?.error };
  return { grant: r.grant };
}

export async function clientSessionRevokeShare(opts: {
  sessionToken: string; id: string; reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_client_session_revoke_share', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function clientSessionListShareGrants(opts: { sessionToken: string; documentId: string }): Promise<{
  grants: ShareGrant[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_session_list_share_grants', ...opts });
  if (!r?.success) return { grants: [], error: r?.error };
  return { grants: Array.isArray(r.grants) ? r.grants : [] };
}

export async function clientSessionUploadFile(opts: {
  sessionToken: string; fileName: string;
  contentType?: string; contentBase64: string;
  docType?: string; sourceUrl?: string;
}): Promise<{ document_id?: string; requires_pm_review?: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_client_session_upload_file', ...opts });
  if (!r?.success) return { error: r?.error };
  return { document_id: r.document_id, requires_pm_review: r.requires_pm_review };
}

export async function clientSessionListIntakeForms(sessionToken: string): Promise<{
  forms: (IntakeForm & { response_status?: string | null; submitted_at?: string | null })[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_session_list_intake_forms', sessionToken });
  if (!r?.success) return { forms: [], error: r?.error };
  return { forms: Array.isArray(r.forms) ? r.forms : [] };
}

export async function clientSessionSubmitIntake(opts: {
  sessionToken: string; formId: string;
  responses: Record<string, any>; isFinalSubmit: boolean;
}): Promise<{ response?: IntakeResponse; status?: string; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_client_session_submit_intake', ...opts });
  if (!r?.success) return { error: r?.error };
  return { response: r.response, status: r.status };
}

export async function clientSessionListNotifications(opts: { sessionToken: string; unreadOnly?: boolean; limit?: number }): Promise<{
  notifications: ClientNotification[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_session_list_notifications', ...opts });
  if (!r?.success) return { notifications: [], error: r?.error };
  return { notifications: Array.isArray(r.notifications) ? r.notifications : [] };
}

export async function clientSessionMarkNotificationRead(opts: {
  sessionToken: string; id?: string; all?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_client_session_mark_notification_read', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function clientSessionGetDocument(opts: { sessionToken: string; documentId: string }): Promise<{
  document?: any;
  access_level?: 'view' | 'comment' | 'approve';
  error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_client_session_get_document', ...opts });
  if (!r?.success) return { error: r?.error };
  return { document: r.document, access_level: r.access_level };
}

/* ═══════════════════════════════════════════════════════════
   Phase 1C — Document image attachments
═══════════════════════════════════════════════════════════ */

export interface DocumentAttachment {
  id:               string;
  document_id:      string;
  project_id:       string;
  name:             string;
  content_type:     string;
  size_bytes:       number;
  storage_path:     string;
  alt?:             string | null;
  caption?:         string | null;
  width?:           number | null;
  height?:          number | null;
  uploaded_by_type: 'staff' | 'client';
  uploaded_by_id?:  string | null;
  uploaded_by_label?: string | null;
  created_at:       string;
  /** Fresh signed URL (1 hour TTL) — populated by backend on list/attach */
  signedUrl?:       string | null;
}

export async function attachImage(opts: {
  documentId:        string;
  projectId:         string;
  fileName:          string;
  contentType:       string;
  base64:            string;
  alt?:              string;
  caption?:          string;
  width?:            number;
  height?:           number;
  uploadedByType?:   'staff' | 'client';
  uploadedById?:     string;
  uploadedByLabel?:  string;
}): Promise<{ attachment?: DocumentAttachment; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_attach_image', ...opts });
  if (!r?.success) return { error: r?.error };
  return { attachment: r.attachment };
}

export async function listAttachments(opts: { documentId: string }): Promise<{
  attachments: DocumentAttachment[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_attachments', ...opts });
  if (!r?.success) return { attachments: [], error: r?.error };
  return { attachments: Array.isArray(r.attachments) ? r.attachments : [] };
}

export async function deleteAttachment(opts: { id: string; projectId: string }): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_delete_attachment', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function refreshAttachmentUrl(id: string): Promise<{
  signedUrl?: string; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_refresh_attachment_url', id });
  if (!r?.success) return { error: r?.error };
  return { signedUrl: r.signedUrl };
}
