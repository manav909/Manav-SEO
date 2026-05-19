#!/usr/bin/env node
/**
 * apply_p0_fixes.mjs — applies 3 P0 fixes to the SEO Season repo.
 * Run from repo root. Each fix asserts pre/post conditions; aborts on mismatch.
 *
 *  FIX 1  task-engine.ts  — delete dead empty `requirements` stub (300s hang)
 *  FIX 2  Audit.tsx       — repoint dead /api/audit-orchestrator → /api/run-analysis
 *  FIX 3  task-engine.ts  — add missing `check_system_health` + `get_revenue_records`
 */
import { readFileSync, writeFileSync } from 'node:fs';

function fail(m) { console.error('✗ FAIL: ' + m); process.exit(1); }
function rd(f)   { try { return readFileSync(f, 'utf8'); } catch { fail(`${f} not found — run from repo root.`); } }

/* ═══ FIX 1 — remove dead requirements stub ═══════════════════════ */
const TE_FILE = 'api/task-engine.ts';
let te = rd(TE_FILE);

const DEAD_STUB =
`  /* ── REQUIREMENTS ── */
  if (action === "requirements") {
    const { card, context = {}, userInputs = {} } = body;

  }

`;
const reqCount = (te.match(/if \(action === "requirements"\)/g) || []).length;
if (reqCount === 2 && te.includes(DEAD_STUB)) {
  te = te.replace(DEAD_STUB, '');
  const after = (te.match(/if \(action === "requirements"\)/g) || []).length;
  if (after !== 1) fail(`FIX1: expected 1 requirements handler after edit, got ${after}`);
  if (!te.includes('const BLUEPRINTS: Record<string, any> = {')) fail('FIX1: real BLUEPRINTS handler missing after edit');
  console.log('✓ FIX 1: removed dead `requirements` stub (2 handlers → 1).');
} else if (reqCount === 1 && !te.includes(DEAD_STUB)) {
  console.log('• FIX 1: already applied — skipping.');
} else {
  fail(`FIX1: unexpected state — ${reqCount} requirements handlers, stub present: ${te.includes(DEAD_STUB)}`);
}

/* ═══ FIX 3 — add check_system_health + get_revenue_records ═══════ */
/* Inserted right before the health_diagnostic comment block. */
const F3_ANCHOR =
`  /* ── HEALTH DIAGNOSTIC (full env + connectivity + Anthropic live test) ──`;

const F3_BLOCK =
`  /* ── CHECK SYSTEM HEALTH (lightweight — AskEmpire status indicator) ── */
  if (action === "check_system_health") {
    const health: any = {
      env_vars_ok: !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && !!process.env.ANTHROPIC_API_KEY,
      can_reach_anthropic: false,
      can_reach_supabase: false,
    };
    try {
      const { error } = await db().from("brain_learnings").select("id").limit(1);
      health.can_reach_supabase = !error;
    } catch (_e) { health.can_reach_supabase = false; }
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        const _c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const _m = await _c.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
        health.can_reach_anthropic = !!_m;
      }
    } catch (_e) { health.can_reach_anthropic = false; }
    return ok(res, { success: true, health, ts: new Date().toISOString() });
  }

  /* ── GET REVENUE RECORDS (RevenueBI records list) ── */
  if (action === "get_revenue_records") {
    const { projectId, limit = 12 } = body;
    try {
      let q: any = db().from("revenue_records")
        .select("id,amount,record_type,currency,status,period_month,period_year,notes,invoice_number,projects(name)")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(Math.min(Number(limit) || 12, 100));
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q;
      if (error) return ok(res, { success: false, records: [], error: error.message });
      return ok(res, { success: true, records: data || [] });
    } catch (e: any) {
      return ok(res, { success: false, records: [], error: e?.message || "unknown" });
    }
  }

`;

if (te.includes('action === "check_system_health"') || te.includes("action === 'check_system_health'")) {
  console.log('• FIX 3: handlers already present — skipping.');
} else {
  if (!te.includes(F3_ANCHOR)) fail('FIX3: anchor (health_diagnostic comment) not found.');
  if (te.indexOf(F3_ANCHOR) !== te.lastIndexOf(F3_ANCHOR)) fail('FIX3: anchor not unique.');
  te = te.replace(F3_ANCHOR, F3_BLOCK + F3_ANCHOR);
  if (!te.includes('action === "check_system_health"')) fail('FIX3: insertion did not land.');
  if (!te.includes('action === "get_revenue_records"')) fail('FIX3: get_revenue_records did not land.');
  console.log('✓ FIX 3: added check_system_health + get_revenue_records handlers.');
}

writeFileSync(TE_FILE, te, 'utf8');

/* ═══ FIX 2 — Audit.tsx: repoint dead orchestrator endpoint ═══════ */
const AU_FILE = 'src/pages/Audit.tsx';
let au = rd(AU_FILE);

const F2_OLD = `      const res = await fetch('/api/audit-orchestrator', {`;
const F2_NEW = `      const res = await fetch('/api/run-analysis', {`;

if (au.includes(F2_NEW) && !au.includes(F2_OLD)) {
  console.log('• FIX 2: already applied — skipping.');
} else if (au.includes(F2_OLD)) {
  if (au.indexOf(F2_OLD) !== au.lastIndexOf(F2_OLD)) fail('FIX2: orchestrator fetch not unique.');
  au = au.replace(F2_OLD, F2_NEW);
  if (!au.includes(F2_NEW)) fail('FIX2: repoint did not land.');
  if (au.includes("/api/audit-orchestrator")) fail('FIX2: a stale audit-orchestrator reference remains.');
  writeFileSync(AU_FILE, au, 'utf8');
  console.log('✓ FIX 2: Audit.tsx orchestrator → /api/run-analysis.');
} else {
  fail('FIX2: neither old nor new orchestrator fetch found — Audit.tsx differs from expected.');
}

console.log('\n✓ All P0 fixes processed.');
