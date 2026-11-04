/* Where is the visitor, roughly? Vercel adds these headers at the edge.
   Used only to say "Texas" or "Austin" on the page. Nothing is stored. */
export const config = { runtime: "edge" };
export default function handler(request) {
  const h = request.headers, dec = v => { try { return decodeURIComponent(v || ""); } catch (e) { return v || ""; } };
  const body = JSON.stringify({ country: h.get("x-vercel-ip-country") || "", region: h.get("x-vercel-ip-country-region") || "", city: dec(h.get("x-vercel-ip-city")) });
  return new Response(body, { headers: { "content-type": "application/json", "cache-control": "private, no-store" } });
}
