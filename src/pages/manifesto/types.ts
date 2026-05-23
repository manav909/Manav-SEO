/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/types.ts
   Shared types for the Manifesto codex.
══════════════════════════════════════════════════════════════════════ */

export type Lang = 'en' | 'hi' | 'es' | 'fr' | 'de';

export type SeasonId =
  | 'winter'
  | 'spring'
  | 'summer'
  | 'monsoon'
  | 'autumn'
  | 'harvest'
  | 'eternal-spring';

/* Atmospheric tokens for a single season. */
export interface Season {
  id:           SeasonId;
  hue:          number;     // 0-360
  sat:          number;     // 0-100
  light:        number;     // 0-100
  glyph:        React.ReactNode;
  particleKind: 'snow' | 'leaf-up' | 'ray' | 'rain' | 'leaf-fall' | 'gold' | 'electric';
  labelKey:     string;     // COPY key for season name
  kickerKey:    string;     // COPY key for season kicker line
}

/* Chapter manifest entry — metadata only. */
export interface ChapterDef {
  id:       string;        // DOM id for scrollIntoView + IntersectionObserver
  no:       string;        // '00'..'12' display number
  season:   SeasonId;
  titleKey: string;        // COPY key for chapter title
}

/* Translator function. Looks up `key` in the active language, falls
   back to English, falls back to the key itself. */
export type TFn = (key: string) => string;

/* Easing tokens — kept here so every chapter file shares the same
   motion vocabulary without re-importing from framer-motion. */
export const FEATHER = [0.16, 1, 0.3, 1] as const;
export const SOFT_RISE = { duration: 1.0, ease: FEATHER } as const;
export const LONG_FADE = { duration: 1.4, ease: FEATHER } as const;
