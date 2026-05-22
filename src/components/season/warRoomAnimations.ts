/* ════════════════════════════════════════════════════════════════════
   src/components/season/warRoomAnimations.ts
   Phase 21 — Block 2.11 Phase A — Animation language

   The whole War Room (Casual + Pro) shares one physics model:
     • cubic-bezier(0.16, 1, 0.3, 1) — settles like a feather
     • 350-500ms major transitions, 180-220ms hovers
     • 50ms cascade stagger between sequential items
     • Exit: opacity + 6px y-shift, 200ms
     • Never bounce, never spring, never snap

   Importing these constants keeps the page consistent end-to-end.
══════════════════════════════════════════════════════════════════════ */

import type { Variants } from 'framer-motion';

export const FEATHER_EASE = [0.16, 1, 0.3, 1] as const;

export const DURATION = {
  hover:        0.18,    // 180ms — micro feedback
  hover_long:   0.22,    // 220ms — hover with state change
  short:        0.30,    // 300ms — small reveals
  major:        0.40,    // 400ms — primary card reveals
  major_long:   0.50,    // 500ms — mode switches, large surface changes
  exit:         0.20,    // 200ms — graceful unmount
} as const;

export const STAGGER = {
  cascade:      0.05,    // 50ms between sibling cards
  cascade_slow: 0.08,    // 80ms for action buttons
} as const;

/* Variants — drop-in for motion components */

export const featherSettleVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.major, ease: FEATHER_EASE },
  },
  exit: {
    opacity: 0,
    y: 6,
    transition: { duration: DURATION.exit, ease: FEATHER_EASE },
  },
};

export const cascadeContainerVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: STAGGER.cascade,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 1,
    transition: {
      staggerChildren: STAGGER.cascade,
      staggerDirection: -1,
    },
  },
};

export const cascadeItemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.short, ease: FEATHER_EASE },
  },
  exit: {
    opacity: 0,
    y: 4,
    transition: { duration: DURATION.exit, ease: FEATHER_EASE },
  },
};

export const modeSwitchVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DURATION.major_long, ease: FEATHER_EASE },
  },
  exit: {
    opacity: 0,
    transition: { duration: DURATION.exit, ease: FEATHER_EASE },
  },
};

/* For inline panels that scale-in subtly without lifting */
export const calmRevealVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DURATION.major, ease: FEATHER_EASE },
  },
  exit: {
    opacity: 0,
    transition: { duration: DURATION.exit, ease: FEATHER_EASE },
  },
};

/* Convenience: standard "appears settling" motion props for inline use */
export const featherAppear = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 6 },
  transition: { duration: DURATION.major, ease: FEATHER_EASE },
} as const;

export const calmAppear = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: { duration: DURATION.major, ease: FEATHER_EASE },
} as const;
