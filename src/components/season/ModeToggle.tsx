/* ════════════════════════════════════════════════════════════════════
   src/components/season/ModeToggle.tsx
   Phase 21 — Block 2.11 Phase A — Two-mode toggle

   ☕ CASUAL — pre-coffee, calm, centered chat with editorial feed
   🚀 PRO    — back-to-work, full-width war room, every panel visible

   Persisted per user in localStorage; emits change via onChange prop.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { Coffee, Rocket } from 'lucide-react';
import { DURATION, FEATHER_EASE } from './warRoomAnimations';

export type CommandMode = 'casual' | 'pro';

const STORAGE_KEY = 'season:command_mode';

export function readSavedMode(): CommandMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'casual' || v === 'pro') return v;
  } catch { /* swallow */ }
  return 'casual';   // default — first-time users open to calm
}

export function saveMode(mode: CommandMode): void {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* swallow */ }
}

interface Props {
  mode:     CommandMode;
  onChange: (next: CommandMode) => void;
}

export default function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 backdrop-blur-sm p-1 shadow-sm">
      <ModeChip
        active={mode === 'casual'}
        onClick={() => onChange('casual')}
        icon={<Coffee className="h-3 w-3" />}
        label="Casual"
        accent="amber"
      />
      <ModeChip
        active={mode === 'pro'}
        onClick={() => onChange('pro')}
        icon={<Rocket className="h-3 w-3" />}
        label="Pro"
        accent="cyan"
      />
    </div>
  );
}

function ModeChip({ active, onClick, icon, label, accent }: {
  active:  boolean;
  onClick: () => void;
  icon:    React.ReactNode;
  label:   string;
  accent:  'amber' | 'cyan';
}) {
  const activeClass = accent === 'cyan'
    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
    : 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: DURATION.hover, ease: FEATHER_EASE }}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors duration-200 ${
        active
          ? activeClass
          : 'border-transparent text-muted-foreground/70 hover:text-foreground'
      }`}>
      {icon}
      {label}
    </motion.button>
  );
}
