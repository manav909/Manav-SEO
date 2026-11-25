/* Every 10 minutes (vercel.json crons): the order desk answers questions asked to it in project groups. */
import { store, cmd } from "./_lib/store.mjs";
import { chatAnswers } from "./team.mjs";
export async function GET(request){
  const hdr = { "content-type":"application/json", "cache-control":"no-store" };
  const secret = process.env.CRON_SECRET, auth = request.headers.get("authorization") || "", fromCron = /vercel-cron/i.test(request.headers.get("user-agent") || "");
  if(secret ? auth !== "Bearer " + secret : !fromCron) return new Response(JSON.stringify({ ok:false }), { status:401, headers:hdr });
  if(!store()) return new Response(JSON.stringify({ ok:false }), { status:503, headers:hdr });
  if(await cmd("SET", "bsp:teamchat:lock", "1", "NX", "EX", 600) !== "OK") return new Response(JSON.stringify({ ok:true, skipped:"running" }), { headers:hdr });
  let done = ""; try{ done = await chatAnswers(); }finally{ await cmd("DEL", "bsp:teamchat:lock"); }
  return new Response(JSON.stringify({ ok:true, done }), { headers:hdr });
}
