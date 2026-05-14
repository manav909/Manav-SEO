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
