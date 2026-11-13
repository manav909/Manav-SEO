// Phones get the mobile home page at "/" itself, decided at the edge before the static file.
// Vercel serves index.html for "/" before vercel.json rewrites run, so the header rewrite never
// fired and phones fell back to a JavaScript redirect to /home-phone (slow, and a canonical warning).
export const config = { matcher: "/" };

const PHONE = /Mobile|Android|iPhone|iPod/i;
const next = () => new Response(null, { headers: { "x-middleware-next": "1" } });

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.searchParams.has("desk")) return next();
  const ua = request.headers.get("user-agent") || "";
  if (!PHONE.test(ua) && !url.searchParams.has("phonetest")) return next();
  url.pathname = "/home-phone";
  return new Response(null, { headers: { "x-middleware-rewrite": url.toString() } });
}
