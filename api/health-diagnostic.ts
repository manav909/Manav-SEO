import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // This endpoint tells us exactly which env vars exist in the Vercel runtime
  const envCheck = {
    SUPABASE_URL:           !!process.env.SUPABASE_URL,
    VITE_SUPABASE_URL:      !!process.env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY:      !!process.env.SUPABASE_ANON_KEY,
    VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_KEY:   !!process.env.SUPABASE_SERVICE_KEY,
    ANTHROPIC_API_KEY:      !!process.env.ANTHROPIC_API_KEY,
    JINA_API_KEY:           !!process.env.JINA_API_KEY,
    NODE_VERSION:           process.version,
  };
  
  // Also test if createClient works
  let dbResult = "not tested";
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    if (!url) { dbResult = "ERROR: No SUPABASE_URL or VITE_SUPABASE_URL set"; }
    else {
      const sb = createClient(url, key);
      const { error } = await sb.from("brain_learnings").select("id").limit(1);
      dbResult = error ? "DB reachable but error: " + error.message : "DB OK";
    }
  } catch(e: any) { dbResult = "createClient threw: " + e.message; }
  
  return res.status(200).json({ env: envCheck, db: dbResult, ts: new Date().toISOString() });
}
