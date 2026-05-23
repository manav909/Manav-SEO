/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/AmbientCanvas.tsx
   Fixed background atmosphere. Breathes the active season.

   - Radial gradient wash that morphs hue when the active chapter
     changes season (2.2s feather transition).
   - Grain overlay for film texture.
   - Vignette for cinematic edge falloff.
   - Particle field that switches treatment per season:
       snow      slow downward drift (Winter)
       leaf-up   upward float / scale breathe (Spring)
       ray       light beams at varied rotations (Summer)
       rain      vertical streaks (Monsoon)
       leaf-fall rotating downward fall (Autumn)
       gold      glowing motes drift up + scale (Harvest)
       electric  pulsing cyan dots (Eternal Spring)
══════════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Season } from './types';
import { FEATHER } from './types';

export function AmbientCanvas({ season }: { season: Season }) {
  const reduce = useReducedMotion();

  return (
    <div className="ambient-canvas" aria-hidden>
      <motion.div
        className="ambient-wash"
        animate={{
          background: `radial-gradient(ellipse at 30% 20%, hsla(${season.hue}, ${season.sat}%, ${season.light}%, 0.18), transparent 55%), radial-gradient(ellipse at 70% 80%, hsla(${season.hue}, ${Math.max(0, season.sat - 10)}%, ${Math.max(0, season.light - 10)}%, 0.13), transparent 60%)`,
        }}
        transition={{ duration: 2.2, ease: FEATHER }}
      />
      <div className="ambient-grain" />
      <div className="ambient-vignette" />
      {!reduce && <SeasonParticles season={season} />}
    </div>
  );
}

function SeasonParticles({ season }: { season: Season }) {
  const motes = useMemo(() => {
    const count =
      season.particleKind === 'rain' ? 38 :
      season.particleKind === 'electric' ? 26 :
      season.particleKind === 'snow' ? 30 :
      season.particleKind === 'ray' ? 14 : 22;
    return Array.from({ length: count }, () => ({
      x:        Math.random() * 100,
      y:        Math.random() * 100,
      size:     1 + Math.random() * 3,
      depth:    Math.random(),
      duration: 14 + Math.random() * 26,
      delay:    Math.random() * 12,
      drift:    (Math.random() - 0.5) * 30,
      spin:     Math.random() * 360,
    }));
  }, [season.particleKind]);

  return (
    <div className={`particle-field particle-field-${season.particleKind}`} key={season.particleKind}>
      {motes.map((m, i) => {
        const sz = `${m.size}px`;
        const base: React.CSSProperties = {
          left:    `${m.x}%`,
          top:     `${m.y}%`,
          width:   sz,
          height:  sz,
          opacity: 0.2 + m.depth * 0.5,
          filter:  `blur(${(1 - m.depth) * 1.1}px)`,
        };

        switch (season.particleKind) {

          case 'snow':
            return (
              <motion.div
                key={i}
                className="mote mote-snow"
                style={{ ...base, background: 'rgba(240, 248, 255, 0.85)' }}
                animate={{ y: [0, 80, 160], x: [0, m.drift, 0], opacity: [0, 0.6, 0] }}
                transition={{ duration: m.duration, delay: m.delay, repeat: Infinity, ease: 'linear' }}
              />
            );

          case 'rain':
            return (
              <motion.div
                key={i}
                className="mote mote-rain"
                style={{
                  ...base,
                  width:  '1px',
                  height: `${10 + m.depth * 18}px`,
                  background: `linear-gradient(180deg, transparent, hsla(${season.hue}, 65%, 78%, 0.55))`,
                }}
                animate={{ y: [-60, 220] }}
                transition={{ duration: 1.4 + m.depth * 1.6, delay: m.delay * 0.3, repeat: Infinity, ease: 'linear' }}
              />
            );

          case 'leaf-fall':
            return (
              <motion.div
                key={i}
                className="mote mote-leaf"
                style={{
                  ...base,
                  width:  `${4 + m.size * 1.4}px`,
                  height: `${4 + m.size * 1.4}px`,
                  background: `hsl(${season.hue + (i % 3) * 10 - 10}, ${season.sat}%, ${season.light}%)`,
                  borderRadius: '50% 0 50% 0',
                }}
                animate={{ y: [0, 120, 240], x: [0, m.drift, 0], rotate: [m.spin, m.spin + 360] }}
                transition={{ duration: m.duration, delay: m.delay, repeat: Infinity, ease: 'linear' }}
              />
            );

          case 'leaf-up':
            return (
              <motion.div
                key={i}
                className="mote mote-tendril"
                style={{
                  ...base,
                  background: `hsl(${season.hue}, ${season.sat}%, ${season.light}%)`,
                }}
                animate={{ y: [60, -60, -140], opacity: [0, 0.55, 0], scale: [0.8, 1.1, 0.9] }}
                transition={{ duration: m.duration * 0.6, delay: m.delay, repeat: Infinity, ease: 'easeInOut' }}
              />
            );

          case 'ray':
            return (
              <motion.div
                key={i}
                className="mote mote-ray"
                style={{
                  ...base,
                  width:  '2px',
                  height: `${30 + m.depth * 40}px`,
                  background: `linear-gradient(180deg, hsla(${season.hue}, 90%, 70%, 0.4), transparent)`,
                  transformOrigin: 'top',
                  transform: `rotate(${m.spin}deg)`,
                }}
                animate={{ opacity: [0.2, 0.55, 0.2] }}
                transition={{ duration: 5 + m.depth * 3, delay: m.delay, repeat: Infinity, ease: 'easeInOut' }}
              />
            );

          case 'gold':
            return (
              <motion.div
                key={i}
                className="mote mote-gold"
                style={{
                  ...base,
                  background: `hsl(${season.hue}, ${season.sat}%, ${season.light}%)`,
                  boxShadow: `0 0 ${4 + m.depth * 8}px hsla(${season.hue}, 90%, 70%, 0.65)`,
                }}
                animate={{ y: [0, -40, 0], opacity: [0.25, 0.7, 0.25], scale: [1, 1.2, 1] }}
                transition={{ duration: m.duration, delay: m.delay, repeat: Infinity, ease: 'easeInOut' }}
              />
            );

          case 'electric':
          default:
            return (
              <motion.div
                key={i}
                className="mote mote-electric"
                style={{
                  ...base,
                  background: `hsl(${season.hue}, ${season.sat}%, ${season.light}%)`,
                  boxShadow: `0 0 ${6 + m.depth * 10}px hsla(${season.hue}, 80%, 65%, 0.7)`,
                }}
                animate={{ y: [0, -25, 0], opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: m.duration, delay: m.delay, repeat: Infinity, ease: 'easeInOut' }}
              />
            );
        }
      })}
    </div>
  );
}
