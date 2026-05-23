/* ════════════════════════════════════════════════════════════════════
   src/components/season/widgets/WidgetShell.tsx
   Phase 21 — Block 2.14 — Widget container with lazy-load + skeleton

   Wraps any widget render with:
     • IntersectionObserver — for lazy_load widgets, the children only
       mount once the placeholder is within rootMargin of the viewport
     • Skeleton — placeholder with min_height_px until mounted
     • Edit mode UI — when an outer "edit mode" is active, shows ↑↓ to
       reorder and × to hide
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { DURATION, FEATHER_EASE } from '../warRoomAnimations';
import type { WidgetSpec } from './registry';

interface Props {
  spec:        WidgetSpec;
  editMode?:   boolean;
  canMoveUp?:  boolean;
  canMoveDown?: boolean;
  onMoveUp?:   () => void;
  onMoveDown?: () => void;
  onHide?:     () => void;
  children:    ReactNode;
}

export default function WidgetShell({
  spec, editMode, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onHide, children,
}: Props) {
  const [isVisible, setIsVisible]     = useState(!spec.lazy_load);
  const [hasMounted, setHasMounted]   = useState(!spec.lazy_load);
  const placeholderRef                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!spec.lazy_load || hasMounted) return;
    const el = placeholderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasMounted(true);
          observer.disconnect();
          return;
        }
      }
    }, { rootMargin: '400px 0px' });   // start loading 400px before reaching viewport
    observer.observe(el);
    return () => observer.disconnect();
  }, [spec.lazy_load, hasMounted]);

  return (
    <motion.section
      data-widget-id={spec.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.short, ease: FEATHER_EASE }}
      className={`relative ${editMode ? 'rounded-xl border border-dashed border-cyan-500/40 bg-cyan-500/[0.02] p-2' : ''}`}>
      {/* Edit-mode controls */}
      {editMode && (
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-cyan-400">
            <GripVertical className="h-3 w-3" />
            {spec.title}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onMoveUp}
              disabled={!canMoveUp}
              title="Move up"
              className="p-1 rounded text-muted-foreground/65 hover:text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={!canMoveDown}
              title="Move down"
              className="p-1 rounded text-muted-foreground/65 hover:text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
              onClick={onHide}
              title="Hide widget"
              className="p-1 rounded text-muted-foreground/65 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Skeleton placeholder until mounted */}
      {!hasMounted ? (
        <div
          ref={placeholderRef}
          className="rounded-xl border border-border/20 bg-card/15 animate-pulse"
          style={{ minHeight: spec.min_height_px }}>
          <div className="p-4 flex items-center justify-center h-full">
            <div className="text-[10px] text-muted-foreground/40 italic">{spec.title} · loading when visible</div>
          </div>
        </div>
      ) : (
        children
      )}
    </motion.section>
  );
}
