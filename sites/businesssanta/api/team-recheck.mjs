/* Every 10 minutes (vercel.json crons): orders whose group got a person's message, or whose files were edited, after the last check are
   read again from current sources and judged again, so the group message and the portal always follow the newest word. */
import { store, cmd } from "./_lib/store.mjs";
import { recheckStale } from "./team.mjs";
export async function GET(request){
  const hdr = { "content-type":"application/json", "cache-control":"no-store" };
  const secret = process.env.CRON_SECRET, auth = request.headers.get("authorization") || "", fromCron = /vercel-cron/i.test(request.headers.get("user-agent") || "");
  if(secret ? auth !== "Bearer " + secret : !fromCron) return new Response(JSON.stringify({ ok:false }), { status:401, headers:hdr });
  if(!store()) return new Response(JSON.stringify({ ok:false }), { status:503, headers:hdr });
  if(await cmd("SET", "bsp:teamrecheck:lock", "1", "NX", "EX", 290) !== "OK") return new Response(JSON.stringify({ ok:true, skipped:"running" }), { headers:hdr });
  let done = []; try{ done = await recheckStale(); }finally{ await cmd("DEL", "bsp:teamrecheck:lock"); }
  return new Response(JSON.stringify({ ok:true, done }), { headers:hdr });
}
