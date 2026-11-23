/* Advanced panel (Manav only): a read-only mirror of the Control Room and Command Center.
   A scheduled task encrypts a snapshot of their data with this portal's public key and pushes it to the
   portal-data branch of the public repo. Only this portal can open it: the private key lives in the portal storage. */
import crypto from "node:crypto";
import zlib from "node:zlib";
import { cmd, getJ, setJ } from "./store.mjs";

const PFX = Buffer.from("302a300506032b656e032100", "hex"), KEY = "bsp:hq:key", CACHE = "bsp:hq:snap";
export const SNAP_URL = "https://raw.githubusercontent.com/manav909/Manav-SEO/portal-data/hq.enc.json";
export async function hqKeys(){
  let k = await getJ(KEY);
  if(!k){
    const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");
    k = { pub:publicKey.export({ format:"der", type:"spki" }).subarray(12).toString("base64url"), priv:privateKey.export({ format:"der", type:"pkcs8" }).toString("base64"), at:new Date().toISOString() };
    const ok = await cmd("SET", KEY, JSON.stringify(k), "NX");
    if(ok !== "OK") k = await getJ(KEY);
  }
  return k;
}
export const fingerprint = pub => crypto.createHash("sha256").update(Buffer.from(pub, "base64url")).digest("hex").slice(0, 16);
export function openBox(box, privB64){
  const priv = crypto.createPrivateKey({ key:Buffer.from(privB64, "base64"), format:"der", type:"pkcs8" });
  const epk = Buffer.from(box.epk, "base64url");
  const shared = crypto.diffieHellman({ privateKey:priv, publicKey:crypto.createPublicKey({ key:Buffer.concat([PFX, epk]), format:"der", type:"spki" }) });
  const key = Buffer.from(crypto.hkdfSync("sha256", shared, epk, Buffer.from("bsp-hq-v1"), 32));
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64url"));
  d.setAuthTag(Buffer.from(box.tag, "base64url"));
  const raw = Buffer.concat([d.update(Buffer.from(box.ct, "base64")), d.final()]);
  return JSON.parse(zlib.gunzipSync(raw).toString("utf8"));
}
export async function hqSnapshot(force){
  if(!force){ const c = await getJ(CACHE); if(c && Date.now() - c.cachedAt < 120000) return c.snap; }
  const r = await fetch(SNAP_URL + "?t=" + Math.floor(Date.now() / 60000), { headers:{ "user-agent":"BusinessSantaPortal/1.0" } });
  if(!r.ok) throw new Error("No snapshot yet (" + r.status + ")");
  const box = await r.json(), k = await hqKeys();
  if(box.fp && box.fp !== fingerprint(k.pub)) throw new Error("The snapshot was locked with a different key");
  const snap = openBox(box, k.priv);
  await setJ(CACHE, { cachedAt:Date.now(), snap }, 600).catch(() => {});
  return snap;
}
