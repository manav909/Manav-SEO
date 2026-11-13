// Phones get the mobile home page at "/" itself, decided at the edge before any cache.
// (The vercel.json header rewrite alone was being skipped for some phone visits, so the page
// fell back to a JavaScript redirect to /home-phone, which cost speed and a canonical warning.)
export const config = { matcher: "/" };

const PHONE = /Mobile|Android|iPhone|iPod/i;

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.searchParams.has("desk")) return;
  if (!PHONE.test(request.headers.get("user-agent") || "")) return;
  url.pathname = "/home-phone";
  return new Response(null, { headers: { "x-middleware-rewrite": url.toString(), "vary": "User-Agent" } });
}
