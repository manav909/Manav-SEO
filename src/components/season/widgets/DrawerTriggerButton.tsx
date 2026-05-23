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
      title="Command settings (⌘.)"
      className="fixed bottom-6 right-6 z-30 w-10 h-10 rounded-full bg-card border border-border/60 backdrop-blur-sm flex items-center justify-center text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/40 hover:bg-cyan-500/[0.05] shadow-lg transition-colors">
      <Settings className="h-4 w-4" />
    </motion.button>
  );
}
