/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/TopBar.tsx
   Fixed top bar. Brand wordmark on the left, language picker and
   close button on the right. Backdrop-blurred for legibility over
   any season.
══════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Globe, ChevronDown } from 'lucide-react';
import type { Lang, TFn } from './types';
import { FEATHER } from './types';
import { LANG_LABEL } from './copy';

export function TopBar({
  lang, setLang, t, onExit,
}: {
  lang:    Lang;
  setLang: (l: Lang) => void;
  t:       TFn;
  onExit:  () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <span className="top-brand">SEO SEASON</span>
        <span className="top-divider">·</span>
        <span className="top-bar-label">{t('nav_label')}</span>
      </div>

      <div className="top-bar-right">
        <div className="lang-control">
          <button
            onClick={() => setOpen(!open)}
            className="lang-trigger"
            aria-label="Change language"
            aria-expanded={open}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{LANG_LABEL[lang]}</span>
            <ChevronDown className={`h-3 w-3 lang-chevron ${open ? 'lang-chevron-open' : ''}`} />
          </button>
          {open && (
            <motion.div
              className="lang-menu"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: FEATHER }}
            >
              {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => { setLang(l); setOpen(false); }}
                  className={`lang-option ${l === lang ? 'lang-option-active' : ''}`}
                >
                  {LANG_LABEL[l]}
                </button>
              ))}
              <div className="lang-note">{t('lang_note')}</div>
            </motion.div>
          )}
        </div>

        <button onClick={onExit} className="top-exit" aria-label={t('back')}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
