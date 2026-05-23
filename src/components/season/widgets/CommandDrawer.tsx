/* ════════════════════════════════════════════════════════════════════
   src/components/season/widgets/CommandDrawer.tsx
   Phase 21 — Block 2.16 — Right drawer (six tabs)

   Tabs:
     1. Layout      — reorder & hide currently-active widgets
     2. Gallery     — add hidden widgets back, browse all
     3. Saved       — Manav's Picks Archive
     4. Engine      — Manav's Pick corpus status + force-generate controls
     5. Activity    — "Behind the scenes" live ledger (merged in this block)
     6. Preferences — default mode, density, motion
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Settings, Layers, BookOpen, Sliders,
  Plus, Eye, EyeOff, ChevronUp, ChevronDown, ExternalLink,
  Sparkles, RotateCcw, RefreshCw, Bookmark, Activity, Database,
  Zap, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { DURATION, FEATHER_EASE } from '../warRoomAnimations';
import {
  widgetsByCategory, getWidget,
  type WidgetMode, type WidgetCategory,
} from './registry';
import type { UserPrefsClient, ActivityEvent, BriefingClient } from '@/components/pm/api';
import {
  seoPickEngineArchive, seoPickEngineRegenerate, seoCorpusEnrichBatch, seoPickEngineGet,
  type ManavsPickRowClient,
} from '@/components/pm/api';

type Tab = 'layout' | 'gallery' | 'saved' | 'engine' | 'activity' | 'prefs';

interface Props {
  open:        boolean;
  onClose:     () => void;
  mode:        WidgetMode;
  prefs:       UserPrefsClient;
  setPrefs:    (updater: (p: UserPrefsClient) => UserPrefsClient) => void;
  projectId:   string | null;
  activity:    ActivityEvent[];
  briefing:    BriefingClient | null;
}

export default function CommandDrawer({ open, onClose, mode, prefs, setPrefs, projectId, activity, briefing }: Props) {
  const [tab, setTab] = useState<Tab>('layout');

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
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: DURATION.short, ease: FEATHER_EASE }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            style={{ zIndex: 9999 }}
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: DURATION.major, ease: FEATHER_EASE }}
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[460px] bg-card border-l border-border/40 shadow-2xl flex flex-col"
            style={{ zIndex: 10000 }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
              <Settings className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-foreground/95">Command Settings</h3>
              <button onClick={onClose} className="ml-auto p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-card/60 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs strip — scrollable on narrow widths */}
            <div className="flex border-b border-border/40 overflow-x-auto">
              <TabBtn active={tab === 'layout'}   onClick={() => setTab('layout')}   icon={<Layers className="h-3 w-3" />}   label="Layout"     />
              <TabBtn active={tab === 'gallery'}  onClick={() => setTab('gallery')}  icon={<BookOpen className="h-3 w-3" />} label="Gallery"    />
              <TabBtn active={tab === 'saved'}    onClick={() => setTab('saved')}    icon={<Bookmark className="h-3 w-3" />} label="Saved"      />
              <TabBtn active={tab === 'engine'}   onClick={() => setTab('engine')}   icon={<Zap className="h-3 w-3" />}      label="Engine"     />
              <TabBtn active={tab === 'activity'} onClick={() => setTab('activity')} icon={<Activity className="h-3 w-3" />} label="Behind"     />
              <TabBtn active={tab === 'prefs'}    onClick={() => setTab('prefs')}    icon={<Sliders className="h-3 w-3" />}  label="Prefs"      />
            </div>

            <div className="flex-1 overflow-y-auto">
              {tab === 'layout'   && <LayoutTab   mode={mode} prefs={prefs} setPrefs={setPrefs} />}
              {tab === 'gallery'  && <GalleryTab  mode={mode} prefs={prefs} setPrefs={setPrefs} />}
              {tab === 'saved'    && <SavedTab    projectId={projectId} />}
              {tab === 'engine'   && <EngineTab   projectId={projectId} />}
              {tab === 'activity' && <ActivityTab events={activity} briefing={briefing} />}
              {tab === 'prefs'    && <PrefsTab    prefs={prefs} setPrefs={setPrefs} />}
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
      className={`shrink-0 flex items-center justify-center gap-1 px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
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
          No picks yet. Open the Engine tab to warm up the corpus and generate your first pick.
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
   TAB 4 — ENGINE (Manav's Pick corpus + force-generate)
══════════════════════════════════════════════════════════════════════ */

function EngineTab({ projectId }: { projectId: string | null }) {
  const [enriching, setEnriching]       = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ enriched: number; remaining: number } | null>(null);
  const [generating, setGenerating]     = useState(false);
  const [genResult, setGenResult]       = useState<{ note?: string; score?: number; headline?: string } | null>(null);

  if (!projectId) return <div className="p-4 text-[11px] text-muted-foreground/55 italic">No project selected.</div>;

  async function handleEnrich() {
    setEnriching(true);
    setEnrichResult(null);
    /* Run up to 5 batches (5 articles each = 25 enrichments per click) */
    let totalEnriched = 0;
    let lastRemaining = 0;
    for (let i = 0; i < 5; i++) {
      const r = await seoCorpusEnrichBatch({ limit: 5 });
      if (r.enriched != null) totalEnriched += r.enriched;
      if (r.remaining != null) lastRemaining = r.remaining;
      if ((r.remaining || 0) === 0) break;
    }
    setEnrichResult({ enriched: totalEnriched, remaining: lastRemaining });
    setEnriching(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    const r = await seoPickEngineRegenerate({ projectId: projectId! });
    setGenResult({
      note:     r.honest_note,
      score:    r.pick?.connection_score,
      headline: r.pick?.insight_headline,
    });
    setGenerating(false);
  }

  async function handleRefreshCurrent() {
    setGenerating(true);
    setGenResult(null);
    const r = await seoPickEngineGet({ projectId: projectId! });
    setGenResult({
      note:     r.honest_note,
      score:    r.pick?.connection_score,
      headline: r.pick?.insight_headline,
    });
    setGenerating(false);
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          <div className="text-[10px] uppercase tracking-wider font-bold text-amber-400">Pick Engine controls</div>
        </div>
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
          Manav's Pick scores how strongly external articles cross-connect to your project's current state.
          Two-step warmup: enrich the corpus, then generate a pick. Both can be re-run anytime.
        </p>
      </div>

      {/* STEP 1 — Enrich corpus */}
      <div className="rounded-xl border border-border/40 bg-card/30 p-3.5">
        <div className="flex items-baseline gap-2 mb-1">
          <Database className="h-3 w-3 text-cyan-400" />
          <div className="text-[11px] font-bold text-foreground/95">Step 1 · Enrich the corpus</div>
        </div>
        <p className="text-[10.5px] text-muted-foreground/75 leading-snug mb-2.5">
          Each article runs through one LLM pass to extract topic tags, entities, and key claims —
          this is what the engine matches against your project state. Costs ~$0.005 per article.
        </p>
        <button
          onClick={handleEnrich}
          disabled={enriching}
          className="text-[11px] px-3 py-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50 transition-colors font-bold inline-flex items-center gap-1.5">
          {enriching ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {enriching ? 'Enriching…' : 'Run enrichment (up to 25 articles)'}
        </button>
        {enrichResult && (
          <div className="mt-2 text-[10.5px] flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Enriched {enrichResult.enriched} this run · {enrichResult.remaining} still unprocessed
          </div>
        )}
      </div>

      {/* STEP 2 — Generate a pick */}
      <div className="rounded-xl border border-border/40 bg-card/30 p-3.5">
        <div className="flex items-baseline gap-2 mb-1">
          <Sparkles className="h-3 w-3 text-amber-400" />
          <div className="text-[11px] font-bold text-foreground/95">Step 2 · Generate a pick</div>
        </div>
        <p className="text-[10.5px] text-muted-foreground/75 leading-snug mb-2.5">
          Runs candidate filtering, cross-connection scoring, and insight assembly with 5 role frames.
          Picks below 65/100 are honestly rejected — the engine refuses to surface weak connections.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-[11px] px-3 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 transition-colors font-bold inline-flex items-center gap-1.5">
            {generating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {generating ? 'Running engine…' : 'Force-generate now'}
          </button>
          <button
            onClick={handleRefreshCurrent}
            disabled={generating}
            className="text-[11px] px-3 py-1.5 rounded-md border border-border/50 bg-card/30 text-muted-foreground/85 hover:text-foreground hover:bg-card/60 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3" />
            Refresh current
          </button>
        </div>
        {genResult && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2.5 text-[10.5px]">
            {genResult.headline ? (
              <>
                <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span className="font-bold">Pick is live</span>
                  {genResult.score != null && <span className="text-amber-400/90">· score {Math.round(genResult.score)}/100</span>}
                </div>
                <div className="text-foreground/85 font-bold leading-snug">{genResult.headline}</div>
                <div className="text-[10px] text-muted-foreground/70 italic mt-1">Visible on the Casual mode home page.</div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-amber-400 mb-1">
                  <AlertCircle className="h-3 w-3" />
                  <span className="font-bold">No pick this run</span>
                </div>
                {genResult.note && <div className="text-muted-foreground/85 leading-snug">{genResult.note}</div>}
              </>
            )}
          </div>
        )}
      </div>

      <div className="text-[10px] text-muted-foreground/55 italic">
        Tip: enrichment is permanent — the corpus only grows. After a week of pulls + enrichment runs, picks become substantially more relevant.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TAB 5 — ACTIVITY (Behind the scenes, merged in from floating button)
══════════════════════════════════════════════════════════════════════ */

function ActivityTab({ events, briefing }: { events: ActivityEvent[]; briefing: BriefingClient | null }) {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-baseline gap-2 mb-1">
        <Activity className="h-3.5 w-3.5 text-cyan-400" />
        <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-400">Behind the scenes</div>
        <div className="text-[10px] text-muted-foreground/55 ml-auto">Live ledger · {events.length} events</div>
      </div>

      {briefing && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3 text-[11px]">
          <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-400 mb-1">Data freshness</div>
          <div className="space-y-0.5 text-foreground/80">
            <div>GSC last pull: <span className="text-foreground font-bold">{briefing.freshness.gsc_last_pull ? new Date(briefing.freshness.gsc_last_pull).toLocaleString() : 'never'}</span></div>
            <div>GA4 last pull: <span className="text-foreground font-bold">{briefing.freshness.ga4_last_pull ? new Date(briefing.freshness.ga4_last_pull).toLocaleString() : 'never'}</span></div>
            <div>Active strategies: <span className="text-foreground font-bold">{briefing.freshness.strategies_seen}</span> · goals: <span className="text-foreground font-bold">{briefing.freshness.goals_seen}</span></div>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="text-center py-8 text-[11px] text-muted-foreground/65 italic">
          No activity logged yet. As S.E.A.S.O.N. runs (pulls, plans, decisions), events appear here — append-only trust ledger.
        </div>
      ) : (
        events.map(e => (
          <div key={e.id} className="rounded-lg border border-border/40 bg-card/30 p-2.5">
            <div className="flex items-start gap-2">
              <SeverityDot severity={e.severity} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-foreground/90">{e.headline}</div>
                {e.detail && <div className="text-[10px] text-muted-foreground/75 mt-0.5">{e.detail}</div>}
                <div className="text-[9px] text-muted-foreground/55 mt-1">{timeAgo(e.created_at)} · {e.source} · {e.event_type}</div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const colorClass = severity === 'critical' ? 'bg-rose-400' : severity === 'warning' ? 'bg-amber-400' : severity === 'success' ? 'bg-emerald-400' : 'bg-cyan-400';
  return <span className={`shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${colorClass}`} />;
}

function timeAgo(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ''; }
}

/* ════════════════════════════════════════════════════════════════════
   TAB 6 — PREFERENCES
══════════════════════════════════════════════════════════════════════ */

function PrefsTab({ prefs, setPrefs }: {
  prefs: UserPrefsClient;
  setPrefs: (u: (p: UserPrefsClient) => UserPrefsClient) => void;
}) {
  return (
    <div className="p-4 space-y-5">
      <PrefRow label="Default mode" description="Which mode opens when you load /command">
        <div className="flex gap-1">
          <PillBtn active={prefs.default_mode === 'casual'} onClick={() => setPrefs(p => ({ ...p, default_mode: 'casual' }))}>Casual</PillBtn>
          <PillBtn active={prefs.default_mode === 'pro'}    onClick={() => setPrefs(p => ({ ...p, default_mode: 'pro' }))}>Pro</PillBtn>
        </div>
      </PrefRow>
      <PrefRow label="Density" description="Spacing between widgets and content">
        <div className="flex gap-1">
          <PillBtn active={prefs.density === 'comfortable'} onClick={() => setPrefs(p => ({ ...p, density: 'comfortable' }))}>Comfortable</PillBtn>
          <PillBtn active={prefs.density === 'compact'}     onClick={() => setPrefs(p => ({ ...p, density: 'compact' }))}>Compact</PillBtn>
        </div>
      </PrefRow>
      <PrefRow label="Reduce motion" description="Less animation, no scale or stagger effects">
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

function PrefRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
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
