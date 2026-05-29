import { createClient, SupabaseClient } from "@supabase/supabase-js";

function makeClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
  // Try every common name for the service-role key. Falling back to an anon
  // key silently caused Build 10b storage uploads to be denied by RLS
  // because anon-key requests are authenticated as 'anon', not 'service_role'
  // — and the policies (correctly) only grant service_role. If we have to
  // fall back, log loudly so the failure mode is visible.
  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || "";
  const anonKey =
    process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || "";
  const key = serviceKey || anonKey || "placeholder";
  if (!serviceKey && anonKey) {
    console.warn("[db] SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY) is not set — falling back to anon key. Storage uploads and any operation that depends on service_role RLS bypass will fail. Set the service-role key in your Vercel env vars.");
  }
  return createClient(url, key);
}

// One client per invocation — safe in serverless, avoids connection storms
let _instance: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!_instance) _instance = makeClient();
  return _instance;
}

/** Log a Supabase or runtime error to the system_errors table.
 *  Fire-and-forget — never throws, never blocks the caller. */
export async function logError(opts: {
  source:     string;
  action?:    string;
  error:      any;
  projectId?: string;
  metadata?:  Record<string, any>;
}): Promise<void> {
  try {
    await db().from("system_errors").insert({
      source:     opts.source,
      action:     opts.action    || null,
      error_msg:  String(opts.error?.message || opts.error || "unknown"),
      error_code: String(opts.error?.code    || ""),
      project_id: opts.projectId || null,
      metadata:   opts.metadata  || {},
    });
  } catch (_) {
    // never throw from the error logger
  }
}
