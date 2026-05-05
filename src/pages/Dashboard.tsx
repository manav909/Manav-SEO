import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Globe, Zap, Star, Brain,
  ShieldCheck, LogOut, ArrowUpRight, ArrowDownRight,
  Target, Trophy, Eye, BarChart3, Sparkles,
  X, HelpCircle, ChevronRight, Clock, Gauge,
  Shield, Swords, CalendarDays, Flag, Check,
  Minus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  LineChart, Line, XAxis, YAxis, ReferenceLine,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

/* ─── helpers ─── */
const getScoreConfig = (score: number) => {
  if (score >= 80) return { label:'Leading',     text:'text-green-400',  bar:'#4ade80',  emoji:'🏆' };
  if (score >= 60) return { label:'Growing',     text:'text-blue-400',   bar:'#60a5fa',  emoji:'📈' };
  if (score >= 40) return { label:'Building',    text:'text-yellow-400', bar:'#facc15',  emoji:'🚀' };
  if (score >= 20) return { label:'Launching',   text:'text-orange-400', bar:'#fb923c',  emoji:'⚡' };
  return             { label:'Opportunity', text:'text-primary',    bar:'#6366f1',  emoji:'💎' };
};

const confidenceBadge = (c?: string) => {
  const map: Record<string,string> = {
    verified:    'bg-green-400/10 text-green-400 border-green-400/20',
    estimated:   'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
    approximate: 'bg-orange-400/10 text-orange-400 border-orange-400/20',
  };
  return (c && map[c]) || map.estimated;
};

const fmtDate = (raw: string) => {
  if (!raw) return '';
  const s = raw.split('T')[0];
  const [y, m, d] = s.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
};

const fmtShort = (raw: string) => {
  if (!raw) return '';
  const s = raw.split('T')[0];
  const [, m, d] = s.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m)-1]}`;
};

const toDateStr = (raw: string) => raw ? raw.split('T')[0] : '';

/* find metric closest to a given date */
const closestMetric = (metrics: any[], dateStr: string) => {
  if (!metrics.length || !dateStr) return null;
  return metrics.reduce((best, m) => {
    const mDate = toDateStr(m.recorded_at);
    const bestDate = best ? toDateStr(best.recorded_at) : '';
    return Math.abs(new Date(mDate).getTime() - new Date(dateStr).getTime()) 
           Math.abs(new Date(bestDate).getTime() - new Date(dateStr).getTime())
      ? m : best;
  }, metrics[0]);
};

/* generate fallback explanation */
const buildFallback = (metricKey: string, score: number) => {
  const cfg = getScoreConfig(score);
  const templates: Record<string, any> = {
    llm_visibility_score: {
      score_reason: `Your LLM visibility score is ${score}/100 — ${cfg.label} stage. This reflects how ready your content is to be cited by ChatGPT, Perplexity, and Google AI Overviews.`,
      what_it_means: `Every point gained here means more buyers find your business through AI-generated answers — without paying for ads.`,
      opportunity: `Adding structured FAQ content targeting your top buyer questions is the fastest path to growing this score.`,
      what_to_expect: `With consistent content work, this score typically grows 15–25 points within 60 days.`,
      proof_points: [`Score of ${score}/100 based on content structure and AI citation readiness.`],
    },
    algorithm_health_score: {
      score_reason: `Google Algorithm Health is ${score}/100. This reflects alignment with Google's Helpful Content and E-E-A-T guidelines based on your current site content.`,
      what_it_means: `A stronger health score means better resistance to algorithm updates and more stable rankings.`,
      opportunity: `Improving content depth and adding verifiable author/business credentials has the highest impact here.`,
      what_to_expect: `Targeted improvements typically move this 10–20 points within 45 days.`,
      proof_points: [`Health score of ${score}/100 based on content quality and compliance signals.`],
    },
    eeat_score: {
      score_reason: `E-E-A-T score is ${score}/100 — measuring how well Google can verify your Experience, Expertise, Authoritativeness, and Trustworthiness.`,
      what_it_means: `E-E-A-T is critical for competitive niches. Higher scores mean Google trusts your site more, leading to better placements.`,
      opportunity: `Adding team credentials, certifications, testimonials with names, and a detailed About page builds E-E-A-T rapidly.`,
      what_to_expect: `E-E-A-T improvements compound over time. Expect 12–18 point growth within 60 days.`,
      proof_points: [`E-E-A-T of ${score}/100 from trust and authority signal analysis.`],
    },
    content_authority_score: {
      score_reason: `Content Authority is ${score}/100 — reflecting the depth, specificity, and citation-worthiness of your current content.`,
      what_it_means: `Higher authority means Google and AI engines treat your site as a primary source, amplifying all other SEO efforts.`,
      opportunity: `One comprehensive statistics-rich guide per month on your core topic grows this score significantly.`,
      what_to_expect: `Content authority builds steadily — 10–20 point growth within 90 days with a structured content plan.`,
      proof_points: [`Authority of ${score}/100 from content depth and specificity analysis.`],
    },
    overall_growth_score: {
      score_reason: `Overall Growth Score is ${score}/100 — a composite of LLM visibility, Google health, E-E-A-T, and content authority.`,
      what_it_means: `This is your single most important number. Every point means your business is harder to displace and easier to find.`,
      opportunity: `Focusing on LLM visibility and E-E-A-T simultaneously delivers the fastest compound growth.`,
      what_to_expect: `With consistent strategy, overall scores typically improve 20–35 points over 90 days.`,
      proof_points: [`Composite score of ${score}/100 across all visibility and authority signals.`],
    },
    competitor_rank: {
      score_reason: `Market rank #${score} reflects your current competitive position based on content quality vs competitors.`,
      what_it_means: `Every position moved up means more buyers choose you over a competitor.`,
      opportunity: `Closing specific content gaps your top competitors have is the most direct path to improving rank.`,
      what_to_expect: `Competitive improvements are visible within 45–60 days when gaps are specifically targeted.`,
      proof_points: [`Rank based on comparative content quality and visibility analysis.`],
    },
    pages_indexed: {
      score_reason: `${score} pages are currently indexed by Google. Each indexed page is a potential entry point for buyers to find your business.`,
      what_it_means: `More indexed pages means a wider organic footprint — more ways for buyers to discover you.`,
      opportunity: `Ensuring all key pages have unique, valuable content removes indexing barriers quickly.`,
      what_to_expect: `Indexing gaps are typically resolved within 2–4 weeks of technical optimization.`,
      proof_points: [`Indexing count from Google search index data for your domain.`],
    },
    brand_mentions: {
      score_reason: `${score} brand mentions detected — each signals to Google and AI engines that your business has real-world presence.`,
      what_it_means: `Brand mentions build entity recognition, making AI engines more confident recommending your business.`,
      opportunity: `A targeted digital PR campaign can multiply brand mentions rapidly.`,
      what_to_expect: `Active outreach typically generates 20–50 new mentions per month.`,
      proof_points: [`Brand mention count from web presence and content analysis.`],
    },
    chatgpt_citations: {
      score_reason: `Your AI citations across ChatGPT, Perplexity, and Google AI Overviews reflect how often AI engines surface your brand.`,
      what_it_means: `AI citations drive highly qualified traffic — buyers who find you through AI are already pre-sold.`,
      opportunity: `Structuring content to answer the exact questions buyers ask AI engines is the fastest path to citation growth.`,
      what_to_expect: `Targeted FAQ and entity content additions typically grow citation counts 3–5x within 60 days.`,
      proof_points: [`Citation estimate based on AI engine visibility analysis.`],
    },
  };
  return templates[metricKey] || {
    score_reason: `This metric currently scores ${score}. The AI-generated detailed analysis will be richer after the next analysis run.`,
    what_it_means: `Every improvement here strengthens your overall digital presence and competitive position.`,
    opportunity: `Run a fresh AI analysis to get specific, actionable recommendations.`,
    what_to_expect: `Focused effort on this metric typically yields 10–20 point improvements within 60 days.`,
    proof_points: [`Score of ${score} based on current site analysis.`],
  };
};

/* ─── Growth Projections ─── */
const GrowthProjections = ({ projections, currentScore }: any) => {
  const defaults = {
    conservative: { label:'Normal Pace',    score_gain:Math.max(5, Math.round((100-currentScore)*0.10)), timeframe:'60-90 days', actions:'Monthly content updates and basic optimizations.', confidence:'High' },
    normal:       { label:'Active Strategy', score_gain:Math.max(10,Math.round((100-currentScore)*0.20)), timeframe:'45-60 days', actions:'Weekly optimizations, structured content plan, competitor gap targeting.', confidence:'Medium-High' },
    aggressive:   { label:'Full Sprint',     score_gain:Math.max(15,Math.round((100-currentScore)*0.35)), timeframe:'30-45 days', actions:'Daily publishing, outreach, technical audits, and AI optimization simultaneously.', confidence:'Medium' },
  };
  const tiers = projections || defaults;
  return (
    <div className="space-y-2">
      {[
        { key:'conservative', color:'text-blue-400',   bar:'bg-blue-400',   border:'border-blue-400/20',   bg:'bg-blue-400/5'   },
        { key:'normal',       color:'text-yellow-400', bar:'bg-yellow-400', border:'border-yellow-400/20', bg:'bg-yellow-400/5' },
        { key:'aggressive',   color:'text-orange-400', bar:'bg-orange-400', border:'border-orange-400/20', bg:'bg-orange-400/5' },
      ].map(({ key, color, bar, border, bg }) => {
        const t = tiers[key];
        if (!t) return null;
        const target = Math.min(100, currentScore + (t.score_gain || 0));
        return (
          <div key={key} className={`rounded-xl border ${border} ${bg} p-3`}>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className={`text-xs font-bold ${color}`}>{t.label}</span>
                <span className="text-xs text-muted-foreground ml-2">· {t.timeframe}</span>
              </div>
              <div>
                <span className={`text-sm font-bold ${color}`}>+{t.score_gain} pts</span>
                <span className="text-xs text-muted-foreground ml-1">→ {target}/100</span>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-background/60 overflow-hidden mb-1.5">
              <div className={`h-full rounded-full ${bar}`} style={{ width:`${target}%`, transition:'width 1s ease' }} />
            </div>
            <p className="text-xs text-muted-foreground">{t.actions}</p>
            <div className={`mt-1 text-xs font-mono ${color}`}>Confidence: {t.confidence}</div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── Why Modal ─── */
const WhyModal = ({ explanation, metricKey, title, score, color, onClose }: any) => {
  const cfg = getScoreConfig(Math.min(score, 100));
  const data = (explanation?.score_reason) ? explanation : buildFallback(metricKey, score);
  const safeScore = Math.min(score, 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.6)] overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent" />
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border sticky top-0 bg-card/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${2*Math.PI*22}`}
                  strokeDashoffset={`${2*Math.PI*22*(1-safeScore/100)}`}
                  style={{ transition:'stroke-dashoffset 1s ease' }} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{score}</span>
            </div>
            <div>
              <div className="font-bold text-sm">{title}</div>
              <div className={`text-xs font-mono ${cfg.text}`}>{cfg.emoji} {data.score_label || cfg.label}</div>
              {data.confidence && (
                <div className={`mt-1 text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${confidenceBadge(data.confidence)}`}>
                  <Shield className="h-2.5 w-2.5" />{data.confidence.charAt(0).toUpperCase()+data.confidence.slice(1)} data
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="rounded-xl border border-border bg-background/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-1.5 w-1.5 rounded-full" style={{ background:color }} />
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Where You Stand</span>
            </div>
            <p className="text-sm leading-relaxed">{data.score_reason}</p>
          </div>
          {data.what_it_means && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-mono uppercase tracking-wider text-primary">What This Means For You</span>
              </div>
              <p className="text-sm leading-relaxed font-medium">{data.what_it_means}</p>
            </div>
          )}
          {data.proof_points?.length > 0 && (
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Evidence</span>
              </div>
              {data.proof_points.map((p:string, i:number) => (
                <div key={i} className="flex items-start gap-2 mb-1.5">
                  <ChevronRight className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                  <span className="text-xs leading-relaxed">{p}</span>
                </div>
              ))}
            </div>
          )}
          {data.opportunity && (
            <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-green-400">Growth Opportunity</span>
              </div>
              <p className="text-sm leading-relaxed">{data.opportunity}</p>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Growth Projections — Pick Your Pace</span>
            </div>
            <GrowthProjections projections={data.growth_projections} currentScore={safeScore} />
          </div>
          {data.what_to_expect && (
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Overall Outlook</span>
              </div>
              <p className="text-sm leading-relaxed">{data.what_to_expect}</p>
            </div>
          )}
          <div className="rounded-xl bg-gradient-to-r from-primary/10 to-transparent border border-primary/15 p-4 flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav" className="h-8 w-8 rounded-full object-cover ring-1 ring-primary shrink-0" style={{ objectPosition:'center 20%' }} />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground font-semibold">Manav is actively working on this.</span> Every report reflects real actions. Your growth is on schedule.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Score Ring ─── */
const ScoreRing = ({ score, label, color, onClick }: any) => {
  const r = 28, circ = 2*Math.PI*r;
  const cfg = getScoreConfig(Math.min(score,100));
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 group cursor-pointer">
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={cfg.bar} strokeWidth="5"
            strokeLinecap="round" strokeDasharray={circ}
            strokeDashoffset={circ*(1-Math.min(score,100)/100)}
            style={{ transition:'stroke-dashoffset 1.2s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{score}</span>
        <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <HelpCircle className="h-2.5 w-2.5 text-primary" />
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
      <span className={`text-xs font-mono ${cfg.text}`}>{cfg.emoji} {cfg.label}</span>
    </button>
  );
};

/* ─── Delta Badge ─── */
const DeltaBadge = ({ current, baseline, label }: { current:number; baseline:number; label:string }) => {
  const diff = current - baseline;
  if (diff === 0) return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" />No change
    </div>
  );
  return (
    <div className={`flex items-center gap-1 text-xs font-semibold ${diff > 0 ? 'text-green-400' : 'text-orange-400'}`}>
      {diff > 0
        ? <ArrowUpRight className="h-3.5 w-3.5" />
        : <ArrowDownRight className="h-3.5 w-3.5" />}
      {diff > 0 ? '+':''}{diff} {label} since baseline
    </div>
  );
};

/* ─── Stat Card ─── */
const StatCard = ({ icon:Icon, label, value, color='text-primary', explanation, metricKey, title, score, ringColor, baselineValue }: any) => {
  const [show, setShow] = useState(false);
  const diff = (typeof baselineValue === 'number' && typeof score === 'number') ? score - baselineValue : null;
  return (
    <>
      <div onClick={() => setShow(true)}
        className="rounded-2xl border border-border bg-card/60 p-4 cursor-pointer group hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider leading-tight">{label}</span>
          <div className="flex items-center gap-1">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
        <div className="text-2xl font-bold mb-1">{value ?? '—'}</div>
        {diff !== null && (
          <div className={`text-xs flex items-center gap-1 ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>
            {diff > 0 ? <ArrowUpRight className="h-3 w-3" /> : diff < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {diff > 0 ? '+':''}{diff} since baseline
          </div>
        )}
        <div className="text-xs text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity font-mono">tap to understand why →</div>
      </div>
      {show && <WhyModal explanation={explanation} metricKey={metricKey} title={title||label} score={typeof score==='number'?score:0} color={ringColor||'#6366f1'} onClose={() => setShow(false)} />}
    </>
  );
};

/* ─── Main Dashboard ─── */
export default function Dashboard() {
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [allMetrics, setAllMetrics] = useState<any[]>([]);
  const [upsells, setUpsells] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingUpsell, setApprovingUpsell] = useState<string|null>(null);
  const [activeModal, setActiveModal] = useState<{key:string;title:string;color:string}|null>(null);
  const [baselineDate, setBaselineDate] = useState('');
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [chartFrom, setChartFrom] = useState('');
  const [chartTo, setChartTo] = useState('');

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (selectedProject) {
      loadProjectData(selectedProject.id);
      setBaselineDate(selectedProject.baseline_date || '');
    }
  }, [selectedProject]);

 const loadData = async () => {
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { navigate('/'); return; }

      const { data:prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      if (!prof?.approved) { navigate('/'); return; }

      // Get ALL client IDs this user has access to
      // Support both old single client_id and new client_ids array
      const clientIdList: string[] = [];
      if (prof.client_ids?.length) {
        clientIdList.push(...prof.client_ids);
      } else if (prof.client_id) {
        clientIdList.push(prof.client_id);
      }

      // Also search by matching email as fallback
      const { data: clientsByEmail } = await supabase
        .from('clients')
        .select('id, name, company, retainer_amount, industry, website, email')
        .eq('email', user.email);

      if (clientsByEmail?.length) {
        clientsByEmail.forEach(c => {
          if (!clientIdList.includes(c.id)) clientIdList.push(c.id);
        });
      }

      if (clientIdList.length === 0) {
        setClient(null);
        setLoading(false);
        return;
      }

      // Load all clients
      const { data: clientsData } = await supabase
        .from('clients')
        .select('*')
        .in('id', clientIdList);

      // Load all projects across all clients
      const { data: allProjects } = await supabase
        .from('projects')
        .select('*')
        .in('client_id', clientIdList);

      const projectList = allProjects || [];
      const clientList = clientsData || [];
      const [allClients, setAllClients] = useState<any[]>([]);

      // Store all clients for switcher
      setAllClients(clientList);
      setClient(clientList[0] || null);
      setProjects(projectList);

      if (projectList.length > 0) {
        setSelectedProject(projectList[0]);
      }
    } catch(e) {
      console.error('loadData error:', e);
    }
    setLoading(false);
  };

  const loadProjectData = async (id: string) => {
    try {
      const [m, u] = await Promise.all([
        supabase.from('metrics').select('*').eq('project_id', id).order('recorded_at'),
        supabase.from('upsells').select('*').eq('project_id', id).eq('status','pending'),
      ]);
      setAllMetrics(m.data || []);
      setUpsells(u.data || []);
    } catch(e) { console.error(e); }
  };

  const saveBaseline = async () => {
    if (!selectedProject || !baselineDate) return;
    setSavingBaseline(true);
    const { error } = await supabase.from('projects')
      .update({ baseline_date: baselineDate })
      .eq('id', selectedProject.id);
    if (!error) {
      setSelectedProject((p: any) => ({ ...p, baseline_date: baselineDate }));
      toast({ title:'Baseline set!', description:`Progress will now be tracked from ${fmtDate(baselineDate)}` });
    }
    setSavingBaseline(false);
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

  /* Latest = current state of the site RIGHT NOW */
  const latest = allMetrics[allMetrics.length - 1] || null;

  /* Baseline metric = closest report to the baseline date */
  const baselineMetric = useMemo(() => {
    if (!baselineDate || !allMetrics.length) return null;
    return closestMetric(allMetrics, baselineDate);
  }, [allMetrics, baselineDate]);

  /* Chart data — filtered by chartFrom/chartTo */
  const chartData = useMemo(() => {
    return allMetrics
      .filter(m => {
        const d = toDateStr(m.recorded_at);
        if (chartFrom && d < chartFrom) return false;
        if (chartTo && d > chartTo) return false;
        return true;
      })
      .map(m => ({
        date: fmtShort(m.recorded_at),
        fullDate: toDateStr(m.recorded_at),
        llm: m.llm_visibility_score || 0,
        health: m.algorithm_health_score || 0,
        authority: m.content_authority_score || 0,
        growth: m.overall_growth_score || 0,
      }));
  }, [allMetrics, chartFrom, chartTo]);

  const exp = latest?.explanations || {};
  const totalCitations = latest
    ? (latest.chatgpt_citations||0)+(latest.perplexity_citations||0)+(latest.google_ai_citations||0) : 0;
  const baselineCitations = baselineMetric
    ? (baselineMetric.chatgpt_citations||0)+(baselineMetric.perplexity_citations||0)+(baselineMetric.google_ai_citations||0) : null;
  const indexingPct = latest?.pages_submitted > 0
    ? Math.round((latest.pages_indexed/latest.pages_submitted)*100) : null;
  const competitiveProof = latest?.competitive_proof || [];
  const compProofFromExp = exp?.competitor_rank?.proof_points || [];

  /* Has progress data */
  const hasProgress = baselineMetric && latest && baselineMetric.id !== latest.id;

  const firstDate = allMetrics[0] ? toDateStr(allMetrics[0].recorded_at) : '';
  const lastDate  = latest ? toDateStr(latest.recorded_at) : '';

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground font-mono">Loading your growth portal...</p>
      </div>
    </div>
  );

  if (!client) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center rounded-2xl border border-border bg-card/60 p-10">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Clock className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">Dashboard Being Set Up</h2>
        <p className="text-muted-foreground text-sm mb-6">Manav is configuring your portal. You will be notified once your first report is ready.</p>
        <Button variant="outline" onClick={async()=>{await supabase.auth.signOut();navigate('/')}} className="border-border">
          <LogOut className="h-4 w-4 mr-2"/>Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">

      {activeModal && (
        <WhyModal
          explanation={exp[activeModal.key]}
          metricKey={activeModal.key}
          title={activeModal.title}
          score={latest ? Math.min(latest[activeModal.key]||0, 999) : 0}
          color={activeModal.color}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* NAV */}
      <div className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav" className="h-8 w-8 rounded-full object-cover ring-2 ring-primary" style={{objectPosition:'center 20%'}} />
            <div>
              <div className="font-bold text-sm">SEO Seasons</div>
              <div className="text-xs text-muted-foreground">{client.company} — Growth Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {projects.length > 0 && (
              <select
                value={selectedProject?.id||''}
                onChange={e => {
                  const proj = projects.find(x => x.id === e.target.value);
                  setSelectedProject(proj);
                  // Update displayed client when project changes
                  if (proj) {
                    const projClient = allClients.find(c => c.id === proj.client_id);
                    if (projClient) setClient(projClient);
                  }
                }}
                className="h-8 rounded-lg border border-border bg-background/60 text-xs px-3 max-w-[200px]"
              >
                {allClients.map(c => {
                  const clientProjects = projects.filter(p => p.client_id === c.id);
                  if (!clientProjects.length) return null;
                  return (
                    <optgroup key={c.id} label={c.company}>
                      {clientProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            )}
            <Button variant="outline" size="sm" onClick={async()=>{await supabase.auth.signOut();navigate('/')}} className="border-border text-xs">
              <LogOut className="h-3 w-3 mr-1.5"/>Sign Out
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
          <div className="flex items-center gap-2 text-xs border border-green-400/30 text-green-400 rounded-full px-3 py-1.5 bg-green-400/5">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse"/>Active Campaign
          </div>
        </div>

        {/* Tap hint */}
        {latest && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/15 rounded-xl px-4 py-2.5">
            <HelpCircle className="h-3.5 w-3.5 text-primary shrink-0"/>
            Tap any score or stat to see exactly why, what's verified, and your growth projections at 3 strategy speeds.
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            SECTION 1 — CURRENT STATUS (always latest data)
        ═══════════════════════════════════════════════ */}
        {latest && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <div className="flex items-center gap-2 text-xs font-mono text-foreground bg-card/60 border border-border rounded-full px-3 py-1.5">
                <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                Current Status — as of {fmtDate(latest.recorded_at)}
              </div>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Big Win */}
            {latest.milestone && (
              <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/5 p-5">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center shrink-0">
                    <Trophy className="h-5 w-5 text-yellow-400"/>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-1">Latest Big Win</div>
                    <div className="font-bold text-base mb-1">{latest.milestone}</div>
                    {latest.milestone_impact && <p className="text-sm text-muted-foreground">{latest.milestone_impact}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Score Rings */}
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-5">
                Health Scores Today — tap any score for full breakdown
              </div>
              <div className="flex flex-wrap justify-around gap-6">
                {[
                  { key:'llm_visibility_score',    label:'LLM Visibility',    color:'#6366f1', title:'LLM Visibility Score' },
                  { key:'algorithm_health_score',  label:'Google Health',     color:'#06b6d4', title:'Google Algorithm Health' },
                  { key:'eeat_score',              label:'E-E-A-T Authority', color:'#8b5cf6', title:'E-E-A-T Authority Score' },
                  { key:'content_authority_score', label:'Content Authority', color:'#f59e0b', title:'Content Authority Score' },
                  { key:'overall_growth_score',    label:'Overall Growth',    color:'#4ade80', title:'Overall Growth Score' },
                ].map(({ key, label, color, title }) => (
                  <ScoreRing key={key} score={Math.min(latest[key]||0,100)} label={label} color={color}
                    onClick={() => setActiveModal({ key, title, color })} />
                ))}
              </div>
            </div>

            {/* Current Stat Cards — NO delta, just today's numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Brain} label="Total AI Citations" color="text-primary"
                value={totalCitations}
                baselineValue={hasProgress ? baselineCitations : null}
                title="Total AI Citations" score={totalCitations} ringColor="#6366f1"
                metricKey="chatgpt_citations" explanation={exp.chatgpt_citations} />
              <StatCard icon={Eye} label="Pages Indexed" color="text-cyan-400"
                value={latest.pages_indexed}
                baselineValue={hasProgress ? baselineMetric?.pages_indexed : null}
                title="Google Index Status" score={latest.pages_indexed||0} ringColor="#06b6d4"
                metricKey="pages_indexed" explanation={exp.pages_indexed} />
              <StatCard icon={Trophy} label="Market Rank" color="text-yellow-400"
                value={latest.competitor_rank ? `#${latest.competitor_rank}` : '—'}
                baselineValue={null}
                title="Competitive Market Rank" score={latest.competitor_rank||0} ringColor="#f59e0b"
                metricKey="competitor_rank" explanation={exp.competitor_rank} />
              <StatCard icon={TrendingUp} label="Brand Mentions" color="text-green-400"
                value={latest.brand_mentions}
                baselineValue={hasProgress ? baselineMetric?.brand_mentions : null}
                title="Brand Mentions" score={latest.brand_mentions||0} ringColor="#4ade80"
                metricKey="brand_mentions" explanation={exp.brand_mentions} />
            </div>

            {/* LLM + Indexing */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="h-4 w-4 text-primary"/>
                  <span className="font-semibold text-sm">AI Engine Presence</span>
                  <span className="ml-auto text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">{totalCitations} citations</span>
                </div>
                <div className="space-y-3">
                  {[
                    { name:'ChatGPT',            value:latest.chatgpt_citations||0,    color:'#6366f1', key:'chatgpt_citations',   title:'ChatGPT Citations' },
                    { name:'Perplexity',         value:latest.perplexity_citations||0, color:'#8b5cf6', key:'perplexity_citations', title:'Perplexity Citations' },
                    { name:'Google AI Overview', value:latest.google_ai_citations||0,  color:'#06b6d4', key:'google_ai_citations',  title:'Google AI Overview Citations' },
                  ].map(item => (
                    <button key={item.name} onClick={() => setActiveModal({ key:item.key, title:item.title, color:item.color })}
                      className="w-full group text-left">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold">{item.value}</span>
                          <HelpCircle className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors"/>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-1000"
                          style={{ width:`${totalCitations>0?Math.min(100,(item.value/totalCitations)*100):0}%`, background:item.color }}/>
                      </div>
                    </button>
                  ))}
                </div>
                {latest.llm_platforms?.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {latest.llm_platforms.map((p:string) => (
                      <span key={p} className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">{p}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Eye className="h-4 w-4 text-cyan-400"/>
                  <span className="font-semibold text-sm">Google Index Status</span>
                  <button onClick={() => setActiveModal({ key:'pages_indexed', title:'Google Index Status', color:'#06b6d4' })}
                    className="ml-auto text-xs text-primary font-mono flex items-center gap-1 hover:underline">
                    <HelpCircle className="h-3 w-3"/>why?
                  </button>
                </div>
                {latest.pages_submitted > 0 ? (
                  <>
                    <div className="flex items-end gap-2 mb-2">
                      <span className="text-3xl font-bold">{latest.pages_indexed}</span>
                      <span className="text-muted-foreground text-sm mb-1">of {latest.pages_submitted} pages indexed</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-secondary overflow-hidden mb-2">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-1000"
                        style={{ width:`${indexingPct}%` }}/>
                    </div>
                    <div className="text-xs text-muted-foreground">{indexingPct}% of content visible to Google</div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Indexing data appears in your next report.</p>
                )}
              </div>
            </div>

            {/* Competitive */}
            {(latest.competitor_rank>0 || latest.competitors_beaten>0 || latest.competitor_gap_note || competitiveProof.length>0) && (
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Swords className="h-4 w-4 text-yellow-400"/>
                  <span className="font-semibold text-sm">Competitive Position</span>
                  <button onClick={() => setActiveModal({ key:'competitor_rank', title:'Competitive Market Rank', color:'#f59e0b' })}
                    className="ml-auto text-xs text-primary font-mono flex items-center gap-1 hover:underline">
                    <HelpCircle className="h-3 w-3"/>full analysis
                  </button>
                </div>
                <div className="grid sm:grid-cols-3 gap-4 mb-4">
                  {latest.competitor_rank > 0 && (
                    <div className="rounded-xl border border-border bg-background/40 p-4 text-center">
                      <div className="text-3xl font-bold text-primary">#{latest.competitor_rank}</div>
                      <div className="text-xs text-muted-foreground mt-1">Current Market Rank</div>
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
                      <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-1">Intel</div>
                      <p className="text-sm">{latest.competitor_gap_note}</p>
                    </div>
                  )}
                </div>
                {competitiveProof.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Verified Evidence</div>
                    {competitiveProof.map((item:any, i:number) => (
                      <div key={i} className="rounded-xl border border-border bg-background/40 p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold">{item.claim}</span>
                          <span className="text-xs font-mono text-muted-foreground shrink-0 bg-secondary/50 px-1.5 py-0.5 rounded">{item.source}</span>
                        </div>
                        {item.evidence && <p className="text-xs text-muted-foreground mb-1 italic">"{item.evidence}"</p>}
                        {item.impact && <div className="text-xs text-primary flex items-center gap-1"><ChevronRight className="h-3 w-3 shrink-0"/>{item.impact}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {compProofFromExp.length > 0 && competitiveProof.length === 0 && (
                  <div className="space-y-1.5 mt-2">
                    {compProofFromExp.map((p:string,i:number) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <ChevronRight className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5"/>{p}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            SECTION 2 — PROGRESS TRACKING
        ═══════════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <div className="flex items-center gap-2 text-xs font-mono text-foreground bg-card/60 border border-border rounded-full px-3 py-1.5">
              <Flag className="h-3.5 w-3.5 text-primary" />
              Progress Tracking
            </div>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Baseline setter */}
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Flag className="h-4 w-4 text-primary"/>
              <span className="font-semibold text-sm">Set Your Baseline Date</span>
              {baselineDate && (
                <span className="ml-auto text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-mono">
                  Baseline: {fmtDate(baselineDate)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Choose the date you want to start measuring progress from. All stats below will show how much has changed since that day.
              {allMetrics.length > 0 && ` Data available from ${fmtDate(firstDate)} to ${fmtDate(lastDate)}.`}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={baselineDate}
                min={firstDate}
                max={lastDate}
                onChange={e => setBaselineDate(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background/60 text-sm px-3 text-foreground"
              />
              <Button size="sm" onClick={saveBaseline} disabled={savingBaseline || !baselineDate}
                className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground h-9">
                {savingBaseline ? <div className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin mr-2"/> : <Check className="h-3.5 w-3.5 mr-1.5"/>}
                Set as Baseline
              </Button>
            </div>
            {allMetrics.length === 0 && (
              <p className="text-xs text-muted-foreground mt-3 italic">No reports available yet — baseline can be set once Manav runs your first analysis.</p>
            )}
            {allMetrics.length === 1 && (
              <p className="text-xs text-muted-foreground mt-3 italic">Only 1 report available. Progress comparison will appear once a second report is added.</p>
            )}
          </div>

          {/* Progress comparison — only show when meaningful */}
          {hasProgress ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-primary uppercase tracking-wider mb-1">Progress Since Baseline</div>
                  <div className="text-sm text-muted-foreground">
                    {fmtDate(baselineMetric.recorded_at)} → {fmtDate(latest.recorded_at)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-mono bg-background/60 border border-border rounded-lg px-3 py-1.5">
                  {Math.round((new Date(lastDate).getTime() - new Date(toDateStr(baselineMetric.recorded_at)).getTime()) / (1000*60*60*24))} days tracked
                </div>
              </div>

              {/* Score progress grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { key:'llm_visibility_score',    label:'LLM Visibility', color:'text-primary' },
                  { key:'algorithm_health_score',  label:'Google Health',  color:'text-cyan-400' },
                  { key:'eeat_score',              label:'E-E-A-T',        color:'text-purple-400' },
                  { key:'content_authority_score', label:'Authority',      color:'text-yellow-400' },
                  { key:'overall_growth_score',    label:'Overall Growth', color:'text-green-400' },
                ].map(({ key, label, color }) => {
                  const start = baselineMetric[key] || 0;
                  const end   = latest[key] || 0;
                  const diff  = end - start;
                  return (
                    <div key={key} className="rounded-xl border border-border bg-background/60 p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-2 leading-tight">{label}</div>
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <span className="text-xs text-muted-foreground">{start}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className={`text-base font-bold ${color}`}>{end}</span>
                      </div>
                      <div className={`text-xs font-mono font-bold ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>
                        {diff > 0 ? '+':''}{diff} pts
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Key metric deltas */}
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground mb-1">AI Citations</div>
                  <div className="text-xl font-bold">{totalCitations}</div>
                  {baselineCitations !== null && (
                    <DeltaBadge current={totalCitations} baseline={baselineCitations} label="citations" />
                  )}
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground mb-1">Pages Indexed</div>
                  <div className="text-xl font-bold">{latest.pages_indexed || '—'}</div>
                  {baselineMetric.pages_indexed != null && latest.pages_indexed != null && (
                    <DeltaBadge current={latest.pages_indexed} baseline={baselineMetric.pages_indexed} label="pages" />
                  )}
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground mb-1">Brand Mentions</div>
                  <div className="text-xl font-bold">{latest.brand_mentions || '—'}</div>
                  {baselineMetric.brand_mentions != null && latest.brand_mentions != null && (
                    <DeltaBadge current={latest.brand_mentions} baseline={baselineMetric.brand_mentions} label="mentions" />
                  )}
                </div>
              </div>
            </div>
          ) : baselineDate && allMetrics.length >= 2 ? (
            <div className="rounded-2xl border border-border bg-card/60 p-6 text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2"/>
              <p className="text-sm text-muted-foreground">The selected baseline date matches your only available report. Progress comparison needs at least 2 reports at different dates.</p>
            </div>
          ) : null}
        </div>

        {/* ═══════════════════════════════════════════════
            SECTION 3 — GROWTH CHART with date filter
        ═══════════════════════════════════════════════ */}
        {allMetrics.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <div className="flex items-center gap-2 text-xs font-mono text-foreground bg-card/60 border border-border rounded-full px-3 py-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                Growth Chart
              </div>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-5">
              {/* Chart date filter */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="text-sm font-semibold">Growth Trajectory</span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {allMetrics.length >= 2 && [
                    { label:'All', from:'', to:'' },
                    { label:'Last 30d', from: (() => { const d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().split('T')[0]; })(), to:'' },
                    { label:'Last 60d', from: (() => { const d=new Date(); d.setDate(d.getDate()-60); return d.toISOString().split('T')[0]; })(), to:'' },
                    { label:'Last 90d', from: (() => { const d=new Date(); d.setDate(d.getDate()-90); return d.toISOString().split('T')[0]; })(), to:'' },
                  ].map(({ label, from, to }) => (
                    <button key={label}
                      onClick={() => { setChartFrom(from); setChartTo(to); }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        chartFrom===from && chartTo===to
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/50'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {chartData.length < 2 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30"/>
                  Chart will appear once you have 2 or more reports.
                  {allMetrics.length === 1 && ` First report recorded on ${fmtDate(allMetrics[0].recorded_at)}.`}
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                      <XAxis dataKey="date" tick={{ fontSize:11, fill:'hsl(var(--muted-foreground))' }}/>
                      <YAxis domain={[0,100]} tick={{ fontSize:11, fill:'hsl(var(--muted-foreground))' }}/>
                      <Tooltip contentStyle={{ background:'hsl(var(--card))', border:'1px solid hsl(var(--border))', borderRadius:'12px', fontSize:'12px' }}/>
                      {/* Baseline reference line */}
                      {baselineDate && chartData.some(d => d.fullDate === baselineDate) && (
                        <ReferenceLine x={fmtShort(baselineDate)} stroke="#6366f1" strokeDasharray="4 4"
                          label={{ value:'Baseline', position:'top', fontSize:10, fill:'#6366f1' }} />
                      )}
                      <Line type="monotone" dataKey="llm"       name="LLM Visibility" stroke="#6366f1" strokeWidth={2} dot={{ r:4, fill:'#6366f1' }}/>
                      <Line type="monotone" dataKey="health"    name="Google Health"  stroke="#06b6d4" strokeWidth={2} dot={{ r:4, fill:'#06b6d4' }}/>
                      <Line type="monotone" dataKey="authority" name="Authority"       stroke="#f59e0b" strokeWidth={2} dot={{ r:4, fill:'#f59e0b' }}/>
                      <Line type="monotone" dataKey="growth"    name="Overall Growth" stroke="#4ade80" strokeWidth={2} dot={{ r:4, fill:'#4ade80' }}/>
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 mt-3 justify-center">
                    {[['#6366f1','LLM Visibility'],['#06b6d4','Google Health'],['#f59e0b','Authority'],['#4ade80','Overall Growth']].map(([color,label]) => (
                      <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="h-2 w-2 rounded-full" style={{ background:color }}/>{label}
                      </div>
                    ))}
                    {baselineDate && <div className="flex items-center gap-1.5 text-xs text-primary"><div className="h-2 w-8 border-t-2 border-dashed border-primary"/>Baseline</div>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Upsells */}
        {upsells.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400"/>
              <span className="font-semibold text-sm">Growth Opportunities Manav Identified</span>
            </div>
            {upsells.map(upsell => (
              <div key={upsell.id} className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse"/>
                      <span className="font-bold text-sm">{upsell.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{upsell.description}</p>
                    {upsell.potential_impact && (
                      <div className="inline-flex items-center gap-1.5 text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2.5 py-1 mb-3">
                        <TrendingUp className="h-3 w-3"/>{upsell.potential_impact}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">${upsell.price}</span>
                      <span className="text-xs text-muted-foreground">added to next invoice · no contracts</span>
                    </div>
                  </div>
                  <Button onClick={() => approveUpsell(upsell.id)} disabled={approvingUpsell===upsell.id}
                    className="shrink-0 bg-gradient-to-r from-yellow-500 to-yellow-400 text-black font-bold hover:opacity-90">
                    {approvingUpsell===upsell.id
                      ? <div className="h-4 w-4 rounded-full border-2 border-black border-t-transparent animate-spin"/>
                      : <><Check className="h-4 w-4 mr-2"/>Approve Sprint</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {allMetrics.length === 0 && (
          <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
            <Sparkles className="h-10 w-10 text-primary/40 mx-auto mb-4"/>
            <h3 className="font-bold text-lg mb-2">Your Growth Dashboard is Being Prepared</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">Manav is running your first website analysis. Your dashboard will populate automatically.</p>
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground py-4 border-t border-border">
          <div className="flex items-center justify-center gap-4 mb-2 flex-wrap">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-primary"/>All data is private</span>
            <span className="flex items-center gap-1.5"><Star className="h-3 w-3 text-primary"/>Fiverr Top Rated</span>
            <span className="flex items-center gap-1.5"><Globe className="h-3 w-3 text-primary"/>SEO Seasons by Manav</span>
          </div>
          © 2026 SEO Seasons — Client Growth Portal
        </div>
      </div>
    </div>
  );
}
