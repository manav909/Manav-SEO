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
