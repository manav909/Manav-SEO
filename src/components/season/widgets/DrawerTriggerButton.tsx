/* ════════════════════════════════════════════════════════════════════
   src/components/season/widgets/DrawerTriggerButton.tsx
   Phase 21 — Block 2.14 — Floating bottom-right drawer button

   Pinned bottom-right above the chat area. Also bound to Cmd/Ctrl+. globally.
══════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings } from 'lucide-react';
import { DURATION, FEATHER_EASE } from '../warRoomAnimations';

interface Props {
  onClick: () => void;
}

export default function DrawerTriggerButton({ onClick }: Props) {
  /* Cmd/Ctrl + . opens the drawer. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        onClick();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClick]);

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: DURATION.hover, ease: FEATHER_EASE }}
      title="Customize layout (⌘.)"
      style={{ zIndex: 9997 }}
      className="fixed bottom-24 right-6 w-11 h-11 rounded-full bg-card/90 border border-cyan-500/30 backdrop-blur-sm flex items-center justify-center text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/60 hover:bg-cyan-500/[0.08] shadow-xl shadow-cyan-500/[0.08] transition-colors">
      <Settings className="h-4 w-4" />
      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400/70 animate-pulse" />
    </motion.button>
  );
}
