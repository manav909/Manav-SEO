/* ════════════════════════════════════════════════════════════════════
   src/components/season/widgets/CommandDrawer.tsx
   Phase 21 — Block 2.14 — Right drawer (second-level attention)

   Slides in from the right when the floating ⌘. button is clicked.
   Four tabs:
     1. Layout      — reorder & hide currently-active widgets
     2. Gallery     — add hidden widgets back, browse all
     3. Saved       — Manav's Picks Archive + saved RSS items
     4. Preferences — default mode, density, motion
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Settings, Layers, BookOpen, History, Sliders,
  Plus, Eye, EyeOff, ChevronUp, ChevronDown, ExternalLink,
  Sparkles, RotateCcw, RefreshCw, Bookmark,
} from 'lucide-react';
import { DURATION, FEATHER_EASE } from '../warRoomAnimations';
import {
  WIDGET_REGISTRY, widgetsByCategory, getWidget,
  type WidgetMode, type WidgetCategory,
} from './registry';
import type { UserPrefsClient } from '@/components/pm/api';
import { seoPickEngineArchive, type ManavsPickRowClient } from '@/components/pm/api';

type Tab = 'layout' | 'gallery' | 'saved' | 'prefs';

interface Props {
  open:        boolean;
  onClose:     () => void;
  mode:        WidgetMode;
  prefs:       UserPrefsClient;
  setPrefs:    (updater: (p: UserPrefsClient) => UserPrefsClient) => void;
  projectId:   string | null;
}

export default function CommandDrawer({ open, onClose, mode, prefs, setPrefs, projectId }: Props) {
  const [tab, setTab] = useState<Tab>('layout');

  /* Cmd/Ctrl + . opens drawer; Escape closes */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (open && e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: DURATION.short, ease: FEATHER_EASE }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            style={{ zIndex: 9999 }}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: DURATION.major, ease: FEATHER_EASE }}
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[440px] bg-card border-l border-border/40 shadow-2xl flex flex-col"
            style={{ zIndex: 10000 }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
              <Settings className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-foreground/95">Command Settings</h3>
              <button onClick={onClose} className="ml-auto p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-card/60 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/40">
              <TabBtn active={tab === 'layout'} onClick={() => setTab('layout')} icon={<Layers className="h-3 w-3" />} label="Layout" />
              <TabBtn active={tab === 'gallery'} onClick={() => setTab('gallery')} icon={<BookOpen className="h-3 w-3" />} label="Gallery" />
              <TabBtn active={tab === 'saved'} onClick={() => setTab('saved')} icon={<Bookmark className="h-3 w-3" />} label="Saved" />
              <TabBtn active={tab === 'prefs'} onClick={() => setTab('prefs')} icon={<Sliders className="h-3 w-3" />} label="Preferences" />
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {tab === 'layout'  && <LayoutTab  mode={mode} prefs={prefs} setPrefs={setPrefs} />}
              {tab === 'gallery' && <GalleryTab mode={mode} prefs={prefs} setPrefs={setPrefs} />}
              {tab === 'saved'   && <SavedTab   projectId={projectId} />}
              {tab === 'prefs'   && <PrefsTab   prefs={prefs} setPrefs={setPrefs} />}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TabBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
        active
          ? 'text-cyan-400 border-cyan-500/70 bg-cyan-500/[0.04]'
          : 'text-muted-foreground/65 border-transparent hover:text-foreground'
      }`}>
      {icon} {label}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TAB 1 — LAYOUT
══════════════════════════════════════════════════════════════════════ */

function LayoutTab({ mode, prefs, setPrefs }: {
  mode: WidgetMode;
  prefs: UserPrefsClient;
  setPrefs: (u: (p: UserPrefsClient) => UserPrefsClient) => void;
}) {
  if (mode === 'casual') {
    return (
      <div className="p-4">
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/65 mb-2">Casual mode layout</div>
        <WidgetList
          ids={prefs.layout_casual}
          onMove={(id, dir) => setPrefs(p => ({ ...p, layout_casual: moveInList(p.layout_casual, id, dir) }))}
          onHide={(id) => setPrefs(p => ({
            ...p,
            layout_casual:  p.layout_casual.filter(x => x !== id),
            hidden_widgets: [...new Set([...p.hidden_widgets, id])],
          }))}
        />
        <p className="text-[10px] text-muted-foreground/55 italic mt-3">
          Hidden widgets can be added back from the Gallery tab.
        </p>
      </div>
    );
  }

  /* Pro mode = 2 columns */
  return (
    <div className="p-4 space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/65 mb-2">Pro mode · Left column</div>
        <WidgetList
          ids={prefs.layout_pro_left}
          onMove={(id, dir) => setPrefs(p => ({ ...p, layout_pro_left: moveInList(p.layout_pro_left, id, dir) }))}
          onHide={(id) => setPrefs(p => ({
            ...p,
            layout_pro_left: p.layout_pro_left.filter(x => x !== id),
            hidden_widgets:  [...new Set([...p.hidden_widgets, id])],
          }))}
        />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/65 mb-2">Pro mode · Right column</div>
        <WidgetList
          ids={prefs.layout_pro_right}
          onMove={(id, dir) => setPrefs(p => ({ ...p, layout_pro_right: moveInList(p.layout_pro_right, id, dir) }))}
          onHide={(id) => setPrefs(p => ({
            ...p,
            layout_pro_right: p.layout_pro_right.filter(x => x !== id),
            hidden_widgets:   [...new Set([...p.hidden_widgets, id])],
          }))}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/55 italic">
        Hidden widgets can be added back from the Gallery tab.
      </p>
    </div>
  );
}

function WidgetList({ ids, onMove, onHide }: {
  ids:    string[];
  onMove: (id: string, dir: 'up' | 'down') => void;
  onHide: (id: string) => void;
}) {
  if (ids.length === 0) return <div className="text-[11px] text-muted-foreground/55 italic">No widgets in this slot. Add from Gallery.</div>;
  return (
    <ul className="space-y-1.5">
      {ids.map((id, i) => {
        const spec = getWidget(id);
        if (!spec) return null;
        return (
          <li key={id} className="rounded-lg border border-border/40 bg-card/30 px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-foreground/90 truncate">{spec.title}</div>
              <div className="text-[10px] text-muted-foreground/55 truncate">{spec.pulse_hint || spec.description.slice(0, 50)}</div>
            </div>
            <button onClick={() => onMove(id, 'up')}   disabled={i === 0}             title="Move up"   className="p-1 rounded text-muted-foreground/65 hover:text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-30 transition-colors"><ChevronUp className="h-3 w-3" /></button>
            <button onClick={() => onMove(id, 'down')} disabled={i === ids.length-1} title="Move down" className="p-1 rounded text-muted-foreground/65 hover:text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-30 transition-colors"><ChevronDown className="h-3 w-3" /></button>
            <button onClick={() => onHide(id)}                                       title="Hide"      className="p-1 rounded text-muted-foreground/65 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><EyeOff className="h-3 w-3" /></button>
          </li>
        );
      })}
    </ul>
  );
}

function moveInList(list: string[], id: string, dir: 'up' | 'down'): string[] {
  const i = list.indexOf(id);
  if (i < 0) return list;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/* ════════════════════════════════════════════════════════════════════
   TAB 2 — GALLERY
══════════════════════════════════════════════════════════════════════ */

function GalleryTab({ mode, prefs, setPrefs }: {
  mode: WidgetMode;
  prefs: UserPrefsClient;
  setPrefs: (u: (p: UserPrefsClient) => UserPrefsClient) => void;
}) {
  const grouped = widgetsByCategory(mode);
  const categories: { key: WidgetCategory; label: string }[] = [
    { key: 'overview',      label: 'Overview'      },
    { key: 'analysis',      label: 'Analysis'      },
    { key: 'editorial',     label: 'Editorial'     },
    { key: 'communication', label: 'Communication' },
    { key: 'planning',      label: 'Planning'      },
  ];

  function isInLayout(id: string): boolean {
    if (mode === 'casual') return prefs.layout_casual.includes(id);
    return prefs.layout_pro_left.includes(id) || prefs.layout_pro_right.includes(id);
  }

  function addToLayout(id: string) {
    const spec = getWidget(id);
    if (!spec) return;
    setPrefs(p => {
      const nextHidden = p.hidden_widgets.filter(x => x !== id);
      if (mode === 'casual') {
        if (p.layout_casual.includes(id)) return { ...p, hidden_widgets: nextHidden };
        return { ...p, layout_casual: [...p.layout_casual, id], hidden_widgets: nextHidden };
      }
      /* Pro: respect default_column */
      const targetKey = spec.default_column === 'right' ? 'layout_pro_right' : 'layout_pro_left';
      const arr = p[targetKey];
      if (arr.includes(id)) return { ...p, hidden_widgets: nextHidden };
      return { ...p, [targetKey]: [...arr, id], hidden_widgets: nextHidden };
    });
  }

  function removeFromLayout(id: string) {
    setPrefs(p => ({
      ...p,
      layout_casual:    p.layout_casual.filter(x => x !== id),
      layout_pro_left:  p.layout_pro_left.filter(x => x !== id),
      layout_pro_right: p.layout_pro_right.filter(x => x !== id),
      hidden_widgets:   [...new Set([...p.hidden_widgets, id])],
    }));
  }

  return (
    <div className="p-4 space-y-5">
      {categories.map(cat => {
        const widgets = grouped[cat.key];
        if (widgets.length === 0) return null;
        return (
          <div key={cat.key}>
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/65 mb-2">{cat.label}</div>
            <ul className="space-y-1.5">
              {widgets.map(spec => {
                const present = isInLayout(spec.id);
                return (
                  <li key={spec.id} className="rounded-lg border border-border/40 bg-card/30 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <div className="text-[12px] font-bold text-foreground/95">{spec.title}</div>
                          {spec.pulse_hint && (
                            <div className="text-[9px] text-amber-400/80 italic">· {spec.pulse_hint}</div>
                          )}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground/75 leading-snug mt-0.5">{spec.description}</div>
                      </div>
                      {present ? (
                        <button onClick={() => removeFromLayout(spec.id)} title="Remove" className="shrink-0 text-[10px] px-2.5 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors font-bold flex items-center gap-1">
                          <Eye className="h-2.5 w-2.5" /> Added
                        </button>
                      ) : (
                        <button onClick={() => addToLayout(spec.id)} title="Add" className="shrink-0 text-[10px] px-2.5 py-1 rounded-md border border-cyan-500/30 bg-cyan-500/[0.05] text-cyan-300 hover:bg-cyan-500/15 transition-colors font-bold flex items-center gap-1">
                          <Plus className="h-2.5 w-2.5" /> Add
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TAB 3 — SAVED (Manav's Picks Archive)
══════════════════════════════════════════════════════════════════════ */

function SavedTab({ projectId }: { projectId: string | null }) {
  const [picks, setPicks]     = useState<ManavsPickRowClient[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) { setPicks([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const r = await seoPickEngineArchive({ projectId, limit: 50 });
      if (cancelled) return;
      setPicks(r.picks || []);
      setTotal(r.total || 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (!projectId) return <div className="p-4 text-[11px] text-muted-foreground/55 italic">No project selected.</div>;

  return (
    <div className="p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
        <div className="text-[10px] uppercase tracking-wider font-bold text-amber-400">Manav's Picks Archive</div>
        <div className="text-[10px] text-muted-foreground/55 ml-auto">{total} total</div>
      </div>
      {loading && picks.length === 0 ? (
        <div className="text-center text-[11px] text-muted-foreground/55 italic py-6">
          <RefreshCw className="h-3 w-3 mx-auto mb-1 animate-spin" />
          Loading archive…
        </div>
      ) : picks.length === 0 ? (
        <div className="text-center text-[11px] text-muted-foreground/55 italic py-6">
          No picks yet. The engine generates picks daily — they accumulate here.
        </div>
      ) : (
        <ul className="space-y-3">
          {picks.map(p => (
            <li key={p.id} className={`rounded-xl border p-3 ${p.is_current ? 'border-amber-500/40 bg-amber-500/[0.05]' : 'border-border/40 bg-card/30'}`}>
              <div className="flex items-baseline gap-1.5 mb-1 flex-wrap">
                <div className="text-[9px] uppercase tracking-wider font-bold text-amber-400">
                  {new Date(p.picked_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                {p.is_current && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase tracking-wider">current</span>
                )}
                <div className="text-[9px] text-muted-foreground/55 ml-auto">score {Math.round(p.connection_score)}/100</div>
              </div>
              <h4 className="text-[12.5px] font-bold text-foreground/95 leading-snug mb-1">{p.insight_headline}</h4>
              <p className="text-[11px] text-muted-foreground/85 leading-relaxed line-clamp-3 mb-1.5">{p.insight_body}</p>
              {p.external_citations.length > 0 && (
                <div className="text-[9px] text-muted-foreground/55 italic flex items-center gap-1">
                  <ExternalLink className="h-2.5 w-2.5" />
                  {p.external_citations.slice(0, 2).map(c => c.publisher).join(' · ')}
                  {p.external_citations.length > 2 && ` +${p.external_citations.length - 2}`}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TAB 4 — PREFERENCES
══════════════════════════════════════════════════════════════════════ */

function PrefsTab({ prefs, setPrefs }: {
  prefs: UserPrefsClient;
  setPrefs: (u: (p: UserPrefsClient) => UserPrefsClient) => void;
}) {
  return (
    <div className="p-4 space-y-5">
      <PrefRow
        label="Default mode"
        description="Which mode opens when you load /command">
        <div className="flex gap-1">
          <PillBtn active={prefs.default_mode === 'casual'} onClick={() => setPrefs(p => ({ ...p, default_mode: 'casual' }))}>Casual</PillBtn>
          <PillBtn active={prefs.default_mode === 'pro'}    onClick={() => setPrefs(p => ({ ...p, default_mode: 'pro' }))}>Pro</PillBtn>
        </div>
      </PrefRow>

      <PrefRow
        label="Density"
        description="Spacing between widgets and content">
        <div className="flex gap-1">
          <PillBtn active={prefs.density === 'comfortable'} onClick={() => setPrefs(p => ({ ...p, density: 'comfortable' }))}>Comfortable</PillBtn>
          <PillBtn active={prefs.density === 'compact'}     onClick={() => setPrefs(p => ({ ...p, density: 'compact' }))}>Compact</PillBtn>
        </div>
      </PrefRow>

      <PrefRow
        label="Reduce motion"
        description="Less animation, no scale or stagger effects">
        <Toggle on={prefs.reduce_motion} onChange={(v) => setPrefs(p => ({ ...p, reduce_motion: v }))} />
      </PrefRow>

      <div className="pt-3 border-t border-border/30">
        <button
          onClick={() => setPrefs(p => ({
            ...p,
            layout_casual:    ['casual_manavs_pick', 'casual_what_needs_you', 'casual_strategic_intel'],
            layout_pro_left:  ['pro_priority_feed', 'pro_strategic_intel'],
            layout_pro_right: ['pro_scorecard', 'pro_performance_pulse', 'pro_pillar_health', 'pro_i_noticed', 'pro_client_questions', 'pro_decisions_log', 'pro_velocity', 'pro_client_recap'],
            hidden_widgets:   [],
          }))}
          className="text-[11px] px-3 py-1.5 rounded-lg border border-border/50 bg-card/30 text-muted-foreground/85 hover:text-foreground hover:bg-card/60 transition-colors font-bold inline-flex items-center gap-1.5">
          <RotateCcw className="h-3 w-3" />
          Reset layouts to defaults
        </button>
      </div>
    </div>
  );
}

function PrefRow({ label, description, children }: {
  label: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[12px] font-semibold text-foreground/95">{label}</div>
        <div className="text-[10px] text-muted-foreground/65 mt-0.5">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PillBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`text-[10px] px-2.5 py-1 rounded-md font-bold transition-colors ${
      active
        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
        : 'bg-card/30 text-muted-foreground/75 hover:text-foreground border border-border/40'
    }`}>{children}</button>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-cyan-500/40' : 'bg-card/40 border border-border/40'}`}>
      <motion.div
        animate={{ x: on ? 20 : 2 }}
        transition={{ duration: DURATION.short, ease: FEATHER_EASE }}
        className={`absolute top-0.5 w-4 h-4 rounded-full ${on ? 'bg-cyan-300' : 'bg-muted-foreground/60'}`}
      />
    </button>
  );
}
