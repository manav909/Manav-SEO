/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/types.ts
   Shared types for the Brand Studio frontend.
═══════════════════════════════════════════════════════════════ */

export type BrandStudioTier =
  | 'basic'
  | 'studio'
  | 'studio_pro'
  | 'studio_ir'
  | 'enterprise';

export interface EntitlementResolution {
  project_id:               string;
  tier:                     BrandStudioTier | string;
  features:                 Record<string, boolean>;   // internal
  client_visible_features:  Record<string, boolean>;   // subset for client portal
  client_portal_enabled:    boolean;
  plan_notes?:              string;
  is_default:               boolean;
}

export interface ColorSwatch {
  name:  string;       // e.g. "Primary"
  hex:   string;       // e.g. "#1a73e8"
  role?: string;       // e.g. "primary", "accent", "muted"
}

export interface FontFamily {
  name:    string;     // e.g. "Inter"
  role?:   string;     // e.g. "heading", "body", "mono"
  source?: string;     // e.g. "google_fonts", "self_hosted", "system"
}

export interface LogoVariant {
  label: string;       // e.g. "white on dark"
  url:   string;
}

export interface ImageLibraryItem {
  label: string;
  url:   string;
  tags?: string[];
}

export interface BrandAssets {
  project_id:               string;
  primary_logo_url?:        string;
  logo_variants:            LogoVariant[];
  favicon_url?:             string;
  color_palette:            ColorSwatch[];
  font_families:            FontFamily[];
  image_library:            ImageLibraryItem[];
  primary_tagline?:         string;
  tagline_rationale?:       string;
  secondary_taglines:       string[];
  brand_archetype?:         string;
  brand_application_notes?: string;
  source:                   string;
  created_at?:              string;
  updated_at?:              string;
}

export interface BrandStudioDocument {
  id:                  string;
  project_id:          string;
  name:                string;
  doc_type?:           string;
  kind?:               'ingested' | 'generated';
  stakeholder_role?:   string;
  provided_by?:        string;
  audience_role?:      string;
  template_id?:        string;
  confidence?:         'high' | 'medium' | 'low';
  source_url?:         string;
  version?:            number;
  parent_document_id?: string;
  published_to_client?: boolean;
  published_at?:       string;
  doc_status?:         'draft' | 'final' | 'archived';
  file_size_kb?:       number;
  source_date?:        string;
  created_at?:         string;
  extracted_data?:     any;
  source_documents?:   string[];
  web_sources?:        Array<{ url: string; retrieved_at: string }>;
  /** Phase 1G — opt-in for inclusion in investor data room bundles */
  share_in_investor_pack?: boolean;
}

export interface StakeholderRole {
  key:   string;
  label: string;
}

export interface AudienceRole {
  key:   string;
  label: string;
}

export interface BrandStudioCatalogs {
  stakeholder_roles: StakeholderRole[];
  audience_roles:    AudienceRole[];
  tiers:             string[];
}
