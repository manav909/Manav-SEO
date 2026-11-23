#!/usr/bin/env node
/* Locks the advanced panel snapshot with the portal's public key and pushes it to the portal-data branch.
   Usage: node tools/portal-sync/push.mjs snapshot.json [--dry]
   snapshot.json: { "at": ISO time, "cr": { "docs": { "meta/x": {...} }, "cols": { "name": [ { "id", "data" } ] } }, "cc": { same } }
   The branch holds only the locked file, so nothing readable is ever public. Vercel skips this branch. */
import crypto from "node:crypto"; import zlib from "node:zlib"; import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process";
const here = path.dirname(new URL(import.meta.url).pathname), [file, flag] = process.argv.slice(2);
if(!file){ console.error("Give the snapshot file"); process.exit(1); }
const snap = JSON.parse(fs.readFileSync(file, "utf8"));
for(const p of ["cr", "cc"]){ snap[p] = snap[p] || {}; snap[p].docs = snap[p].docs || {}; snap[p].cols = snap[p].cols || {}; }
snap.at = snap.at || new Date().toISOString();
const { pub, fp } = JSON.parse(fs.readFileSync(path.join(here, "hq.pub.json"), "utf8"));
const PFX = Buffer.from("302a300506032b656e032100", "hex"), raw = Buffer.from(pub, "base64url");
if(crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16) !== fp){ console.error("Public key does not match its fingerprint"); process.exit(1); }
const eph = crypto.generateKeyPairSync("x25519"), epk = eph.publicKey.export({ format:"der", type:"spki" }).subarray(12);
const shared = crypto.diffieHellman({ privateKey:eph.privateKey, publicKey:crypto.createPublicKey({ key:Buffer.concat([PFX, raw]), format:"der", type:"spki" }) });
const key = Buffer.from(crypto.hkdfSync("sha256", shared, epk, Buffer.from("bsp-hq-v1"), 32)), iv = crypto.randomBytes(12);
const c = crypto.createCipheriv("aes-256-gcm", key, iv), body = zlib.gzipSync(Buffer.from(JSON.stringify(snap)), { level:9 });
const ct = Buffer.concat([c.update(body), c.final()]);
const box = { v:1, fp, at:snap.at, epk:epk.toString("base64url"), iv:iv.toString("base64url"), tag:c.getAuthTag().toString("base64url"), ct:ct.toString("base64") };
const counts = p => Object.keys(snap[p].docs).length + " docs, " + Object.entries(snap[p].cols).map(([k, v]) => k + " " + v.length).join(", ");
console.log("Snapshot " + snap.at + ": " + (JSON.stringify(snap).length / 1024).toFixed(0) + " KB, locked " + (ct.length / 1024).toFixed(0) + " KB");
console.log("  Control Room: " + counts("cr")); console.log("  Command Center: " + counts("cc"));
if(flag === "--dry"){ fs.writeFileSync(file + ".enc.json", JSON.stringify(box)); console.log("Dry run: wrote " + file + ".enc.json"); process.exit(0); }
const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd:here, encoding:"utf8" }).trim();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-data-"));
fs.writeFileSync(path.join(dir, "hq.enc.json"), JSON.stringify(box));
fs.mkdirSync(path.join(dir, "sites/businesssanta"), { recursive:true });
fs.writeFileSync(path.join(dir, "sites/businesssanta/vercel.json"), JSON.stringify({ git:{ deploymentEnabled:false } }, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "README.md"), "Locked data for the Business Santa portal's advanced panel. Only the portal can open it. Replaced on every sync.\n");
const g = (...a) => execFileSync("git", a, { cwd:dir, stdio:"pipe", encoding:"utf8" });
g("init", "-q", "-b", "portal-data"); g("add", "-A");
g("-c", "user.name=Portal mirror", "-c", "user.email=seo@businesssanta.com", "commit", "-q", "-m", "Portal snapshot " + snap.at);
g("push", "-q", "--force", remote, "portal-data:portal-data");
console.log("Pushed to portal-data");
