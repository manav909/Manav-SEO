/* ════════════════════════════════════════════════════════════════
   api/lib/crypto-box.ts
   Symmetric encryption helpers for storing OAuth refresh tokens
   and other secrets at rest. AES-256-GCM with a single key from
   INTEGRATION_ENCRYPTION_KEY (32 bytes hex-encoded).

   Format on disk: base64(iv || ciphertext || authTag)
   - iv:         12 bytes
   - authTag:    16 bytes
   - ciphertext: variable

   Plaintext input/output is utf-8 string. NEVER log decrypted values.
═══════════════════════════════════════════════════════════════ */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALG  = "aes-256-gcm";
const IV_BYTES  = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY || "";
  if (!k) throw new Error("INTEGRATION_ENCRYPTION_KEY env var is not set");
  /* accept hex (preferred), base64, or raw 32-byte string */
  if (/^[0-9a-f]{64}$/i.test(k)) return Buffer.from(k, "hex");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(k) && k.length === 44) return Buffer.from(k, "base64");
  if (Buffer.byteLength(k, "utf8") === 32) return Buffer.from(k, "utf8");
  throw new Error("INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes (use 64 hex chars).");
}

/** Encrypt a utf-8 string. Returns base64 payload safe for DB storage. */
export function encryptString(plain: string): string {
  if (typeof plain !== "string") throw new Error("plain must be a string");
  const key = getKey();
  const iv  = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

/** Decrypt a payload produced by encryptString(). Throws on tamper. */
export function decryptString(payload: string): string {
  if (!payload) throw new Error("payload required");
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES + 1) throw new Error("payload too short");
  const iv  = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct  = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv(ALG, getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Best-effort decrypt: returns null instead of throwing, so callers
    can treat "token unreadable" as "needs reconnect" without crashing. */
export function safeDecrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try { return decryptString(payload); } catch { return null; }
}
