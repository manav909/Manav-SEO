/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/ProgressBar.tsx
   Top progress rail. Fill width tracks scroll progress, fill color
   morphs through seven season hues to match scroll position.
══════════════════════════════════════════════════════════════════════ */

import { motion, useScroll, useTransform } from 'framer-motion';

export function ProgressBar() {
  const { scrollYProgress } = useScroll();

  /* Hue stops align loosely with chapter positions:
       0%     eternal-spring (cold-open)
       12%    winter
       22%    spring
       38%    summer
       55%    monsoon
       75%    autumn
       92%    harvest
       100%   eternal-spring (loop back) */
  const hue = useTransform(
    scrollYProgress,
    [0, 0.12, 0.22, 0.38, 0.55, 0.75, 0.92, 1],
    [188, 210, 142, 38, 218, 22, 48, 188]
  );

  const widthPct = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  const bg       = useTransform(hue, (h) => `hsla(${h}, 75%, 65%, 0.85)`);
  const glow     = useTransform(hue, (h) => `0 0 18px hsla(${h}, 75%, 65%, 0.55)`);

  return (
    <div className="progress-rail" aria-hidden>
      <motion.div
        className="progress-fill"
        style={{ width: widthPct, background: bg, boxShadow: glow }}
      />
    </div>
  );
}
