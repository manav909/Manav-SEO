/* Meta Conversions API: the page's key events (PageView, ViewContent, Contact, Lead) sent from the server too,
   with the same event id as the Pixel so Meta counts each once. Counts visitors whose browser blocks the Pixel.
   Turned off until META_CAPI_TOKEN is set in Vercel (Project > Settings > Environment Variables).
   Optional: META_TEST_EVENT_CODE to see events in Events Manager > Test events. Nothing is stored here. */
export const config = { runtime: "edge" };

const PIXEL = "28943176985310116";
const ALLOWED = new Set(["PageView", "ViewContent", "Contact", "Lead"]);
const HOSTS = /(^|\.)businesssanta\.com$/;

async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function cookie(h, name) {
  const m = (h.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : undefined;
}

export default async function handler(req) {
  const token = process.env.META_CAPI_TOKEN;
  /* health check: GET /api/capi?verify=1 sends one Test Events-only PageView and reports what Meta answered (never the token) */
  if (req.method === "GET" && new URL(req.url).searchParams.get("verify") === "1") {
    const out = { configured: !!token };
    if (token) {
      try {
        const r = await fetch(`https://graph.facebook.com/v21.0/${PIXEL}/events?access_token=${encodeURIComponent(token)}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test_event_code: "BSVERIFY", data: [{ event_name: "PageView", event_time: Math.floor(Date.now() / 1000), event_id: "verify-" + Date.now(), action_source: "website", event_source_url: "https://www.businesssanta.com/", user_data: { client_ip_address: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "8.8.8.8", client_user_agent: req.headers.get("user-agent") || "check" } }] }),
        });
        const j = await r.json().catch(() => ({}));
        out.meta_status = r.status; out.events_received = j.events_received; if (j.error) out.meta_error = j.error.message;
      } catch (e) { out.meta_error = "could not reach Meta"; }
    }
    return new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  if (req.method !== "POST" || !token) return new Response(null, { status: 204 });
  let b;
  try { b = await req.json(); } catch (e) { return new Response(null, { status: 400 }); }
  if (!b || !ALLOWED.has(b.event) || typeof b.id !== "string") return new Response(null, { status: 400 });
  let url;
  try { url = new URL(b.url); } catch (e) { return new Response(null, { status: 400 }); }
  if (!HOSTS.test(url.hostname)) return new Response(null, { status: 403 });

  const h = req.headers;
  const user = {
    client_ip_address: (h.get("x-forwarded-for") || "").split(",")[0].trim() || undefined,
    client_user_agent: h.get("user-agent") || undefined,
    fbp: cookie(h, "_fbp"),
    fbc: cookie(h, "_fbc") || (url.searchParams.get("fbclid") ? `fb.1.${Date.now()}.${url.searchParams.get("fbclid")}` : undefined),
  };
  const u = b.user || {};
  for (const k of ["em", "ph", "fn", "ct", "st", "country"]) if (u[k]) user[k] = [await sha256(String(u[k]).trim().toLowerCase())];

  const custom = {};
  for (const [k, v] of Object.entries(b.data || {})) if (["string", "number"].includes(typeof v)) custom[k] = String(v).slice(0, 100);

  const payload = { data: [{ event_name: b.event, event_time: Math.floor(Date.now() / 1000), event_id: b.id.slice(0, 40), action_source: "website", event_source_url: url.href.slice(0, 500), user_data: user, custom_data: custom }] };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    await fetch(`https://graph.facebook.com/v21.0/${PIXEL}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
  } catch (e) { }
  return new Response(null, { status: 204 });
}
