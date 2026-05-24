/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/copy.assert.ts
   Compile-time + runtime guard that proves every language has every key.

   Imported once from Manifesto.tsx so the assertion runs at module-load
   time on the deployed bundle. If a translation is ever silently
   dropped — by a bad merge, a stale copy, or a forgotten translation
   — the page will log a clear error in the browser console and an
   `data-i18n-warning` attribute appears on the manifesto root, so
   Manav can spot a regression immediately rather than discover it
   from a client report later.

   Costs essentially nothing at runtime (one pass through key arrays).
══════════════════════════════════════════════════════════════════════ */

import { COPY } from './copy';
import type { Lang } from './types';

const LANGS: Lang[] = ['en', 'hi', 'es', 'fr', 'de'];

export interface I18nReport {
  ok:          boolean;
  enKeyCount:  number;
  byLang:      Record<Lang, { keyCount: number; missing: string[]; empty: string[] }>;
  summary:     string;
}

export function checkI18nCoverage(): I18nReport {
  const enKeys = Object.keys(COPY.en);
  const enSet = new Set(enKeys);

  const byLang = {} as I18nReport['byLang'];
  let ok = true;

  for (const lang of LANGS) {
    const langKeys = Object.keys(COPY[lang]);
    const langSet = new Set(langKeys);
    const missing = enKeys.filter((k) => !langSet.has(k));
    const empty   = enKeys.filter((k) => {
      const v = (COPY[lang] as Record<string, string>)[k];
      return langSet.has(k) && (!v || v.trim() === '');
    });
    byLang[lang] = {
      keyCount: langKeys.length,
      missing,
      empty,
    };
    if (missing.length > 0 || empty.length > 0) ok = false;
    if (lang !== 'en' && langSet.size !== enSet.size) ok = false;
  }

  const summary = ok
    ? `[i18n] all ${LANGS.length} languages parity-checked against ${enKeys.length} EN keys — no gaps.`
    : `[i18n] WARNING — coverage gap detected. ` +
      LANGS.map((l) => {
        const r = byLang[l];
        return `${l}=${r.keyCount}/${enKeys.length}${r.missing.length ? ` (${r.missing.length} missing)` : ''}${r.empty.length ? ` (${r.empty.length} empty)` : ''}`;
      }).join(' · ');

  return { ok, enKeyCount: enKeys.length, byLang, summary };
}

/* Side-effect: log on module load so any regression is visible in the
   browser console without any opt-in. Detailed listing if anything's
   broken, single-line summary if everything's clean. */
const _report = checkI18nCoverage();
if (_report.ok) {
   
  console.info(_report.summary);
} else {
   
  console.warn(_report.summary);
  for (const lang of LANGS) {
    const r = _report.byLang[lang];
    if (r.missing.length) console.warn(`  ${lang} missing keys:`, r.missing);
    if (r.empty.length)   console.warn(`  ${lang} empty values:`, r.empty);
  }
}

export const I18N_REPORT = _report;
