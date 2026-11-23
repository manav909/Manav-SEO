/* Business Santa client portal: live preview from public information.
   Google Maps data is read only when this project has SERPAPI_KEY and the sales code matches PORTAL_DEMO_CODE.
   Nothing about the business is stored here; only a count of Google searches used this month. */
import { runScan } from "./_lib/scan.mjs";
import { store, countSearches } from "./_lib/store.mjs";

const HDR = { "content-type":"application/json", "cache-control":"private, no-store", "x-robots-tag":"noindex" };
async function handle(request){
  const u = new URL(request.url); let body = {};
  if(request.method === "POST"){ try{ body = await request.json(); }catch(e){ body = {}; } }
  const q = Object.assign(Object.fromEntries(u.searchParams.entries()), body || {});
  const codeOk = !!(process.env.PORTAL_DEMO_CODE && String(q.code || request.headers.get("x-demo-code") || "") === process.env.PORTAL_DEMO_CODE);
  const d = await runScan(q, { withGoogle:codeOk });
  if(!d.ok) return new Response(JSON.stringify(d), { status:400, headers:HDR });
  if(d.searchesUsed && store()) await countSearches(d.searchesUsed, "preview").catch(() => {});
  return new Response(JSON.stringify(d), { status:200, headers:HDR });
}
export async function GET(request){ return handle(request); }
export async function POST(request){ return handle(request); }
