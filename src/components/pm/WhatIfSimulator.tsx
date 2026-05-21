/* ════════════════════════════════════════════════════════════════
   src/components/pm/WhatIfSimulator.tsx
   Phase 1L — What-If Simulator.

   Renders below AnalyticsIntelPanel in the Data Room. Flow:

   1. Smart suggestions ("Recommended for you") — populated from intel
   2. Action library browser — 24 SEO actions, filter by category
   3. Scenario canvas — stack actions, configure inputs per action
   4. Projected impact preview — live update with confidence bands
   5. Save scenario — name + tags + share-with-client toggle
   6. Saved scenarios — load, edit, delete

   Investors / PMs / clients can all view scenarios. Like mutual-fund
   goal planning: "If we do X + Y + Z, projected impact at 90 days is…"
═══════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Plus, X, Save, FolderOpen, ChevronDown, ChevronRight,
  Wand2, Zap, Layers, RefreshCw, Target, ArrowUpRight, ArrowDownRight,
  Minus, AlertCircle, Trash2, Clock, CheckCircle2, Beaker, Filter,
  TrendingUp, TrendingDown, Activity, Info,
} from 'lucide-react';
import {
  listActions, getActionSuggestions, projectScenarioImpact,
  saveScenario, listScenarios, deleteScenario, updateScenario,
  type SeoActionClient, type SuggestedActionClient,
  type ActionInstanceClient, type ScenarioProjectionClient,
  type SavedScenarioClient, type ActionCategoryClient,
} from './api';

interface Props {
  projectId: string;
  defaultCollapsed?: boolean;
}

const CATEGORY_LABELS: Record<ActionCategoryClient, string> = {
  content:   'Content',
  onpage:    'On-page',
  technical: 'Technical',
  links:     'Links',
  ux:        'UX',
  strategy:  'Strategy',
};

const CATEGORY_COLORS: Record<ActionCategoryClient, string> = {
  content:   'text-emerald-400 border-emerald-500/30',
  onpage:    'text-blue-400 border-blue-500/30',
  technical: 'text-amber-400 border-amber-500/30',
  links:     'text-violet-400 border-violet-500/30',
  ux:        'text-pink-400 border-pink-500/30',
  strategy:  'text-cyan-400 border-cyan-500/30',
};

const PRIORITY_STYLES: Record<string, { label: string; color: string }> = {
  must_do:   { label: 'Must do',   color: 'text-red-400 bg-red-500/15' },
  should_do: { label: 'Should do', color: 'text-amber-400 bg-amber-500/15' },
  could_do:  { label: 'Could do',  color: 'text-blue-400 bg-blue-500/15' },
};

export default function WhatIfSimulator({ projectId, defaultCollapsed }: Props) {
  const [expanded, setExpanded]     = useState(!defaultCollapsed);
  const [actions, setActions]       = useState<SeoActionClient[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedActionClient[]>([]);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioClient[]>([]);
  const [scenarioName, setScenarioName]     = useState('Untitled scenario');
  const [scenarioDesc, setScenarioDesc]     = useState('');
  const [currentActions, setCurrentActions] = useState<ActionInstanceClient[]>([]);
  const [projection, setProjection] = useState<ScenarioProjectionClient | null>(null);
  const [loading, setLoading]       = useState(true);
  const [projecting, setProjecting] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [info, setInfo]             = useState<string | null>(null);

  /* Section toggles */
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showLibrary, setShowLibrary]         = useState(false);
  const [showSaved, setShowSaved]             = useState(false);
  const [categoryFilter, setCategoryFilter]   = useState<ActionCategoryClient | 'all'>('all');
  const [librarySearch, setLibrarySearch]     = useState('');
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [shareWithClient, setShareWithClient] = useState(false);

  /* Initial load */
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      const [aRes, sRes, savedRes] = await Promise.all([
        listActions(),
        getActionSuggestions(projectId, 12),
        listScenarios(projectId),
      ]);
      setActions(aRes.actions);
      setSuggestions(sRes.suggestions);
      setSavedScenarios(savedRes.scenarios);
      setLoading(false);
    })();
  }, [projectId]);

  /* Project impact whenever actions change (debounced) */
  const projectTimer = useRef<any>(null);
  useEffect(() => {
    if (currentActions.length === 0) {
      setProjection(null);
      return;
    }
    if (projectTimer.current) clearTimeout(projectTimer.current);
    projectTimer.current = setTimeout(async () => {
      setProjecting(true);
      const r = await projectScenarioImpact({ projectId, actions: currentActions });
      if (r.error) setError(r.error);
      else { setProjection(r.projection || null); setError(null); }
      setProjecting(false);
    }, 350);
    return () => projectTimer.current && clearTimeout(projectTimer.current);
  }, [currentActions, projectId]);

  /* Add an action from suggestion or library */
  const addAction = (action: SeoActionClient, prefilled?: Record<string, any>) => {
    setCurrentActions((curr) => {
      const inputs: Record<string, any> = {};
      for (const inp of action.inputs) {
        inputs[inp.key] = (prefilled && prefilled[inp.key] !== undefined)
          ? prefilled[inp.key]
          : (inp.defaultValue ?? '');
      }
      const label = prefilled && (prefilled.target_query || prefilled.target_page)
        ? `${action.name} → ${prefilled.target_query || prefilled.target_page}`
        : action.name;
      return [...curr, { action_id: action.id, inputs, target_label: label }];
    });
  };

  const removeAction = (idx: number) => {
    setCurrentActions((curr) => curr.filter((_, i) => i !== idx));
  };

  const updateActionInput = (idx: number, key: string, value: any) => {
    setCurrentActions((curr) => curr.map((a, i) =>
      i === idx ? { ...a, inputs: { ...a.inputs, [key]: value } } : a
    ));
  };

  const clearScenario = () => {
    setCurrentActions([]); setScenarioName('Untitled scenario');
    setScenarioDesc(''); setShareWithClient(false);
    setEditingScenarioId(null); setProjection(null);
  };

  const handleSaveScenario = async () => {
    if (currentActions.length === 0) { setError('Add at least one action first.'); return; }
    if (!scenarioName.trim() || scenarioName.trim() === 'Untitled scenario') {
      setError('Give the scenario a meaningful name first.'); return;
    }
    setSaving(true); setError(null);
    const r = editingScenarioId
      ? await updateScenario({
          scenarioId: editingScenarioId,
          name: scenarioName, description: scenarioDesc,
          actions: currentActions, sharedWithClient: shareWithClient,
        })
      : await saveScenario({
          projectId, name: scenarioName, description: scenarioDesc,
          actions: currentActions, sharedWithClient: shareWithClient,
        });
    setSaving(false);
    if (r.error) { setError(r.error); return; }
    setInfo(editingScenarioId ? `Updated "${scenarioName}".` : `Saved "${scenarioName}".`);
    setTimeout(() => setInfo(null), 3000);
    /* Refresh saved list */
    const sRes = await listScenarios(projectId);
    setSavedScenarios(sRes.scenarios);
    clearScenario();
  };

  const loadScenario = (s: SavedScenarioClient) => {
    setScenarioName(s.name);
    setScenarioDesc(s.description || '');
    setCurrentActions(s.actions || []);
    setShareWithClient(!!s.shared_with_client);
    setEditingScenarioId(s.id);
    setShowSaved(false);
    setShowSuggestions(false);
    setShowLibrary(false);
    setInfo(`Loaded "${s.name}" — edit and re-save.`);
    setTimeout(() => setInfo(null), 3000);
  };

  const handleDeleteScenario = async (id: string, name: string) => {
    if (!confirm(`Delete scenario "${name}"?`)) return;
    const r = await deleteScenario(id);
    if (r.error) { setError(r.error); return; }
    const sRes = await listScenarios(projectId);
    setSavedScenarios(sRes.scenarios);
  };

  /* Filtered library */
  const filteredLibrary = useMemo(() => {
    let list = actions;
    if (categoryFilter !== 'all') list = list.filter((a) => a.category === categoryFilter);
    if (librarySearch.trim()) {
      const q = librarySearch.toLowerCase();
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        a.shortDescription.toLowerCase().includes(q));
    }
    return list;
  }, [actions, categoryFilter, librarySearch]);

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.06] via-card/40 to-violet-500/[0.04] mb-4 overflow-hidden">
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-cyan-500/[0.04] border-b border-cyan-500/10"
      >
        <div className="flex items-center gap-2">
          <Beaker className="h-4 w-4 text-cyan-400" />
          <div>
            <div className="text-sm font-bold text-foreground">What-If Simulator</div>
            <div className="text-[10px] text-muted-foreground">
              Build scenarios from 24 SEO actions · project impact · save & share
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          {currentActions.length > 0 && <span className="font-bold text-cyan-400">{currentActions.length} in scenario</span>}
          {savedScenarios.length > 0 && <span>· {savedScenarios.length} saved</span>}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
              <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
            </div>
          )}
          {info && (
            <div className="px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {info}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              <Beaker className="h-5 w-5 mx-auto mb-2 opacity-50 animate-pulse" />
              Loading simulator…
            </div>
          ) : (
            <>
              {/* RECOMMENDED FOR YOU */}
              <Section
                title="Recommended for you"
                count={suggestions.length}
                icon={Wand2}
                accentClass="text-violet-400"
                subtitle="Auto-suggested from your current analytics intel"
                open={showSuggestions}
                onToggle={() => setShowSuggestions(!showSuggestions)}
              >
                {suggestions.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 px-2">
                    No suggestions yet — once analytics intel is computed (GSC + GA4 pull), recommended actions will appear here.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {suggestions.map((s, i) => (
                      <SuggestionCard
                        key={i}
                        suggestion={s}
                        onAdd={() => addAction(s.action, s.prefilled_inputs)}
                      />
                    ))}
                  </div>
                )}
              </Section>

              {/* ACTION LIBRARY */}
              <Section
                title="Action library"
                count={filteredLibrary.length}
                icon={Layers}
                accentClass="text-blue-400"
                subtitle={`Browse all ${actions.length} actions, filter by category`}
                open={showLibrary}
                onToggle={() => setShowLibrary(!showLibrary)}
              >
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`text-[10px] px-2 py-1 rounded-md border ${
                      categoryFilter === 'all' ? 'bg-blue-500/15 text-blue-400 border-blue-500/40' : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >All</button>
                  {(Object.keys(CATEGORY_LABELS) as ActionCategoryClient[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategoryFilter(c)}
                      className={`text-[10px] px-2 py-1 rounded-md border ${
                        categoryFilter === c ? `bg-current/15 ${CATEGORY_COLORS[c]}` : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >{CATEGORY_LABELS[c]}</button>
                  ))}
                  <div className="flex-1" />
                  <div className="relative">
                    <Filter className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder="Search…"
                      className="text-[11px] pl-7 pr-2 py-1 rounded-md border border-border bg-background/60 w-40 focus:outline-none focus:border-blue-500/40"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-1">
                  {filteredLibrary.map((a) => (
                    <ActionCard key={a.id} action={a} onAdd={() => addAction(a)} />
                  ))}
                </div>
              </Section>

              {/* IN-SCENARIO CANVAS */}
              {currentActions.length > 0 && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="h-3.5 w-3.5 text-cyan-400" />
                      <input
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                        className="text-sm font-bold text-foreground bg-transparent focus:outline-none focus:bg-background/40 px-1 -mx-1 rounded"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {currentActions.length} {currentActions.length === 1 ? 'action' : 'actions'}
                        {projection && ` · ${projection.total_effort_hours}h`}
                      </span>
                      <button
                        onClick={clearScenario}
                        className="text-[10px] px-2 py-0.5 rounded-md border border-border hover:bg-muted/40 text-muted-foreground"
                      >Clear</button>
                    </div>
                  </div>
                  <input
                    value={scenarioDesc}
                    onChange={(e) => setScenarioDesc(e.target.value)}
                    placeholder="Short description (optional)…"
                    className="w-full text-[11px] text-foreground bg-transparent border-b border-border/40 focus:outline-none focus:border-cyan-500/40 pb-1 mb-3"
                  />
                  <div className="space-y-1.5">
                    {currentActions.map((inst, idx) => {
                      const action = actions.find((a) => a.id === inst.action_id);
                      if (!action) return null;
                      return (
                        <ScenarioActionRow
                          key={idx}
                          index={idx + 1}
                          action={action}
                          instance={inst}
                          onRemove={() => removeAction(idx)}
                          onUpdateInput={(k, v) => updateActionInput(idx, k, v)}
                        />
                      );
                    })}
                  </div>

                  {/* Projection */}
                  <div className="mt-3 pt-3 border-t border-cyan-500/15">
                    <ProjectionView projection={projection} projecting={projecting} />
                  </div>

                  {/* Save bar */}
                  <div className="mt-3 pt-3 border-t border-cyan-500/15 flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={shareWithClient}
                        onChange={(e) => setShareWithClient(e.target.checked)}
                        className="rounded border-border"
                      />
                      Share with client
                    </label>
                    <div className="flex-1" />
                    <button
                      onClick={handleSaveScenario}
                      disabled={saving}
                      className="text-[11px] px-3 py-1.5 rounded-lg font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/30 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Save className="h-3 w-3" />
                      {saving ? 'Saving…' : (editingScenarioId ? 'Update scenario' : 'Save scenario')}
                    </button>
                  </div>
                </div>
              )}

              {/* SAVED SCENARIOS */}
              <Section
                title="Saved scenarios"
                count={savedScenarios.length}
                icon={FolderOpen}
                accentClass="text-amber-400"
                subtitle="Reusable plans across the team"
                open={showSaved}
                onToggle={() => setShowSaved(!showSaved)}
              >
                {savedScenarios.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 px-2">
                    No saved scenarios yet — build one above and click Save.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {savedScenarios.map((s) => (
                      <SavedScenarioRow
                        key={s.id}
                        scenario={s}
                        onLoad={() => loadScenario(s)}
                        onDelete={() => handleDeleteScenario(s.id, s.name)}
                      />
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Section wrapper ───────────────────────────────────────── */

function Section({
  title, count, icon: Icon, accentClass, subtitle, open, onToggle, children,
}: {
  title: string; count?: number; icon: any; accentClass: string;
  subtitle?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
      <div onClick={onToggle} className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-muted/20">
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${accentClass}`} />
          <div>
            <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
              {title}
              {count != null && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${accentClass} bg-muted/40`}>{count}</span>
              )}
            </div>
            {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

/* ─── Suggestion card ──────────────────────────────────────── */

function SuggestionCard({ suggestion, onAdd }: { suggestion: SuggestedActionClient; onAdd: () => void }) {
  const priority = PRIORITY_STYLES[suggestion.priority] || PRIORITY_STYLES.could_do;
  const cat = suggestion.action.category;
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2.5 hover:border-violet-500/30 transition-all">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold ${priority.color}`}>{priority.label}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[cat]} bg-current/[0.05]`}>{CATEGORY_LABELS[cat]}</span>
          </div>
          <div className="text-[12px] font-bold text-foreground leading-tight">{suggestion.action.name}</div>
          <div className="text-[10px] text-violet-400 italic mt-0.5">Because: {suggestion.reason}</div>
        </div>
        <button
          onClick={onAdd}
          className="shrink-0 px-2 py-1 rounded-md bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 text-[10px] font-bold flex items-center gap-1"
          title="Add to scenario"
        >
          <Plus className="h-2.5 w-2.5" />
          Add
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground leading-snug">{suggestion.action.shortDescription}</div>
      <div className="flex items-center gap-3 mt-1.5 text-[9px] text-muted-foreground/70">
        <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{suggestion.action.effortHours}h</span>
        <span>Confidence: <span className={confidenceColor(suggestion.action.confidence)}>{suggestion.action.confidence}</span></span>
      </div>
    </div>
  );
}

function confidenceColor(c: string): string {
  if (c === 'high')   return 'text-emerald-400';
  if (c === 'medium') return 'text-amber-400';
  return 'text-muted-foreground';
}

/* ─── Action library card ──────────────────────────────────── */

function ActionCard({ action, onAdd }: { action: SeoActionClient; onAdd: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const cat = action.category;
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2.5">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[cat]} bg-current/[0.05]`}>{CATEGORY_LABELS[cat]}</span>
            <span className={`text-[9px] uppercase tracking-wider ${confidenceColor(action.confidence)}`}>{action.confidence}</span>
          </div>
          <div className="text-[12px] font-bold text-foreground leading-tight">{action.name}</div>
        </div>
        <button
          onClick={onAdd}
          className="shrink-0 px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 text-[10px] font-bold flex items-center gap-1"
        >
          <Plus className="h-2.5 w-2.5" />Add
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground leading-snug">{action.shortDescription}</div>
      <div className="flex items-center gap-3 mt-1.5 text-[9px] text-muted-foreground/70">
        <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{action.effortHours}h</span>
        <button onClick={() => setExpanded(!expanded)} className="text-blue-400 hover:underline flex items-center gap-0.5">
          <Info className="h-2.5 w-2.5" />
          {expanded ? 'less' : 'details'}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-border/40 space-y-1.5 text-[10px]">
          <div className="text-foreground/80 leading-snug">{action.fullDescription}</div>
          <div><span className="font-bold text-foreground">Evidence:</span> <span className="text-muted-foreground">{action.evidence}</span></div>
          <div><span className="font-bold text-foreground">Cost:</span> <span className="text-muted-foreground">{action.costSummary}</span></div>
          {action.prerequisites && action.prerequisites.length > 0 && (
            <div className="text-amber-400/80">
              <span className="font-bold">Prerequisites:</span> {action.prerequisites.join('; ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Scenario action row (with inputs) ────────────────────── */

function ScenarioActionRow({
  index, action, instance, onRemove, onUpdateInput,
}: {
  index: number;
  action: SeoActionClient;
  instance: ActionInstanceClient;
  onRemove: () => void;
  onUpdateInput: (key: string, value: any) => void;
}) {
  const [showInputs, setShowInputs] = useState(false);
  const hasInputs = action.inputs.length > 0;
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-background/40">
      <div className="px-2.5 py-2 flex items-center gap-2">
        <span className="text-[9px] font-bold text-cyan-400/60 w-4">{index}.</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-foreground truncate">{action.name}</div>
          {instance.target_label && instance.target_label !== action.name && (
            <div className="text-[9px] text-muted-foreground truncate">{instance.target_label}</div>
          )}
        </div>
        {hasInputs && (
          <button
            onClick={() => setShowInputs(!showInputs)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground"
          >
            {showInputs ? 'Hide' : 'Configure'}
          </button>
        )}
        <button onClick={onRemove} className="text-muted-foreground hover:text-red-400 p-1"><X className="h-3 w-3" /></button>
      </div>
      {showInputs && hasInputs && (
        <div className="px-2.5 pb-2 pt-1 border-t border-cyan-500/10 space-y-1.5">
          {action.inputs.map((inp) => (
            <ActionInputField
              key={inp.key}
              input={inp}
              value={instance.inputs[inp.key] ?? ''}
              onChange={(v) => onUpdateInput(inp.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionInputField({ input, value, onChange }: any) {
  const baseInput = "w-full text-[11px] px-2 py-1 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40";
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-muted-foreground w-28 shrink-0">
        {input.label}
        {input.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {input.type === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={baseInput}>
          <option value="">— select —</option>
          {(input.options || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : input.type === 'number' ? (
        <input
          type="number" min={input.min} max={input.max}
          value={value} onChange={(e) => onChange(e.target.value)} className={baseInput}
        />
      ) : (
        <input
          type="text" placeholder={input.helperText || ''}
          value={value} onChange={(e) => onChange(e.target.value)} className={baseInput}
        />
      )}
    </div>
  );
}

/* ─── Projection view ───────────────────────────────────────── */

function ProjectionView({ projection, projecting }: { projection: ScenarioProjectionClient | null; projecting: boolean }) {
  if (projecting) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground flex items-center justify-center gap-2">
        <RefreshCw className="h-3 w-3 animate-spin" /> Projecting impact…
      </div>
    );
  }
  if (!projection) return null;
  const p = projection.projected;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-400">Projected impact at 90 days</div>
        {projection.diminishing_returns_pct > 5 && (
          <div className="text-[9px] text-amber-400/80 italic" title="Stacking similar actions yields diminishing returns">
            -{projection.diminishing_returns_pct}% diminishing returns
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <ProjectionMetric label="Clicks"      metric={p.clicks}      lowerIsBetter={false} format="count" />
        <ProjectionMetric label="Impressions" metric={p.impressions} lowerIsBetter={false} format="count" />
        <ProjectionMetric label="Position"    metric={p.position}    lowerIsBetter={true}  format="position" />
        <ProjectionMetric label="CTR"         metric={p.ctr}         lowerIsBetter={false} format="percent" />
        <ProjectionMetric label="Sessions"    metric={p.sessions}    lowerIsBetter={false} format="count" />
        <ProjectionMetric label="Conversions" metric={p.conversions} lowerIsBetter={false} format="count" />
      </div>
      {projection.contributions.length > 1 && (
        <details className="text-[10px]">
          <summary className="text-muted-foreground cursor-pointer hover:text-foreground">View per-action contribution</summary>
          <div className="mt-1.5 space-y-1 pl-3">
            {projection.contributions.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-muted-foreground">
                <span className="text-cyan-400/60 w-4">{i+1}.</span>
                <span className="flex-1">{c.action_name}</span>
                <span className={confidenceColor(c.confidence)}>{c.confidence}</span>
                {c.contribution_clicks !== 0 && (
                  <span className="text-emerald-400/80">+{c.contribution_clicks}% clicks</span>
                )}
                {c.contribution_position !== 0 && (
                  <span className="text-blue-400/80">{c.contribution_position > 0 ? '+' : ''}{c.contribution_position} pos</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ProjectionMetric({
  label, metric, lowerIsBetter, format,
}: {
  label: string;
  metric: ScenarioProjectionClient['projected']['clicks'];
  lowerIsBetter: boolean;
  format: 'count' | 'percent' | 'position';
}) {
  const diff = metric.day_90 - metric.baseline;
  const isImprovement = lowerIsBetter ? diff < 0 : diff > 0;
  const isFlat = Math.abs(diff) < (lowerIsBetter ? 0.1 : 1);

  const fmt = (n: number) => {
    if (format === 'position') return n.toFixed(1);
    if (format === 'percent')  return n.toFixed(1) + '%';
    if (Math.abs(n) >= 1000)   return (n / 1000).toFixed(1) + 'k';
    return Math.round(n).toLocaleString();
  };

  const arrow = isFlat
    ? <Minus className="h-3 w-3 text-muted-foreground" />
    : isImprovement
      ? <ArrowUpRight className="h-3 w-3 text-emerald-400" />
      : <ArrowDownRight className="h-3 w-3 text-red-400" />;
  const color = isFlat ? 'text-muted-foreground' : isImprovement ? 'text-emerald-400' : 'text-red-400';
  const pctChange = metric.baseline > 0
    ? ((metric.day_90 - metric.baseline) / metric.baseline) * 100
    : 0;

  return (
    <div className="rounded-lg border border-border bg-card/30 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-base font-bold text-foreground">{fmt(metric.day_90)}</span>
      </div>
      <div className="text-[9px] text-muted-foreground">from {fmt(metric.baseline)}</div>
      <div className={`flex items-center gap-0.5 mt-0.5 ${color}`}>
        {arrow}
        <span className="text-[10px] font-bold">
          {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(0)}%
        </span>
      </div>
      <div className="text-[8px] text-muted-foreground/60 mt-0.5">
        range {fmt(metric.day_90_low)} – {fmt(metric.day_90_high)}
      </div>
    </div>
  );
}

/* ─── Saved scenario row ────────────────────────────────────── */

function SavedScenarioRow({
  scenario, onLoad, onDelete,
}: { scenario: SavedScenarioClient; onLoad: () => void; onDelete: () => void }) {
  const proj = scenario.projected_impact;
  const clicksLift = proj
    ? Math.round(((proj.projected.clicks.day_90 - proj.projected.clicks.baseline) / Math.max(1, proj.projected.clicks.baseline)) * 100)
    : 0;
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2.5 hover:border-amber-500/30 transition-all">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-bold text-foreground">{scenario.name}</div>
          {scenario.description && (
            <div className="text-[10px] text-muted-foreground line-clamp-1">{scenario.description}</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onLoad}
            className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 font-bold"
          >Load</button>
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-red-400 p-1"
            title="Delete scenario"
          ><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
        <span>{scenario.actions?.length || 0} actions</span>
        {proj && (
          <>
            <span>· {proj.total_effort_hours}h</span>
            {clicksLift !== 0 && (
              <span className={clicksLift > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {clicksLift > 0 ? '+' : ''}{clicksLift}% clicks @ 90d
              </span>
            )}
          </>
        )}
        {scenario.shared_with_client && <span className="text-cyan-400">· shared</span>}
        <span className="ml-auto">{new Date(scenario.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
      </div>
    </div>
  );
}
