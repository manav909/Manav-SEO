import { createClient, SupabaseClient } from "@supabase/supabase-js";

function makeClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder";
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
