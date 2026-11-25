/* Hourly (vercel.json crons): reads the team's project folders, emails and Google Chat for open orders through the
   connected team accounts, read-only, and re-checks orders that got new information. */
import { store, cmd } from "./_lib/store.mjs";
import { hourlySync } from "./team.mjs";
export async function GET(request){
  const hdr = { "content-type":"application/json", "cache-control":"no-store" };
  const secret = process.env.CRON_SECRET, auth = request.headers.get("authorization") || "", fromCron = /vercel-cron/i.test(request.headers.get("user-agent") || "");
  if(secret ? auth !== "Bearer " + secret : !fromCron) return new Response(JSON.stringify({ ok:false }), { status:401, headers:hdr });
  if(!store()) return new Response(JSON.stringify({ ok:false }), { status:503, headers:hdr });
  if(await cmd("SET", "bsp:teamsync:lock", "1", "NX", "EX", 1500) !== "OK") return new Response(JSON.stringify({ ok:true, skipped:"running" }), { headers:hdr });
  let done = []; try{ done = await hourlySync(); }finally{ await cmd("DEL", "bsp:teamsync:lock"); }
  return new Response(JSON.stringify({ ok:true, done }), { headers:hdr });
}
