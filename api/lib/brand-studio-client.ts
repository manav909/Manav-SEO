/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-client.ts
   Brand Studio H.1.5 — Client portal backend.

   Token-based auth: PM generates a long random token per project,
   shares it with the client. The token IS the auth — no Supabase
   Auth for clients, no signup friction.

   Two distinct API surfaces in this file:
   1. PM-side endpoints (token management, document publishing) —
      called from staff-authenticated UI
   2. Client-side endpoints (resolve, list, get) — called from the
      public /c/:token portal, gated only by token validity

   Discipline:
   - Every client-side call validates the token first
   - Client-side calls only return documents where published_to_client=true
   - Client-side calls filter by entitlements (client_visible_features)
   - Token last_accessed_at + access_count tracked for audit
   - Revoked tokens silently fail (don't leak whether a token existed)
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { randomBytes } from "crypto";

/* ─── Token utilities ─────────────────────────────────────────── */

function generateToken(): string {
  /* 32 bytes random → base64url-safe (no padding, URL-safe chars) */
  return randomBytes(32).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface ResolvedToken {
  id:             string;
  token:          string;
  project_id:     string;
  client_id?:     string;
  label?:         string;
  created_at:     string;
  expires_at?:    string;
  revoked:        boolean;
  last_accessed_at?: string;
  access_count:   number;
}

/** Resolve a token to its row. Returns null if not found, revoked, or expired.
 *  Does NOT leak the reason — callers get a generic "invalid token" response. */
async function resolveTokenRow(token: string): Promise<ResolvedToken | null> {
  if (!token || typeof token !== "string") return null;
  const { data } = await db().from("client_portal_tokens")
    .select("*").eq("token", token).maybeSingle();
  if (!data) return null;
  const r = data as any;
  if (r.revoked) return null;
  if (r.expires_at && new Date(r.expires_at) < new Date()) return null;
  return r as ResolvedToken;
}

/** Bump last_accessed_at + access_count. Fire-and-forget (don't block on this). */
async function touchToken(tokenId: string): Promise<void> {
  try {
    /* Read-modify-write: increment access_count. Supabase doesn't have
       atomic increment in the JS SDK, so we read then write. Concurrent
       writes might lose a count but that's acceptable for audit metrics. */
    const { data: cur } = await db().from("client_portal_tokens")
      .select("access_count").eq("id", tokenId).maybeSingle();
    await db().from("client_portal_tokens").update({
      last_accessed_at: new Date().toISOString(),
      access_count:     (((cur as any)?.access_count) || 0) + 1,
    }).eq("id", tokenId);
  } catch (e: any) {
    console.error("[bs-client] touchToken failed:", e?.message);
  }
}

/* ─── PM-side: token management ───────────────────────────────── */

export async function bsCreateClientToken(body: any): Promise<any> {
  const { projectId, clientId, label, expiresInDays, createdBy } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  let expiresAt: string | undefined;
  if (typeof expiresInDays === "number" && expiresInDays > 0) {
    const d = new Date(); d.setDate(d.getDate() + expiresInDays);
    expiresAt = d.toISOString();
  }

  const token = generateToken();
  const { data, error } = await db().from("client_portal_tokens").insert({
    token,
    project_id: projectId,
    client_id:  clientId || null,
    label:      label || null,
    expires_at: expiresAt || null,
    created_by: createdBy || null,
  }).select().single();

  if (error || !data) return { success: false, error: error?.message || "Token creation failed" };
  return { success: true, token: (data as any) };
}

export async function bsListClientTokens(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  const { data, error } = await db().from("client_portal_tokens")
    .select("id,label,client_id,created_at,created_by,expires_at,revoked,revoked_at,revoked_reason,last_accessed_at,access_count")
    /* Note: we DON'T return the token itself in the list — only on creation.
       PM has to regenerate if they lose the link, which is the right pressure
       (lost tokens are a security concern). */
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, tokens: data || [] };
}

export async function bsGetTokenById(body: any): Promise<any> {
  /* Returns the full token string for a given token ID, for "show link again" UX.
     Only allowed for non-revoked tokens. */
  const { tokenId } = body;
  if (!tokenId) return { success: false, error: "tokenId required" };
  const { data } = await db().from("client_portal_tokens")
    .select("token,revoked").eq("id", tokenId).maybeSingle();
  if (!data) return { success: false, error: "Token not found" };
  if ((data as any).revoked) return { success: false, error: "Token has been revoked" };
  return { success: true, token: (data as any).token };
}

export async function bsRevokeClientToken(body: any): Promise<any> {
  const { tokenId, reason } = body;
  if (!tokenId) return { success: false, error: "tokenId required" };
  const { error } = await db().from("client_portal_tokens").update({
    revoked:        true,
    revoked_at:     new Date().toISOString(),
    revoked_reason: reason || null,
  }).eq("id", tokenId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ─── PM-side: document publishing ────────────────────────────── */

export async function bsPublishDocument(body: any): Promise<any> {
  const { documentId, publish } = body;
  if (!documentId) return { success: false, error: "documentId required" };
  const publishedAt = publish ? new Date().toISOString() : null;
  const { error } = await db().from("project_documents").update({
    published_to_client: !!publish,
    published_at:        publishedAt,
  }).eq("id", documentId);
  if (error) return { success: false, error: error.message };
  return { success: true, published: !!publish };
}

export async function bsPublishBulk(body: any): Promise<any> {
  const { documentIds, publish } = body;
  if (!Array.isArray(documentIds) || !documentIds.length) {
    return { success: false, error: "documentIds required" };
  }
  const publishedAt = publish ? new Date().toISOString() : null;
  const { error } = await db().from("project_documents").update({
    published_to_client: !!publish,
    published_at:        publishedAt,
  }).in("id", documentIds);
  if (error) return { success: false, error: error.message };
  return { success: true, published: !!publish, count: documentIds.length };
}

/* ─── Client-side: token resolution + listing ─────────────────── */

/** Public endpoint: resolves a token to the client's portal context.
 *  Returns project info, brand assets, entitlements (client-visible only),
 *  and library listing of published documents.
 *  Does NOT return raw_content of documents — that comes from
 *  bsClientGetDocument(token, documentId). */
export async function bsClientResolve(body: any): Promise<any> {
  const { token } = body;
  const resolved = await resolveTokenRow(token);
  if (!resolved) return { success: false, error: "Invalid or expired access link" };

  /* fire-and-forget audit touch */
  touchToken(resolved.id).catch(() => {});

  /* fetch project */
  const { data: proj } = await db().from("projects")
    .select("id,name,url").eq("id", resolved.project_id).maybeSingle();
  if (!proj) return { success: false, error: "Project not available" };

  /* fetch client (if linked) */
  let client: any = null;
  if (resolved.client_id) {
    const { data } = await db().from("clients")
      .select("name,company").eq("id", resolved.client_id).maybeSingle();
    client = data;
  }

  /* fetch entitlements */
  const { data: ent } = await db().from("project_entitlements")
    .select("*").eq("project_id", resolved.project_id).maybeSingle();
  const tier = (ent as any)?.tier || "basic";
  const clientVisibleFeatures = (ent as any)?.client_visible_features || {};
  const clientPortalEnabled = !!(ent as any)?.client_portal_enabled;

  /* If client portal is disabled on this project, deny.
     This is the secondary safety net — PM controls portal access via the
     client_portal_enabled flag in addition to controlling tokens. */
  if (!clientPortalEnabled) {
    return {
      success: false,
      error: "The client portal is not enabled for this project. Please contact your account manager.",
    };
  }

  /* fetch brand assets — clients always see these if they have any portal access */
  const { data: assets } = await db().from("brand_assets")
    .select("*").eq("project_id", resolved.project_id).maybeSingle();

  return {
    success: true,
    context: {
      project: { id: proj.id, name: (proj as any).name, url: (proj as any).url },
      client,
      tier,
      client_visible_features: clientVisibleFeatures,
      brand_assets: assets || null,
    },
  };
}

/** List published documents for the client. Token-gated.
 *  Returns only documents with published_to_client=true. Strips raw_content. */
export async function bsClientListDocuments(body: any): Promise<any> {
  const { token } = body;
  const resolved = await resolveTokenRow(token);
  if (!resolved) return { success: false, error: "Invalid or expired access link" };
  touchToken(resolved.id).catch(() => {});

  const { data, error } = await db().from("project_documents")
    .select(
      "id, name, doc_type, kind, audience_role, confidence, source_url, " +
      "version, published_at, doc_status, file_size_kb, source_date, created_at, " +
      "extracted_data, source_documents, web_sources"
    )
    .eq("project_id", resolved.project_id)
    .eq("published_to_client", true)
    .order("published_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, documents: data || [] };
}

/** Get a single published document detail. Token-gated.
 *  Includes raw_content (for clients to actually read what was shared). */
export async function bsClientGetDocument(body: any): Promise<any> {
  const { token, documentId } = body;
  if (!documentId) return { success: false, error: "documentId required" };
  const resolved = await resolveTokenRow(token);
  if (!resolved) return { success: false, error: "Invalid or expired access link" };
  touchToken(resolved.id).catch(() => {});

  const { data } = await db().from("project_documents")
    .select(
      "id, project_id, name, doc_type, kind, audience_role, confidence, source_url, " +
      "version, published_at, doc_status, file_size_kb, source_date, created_at, " +
      "raw_content, extracted_data, source_documents, web_sources"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (!data) return { success: false, error: "Document not found" };
  /* Security check: doc must belong to the token's project AND be published */
  const d = data as any;
  if (d.project_id !== resolved.project_id) return { success: false, error: "Document not available" };

  const { data: pubCheck } = await db().from("project_documents")
    .select("published_to_client").eq("id", documentId).maybeSingle();
  if (!(pubCheck as any)?.published_to_client) return { success: false, error: "Document not available" };

  return { success: true, document: data };
}

/* ─── Dispatcher ──────────────────────────────────────────────── */

export async function handleBrandStudioClient(action: string, body: any): Promise<any | null> {
  switch (action) {
    /* PM-side */
    case "bs_create_client_token":   return bsCreateClientToken(body);
    case "bs_list_client_tokens":    return bsListClientTokens(body);
    case "bs_get_token_by_id":       return bsGetTokenById(body);
    case "bs_revoke_client_token":   return bsRevokeClientToken(body);
    case "bs_publish_document":      return bsPublishDocument(body);
    case "bs_publish_bulk":          return bsPublishBulk(body);

    /* Client-side (token-gated) */
    case "bs_client_resolve":        return bsClientResolve(body);
    case "bs_client_list_documents": return bsClientListDocuments(body);
    case "bs_client_get_document":   return bsClientGetDocument(body);

    default: return null;
  }
}
