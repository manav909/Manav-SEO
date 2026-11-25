/* Daily at 10:17 UTC (vercel.json crons): re-checks every client business whose last check is 7 or more days old.
   At most 6 businesses a run, 3 at a time, so SerpAPI and Google's speed test are never rushed. */
import { store, cmd, K, mgetJ, pipe } from "./_lib/store.mjs";
import { scanBrand, googleSync } from "./portal.mjs";
import { status as gStatus } from "./_lib/google.mjs";
import { recheckDue } from "./team.mjs";

const DAY = 864e5;
export async function GET(request){
  const hdr = { "content-type":"application/json", "cache-control":"no-store" };
  const secret = process.env.CRON_SECRET, auth = request.headers.get("authorization") || "";
  const fromCron = /vercel-cron/i.test(request.headers.get("user-agent") || "");
  if(secret ? auth !== "Bearer " + secret : !fromCron) return new Response(JSON.stringify({ ok:false }), { status:401, headers:hdr });
  if(!store()) return new Response(JSON.stringify({ ok:false, error:"storage not connected" }), { status:503, headers:hdr });
  const got = await cmd("SET", K.cronLock, new Date().toISOString(), "NX", "EX", 3000);
  if(got !== "OK") return new Response(JSON.stringify({ ok:true, skipped:"already running" }), { headers:hdr });
  const ids = await cmd("SMEMBERS", K.brands), now = Date.now();
  const due = (await mgetJ(ids.map(K.brand))).filter(b => b && b.website && (!b.lastScanAt || now - Date.parse(b.lastScanAt) >= 7 * DAY - 36e5))
    .sort((a, b) => Date.parse(a.lastScanAt || 0) - Date.parse(b.lastScanAt || 0)).slice(0, 6);
  const done = [];
  for(let i = 0; i < due.length; i += 3){
    const r = await Promise.allSettled(due.slice(i, i + 3).map(b => scanBrand(b, "weekly")));
    r.forEach((x, j) => done.push({ id:due[i + j].id, ok:x.status === "fulfilled", searches:x.value ? x.value.searchesUsed : 0, error:x.reason ? String(x.reason.message || x.reason) : "" }));
  }
  // Google accounts: read every business that has one set, daily (cheap: a few Google API calls each, no SerpAPI)
  const gdone = [];
  if((await gStatus()).connected){
    const all = (await mgetJ(ids.map(K.brand))).filter(b => b && (b.gscSite || b.ga4Property || b.gbpLocation));
    for(const b of all){ try{ const r = await googleSync(b); gdone.push({ id:b.id, ok:r.ok }); }catch(e){ gdone.push({ id:b.id, error:String(e.message || e).slice(0, 160) }); } }
  }
  // Order desk: recheck delivered orders on their dates (3, 7 and 14 days after delivery)
  let orders = []; try{ orders = await recheckDue(); }catch(e){ orders = ["error: " + String(e.message || e).slice(0, 160)]; }
  await pipe([["LPUSH", K.log, JSON.stringify({ at:new Date().toISOString(), job:"weekly-check", done, google:gdone, orders })], ["LTRIM", K.log, 0, 199], ["DEL", K.cronLock]]);
  return new Response(JSON.stringify({ ok:true, checked:done, google:gdone, orders }), { headers:hdr });
}
