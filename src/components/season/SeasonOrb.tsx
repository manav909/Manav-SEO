/* ════════════════════════════════════════════════════════════════
   src/components/season/SeasonOrb.tsx
   Phase 8b — The Orb. Floating presence in the corner of every page.

   Design language:
     • Soft glowing sphere, mood-colored
     • Pulses at mood-specific rhythm
     • Always-visible (toggleable in settings)
     • Click to summon modal
     • Long-press to see quick mood tooltip
     • Cmd+K hint on hover
     • Repositionable (corner-snap)
     • Drag offset persists in localStorage

   It NEVER pops up unprompted. NEVER blinks for attention. Quiet
   presence. Like JARVIS on standby — there but not in the way.
═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSeason, SeasonMood } from '@/contexts/SeasonContext';

/* ─── Mood profile — drives color, pulse speed, glow intensity ─── */

interface MoodProfile {
  label:         string;
  ringHsl:       string;  // hue/saturation/lightness for the outer ring
  coreHsl:       string;  // inner glowing core
  pulseDuration: number;  // seconds per pulse cycle
  intensity:     number;  // 0-1 brightness multiplier
}

const MOOD_PROFILES: Record<SeasonMood, MoodProfile> = {
  calm:         { label: 'Calm',         ringHsl: '186 80% 55%', coreHsl: '186 70% 65%', pulseDuration: 8.0, intensity: 0.55 },
  focused:      { label: 'Focused',      ringHsl: '262 75% 60%', coreHsl: '262 70% 68%', pulseDuration: 4.0, intensity: 0.70 },
  alert:        { label: 'Alert',        ringHsl: '38 92% 55%',  coreHsl: '38 90% 62%',  pulseDuration: 2.2, intensity: 0.80 },
  critical:     { label: 'Critical',     ringHsl: '0 75% 55%',   coreHsl: '0 75% 62%',   pulseDuration: 3.0, intensity: 0.85 },
  celebrating:  { label: 'Celebrating',  ringHsl: '152 70% 50%', coreHsl: '152 65% 58%', pulseDuration: 1.4, intensity: 0.90 },
  thinking:     { label: 'Thinking',     ringHsl: '210 80% 60%', coreHsl: '262 70% 65%', pulseDuration: 1.6, intensity: 0.75 },
  quiet:        { label: 'Standing by',  ringHsl: '210 15% 40%', coreHsl: '210 15% 50%', pulseDuration: 6.0, intensity: 0.40 },
};

/* ─── Position helpers ─── */

const POSITION_STYLES: Record<'br' | 'bl' | 'tr' | 'tl', React.CSSProperties> = {
  br: { right: 24, bottom: 24 },
  bl: { left:  24, bottom: 24 },
  tr: { right: 24, top:    72 },  // leave room for top nav
  tl: { left:  24, top:    72 },
};

/* ─── The Orb ─── */

export default function SeasonOrb() {
  const { isOpen, open, mood, orbVisible, orbPosition, setOrbPosition, paused, awareness } = useSeason();
  const [hovering,  setHovering]  = useState(false);
  const [pressed,   setPressed]   = useState(false);
  const longPressTimer            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showLongPress, setShowLongPress] = useState(false);
  const [showQuickTip, setShowQuickTip]   = useState(false);

  /* When orb is hovered, show a small Cmd+K hint after 600ms */
  useEffect(() => {
    if (!hovering) { setShowQuickTip(false); return; }
    const t = setTimeout(() => setShowQuickTip(true), 600);
    return () => clearTimeout(t);
  }, [hovering]);

  /* Modal is open → orb hides (modal owns the surface) */
  if (paused || !orbVisible || isOpen) return null;

  const profile = MOOD_PROFILES[mood] || MOOD_PROFILES.quiet;
  const posStyle = POSITION_STYLES[orbPosition];

  /* Cmd vs Ctrl hint */
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const kbHint = isMac ? '⌘K' : 'Ctrl+K';

  const handlePointerDown = () => {
    setPressed(true);
    longPressTimer.current = setTimeout(() => {
      setShowLongPress(true);
    }, 500);
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    setPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    /* If long-press tip is showing, dismiss without opening */
    if (showLongPress) {
      setShowLongPress(false);
      return;
    }
    /* Normal click — open the modal */
    open();
    e.preventDefault();
  };

  /* Position picker triggered by long-press */
  const moveOrb = (newPos: 'br' | 'bl' | 'tr' | 'tl') => {
    setOrbPosition(newPos);
    setShowLongPress(false);
  };

  return (
    <div
      style={{ position: 'fixed', zIndex: 9998, ...posStyle, pointerEvents: 'none' }}
      aria-label="S.E.A.S.O.N. operator"
    >
      <div style={{ position: 'relative', pointerEvents: 'auto' }}>

        {/* OUTER GLOW — pulses with mood */}
        <motion.div
          animate={{
            scale:   [1, 1.15, 1],
            opacity: [profile.intensity * 0.45, profile.intensity * 0.75, profile.intensity * 0.45],
          }}
          transition={{
            duration: profile.pulseDuration,
            repeat:   Infinity,
            ease:     'easeInOut',
          }}
          style={{
            position:        'absolute',
            inset:           -18,
            borderRadius:    '50%',
            background:      `radial-gradient(circle, hsla(${profile.ringHsl} / 0.55) 0%, hsla(${profile.ringHsl} / 0) 70%)`,
            filter:          'blur(10px)',
            pointerEvents:   'none',
          }}
        />

        {/* INNER RING + CORE */}
        <motion.button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            setPressed(false);
            setHovering(false);
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
          }}
          onPointerEnter={() => setHovering(true)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          animate={{
            scale:   pressed ? 0.94 : 1,
            opacity: 1,
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Open S.E.A.S.O.N. (Cmd+K)"
          style={{
            position:        'relative',
            width:           48,
            height:          48,
            borderRadius:    '50%',
            border:          `1.5px solid hsla(${profile.ringHsl} / 0.6)`,
            background:      `radial-gradient(circle at 35% 30%, hsla(${profile.coreHsl} / 0.85) 0%, hsla(${profile.ringHsl} / 0.35) 60%, hsla(${profile.ringHsl} / 0.15) 100%)`,
            boxShadow:       `0 0 24px hsla(${profile.ringHsl} / ${profile.intensity * 0.5}), 0 0 4px hsla(${profile.ringHsl} / 0.4) inset`,
            cursor:          'pointer',
            padding:         0,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
          }}
        >
          {/* Inner glyph — subtle "S" mark */}
          <motion.div
            animate={{ opacity: [0.6, 0.9, 0.6] }}
            transition={{ duration: profile.pulseDuration * 0.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              fontSize:    11,
              fontWeight:  900,
              letterSpacing: '0.15em',
              color:       'rgba(255,255,255,0.92)',
              textShadow:  `0 0 8px hsla(${profile.ringHsl} / 0.9)`,
              fontFamily:  'ui-monospace, monospace',
            }}>
            S
          </motion.div>

          {/* AWARENESS INDICATOR — tiny dot that appears when S.E.A.S.O.N. knows
              what's on screen. Subtle, top-right of the orb. */}
          {awareness && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 18 }}
              title={awareness.selected
                ? `Aware: ${awareness.page_label || awareness.page} · ${awareness.selected.type}`
                : `Aware: ${awareness.page_label || awareness.page}`}
              style={{
                position: 'absolute',
                top:    -1,
                right:  -1,
                width:  10,
                height: 10,
                borderRadius: '50%',
                background:   `hsl(${profile.ringHsl})`,
                border:       '2px solid rgba(15, 16, 24, 0.95)',
                boxShadow:    `0 0 6px hsla(${profile.ringHsl} / 0.8)`,
                pointerEvents: 'none',
              }}>
              {awareness.selected && (
                <motion.div
                  animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0.1, 0.6] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute',
                    inset:    -4,
                    borderRadius: '50%',
                    border:   `1.5px solid hsla(${profile.ringHsl} / 0.7)`,
                  }}
                />
              )}
            </motion.div>
          )}
        </motion.button>

        {/* HOVER TIP — Cmd+K */}
        <AnimatePresence>
          {showQuickTip && !pressed && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
              style={{
                position:        'absolute',
                bottom:          'calc(100% + 14px)',
                left:            '50%',
                transform:       'translateX(-50%)',
                whiteSpace:      'nowrap',
                background:      'rgba(15, 15, 22, 0.92)',
                border:          `1px solid hsla(${profile.ringHsl} / 0.4)`,
                borderRadius:    8,
                padding:         '6px 10px',
                fontSize:        11,
                color:           'rgba(255,255,255,0.85)',
                backdropFilter:  'blur(8px)',
                pointerEvents:   'none',
                boxShadow:       '0 4px 12px rgba(0,0,0,0.4)',
              }}>
              <span style={{ marginRight: 6, fontFamily: 'ui-monospace, monospace', color: `hsl(${profile.ringHsl})` }}>{kbHint}</span>
              <span>summon S.E.A.S.O.N.</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* LONG-PRESS — mood readout + reposition picker */}
        <AnimatePresence>
          {showLongPress && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 6 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position:        'absolute',
                bottom:          orbPosition.startsWith('b') ? 'calc(100% + 14px)' : undefined,
                top:             orbPosition.startsWith('t') ? 'calc(100% + 14px)' : undefined,
                right:           orbPosition.endsWith('r')   ? 0                  : undefined,
                left:            orbPosition.endsWith('l')   ? 0                  : undefined,
                background:      'rgba(15, 15, 22, 0.96)',
                border:          `1px solid hsla(${profile.ringHsl} / 0.35)`,
                borderRadius:    12,
                padding:         12,
                minWidth:        220,
                backdropFilter:  'blur(12px)',
                boxShadow:       '0 8px 24px rgba(0,0,0,0.5)',
              }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: `hsl(${profile.ringHsl})`, fontWeight: 700, marginBottom: 4 }}>
                S.E.A.S.O.N. · {profile.label}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 12 }}>
                Standing by. Tap to summon, or move me:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {([
                  ['tl', '↖ Top left'],
                  ['tr', 'Top right ↗'],
                  ['bl', '↙ Bottom left'],
                  ['br', 'Bottom right ↘'],
                ] as Array<['br' | 'bl' | 'tr' | 'tl', string]>).map(([pos, label]) => (
                  <button
                    key={pos}
                    onClick={() => moveOrb(pos)}
                    style={{
                      fontSize:     10.5,
                      padding:      '6px 8px',
                      borderRadius: 6,
                      border:       orbPosition === pos
                        ? `1px solid hsla(${profile.ringHsl} / 0.6)`
                        : '1px solid rgba(255,255,255,0.12)',
                      background:   orbPosition === pos
                        ? `hsla(${profile.ringHsl} / 0.15)`
                        : 'transparent',
                      color:        orbPosition === pos
                        ? `hsl(${profile.ringHsl})`
                        : 'rgba(255,255,255,0.7)',
                      cursor:       'pointer',
                      fontWeight:   600,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
