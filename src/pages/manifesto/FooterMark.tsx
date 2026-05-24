/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/FooterMark.tsx
   Quiet closing — brand wordmark, footer line, date stamp.

   Date is formatted in the active locale (see locale_code key in
   copy.ts), so the month name renders in the reader's language.
══════════════════════════════════════════════════════════════════════ */

import type { TFn } from './types';

export function FooterMark({ t }: { t: TFn }) {
  const locale = t('locale_code') || 'en-US';
  const date = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  return (
    <footer className="manifesto-footer">
      <div className="footer-brand">SEO SEASON</div>
      <div className="footer-line">{t('footer_line')}</div>
      <div className="footer-date">{date}</div>
    </footer>
  );
}
