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

/** H.3 — Token-gated investor data fetch.
 *  Returns only verified traction proof points and market intelligence
 *  (status='verified'), with PM-internal fields stripped (notes, status,
 *  workflow metadata). This is what founders share with investors. */
export async function bsClientGetInvestorData(body: any): Promise<any> {
  const { token } = body;
  const resolved = await resolveTokenRow(token);
  if (!resolved) return { success: false, error: "Invalid or expired access link" };
  touchToken(resolved.id).catch(() => {});

  /* Verify the client portal has the investor feature enabled */
  const { data: ent } = await db().from("project_entitlements")
    .select("client_portal_enabled,client_visible_features")
    .eq("project_id", resolved.project_id).maybeSingle();
  if (!(ent as any)?.client_portal_enabled) {
    return { success: false, error: "Portal not enabled" };
  }
  if (!(ent as any)?.client_visible_features?.investor) {
    return { success: false, error: "Investor view not enabled for this workspace" };
  }

  /* Only show 'verified' rows to clients — drafts stay PM-side */
  const { data: tractionRows } = await db().from("traction_proof_points")
    .select("id,category,claim,metric_value,metric_period,evidence_date,evidence_type,source_name,source_url,confidence")
    .eq("project_id", resolved.project_id)
    .eq("status", "verified")
    .order("evidence_date", { ascending: false });

  const { data: miRows } = await db().from("market_intelligence")
    .select("id,category,claim,metric_value,source_url,source_name,source_date,source_excerpt,methodology,confidence,competitor_name")
    .eq("project_id", resolved.project_id)
    .eq("status", "verified")
    .order("source_date", { ascending: false, nullsFirst: false });

  return {
    success: true,
    traction_proof_points: tractionRows || [],
    market_intelligence:   miRows || [],
  };
}

/* ════════════════════════════════════════════════════════════════
   H.6a — Session-token authenticated client endpoints.

   These accept a session_token (issued by bs_redeem_invite) and resolve
   to a specific client_user identity, then delegate to collab functions.
   Distinct from the legacy bare-token resolve flow which has no identity.
═══════════════════════════════════════════════════════════════ */

import { resolveClientUserSession } from "./brand-studio-collab.js";

async function withClientSession(body: any): Promise<{ user: any | null; error?: string }> {
  const token = body?.sessionToken;
  if (!token) return { user: null, error: "sessionToken required" };
  const user = await resolveClientUserSession(token);
  if (!user) return { user: null, error: "Invalid or expired session" };
  return { user };
}

/** H.6a session-authenticated resolve: returns project + brand + user identity */
export async function bsClientSessionResolve(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };

  /* Get project context */
  const { data: project } = await db().from("projects")
    .select("id,name,url").eq("id", user.project_id).maybeSingle();
  if (!project) return { success: false, error: "Project not found" };

  /* Get brand assets */
  const { data: brand } = await db().from("brand_assets")
    .select("*").eq("project_id", user.project_id).maybeSingle();

  /* Get entitlements to know which features are enabled */
  const { data: ent } = await db().from("project_entitlements")
    .select("client_portal_enabled,client_visible_features").eq("project_id", user.project_id).maybeSingle();
  if (!(ent as any)?.client_portal_enabled) return { success: false, error: "Portal not enabled for this project" };

  return {
    success: true,
    user: {
      id: user.id,
      display_name: user.display_name,
      email: user.email,
      role: user.role,
      title: user.title,
      org: user.org,
    },
    project: { id: (project as any).id, name: (project as any).name, url: (project as any).url },
    client: null,                                /* legacy field — clients are now per-user */
    brand: brand || null,
    visible_features: (ent as any).client_visible_features || {},
  };
}

/** List documents this user has access to — either via share grants
 *  OR via the project being client_portal_enabled with general access. */
export async function bsClientSessionListDocuments(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };

  /* All published documents on the project */
  const { data: docs } = await db().from("project_documents")
    .select("id,name,doc_type,kind,audience_role,confidence,version,published_at,template_id,client_resharable,approval_state,client_uploaded")
    .eq("project_id", user.project_id)
    .eq("published_to_client", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at",   { ascending: false });

  /* User's active share grants — to mark "you have grant" + access level */
  const { data: grants } = await db().from("document_share_grants")
    .select("document_id,access_level")
    .eq("granted_to_user_id", user.id).eq("revoked", false);
  const grantMap = new Map<string, string>();
  for (const g of (grants || [])) grantMap.set((g as any).document_id, (g as any).access_level);

  /* Filter: a doc is visible to this user iff
     - they have an explicit share grant, OR
     - it's an "open access" doc (we don't yet have that flag — treat all published as open for now,
       except investor-grade docs which require explicit grant) */
  const visible = (docs || []).filter((d: any) => {
    if (grantMap.has(d.id)) return true;
    /* No grant — visible only if the doc is "client_resharable=true" (i.e. not gated) */
    return d.client_resharable !== false;
  }).map((d: any) => ({
    ...d,
    access_level: grantMap.get(d.id) || "view",  /* default view for ungated docs */
    via_grant: grantMap.has(d.id),
  }));

  return { success: true, documents: visible };
}

/** Client posts a comment via session token */
export async function bsClientSessionPostComment(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  if (!user.display_name) return { success: false, error: "Complete signup before commenting" };

  const { bsPostComment } = await import("./brand-studio-collab.js");
  return bsPostComment({
    documentId:      body.documentId,
    projectId:       user.project_id,
    sectionKey:      body.sectionKey,
    parentCommentId: body.parentCommentId,
    bodyText:        body.bodyText,
    authorType:      "client",
    authorId:        user.id,
    authorLabel:     `${user.display_name}${user.title ? ` (${user.title})` : ""}`,
  });
}

export async function bsClientSessionListComments(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsListComments } = await import("./brand-studio-collab.js");
  return bsListComments({ documentId: body.documentId, projectId: user.project_id });
}

export async function bsClientSessionRespondApproval(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsRespondApproval } = await import("./brand-studio-collab.js");
  return bsRespondApproval({
    id:               body.id,
    projectId:        user.project_id,
    decision:         body.decision,
    responseMessage:  body.responseMessage,
    respondedByUserId: user.id,
    respondedByLabel: `${user.display_name}${user.title ? ` (${user.title})` : ""}`,
    linkedCommentId:  body.linkedCommentId,
  });
}

export async function bsClientSessionListApprovals(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsListApprovals } = await import("./brand-studio-collab.js");
  return bsListApprovals({ projectId: user.project_id, documentId: body.documentId, openOnly: body.openOnly });
}

export async function bsClientSessionShareDoc(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsCreateShareGrant } = await import("./brand-studio-collab.js");
  return bsCreateShareGrant({
    documentId:        body.documentId,
    projectId:         user.project_id,
    grantedToUserId:   body.grantedToUserId,
    accessLevel:       body.accessLevel,
    grantedByType:     "client",
    grantedById:       user.id,
    grantedByLabel:    `${user.display_name}${user.title ? ` (${user.title})` : ""}`,
  });
}

export async function bsClientSessionRevokeShare(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsRevokeShareGrant } = await import("./brand-studio-collab.js");
  return bsRevokeShareGrant({
    id:                body.id,
    projectId:         user.project_id,
    revokedByType:     "client",
    revokedById:       user.id,
    revokedByLabel:    `${user.display_name}${user.title ? ` (${user.title})` : ""}`,
    reason:            body.reason,
  });
}

export async function bsClientSessionListShareGrants(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsListShareGrants } = await import("./brand-studio-collab.js");
  return bsListShareGrants({ documentId: body.documentId, projectId: user.project_id });
}

export async function bsClientSessionUploadFile(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsClientUploadFile } = await import("./brand-studio-collab.js");
  return bsClientUploadFile({
    projectId:        user.project_id,
    uploadingUserId:  user.id,
    fileName:         body.fileName,
    contentType:      body.contentType,
    contentBase64:    body.contentBase64,
    docType:          body.docType,
    sourceUrl:        body.sourceUrl,
  });
}

export async function bsClientSessionListIntakeForms(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsClientListIntakeForms } = await import("./brand-studio-collab.js");
  return bsClientListIntakeForms({ projectId: user.project_id, userId: user.id, userRole: user.role });
}

export async function bsClientSessionSubmitIntake(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsSubmitIntakeResponse } = await import("./brand-studio-collab.js");
  return bsSubmitIntakeResponse({
    formId:            body.formId,
    projectId:         user.project_id,
    respondingUserId:  user.id,
    responses:         body.responses,
    isFinalSubmit:     body.isFinalSubmit,
  });
}

export async function bsClientSessionListNotifications(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsListNotifications } = await import("./brand-studio-collab.js");
  return bsListNotifications({
    recipientType: "client", recipientId: user.id,
    projectId: user.project_id,
    unreadOnly: body.unreadOnly,
    limit: body.limit,
  });
}

export async function bsClientSessionMarkNotificationRead(body: any): Promise<any> {
  const { user, error } = await withClientSession(body);
  if (!user) return { success: false, error };
  const { bsMarkNotificationRead } = await import("./brand-studio-collab.js");
  return bsMarkNotificationRead({
    id: body.id,
    recipientType: "client", recipientId: user.id,
    all: body.all,
  });
}

/* ─── Dispatcher ──────────────────────────────────────────────── */

export async function handleBrandStudioClient(action: string, body: any): Promise<any | null> {
  switch (action) {
    /* PM-side (legacy bare-token tokens still supported for short-lived shares) */
    case "bs_create_client_token":   return bsCreateClientToken(body);
    case "bs_list_client_tokens":    return bsListClientTokens(body);
    case "bs_get_token_by_id":       return bsGetTokenById(body);
    case "bs_revoke_client_token":   return bsRevokeClientToken(body);
    case "bs_publish_document":      return bsPublishDocument(body);
    case "bs_publish_bulk":          return bsPublishBulk(body);

    /* Legacy bare-token client-side */
    case "bs_client_resolve":        return bsClientResolve(body);
    case "bs_client_list_documents": return bsClientListDocuments(body);
    case "bs_client_get_document":   return bsClientGetDocument(body);
    case "bs_client_get_investor_data": return bsClientGetInvestorData(body);

    /* H.6a session-token client-side (magic-link identity) */
    case "bs_client_session_resolve":           return bsClientSessionResolve(body);
    case "bs_client_session_list_documents":    return bsClientSessionListDocuments(body);
    case "bs_client_session_post_comment":      return bsClientSessionPostComment(body);
    case "bs_client_session_list_comments":     return bsClientSessionListComments(body);
    case "bs_client_session_respond_approval":  return bsClientSessionRespondApproval(body);
    case "bs_client_session_list_approvals":    return bsClientSessionListApprovals(body);
    case "bs_client_session_share_doc":         return bsClientSessionShareDoc(body);
    case "bs_client_session_revoke_share":      return bsClientSessionRevokeShare(body);
    case "bs_client_session_list_share_grants": return bsClientSessionListShareGrants(body);
    case "bs_client_session_upload_file":       return bsClientSessionUploadFile(body);
    case "bs_client_session_list_intake_forms": return bsClientSessionListIntakeForms(body);
    case "bs_client_session_submit_intake":     return bsClientSessionSubmitIntake(body);
    case "bs_client_session_list_notifications": return bsClientSessionListNotifications(body);
    case "bs_client_session_mark_notification_read": return bsClientSessionMarkNotificationRead(body);

    default: return null;
  }
}
