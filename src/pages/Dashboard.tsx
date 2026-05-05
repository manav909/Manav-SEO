import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Globe, Zap, Star, Brain,
  ShieldCheck, LogOut, ArrowUpRight, CheckCircle,
  Target, Trophy, Eye, BarChart3, Sparkles,
  X, HelpCircle, ChevronRight, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

/* ── SCORE RING ── */
const ScoreRing = ({
  score, label, color, onClick
}: {
  score: number; label: string; color: string; onClick?: () => void;
}) => {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 group ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{score}</span>
        {onClick && (
          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <HelpCircle className="h-2.5 w-2.5 text-primary" />
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
      {onClick && (
        <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity font-mono">tap for why</span>
      )}
    </button>
  );
};

/* ── WHY MODAL ── */
const WhyModal = ({
  explanation, title, score, color, onClose
}: {
  explanation: any; title: string; score: number; color: string; onClose: () => void;
}) => {
  if (!explanation) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.6)] overflow-hidden max-h-[85vh] overflow-y-auto">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border sticky top-0 bg-card/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full flex items-center justify-center border-2"
              style={{ borderColor: color, background: `${color}15` }}>
              <span className="text-sm font-bold" style={{ color }}>{score}</span>
            </div>
            <div>
              <div className="font-bold text-sm">{title}</div>
              <div className="text-xs text-muted-foreground">Score breakdown & next steps</div>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">

          {/* Why this score */}
          <div className="rounded-xl border border-border bg-background/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Why This Score</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{explanation.score_reason}</p>
          </div>

          {/* What it means */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-mono uppercase tracking-wider text-primary">What This Means For You</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed font-medium">{explanation.what_it_means}</p>
          </div>

          {/* Proof points */}
          {explanation.proof_points?.length > 0 && (
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Evidence From Your Site</span>
              </div>
              <div className="space-y-2">
                {explanation.proof_points.map((point: string, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <ChevronRight className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-foreground leading-relaxed">{point}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What was done */}
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">What's Driving This</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{explanation.what_was_done}</p>
          </div>

          {/* What to expect */}
          <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs font-mono uppercase tracking-wider text-green-400">What To Expect Next</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{explanation.what_to_expect}</p>
          </div>

        </div>
      </div>
    </div>
  );
};

/* ── STAT CARD WITH WHY ── */
const StatCard = ({
  icon: Icon, label, value, delta: d,
  color = 'text-primary', explanation, title, score, ringColor
}: any) => {
  const [showWhy, setShowWhy] = useState(false);
  return (
    <>
      <div
        className="rounded-2xl border border-border bg-card/60 backdrop-blur p-4 cursor-pointer group hover:border-primary/40 transition-colors"
        onClick={() => explanation && setShowWhy(true)}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
          <div className="flex items-center gap-1">
            {explanation && (
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            )}
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
        <div className="text-2xl font-bold text-foreground mb-1">{value ?? '—'}</div>
        {d !== null && d !== undefined && (
          <div className={`text-xs flex items-center gap-1 ${d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            <ArrowUpRight className={`h-3 w-3 ${d < 0 ? 'rotate-180' : ''}`} />
            {d >= 0 ? '+' : ''}{d} vs last period
          </div>
        )}
        {explanation && (
          <div className="text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity font-mono">
            tap to understand why →
          </div>
        )}
      </div>
      {showWhy && (
        <WhyModal
          explanation={explanation}
          title={title || label}
          score={score || value}
          color={ringColor || '#6366f1'}
          onClose={() => setShowWhy(false)}
        />
      )}
    </>
  );
};

/* ── MAIN DASHBOARD ── */
export default function Dashboard() {
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [upsells, setUpsells] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingUpsell, setApprovingUpsell] = useState<string|null>(null);
  const [activeModal, setActiveModal] = useState<{key: string; title: string; color: string} | null>(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (selectedProject) loadProjectData(selectedProject.id); }, [selectedProject]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/'); return; }
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!prof?.approved) { navigate('/'); return; }
    if (prof.client_id) {
      const { data: c } = await supabase.from('clients').select('*').eq('id', prof.client_id).single();
      setClient(c);
      const { data: p } = await supabase.from('projects').select('*').eq('client_id', prof.client_id);
      setProjects(p || []);
      if (p && p.length > 0) setSelectedProject(p[0]);
    }
    setLoading(false);
  };

  const loadProjectData = async (projectId: string) => {
    const [m, u] = await Promise.all([
      supabase.from('metrics').select('*').eq('project_id', projectId).order('recorded_at'),
      supabase.from('upsells').select('*').eq('project_id', projectId).eq('status', 'pending'),
    ]);
    setMetrics(m.data || []);
    setUpsells(u.data || []);
  };

  const approveUpsell = async (id: string) => {
    setApprovingUpsell(id);
    const { error } = await supabase.from('upsells').update({ status:'approved' }).eq('id', id);
    if (!error) {
      toast({ title:'Sprint Approved!', description:'Manav will begin immediately.' });
      setUpsells(u => u.filter(x => x.id !== id));
    }
    setApprovingUpsell(null);
  };

  const latest = metrics[metrics.length - 1];
  const previous = metrics[metrics.length - 2];
  const delta = (key: string) => {
    if (!latest || !previous || latest[key] == null || previous[key] == null) return null;
    return latest[key] - previous[key];
  };
  const exp = latest?.explanations || {};

  const indexingPct = latest?.pages_submitted > 0
    ? Math.round((latest.pages_indexed / latest.pages_submitted) * 100) : null;

  const chartData = metrics.map(m => ({
    date: new Date(m.recorded_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' }),
    llm: m.llm_visibility_score,
    health: m.algorithm_health_score,
    authority: m.content_authority_score,
    growth: m.overall_growth_score,
  }));

  const totalCitations = latest
    ? (latest.chatgpt_citations || 0) + (latest.perplexity_citations || 0) + (latest.google_ai_citations || 0)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground font-mono">Loading your growth portal...</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center rounded-2xl border border-border bg-card/60 p-10">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Your Dashboard is Being Set Up</h2>
          <p className="text-muted-foreground text-sm mb-6">Manav is configuring your growth portal. You'll be notified once your first report is ready.</p>
          <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate('/'); }} className="border-border">
            <LogOut className="h-4 w-4 mr-2" />Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Active modal from score rings */}
      {activeModal && latest && (
        <WhyModal
          explanation={exp[activeModal.key]}
          title={activeModal.title}
          score={(latest as any)[activeModal.key]}
          color={activeModal.color}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* NAV */}
      <div className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav" className="h-8 w-8 rounded-full object-cover ring-2 ring-primary" style={{ objectPosition:'center 20%' }} />
            <div>
              <div className="font-bold text-sm">SEO Seasons</div>
              <div className="text-xs text-muted-foreground">{client.company} — Growth Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {projects.length > 1 && (
              <select value={selectedProject?.id || ''}
                onChange={e => setSelectedProject(projects.find(x => x.id === e.target.value))}
                className="h-8 rounded-lg border border-border bg-background/60 text-xs px-3">
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <Button variant="outline" size="sm"
              onClick={async () => { await supabase.auth.signOut(); navigate('/'); }}
              className="border-border text-xs">
              <LogOut className="h-3 w-3 mr-1.5" />Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Welcome */}
        <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 to-transparent p-5 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-primary uppercase tracking-wider mb-1">Welcome back</div>
            <h1 className="text-xl font-bold">{client.name}</h1>
            <div className="text-sm text-muted-foreground">{selectedProject?.url} · Managed by Manav</div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs border border-green-400/30 text-green-400 rounded-full px-3 py-1.5 bg-green-400/5">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Active Campaign
          </div>
        </div>

        {/* Tap hint */}
        {latest && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/15 rounded-xl px-4 py-2.5">
            <HelpCircle className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Tap any score or metric to understand exactly <strong className="text-foreground">why</strong> it is what it is, what we did, and what to expect next.</span>
          </div>
        )}

        {/* Big Win */}
        {latest?.milestone && (
          <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/5 p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center shrink-0">
                <Trophy className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-1">This Period's Big Win</div>
                <div className="font-bold text-base text-foreground mb-1">{latest.milestone}</div>
                {latest.milestone_impact && (
                  <p className="text-sm text-muted-foreground">{latest.milestone_impact}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Score Rings — all tappable */}
        {latest && (
          <div className="rounded-2xl border border-border bg-card/60 p-6">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-5">
              Your Visibility Health — tap any score to understand it
            </div>
            <div className="flex flex-wrap justify-around gap-6">
              {[
                { key:'llm_visibility_score', label:'LLM Visibility', color:'#6366f1', title:'LLM Visibility Score' },
                { key:'algorithm_health_score', label:'Google Health', color:'#06b6d4', title:'Google Algorithm Health' },
                { key:'eeat_score', label:'E-E-A-T Authority', color:'#8b5cf6', title:'E-E-A-T Authority Score' },
                { key:'content_authority_score', label:'Content Authority', color:'#f59e0b', title:'Content Authority Score' },
                { key:'overall_growth_score', label:'Overall Growth', color:'#4ade80', title:'Overall Growth Score' },
              ].map(({ key, label, color, title }) => (
                <ScoreRing
                  key={key}
                  score={latest[key] || 0}
                  label={label}
                  color={color}
                  onClick={exp[key] ? () => setActiveModal({ key, title, color }) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Stat Cards — all tappable */}
        {latest && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Brain} label="Total AI Citations" color="text-primary"
              value={totalCitations} delta={null}
              title="Total AI Citations" score={totalCitations} ringColor="#6366f1"
              explanation={exp.chatgpt_citations}
            />
            <StatCard
              icon={Eye} label="Pages Indexed" color="text-cyan-400"
              value={latest.pages_indexed} delta={delta('pages_indexed')}
              title="Google Index Status" score={latest.pages_indexed} ringColor="#06b6d4"
              explanation={exp.pages_indexed}
            />
            <StatCard
              icon={Trophy} label="Market Rank" color="text-yellow-400"
              value={latest.competitor_rank ? `#${latest.competitor_rank}` : '—'}
              delta={delta('competitor_rank') !== null ? -(delta('competitor_rank') as number) : null}
              title="Competitive Market Rank" score={latest.competitor_rank} ringColor="#f59e0b"
              explanation={exp.competitor_rank}
            />
            <StatCard
              icon={TrendingUp} label="Brand Mentions" color="text-green-400"
              value={latest.brand_mentions} delta={delta('brand_mentions')}
              title="Brand Mentions" score={latest.brand_mentions} ringColor="#4ade80"
              explanation={exp.brand_mentions}
            />
          </div>
        )}

        {/* LLM Platform Breakdown — tappable rows */}
        {latest && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">AI Engine Presence</span>
                <span className="ml-auto text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {totalCitations} citations
                </span>
              </div>
              <div className="space-y-3">
                {[
                  { name:'ChatGPT', value: latest.chatgpt_citations || 0, color:'#6366f1', expKey:'chatgpt_citations', title:'ChatGPT Citations' },
                  { name:'Perplexity', value: latest.perplexity_citations || 0, color:'#8b5cf6', expKey:'perplexity_citations', title:'Perplexity Citations' },
                  { name:'Google AI Overviews', value: latest.google_ai_citations || 0, color:'#06b6d4', expKey:'google_ai_citations', title:'Google AI Overview Citations' },
                ].map(item => (
                  <button key={item.name}
                    onClick={() => exp[item.expKey] && setActiveModal({ key: item.expKey, title: item.title, color: item.color })}
                    className="w-full group text-left">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold">{item.value} citations</span>
                        {exp[item.expKey] && (
                          <HelpCircle className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                        )}
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000"
                        style={{ width:`${Math.min(100, (item.value / Math.max(totalCitations, 1)) * 100)}%`, background: item.color }} />
                    </div>
                  </button>
                ))}
              </div>
              {latest.llm_platforms?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {latest.llm_platforms.map((p: string) => (
                    <span key={p} className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">{p}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Indexing */}
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-4 w-4 text-cyan-400" />
                <span className="font-semibold text-sm">Google Index Status</span>
                {exp.pages_indexed && (
                  <button onClick={() => setActiveModal({ key:'pages_indexed', title:'Google Index Status', color:'#06b6d4' })}
                    className="ml-auto text-xs text-primary font-mono flex items-center gap-1 hover:underline">
                    <HelpCircle className="h-3 w-3" />why?
                  </button>
                )}
              </div>
              {latest.pages_submitted > 0 ? (
                <>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-3xl font-bold">{latest.pages_indexed}</span>
                    <span className="text-muted-foreground text-sm mb-1">of {latest.pages_submitted} pages</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-secondary overflow-hidden mb-2">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-1000"
                      style={{ width:`${indexingPct}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground">{indexingPct}% of your content visible to Google</div>
                  {delta('pages_indexed') !== null && (delta('pages_indexed') as number) > 0 && (
                    <div className="mt-1 text-xs text-green-400 flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3" />+{delta('pages_indexed')} new pages indexed
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Indexing data will appear in your next report.</div>
              )}
            </div>
          </div>
        )}

        {/* Competitive Position — tappable */}
        {latest && (latest.competitor_rank > 0 || latest.competitors_beaten > 0 || latest.competitor_gap_note) && (
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-4 w-4 text-yellow-400" />
              <span className="font-semibold text-sm">Competitive Position</span>
              {exp.competitor_rank && (
                <button onClick={() => setActiveModal({ key:'competitor_rank', title:'Competitive Market Rank', color:'#f59e0b' })}
                  className="ml-auto text-xs text-primary font-mono flex items-center gap-1 hover:underline">
                  <HelpCircle className="h-3 w-3" />why?
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {latest.competitor_rank > 0 && (
                <div className="rounded-xl border border-border bg-background/40 p-4 text-center">
                  <div className="text-3xl font-bold text-primary">#{latest.competitor_rank}</div>
                  <div className="text-xs text-muted-foreground mt-1">Market Rank</div>
                  {delta('competitor_rank') !== null && (delta('competitor_rank') as number) < 0 && (
                    <div className="text-xs text-green-400 mt-1 flex items-center justify-center gap-1">
                      <ArrowUpRight className="h-3 w-3" />Moved up {Math.abs(delta('competitor_rank') as number)} places
                    </div>
                  )}
                </div>
              )}
              {latest.competitors_beaten > 0 && (
                <div className="rounded-xl border border-border bg-background/40 p-4 text-center">
                  <div className="text-3xl font-bold text-green-400">{latest.competitors_beaten}</div>
                  <div className="text-xs text-muted-foreground mt-1">Competitors Behind You</div>
                </div>
              )}
              {latest.competitor_gap_note && (
                <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
                  <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-1">Competitive Intel</div>
                  <p className="text-sm text-foreground">{latest.competitor_gap_note}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Growth Chart */}
        {chartData.length > 1 && (
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Growth Trajectory</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize:11, fill:'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0,100]} tick={{ fontSize:11, fill:'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={{ background:'hsl(var(--card))', border:'1px solid hsl(var(--border))', borderRadius:'12px', fontSize:'12px' }} />
                <Line type="monotone" dataKey="llm" name="LLM Visibility" stroke="#6366f1" strokeWidth={2} dot={{ r:3 }} />
                <Line type="monotone" dataKey="health" name="Google Health" stroke="#06b6d4" strokeWidth={2} dot={{ r:3 }} />
                <Line type="monotone" dataKey="authority" name="Authority" stroke="#f59e0b" strokeWidth={2} dot={{ r:3 }} />
                <Line type="monotone" dataKey="growth" name="Overall Growth" stroke="#4ade80" strokeWidth={2} dot={{ r:3 }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-3 justify-center">
              {[
                { color:'#6366f1', label:'LLM Visibility' },
                { color:'#06b6d4', label:'Google Health' },
                { color:'#f59e0b', label:'Authority' },
                { color:'#4ade80', label:'Overall Growth' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upsells */}
        {upsells.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              <span className="font-semibold text-sm">Growth Opportunities Manav Identified For You</span>
            </div>
            {upsells.map(upsell => (
              <div key={upsell.id} className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                      <span className="font-bold text-sm">{upsell.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{upsell.description}</p>
                    {upsell.potential_impact && (
                      <div className="inline-flex items-center gap-1.5 text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2.5 py-1 mb-3">
                        <TrendingUp className="h-3 w-3" />{upsell.potential_impact}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">${upsell.price}</span>
                      <span className="text-xs text-muted-foreground">added to next invoice · no contracts</span>
                    </div>
                  </div>
                  <Button onClick={() => approveUpsell(upsell.id)} disabled={approvingUpsell === upsell.id}
                    className="shrink-0 bg-gradient-to-r from-yellow-500 to-yellow-400 text-black font-bold hover:opacity-90">
                    {approvingUpsell === upsell.id
                      ? <div className="h-4 w-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                      : <><CheckCircle className="h-4 w-4 mr-2" />Approve Sprint</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {metrics.length === 0 && (
          <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-2">Your Growth Dashboard is Being Prepared</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Manav is running your first website analysis. Your dashboard will populate automatically — check back shortly.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground py-4 border-t border-border">
          <div className="flex items-center justify-center gap-4 mb-2 flex-wrap">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-primary" />All data is private</span>
            <span className="flex items-center gap-1.5"><Star className="h-3 w-3 text-primary" />Fiverr Top Rated</span>
            <span className="flex items-center gap-1.5"><Globe className="h-3 w-3 text-primary" />SEO Seasons by Manav</span>
          </div>
          © 2026 SEO Seasons — Client Growth Portal
        </div>
      </div>
    </div>
  );
}
