#!/usr/bin/env node
/**
 * install-pm-batch-1.mjs — installs the PM Module backend (batch 1).
 *
 * Run from the repo root. It copies 6 files that you have downloaded
 * into ~/Downloads into their correct locations in the repo.
 *
 *   api/lib/pm-engine.ts            (new — PM server engine)
 *   api/task-engine.ts             (modified — PM dispatch wired in)
 *   src/components/pm/types.ts     (new)
 *   src/components/pm/engine.ts    (new)
 *   src/components/pm/api.ts       (new)
 *   supabase-migrations/pm_module.sql (new — run separately in Supabase)
 *
 * It verifies each source file exists and is non-empty before copying,
 * and aborts without changing anything if a file is missing.
 */
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DL = join(homedir(), 'Downloads');

/* source filename in ~/Downloads  →  destination path in the repo */
const FILES = [
  ['pm-engine.ts',     'api/lib/pm-engine.ts'],
  ['task-engine.ts',   'api/task-engine.ts'],
  ['types.ts',         'src/components/pm/types.ts'],
  ['engine.ts',        'src/components/pm/engine.ts'],
  ['api.ts',           'src/components/pm/api.ts'],
  ['pm_module.sql',    'supabase-migrations/pm_module.sql'],
];

function fail(m) { console.error('✗ ' + m); process.exit(1); }

/* must be at repo root */
if (!existsSync('api') || !existsSync('src') || !existsSync('package.json')) {
  fail('Run this from the repo root (cd /Users/manav909/code/Manav-SEO).');
}

/* pre-flight: every source file present and non-empty */
for (const [src] of FILES) {
  const p = join(DL, src);
  if (!existsSync(p)) fail(`Missing in ~/Downloads: ${src} — download all 6 files first.`);
  if (statSync(p).size === 0) fail(`Empty file in ~/Downloads: ${src} — re-download it.`);
}
console.log('✓ All 6 source files found in ~/Downloads.');

/* copy */
for (const [src, dest] of FILES) {
  const destDir = dest.substring(0, dest.lastIndexOf('/'));
  if (destDir && !existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  copyFileSync(join(DL, src), dest);
  console.log(`  installed  ${dest}`);
}

console.log('\n✓ PM Module batch 1 installed.');
console.log('\nNEXT — two steps:');
console.log('  1. Run supabase-migrations/pm_module.sql in the Supabase SQL editor.');
console.log('  2. Commit & push:');
console.log('       git add -A');
console.log('       git commit -m "feat(pm): project management module — backend"');
console.log('       git push');
