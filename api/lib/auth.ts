/* ════════════════════════════════════════════════════════════════
   api/lib/auth.ts
   One gate for every API endpoint.

   A request is let through when ANY of these holds:
     • it carries a valid Supabase login (Authorization: Bearer <jwt>),
       which the browser attaches automatically (src/lib/apiAuth.ts);
     • it is the Vercel cron (Authorization: Bearer <CRON_SECRET>);
     • its action is on the endpoint's public list — actions used by pages
       a visitor opens without logging in, each of which checks its own
       share/session token.
   Everything else gets 401.
═══════════════════════════════════════════════════════════════ */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export type AuthResult =
  | { ok: true; kind: "user"; userId: string; email: string | null }
  | { ok: true; kind: "cron" }
  | { ok: true; kind: "public" }
  | { ok: false };

let _client: any = null;
function authClient(): any {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return _client;
}

/* Verified tokens are remembered briefly so a page firing many calls does not
   pay a Supabase round-trip on each one. Never longer than the token itself. */
const verified = new Map<string, { userId: string; email: string | null; until: number }>();
const CACHE_MS = 60_000;

function bearer(req: VercelRequest): string {
  const h = String(req.headers["authorization"] || "");
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function jwtExpiryMs(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch { return 0; }
}

async function verifyUser(token: string): Promise<{ userId: string; email: string | null } | null> {
  const now = Date.now();
  const hit = verified.get(token);
  if (hit && hit.until > now) return hit;

  const client = authClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    const entry = {
      userId: data.user.id,
      email: data.user.email || null,
      until: Math.min(now + CACHE_MS, jwtExpiryMs(token) || now + CACHE_MS),
    };
    if (verified.size > 500) verified.clear();
    verified.set(token, entry);
    return entry;
  } catch { return null; }
}

export function isCronRequest(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET || "";
  return !!secret && bearer(req) === secret;
}

export async function authenticate(
  req: VercelRequest,
  publicActions: ReadonlySet<string> = new Set(),
): Promise<AuthResult> {
  if (isCronRequest(req)) return { ok: true, kind: "cron" };

  const token = bearer(req);
  if (token) {
    const user = await verifyUser(token);
    if (user) return { ok: true, kind: "user", userId: user.userId, email: user.email };
  }

  const action = String((req.body as any)?.action ?? (req.query as any)?.action ?? "");
  if (action && publicActions.has(action)) return { ok: true, kind: "public" };

  return { ok: false };
}

/* Call at the top of a handler: `if (!(await requireAuth(req, res))) return;` */
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
  publicActions?: ReadonlySet<string>,
): Promise<AuthResult | null> {
  if (req.method === "OPTIONS") return { ok: true, kind: "public" };
  const r = await authenticate(req, publicActions);
  if (r.ok) return r;
  res.status(401).json({ error: "Please sign in to use this feature.", code: "unauthorized" });
  return null;
}
