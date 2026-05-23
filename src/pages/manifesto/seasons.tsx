/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/seasons.tsx
   Seven atmospheric tokens — hue, saturation, particle behavior, icon.
   Each chapter binds to one season; the season drives:
     - background ambient wash hue
     - particle visual treatment (snow / rain / leaves / rays / gold / etc)
     - chapter header accent color
     - left-nav active dot color
     - progress bar segment color
══════════════════════════════════════════════════════════════════════ */

import {
  Snowflake, Leaf, Sun, CloudRain, Flame, Sparkles,
  Infinity as InfinityIcon,
} from 'lucide-react';
import type { Season, SeasonId } from './types';

export const SEASONS: Record<SeasonId, Season> = {
  'winter': {
    id:           'winter',
    hue:          210,
    sat:          32,
    light:        72,
    glyph:        <Snowflake className="h-3 w-3" />,
    particleKind: 'snow',
    labelKey:     'season_winter',
    kickerKey:    'season_kicker_winter',
  },
  'spring': {
    id:           'spring',
    hue:          142,
    sat:          55,
    light:        60,
    glyph:        <Leaf className="h-3 w-3" />,
    particleKind: 'leaf-up',
    labelKey:     'season_spring',
    kickerKey:    'season_kicker_spring',
  },
  'summer': {
    id:           'summer',
    hue:          38,
    sat:          85,
    light:        62,
    glyph:        <Sun className="h-3 w-3" />,
    particleKind: 'ray',
    labelKey:     'season_summer',
    kickerKey:    'season_kicker_summer',
  },
  'monsoon': {
    id:           'monsoon',
    hue:          218,
    sat:          55,
    light:        58,
    glyph:        <CloudRain className="h-3 w-3" />,
    particleKind: 'rain',
    labelKey:     'season_monsoon',
    kickerKey:    'season_kicker_monsoon',
  },
  'autumn': {
    id:           'autumn',
    hue:          22,
    sat:          70,
    light:        60,
    glyph:        <Flame className="h-3 w-3" />,
    particleKind: 'leaf-fall',
    labelKey:     'season_autumn',
    kickerKey:    'season_kicker_autumn',
  },
  'harvest': {
    id:           'harvest',
    hue:          48,
    sat:          85,
    light:        65,
    glyph:        <Sparkles className="h-3 w-3" />,
    particleKind: 'gold',
    labelKey:     'season_harvest',
    kickerKey:    'season_kicker_harvest',
  },
  'eternal-spring': {
    id:           'eternal-spring',
    hue:          188,
    sat:          80,
    light:        65,
    glyph:        <InfinityIcon className="h-3 w-3" />,
    particleKind: 'electric',
    labelKey:     'season_eternal',
    kickerKey:    'season_kicker_eternal',
  },
};
