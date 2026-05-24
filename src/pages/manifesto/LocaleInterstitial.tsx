/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/LocaleInterstitial.tsx
   Cultural interstitial blocks distributed along the manifesto length.

   Three variants placed between key chapter pairs to give the page a
   quiet geographic & cultural anchor that shifts with the active
   language. Each renders a tiny SVG motif drawn from the active
   culture's architectural vocabulary, paired with a row of city names
   and a brief maxim about that culture's working mentality.

   Design intent: feather-light, marginal, never loud. The reader who
   pauses to look gets a small reward; the reader who scrolls past
   feels only a faint atmospheric shift. Opacity stays low, type is
   wide-tracked all-caps in serif body for the maxim, sans for cities.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { FEATHER } from './types';
import type { Lang, TFn } from './types';

/* ──────────────────────────────────────────────────────────────────
   Motifs — one minimal SVG per language. Each row is four units of
   the active culture's architectural sign, drawn as hairlines.

   HI · Mughal jaali six-point star within a hexagon
   ES · Andalusian eight-point star (zellige tile)
   FR · Haussmann mansard rooftop with two dormers
   DE · Bauhaus primary geometry (square, circle, triangle, square)
   EN · Operator audit nodes connected by a single rule
   ────────────────────────────────────────────────────────────────── */

function Motif({ lang }: { lang: Lang }) {
  const stroke = 'currentColor';
  const sw = 0.65;

  if (lang === 'hi') {
    // Six-pointed star (two overlapping triangles) inside a hexagon — jaali signature
    const star = (cx: number, cy: number) => {
      const r = 11;
      const hexPts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        hexPts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
      }
      // Two overlapping equilateral triangles forming the six-point star
      const triPts = (offset: number): string => {
        const pts: string[] = [];
        for (let i = 0; i < 3; i++) {
          const a = (2 * Math.PI / 3) * i + offset;
          pts.push(`${(cx + r * 0.78 * Math.cos(a)).toFixed(2)},${(cy + r * 0.78 * Math.sin(a)).toFixed(2)}`);
        }
        return pts.join(' ');
      };
      return (
        <g key={cx} stroke={stroke} strokeWidth={sw} fill="none">
          <polygon points={hexPts.join(' ')} />
          <polygon points={triPts(-Math.PI / 2)} />
          <polygon points={triPts(Math.PI / 6)} />
        </g>
      );
    };
    return (
      <svg viewBox="0 0 240 36" width="100%" height="36" preserveAspectRatio="xMidYMid meet">
        {star(36, 18)}
        {star(96, 18)}
        {star(156, 18)}
        {star(216, 18)}
      </svg>
    );
  }

  if (lang === 'es') {
    // Andalusian eight-point star: two overlapping squares rotated 45°
    const star = (cx: number, cy: number) => {
      const r = 11;
      const sq1: string[] = [];
      const sq2: string[] = [];
      for (let i = 0; i < 4; i++) {
        const a1 = (Math.PI / 2) * i;
        const a2 = (Math.PI / 2) * i + Math.PI / 4;
        sq1.push(`${(cx + r * Math.cos(a1)).toFixed(2)},${(cy + r * Math.sin(a1)).toFixed(2)}`);
        sq2.push(`${(cx + r * Math.cos(a2)).toFixed(2)},${(cy + r * Math.sin(a2)).toFixed(2)}`);
      }
      return (
        <g key={cx} stroke={stroke} strokeWidth={sw} fill="none">
          <polygon points={sq1.join(' ')} />
          <polygon points={sq2.join(' ')} />
          <circle cx={cx} cy={cy} r={2.2} fill={stroke} />
        </g>
      );
    };
    return (
      <svg viewBox="0 0 240 36" width="100%" height="36" preserveAspectRatio="xMidYMid meet">
        {star(36, 18)}
        {star(96, 18)}
        {star(156, 18)}
        {star(216, 18)}
      </svg>
    );
  }

  if (lang === 'fr') {
    // Haussmann mansard rooftop — flat top, sharp mansard angle, two dormers, two chimneys
    const roof = (x: number) => {
      const w = 44;
      // Path: building base, mansard angle, flat top
      const left = x;
      const right = x + w;
      const baseY = 30;
      const mansardY = 14;
      const topY = 10;
      return (
        <g key={x} stroke={stroke} strokeWidth={sw} fill="none">
          {/* Mansard outline */}
          <path d={`M ${left} ${baseY} L ${left} ${mansardY} L ${left + 6} ${topY} L ${right - 6} ${topY} L ${right} ${mansardY} L ${right} ${baseY}`} />
          {/* Dormer windows on the mansard slope */}
          <rect x={left + 11} y={16} width={5} height={6} />
          <rect x={right - 16} y={16} width={5} height={6} />
          {/* Chimneys */}
          <line x1={left + 8}  y1={topY} x2={left + 8}  y2={topY - 4} />
          <line x1={right - 8} y1={topY} x2={right - 8} y2={topY - 4} />
        </g>
      );
    };
    return (
      <svg viewBox="0 0 240 36" width="100%" height="36" preserveAspectRatio="xMidYMid meet">
        {roof(8)}
        {roof(64)}
        {roof(120)}
        {roof(176)}
      </svg>
    );
  }

  if (lang === 'de') {
    // Bauhaus: square, circle, triangle, square — Itten primary geometry, fixed cadence
    return (
      <svg viewBox="0 0 240 36" width="100%" height="36" preserveAspectRatio="xMidYMid meet">
        <g stroke={stroke} strokeWidth={sw} fill="none">
          <rect    x={26}  y={6}  width={22} height={22} />
          <circle  cx={96}  cy={17}  r={11} />
          <polygon points="146,28 167,28 156.5,8" />
          <rect    x={206} y={6}  width={22} height={22} />
        </g>
      </svg>
    );
  }

  // EN — Operator audit nodes: four small squared frames each with a center dot,
  // joined by a single faint hairline rule. The aesthetic is server-rack /
  // network-topology / audit-grade — quiet operator culture.
  return (
    <svg viewBox="0 0 240 36" width="100%" height="36" preserveAspectRatio="xMidYMid meet">
      <g stroke={stroke} strokeWidth={sw} fill="none">
        {/* connecting rule */}
        <line x1={22} y1={18} x2={218} y2={18} strokeWidth={0.4} opacity={0.7} />
        {/* four nodes */}
        {[36, 96, 156, 216].map((cx) => (
          <g key={cx}>
            <rect x={cx - 8} y={10} width={16} height={16} />
            <circle cx={cx} cy={18} r={1.6} fill={stroke} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Shared shell. Centered column, max-width 620, generous vertical
   breathing room, low ink opacity. The block is meant to feel like
   a margin notation in a serious book — not a section divider.
   ────────────────────────────────────────────────────────────────── */

function InterstitialShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.aside
      className="locale-interstitial"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-25%' }}
      transition={{ duration: 1.6, ease: FEATHER }}
    >
      <div className="locale-interstitial-frame">{children}</div>
      <style>{`
        .locale-interstitial {
          padding: 4.5rem 1.5rem;
          display: flex;
          justify-content: center;
        }
        .locale-interstitial-frame {
          max-width: 620px;
          width: 100%;
          color: var(--m-ink-medium);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.6rem;
          opacity: 0.78;
        }
        .locale-maxim {
          font-family: ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 1.05rem;
          line-height: 1.5;
          color: var(--m-ink-strong);
          text-align: center;
          letter-spacing: 0.01em;
        }
        .locale-motif {
          width: 100%;
          max-width: 280px;
          color: var(--m-ink-medium);
          opacity: 0.6;
        }
        .locale-cities {
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: var(--m-ink-soft, var(--m-ink-medium));
          opacity: 0.7;
          text-align: center;
        }
        .locale-rule {
          width: 36px;
          height: 0.5px;
          background: currentColor;
          opacity: 0.35;
          margin: 0.3rem auto;
        }
        .locale-coord {
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 0.6rem;
          letter-spacing: 0.22em;
          color: var(--m-ink-soft, var(--m-ink-medium));
          opacity: 0.55;
          text-transform: uppercase;
        }
      `}</style>
    </motion.aside>
  );
}

/* ──────────────────────────────────────────────────────────────────
   InterstitialA — between Ch04 (Pillars) and Ch05 (Journey).
   Establishes the architectural / cultural feel.
   Layout:
     CITIES  ─  MOTIF  ─  MAXIM
   ────────────────────────────────────────────────────────────────── */
export function InterstitialA({ lang, t }: { lang: Lang; t: TFn }) {
  return (
    <InterstitialShell>
      <div className="locale-cities">{t('locale_cities')}</div>
      <div className="locale-motif"><Motif lang={lang} /></div>
      <div className="locale-maxim">"{t('locale_maxim_1')}"</div>
    </InterstitialShell>
  );
}

/* ──────────────────────────────────────────────────────────────────
   InterstitialB — between Ch08 (Ethics) and Ch09 (Data).
   A civic / discipline beat. Layout swaps to put the maxim first
   so the reader feels a different rhythm at the second pass.
   ────────────────────────────────────────────────────────────────── */
export function InterstitialB({ lang, t }: { lang: Lang; t: TFn }) {
  return (
    <InterstitialShell>
      <div className="locale-maxim">"{t('locale_maxim_2')}"</div>
      <div className="locale-rule" />
      <div className="locale-motif"><Motif lang={lang} /></div>
      <div className="locale-coord">{t('locale_coord')}</div>
    </InterstitialShell>
  );
}

/* ──────────────────────────────────────────────────────────────────
   InterstitialC — between Ch12 (FAQ) and Ch13 (InPractice).
   Sets the pre-dawn working-life mood before the 4:47 AM scene.
   ────────────────────────────────────────────────────────────────── */
export function InterstitialC({ lang, t }: { lang: Lang; t: TFn }) {
  return (
    <InterstitialShell>
      <div className="locale-motif"><Motif lang={lang} /></div>
      <div className="locale-maxim">"{t('locale_maxim_3')}"</div>
      <div className="locale-cities">{t('locale_cities')}</div>
    </InterstitialShell>
  );
}

/* ──────────────────────────────────────────────────────────────────
   LocaleDateline — quiet single-line geographic anchor placed once
   near the top of the manifesto, just under the cold open. Three
   short fields: cities, the coordinate-style locale tag, and the
   working-day label. All current-language.
   ────────────────────────────────────────────────────────────────── */
export function LocaleDateline({ t }: { lang: Lang; t: TFn }) {
  return (
    <motion.aside
      className="locale-dateline"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 0.7 }}
      viewport={{ once: true, margin: '-20%' }}
      transition={{ duration: 1.8, ease: FEATHER }}
    >
      <span className="locale-dateline-cities">{t('locale_cities')}</span>
      <span className="locale-dateline-sep">·</span>
      <span className="locale-dateline-coord">{t('locale_coord')}</span>
      <style>{`
        .locale-dateline {
          display: flex;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.8rem;
          padding: 1.4rem 1.5rem 2.4rem;
          color: var(--m-ink-medium);
        }
        .locale-dateline-cities {
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 0.65rem;
          font-weight: 500;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          opacity: 0.65;
        }
        .locale-dateline-sep {
          opacity: 0.4;
          font-size: 0.65rem;
        }
        .locale-dateline-coord {
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 0.6rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          opacity: 0.55;
        }
      `}</style>
    </motion.aside>
  );
}
