import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import PortalNav from '@/components/PortalNav';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Sparkles, FileText, Download, Copy, Plus, RefreshCw,
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
const safeStr = (v: any) => typeof v==='string'?v:v==null?'':JSON.stringify(v);
const fmtDate = (r: string) => r?new Date(r).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';

function assignWeek(b: any): number {
  if (b.type==='quick-win')   return 1;
  if (b.type==='technical')   return b.urgency==='immediate'||b.urgency==='this_week'?1:2;
  if (b.type==='content')     return Math.min(b.week||2,4);
  if (b.type==='geo')         return 2;
  if (b.type==='competitive') return 3;
  if (b.type==='kpi'||b.type==='monthly') return 5;
  return 5;
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
function buildLibraryFromStrategy(strategy: any): Block[] {
  const seen  = new Set<string>();
  const result: Block[] = [];

  const push = (b: Omit<Block,'id'|'status'|'placed'|'color'> & {type:BType}) => {
    const key = b.title.toLowerCase().slice(0, 50);
    if (seen.has(key) || !b.title.trim()) return;
    seen.add(key);
    result.push({
      ...b,
      id:     uid(),
      color:  TM[b.type]?.color || '#94a3b8',
      status: 'todo',
      placed: false,
    });
  };

  const safe = (v: any) => (v == null ? '' : String(v));
  const pri  = (v: any): Priority => v === 'high' ? 'high' : v === 'low' ? 'low' : 'medium';

  /* 1 — canvas_blocks (curated summary — highest signal) */
  for (const b of strategy.canvas_blocks || []) {
    push({
      type:     (b.type || 'custom') as BType,
      title:    safe(b.title).slice(0, 70),
      content:  safe(b.content),
      priority: pri(b.priority),
      week:     assignWeek(b),
      effort:   b.effort,
      impact:   b.impact,
      tags:     b.tags || [],
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
  for (const m of strategy.retainer_value_summary?.key_milestones || []) {
    push({
      type:     'monthly',
      title:    safe(m).slice(0, 70),
      content:  `Milestone: ${safe(m)}

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
  const [step,           setStep]           = useState as unknown as <T>(v:T)=>T(1);
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
      const data = await res.json();
      setResult(data.success ? data : {verdict:'cannot_determine',next_action:'Server error — try again.',evidence_found:[],evidence_missing:[],what_to_check:[]});
    } catch(e:any) {
      setResult({verdict:'cannot_determine',next_action:`Error: ${(e as Error).message}`,evidence_found:[],evidence_missing:[],what_to_check:[]});
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm"/>
      <div className="relative w-full max-w-2xl bg-[#0f0f13] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{maxHeight:'92vh'}} onClick={e=>e.stopPropagation()}>
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
              <div className="text-xs font-mono text-white/40 uppercase mb-2">Task submitted for approval</div>
              <p className="text-sm text-white/80">{block.content}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded border border-white/10 text-white/40">{block.type}</span>
                {block.impact&&<span className="text-xs px-2 py-0.5 rounded border border-orange-400/30 text-orange-400">Expected: {block.impact}</span>}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-white flex justify-between mb-1">
                <span><span className="text-red-400">*</span> What exactly did you do to complete this?</span>
                <span className="text-white/30 font-normal">{completionNote.length}/50 min</span>
              </label>
              <textarea value={completionNote} onChange={e=>setCompletionNote(e.target.value)} rows={4}
              <textarea value={completionNote} onChange={e=>setCompletionNote(e.target.value)} rows={4}
                placeholder="Describe what was done: which pages/files/settings changed, which tools used, before/after state."
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white mb-1 block">When did you finish?</label>
              <input type="date" value={completedDate} onChange={e=>setCompletedDate(e.target.value)} max={new Date().toISOString().split('T')[0]}
                className="h-9 text-sm px-3 rounded-xl border border-white/10 bg-white/3 text-white outline-none focus:border-violet-400/50"/>
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
              <div className="text-xs font-semibold text-white mb-3">Required evidence for <span className="text-violet-400">{block.type}</span> tasks:</div>
              {evReqs.map((r,i)=>(
                <div key={i} className="rounded-xl border border-white/8 bg-white/3 p-3 mb-2">
                  <div className="text-xs font-semibold text-violet-400 mb-1">{i+1}. {r.tool}</div>
                  <div className="text-xs text-white/50">→ {r.what}</div>
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-semibold text-white block mb-1">Paste your data from the tools above:</label>
              <textarea value={evidenceData} onChange={e=>setEvidenceData(e.target.value)} rows={4}
                placeholder="Paste evidence data. E.g.: GSC Indexed = 847 (was 823). /old-url 301 confirmed. OR: Keyword pos 8 (was 14) Semrush Jan 2024."
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-white/10 bg-white/3 text-white placeholder-white/20 outline-none focus:border-violet-400/50 resize-none font-mono"
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
                Next: Collect Evidence →
              </button>
              <button onClick={onClose} className="text-sm text-white/40 hover:text-white/70 px-3">Cancel</button>
              <span className="text-xs text-white/25 ml-auto">{completionNote.length}/50</span>
            </>
          )}
          {step===2&&(
            <>
              <button onClick={()=>setStep(1)} className="text-sm text-white/40 hover:text-white/70 px-3">← Back</button>
              <button onClick={()=>runCheck('live_check')} disabled={loading||!siteUrl}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors">
                <Globe size={14}/>{siteUrl?'Run Live Check':'Add URL to project first'}
              </button>
              <button onClick={()=>runCheck('guidance')} disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-40 text-white/70 text-sm transition-colors">
                <Brain size={14}/>Get Checklist Only
              </button>
              {!waitReady&&<button onClick={()=>onWait(block,daysLeft)} className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl border border-orange-400/30 bg-orange-400/10 text-orange-400 hover:bg-orange-400/15 ml-auto"><Clock size={13}/>Wait {daysLeft} more days</button>}
            </>
          )}
          {step===3&&!loading&&result&&(
            <>
              {result.verdict==='verified'
                ?<button onClick={()=>onApprove(block)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors"><CheckCircle2 size={15}/>Approve & Mark Verified</button>
                :<><button onClick={()=>{setStep(2);setResult(null);}} className="text-sm px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-white/70 transition-colors">← Add More Evidence</button>
                  {(result.waiting_status?.daysLeft||0)>0&&<button onClick={()=>onWait(block,result.waiting_status.daysLeft)} className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl border border-orange-400/30 bg-orange-400/10 text-orange-400"><Clock size={13}/>Mark as Waiting</button>}
                  <button onClick={()=>onApprove(block)} className="text-xs px-3 py-2 rounded-xl border border-white/10 text-white/30 hover:text-white/60 ml-auto">Override — approve anyway</button>
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
  const [selProjId,  setSelProjId]  = useState('');
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
  const chatEndRef    = useRef<HTMLDivElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const selProj       = projects.find(p=>p.id===selProjId);
  const client        = clients.find(c=>c.id===selProj?.client_id);
  const draggingBlock = blocks.find(b=>b.id===draggingId)??null;
  const libBlocks     = blocks.filter(b=>!b.placed&&(filterType==='all'||b.type===filterType));
  const placedBlocks  = blocks.filter(b=>b.placed);
  const done          = placedBlocks.filter(b=>b.status==='done').length;
  const progress      = placedBlocks.length>0?Math.round((done/placedBlocks.length)*100):0;

  useEffect(()=>{
    if(!selProjId){setReports([]);setStrategy(null);setBlocks([]);setRecommendation(null);return;}
    loadProject();
  },[selProjId]);

  const loadProject = async () => {
    const [rr,pr] = await Promise.all([
      supabase.from('audit_reports').select('*').eq('project_id',selProjId).order('created_at',{ascending:false}).limit(20),
      supabase.from('projects').select('playground_strategy,playground_canvas,playground_generated_at').eq('id',selProjId).single(),
    ]);
    setReports(rr.data||[]);
    if (pr.data?.playground_strategy){setStrategy(pr.data.playground_strategy);setGenAt(pr.data.playground_generated_at||'');}
    if (pr.data?.playground_strategy) {
      const allBlocks  = buildLibraryFromStrategy(pr.data.playground_strategy);
      const placements = (pr.data.playground_canvas || []) as {id:string;placed:boolean;week:number;status:Status}[];
      const placedMap  = new Map(placements.map(p => [p.id, p]));
      const merged = allBlocks.map(b => {
        const saved = placedMap.get(b.id);
        return saved ? {...b, placed: saved.placed, week: saved.week, status: saved.status} : b;
      });
      setBlocks(merged);
      setRecommendation(getNextRecommendation(merged.filter(b=>b.placed), merged.filter(b=>!b.placed)));
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
      const audits = reports.map(r=>({created_at:r.created_at,sections:Object.fromEntries(Object.entries(r.sections||{}).map(([k,v])=>[k,safeStr(v).slice(0,300)]))}));
      const res = await fetch('/api/playground-analysis', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          project: selProj, client: cl,
          metrics: mr.data||[], keywordRankings: rr2.data?.[0]?.keyword_rankings||[],
          auditReports: audits, competitors: selProj.competitors||[], allKeywords: selProj.keywords||[],
          resumeBatch: 0, existingStrategy: strategy||undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setBatchStatus(Object.fromEntries(Object.entries(data.batch_status||{}).map(([k,v])=>[k,String(v)])));
      setFailedBatches(data.failed_batches||[]);

      const mergedStrategy = {...(strategy||{}), ...data.strategy};
      setStrategy(mergedStrategy);
      setGenAt(data.generated_at);
      const nb = buildLibraryFromStrategy(mergedStrategy);
      setBlocks(nb);
      setRecommendation(getNextRecommendation([],nb));
      await supabase.from('projects').update({
        playground_strategy: mergedStrategy,
        playground_canvas: [],
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
          const data = await res.json();
          if (data.success) {
            const merged = {...(strategy||{}), ...data.strategy};
            setStrategy(merged);
            setBlocks(buildLibraryFromStrategy(merged));
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
          card:           block,
          siteUrl:        selProj?.url || '',
          completedAt:    completedDates[block.id] || new Date().toISOString(),
          checkType,
          completionNote, // what the user says they did
          evidenceData,   // any pasted report data
        }),
      });
      const data = await res.json();
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
      const weekCaps = {1:4, 2:4, 3:4, 4:4, 5:99};
      const weekCounts: Record<number,number> = {};
      // Count existing placed per week
      prev.filter(b=>b.placed).forEach(b => { weekCounts[b.week] = (weekCounts[b.week]||0)+1; });
      // Sort library blocks by expert order: technical > quick-win > content > geo > competitive > weekly > insight > kpi > monthly > custom
      const typeOrder: Record<BType,number> = {'technical':0,'quick-win':1,'content':2,'geo':3,'competitive':4,'weekly':5,'insight':6,'kpi':7,'monthly':8,'custom':9};
      const priOrder:  Record<Priority,number> = {'high':0,'medium':1,'low':2};
      const lib = prev.filter(b=>!b.placed)
        .sort((a,b)=> typeOrder[a.type]-typeOrder[b.type] || priOrder[a.priority]-priOrder[b.priority]);
      for (const block of lib) {
        const targetWeek = assignWeek(block);
        // Find best week with space
        const weeks = [targetWeek, ...([1,2,3,4,5].filter(w=>w!==targetWeek))];
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
      const res=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({focusBlockId:block.id,blocks,projectSummary:proj})});
      if(!res.ok||!res.body) throw new Error('Request failed');
      const reader=res.body.getReader();const dec=new TextDecoder();let acc='';
      while(true){const{done,value}=await reader.read();if(done)break;acc+=dec.decode(value,{stream:true});setDdText(acc);}
    } catch(e:any){setDdText(`Error: ${e.message}`);}
    setDdLoading(false);
  };

  const askCanvas = async()=>{
    if(!chatQ.trim()||chatLoading) return;
    setChatLoading(true);setChatResp('');
    const proj=`${client?.company||'Client'} | ${selProj?.url||''} | ${client?.industry||''}`;
    try {
      const res=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:chatQ,blocks:placedBlocks,projectSummary:proj})});
      if(!res.ok||!res.body) throw new Error('failed');
      const reader=res.body.getReader();const dec=new TextDecoder();let acc='';
      while(true){const{done,value}=await reader.read();if(done)break;acc+=dec.decode(value,{stream:true});setChatResp(acc);chatEndRef.current?.scrollIntoView({behavior:'smooth'});}
    } catch(e:any){setChatResp(`Error: ${e.message}`);}
    setChatLoading(false);
  };

  const saveCanvas = async (currentBlocks: Block[]) => {
    if (!selProjId) return;
    const placements = currentBlocks.filter(x=>x.placed).map(x=>({id:x.id,placed:x.placed,week:x.week,status:x.status}));
    try {
      await supabase.from('projects').update({playground_canvas:placements}).eq('id',selProjId);
    } catch(e) { /* silent */ }
  };

  const scheduleAutoSave = (currentBlocks: Block[]) => {
    if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveCanvas(currentBlocks), 800);
  };

  useEffect(() => {
    if (blocks.length && selProjId) scheduleAutoSave(blocks);
  }, [blocks]);

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
                            {exp?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
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
                    <h3 className="font-bold text-lg mb-2">Generate Your Deep Strategy</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">Claude analyses every audit, metric, keyword, and competitor gap then produces a complete strategic brief plus 12-16 canvas blocks ready to drag and plan with.</p>
                    <Button onClick={generate} disabled={generating} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground"><Brain className="h-4 w-4 mr-2"/>Generate Strategy</Button>
                  </div>
                ) : (
                  <>
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
                    <Button onClick={()=>setTab('canvas')} className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                      <Layers className="h-4 w-4 mr-2"/>Open Strategy Canvas →
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* ── CANVAS ── */}
            {tab==='canvas' && (
              <div className="space-y-4">
                {blocks.length===0 && !strategy ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
                    <Layers size={48} className="text-muted-foreground/20 mx-auto mb-4"/>
                    <h3 className="font-bold text-lg mb-2">Canvas is empty</h3>
                    <p className="text-sm text-muted-foreground mb-5">Generate a strategy — Claude will analyse all your data and create task blocks from goals, audit findings, and growth opportunities.</p>
                    <Button onClick={generate} disabled={generating} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground"><Brain className="h-4 w-4 mr-2"/>Generate Strategy</Button>
                  </div>
                ) : (
                  <>
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
                            When done: <span className="font-medium text-foreground">scroll down to the Verification Queue below</span> and click <span className="font-medium text-primary">Submit for Verification →</span> to open the 3-step wizard
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
                            const m    = TM[block.type]||TM.custom;
                            const Icon = m.icon;
                            const pm   = PM[block.priority];
                            const isRecommended = recommendation?.block.id===block.id;
                            const isHighlighted = highlightId===block.id;
                            return (
                              <div
                                id={`lib-block-${block.id}`}
                                key={block.id}
                                draggable
                                onDragStart={e=>onDragStart(e,block.id)}
                                onDragEnd={onDragEnd}
                                className={`rounded-xl border p-3 cursor-grab active:cursor-grabbing group hover:shadow-md transition-all ${draggingId===block.id?'opacity-40 scale-95':''} ${isHighlighted?'ring-2 ring-yellow-400 border-yellow-400/40 bg-yellow-400/10':isRecommended?`ring-1 ring-yellow-400/60 ${m.border} ${m.bg}`:`${m.border} ${m.bg}`}`}
                              >
                                {/* recommended badge */}
                                {isRecommended && (
                                  <div className="flex items-center gap-1 mb-2">
                                    <Lightbulb size={9} className="text-yellow-400"/>
                                    <span className="text-xs font-mono text-yellow-400">Next recommended</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <GripVertical size={10} className="text-muted-foreground/30 shrink-0"/>
                                  <Icon size={10} style={{color:m.color}} className="shrink-0"/>
                                  <span className="text-xs font-semibold flex-1 leading-tight">{block.title}</span>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">{block.content}</p>
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${pm.dot}`}/>
                                    <span className="text-xs text-muted-foreground">{block.priority}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {block.effort && <span className="text-xs font-mono text-muted-foreground/60">{block.effort}</span>}
                                    <span className="text-xs font-mono" style={{color:m.color}}>{m.label}</span>
                                  </div>
                                </div>
                                {block.tags && block.tags.length > 0 && (
                                  <div className="flex gap-1 mt-1.5 flex-wrap">
                                    {block.tags.slice(0,3).map((t,i)=><span key={i} className="text-xs px-1.5 py-0.5 rounded-full border border-border/50 bg-background/40 text-muted-foreground/60">{t}</span>)}
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
                                    const wl  = workloadLabel(hrs);
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-xs font-mono font-semibold ${wl.color}`}>{formatHours(hrs)}</span>
                                        <span className={`text-xs ${wl.color} opacity-70`}>{wl.label}</span>
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
                              {/* Status summary pills */}
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
                            )}                            {/* Cards */}                            <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{maxHeight: agendaWeek===col.week ? 160 : 340}}>                              {colBlocks.length===0&&!isOver && (                                <div className={`h-16 rounded-xl border-2 border-dashed flex items-center justify-center ${isRecCol&&!draggingBlock?'border-yellow-400/30 bg-yellow-400/3':'border-border/25'}`}>                                  <p className="text-xs text-muted-foreground/30">{isRecCol&&!draggingBlock?'← recommended slot':'Drop here'}</p>                                </div>                              )}                              {colBlocks.map(block=>{                                const m    = TM[block.type]||TM.custom;                                const Icon = m.icon;                                const pm2  = PM[block.priority];                                const sm2  = SM[block.status];                                const SI   = sm2.icon;                                return (                                  <div                                    key={block.id}                                    draggable                                    onDragStart={e=>{if((e.target as HTMLElement).closest('button')){e.preventDefault();return;}onDragStart(e,block.id);}}                                    onDragEnd={onDragEnd}                                    className={`rounded-xl border ${m.border} ${m.bg} p-3 cursor-grab group transition-all ${draggingId===block.id?'opacity-40 scale-95':'hover:shadow-md'} ${block.status==='done'||block.status==='verified'?'opacity-60':''}`}                                  >                                    <div className="flex items-start gap-2 mb-2">                                      <Icon size={11} style={{color:m.color}} className="shrink-0 mt-0.5"/>                                      <p className={`text-xs font-semibold flex-1 leading-tight ${block.status==='done'||block.status==='verified'?'line-through text-muted-foreground':''}`}>{block.title}</p>                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">                                        <button onClick={e=>{e.stopPropagation();setActiveExecBlock(block);}} title="Execute with AI — get AI to do this task" className="h-5 w-5 rounded flex items-center justify-center bg-primary/15 hover:bg-primary/30 text-primary" draggable={false}><Sparkles size={9}/></button>
                                        <button onClick={e=>{e.stopPropagation();deepDive(block);}} title="AI Deep Dive" className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-primary/20 text-muted-foreground hover:text-primary"><Brain size={9}/></button>                                        <button onClick={e=>{e.stopPropagation();setExpandedBlock(block);}} title="Expand" className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-background text-muted-foreground hover:text-foreground"><Maximize2 size={9}/></button>                                        <button onClick={e=>{e.stopPropagation();returnToLib(block.id);}} title="Return to library" className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-red-400/20 text-muted-foreground hover:text-red-400"><X size={9}/></button>                                      </div>                                    </div>                                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">{block.content}</p>                                    <div className="flex items-center justify-between gap-1 mt-1">                                      <div className="flex items-center gap-1">                                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${pm2.dot}`}/>                                        <span className="text-xs text-muted-foreground">{block.priority}</span>                                      </div>                                      <button
                                        onClick={e=>{e.stopPropagation();toggleStatus(block.id);}}
                                        className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border font-medium transition-all ${
                                          block.status==='verified' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                                          block.status==='done'     ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                                          block.status==='doing'    ? 'text-blue-400 bg-blue-400/10 border-blue-400/20 hover:bg-blue-400/20' :
                                          block.status==='review'   ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                                          block.status==='waiting'  ? 'text-orange-400 bg-orange-400/10 border-orange-400/20' :
                                          'text-muted-foreground border-border/60 hover:border-primary/40 hover:text-primary'
                                        }`}
                                        title={block.status==='doing'?'Done with this? Click to open the 3-step verification wizard':block.status==='verified'?'Verified ✓ — click to reset to To Do':block.status==='todo'?'Click to mark as In Progress':'Click to change status'}
                                      >
                                        <SI size={8} className={block.status==='doing'?'animate-spin':''}/>
                                        <span>{sm2.label}</span>
                                      </button>
                                      {block.status==='waiting' && (
                                        <button onClick={()=>{setVerifyBlock(block);setVerifyResult(null);}} className="text-xs px-1 py-0.5 rounded border border-orange-400/30 text-orange-400 hover:bg-orange-400/10 ml-0.5">
                                          Check
                                        </button>
                                      )}                                    </div>                                    {/* Assignee row */}                                    <div className="flex items-center justify-between gap-1 mt-1.5">                                      <button onClick={e=>{e.stopPropagation();setShowAssignModal(block.id);}} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" title="Assign to team member">                                        <div className={`h-4 w-4 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${block.assignee ? 'bg-primary/20 text-primary' : 'bg-secondary/60 text-muted-foreground/40'}`}>                                          {block.assignee ? block.assignee[0].toUpperCase() : '+'}                                        </div>                                        <span className="truncate max-w-[55px]">{block.assignee || 'Assign'}</span>                                      </button>                                      <div className="flex items-center gap-1">
                                        <span className="text-xs font-mono text-muted-foreground/60">
                                          ~{block.aiAssisted?formatHours(estimateHours(block)*0.4):formatHours(estimateHours(block))}
                                          {block.aiAssisted&&<span className="text-primary text-xs"> AI</span>}
                                        </span>
                                        <button
                                          onClick={e=>{e.stopPropagation();setBlocks(prev=>{const u=prev.map(b=>b.id===block.id?{...b,aiAssisted:!b.aiAssisted}:b);scheduleAutoSave(u);return u;});}}
                                          title={block.aiAssisted?"AI assistance ON — click to turn off":"Turn on AI assistance to cut time by ~60%"}
                                          className={`text-xs px-1 py-0.5 rounded border transition-all ${block.aiAssisted?'bg-primary/15 border-primary/40 text-primary':'border-border/30 text-muted-foreground/30 hover:text-muted-foreground hover:border-border/60'}`}
                                        ><Brain size={7}/></button>
                                      </div>                                    </div>                                  </div>                                );                              })}                            </div>                          </div>                        );                      })}                    </div>                    {/* ── Verification & AI Assist Panel ── */}
                    {placedBlocks.some(b=>b.status==='doing'||b.status==='waiting') && (
                      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-secondary/10">
                          <Shield size={15} className="text-yellow-400"/>
                          <span className="font-semibold text-sm">Verification Queue</span>
                          <span className="text-xs text-muted-foreground">Click any card below to open the 3-step verification wizard</span>
                        </div>
                        <div className="p-4 space-y-2">
                          {placedBlocks.filter(b=>b.status==='doing'||b.status==='waiting').map(b=>{
                            const m = TM[b.type]||TM.custom;
                            const WAIT: Record<string,number> = {'technical':5,'content':14,'geo':7,'quick-win':3,'competitive':21,'weekly':3,'monthly':30,'kpi':7,'custom':5};
                            const wDays = WAIT[b.type]||5;
                            const comp  = completedDates[b.id]?new Date(completedDates[b.id]):null;
                            const dLeft = comp?Math.max(0,wDays-Math.floor((Date.now()-comp.getTime())/86400000)):wDays;
                            const ready = dLeft===0;
                            return (
                              <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background/60 hover:border-primary/30 transition-colors">
                                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{background:`${m.color}18`,border:`1px solid ${m.color}28`}}>
                                  <m.icon size={13} style={{color:m.color}}/>
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
                                    {b.status==='waiting'&&!ready?'Check early':'Submit for Verification →'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── AI Assist + Effort Guide ── */}
                    {placedBlocks.length > 0 && (
                      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                        <button
                          onClick={()=>document.getElementById('ai-assist-panel')?.classList.toggle('hidden')}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-secondary/20 transition-colors"
                        >
                          <Brain size={15} className="text-primary"/>
                          <span className="font-semibold text-sm">AI Assistance & Effort Guide</span>
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

                    {/* Ask the Canvas */}                    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">                      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-secondary/20">                        <MessageSquare className="h-4 w-4 text-primary"/>                        <span className="font-semibold text-sm">Ask the Canvas</span>                        <span className="text-xs text-muted-foreground">Claude answers using your full canvas and project data</span>                      </div>                      <div className="px-5 pt-3 pb-2 flex flex-wrap gap-2">                        {['What should I focus on today?','Which items give best ROI?','What are Week 1 dependencies?','What happens if I skip the backlog?','Which week needs more cards to be effective?'].map(q=>(                          <button key={q} onClick={()=>setChatQ(q)} className="text-xs px-2.5 py-1 rounded-full border border-border bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">{q}</button>                        ))}                      </div>                      <div className="px-5 pb-3 flex gap-2">                        <input value={chatQ} onChange={e=>setChatQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askCanvas()} placeholder="Ask anything about this strategy…" className="flex-1 h-10 text-sm px-4 rounded-xl border border-border bg-background/60 focus:border-primary/50 outline-none"/>                        <Button onClick={askCanvas} disabled={chatLoading||!chatQ.trim()} className="h-10 bg-primary text-primary-foreground px-4">                          {chatLoading?<RefreshCw size={14} className="animate-spin"/>:<Send size={14}/>}                        </Button>                      </div>                      {(chatResp||chatLoading) && (                        <div className="mx-5 mb-4 rounded-xl border border-border bg-background/60 p-4">                          {chatLoading&&!chatResp && <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw size={12} className="animate-spin text-primary"/>Thinking…</div>}                          {chatResp && <ChatMd text={chatResp}/>}                          <div ref={chatEndRef}/>                        </div>                      )}                    </div>                  </>                )}              </div>            )}          

            {/* ══ PIPELINE TAB ══ */}
            {tab==='pipeline' && (
              <div className="space-y-5">

                {/* URL check */}
                <div className="rounded-2xl border border-border bg-card/60 p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Globe className="h-4 w-4 text-primary shrink-0 mt-0.5"/>
                    <div className="flex-1">
                      <div className="font-semibold text-sm mb-1">Live Website Check (optional)</div>
                      <p className="text-xs text-muted-foreground">Claude will fetch live content from the site to ground all analysis in reality — not assumptions.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input value={checkUrl} onChange={e=>setCheckUrl(e.target.value)} placeholder={selProj?.url||'https://yourdomain.com'} className="flex-1 h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"/>
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

                {/* Role-Based Intelligence */}
                <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <div className="font-semibold text-sm mb-3 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary"/>Role-Based Intelligence</div>
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
                    const role = ROLES.find(r=>r.id===activeRole);
                    if(!role) return null;
                    const RIcon = role.icon;
                    return (
                      <>
                        <div className="px-5 py-2.5 border-b border-border/40 flex items-center gap-2" style={{background:role.color+'0a'}}>
                          <RIcon size={12} style={{color:role.color}}/>
                          <p className="text-xs text-muted-foreground">Answering for a <span className="font-semibold" style={{color:role.color}}>{role.label}</span> — framed and prioritised for what this role needs.</p>
                        </div>
                        <div className="px-5 py-3 border-b border-border/40">
                          <div className="text-xs font-medium text-muted-foreground mb-2">Suggested questions:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {role.questions.map((q,i)=>(
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
            )}</>        )}      </div>      {/* Block expand modal */}      {expandedBlock && (        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={()=>setExpandedBlock(null)}/>          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card/95 shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto">            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent"/>            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border sticky top-0 bg-card/95 backdrop-blur z-10">              {(()=>{const m=TM[expandedBlock.type]||TM.custom;const Icon=m.icon;return(<><div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{background:`${m.color}18`,border:`1px solid ${m.color}28`}}><Icon size={13} style={{color:m.color}}/></div><div className="flex-1"><div className="font-bold text-sm">{expandedBlock.title}</div><div className="text-xs font-mono" style={{color:m.color}}>{m.label}</div></div></>);})()}              <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${PM[expandedBlock.priority].badge}`}>{expandedBlock.priority}</span>              <button onClick={()=>{deepDive(expandedBlock);setExpandedBlock(null);}} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20"><Brain size={11}/>Deep Dive</button>              <button onClick={()=>setExpandedBlock(null)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50"><X size={13}/></button>            </div>            <div className="px-5 py-4 space-y-3">              <div className="rounded-xl border border-border bg-background/60 p-4"><p className="text-sm leading-relaxed whitespace-pre-wrap">{expandedBlock.content}</p></div>              {expandedBlock.tags&&expandedBlock.tags.length>0 && (                <div className="flex flex-wrap gap-1.5">{expandedBlock.tags.map((t,i)=><span key={i} className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary/30 text-muted-foreground flex items-center gap-1"><Tag size={8}/>{t}</span>)}</div>              )}              <div className="flex gap-2 flex-wrap">                {expandedBlock.effort && <span className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground">effort: {expandedBlock.effort}</span>}                {expandedBlock.impact && <span className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground">impact: {expandedBlock.impact}</span>}              </div>              <button onClick={async()=>{await navigator.clipboard.writeText(expandedBlock.content);toast({title:'Copied!'});}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground"><Copy size={11}/>Copy content</button>            </div>          </div>        </div>      )}      {/* Deep Dive modal */}      {ddBlock && (        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={()=>{if(!ddLoading)setDdBlock(null);}}/>          <div className="relative w-full max-w-2xl rounded-2xl border border-primary/30 bg-card/95 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent"/>            <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">              <Brain className="h-4 w-4 text-primary"/>              <div className="flex-1"><div className="font-semibold text-sm">AI Deep Dive</div><div className="text-xs text-muted-foreground truncate">{ddBlock.title}</div></div>              {ddLoading && <RefreshCw size={14} className="animate-spin text-primary"/>}              {!ddLoading && <button onClick={()=>setDdBlock(null)} className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50"><X size={12}/></button>}            </div>            <div className="flex-1 overflow-y-auto px-5 py-4">              {ddLoading&&!ddText && <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center"><RefreshCw size={14} className="animate-spin text-primary"/>Analysing this block in depth…</div>}              {ddText && <div className="rounded-xl border border-border bg-background/60 p-4"><ChatMd text={ddText}/></div>}            </div>            {ddText&&!ddLoading && (              <div className="px-5 py-3 border-t border-border shrink-0 flex gap-2">                <button onClick={async()=>{await navigator.clipboard.writeText(ddText);toast({title:'Copied!'});}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground"><Copy size={11}/>Copy</button>                <button onClick={()=>setDdBlock(null)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground ml-auto">Close</button>              </div>            )}          </div>     

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
            <div>
              <p className="text-xs text-muted-foreground mb-1">Recommended next:</p>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="font-semibold text-xs mb-1">{nextTaskPrompt.title}</div>
                <p className="text-xs text-muted-foreground line-clamp-2">{nextTaskPrompt.content}</p>
              </div>
            </div>
            <p className="text-xs font-medium">Have you fully completed the previous task before starting this?</p>
            <div className="flex gap-2">
              <button onClick={()=>{setNextConfirmed(true);highlightBlock(nextTaskPrompt.id);setNextTaskPrompt(null);}} className="flex-1 text-xs py-2 rounded-lg bg-primary text-primary-foreground font-medium">
                Yes — show me this task
              </button>
              <button onClick={()=>setNextTaskPrompt(null)} className="text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground">
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}

   </div>      )}      {/* Assign modal */}      {showAssignModal && (        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={()=>setShowAssignModal(null)}/>          <div className="relative w-80 rounded-2xl border border-border bg-card/95 shadow-2xl overflow-hidden">            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent"/>            <div className="px-5 py-4 border-b border-border">              <div className="font-semibold text-sm">Assign block</div>              <div className="text-xs text-muted-foreground truncate mt-0.5">                {blocks.find(b=>b.id===showAssignModal)?.title}              </div>            </div>            <div className="px-5 py-4 space-y-2">              {/* Unassign */}              <button onClick={()=>assignBlock(showAssignModal,'')}                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-secondary/50 transition-colors text-left">                <div className="h-7 w-7 rounded-full bg-secondary/60 flex items-center justify-center text-xs text-muted-foreground">—</div>                <span className="text-sm text-muted-foreground">Unassigned</span>                {!blocks.find(b=>b.id===showAssignModal)?.assignee && <CheckCircle2 size={13} className="text-primary ml-auto"/>}              </button>              {/* Team members */}              {teamMembers.map(member => (                <button key={member} onClick={()=>assignBlock(showAssignModal,member)}                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-secondary/50 transition-colors text-left">                  <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{member[0].toUpperCase()}</div>                  <span className="text-sm">{member}</span>                  {blocks.find(b=>b.id===showAssignModal)?.assignee===member && <CheckCircle2 size={13} className="text-primary ml-auto"/>}                </button>              ))}              {/* Add custom member */}              <div className="pt-2 border-t border-border">                <input                  placeholder="Add new team member…"                  className="w-full h-8 text-xs px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"                  onKeyDown={e => {                    if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {                      const name = (e.target as HTMLInputElement).value.trim();                      setTeamMembers(tm => [...tm, name]);                      assignBlock(showAssignModal, name);                    }                  }}                />                <p className="text-xs text-muted-foreground mt-1">Press Enter to add and assign</p>              </div>            </div>          </div>        </div>      )}

      {/* Full Agenda Modal */}
      {agendaExpanded !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" onClick={()=>setAgendaExpanded(null)}/>
          <div className="relative w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col" style={{maxHeight:'90vh'}}>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent"/>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
              <FileText className="h-4 w-4 text-primary"/>
              <div className="flex-1">
                <div className="font-bold text-sm">{agendaExpanded === 5 ? 'Backlog' : `Week ${agendaExpanded}`} — Full Agenda</div>
                {(()=>{
                  const wCards = blocks.filter(b=>b.placed&&b.week===agendaExpanded);
                  const hrs    = colTotalHours(wCards);
                  const wl     = workloadLabel(hrs);
                  return (
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">{wCards.length} tasks</span>
                      <span className={`text-xs font-mono font-semibold ${wl.color}`}>{formatHours(hrs)} total</span>
                      <span className={`text-xs ${wl.color} opacity-70`}>{wl.label}</span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={()=>generateAgenda(agendaExpanded!)} disabled={agendaLoading===agendaExpanded}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50 ${agendaStale.has(agendaExpanded!) ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30 hover:bg-yellow-400/20' : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'}`}>
                  <RefreshCw size={11} className={agendaLoading===agendaExpanded?'animate-spin':''}/>
                  {agendaLoading===agendaExpanded ? 'Generating...' : agendaStale.has(agendaExpanded!) ? 'Refresh (stale)' : agendaText[agendaExpanded!] ? 'Refresh' : 'Generate'}
                </button>
                {agendaText[agendaExpanded!] && (
                  <button onClick={async()=>{await navigator.clipboard.writeText(agendaText[agendaExpanded!]);toast({title:'Copied!'});}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-secondary/40 text-muted-foreground hover:text-foreground">
                    <Copy size={11}/>Copy
                  </button>
                )}
                <button onClick={()=>setAgendaExpanded(null)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50"><X size={14}/></button>
              </div>
            </div>

            {/* Time + assignee breakdown */}
            {(()=>{
              const wCards = blocks.filter(b=>b.placed&&b.week===agendaExpanded);
              if (!wCards.length) return null;
              const total    = colTotalHours(wCards);
              const byType   = Object.entries(wCards.reduce((acc:any,b)=>{acc[b.type]=(acc[b.type]||0)+estimateHours(b);return acc;},{})) as [string,number][];
              const byPerson = Object.entries(wCards.reduce((acc:any,b)=>{const k=b.assignee||'Unassigned';acc[k]=(acc[k]||0)+estimateHours(b);return acc;},{})) as [string,number][];
              return (
                <div className="px-6 py-3 border-b border-border/40 bg-secondary/10 shrink-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Time breakdown</span>
                    <span className="text-xs font-mono text-primary font-bold">{formatHours(total)} total estimated</span>
                  </div>
                  <div className="flex rounded-lg overflow-hidden h-2.5 gap-px">
                    {byType.sort((a,b)=>b[1]-a[1]).map(([type,hrs])=>{
                      const m=TM[type as BType]||TM.custom;
                      const pct=total>0?(hrs/total)*100:0;
                      return pct>1?<div key={type} title={`${m.label}: ${formatHours(hrs)}`} style={{width:`${pct}%`,background:m.color,opacity:0.75}} className="h-full"/>:null;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {byType.filter(([,h])=>h>0).sort((a,b)=>b[1]-a[1]).map(([type,hrs])=>{
                      const m=TM[type as BType]||TM.custom;
                      return <span key={type} className="flex items-center gap-1 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{background:m.color,opacity:0.75}}/>{m.label}: {formatHours(hrs)}</span>;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1 border-t border-border/30">
                    <span className="text-xs font-semibold text-foreground w-full">Who is doing what this week:</span>
                    {byPerson.sort((a,b)=>b[1]-a[1]).map(([name,hrs])=>(
                      <div key={name} className="flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1.5">
                        <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">{name[0].toUpperCase()}</div>
                        <div>
                          <div className="text-xs font-medium text-foreground">{name}</div>
                          <div className="text-xs font-mono text-primary">{formatHours(hrs as number)} estimated</div>
                        </div>
                        <div className="ml-1 text-xs text-muted-foreground">{wCards.filter(b=>(b.assignee||'Unassigned')===name).length} tasks</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {agendaLoading===agendaExpanded && !agendaText[agendaExpanded!] && (
                <div className="flex flex-col items-center gap-3 py-16">
                  <RefreshCw size={24} className="animate-spin text-primary"/>
                  <p className="text-sm text-muted-foreground">Analysing every card, cross-referencing data, writing your agenda...</p>
                </div>
              )}
              {agendaText[agendaExpanded!] ? (
                <AgendaMarkdown text={agendaText[agendaExpanded!]}/>
              ) : agendaLoading!==agendaExpanded && (
                <div className="text-center py-16">
                  <FileText size={48} className="text-muted-foreground/15 mx-auto mb-4"/>
                  <h3 className="font-bold text-lg mb-2">No agenda yet</h3>
                  <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">Generate a fact-based, client-ready agenda with task breakdown, expected outcomes, verification steps, gap analysis, and a report template.</p>
                  <Button onClick={()=>generateAgenda(agendaExpanded!)} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                    <Sparkles className="h-4 w-4 mr-2"/>Generate Agenda
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>  );}
