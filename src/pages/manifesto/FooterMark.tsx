/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/FooterMark.tsx
   Quiet closing — brand wordmark, footer line, date stamp.
══════════════════════════════════════════════════════════════════════ */

import type { TFn } from './types';

export function FooterMark({ t }: { t: TFn }) {
  return (
    <footer className="manifesto-footer">
      <div className="footer-brand">SEO SEASON</div>
      <div className="footer-line">{t('footer_line')}</div>
      <div className="footer-date">
        {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
      </div>
    </footer>
  );
}
