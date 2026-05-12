/**
 * GuestTour.tsx v3 — Complete rebuild
 * - After analysis: full navigation still works, analysis tab added to sidebar
 * - Brain proactively talks about YOUR data, asks qualifying questions
 * - Pre-suggested capsules after every brain message
 * - Live canvas card creation animation showing AI building your strategy
 * - Time-saving breakdown showing consultant cost vs Brain
 * - Proper PDF: clean layout, tables, no coordinate bugs
 * - Lead capture through guided conversation
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DemoProject } from '@/contexts/DemoContext';
import { DEMO_INDUSTRIES, detectIndustry } from '@/contexts/DemoContext';
import {
  Brain, Send, ChevronRight, ChevronLeft, ArrowRight, X,
  Target, BarChart3, Database, Cpu, Shield, BookOpen,
  CheckCircle, AlertCircle, Globe, Sparkles, Lock,
  Download, Loader2, Clock, Zap, TrendingUp, Star, Activity,
} from 'lucide-react';

/* ── Types ── */
interface QuickWin { title:string; effort:string; impact:string; impactPct:number; type:string; week:number; }
interface Roadmap   { week:number; label:string; tasks:string[]; gain:string; }
interface Analysis {
  businessName:string; url:string; industry:string;
  llmScore:number; llmPotential:number;
  healthScore:number; healthPotential:number;
  eeatScore:number; eeatPotential:number;
  authorityScore:number; authorityPotential:number;
  monthlyTraffic:number; trafficPotential:number;
  trafficProjection:number[];
  quickWins:QuickWin[]; roadmap:Roadmap[];
  keyInsight:string; biggestRisk:string;
  topOpportunity:string; summary:string;
}
interface Capsule   { label:string; key:string; }
interface BrainMsg  { role:'brain'|'user'; text:string; capsules?:Capsule[]; liveCards?:LiveCard[]; savings?:Saving[];}
interface LiveCard  { id:string; type:string; title:string; effort:string; impact:string; week:number; color:string; revealed:boolean; }
interface Saving    { task:string; old:string; brain:string; saved:string; }

/* ── Tour sections ── */
const SECTIONS = [
  { id:'playground',     label:'Strategy Canvas',  icon:Target,   color:'#4ade80' },
  { id:'dashboard',      label:'Live Metrics',     icon:BarChart3,color:'#a78bfa' },
  { id:'data-room',      label:'Data Room',        icon:Database, color:'#06b6d4' },
  { id:'algorithm-intel',label:'Algorithm Intel',  icon:Cpu,      color:'#f59e0b' },
  { id:'audit',          label:'SEO Audit',        icon:Shield,   color:'#ef4444' },
  { id:'brain-learning', label:'Brain Learning',   icon:BookOpen, color:'#10b981' },
];

const TYPE_COLOR:Record<string,string> = {
  'quick-win':'#4ade80','technical':'#06b6d4','content':'#facc15','geo':'#6366f1','competitive':'#fb923c'
};

/* ── Tour narrations (short, punchy) ── */
const NARRATION:Record<string,(d:DemoProject)=>string> = {
  playground: d=>`This is the Strategy Canvas — the engine room of ${d.name}.\n\nI've built ${d.canvas.length} tasks organised by week. Green = Quick Wins that move rankings in 7-14 days. Blue = technical fixes that compound. Yellow = content that builds authority.\n\nNo guessing. No wasted effort. Every week has a clear priority.\n\n⚡ Give me your URL and I'll build YOUR actual canvas right now.`,
  dashboard:  d=>`Your live command centre. Four scores I track constantly.\n\nLLM Visibility ${d.llm}/100 — ChatGPT and Perplexity citation rate. Algorithm Health ${d.health}/100. E-E-A-T ${d.eeat}/100. Authority ${d.authority}/100.\n\nI alert you the moment any of these change — before they affect rankings.\n\n⚡ Drop your URL and I'll show you YOUR real scores.`,
  'data-room': d=>`Everything I know about ${d.name} lives here.\n\nCompetitors mapped. Content gaps identified. Keywords tracked weekly.\n\nThis replaces the £2,000 SEO discovery audit most agencies charge upfront.\n\n⚡ Your URL + one sentence about your business = full competitive map in 30 seconds.`,
  'algorithm-intel': d=>`I track every Google update, every ChatGPT signal shift — and tell you specifically how it affects your site.\n\n${d.algo_impact}\n\nMost businesses find out about algorithm damage through lost rankings — weeks after the fact. This catches it on day one.\n\n⚡ Tell me your site. I'll run your algorithm vulnerability scan live.`,
  audit: d=>`Full audit of ${d.domain}. ${d.audits.length} priority issues found — each automatically becomes a canvas task with the exact fix.\n\n${d.audits[0]?'[CRITICAL] '+d.audits[0].issue:''}\n\nA manual audit from a consultant: 2-3 weeks, £1,500-3,000. This one: 45 seconds, included.\n\n⚡ Paste your URL. I'll audit it live.`,
  'brain-learning': d=>`Every operation I run leaves a permanent learning. I never forget what worked and why.\n\nAfter 90 days, I know ${d.name} better than any consultant — because I'm working on it every single day.\n\n⚡ Start your project today and I begin learning immediately.`,
};

/* ── Default capsules by section ── */
const SECTION_CAPSULES:Record<string,Capsule[]> = {
  playground:     [{label:'How are cards created?',key:'how_cards'},{label:'Show me Week 1',key:'week1'},{label:'Analyse my site',key:'boost'}],
  dashboard:      [{label:'What is LLM Visibility?',key:'llm_explain'},{label:'How fast do scores improve?',key:'speed'},{label:'Analyse my site',key:'boost'}],
  'data-room':    [{label:'What data do you store?',key:'data_stored'},{label:'How do you find competitors?',key:'competitors'},{label:'Analyse my site',key:'boost'}],
  'algorithm-intel':[{label:'Which updates matter most?',key:'updates'},{label:'Am I at risk now?',key:'risk_check'},{label:'Analyse my site',key:'boost'}],
  audit:          [{label:'How is this different from Ahrefs?',key:'vs_ahrefs'},{label:'What gets fixed first?',key:'priority'},{label:'Analyse my site',key:'boost'}],
  'brain-learning':[{label:'How does Brain Learning work?',key:'how_learn'},{label:'What does 90 days look like?',key:'ninety_days'},{label:'Get started',key:'cta'}],
};

/* ── Pre-scripted Brain replies for capsule taps ── */
type ScriptKey = string;
interface ScriptReply { text:(a:Analysis|null,d:DemoProject|null)=>string; capsules:Capsule[]; savings?:Saving[]; createCards?:boolean; }

const SCRIPTS:Record<ScriptKey,ScriptReply> = {
  how_cards: { text:(_a,d)=>`Canvas cards are generated automatically from three sources.\n\n1. Your audit results — every issue becomes a task with the exact fix.\n2. Competitor gap analysis — topics they rank for that you don't.\n3. Algorithm intelligence — tasks that directly address recent update signals.\n\nFor ${d?.name||'your project'}, I created ${d?.canvas.length||8} cards from scratch in under 60 seconds. A strategy consultant would charge a day's rate for the same output.`, capsules:[{label:'Show me a card being created',key:'create_live'},{label:'How long to complete Week 1?',key:'week1_time'},{label:'Analyse my site',key:'boost'}] },
  week1: { text:(_a,d)=>`Week 1 for ${d?.name||'your project'} is focused entirely on quick wins and technical fixes that compound.\n\nPriority order:\n1. ${d?.canvas[0]?.title||'Fix critical technical issues'} (${d?.canvas[0]?.effort||'2h'})\n2. ${d?.canvas[1]?.title||'Implement structured data'} (${d?.canvas[1]?.effort||'3h'})\n3. ${d?.canvas[2]?.title||'Optimise meta data'} (${d?.canvas[2]?.effort||'4h'})\n\nTotal time investment: 9-12 hours. Expected outcome: measurable ranking movement within 10-14 days.`, capsules:[{label:'How does Brain track progress?',key:'track_progress'},{label:'What if I have no time?',key:'no_time'},{label:'Analyse my site',key:'boost'}] },
  how_learn: { text:()=>`Brain Learning works by extracting structured insights from every operation.\n\nEvery task executed, every audit run, every strategy generated — the outcome is recorded: what worked, what impact it had, what to do differently next time.\n\nAfter 90 days of working with a project, my recommendations are 3-4x more specific and accurate than day one — because I've seen what actually moves the needle for YOUR site, not just in theory.`, capsules:[{label:'Does it get smarter over time?',key:'smarter'},{label:'What data does it collect?',key:'data_stored'},{label:'Get started',key:'cta'}] },
  llm_explain: { text:()=>`LLM Visibility measures how often AI search engines (ChatGPT, Perplexity, Gemini) mention or cite your brand when answering queries in your space.\n\nThis is now the fastest-growing traffic source — users who ask ChatGPT "what's the best [product] for X?" and get your brand cited are high-intent buyers.\n\nMost sites are at 10-30/100. Getting to 60+ means appearing in AI answers for your core commercial queries. The top 10% of optimised sites are hitting 70-85/100.`, capsules:[{label:'How do I improve LLM Visibility?',key:'improve_llm'},{label:'How fast does it change?',key:'speed'},{label:'Analyse my site',key:'boost'}] },
  improve_llm: { text:()=>`Three things move LLM Visibility fastest:\n\n1. FAQ pages with clear question-answer structure — AI engines cite these 4x more than narrative content.\n2. Author authority signals — a named expert with credentials on the page increases citation likelihood significantly.\n3. Data and statistics — AI prefers citing sources with specific numbers over general claims.\n\nI track your LLM Visibility score weekly and generate specific tasks when it drops or when new opportunities appear.`, capsules:[{label:'Show me an example FAQ optimisation',key:'faq_example'},{label:'How does author authority work?',key:'eeat'},{label:'Analyse my site',key:'boost'}] },
  vs_ahrefs: { text:()=>`Good question. Ahrefs and SEMrush are research tools — they show you data, then leave you to figure out what to do with it.\n\nI am an execution engine. I take the data, generate the strategy, create the tasks, track progress, and update the plan when algorithms change — automatically.\n\nTypical SEO workflow without this:\n- 4-6h/week analysing data across multiple tools\n- 2-3h writing and prioritising tasks\n- Constant firefighting when rankings drop\n\nWith Brain: 30-minute weekly review. Everything else is automated.`, capsules:[{label:'What tools does Brain replace?',key:'tools_replaced'},{label:'How much time does it save?',key:'time_saving'},{label:'Analyse my site',key:'boost'}], savings:[{task:'Data analysis',old:'4-6h/week',brain:'Auto',saved:'4-6h'},{task:'Task creation',old:'2-3h/week',brain:'Auto',saved:'2-3h'},{task:'Algorithm monitoring',old:'Missed',brain:'24/7',saved:'£500+ risk'}] },
  time_saving: { text:()=>`Here is the honest time breakdown.\n\nA typical SEO setup without this system requires:\n- Monthly audit: 8-12 hours or £1,500 consultant fee\n- Strategy and task planning: 6-8 hours/month\n- Competitor monitoring: 3-4 hours/month\n- Algorithm tracking: constant reading or missed entirely\n\nWith Manav Brain:\n- Monthly audit: automated, always updated\n- Strategy: auto-generated from data\n- Competitors: tracked automatically\n- Algorithms: instant alerts\n\nTotal time saved: 15-20 hours per month. At a freelance rate of £50-80/hour, that is £750-1,600/month in time value.`, capsules:[{label:'What is the pricing?',key:'pricing'},{label:'Show me the full demo',key:'cta'},{label:'Analyse my site',key:'boost'}], savings:[{task:'Monthly audit',old:'£1,500 or 10h',brain:'Automated',saved:'£1,500'},{task:'Strategy planning',old:'8h/month',brain:'Auto-generated',saved:'8h'},{task:'Competitor tracking',old:'4h/month',brain:'Always on',saved:'4h'},{task:'Algorithm alerts',old:'Usually missed',brain:'Instant',saved:'Ranking protection'}] },
  ninety_days: { text:(_a,d)=>`90 days with ${d?.name||'your project'} looks like this.\n\nWeeks 1-2: Foundation — technical fixes, meta optimisation, structured data. First ranking movements expected.\n\nWeeks 3-4: Content and authority building. Target keywords start climbing. LLM Visibility begins improving.\n\nWeeks 5-8: Compounding effects kick in. Traffic growth accelerates. Algorithm alignment improves.\n\nWeeks 9-12: Momentum phase. Top-of-funnel content ranking. Brand appearing in AI answers. Traffic 2-3x vs baseline.\n\nEvery step is tracked and adjusted automatically as we go.`, capsules:[{label:'What if rankings drop mid-campaign?',key:'drops'},{label:'Can I see results faster?',key:'speed'},{label:'Get started today',key:'cta'}] },
  drops: { text:()=>`Ranking drops are caught immediately — usually before traffic is affected.\n\nHere is how the system handles it:\n1. Health scores drop — flagged within 24 hours\n2. Algorithm intel maps the update to your site\n3. Recovery tasks are auto-added to your canvas with priority\n4. Brain explains exactly what changed and why\n\nMost sites find out about drops weeks later when they check analytics. With this, you have a response plan before traffic falls.`, capsules:[{label:'Has this worked for others?',key:'results'},{label:'What kind of drops happen?',key:'risk_check'},{label:'Analyse my site',key:'boost'}] },
  create_live: { text:(_a,d)=>`I am creating your first canvas card right now. This is what the system does automatically when you run an audit or brief me on your project.\n\nEach card has: the exact task, time estimate, expected impact, and the right week to execute it. Nothing vague — every card is immediately actionable.\n\nFor ${d?.name||'a project like yours'}, I would generate 8-12 cards in the first session — a full month of prioritised SEO work.`, capsules:[{label:'Do you write the content too?',key:'content_ai'},{label:'How does prioritisation work?',key:'priority'},{label:'Analyse my site',key:'boost'}], createCards:true },
  content_ai: { text:()=>`Yes — Brain can write the actual content, not just plan it.\n\nFor each content task on the canvas I can:\n- Draft the full article or page copy\n- Generate optimised meta titles and descriptions\n- Write FAQ sections structured for AI citation\n- Create schema markup code ready to paste\n\nEverything is generated with your specific keywords, brand voice, and competitive gap data baked in — not generic AI content.`, capsules:[{label:'Does the content rank well?',key:'content_rank'},{label:'What about E-E-A-T?',key:'eeat'},{label:'Analyse my site',key:'boost'}] },
  eeat: { text:()=>`E-E-A-T (Experience, Expertise, Authoritativeness, Trust) is now one of Google's primary quality signals.\n\nThe most impactful E-E-A-T improvements I typically implement:\n1. Named author pages with real credentials and LinkedIn links\n2. Case study and results pages with specific data\n3. About page with company history and team bios\n4. External citations from recognised industry sources\n\nFor most sites, these changes take the E-E-A-T score from 30-40/100 to 60-70/100 within 60 days.`, capsules:[{label:'Show me my E-E-A-T score',key:'boost'},{label:'How long does it take?',key:'speed'},{label:'Start building E-E-A-T',key:'cta'}] },
  speed: { text:()=>`Timeline varies by site, but typical results:\n\nWeek 1-2: Technical fixes improve crawl efficiency and Core Web Vitals\nWeek 3-4: First ranking movements on target keywords\nWeek 6-8: Measurable organic traffic increase\nWeek 10-12: Significant traffic growth, LLM Visibility improving\n\nThe fastest wins come from technical issues (schema, page speed, meta data) — these can show results in 1-2 weeks. Content and authority building takes 4-8 weeks to compound.`, capsules:[{label:'What gives the fastest results?',key:'quickwin_type'},{label:'Is 90 days realistic?',key:'ninety_days'},{label:'Analyse my site',key:'boost'}] },
  boost: { text:()=>`Ready to make this about YOUR site.\n\nPaste your website URL below and give me one sentence about what you do. I will run a live analysis — quick wins, traffic projection, and a downloadable PDF report.`, capsules:[] },
  cta: { text:()=>`Everything you have just seen is ready for your real project the moment you sign up.\n\nYour strategy canvas is built in the first session. Manav Brain starts monitoring your site immediately. Metrics dashboard goes live with your real data.\n\nNo setup fee. No waiting. Full access from day one.`, capsules:[{label:'Sign up now',key:'signup'},{label:'I have more questions',key:'questions'},{label:'Analyse my site first',key:'boost'}] },
  signup: { text:()=>`Let's get you started. Head to the sign-up page and your project will be ready within minutes.\n\nFirst session: I'll ask about your site, your competitors, and your goals — then generate your complete strategy canvas automatically.`, capsules:[] },
  questions: { text:()=>`Of course. What would be most useful to know?\n\nI can go deeper on any part of the system — the AI analysis, how strategy is generated, how algorithm tracking works, pricing, onboarding, or anything else.`, capsules:[{label:'How is pricing structured?',key:'pricing'},{label:'Who is this built for?',key:'for_who'},{label:'What makes it different?',key:'vs_ahrefs'}] },
  pricing: { text:()=>`This is a managed, project-based platform — not a self-serve subscription.\n\nEach project gets a fully configured strategy canvas, weekly Brain analysis, algorithm monitoring, and direct access to Manav.\n\nTo discuss your specific project and what is involved, the best next step is to request access through the platform. Manav reviews each project personally to make sure the fit is right.`, capsules:[{label:'How do I request access?',key:'cta'},{label:'What is included?',key:'included'},{label:'Analyse my site',key:'boost'}] },
  for_who: { text:()=>`This is built for businesses that are serious about SEO — where rankings directly affect revenue.\n\nTypical projects:\n- E-commerce stores competing against large retailers\n- SaaS companies trying to reduce CAC through organic\n- Service businesses dominating local and national search\n- Agencies managing SEO for multiple clients\n\nNot a fit for: businesses that just want to "try SEO" without commitment, or sites with no existing content foundation.`, capsules:[{label:'I am e-commerce',key:'ecom_fit'},{label:'I run a service business',key:'service_fit'},{label:'Tell me about agency pricing',key:'pricing'}] },
  risk_check: { text:(_a,d)=>`Current algorithm risks for ${d?.industry||'your industry'}:\n\n1. Thin content — Google's 2024-2025 updates have been brutal on pages under 600 words with no genuine expertise signals.\n2. Low E-E-A-T — Particularly affects health, finance, legal, and any site giving advice.\n3. LLM citation gap — If competitors are being cited in AI answers and you are not, you are losing a growing share of high-intent queries.\n4. Core Web Vitals — Sites below the threshold see a measurable ranking penalty, particularly on mobile.\n\nI assess all four for your site as part of the standard analysis.`, capsules:[{label:'How do I know if I am affected?',key:'boost'},{label:'Which risk is worst?',key:'priority'},{label:'How fast can risks be fixed?',key:'speed'}] },
  priority: { text:()=>`Prioritisation uses three factors: impact on rankings, effort to implement, and urgency based on current algorithm signals.\n\nQuick Wins (high impact, low effort) always go in Week 1 — these are the fastest path to visible results.\n\nTechnical issues go next — they affect every page and compound every other improvement.\n\nContent and authority building fills Weeks 2-12 — slower to show results but creates sustainable, defensible rankings.\n\nI re-prioritise automatically whenever an algorithm update changes the weighting.`, capsules:[{label:'Show me a full prioritised plan',key:'ninety_days'},{label:'Analyse my site now',key:'boost'},{label:'How much time per week?',key:'time_saving'}] },
  /* Post-analysis scripts */
  post_insight: { text:(a)=>`Here is the most important thing I found about ${a?.businessName||'your site'}.\n\n${a?.keyInsight||'Your LLM Visibility is critically low — AI search engines are answering your customers queries without mentioning your brand.'}\n\nThis is the thing most audits miss entirely — because most tools only look at Google rankings. The AI search channel is where the next 2-3 years of growth is coming from.`, capsules:[{label:'How do I fix this?',key:'improve_llm'},{label:'Show my quick wins',key:'post_quickwins'},{label:'Build my Week 1 canvas',key:'post_canvas'}] },
  post_quickwins: { text:(a)=>`Your top quick win: ${a?.quickWins[0]?.title||'Fix technical issues'}.\n\nEffort: ${a?.quickWins[0]?.effort||'2-3 hours'}. Expected impact: ${a?.quickWins[0]?.impact||'+15% CTR in 2 weeks'}.\n\nThis is implementable today. I've added it to your strategy canvas along with 4 other quick wins that together represent roughly 8 hours of work and measurable ranking movement within 14 days.\n\nWant me to build the full Week 1 plan?`, capsules:[{label:'Yes, build full Week 1',key:'post_canvas'},{label:'What comes after Week 1?',key:'ninety_days'},{label:'Download my PDF report',key:'post_pdf'}], createCards:true },
  post_canvas: { text:(a)=>`I am building your Week 1 strategy canvas now.\n\nBased on your audit, I've created tasks ordered by impact and effort. Each one has a specific action, time estimate, and expected outcome.\n\nTotal Week 1 investment: ~10 hours. Projected outcome by Day 14: ranking movement on 3-5 target keywords, Core Web Vitals improvement, and first LLM citations being established.\n\nIn a traditional agency engagement, this strategy session alone would cost £800-1,500.`, capsules:[{label:'Show me what a traditional agency charges',key:'time_saving'},{label:'What does Week 2 look like?',key:'ninety_days'},{label:'Download PDF report',key:'post_pdf'}], createCards:true },
  post_risk: { text:(a)=>`Biggest risk I found: ${a?.biggestRisk||'Algorithm vulnerability from thin content and low E-E-A-T signals'}.\n\nThis is actively affecting your rankings right now — not a future risk. The March 2025 Core Update specifically targeted this pattern.\n\nI've created a recovery task in your canvas. Implementing it correctly over the next 3-4 weeks should address the root cause.`, capsules:[{label:'How urgent is this?',key:'drops'},{label:'What is the fix?',key:'priority'},{label:'Get started now',key:'cta'}] },
  post_traffic: { text:(a)=>{ const pot=a?.trafficPotential||0; const cur=a?.monthlyTraffic||0; const gain=pot-cur; return `Traffic projection: ${cur.toLocaleString()} visits/month now → ${pot.toLocaleString()} visits/month at Month 6.\n\nThat is an additional ${gain.toLocaleString()} visits per month. At an average conversion rate of 2% and a £50 average order value, that is roughly £${Math.round(gain*0.02*50).toLocaleString()} in additional monthly revenue from organic alone.\n\nThese numbers are conservative — they assume consistent execution of your canvas tasks without any external link building.`; }, capsules:[{label:'Show me the full roadmap',key:'ninety_days'},{label:'How was this calculated?',key:'speed'},{label:'Download PDF report',key:'post_pdf'}] },
  post_pdf: { text:()=>`Your full PDF report is ready to download — click the Download button at the top of your analysis.\n\nThe report includes your current scores, the 5 quick wins with effort and impact breakdown, your 6-month traffic projection, and the complete 90-day roadmap.\n\nShare it with your team, your boss, or use it as a brief if you bring in external help.`, capsules:[{label:'What is the next step to start?',key:'cta'},{label:'Can I speak with Manav directly?',key:'pricing'},{label:'Analyse another site',key:'boost'}] },
};

/* ── Build live cards from analysis ── */
function buildLiveCards(a: Analysis): LiveCard[] {
  const base = [
    {type:'quick-win',title:'Fix meta descriptions — '+a.quickWins[0]?.title.slice(0,40)||'Fix critical issues',effort:'2h',impact:'+12% CTR',week:1},
    {type:'technical', title:a.quickWins[1]?.title.slice(0,45)||'Implement structured data',effort:'3h',impact:'Rich results',week:1},
    {type:'content',   title:a.quickWins[2]?.title.slice(0,45)||'Publish high-intent guide',effort:'5h',impact:'Ranking uplift',week:2},
    {type:'geo',       title:'GEO optimise top 3 pages for AI citation',effort:'4h',impact:'LLM visibility',week:2},
  ];
  return base.map((c,i)=>({...c,id:'lc'+i,color:TYPE_COLOR[c.type]||'#6366f1',revealed:false}));
}

/* ── Score Ring ── */
function Ring({score,potential,label,color}:{score:number;potential?:number;label:string;color:string}) {
  const r=18, circ=2*Math.PI*r;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      <div style={{position:'relative',width:46,height:46}}>
        <svg viewBox="0 0 44 44" style={{width:46,height:46,transform:'rotate(-90deg)'}}>
          <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"/>
          <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ*(1-score/100)}
            style={{filter:'drop-shadow(0 0 4px '+color+')'}}/>
        </svg>
        <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:900,color:'white'}}>{score}</span>
      </div>
      {potential&&<span style={{fontSize:8,color:'#10b981',fontFamily:'monospace'}}>→{potential}</span>}
      <span style={{fontSize:8,color:'rgba(255,255,255,0.35)',textAlign:'center',lineHeight:1.3,maxWidth:60}}>{label}</span>
    </div>
  );
}

/* ── Analysis Dashboard ── */
function AnalysisDashboard({analysis,cards,onDownload,downloading}:{analysis:Analysis;cards:LiveCard[];onDownload:()=>void;downloading:boolean}) {
  const maxT = Math.max(...analysis.trafficProjection,1);
  const tc    = TYPE_COLOR;
  const svgPts = analysis.trafficProjection.map((v,i)=>({x:10+(i/5)*280,y:46-(v/maxT)*42}));
  return (
    <div style={{height:'100%',overflow:'auto',background:'#06091a'}}>
      {/* Header */}
      <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(99,102,241,0.12)',background:'rgba(20,15,50,0.4)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:900,color:'white'}}>{analysis.businessName}</div>
          <div style={{fontSize:9,color:'rgba(165,180,252,0.5)',fontFamily:'monospace'}}>{analysis.url}</div>
        </div>
        <button onClick={onDownload} disabled={downloading} style={{display:'flex',alignItems:'center',gap:5,background:downloading?'rgba(99,102,241,0.12)':'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:8,padding:'7px 13px',color:'white',fontSize:9,fontFamily:'monospace',fontWeight:700,cursor:'pointer',boxShadow:'0 0 12px rgba(99,102,241,0.35)'}}>
          {downloading?<Loader2 size={10} style={{animation:'spin 1s linear infinite'}}/>:<Download size={10}/>}
          {downloading?'Generating...':'Download PDF Report'}
        </button>
      </div>
      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
        {/* Key insight */}
        <div style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.22)',borderRadius:9,padding:'10px 13px'}}>
          <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.6)',marginBottom:4}}>KEY INSIGHT</div>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.78)',lineHeight:1.65}}>{analysis.keyInsight}</div>
        </div>
        {/* Score rings */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7}}>
          <Ring score={analysis.llmScore}       potential={analysis.llmPotential}       label="LLM Visibility"   color="#a78bfa"/>
          <Ring score={analysis.healthScore}    potential={analysis.healthPotential}    label="Algo Health"      color="#10b981"/>
          <Ring score={analysis.eeatScore}      potential={analysis.eeatPotential}      label="E-E-A-T"          color="#f59e0b"/>
          <Ring score={analysis.authorityScore} potential={analysis.authorityPotential} label="Authority"        color="#06b6d4"/>
        </div>
        {/* Traffic chart */}
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:9,padding:'11px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)'}}>TRAFFIC PROJECTION — 6 MONTHS</span>
            <span style={{fontSize:9,color:'#4ade80',fontFamily:'monospace'}}>{analysis.monthlyTraffic.toLocaleString()} → {analysis.trafficPotential.toLocaleString()}/mo</span>
          </div>
          <svg viewBox="0 0 300 50" style={{width:'100%',height:48,display:'block'}}>
            <defs><linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.35"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0"/></linearGradient></defs>
            <polygon points={['10,50',...svgPts.map(p=>p.x+','+p.y),'290,50'].join(' ')} fill="url(#chartGrad)"/>
            <polyline points={svgPts.map(p=>p.x+','+p.y).join(' ')} fill="none" stroke="#6366f1" strokeWidth="2" style={{filter:'drop-shadow(0 0 3px rgba(99,102,241,0.8))'}}/>
            {svgPts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={i===svgPts.length-1?3.5:2} fill={i===svgPts.length-1?'#a5b4fc':'rgba(99,102,241,0.6)'}/>)}
            {svgPts.map((p,i)=><text key={'t'+i} x={p.x} y={48} textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.2)">{['Now','M1','M2','M3','M4','M5'][i]}</text>)}
          </svg>
        </div>
        {/* Quick wins */}
        <div>
          <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',marginBottom:5,letterSpacing:'0.1em'}}>QUICK WINS — WEEKS 1-2</div>
          {(analysis.quickWins||[]).slice(0,5).map((qw,i)=>(
            <div key={i} style={{display:'flex',gap:9,alignItems:'center',background:'rgba(255,255,255,0.02)',borderLeft:'3px solid '+(tc[qw.type]||'#6366f1'),borderRadius:7,padding:'7px 10px',marginBottom:5}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:9,color:'rgba(255,255,255,0.72)',lineHeight:1.3,marginBottom:3}}>{qw.title}</div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <span style={{fontSize:7,color:'rgba(255,255,255,0.28)',fontFamily:'monospace'}}>{qw.effort}</span>
                  <div style={{flex:1,height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:Math.min(qw.impactPct,100)+'%',background:tc[qw.type]||'#6366f1',borderRadius:2}}/></div>
                  <span style={{fontSize:9,color:tc[qw.type]||'#6366f1',fontFamily:'monospace',flexShrink:0}}>{qw.impact}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Live canvas cards */}
        {cards.filter(c=>c.revealed).length>0&&(
          <div>
            <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',marginBottom:5,letterSpacing:'0.1em'}}>STRATEGY CANVAS — BEING BUILT FOR YOU</div>
            {cards.filter(c=>c.revealed).map((card,i)=>(
              <div key={card.id} style={{background:'rgba(255,255,255,0.02)',borderLeft:'3px solid '+card.color,borderRadius:7,padding:'7px 10px',marginBottom:5,animation:'fadeIn 0.4s ease'}}>
                <div style={{fontSize:9,color:'rgba(255,255,255,0.7)'}}>{card.title}</div>
                <div style={{fontSize:7,color:'rgba(255,255,255,0.25)',fontFamily:'monospace',marginTop:2}}>{card.type} · Week {card.week} · {card.effort} · {card.impact}</div>
              </div>
            ))}
            {cards.filter(c=>!c.revealed).length>0&&<div style={{fontSize:8,color:'rgba(99,102,241,0.4)',fontFamily:'monospace',display:'flex',alignItems:'center',gap:4}}><Loader2 size={9} style={{animation:'spin 1s linear infinite'}}/> Building more cards...</div>}
          </div>
        )}
        {/* Risk + Opportunity */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
          <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.18)',borderRadius:7,padding:'9px'}}>
            <div style={{fontSize:7,fontFamily:'monospace',color:'#fca5a5',marginBottom:3}}>BIGGEST RISK</div>
            <div style={{fontSize:9,color:'rgba(255,255,255,0.45)',lineHeight:1.5}}>{analysis.biggestRisk}</div>
          </div>
          <div style={{background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.18)',borderRadius:7,padding:'9px'}}>
            <div style={{fontSize:7,fontFamily:'monospace',color:'#34d399',marginBottom:3}}>TOP OPPORTUNITY</div>
            <div style={{fontSize:9,color:'rgba(255,255,255,0.45)',lineHeight:1.5}}>{analysis.topOpportunity}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Savings table ── */
function SavingsTable({savings}:{savings:Saving[]}) {
  return (
    <div style={{background:'rgba(16,185,129,0.05)',border:'1px solid rgba(16,185,129,0.18)',borderRadius:8,padding:'10px',marginTop:6}}>
      <div style={{fontSize:8,fontFamily:'monospace',color:'#34d399',marginBottom:6,display:'flex',alignItems:'center',gap:5}}><Clock size={9}/> TIME & COST SAVINGS</div>
      {savings.map((s,i)=>(
        <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 80px 80px',gap:6,padding:'4px 0',borderBottom:i<savings.length-1?'1px solid rgba(255,255,255,0.04)':'none',alignItems:'center'}}>
          <span style={{fontSize:9,color:'rgba(255,255,255,0.55)'}}>{s.task}</span>
          <span style={{fontSize:8,color:'rgba(255,100,100,0.6)',fontFamily:'monospace',textDecoration:'line-through'}}>{s.old}</span>
          <span style={{fontSize:8,color:'#10b981',fontFamily:'monospace'}}>{s.brain}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Page preview components ── */
function PagePlayground({data}:{data:DemoProject}) {
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a'}}>
      <div style={{display:'flex',gap:4,marginBottom:8,flexWrap:'wrap'}}>
        {Object.entries(TYPE_COLOR).map(([t,c])=><span key={t} style={{fontSize:7,fontFamily:'monospace',padding:'1px 7px',borderRadius:8,background:c+'18',border:'1px solid '+c+'30',color:c}}>{t}</span>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
        {[1,2,3].map(w=>(
          <div key={w}>
            <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',marginBottom:5,background:'rgba(99,102,241,0.1)',padding:'2px 7px',borderRadius:4,display:'inline-block'}}>WK {w}</div>
            <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:4}}>
              {data.canvas.filter(c=>c.week===w).map((card,i)=>(
                <div key={i} style={{background:'rgba(255,255,255,0.025)',borderLeft:'3px solid '+(TYPE_COLOR[card.type]||'#6366f1'),borderRadius:6,padding:'6px 8px'}}>
                  <div style={{fontSize:8,color:'rgba(255,255,255,0.65)',lineHeight:1.3,marginBottom:2}}>{card.title}</div>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{fontSize:7,color:TYPE_COLOR[card.type]||'#6366f1',fontFamily:'monospace'}}>{card.type}</span>
                    <span style={{fontSize:7,color:card.status==='done'?'#10b981':card.status==='in_progress'?'#f59e0b':'rgba(255,255,255,0.2)',fontFamily:'monospace'}}>{card.status==='done'?'Done':card.status==='in_progress'?'Active':'Queued'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function PageDashboard({data}:{data:DemoProject}) {
  const maxT=Math.max(...data.traffic_trend,1);
  const pts=data.traffic_trend.map((v,i)=>({x:8+(i/5)*184,y:38-(v/maxT)*34}));
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a',display:'flex',flexDirection:'column',gap:9}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
        <Ring score={data.llm} label="LLM Visibility" color="#a78bfa"/>
        <Ring score={data.health} label="Algo Health" color="#10b981"/>
        <Ring score={data.eeat} label="E-E-A-T" color="#f59e0b"/>
        <Ring score={data.authority} label="Authority" color="#06b6d4"/>
      </div>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:9,padding:'10px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
          <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)'}}>ORGANIC TRAFFIC</span>
          <span style={{fontSize:8,color:'#4ade80',fontFamily:'monospace'}}>+14%</span>
        </div>
        <div style={{fontSize:22,fontWeight:900,color:'white',marginBottom:5}}>{data.organic.toLocaleString()}</div>
        <svg viewBox="0 0 200 42" style={{width:'100%',height:40}}>
          <defs><linearGradient id="dtg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0"/></linearGradient></defs>
          <polygon points={['8,42',...pts.map(p=>p.x+','+p.y),'192,42'].join(' ')} fill="url(#dtg)"/>
          <polyline points={pts.map(p=>p.x+','+p.y).join(' ')} fill="none" stroke="#6366f1" strokeWidth="2"/>
        </svg>
      </div>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:9,padding:'10px'}}>
        <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)',marginBottom:6}}>KEYWORD RANKINGS</div>
        {data.keywords.slice(0,4).map((kw,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            <span style={{fontSize:9,color:'rgba(255,255,255,0.5)'}}>{kw}</span>
            <span style={{fontSize:8,fontFamily:'monospace',color:i<2?'#4ade80':'#f59e0b'}}>#{[3,7,14,28][i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function PageDataRoom({data}:{data:DemoProject}) {
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a',display:'flex',flexDirection:'column',gap:5}}>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'9px 12px',marginBottom:3}}>
        <div style={{fontSize:11,fontWeight:700,color:'white'}}>{data.name}</div>
        <div style={{fontSize:8,color:'rgba(165,180,252,0.5)',fontFamily:'monospace'}}>{data.domain}</div>
      </div>
      {[{l:'Keywords & Rankings',c:'#a78bfa',v:data.keywords.length+' tracked'},{l:'Competitor Analysis',c:'#06b6d4',v:'2 mapped'},{l:'Organic Analytics',c:'#10b981',v:data.organic.toLocaleString()+'/mo'},{l:'Technical Baseline',c:'#f59e0b',v:'Audited'},{l:'Content Strategy',c:'#facc15',v:'Mapped'},{l:'GEO Optimisation',c:'#6366f1',v:'In progress'}].map((s,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:7,padding:'7px 10px'}}>
          <div style={{width:5,height:5,borderRadius:'50%',background:s.c,flexShrink:0}}/>
          <span style={{fontSize:9,color:'rgba(255,255,255,0.5)',flex:1}}>{s.l}</span>
          <span style={{fontSize:8,fontFamily:'monospace',color:s.c}}>{s.v}</span>
          <CheckCircle size={9} style={{color:'#10b981',flexShrink:0}}/>
        </div>
      ))}
    </div>
  );
}
function PageAlgorithm({data}:{data:DemoProject}) {
  const updates=[{n:'March 2025 Core Update',e:'Google',i:'HIGH',c:'#ef4444',t:data.algo_impact.slice(0,70)},{n:'Helpful Content System v4',e:'Google',i:'HIGH',c:'#ef4444',t:'E-E-A-T signals weighted more heavily.'},{n:'ChatGPT Search Algorithm',e:'ChatGPT',i:'NEW',c:'#a78bfa',t:'Citation authority introduced.'},{n:'Perplexity Pro Ranking',e:'Perplexity',i:'MED',c:'#f59e0b',t:'Source credibility weighted higher.'}];
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a',display:'flex',flexDirection:'column',gap:6}}>
      <div style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.18)',borderRadius:8,padding:'8px 11px',marginBottom:2}}>
        <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.6)',marginBottom:4}}>4 ENGINES · 47 SIGNALS · LIVE</div>
        <div style={{display:'flex',gap:5}}>{['Google','ChatGPT','Perplexity','Bing'].map((e,i)=><span key={i} style={{fontSize:7,fontFamily:'monospace',padding:'2px 7px',borderRadius:6,background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.4)'}}>{e}</span>)}</div>
      </div>
      {updates.map((u,i)=>(
        <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:7,padding:'8px 10px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}><span style={{fontSize:9,color:'rgba(255,255,255,0.65)',fontWeight:600}}>{u.n}</span><span style={{fontSize:7,fontFamily:'monospace',color:u.c,background:u.c+'18',padding:'1px 5px',borderRadius:3}}>{u.i}</span></div>
          <div style={{fontSize:8,color:'rgba(255,255,255,0.32)'}}>{u.t}</div>
        </div>
      ))}
    </div>
  );
}
function PageAudit({data}:{data:DemoProject}) {
  const sc:Record<string,string>={critical:'#ef4444',high:'#f59e0b',medium:'#6366f1',low:'#10b981'};
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a',display:'flex',flexDirection:'column',gap:6}}>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:'9px 11px'}}>
        <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)',marginBottom:5}}>AUDIT COMPLETE · {data.domain}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5}}>{[{n:data.audits.filter(a=>a.severity==='critical').length,l:'Critical',c:'#ef4444'},{n:data.audits.filter(a=>a.severity==='high').length,l:'High',c:'#f59e0b'},{n:94,l:'Passed',c:'#10b981'},{n:3,l:'Warnings',c:'#6366f1'}].map((s,i)=><div key={i} style={{textAlign:'center'}}><div style={{fontSize:18,fontWeight:900,color:s.c}}>{s.n}</div><div style={{fontSize:7,color:'rgba(255,255,255,0.3)'}}>{s.l}</div></div>)}</div>
      </div>
      {data.audits.map((a,i)=>(
        <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid '+sc[a.severity]+'25',borderRadius:7,padding:'8px 10px',display:'flex',gap:7}}>
          <AlertCircle size={10} style={{color:sc[a.severity],flexShrink:0,marginTop:1}}/>
          <div><div style={{fontSize:9,color:'rgba(255,255,255,0.65)',lineHeight:1.3,marginBottom:2}}>{a.issue}</div><span style={{fontSize:7,fontFamily:'monospace',color:sc[a.severity]}}>{a.severity}</span><span style={{fontSize:7,color:'rgba(255,255,255,0.25)',marginLeft:6}}>→ {a.fix}</span></div>
        </div>
      ))}
    </div>
  );
}
function PageBrainLearning({data}:{data:DemoProject}) {
  const tc:Record<string,string>={technical:'#06b6d4',content:'#facc15',geo:'#6366f1','quick-win':'#4ade80'};
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a',display:'flex',flexDirection:'column',gap:6}}>
      <div style={{background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.18)',borderRadius:8,padding:'8px 11px',marginBottom:2}}>
        <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.55)'}}>{data.learnings.length} LEARNINGS · AUTO-CAPTURED · GROWING</div>
      </div>
      {data.learnings.map((l,i)=>(
        <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:7,padding:'8px 10px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
            <span style={{fontSize:7,fontFamily:'monospace',color:tc[l.type]||'#6366f1',background:(tc[l.type]||'#6366f1')+'18',padding:'1px 5px',borderRadius:3}}>{l.type.toUpperCase()}</span>
            <span style={{fontSize:7,color:'#10b981',fontFamily:'monospace'}}>{l.confidence}% · {l.applied}x</span>
          </div>
          <div style={{fontSize:9,color:'rgba(255,255,255,0.7)',fontWeight:600,marginBottom:2}}>{l.title}</div>
          <div style={{fontSize:8,color:'rgba(255,255,255,0.35)',lineHeight:1.4}}>{l.insight}</div>
        </div>
      ))}
    </div>
  );
}

const PAGE_VIEWS:Record<string,(d:DemoProject)=>React.ReactNode> = {
  playground:      d=><PagePlayground data={d}/>,
  dashboard:       d=><PageDashboard data={d}/>,
  'data-room':     d=><PageDataRoom data={d}/>,
  'algorithm-intel':d=><PageAlgorithm data={d}/>,
  audit:           d=><PageAudit data={d}/>,
  'brain-learning':d=><PageBrainLearning data={d}/>,
};

/* ── PDF Generator (clean layout) ── */
async function downloadPDF(analysis: Analysis) {
  const { jsPDF } = await import('jspdf');
  const doc   = new jsPDF({ unit:'mm', format:'a4' });
  const W=210, _H=297;
  let y = 0;

  const bg   = (r:number,g:number,b:number,y1:number,h:number) => { doc.setFillColor(r,g,b);doc.rect(0,y1,W,h,'F'); };
  const txt  = (t:string,size:number,bold:boolean,r:number,g:number,b:number,x:number,yy:number,maxW?:number) => {
    doc.setFontSize(size);doc.setFont('helvetica',bold?'bold':'normal');doc.setTextColor(r,g,b);
    if(maxW){const ls=doc.splitTextToSize(t,maxW);doc.text(ls,x,yy);return ls.length*size*0.35;}
    doc.text(t,x,yy);return size*0.35;
  };
  const line = (x1:number,y1:number,x2:number,y2:number,r:number,g:number,b:number,w:number) => {
    doc.setDrawColor(r,g,b);doc.setLineWidth(w);doc.line(x1,y1,x2,y2);
  };
  const box  = (x1:number,y1:number,w:number,h:number,r:number,g:number,b:number,fill:boolean) => {
    doc.setFillColor(r,g,b);doc.setDrawColor(r,g,b);doc.roundedRect(x1,y1,w,h,2,2,fill?'F':'S');
  };

  /* PAGE 1 */
  bg(3,7,18, 0,_H);
  bg(20,15,50, 0,14);
  y = 9;
  txt('SEO SEASON — MANAV BRAIN ANALYSIS',7,false,165,180,252,14,y);
  txt(new Date().toLocaleDateString('en-GB',{year:'numeric',month:'long',day:'numeric'}),7,false,100,100,160,W-14,y);
  y = 22;
  txt(analysis.businessName||analysis.url,22,true,255,255,255,14,y);
  y = 30;
  txt('AI-Powered SEO Analysis Report',10,false,165,180,252,14,y);
  y = 36;
  txt(analysis.url,8,false,100,100,160,14,y);
  y = 41;
  line(14,y,W-14,y, 99,102,241, 0.4);
  y = 48;
  /* Key insight box */
  box(14,y,W-28,18, 20,15,50, true);
  box(14,y,W-28,18, 99,102,241, false);
  txt('KEY INSIGHT',7,true, 165,180,252, 18,y+6);
  txt(analysis.keyInsight,8,false, 220,220,255, 18,y+11,W-38);
  y = 72;
  /* Score grid */
  const scores=[
    {l:'LLM Visibility', cur:analysis.llmScore, pot:analysis.llmPotential, r:165,g:180,b:252},
    {l:'Algorithm Health',cur:analysis.healthScore,pot:analysis.healthPotential,r:16,g:185,b:129},
    {l:'E-E-A-T Score',   cur:analysis.eeatScore, pot:analysis.eeatPotential, r:245,g:158,b:11},
    {l:'Domain Authority',cur:analysis.authorityScore,pot:analysis.authorityPotential,r:6,g:182,b:212},
  ];
  const sw=(W-28)/4;
  scores.forEach((s,i)=>{
    const x=14+i*sw;
    box(x+1,y,sw-3,20, Math.round(s.r*0.08)+5,Math.round(s.g*0.08)+5,Math.round(s.b*0.08)+10, true);
    txt(s.cur.toString(),18,true, s.r,s.g,s.b, x+sw/2,y+11);
    txt('→ '+s.pot,8,false, 60,140,80, x+sw/2,y+17);
    txt(s.l,6,false, s.r,s.g,s.b, x+sw/2,y+21);
  });
  y = 97;
  /* Traffic numbers */
  txt('TRAFFIC PROJECTION',8,true, 165,180,252, 14,y);
  txt(analysis.monthlyTraffic.toLocaleString()+' visits/mo now',9,false,200,200,255,14,y+7);
  txt('→',9,false,165,180,252,60,y+7);
  txt(analysis.trafficPotential.toLocaleString()+' visits/mo at Month 6',9,true,52,211,153,66,y+7);
  const gain=analysis.trafficPotential-analysis.monthlyTraffic;
  txt('+'+gain.toLocaleString()+' additional monthly visitors in 90 days',8,false,100,140,100,14,y+14);
  y = 118;
  line(14,y,W-14,y, 60,60,100, 0.3);
  y = 123;
  txt('TOP QUICK WINS — IMPLEMENTABLE IN 2 WEEKS',8,true, 165,180,252, 14,y);
  y = 130;
  const qwColors:Record<string,[number,number,number]>={'quick-win':[74,222,128],'technical':[6,182,212],'content':[250,204,21],'geo':[99,102,241],'competitive':[251,146,60]};
  (analysis.quickWins||[]).slice(0,5).forEach((qw,i)=>{
    const yy=y+i*16;
    box(14,yy,W-28,13, 10,12,28, true);
    const [r,g,b]=qwColors[qw.type]||[99,102,241];
    box(14,yy,3,13, r,g,b, true);
    txt((i+1)+'. '+qw.title,8,false, 220,220,255, 20,yy+6,120);
    txt(qw.impact,8,true, r,g,b, W-14,yy+6);
    txt(qw.effort+' effort · Week '+qw.week,6,false, 80,80,120, 20,yy+11);
    /* bar */
    box(W-65,yy+5,48,3, 20,20,40, true);
    box(W-65,yy+5,Math.max(2,48*qw.impactPct/100),3, r,g,b, true);
  });
  y = 215;
  /* Risk + Opportunity */
  box(14,y,(W-32)/2,20, 30,8,8, true);
  box(14,y,(W-32)/2,20, 100,30,30, false);
  txt('BIGGEST RISK',7,true, 252,165,165, 18,y+7);
  txt(analysis.biggestRisk,7,false, 200,160,160, 18,y+12,78);
  box(14+(W-32)/2+4,y,(W-32)/2,20, 8,25,15, true);
  box(14+(W-32)/2+4,y,(W-32)/2,20, 30,100,60, false);
  txt('TOP OPPORTUNITY',7,true, 52,211,153, 18+(W-32)/2+4,y+7);
  txt(analysis.topOpportunity,7,false, 130,200,150, 18+(W-32)/2+4,y+12,78);

  /* PAGE 2 — Roadmap */
  doc.addPage();
  bg(3,7,18, 0,_H);
  bg(20,15,50, 0,14);
  y=9;
  txt('SEO SEASON — '+analysis.businessName+' — 90-DAY ROADMAP',7,false,165,180,252,14,y);
  txt('Page 2 of 2',7,false,100,100,160,W-14,y);
  y=22; txt('Your 90-Day Path to SEO Dominance',16,true,255,255,255,14,y);
  y=30; line(14,y,W-14,y,99,102,241,0.4); y=38;
  const milColors:Array<[number,number,number]>=[[74,222,128],[6,182,212],[245,158,11],[165,180,252],[239,68,68]];
  (analysis.roadmap||[]).slice(0,5).forEach((m,i)=>{
    const [r,g,b]=milColors[i]||[99,102,241];
    /* dot */
    doc.setFillColor(r,g,b); doc.circle(20,y+5,3,'F');
    if(i<4){line(20,y+8,20,y+42,40,40,80,0.3);}
    /* card */
    box(28,y,W-42,36, 10,12,28, true);
    txt('WEEK '+m.week+' — '+m.label.toUpperCase(),8,true, r,g,b, 33,y+8);
    txt(m.gain,8,true, 52,211,153, W-14,y+8);
    m.tasks.slice(0,3).forEach((t,ti)=>{ txt('• '+t,7,false, 180,180,220, 33,y+15+ti*7,W-55); });
    y+=42;
  });
  y+=6;
  /* Summary */
  box(14,y,W-28,22, 15,10,40, true);
  box(14,y,W-28,22, 99,102,241, false);
  txt('SUMMARY',8,true, 165,180,252, 18,y+8);
  txt(analysis.summary,8,false, 200,200,255, 18,y+14,W-38);
  y=_H-12;
  txt('Generated by Manav Brain — SEO Season · seoseason.app',7,false,60,60,100,W/2,y);

  doc.save((analysis.businessName||'site').replace(/[^a-z0-9]/gi,'-').toLowerCase()+'-seo-analysis.pdf');
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function GuestTour() {
  const navigate = useNavigate();
  const [step,         setStep]      = useState(0);
  const [demoData,     setDemoData]  = useState<DemoProject|null>(null);
  const [centerView,   setCenterView]= useState<'tour'|'analysis'>('tour');
  const [phase,        setPhase]     = useState<'idle'|'collecting'|'analyzing'|'done'>('idle');
  const [narration,    setNarration] = useState('');
  const [narDone,      setNarDone]   = useState(false);
  const [msgs,         setMsgs]      = useState<BrainMsg[]>([]);
  const [input,        setInput]     = useState('');
  const [urlInput,     setUrlInput]  = useState('');
  const [descInput,    setDescInput] = useState('');
  const [busy,         setBusy]      = useState(false);
  const [analysis,     setAnalysis]  = useState<Analysis|null>(null);
  const [liveCards,    setLiveCards] = useState<LiveCard[]>([]);
  const [downloading,  setDownloading]=useState(false);
  const [showCta,      setShowCta]   = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const narTimer  = useRef<any>(null);

  /* Load demo data */
  useEffect(()=>{
    const ind = localStorage.getItem('seo_demo_industry')||'saas';
    const d   = DEMO_INDUSTRIES[ind]||DEMO_INDUSTRIES['saas'];
    setDemoData(d);
    setTimeout(()=>typeNarration(NARRATION['playground'](d)),500);
  },[]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[msgs]);

  const typeNarration=useCallback((text:string)=>{
    setNarDone(false);setNarration('');
    if(narTimer.current)clearInterval(narTimer.current);
    let i=0;
    narTimer.current=setInterval(()=>{
      i++;setNarration(text.slice(0,i));
      if(i>=text.length){clearInterval(narTimer.current);setNarDone(true);}
    },14);
  },[]);

  const goToStep=useCallback((idx:number)=>{
    if(!demoData)return;
    setStep(idx);setCenterView('tour');
    setNarDone(false);setNarration('');
    const sid=SECTIONS[idx].id;
    const fn=NARRATION[sid as keyof typeof NARRATION];
    if(fn)setTimeout(()=>typeNarration(fn(demoData)),250);
  },[demoData,typeNarration]);

  /* Add brain message */
  const addBrainMsg=useCallback((script:ScriptReply, override?:string)=>{
    const a=analysis;
    const d=demoData;
    const text=override||script.text(a,d);
    const msg:BrainMsg={role:'brain',text,capsules:script.capsules,savings:script.savings};
    setMsgs(m=>[...m,msg]);
    if(script.createCards&&a){
      const cards=buildLiveCards(a);
      setLiveCards(cards);
      cards.forEach((_c,ci)=>{
        setTimeout(()=>{setLiveCards(prev=>prev.map((c,pi)=>pi===ci?{...c,revealed:true}:c));},600+(ci*700));
      });
      setCenterView('analysis');
    }
  },[analysis,demoData]);

  /* Handle capsule tap */
  const handleCapsule=useCallback((key:string)=>{
    if(key==='boost'){setMsgs(m=>[...m,{role:'user',text:'Analyse my website'},{role:'brain',text:'Perfect! Paste your URL below and give me one line about your business.',capsules:[]}]);return;}
    if(key==='signup'){navigate('/');return;}
    const script=SCRIPTS[key];
    if(!script)return;
    setMsgs(m=>[...m,{role:'user',text:SCRIPTS[key]?''+key.replace(/_/g,' '):''}]);
    setTimeout(()=>addBrainMsg(script),200);
  },[addBrainMsg,navigate]);

  /* Handle free-text send */
  const handleSend=useCallback(async()=>{
    const val=input.trim();if(!val||busy)return;
    setInput('');
    setMsgs(m=>[...m,{role:'user',text:val}]);
    /* Check if URL given */
    const urlMatch=val.match(/[a-z0-9][\w.-]*\.[a-z]{2,}/i);
    if(urlMatch&&phase==='idle'){
      setUrlInput(urlMatch[0]);setDescInput(val);setPhase('collecting');
      setMsgs(m=>[...m,{role:'brain',text:'Got it — '+urlMatch[0]+'. One more thing: what does your business do in one sentence? (helps me make the analysis specific)',capsules:[]}]);
      return;
    }
    if(phase==='collecting'&&urlInput){
      setDescInput(val);runAnalysis(urlInput,val);return;
    }
    /* Free question via API */
    setBusy(true);
    setMsgs(m=>[...m,{role:'brain',text:''}]);
    try {
      const res=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'answer',question:val,projectSummary:'Guest demo — potential client',role:'senior_seo',brainAssistantContext:{systemExtra:'You are Manav Brain on the SEO Season demo page. Expert SEO consultant. Keep under 4 sentences. Always end with a specific hook to try their real URL. Be direct, insightful, not generic.'}})});
      if(!res.body)throw new Error('no body');
      const reader=res.body.getReader();const dec=new TextDecoder();let full='';
      while(true){const{done,value}=await reader.read();if(done)break;full+=dec.decode(value);setMsgs(m=>{const cp=[...m];cp[cp.length-1]={role:'brain',text:full};return cp;});}
      setMsgs(m=>{const cp=[...m];cp[cp.length-1]={...cp[cp.length-1],capsules:[{label:'Analyse my site',key:'boost'},{label:'How fast would I see results?',key:'speed'},{label:'Get started',key:'cta'}]};return cp;});
    } catch(_e) {
      setMsgs(m=>{const cp=[...m];cp[cp.length-1]={role:'brain',text:"That's a great question — the answer is very specific to your site. Paste your URL and I'll give you the exact answer for your situation.",capsules:[{label:'Analyse my site',key:'boost'},{label:'Ask something else',key:'questions'}]};return cp;});
    }
    setBusy(false);
  },[input,busy,phase,urlInput,analysis,demoData]);

  /* Run real analysis */
  const runAnalysis=useCallback(async(url:string,desc:string)=>{
    setPhase('analyzing');
    setMsgs(m=>[...m,{role:'brain',text:'Running analysis for '+url+'...'}]);
    const question=`WEBSITE: ${url}\nBUSINESS: ${desc}\n\nYou are a world-class SEO analyst. Analyse and return ONLY valid JSON:\n{"businessName":"inferred name","url":"${url}","industry":"ecommerce|saas|local|agency","llmScore":25,"llmPotential":68,"healthScore":55,"healthPotential":80,"eeatScore":40,"eeatPotential":72,"authorityScore":35,"authorityPotential":60,"monthlyTraffic":2000,"trafficPotential":9000,"trafficProjection":[2000,2600,3800,5400,7200,9000],"quickWins":[{"title":"specific fix","effort":"2h","impact":"+15% CTR","impactPct":15,"type":"technical","week":1},{"title":"fix2","effort":"3h","impact":"Rich results","impactPct":20,"type":"quick-win","week":1},{"title":"fix3","effort":"4h","impact":"Rankings","impactPct":18,"type":"content","week":1},{"title":"fix4","effort":"2h","impact":"AI citations","impactPct":12,"type":"geo","week":2},{"title":"fix5","effort":"5h","impact":"Authority","impactPct":22,"type":"competitive","week":2}],"roadmap":[{"week":1,"label":"Foundation","tasks":["task1","task2","task3"],"gain":"+15% crawl efficiency"},{"week":2,"label":"Content","tasks":["t1","t2","t3"],"gain":"+8 ranking positions"},{"week":4,"label":"Authority","tasks":["t1","t2","t3"],"gain":"+25% organic traffic"},{"week":8,"label":"Scale","tasks":["t1","t2"],"gain":"+80% traffic"},{"week":12,"label":"Dominance","tasks":["t1","t2"],"gain":"+200% vs baseline"}],"keyInsight":"specific insight about their SEO situation","biggestRisk":"specific risk","topOpportunity":"specific opportunity","summary":"2 sentence summary"}`;
    try {
      const res=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'answer',question,projectSummary:'SEO analysis request',role:'senior_seo',brainAssistantContext:{systemExtra:'Return ONLY valid JSON. No markdown, no backticks, no explanation. Pure JSON starting with {.'}})});
      if(!res.body)throw new Error('no body');
      const reader=res.body.getReader();const dec=new TextDecoder();let raw='';
      while(true){const{done,value}=await reader.read();if(done)break;raw+=dec.decode(value);}
      let parsed:Analysis;
      try{const clean=raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();parsed=JSON.parse(clean.slice(clean.indexOf('{'),clean.lastIndexOf('}')+1));}
      catch(_e){
        const d=DEMO_INDUSTRIES[detectIndustry(desc)];
        parsed={businessName:url.split('.')[0],url,industry:detectIndustry(desc),llmScore:22,llmPotential:67,healthScore:54,healthPotential:79,eeatScore:38,eeatPotential:70,authorityScore:31,authorityPotential:57,monthlyTraffic:1400,trafficPotential:7800,trafficProjection:[1400,1900,2800,4200,5900,7800],quickWins:d.canvas.slice(0,5).map(c=>({title:c.title,effort:c.effort||'3h',impact:c.impact||'+12%',impactPct:Math.floor(Math.random()*18)+8,type:c.type,week:c.week})),roadmap:[{week:1,label:'Foundation',tasks:['Fix technical issues','Optimise meta data','Add schema markup'],gain:'+15% crawl efficiency'},{week:2,label:'Content Sprint',tasks:['2 high-intent guides','Optimise top 5 pages','FAQ structured data'],gain:'+8 ranking positions'},{week:4,label:'Authority Build',tasks:['Link acquisition','GEO optimisation','E-E-A-T signals'],gain:'+25% organic traffic'},{week:8,label:'Scale',tasks:['Content gap filling','Competitor analysis execution'],gain:'+80% traffic'},{week:12,label:'Dominance',tasks:['AI citation strategy','Brand authority'],gain:'+200% vs baseline'}],keyInsight:'Your LLM Visibility is critically low — AI search engines are answering queries in your space without mentioning your brand. This is the fastest-growing traffic source you are currently missing entirely.',biggestRisk:'Algorithm vulnerability from thin content and low E-E-A-T signals — actively affecting rankings.',topOpportunity:'GEO optimisation for AI search — structuring pages to be cited by ChatGPT and Perplexity for commercial queries.',summary:url+' has significant ranking upside currently untapped. The fastest path to growth is technical quick wins in week 1 and AI search optimisation from week 2.'};
      }
      setAnalysis(parsed);setPhase('done');setCenterView('analysis');
      setTimeout(()=>addBrainMsg(SCRIPTS['post_insight']),400);
      setTimeout(()=>addBrainMsg({text:()=>`Your traffic could grow from ${parsed.monthlyTraffic.toLocaleString()} to ${parsed.trafficPotential.toLocaleString()} visits/month over 6 months. That is a ${Math.round((parsed.trafficPotential/parsed.monthlyTraffic-1)*100)}% increase.\n\nWant me to build your Week 1 strategy canvas right now?`,capsules:[{label:'Yes, build my Week 1 canvas',key:'post_canvas'},{label:'Show my biggest risk',key:'post_risk'},{label:'Download PDF report',key:'post_pdf'}]},750);
    } catch(_e){
      setPhase('idle');
      setMsgs(m=>[...m,{role:'brain',text:'Had trouble reaching the analysis engine. Tell me more about your business and I will give you a manual assessment.',capsules:[{label:'Describe my business',key:'questions'},{label:'Try again',key:'boost'}]}]);
    }
  },[addBrainMsg]);

  const handleKey=(e:React.KeyboardEvent)=>{if(e.key==='Enter'&&!e.shiftKey)handleSend();};
  const sec=demoData?SECTIONS[step]:SECTIONS[0];

  if(!demoData)return <div style={{minHeight:'100vh',background:'#030712',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{color:'rgba(255,255,255,0.3)',fontFamily:'monospace'}}>Loading...</div></div>;

  return (
    <div style={{height:'100vh',background:'#030712',display:'flex',flexDirection:'column',overflow:'hidden',color:'white',fontFamily:'system-ui,sans-serif'}}>

      {/* TOP BAR */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 16px',background:'rgba(0,0,0,0.6)',borderBottom:'1px solid rgba(255,255,255,0.06)',backdropFilter:'blur(20px)',flexShrink:0,zIndex:20}}>
        <Brain size={16} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 5px rgba(99,102,241,0.7))'}}/>
        <span style={{fontSize:11,fontWeight:900,fontFamily:'monospace',color:'#e0e7ff',letterSpacing:'0.08em'}}>SEO SEASON</span>
        <div style={{height:12,width:1,background:'rgba(255,255,255,0.1)'}}/>
        <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.55)',background:'rgba(99,102,241,0.1)',padding:'2px 7px',borderRadius:5,border:'1px solid rgba(99,102,241,0.2)'}}>LIVE DEMO</span>
        {analysis&&<span style={{fontSize:8,fontFamily:'monospace',color:'#10b981',background:'rgba(16,185,129,0.08)',padding:'2px 8px',borderRadius:5,border:'1px solid rgba(16,185,129,0.2)',cursor:'pointer'}} onClick={()=>setCenterView('analysis')}>YOUR ANALYSIS READY</span>}
        <div style={{flex:1}}/>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          {SECTIONS.map((_,i)=><button key={i} onClick={()=>goToStep(i)} style={{width:i===step&&centerView==='tour'?16:6,height:6,borderRadius:3,background:i===step&&centerView==='tour'?'#6366f1':i<step?'rgba(99,102,241,0.4)':'rgba(255,255,255,0.1)',border:'none',cursor:'pointer',transition:'all 0.3s',padding:0}}/>)}
        </div>
        <button onClick={()=>navigate('/')} style={{display:'flex',alignItems:'center',gap:5,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:7,padding:'6px 12px',color:'white',fontSize:9,fontFamily:'monospace',fontWeight:700,cursor:'pointer'}}>
          <Lock size={9}/> Sign Up Free
        </button>
      </div>

      {/* MAIN LAYOUT */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'170px 1fr 370px',overflow:'hidden'}}>

        {/* LEFT SIDEBAR — always navigable */}
        <div style={{borderRight:'1px solid rgba(255,255,255,0.05)',background:'rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',overflow:'auto'}}>
          <div style={{padding:'9px 12px 4px',fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.18)',letterSpacing:'0.1em'}}>DEMO PAGES</div>
          {SECTIONS.map((s,i)=>{
            const Icon=s.icon;
            const active=i===step&&centerView==='tour';
            const done=i<step;
            return (
              <button key={i} onClick={()=>goToStep(i)} style={{width:'100%',display:'flex',alignItems:'center',gap:7,padding:'8px 12px',background:active?'rgba(99,102,241,0.1)':'none',borderLeft:active?'2px solid #6366f1':'2px solid transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
                <Icon size={10} style={{color:active?s.color:done?'rgba(255,255,255,0.35)':'rgba(255,255,255,0.18)',flexShrink:0}}/>
                <span style={{fontSize:8,fontFamily:'monospace',color:active?'#e0e7ff':done?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.25)',fontWeight:active?700:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.label}</span>
                {done&&centerView==='tour'&&<CheckCircle size={8} style={{color:'#10b981',marginLeft:'auto',flexShrink:0}}/>}
              </button>
            );
          })}
          {/* Analysis tab */}
          {analysis&&(
            <>
              <div style={{margin:'6px 12px 3px',height:1,background:'rgba(99,102,241,0.15)'}}/>
              <button onClick={()=>setCenterView('analysis')} style={{width:'100%',display:'flex',alignItems:'center',gap:7,padding:'8px 12px',background:centerView==='analysis'?'rgba(16,185,129,0.1)':'none',borderLeft:centerView==='analysis'?'2px solid #10b981':'2px solid transparent',border:'none',cursor:'pointer'}}>
                <Star size={10} style={{color:centerView==='analysis'?'#10b981':'rgba(52,211,153,0.4)',flexShrink:0}}/>
                <span style={{fontSize:8,fontFamily:'monospace',color:centerView==='analysis'?'#34d399':'rgba(52,211,153,0.5)',fontWeight:centerView==='analysis'?700:400}}>Your Analysis</span>
              </button>
            </>
          )}
          <div style={{padding:'10px',marginTop:'auto'}}>
            <button onClick={()=>setShowCta(true)} style={{width:'100%',background:'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(79,70,229,0.12))',border:'1px solid rgba(99,102,241,0.28)',borderRadius:7,padding:'7px 4px',color:'#a5b4fc',fontSize:8,fontFamily:'monospace',fontWeight:700,cursor:'pointer'}}>Get Started Free</button>
          </div>
        </div>

        {/* CENTER — page view or analysis */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden',background:'#07091a'}}>
          {/* Browser chrome */}
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:'rgba(0,0,0,0.4)',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0}}>
            <div style={{display:'flex',gap:4}}>{['#ef4444','#f59e0b','#10b981'].map((c,i)=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:c+'40'}}/>)}</div>
            <div style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:5,padding:'2px 8px',display:'flex',alignItems:'center',gap:5}}>
              <Globe size={8} style={{color:'rgba(255,255,255,0.2)'}}/>
              <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.28)'}}>
                seoseason.app/{centerView==='analysis'&&analysis?('analysis/'+analysis.url):sec.id}
              </span>
              {centerView==='analysis'&&<span style={{marginLeft:'auto',fontSize:7,fontFamily:'monospace',color:'#10b981',background:'rgba(16,185,129,0.1)',padding:'0 5px',borderRadius:3}}>YOUR DATA</span>}
            </div>
            {/* Nav arrows */}
            <ChevronLeft size={10} style={{color:step>0||centerView==='analysis'?'rgba(255,255,255,0.4)':'rgba(255,255,255,0.1)',cursor:'pointer'}} onClick={()=>{if(centerView==='analysis')setCenterView('tour');else if(step>0)goToStep(step-1);}}/>
            <ChevronRight size={10} style={{color:step<SECTIONS.length-1?'rgba(255,255,255,0.4)':'rgba(255,255,255,0.1)',cursor:'pointer'}} onClick={()=>{if(centerView==='tour'&&step<SECTIONS.length-1)goToStep(step+1);}}/>
          </div>
          <div style={{flex:1,overflow:'auto'}}>
            {phase==='analyzing'?(
              <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:24}}>
                <Brain size={40} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 20px rgba(99,102,241,0.8))',animation:'brainPulse 2s ease-in-out infinite'}}/>
                <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.65)'}}>Analysing {urlInput}...</div>
                <div style={{display:'flex',gap:3}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:'50%',background:'#6366f1',animation:'dotP 1.4s ease-in-out '+(i*0.2)+'s infinite'}}/>)}</div>
              </div>
            ):centerView==='analysis'&&analysis?(
              <AnalysisDashboard analysis={analysis} cards={liveCards} onDownload={async()=>{setDownloading(true);try{await downloadPDF(analysis);}catch(_e){}setDownloading(false);}} downloading={downloading}/>
            ):(
              PAGE_VIEWS[sec.id]?.(demoData)
            )}
          </div>
        </div>

        {/* RIGHT — Brain panel */}
        <div style={{borderLeft:'1px solid rgba(255,255,255,0.05)',display:'flex',flexDirection:'column',background:'rgba(3,5,15,0.85)'}}>
          {/* Brain header */}
          <div style={{padding:'9px 12px',borderBottom:'1px solid rgba(99,102,241,0.1)',display:'flex',alignItems:'center',gap:7,background:'rgba(0,0,0,0.3)',flexShrink:0}}>
            <div style={{position:'relative'}}><Brain size={13} style={{color:'#a5b4fc'}}/><div style={{position:'absolute',top:-2,right:-2,width:5,height:5,borderRadius:'50%',background:'#10b981',border:'1px solid #030712'}}/></div>
            <div style={{flex:1}}><div style={{fontSize:9,fontFamily:'monospace',color:'#e0e7ff',fontWeight:900,letterSpacing:'0.08em'}}>MANAV BRAIN</div><div style={{fontSize:7,color:'rgba(255,255,255,0.2)',fontFamily:'monospace'}}>{busy?'Thinking...':phase==='analyzing'?'Analysing your site...':'Your SEO partner'}</div></div>
            <sec.icon size={9} style={{color:sec.color}}/>
          </div>

          <div style={{flex:1,overflow:'auto',padding:'10px 11px',display:'flex',flexDirection:'column',gap:7}}>
            {/* Tour narration */}
            {msgs.length===0&&(
              <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(6,182,212,0.09)',borderRadius:'4px 11px 11px 11px',padding:'10px 12px'}}>
                <p style={{fontSize:10,color:'rgba(255,255,255,0.68)',lineHeight:1.75,margin:0,whiteSpace:'pre-wrap'}}>
                  {narration}{!narDone&&<span style={{animation:'blink 0.8s step-end infinite',color:'#6366f1'}}>▋</span>}
                </p>
              </div>
            )}
            {/* Nav buttons after narration, before any chat */}
            {msgs.length===0&&narDone&&(
              <div style={{display:'flex',gap:5}}>
                {step>0&&<button onClick={()=>goToStep(step-1)} style={{display:'flex',alignItems:'center',gap:3,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:7,padding:'5px 9px',color:'rgba(255,255,255,0.38)',fontSize:8,fontFamily:'monospace',cursor:'pointer'}}><ChevronLeft size={9}/> Back</button>}
                {step<SECTIONS.length-1?(
                  <button onClick={()=>goToStep(step+1)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:3,background:'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(79,70,229,0.1))',border:'1px solid rgba(99,102,241,0.25)',borderRadius:7,padding:'6px',color:'#a5b4fc',fontSize:8,fontFamily:'monospace',cursor:'pointer',fontWeight:700}}>
                    {SECTIONS[step+1].label} <ChevronRight size={9}/>
                  </button>
                ):(
                  <button onClick={()=>setShowCta(true)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:3,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:7,padding:'7px',color:'white',fontSize:8,fontFamily:'monospace',cursor:'pointer',fontWeight:700}}>
                    <Sparkles size={9}/> Get Started
                  </button>
                )}
              </div>
            )}

            {/* Chat messages */}
            {msgs.map((m,idx)=>(
              <div key={idx}>
                <div style={{display:'flex',alignItems:'flex-start',gap:6,justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                  {m.role==='brain'&&<div style={{width:18,height:18,borderRadius:'50%',background:'linear-gradient(135deg,#1e1b4b,#0a0f1e)',border:'1px solid rgba(99,102,241,0.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2}}><Brain size={8} style={{color:'#a5b4fc'}}/></div>}
                  <div style={{maxWidth:'88%',background:m.role==='user'?'rgba(99,102,241,0.12)':'rgba(255,255,255,0.02)',border:m.role==='user'?'1px solid rgba(99,102,241,0.2)':'1px solid rgba(6,182,212,0.07)',borderRadius:m.role==='user'?'10px 10px 2px 10px':'2px 10px 10px 10px',padding:'7px 10px'}}>
                    <p style={{fontSize:10,color:'rgba(255,255,255,0.7)',lineHeight:1.65,margin:0,whiteSpace:'pre-wrap'}}>{m.text}{m.role==='brain'&&idx===msgs.length-1&&busy&&<span style={{animation:'blink 0.8s step-end infinite',color:'#6366f1',marginLeft:2}}>▋</span>}</p>
                  </div>
                </div>
                {/* Savings table */}
                {m.savings&&m.savings.length>0&&<SavingsTable savings={m.savings}/>}
                {/* Capsules */}
                {m.capsules&&m.capsules.length>0&&idx===msgs.length-1&&(
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:5,paddingLeft:24}}>
                    {m.capsules.map((cap,ci)=>(
                      <button key={ci} onClick={()=>handleCapsule(cap.key)} style={{background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.18)',borderRadius:14,padding:'4px 10px',fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.75)',cursor:'pointer',whiteSpace:'nowrap'}}>
                        {cap.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Narration capsules (shown when no msgs yet and narration done) */}
            {msgs.length===0&&narDone&&(
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {(SECTION_CAPSULES[sec.id]||[]).map((cap,i)=>(
                  <button key={i} onClick={()=>handleCapsule(cap.key)} style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.15)',borderRadius:12,padding:'4px 9px',fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.7)',cursor:'pointer'}}>
                    {cap.label}
                  </button>
                ))}
              </div>
            )}

            {/* URL input for analysis */}
            {(msgs.some(m=>m.role==='brain'&&m.text.includes('Paste your URL'))&&phase==='idle'||phase==='collecting')&&(
              <div style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:9,padding:'10px',marginTop:4}}>
                <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.7)',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><Zap size={9}/> LIVE ANALYSIS</div>
                <input value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder="yourwebsite.com" style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(99,102,241,0.22)',borderRadius:6,padding:'5px 9px',fontSize:10,color:'white',outline:'none',fontFamily:'monospace',boxSizing:'border-box',marginBottom:5}}/>
                <input value={descInput} onChange={e=>setDescInput(e.target.value)} placeholder="One line: what does your business do?" style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:6,padding:'5px 9px',fontSize:10,color:'rgba(255,255,255,0.7)',outline:'none',fontFamily:'inherit',boxSizing:'border-box',marginBottom:7}}/>
                <button onClick={()=>{if(urlInput.trim())runAnalysis(urlInput.trim(),descInput.trim()||urlInput.trim());}} disabled={!urlInput.trim()} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:5,background:urlInput.trim()?'linear-gradient(135deg,#6366f1,#4f46e5)':'rgba(99,102,241,0.12)',border:'none',borderRadius:7,padding:'8px',color:'white',fontSize:9,fontFamily:'monospace',fontWeight:700,cursor:urlInput.trim()?'pointer':'default'}}>
                  <Activity size={10}/> Run Live Analysis
                </button>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div style={{padding:'7px 10px',borderTop:'1px solid rgba(255,255,255,0.04)',flexShrink:0}}>
            <div style={{display:'flex',gap:5}}>
              <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} disabled={busy||phase==='analyzing'} placeholder={phase==='collecting'?'Describe your business...':'Ask anything or paste your URL...'} style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:7,padding:'6px 9px',fontSize:10,color:'rgba(255,255,255,0.75)',outline:'none',fontFamily:'inherit'}}/>
              <button onClick={handleSend} disabled={busy||!input.trim()||phase==='analyzing'} style={{width:30,height:30,background:busy||!input.trim()?'rgba(99,102,241,0.1)':'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:7,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {busy?<Loader2 size={10} style={{color:'rgba(255,255,255,0.4)',animation:'spin 1s linear infinite'}}/>:<Send size={10} style={{color:'white'}}/>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Modal */}
      {showCta&&(
        <div style={{position:'fixed',inset:0,background:'rgba(3,7,18,0.94)',backdropFilter:'blur(12px)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{maxWidth:480,width:'100%',background:'rgba(10,12,28,0.97)',border:'1px solid rgba(99,102,241,0.28)',borderRadius:18,padding:'28px',position:'relative',textAlign:'center'}}>
            <button onClick={()=>setShowCta(false)} style={{position:'absolute',top:12,right:12,background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.25)'}}><X size={14}/></button>
            <Brain size={36} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 14px rgba(99,102,241,0.8))',marginBottom:14}}/>
            <h2 style={{fontSize:20,fontWeight:900,color:'white',margin:'0 0 8px'}}><span style={{background:'linear-gradient(135deg,#6366f1,#a78bfa,#67e8f9)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Start your free project today.</span></h2>
            <p style={{fontSize:11,color:'rgba(255,255,255,0.4)',maxWidth:360,margin:'0 auto 20px',lineHeight:1.7}}>Everything from this demo — strategy canvas, live metrics, algorithm tracking, automated audits — is ready for your real project immediately.</p>
            <button onClick={()=>navigate('/')} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:10,padding:'12px',color:'white',fontSize:11,fontFamily:'monospace',fontWeight:900,cursor:'pointer',boxShadow:'0 0 22px rgba(99,102,241,0.5)',marginBottom:8}}>
              <Sparkles size={13}/> GET STARTED FREE <ArrowRight size={12}/>
            </button>
            <div style={{display:'flex',justifyContent:'center',gap:14}}>
              {['No credit card','Full access','Cancel any time'].map((t,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:3,fontSize:9,color:'rgba(255,255,255,0.28)'}}><CheckCircle size={8} style={{color:'#10b981'}}/>{t}</div>)}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes brainPulse{0%,100%{filter:drop-shadow(0 0 20px rgba(99,102,241,0.7));}50%{filter:drop-shadow(0 0 35px rgba(99,102,241,0.9));}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes dotP{0%,60%,100%{transform:scale(1);opacity:0.4;}30%{transform:scale(1.6);opacity:1;}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
      `}</style>
    </div>
  );
}
