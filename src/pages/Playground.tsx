import { useState, useEffect } from 'react';
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';

const post = (a: string, b: any = {}) =>
  fetch('/api/task-engine', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: a, ...b }),
  }).then(r => r.json()).catch(() => ({}));

const STATUS_COLOR: any = {
  todo: '#6366f1', in_progress: '#f59e0b', done: '#10b981',
  blocked: '#ef4444', review: '#a78bfa',
};
const TYPE_COLOR: any = {
  seo_audit: '#6366f1', content: '#10b981', technical: '#f97316',
  link_building: '#a78bfa', local: '#06b6d4', strategy: '#f59e0b',
  brain: '#e879f9', task: '#94a3b8',
};
const PRIORITY_BADGE: any = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#10b981',
};

export default function Playground() {
  const { selectedProject, selectedProjectId } = useProject();
  const [tab, setTab] = useState<'canvas' | 'pipeline' | 'reports'>('canvas');
  const [cards, setCards] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [copied, setCopied] = useState('');
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    if (!selectedProjectId) { setCards([]); setTasks([]); return; }
    setLoading(true);
    post('get_canvas_data', { projectId: selectedProjectId }).then(r => {
      console.log('[Canvas] API response:', JSON.stringify(r, null, 2));
      if ((r as any).success) {
        setCards((r as any).cards || []);
        setTasks((r as any).tasks || []);
      }
      setDebugInfo(r);
      setLoading(false);
    });
  }, [selectedProjectId]);

  const updateStatus = async (cardId: string, status: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, status } : c));
    await post('update_canvas_card', { projectId: selectedProjectId, cardId, updates: { status } });
  };

  const copyContent = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id); setTimeout(() => setCopied(''), 2000);
  };

  const statuses = ['all', ...Array.from(new Set(cards.map(c => c.status).filter(Boolean)))];
  const types    = ['all', ...Array.from(new Set(cards.map(c => c.type).filter(Boolean)))];

  const filtered = cards.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || (c.title||'').toLowerCase().includes(q) || (c.content||'').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchType   = filterType   === 'all' || c.type   === filterType;
    return matchSearch && matchStatus && matchType;
  });

  const grouped: Record<string, any[]> = { todo: [], in_progress: [], review: [], done: [], blocked: [] };
  filtered.forEach(c => { const k = c.status || 'todo'; (grouped[k] = grouped[k] || []).push(c); });
  const COLS = ['todo', 'in_progress', 'review', 'done', 'blocked'];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Canvas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedProject ? `${selectedProject.name} — ${cards.length} cards` : 'Select a project to begin'}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          {(['canvas','pipeline','reports'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab===t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>{t === 'canvas' ? 'Strategy Canvas' : t.charAt(0).toUpperCase()+t.slice(1)}</button>
          ))}
        </div>

        {/* ── CANVAS TAB ── */}
        {tab === 'canvas' && (
          <div>
            {!selectedProjectId && (
              <div className="rounded-2xl border border-border bg-card p-10 text-center">
                <div className="text-3xl mb-3">🗂</div>
                <p className="text-sm text-muted-foreground">Select a project from the navigation to load your strategy canvas.</p>
              </div>
            )}

            {selectedProjectId && loading && (
              <div className="text-center py-16 text-sm text-muted-foreground">Loading canvas…</div>
            )}

            {selectedProjectId && !loading && cards.length === 0 && (
              <div>
                <div className="rounded-2xl border border-border bg-card p-10 text-center mb-4">
                  <div className="text-3xl mb-3">📋</div>
                  <p className="text-sm font-semibold mb-2">No canvas cards found</p>
                  <p className="text-xs text-muted-foreground">Checked: task_requirements table + playground_strategy.canvas_blocks</p>
                </div>
                {debugInfo && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs font-mono">
                    <div className="font-bold text-amber-400 mb-2">Debug Info</div>
                    <pre className="text-muted-foreground whitespace-pre-wrap">{JSON.stringify(debugInfo, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {selectedProjectId && !loading && cards.length > 0 && (
              <div>
                {/* Stats row */}
                <div className="grid grid-cols-5 gap-3 mb-6">
                  {COLS.map(s => {
                    const count = cards.filter(c => (c.status||'todo') === s).length;
                    return (
                      <div key={s} className="rounded-xl border border-border bg-card p-3 text-center">
                        <div className="text-lg font-bold" style={{color: STATUS_COLOR[s]||'#94a3b8'}}>{count}</div>
                        <div className="text-xs text-muted-foreground capitalize mt-0.5">{s.replace('_',' ')}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Filters */}
                <div className="flex gap-3 mb-5 flex-wrap">
                  <input value={search} onChange={e=>setSearch(e.target.value)}
                    placeholder="Search cards…"
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary w-48"/>
                  <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary">
                    {statuses.map(s => <option key={s} value={s}>{s==='all'?'All Status':s.replace('_',' ')}</option>)}
                  </select>
                  <select value={filterType} onChange={e=>setFilterType(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary">
                    {types.map(t => <option key={t} value={t}>{t==='all'?'All Types':t.replace('_',' ')}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground self-center">{filtered.length} of {cards.length} cards</span>
                </div>

                {/* Kanban board */}
                <div className="grid gap-4" style={{gridTemplateColumns:`repeat(${COLS.filter(c=>grouped[c]?.length).length},1fr)`}}>
                  {COLS.filter(col => grouped[col]?.length > 0).map(col => (
                    <div key={col}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full" style={{background: STATUS_COLOR[col]||'#94a3b8'}}/>
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{col.replace('_',' ')}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{grouped[col].length}</span>
                      </div>
                      <div className="space-y-3">
                        {grouped[col].map((card: any) => (
                          <div key={card.id} className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {card.type && <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{background:`${TYPE_COLOR[card.type]||'#94a3b8'}18`,color:TYPE_COLOR[card.type]||'#94a3b8'}}>
                                  {card.type.replace('_',' ')}
                                </span>}
                                {card.priority && <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{background:`${PRIORITY_BADGE[card.priority]||'#94a3b8'}18`,color:PRIORITY_BADGE[card.priority]||'#94a3b8'}}>
                                  {card.priority}
                                </span>}
                              </div>
                              {card.week && <span className="text-xs text-muted-foreground shrink-0">W{card.week}</span>}
                            </div>
                            <div className="text-sm font-semibold mb-2 leading-snug">{card.title}</div>
                            {card.content && <div className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-3">{card.content}</div>}
                            <div className="flex items-center justify-between gap-2">
                              <select value={card.status||'todo'}
                                onChange={e=>updateStatus(card.id, e.target.value)}
                                className="text-xs px-2 py-1 rounded-lg border border-border bg-background outline-none"
                                style={{color:STATUS_COLOR[card.status||'todo']}}>
                                {['todo','in_progress','review','done','blocked'].map(s=>
                                  <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                              </select>
                              {card.content && (
                                <button onClick={()=>copyContent(card.content, card.id)}
                                  className="text-xs text-muted-foreground hover:text-primary transition-colors">
                                  {copied===card.id?'✓ Copied':'Copy'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {filtered.length === 0 && (
                  <div className="text-center py-12 text-sm text-muted-foreground">No cards match your filters</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PIPELINE TAB ── */}
        {tab === 'pipeline' && (
          <div>
            {!selectedProjectId && <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Select a project to view the pipeline.</div>}
            {selectedProjectId && (
              <div className="space-y-3">
                {tasks.length === 0 && !loading && (
                  <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No pipeline tasks yet for this project.</div>
                )}
                {tasks.map((t: any) => (
                  <div key={t.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{background:STATUS_COLOR[t.status]||'#94a3b8'}}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{t.task_type?.replace(/_/g,' ')||'Task'}</div>
                      {t.output?.summary && <div className="text-xs text-muted-foreground mt-0.5 truncate">{t.output.summary}</div>}
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : ''}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                      style={{background:`${STATUS_COLOR[t.status]||'#94a3b8'}18`,color:STATUS_COLOR[t.status]||'#94a3b8'}}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── REPORTS TAB ── */}
        {tab === 'reports' && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold mb-2">Reports</h2>
            <p className="text-sm text-muted-foreground mb-3">Auto-generated performance reports for your project.</p>
            <a href="/reports" className="text-sm text-primary hover:underline font-medium">Open full Reports page →</a>
          </div>
        )}

      </div>
    </div>
  );
}
