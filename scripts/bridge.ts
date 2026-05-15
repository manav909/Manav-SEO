#!/usr/bin/env npx tsx
/* ═══════════════════════════════════════════════════════════
   scripts/bridge.ts — Claude Bridge CLI.

   Talks to /api/bridge on your live Vercel deployment.

   Usage:
     bridge ping
     bridge dump                        # runs brain-dump.sh, posts result as kind:'dump'
     bridge post <kind> <title> <file>  # post a file's contents
     bridge note <title> <text>         # quick one-line note
     bridge list [kind] [limit]
     bridge get <id>
     bridge read <id>                   # mark as read
     bridge delete <id>                 # SECRET only

   Env vars (read from .env.bridge in repo root, OR shell env):
     BRIDGE_URL          e.g. https://seoseason.com   (or any /api/bridge host)
     BRIDGE_SECRET       write token (for post/delete)
     BRIDGE_READ_TOKEN   read token  (for list/get; secret also works)

   Run with: npx tsx scripts/bridge.ts <command> [args]
═══════════════════════════════════════════════════════════ */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

/* ── Load .env.bridge from repo root (one var per line, KEY=value), fallback to process.env ── */
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const envPath = resolve(REPO_ROOT, ".env.bridge");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  for (const k of ["BRIDGE_URL", "BRIDGE_SECRET", "BRIDGE_READ_TOKEN"]) {
    if (process.env[k]) env[k] = process.env[k] as string;
  }
  return env;
}

const env = loadEnv();
const BRIDGE_URL        = env.BRIDGE_URL;
const BRIDGE_SECRET     = env.BRIDGE_SECRET     || "";
const BRIDGE_READ_TOKEN = env.BRIDGE_READ_TOKEN || "";

function die(msg: string): never { console.error("✗", msg); process.exit(1); }
if (!BRIDGE_URL) die("BRIDGE_URL not set. Add to .env.bridge or export in shell.");

async function call(action: string, payload: Record<string, any>, useSecret = false): Promise<any> {
  const token = useSecret ? BRIDGE_SECRET : (BRIDGE_READ_TOKEN || BRIDGE_SECRET);
  if (!token) die(`No ${useSecret ? "BRIDGE_SECRET" : "BRIDGE_READ_TOKEN"} configured for action: ${action}`);
  const url = `${BRIDGE_URL.replace(/\/$/, "")}/api/bridge`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { return { error: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` }; }
  return data;
}

const args = process.argv.slice(2);
const cmd  = args[0];

async function main() {
  switch (cmd) {
    case "ping": {
      const r = await fetch(`${BRIDGE_URL.replace(/\/$/, "")}/api/bridge`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ping" }),
      }).then(r => r.json()).catch(e => ({ error: e.message }));
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "dump": {
      console.log("→ Running brain-dump.sh…");
      const dump = execSync(resolve(REPO_ROOT, "scripts/brain-dump.sh"), { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
      const sha = (() => { try { return execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim(); } catch { return "unknown"; } })();
      const branch = (() => { try { return execSync("git branch --show-current", { cwd: REPO_ROOT, encoding: "utf8" }).trim(); } catch { return "unknown"; } })();
      const r = await call("post", {
        kind:       "dump",
        title:      `Brain dump @ ${sha} (${branch})`,
        body:       dump,
        metadata:   { sha, branch, bytes: dump.length, generated_at: new Date().toISOString() },
        created_by: "claude_code",
      }, true);
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "post": {
      const [, kind, title, file] = args;
      if (!kind || !title || !file) die("Usage: bridge post <kind> <title> <file>");
      if (!existsSync(file)) die(`File not found: ${file}`);
      const body = readFileSync(file, "utf8");
      const r = await call("post", { kind, title, body, created_by: "claude_code" }, true);
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "note": {
      const [, title, ...rest] = args;
      const text = rest.join(" ");
      if (!title || !text) die("Usage: bridge note <title> <text>");
      const r = await call("post", { kind: "note", title, body: text, created_by: "claude_code" }, true);
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "respond": {
      const [, title, ...rest] = args;
      const content = rest.join(" ");
      if (!title || !content) die("Usage: bridge respond <title> <text>");
      const tokenEstimate = Math.round(content.length / 4);
      const r = await call("post", {
        kind:       "response",
        title,
        body:       content,
        created_by: "claude_code",
        metadata:   {
          tokens_estimated:           tokenEstimate,
          cumulative_session_cost_usd: null,
        },
      }, true);
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "status": {
      const [, ...rest] = args;
      const text = rest.join(" ");
      if (!text) die("Usage: bridge status <message>");
      const r = await call("post", {
        kind:       "status",
        title:      text,
        body:       text,
        created_by: "claude_code",
        metadata:   { status: "info" },
      }, true);
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "list": {
      const [, kind, limit] = args;
      const r = await call("list", { kind: kind || undefined, limit: limit ? Number(limit) : 25 });
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "get": {
      const [, id] = args;
      if (!id) die("Usage: bridge get <id>");
      const r = await call("get", { id });
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "read": {
      const [, id] = args;
      if (!id) die("Usage: bridge read <id>");
      const r = await call("mark_read", { id, read_by: "claude_code" });
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "delete": {
      const [, id] = args;
      if (!id) die("Usage: bridge delete <id>");
      const r = await call("delete", { id }, true);
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    default:
      console.log(`bridge — Claude Bridge CLI

Commands:
  ping                              health check (no auth)
  dump                              run brain-dump.sh + post as kind:'dump'
  post <kind> <title> <file>        post a file's contents
  note <title> <text>               quick one-line note
  respond <title> <text>            post kind:'response' with token estimate in metadata
  status <message>                  post kind:'status' update
  list [kind] [limit]               list recent messages
  get <id>                          fetch one (full body)
  read <id>                         mark as read
  delete <id>                       delete (SECRET required)

Env (from .env.bridge or shell):
  BRIDGE_URL          ${BRIDGE_URL || "(not set)"}
  BRIDGE_SECRET       ${BRIDGE_SECRET ? "(set)" : "(not set)"}
  BRIDGE_READ_TOKEN   ${BRIDGE_READ_TOKEN ? "(set)" : "(not set)"}
`);
      process.exit(args.length ? 1 : 0);
  }
}

main().catch(e => die(e?.message || String(e)));
