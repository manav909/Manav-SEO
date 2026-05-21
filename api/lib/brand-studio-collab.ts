/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-collab.ts
   Brand Studio H.6a — Client collaboration backend.

   Concerns (all dispatched through task-engine.ts; 12-function limit held):

   1. Client user lifecycle — invite, magic-link verification, session
      management, list/revoke/update
   2. Document share grants — create, list, revoke; discipline-enforced
      so you cannot grant access higher than your own, and investor-grade
      docs are PM-only-shareable
   3. Document comments — threaded, soft-delete, resolve workflow,
      mention parsing
   4. Approval requests — state machine with version tracking
   5. Intake forms — PM-defined templates; client response submission;
      PM review + selective apply with NEVER_OVERWRITE discipline
   6. Client-uploaded files — routed through existing ingest pipeline
      as drafts requiring PM extract + publish
   7. In-app notifications — single inbox for both staff and client
      recipients
   8. Audit logging — every consequential client action is logged
      for PM transparency

   Email delivery (H.6b) is NOT in this module — only in-app
   notifications ship here. The schema is forward-compatible: H.6b
   adds the Resend integration without touching this code's shape.

   Auth model:
   - Staff actions come from task-engine.ts after staff auth check
     (existing pattern) — payload includes pmStaffLabel for audit
   - Client actions arrive via dedicated client-side endpoints in
     brand-studio-client.ts which verify the session_token first,
     then call into helper functions exported from here
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { randomBytes } from "crypto";

/* ─── Constants ────────────────────────────────────────────────── */

const VALID_CLIENT_ROLES = [
  "client_executive","client_marketing","client_legal",
  "client_designer","client_internal","client_press_contact",
];

const VALID_ACCESS_LEVELS = ["view","comment","approve"];

/* Access level hierarchy — index = strength */
const ACCESS_HIERARCHY = ["view","comment","approve"];
function accessAtLeast(have: string, want: string): boolean {
  return ACCESS_HIERARCHY.indexOf(have) >= ACCESS_HIERARCHY.indexOf(want);
}

const INVITE_EXPIRY_DAYS  = 30;
const SESSION_EXPIRY_DAYS = 90;

/* ─── Helpers ──────────────────────────────────────────────────── */

function generateToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function isoExpiry(days: number): string {
  return new Date(Date.now() + days * 86400 * 1000).toISOString();
}

/** Resolve a client_user from session_token. Used by client-side
 *  endpoints to verify identity. Returns the user if session is
 *  valid + unexpired + active, else null. */
export async function resolveClientUserSession(sessionToken: string): Promise<any | null> {
  if (!sessionToken) return null;
  const { data } = await db().from("client_users")
    .select("*").eq("session_token", sessionToken).maybeSingle();
  if (!data) return null;
  const u = data as any;
  if (!u.active) return null;
  if (u.session_expires_at && new Date(u.session_expires_at) < new Date()) return null;
  /* Touch last_seen + visit_count — fire and forget */
  db().from("client_users")
    .update({ last_seen_at: new Date().toISOString(), visit_count: (u.visit_count || 0) + 1 })
    .eq("id", u.id).then(() => {}, () => {});
  return u;
}

/** Create an in-app notification (and reserve email_status for H.6b). */
async function createNotification(opts: {
  projectId:     string;
  recipientType: "staff" | "client";
  recipientId:   string;
  kind:          string;
  title:         string;
  body?:         string;
  payload?:      any;
}): Promise<void> {
  try {
    await db().from("client_notifications").insert({
      project_id:     opts.projectId,
      recipient_type: opts.recipientType,
      recipient_id:   opts.recipientId,
      kind:           opts.kind,
      title:          opts.title.slice(0, 300),
      body:           opts.body ? opts.body.slice(0, 1000) : null,
      payload:        opts.payload || null,
      email_status:   "skipped",  /* H.6b will populate properly */
    });
  } catch (e: any) {
    console.error("[bs-collab] notification create failed:", e?.message);
  }
}

/** Parse @mentions from a comment body. Format: @[label](type:id) e.g.
 *  @[John Smith](client:abc-123) or @[Manav](staff:manav). */
function parseMentions(body: string): Array<{ type: string; id: string; label: string }> {
  const re = /@\[([^\]]+)\]\((staff|client):([a-zA-Z0-9_\-]+)\)/g;
  const found: Array<{ type: string; id: string; label: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    found.push({ label: m[1], type: m[2], id: m[3] });
    if (found.length >= 20) break;
  }
  return found;
}

/** Lookup the PM staff label / id for a project — used as recipient
 *  for client-originated notifications. We don't have a real per-project
 *  PM assignment table; for now, route to a synthetic 'pm' recipient_id
 *  that the staff UI treats as "shared PM inbox." */
function pmStaffRecipient(projectId: string): { recipientType: "staff"; recipientId: string } {
  return { recipientType: "staff", recipientId: `pm:${projectId}` };
}

/* ═══════════════════════════════════════════════════════════════
   Section 1 — Client user lifecycle
═══════════════════════════════════════════════════════════════ */

export async function bsInviteClientUser(body: any): Promise<any> {
  const { projectId, email, role, title, org, invitedBy, notes } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: "Valid email required" };
  if (!role || !VALID_CLIENT_ROLES.includes(role)) {
    return { success: false, error: `role must be one of: ${VALID_CLIENT_ROLES.join(", ")}` };
  }

  /* Check for existing invite (same project + same email) — if exists, regenerate token instead of duplicating */
  const { data: existing } = await db().from("client_users")
    .select("id,invite_used,session_token")
    .eq("project_id", projectId).eq("email", email).maybeSingle();

  const inviteToken = generateToken(32);
  const inviteExpires = isoExpiry(INVITE_EXPIRY_DAYS);

  if (existing) {
    /* Regenerate invite for an existing record — clears session, re-issues link */
    const { data, error } = await db().from("client_users").update({
      role, title: title || null, org: org || null, notes: notes || null,
      invite_token: inviteToken, invite_used: false, invite_sent_at: new Date().toISOString(),
      invite_expires_at: inviteExpires,
      session_token: null, session_expires_at: null,
      active: true,
    }).eq("id", (existing as any).id).select().single();
    if (error || !data) return { success: false, error: error?.message || "regenerate failed" };
    return { success: true, client_user: data, invite_token: inviteToken, was_regenerated: true };
  }

  const { data, error } = await db().from("client_users").insert({
    project_id: projectId,
    email, role,
    title: title || null,
    org:   org || null,
    notes: notes || null,
    invite_token: inviteToken,
    invite_sent_at: new Date().toISOString(),
    invite_expires_at: inviteExpires,
    invited_by: invitedBy || null,
  }).select().single();

  if (error || !data) return { success: false, error: error?.message || "invite failed" };
  return { success: true, client_user: data, invite_token: inviteToken };
}

export async function bsListClientUsers(body: any): Promise<any> {
  const { projectId, includeInactive } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  let q = db().from("client_users").select("*").eq("project_id", projectId);
  if (!includeInactive) q = q.eq("active", true);
  q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, client_users: data || [] };
}

export async function bsUpdateClientUser(body: any): Promise<any> {
  const { id, projectId, role, title, org, active, notes } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  const payload: any = {};
  if (role !== undefined) {
    if (!VALID_CLIENT_ROLES.includes(role)) return { success: false, error: "invalid role" };
    payload.role = role;
  }
  if (title !== undefined)  payload.title = title || null;
  if (org !== undefined)    payload.org = org || null;
  if (active !== undefined) payload.active = !!active;
  if (notes !== undefined)  payload.notes = notes || null;

  const { data, error } = await db().from("client_users")
    .update(payload).eq("id", id).eq("project_id", projectId).select().single();
  if (error || !data) return { success: false, error: error?.message || "update failed" };
  return { success: true, client_user: data };
}

export async function bsRevokeClientUser(body: any): Promise<any> {
  const { id, projectId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  /* Deactivate (keep history) + null out session so they can't act anymore */
  const { error } = await db().from("client_users").update({
    active: false,
    session_token: null,
    session_expires_at: null,
  }).eq("id", id).eq("project_id", projectId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Magic-link redemption: take an invite_token, mark used, mint a session_token.
 *  Called from the public-facing /c/invite/<token> page. */
export async function bsRedeemInvite(body: any): Promise<any> {
  const { inviteToken, displayName } = body;
  if (!inviteToken) return { success: false, error: "inviteToken required" };
  if (!displayName || !String(displayName).trim()) {
    return { success: false, error: "displayName required to complete signup" };
  }

  const { data: row } = await db().from("client_users")
    .select("*").eq("invite_token", inviteToken).maybeSingle();
  if (!row) return { success: false, error: "Invalid invite link" };
  const u = row as any;
  if (u.invite_used) return { success: false, error: "Invite already used — request a new one from your account manager" };
  if (u.invite_expires_at && new Date(u.invite_expires_at) < new Date()) {
    return { success: false, error: "Invite has expired — request a new one from your account manager" };
  }
  if (!u.active) return { success: false, error: "Account has been deactivated" };

  const sessionToken   = generateToken(48);
  const sessionExpires = isoExpiry(SESSION_EXPIRY_DAYS);
  const { data: updated, error } = await db().from("client_users").update({
    display_name:      String(displayName).slice(0, 200),
    invite_used:       true,
    session_token:     sessionToken,
    session_expires_at: sessionExpires,
    last_seen_at:      new Date().toISOString(),
    visit_count:       1,
  }).eq("id", u.id).select().single();

  if (error || !updated) return { success: false, error: error?.message || "Could not complete signup" };

  return {
    success: true,
    session_token: sessionToken,
    session_expires_at: sessionExpires,
    client_user: updated,
  };
}

/* ═══════════════════════════════════════════════════════════════
   Section 2 — Document share grants
═══════════════════════════════════════════════════════════════ */

/** Helper: what access level does this user effectively have on this doc?
 *  Returns null if no access. Used by callers before allowing comment / approve / share. */
export async function getEffectiveAccess(opts: {
  projectId:  string;
  documentId: string;
  userType:   "staff" | "client";
  userId:     string;
}): Promise<string | null> {
  /* Staff always have approve+ on documents in their project */
  if (opts.userType === "staff") return "approve";

  /* Client: must have an active share grant AND doc must be published */
  const { data: doc } = await db().from("project_documents")
    .select("project_id,published_to_client").eq("id", opts.documentId).maybeSingle();
  if (!doc) return null;
  if ((doc as any).project_id !== opts.projectId) return null;
  if (!(doc as any).published_to_client) return null;

  const { data: grant } = await db().from("document_share_grants")
    .select("access_level").eq("document_id", opts.documentId)
    .eq("granted_to_user_id", opts.userId).eq("revoked", false).maybeSingle();
  return grant ? (grant as any).access_level : null;
}

export async function bsListShareGrants(body: any): Promise<any> {
  const { documentId, projectId, includeRevoked } = body;
  if (!documentId || !projectId) return { success: false, error: "documentId + projectId required" };

  let q = db().from("document_share_grants")
    .select("*").eq("document_id", documentId).eq("project_id", projectId);
  if (!includeRevoked) q = q.eq("revoked", false);
  q = q.order("granted_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  /* Enrich with the user's display name + role */
  const grants = data || [];
  if (grants.length === 0) return { success: true, grants: [] };
  const userIds = Array.from(new Set(grants.map((g: any) => g.granted_to_user_id)));
  const { data: users } = await db().from("client_users")
    .select("id,display_name,email,role,active").in("id", userIds);
  const userMap = new Map<string, any>();
  for (const u of (users || [])) userMap.set((u as any).id, u);

  return {
    success: true,
    grants: grants.map((g: any) => ({
      ...g,
      granted_to_label:  userMap.get(g.granted_to_user_id)?.display_name
                      || userMap.get(g.granted_to_user_id)?.email,
      granted_to_email:  userMap.get(g.granted_to_user_id)?.email,
      granted_to_role:   userMap.get(g.granted_to_user_id)?.role,
      granted_to_active: userMap.get(g.granted_to_user_id)?.active,
    })),
  };
}

/** Create a share grant. Discipline:
 *  - granter must have access at least equal to what they're granting
 *  - investor-grade docs (client_resharable=false) only PM can grant
 *  - target user must be a client_user on the same project */
export async function bsCreateShareGrant(body: any): Promise<any> {
  const {
    documentId, projectId, grantedToUserId, accessLevel,
    grantedByType, grantedById, grantedByLabel,
  } = body;
  if (!documentId || !projectId || !grantedToUserId) {
    return { success: false, error: "documentId + projectId + grantedToUserId required" };
  }
  if (!VALID_ACCESS_LEVELS.includes(accessLevel)) {
    return { success: false, error: "invalid accessLevel" };
  }
  if (!grantedByType || !["staff","client"].includes(grantedByType)) {
    return { success: false, error: "grantedByType required (staff|client)" };
  }
  if (!grantedById || !grantedByLabel) {
    return { success: false, error: "grantedById + grantedByLabel required for audit" };
  }

  /* Verify target user belongs to this project and is active */
  const { data: target } = await db().from("client_users")
    .select("id,project_id,active,role").eq("id", grantedToUserId).maybeSingle();
  if (!target) return { success: false, error: "Target user not found" };
  if ((target as any).project_id !== projectId) return { success: false, error: "Target user not on this project" };
  if (!(target as any).active) return { success: false, error: "Target user is deactivated" };

  /* Verify document state */
  const { data: doc } = await db().from("project_documents")
    .select("id,project_id,published_to_client,client_resharable").eq("id", documentId).maybeSingle();
  if (!doc) return { success: false, error: "Document not found" };
  if ((doc as any).project_id !== projectId) return { success: false, error: "Document not on this project" };
  if (!(doc as any).published_to_client) {
    return { success: false, error: "Document must be published before sharing" };
  }

  /* Investor-grade discipline: client_resharable=false means PM-only */
  if (!(doc as any).client_resharable && grantedByType === "client") {
    return { success: false, error: "This document is PM-only-shareable. Ask your account manager to share it on your behalf." };
  }

  /* Hierarchy check: client granter must have at least the access they're granting */
  if (grantedByType === "client") {
    const granterAccess = await getEffectiveAccess({
      projectId, documentId, userType: "client", userId: grantedById,
    });
    if (!granterAccess) return { success: false, error: "You don't have access to this document, so cannot share it." };
    if (!accessAtLeast(granterAccess, accessLevel)) {
      return { success: false, error: `You cannot grant ${accessLevel} access — your own access is ${granterAccess}.` };
    }
  }

  /* Upsert — if a revoked grant exists, re-activate it; if active grant exists, update its level */
  const { data: existingGrant } = await db().from("document_share_grants")
    .select("id,revoked").eq("document_id", documentId).eq("granted_to_user_id", grantedToUserId).maybeSingle();

  if (existingGrant) {
    const { data, error } = await db().from("document_share_grants").update({
      access_level:     accessLevel,
      granted_by_type:  grantedByType,
      granted_by_id:    grantedById,
      granted_by_label: grantedByLabel,
      granted_at:       new Date().toISOString(),
      revoked:          false,
      revoked_at:       null,
      revoked_by_type:  null,
      revoked_by_id:    null,
      revoked_by_label: null,
      revoke_reason:    null,
    }).eq("id", (existingGrant as any).id).select().single();
    if (error || !data) return { success: false, error: error?.message || "update failed" };

    /* Notify target */
    await createNotification({
      projectId,
      recipientType: "client", recipientId: grantedToUserId,
      kind: "share_granted",
      title: `${grantedByLabel} shared a document with you`,
      payload: { document_id: documentId, access_level: accessLevel },
    });
    return { success: true, grant: data };
  }

  const { data, error } = await db().from("document_share_grants").insert({
    document_id:      documentId,
    project_id:       projectId,
    granted_to_user_id: grantedToUserId,
    access_level:     accessLevel,
    granted_by_type:  grantedByType,
    granted_by_id:    grantedById,
    granted_by_label: grantedByLabel,
  }).select().single();
  if (error || !data) return { success: false, error: error?.message || "grant failed" };

  await createNotification({
    projectId,
    recipientType: "client", recipientId: grantedToUserId,
    kind: "share_granted",
    title: `${grantedByLabel} shared a document with you`,
    payload: { document_id: documentId, access_level: accessLevel },
  });
  return { success: true, grant: data };
}

export async function bsRevokeShareGrant(body: any): Promise<any> {
  const { id, projectId, revokedByType, revokedById, revokedByLabel, reason } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  if (!revokedByType || !["staff","client"].includes(revokedByType)) {
    return { success: false, error: "revokedByType required" };
  }
  if (!revokedById || !revokedByLabel) {
    return { success: false, error: "revokedById + revokedByLabel required for audit" };
  }

  /* If revoker is a client, they can only revoke grants THEY made */
  if (revokedByType === "client") {
    const { data: grant } = await db().from("document_share_grants")
      .select("granted_by_type,granted_by_id,granted_to_user_id").eq("id", id).maybeSingle();
    if (!grant) return { success: false, error: "Grant not found" };
    const isGranter = (grant as any).granted_by_type === "client" && (grant as any).granted_by_id === revokedById;
    const isSelf    = (grant as any).granted_to_user_id === revokedById;  /* user revoking their own access */
    if (!isGranter && !isSelf) {
      return { success: false, error: "You can only revoke grants you created or your own access." };
    }
  }

  const { data, error } = await db().from("document_share_grants").update({
    revoked:         true,
    revoked_at:      new Date().toISOString(),
    revoked_by_type: revokedByType,
    revoked_by_id:   revokedById,
    revoked_by_label: revokedByLabel,
    revoke_reason:   reason || null,
  }).eq("id", id).eq("project_id", projectId).select().single();
  if (error || !data) return { success: false, error: error?.message || "revoke failed" };

  /* Notify the affected user */
  await createNotification({
    projectId,
    recipientType: "client",
    recipientId:   (data as any).granted_to_user_id,
    kind: "share_revoked",
    title: `${revokedByLabel} revoked your access to a document`,
    body:  reason || undefined,
    payload: { document_id: (data as any).document_id },
  });
  return { success: true, grant: data };
}

/* ═══════════════════════════════════════════════════════════════
   Section 3 — Document comments
═══════════════════════════════════════════════════════════════ */

export async function bsListComments(body: any): Promise<any> {
  const { documentId, projectId, includeResolved, includeDeleted } = body;
  if (!documentId || !projectId) return { success: false, error: "documentId + projectId required" };

  let q = db().from("document_comments")
    .select("*").eq("document_id", documentId).eq("project_id", projectId);
  if (!includeDeleted)  q = q.is("deleted_at", null);
  if (!includeResolved) q = q.eq("resolved", false);
  q = q.order("created_at", { ascending: true });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, comments: data || [] };
}

export async function bsPostComment(body: any): Promise<any> {
  const {
    documentId, projectId,
    sectionKey, parentCommentId, bodyText,
    authorType, authorId, authorLabel,
  } = body;
  if (!documentId || !projectId) return { success: false, error: "documentId + projectId required" };
  if (!bodyText || !String(bodyText).trim()) return { success: false, error: "body required" };
  if (!authorType || !["staff","client"].includes(authorType)) {
    return { success: false, error: "authorType required" };
  }
  if (!authorId || !authorLabel) return { success: false, error: "authorId + authorLabel required" };

  /* Client author needs comment+ access */
  if (authorType === "client") {
    const acc = await getEffectiveAccess({ projectId, documentId, userType: "client", userId: authorId });
    if (!acc) return { success: false, error: "You don't have access to this document." };
    if (!accessAtLeast(acc, "comment")) {
      return { success: false, error: "Your access level is view-only — you cannot post comments on this document." };
    }
  }

  const mentions = parseMentions(String(bodyText));

  const { data, error } = await db().from("document_comments").insert({
    document_id:     documentId,
    project_id:      projectId,
    section_key:     sectionKey || null,
    parent_comment_id: parentCommentId || null,
    author_type:     authorType,
    author_id:       authorId,
    author_label:    authorLabel,
    body:            String(bodyText).slice(0, 8000),
    mentions:        mentions.length ? mentions : null,
  }).select().single();
  if (error || !data) return { success: false, error: error?.message || "post failed" };

  /* Notifications:
     - If this is a reply, notify the parent comment's author (unless they're the same person)
     - If staff posts on a doc the client owns access on, notify the client
     - If client posts, notify the PM
     - If there are mentions, notify those people */
  const newComment = data as any;
  const notifyTargets = new Set<string>();  /* "type:id" */

  /* PM notification for any client comment */
  if (authorType === "client") {
    const pm = pmStaffRecipient(projectId);
    notifyTargets.add(`${pm.recipientType}:${pm.recipientId}`);
  }

  /* Reply notification */
  if (parentCommentId) {
    const { data: parent } = await db().from("document_comments")
      .select("author_type,author_id").eq("id", parentCommentId).maybeSingle();
    if (parent && ((parent as any).author_id !== authorId || (parent as any).author_type !== authorType)) {
      notifyTargets.add(`${(parent as any).author_type}:${(parent as any).author_id}`);
    }
  }

  /* Mention notifications */
  for (const m of mentions) {
    if (m.id !== authorId || m.type !== authorType) {
      notifyTargets.add(`${m.type}:${m.id}`);
    }
  }

  /* Fan out */
  const { data: docMeta } = await db().from("project_documents")
    .select("name").eq("id", documentId).maybeSingle();
  const docName = (docMeta as any)?.name || "a document";
  for (const t of notifyTargets) {
    const [tp, ...rest] = t.split(":");
    const tid = rest.join(":");
    const kind = mentions.some((m) => `${m.type}:${m.id}` === t) ? "comment_mention"
              : parentCommentId ? "comment_reply"
              : "comment_posted";
    await createNotification({
      projectId,
      recipientType: tp as any,
      recipientId:   tid,
      kind,
      title: `${authorLabel} commented on ${docName}`,
      body:  String(bodyText).slice(0, 300),
      payload: { document_id: documentId, comment_id: newComment.id, section_key: sectionKey || null },
    });
  }

  return { success: true, comment: newComment };
}

export async function bsResolveComment(body: any): Promise<any> {
  const { id, projectId, resolvedByType, resolvedById, resolvedByLabel, undo } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };

  const payload: any = undo
    ? { resolved: false, resolved_at: null, resolved_by_type: null, resolved_by_id: null, resolved_by_label: null }
    : {
        resolved:          true,
        resolved_at:       new Date().toISOString(),
        resolved_by_type:  resolvedByType || "staff",
        resolved_by_id:    resolvedById || "pm",
        resolved_by_label: resolvedByLabel || "Staff",
      };
  const { error } = await db().from("document_comments")
    .update(payload).eq("id", id).eq("project_id", projectId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function bsDeleteComment(body: any): Promise<any> {
  const { id, projectId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  /* Soft delete preserves thread integrity */
  const { error } = await db().from("document_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id).eq("project_id", projectId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════
   Section 4 — Approval requests
═══════════════════════════════════════════════════════════════ */

export async function bsListApprovals(body: any): Promise<any> {
  const { projectId, documentId, openOnly } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  let q = db().from("document_approvals").select("*").eq("project_id", projectId);
  if (documentId) q = q.eq("document_id", documentId);
  if (openOnly)   q = q.eq("state", "in_review");
  q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, approvals: data || [] };
}

export async function bsRequestApproval(body: any): Promise<any> {
  const {
    documentId, projectId, requestedById, requestedByLabel,
    requestMessage, requestedFromUserId,
  } = body;
  if (!documentId || !projectId) return { success: false, error: "documentId + projectId required" };
  if (!requestedById || !requestedByLabel) return { success: false, error: "PM identifier required" };

  /* Doc must be published; capture current version */
  const { data: doc } = await db().from("project_documents")
    .select("id,project_id,version,published_to_client,name").eq("id", documentId).maybeSingle();
  if (!doc) return { success: false, error: "Document not found" };
  if ((doc as any).project_id !== projectId) return { success: false, error: "Document not on this project" };
  if (!(doc as any).published_to_client) {
    return { success: false, error: "Publish the document before requesting approval." };
  }

  const { data, error } = await db().from("document_approvals").insert({
    document_id:      documentId,
    project_id:       projectId,
    document_version: (doc as any).version || 1,
    requested_by_id:  requestedById,
    requested_by_label: requestedByLabel,
    request_message:  requestMessage ? String(requestMessage).slice(0, 2000) : null,
    requested_from_user_id: requestedFromUserId || null,
    state:            "in_review",
  }).select().single();
  if (error || !data) return { success: false, error: error?.message || "request failed" };

  /* Update doc's approval_state to in_review */
  await db().from("project_documents").update({ approval_state: "in_review" }).eq("id", documentId);

  /* Notify the target user (specific) or all approve-level grant holders */
  const docName = (doc as any).name || "a document";
  if (requestedFromUserId) {
    await createNotification({
      projectId,
      recipientType: "client", recipientId: requestedFromUserId,
      kind: "approval_requested",
      title: `${requestedByLabel} requested your approval on ${docName}`,
      body:  requestMessage || undefined,
      payload: { document_id: documentId, approval_id: (data as any).id },
    });
  } else {
    /* Any approver — find all client_users with active approve grants on this doc */
    const { data: grants } = await db().from("document_share_grants")
      .select("granted_to_user_id").eq("document_id", documentId)
      .eq("access_level", "approve").eq("revoked", false);
    for (const g of (grants || [])) {
      await createNotification({
        projectId,
        recipientType: "client", recipientId: (g as any).granted_to_user_id,
        kind: "approval_requested",
        title: `${requestedByLabel} requested your approval on ${docName}`,
        body:  requestMessage || undefined,
        payload: { document_id: documentId, approval_id: (data as any).id },
      });
    }
  }

  return { success: true, approval: data };
}

export async function bsRespondApproval(body: any): Promise<any> {
  const {
    id, projectId, decision, responseMessage,
    respondedByUserId, respondedByLabel, linkedCommentId,
  } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  if (!decision || !["approved","needs_changes"].includes(decision)) {
    return { success: false, error: "decision must be approved or needs_changes" };
  }
  if (!respondedByUserId || !respondedByLabel) {
    return { success: false, error: "responder identity required" };
  }

  /* Verify responder has approve access on the doc */
  const { data: approval } = await db().from("document_approvals")
    .select("document_id,project_id,state,requested_by_id,requested_by_label")
    .eq("id", id).maybeSingle();
  if (!approval) return { success: false, error: "Approval request not found" };
  if ((approval as any).project_id !== projectId) return { success: false, error: "Wrong project" };
  if ((approval as any).state !== "in_review") {
    return { success: false, error: "This approval is no longer awaiting response." };
  }
  const acc = await getEffectiveAccess({
    projectId, documentId: (approval as any).document_id,
    userType: "client", userId: respondedByUserId,
  });
  if (acc !== "approve") {
    return { success: false, error: "You don't have approve access on this document." };
  }

  const { data, error } = await db().from("document_approvals").update({
    state:                decision,
    responded_by_user_id: respondedByUserId,
    responded_by_label:   respondedByLabel,
    responded_at:         new Date().toISOString(),
    response_message:     responseMessage ? String(responseMessage).slice(0, 2000) : null,
    linked_comment_id:    linkedCommentId || null,
  }).eq("id", id).select().single();
  if (error || !data) return { success: false, error: error?.message || "respond failed" };

  /* Update doc's approval_state */
  await db().from("project_documents").update({ approval_state: decision })
    .eq("id", (approval as any).document_id);

  /* Notify PM */
  const { data: docMeta } = await db().from("project_documents")
    .select("name").eq("id", (approval as any).document_id).maybeSingle();
  const docName = (docMeta as any)?.name || "a document";
  await createNotification({
    projectId,
    recipientType: "staff", recipientId: (approval as any).requested_by_id,
    kind: "approval_responded",
    title: `${respondedByLabel} ${decision === "approved" ? "approved" : "requested changes on"} ${docName}`,
    body:  responseMessage || undefined,
    payload: { document_id: (approval as any).document_id, approval_id: id, decision },
  });

  return { success: true, approval: data };
}

export async function bsCancelApproval(body: any): Promise<any> {
  const { id, projectId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  const { data, error } = await db().from("document_approvals").update({
    state: "cancelled",
    responded_at: new Date().toISOString(),
  }).eq("id", id).eq("project_id", projectId).eq("state", "in_review").select().single();
  if (error || !data) return { success: false, error: error?.message || "cancel failed" };
  /* Roll back doc's approval_state to draft */
  await db().from("project_documents").update({ approval_state: "draft" })
    .eq("id", (data as any).document_id);
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════
   Section 5 — Intake forms
═══════════════════════════════════════════════════════════════ */

const VALID_RESPONSE_TYPES = ["short_text","long_text","multi_choice","single_choice","number","date"];
const VALID_INTAKE_STATUSES = ["draft","open","closed"];

function validateIntakeQuestions(questions: any[]): string | null {
  if (!Array.isArray(questions)) return "questions must be an array";
  const keys = new Set<string>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== "object") return `question[${i}] is not an object`;
    if (!q.key || typeof q.key !== "string") return `question[${i}].key required`;
    if (keys.has(q.key)) return `duplicate question key: ${q.key}`;
    keys.add(q.key);
    if (!q.question_text) return `question[${i}].question_text required`;
    if (!VALID_RESPONSE_TYPES.includes(q.response_type)) {
      return `question[${i}].response_type must be one of: ${VALID_RESPONSE_TYPES.join(", ")}`;
    }
    if ((q.response_type === "multi_choice" || q.response_type === "single_choice") && (!Array.isArray(q.options) || q.options.length === 0)) {
      return `question[${i}] of type ${q.response_type} requires non-empty options`;
    }
  }
  return null;
}

export async function bsListIntakeForms(body: any): Promise<any> {
  const { projectId, status } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  let q = db().from("client_intake_forms").select("*").eq("project_id", projectId);
  if (status) q = q.eq("status", status);
  q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, forms: data || [] };
}

export async function bsUpsertIntakeForm(body: any): Promise<any> {
  const { id, projectId, title, description, status, questions, visibleToRoles, createdBy } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!title || !String(title).trim()) return { success: false, error: "title required" };

  const finalStatus = status || "draft";
  if (!VALID_INTAKE_STATUSES.includes(finalStatus)) {
    return { success: false, error: "invalid status" };
  }
  const qErr = validateIntakeQuestions(questions || []);
  if (qErr) return { success: false, error: qErr };

  let roleList: string[] = Array.isArray(visibleToRoles) ? visibleToRoles : ["client_executive","client_marketing"];
  roleList = roleList.filter((r) => VALID_CLIENT_ROLES.includes(r));
  if (roleList.length === 0) roleList = ["client_executive"];

  const payload: any = {
    project_id:        projectId,
    title:             String(title).slice(0, 300),
    description:       description ? String(description).slice(0, 2000) : null,
    status:            finalStatus,
    questions:         questions || [],
    visible_to_roles:  roleList,
    created_by:        createdBy || null,
  };

  if (id) {
    const { data, error } = await db().from("client_intake_forms")
      .update(payload).eq("id", id).eq("project_id", projectId).select().single();
    if (error || !data) return { success: false, error: error?.message || "update failed" };
    return { success: true, form: data };
  } else {
    const { data, error } = await db().from("client_intake_forms")
      .insert(payload).select().single();
    if (error || !data) return { success: false, error: error?.message || "create failed" };
    return { success: true, form: data };
  }
}

export async function bsDeleteIntakeForm(body: any): Promise<any> {
  const { id, projectId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  const { error } = await db().from("client_intake_forms")
    .delete().eq("id", id).eq("project_id", projectId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function bsListIntakeResponses(body: any): Promise<any> {
  const { projectId, formId, status, pendingReviewOnly } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  let q = db().from("client_intake_responses").select("*").eq("project_id", projectId);
  if (formId) q = q.eq("form_id", formId);
  if (status) q = q.eq("status", status);
  if (pendingReviewOnly) q = q.eq("status", "submitted");
  q = q.order("submitted_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, responses: data || [] };
}

/** Client-side: save/submit responses to a form. */
export async function bsSubmitIntakeResponse(body: any): Promise<any> {
  const { formId, projectId, respondingUserId, responses, isFinalSubmit } = body;
  if (!formId || !projectId || !respondingUserId) {
    return { success: false, error: "formId + projectId + respondingUserId required" };
  }

  /* Validate form is open + user can see it */
  const { data: form } = await db().from("client_intake_forms")
    .select("*").eq("id", formId).eq("project_id", projectId).maybeSingle();
  if (!form) return { success: false, error: "Form not found" };
  if ((form as any).status !== "open") return { success: false, error: "This form is not currently accepting responses." };

  const { data: user } = await db().from("client_users")
    .select("role,active,display_name,email").eq("id", respondingUserId).maybeSingle();
  if (!user) return { success: false, error: "User not found" };
  if (!(user as any).active) return { success: false, error: "Account deactivated" };
  if (!((form as any).visible_to_roles || []).includes((user as any).role)) {
    return { success: false, error: "This form isn't available for your role." };
  }

  /* Check required questions on final submit */
  if (isFinalSubmit) {
    for (const q of ((form as any).questions || [])) {
      if (q.required && !(responses && responses[q.key] && String(responses[q.key]).trim())) {
        return { success: false, error: `Question "${q.question_text}" is required.` };
      }
    }
  }

  /* Upsert response row */
  const { data: existing } = await db().from("client_intake_responses")
    .select("id,status").eq("form_id", formId).eq("responding_user_id", respondingUserId).maybeSingle();

  const newStatus = isFinalSubmit ? "submitted" : "in_progress";
  const submittedAt = isFinalSubmit ? new Date().toISOString() : null;

  if (existing) {
    /* Don't let a PM-reviewed response be overwritten */
    if ((existing as any).status === "pm_reviewed") {
      return { success: false, error: "Your previous submission has already been reviewed. Contact your account manager to update." };
    }
    const { data, error } = await db().from("client_intake_responses").update({
      responses:    responses || {},
      status:       newStatus,
      submitted_at: submittedAt || (existing as any).submitted_at || null,
    }).eq("id", (existing as any).id).select().single();
    if (error || !data) return { success: false, error: error?.message || "submit failed" };

    if (isFinalSubmit) {
      const pm = pmStaffRecipient(projectId);
      await createNotification({
        projectId,
        recipientType: pm.recipientType, recipientId: pm.recipientId,
        kind: "intake_submitted",
        title: `${(user as any).display_name || (user as any).email} submitted "${(form as any).title}"`,
        payload: { form_id: formId, response_id: (data as any).id, responding_user_id: respondingUserId },
      });
    }
    return { success: true, response: data, status: newStatus };
  }

  const { data, error } = await db().from("client_intake_responses").insert({
    form_id:            formId,
    project_id:         projectId,
    responding_user_id: respondingUserId,
    responses:          responses || {},
    status:             newStatus,
    submitted_at:       submittedAt,
  }).select().single();
  if (error || !data) return { success: false, error: error?.message || "submit failed" };

  if (isFinalSubmit) {
    const pm = pmStaffRecipient(projectId);
    await createNotification({
      projectId,
      recipientType: pm.recipientType, recipientId: pm.recipientId,
      kind: "intake_submitted",
      title: `${(user as any).display_name || (user as any).email} submitted "${(form as any).title}"`,
      payload: { form_id: formId, response_id: (data as any).id, responding_user_id: respondingUserId },
    });
  }
  return { success: true, response: data, status: newStatus };
}

/** PM-side: review a submitted response. PM picks which question
 *  responses to apply where. Free-text responses get stored as a
 *  doc_type='intake_response' project_document. Field-mapped responses
 *  go to project_knowledge with source='client_intake' — but only
 *  if the target field is NOT protected (NEVER_OVERWRITE preserved). */
export async function bsReviewIntakeResponse(body: any): Promise<any> {
  const { id, projectId, applyMap, reviewedBy, reviewNotes } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };

  const { data: row } = await db().from("client_intake_responses")
    .select("*").eq("id", id).eq("project_id", projectId).maybeSingle();
  if (!row) return { success: false, error: "Response not found" };
  if ((row as any).status === "pm_reviewed") {
    return { success: false, error: "Already reviewed" };
  }

  /* Get the form to lookup question definitions */
  const { data: form } = await db().from("client_intake_forms")
    .select("*").eq("id", (row as any).form_id).maybeSingle();
  if (!form) return { success: false, error: "Form not found" };

  const { data: respondingUser } = await db().from("client_users")
    .select("display_name,email,role,title,org").eq("id", (row as any).responding_user_id).maybeSingle();
  const providedBy = respondingUser
    ? `${(respondingUser as any).display_name || (respondingUser as any).email}${(respondingUser as any).title ? ` (${(respondingUser as any).title})` : ""}${(respondingUser as any).org ? ` at ${(respondingUser as any).org}` : ""}`
    : "Client";

  const NEVER_OVERWRITE = new Set(["manual","gsc_auto","ga4_auto","seed_migration"]);
  const today = new Date().toISOString().slice(0, 10);
  const results: any[] = [];

  /* Get existing knowledge for the project so we can check NEVER_OVERWRITE */
  const { data: existing } = await db().from("project_knowledge")
    .select("category,field_key,source").eq("project_id", projectId);
  const existingMap = new Map<string, string>();
  for (const r of (existing || [])) {
    existingMap.set(`${(r as any).category}.${(r as any).field_key}`, (r as any).source || "manual");
  }

  const questions = (form as any).questions || [];
  const responses = (row as any).responses || {};

  for (const q of questions) {
    const ans = responses[q.key];
    if (!ans || !String(ans).trim()) continue;

    /* PM-provided override of whether to apply this response */
    const applyDirective = applyMap?.[q.key];
    if (applyDirective?.skip) {
      results.push({ key: q.key, action: "skipped_by_pm" });
      continue;
    }

    /* If question has a target_category + target_field_key, write to project_knowledge */
    const tc = q.target_category;
    const tf = q.target_field_key;
    if (tc && tf) {
      const existingSource = existingMap.get(`${tc}.${tf}`);
      if (existingSource && NEVER_OVERWRITE.has(existingSource)) {
        results.push({
          key: q.key, action: "skipped_protected",
          field: `${tc}.${tf}`, existing_source: existingSource,
        });
        continue;
      }
      try {
        await db().from("project_knowledge").upsert({
          project_id:  projectId,
          category:    tc,
          field_key:   tf,
          field_value: String(ans).slice(0, 5000),
          source:      "client_intake",
          source_name: `Intake: ${(form as any).title} — ${providedBy}`,
          data_date:   today,
          notes:       JSON.stringify({ form_id: (row as any).form_id, response_id: id, question_key: q.key }),
          updated_at:  new Date().toISOString(),
        }, { onConflict: "project_id,category,field_key" });
        results.push({ key: q.key, action: "written_to_dataroom", field: `${tc}.${tf}` });
      } catch (e: any) {
        results.push({ key: q.key, action: "failed", error: e?.message });
      }
    } else {
      /* Free-text response → store as intake_response document */
      const docName = `Intake response: ${q.question_text.slice(0, 80)}`;
      try {
        await db().from("project_documents").insert({
          project_id:    projectId,
          name:          docName,
          doc_type:      "intake_response",
          kind:          "ingested",
          stakeholder_role: (respondingUser as any)?.role || "client_internal",
          confidence:    "medium",
          source_url:    null,
          source_documents: [],
          provided_by:   providedBy,
          uploaded_by_client_user_id: (row as any).responding_user_id,
          client_uploaded: true,
          raw_content:   String(ans).slice(0, 50000),
          published_to_client: false,
          approval_state: "draft",
        });
        results.push({ key: q.key, action: "written_as_document", name: docName });
      } catch (e: any) {
        results.push({ key: q.key, action: "failed", error: e?.message });
      }
    }
  }

  /* Mark response reviewed */
  await db().from("client_intake_responses").update({
    status:           "pm_reviewed",
    pm_reviewed_at:   new Date().toISOString(),
    pm_reviewed_by:   reviewedBy || null,
    pm_review_notes:  reviewNotes || null,
    pm_apply_results: { results },
  }).eq("id", id);

  /* Notify the client that their intake was reviewed */
  if ((row as any).responding_user_id) {
    await createNotification({
      projectId,
      recipientType: "client", recipientId: (row as any).responding_user_id,
      kind: "intake_applied",
      title: `Your intake "${(form as any).title}" has been reviewed`,
      body:  reviewNotes || undefined,
      payload: { form_id: (row as any).form_id, response_id: id },
    });
  }

  const written = results.filter((r) => r.action.startsWith("written")).length;
  const skipped = results.filter((r) => r.action.startsWith("skipped")).length;
  return { success: true, written, skipped, results };
}

/** Client-side helper: list intake forms the user is eligible to fill,
 *  with their current response status. */
export async function bsClientListIntakeForms(body: any): Promise<any> {
  const { projectId, userId, userRole } = body;
  if (!projectId || !userId || !userRole) return { success: false, error: "projectId + userId + userRole required" };

  const { data: forms } = await db().from("client_intake_forms")
    .select("id,title,description,status,questions,visible_to_roles,created_at")
    .eq("project_id", projectId)
    .eq("status", "open");

  const eligible = (forms || []).filter((f: any) => (f.visible_to_roles || []).includes(userRole));
  if (eligible.length === 0) return { success: true, forms: [] };

  /* Pull this user's response status per form */
  const ids = eligible.map((f: any) => f.id);
  const { data: responses } = await db().from("client_intake_responses")
    .select("form_id,status,submitted_at").eq("responding_user_id", userId).in("form_id", ids);
  const respMap = new Map<string, any>();
  for (const r of (responses || [])) respMap.set((r as any).form_id, r);

  return {
    success: true,
    forms: eligible.map((f: any) => ({
      ...f,
      response_status: respMap.get(f.id)?.status || null,
      submitted_at:    respMap.get(f.id)?.submitted_at || null,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════
   Section 6 — Client-uploaded files (via ingest pipeline)
═══════════════════════════════════════════════════════════════ */

/** Client uploads a file. Routed through the existing ingest pipeline
 *  but tagged client_uploaded=true so PM sees it as a draft requiring
 *  extract + publish. Same NEVER_OVERWRITE discipline preserved. */
export async function bsClientUploadFile(body: any): Promise<any> {
  const {
    projectId, uploadingUserId,
    fileName, contentType, contentBase64,
    docType, sourceUrl, providedByOverride,
  } = body;
  if (!projectId || !uploadingUserId) {
    return { success: false, error: "projectId + uploadingUserId required" };
  }

  /* Verify user */
  const { data: user } = await db().from("client_users")
    .select("id,display_name,email,role,title,org,active").eq("id", uploadingUserId).maybeSingle();
  if (!user) return { success: false, error: "User not found" };
  if (!(user as any).active) return { success: false, error: "Account deactivated" };

  const providedBy = providedByOverride || (
    `${(user as any).display_name || (user as any).email}` +
    `${(user as any).title ? ` (${(user as any).title})` : ""}` +
    `${(user as any).org ? ` at ${(user as any).org}` : ""}`
  );

  /* Delegate to existing ingest pipeline — it handles size limits, compression
     for images, format dispatch (PDF/DOCX/XLSX/text), and creates the project_document
     row. We add the client_uploaded markers afterward. */
  const { bsIngestFile } = await import("./brand-studio-ingest.js");
  const ingestResult = await bsIngestFile({
    projectId,
    fileName,
    base64:           contentBase64,
    mimeType:         contentType,
    providedBy,
    stakeholderRole:  (user as any).role,
  });

  if (!ingestResult?.success) return ingestResult;

  /* Stamp the client_uploaded markers + draft status. The existing bsIngestFile
     uses `document` in its response (singular); check both shapes for safety. */
  const docId = ingestResult.document?.id || ingestResult.document_id || ingestResult.documentId;
  if (docId) {
    await db().from("project_documents").update({
      client_uploaded: true,
      uploaded_by_client_user_id: uploadingUserId,
      published_to_client: false,   /* PM must extract + decide to re-publish */
      approval_state: "draft",
    }).eq("id", docId);
  }

  /* Notify PM */
  const pm = pmStaffRecipient(projectId);
  await createNotification({
    projectId,
    recipientType: pm.recipientType, recipientId: pm.recipientId,
    kind: "file_uploaded",
    title: `${providedBy} uploaded ${fileName}`,
    body:  `Pending PM review in Ingest`,
    payload: { document_id: docId, uploading_user_id: uploadingUserId },
  });

  return { success: true, document_id: docId, requires_pm_review: true };
}

/* ═══════════════════════════════════════════════════════════════
   Section 7 — Notifications
═══════════════════════════════════════════════════════════════ */

export async function bsListNotifications(body: any): Promise<any> {
  const { recipientType, recipientId, unreadOnly, projectId, limit } = body;
  if (!recipientType || !recipientId) return { success: false, error: "recipientType + recipientId required" };
  let q = db().from("client_notifications")
    .select("*")
    .eq("recipient_type", recipientType)
    .eq("recipient_id", recipientId);
  if (unreadOnly) q = q.is("read_at", null);
  if (projectId)  q = q.eq("project_id", projectId);
  q = q.order("created_at", { ascending: false }).limit(Math.min(Number(limit) || 30, 100));
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, notifications: data || [] };
}

export async function bsMarkNotificationRead(body: any): Promise<any> {
  const { id, recipientType, recipientId, all } = body;
  if (!recipientType || !recipientId) return { success: false, error: "recipient required" };
  const now = new Date().toISOString();
  let q = db().from("client_notifications").update({ read_at: now })
    .eq("recipient_type", recipientType).eq("recipient_id", recipientId);
  if (id) q = q.eq("id", id);
  else if (!all) return { success: false, error: "Pass id, or all=true" };
  q = q.is("read_at", null);
  const { error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════
   Section 8 — Audit log
═══════════════════════════════════════════════════════════════ */

/** Aggregated activity stream for PM transparency: comments + approvals +
 *  share grants + intake submissions + uploads. Returns chronological merged
 *  list across all client-side activity in a project. */
export async function bsListAuditLog(body: any): Promise<any> {
  const { projectId, limit } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  const cap = Math.min(Number(limit) || 50, 200);

  const [comments, approvals, grants, intake, uploads] = await Promise.all([
    db().from("document_comments")
      .select("id,document_id,author_type,author_id,author_label,body,created_at,deleted_at")
      .eq("project_id", projectId).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(cap),
    db().from("document_approvals")
      .select("id,document_id,state,requested_by_label,responded_by_label,request_message,response_message,created_at,responded_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(cap),
    db().from("document_share_grants")
      .select("id,document_id,access_level,granted_by_label,granted_to_user_id,granted_at,revoked,revoked_at,revoked_by_label")
      .eq("project_id", projectId)
      .order("granted_at", { ascending: false }).limit(cap),
    db().from("client_intake_responses")
      .select("id,form_id,responding_user_id,submitted_at,status")
      .eq("project_id", projectId).not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false }).limit(cap),
    db().from("project_documents")
      .select("id,name,uploaded_by_client_user_id,created_at,client_uploaded")
      .eq("project_id", projectId).eq("client_uploaded", true)
      .order("created_at", { ascending: false }).limit(cap),
  ]);

  const events: any[] = [];

  for (const c of (comments.data || []) as any[]) {
    events.push({
      kind: "comment", id: c.id, document_id: c.document_id,
      actor: c.author_label, body: (c.body || "").slice(0, 200),
      at: c.created_at,
    });
  }
  for (const a of (approvals.data || []) as any[]) {
    events.push({
      kind: a.responded_at ? `approval_${a.state}` : "approval_requested",
      id: a.id, document_id: a.document_id,
      actor: a.responded_by_label || a.requested_by_label,
      body: (a.response_message || a.request_message || "").slice(0, 200),
      at: a.responded_at || a.created_at,
    });
  }
  for (const g of (grants.data || []) as any[]) {
    events.push({
      kind: g.revoked ? "share_revoked" : "share_granted",
      id: g.id, document_id: g.document_id,
      actor: g.revoked ? g.revoked_by_label : g.granted_by_label,
      body: `access_level=${g.access_level}`,
      at: g.revoked ? g.revoked_at : g.granted_at,
    });
  }
  for (const i of (intake.data || []) as any[]) {
    events.push({
      kind: "intake_submitted", id: i.id,
      actor: i.responding_user_id, body: `form ${i.form_id}`,
      at: i.submitted_at,
    });
  }
  for (const u of (uploads.data || []) as any[]) {
    events.push({
      kind: "file_uploaded", id: u.id, document_id: u.id,
      actor: u.uploaded_by_client_user_id, body: u.name,
      at: u.created_at,
    });
  }

  events.sort((a, b) => (new Date(b.at).getTime() - new Date(a.at).getTime()));
  return { success: true, events: events.slice(0, cap) };
}

/* ═══════════════════════════════════════════════════════════════
   Dispatcher (staff actions only — client actions wired via
   brand-studio-client.ts after session_token verification)
═══════════════════════════════════════════════════════════════ */

export async function handleBrandStudioCollab(action: string, body: any): Promise<any | null> {
  switch (action) {
    /* Client user lifecycle */
    case "bs_invite_client_user":         return bsInviteClientUser(body);
    case "bs_list_client_users":          return bsListClientUsers(body);
    case "bs_update_client_user":         return bsUpdateClientUser(body);
    case "bs_revoke_client_user":         return bsRevokeClientUser(body);
    case "bs_redeem_invite":              return bsRedeemInvite(body);  /* public — verified by token */
    /* Sharing */
    case "bs_list_share_grants":          return bsListShareGrants(body);
    case "bs_create_share_grant":         return bsCreateShareGrant(body);
    case "bs_revoke_share_grant":         return bsRevokeShareGrant(body);
    /* Comments */
    case "bs_list_comments":              return bsListComments(body);
    case "bs_post_comment":               return bsPostComment(body);
    case "bs_resolve_comment":            return bsResolveComment(body);
    case "bs_delete_comment":             return bsDeleteComment(body);
    /* Approvals */
    case "bs_list_approvals":             return bsListApprovals(body);
    case "bs_request_approval":           return bsRequestApproval(body);
    case "bs_respond_approval":           return bsRespondApproval(body);
    case "bs_cancel_approval":            return bsCancelApproval(body);
    /* Intake */
    case "bs_list_intake_forms":          return bsListIntakeForms(body);
    case "bs_upsert_intake_form":         return bsUpsertIntakeForm(body);
    case "bs_delete_intake_form":         return bsDeleteIntakeForm(body);
    case "bs_list_intake_responses":      return bsListIntakeResponses(body);
    case "bs_submit_intake_response":     return bsSubmitIntakeResponse(body);
    case "bs_review_intake_response":     return bsReviewIntakeResponse(body);
    case "bs_client_list_intake_forms":   return bsClientListIntakeForms(body);
    /* Uploads */
    case "bs_client_upload_file":         return bsClientUploadFile(body);
    /* Notifications */
    case "bs_list_notifications":         return bsListNotifications(body);
    case "bs_mark_notification_read":     return bsMarkNotificationRead(body);
    /* Audit */
    case "bs_list_audit_log":             return bsListAuditLog(body);
    default: return null;
  }
}
