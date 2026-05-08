import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import PortalNav from '@/components/PortalNav';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Sparkles, FileText, Download, Copy, Plus, RefreshCw,
  ChevronDown, ChevronUp, Zap, Brain, Globe, Shield,
  Trophy, TrendingUp, Calendar, Layers, X, Tag,
  CheckCircle2, Maximize2, Star, Send, MessageSquare,
  Clock, AlertTriangle, ChevronRight, RotateCcw, GripVertical,
  ArrowRight, Info, BarChart3
} from 'lucide-react';

/* ──────────────── types ──────────────── */
type BType    = 'quick-win'|'weekly'|'monthly'|'technical'|'content'|'geo'|'competitive'|'insight'|'kpi'|'custom';
type Priority = 'high'|'medium'|'low';
type Status   = 'todo'|'doing'|'done';
type Tab      = 'reports'|'strategy'|'canvas';
type SugLevel = 'best'|'good'|'ok'|'caution';

interface Block {
  id:       string;
  type:     BType;
  title:    string;
  content:  string;
  color:    string;
  priority: Priority;
  status:   Status;
  week:     number;   // 1-4 = weeks, 5 = backlog
  placed:   boolean;  // false = in library, true = in a column
  effort?:  string;
  impact?:  string;
  tags?:    string[];
  source?:  string;
}

interface Suggestion { level: SugLevel; headline: string; reason: string; impact: string; best: string; }

/* ──────────────── constants ──────────────── */
const TM: Record<BType,{label:string;icon:any;color:string;bg:string;border:string}> = {
  'quick-win':   {label:'Quick Win',   icon:Zap,        color:'#4ade80',bg:'bg-green-400/10', border:'border-green-400/25'},
  'weekly':      {label:'Weekly',      icon:Calendar,   color:'#60a5fa',bg:'bg-blue-400/10',  border:'border-blue-400/25' },
  'monthly':     {label:'Monthly',     icon:Layers,     color:'#a78bfa',bg:'bg-purple-400/10',border:'border-purple-400/25'},
  'technical':   {label:'Technical',   icon:Shield,     color:'#06b6d4',bg:'bg-cyan-400/10',  border:'border-cyan-400/25' },
  'content':     {label:'Content',     icon:FileText,   color:'#facc15',bg:'bg-yellow-400/10',border:'border-yellow-400/25'},
  'geo':         {label:'GEO',         icon:Globe,      color:'#6366f1',bg:'bg-indigo-400/10',border:'border-indigo-400/25'},
  'competitive': {label:'Competitive', icon:Trophy,     color:'#fb923c',bg:'bg-orange-400/10',border:'border-orange-400/25'},
  'insight':     {label:'Insight',     icon:Brain,      color:'#f472b6',bg:'bg-pink-400/10',  border:'border-pink-400/25' },
  'kpi':         {label:'KPI',         icon:TrendingUp, color:'#34d399',bg:'bg-emerald-400/10',border:'border-emerald-400/25'},
  'custom':      {label:'Custom',      icon:Star,       color:'#94a3b8',bg:'bg-slate-400/10', border:'border-slate-400/25' },
};
const PM: Record<Priority,{dot:string;badge:string}> = {
  high:   {dot:'bg-red-400',   badge:'text-red-400 bg-red-400/10 border-red-400/20'   },
  medium: {dot:'bg-yellow-400',badge:'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'},
  low:    {dot:'bg-green-400', badge:'text-green-400 bg-green-400/10 border-green-400/20'},
};
const SC: Record<Status,Status>        = {todo:'doing',doing:'done',done:'todo'};
const SM: Record<Status,{label:string;color:string;icon:any}> = {
  todo:  {label:'To Do',      color:'text-muted-foreground',icon:Clock       },
  doing: {label:'In Progress',color:'text-blue-400',        icon:RefreshCw   },
  done:  {label:'Done',       color:'text-green-400',       icon:CheckCircle2},
};
const SL_STYLE: Record<SugLevel,{ring:string;badge:string;icon:any;label:string}> = {
  best:    {ring:'ring-2 ring-green-400/60 shadow-[0_0_20px_rgba(74,222,128,0.25)]', badge:'bg-green-400/15 text-green-400 border-green-400/30',  icon:CheckCircle2, label:'Best here'},
  good:    {ring:'ring-2 ring-blue-400/50  shadow-[0_0_16px_rgba(96,165,250,0.2)]',  badge:'bg-blue-400/15  text-blue-400  border-blue-400/30',   icon:Info,         label:'Good fit' },
  ok:      {ring:'ring-1 ring-yellow-400/40',                                          badge:'bg-yellow-400/15 text-yellow-400 border-yellow-400/30',icon:AlertTriangle,label:'Acceptable'},
  caution: {ring:'ring-2 ring-red-400/50   shadow-[0_0_16px_rgba(248,113,113,0.2)]',  badge:'bg-red-400/15   text-red-400   border-red-400/30',    icon:AlertTriangle,label:'Caution'  },
};

const COLUMNS = [
  {week:1,label:'Week 1',sub:'Foundation'},
  {week:2,label:'Week 2',sub:'Build'},
  {week:3,label:'Week 3',sub:'Accelerate'},
  {week:4,label:'Week 4',sub:'Compound'},
  {week:5,label:'Backlog',sub:'Long-term'},
];

/* ──────────────── expert suggestion engine ──────────────── */
type RuleMap = Partial<Record<number, Omit<Suggestion,'best'> & {bestWeeks: number[]}>>

const EXPERT: Record<BType, RuleMap & {defaultBest: number[]}> = {
  'quick-win': {
    defaultBest:[1],
    1:{level:'best',   headline:'Perfect — do this first',         reason:'Quick wins in Week 1 build early momentum and validate the approach before longer commitments.',impact:'Early ranking signals or crawl improvements within 48-72 hours. Client confidence goes up.',bestWeeks:[1]},
    2:{level:'good',   headline:'Still early enough',              reason:'Not ideal, but Week 2 preserves most of the momentum value.',                                      impact:'Slight delay in early signals — still worthwhile.',bestWeeks:[1]},
    3:{level:'ok',     headline:'Getting late for a quick win',    reason:'Three weeks in, a "quick" win risks becoming a forgotten task.',                                   impact:'Reduced urgency and potential lost compounding time.',bestWeeks:[1,2]},
    4:{level:'caution',headline:'Too late — move earlier',         reason:'Quick wins that take 4 weeks to get scheduled are not quick wins — they become technical debt.',    impact:'Missed momentum and compounding ranking opportunity.',bestWeeks:[1,2]},
    5:{level:'caution',headline:'Quick wins must not be backlogged',reason:'This is exactly the type of task that disappears in the backlog indefinitely.',                   impact:'Very high risk of never being done.',bestWeeks:[1]},
  },
  'technical': {
    defaultBest:[1,2],
    1:{level:'best',   headline:'Technical must come first',       reason:'Google cannot rank what it cannot crawl. Technical fixes unlock all subsequent SEO work.',         impact:'All content and GEO work from Week 2 onwards becomes immediately more effective.',bestWeeks:[1]},
    2:{level:'good',   headline:'Acceptable if Week 1 is full',    reason:'Week 2 is still early enough if Week 1 is already at capacity.',                                    impact:'Content done in Week 1 may slightly underperform — not a critical loss.',bestWeeks:[1]},
    3:{level:'ok',     headline:'Risky — you\'re losing time',     reason:'3 weeks without the technical fix means content and link work is less effective.',                  impact:'Lower ROI on everything done in Weeks 1-2 — those pages aren\'t fully crawlable.',bestWeeks:[1,2]},
    4:{level:'caution',headline:'4 weeks of technical debt',       reason:'Every week of delay means more content being indexed suboptimally.',                               impact:'Significant ROI loss on prior work. Fix immediately.',bestWeeks:[1]},
    5:{level:'caution',headline:'Critical — do not defer',         reason:'Building a site\'s authority on broken technical infrastructure is the #1 SEO mistake.',           impact:'All other work is underperforming right now. This is urgent.',bestWeeks:[1]},
  },
  'content': {
    defaultBest:[2,3],
    1:{level:'ok',     headline:'Possible, but premature',         reason:'Content before technical fixes risks Google indexing it on slow, misconfigured pages.',            impact:'Content may rank below its actual potential long-term.',bestWeeks:[2,3]},
    2:{level:'best',   headline:'Optimal — after technical fixes', reason:'With Week 1 technical foundation in place, content gets indexed on clean, fast pages from day one.',impact:'Maximum ranking velocity — every piece hits with full technical support.',bestWeeks:[2,3]},
    3:{level:'best',   headline:'Excellent — data-informed',       reason:'By Week 3 you have early signals from Week 1-2 to focus content on what\'s already ranking.',     impact:'Higher quality content decisions, less guesswork.',bestWeeks:[2,3]},
    4:{level:'good',   headline:'Late but still compounds',        reason:'Week 4 content still benefits from the foundation, but has less time to rank within the plan.',    impact:'Good, but ROI window is shorter.',bestWeeks:[2,3]},
    5:{level:'caution',headline:'Content in backlog = no content', reason:'Content is the primary long-term ranking driver — indefinitely deferring it caps your growth ceiling.',impact:'Major organic traffic opportunity cost.',bestWeeks:[2,3]},
  },
  'geo': {
    defaultBest:[2,3],
    1:{level:'ok',     headline:'Premature without content',       reason:'GEO optimisation needs content for AI engines to cite. Without that, there\'s nothing to optimise.',impact:'Very low impact until content exists.',bestWeeks:[2,3]},
    2:{level:'best',   headline:'Right time for GEO',              reason:'Alongside new content in Week 2, GEO signals compound immediately as pages go live.',              impact:'AI citation potential builds in real-time with content publication.',bestWeeks:[2,3]},
    3:{level:'best',   headline:'Data-driven GEO timing',          reason:'Week 3 lets you see what AI engines are and aren\'t citing from Weeks 1-2 — then target precisely.',impact:'More targeted actions, less wasted effort.',bestWeeks:[2,3]},
    4:{level:'good',   headline:'Still valuable',                  reason:'Late GEO work still helps, especially for Perplexity citations which can improve quickly.',         impact:'Good compounding period remaining.',bestWeeks:[2,3]},
    5:{level:'caution',headline:'GEO can\'t wait forever',         reason:'AI search is growing fast — every month absent means competitors get cited instead.',              impact:'Missed AI traffic compounding opportunity.',bestWeeks:[2,3]},
  },
  'competitive': {
    defaultBest:[3,4],
    1:{level:'ok',     headline:'Good for research, not execution',reason:'Competitive analysis is useful in Week 1 for planning — but execution moves need a foundation first.',impact:'Use findings to inform Week 1-2 strategy. Hold execution.',bestWeeks:[3,4]},
    2:{level:'good',   headline:'Slightly early for moves',        reason:'Week 2 is viable if you\'re confident in your technical foundation.',                               impact:'Competitive moves land but without full authority backing.',bestWeeks:[3,4]},
    3:{level:'best',   headline:'Optimal competitive window',      reason:'3 weeks of foundation behind you makes competitive moves stick. You\'re now competing on equal footing.',impact:'Durable competitive gains with technical and content backing.',bestWeeks:[3,4]},
    4:{level:'best',   headline:'Strong — timing compounds',       reason:'Week 4 moves benefit from everything built in Weeks 1-3.',                                          impact:'Competitors see your moves when you have maximum authority.',bestWeeks:[3,4]},
    5:{level:'caution',headline:'Don\'t defer competitive strategy',reason:'Competitors are not waiting. Backlogging competitive work means they widen the gap every week.',   impact:'Increasing difficulty and cost to close competitive gaps.',bestWeeks:[3,4]},
  },
  'insight': {
    defaultBest:[1,5],
    1:{level:'best',   headline:'Insights inform everything',       reason:'Strategic insights at the start shape every task that follows — maximum leverage.',               impact:'Every Week 1-4 task is better informed.',bestWeeks:[1,5]},
    2:{level:'good',   headline:'Still early enough to apply',      reason:'Insights in Week 2 can still reshape the remaining 3 weeks.',                                     impact:'Good impact on Weeks 3-4.',bestWeeks:[1,5]},
    3:{level:'ok',     headline:'Limited leverage at this point',   reason:'Week 3 insights can only redirect Week 4 work.',                                                   impact:'Low leverage — most work already underway.',bestWeeks:[1,5]},
    5:{level:'best',   headline:'Backlog suits long-term insights',  reason:'Insights that aren\'t immediately actionable belong in the backlog as reference.',               impact:'Keeps the active weeks focused on execution.',bestWeeks:[1,5]},
  },
  'kpi': {
    defaultBest:[5],
    1:{level:'ok',     headline:'Useful as a benchmark',            reason:'Setting KPI baselines in Week 1 is genuinely useful for tracking progress.',                      impact:'Good for measurement, not execution.',bestWeeks:[5]},
    5:{level:'best',   headline:'Right place for KPI tracking',     reason:'KPIs are ongoing monitoring — they belong in the backlog as persistent reference.',               impact:'Keeps active weeks focused on moving the metrics, not tracking them.',bestWeeks:[5]},
  },
  'weekly': {
    defaultBest:[1,2],
    1:{level:'best',   headline:'Weekly action — start now',        reason:'If it\'s a weekly action item, its week number tells you everything. Week 1 items go in Week 1.',  impact:'On-time delivery of planned work.',bestWeeks:[1,2]},
    2:{level:'best',   headline:'Week 2 plan — right column',       reason:'Weekly plans are sequenced — Week 2 items should be in Week 2.',                                   impact:'Maintains the sequencing strategy.',bestWeeks:[1,2]},
    5:{level:'caution',headline:'Don\'t defer weekly tasks',        reason:'Weekly action items in the backlog lose their time-bound context and often never get done.',       impact:'Strategic plan loses sequencing integrity.',bestWeeks:[1,2,3,4]},
  },
  'monthly': {
    defaultBest:[5,4],
    1:{level:'ok',     headline:'Too early for monthly strategy',   reason:'Monthly goals are 30-day horizons — they\'re not Week 1 actions.',                                impact:'Creates confusion between strategic goals and tactical tasks.',bestWeeks:[5]},
    4:{level:'good',   headline:'Approaching monthly horizon',      reason:'Week 4 is a reasonable place to review monthly deliverables.',                                     impact:'Good for end-of-month review and planning.',bestWeeks:[5]},
    5:{level:'best',   headline:'Backlog is right for monthly',     reason:'Monthly strategic goals belong in the backlog as long-horizon planning items.',                   impact:'Keeps weekly columns focused on executable tasks.',bestWeeks:[5]},
  },
  'custom': {
    defaultBest:[1,2,3,4,5],
    1:{level:'good',   headline:'Your call',                        reason:'Custom blocks can go anywhere — place it where it fits your plan.',                                impact:'Depends entirely on what this block represents.',bestWeeks:[1,2,3,4,5]},
    2:{level:'good',   headline:'Your call',                        reason:'Custom blocks can go anywhere.',impact:'Depends on context.',bestWeeks:[1,2,3,4,5]},
    3:{level:'good',   headline:'Your call',                        reason:'Custom blocks can go anywhere.',impact:'Depends on context.',bestWeeks:[1,2,3,4,5]},
    4:{level:'good',   headline:'Your call',                        reason:'Custom blocks can go anywhere.',impact:'Depends on context.',bestWeeks:[1,2,3,4,5]},
    5:{level:'good',   headline:'Your call',                        reason:'Custom blocks belong in the backlog if they\'re not immediately actionable.',impact:'Good for long-term tracking.',bestWeeks:[1,2,3,4,5]},
  },
};

function getSuggestion(block: Block, targetWeek: number, allBlocks: Block[]): Suggestion {
  const rules    = EXPERT[block.type] || EXPERT.custom;
  const rule     = (rules as any)[targetWeek] as (Omit<Suggestion,'best'> & {bestWeeks:number[]}) | undefined;
  const bestWeeks: number[] = rule?.bestWeeks || (rules as any).defaultBest || [1];
  const bestLabel = bestWeeks.map(w => w === 5 ? 'Backlog' : `Week ${w}`).join(' or ');

  // Context: how full is the target column?
  const colBlocks   = allBlocks.filter(b => b.placed && b.week === targetWeek);
  const highPri     = colBlocks.filter(b => b.priority === 'high').length;
  const isFull      = colBlocks.length >= 5;
  const bandwidthNote = isFull
    ? ` Note: ${targetWeek === 5 ? 'Backlog' : `Week ${targetWeek}`} already has ${colBlocks.length} items — ensure you have bandwidth.`
    : highPri >= 3
    ? ` Note: ${targetWeek === 5 ? 'Backlog' : `Week ${targetWeek}`} already has ${highPri} high-priority items — workload may be heavy.`
    : '';

  // Technical dependency check: if placing content/GEO but no technical in Week 1
  const technicalInW1 = allBlocks.some(b => b.placed && b.week === 1 && b.type === 'technical');
  let depNote = '';
  if ((block.type === 'content' || block.type === 'geo') && targetWeek <= 2 && !technicalInW1) {
    depNote = ' ⚠ No technical tasks in Week 1 — consider adding them first for best results.';
  }

  if (!rule) {
    return {
      level:    'good',
      headline: 'Reasonable placement',
      reason:   `No specific guidance for this type in this column.${bandwidthNote}${depNote}`,
      impact:   'Depends on surrounding tasks.',
      best:     bestLabel,
    };
  }

  return {
    level:    rule.level,
    headline: rule.headline,
    reason:   rule.reason + bandwidthNote + depNote,
    impact:   rule.impact,
    best:     bestLabel,
  };
}

/* Custom block AI placement suggestion */
function suggestWeekForCustom(title: string, content: string, allBlocks: Block[]): {week: number; reason: string} {
  const lower = (title + ' ' + content).toLowerCase();
  // Keyword-based heuristic
  if (/fix|bug|error|broken|crawl|index|speed|schema|sitemap|canonical|redirect/i.test(lower))
    return {week:1, reason:'Technical/fix tasks should be tackled first'};
  if (/write|blog|post|article|copy|page|landing|content|faq|pillar/i.test(lower))
    return {week:2, reason:'Content creation works best after technical foundation'};
  if (/ai|perplexity|chatgpt|gpt|llm|geo|citation|generative/i.test(lower))
    return {week:2, reason:'GEO tasks pair well with content in Week 2'};
  if (/competitor|gap|outrank|rival|versus/i.test(lower))
    return {week:3, reason:'Competitive moves are most effective after your foundation is solid'};
  if (/report|track|measure|kpi|metric|analytics/i.test(lower))
    return {week:5, reason:'Tracking and reporting belongs in the ongoing backlog'};
  // Check column density — suggest least dense week
  const counts = [1,2,3,4,5].map(w => ({w, n: allBlocks.filter(b => b.placed && b.week === w).length}));
  const least  = counts.sort((a,b) => a.n - b.n)[0];
  return {week: least.w, reason: `${least.w === 5 ? 'Backlog' : `Week ${least.w}`} has the most space (${least.n} items) — balanced workload`};
}

/* ──────────────── helpers ──────────────── */
const uid     = () => Math.random().toString(36).slice(2, 9);
const safeStr = (v: any) => typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);
const fmtDate = (r: string) => r ? new Date(r).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '';

function assignWeek(b: any): number {
  if (b.type==='quick-win')   return 1;
  if (b.type==='technical')   return (b.urgency==='immediate'||b.urgency==='this_week') ? 1 : 2;
  if (b.type==='content')     return Math.min(b.week||2,4);
  if (b.type==='geo')         return 2;
  if (b.type==='competitive') return 3;
  if (b.type==='kpi')         return 5;
  if (b.type==='monthly')     return 5;
  return 5;
}

function seedBlocks(raw: any[]): Block[] {
  return raw.map(b => ({
    id:      b.id   || uid(),
    type:    (b.type || 'custom') as BType,
    title:   b.title   || 'Untitled',
    content: safeStr(b.content),
    color:   b.color   || '#94a3b8',
    priority:(b.priority || 'medium') as Priority,
    status:  'todo' as Status,
    week:    assignWeek(b),
    placed:  false,  // all start in library
    effort:  b.effort, impact: b.impact,
    tags:    b.tags || [], source: b.source || '',
  }));
}

/* ══════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════ */
export default function Playground() {
  const { clients, projects } = useAuth();
  const [selProjId,   setSelProjId]   = useState('');
  const [tab,         setTab]         = useState<Tab>('reports');
  const [reports,     setReports]     = useState<any[]>([]);
  const [strategy,    setStrategy]    = useState<any>(null);
  const [generating,  setGenerating]  = useState(false);
  const [genAt,       setGenAt]       = useState('');
  const [expandedRep, setExpandedRep] = useState<string|null>(null);

  /* canvas */
  const [blocks,        setBlocks]        = useState<Block[]>([]);
  const [draggingId,    setDraggingId]    = useState<string|null>(null);
  const [dragOverWeek,  setDragOverWeek]  = useState<number|null>(null);
  const [expandedBlock, setExpandedBlock] = useState<Block|null>(null);
  const [ddBlock,       setDdBlock]       = useState<Block|null>(null);
  const [ddText,        setDdText]        = useState('');
  const [ddLoading,     setDdLoading]     = useState(false);
  const [filterType,    setFilterType]    = useState<BType|'all'>('all');
  const [showAdd,       setShowAdd]       = useState(false);
  const [custTitle,     setCustTitle]     = useState('');
  const [custContent,   setCustContent]   = useState('');
  const [custSuggest,   setCustSuggest]   = useState<{week:number;reason:string}|null>(null);
  const [chatQ,         setChatQ]         = useState('');
  const [chatResp,      setChatResp]      = useState('');
  const [chatLoading,   setChatLoading]   = useState(false);
  const chatEndRef    = useRef<HTMLDivElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const selProj    = projects.find(p => p.id === selProjId);
  const client     = clients.find(c => c.id === selProj?.client_id);
  const draggingBlock = blocks.find(b => b.id === draggingId) || null;
  const libBlocks  = blocks.filter(b => !b.placed && (filterType==='all'||b.type===filterType));
  const placed     = blocks.filter(b => b.placed);
  const done       = placed.filter(b => b.status==='done').length;
  const progress   = placed.length > 0 ? Math.round((done/placed.length)*100) : 0;

  useEffect(() => {
    if (!selProjId) { setReports([]); setStrategy(null); setBlocks([]); return; }
    loadProject();
  }, [selProjId]);

  const loadProject = async () => {
    const [rr, pr] = await Promise.all([
      supabase.from('audit_reports').select('*').eq('project_id',selProjId).order('created_at',{ascending:false}).limit(20),
      supabase.from('projects').select('playground_strategy,playground_canvas,playground_generated_at').eq('id',selProjId).single(),
    ]);
    setReports(rr.data||[]);
    if (pr.data?.playground_strategy) { setStrategy(pr.data.playground_strategy); setGenAt(pr.data.playground_generated_at||''); }
    if (pr.data?.playground_canvas?.length) setBlocks(pr.data.playground_canvas);
    else if (pr.data?.playground_strategy?.canvas_blocks?.length)
      setBlocks(seedBlocks(pr.data.playground_strategy.canvas_blocks));
  };

  /* ── generate ── */
  const generate = async () => {
    if (!selProj) return toast({title:'Select a project first',variant:'destructive'});
    setGenerating(true);
    try {
      const cl = clients.find(c => c.id === selProj.client_id);
      const [mr, rr] = await Promise.all([
        supabase.from('metrics').select('*').eq('project_id',selProjId).order('recorded_at',{ascending:false}).limit(4),
        supabase.from('metrics').select('keyword_rankings').eq('project_id',selProjId).order('recorded_at',{ascending:false}).limit(1),
      ]);
      const audits = reports.map(r => ({created_at:r.created_at, sections:Object.fromEntries(Object.entries(r.sections||{}).map(([k,v])=>[k,safeStr(v).slice(0,300)]))}));
      const res = await fetch('/api/playground-analysis', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({project:selProj,client:cl,metrics:mr.data||[],keywordRankings:rr.data?.[0]?.keyword_rankings||[],auditReports:audits,competitors:selProj.competitors||[],allKeywords:selProj.keywords||[]}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setStrategy(data.strategy); setGenAt(data.generated_at);
      const nb = seedBlocks(data.strategy.canvas_blocks||[]);
      setBlocks(nb);
      await supabase.from('projects').update({playground_strategy:data.strategy,playground_canvas:nb,playground_generated_at:data.generated_at}).eq('id',selProjId);
      toast({title:`🧠 ${nb.length} strategy blocks ready!`,description:'Drag them from the library into your weekly plan.'});
      setTab('canvas');
    } catch(e:any) { toast({title:'Failed',description:e.message,variant:'destructive'}); }
    setGenerating(false);
  };

  /* ── drag from library to column ── */
  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('blockId', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  };
  const onDragOver = (e: React.DragEvent, week: number) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverWeek(week);
  };
  const onDrop = (e: React.DragEvent, week: number) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('blockId');
    if (!id) return;
    setBlocks(bs => bs.map(b => b.id===id ? {...b, placed:true, week} : b));
    setDraggingId(null); setDragOverWeek(null); scheduleAutoSave();
  };
  const onDragEnd  = () => { setDraggingId(null); setDragOverWeek(null); };
  const returnToLib = (id: string) => { setBlocks(bs => bs.map(b => b.id===id ? {...b,placed:false} : b)); scheduleAutoSave(); };
  const toggleStatus = (id: string) => { setBlocks(bs => bs.map(b => b.id===id ? {...b,status:SC[b.status]} : b)); scheduleAutoSave(); };
  const resetCanvas  = () => { setBlocks(bs => bs.map(b => ({...b,placed:false,status:'todo' as Status}))); scheduleAutoSave(); toast({title:'Canvas reset'}); };

  /* ── custom block ── */
  const addCustom = () => {
    if (!custTitle.trim()) return;
    const sug  = suggestWeekForCustom(custTitle, custContent, blocks);
    const nb: Block = {id:uid(),type:'custom',title:custTitle,content:custContent||'Custom planning block.',color:'#94a3b8',priority:'medium',status:'todo',week:5,placed:false,tags:['custom'],source:'Manual'};
    setBlocks(bs => [...bs, nb]);
    setCustTitle(''); setCustContent(''); setShowAdd(false); setCustSuggest(null);
    toast({title:'Block added to library!', description:`Suggested: ${sug.week===5?'Backlog':`Week ${sug.week}`} — ${sug.reason}`});
    scheduleAutoSave();
  };

  /* ── AI deep dive ── */
  const deepDive = async (block: Block) => {
    setDdBlock(block); setDdText(''); setDdLoading(true);
    const proj = `${client?.company||'Client'} | ${selProj?.url||''} | ${client?.industry||''}`;
    try {
      const res = await fetch('/api/canvas-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({focusBlockId:block.id,blocks,projectSummary:proj})});
      if(!res.ok||!res.body) throw new Error('Request failed');
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc='';
      while(true){const{done,value}=await reader.read();if(done)break;acc+=dec.decode(value,{stream:true});setDdText(acc);}
    } catch(e:any){setDdText(`Error: ${e.message}`);}
    setDdLoading(false);
  };

  /* ── AI chat ── */
  const askCanvas = async () => {
    if(!chatQ.trim()||chatLoading) return;
    setChatLoading(true); setChatResp('');
    const proj = `${client?.company||'Client'} | ${selProj?.url||''} | ${client?.industry||''}`;
    try {
      const res = await fetch('/api/canvas-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:chatQ,blocks:placed,projectSummary:proj})});
      if(!res.ok||!res.body) throw new Error('failed');
      const reader=res.body.getReader(); const dec=new TextDecoder(); let acc='';
      while(true){const{done,value}=await reader.read();if(done)break;acc+=dec.decode(value,{stream:true});setChatResp(acc);chatEndRef.current?.scrollIntoView({behavior:'smooth'});}
    } catch(e:any){setChatResp(`Error: ${e.message}`);}
    setChatLoading(false);
  };

  const scheduleAutoSave = () => {
    if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async()=>{
      if(!selProjId) return;
      await supabase.from('projects').update({playground_canvas:blocks}).eq('id',selProjId);
    },1500);
  };
  useEffect(()=>{ if(blocks.length&&selProjId) scheduleAutoSave(); },[blocks]);

  const dlReport = (r:any,t:string)=>{const b=new Blob([safeStr(r.sections?.[t])],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${t}-audit-${r.created_at?.split('T')[0]}.md`;a.click();URL.revokeObjectURL(a.href);};
  const cpReport = async(r:any,t:string)=>{await navigator.clipboard.writeText(safeStr(r.sections?.[t]));toast({title:'Copied!'});};

  const Sec=({title,icon:I,color,children,open:def=false}:any)=>{const[op,sop]=useState(def);return(<div className="rounded-2xl border border-border bg-card/60 overflow-hidden"><button onClick={()=>sop(o=>!o)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-secondary/20 transition-colors"><div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{background:`${color}18`,border:`1px solid ${color}28`}}><I size={14} style={{color}}/></div><span className="font-semibold text-sm flex-1">{title}</span>{op?<ChevronUp size={14} className="text-muted-foreground"/>:<ChevronDown size={14} className="text-muted-foreground"/>}</button>{op&&<div className="px-5 pb-5 border-t border-border/50">{children}</div>}</div>);};

  const ChatMd=({text}:{text:string})=>(<div className="text-sm leading-relaxed text-foreground/85">{text.split('\n').map((l,i)=>{if(l.startsWith('## '))return<div key={i} className="font-semibold text-sm mt-3 mb-1 text-primary">{l.slice(3)}</div>;if(/^[-*]\s/.test(l))return<div key={i} className="flex gap-2 my-0.5"><span className="text-primary shrink-0">•</span><span dangerouslySetInnerHTML={{__html:l.slice(2).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}}/></div>;if(!l.trim())return<div key={i} className="h-2"/>;return<p key={i} className="my-0.5" dangerouslySetInnerHTML={{__html:l.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}}/>;})}</div>);

  const s = strategy;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav companyName={client?.company?`${client.company} — Playground`:'Intelligence Playground'} projects={projects} selectedProjectId={selProjId} onProjectChange={setSelProjId}/>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold mb-1 flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary"/>Intelligence Playground</h1>
            <p className="text-sm text-muted-foreground">Audits, metrics, and rankings converged into a living strategy canvas with expert drag-and-drop guidance.</p>
          </div>
          <div className="flex items-center gap-3">
            {genAt&&<span className="text-xs font-mono text-muted-foreground">Updated {fmtDate(genAt)}</span>}
            <Button onClick={generate} disabled={generating||!selProjId} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
              {generating?<><RefreshCw className="h-4 w-4 mr-2 animate-spin"/>Analysing…</>:<><Brain className="h-4 w-4 mr-2"/>{strategy?'Regenerate':'Generate Strategy'}</>}
            </Button>
          </div>
        </div>

        {!selProjId&&(
          <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
            <Brain className="h-12 w-12 text-primary/30 mx-auto mb-4"/>
            <h3 className="font-bold text-lg mb-3">Select a project</h3>
            <select value={selProjId} onChange={e=>setSelProjId(e.target.value)} className="h-10 rounded-lg border border-border bg-background/60 text-sm px-4">
              <option value="">— Choose project —</option>
              {clients.map(c=>{const cp=projects.filter(p=>p.client_id===c.id);if(!cp.length)return null;return(<optgroup key={c.id} label={`${c.name} — ${c.company}`}>{cp.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>);})}
            </select>
          </div>
        )}

        {selProjId&&(
          <>
            {/* tabs */}
            <div className="flex gap-1 border-b border-border">
              {([{id:'reports',label:'Reports Library',icon:FileText},{id:'strategy',label:'Strategy Intelligence',icon:Brain},{id:'canvas',label:'Strategy Canvas',icon:Layers}] as const).map(({id,label,icon:Icon})=>(
                <button key={id} onClick={()=>setTab(id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab===id?'border-primary text-foreground':'border-transparent text-muted-foreground hover:text-foreground'}`}>
                  <Icon size={14}/>{label}
                  {id==='canvas'&&blocks.length>0&&<span className="text-xs bg-primary/10 text-primary rounded-full px-1.5">{blocks.length}</span>}
                </button>
              ))}
            </div>

            {/* ══ REPORTS ══ */}
            {tab==='reports'&&(
              <div className="space-y-4">
                {!reports.length?(<div className="rounded-2xl border border-border bg-card/60 p-10 text-center"><FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3"/><h3 className="font-semibold mb-1">No reports saved yet</h3><p className="text-sm text-muted-foreground">Run audits from the Audit Tool — they auto-save here.</p></div>)
                :reports.map(report=>{const types=Object.keys(report.sections||{});const exp=expandedRep===report.id;return(
                  <div key={report.id} className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                    <button onClick={()=>setExpandedRep(exp?null:report.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-colors">
                      <div className="flex items-center gap-4"><span className="text-sm font-semibold">{fmtDate(report.created_at)}</span><div className="flex gap-1.5">{types.map(t=><span key={t} className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary/40 text-muted-foreground font-mono">{t}</span>)}</div>{report.synced_to_metrics&&<span className="text-xs text-green-400 font-mono flex items-center gap-1"><CheckCircle2 size={10}/>Synced</span>}</div>
                      {exp?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
                    </button>
                    {exp && (
                      <div className="border-t border-border px-5 py-4 space-y-4">
                        {types.map(type => (
                          <div key={type} className="rounded-xl border border-border bg-background/40 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/30 border-b border-border">
                              <span className="text-xs font-semibold font-mono">{type} Audit</span>
                              <div className="flex gap-2">
                                <button onClick={() => cpReport(report, type)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border bg-background/60"><Copy size={10}/>Copy</button>
                                <button onClick={() => dlReport(report, type)} className="flex items-center gap-1 text-xs text-primary px-2 py-1 rounded border border-primary/30 bg-primary/5"><Download size={10}/>Download .md</button>
                              </div>
                            </div>
                            <div className="p-4 max-h-72 overflow-y-auto">
                              <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono">
                                {safeStr(report.sections[type]).slice(0, 3000)}
                                {safeStr(report.sections[type]).length > 3000 ? '\n\n[truncated — download for full]' : ''}
                              </pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );})}
              </div>
            )}

            {/* ══ STRATEGY ══ */}
            {tab==='strategy'&&(
              <div className="space-y-4">
                {!strategy?(<div className="rounded-2xl border border-border bg-card/60 p-10 text-center"><Brain className="h-12 w-12 text-primary/30 mx-auto mb-4"/><h3 className="font-bold text-lg mb-2">Generate Your Deep Strategy</h3><p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">Claude analyses every audit, metric, keyword, and competitor gap — produces a complete strategic brief plus 12-16 canvas blocks.</p><Button onClick={generate} disabled={generating} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground"><Brain className="h-4 w-4 mr-2"/>Generate Strategy</Button></div>)
                :(<>
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                    <div className="flex items-center gap-3 mb-3"><Star className="h-4 w-4 text-primary"/><span className="font-semibold">Executive Summary</span><span className={`ml-auto text-xs px-2 py-0.5 rounded-full border font-mono ${s.overall_health==='Strong'||s.overall_health==='Excellent'?'text-green-400 bg-green-400/10 border-green-400/20':s.overall_health==='Building'?'text-yellow-400 bg-yellow-400/10 border-yellow-400/20':'text-orange-400 bg-orange-400/10 border-orange-400/20'}`}>{s.overall_health}</span></div>
                    <p className="text-sm leading-relaxed mb-4">{s.executive_summary}</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {s.biggest_opportunity&&<div className="rounded-xl border border-green-400/20 bg-green-400/5 p-3"><div className="text-xs font-mono text-green-400 uppercase mb-1">Biggest Opportunity</div><p className="text-xs">{s.biggest_opportunity}</p></div>}
                      {s.biggest_risk&&<div className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3"><div className="text-xs font-mono text-orange-400 uppercase mb-1">Biggest Risk</div><p className="text-xs">{s.biggest_risk}</p></div>}
                    </div>
                  </div>
                  {s.quick_wins?.length>0&&<Sec title={`Quick Wins (${s.quick_wins.length})`} icon={Zap} color="#4ade80" open><div className="mt-4 grid sm:grid-cols-2 gap-3">{s.quick_wins.map((w:any,i:number)=>(<div key={i} className="rounded-xl border border-green-400/20 bg-green-400/5 p-3"><div className="font-semibold text-sm mb-1">{w.title}</div><p className="text-xs text-muted-foreground mb-2">{w.description}</p><div className="flex gap-1.5"><span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">{w.timeframe}</span><span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">impact:{w.impact}</span></div></div>))}</div></Sec>}
                  {s.weekly_plans?.length>0&&<Sec title="4-Week Action Plan" icon={Calendar} color="#60a5fa"><div className="mt-4 space-y-3">{s.weekly_plans.map((w:any)=>(<div key={w.week} className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4"><div className="flex items-center gap-3 mb-2"><div className="h-7 w-7 rounded-full bg-blue-400/10 border border-blue-400/30 flex items-center justify-center text-xs font-bold text-blue-400">{w.week}</div><div><div className="font-semibold text-sm">{w.theme}</div><div className="text-xs text-muted-foreground">{w.focus}</div></div></div><div className="space-y-1 mb-2">{(w.tasks||[]).map((t:string,i:number)=>(<div key={i} className="flex items-start gap-2 text-xs"><ChevronRight size={10} className="text-blue-400 shrink-0 mt-0.5"/><span>{t}</span></div>))}</div>{w.expected_outcome&&<p className="text-xs text-blue-400/70 border-t border-blue-400/20 pt-2">→ {w.expected_outcome}</p>}</div>))}</div></Sec>}
                  {s.monthly_roadmap?.length>0&&<Sec title="3-Month Roadmap" icon={Layers} color="#a78bfa"><div className="mt-4 grid sm:grid-cols-3 gap-4">{s.monthly_roadmap.map((m:any)=>(<div key={m.month} className="rounded-xl border border-purple-400/20 bg-purple-400/5 p-4"><div className="text-xs font-mono text-purple-400 uppercase mb-2">Month {m.month}</div><div className="font-semibold text-sm mb-1">{m.title}</div><p className="text-xs text-muted-foreground mb-3">{m.goal||m.phase_goal}</p>{(m.deliverables||m.key_deliverables||[]).map((d:string,i:number)=>(<div key={i} className="flex items-start gap-1.5 text-xs mb-1"><ChevronRight size={9} className="text-purple-400 shrink-0 mt-0.5"/><span>{d}</span></div>))}</div>))}</div></Sec>}
                  {s.kpi_forecast?.length>0&&<Sec title="KPI Forecast" icon={TrendingUp} color="#34d399"><div className="mt-4 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border"><th className="text-left py-2 pr-4 text-muted-foreground">Metric</th><th className="text-center py-2 px-3 text-muted-foreground">Now</th><th className="text-center py-2 px-3 text-emerald-400">30d</th><th className="text-center py-2 px-3 text-emerald-400/70">60d</th><th className="text-center py-2 px-3 text-emerald-400/50">90d</th></tr></thead><tbody>{s.kpi_forecast.map((k:any,i:number)=>(<tr key={i} className="border-b border-border/40"><td className="py-2 pr-4 font-medium">{k.metric}</td><td className="text-center py-2 px-3 text-muted-foreground">{k.now??k.current}</td><td className="text-center py-2 px-3 text-emerald-400 font-semibold">{k.d30??k.target_30d}</td><td className="text-center py-2 px-3 text-emerald-400/70">{k.d60??k.target_60d}</td><td className="text-center py-2 px-3 text-emerald-400/50">{k.d90??k.target_90d}</td></tr>))}</tbody></table></div></Sec>}
                  <Button onClick={()=>setTab('canvas')} className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold"><Layers className="h-4 w-4 mr-2"/>Open Strategy Canvas →</Button>
                </>)}
              </div>
            )}

            {/* ══ CANVAS ══ */}
            {tab==='canvas'&&(
              <div className="space-y-4">
                {!blocks.length?(<div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center"><Layers size={48} className="text-muted-foreground/20 mx-auto mb-4"/><h3 className="font-bold text-lg mb-2">No blocks yet</h3><p className="text-sm text-muted-foreground mb-5">Generate a strategy — Claude will populate the library with 12-16 strategic blocks ready to drag into your plan.</p><Button onClick={generate} disabled={generating} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground"><Brain className="h-4 w-4 mr-2"/>Generate Strategy</Button></div>)
                :(<>
                  {/* progress */}
                  <div className="rounded-2xl border border-border bg-card/60 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3"><span className="text-sm font-semibold">Progress</span><span className="text-xs font-mono text-primary">{done}/{placed.length} done</span></div>
                      <span className="text-2xl font-black text-primary">{progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-500" style={{width:`${progress}%`}}/></div>
                    <div className="grid grid-cols-5 gap-2 mt-3">
                      {COLUMNS.map(col=>{const cb=placed.filter(b=>b.week===col.week);const cd=cb.filter(b=>b.status==='done').length;return(<div key={col.week} className="text-center"><div className="text-xs text-muted-foreground mb-1 font-mono">{col.label}</div><div className="h-1 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary/60 transition-all" style={{width:cb.length>0?`${(cd/cb.length)*100}%`:'0%'}}/></div><div className="text-xs font-mono text-muted-foreground mt-1">{cd}/{cb.length}</div></div>);})}
                    </div>
                  </div>

                  {/* toolbar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={filterType} onChange={e=>setFilterType(e.target.value as any)} className="h-8 text-xs px-2 rounded-xl border border-border bg-background/60 text-muted-foreground">
                      <option value="all">All types</option>
                      {Object.entries(TM).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <div className="flex-1"/>
                    <button onClick={()=>setShowAdd(o=>!o)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-border bg-card/60 text-muted-foreground hover:text-foreground"><Plus size={12}/>Custom block</button>
                    <button onClick={resetCanvas} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-border bg-card/60 text-muted-foreground hover:text-foreground"><RotateCcw size={12}/>Reset</button>
                  </div>

                  {/* add custom block */}
                  {showAdd&&(
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                      <div className="text-sm font-semibold flex items-center gap-2"><Plus size={14} className="text-primary"/>Add Custom Block</div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Title *</div>
                          <input value={custTitle} onChange={e=>{setCustTitle(e.target.value);if(e.target.value.length>3)setCustSuggest(suggestWeekForCustom(e.target.value,custContent,blocks));}} placeholder="What needs to be done?" className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"/>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Details</div>
                          <input value={custContent} onChange={e=>setCustContent(e.target.value)} placeholder="Describe the task…" className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"/>
                        </div>
                      </div>
                      {custSuggest&&(
                        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 flex items-start gap-2">
                          <Brain size={13} className="text-primary shrink-0 mt-0.5"/>
                          <div className="text-xs">
                            <span className="text-primary font-semibold">AI Suggestion: </span>
                            <span className="text-foreground">Add to <strong>{custSuggest.week===5?'Backlog':`Week ${custSuggest.week}`}</strong> — {custSuggest.reason}</span>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={addCustom} disabled={!custTitle.trim()} className="bg-primary text-primary-foreground"><Plus size={12} className="mr-1"/>Add to Library</Button>
                        <button onClick={()=>{setShowAdd(false);setCustSuggest(null);}} className="text-xs text-muted-foreground hover:text-foreground px-3">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* ── main canvas layout: library + columns ── */}
                  <div className="flex gap-4 overflow-x-auto pb-2" style={{minHeight:520}}>

                    {/* Block Library */}
                    <div className="w-56 shrink-0 rounded-2xl border border-border bg-card/60 flex flex-col">
                      <div className="px-3 py-3 border-b border-border/60 bg-secondary/20 shrink-0">
                        <div className="font-semibold text-xs uppercase tracking-wider text-foreground/70 mb-0.5">Block Library</div>
                        <div className="text-xs text-muted-foreground">{libBlocks.length} blocks — drag to a week</div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-1.5"
                        onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';}}
                        onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('blockId');if(id)returnToLib(id);}}>
                        {libBlocks.length===0&&(
                          <div className="py-8 text-center">
                            <CheckCircle2 size={24} className="text-green-400/40 mx-auto mb-2"/>
                            <p className="text-xs text-muted-foreground">{blocks.length===0?'Generate a strategy to populate blocks':'All blocks placed! Drag from columns back here to unplace.'}
                            </p>
                          </div>
                        )}
                        {libBlocks.map(block=>{
                          const m=TM[block.type]||TM.custom; const I=m.icon; const pm=PM[block.priority];
                          return(
                            <div key={block.id} draggable onDragStart={e=>onDragStart(e,block.id)} onDragEnd={onDragEnd}
                              className={`rounded-xl border ${m.border} ${m.bg} p-2.5 cursor-grab active:cursor-grabbing group hover:shadow-md transition-all ${draggingId===block.id?'opacity-40 scale-95':''}`}>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <GripVertical size={10} className="text-muted-foreground/30 shrink-0"/>
                                <I size={10} style={{color:m.color}} className="shrink-0"/>
                                <span className="text-xs font-semibold flex-1 truncate">{block.title}</span>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed ml-4">{block.content}</p>
                              <div className="flex items-center gap-1.5 mt-2 ml-4">
                                <span className={`inline-block h-1.5 w-1.5 rounded-full ${pm.dot}`}/>
                                <span className="text-xs text-muted-foreground">{block.priority}</span>
                                <span className="text-xs font-mono ml-auto" style={{color:m.color}}>{m.label}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Week columns */}
                    {COLUMNS.map(col=>{
                      const colBlocks = blocks.filter(b=>b.placed&&b.week===col.week);
                      const isOver    = dragOverWeek===col.week;
                      const sug: Suggestion|null = draggingBlock ? getSuggestion(draggingBlock,col.week,blocks) : null;
                      const sl = sug ? SL_STYLE[sug.level] : null;
                      const colDone = colBlocks.filter(b=>b.status==='done').length;

                      return(
                        <div key={col.week}
                          onDragOver={e=>onDragOver(e,col.week)}
                          onDrop={e=>onDrop(e,col.week)}
                          onDragLeave={()=>setDragOverWeek(null)}
                          className={`flex-1 min-w-[195px] max-w-[240px] rounded-2xl border flex flex-col transition-all duration-150 ${
                            isOver&&sl ? `${sl.ring} border-transparent` : 'border-border bg-card/40'
                          }`}
                        >
                          {/* column header */}
                          <div className={`px-3 py-3 border-b border-border/50 shrink-0 rounded-t-2xl transition-colors ${isOver&&sl?'bg-card/80':''}`}>
                            <div className="flex items-center justify-between mb-0.5">
                              <div>
                                <div className="text-xs font-bold text-foreground">{col.label}</div>
                                <div className="text-xs text-muted-foreground">{col.sub}</div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-mono text-muted-foreground">{colDone}/{colBlocks.length}</span>
                              </div>
                            </div>

                            {/* Suggestion badge when dragging */}
                            {isOver&&sug&&sl&&(
                              <div className={`mt-2 rounded-xl border ${sl.badge} px-2 py-2`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <sl.icon size={10}/>
                                  <span className="text-xs font-bold">{sug.headline}</span>
                                </div>
                                <p className="text-xs leading-relaxed mb-1 opacity-90">{sug.reason}</p>
                                <p className="text-xs opacity-75"><span className="font-semibold">Impact:</span> {sug.impact}</p>
                                {sug.best && sug.level !== 'best' && (
                                  <p className="text-xs opacity-75 mt-0.5"><span className="font-semibold">Best in:</span> {sug.best}</p>
                                )}
                              </div>
                            )}

                            {/* subtle hint when not hovering but dragging */}
                            {draggingBlock&&!isOver&&sug&&(
                              <div className={`mt-2 rounded-lg px-2 py-1 flex items-center gap-1.5 ${sl!.badge} border opacity-60`}>
                                {sl&&<sl.icon size={9}/>}
                                <span className="text-xs">{sl?.label}</span>
                              </div>
                            )}
                          </div>

                          {/* cards */}
                          <div className="flex-1 p-2 space-y-2 min-h-[300px]">
                            {colBlocks.length===0&&!isOver&&(
                              <div className="h-20 rounded-xl border-2 border-dashed border-border/25 flex items-center justify-center">
                                <p className="text-xs text-muted-foreground/30">Drop here</p>
                              </div>
                            )}
                            {colBlocks.map(block=>{
                              const m=TM[block.type]||TM.custom; const I=m.icon;
                              const pm2=PM[block.priority]; const sm2=SM[block.status]; const SI=sm2.icon;
                              return(
                                <div key={block.id} draggable onDragStart={e=>onDragStart(e,block.id)} onDragEnd={onDragEnd}
                                  className={`rounded-xl border ${m.border} ${m.bg} p-3 cursor-grab group transition-all ${draggingId===block.id?'opacity-40 scale-95':'hover:shadow-md'} ${block.status==='done'?'opacity-60':''}`}>
                                  <div className="flex items-start gap-2 mb-2">
                                    <I size={11} style={{color:m.color}} className="shrink-0 mt-0.5"/>
                                    <p className={`text-xs font-semibold flex-1 leading-tight ${block.status==='done'?'line-through text-muted-foreground':''}`}>{block.title}</p>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      <button onClick={()=>deepDive(block)} title="AI Deep Dive" className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-primary/20 text-muted-foreground hover:text-primary"><Brain size={9}/></button>
                                      <button onClick={()=>setExpandedBlock(block)} title="Expand" className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-background text-muted-foreground hover:text-foreground"><Maximize2 size={9}/></button>
                                      <button onClick={()=>returnToLib(block.id)} title="Return to library" className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-red-400/20 text-muted-foreground hover:text-red-400"><X size={9}/></button>
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">{block.content}</p>
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${pm2.dot}`}/><span className="text-xs text-muted-foreground">{block.priority}</span></div>
                                    <button onClick={()=>toggleStatus(block.id)} className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${block.status==='done'?'text-green-400 bg-green-400/10 border-green-400/20':block.status==='doing'?'text-blue-400 bg-blue-400/10 border-blue-400/20':'text-muted-foreground border-border/50 hover:border-primary/30'}`}>
                                      <SI size={8} className={block.status==='doing'?'animate-spin':''}/><span>{sm2.label}</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Ask the Canvas ── */}
                  <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-secondary/20">
                      <MessageSquare className="h-4 w-4 text-primary"/>
                      <span className="font-semibold text-sm">Ask the Canvas</span>
                      <span className="text-xs text-muted-foreground">Claude answers using your full canvas + project data</span>
                    </div>
                    <div className="px-5 pt-3 pb-2 flex flex-wrap gap-2">
                      {['What should I focus on today?','Which items give best ROI?','What are Week 1 dependencies?','What happens if I skip the backlog?'].map(q=>(
                        <button key={q} onClick={()=>setChatQ(q)} className="text-xs px-2.5 py-1 rounded-full border border-border bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">{q}</button>
                      ))}
                    </div>
                    <div className="px-5 pb-3 flex gap-2">
                      <input value={chatQ} onChange={e=>setChatQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askCanvas()} placeholder="Ask anything about this strategy…" className="flex-1 h-10 text-sm px-4 rounded-xl border border-border bg-background/60 focus:border-primary/50 outline-none"/>
                      <Button onClick={askCanvas} disabled={chatLoading||!chatQ.trim()} className="h-10 bg-primary text-primary-foreground px-4">
                        {chatLoading?<RefreshCw size={14} className="animate-spin"/>:<Send size={14}/>}
                      </Button>
                    </div>
                    {(chatResp||chatLoading)&&(
                      <div className="mx-5 mb-4 rounded-xl border border-border bg-background/60 p-4">
                        {chatLoading&&!chatResp&&<div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw size={12} className="animate-spin text-primary"/>Thinking…</div>}
                        {chatResp&&<ChatMd text={chatResp}/>}
                        <div ref={chatEndRef}/>
                      </div>
                    )}
                  </div>
                </>)}
              </div>
            )}
          </>
        )}

      {/* ── Block expand modal ── */}
      {expandedBlock&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={()=>setExpandedBlock(null)}/>
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card/95 shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent"/>
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border sticky top-0 bg-card/95 backdrop-blur z-10">
              {(()=>{const m=TM[expandedBlock.type]||TM.custom;const I=m.icon;return(<><div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{background:`${m.color}18`,border:`1px solid ${m.color}28`}}><I size={13} style={{color:m.color}}/></div><div className="flex-1"><div className="font-bold text-sm">{expandedBlock.title}</div><div className="text-xs font-mono" style={{color:m.color}}>{m.label}</div></div></>)})()}
              <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${PM[expandedBlock.priority].badge}`}>{expandedBlock.priority}</span>
              <button onClick={()=>{deepDive(expandedBlock);setExpandedBlock(null);}} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20"><Brain size={11}/>Deep Dive</button>
              <button onClick={()=>setExpandedBlock(null)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50"><X size={13}/></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-xl border border-border bg-background/60 p-4"><p className="text-sm leading-relaxed whitespace-pre-wrap">{expandedBlock.content}</p></div>
              {expandedBlock.tags?.length?<div className="flex flex-wrap gap-1.5">{expandedBlock.tags.map((t,i)=><span key={i} className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary/30 text-muted-foreground flex items-center gap-1"><Tag size={8}/>{t}</span>)}</div>:null}
              <div className="flex gap-2 flex-wrap">
                {expandedBlock.effort&&<span className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground">effort: {expandedBlock.effort}</span>}
                {expandedBlock.impact&&<span className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground">impact: {expandedBlock.impact}</span>}
              </div>
              <button onClick={async()=>{await navigator.clipboard.writeText(expandedBlock.content);toast({title:'Copied!'});}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground"><Copy size={11}/>Copy content</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deep Dive modal ── */}
      {ddBlock&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={()=>{if(!ddLoading)setDdBlock(null);}}/>
          <div className="relative w-full max-w-2xl rounded-2xl border border-primary/30 bg-card/95 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent"/>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
              <Brain className="h-4 w-4 text-primary"/>
              <div className="flex-1"><div className="font-semibold text-sm">AI Deep Dive</div><div className="text-xs text-muted-foreground truncate">{ddBlock.title}</div></div>
              {ddLoading&&<RefreshCw size={14} className="animate-spin text-primary"/>}
              {!ddLoading&&<button onClick={()=>setDdBlock(null)} className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50"><X size={12}/></button>}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {ddLoading&&!ddText&&<div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center"><RefreshCw size={14} className="animate-spin text-primary"/>Analysing this block in depth…</div>}
              {ddText&&<div className="rounded-xl border border-border bg-background/60 p-4"><ChatMd text={ddText}/></div>}
            </div>
            {ddText&&!ddLoading&&(
              <div className="px-5 py-3 border-t border-border shrink-0 flex gap-2">
                <button onClick={async()=>{await navigator.clipboard.writeText(ddText);toast({title:'Copied!'});}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground"><Copy size={11}/>Copy</button>
                <button onClick={()=>setDdBlock(null)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground ml-auto">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
