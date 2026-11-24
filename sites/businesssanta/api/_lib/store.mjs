/* Portal storage: the Upstash Redis store connected to this Vercel project, used through its REST API.
   Every key starts with "bsp:" so nothing else in the same store is touched. No npm packages. */
import crypto from "node:crypto";

let CFG;
export function store(){
  if(CFG !== undefined) return CFG;
  const env = process.env, keys = Object.keys(env);
  const url = env.UPSTASH_REDIS_REST_URL || env[keys.find(k => /KV_REST_API_URL$/.test(k))] || "";
  const token = env.UPSTASH_REDIS_REST_TOKEN || env[keys.find(k => /KV_REST_API_TOKEN$/.test(k) && !/READ_ONLY/.test(k))] || "";
  CFG = url && token ? { url:url.replace(/\/$/, ""), token } : null;
  return CFG;
}
async function call(path, body){
  const c = store(); if(!c) throw new Error("Portal storage is not connected");
  const r = await fetch(c.url + path, { method:"POST", headers:{ authorization:"Bearer " + c.token, "content-type":"application/json" }, body:JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if(!r.ok || !j) throw new Error("Storage did not answer (" + r.status + ")");
  return j;
}
/* Our own count of storage commands (the free plan allows 500K a month). Counts are added to the next pipeline
   we send anyway, or sent on their own once 25 build up; a few may be lost when a function shuts down, so it reads "about". */
let PEND = 0;
function meter(n){ PEND += n; if(PEND >= 25){ const c = PEND; PEND = 0; call("/pipeline", meterOps(c)).catch(() => {}); } }
function meterOps(c){ const now = new Date(), k = "bsp:usage:upstash:" + now.toISOString().slice(0, 7), d = "d" + now.toISOString().slice(8, 10);
  return [["HINCRBY", k, "total", String(c + 3)], ["HINCRBY", k, d, String(c + 3)], ["EXPIRE", k, String(60 * 60 * 24 * 400)]]; }
export async function cmd(...args){ meter(1); const j = await call("", args.map(String)); if(j.error) throw new Error(j.error); return j.result; }
export async function pipe(list){ if(!list.length) return []; const c = PEND + list.length; PEND = 0;
  const j = await call("/pipeline", list.map(a => a.map(String)).concat(meterOps(c)));
  return j.slice(0, list.length).map(x => { if(x.error) throw new Error(x.error); return x.result; }); }

export const P = "bsp:";
export const K = {
  brand:id => P + "brand:" + id, brands:P + "brands",
  scans:id => P + "scans:" + id, first:id => P + "first:" + id,
  work:id => P + "work:" + id, todo:id => P + "todo:" + id, conn:id => P + "conn:" + id,
  user:id => P + "user:" + id, users:P + "users",
  link:t => P + "link:" + t, sess:t => P + "sess:" + t,
  usage:(what, ym) => P + "usage:" + what + ":" + ym, rl:k => P + "rl:" + k, cronLock:P + "cron:lock", log:P + "log"
};
export const getJ = async k => { const v = await cmd("GET", k); return v ? JSON.parse(v) : null; };
export const setJ = (k, v, ex) => ex ? cmd("SET", k, JSON.stringify(v), "EX", ex) : cmd("SET", k, JSON.stringify(v));
export async function mgetJ(keys){ if(!keys.length) return []; const v = await cmd("MGET", ...keys); return v.map(x => x ? JSON.parse(x) : null); }
export const listJ = async (k, n) => (await cmd("LRANGE", k, 0, (n || 100) - 1)).map(x => JSON.parse(x));

export const rid = (n) => crypto.randomBytes(n || 24).toString("base64url");
export const slug = s => (String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "brand") + "-" + crypto.randomBytes(2).toString("hex");
export function sameSecret(a, b){
  if(!a || !b) return false;
  const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
export const ym = d => (d || new Date()).toISOString().slice(0, 7);
export async function countSearches(n, why){
  const k = K.usage("serpapi", ym());
  await pipe([["HINCRBY", k, "total", n], ["HINCRBY", k, why || "other", n], ["EXPIRE", k, 60 * 60 * 24 * 400]]);
}

/* Sessions: a random token in an HttpOnly cookie, the session itself kept in storage. */
const COOKIE = "bsp";
export const ADMIN_TTL = 60 * 60 * 12, CLIENT_TTL = 60 * 60 * 24 * 30;
export function cookieOf(request){ const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)bsp=([A-Za-z0-9_-]{20,})/); return m ? m[1] : ""; }
export const setCookie = (tok, ttl) => `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttl}`;
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export async function newSession(s, ttl){ const t = rid(32); await setJ(K.sess(t), Object.assign({ at:new Date().toISOString() }, s), ttl); return t; }
export async function whoIs(request){
  const t = cookieOf(request); if(!t || !store()) return null;
  const s = await getJ(K.sess(t)); if(!s) return null;
  if(s.role === "admin") return { role:"admin", tok:t };
  if(s.role === "client"){
    const u = await getJ(K.user(s.uid));
    if(!u || u.revoked || (u.rev || 1) !== (s.rev || 1)) return null;
    return { role:"client", tok:t, user:u };
  }
  return null;
}
export async function rateLimit(key, max, sec){
  const [n] = await pipe([["INCR", K.rl(key)], ["EXPIRE", K.rl(key), sec, "NX"]]);
  return n > max;
}
