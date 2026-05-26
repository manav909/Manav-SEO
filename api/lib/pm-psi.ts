/* ════════════════════════════════════════════════════════════════
   api/lib/pm-psi.ts
   PageSpeed Insights (PSI) API key management.
   No OAuth — just a key stored in project_integrations.
   Actions: psi_status · psi_save_key · psi_validate · psi_remove
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const PROVIDER = "pagespeed";

/* ── Status ──────────────────────────────────────────────────── */
export async function psiStatus(projectId: string): Promise<{
  connected: boolean;
  lastTestedAt?: string;
  lastTestedStatus?: "ok" | "error";
  lastTestedError?: string;
  keyHint?: string;   // last 4 chars of the key, safe to show
}> {
  const { data } = await db().from("project_integrations")
    .select("api_key, status, last_pull_at, last_pull_status, last_pull_error")
    .eq("project_id", projectId).eq("provider", PROVIDER).maybeSingle();
  if (!data) return { connected: false };
  const d = data as any;
  const key: string = d.api_key || "";
  return {
    connected:         d.status === "connected" && key.length > 0,
    lastTestedAt:      d.last_pull_at || undefined,
    lastTestedStatus:  d.last_pull_status === "ok" ? "ok" : d.last_pull_status === "error" ? "error" : undefined,
    lastTestedError:   d.last_pull_error || undefined,
    keyHint:           key.length >= 4 ? `…${key.slice(-4)}` : undefined,
  };
}

/* ── Save key + immediately validate ─────────────────────────── */
export async function psiSaveKey(projectId: string, apiKey: string): Promise<{
  success: boolean;
  valid?: boolean;
  error?: string;
}> {
  const trimmed = (apiKey || "").trim();
  if (!trimmed) return { success: false, error: "API key is required." };

  /* Validate by making a lightweight PSI call */
  const validation = await _validateKey(trimmed);

  /* Upsert regardless — if key is invalid, store it as "error" status
     so the UI can show the error clearly next time */
  const { error: dbErr } = await db().from("project_integrations").upsert({
    project_id:       projectId,
    provider:         PROVIDER,
    api_key:          trimmed,
    status:           validation.valid ? "connected" : "error",
    last_pull_at:     new Date().toISOString(),
    last_pull_status: validation.valid ? "ok" : "error",
    last_pull_error:  validation.error || null,
  }, { onConflict: "project_id,provider" });

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, valid: validation.valid, error: validation.error };
}

/* ── Remove key ──────────────────────────────────────────────── */
export async function psiRemove(projectId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await db().from("project_integrations")
    .delete().eq("project_id", projectId).eq("provider", PROVIDER);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ── Internal: validate key against PSI API ──────────────────── */
async function _validateKey(key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    /* Use a known-fast URL (google.com) to test the key — minimal quota use */
    const testUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    testUrl.searchParams.set("url", "https://www.google.com");
    testUrl.searchParams.set("strategy", "mobile");
    testUrl.searchParams.set("category", "PERFORMANCE");
    testUrl.searchParams.set("key", key);

    const res = await fetch(testUrl.toString(), { signal: AbortSignal.timeout(20000) });

    if (res.status === 400) {
      /* 400 with a valid-shaped response means the key works but params are off — treat as valid */
      const body = await res.json().catch(() => ({})) as any;
      if (body?.error?.status === "INVALID_ARGUMENT") return { valid: true };
    }
    if (res.status === 403) {
      const body = await res.json().catch(() => ({})) as any;
      const msg = body?.error?.message || "API key invalid or PSI API not enabled";
      return { valid: false, error: msg };
    }
    if (res.status === 429) {
      /* Rate limited — key format is fine, quota hit. Treat as valid. */
      return { valid: true };
    }
    if (!res.ok) return { valid: false, error: `PSI API returned ${res.status}` };

    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: e?.message || "Could not reach PSI API" };
  }
}

/* ── Action router ───────────────────────────────────────────── */
export async function handlePmPsi(action: string, body: any): Promise<any> {
  const { projectId, apiKey } = body || {};

  switch (action) {
    case "psi_status":
      if (!projectId) return { success: false, error: "projectId required" };
      return psiStatus(projectId);

    case "psi_save_key":
      if (!projectId) return { success: false, error: "projectId required" };
      return psiSaveKey(projectId, apiKey);

    case "psi_remove":
      if (!projectId) return { success: false, error: "projectId required" };
      return psiRemove(projectId);

    default:
      return null;
  }
}
