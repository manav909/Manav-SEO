import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import PortalNav from '@/components/PortalNav';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Sparkles, FileText, Download, Copy, Plus, RefreshCw, Trash2, ListChecks,
  ChevronDown, ChevronUp, Zap, Brain, Globe, Shield, Lock,
  Trophy, TrendingUp, Calendar, Layers, X, Tag,
  CheckCircle2, Maximize2, Star, Send, MessageSquare,
  Clock, AlertTriangle, ChevronRight, RotateCcw, GripVertical,
  ArrowRight, Lightbulb, Target, Flame, BarChart3, Activity,
} from 'lucide-react';

/* ─── types ─── */
type BType    = 'quick-win'|'weekly'|'monthly'|'technical'|'content'|'geo'|'competitive'|'insight'|'kpi'|'custom';
type Priority = 'high'|'medium'|'low';
type Status   = 'todo'|'doing'|'review'|'waiting'|'verified'|'done';
type Tab      = 'reports'|'strategy'|'canvas'|'pipeline';
type SugLevel = 'best'|'good'|'ok'|'caution';

interface Block {
  id: string; type: BType; title: string; content: string;
  color: string; priority: Priority; status: Status;
  week: number; placed: boolean;
  effort?: string; impact?: string; tags?: string[]; source?: string; assignee?: string; aiAssisted?: boolean;
}

interface Suggestion {
  level: SugLevel; headline: string; reason: string; impact: string; best: string;
}

interface Recommendation {
  block:  Block;
  week:   number;
  reason: string;
  impact: string;
  metric: string;
}

/* ─── type meta ─── */
/* ─── Role definitions ─── */
const ROLES = [
  { id:'content_writer', label:'Content Writer',    icon:FileText,  color:'#facc15', questions:[
    'What should I write this week and in what order?',
    'What keywords must appear in each piece?',
    'What is the ideal structure for the pillar page?',
    'Which content piece has the highest ranking chance right now?',
    'What tone and style should I use for this client?',
    'Are there any content gaps I should fill before Week 3?',
    'What internal links should I add to the new article?',
    'How do I make this content GEO-ready for AI citation?',
  ]},
  { id:'team_lead',       label:'Team Lead',          icon:Target,    color:'#60a5fa', questions:[
    'Who is blocked right now and what is the exact blocker?',
    'What is the critical path this week?',
    'What risks should I escalate today?',
    'Is the team capacity realistic for this week?',
    'What should be the focus of today&#39;s standup?',
    'Which task if delayed will cause the most damage?',
    'Are there any dependency conflicts in the current plan?',
    'What should be moved to backlog to reduce overload?',
  ]},
  { id:'executive',       label:'Executive',           icon:Trophy,    color:'#a78bfa', questions:[
    'What is the business impact of this week&#39;s work in plain terms?',
    'Are we on track to hit the 90-day targets?',
    'What is the one decision I need to make this week?',
    'How do we compare to competitors right now?',
    'What does the client see as progress this month?',
    'What is the ROI projection from the current plan?',
    'What would delay results and what does that cost us?',
    'What is the single highest-leverage action we can take?',
  ]},
  { id:'senior_seo',      label:'Senior SEO',          icon:Brain,     color:'#f472b6', questions:[
    'What is the topical authority gap we need to close first?',
    'Which technical issues are most likely causing ranking suppression?',
    'How is the E-E-A-T signal building across the site?',
    'What GEO optimisation should be prioritised for Perplexity?',
    'Is the content structure supporting topical clusters correctly?',
    'What algorithm signals are we ignoring in the current plan?',
    'Which competitor is outranking us and what exactly are they doing differently?',
    'What is the indexing health and how does it affect our timeline?',
  ]},
  { id:'project_manager', label:'Project Manager',    icon:Calendar,  color:'#34d399', questions:[
    'What is the current project status in RAG (Red/Amber/Green)?',
    'Are all milestones on track for this sprint?',
    'What is in the risk register that needs updating?',
    'Who needs to sign off on what before work can start?',
    'What has slipped and what is the revised timeline?',
    'What resources are needed that we do not currently have?',
    'What is the dependency chain for the critical deliverable?',
    'How do I communicate this week&#39;s progress to stakeholders?',
  ]},
  { id:'biz_dev',         label:'Biz Dev Manager',    icon:Sparkles,  color:'#fb923c', questions:[
    'How do I present this week&#39;s progress to the client in a compelling way?',
    'The client says they are not seeing results — what do I tell them?',
    'What upsell opportunity does the current campaign create?',
    'How do I position the retainer renewal based on the data?',
    'What proof points do I have for the next client meeting?',
    'How do I handle the objection that SEO takes too long?',
    'What competitive wins can I show the client right now?',
    'How do I justify the campaign investment with the current metrics?',
  ]},
];

const TM: Record<BType,{label:string;icon:any;color:string;bg:string;border:string}> = {
  'quick-win':   {label:'Quick Win',   icon:Zap,       color:'#4ade80',bg:'bg-green-400/10', border:'border-green-400/25'},
  'weekly':      {label:'Weekly',      icon:Calendar,  color:'#60a5fa',bg:'bg-blue-400/10',  border:'border-blue-400/25' },
  'monthly':     {label:'Monthly',     icon:Layers,    color:'#a78bfa',bg:'bg-purple-400/10',border:'border-purple-400/25'},
  'technical':   {label:'Technical',   icon:Shield,    color:'#06b6d4',bg:'bg-cyan-400/10',  border:'border-cyan-400/25' },
  'content':     {label:'Content',     icon:FileText,  color:'#facc15',bg:'bg-yellow-400/10',border:'border-yellow-400/25'},
  'geo':         {label:'GEO',         icon:Globe,     color:'#6366f1',bg:'bg-indigo-400/10',border:'border-indigo-400/25'},
  'competitive': {label:'Competitive', icon:Trophy,    color:'#fb923c',bg:'bg-orange-400/10',border:'border-orange-400/25'},
  'insight':     {label:'Insight',     icon:Brain,     color:'#f472b6',bg:'bg-pink-400/10',  border:'border-pink-400/25' },
  'kpi':         {label:'KPI',         icon:TrendingUp,color:'#34d399',bg:'bg-emerald-400/10',border:'border-emerald-400/25'},
  'custom':      {label:'Custom',      icon:Star,      color:'#94a3b8',bg:'bg-slate-400/10', border:'border-slate-400/25' },
};

// Theme helper — avoids local const declarations in map callbacks (prevents minification TDZ)
const gT = (type: string) => TM[type as BType] || TM.custom;


const PM: Record<Priority,{dot:string;badge:string}> = {
  high:   {dot:'bg-red-400',   badge:'text-red-400 bg-red-400/10 border-red-400/20'   },
  medium: {dot:'bg-yellow-400',badge:'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'},
  low:    {dot:'bg-green-400', badge:'text-green-400 bg-green-400/10 border-green-400/20'},
};

const SC: Record<Status,Status> = {todo:'doing',doing:'review',review:'todo',waiting:'review',verified:'todo',done:'todo'};
const SM: Record<Status,{label:string;icon:any;color:string}> = {
  todo:     {label:'To Do',       icon:Clock,        color:'text-muted-foreground'},
  doing:    {label:'In Progress', icon:RefreshCw,    color:'text-blue-400'       },
  review:   {label:'Pending Check',icon:AlertTriangle,color:'text-yellow-400'    },
  waiting:  {label:'Waiting',     icon:Clock,        color:'text-orange-400'     },
  verified: {label:'Verified ✓',  icon:CheckCircle2, color:'text-green-400'      },
  done:     {label:'Done',        icon:CheckCircle2, color:'text-green-400'      },
};

const SL: Record<SugLevel,{ring:string;badge:string;icon:any;label:string}> = {
  best:   {ring:'ring-2 ring-green-400/60 shadow-[0_0_20px_rgba(74,222,128,0.2)]', badge:'bg-green-400/15 text-green-400 border-green-400/30',  icon:CheckCircle2, label:'Best here' },
  good:   {ring:'ring-2 ring-blue-400/50',                                          badge:'bg-blue-400/15 text-blue-400 border-blue-400/30',     icon:CheckCircle2, label:'Good fit'  },
  ok:     {ring:'ring-1 ring-yellow-400/40',                                         badge:'bg-yellow-400/15 text-yellow-400 border-yellow-400/30',icon:AlertTriangle,label:'Acceptable'},
  caution:{ring:'ring-2 ring-red-400/50 shadow-[0_0_16px_rgba(248,113,113,0.15)]',  badge:'bg-red-400/15 text-red-400 border-red-400/30',        icon:AlertTriangle,label:'Caution'   },
};

const COLUMNS = [
  {week:1,label:'Week 1',sub:'Foundation'},
  {week:2,label:'Week 2',sub:'Build'},
  {week:3,label:'Week 3',sub:'Accelerate'},
  {week:4,label:'Week 4',sub:'Compound'},
  {week:5,label:'Backlog',sub:'Long-term'},
];

/* ─── expert suggestion engine ─── */
type Rule = {level:SugLevel;headline:string;reason:string;impact:string;best:number[]};
type RuleSet = Partial<Record<number,Rule>> & {defaultBest:number[]};

const EXPERT: Record<BType,RuleSet> = {
  'quick-win': { defaultBest:[1],
    1:{level:'best',   headline:'Perfect — do this first',         reason:'Quick wins in Week 1 build early momentum and validate your approach before longer commitments.',         impact:'Early ranking signals within 48-72h. Client confidence rises immediately.',best:[1]},
    2:{level:'good',   headline:'Still early enough',              reason:'Week 2 preserves most momentum value — not ideal but acceptable if Week 1 is at capacity.',              impact:'Slight delay in early signals — still impactful.',best:[1]},
    3:{level:'ok',     headline:'Getting late',                    reason:'Three weeks in, a quick win risks becoming deprioritised.',                                              impact:'Reduced urgency. Compounding opportunity shrinks.',best:[1,2]},
    4:{level:'caution',headline:'Too late — move earlier',         reason:'Quick wins that take 4 weeks to schedule become technical debt.',                                         impact:'Missed early momentum and compounding opportunity.',best:[1]},
    5:{level:'caution',headline:'Do not backlog quick wins',       reason:'Quick wins disappear in the backlog indefinitely. Must happen Week 1-2.',                               impact:'Very high risk of never being actioned.',best:[1]},
  },
  'technical': { defaultBest:[1,2],
    1:{level:'best',   headline:'Technical must come first',       reason:'Google cannot rank what it cannot crawl. Technical fixes unlock all subsequent SEO work.',               impact:'All Week 2+ work performs better. Full ROI on content investment.',best:[1]},
    2:{level:'good',   headline:'Acceptable if Week 1 is full',    reason:'Still early — minor ROI loss on Week 1 content is acceptable.',                                         impact:'Week 1 content slightly underperforms — recovers quickly.',best:[1]},
    3:{level:'ok',     headline:'Risky — 3 weeks of lost ROI',     reason:'Every week of delay means content and links are less effective.',                                        impact:'Lower ROI on all Weeks 1-2 work. Pages indexed suboptimally.',best:[1,2]},
    4:{level:'caution',headline:'4 weeks of technical debt',       reason:'All prior work on a broken foundation. Fix this immediately.',                                           impact:'Significant ROI loss. All prior content underperforming.',best:[1]},
    5:{level:'caution',headline:'Critical — do not defer',         reason:'Building authority on broken infrastructure is the number one SEO mistake.',                            impact:'All existing and future work underperforms until resolved.',best:[1]},
  },
  'content': { defaultBest:[2,3],
    1:{level:'ok',     headline:'Possible but premature',          reason:'Content before technical fixes risks Google indexing it on slow or misconfigured pages.',               impact:'Content may rank below potential. Technical first gives max impact.',best:[2,3]},
    2:{level:'best',   headline:'Optimal timing',                  reason:'With Week 1 technical foundation in place, content gets indexed cleanly from day one.',                 impact:'Maximum ranking velocity — every piece hits with full technical backing.',best:[2,3]},
    3:{level:'best',   headline:'Data-informed content',           reason:'By Week 3 you have early signals from Weeks 1-2 to focus on what is already ranking.',                 impact:'Higher quality decisions. Less wasted content effort.',best:[2,3]},
    4:{level:'good',   headline:'Late but still compounds',        reason:'Week 4 content benefits from the foundation but has less time to rank.',                               impact:'Good ROI but shorter compounding window.',best:[2,3]},
    5:{level:'caution',headline:'Content in backlog = no content', reason:'Content is the primary long-term ranking driver. Deferring indefinitely caps growth.',                  impact:'Major organic traffic opportunity cost every month this waits.',best:[2,3]},
  },
  'geo': { defaultBest:[2,3],
    1:{level:'ok',     headline:'Premature without content',       reason:'GEO needs content for AI engines to cite. Nothing to optimise without it.',                            impact:'Very low impact until supporting content exists.',best:[2,3]},
    2:{level:'best',   headline:'Right timing for GEO',            reason:'Alongside new content in Week 2, GEO signals compound as each page goes live.',                        impact:'AI citation potential builds in real-time with publication.',best:[2,3]},
    3:{level:'best',   headline:'Data-driven GEO timing',          reason:'Week 3 shows what AI engines are and are not citing — target precisely.',                               impact:'More targeted actions. Less wasted effort.',best:[2,3]},
    4:{level:'good',   headline:'Still valuable',                  reason:'Perplexity citations can improve quickly even in Week 4.',                                              impact:'Good compounding window remaining.',best:[2,3]},
    5:{level:'caution',headline:'Do not defer GEO indefinitely',   reason:'AI search is growing fast. Every month absent means competitors get cited instead.',                   impact:'Compounding AI traffic opportunity cost.',best:[2,3]},
  },
  'competitive': { defaultBest:[3,4],
    1:{level:'ok',     headline:'Good for research only',          reason:'Competitive analysis in Week 1 is useful for planning — hold execution until Week 3.',                  impact:'Use findings to inform Week 1-2 strategy. Hold moves.',best:[3,4]},
    2:{level:'good',   headline:'Slightly early',                  reason:'Week 2 is viable if confident in technical foundation.',                                               impact:'Competitive moves land but without full authority backing.',best:[3,4]},
    3:{level:'best',   headline:'Optimal competitive window',      reason:'3 weeks of foundation behind you makes competitive moves stick.',                                       impact:'Durable gains with technical and content backing.',best:[3,4]},
    4:{level:'best',   headline:'Strong — timing compounds',       reason:'Week 4 moves benefit from everything built in Weeks 1-3.',                                             impact:'Competitors see your moves at your peak authority.',best:[3,4]},
    5:{level:'caution',headline:'Do not defer competitive moves',  reason:'Competitors are not waiting. Backlogging widens the gap every week.',                                  impact:'Increasing difficulty and cost to close gaps.',best:[3,4]},
  },
  'insight':  { defaultBest:[1,5],
    1:{level:'best',headline:'Insights inform everything',         reason:'Strategic insights at the start shape every task — maximum leverage.',                                 impact:'All Week 1-4 tasks are better informed.',best:[1,5]},
    3:{level:'ok', headline:'Limited leverage at this stage',      reason:'Week 3 insights can only redirect Week 4 work.',                                                       impact:'Low leverage — most work already underway.',best:[1,5]},
    5:{level:'best',headline:'Backlog suits long-term insights',   reason:'Insights not immediately actionable belong in the backlog as reference.',                              impact:'Keeps active weeks focused on execution.',best:[1,5]},
  },
  'kpi':      { defaultBest:[5],
    1:{level:'ok',  headline:'Useful as a baseline',               reason:'Setting KPI baselines in Week 1 is genuinely useful for tracking.',                                    impact:'Good for measurement — not an execution task.',best:[5]},
    5:{level:'best',headline:'Right place for KPI tracking',       reason:'KPIs are ongoing monitoring — they belong in the backlog as persistent reference.',                    impact:'Keeps active weeks focused on moving metrics.',best:[5]},
  },
  'weekly':   { defaultBest:[1,2],
    1:{level:'best',headline:'Week 1 action — start now',          reason:'Weekly action items are time-bound. Week 1 items go in Week 1.',                                       impact:'On-time delivery of planned work.',best:[1,2]},
    2:{level:'best',headline:'Week 2 plan — right column',         reason:'Weekly plans are sequenced — place them in their corresponding week.',                                  impact:'Maintains strategic sequencing integrity.',best:[1,2]},
    5:{level:'caution',headline:'Do not defer weekly tasks',       reason:'Weekly action items in the backlog lose their time-bound context and rarely get done.',                 impact:'Strategic plan loses sequencing integrity.',best:[1,2,3,4]},
  },
  'monthly':  { defaultBest:[5,4],
    1:{level:'ok',  headline:'Too early for monthly strategy',     reason:'Monthly goals are 30-day horizons — not Week 1 actions.',                                              impact:'Creates confusion between strategic and tactical.',best:[5]},
    5:{level:'best',headline:'Backlog is right for monthly',       reason:'Monthly strategic goals belong in the backlog as long-horizon planning items.',                        impact:'Keeps weekly columns focused on executable tasks.',best:[5]},
  },
  'custom':   { defaultBest:[1,2,3,4,5],
    1:{level:'good',headline:'Your call',reason:'Custom blocks can go anywhere — place where it fits.',impact:'Depends on what this block represents.',best:[1,2,3,4,5]},
    2:{level:'good',headline:'Your call',reason:'Custom blocks can go anywhere.',impact:'Depends on context.',best:[1,2,3,4,5]},
    3:{level:'good',headline:'Your call',reason:'Custom blocks can go anywhere.',impact:'Depends on context.',best:[1,2,3,4,5]},
    4:{level:'good',headline:'Your call',reason:'Custom blocks can go anywhere.',impact:'Depends on context.',best:[1,2,3,4,5]},
    5:{level:'good',headline:'Backlog for non-urgent items',reason:'Custom blocks not immediately actionable fit well in the backlog.',impact:'Good for long-term tracking.',best:[1,2,3,4,5]},
  },
};

function getSuggestion(block: Block, targetWeek: number, allBlocks: Block[]): Suggestion {
  const rules = EXPERT[block.type] || EXPERT.custom;
  const rule  = (rules as any)[targetWeek] as Rule | undefined;
  const bestW = rule?.best || rules.defaultBest || [1];
  const bestLabel = bestW.map((w: number) => w === 5 ? 'Backlog' : `Week ${w}`).join(' or ');
  const colBlocks = allBlocks.filter(b => b.placed && b.week === targetWeek);
  const isFull    = colBlocks.length >= 5;
  const bwNote    = isFull ? ` Note: ${targetWeek === 5 ? 'Backlog' : `Week ${targetWeek}`} already has ${colBlocks.length} items — check bandwidth.` : '';
  const techInW1  = allBlocks.some(b => b.placed && b.week === 1 && b.type === 'technical');
  const depNote   = (block.type === 'content' || block.type === 'geo') && targetWeek <= 2 && !techInW1
    ? ' ⚠ No technical tasks in Week 1 yet — add those first for best results.' : '';
  if (!rule) return {level:'good',headline:'Reasonable placement',reason:`No specific guidance for this type.${bwNote}${depNote}`,impact:'Depends on surrounding tasks.',best:bestLabel};
  return {level:rule.level,headline:rule.headline,reason:rule.reason+bwNote+depNote,impact:rule.impact,best:bestLabel};
}

/* ─── next move recommendation engine ─── */
const IMPACT_METRICS: Record<BType, Record<number, string>> = {
  'technical':   {1:'+5-8 Algorithm Health · +3-5 E-E-A-T in 30d',2:'+3-5 Algorithm Health in 30d',3:'+2 Algorithm Health in 30d',5:'Minimal until fixed'},
  'quick-win':   {1:'+2-4 Overall Growth · 48-72h signal',2:'+1-3 Overall Growth',3:'+1-2 Overall Growth',5:'No impact if backlogged'},
  'content':     {2:'+4-7 Content Authority · +3-5 LLM Visibility in 30d',3:'+3-6 Content Authority in 30d',1:'Suboptimal ranking potential',5:'No impact if backlogged'},
  'geo':         {2:'+5-9 LLM Visibility · Perplexity citations in 30-45d',3:'+4-7 LLM Visibility in 30d',1:'Low impact without content',5:'No impact if backlogged'},
  'competitive': {3:'+3-5 Competitor Rank improvement · 45-60d',4:'+2-4 Competitor Rank · 30-45d',1:'Premature — no foundation yet',5:'No impact if backlogged'},
  'insight':     {1:'Improves all subsequent decisions',5:'Reference only — no direct metric impact'},
  'kpi':         {1:'Tracking only',5:'Reference only'},
  'weekly':      {1:'+2-3 Overall Growth per task completed',2:'+2-3 Overall Growth per task',3:'+1-2',4:'+1',5:'No impact'},
  'monthly':     {5:'Strategic alignment',4:'Milestone tracking'},
  'custom':      {1:'Depends on task',2:'Depends on task',3:'Depends on task',4:'Depends on task',5:'Depends on task'},
};

function getDropImpact(block: Block, week: number): string {
  const map = IMPACT_METRICS[block.type];
  return map?.[week] ?? map?.[block.week] ?? 'Contributes to overall strategy progress';
}

function getNextRecommendation(placed: Block[], library: Block[]): Recommendation | null {
  if (!library.length) return null;

  const hasW1Tech    = placed.some(b => b.week === 1 && b.type === 'technical');
  const hasW1Quick   = placed.some(b => b.week === 1 && b.type === 'quick-win');
  const hasW2Content = placed.some(b => b.week === 2 && b.type === 'content');
  const hasW2Geo     = placed.some(b => b.week === 2 && b.type === 'geo');
  const hasW3Comp    = placed.some(b => b.week === 3 && b.type === 'competitive');

  // Rule 1: technical foundation first
  if (!hasW1Tech) {
    const b = library.find(b => b.type === 'technical' && (b.priority === 'high' || b.priority === 'medium'));
    if (b) return {block:b,week:1,reason:'Week 1 has no technical foundation yet. This is the most important first move — everything else depends on it.',impact:getDropImpact(b,1),metric:'+5-8 Algorithm Health score in 30 days'};
  }

  // Rule 2: high-priority quick wins
  if (!hasW1Quick) {
    const b = library.find(b => b.type === 'quick-win' && b.priority === 'high');
    if (b) return {block:b,week:1,reason:'Week 1 should include a high-priority quick win for early momentum. Clients and Google both notice fast results.',impact:getDropImpact(b,1),metric:'Early ranking signal within 48-72 hours'};
  }

  // Rule 3: content in Week 2 after technical foundation
  if (hasW1Tech && !hasW2Content) {
    const b = library.find(b => b.type === 'content');
    if (b) return {block:b,week:2,reason:'Technical foundation is in Week 1. Now content in Week 2 will be indexed on clean, optimised pages from day one.',impact:getDropImpact(b,2),metric:'+4-7 Content Authority in 30 days'};
  }

  // Rule 4: GEO alongside content
  if (hasW2Content && !hasW2Geo) {
    const b = library.find(b => b.type === 'geo');
    if (b) return {block:b,week:2,reason:'Content is in Week 2. GEO signals compound in real-time as pages go live — place it here to maximise AI citation potential.',impact:getDropImpact(b,2),metric:'+5-9 LLM Visibility score in 30-45 days'};
  }

  // Rule 5: competitive in Week 3
  if (placed.length >= 3 && !hasW3Comp) {
    const b = library.find(b => b.type === 'competitive');
    if (b) return {block:b,week:3,reason:'Foundation is solid. Week 3 competitive moves will stick because you now have technical and content backing.',impact:getDropImpact(b,3),metric:'+3-5 Competitor Rank positions in 45-60 days'};
  }

  // Rule 6: any remaining high-priority
  const highPri = library.filter(b => b.priority === 'high').sort((a, b) => {
    const order: Record<BType,number> = {'technical':0,'quick-win':1,'content':2,'geo':3,'competitive':4,'weekly':5,'insight':6,'kpi':7,'monthly':8,'custom':9};
    return (order[a.type]||9)-(order[b.type]||9);
  });
  if (highPri[0]) {
    const b = highPri[0];
    const w = assignWeek(b);
    return {block:b,week:w,reason:`This is a high-priority ${TM[b.type]?.label || b.type} task. Placing it in ${w === 5 ? 'Backlog' : `Week ${w}`} maintains the optimal sequence.`,impact:getDropImpact(b,w),metric:'Progresses overall strategy score'};
  }

  // Rule 7: anything left
  const next = library[0];
  if (next) {
    const w = assignWeek(next);
    return {block:next,week:w,reason:`Continue building out your strategy — ${TM[next.type]?.label || next.type} tasks belong in ${w === 5 ? 'Backlog' : `Week ${w}`}.`,impact:getDropImpact(next,w),metric:'Adds to strategy completeness'};
  }
  return null;
}

function suggestWeekForCustom(title: string, content: string, allBlocks: Block[]): {week:number;reason:string} {
  const lower = (title + ' ' + content).toLowerCase();
  if (/fix|bug|error|broken|crawl|index|speed|schema|sitemap|canonical|redirect/.test(lower)) return {week:1,reason:'Technical/fix tasks should be tackled first'};
  if (/write|blog|post|article|copy|page|landing|content|faq|pillar/.test(lower)) return {week:2,reason:'Content creation works best after technical foundation'};
  if (/perplexity|chatgpt|gpt|llm|geo|citation|generative/.test(lower)) return {week:2,reason:'GEO tasks pair well with content in Week 2'};
  if (/competitor|gap|outrank|rival|versus/.test(lower)) return {week:3,reason:'Competitive moves are most effective after foundation is solid'};
  if (/report|track|measure|kpi|metric|analytics/.test(lower)) return {week:5,reason:'Tracking and reporting belongs in the ongoing backlog'};
  const counts = [1,2,3,4,5].map(w => ({w,n:allBlocks.filter(b=>b.placed&&b.week===w).length}));
  const least  = counts.sort((a,b)=>a.n-b.n)[0];
  return {week:least.w,reason:`${least.w===5?'Backlog':`Week ${least.w}`} has the most space (${least.n} items)`};
}

/* ─── helpers ─── */
const uid     = () => Math.random().toString(36).slice(2,9);

// stableId: deterministic block ID derived from title.
// Using a stable ID means the same strategy card always gets the same ID
// across page reloads, so saved placement data (week, placed, status) is
// correctly restored via the placedMap lookup in loadProject.
// uid() is still used for user-created cards (they are stored verbatim in the DB).
const stableId = (title: string): string => {
  const norm = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
  // djb2 hash → base36 string, prefixed with 's' to distinguish from uid() values
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  return 's' + h.toString(36).padStart(7, '0');
};
const safeStr = (v: any) => typeof v==='string'?v:v==null?'':JSON.stringify(v);
const fmtDate = (r: string) => r?new Date(r).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';

function assignWeek(b: any): number {
  // Honour the week already set on the block (from strategy or weekly_plans)
  // Only use type-based routing as a fallback for blocks with no explicit week
  const explicit = b.week && typeof b.week === 'number' && b.week >= 1 && b.week <= 5;

  if (b.type === 'quick-win')   return 1;
  if (b.type === 'technical')   return b.urgency === 'immediate' || b.urgency === 'this_week' ? 1 : 2;
  if (b.type === 'content')     return Math.min(explicit ? b.week : 2, 4);
  if (b.type === 'geo')         return explicit ? b.week : 2;
  if (b.type === 'competitive') return explicit ? b.week : 3;
  if (b.type === 'insight')     return explicit ? b.week : 2;  // insights → early weeks, not Backlog
  if (b.type === 'weekly')      return explicit ? b.week : 1;  // weekly tasks → use strategy week
  if (b.type === 'kpi' || b.type === 'monthly') return 5;      // tracking/milestones → Backlog
  // custom or unknown: use explicit week if available, else Backlog
  return explicit ? b.week : 5;
}

/* ── Effort estimator: maps block type+priority to hours ── */
const EFFORT_HOURS: Record<string, Record<string, number>> = {
  'technical':   { high: 8,  medium: 4,  low: 2  },
  'quick-win':   { high: 3,  medium: 1.5,low: 0.5},
  'content':     { high: 10, medium: 6,  low: 3  },
  'geo':         { high: 5,  medium: 3,  low: 1.5},
  'competitive': { high: 6,  medium: 3,  low: 1.5},
  'insight':     { high: 2,  medium: 1,  low: 0.5},
  'weekly':      { high: 4,  medium: 2,  low: 1  },
  'monthly':     { high: 3,  medium: 1.5,low: 0.5},
  'kpi':         { high: 1,  medium: 0.5,low: 0.5},
  'custom':      { high: 4,  medium: 2,  low: 1  },
};

function estimateHours(block: Block): number {
  const base = EFFORT_HOURS[block.type]?.[block.priority] ?? 2;
  const mult = block.effort === 'high' ? 1.5 : block.effort === 'low' ? 0.6 : 1;
  return Math.round(base * mult * 10) / 10;
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h % 1 === 0) return `${h}h`;
  return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
}

function colTotalHours(colBlocks: Block[]): number {
  return Math.round(colBlocks.reduce((sum, b) => sum + estimateHours(b), 0) * 10) / 10;
}

function workloadLabel(hours: number): {label: string; color: string} {
  if (hours === 0)  return { label: 'Empty',     color: 'text-muted-foreground'  };
  if (hours <= 4)   return { label: 'Light',     color: 'text-green-400'         };
  if (hours <= 10)  return { label: 'Moderate',  color: 'text-blue-400'          };
  if (hours <= 18)  return { label: 'Heavy',     color: 'text-yellow-400'        };
  return              { label: 'Overloaded', color: 'text-red-400'           };
}

function seedBlocks(raw: any[]): Block[] {
  return raw.map(b => ({
    id:      b.id||uid(), type:(b.type||'custom') as BType,
    title:   b.title||'Untitled', content:safeStr(b.content),
    color:   b.color||'#94a3b8', priority:(b.priority||'medium') as Priority,
    status:  'todo' as Status, week:assignWeek(b), placed:false,
    effort:  b.effort, impact:b.impact, tags:b.tags||[], source:b.source||'',
  }));
}
/* ─── Safe fetch-JSON helper ──────────────────────────────────────
   Checks res.ok before parsing. If response is not JSON (Vercel 500
   plain text etc.), throws a clean Error instead of a parse crash.
────────────────────────────────────────────────────────────────── */
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    try { const e = JSON.parse(text); throw new Error(e.error || e.message || text.slice(0,200)); }
    catch (pe) { if (pe instanceof SyntaxError) throw new Error(text.slice(0,200)); throw pe; }
  }
  try { return JSON.parse(text); }
  catch { throw new Error(`Server returned invalid JSON: ${text.slice(0,120)}`); }
}

function buildLibraryFromStrategy(strategy: any): Block[] {
  const seen  = new Set<string>();
  const result: Block[] = [];

  const push = (b: Omit<Block,'id'|'status'|'placed'|'color'> & {type:BType}) => {
    // Normalize: lowercase, strip punctuation, collapse whitespace, first 40 chars
    const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim().slice(0,40);
    const key = normalize(b.title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push({
      ...b,
      id:     stableId(b.title),
      color:  TM[b.type]?.color || '#94a3b8',
      status: 'todo',
      placed: false,
    });
  };

  const safe = (v: any) => (v == null ? '' : String(v));
  const pri  = (v: any): Priority => v === 'high' ? 'high' : v === 'low' ? 'low' : 'medium';

  /* 1 — canvas_blocks (curated summary — highest signal)
     Filter: skip C-grade (assumption) or missing data_basis blocks */
  for (const b of strategy.canvas_blocks || []) {
    // Skip assumption-only blocks — they have no hard data behind them
    if (b.data_grade === 'C') continue;
    if (!b.data_basis || String(b.data_basis).toLowerCase().includes('assumption')) continue;
    push({
      type:     (b.type || 'custom') as BType,
      title:    safe(b.title).slice(0, 70),
      // Append data_basis so the card always shows what backs it
      content:  safe(b.content) + (b.data_basis ? `

Evidence: ${safe(b.data_basis)}` : ''),
      priority: pri(b.priority),
      // Use week set by AI (b.week), fall back to type-based routing only if not set
      week:     (b.week && b.week >= 1 && b.week <= 5) ? b.week : assignWeek(b),
      effort:   b.effort,
      impact:   b.impact,
      tags:     [...(b.tags || []), b.data_grade === 'A' ? '✓ hard-data' : '~ inferred'],
      source:   safe(b.source) || 'Strategy Analysis',
    });
  }

  /* 2 — quick_wins */
  for (const w of strategy.quick_wins || []) {
    push({
      type:     'quick-win',
      title:    safe(w.title).slice(0, 70),
      content:  [
        safe(w.description),
        w.timeframe  ? `Timeframe: ${w.timeframe}` : '',
        w.evidence   ? `Evidence: ${w.evidence}`   : '',
        w.category   ? `Category: ${w.category}`   : '',
      ].filter(Boolean).join('\\n\\n'),
      priority: w.impact === 'high' ? 'high' : w.impact === 'low' ? 'low' : 'medium',
      week:     1,
      effort:   w.effort,
      impact:   w.impact,
      tags:     [w.category, w.timeframe].filter(Boolean),
      source:   'Quick Wins',
    });
  }

  /* 3 — weekly plan tasks */
  for (const wk of strategy.weekly_plans || []) {
    const tasks: any[] = wk.tasks || [];
    for (let i = 0; i < tasks.length; i++) {
      const task    = tasks[i];
      const isStr   = typeof task === 'string';
      const title   = isStr ? task : safe(task.task);
      const detail  = isStr
        ? `Week ${wk.week} · ${safe(wk.theme)}

${title}

Expected: ${safe(wk.expected_outcome)}`
        : `Week ${wk.week} · ${safe(wk.theme)}

${safe(task.task)}

Type: ${safe(task.type)}  Effort: ~${task.effort_hours || '?'}h

Expected output: ${safe(task.expected_output)}`;
      push({
        type:     'weekly',
        title:    title.slice(0, 70),
        content:  detail,
        priority: isStr ? 'medium' : pri(task.priority),
        week:     wk.week || 1,
        tags:     [`week-${wk.week}`, safe(wk.theme).toLowerCase().replace(/\s+/g,'-')].filter(Boolean),
        source:   `Week ${wk.week} Plan`,
      });
    }
  }

  /* 4 — technical_priorities */
  for (const t of strategy.technical_priorities || []) {
    push({
      type:     'technical',
      title:    safe(t.issue).slice(0, 70) || 'Technical Fix',
      content:  [
        `Issue: ${safe(t.issue)}`,
        `Fix: ${safe(t.fix)}`,
        `Impact: ${safe(t.impact)}`,
        `Urgency: ${safe(t.urgency)}`,
        t.source ? `Source: ${safe(t.source)}` : '',
      ].filter(Boolean).join('\\n\\n'),
      priority: t.urgency === 'immediate' ? 'high' : t.urgency === 'this_week' ? 'high' : t.urgency === 'this_month' ? 'medium' : 'low',
      week:     t.urgency === 'immediate' || t.urgency === 'this_week' ? 1 : 2,
      effort:   t.effort,
      tags:     ['technical', safe(t.urgency)].filter(Boolean),
      source:   'Technical Audit',
    });
  }

  /* 5 — content_calendar */
  for (const c of strategy.content_calendar || []) {
    push({
      type:     'content',
      title:    safe(c.title).slice(0, 70) || 'Content Piece',
      content:  [
        `Type: ${safe(c.type)}`,
        `Target keyword: "${safe(c.target_keyword)}"`,
        `Intent: ${safe(c.search_intent)}`,
        safe(c.rationale) ? `
Rationale: ${safe(c.rationale)}` : '',
        c.geo_angle   ? `GEO angle: ${safe(c.geo_angle)}`          : '',
        c.word_count  ? `Word count: ~${c.word_count}w`           : '',
        c.internal_links?.length ? `Link to: ${c.internal_links.join(', ')}` : '',
      ].filter(Boolean).join('\\n'),
      priority: 'medium',
      week:     Math.min(c.suggested_week || 2, 4),
      tags:     [safe(c.type), safe(c.target_keyword), `week-${c.suggested_week}`].filter(Boolean),
      source:   'Content Calendar',
    });
  }

  /* 6 — geo_strategy */
  for (const g of strategy.geo_strategy || []) {
    push({
      type:     'geo',
      title:    `${safe(g.platform)}: ${safe(g.action).slice(0, 45)}`,
      content:  [
        `Platform: ${safe(g.platform)}`,
        `Current status: ${safe(g.current_status || g.status)}`,
        `Gap: ${safe(g.gap || '')}`,
        `
Action: ${safe(g.action)}`,
        `Content format: ${safe(g.content_format || '')}`,
        `
Expected impact: ${safe(g.expected_impact)}`,
        `Timeframe: ${safe(g.timeframe)}`,
      ].filter(s => s.replace(/^[A-Za-z ]+:\s*$/,'')).join('\\n'),
      priority: g.current_status?.toLowerCase().includes('not') ? 'high' : 'medium',
      week:     2,
      tags:     [safe(g.platform).toLowerCase().replace(/\s+/g,'-'), 'geo'].filter(Boolean),
      source:   'GEO Strategy',
    });
  }

  /* 7 — competitive_intelligence */
  for (const c of strategy.competitive_intelligence || []) {
    push({
      type:     'competitive',
      title:    `Outrank ${safe(c.competitor || 'competitor').slice(0, 40)}`,
      content:  [
        `Competitor: ${safe(c.competitor)}`,
        `Their strength: ${safe(c.their_strength || c.gap)}`,
        `
Your opportunity: ${safe(c.your_opportunity || c.opportunity)}`,
        `
Strategy: ${safe(c.strategy)}`,
        c.timeframe ? `Timeframe: ${safe(c.timeframe)}` : '',
      ].filter(Boolean).join('\\n'),
      priority: 'medium',
      week:     3,
      tags:     [safe(c.competitor), 'competitive'].filter(Boolean),
      source:   'Competitive Intelligence',
    });
  }

  /* 8 — strategic_insights */
  for (const ins of strategy.strategic_insights || []) {
    push({
      type:     'insight',
      title:    safe(ins.title).slice(0, 70) || 'Strategic Insight',
      content:  [
        `Category: ${safe(ins.category)}`,
        `
${safe(ins.detail)}`,
        ins.action ? `
Action: ${safe(ins.action)}` : '',
      ].filter(Boolean).join('\\n'),
      priority: pri(ins.priority),
      week:     5,
      tags:     [safe(ins.category), 'insight'].filter(Boolean),
      source:   'Strategic Insights',
    });
  }

  /* 9 — kpi_forecast */
  for (const k of strategy.kpi_forecast || []) {
    push({
      type:     'kpi',
      title:    `Track: ${safe(k.metric)}`,
      content:  [
        `Metric: ${safe(k.metric)}`,
        `Current: ${safe(k.now ?? k.current)}`,
        `30 days: ${safe(k.d30 ?? k.target_30d)}`,
        `60 days: ${safe(k.d60 ?? k.target_60d)}`,
        `90 days: ${safe(k.d90 ?? k.target_90d)}`,
        k.basis              ? `
Basis: ${safe(k.basis)}`               : '',
        k.leading_indicator  ? `Leading indicator: ${safe(k.leading_indicator)}` : '',
      ].filter(Boolean).join('\\n'),
      priority: 'low',
      week:     5,
      tags:     ['kpi', 'tracking'],
      source:   'KPI Forecast',
    });
  }

  /* 10 — retainer milestones */
  for (const ms of strategy.retainer_value_summary?.key_milestones || []) {
    push({
      type:     'monthly',
      title:    safe(ms).slice(0, 70),
      content:  `Milestone: ${safe(ms)}

Projection: ${safe(strategy.retainer_value_summary?.projection || strategy.retainer_value_summary?.score_gain_projection)}

Ranking win: ${safe(strategy.retainer_value_summary?.ranking_win || strategy.retainer_value_summary?.ranking_improvements)}`,
      priority: 'medium',
      week:     5,
      tags:     ['milestone', 'monthly'],
      source:   'Retainer Value Summary',
    });
  }

  return result;
}


/* ─── sub-components ─── */
function ChatMd({text}:{text:string}) {
  return (
    <div className="text-sm leading-relaxed text-foreground/85">
      {text.split('\n').map((line,i) => {
        if (line.startsWith('## ')) return <div key={i} className="font-semibold text-sm mt-3 mb-1 text-primary">{line.slice(3)}</div>;
        if (/^[-*]\s/.test(line))   return <div key={i} className="flex gap-2 my-0.5"><span className="text-primary shrink-0">•</span><span dangerouslySetInnerHTML={{__html:line.slice(2).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}} /></div>;
        if (!line.trim())           return <div key={i} className="h-2" />;
        return <p key={i} className="my-0.5" dangerouslySetInnerHTML={{__html:line.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}} />;
      })}
    </div>
  );
}

function Section({title,icon:Icon,color,children,defaultOpen=false}:{title:string;icon:any;color:string;children:React.ReactNode;defaultOpen?:boolean}) {
  const [open,setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-secondary/20 transition-colors">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{background:`${color}18`,border:`1px solid ${color}28`}}><Icon size={14} style={{color}} /></div>
        <span className="font-semibold text-sm flex-1">{title}</span>
        {open?<ChevronUp size={14} className="text-muted-foreground"/>:<ChevronDown size={14} className="text-muted-foreground"/>}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/50">{children}</div>}
    </div>
  );
}

/* ─── AgendaMarkdown — renders the streamed agenda text ─── */
function AgendaMarkdown({ text }: { text: string }) {
  return (
    <div className="text-xs leading-relaxed space-y-1">
      {text.split('\n').map((line, i) => {

        if (line.startsWith('## '))
          return <div key={i} className="font-bold text-sm text-foreground mt-3 mb-1 pb-1 border-b border-border/40">{line.slice(3)}</div>;
        if (line.startsWith('### '))
          return <div key={i} className="font-semibold text-xs text-primary mt-2 mb-0.5">{line.slice(4)}</div>;
        if (line.startsWith('#### '))
          return <div key={i} className="font-semibold text-xs text-muted-foreground mt-1.5">{line.slice(5)}</div>;
        if (line.startsWith('**') && line.endsWith('**') && !line.slice(2,-2).includes('**'))
          return <div key={i} className="font-semibold text-xs text-foreground mt-1">{line.slice(2,-2)}</div>;
        if (/^\*\*(.+?)\*\*:/.test(line)) {
          const [, label, rest] = line.match(/^\*\*(.+?)\*\*:(.*)$/) || [];
          if (label) return <div key={i} className="flex gap-1 my-0.5"><span className="font-semibold text-foreground shrink-0">{label}:</span><span className="text-muted-foreground" dangerouslySetInnerHTML={{__html: (rest||'').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}}/></div>;
        }
        if (line.startsWith('- ') || line.startsWith('* '))
          return <div key={i} className="flex gap-1.5 my-0.5 ml-1"><span className="text-primary shrink-0 mt-0.5">•</span><span className="text-muted-foreground" dangerouslySetInnerHTML={{__html: line.slice(2).replace(/\*\*(.+?)\*\*/g,'<strong class=\"text-foreground\">$1</strong>')}}/></div>;
        if (line.startsWith('| ') && line.includes(' | ')) {
          const cols = line.split('|').map(c => c.trim()).filter(Boolean);
          const isHeader = i < text.split('\n').length - 1 && text.split('\n')[i+1]?.match(/^\|[-| ]+\|/);


          if (line.match(/^\|[-| ]+\|/)) return null; // separator row
          return (
            <div key={i} className={`flex gap-0 text-xs border-b border-border/30 ${isHeader ? 'font-semibold bg-secondary/30' : ''}`}>
              {cols.map((col, ci) => (
                <div key={ci} className="px-2 py-1 flex-1 min-w-0" dangerouslySetInnerHTML={{__html: col.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}}/>
              ))}
            </div>
          );
        }
        if (line.startsWith('---')) return <hr key={i} className="border-border/30 my-2"/>;
        if (!line.trim()) return <div key={i} className="h-1"/>;
        if (line.startsWith('# '))
          return <div key={i} className="font-bold text-sm text-gradient-primary mt-2">{line.slice(2)}</div>;
        return <p key={i} className="text-muted-foreground my-0.5" dangerouslySetInnerHTML={{__html: line.replace(/\*\*(.+?)\*\*/g,'<strong class=\"text-foreground\">$1</strong>')}}/>;
      })}
    </div>
  );
}



/* ════════════════════════════════════════════════════
   AI Capability Registry
   Exact declaration of what Claude does, its confidence,
   time breakdown, and how to verify it.
════════════════════════════════════════════════════ */
interface AICap {
  confidence:        number;   // 0-100 — only claim what Claude can guarantee
  confidence_reason: string;
  time_human:        number;   // minutes without AI
  time_ai:           number;   // minutes with AI (Claude's work time)
  time_breakdown:    string[]; // what those AI minutes include
  produces:          string[]; // exactly what Claude outputs — copy-paste ready
  cannot_do:         string[]; // honest limits — human must handle these
  needs_from_you:    string[]; // required inputs before Claude can start
  verify_steps: { step: string; tool: string; pass: string }[]; // exact verification
}

const AI_CAPABILITIES: Record<string, AICap> = {
  technical: {
    confidence: 95,
    confidence_reason: "Code and configuration have right/wrong answers. Manav Brain generates exact, testable output — redirects, schema, robots.txt — that can be validated in a browser or validator tool before deployment.",
    time_human: 240,
    time_ai: 20,
    time_breakdown: [
      "5 min — Manav Brain reads the live page and identifies the exact issue",
      "10 min — Manav Brain generates complete, copy-paste ready code/config",
      "5 min — Manav Brain writes step-by-step deployment instructions + rollback plan",
    ],
    produces: [
      "Exact .htaccess / nginx rules OR CMS settings changes — copy-paste ready",
      "Schema markup JSON-LD — validated syntax, ready to paste into <head>",
      "Step-by-step deployment instructions numbered 1 to N",
      "Test commands to run after deployment",
      "Rollback plan if something breaks",
    ],
    cannot_do: [
      "Push the changes live — that needs your login, which you should keep to yourself",
      "Log into your CMS — you'll need to apply the changes yourself once I hand them over",
      "Tell Google when to re-crawl — we can request it in GSC but I can't control the timeline",
    ],
    needs_from_you: [
      "The specific URLs where this is happening — paste 1-5 and I'll look at each one",
      "What you're seeing right now — the exact error, wrong status code, or broken behaviour",
      "Your CMS — WordPress, Shopify, Webflow? (I'll check your Data Room, but worth confirming)",
    ],
    verify_steps: [
      { step: "Open each affected URL in browser", tool: "Browser DevTools → Network tab", pass: "Status code matches expected (200/301/etc.)" },
      { step: "Paste the schema into the validator — just to be sure", tool: "validator.schema.org — free, 30 seconds", pass: "Zero errors. If there's a warning, flag it to me." },
      { step: "Check GSC Coverage 5 days later — let Google catch up first", tool: "Google Search Console → Coverage report", pass: "Pages are showing as Indexed with no new errors. If you see new errors, send them to me." },
      { step: "Quick Screaming Frog crawl on the affected URLs", tool: "Screaming Frog → paste URLs → start", pass: "All correct status codes, no redirect chains. Chains are a red flag." },
    ],
  },
  content: {
    confidence: 80,
    confidence_reason: "Manav Brain produces a complete, well-structured draft with correct keyword placement. Confidence is 80 not 100 because brand-specific facts, client stories, and proprietary data must come from you. The draft is ready to edit, not ready to publish without review.",
    time_human: 480,
    time_ai: 15,
    time_breakdown: [
      "3 min — Claude analyses search intent and top-ranking pages for target keyword",
      "8 min — Manav Brain writes the full draft including H1-H3 structure",
      "4 min — Manav Brain writes meta title, meta description, schema markup, internal link map",
    ],
    produces: [
      "Full content draft (exact word count you specify)",
      "H1, H2, H3 heading structure with keyword placement noted",
      "Meta title (under 60 chars) and meta description (under 160 chars)",
      "Article Schema or FAQPage Schema markup — ready to paste",
      "Internal link suggestions with anchor text and target URLs",
      "Readability notes (sentences to simplify, passive voice to fix)",
    ],
    cannot_do: [
      "Find original statistics — if you have internal data, share it and I'll weave it in. Otherwise I use publicly known figures",
      "Source images — that's your creative team's job",
      "Match your client's exact voice without an example — just give me one paragraph of their writing and I'll follow it",
      "Know what your client has already published — paste the URL and I'll read it before I start",
      "Conduct original research or create new data — I work with what exists",
    ],
    needs_from_you: [
      "The main keyword you're targeting, plus 3-5 related ones you'd like to rank for",
      "What the reader actually wants — are they looking to learn, compare, or buy?",
      "Target word count",
      "One example of how this brand writes — a URL or a paragraph is enough. This is the most important input.",
    ],
    verify_steps: [
      { step: "Check every number and claim — this is the most important step", tool: "Google each stat individually, find the original source", pass: "Every figure traces back to a real source. If one doesn't, remove it or replace it." },
      { step: "Preview how it looks in Google", tool: "seomofo.com SERP Simulator — free", pass: "Title shows fully, not cut off. Looks good in the preview." },
      { step: "Click every internal link I've suggested", tool: "Browser — just click each one", pass: "They all load. No 404s. Even one broken link is too many." },
      { step: "Read it aloud — this is the best test", tool: "Your voice. Seriously.", pass: "It flows naturally. If you stumble on a sentence, I've forced the keyword. Tell me and I'll rewrite it." },
      { step: "Validate schema markup", tool: "validator.schema.org", pass: "Zero errors, zero warnings" },
    ],
  },
  geo: {
    confidence: 70,
    confidence_reason: "Manav Brain restructures existing content for AI citation using proven entity and FAQ patterns. Confidence is 70 because AI platform citation cannot be guaranteed — Perplexity and ChatGPT citation depends on many factors beyond content structure. Claude guarantees the structural changes; citation outcome must be measured after.",
    time_human: 180,
    time_ai: 12,
    time_breakdown: [
      "4 min — Manav Brain reads existing page content",
      "5 min — Claude rewrites sections with entity-rich language and citation-ready summaries",
      "3 min — Manav Brain generates FAQ schema and structured summary block",
    ],
    produces: [
      "Rewritten introduction paragraph — direct answer format for AI extraction",
      "FAQ section (5-8 questions) with concise answers — FAQPage schema included",
      "Entity-rich summary block (150-200 words) optimised for AI citation",
      "FAQPage JSON-LD schema markup",
      "List of entities and their correct descriptions to include on the page",
    ],
    cannot_do: [
      "Promise you'll get cited — I wish I could, but citation depends on too many moving parts",
      "Check Perplexity in real-time — you'll need to open it yourself and search the query",
      "Replace sections that need your proprietary knowledge — I'll write around them and flag exactly where your input goes",
    ],
    needs_from_you: [
      "Current page URL (Manav Brain will fetch and read it)",
      "The exact question someone would type into Perplexity or ChatGPT that you want to show up for",
      "Which platform matters most to you right now — Perplexity, ChatGPT, or Google AI Overview?",
    ],
    verify_steps: [
      { step: "Search the query in Perplexity right now — before you publish", tool: "perplexity.ai", pass: "Screenshot what it shows today. We'll compare after to see the movement." },
      { step: "Validate FAQPage schema", tool: "validator.schema.org", pass: "Zero errors" },
      { step: "Check Perplexity again 7 days later", tool: "perplexity.ai — same query", pass: "Your site is cited. If not, come back to me and we'll look at what to adjust." },
      { step: "Search in Google — check if there's an AI Overview", tool: "Google.com in incognito tab", pass: "Your page is mentioned or linked. This can take a few weeks — be patient with this one." },
    ],
  },
  "quick-win": {
    confidence: 90,
    confidence_reason: "Meta titles, descriptions, and heading tags are precise, verifiable outputs. Manav Brain generates specific before/after for each URL — you can check each change in a browser within minutes of deployment.",
    time_human: 60,
    time_ai: 5,
    time_breakdown: [
      "2 min — Manav Brain fetches and reads each URL",
      "3 min — Manav Brain generates specific before/after for every element",
    ],
    produces: [
      "Meta title — before and after for each URL (under 60 chars)",
      "Meta description — before and after for each URL (under 160 chars)",
      "H1 rewrite if needed",
      "Image alt text rewrites if applicable",
      "Implementation instructions per CMS type",
    ],
    cannot_do: [
      "Apply the changes in your CMS — I'll give you exact instructions so it takes about 2 minutes",
      "Guarantee a CTR lift — but we'll measure it together 7 days after and adjust if needed",
    ],
    needs_from_you: [
      "Target URLs (paste 1-10)",
      "Target keyword or goal for each page",
    ],
    verify_steps: [
      { step: "Check the title tag is live", tool: "Browser → View Source (Ctrl+U) → search for <title>", pass: "Under 60 chars, matches what I gave you" },
      { step: "Check meta description length", tool: "Browser → View Source (Ctrl+U)", pass: "Description under 160 chars" },
      { step: "Check GSC 7 days later — we'll see the CTR movement", tool: "GSC → Performance → Pages filter → compare dates", pass: "CTR is holding or improving. Even a 0.5% lift on high-traffic pages adds up." },
      { step: "Validate page in SERP preview", tool: "seomofo.com SERP Simulator", pass: "Title and description display correctly, not truncated" },
    ],
  },
  competitive: {
    confidence: 65,
    confidence_reason: "This one depends on what data you can share with me. If you drop in a Semrush or Ahrefs export, I'm at 85% — I can do real analysis. Without it, I'm fetching competitor pages live and working from what I can see, which gives us 65%. I won't make up ranking numbers — I'd rather tell you what I don't know.",
    time_human: 300,
    time_ai: 20,
    time_breakdown: [
      "5 min — Manav Brain fetches and reads competitor pages",
      "10 min — Claude maps content gaps and keyword opportunities",
      "5 min — Manav Brain writes specific action plan with prioritised content to create",
    ],
    produces: [
      "Gap analysis table: topics competitor ranks for that you do not",
      "Content brief for the highest-opportunity gap page",
      "Keyword targeting list with priority order",
      "Specific pages on your site to improve to compete",
      "Estimated difficulty and time per opportunity",
    ],
    cannot_do: [
      "See Semrush/Ahrefs data without an export — if you can share it, the quality goes up significantly",
      "Promise ranking changes — but I'll give you the best possible shot based on what I see",
      "Build backlinks — that's relationship work that needs a human",
    ],
    needs_from_you: [
      "The competitor domain(s) you want to beat — I'll read their pages",
      "The keywords where you want to outrank them",
      "A Semrush or Ahrefs export if you have one — completely optional, but it makes a real difference",
    ],
    verify_steps: [
      { step: "Cross-check gap keywords in Semrush/Ahrefs", tool: "Semrush → Keyword Gap tool", pass: "Suggested keywords confirmed as opportunities" },
      { step: "Manually search top 3 gap keywords", tool: "Google.com incognito", pass: "Competitor appears on page 1, your site does not yet" },
      { step: "Check 30 days after content creation", tool: "GSC → Performance → Queries", pass: "New impressions for target keywords" },
    ],
  },
  weekly: {
    confidence: 75,
    confidence_reason: "Manav Brain generates specific execution briefs and templates. Confidence varies by task. Writing and analysis tasks: 85%. Technical deployment: 50% (requires human to deploy). Creative decisions: 60% (requires client input).",
    time_human: 120,
    time_ai: 10,
    time_breakdown: [
      "3 min — Manav Brain reads task context and project data",
      "7 min — Manav Brain writes complete brief with step-by-step instructions",
    ],
    produces: [
      "Step-by-step execution instructions (numbered)",
      "Required tools and where to find each setting",
      "Expected output/deliverable specification",
      "Time estimate per step",
      "Definition of done — exactly what to check",
    ],
    cannot_do: [
      "Do the actual clicking inside your CMS — I'll prepare everything, you execute",
      "Make final creative calls that need client sign-off — I'll give you options",
    ],
    needs_from_you: [
      "A bit more context about this one — what exactly needs to happen?",
    ],
    verify_steps: [
      { step: "Review deliverable against the brief", tool: "Compare output to step-by-step instructions", pass: "Every step is complete, output matches specification" },
    ],
  },
};

function getAICap(blockType: string): AICap {
  return AI_CAPABILITIES[blockType] || AI_CAPABILITIES.weekly;
}



/* ════════════════════════════════════════════════════
   AddRequirementInline — inline requirement entry
════════════════════════════════════════════════════ */
function AddRequirementInline({ cardId, cardTitle, onSave }: {
  cardId:    string;
  cardTitle: string;
  onSave:    (cardId:string, cardTitle:string, req:string, cat:string) => Promise<void>;
}) {
  const [text,     setText]     = useState('');
  const [category, setCategory] = useState('general');
  const [saving,   setSaving]   = useState(false);

  const REQ_CATS = [
    { value:'general',   label:'General' },
    { value:'data',      label:'Data / metric' },
    { value:'access',    label:'Access / login' },
    { value:'content',   label:'Content / copy' },
    { value:'technical', label:'Technical' },
  ];

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    await onSave(cardId, cardTitle, text, category);
    setText('');
    setSaving(false);
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground/60 font-medium">Add what's needed:</div>
      <div className="flex gap-2">
        <select
          value={category}
          onChange={e=>setCategory(e.target.value)}
          className="h-8 text-xs px-2 rounded-lg border border-border bg-background/60 outline-none shrink-0"
        >
          {REQ_CATS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input
          value={text}
          onChange={e=>setText(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&submit()}
          placeholder="e.g. GSC export for target keyword, login to CMS…"
          className="flex-1 h-8 text-xs px-3 rounded-lg border border-border bg-background/60 outline-none focus:border-primary/50 min-w-0"
        />
        <button
          onClick={submit}
          disabled={saving||!text.trim()}
          className="h-8 px-3 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/25 disabled:opacity-40 shrink-0 flex items-center gap-1"
        >
          {saving ? <RefreshCw size={10} className="animate-spin"/> : <Plus size={10}/>}
          {saving ? '' : 'Save'}
        </button>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════
   AI Executor roles + client input definitions
════════════════════════════════════════════════════ */
interface ExecVersion {
  id:             string;
  role:           string;
  userInputs:     Record<string, string>;
  output:         string;
  criteriaLabel:  string;
  evaluation:     any;
  createdAt:      string;
}

const EXEC_ROLES = [
  { id: 'senior_seo',      label: 'Senior SEO Strategist',  focus: 'Technical depth, algorithm reasoning, ranking factors, E-E-A-T, GEO strategy',             output: 'Detailed SEO rationale with specific ranking signals', best_for: 'Technical tasks, content strategy, audit analysis, competitive intelligence' },
  { id: 'content_writer',  label: 'Content Writer',          focus: 'What to write, structure, keywords, tone, internal links, GEO readiness',                   output: "Writer-ready brief with exact headings, keywords, tone guidance", best_for: 'Content tasks, GEO optimisation, on-page quick wins' },
  { id: 'team_lead',       label: 'Team Lead',               focus: 'What needs doing, who owns it, blockers, dependencies, definition of done',                  output: 'Clear execution instructions with numbered steps and done criteria', best_for: 'Weekly tasks, pipeline planning, task delegation' },
  { id: 'project_manager', label: 'Project Manager',         focus: 'Deliverable spec, acceptance criteria, timeline, dependencies, risk',                        output: 'Formal work order with milestones, acceptance criteria, and risk register', best_for: 'Complex multi-step tasks, sprint planning, client deliverables' },
  { id: 'executive',       label: 'Executive',               focus: 'Business outcomes, ROI, competitive position, what to decide',                               output: "Plain English business summary — 3 things to know, 1 decision to make", best_for: 'Strategic insights, KPI forecasting, competitive analysis' },
  { id: 'biz_dev',         label: 'Biz Dev Manager',         focus: 'Client value, proof points, upsell angles, objection handling, renewal talking points',       output: 'Client-ready narrative with results framing and commercial context', best_for: 'Monthly reports, insight tasks, competitive positioning' },
];

const CLIENT_INPUTS_BASE: Record<string, { key: string; label: string; why: string; placeholder: string }[]> = {
  technical:   [{ key:"affected_urls",    label:"Which URLs are affected?",                   why:"I need the exact paths to generate the correct fix",              placeholder:"e.g. /old-page, /broken-redirect" },{ key:"current_behavior", label:"What is currently happening?",          why:"The error type tells me which fix to take",              placeholder:"e.g. 404 on /old-page, redirect loop" }],
  content:     [{ key:"target_keyword",   label:"Primary keyword + 3-5 related",              why:"Everything I write is built around these",                       placeholder:"e.g. mobile forms app, online form builder" },{ key:"search_intent",      label:"What is the reader trying to do?",      why:"Informational, commercial, or transactional each need different structure", placeholder:"e.g. compare options (commercial)" },{ key:"word_count_target",  label:"Target word count",                     why:"This determines how deep I go",                                  placeholder:"e.g. 1200 words" },{ key:"brand_voice_example",label:"One example of how this brand writes",  why:"Without this my output will be generic",                         placeholder:"Paste a URL or a paragraph" }],
  geo:         [{ key:"target_query",     label:"Exact query to appear for in AI search",     why:"GEO strategy is completely query-specific",                      placeholder:"e.g. best mobile form app for small business" },{ key:"ai_platform",        label:"Which platform matters most?",          why:"Perplexity, ChatGPT, and Google AI Overview cite differently",   placeholder:"e.g. Perplexity, ChatGPT, Google AI Overview" }],
  "quick-win": [{ key:"target_urls",      label:"URLs to optimise — paste 1 to 10",           why:"I will fetch each and generate specific before/after",            placeholder:"https://yourdomain.com/page-1" },{ key:"target_metric",     label:"What metric are we trying to move?",    why:"CTR, rankings, and impressions each need different approaches",  placeholder:"e.g. click-through rate, average position" }],
  competitive: [{ key:"competitor_url",   label:"Competitor domain to analyse",               why:"I will fetch their pages to find the exact gaps",                placeholder:"e.g. competitor.com" },{ key:"target_keywords",    label:"Keywords you want to outrank them on",  why:"Without a focus the analysis is too broad to act on",            placeholder:"e.g. mobile form builder, online form app" }],
  insight:     [{ key:"specific_question",label:"What do you want me to analyse?",            why:"A focused question gives a useful answer",                       placeholder:"e.g. Why are we losing rankings for X?" }],
  weekly:      [{ key:"task_context",     label:"More context about what needs doing",        why:"Weekly tasks vary — context determines the right approach",       placeholder:"Describe what specifically needs to happen" }],
};

const CLIENT_INPUTS_ROLE_EXTRA: Record<string, Record<string, { key: string; label: string; why: string; placeholder: string }[]>> = {
  content: { senior_seo:[{ key:"competing_pages", label:"Top 3 competing pages to beat", why:"I will structure content to out-depth them", placeholder:"e.g. competitor.com/blog/mobile-forms" }], content_writer:[{ key:"key_points", label:"Key points or angles to include", why:"Tells me what to communicate", placeholder:"e.g. emphasise ease of use" }], executive:[{ key:"business_goal", label:"What business goal does this content serve?", why:"I frame everything around the commercial outcome", placeholder:"e.g. generate trial signups" }], team_lead:[{ key:"assigned_writer", label:"Who is writing this?", why:"I tailor the brief to their skill level", placeholder:"e.g. in-house writer, freelancer" }], biz_dev:[{ key:"client_differentiators", label:"What makes the client stand out?", why:"I weave this in as proof points", placeholder:"e.g. fastest setup, used by 10k businesses" }], project_manager:[{ key:"deadline", label:"When does this need to be published?", why:"I will flag if the brief is too large for the timeline", placeholder:"e.g. end of this week" }] },
  technical: { senior_seo:[{ key:"expected_fix_type", label:"What kind of fix do you expect?", why:"Redirect, schema, robots.txt each need different code", placeholder:"e.g. 301 redirect, fix schema markup" }], team_lead:[{ key:"who_deploys", label:"Who will apply the changes?", why:"I write deployment instructions at the right technical level", placeholder:"e.g. developer, I do it myself via CMS" }] },
  competitive: { senior_seo:[{ key:"ranking_data", label:"Semrush or Ahrefs export — optional", why:"Without data I work from live page fetches only", placeholder:"Paste top rows from a keyword gap export" }], executive:[{ key:"business_context", label:"Why does beating this competitor matter now?", why:"I frame the analysis around the business case", placeholder:"e.g. they are winning deals we should be closing" }] },
  geo: { senior_seo:[{ key:"current_url", label:"Page URL to optimise for GEO", why:"I fetch and read the current page before rewriting", placeholder:"e.g. https://yourdomain.com/page" }] },
  insight: { senior_seo:[{ key:"data_to_reference", label:"Specific data you want me to analyse", why:"Point me at the right audit, report, or metric", placeholder:"e.g. the March GSC export" }], executive:[{ key:"decision_context", label:"What decision does this analysis inform?", why:"I focus the output on evidence for that specific decision", placeholder:"e.g. whether to invest in content vs technical SEO" }] },
};

function getClientInputs(blockType: string, role: string) {
  const base  = CLIENT_INPUTS_BASE[blockType]  || CLIENT_INPUTS_BASE.weekly;
  const extra = (CLIENT_INPUTS_ROLE_EXTRA[blockType] || {})[role] || [];
  return [...base, ...extra];
}

function getManavSuggestions(blockType: string, role: string, ctx: any): { key: string; hint: string }[] {
  if (!ctx) return [];
  const hints: { key: string; hint: string }[] = [];
  const kw   = ctx.goals?.keywords || (ctx.project?.keywords || [])[0] || "";
  const cms  = ctx.tech?.cms || "";
  const url  = ctx.project?.url || "";
  const goal = ctx.goals?.primary || "";
  const comp = ctx.competitors?.c1 || "";
  const organic = ctx.analytics?.organicMonthly;
  if (blockType === "content") {
    if (kw)      hints.push({ key:"target_keyword",      hint:`Your primary keyword is "${kw}" from your Data Room — pre-filled.` });
    if (goal)    hints.push({ key:"search_intent",       hint:`Your goal is "${goal}" — ${goal.toLowerCase().includes("sign")||goal.toLowerCase().includes("trial")?"commercial or transactional":"informational"} intent likely.` });
    if (organic) hints.push({ key:"word_count_target",   hint:`With ${organic} monthly organic sessions, a 1,500-2,000 word piece will compete well.` });
  }
  if (blockType === "technical") {
    if (cms) hints.push({ key:"current_behavior", hint:`You are on ${cms} — I know exactly which settings panel to reference.` });
    if (url) hints.push({ key:"affected_urls",    hint:`I can fetch live pages from ${url} if you paste the paths.` });
  }
  if (blockType === "competitive") {
    if (comp) hints.push({ key:"competitor_url",  hint:`Your Data Room lists "${comp}" as your main competitor — pre-filled.` });
    if (kw)   hints.push({ key:"target_keywords", hint:`Your target keywords from Data Room are "${kw}" — good starting point.` });
  }
  if (blockType === "geo" && url) hints.push({ key:"current_url", hint:`I will fetch ${url} before rewriting — paste the specific page path.` });
  return hints;
}

/* ════════════════════════════════════════════════════
   InlineTaskExecutor
════════════════════════════════════════════════════ */
function InlineTaskExecutor({ block, projectId, siteUrl, projectSummary, onClose, onVerify }: {
  block:          { id:string; type:string; title:string; content:string; priority:string; impact?:string };
  projectId:      string;
  siteUrl:        string;
  projectSummary: string;
  onClose:        ()=>void;
  onVerify:       (block:any)=>void;
}) {
  const [phase,        setPhase]        = useState<'loading'|'inputs'|'executing'|'done'>('loading');
  const [role,         setRole]         = useState('senior_seo');
  const [userInputs,   setUserInputs]   = useState<Record<string,string>>({});
  const [autoFilled,   setAutoFilled]   = useState<Record<string,string>>({}); // pre-filled from Data Room
  const [dataGaps,     setDataGaps]     = useState<string[]>([]);
  const [context,      setContext]      = useState<any>(null);
  const [output,       setOutput]       = useState('');
  const [copied,       setCopied]       = useState(false);
  const [evaluation,   setEvaluation]   = useState<any>(null);
  const [evaluating,   setEvaluating]   = useState(false);
  const [versions,     setVersions]     = useState<ExecVersion[]>([]);
  const [activeVersion,setActiveVersion]= useState<string|null>(null);
  const [showHistory,  setShowHistory]  = useState(false);
  const [redoFrom,     setRedoFrom]     = useState<ExecVersion|null>(null);
  // Brain learning state
  const [learningSaved,   setLearningSaved]   = useState(false);
  const [savingLearning,  setSavingLearning]  = useState(false);
  const [brainLearnings,  setBrainLearnings]  = useState<any[]>([]);

  // Derived values — declared AFTER state so they can reference state variables
  const cap           = getAICap(block.type);
  const clientInputs  = React.useMemo(() => getClientInputs(block.type, role), [block.type, role]);
  const suggestions   = React.useMemo(() => getManavSuggestions(block.type, role, context), [block.type, role, context]);

  useEffect(() => {
    loadContext();
    loadVersionHistory();
  }, []);

  /* Load project context to pre-fill what we can */
  const loadContext = async () => {
    setPhase('loading');
    try {
      const res  = await fetch('/api/control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_context', projectId }),
      });
      const data = await safeJson(res);
      const ctx  = data.context || {};
      setContext(ctx);

      // Pre-fill whatever we can from Data Room
      const prefilled: Record<string,string> = {};
      const kw = ctx.goals?.keywords || (ctx.project?.keywords||[])[0] || '';
      if (kw) prefilled.target_keyword    = kw;
      if (ctx.competitors?.c1) prefilled.competitor_url = ctx.competitors.c1;
      if (ctx.project?.url)    prefilled.target_urls    = ctx.project.url;
      setAutoFilled(prefilled);

      const gaps: string[] = [];
      if (ctx.gaps?.noGoal)      gaps.push("No campaign goal set — strategy direction is unclear");
      if (ctx.gaps?.noCMS)       gaps.push("CMS not recorded — technical output will be generic");
      if (ctx.gaps?.noAnalytics) gaps.push("No analytics baseline — cannot forecast impact");
      if (ctx.gaps?.noDocuments) gaps.push("No tool exports uploaded — working from estimates only");
      setDataGaps(gaps);
    } catch {
      /* continue without context — questions still show */
    }

    // Fetch relevant brain learnings for this card type
    try {
      const lr = await fetch('/api/task-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_relevant', project_id: projectId, card_type: block.type, limit: 8 }),
      });
      const ld = await lr.json().catch(() => ({ learnings: [] }));
      setBrainLearnings(ld.learnings || []);
    } catch { /* non-blocking */ }

    setPhase('inputs');
  };

  /* Load version history */
  const loadVersionHistory = async () => {
    try {
      const { data } = await supabase
        .from('task_executions')
        .select('*')
        .eq('project_id', projectId)
        .eq('card_id', block.id)
        .order('created_at', { ascending: false })
        .limit(3);
      if (data) setVersions(data.map((d: any) => ({
        id:            d.id,
        role:          d.role,
        userInputs:    d.user_inputs || {},
        output:        d.output || '',
        criteriaLabel: d.criteria_label || '',
        evaluation:    d.manav_evaluation || {},
        createdAt:     d.created_at,
      })));
    } catch { /* table may not exist yet */ }
  };

  /* Merge auto-filled + user typed */
  const getMergedInputs = () => ({ ...autoFilled, ...userInputs });

  const makeCriteriaLabel = () => {
    const roleName = EXEC_ROLES.find(r=>r.id===role)?.label || role;
    const merged   = getMergedInputs();
    const summary  = Object.entries(merged).filter(([,v])=>v).map(([k,v])=>`${k}: ${String(v).slice(0,20)}`).slice(0,2).join(' · ');
    return `${roleName}${summary ? ' · ' + summary : ''}`;
  };

  const saveVersion = async (out: string, ev: any) => {
    try {
      const label   = makeCriteriaLabel();
      const merged  = getMergedInputs();
      const { data } = await supabase.from('task_executions').insert({
        project_id:       projectId,
        card_id:          block.id,
        card_title:       block.title,
        card_type:        block.type,
        role,
        user_inputs:      merged,
        context_snapshot: { goals: context?.goals, tech: context?.tech },
        output:           out,
        criteria_label:   label,
        manav_evaluation: ev,
      }).select().single();
      if (data) {
        setVersions(prev=>[
          { id: data.id, role, userInputs: merged, output: out, criteriaLabel: label, evaluation: ev, createdAt: data.created_at },
          ...prev.slice(0,2),
        ]);
        setActiveVersion(data.id);
      }
    } catch (e) { console.warn('[SEO Season] Version save failed:', e); }
  };

  const evaluate = async (out: string) => {
    setEvaluating(true);
    try {
      const res  = await fetch('/api/task-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate', card: block, output: out, executedRole: role, executedInputs: getMergedInputs() }),
      });
      const data = await safeJson(res);
      const ev   = data.evaluation || {};
      setEvaluation(ev);
      await saveVersion(out, ev);
    } catch { setEvaluation(null); }
    setEvaluating(false);
  };

  const execute = async () => {
    setPhase('executing');
    setOutput('');
    setEvaluation(null);
    setShowHistory(false);
    try {
      const res = await fetch('/api/task-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', card: block, context, userInputs: getMergedInputs(), role, brainLearnings }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   acc    = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setOutput(acc);
      }
      setPhase('done');
      await evaluate(acc);
    } catch (e: any) {
      setOutput(`Error: ${(e as Error).message}`);
      setPhase('done');
    }
  };

  // Save the current evaluation to Manav Brain Learning
  const saveLearning = async () => {
    if (!evaluation) return;
    setSavingLearning(true);
    try {
      const improvement = [
        ...(evaluation.what_missed || []).map((m: string) => `Next time: ${m}`),
        evaluation.redo_reason ? `Redo approach: ${evaluation.redo_reason}` : '',
      ].filter(Boolean).join(' | ');

      await fetch('/api/task-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:          'save_learning',
          project_id:      projectId,
          card_type:       block.type,
          card_title:      block.title,
          what_worked:     evaluation.what_worked || [],
          what_missed:     evaluation.what_missed || [],
          redo_reason:     evaluation.redo_reason || null,
          improvement,
          context_summary: `${block.type} task for ${siteUrl || 'unknown site'}`,
          tags:            [block.type, role, ...(block.priority ? [block.priority] : [])],
        }),
      });
      setLearningSaved(true);
    } catch { /* non-blocking */ }
    setSavingLearning(false);
  };

  const loadFromVersion = (v: ExecVersion) => {
    setRedoFrom(v);
    setRole(v.role);
    setUserInputs(v.userInputs);
    setShowHistory(false);
    setPhase('inputs');
    setOutput('');
    setEvaluation(null);
  };

  const roleInfo = EXEC_ROLES.find(r=>r.id===role);

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm"/>
      <div
        className="relative w-full max-w-3xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{maxHeight:'94vh'}}
        onClick={e=>e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-violet-600 via-primary to-violet-600"/>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 shrink-0">
          <Sparkles size={18} className="text-primary shrink-0"/>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white text-sm">
              {phase==='loading'   ? 'Catching up on your project...' :
               phase==='inputs'    ? (redoFrom ? 'Redo — what would you like to change?' : 'Before I start — just a few things') :
               phase==='executing' ? 'Working on it — please keep this open' :
               'Done — review before delivering'}
            </div>
            <div className="text-xs text-white/40 truncate mt-0.5">"{block.title}"</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {versions.length > 0 && phase !== 'executing' && (
              <button
                onClick={()=>setShowHistory(!showHistory)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl border transition-all ${showHistory?'border-violet-400/40 bg-violet-400/10 text-violet-400':'border-white/10 text-white/40 hover:text-white/70'}`}
              >
                <RotateCcw size={11}/>{versions.length} saved
              </button>
            )}
            <select value={role} onChange={e=>setRole(e.target.value)} disabled={phase==='executing'}
              className="text-xs px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white/80 outline-none">
              {EXEC_ROLES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {phase !== 'executing' && (
              <button onClick={onClose} className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10">
                <X size={13} className="text-white/50"/>
              </button>
            )}
          </div>
        </div>

        {/* Role context strip */}
        {roleInfo && phase !== 'executing' && (
          <div className="px-6 py-2 border-b border-white/6 flex flex-wrap gap-x-5 gap-y-0.5">
            <span className="text-xs text-white/35"><span className="text-violet-400 font-medium">Focus:</span> {roleInfo.focus}</span>
            <span className="text-xs text-white/35"><span className="text-green-400 font-medium">Output:</span> {roleInfo.output}</span>
            {(CLIENT_INPUTS_ROLE_EXTRA[block.type]||{})[role]?.length > 0 && (
              <span className="text-xs text-violet-400/70">+ {(CLIENT_INPUTS_ROLE_EXTRA[block.type]||{})[role].length} role-specific question{(CLIENT_INPUTS_ROLE_EXTRA[block.type]||{})[role].length!==1?'s':''} added</span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">

          {/* Version history */}
          {showHistory && versions.length > 0 && (
            <div className="border-b border-white/8 bg-zinc-950 px-6 py-4 space-y-2">
              <div className="text-xs font-semibold text-violet-400 mb-3">Last {versions.length} run{versions.length!==1?'s':''} — click Redo to load criteria</div>
              {versions.map(v=>{
                const score = v.evaluation?.quality_score;
                return (
                  <div key={v.id} className={`rounded-xl border p-3 ${v.id===activeVersion?'border-violet-400/30 bg-violet-400/5':'border-white/8 bg-white/2'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${score>=80?'bg-green-500/20 text-green-400':score>=60?'bg-yellow-500/20 text-yellow-400':'bg-red-500/20 text-red-400'}`}>
                        {score||'?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">{v.criteriaLabel}</div>
                        <div className="text-xs text-white/30">{new Date(v.createdAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                      <button onClick={()=>loadFromVersion(v)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-400/30 bg-violet-400/10 text-violet-400 hover:bg-violet-400/20 shrink-0">
                        <RotateCcw size={10}/>Redo
                      </button>
                    </div>
                    {v.evaluation?.redo_reason && (
                      <div className="mt-2 ml-10 text-xs text-yellow-400/70 italic">If I could redo: {v.evaluation.redo_reason}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Loading */}
          {phase==='loading' && (
            <div className="flex flex-col items-center gap-3 py-16">
              <RefreshCw size={22} className="animate-spin text-violet-400"/>
              <p className="text-sm text-white/50">Checking your Data Room for anything I already know...</p>
            </div>
          )}

          {/* Inputs phase */}
          {phase==='inputs' && (
            <div className="p-6 space-y-4">

              {/* What I'll produce */}
              <div className="rounded-xl border border-violet-400/25 bg-violet-400/5 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`flex flex-col items-center px-3 py-2 rounded-xl border shrink-0 ${cap.confidence>=85?'border-green-400/30 bg-green-400/5':cap.confidence>=70?'border-yellow-400/30 bg-yellow-400/5':'border-orange-400/30 bg-orange-400/5'}`}>
                    <span className={`text-xl font-black ${cap.confidence>=85?'text-green-400':cap.confidence>=70?'text-yellow-400':'text-orange-400'}`}>{cap.confidence}%</span>
                    <span className="text-xs text-white/40">confidence</span>
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm mb-1">Here is what I am going to take off your plate</div>
                    <p className="text-xs text-white/60">{cap.produces[0]}</p>
                  </div>
                </div>
                <p className="text-xs text-white/35 italic border-t border-white/8 pt-2">{cap.confidence_reason}</p>
              </div>

              {/* Redo suggestion from previous run */}
              {redoFrom?.evaluation?.redo_reason && (
                <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-full bg-yellow-400/15 flex items-center justify-center font-black text-yellow-400 text-sm shrink-0">M</div>
                    <span className="text-xs font-semibold text-yellow-400">What I would do differently this time</span>
                  </div>
                  <p className="text-xs text-white/60">{redoFrom.evaluation.redo_reason}</p>
                </div>
              )}

              {/* Data Room gaps */}
              {dataGaps.length > 0 && (
                <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={12} className="text-yellow-400 shrink-0"/>
                    <span className="text-xs font-semibold text-yellow-400">Your Data Room has some gaps — we work with what we have</span>
                  </div>
                  {dataGaps.map((g,i)=>(
                    <div key={i} className="text-xs text-white/50 flex items-start gap-1.5 mt-1">
                      <span className="text-yellow-400 shrink-0">·</span><span>{g}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Auto-filled from Data Room */}
              {Object.keys(autoFilled).length > 0 && (
                <div className="rounded-xl border border-green-400/15 bg-green-400/5 px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <CheckCircle2 size={11} className="text-green-400"/>
                    <span className="text-xs font-semibold text-white/60">Already found in your project — pre-filled for you</span>
                  </div>
                  {Object.entries(autoFilled).map(([k,v])=>(
                    <div key={k} className="flex items-center gap-2 text-xs mb-1">
                      <CheckCircle2 size={9} className="text-green-400 shrink-0"/>
                      <span className="text-white/50 font-medium">{k.replace(/_/g,' ')}:</span>
                      <span className="text-green-400 font-mono truncate">{String(v).slice(0,60)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── THE QUESTIONS — always shown, client-side defined ── */}
              <div className="rounded-xl border border-white/10 bg-white/2 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 bg-white/3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-black text-primary text-sm shrink-0">M</div>
                  <span className="text-sm font-semibold text-white">Just a couple of things I need before I start</span>
                </div>
                <div className="p-4 space-y-4">
                  {clientInputs.map((inp, i) => {
                    const isAutoFilled = inp.key in autoFilled && !userInputs[inp.key];
                    const currentValue = userInputs[inp.key] || '';
                    return (
                      <div key={inp.key}>
                        <label className="text-xs font-semibold text-white block mb-0.5">
                          <span className="text-violet-400 mr-1.5">{i+1}.</span>
                          {inp.label}
                          {isAutoFilled && <span className="ml-2 text-green-400 font-normal text-xs">· pre-filled from Data Room</span>}
                        </label>
                        <p className="text-xs text-white/35 mb-1">{inp.why}</p>
                        {suggestions.find(s=>s.key===inp.key) && (
                          <div className="flex items-start gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 mb-1.5">
                            <div className="h-4 w-4 rounded-full bg-primary/25 flex items-center justify-center font-black text-primary text-xs shrink-0 mt-0.5">M</div>
                            <p className="text-xs text-primary/80 leading-relaxed">{suggestions.find(s=>s.key===inp.key)!.hint}</p>
                          </div>
                        )}
                        <textarea
                          value={currentValue}
                          onChange={e=>setUserInputs(prev=>({...prev,[inp.key]:e.target.value}))}
                          placeholder={isAutoFilled ? `Pre-filled: ${autoFilled[inp.key]} — edit if needed` : inp.placeholder}
                          rows={2}
                          className="w-full text-sm px-3 py-2 rounded-xl border border-white/15 bg-zinc-900 text-white/90 placeholder-white/25 outline-none focus:border-violet-400/60 resize-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* What I won't do */}
              <div className="rounded-xl border border-white/8 px-4 py-3">
                <div className="text-xs font-semibold text-orange-400 mb-2">These parts need your hands — I will flag exactly where</div>
                <div className="space-y-1">
                  {cap.cannot_do.map((c2,i)=>(
                    <div key={i} className="flex items-start gap-1.5 text-xs text-white/40">
                      <span className="text-orange-400 shrink-0">·</span><span>{c2}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Executing + Done */}
          {(phase==='executing'||phase==='done') && (
            <div className="p-6 space-y-4">
              {phase==='executing' && (
                <div className="flex items-center gap-2 text-sm text-white/50">
                  <RefreshCw size={14} className="animate-spin text-violet-400"/>
                  Thinking as {roleInfo?.label}...
                </div>
              )}

              <div className="rounded-xl border border-white/8 bg-white/2 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 bg-white/3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {phase==='executing' && <RefreshCw size={11} className="animate-spin text-violet-400"/>}
                    <span className="text-xs font-semibold text-white">
                      {phase==='executing'
                        ? `Generating${output ? ` — ${Math.round(output.length/5)} words so far` : '...'}`
                        : 'Output — review every section before delivering'}
                    </span>
                    {phase==='done' && output && (
                      <span className="text-xs text-white/30">
                        ~{Math.round(output.length/5)} words
                      </span>
                    )}
                  </div>
                  {phase==='done' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/25 max-w-[180px] truncate">{makeCriteriaLabel()}</span>
                      <button onClick={async()=>{await navigator.clipboard.writeText(output);setCopied(true);setTimeout(()=>setCopied(false),2000);}}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20">
                        <Copy size={10}/>{copied?'Copied!':'Copy all'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="p-4 max-h-[55vh] overflow-y-auto">
                  {output
                    ? <pre className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{output}</pre>
                    : <div className="flex items-center gap-2 text-white/30 text-xs py-4"><RefreshCw size={12} className="animate-spin"/>Starting...</div>
                  }
                </div>
              </div>

              {/* Manav self-evaluation */}
              {phase==='done' && (evaluating || evaluation) && (
                <div className="rounded-xl border border-white/8 bg-zinc-950 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
                    <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-black text-primary text-sm shrink-0">M</div>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-white">Manav reviewing his own output</div>
                      {evaluation && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs font-black ${(evaluation.quality_score||0)>=80?'text-green-400':(evaluation.quality_score||0)>=60?'text-yellow-400':'text-red-400'}`}>{evaluation.quality_score||'?'}/100</span>
                          <span className="text-white/25 text-xs">quality</span>
                          {evaluation.confidence_actual && <span className="text-white/25 text-xs">· {evaluation.confidence_actual}% confident</span>}
                        </div>
                      )}
                    </div>
                    {evaluating && <RefreshCw size={13} className="animate-spin text-violet-400 shrink-0"/>}
                  </div>
                  {evaluation && !evaluating && (
                    <div className="px-4 py-3 space-y-3">
                      {evaluation.manav_note && <p className="text-xs text-white/55 italic">{evaluation.manav_note}</p>}
                      <div className="grid grid-cols-2 gap-3">
                        {evaluation.what_worked?.length>0 && (
                          <div>
                            <div className="text-xs font-mono text-green-400 uppercase mb-1">What worked</div>
                            {evaluation.what_worked.map((w:string,i:number)=>(
                              <div key={i} className="text-xs text-white/45 flex gap-1.5 mb-0.5"><span className="text-green-400 shrink-0">✓</span>{w}</div>
                            ))}
                          </div>
                        )}
                        {evaluation.what_missed?.length>0 && (
                          <div>
                            <div className="text-xs font-mono text-orange-400 uppercase mb-1">What I missed</div>
                            {evaluation.what_missed.map((w:string,i:number)=>(
                              <div key={i} className="text-xs text-white/45 flex gap-1.5 mb-0.5"><span className="text-orange-400 shrink-0">!</span>{w}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      {evaluation.redo_reason && (
                        <div className="rounded-lg border border-yellow-400/15 bg-yellow-400/5 px-3 py-2">
                          <span className="text-xs text-yellow-400 font-semibold">If I could redo this: </span>
                          <span className="text-xs text-white/50">{evaluation.redo_reason}</span>
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap pt-1">
                        <button onClick={()=>{setPhase('inputs');setRedoFrom(null);}}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-violet-400/30 bg-violet-400/10 text-violet-400 hover:bg-violet-400/20">
                          <RotateCcw size={10}/>Redo with changes
                        </button>
                        {evaluation.better_role && evaluation.better_role !== role && (
                          <button onClick={()=>{setRole(EXEC_ROLES.find(r=>r.label===evaluation.better_role||r.id===evaluation.better_role)?.id||role);setPhase('inputs');}}
                            className="text-xs px-3 py-1.5 rounded-xl border border-white/10 text-white/45 hover:text-white/70">
                            Try as {evaluation.better_role}
                          </button>
                        )}
                        {/* Save to Manav Brain Learning */}
                        {!learningSaved ? (
                          <button onClick={saveLearning} disabled={savingLearning}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/8 text-emerald-400 hover:bg-emerald-400/18 font-medium disabled:opacity-50">
                            {savingLearning
                              ? <><span className="animate-spin">⟳</span>Saving…</>
                              : <><span>🧠</span>Save to Manav Brain Learning</>}
                          </button>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                            <span>✓</span>Saved to Manav Brain
                          </span>
                        )}
                      </div>

                      {/* Show which learnings were applied in this run */}
                      {brainLearnings.length > 0 && (
                        <div className="mt-2 rounded-lg border border-emerald-400/15 bg-emerald-400/5 px-3 py-2">
                          <div className="text-xs text-emerald-400 font-semibold mb-1">🧠 {brainLearnings.length} brain learning{brainLearnings.length !== 1 ? 's' : ''} applied in this run</div>
                          <div className="space-y-0.5">
                            {brainLearnings.slice(0, 3).map((l: any, i: number) => (
                              <div key={i} className="text-xs text-white/35 truncate">
                                · {l.what_missed?.[0] || l.improvement || l.card_title}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Review checklist */}
              {phase==='done' && cap.verify_steps?.length>0 && (
                <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield size={14} className="text-yellow-400"/>
                    <span className="text-sm font-bold text-yellow-400">Check these before delivering</span>
                  </div>
                  <div className="space-y-2">
                    {cap.verify_steps.map((v,i)=>(
                      <React.Fragment key={i}><VerifyCheckItem index={i+1} step={v.step} tool={v.tool} pass={v.pass}/></React.Fragment>
                    ))}
                  </div>
                  <p className="text-xs text-yellow-400/55 mt-3 pt-3 border-t border-yellow-400/15">
                    <span className="font-semibold">Final check: </span>{cap.verify_steps[cap.verify_steps.length-1]?.pass}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 shrink-0">
          {phase==='inputs' && (
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={execute}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm bg-gradient-to-r from-violet-600 to-primary hover:from-violet-500">
                <Sparkles size={14}/>
                {redoFrom ? 'Redo with these inputs' : 'Start — I have got this'}
              </button>
              <div className="text-xs text-white/35">
                ~{cap.time_ai} min · as {roleInfo?.label}
              </div>
              {redoFrom && (
                <button onClick={()=>{setRedoFrom(null);setUserInputs({});}} className="text-xs text-white/25 hover:text-white/50 ml-auto">
                  Start fresh
                </button>
              )}
            </div>
          )}
          {phase==='executing' && <p className="text-xs text-white/35">Working... please keep this open</p>}
          {phase==='done' && (
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={()=>onVerify(block)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm">
                <CheckCircle2 size={14}/>Reviewed — submit for verification
              </button>
              <button onClick={()=>{setPhase('inputs');setRedoFrom(null);}}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-white/55 hover:text-white/80">
                <RotateCcw size={13}/>Redo with changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VerifyCheckItem({ index, step, tool, pass }: { index:number; step:string; tool:string; pass:string }) {
  const [checked, setChecked] = useState(false);
  return (
    <div onClick={()=>setChecked(!checked)} className={`rounded-lg p-3 cursor-pointer transition-colors ${checked?'bg-green-400/5 border border-green-400/15':'border border-white/8 bg-white/3 hover:bg-white/5'}`}>
      <div className="flex items-start gap-2">
        <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 mt-0.5 ${checked?'bg-green-500 border-green-500':'border-white/20'}`}>
          {checked && <CheckCircle2 size={10} className="text-white"/>}
        </div>
        <div className="flex-1 space-y-0.5">
          <div className={`text-xs font-medium ${checked?'line-through text-white/30':'text-white/80'}`}>{index}. {step}</div>
          <div className="text-xs text-white/40"><span className="text-white/30">Tool:</span> {tool}</div>
          <div className="text-xs text-green-400/80"><span className="font-medium">Pass:</span> {pass}</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   InlineVerifyModal — self-contained, no imports needed
════════════════════════════════════════════════════ */
const VERIFY_WAIT_DAYS: Record<string,number> = {
  technical:5, content:14, geo:7, 'quick-win':3,
  competitive:21, insight:0, weekly:3, monthly:30, kpi:7, custom:5,
};

const VERIFY_EVIDENCE: Record<string,{tool:string;what:string}[]> = {
  technical:   [{tool:'Google Search Console',what:'Coverage report — indexed pages before vs after'},{tool:'Browser DevTools',what:'HTTP status codes of affected URLs'}],
  content:     [{tool:'Browser — live URL',  what:'Confirm page is published and content is live'},{tool:'Google Search Console',what:'Performance → target keyword impressions/position'}],
  geo:         [{tool:'Perplexity.ai',       what:'Search your target query — is your site cited?'},{tool:'ChatGPT',what:'Ask relevant question — is your brand mentioned?'}],
  'quick-win': [{tool:'Google Search Console',what:'CTR and average position for affected URLs before vs after'}],
  competitive: [{tool:'Semrush or Ahrefs',   what:'Your ranking position vs competitor for target keyword'},{tool:'Google incognito',what:'Manual SERP check'}],
};

function InlineVerifyModal({ block, siteUrl, onApprove, onWait, onClose }: {
  block:{id:string;type:string;title:string;content:string;priority:string;impact?:string;assignee?:string};
  siteUrl:string; onApprove:(b:any)=>void; onWait:(b:any,days:number)=>void; onClose:()=>void;
}) {
  const [step,           setStep]           = useState(1);
  const [completionNote, setCompletionNote] = useState('');
  const [evidenceData,   setEvidenceData]   = useState('');
  const [completedDate,  setCompletedDate]  = useState(new Date().toISOString().split('T')[0]);
  const [loading,        setLoading]        = useState(false);
  const [result,         setResult]         = useState<any>(null);

  const waitDays  = VERIFY_WAIT_DAYS[block.type] || 5;
  const daysSince = Math.floor((Date.now()-new Date(completedDate).getTime())/86400000);
  const daysLeft  = Math.max(0, waitDays-daysSince);
  const waitReady = daysLeft === 0;
  const evReqs    = VERIFY_EVIDENCE[block.type] || VERIFY_EVIDENCE['quick-win'];

  const runCheck = async (checkType: string) => {
    setLoading(true); setResult(null); setStep(3);
    try {
      const res = await fetch('/api/task-engine', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'verify',card:block,siteUrl,completedAt:new Date(completedDate).toISOString(),checkType,completionNote,evidenceData}),
      });
      const data = await safeJson(res);
      setResult(data.success ? data : {verdict:'cannot_determine',next_action:'Server error — try again.',evidence_found:[],evidence_missing:[],what_to_check:[]});
    } catch(e:any) {
      setResult({verdict:'cannot_determine',next_action:`Error: ${(e as Error).message}`,evidence_found:[],evidence_missing:[],what_to_check:[]});
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm"/>
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{maxHeight:'92vh'}} onClick={e=>e.stopPropagation()}>
        <div className="h-1 w-full bg-gradient-to-r from-yellow-500 via-violet-500 to-green-500"/>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 shrink-0">
          <div className="h-9 w-9 rounded-xl bg-yellow-400/15 border border-yellow-400/25 flex items-center justify-center shrink-0">
            <Shield size={16} className="text-yellow-400"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white">Task Verification — Step {step} of 3</div>
            <div className="text-xs text-white/40 truncate">"{block.title}"</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {([1,2,3] as const).map(n=>(
              <div key={n} onClick={()=>n<step?setStep(n):undefined} className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all cursor-pointer ${step>n?'bg-green-500 border-green-500 text-white':step===n?'bg-violet-500 border-violet-500 text-white':'bg-white/5 border-white/10 text-white/30'}`}>{step>n?'✓':n}</div>
            ))}
          </div>
          {!loading && <button onClick={onClose} className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 ml-1"><X size={13} className="text-white/50"/></button>}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Step 1 */}
          {step===1 && (<>
            <div className="rounded-xl border border-white/8 bg-white/3 p-4">
              <div className="text-xs font-mono text-white/40 uppercase mb-2">Okay, let me look at this properly</div>
              <p className="text-sm text-white/80">{block.content}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded border border-white/10 text-white/40">{block.type}</span>
                {block.impact&&<span className="text-xs px-2 py-0.5 rounded border border-orange-400/30 text-orange-400">Expected: {block.impact}</span>}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-white flex justify-between mb-1">
                <span><span className="text-red-400">*</span> Walk me through what you did — the more detail, the better I can verify</span>
                <span className="text-white/30 font-normal">{completionNote.length}/50 min</span>
              </label>
              <textarea value={completionNote} onChange={e=>setCompletionNote(e.target.value)} rows={4}
                placeholder="Tell me what changed — e.g. Fixed 3 broken redirects, tested in browser, all returning 301"
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-white/15 bg-zinc-900 text-white/90 placeholder-white/30 outline-none focus:border-violet-400/60 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white mb-1 block">When did you wrap this up?</label>
              <input type="date" value={completedDate} onChange={e=>setCompletedDate(e.target.value)} max={new Date().toISOString().split('T')[0]}
                className="h-9 text-sm px-3 rounded-xl border border-white/10 bg-zinc-900 text-white/90 outline-none focus:border-violet-400/50"/>
            </div>
          </>)}

          {/* Step 2 */}
          {step===2 && (<>
            <div className={`rounded-xl border p-3 ${waitReady?'border-green-400/25 bg-green-400/5':'border-orange-400/25 bg-orange-400/5'}`}>
              <div className={`text-sm font-semibold ${waitReady?'text-green-400':'text-orange-400'} mb-1`}>
                {waitReady?`Waiting period complete (${waitDays} days passed)`:`${daysLeft} day${daysLeft!==1?'s':''} remaining before verification is reliable`}
              </div>
              <p className="text-xs text-white/50">{waitReady?`${block.type} changes have had time to propagate in Google.`:`${block.type} changes take ~${waitDays} days to appear in search tools.`}</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-white mb-3">Here's what I need to see for <span className="text-violet-400">{block.type}</span> tasks:</div>
              {evReqs.map((r,i)=>(
                <div key={i} className="rounded-xl border border-white/8 bg-white/3 p-3 mb-2">
                  <div className="text-xs font-semibold text-violet-400 mb-1">{i+1}. {r.tool}</div>
                  <div className="text-xs text-white/50">→ {r.what}</div>
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-semibold text-white block mb-1">Paste in the numbers — whatever the tool showed you</label>
              <textarea value={evidenceData} onChange={e=>setEvidenceData(e.target.value)} rows={4}
                placeholder="E.g. GSC indexed pages went from 823 to 847. Or: keyword moved from pos 14 to 8 in Semrush."
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-white/15 bg-zinc-900 text-white/90 placeholder-white/30 outline-none focus:border-violet-400/60 resize-none font-mono"
              />
            </div>
          </>)}

          {/* Step 3 */}
          {step===3 && (<>
            {loading && (
              <div className="flex flex-col items-center gap-3 py-12">
                <RefreshCw size={24} className="animate-spin text-violet-400"/>
                <p className="text-sm text-white/50 text-center">{siteUrl?'Fetching live site + analysing evidence...':'Analysing your evidence...'}</p>
              </div>
            )}
            {result && !loading && (
              <div className="space-y-3">
                <div className={`rounded-xl border p-4 ${result.verdict==='verified'?'border-green-400/30 bg-green-400/5':result.verdict==='partial'?'border-yellow-400/30 bg-yellow-400/5':'border-red-400/30 bg-red-400/5'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-black text-sm ${result.verdict==='verified'?'bg-green-500 text-white':result.verdict==='partial'?'bg-yellow-500 text-black':'bg-red-500/20 border border-red-500/30 text-red-400'}`}>
                      {result.verdict==='verified'?'✓':result.verdict==='partial'?'~':'!'}
                    </div>
                    <div>
                      <div className="font-bold text-white capitalize">{(result.verdict||'unknown').replace(/_/g,' ')}</div>
                      {result.confidence>0&&<div className="text-xs text-white/40">{result.confidence}% confidence{result.live_data_used?' · live site checked':''}</div>}
                    </div>
                  </div>
                  {result.evidence_found?.length>0&&<div className="mb-3">{result.evidence_found.map((e:string,i:number)=><div key={i} className="flex gap-2 text-xs text-white/70 mb-1"><span className="text-green-400">✓</span><span>{e}</span></div>)}</div>}
                  {result.evidence_missing?.length>0&&<div className="mb-3">{result.evidence_missing.map((e:string,i:number)=><div key={i} className="flex gap-2 text-xs text-white/70 mb-1"><span className="text-red-400">✗</span><span>{e}</span></div>)}</div>}
                  {result.approval_blocked&&result.verdict!=='verified'&&<div className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs text-white/60">{result.approval_blocked}</div>}
                </div>
                {result.what_to_check?.length>0&&result.what_to_check.map((c:any,i:number)=>(
                  <div key={i} className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-1 text-xs">
                    <div className="font-semibold text-violet-400">{c.tool}</div>
                    <div className="text-white/50">Action: {c.action}</div>
                    <div className="text-green-400/80">Pass: {c.pass_condition}</div>
                    <div className="text-red-400/80">Fail: {c.fail_condition}</div>
                  </div>
                ))}
                {result.next_action&&<div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3 text-sm text-white font-medium">{result.next_action}</div>}
              </div>
            )}
          </>)}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 shrink-0 flex gap-2 flex-wrap items-center">
          {step===1&&(
            <>
              <button onClick={()=>{if(completionNote.trim().length<50){alert('Please describe what was done in at least 50 characters.');return;}setStep(2);}}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors">
                Good — now let's gather the proof →'
              </button>
              <button onClick={onClose} className="text-sm text-white/40 hover:text-white/70 px-3">Cancel</button>
              <span className="text-xs text-white/25 ml-auto">{completionNote.length}/50</span>
            </>
          )}
          {step===2&&(
            <>
              <button onClick={()=>setStep(1)} className="text-sm text-white/40 hover:text-white/70 px-3">← Go back</button>
              <button onClick={()=>runCheck('live_check')} disabled={loading||!siteUrl}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors">
                <Globe size={14}/>{siteUrl?'Check the live site now':'Add your site URL in project settings first'}
              </button>
              <button onClick={()=>runCheck('guidance')} disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-40 text-white/70 text-sm transition-colors">
                <Brain size={14}/>Show me what to check manually
              </button>
              {!waitReady&&<button onClick={()=>onWait(block,daysLeft)} className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl border border-orange-400/30 bg-orange-400/10 text-orange-400 hover:bg-orange-400/15 ml-auto"><Clock size={13}/>Wait {daysLeft} more days</button>}
            </>
          )}
          {step===3&&!loading&&result&&(
            <>
              {result.verdict==='verified'
                ?<button onClick={()=>onApprove(block)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors"><CheckCircle2 size={15}/>✓ Verified — mark it done</button>
                :<><button onClick={()=>{setStep(2);setResult(null);}} className="text-sm px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-white/70 transition-colors">← Let me add more data</button>
                  {(result.waiting_status?.daysLeft||0)>0&&<button onClick={()=>onWait(block,result.waiting_status.daysLeft)} className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl border border-orange-400/30 bg-orange-400/10 text-orange-400"><Clock size={13}/>Not ready yet — I'll wait</button>}
                  <button onClick={()=>onApprove(block)} className="text-xs px-3 py-2 rounded-xl border border-white/10 text-white/30 hover:text-white/60 ml-auto">I'll approve this myself</button>
                </>
              }
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
export default function Playground() {
  const {clients,projects} = useAuth();
  const [selProjId,  setSelProjId]  = useState<string>(() => localStorage.getItem('seo_season_proj') || '');
  const [tab,        setTab]        = useState<Tab>('reports');
  const [reports,    setReports]    = useState<any[]>([]);
  const [strategy,   setStrategy]   = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [genAt,      setGenAt]      = useState('');
  const [expandedRep,setExpandedRep]= useState<string|null>(null);
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
  const [recommendation,setRecommendation]= useState<Recommendation|null>(null);
  const [lastImpact,    setLastImpact]    = useState<{title:string;week:number;metric:string}|null>(null);
  const [highlightId,   setHighlightId]   = useState<string|null>(null);
  const [autoFilling,   setAutoFilling]   = useState(false);
  const [teamMembers,   setTeamMembers]   = useState<string[]>(['Manav','Client','Agency']);
  const [showAssignModal,setShowAssignModal] = useState<string|null>(null);
  const [agendaWeek,    setAgendaWeek]    = useState<number|null>(null);
  const [agendaText,    setAgendaText]    = useState<Record<number,string>>({});
  const [agendaLoading, setAgendaLoading] = useState<number|null>(null);
  const [agendaStale,   setAgendaStale]   = useState<Set<number>>(new Set());
  const [agendaExpanded,setAgendaExpanded]= useState<number|null>(null);
  const [cacheLoaded,  setCacheLoaded]   = useState(false);
  const [batchStatus,  setBatchStatus]   = useState<Record<string,string>>({});
  const [failedBatches,setFailedBatches] = useState<number[]>([]);
  const [verifyBlock,     setVerifyBlock]     = useState<Block|null>(null);
  const [verifyResult,    setVerifyResult]    = useState<any>(null);
  const [verifyLoading,   setVerifyLoading]   = useState(false);
  const [completedDates,  setCompletedDates]  = useState<Record<string,string>>({});
  const [nextTaskPrompt,  setNextTaskPrompt]  = useState<Block|null>(null);
  const [nextConfirmed,   setNextConfirmed]   = useState(false);
  const [verifyStep,      setVerifyStep]      = useState(1);
  const [completionNote,  setCompletionNote]  = useState('');
  const [evidenceData,    setEvidenceData]    = useState('');
  const [completedAt,     setCompletedAt]     = useState('');
  /* ── Isolated verify modal state ── */
  const [activeVerifyBlock, setActiveVerifyBlock] = useState<Block|null>(null);
  const [activeExecBlock,   setActiveExecBlock]   = useState<Block|null>(null);
  const [activeRole,   setActiveRole]   = useState('team_lead');
  const [roleChat,     setRoleChat]     = useState('');
  const [roleChatQ,    setRoleChatQ]    = useState('');
  const [roleChatLoading,setRoleChatLoading] = useState(false);
  const [checkUrl,     setCheckUrl]     = useState('');
  const [pipelineText, setPipelineText] = useState('');
  const [pipelineLoading,setPipelineLoading] = useState(false);
  const [depText,      setDepText]      = useState('');
  const [depLoading,   setDepLoading]   = useState(false);
  const [depFocusId,   setDepFocusId]   = useState<string|null>(null);
  // Project context (Data Room knowledge — shared across deepDive/askCanvas)
  const [projContext,   setProjContext]   = useState<any>(null);
  // Card requirements cache: cardId → requirement[]
  const [cardReqCache,  setCardReqCache]  = useState<Record<string,any[]>>({});
  // Stale section tracking + refresh
  const [staleSections, setStaleSections] = useState<{section:string;reason:string}[]>([]);
  const [refreshing,    setRefreshing]    = useState<string|null>(null);  // which section is refreshing
  // Conflict detection from DataRoom changes
  const [conflicts,     setConflicts]     = useState<{field:string;oldVal:string;newVal:string;source:string;impacts:string[]}[]>([]);
  const chatEndRef    = useRef<HTMLDivElement>(null);
  // Create-card-from-chat state
  const [createCardFrom, setCreateCardFrom] = useState<{text:string;source:'canvas_chat'|'pipeline_chat'|'deep_dive'}|null>(null);
  const [similarCardConflict, setSimilarCardConflict] = useState<{
    proposed: {title:string;type:BType;week:number;priority:Priority;content:string};
    source:   string;
    matches:  Block[];
  }|null>(null);
  const [createCardForm, setCreateCardForm] = useState<{title:string;type:BType;week:number;priority:Priority;content:string}>({title:'',type:'quick-win',week:1,priority:'high',content:''});
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const selProj       = projects.find(p=>p.id===selProjId);
  const client        = clients.find(c=>c.id===selProj?.client_id);
  const draggingBlock = blocks.find(b=>b.id===draggingId)??null;
  const libBlocks     = blocks.filter(b=>!b.placed&&(filterType==='all'||b.type===filterType));
  const placedBlocks  = blocks.filter(b=>b.placed);
  const done          = placedBlocks.filter(b=>b.status==='done').length;
  const progress      = placedBlocks.length>0?Math.round((done/placedBlocks.length)*100):0;

  // Auto-select first project if nothing is stored (first visit or cleared storage)
  useEffect(() => {
    if (!selProjId && projects && projects.length > 0) {
      setSelProjId(projects[0].id);
    }
  }, [projects]);

  // Persist the selected project so navigation doesn't lose it
  useEffect(() => {
    if (selProjId) {
      localStorage.setItem('seo_season_proj', selProjId);
      loadProject();
    } else {
      // Only clear blocks if explicitly deselected (not on initial mount with empty string)
      // Don't clear if we have blocks already — protects against race conditions
      setReports([]);
      setStrategy(null);
      if (blocks.length === 0) setBlocks([]);
      setRecommendation(null);
    }
  }, [selProjId]);

  const loadProject = async () => {
    const [rr,pr] = await Promise.all([
      supabase.from('audit_reports').select('*').eq('project_id',selProjId).order('created_at',{ascending:false}).limit(5),
      supabase.from('projects').select('playground_strategy,playground_canvas,playground_generated_at').eq('id',selProjId).single(),
    ]);
    setReports(rr.data||[]);
    if (pr.data?.playground_strategy){setStrategy(pr.data.playground_strategy);setGenAt(pr.data.playground_generated_at||'');}
    if (pr.data?.playground_strategy) {
      const allBlocks  = buildLibraryFromStrategy(pr.data.playground_strategy);
      const placements = (pr.data.playground_canvas || []) as Array<{
        id:string; placed:boolean; week:number; status:Status;
        assignee?:string|null; aiAssisted?:boolean; tags?:string[];
        effort?:string|null; impact?:string|null;
        // user-created card fields (strategy cards have these from buildLibraryFromStrategy)
        title?:string; content?:string; type?:string; priority?:string;
        color?:string; source?:string;
      }>;
      const placedMap  = new Map(placements.map(p => [p.id, p]));
      const merged = allBlocks.map(b => {
        const saved = placedMap.get(b.id);
        if (!saved) return b;
        // Restore all persisted fields — strategy provides title/content/type,
        // canvas provides placement state + user edits
        return {
          ...b,
          placed:     saved.placed     ?? b.placed,
          week:       saved.week       ?? b.week,
          status:     (saved.status    || b.status) as Status,
          assignee:   saved.assignee   ?? b.assignee,
          aiAssisted: saved.aiAssisted ?? b.aiAssisted,
          tags:       saved.tags       ?? b.tags,
          effort:     saved.effort     ?? b.effort,
          impact:     saved.impact     ?? b.impact,
        };
      });
      // Re-include user-created cards: any saved block whose ID isn't in allBlocks
      // (strategy cards are covered by allBlocks.map above)
      const normT = (t: string) => (t||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim().slice(0,40);
      const strategyIds     = new Set(allBlocks.map(b => b.id));
      const strategyTitles  = new Set(allBlocks.map(b => normT(b.title)));
      // Only restore user cards whose title doesn't already appear in strategy (title dedup)
      const userCreated  = placements.filter(p => !strategyIds.has(p.id) && p.title && p.type && !strategyTitles.has(normT(p.title)));
      const restoredUserCards: Block[] = userCreated.map((p: any) => ({
        id:         p.id,
        type:       p.type       as BType,
        title:      p.title      || 'Card',
        content:    p.content    || '',
        color:      p.color      || TM[p.type as BType]?.color || '#94a3b8',
        priority:   (p.priority  || 'medium') as Priority,
        status:     (p.status    || 'todo')   as Status,
        week:       p.week       || 1,
        placed:     p.placed     ?? false,
        effort:     p.effort     || null,
        impact:     p.impact     || null,
        tags:       p.tags       || [],
        source:     p.source     || 'Added from chat',
        assignee:   p.assignee   || null,
        aiAssisted: p.aiAssisted || false,
      }));
      const finalBlocks = [...merged, ...restoredUserCards];
      setBlocks(finalBlocks);
      setRecommendation(getNextRecommendation(finalBlocks.filter(b=>b.placed), finalBlocks.filter(b=>!b.placed)));
    } else if (pr.data?.playground_canvas?.length) {
      const saved = pr.data.playground_canvas as Block[];
      setBlocks(saved);
      setRecommendation(getNextRecommendation(saved.filter(b=>b.placed), saved.filter(b=>!b.placed)));
    }

    // Load all cached AI content from Supabase
    const { data: cacheRows } = await supabase
      .from('ai_content_cache')
      .select('content_type,content,status,updated_at')
      .eq('project_id', selProjId);
    if (cacheRows?.length) {
      const newAgendaText: Record<number,string> = {};
      let newPipeline = ''; let newDeps = '';
      for (const row of cacheRows) {
        if (row.content_type.startsWith('agenda_')) {
          const w = parseInt(row.content_type.replace('agenda_',''));
          if (!isNaN(w)) newAgendaText[w] = row.content;
        } else if (row.content_type === 'pipeline') {
          newPipeline = row.content;
        } else if (row.content_type.startsWith('deps_')) {
          newDeps = row.content;
        }
      }
      if (Object.keys(newAgendaText).length) setAgendaText(newAgendaText);
      if (newPipeline) setPipelineText(newPipeline);
      if (newDeps)     setDepText(newDeps);
    }
    setCacheLoaded(true);
    // Load stale section status and project context after project data is ready
    loadStaleSections();
    loadProjContext();
  };

  /* ══ Load project context (Data Room) for deepDive / askCanvas ══ */
  const loadProjContext = async () => {
    if (!selProjId) return;
    try {
      const res = await fetch('/api/control', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ action: 'get_context', projectId: selProjId }),
      });
      const data = await safeJson(res);
      if (data.success) setProjContext(data.context);
    } catch { /* silent — context enriches but doesn't block */ }
  };

  /* ══ Load saved requirements for a card ══ */
  const loadCardRequirements = async (cardId: string) => {
    if (!selProjId || cardReqCache[cardId]) return;
    try {
      const { data } = await supabase
        .from('task_requirements')
        .select('*')
        .eq('project_id', selProjId)
        .eq('card_id', cardId)
        .order('created_at', { ascending: true });
      if (data) setCardReqCache(prev => ({ ...prev, [cardId]: data }));
    } catch { /* table may not exist yet */ }
  };

  /* ══ Save a requirement for a card ══ */
  const saveCardRequirement = async (cardId: string, cardTitle: string, requirement: string, category: string) => {
    if (!selProjId || !requirement.trim()) return;
    try {
      const { data, error } = await supabase.from('task_requirements').insert({
        project_id:  selProjId,
        card_id:     cardId,
        card_title:  cardTitle,
        requirement: requirement.trim(),
        category,
        status:      'pending',
        created_at:  new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      }).select().single();
      if (data) {
        setCardReqCache(prev => ({ ...prev, [cardId]: [...(prev[cardId] || []), data] }));
        toast({ title: 'Requirement saved', description: 'Manav Brain will use this when executing the task.' });
      } else if (error) {
        toast({ title: 'Could not save requirement', description: error.message, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  /* ══ Update requirement status ══ */
  const updateReqStatus = async (reqId: string, cardId: string, status: 'pending'|'provided'|'not_needed') => {
    await supabase.from('task_requirements').update({ status, updated_at: new Date().toISOString() }).eq('id', reqId);
    setCardReqCache(prev => ({
      ...prev,
      [cardId]: (prev[cardId] || []).map(r => r.id === reqId ? { ...r, status } : r),
    }));
  };

  /* ══ Load stale sections from SystemControl ══ */
  const loadStaleSections = async () => {
    if (!selProjId) return;
    try {
      const res = await fetch('/api/control', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ action: 'get_state', projectId: selProjId }),
      });
      const data = await safeJson(res);
      if (data.success && data.sectionStatus) {
        const stale = (data.sectionStatus as any[])
          .filter(s => s.stale && s.hasCache)
          .map(s => ({ section: s.section, reason: s.staleReason || 'Data updated' }));
        setStaleSections(stale);
      }
    } catch { /* silent */ }
  };

  /* ══ Impact label map ══ */
  const SECTION_LABELS: Record<string,string> = {
    strategy:  'Strategy & Canvas Blocks',
    pipeline:  'Execution Pipeline',
    agenda_1:  'Week 1 Agenda',
    agenda_2:  'Week 2 Agenda',
    agenda_3:  'Week 3 Agenda',
    agenda_4:  'Week 4 Agenda',
    agenda_5:  'Backlog Agenda',
    kpi_forecast: 'KPI Forecast',
  };

  /* ══ Refresh a single stale section ══ */
  const refreshSection = async (section: string) => {
    if (!selProjId || !selProj) return;
    setRefreshing(section);
    try {
      if (section === 'strategy') {
        // Re-generate strategy then reload blocks, preserving existing canvas placements
        await generate();
      } else if (section === 'pipeline') {
        callPipelineChat('Regenerate the full execution pipeline with current canvas state.', 'pipeline');
      } else if (section.startsWith('agenda_')) {
        const week = parseInt(section.replace('agenda_', ''));
        if (!isNaN(week)) await generateAgenda(week);
      }
      // Mark as no longer stale locally
      setStaleSections(prev => prev.filter(s => s.section !== section));
    } catch { /* silent */ }
    setRefreshing(null);
  };

  /* ══ Refresh all stale sections at once ══ */
  const refreshAllStale = async () => {
    if (!selProjId) return;
    const stale = [...staleSections];
    // Strategy first (others depend on it)
    const stratFirst = ['strategy', ...stale.filter(s=>s.section!=='strategy').map(s=>s.section)];
    for (const section of stratFirst) {
      if (staleSections.some(s => s.section === section)) {
        await refreshSection(section);
        await new Promise(r => setTimeout(r, 500)); // small gap between calls
      }
    }
    setStaleSections([]);
    toast({ title: 'All sections refreshed', description: 'Everything is up to date with your latest data.' });
  };


  /* ══ Delete strategy + canvas completely ══ */
  const deleteStrategy = async () => {
    if (!selProjId) return;
    if (!confirm('Delete this strategy and all canvas blocks? This cannot be undone.')) return;
    try {
      await supabase.from('projects').update({
        playground_strategy:     null,
        playground_canvas:       null,
        playground_generated_at: null,
      }).eq('id', selProjId);
      setStrategy(null);
      setBlocks([]);
      setRecommendation(null);
      setGenAt('');
      setBatchStatus({});
      setFailedBatches([]);
      toast({ title: 'Strategy deleted', description: 'Canvas is now empty. Generate a fresh strategy when ready.' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const generate = async () => {
    if(!selProj) return toast({title:'Select a project first',variant:'destructive'});
    setGenerating(true);
    try {
      const cl = clients.find(c=>c.id===selProj.client_id);
      const [mr,rr2] = await Promise.all([
        supabase.from('metrics').select('*').eq('project_id',selProjId).order('recorded_at',{ascending:false}).limit(4),
        supabase.from('metrics').select('keyword_rankings').eq('project_id',selProjId).order('recorded_at',{ascending:false}).limit(1),
      ]);
      const audits = reports.slice(0,3).map(r=>({created_at:r.created_at,sections:Object.fromEntries(Object.entries(r.sections||{}).map(([k,v])=>[k,safeStr(v).slice(0,300)]))}));
      const res = await fetch('/api/playground-analysis', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          project: selProj, client: cl,
          metrics: mr.data||[], keywordRankings: rr2.data?.[0]?.keyword_rankings||[],
          auditReports: audits, competitors: selProj.competitors||[], allKeywords: selProj.keywords||[],
          resumeBatch: 0, existingStrategy: strategy||undefined,
        }),
      });
      const data = await safeJson(res);
      if (!data.success) throw new Error(data.error || 'Strategy generation failed');

      setBatchStatus(Object.fromEntries(Object.entries(data.batch_status||{}).map(([k,v])=>[k,String(v)])));
      setFailedBatches(data.failed_batches||[]);

      // Full regeneration: use new strategy entirely (no stale merge)
      // Preserve canvas placements from existing blocks so placed cards stay put
      const newStrategy = data.strategy;
      // Capture existing placements from strategy blocks AND user-created cards
      const existingPlacements = blocks.reduce((map, b) => {
        if (b.placed) map[b.id] = { placed: b.placed, week: b.week, status: b.status, assignee: b.assignee, aiAssisted: b.aiAssisted };
        return map;
      }, {} as Record<string, any>);
      // Keep user-created cards (source='Added from chat' or 'Canvas chat' etc.) — they're not in strategy
      const userCreatedCards = blocks.filter(b => b.source && !['Strategy Analysis','Quick Wins','Technical Audit','Content Calendar','GEO Strategy','Competitive Intelligence','Strategic Insights','KPI Forecast','Retainer Value Summary','Week 1 Plan','Week 2 Plan','Week 3 Plan','Week 4 Plan','Week 5 Plan'].includes(b.source));
      setStrategy(newStrategy);
      setGenAt(data.generated_at);
      const nb = buildLibraryFromStrategy(newStrategy);
      // Normalize helper for title dedup
      const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim().slice(0,40);
      const strategyTitles = new Set(nb.map(b => normTitle(b.title)));
      // Re-apply existing placements to matching block IDs
      const nbWithPlacements = nb.map(b => {
        const saved = existingPlacements[b.id];
        return saved ? { ...b, ...saved } : b;
      });
      // Re-add user-created cards — but skip if strategy now covers same topic
      const uniqueUserCards = userCreatedCards.filter(uc => !strategyTitles.has(normTitle(uc.title)));
      const finalBlocks = [...nbWithPlacements, ...uniqueUserCards];
      setBlocks(finalBlocks);
      setRecommendation(getNextRecommendation(finalBlocks.filter(b=>b.placed), finalBlocks.filter(b=>!b.placed)));
      await supabase.from('projects').update({
        playground_strategy: newStrategy,
        playground_canvas:   finalBlocks.map(b=>({ id:b.id, placed:b.placed, week:b.week, status:b.status, assignee:b.assignee||null, aiAssisted:b.aiAssisted||false, tags:b.tags||[], effort:b.effort||null, impact:b.impact||null, title:b.title, content:b.content, type:b.type, priority:b.priority, color:b.color, source:b.source||null })),
        playground_generated_at: data.generated_at,
      }).eq('id', selProjId);

      if (data.failed_batches?.length) {
        toast({title: `Strategy ${3-data.failed_batches.length}/3 sections done`, description: 'Some sections hit token limits. Use Resume to complete.', variant:'destructive'});
      } else {
        toast({title: `${nb.length} blocks ready!`, description: 'All 3 sections complete. Drag into your canvas.'});
      }
      setTab('canvas');
    } catch(e:any){toast({title:'Failed',description:e.message,variant:'destructive'});}
    setGenerating(false);
  };

  const resumeMissingBatches = async () => {
    if (!selProj || !failedBatches.length) return;
    setGenerating(true);
    try {
      const cl = clients.find(c => c.id === selProj.client_id);
      const [mr, rr2] = await Promise.all([
        supabase.from('metrics').select('*').eq('project_id', selProjId).order('recorded_at', {ascending: false}).limit(4),
        supabase.from('metrics').select('keyword_rankings').eq('project_id', selProjId).order('recorded_at', {ascending: false}).limit(1),
      ]);
      const audits = reports.map(r => ({ created_at: r.created_at, sections: Object.fromEntries(Object.entries(r.sections||{}).map(([k,v])=>[k,safeStr(v).slice(0,300)])) }));

      for (const batchNum of failedBatches) {
        try {
          const res = await fetch('/api/playground-analysis', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              project: selProj, client: cl,
              metrics: mr.data||[], keywordRankings: rr2.data?.[0]?.keyword_rankings||[],
              auditReports: audits, competitors: selProj.competitors||[], allKeywords: selProj.keywords||[],
              resumeBatch: batchNum, existingStrategy: strategy,
            }),
          });
          const data = await safeJson(res);
          if (data.success) {
            const merged = {...(strategy||{}), ...data.strategy};
            setStrategy(merged);
            // Rebuild library but preserve all existing placements
            setBlocks(prev => {
              const existing = new Map<string, Block>(prev.map(b => [b.id, b]));
              return buildLibraryFromStrategy(merged).map(nb => {
                const saved = existing.get(nb.id);
                return saved ? { ...nb, placed: saved.placed, week: saved.week, status: saved.status, assignee: saved.assignee, tags: saved.tags, effort: saved.effort, impact: saved.impact } : nb;
              });
            });
            setBatchStatus(prev => ({...prev, [String(batchNum)]: 'ok'}));
            setFailedBatches(prev => prev.filter(n => n !== batchNum));
            await supabase.from('projects').update({playground_strategy: merged}).eq('id', selProjId);
          }
        } catch {}
      }
      toast({title: 'Resume complete!', description: failedBatches.length === 0 ? 'All sections now complete.' : `${failedBatches.length} sections still need retry.`});
    } catch(e:any) { toast({title:'Resume failed', description:e.message, variant:'destructive'}); }
    setGenerating(false);
  };

  /* ─── canvas actions ─── */
  const onDragStart = (e:React.DragEvent,id:string)=>{e.dataTransfer.setData('blockId',id);e.dataTransfer.effectAllowed='move';setDraggingId(id);};
  const onDragOver  = (e:React.DragEvent,week:number)=>{e.preventDefault();e.dataTransfer.dropEffect='move';setDragOverWeek(week);};
  const onDrop      = (e:React.DragEvent,week:number)=>{
    e.preventDefault();
    const id = e.dataTransfer.getData('blockId');
    if (!id) return;
    setBlocks(prev=>{
      const updated = prev.map(b=>b.id===id?{...b,placed:true,week}:b);
      const placed   = updated.filter(b=>b.placed);
      const lib      = updated.filter(b=>!b.placed);
      const dropped  = updated.find(b=>b.id===id);
      if (dropped) setLastImpact({title:dropped.title,week,metric:getDropImpact(dropped,week)});
      setRecommendation(getNextRecommendation(placed,lib));
      markAgendaStale(week);
      scheduleAutoSave(updated);
      return updated;
    });
    setDraggingId(null);setDragOverWeek(null);
  };
  const onDragEnd  = ()=>{setDraggingId(null);setDragOverWeek(null);};
  const returnToLib = (id:string)=>{
    setBlocks(prev=>{
      const updated = prev.map(b=>b.id===id?{...b,placed:false}:b);
      setRecommendation(getNextRecommendation(updated.filter(b=>b.placed),updated.filter(b=>!b.placed)));
      return updated;
    });
    setLastImpact(null);
  };
  const openVerifyModal = (block: Block) => {
    setActiveVerifyBlock(block);
  };

  const toggleStatus = (id: string) => {
    const block = blocks.find(b => b.id === id);
    if (!block) return;

    // 'doing' → back to todo (simple toggle — verification is in the panel below)
    if (block.status === 'doing') {
      // Open verification modal directly - don't cycle backward
      openVerifyModal(block);
      return;
    }

    // All other transitions (todo→doing, review→todo, etc.) happen immediately
    setBlocks(prev => {
      const updated = prev.map(b => b.id === id ? { ...b, status: SC[b.status] } : b);
      scheduleAutoSave(updated);
      return updated;
    });
  };

  const runVerification = async (block: Block, checkType: 'guidance' | 'live_check') => {
    setVerifyLoading(true);
    setVerifyResult(null);
    setVerifyStep(3);
    try {
      const res = await fetch('/api/task-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:         'verify',
          card:           block,
          siteUrl:        selProj?.url || '',
          completedAt:    completedDates[block.id] || new Date().toISOString(),
          checkType,
          completionNote,
          evidenceData,
        }),
      });
      const data = await safeJson(res);
      setVerifyResult(data);
    } catch (e: any) {
      setVerifyResult({ success: false, error: (e as Error).message });
    }
    setVerifyLoading(false);
  };

  const approveBlock = (block: Block) => {
    setBlocks(prev => {
      const updated = prev.map(b => b.id === block.id ? { ...b, status: 'verified' as Status } : b);
      scheduleAutoSave(updated);
      // Show next task after approval
      const placed = updated.filter(b => b.placed);
      const lib    = updated.filter(b => !b.placed);
      const rec    = getNextRecommendation(placed, lib);
      if (rec) setNextTaskPrompt(rec.block);
      return updated;
    });
    setVerifyBlock(null);
    setActiveVerifyBlock(null);
    setVerifyResult(null);
    setNextConfirmed(false);
    toast({ title: '✓ Task verified and approved!' });
  };

  const sendToWaiting = (block: Block, daysRemaining: number) => {
    setBlocks(prev => {
      const updated = prev.map(b => b.id === block.id ? { ...b, status: 'waiting' as Status } : b);
      scheduleAutoSave(updated);
      return updated;
    });
    setVerifyBlock(null);
    setActiveVerifyBlock(null);
    setVerifyResult(null);
    toast({
      title: `⏳ Waiting period: ${daysRemaining} days`,
      description: 'Card marked as waiting. Come back when the SEO signals have had time to propagate.',
    });
  };
  const resetCanvas  = ()=>{
    setBlocks(bs=>{const r=bs.map(b=>({...b,placed:false,status:'todo' as Status}));setRecommendation(getNextRecommendation([],r));scheduleAutoSave(r);return r;});
    setLastImpact(null);
    toast({title:'Canvas reset'});
  };

  const autoFillCanvas = async () => {
    if (!blocks.some(b => !b.placed)) {
      toast({title:'All blocks already placed!', description:'Reset canvas first to re-fill.'});
      return;
    }
    setAutoFilling(true);
    await new Promise(r => setTimeout(r, 100)); // let UI update
    setBlocks(prev => {
      const updated = [...prev];
      const weekCaps = {1:8, 2:8, 3:8, 4:8, 5:999};
      const weekCounts: Record<number,number> = {};
      // Count existing placed per week
      prev.filter(b=>b.placed).forEach(b => { weekCounts[b.week] = (weekCounts[b.week]||0)+1; });
      // Sort library blocks by expert order: technical > quick-win > content > geo > competitive > weekly > insight > kpi > monthly > custom
      const typeOrder: Record<BType,number> = {'technical':0,'quick-win':1,'content':2,'geo':3,'competitive':4,'weekly':5,'insight':6,'kpi':7,'monthly':8,'custom':9};
      const priOrder:  Record<Priority,number> = {'high':0,'medium':1,'low':2};
      const lib = prev.filter(b=>!b.placed)
        .sort((a,b)=> typeOrder[a.type]-typeOrder[b.type] || priOrder[a.priority]-priOrder[b.priority]);
      for (const block of lib) {
        // Prefer the week the strategy already assigned to this block.
        // assignWeek() is only used as a fallback for blocks with no explicit week.
        const preferredWeek = (block.week && block.week >= 1 && block.week <= 5)
          ? block.week
          : assignWeek(block);
        // Try preferred week first, then fall through to find space elsewhere
        const weeks = [preferredWeek, ...([1,2,3,4,5].filter(w=>w!==preferredWeek))];
        for (const w of weeks) {
          if ((weekCounts[w]||0) < weekCaps[w]) {
            const idx2 = updated.findIndex(b=>b.id===block.id);
            if (idx2>=0) updated[idx2] = {...updated[idx2], placed:true, week:w};
            weekCounts[w] = (weekCounts[w]||0)+1;
            break;
          }
        }
      }
      scheduleAutoSave(updated);
      return updated;
    });
    setAutoFilling(false);
    toast({title:'Canvas auto-filled!', description:'All blocks placed by AI recommendation. Drag to adjust.'});
  };

  const assignBlock = (blockId: string, assignee: string) => {
    setBlocks(prev => {
      const updated = prev.map(b => b.id===blockId ? {...b, assignee} : b);
      scheduleAutoSave(updated);
      return updated;
    });
    setShowAssignModal(null);
  };

  const highlightBlock = (id:string)=>{
    setFilterType('all');
    setHighlightId(id);
    setTimeout(()=>setHighlightId(null),3000);
    document.getElementById(`lib-block-${id}`)?.scrollIntoView({behavior:'smooth',block:'nearest'});
  };

  const addCustomBlock = ()=>{
    if(!custTitle.trim()) return;
    const nb:Block={id:uid(),type:'custom',title:custTitle,content:custContent||'Custom planning block.',color:'#94a3b8',priority:'medium',status:'todo',week:5,placed:false,tags:['custom'],source:'Manual'};
    setBlocks(bs=>{const u=[...bs,nb];setRecommendation(getNextRecommendation(u.filter(b=>b.placed),u.filter(b=>!b.placed)));return u;});
    setCustTitle('');setCustContent('');setShowAdd(false);setCustSuggest(null);
    const sug=suggestWeekForCustom(custTitle,custContent,blocks);
    toast({title:'Block added to library!',description:`Suggested: ${sug.week===5?'Backlog':`Week ${sug.week}`} — ${sug.reason}`});
    scheduleAutoSave(blocks);
  };

  const generateAgenda = async (week: number) => {
    const weekLabel = week === 5 ? 'Backlog' : `Week ${week}`;
    const weekCards = blocks.filter(b => b.placed && b.week === week);
    if (weekCards.length === 0) {
      toast({ title: 'No cards in this week', description: 'Drag some cards into this week first.' });
      return;
    }
    setAgendaWeek(week);
    setAgendaLoading(week);
    setAgendaText(prev => ({ ...prev, [week]: '' }));
    setAgendaStale(prev => { const n = new Set(prev); n.delete(week); return n; });

    const proj = {
      company:  client?.company  || '',
      industry: client?.industry || '',
      url:      selProj?.url     || '',
      scores:   '',
    };

    try {
      const res = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'agenda',
          week,
          weekLabel,
          weekCards,
          allPlacedCards: blocks.filter(b => b.placed),
          libraryCards:   blocks.filter(b => !b.placed),
          projectContext: proj,
          projectId: selProjId,
        }),
      });
      if (!res.ok || !res.body) throw new Error('Request failed');
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setAgendaText(prev => ({ ...prev, [week]: acc }));
      }
    } catch (e: any) {
      setAgendaText(prev => ({ ...prev, [week]: `Error: ${e.message}` }));
    }
    setAgendaLoading(null);
    // Save completed agenda to Supabase
    setAgendaText(prev => {
      const text = prev[week];
      if (text && text.length > 100 && !text.startsWith('Error') && selProjId) {
        supabase.from('ai_content_cache').upsert({
          project_id: selProjId,
          content_type: `agenda_${week}`,
          content: text,
          status: 'complete',
        }, { onConflict: 'project_id,content_type' });
      }
      return prev;
    });
  };

  // Mark agenda stale when cards in that week change
  const markAgendaStale = (week: number) => {
    setAgendaStale(prev => new Set([...prev, week]));
  };

  const callPipelineChat = async (q: string, mode: string, focusId?: string|null) => {
    const proj = `${client?.company||''} | ${selProj?.url||''} | ${client?.industry||''}`;
    const url  = (checkUrl.trim() || selProj?.url || '').trim();
    const body = { question: q, role: activeRole, blocks, projectSummary: proj,
      focusBlockId: focusId || null, mode,
      checkUrl: url || null, projectId: selProjId };

    const streamTo = async (
      setter: (v: string) => void,
      setLoading: (v: boolean) => void,
      cacheKey?: string
    ) => {
      setter(''); setLoading(true);
      let acc = '';
      try {
        const res = await fetch('/api/intelligence', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);
        const reader = res.body.getReader(); const dec = new TextDecoder();
        while (true) {
          const {done, value} = await reader.read(); if (done) break;
          acc += dec.decode(value, {stream: true}); setter(acc);
        }
        // Save to Supabase cache
        if (cacheKey && selProjId && acc.length > 100 && !acc.includes('[Generation error')) {
          supabase.from('ai_content_cache').upsert({
            project_id: selProjId, content_type: cacheKey,
            content: acc, status: 'complete',
          }, { onConflict: 'project_id,content_type' });
        }
      } catch(e: any) {
        setter(`Error generating content: ${(e as Error).message}

Please try again — if the problem persists, check your network connection.`);
      }
      setLoading(false);
    };

    if (mode === 'pipeline') {
      await streamTo(setPipelineText, setPipelineLoading, 'pipeline');
    } else if (mode === 'dependencies') {
      setDepFocusId(focusId||null);
      await streamTo(setDepText, setDepLoading, `deps_${focusId||'all'}`);
    } else {
      await streamTo(setRoleChat, setRoleChatLoading);
    }
  };

  const deepDive = async(block:Block)=>{
    setDdBlock(block);setDdText('');setDdLoading(true);
    const proj=`${client?.company||'Client'} | ${selProj?.url||''} | ${client?.industry||''}`;
    try {
      const res=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'deep_dive',focusBlockId:block.id,blocks,projectSummary:proj,role:activeRole,dataRoom:projContext,cardRequirements:cardReqCache[block.id]||[]})});
      if(!res.ok||!res.body) throw new Error('Request failed');
      const reader=res.body.getReader();const dec=new TextDecoder();let acc='';
      while(true){const{done,value}=await reader.read();if(done)break;acc+=dec.decode(value,{stream:true});setDdText(acc);}
    } catch(e:any){setDdText(`Error: ${e.message}`);}
    setDdLoading(false);
  };

  /* ══ Create a card from a chat response ══ */
  // ── Similarity check helper ──
  const findSimilarBlocks = (title: string, type: BType): Block[] => {
    const normT = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
    const candidateWords = new Set(normT(title).split(' ').filter(w => w.length > 3));
    return blocks.filter(b => {
      if (b.id === '') return false;
      const existNorm = normT(b.title);
      // Exact or near-exact title match
      if (existNorm.includes(normT(title).slice(0,30)) || normT(title).includes(existNorm.slice(0,30))) return true;
      // Same type + shared significant words (≥2 words in common)
      const existWords = new Set(existNorm.split(' ').filter((w:string) => w.length > 3));
      const shared = [...candidateWords].filter(w => existWords.has(w));
      return b.type === type && shared.length >= 2;
    });
  };

  const addCardFromChat = (cardData: {title:string;type:BType;week:number;priority:Priority;content:string}, source: string) => {
    // Check for similar existing cards before adding
    const similar = findSimilarBlocks(cardData.title, cardData.type);
    if (similar.length > 0) {
      // Show merge/create choice modal
      setSimilarCardConflict({ proposed: cardData, source, matches: similar });
      return;
    }
    doAddCard(cardData, source);
  };

  const doAddCard = (cardData: {title:string;type:BType;week:number;priority:Priority;content:string}, source: string) => {
    const newBlock: Block = {
      id:         uid(),
      type:       cardData.type,
      title:      cardData.title.slice(0, 70),
      content:    cardData.content,
      color:      TM[cardData.type]?.color || '#94a3b8',
      priority:   cardData.priority,
      status:     'todo',
      week:       cardData.week,
      placed:     true,
      tags:       ['from-chat'],
      source:     source || 'Added from chat',
    };
    setBlocks(prev => {
      const updated = [...prev, newBlock];
      scheduleAutoSave(updated);
      return updated;
    });
    setCreateCardFrom(null);
    setSimilarCardConflict(null);
    toast({ title: `Card added to Week ${cardData.week === 5 ? 'Backlog' : cardData.week}`, description: `"${newBlock.title}" placed on your canvas.` });
  };

  const mergeIntoExistingCard = (existingId: string, cardData: {title:string;type:BType;week:number;priority:Priority;content:string}) => {
    setBlocks(prev => {
      const updated = prev.map(b => {
        if (b.id !== existingId) return b;
        // Merge: append the new content to the existing card's content
        return {
          ...b,
          content:  b.content + '\n\n--- Merged scope ---\n' + cardData.content,
          priority: cardData.priority === 'high' ? 'high' : b.priority, // escalate priority if needed
          tags:     [...(b.tags||[]), 'scope-expanded'],
        };
      });
      scheduleAutoSave(updated);
      return updated;
    });
    setCreateCardFrom(null);
    setSimilarCardConflict(null);
    toast({ title: 'Card scope expanded', description: 'New details merged into the existing card.' });
  };


  const askCanvas = async()=>{
    if(!chatQ.trim()||chatLoading) return;
    setChatLoading(true);setChatResp('');
    const proj=`${client?.company||'Client'} | ${selProj?.url||''} | ${client?.industry||''}`;
    try {
      const res=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:chatQ,blocks:placedBlocks,projectSummary:proj,role:activeRole,dataRoom:projContext})});
      if(!res.ok||!res.body) throw new Error(`Server error ${res.status} — please try again`);
      const reader=res.body.getReader();const dec=new TextDecoder();let acc='';
      while(true){const{done,value}=await reader.read();if(done)break;acc+=dec.decode(value,{stream:true});setChatResp(acc);chatEndRef.current?.scrollIntoView({behavior:'smooth'});}
    } catch(e:any){
      setChatResp(`Error: ${(e as Error).message}`);
    } finally {
      // Always clear loading state — prevents permanent spinner if stream hangs or errors
      setChatLoading(false);
    }
  };

  const saveCanvas = async (currentBlocks: Block[]) => {
    if (!selProjId) return;
    if (currentBlocks.length === 0) return; // never overwrite with empty
    // Save FULL block state for all blocks so nothing is lost on reload.
    // Placed blocks keep their position/status/assignee/aiAssisted/etc.
    // Library blocks keep their current state too (tags, edits, etc.)
    const snapshot = currentBlocks.map(b => ({
      id:          b.id,
      placed:      b.placed,
      week:        b.week,
      status:      b.status,
      assignee:    b.assignee    || null,
      aiAssisted:  b.aiAssisted  || false,
      tags:        b.tags        || [],
      effort:      b.effort      || null,
      impact:      b.impact      || null,
      // Save title/content/type/source/priority/color for user-created cards.
      // Strategy cards regenerate these from buildLibraryFromStrategy — but
      // manually-added cards ONLY exist here, so we must preserve them.
      title:       b.title,
      content:     b.content,
      type:        b.type,
      priority:    b.priority,
      color:       b.color,
      source:      b.source      || null,
    }));
    try {
      await supabase.from('projects').update({ playground_canvas: snapshot }).eq('id', selProjId);
    } catch(e) { console.warn('[SEO Season] Canvas save failed:', e); }
  };

  const scheduleAutoSave = (currentBlocks: Block[]) => {
    if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveCanvas(currentBlocks), 800);
  };

  useEffect(() => {
    if (blocks.length > 0 && selProjId) scheduleAutoSave(blocks);
  }, [blocks, selProjId]);

  const dlReport = (r:any,t:string)=>{const b=new Blob([safeStr(r.sections?.[t])],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${t}-audit-${r.created_at?.split('T')[0]}.md`;a.click();URL.revokeObjectURL(a.href);};
  const cpReport = async(r:any,t:string)=>{await navigator.clipboard.writeText(safeStr(r.sections?.[t]));toast({title:'Copied!'});};
  const s = strategy;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav companyName={client?.company?`${client.company} — Playground`:'Intelligence Playground'} projects={projects} selectedProjectId={selProjId} onProjectChange={setSelProjId} />

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold mb-1 flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Intelligence Playground</h1>
            <p className="text-sm text-muted-foreground">AI-generated strategy blocks. Drag into weekly slots for guided, expert feedback on every move.</p>
          </div>
          <div className="flex items-center gap-3">
            {genAt && <span className="text-xs font-mono text-muted-foreground">Updated {fmtDate(genAt)}</span>}
            <div className="flex items-center gap-2">
              {failedBatches.length > 0 && (
                <button onClick={resumeMissingBatches} disabled={generating}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-yellow-400/30 bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 font-medium">
                  <RefreshCw size={12} className={generating?'animate-spin':''}/>Resume {failedBatches.length} section{failedBatches.length!==1?'s':''}
                </button>
              )}
              {Object.keys(batchStatus).length > 0 && (
                <div className="flex items-center gap-1 text-xs">
                  {[1,2,3].map(n=>(
                    <span key={n} title={`Batch ${n}: ${batchStatus[String(n)]||'pending'}`}
                      className={`px-1.5 py-0.5 rounded font-mono ${batchStatus[String(n)]==='ok'?'bg-green-400/15 text-green-400':batchStatus[String(n)]==='failed'?'bg-red-400/15 text-red-400':'bg-secondary/40 text-muted-foreground'}`}>
                      B{n}
                    </span>
                  ))}
                </div>
              )}
              <Button onClick={generate} disabled={generating||!selProjId} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
              {generating ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Analysing…</> : <><Brain className="h-4 w-4 mr-2" />{strategy?'Regenerate':'Generate Strategy'}</>}
            </Button>
            </div>
          </div>
        </div>

        {/* Project picker */}
        {!selProjId && (
          <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
            <Brain className="h-12 w-12 text-primary/30 mx-auto mb-4" />
            <h3 className="font-bold text-lg mb-3">Select a project</h3>
            <select value={selProjId} onChange={e=>setSelProjId(e.target.value)} className="h-10 rounded-lg border border-border bg-background/60 text-sm px-4">
              <option value="">— Choose project —</option>
              {clients.map(c=>{
                const cp=projects.filter(p=>p.client_id===c.id);
                if(!cp.length) return null;
                return (
                  <optgroup key={c.id} label={`${c.name} — ${c.company}`}>
                    {cp.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>
        )}

        {selProjId && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 border-b border-border">
              
                {[
                  {id:'reports',   label:'Reports',    icon:FileText},
                  {id:'strategy',  label:'Strategy',   icon:Brain  },
                  {id:'canvas',    label:'Canvas',     icon:Layers },
                  {id:'pipeline',  label:'Pipeline',   icon:Target },
                ].map(({id,label,icon:Icon})=>(
                  <button key={id} onClick={()=>setTab(id as Tab)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab===id?'border-primary text-foreground':'border-transparent text-muted-foreground hover:text-foreground'}`}>
                    <Icon size={14}/>
                    <span className="hidden sm:inline">{label}</span>
                    {id==='canvas'&&blocks.length>0&&<span className="text-xs bg-primary/10 text-primary rounded-full px-1.5">{blocks.length}</span>}
                  </button>
                ))}
            </div>

            {/* ── REPORTS ── */}
            {tab==='reports' && (
              <div className="space-y-4">
                {reports.length===0 ? (
                  <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <h3 className="font-semibold mb-1">No reports saved yet</h3>
                    <p className="text-sm text-muted-foreground">Run audits from the Audit Tool — they auto-save here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reports.map(report=>{
                      const types=Object.keys(report.sections||{});
                      const exp=expandedRep===report.id;
                      return (
                        <div key={report.id} className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                          <button onClick={()=>setExpandedRep(exp?null:report.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-colors">
                            <div className="flex items-center gap-4">
                              <span className="text-sm font-semibold">{fmtDate(report.created_at)}</span>
                              <div className="flex gap-1.5">
                                {types.map(t=><span key={t} className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary/40 text-muted-foreground font-mono">{t}</span>)}
                              </div>
                              {report.synced_to_metrics&&<span className="text-xs text-green-400 font-mono flex items-center gap-1"><CheckCircle2 size={10}/>Synced</span>}
                            </div>
                              <div className="flex items-center gap-2">
                               <button
                                 onClick={async(e)=>{
                                   e.stopPropagation();
                                   if(!confirm('Delete this audit report? This cannot be undone.')) return;
                                   await supabase.from('audit_reports').delete().eq('id', report.id);
                                   setReports(prev=>prev.filter(r=>r.id!==report.id));
                                   if(expandedRep===report.id) setExpandedRep(null);
                                   toast({title:'Report deleted'});
                                 }}
                                 className="h-7 w-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30 transition-colors"
                                 title="Delete this report"
                               >
                                 <X size={12}/>
                               </button>
                               {exp?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
                             </div>
                          </button>
                          {exp && (
                            <div className="border-t border-border px-5 py-4 space-y-4">
                              {types.map(type=>(
                                <div key={type} className="rounded-xl border border-border bg-background/40 overflow-hidden">
                                  <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/30 border-b border-border">
                                    <span className="text-xs font-semibold font-mono">{type} Audit</span>
                                    <div className="flex gap-2">
                                      <button onClick={()=>cpReport(report,type)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border bg-background/60"><Copy size={10}/>Copy</button>
                                      <button onClick={()=>dlReport(report,type)} className="flex items-center gap-1 text-xs text-primary px-2 py-1 rounded border border-primary/30 bg-primary/5"><Download size={10}/>Download .md</button>
                                    </div>
                                  </div>
                                  <div className="p-4 max-h-72 overflow-y-auto">
                                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono">
                                      {safeStr(report.sections[type]).slice(0,3000)}
                                      {safeStr(report.sections[type]).length>3000?'\n\n[truncated — download for full report]':''}
                                    </pre>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── STRATEGY ── */}
            {tab==='strategy' && (
              <div className="space-y-4">
                {!strategy ? (
                  <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
                    <Brain className="h-12 w-12 text-primary/30 mx-auto mb-4" />
                    <h3 className="font-bold text-lg mb-2">Ask Manav Brain for Strategy</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">Manav Brain analyses every audit, metric, keyword, and competitor gap then produces a complete strategic brief plus 12-16 canvas blocks ready to drag and plan with.</p>
                    <Button onClick={generate} disabled={generating} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground"><Brain className="h-4 w-4 mr-2"/>Generate with Manav Brain</Button>
                  </div>
                ) : (
                  <>
                    {/* Data gaps blocking notification — with exact Data Room guidance */}
                    {(s.data_gaps?.length > 0 || s.data_gaps_blocking?.length > 0) && (() => {
                      // Map gap descriptions to exact Data Room tab + field
                      // Each entry is checked with gap.toLowerCase().includes(key)
                      // Keys ordered from most-specific to least-specific to avoid false matches
                      const GAP_GUIDE: { match: string; tab: string; label: string; field: string; how: string }[] = [
                        // ── Technical / Indexation ──
                        { match:'indexed pages',   tab:'technical',    label:'Technical Baseline',        field:'Pages Indexed (GSC)',            how:'Open Google Search Console → Coverage → check "Valid" count and enter it here' },
                        { match:'index',           tab:'technical',    label:'Technical Baseline',        field:'Pages Indexed (GSC)',            how:'Open Google Search Console → Coverage → check "Valid" count and enter it here' },
                        { match:'crawl',           tab:'technical',    label:'Technical Baseline',        field:'Crawl Errors',                   how:'Open GSC → Coverage → "Error" tab and count the errors, then enter here' },
                        { match:'sitemap',         tab:'technical',    label:'Technical Baseline',        field:'Sitemap URL',                    how:'Enter your sitemap URL (usually yourdomain.com/sitemap.xml) in Technical tab' },
                        { match:'pagespeed',       tab:'cms',          label:'CMS & Tech Stack',          field:'PageSpeed Mobile Score',         how:'Run your site at pagespeed.web.dev and enter the mobile and desktop scores' },
                        { match:'page speed',      tab:'cms',          label:'CMS & Tech Stack',          field:'PageSpeed Mobile Score',         how:'Run your site at pagespeed.web.dev and enter the mobile and desktop scores' },
                        { match:'core web',        tab:'cms',          label:'CMS & Tech Stack',          field:'PageSpeed Mobile Score',         how:'Run your site at pagespeed.web.dev — it shows Core Web Vitals too' },
                        { match:'schema',          tab:'technical',    label:'Technical Baseline',        field:'Schema Markup',                  how:'Check if schema is installed in your CMS or paste a URL into validator.schema.org' },
                        { match:'canonical',       tab:'technical',    label:'Technical Baseline',        field:'Canonical Issues',               how:'Run a quick Screaming Frog crawl — filter by "Canonical" to find issues' },
                        { match:'robots',          tab:'technical',    label:'Technical Baseline',        field:'robots.txt Status',              how:"Visit yourdomain.com/robots.txt — check it loads and isn't blocking key pages" },
                        { match:'redirect',        tab:'technical',    label:'Technical Baseline',        field:'Crawl Errors',                   how:'Check GSC Coverage for redirect errors, or run Screaming Frog on key URLs' },
                        { match:'broken link',     tab:'technical',    label:'Technical Baseline',        field:'Broken Links',                   how:'Run Screaming Frog or Ahrefs Site Audit → filter by 404 status' },
                        { match:'duplicate',       tab:'technical',    label:'Technical Baseline',        field:'Duplicate Content',              how:'Check Screaming Frog → Page Titles filter for duplicates' },
                        { match:'technical',       tab:'technical',    label:'Technical Baseline',        field:'Pages Indexed (GSC)',            how:'Fill in Technical Baseline — start with Pages Indexed from GSC Coverage tab' },

                        // ── Analytics / Traffic ──
                        { match:'brand mention',   tab:'analytics',    label:'Analytics Baseline',        field:'Brand Mentions',                 how:'Check Google Alerts or Mention.com for your brand name, enter approximate monthly count' },
                        { match:'mention',         tab:'analytics',    label:'Analytics Baseline',        field:'Brand Mentions',                 how:'Check Google Alerts or Mention.com for your brand name, enter approximate monthly count' },
                        { match:'organic traffic', tab:'analytics',    label:'Analytics Baseline',        field:'Monthly Organic Sessions',       how:'In GA4 → Acquisition → Traffic Acquisition, filter by Organic Search' },
                        { match:'organic session', tab:'analytics',    label:'Analytics Baseline',        field:'Monthly Organic Sessions',       how:'In GA4 → Acquisition → Traffic Acquisition, filter by Organic Search' },
                        { match:'bounce rate',     tab:'analytics',    label:'Analytics Baseline',        field:'Bounce Rate',                    how:'In GA4 → Engagement rate (inverse of bounce rate) for organic sessions' },
                        { match:'session duration',tab:'analytics',    label:'Analytics Baseline',        field:'Avg Session Duration',           how:'In GA4 → Engagement → Average engagement time per session' },
                        { match:'conversion',      tab:'analytics',    label:'Analytics Baseline',        field:'Monthly Conversions',            how:'In GA4 → Conversions → set up your key conversion event and check monthly count' },
                        { match:'impressions',     tab:'documents',    label:'Documents',                 field:'Upload GSC Export',              how:'In GSC → Performance → Date range → Export CSV, then upload here' },
                        { match:'clicks',          tab:'documents',    label:'Documents',                 field:'Upload GSC Export',              how:'In GSC → Performance → Date range → Export CSV, then upload here' },
                        { match:'average position',tab:'documents',    label:'Documents',                 field:'Upload GSC Export',              how:'In GSC → Performance → Date range → Export CSV, then upload here' },
                        { match:'traffic',         tab:'analytics',    label:'Analytics Baseline',        field:'Monthly Organic Sessions',       how:'In GA4 → Acquisition → Traffic Acquisition, filter by Organic Search' },
                        { match:'analytics',       tab:'analytics',    label:'Analytics Baseline',        field:'Monthly Organic Sessions',       how:'In GA4 → Acquisition → Traffic Acquisition, filter by Organic Search' },
                        { match:'baseline',        tab:'analytics',    label:'Analytics Baseline',        field:'Monthly Organic Sessions',       how:'Start by entering your current monthly organic sessions — this is your baseline' },

                        // ── GEO / AI Visibility ──
                        { match:'perplexity',      tab:'analytics',    label:'Analytics Baseline',        field:'GEO / Perplexity Citations',     how:'Search your brand and key queries in Perplexity.ai — count citations and enter here' },
                        { match:'chatgpt',         tab:'analytics',    label:'Analytics Baseline',        field:'GEO / ChatGPT Citations',        how:'Ask relevant questions in ChatGPT — check if your brand appears and enter count' },
                        { match:'google ai',       tab:'analytics',    label:'Analytics Baseline',        field:'GEO / Google AI Overview',       how:'Search your target queries in Google — check for AI Overview mentions' },
                        { match:'llm',             tab:'analytics',    label:'Analytics Baseline',        field:'LLM Visibility Score',           how:'This is calculated from GEO metrics — fill in your Perplexity/ChatGPT citation counts first' },
                        { match:'ai visibility',   tab:'analytics',    label:'Analytics Baseline',        field:'LLM Visibility Score',           how:'This is calculated from GEO metrics — fill in your Perplexity/ChatGPT citation counts first' },
                        { match:'citation',        tab:'analytics',    label:'Analytics Baseline',        field:'GEO / Perplexity Citations',     how:'Search your brand in Perplexity.ai and ChatGPT — count citations and record here' },
                        { match:'geo',             tab:'analytics',    label:'Analytics Baseline',        field:'GEO / Perplexity Citations',     how:'Search your brand in Perplexity.ai and ChatGPT — count citations and record here' },

                        // ── Scores / Health ──
                        { match:'eeat',            tab:'documents',    label:'Documents',                 field:'Upload audit report',            how:'Run an SEO audit from the Audit Tool — E-E-A-T score is calculated automatically' },
                        { match:'authority score', tab:'documents',    label:'Documents',                 field:'Upload audit report',            how:'Run an SEO audit from the Audit Tool — authority score is calculated from it' },
                        { match:'health score',    tab:'documents',    label:'Documents',                 field:'Upload audit report',            how:'Run an SEO audit — algorithm health score is calculated automatically' },
                        { match:'algorithm',       tab:'documents',    label:'Documents',                 field:'Upload audit report',            how:'Run an SEO audit from the Audit Tool — algorithm health is calculated automatically' },
                        { match:'growth score',    tab:'analytics',    label:'Analytics Baseline',        field:'Monthly Organic Sessions',       how:'Growth score is calculated from your analytics baseline — fill in monthly sessions first' },
                        { match:'score',           tab:'documents',    label:'Documents',                 field:'Upload audit report',            how:'Run an SEO audit from the Audit Tool — it calculates all SEO health scores automatically' },
                        { match:'audit',           tab:'documents',    label:'Documents',                 field:'Upload audit report',            how:'Run an audit from the Audit Tool — it saves automatically to your project' },

                        // ── Keyword / Rankings ──
                        { match:'keyword ranking', tab:'documents',    label:'Documents',                 field:'Upload Semrush/Ahrefs export',   how:'Export keyword rankings from Semrush (Position Tracking) or Ahrefs (Rank Tracker) as CSV' },
                        { match:'ranking data',    tab:'documents',    label:'Documents',                 field:'Upload Semrush/Ahrefs export',   how:'Export keyword rankings from Semrush (Position Tracking) or Ahrefs (Rank Tracker) as CSV' },
                        { match:'position',        tab:'documents',    label:'Documents',                 field:'Upload GSC Export',              how:'GSC → Performance → export CSV shows average position for all keywords' },
                        { match:'keyword',         tab:'goals',        label:'Campaign Goals',            field:'Top 3 Target Keywords',          how:'Enter your 3 most important target keywords in the Goals tab' },
                        { match:'ranking',         tab:'documents',    label:'Documents',                 field:'Upload Semrush/Ahrefs export',   how:'Export keyword rankings from Semrush or Ahrefs and upload as CSV' },

                        // ── Backlinks / Authority ──
                        { match:'backlink',        tab:'documents',    label:'Documents',                 field:'Upload Ahrefs/Semrush export',   how:'In Ahrefs → Backlink profile → Export, or Semrush → Backlinks → Export as CSV' },
                        { match:'referring domain',tab:'competitors',  label:'Competitor Intelligence',   field:'Our Referring Domains',          how:'Check your domain in Ahrefs or Semrush → Referring Domains count' },
                        { match:'domain rating',   tab:'competitors',  label:'Competitor Intelligence',   field:'Our Domain Rating (DR)',         how:'Check your domain in Ahrefs → Overview — Domain Rating shown at the top' },
                        { match:'domain authorit', tab:'competitors',  label:'Competitor Intelligence',   field:'Our Domain Rating (DR)',         how:'Check your domain in Moz or Ahrefs — Domain Authority/Rating shown in overview' },
                        { match:'link',            tab:'documents',    label:'Documents',                 field:'Upload Ahrefs/Semrush export',   how:'Export backlink data from Ahrefs or Semrush and upload as CSV' },

                        // ── Competitors ──
                        { match:'competitor',      tab:'competitors',  label:'Competitor Intelligence',   field:'Main Competitor #1',             how:'Enter the top 2-3 competitor domains in the Competitors tab' },
                        { match:'content gap',     tab:'documents',    label:'Documents',                 field:'Upload Semrush/Ahrefs export',   how:'Run a Content Gap analysis in Semrush or Ahrefs and export as CSV' },
                        { match:'gap',             tab:'documents',    label:'Documents',                 field:'Upload Semrush/Ahrefs export',   how:'Run a Content Gap or Keyword Gap analysis in Semrush/Ahrefs and export as CSV' },

                        // ── Goals / CMS ──
                        { match:'goal',            tab:'goals',        label:'Campaign Goals',            field:'Primary Business Goal',          how:'Set your campaign goal and success metric in the Goals tab' },
                        { match:'timeline',        tab:'goals',        label:'Campaign Goals',            field:'Target Timeline',                how:'Set your target timeline in the Goals tab — e.g. 3 months, 6 months' },
                        { match:'cms',             tab:'cms',          label:'CMS & Tech Stack',          field:'CMS / Platform',                 how:'Select your CMS (WordPress, Shopify, Webflow etc.) in the CMS tab' },
                        { match:'wordpress',       tab:'cms',          label:'CMS & Tech Stack',          field:'WordPress Version',              how:'Check wp-admin → Dashboard → At a Glance for your WordPress version' },
                        { match:'plugin',          tab:'cms',          label:'CMS & Tech Stack',          field:'SEO Plugin',                     how:'Check your installed SEO plugin (Yoast, RankMath, etc.) in the CMS tab' },

                        // ── GSC specific ──
                        { match:'gsc',             tab:'documents',    label:'Documents',                 field:'Upload GSC Performance Export',  how:'In GSC → Performance → set date range → Export CSV, then upload here' },
                        { match:'search console',  tab:'documents',    label:'Documents',                 field:'Upload GSC Performance Export',  how:'In GSC → Performance → set date range → Export CSV, then upload here' },
                      ];

                      const allGaps = [...(s.data_gaps||[]), ...(s.data_gaps_blocking||[])];

                      const mapGap = (gap: string) => {
                        const lower = gap.toLowerCase();
                        // Find first entry whose match string appears in the gap text
                        const found = GAP_GUIDE.find(entry => lower.includes(entry.match));
                        if (found) return found;
                        // Nothing matched — generic fallback
                        return { match:'', tab:'analytics', label:'Analytics Baseline', field:'Monthly Organic Sessions', how:"Fill in your analytics baseline as a starting point — it's the most impactful first step" };
                      };

                      return (
                        <div className="rounded-2xl border border-yellow-400/25 bg-yellow-400/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={14} className="text-yellow-400 shrink-0"/>
                            <span className="font-semibold text-sm text-yellow-400">
                              {allGaps.length} analysis gap{allGaps.length!==1?'s':''} — fill these in Data Room then regenerate
                            </span>
                          </div>
                          <div className="space-y-2">
                            {allGaps.map((gap:string, i:number) => {
                              const guide = mapGap(gap);
                              return (
                                <div key={i} className="rounded-xl border border-yellow-400/15 bg-background/40 p-3 space-y-1.5">
                                  <div className="flex items-start gap-2">
                                    <span className="text-yellow-400 shrink-0 font-bold text-xs mt-0.5">{i+1}.</span>
                                    <p className="text-xs text-foreground font-medium leading-snug">{gap}</p>
                                  </div>
                                  <div className="ml-4 flex flex-wrap items-center gap-2">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                      <ChevronRight size={10} className="text-primary shrink-0"/>
                                      <span className="text-primary font-medium">Data Room → {guide.label}</span>
                                      <span>→</span>
                                      <span className="font-medium text-foreground">{guide.field}</span>
                                    </div>
                                  </div>
                                  <p className="ml-4 text-xs text-muted-foreground leading-relaxed">{guide.how}</p>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-2 pt-1 border-t border-yellow-400/15 flex-wrap">
                            <p className="text-xs text-muted-foreground flex-1">Fill these gaps then click Regenerate Strategy — you'll get more accurate, evidence-backed cards.</p>
                            <Button size="sm" onClick={generate} disabled={generating}
                              className="h-7 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 text-xs">
                              {generating ? <><RefreshCw size={10} className="animate-spin mr-1"/>Regenerating…</> : <><RefreshCw size={10} className="mr-1"/>Regenerate now</>}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <Star className="h-4 w-4 text-primary" />
                        <span className="font-semibold">Executive Summary</span>
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border font-mono ${s.overall_health==='Strong'||s.overall_health==='Excellent'?'text-green-400 bg-green-400/10 border-green-400/20':s.overall_health==='Building'?'text-yellow-400 bg-yellow-400/10 border-yellow-400/20':'text-orange-400 bg-orange-400/10 border-orange-400/20'}`}>{s.overall_health}</span>
                      </div>
                      <p className="text-sm leading-relaxed mb-4">{s.executive_summary}</p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {s.biggest_opportunity && <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-3"><div className="text-xs font-mono text-green-400 uppercase mb-1">Biggest Opportunity</div><p className="text-xs">{s.biggest_opportunity}</p></div>}
                        {s.biggest_risk        && <div className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3"><div className="text-xs font-mono text-orange-400 uppercase mb-1">Biggest Risk</div><p className="text-xs">{s.biggest_risk}</p></div>}
                      </div>
                    </div>
                    {s.quick_wins?.length>0 && (
                      <Section title={`Quick Wins (${s.quick_wins.length})`} icon={Zap} color="#4ade80" defaultOpen>
                        <div className="mt-4 grid sm:grid-cols-2 gap-3">
                          {s.quick_wins.map((w:any,i:number)=>(
                            <div key={i} className="rounded-xl border border-green-400/20 bg-green-400/5 p-3">
                              <div className="font-semibold text-sm mb-1">{w.title}</div>
                              <p className="text-xs text-muted-foreground mb-2">{w.description}</p>
                              <div className="flex gap-1.5">
                                <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">{w.timeframe}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">impact: {w.impact}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}
                    {s.weekly_plans?.length>0 && (
                      <Section title="4-Week Action Plan" icon={Calendar} color="#60a5fa">
                        <div className="mt-4 space-y-3">
                          {s.weekly_plans.map((w:any)=>(
                            <div key={w.week} className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="h-7 w-7 rounded-full bg-blue-400/10 border border-blue-400/30 flex items-center justify-center text-xs font-bold text-blue-400">{w.week}</div>
                                <div><div className="font-semibold text-sm">{w.theme}</div><div className="text-xs text-muted-foreground">{w.focus}</div></div>
                              </div>
                              <div className="space-y-1 mb-2">
                                {(w.tasks||[]).map((t:string,i:number)=>(
                                  <div key={i} className="flex items-start gap-2 text-xs"><ChevronRight size={10} className="text-blue-400 shrink-0 mt-0.5"/><span>{t}</span></div>
                                ))}
                              </div>
                              {w.expected_outcome && <p className="text-xs text-blue-400/70 border-t border-blue-400/20 pt-2">→ {w.expected_outcome}</p>}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}
                    {s.monthly_roadmap?.length>0 && (
                      <Section title="3-Month Roadmap" icon={Layers} color="#a78bfa">
                        <div className="mt-4 grid sm:grid-cols-3 gap-4">
                          {s.monthly_roadmap.map((m:any)=>(
                            <div key={m.month} className="rounded-xl border border-purple-400/20 bg-purple-400/5 p-4">
                              <div className="text-xs font-mono text-purple-400 uppercase mb-2">Month {m.month}</div>
                              <div className="font-semibold text-sm mb-1">{m.title}</div>
                              <p className="text-xs text-muted-foreground mb-3">{m.goal||m.phase_goal}</p>
                              {(m.deliverables||m.key_deliverables||[]).map((d:string,i:number)=>(
                                <div key={i} className="flex items-start gap-1.5 text-xs mb-1"><ChevronRight size={9} className="text-purple-400 shrink-0 mt-0.5"/><span>{d}</span></div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}
                    {s.kpi_forecast?.length>0 && (
                      <Section title="KPI Forecast" icon={TrendingUp} color="#34d399">
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="border-b border-border">
                              <th className="text-left py-2 pr-4 text-muted-foreground">Metric</th>
                              <th className="text-center py-2 px-3 text-muted-foreground">Now</th>
                              <th className="text-center py-2 px-3 text-emerald-400">30d</th>
                              <th className="text-center py-2 px-3 text-emerald-400/70">60d</th>
                              <th className="text-center py-2 px-3 text-emerald-400/50">90d</th>
                            </tr></thead>
                            <tbody>
                              {s.kpi_forecast.map((k:any,i:number)=>(
                                <tr key={i} className="border-b border-border/40">
                                  <td className="py-2 pr-4 font-medium">{k.metric}</td>
                                  <td className="text-center py-2 px-3 text-muted-foreground">{k.now??k.current}</td>
                                  <td className="text-center py-2 px-3 text-emerald-400 font-semibold">{k.d30??k.target_30d}</td>
                                  <td className="text-center py-2 px-3 text-emerald-400/70">{k.d60??k.target_60d}</td>
                                  <td className="text-center py-2 px-3 text-emerald-400/50">{k.d90??k.target_90d}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Section>
                    )}
                    <div className="flex gap-3">
                      <Button onClick={()=>setTab('canvas')} className="flex-1 h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                        <Layers className="h-4 w-4 mr-2"/>Open Strategy Canvas →
                      </Button>
                      <button
                        onClick={deleteStrategy}
                        className="h-12 px-5 rounded-xl border border-red-400/20 text-red-400/60 hover:text-red-400 hover:border-red-400/40 hover:bg-red-400/5 text-sm transition-colors flex items-center gap-2"
                        title="Delete this strategy and start fresh"
                      >
                        <Trash2 size={14}/>Delete analysis
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── CANVAS ── */}
            {tab==='canvas' && (
              <div className="space-y-4">

                {/* ── Stale Section Banner ── */}
                {staleSections.length > 0 && (
                  <div className="rounded-2xl border border-orange-400/30 bg-orange-400/5 p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={15} className="text-orange-400 shrink-0"/>
                        <span className="font-semibold text-sm text-orange-400">
                          {staleSections.length} section{staleSections.length!==1?'s':''} need refreshing
                        </span>
                        <span className="text-xs text-muted-foreground">— your data has been updated since these were generated</span>
                      </div>
                      <button
                        onClick={refreshAllStale}
                        disabled={!!refreshing}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-400/15 border border-orange-400/30 text-orange-400 text-xs font-semibold hover:bg-orange-400/25 disabled:opacity-50 transition-colors"
                      >
                        {refreshing
                          ? <><RefreshCw size={11} className="animate-spin"/>Refreshing {SECTION_LABELS[refreshing]||refreshing}…</>
                          : <><RefreshCw size={11}/>Refresh all now</>}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {staleSections.map(s => (
                        <div key={s.section} className="flex items-center gap-2 rounded-xl border border-orange-400/20 bg-orange-400/8 px-3 py-1.5">
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-orange-300">{SECTION_LABELS[s.section]||s.section}</span>
                            {s.reason && <span className="text-xs text-muted-foreground ml-1.5">· {s.reason}</span>}
                          </div>
                          <button
                            onClick={()=>refreshSection(s.section)}
                            disabled={!!refreshing}
                            className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 disabled:opacity-40 font-medium ml-1 shrink-0"
                          >
                            {refreshing===s.section
                              ? <RefreshCw size={10} className="animate-spin"/>
                              : <><RefreshCw size={10}/>Refresh</>}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {blocks.length===0 && !strategy ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
                    <Layers size={48} className="text-muted-foreground/20 mx-auto mb-4"/>
                    <h3 className="font-bold text-lg mb-2">Canvas is empty</h3>
                    <p className="text-sm text-muted-foreground mb-5">Generate a strategy — Manav Brain will analyse all your data and create task blocks from goals, audit findings, and growth opportunities.</p>
                    <Button onClick={generate} disabled={generating} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground"><Brain className="h-4 w-4 mr-2"/>Generate with Manav Brain</Button>
                  </div>
                ) : (
                  <>
                    {/* Manav Brain greeting banner */}
                    {placedBlocks.length > 0 && (
                      <div className="rounded-2xl border border-primary/15 bg-primary/5 px-5 py-3 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 text-sm font-black text-primary">M</div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-foreground">Manav Brain </span>
                          <span className="text-sm text-muted-foreground">
                            {placedBlocks.filter(b=>b.status==='doing').length > 0
                              ? `— ${placedBlocks.filter(b=>b.status==='doing').length} task${placedBlocks.filter(b=>b.status==='doing').length!==1?' are':' is'} in progress. When done, click the status pill to submit for verification.`
                              : done > 0
                              ? `— ${done} task${done!==1?'s':''} verified. ${placedBlocks.filter(b=>b.status==='todo').length} remaining. ${progress >= 80 ? 'Close to the finish line.' : 'Keep going.'}`
                              : "— Ready when you are. Pick a card and let's get started."}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Progress bar */}
                    <div className="rounded-2xl border border-border bg-card/60 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-semibold">Overall Progress</span>
                          <span className="text-xs font-mono text-green-400">{done} done</span>
                          <span className="text-xs font-mono text-blue-400">{placedBlocks.filter(b=>b.status==='doing').length} in progress</span>
                          <span className="text-xs font-mono text-muted-foreground">{placedBlocks.filter(b=>b.status==='todo').length} todo</span>
                          <span className="text-xs font-mono text-muted-foreground">· {libBlocks.length} unplaced</span>
                        </div>
                        <span className="text-2xl font-black text-primary">{progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden mb-3">
                        <div className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-500" style={{width:`${progress}%`}}/>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {COLUMNS.map(col=>{
                          const cb=placedBlocks.filter(b=>b.week===col.week);
                          const cd=cb.filter(b=>b.status==='done').length;
                          return (
                            <div key={col.week} className="text-center">
                              <div className="text-xs text-muted-foreground mb-1 font-mono">{col.label}</div>
                              <div className="h-1 rounded-full bg-secondary overflow-hidden">
                                <div className="h-full bg-primary/60 transition-all" style={{width:cb.length>0?`${(cd/cb.length)*100}%`:'0%'}}/>
                              </div>
                              <div className="text-xs font-mono text-muted-foreground mt-1">{cd}/{cb.length}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── In Progress Guidance Banner ── */}
                    {placedBlocks.filter(b=>b.status==='doing').length > 0 && (
                      <div className="rounded-2xl border border-blue-400/25 bg-blue-400/5 px-4 py-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse"/>
                            <span className="text-sm font-semibold text-blue-400">
                              {placedBlocks.filter(b=>b.status==='doing').length} task{placedBlocks.filter(b=>b.status==='doing').length!==1?'s':''} In Progress
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground flex-1">
                            When done: <span className="font-medium text-foreground">scroll down to the Verification Queue below</span> and click <span className="font-medium text-primary">I'm done — please verify →</span> to open the 3-step wizard
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {placedBlocks.filter(b=>b.status==='doing').map(b=>(
                              <button key={b.id} onClick={e=>{e.stopPropagation();openVerifyModal(b);}}
                                className="text-xs px-2.5 py-1 rounded-lg border border-blue-400/30 bg-blue-400/10 text-blue-400 hover:bg-blue-400/20 font-medium truncate max-w-[160px]">
                                Verify: {b.title.slice(0,25)}{b.title.length>25?'…':''}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Waiting tasks reminder */}
                    {placedBlocks.filter(b=>b.status==='waiting').length > 0 && (
                      <div className="rounded-2xl border border-orange-400/25 bg-orange-400/5 px-4 py-3 flex items-center gap-3 flex-wrap">
                        <Clock size={14} className="text-orange-400 shrink-0"/>
                        <span className="text-sm font-semibold text-orange-400">
                          {placedBlocks.filter(b=>b.status==='waiting').length} task{placedBlocks.filter(b=>b.status==='waiting').length!==1?'s':''} in waiting period
                        </span>
                        <span className="text-xs text-muted-foreground flex-1">SEO signals need time to propagate. Come back and verify when the timer expires.</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {placedBlocks.filter(b=>b.status==='waiting').map(b=>(
                            <button key={b.id} onClick={()=>{setVerifyBlock(b);setVerifyResult(null);setVerifyStep(2);setCompletionNote('Marked as waiting previously — re-checking now');setEvidenceData('');}}
                              className="text-xs px-2 py-1 rounded border border-orange-400/30 text-orange-400 hover:bg-orange-400/10">
                              Check: {b.title.slice(0,20)}…
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Last drop impact */}
                    {lastImpact && (
                      <div className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 flex items-start gap-3">
                        <Activity className="h-4 w-4 text-primary shrink-0 mt-0.5"/>
                        <div className="flex-1">
                          <div className="text-xs font-semibold text-primary mb-0.5">
                            Placed: "{lastImpact.title}" → {lastImpact.week===5?'Backlog':`Week ${lastImpact.week}`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">Growth impact:</span> {lastImpact.metric}
                          </div>
                        </div>
                        <button onClick={()=>setLastImpact(null)} className="text-muted-foreground hover:text-foreground"><X size={12}/></button>
                      </div>
                    )}

                    {/* Next move recommendation */}
                    {recommendation && (
                      <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/5 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <Lightbulb className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5"/>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-1">Recommended next move</div>
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-sm font-semibold text-foreground truncate">"{recommendation.block.title}"</span>
                              <ArrowRight size={12} className="text-yellow-400 shrink-0"/>
                              <span className="text-sm font-semibold text-yellow-400">{recommendation.week===5?'Backlog':`Week ${recommendation.week}`}</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed mb-1">{recommendation.reason}</p>
                            <div className="flex items-center gap-1.5 text-xs">
                              <Flame size={10} className="text-orange-400"/>
                              <span className="font-semibold text-orange-400">Impact:</span>
                              <span className="text-muted-foreground">{recommendation.metric}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={()=>highlightBlock(recommendation.block.id)}
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-yellow-400/30 bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 transition-colors whitespace-nowrap"
                            >
                              Show in library
                            </button>
                            <button onClick={()=>setRecommendation(null)} className="text-muted-foreground hover:text-foreground"><X size={12}/></button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs font-mono text-muted-foreground px-1">
                        {blocks.filter(b=>!b.placed).length} in library · {placedBlocks.length} placed
                      </div>
                      <select value={filterType} onChange={e=>setFilterType(e.target.value as any)} className="h-8 text-xs px-2 rounded-xl border border-border bg-background/60 text-muted-foreground">
                        <option value="all">All types</option>
                        {Object.entries(TM).map(([k,v])=>{
                          const count=blocks.filter(b=>!b.placed&&b.type===k).length;
                          return count>0?<option key={k} value={k}>{v.label} ({count})</option>:null;
                        })}
                      </select>
                      <div className="flex-1"/>
                      <button onClick={()=>setShowAdd(o=>!o)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-border bg-card/60 text-muted-foreground hover:text-foreground"><Plus size={12}/>Custom block</button>
                      <button onClick={autoFillCanvas} disabled={autoFilling} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 font-medium">
                        {autoFilling ? <><RefreshCw size={12} className="animate-spin"/>Filling…</> : <><Sparkles size={12}/>Auto-fill canvas</>}
                      </button>
                      <button onClick={resetCanvas} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-border bg-card/60 text-muted-foreground hover:text-foreground"><RotateCcw size={12}/>Reset</button>
                      {strategy && (
                        <button
                          onClick={() => {
                            const rebuilt = buildLibraryFromStrategy(strategy);
                            const placed  = blocks.filter(b => b.placed);
                            const placedIds = new Set(placed.map(b => b.id));
                            const newLib = rebuilt.filter(b => !placedIds.has(b.id));
                            setBlocks([...placed, ...newLib]);
                            setRecommendation(getNextRecommendation(placed, newLib));
                            toast({title: `Library rebuilt — ${newLib.length} blocks ready`, description: 'All strategy sections converted to draggable blocks.'});
                          }}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                        >
                          <RefreshCw size={12}/>Rebuild library
                        </button>
                      )}
                    </div>

                    {/* Add custom block */}
                    {showAdd && (
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
                        {custSuggest && (
                          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 flex items-start gap-2">
                            <Brain size={13} className="text-primary shrink-0 mt-0.5"/>
                            <div className="text-xs"><span className="text-primary font-semibold">AI Suggestion: </span><span>Add to <strong>{custSuggest.week===5?'Backlog':`Week ${custSuggest.week}`}</strong> — {custSuggest.reason}</span></div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={addCustomBlock} disabled={!custTitle.trim()} className="bg-primary text-primary-foreground"><Plus size={12} className="mr-1"/>Add to Library</Button>
                          <button onClick={()=>{setShowAdd(false);setCustSuggest(null);}} className="text-xs text-muted-foreground hover:text-foreground px-3">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Main canvas: library + columns */}
                    <div className="flex gap-3 overflow-x-auto pb-2">

                      {/* Block Library Sidebar */}
                      <div
                        className="w-60 shrink-0 rounded-2xl border border-border bg-card/60 flex flex-col" style={{height: 520}}
                        onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';}}
                        onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('blockId');if(id)returnToLib(id);}}
                      >
                        <div className="px-3 py-3 border-b border-border/60 bg-secondary/20 shrink-0">
                          <div className="font-semibold text-xs uppercase tracking-wider text-foreground/70 mb-0.5">Block Library</div>
                          <div className="text-xs text-muted-foreground">{libBlocks.length} blocks ready · drag into a week</div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                          {libBlocks.length===0 ? (
                            <div className="py-8 text-center">
                              <CheckCircle2 size={24} className="text-green-400/40 mx-auto mb-2"/>
                              <p className="text-xs text-muted-foreground">{blocks.length===0?'Generate a strategy to populate blocks':'All blocks placed! Drag from columns back here to unplace.'}</p>
                            </div>
                          ) : libBlocks.map(block=>{
                            
                            const LibIcon = gT(block.type).icon;
                            const libPm  = PM[block.priority];
                            const libIsRec  = recommendation?.block.id===block.id;
                            const libIsHigh = highlightId===block.id;
                            return (
                              <div
                                id={`lib-block-${block.id}`}
                                key={block.id}
                                draggable
                                onDragStart={e=>onDragStart(e,block.id)}
                                onDragEnd={onDragEnd}
                                className={`rounded-xl border p-3 cursor-grab active:cursor-grabbing group hover:shadow-md transition-all ${draggingId===block.id?'opacity-40 scale-95':''} ${libIsHigh?'ring-2 ring-yellow-400 border-yellow-400/40 bg-yellow-400/10':libIsRec?`ring-1 ring-yellow-400/60 ${gT(block.type).border} ${gT(block.type).bg}`:`${gT(block.type).border} ${gT(block.type).bg}`}`}
                              >
                                {/* recommended badge */}
                                {libIsRec && (
                                  <div className="flex items-center gap-1 mb-2">
                                    <Lightbulb size={9} className="text-yellow-400"/>
                                    <span className="text-xs font-mono text-yellow-400">Next recommended</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <GripVertical size={10} className="text-muted-foreground/30 shrink-0"/>
                                  <LibIcon size={10} style={{color:gT(block.type).color}} className="shrink-0"/>
                                  <span className="text-xs font-semibold flex-1 leading-tight">{block.title}</span>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">{block.content}</p>
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${libPm.dot}`}/>
                                    <span className="text-xs text-muted-foreground">{block.priority}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {block.effort && <span className="text-xs font-mono text-muted-foreground/60">{block.effort}</span>}
                                    <span className="text-xs font-mono" style={{color:gT(block.type).color}}>{gT(block.type).label}</span>
                                  </div>
                                </div>
                                {block.tags && block.tags.length > 0 && (
                                  <div className="flex gap-1 mt-1.5 flex-wrap">
                                    {block.tags.slice(0,4).map((t,i)=>{
                                      const isHard = t === '✓ hard-data';
                                      const isInferred = t === '~ inferred';
                                      return (
                                        <span key={i} className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${
                                          isHard     ? 'border-green-400/30 bg-green-400/8 text-green-400' :
                                          isInferred ? 'border-yellow-400/25 bg-yellow-400/5 text-yellow-400/70' :
                                          'border-border/50 bg-background/40 text-muted-foreground/60'
                                        }`}>{t}</span>
                                      );
                                    })}
                                  </div>
                                )}
                                {block.assignee && (
                                  <div className="flex items-center gap-1 mt-1.5">
                                    <div className="h-3.5 w-3.5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{block.assignee[0].toUpperCase()}</div>
                                    <span className="text-xs text-muted-foreground">{block.assignee}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Week columns */}
                      {COLUMNS.map(col=>{
                        const colBlocks  = blocks.filter(b=>b.placed&&b.week===col.week);
                        const isOver     = dragOverWeek===col.week;
                        const sug        = draggingBlock?getSuggestion(draggingBlock,col.week,blocks):null;
                        const slStyle    = sug?SL[sug.level]:null;
                        const colDone    = colBlocks.filter(b=>b.status==='done').length;
                        const SugIcon    = slStyle?.icon;
                        const isRecCol   = recommendation?.week===col.week;

                        return (
                          <div
                            key={col.week}
                            onDragOver={e=>onDragOver(e,col.week)}
                            onDrop={e=>onDrop(e,col.week)}
                            onDragLeave={()=>setDragOverWeek(null)}
                            className={`flex-1 min-w-[175px] max-w-[220px] rounded-2xl border flex flex-col transition-all duration-150 ${isOver&&slStyle?`${slStyle.ring} border-transparent`:isRecCol&&!draggingBlock?'border-yellow-400/30 bg-yellow-400/3':'border-border bg-card/40'}`}
                            style={{height: 520}}
                          >
                            {/* Column header */}
                            <div className={`px-3 py-3 border-b border-border/50 shrink-0 rounded-t-2xl ${isOver?'bg-card/80':''}`}>
                              <div className="flex items-center justify-between mb-1">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="text-xs font-bold text-foreground">{col.label}</div>
                                    {isRecCol && !draggingBlock && <Lightbulb size={9} className="text-yellow-400"/>}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{col.sub}</div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  {/* Time estimate */}
                                  {colBlocks.length > 0 && (() => {
                                    const hrs = colTotalHours(colBlocks);
                                    const workload = workloadLabel(hrs);
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-xs font-mono font-semibold ${workload.color}`}>{formatHours(hrs)}</span>
                                        <span className={`text-xs ${workload.color} opacity-70`}>{workload.label}</span>
                                      </div>
                                    );
                                  })()}
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-mono text-muted-foreground">{colDone}/{colBlocks.length}</span>
                                    {colBlocks.length > 0 && (
                                      <div className="h-1 w-10 rounded-full bg-secondary overflow-hidden">
                                        <div className="h-full bg-green-400/70 transition-all" style={{width:`${Math.round((colDone/colBlocks.length)*100)}%`}}/>
                                      </div>
                                    )}
                                  </div>
                                  {colBlocks.length > 0 && (
                                    <button
                                      onClick={() => setAgendaWeek(agendaWeek===col.week?null:col.week)}
                                      title="View / generate week agenda"
                                      className={`h-5 px-1.5 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                                        agendaWeek===col.week
                                          ? 'bg-primary text-primary-foreground'
                                          : agendaStale.has(col.week) && agendaText[col.week]
                                          ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30'
                                          : agendaText[col.week]
                                          ? 'bg-primary/10 text-primary border border-primary/20'
                                          : 'bg-secondary/60 text-muted-foreground border border-border hover:text-foreground'
                                      }`}
                                    >
                                      <FileText size={8}/>
                                      <span>{agendaLoading===col.week?'…':agendaStale.has(col.week)&&agendaText[col.week]?'⚡':agendaText[col.week]?'✓ View':'Agenda'}</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                              {/* Where we are summary pills */}
                              {colBlocks.length > 0 && (
                                <div className="flex gap-1 flex-wrap mb-1">
                                  {colBlocks.filter(b=>b.status==='doing').length > 0 && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400 font-mono">
                                      {colBlocks.filter(b=>b.status==='doing').length} doing
                                    </span>
                                  )}
                                  {colBlocks.filter(b=>b.status==='done').length > 0 && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-400/10 text-green-400 font-mono">
                                      {colBlocks.filter(b=>b.status==='done').length} done
                                    </span>
                                  )}
                                  {colBlocks.filter(b=>b.status==='todo').length > 0 && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary/60 text-muted-foreground font-mono">
                                      {colBlocks.filter(b=>b.status==='todo').length} todo
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Suggestion when hovering */}
                              {isOver&&sug&&slStyle&&SugIcon && (
                                <div className={`mt-2 rounded-xl border ${slStyle.badge} px-2 py-2`}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <SugIcon size={10}/>
                                    <span className="text-xs font-bold">{sug.headline}</span>
                                  </div>
                                  <p className="text-xs leading-relaxed mb-1 opacity-90">{sug.reason}</p>
                                  <p className="text-xs opacity-75"><span className="font-semibold">Impact:</span> {sug.impact}</p>
                                  {sug.level!=='best'&&sug.best && (
                                    <p className="text-xs opacity-75 mt-0.5"><span className="font-semibold">Best in:</span> {sug.best}</p>
                                  )}
                                </div>
                              )}

                              {/* Subtle hint while dragging */}
                              {draggingBlock&&!isOver&&sug&&slStyle&&SugIcon && (
                                <div className={`mt-2 rounded-lg px-2 py-1 flex items-center gap-1.5 border ${slStyle.badge} opacity-50`}>
                                  <SugIcon size={9}/>
                                  <span className="text-xs">{slStyle.label}</span>
                                </div>
                              )}
                            </div>

                            {/* Agenda panel — shown when toggled */}
                            {agendaWeek===col.week && (
                              <div className="border-b border-border/50 bg-background/60">
                                <div className="flex items-center justify-between px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <FileText size={10} className="text-primary shrink-0"/>
                                    <span className="text-xs font-semibold">{col.label} Agenda</span>
                                    {agendaStale.has(col.week) && agendaText[col.week] && <span className="text-xs text-yellow-400 font-mono">· stale</span>}
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={()=>generateAgenda(col.week)} disabled={agendaLoading===col.week} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50">
                                      {agendaLoading===col.week ? <><RefreshCw size={8} className="animate-spin"/>...</> : agendaText[col.week] ? <><RefreshCw size={8}/>Refresh</> : <><Sparkles size={8}/>Generate</>}
                                    </button>
                                    {agendaText[col.week] && (
                                      <button onClick={()=>setAgendaExpanded(col.week)} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-secondary/60 text-muted-foreground border border-border hover:text-foreground">
                                        <Maximize2 size={8}/>Full
                                      </button>
                                    )}
                                    <button onClick={()=>setAgendaWeek(null)} className="h-5 w-5 rounded flex items-center justify-center bg-secondary/40 text-muted-foreground hover:text-foreground"><X size={8}/></button>
                                  </div>
                                </div>
                                {agendaLoading===col.week && !agendaText[col.week] && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 pb-2"><RefreshCw size={10} className="animate-spin text-primary"/>Analysing {colBlocks.length} cards...</div>
                                )}
                                {agendaText[col.week] && (
                                  <div className="px-3 pb-2 cursor-pointer" onClick={()=>setAgendaExpanded(col.week)}>
                                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                                      {agendaText[col.week].split('\n').filter((l:string)=>l.trim()&&!l.startsWith('#')&&!l.startsWith('---')).slice(0,4).join(' ')}
                                    </p>
                                    <p className="text-xs text-primary font-medium mt-1 flex items-center gap-1"><Maximize2 size={9}/>Click to read full agenda</p>
                                  </div>
                                )}
                                {!agendaText[col.week] && agendaLoading!==col.week && (
                                  <p className="text-xs text-muted-foreground px-3 pb-2">Generate a client-ready agenda with tasks, outcomes, and verification steps.</p>
                                )}
                              </div>
                            )}                            {/* Cards */}                            <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{maxHeight: agendaWeek===col.week ? 160 : 340}}>                              {colBlocks.length===0&&!isOver && (                                <div className={`h-16 rounded-xl border-2 border-dashed flex items-center justify-center ${isRecCol&&!draggingBlock?'border-yellow-400/30 bg-yellow-400/3':'border-border/25'}`}>                                  <p className="text-xs text-muted-foreground/30">{isRecCol&&!draggingBlock?'← recommended slot':'Drop here'}</p>                                </div>                              )}                              {colBlocks.map(block=>{                                const ColIcon = gT(block.type).icon;                                const colPm   = PM[block.priority];                                const colSm   = SM[block.status];                                const StatusIcon = colSm.icon;                                return (                                  <div
                                    key={block.id}
                                    draggable
                                    onDragStart={e=>{
                                      if((e.target as HTMLElement).closest('button')){e.preventDefault();return;}
                                      onDragStart(e,block.id);
                                    }}
                                    onDragEnd={onDragEnd}
                                    className={`rounded-xl border ${gT(block.type).border} ${gT(block.type).bg} p-3 cursor-grab transition-all select-none ${
                                      draggingId===block.id?'opacity-40 scale-95':'hover:shadow-md hover:border-opacity-60'
                                    } ${block.status==='verified'||block.status==='done'?'opacity-55':''}`}
                                  >
                                    {/* Top row: icon + title + expand */}
                                    <div className="flex items-start gap-2 mb-2">
                                      <ColIcon size={11} style={{color:gT(block.type).color}} className="shrink-0 mt-0.5"/>
                                      <p className={`text-xs font-semibold flex-1 leading-tight ${block.status==='verified'||block.status==='done'?'line-through text-muted-foreground':''}`}>
                                        {block.title}
                                      </p>
                                      <button
                                        onClick={e=>{e.stopPropagation();setExpandedBlock(block);}}
                                        title="Open task panel"
                                        className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-secondary/60 transition-all shrink-0 ml-0.5"
                                        draggable={false}
                                      >
                                        <Maximize2 size={9}/>
                                      </button>
                                    </div>

                                    {/* Content preview */}
                                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2.5">
                                      {block.content}
                                    </p>

                                    {/* Bottom row: priority + status */}
                                    <div className="flex items-center justify-between gap-1">
                                      <div className="flex items-center gap-1">
                                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${colPm.dot}`}/>
                                        <span className="text-xs text-muted-foreground">{block.priority}</span>
                                        {block.assignee && (
                                          <span className="text-xs font-medium text-primary/70 ml-1">
                                            {block.assignee.split(' ')[0]}
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        onClick={e=>{e.stopPropagation();toggleStatus(block.id);}}
                                        draggable={false}
                                        className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border font-medium transition-all ${
                                          block.status==='verified'||block.status==='done' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                                          block.status==='doing'   ? 'text-blue-400 bg-blue-400/10 border-blue-400/20 hover:bg-blue-400/25 animate-pulse' :
                                          block.status==='waiting' ? 'text-orange-400 bg-orange-400/10 border-orange-400/20' :
                                          'text-muted-foreground border-border/50 hover:border-primary/40 hover:text-primary'
                                        }`}
                                      >
                                        <StatusIcon size={8}/>
                                        <span>{colSm.label}</span>
                                      </button>
                                    </div>
                                  </div>                                );                              })}                            </div>                          </div>                        );                      })}                    </div>                    {/* ── Verification & Manav Brain Assist Panel ── */}
                    {placedBlocks.some(b=>b.status==='doing'||b.status==='waiting') && (
                      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-secondary/10">
                          <Shield size={15} className="text-yellow-400"/>
                          <span className="font-semibold text-sm">Verification Queue</span>
                          <span className="text-xs text-muted-foreground">Click any card below to open the 3-step verification wizard</span>
                        </div>
                        <div className="p-4 space-y-2">
                          {placedBlocks.filter(b=>b.status==='doing'||b.status==='waiting').map(b=>{
                            
                            const WAIT: Record<string,number> = {'technical':5,'content':14,'geo':7,'quick-win':3,'competitive':21,'weekly':3,'monthly':30,'kpi':7,'custom':5};
                            const wDays = WAIT[b.type]||5;
                            const comp  = completedDates[b.id]?new Date(completedDates[b.id]):null;
                            const dLeft = comp?Math.max(0,wDays-Math.floor((Date.now()-comp.getTime())/86400000)):wDays;
                            const ready = dLeft===0;
                            return (
                              <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background/60 hover:border-primary/30 transition-colors">
                                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{background:`${gT(b.type).color}18`,border:`1px solid ${gT(b.type).color}28`}}>
                                  {React.createElement(gT(b.type).icon, {size:13, style:{color:gT(b.type).color}})}<icon size={13} style={{color:gT(b.type).color}}/>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">{b.title}</div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>Week {b.week===5?'Backlog':b.week}</span>
                                    {b.assignee&&<span>· {b.assignee}</span>}
                                    {b.status==='waiting'&&!ready&&<span className="text-orange-400">· {dLeft}d remaining</span>}
                                    {b.status==='waiting'&&ready&&<span className="text-green-400">· Ready to verify</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {b.status==='waiting'&&!ready&&(
                                    <span className="text-xs px-2 py-1 rounded-lg border border-orange-400/30 bg-orange-400/10 text-orange-400">
                                      Waiting {dLeft}d
                                    </span>
                                  )}
                                  <button
                                    onClick={e=>{e.stopPropagation();openVerifyModal(b);}}
                                    className={`text-sm px-4 py-2 rounded-xl font-semibold transition-all ${
                                      ready||b.status==='doing'
                                        ?'bg-primary text-primary-foreground hover:bg-primary/90'
                                        :'border border-border text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    {b.status==='waiting'&&!ready?'Check early':"Done — please verify →"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Manav Brain Assist + Effort Guide ── */}
                    {placedBlocks.length > 0 && (
                      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                        <button
                          onClick={()=>document.getElementById('ai-assist-panel')?.classList.toggle('hidden')}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-secondary/20 transition-colors"
                        >
                          <Brain size={15} className="text-primary"/>
                          <span className="font-semibold text-sm">Manav Brain Assistance & Effort Guide</span>
                          <span className="text-xs text-muted-foreground ml-2">Why these hours? How can AI cut them?</span>
                          <ChevronDown size={14} className="text-muted-foreground ml-auto"/>
                        </button>
                        <div id="ai-assist-panel" className="hidden border-t border-border px-5 py-4 space-y-4">

                          {/* Effort explanation */}
                          <div className="rounded-xl border border-border bg-background/60 p-4">
                            <div className="font-semibold text-sm mb-3">How Hours Are Calculated</div>
                            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                              Base hours are industry benchmarks for each task type and priority. They represent human time for a competent SEO professional working without AI assistance.
                              These are estimates — your actual time will vary based on site size, CMS complexity, and how much existing content/data is available.
                            </p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead><tr className="border-b border-border text-muted-foreground">
                                  <th className="text-left py-1.5 pr-3">Task Type</th>
                                  <th className="text-center py-1.5 px-2">High</th>
                                  <th className="text-center py-1.5 px-2">Medium</th>
                                  <th className="text-center py-1.5 px-2">Low</th>
                                  <th className="text-center py-1.5 px-2 text-primary">With AI</th>
                                  <th className="text-left py-1.5 pl-2 text-muted-foreground">What&#39;s included</th>
                                </tr></thead>
                                <tbody>
                                  {[
                                    {type:'Technical',    h:8,  m:4,   l:2,   basis:'Audit+fix+test cycle. High=major crawl overhaul. Medium=redirects+schema. Low=single fix.'},
                                    {type:'Content',      h:10, m:6,   l:3,   basis:'Research+brief+write+optimise+publish. High=pillar (2000w+). Medium=blog (1000w). Low=short.'},
                                    {type:'GEO',          h:5,  m:3,   l:1.5, basis:'Platform research+content optimisation+citation check. High=full GEO audit+fix.'},
                                    {type:'Quick Win',    h:3,  m:1.5, l:0.5, basis:'Identify+implement+verify. High=multiple URLs. Low=single meta tag fix.'},
                                    {type:'Competitive',  h:6,  m:3,   l:1.5, basis:'Competitor crawl+gap analysis+strategy. High=full SERP analysis.'},
                                    {type:'Weekly Task',  h:4,  m:2,   l:1,   basis:'Average weekly deliverable. Adjust per actual task.'},
                                  ].map(r=>(
                                    <tr key={r.type} className="border-b border-border/40 align-top">
                                      <td className="py-2 pr-3 font-medium">{r.type}</td>
                                      <td className="text-center py-2 px-2">{r.h}h</td>
                                      <td className="text-center py-2 px-2">{r.m}h</td>
                                      <td className="text-center py-2 px-2">{r.l}h</td>
                                      <td className="text-center py-2 px-2 text-primary font-semibold">~{Math.round(r.m*0.4*10)/10}h</td>
                                      <td className="text-left py-2 pl-2 text-muted-foreground leading-tight">{r.basis}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* AI assistance guide */}
                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                            <div className="font-semibold text-sm mb-3 flex items-center gap-2">
                              <Brain size={13} className="text-primary"/>What AI Can Genuinely Cut Time On (60% reduction realistic)
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3 text-xs">
                              {[
                                {label:'Content Writing',    can:"First draft (800-1200w in 3 min), keyword research, meta tags, schema markup, FAQ generation, internal link suggestions",   cannot:"Fact-checking, brand voice matching, original data/quotes, images, client-specific examples"},
                                {label:'Technical Audit',    can:"Crawl data interpretation, issue prioritisation, fix instructions, redirect mapping, schema code generation",                 cannot:"Actually applying fixes to CMS, testing after deployment, verifying server-side changes"},
                                {label:'GEO Optimisation',  can:"Content restructuring for AI citation, FAQ formatting, entity markup, citation-ready summaries",                              cannot:"Checking if Perplexity actually cites you (needs live check), measuring AI traffic"},
                                {label:'Competitive Intel',  can:"Analysing exported competitor data, identifying content gaps, strategy recommendations from rankings data",                  cannot:"Live SERP scraping (needs tool), verifying competitor changes, DR scores (needs Ahrefs)"},
                                {label:'Reporting',          can:"Interpreting GSC/GA4 exports, writing client-ready commentary, identifying trends, recommending next actions",               cannot:"Pulling the raw data (needs tool access), creating charts, client meeting delivery"},
                              ].map(r=>(
                                <div key={r.label} className="space-y-1.5">
                                  <div className="font-semibold text-foreground">{r.label}</div>
                                  <div><span className="text-green-400 font-medium">✓ AI can: </span><span className="text-muted-foreground">{r.can}</span></div>
                                  <div><span className="text-red-400 font-medium">✗ Still needs human: </span><span className="text-muted-foreground">{r.cannot}</span></div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Human review checklist */}
                          <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-4">
                            <div className="font-semibold text-sm mb-3 flex items-center gap-2 text-yellow-400">
                              <AlertTriangle size={13}/>Even With AI: Human Review Required Before Publishing
                            </div>
                            <div className="text-xs space-y-1.5">
                              {[
                                "Read every AI-generated paragraph — hallucinations appear as confident-sounding wrong facts",
                                "Check all statistics, dates, and named claims against the original source",
                                "Verify internal links actually point to real, live pages",
                                "Confirm keyword placement feels natural, not forced",
                                "Check brand voice — AI writes generically, clients have specific tone requirements",
                                "Technical fixes: always test in staging before live deployment",
                                "Schema markup: validate at schema.org/SchemaApp before applying",
                                "After any technical change: re-crawl affected URLs in GSC or Screaming Frog",
                              ].map((item,i)=>(
                                <div key={i} className="flex items-start gap-2">
                                  <span className="text-yellow-400 shrink-0 font-bold">{i+1}.</span>
                                  <span>{item}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Current canvas AI summary */}
                          {placedBlocks.length > 0 && (
                            <div className="rounded-xl border border-border bg-background/60 p-4">
                              <div className="font-semibold text-sm mb-3">Your Current Canvas — Time Summary</div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {(()=>{
                                  const total    = placedBlocks.reduce((s,b)=>s+estimateHours(b),0);
                                  const aiCards  = placedBlocks.filter(b=>b.aiAssisted);
                                  const aiSaved  = aiCards.reduce((s,b)=>s+estimateHours(b)*0.6,0);
                                  const effective= total - aiSaved;
                                  return [
                                    {label:'Total estimated',  val:formatHours(Math.round(total*10)/10),     color:'text-foreground'},
                                    {label:'AI-assisted cards', val:String(aiCards.length)+' cards',         color:'text-primary'},
                                    {label:'Time AI saves',    val:formatHours(Math.round(aiSaved*10)/10),   color:'text-green-400'},
                                    {label:'Actual human time',val:formatHours(Math.round(effective*10)/10), color:'text-yellow-400'},
                                  ].map(stat=>(
                                    <div key={stat.label} className="text-center">
                                      <div className={`text-lg font-black ${stat.color}`}>{stat.val}</div>
                                      <div className="text-xs text-muted-foreground">{stat.label}</div>
                                    </div>
                                  ));
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Ask the Canvas */}                    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">                      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-secondary/20">                        <MessageSquare className="h-4 w-4 text-primary"/>                        <span className="font-semibold text-sm">Ask the Canvas</span>                        <span className="text-xs text-muted-foreground">Manav Brain answers using your full canvas and project data</span>                      </div>                      <div className="px-5 pt-3 pb-2 flex flex-wrap gap-2">                        {['What should I focus on today?','Which items give best ROI?','What are Week 1 dependencies?','What happens if I skip the backlog?','Which week needs more cards to be effective?'].map(q=>(                          <button key={q} onClick={()=>setChatQ(q)} className="text-xs px-2.5 py-1 rounded-full border border-border bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">{q}</button>                        ))}                      </div>                      <div className="px-5 pb-3 flex gap-2">                        <input value={chatQ} onChange={e=>setChatQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askCanvas()} placeholder="Ask anything about this strategy…" className="flex-1 h-10 text-sm px-4 rounded-xl border border-border bg-background/60 focus:border-primary/50 outline-none"/>                        <Button onClick={askCanvas} disabled={chatLoading||!chatQ.trim()} className="h-10 bg-primary text-primary-foreground px-4">                          {chatLoading?<RefreshCw size={14} className="animate-spin"/>:<Send size={14}/>}                        </Button>                      </div>                      {(chatResp||chatLoading) && (                        <div className="mx-5 mb-4 rounded-xl border border-border bg-background/60 p-4">                          {chatLoading&&!chatResp && <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw size={12} className="animate-spin text-primary"/>Thinking…</div>}                          {chatResp && <ChatMd text={chatResp}/>}
                          {chatResp && !chatLoading && (
                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                              <button
                                onClick={()=>{
                                  setCreateCardFrom({text:chatResp,source:'canvas_chat'});
                                  setCreateCardForm({title:'',type:'quick-win',week:1,priority:'high',content:chatResp.split('\n').filter(Boolean).slice(0,3).join(' ').slice(0,200)});
                                }}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 transition-colors font-medium"
                              >
                                <Plus size={11}/>Create card from this
                              </button>
                              <button
                                onClick={async()=>{await navigator.clipboard.writeText(chatResp);toast({title:'Copied!'});}}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Copy size={11}/>Copy
                              </button>
                            </div>
                          )}
                          <div ref={chatEndRef}/>                        </div>                      )}                    </div>                  </>                )}              </div>            )}          

            {/* ══ PIPELINE TAB ══ */}
            {tab==='pipeline' && (
              <div className="space-y-5">

                {/* URL check */}
                <div className="rounded-2xl border border-border bg-card/60 p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Globe className="h-4 w-4 text-primary shrink-0 mt-0.5"/>
                    <div className="flex-1">
                      <div className="font-semibold text-sm mb-1">Live Website Check (optional)</div>
                      <p className="text-xs text-muted-foreground">Manav Brain will fetch live content from the site to ground all analysis in reality — not assumptions.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input value={checkUrl} onChange={e=>setCheckUrl(e.target.value)} placeholder={selProj?.url || "https://yourdomain.com"} className="flex-1 h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"/>
                    <span className="text-xs text-muted-foreground self-center">{checkUrl||selProj?.url?'Will check live':'No URL set'}</span>
                  </div>
                </div>

                {/* Execution Pipeline */}
                <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                    <Target className="h-4 w-4 text-primary"/>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">Full Execution Pipeline</div>
                      <div className="text-xs text-muted-foreground">Critical path, dependencies, risk register, capacity check, what to do in what order</div>
                    </div>
                    <button onClick={()=>callPipelineChat('','pipeline')} disabled={pipelineLoading||!placedBlocks.length}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50 font-medium">
                      {pipelineLoading?<><RefreshCw size={11} className="animate-spin"/>Generating...</>:<><Sparkles size={11}/>{pipelineText?'Refresh':'Generate Pipeline'}</>}
                    </button>
                  </div>
                  {!placedBlocks.length&&<div className="p-8 text-center"><p className="text-sm text-muted-foreground">Place cards on the canvas first.</p></div>}
                  {pipelineLoading&&!pipelineText&&<div className="flex items-center gap-2 text-sm text-muted-foreground p-8 justify-center"><RefreshCw size={16} className="animate-spin text-primary"/>Analysing {placedBlocks.length} tasks{checkUrl||selProj?.url?' + live site data':''}...</div>}
                  {pipelineText&&<div className="p-5 max-h-[600px] overflow-y-auto"><AgendaMarkdown text={pipelineText}/></div>}
                </div>

                {/* Dependency Analysis */}
                <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                    <ChevronRight className="h-4 w-4 text-primary"/>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">Dependency Analysis</div>
                      <div className="text-xs text-muted-foreground">What blocks what, prerequisite chain, what can run in parallel, cascade impact of delays</div>
                    </div>
                    <button onClick={()=>callPipelineChat('','dependencies',depFocusId)} disabled={depLoading||!placedBlocks.length}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50 font-medium">
                      {depLoading?<><RefreshCw size={11} className="animate-spin"/>Analysing...</>:<><Brain size={11}/>{depText?'Refresh':'Analyse Dependencies'}</>}
                    </button>
                  </div>
                  {placedBlocks.length>0&&(
                    <div className="px-5 py-3 border-b border-border/40 bg-secondary/10">
                      <div className="text-xs text-muted-foreground mb-2">Focus on a specific task (optional):</div>
                      <select value={depFocusId||''} onChange={e=>setDepFocusId(e.target.value||null)} className="h-8 text-xs px-2 rounded-xl border border-border bg-background/60 text-muted-foreground w-full max-w-sm">
                        <option value="">All tasks</option>
                        {placedBlocks.map(b=><option key={b.id} value={b.id}>[W{b.week===5?'BL':b.week}] {b.title.slice(0,55)}</option>)}
                      </select>
                    </div>
                  )}
                  {!placedBlocks.length&&<div className="p-6 text-center"><p className="text-sm text-muted-foreground">Place cards on the canvas first.</p></div>}
                  {depLoading&&!depText&&<div className="flex items-center gap-2 text-sm text-muted-foreground p-8 justify-center"><RefreshCw size={16} className="animate-spin text-primary"/>Mapping dependencies...</div>}
                  {depText&&<div className="p-5 max-h-[600px] overflow-y-auto"><AgendaMarkdown text={depText}/></div>}
                  {!depText&&!depLoading&&placedBlocks.length>0&&<div className="p-6 text-center"><p className="text-sm text-muted-foreground">Click Analyse Dependencies to map the full chain.</p></div>}
                </div>

                {/* Ask Manav Brain */}
                <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <div className="font-semibold text-sm mb-3 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary"/>Ask Manav Brain</div>
                    <div className="flex flex-wrap gap-2">
                      {ROLES.map(role=>{
                        const RIcon = role.icon;
                        return (
                          <button key={role.id} onClick={()=>{setActiveRole(role.id);setRoleChat('');setRoleChatQ('');}}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${activeRole===role.id?'font-semibold':'border-border bg-secondary/30 text-muted-foreground hover:text-foreground'}`}
                            style={activeRole===role.id?{background:role.color+'22',borderColor:role.color+'55',color:role.color}:{}}
                          >
                            <RIcon size={11}/>{role.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {(()=>{
                    const pipelineRole = ROLES.find(r=>r.id===activeRole);
                    if(!pipelineRole) return null;
                    const RIcon = pipelineRole.icon;
                    return (
                      <>
                        <div className="px-5 py-2.5 border-b border-border/40 flex items-center gap-2" style={{background:pipelineRole.color+'0a'}}>
                          <RIcon size={12} style={{color:pipelineRole.color}}/>
                          <p className="text-xs text-muted-foreground">Answering for a <span className="font-semibold" style={{color:pipelineRole.color}}>{pipelineRole.label}</span> — framed and prioritised for what this role needs.</p>
                        </div>
                        <div className="px-5 py-3 border-b border-border/40">
                          <div className="text-xs font-medium text-muted-foreground mb-2">Suggested questions:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {pipelineRole.questions.map((q,i)=>(
                              <button key={i} onClick={()=>setRoleChatQ(q)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${roleChatQ===q?'border-primary bg-primary/10 text-primary':'border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:border-primary/40'}`}>
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  <div className="px-5 py-3 flex gap-2">
                    <input value={roleChatQ} onChange={e=>setRoleChatQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&roleChatQ.trim()&&callPipelineChat(roleChatQ,'chat')}
                      placeholder={`Ask as ${ROLES.find(r=>r.id===activeRole)?.label||'team member'}...`}
                      className="flex-1 h-10 text-sm px-4 rounded-xl border border-border bg-background/60 focus:border-primary/50 outline-none"/>
                    <Button onClick={()=>roleChatQ.trim()&&callPipelineChat(roleChatQ,'chat')} disabled={roleChatLoading||!roleChatQ.trim()} className="h-10 bg-primary text-primary-foreground px-4">
                      {roleChatLoading?<RefreshCw size={14} className="animate-spin"/>:<Send size={14}/>}
                    </Button>
                  </div>
                  {(roleChat||roleChatLoading)&&(
                    <div className="mx-5 mb-4 rounded-xl border border-border bg-background/60 p-4 max-h-[500px] overflow-y-auto">
                      {roleChatLoading&&!roleChat&&<div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw size={12} className="animate-spin text-primary"/>Thinking as {ROLES.find(r=>r.id===activeRole)?.label}...</div>}
                      {roleChat&&<AgendaMarkdown text={roleChat}/>}
                    </div>
                  )}
                </div>

              </div>
            )}</>        )}      </div>      {/* Block expand modal */}      {expandedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={()=>setExpandedBlock(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
          <div
            className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{maxHeight:'88vh'}}
            onClick={e=>e.stopPropagation()}
          >
            {/* Colour bar — inline, no IIFE */}
            <div className="h-1 w-full" style={{background:`linear-gradient(90deg,${(TM[expandedBlock.type]||TM.custom).color},transparent)`}}/>

            {/* Header — all values inlined */}
            <div className="flex items-start gap-3 px-5 py-4 border-b border-border shrink-0">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{background:`${(TM[expandedBlock.type]||TM.custom).color}18`,border:`1px solid ${(TM[expandedBlock.type]||TM.custom).color}28`}}>
                {React.createElement(TM[expandedBlock.type]?.icon||TM.custom.icon, {size:14, style:{color:(TM[expandedBlock.type]||TM.custom).color}})}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm leading-snug">{expandedBlock.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span className="font-mono" style={{color:(TM[expandedBlock.type]||TM.custom).color}}>{(TM[expandedBlock.type]||TM.custom).label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full border text-xs font-mono ${PM[expandedBlock.priority]?.badge||'border-border text-muted-foreground'}`}>{expandedBlock.priority}</span>
                  <span className="text-muted-foreground">Week {expandedBlock.week===5?'Backlog':expandedBlock.week}</span>
                </div>
              </div>
              <button onClick={()=>setExpandedBlock(null)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50 shrink-0">
                <X size={13}/>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Description */}
              <div className="rounded-xl border border-border bg-background/60 p-4">
                <div className="text-xs font-mono text-muted-foreground uppercase mb-2">What this is about</div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{expandedBlock.content}</p>
                {expandedBlock.impact && (
                  <div className="mt-3 text-xs text-orange-400 flex items-center gap-1.5">
                    <span className="font-mono uppercase">Expected impact:</span>
                    <span>{expandedBlock.impact}</span>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="rounded-xl border border-border bg-background/60 p-4 space-y-3">
                <div className="text-xs font-mono text-muted-foreground uppercase">Where we are</div>
                <div className="flex gap-2 flex-wrap">
                  {(['todo','doing','waiting','verified'] as const).map(s=>{
                    const isActive = expandedBlock.status === s;
                    const labelMap: Record<string,string> = {todo:'To Do',doing:'In Progress',waiting:'Waiting',verified:'Verified'};
                    const colorMap: Record<string,string> = {
                      todo:     isActive?'bg-secondary text-foreground border-border':'text-muted-foreground border-border/50 hover:border-border',
                      doing:    isActive?'bg-blue-400/15 text-blue-400 border-blue-400/30':'text-muted-foreground border-border/50 hover:border-blue-400/30 hover:text-blue-400',
                      waiting:  isActive?'bg-orange-400/15 text-orange-400 border-orange-400/30':'text-muted-foreground border-border/50 hover:border-orange-400/30 hover:text-orange-400',
                      verified: isActive?'bg-green-400/15 text-green-400 border-green-400/30':'text-muted-foreground border-border/50 hover:border-green-400/30 hover:text-green-400',
                    };
                    return (
                      <button key={s} onClick={()=>{
                        setBlocks(prev=>{const u=prev.map(b=>b.id===expandedBlock.id?{...b,status:s as Status}:b);scheduleAutoSave(u);return u;});
                        setExpandedBlock({...expandedBlock,status:s as Status});
                      }} className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${colorMap[s]}`}>
                        {labelMap[s]}
                      </button>
                    );
                  })}
                </div>
                {expandedBlock.status==='doing' && (
                  <button onClick={()=>{setExpandedBlock(null);setActiveVerifyBlock(expandedBlock);}}
                    className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                    <Shield size={14}/>I'm done — please verify →
                  </button>
                )}
              </div>

              {/* Assignee */}
              <div className="rounded-xl border border-border bg-background/60 p-4 space-y-2">
                <div className="text-xs font-mono text-muted-foreground uppercase">Who owns this</div>
                <button onClick={()=>{setExpandedBlock(null);setShowAssignModal(expandedBlock.id);}}
                  className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${expandedBlock.assignee?'bg-primary/20 text-primary':'bg-secondary/60 text-muted-foreground/60'}`}>
                    {expandedBlock.assignee?expandedBlock.assignee[0].toUpperCase():'+'}
                  </div>
                  <span>{expandedBlock.assignee||'Assign to someone'}</span>
                </button>
              </div>

              {/* Effort + Manav capability */}
              <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <div className="flex-1">
                    <div className="text-xs font-mono text-muted-foreground uppercase mb-0.5">Time & what Manav can do</div>
                    <div className="flex items-center gap-3">
                      <div className="text-xl font-black">
                        ~{expandedBlock.aiAssisted ? formatHours(getAICap(expandedBlock.type).time_ai/60) : formatHours(getAICap(expandedBlock.type).time_human/60)}
                      </div>
                      {expandedBlock.aiAssisted && (
                        <div className="text-xs text-muted-foreground">
                          <span className="line-through mr-1">{formatHours(getAICap(expandedBlock.type).time_human/60)}</span>
                          <span className="text-green-400 font-semibold">{Math.round((1-getAICap(expandedBlock.type).time_ai/getAICap(expandedBlock.type).time_human)*100)}% saved</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`flex flex-col items-center px-3 py-1.5 rounded-xl border ${getAICap(expandedBlock.type).confidence>=85?'border-green-400/30 bg-green-400/5':getAICap(expandedBlock.type).confidence>=70?'border-yellow-400/30 bg-yellow-400/5':'border-orange-400/30 bg-orange-400/5'}`}>
                    <span className={`text-lg font-black ${getAICap(expandedBlock.type).confidence>=85?'text-green-400':getAICap(expandedBlock.type).confidence>=70?'text-yellow-400':'text-orange-400'}`}>{getAICap(expandedBlock.type).confidence}%</span>
                    <span className="text-xs text-muted-foreground">confidence</span>
                  </div>
                  <button
                    onClick={()=>{
                      const updated={...expandedBlock,aiAssisted:!expandedBlock.aiAssisted};
                      setBlocks(prev=>{const u=prev.map(b=>b.id===expandedBlock.id?updated:b);scheduleAutoSave(u);return u;});
                      setExpandedBlock(updated);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${expandedBlock.aiAssisted?'bg-primary/15 border-primary/40 text-primary':'border-border text-muted-foreground hover:border-primary/30 hover:text-primary'}`}
                  >
                    <Brain size={13}/>
                    {expandedBlock.aiAssisted?'Manav: ON':'Manav: OFF'}
                  </button>
                </div>
                {expandedBlock.aiAssisted && (
                  <div className="px-4 py-3 space-y-3">
                    <p className="text-xs text-muted-foreground/70 italic">{getAICap(expandedBlock.type).confidence_reason}</p>
                    <div>
                      <div className="text-xs font-mono text-primary uppercase mb-2">Here's what I'm going to take off your plate</div>
                      <div className="space-y-1">
                        {getAICap(expandedBlock.type).produces.map((p2,i)=>(
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <CheckCircle2 size={10} className="text-green-400 shrink-0 mt-0.5"/>
                            <span className="text-muted-foreground">{p2}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-orange-400 uppercase mb-1">These parts need your hands</div>
                      <div className="space-y-1">
                        {getAICap(expandedBlock.type).cannot_do.map((c2,i)=>(
                          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <AlertTriangle size={9} className="text-orange-400 shrink-0 mt-0.5"/>
                            <span>{c2}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Requirements for this card */}
              {(()=>{
                const reqs = cardReqCache[expandedBlock.id]||[];
                return (
                  <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <div className="flex items-center gap-2">
                        <ListChecks size={12} className="text-muted-foreground"/>
                        <span className="text-xs font-mono text-muted-foreground uppercase">What's needed to execute</span>
                        {reqs.length>0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{reqs.length}</span>}
                      </div>
                      <button onClick={()=>loadCardRequirements(expandedBlock.id)} className="text-xs text-muted-foreground hover:text-foreground">
                        {cardReqCache[expandedBlock.id]?'Refresh':'Load'}
                      </button>
                    </div>
                    {reqs.length>0 && (
                      <div className="px-4 pt-3 pb-2 space-y-1.5">
                        {reqs.map((req:any)=>(
                          <div key={req.id} className="flex items-start gap-2 text-xs">
                            <button
                              onClick={()=>updateReqStatus(req.id,expandedBlock.id,req.status==='pending'?'provided':'pending')}
                              className={`mt-0.5 h-3.5 w-3.5 rounded border shrink-0 flex items-center justify-center ${req.status==='provided'?'bg-green-500 border-green-500':'border-border hover:border-primary'}`}
                            >{req.status==='provided'&&<CheckCircle2 size={9} className="text-white"/>}</button>
                            <div className="flex-1 min-w-0">
                              <span className={req.status==='provided'?'line-through text-muted-foreground':req.status==='not_needed'?'text-muted-foreground/40':''}>{req.requirement}</span>
                              {req.category!=='general'&&<span className="ml-1.5 text-muted-foreground/50">[{req.category}]</span>}
                            </div>
                            <button onClick={()=>updateReqStatus(req.id,expandedBlock.id,'not_needed')} className="text-muted-foreground/30 hover:text-muted-foreground shrink-0" title="Not needed"><X size={9}/></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="px-4 pb-3 pt-2">
                      <AddRequirementInline cardId={expandedBlock.id} cardTitle={expandedBlock.title} onSave={saveCardRequirement}/>
                    </div>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>{setExpandedBlock(null);setActiveExecBlock(expandedBlock);}}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/20 transition-colors">
                  <Sparkles size={13}/>Ask Manav Brain
                </button>
                <button onClick={()=>{loadCardRequirements(expandedBlock.id);deepDive(expandedBlock);setExpandedBlock(null);}}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:text-primary transition-colors">
                  <Brain size={13}/>Deep Dive + Suggestions
                </button>
                <button onClick={async()=>{await navigator.clipboard.writeText(expandedBlock.content);toast({title:'Copied!'});}}
                  className="flex items-center justify-center gap-2 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Copy size={11}/>Copy task
                </button>
                <button onClick={()=>{returnToLib(expandedBlock.id);setExpandedBlock(null);}}
                  className="flex items-center justify-center gap-2 py-2 rounded-xl border border-red-400/20 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                  <X size={11}/>Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Deep Dive Panel ── */}
      {ddBlock && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={()=>setDdBlock(null)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm"/>
          <div className="relative w-full sm:max-w-2xl bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{maxHeight:'85vh'}} onClick={e=>e.stopPropagation()}>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent"/>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
              <Brain size={16} className="text-primary shrink-0"/>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">Ask Manav</div>
                <div className="text-xs text-muted-foreground truncate">"{ddBlock.title}"</div>
              </div>
              <button onClick={()=>setDdBlock(null)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50"><X size={13}/></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {ddLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                  <RefreshCw size={16} className="animate-spin text-primary"/>Analysing...
                </div>
              )}
              {ddText && !ddLoading && (
                <div className="prose prose-sm prose-invert max-w-none">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono">{ddText}</pre>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex gap-2 shrink-0 flex-wrap">
              {ddText && !ddLoading && (
                <>
                  {/* Parse card suggestions from deep dive response */}
                  {(()=>{
                    const cardSection = ddText.match(/##\s*Canvas Cards to Create([\s\S]*?)(?:##|$)/);
                    if (!cardSection) return (
                      <button
                        onClick={()=>{
                          setCreateCardFrom({text:ddText,source:'deep_dive'});
                          setCreateCardForm({title:ddBlock?.title?`Deep dive: ${ddBlock.title}`.slice(0,70):'Deep dive insight',type:(ddBlock?.type||'insight') as BType,week:ddBlock?.week||2,priority:(ddBlock?.priority||'medium') as Priority,content:ddText.split(String.fromCharCode(10)).filter(Boolean).slice(0,4).join(String.fromCharCode(10)).slice(0,300)});
                        }}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 font-medium"
                      >
                        <Plus size={11}/>Create card from this
                      </button>
                    );
                    // Parse individual card suggestions
                    const suggestions = cardSection[1].split(/(?=\d+\.|[-*])/).filter(Boolean).slice(0,4);
                    return (
                      <div className="space-y-2">
                        <div className="text-xs font-mono text-primary uppercase">Suggested canvas cards</div>
                        {suggestions.map((sug,i)=>{
                          const titleMatch = sug.match(/\*\*([^*]+)\*\*|^\d+\.\s*([^\n]+)/);
                          const sugTitle = (titleMatch?.[1]||titleMatch?.[2]||sug).replace(/^[-*\d.\s]+/,'').split(String.fromCharCode(10))[0].slice(0,60).trim();
                          const typeMatch = sug.match(/type[:\s]+(\w[\w-]*)/i);
                          const weekMatch = sug.match(/week[:\s]+(\d|backlog)/i);
                          const priMatch  = sug.match(/priority[:\s]+(high|medium|low)/i);
                          const sugType   = (typeMatch?.[1]||'insight').toLowerCase() as BType;
                          const sugWeek   = weekMatch?.[1]?.toLowerCase()==='backlog'?5:parseInt(weekMatch?.[1]||'2')||2;
                          const sugPri    = (priMatch?.[1]||'medium') as Priority;
                          if (!sugTitle) return null;
                          return (
                            <button key={i}
                              onClick={()=>{
                                setCreateCardFrom({text:ddText,source:'deep_dive'});
                                setCreateCardForm({title:sugTitle,type:sugType,week:sugWeek,priority:sugPri,content:sug.trim().slice(0,400)});
                              }}
                              className="w-full text-left flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
                            >
                              <Plus size={10} className="text-primary shrink-0"/>
                              <div className="min-w-0">
                                <span className="font-medium text-foreground">{sugTitle}</span>
                                <span className="ml-2 text-muted-foreground">{sugType} · Wk {sugWeek===5?'BL':sugWeek} · {sugPri}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
              <button onClick={async()=>{await navigator.clipboard.writeText(ddText);toast({title:'Copied!'});}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground"><Copy size={11}/>Copy</button>
              <button onClick={()=>setDdBlock(null)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground ml-auto">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Similar Card Conflict Modal ══ */}
      {similarCardConflict && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={()=>setSimilarCardConflict(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"/>
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-yellow-400/5">
              <div className="h-8 w-8 rounded-xl bg-yellow-400/15 border border-yellow-400/25 flex items-center justify-center shrink-0">
                <AlertTriangle size={14} className="text-yellow-400"/>
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm">Similar card already exists</div>
                <div className="text-xs text-muted-foreground mt-0.5">Expand the existing card's scope, or create a separate card</div>
              </div>
              <button onClick={()=>setSimilarCardConflict(null)} className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50">
                <X size={12}/>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">

              {/* Proposed new card */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="text-xs font-mono text-primary uppercase mb-1.5">You're adding</div>
                <div className="font-semibold text-sm">{similarCardConflict.proposed.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">{similarCardConflict.proposed.type}</span>
                  <span className="text-xs text-muted-foreground">Week {similarCardConflict.proposed.week === 5 ? 'Backlog' : similarCardConflict.proposed.week}</span>
                  <span className="text-xs text-muted-foreground">· {similarCardConflict.proposed.priority}</span>
                </div>
              </div>

              {/* Existing similar cards */}
              <div className="space-y-2">
                <div className="text-xs font-mono text-muted-foreground uppercase">Similar cards already on your canvas</div>
                {similarCardConflict.matches.map((match) => {
                  const tm = TM[match.type] || TM.custom;
                  return (
                    <div key={match.id} className="rounded-xl border border-border bg-background/60 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                          style={{background:`${tm.color}18`,border:`1px solid ${tm.color}28`}}>
                          {React.createElement(tm.icon,{size:11,style:{color:tm.color}})}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{match.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{match.content}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">Week {match.week === 5 ? 'Backlog' : match.week}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full border font-mono ${
                              match.status === 'done' || match.status === 'verified' ? 'border-green-400/30 text-green-400' :
                              match.status === 'doing' ? 'border-blue-400/30 text-blue-400' :
                              'border-border text-muted-foreground'
                            }`}>{match.status}</span>
                          </div>
                        </div>
                      </div>
                      {/* Merge option */}
                      <button
                        onClick={()=>mergeIntoExistingCard(match.id, similarCardConflict.proposed)}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-yellow-400/25 bg-yellow-400/5 text-yellow-400 text-xs font-semibold hover:bg-yellow-400/10 transition-colors"
                      >
                        <ArrowRight size={11}/>Expand scope of "{match.title.slice(0,30)}{match.title.length>30?'…':''}"
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Or create new */}
              <div className="border-t border-border pt-3 flex items-center gap-3">
                <button
                  onClick={()=>doAddCard(similarCardConflict.proposed, similarCardConflict.source)}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/25 transition-colors"
                >
                  <Plus size={13}/>Create as separate card anyway
                </button>
                <button onClick={()=>setSimilarCardConflict(null)} className="text-sm text-muted-foreground hover:text-foreground px-3">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Create Card from Chat Modal ══ */}
      {createCardFrom && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4" onClick={()=>setCreateCardFrom(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <div className="h-8 w-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                <Plus size={14} className="text-primary"/>
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm">Create a canvas card</div>
                <div className="text-xs text-muted-foreground">From {createCardFrom.source === 'canvas_chat' ? 'canvas chat' : createCardFrom.source === 'deep_dive' ? 'deep dive analysis' : 'chat response'}</div>
              </div>
              <button onClick={()=>setCreateCardFrom(null)} className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50">
                <X size={12}/>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">

              {/* Title */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Card title</label>
                <input
                  value={createCardForm.title}
                  onChange={e=>setCreateCardForm(f=>({...f,title:e.target.value}))}
                  placeholder="Short, actionable title…"
                  maxLength={70}
                  className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
                />
              </div>

              {/* Type + Priority row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Card type</label>
                  <select
                    value={createCardForm.type}
                    onChange={e=>setCreateCardForm(f=>({...f,type:e.target.value as BType}))}
                    className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none"
                  >
                    <option value="technical">🔧 Technical</option>
                    <option value="quick-win">⚡ Quick Win</option>
                    <option value="content">✍️ Content</option>
                    <option value="geo">🌐 GEO</option>
                    <option value="competitive">🎯 Competitive</option>
                    <option value="insight">💡 Insight</option>
                    <option value="weekly">📅 Weekly task</option>
                    <option value="kpi">📊 KPI / Tracking</option>
                    <option value="monthly">🗓️ Monthly milestone</option>
                    <option value="custom">📌 Custom</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Priority</label>
                  <select
                    value={createCardForm.priority}
                    onChange={e=>setCreateCardForm(f=>({...f,priority:e.target.value as Priority}))}
                    className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none"
                  >
                    <option value="high">🔴 High</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="low">🟢 Low</option>
                  </select>
                </div>
              </div>

              {/* Week */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Place in</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(w=>(
                    <button
                      key={w}
                      onClick={()=>setCreateCardForm(f=>({...f,week:w}))}
                      className={`flex-1 h-8 rounded-xl border text-xs font-medium transition-all ${createCardForm.week===w?'border-primary bg-primary/15 text-primary':'border-border text-muted-foreground hover:border-primary/40'}`}
                    >
                      {w===5?'BL':w===1?'Wk 1':w===2?'Wk 2':w===3?'Wk 3':'Wk 4'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-1">
                  {[1,2,3,4,5].map(w=>(
                    <div key={w} className={`flex-1 text-center text-xs text-muted-foreground/50 ${createCardForm.week===w?'text-primary':''}`}>
                      {w===1?'Found.':{2:'Build',3:'Accel.',4:'Comp.',5:'Backlog'}[w]}
                    </div>
                  ))}
                </div>
              </div>

              {/* Content preview / edit */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Card content</label>
                <textarea
                  value={createCardForm.content}
                  onChange={e=>setCreateCardForm(f=>({...f,content:e.target.value}))}
                  rows={4}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50 resize-none text-muted-foreground"
                  placeholder="Card details…"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border flex items-center gap-3">
              <button
                onClick={()=>{
                  if(!createCardForm.title.trim()){
                    toast({title:'Add a title',variant:'destructive'});return;
                  }
                  addCardFromChat(createCardForm, createCardFrom.source === 'canvas_chat' ? 'Canvas chat' : createCardFrom.source === 'deep_dive' ? 'Deep dive analysis' : 'Chat response');
                }}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90"
              >
                <Plus size={13}/>Add to Week {createCardForm.week===5?'Backlog':createCardForm.week}
              </button>
              <button onClick={()=>setCreateCardFrom(null)} className="text-sm text-muted-foreground hover:text-foreground px-3">
                Cancel
              </button>
              <span className="text-xs text-muted-foreground ml-auto">
                Card will be placed and saved immediately
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Manav Brain Executor ── */}
      {activeExecBlock && selProjId && (
        <InlineTaskExecutor
          block={activeExecBlock}
          projectId={selProjId}
          siteUrl={selProj?.url || ''}
          projectSummary={`${selProj?.name || ''} | ${selProj?.url || ''} | ${selProj?.keywords?.slice(0,5).join(', ') || ''}`}
          onClose={() => setActiveExecBlock(null)}
          onVerify={(block) => {
            setActiveExecBlock(null);
            setActiveVerifyBlock(block);
          }}
        />
      )}

{/* ── Inline Verify Modal ── */}
      {activeVerifyBlock && (
        <InlineVerifyModal
          block={activeVerifyBlock}
          siteUrl={selProj?.url || ''}
          onApprove={(b) => {
            setBlocks(prev => {
              const upd = prev.map(bl => bl.id === b.id ? {...bl, status: 'verified' as Status} : bl);
              scheduleAutoSave(upd);
              return upd;
            });
            setActiveVerifyBlock(null);
            toast({ title: '✓ Task verified and approved!' });
          }}
          onWait={(b, days) => {
            setBlocks(prev => {
              const upd = prev.map(bl => bl.id === b.id ? {...bl, status: 'waiting' as Status} : bl);
              scheduleAutoSave(upd);
              return upd;
            });
            setActiveVerifyBlock(null);
            toast({ title: `Set to Waiting — ${days} day${days !== 1 ? 's' : ''} remaining` });
          }}
          onClose={() => setActiveVerifyBlock(null)}
        />
      )}

      {/* ── Next Task Prompt ── */}
      {nextTaskPrompt && !nextConfirmed && (
        <div className="fixed bottom-6 right-6 z-40 w-80 rounded-2xl border border-primary/30 bg-card shadow-2xl overflow-hidden">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent"/>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-400"/>
              <span className="text-xs font-semibold text-green-400">Task Verified!</span>
              <button onClick={()=>setNextTaskPrompt(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X size={12}/></button>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="font-semibold text-xs mb-1">{nextTaskPrompt.title}</div>
              <p className="text-xs text-muted-foreground line-clamp-2">{nextTaskPrompt.content}</p>
            </div>
            <p className="text-xs font-medium">Have you fully completed the previous task?</p>
            <div className="flex gap-2">
              <button onClick={()=>{setNextConfirmed(true);setNextTaskPrompt(null);}} className="flex-1 text-xs py-2 rounded-lg bg-primary text-primary-foreground font-medium">Yes — move on</button>
              <button onClick={()=>setNextTaskPrompt(null)} className="text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground">Not yet</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Modal ── */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={()=>setShowAssignModal(null)}>
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm"/>
          <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5" onClick={e=>e.stopPropagation()}>
            <div className="font-bold mb-4">Assign Task</div>
            <div className="space-y-2 mb-4">
              {(selProj?.team_members||['Content Writer','Team Lead','Senior SEO','Developer','PM']).map((m: string)=>(
                <button key={m} onClick={()=>{
                  setBlocks(prev=>{const u=prev.map(b=>b.id===showAssignModal?{...b,assignee:m}:b);scheduleAutoSave(u);return u;});
                  setShowAssignModal(null);
                  toast({title:`Assigned to ${m}`});
                }} className="w-full text-left px-3 py-2 rounded-xl border border-border hover:bg-secondary/50 text-sm transition-colors">
                  {m}
                </button>
              ))}
              <button onClick={()=>{
                setBlocks(prev=>{const u=prev.map(b=>b.id===showAssignModal?{...b,assignee:undefined}:b);scheduleAutoSave(u);return u;});
                setShowAssignModal(null);
              }} className="w-full text-left px-3 py-2 rounded-xl border border-red-400/20 text-red-400/70 hover:bg-red-400/10 text-sm transition-colors">
                Unassign
              </button>
            </div>
            <button onClick={()=>setShowAssignModal(null)} className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Agenda Expanded ── */}
      {agendaExpanded !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={()=>setAgendaExpanded(null)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm"/>
          <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{maxHeight:'85vh'}} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
              <Calendar size={15} className="text-primary"/>
              <div className="font-bold flex-1">{COLUMNS[agendaExpanded]?.label} Agenda</div>
              <button onClick={()=>setAgendaExpanded(null)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50"><X size={13}/></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono">
                {agendaText[agendaExpanded] || 'No agenda generated yet. Click the Agenda button in the column header.'}
              </pre>
            </div>
            <div className="px-5 py-3 border-t border-border flex gap-2 shrink-0">
              <button onClick={async()=>{await navigator.clipboard.writeText(agendaText[agendaExpanded]||'');toast({title:'Copied!'});}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"><Copy size={11}/>Copy</button>
              <button onClick={()=>setAgendaExpanded(null)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground ml-auto">Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
