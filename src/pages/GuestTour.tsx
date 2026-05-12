/**
 * GuestTour.tsx — v4 clean rewrite
 * No inline template literals inside function arguments.
 * All message text pre-declared as named variables.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DemoProject } from '@/contexts/DemoContext';
import { DEMO_INDUSTRIES, detectIndustry } from '@/contexts/DemoContext';
import {
  Brain, Send, ChevronRight, ChevronLeft, ArrowRight, X,
  Target, BarChart3, Database, Cpu, Shield, BookOpen,
  CheckCircle, AlertCircle, Globe, Sparkles, Lock,
  Download, Loader2, Zap, Activity, Star, Clock,
} from 'lucide-react';

/* ── Types ── */
interface QuickWin { title:string; effort:string; impact:string; impactPct:number; type:string; week:number; }
interface Roadmap   { week:number; label:string; tasks:string[]; gain:string; }
interface Analysis {
  businessName:string; url:string; industry:string;
  llmScore:number;       llmPotential:number;
  healthScore:number;    healthPotential:number;
  eeatScore:number;      eeatPotential:number;
  authorityScore:number; authorityPotential:number;
  monthlyTraffic:number; trafficPotential:number;
  trafficProjection:number[];
  quickWins:QuickWin[]; roadmap:Roadmap[];
  keyInsight:string; biggestRisk:string;
  topOpportunity:string; summary:string;
}
interface Capsule  { label:string; key:string; }
interface Saving   { task:string; old:string; brain:string; }
interface BrainMsg { role:'brain'|'user'; text:string; capsules?:Capsule[]; savings?:Saving[]; }
interface LiveCard { id:string; type:string; title:string; effort:string; impact:string; week:number; color:string; revealed:boolean; }

/* ── Constants ── */
const TC: Record<string,string> = {
  'quick-win':'#4ade80', technical:'#06b6d4', content:'#facc15', geo:'#6366f1', competitive:'#fb923c',
};

const SECTIONS = [
  { id:'playground',     label:'Strategy Canvas',  icon:Target,   color:'#4ade80' },
  { id:'dashboard',      label:'Live Metrics',     icon:BarChart3,color:'#a78bfa' },
  { id:'data-room',      label:'Data Room',        icon:Database, color:'#06b6d4' },
  { id:'algorithm-intel',label:'Algorithm Intel',  icon:Cpu,      color:'#f59e0b' },
  { id:'audit',          label:'SEO Audit',        icon:Shield,   color:'#ef4444' },
  { id:'brain-learning', label:'Brain Learning',   icon:BookOpen, color:'#10b981' },
];

const NARRATION: Record<string,(d:DemoProject)=>string> = {
  playground: (d) => "This is the Strategy Canvas — the engine room of " + d.name + ".\n\nI've built " + d.canvas.length + " tasks organised by week and priority. Green cards = Quick Wins that move rankings in 7-14 days. Blue = technical fixes that compound. Yellow = content that builds authority.\n\nNo guessing. Every week has a clear priority.\n\n⚡ Give me your URL and I'll build YOUR actual canvas right now.",
  dashboard:  (d) => "Your live command centre. Four scores I track constantly.\n\nLLM Visibility " + d.llm + "/100 — how often ChatGPT and Perplexity cite your brand. Algorithm Health " + d.health + "/100. E-E-A-T " + d.eeat + "/100. Authority " + d.authority + "/100.\n\nI alert you the moment any of these change — before rankings are affected.\n\n⚡ Drop your URL and I'll show you YOUR real scores.",
  'data-room': (d) => "Everything I know about " + d.name + " lives here.\n\nCompetitors " + d.competitor1 + " and " + d.competitor2 + " mapped. Content gaps identified. Keywords tracked weekly.\n\nThis replaces the £2,000 discovery audit most agencies charge upfront.\n\n⚡ Your URL + one sentence about your business = full competitive map in 30 seconds.",
  'algorithm-intel': (d) => "I track every Google update, every ChatGPT signal shift — and tell you specifically how it affects your site.\n\n" + d.algo_impact + "\n\nMost businesses find out about algorithm damage through lost rankings — weeks after the fact. This catches it on day one.\n\n⚡ Tell me your site. I'll run your vulnerability scan live.",
  audit: (d) => "Full audit of " + d.domain + ". " + d.audits.length + " priority issues found — each automatically becomes a canvas task with the exact fix.\n\n" + (d.audits[0] ? "[CRITICAL] " + d.audits[0].issue : "") + "\n\nManual audit from a consultant: 2-3 weeks, £1,500-3,000. This one: 45 seconds, included.\n\n⚡ Paste your URL. I'll audit it live.",
  'brain-learning': (d) => "Every operation I run leaves a permanent learning. I never forget what worked and why.\n\nAfter 90 days, I know " + d.name + " better than any consultant — because I'm working on it every single day.\n\n⚡ Start today and I begin learning your site immediately.",
};

const SECTION_CAPSULES: Record<string,Capsule[]> = {
  playground:      [{label:"How are cards created?",key:"how_cards"},{label:"Show me Week 1",key:"week1"},{label:"Analyse my site",key:"boost"}],
  dashboard:       [{label:"What is LLM Visibility?",key:"llm_explain"},{label:"How fast do scores improve?",key:"speed"},{label:"Analyse my site",key:"boost"}],
  'data-room':     [{label:"What data do you store?",key:"data_stored"},{label:"How do you find competitors?",key:"competitors"},{label:"Analyse my site",key:"boost"}],
  'algorithm-intel':[{label:"Which updates matter most?",key:"updates"},{label:"Am I at risk now?",key:"risk_check"},{label:"Analyse my site",key:"boost"}],
  audit:           [{label:"How is this different from Ahrefs?",key:"vs_ahrefs"},{label:"What gets fixed first?",key:"priority"},{label:"Analyse my site",key:"boost"}],
  'brain-learning':[{label:"How does Brain Learning work?",key:"how_learn"},{label:"What does 90 days look like?",key:"ninety_days"},{label:"Get started",key:"cta"}],
};

/* Pre-scripted replies — all text as plain strings, no template literals with complex expressions */
interface ScriptEntry { text: string; capsules: Capsule[]; savings?: Saving[]; createCards?: boolean; }
const SCRIPTS: Record<string, ScriptEntry> = {
  how_cards:   { text: "Canvas cards are generated automatically from three sources.\n\n1. Audit results — every issue becomes a task with the exact fix.\n2. Competitor gap analysis — topics they rank for that you don't.\n3. Algorithm intelligence — tasks addressing recent update signals.\n\nA strategy consultant would charge a day rate for the same output. I generate it in under 60 seconds.", capsules:[{label:"Show me a card being created",key:"create_live"},{label:"How long to complete Week 1?",key:"week1_time"},{label:"Analyse my site",key:"boost"}] },
  week1:       { text: "Week 1 is focused entirely on quick wins and technical fixes that compound.\n\nPriority order: technical issues first (they affect every page), then meta optimisation, then structured data.\n\nTotal time investment: 9-12 hours. Expected outcome: measurable ranking movement within 10-14 days.", capsules:[{label:"How does Brain track progress?",key:"track_progress"},{label:"What if I have no time?",key:"no_time"},{label:"Analyse my site",key:"boost"}] },
  how_learn:   { text: "Brain Learning extracts structured insights from every operation.\n\nEvery task executed, every audit run — the outcome is recorded: what worked, what impact it had, what to do differently next time.\n\nAfter 90 days, recommendations are 3-4x more specific than day one — because I've seen what actually moves the needle for YOUR site.", capsules:[{label:"Does it get smarter over time?",key:"smarter"},{label:"What data does it collect?",key:"data_stored"},{label:"Get started",key:"cta"}] },
  llm_explain: { text: "LLM Visibility measures how often AI engines (ChatGPT, Perplexity, Gemini) mention your brand when answering queries in your space.\n\nUsers who ask ChatGPT 'what's the best X for Y?' and get your brand cited are high-intent buyers.\n\nMost sites score 10-30/100. Getting to 60+ means appearing in AI answers for commercial queries. Top-optimised sites are hitting 70-85/100.", capsules:[{label:"How do I improve LLM Visibility?",key:"improve_llm"},{label:"How fast does it change?",key:"speed"},{label:"Analyse my site",key:"boost"}] },
  improve_llm: { text: "Three things move LLM Visibility fastest.\n\n1. FAQ pages with clear Q&A structure — AI engines cite these 4x more than narrative content.\n2. Author authority signals — a named expert with credentials on the page.\n3. Data and statistics — AI prefers citing sources with specific numbers.\n\nI track your LLM Visibility weekly and generate tasks when it drops or opportunities appear.", capsules:[{label:"Show me an example optimisation",key:"faq_example"},{label:"How does E-E-A-T work?",key:"eeat"},{label:"Analyse my site",key:"boost"}] },
  vs_ahrefs:   { text: "Ahrefs and SEMrush are research tools — they show data, then leave you to figure out what to do.\n\nI am an execution engine. I take the data, generate the strategy, create the tasks, track progress, and update when algorithms change — automatically.\n\nTypical workflow without this: 4-6h per week analysing data, 2-3h writing tasks. With Brain: 30-minute weekly review.", capsules:[{label:"What tools does Brain replace?",key:"tools_replaced"},{label:"How much time does it save?",key:"time_saving"},{label:"Analyse my site",key:"boost"}], savings:[{task:"Data analysis",old:"4-6h/week",brain:"Automated"},{task:"Task creation",old:"2-3h/week",brain:"Automated"},{task:"Algorithm monitoring",old:"Missed",brain:"24/7 live"}] },
  time_saving: { text: "Honest time breakdown.\n\nWithout this system: monthly audit 8-12 hours or £1,500, strategy planning 6-8 hours/month, competitor monitoring 3-4 hours/month, algorithm tracking usually missed entirely.\n\nWith Brain: all of the above automated. Total time saved: 15-20 hours per month. At £60/hour freelance rate, that is £900-1,200/month in time value.", capsules:[{label:"What is the pricing?",key:"pricing"},{label:"See the full demo",key:"cta"},{label:"Analyse my site",key:"boost"}], savings:[{task:"Monthly audit",old:"£1,500 or 10h",brain:"Automated"},{task:"Strategy planning",old:"8h/month",brain:"Auto-generated"},{task:"Competitor tracking",old:"4h/month",brain:"Always on"},{task:"Algorithm alerts",old:"Usually missed",brain:"Instant"}] },
  ninety_days: { text: "90 days looks like this.\n\nWeeks 1-2: Foundation — technical fixes, meta optimisation, structured data. First ranking movements.\n\nWeeks 3-4: Content and authority. Target keywords climbing. LLM Visibility beginning to improve.\n\nWeeks 5-8: Compounding effects. Traffic growth accelerates.\n\nWeeks 9-12: Momentum phase. Top-of-funnel content ranking. Brand appearing in AI answers. Traffic 2-3x vs baseline.", capsules:[{label:"What if rankings drop mid-campaign?",key:"drops"},{label:"Can I see results faster?",key:"speed"},{label:"Get started today",key:"cta"}] },
  drops:       { text: "Ranking drops are caught immediately — usually before traffic is affected.\n\n1. Health scores drop — flagged within 24 hours.\n2. Algorithm intel maps the update to your site.\n3. Recovery tasks auto-added to canvas with priority.\n4. Brain explains exactly what changed and why.\n\nMost sites find out weeks later when they check analytics. With this, you have a response plan before traffic falls.", capsules:[{label:"What kind of drops happen?",key:"risk_check"},{label:"Analyse my site",key:"boost"}] },
  create_live: { text: "I am creating your first canvas card right now. This is what the system does automatically when you run an audit or brief me on your project.\n\nEach card has the exact task, time estimate, expected impact, and the right week to execute it. Nothing vague — every card is immediately actionable.\n\nI would generate 8-12 cards in your first session — a full month of prioritised SEO work.", capsules:[{label:"Do you write the content too?",key:"content_ai"},{label:"How does prioritisation work?",key:"priority"},{label:"Analyse my site",key:"boost"}], createCards:true },
  content_ai:  { text: "Yes — Brain can write the actual content, not just plan it.\n\nFor each content task I can: draft the full article, generate optimised meta titles and descriptions, write FAQ sections structured for AI citation, create schema markup code ready to paste.\n\nEverything is generated with your specific keywords, brand voice, and competitive gap data baked in.", capsules:[{label:"Does the content rank well?",key:"content_rank"},{label:"What about E-E-A-T?",key:"eeat"},{label:"Analyse my site",key:"boost"}] },
  eeat:        { text: "E-E-A-T (Experience, Expertise, Authoritativeness, Trust) is now one of Google's primary quality signals.\n\nMost impactful improvements I implement:\n1. Named author pages with real credentials and LinkedIn links.\n2. Case study pages with specific data and results.\n3. About page with company history and team bios.\n4. External citations from recognised industry sources.\n\nFor most sites, these changes take E-E-A-T from 30-40/100 to 60-70/100 within 60 days.", capsules:[{label:"Show me my E-E-A-T score",key:"boost"},{label:"How long does it take?",key:"speed"},{label:"Get started",key:"cta"}] },
  speed:       { text: "Timeline varies by site, but typical results:\n\nWeek 1-2: Technical fixes improve crawl efficiency and Core Web Vitals.\nWeek 3-4: First ranking movements on target keywords.\nWeek 6-8: Measurable organic traffic increase.\nWeek 10-12: Significant growth, LLM Visibility improving.\n\nFastest wins come from technical issues — these can show results in 1-2 weeks. Content and authority takes 4-8 weeks to compound.", capsules:[{label:"What gives fastest results?",key:"priority"},{label:"Is 90 days realistic?",key:"ninety_days"},{label:"Analyse my site",key:"boost"}] },
  risk_check:  { text: "Current algorithm risks in most industries:\n\n1. Thin content — Google's 2024-2025 updates have been brutal on pages under 600 words with no expertise signals.\n2. Low E-E-A-T — Particularly affects health, finance, legal, and any advisory site.\n3. LLM citation gap — If competitors appear in AI answers and you don't, you're losing a growing share of high-intent queries.\n4. Core Web Vitals — Below threshold = measurable ranking penalty, especially on mobile.", capsules:[{label:"How do I know if I'm affected?",key:"boost"},{label:"Which risk is worst?",key:"priority"},{label:"How fast can risks be fixed?",key:"speed"}] },
  priority:    { text: "Prioritisation uses three factors: impact on rankings, effort to implement, and urgency based on current algorithm signals.\n\nQuick Wins (high impact, low effort) always go in Week 1 — fastest path to visible results.\n\nTechnical issues go next — they affect every page and compound every other improvement.\n\nContent and authority building fills Weeks 2-12 — slower but creates sustainable, defensible rankings.", capsules:[{label:"Show me a full prioritised plan",key:"ninety_days"},{label:"Analyse my site now",key:"boost"},{label:"How much time per week?",key:"time_saving"}] },
  pricing:     { text: "This is a managed, project-based platform — not a self-serve subscription.\n\nEach project gets a fully configured strategy canvas, weekly Brain analysis, algorithm monitoring, and direct access to Manav.\n\nTo discuss your specific project, the best next step is to request access through the platform. Manav reviews each project personally.", capsules:[{label:"How do I request access?",key:"cta"},{label:"What is included?",key:"vs_ahrefs"},{label:"Analyse my site",key:"boost"}] },
  cta:         { text: "Everything you've just seen is ready for your real project the moment you sign up.\n\nYour strategy canvas is built in the first session. Brain starts monitoring your site immediately. Metrics dashboard goes live with your real data.\n\nNo setup fee. No waiting. Full access from day one.", capsules:[{label:"Sign up now",key:"signup"},{label:"I have more questions",key:"questions"},{label:"Analyse my site first",key:"boost"}] },
  signup:      { text: "Let's get you started. Head to the sign-up page and your project will be ready within minutes.\n\nFirst session: I'll ask about your site, competitors, and goals — then generate your complete strategy canvas automatically.", capsules:[] },
  questions:   { text: "Of course. What would be most useful to know?\n\nI can go deeper on any part of the system — the AI analysis, how strategy is generated, algorithm tracking, pricing, onboarding, or anything else.", capsules:[{label:"How is pricing structured?",key:"pricing"},{label:"Who is this built for?",key:"for_who"},{label:"What makes it different?",key:"vs_ahrefs"}] },
  for_who:     { text: "Built for businesses where rankings directly affect revenue.\n\nTypical projects: e-commerce stores competing against large retailers, SaaS companies reducing CAC through organic, service businesses dominating local and national search, agencies managing SEO for multiple clients.\n\nNot a fit for: businesses that just want to 'try SEO' without commitment, or sites with no existing content foundation.", capsules:[{label:"I run e-commerce",key:"boost"},{label:"I have a service business",key:"boost"},{label:"Tell me about agency pricing",key:"pricing"}] },
  boost:       { text: "Ready to make this about YOUR site.\n\nPaste your website URL below and give me one sentence about what you do. I'll run a live analysis — quick wins, traffic projection, and a downloadable PDF report.", capsules:[] },
  /* Post-analysis scripts */
  post_insight:  { text: "PLACEHOLDER_POST_INSIGHT", capsules:[{label:"Show my quick wins",key:"post_quickwins"},{label:"What is my biggest risk?",key:"post_risk"},{label:"Build my Week 1 canvas",key:"post_canvas"}] },
  post_quickwins:{ text: "PLACEHOLDER_POST_QUICKWINS", capsules:[{label:"Yes, build full Week 1",key:"post_canvas"},{label:"What comes after Week 1?",key:"ninety_days"},{label:"Download my PDF report",key:"post_pdf"}], createCards:true },
  post_canvas:   { text: "I am building your Week 1 strategy canvas now. Based on your audit, tasks are ordered by impact and effort.\n\nTotal Week 1 investment: approximately 10 hours. Projected outcome by Day 14: ranking movement on 3-5 target keywords, Core Web Vitals improvement, and first LLM citations being established.\n\nIn a traditional agency engagement, this strategy session alone costs £800-1,500.", capsules:[{label:"What does a traditional agency charge?",key:"time_saving"},{label:"What does Week 2 look like?",key:"ninety_days"},{label:"Download PDF report",key:"post_pdf"}], createCards:true },
  post_risk:     { text: "PLACEHOLDER_POST_RISK", capsules:[{label:"How urgent is this?",key:"drops"},{label:"What is the fix?",key:"priority"},{label:"Get started now",key:"cta"}] },
  post_traffic:  { text: "PLACEHOLDER_POST_TRAFFIC", capsules:[{label:"Show me the full roadmap",key:"ninety_days"},{label:"Download PDF report",key:"post_pdf"},{label:"Get started",key:"cta"}] },
  post_pdf:      { text: "Your full PDF report is ready — click the Download button at the top of your analysis.\n\nThe report includes your current scores, the 5 quick wins with effort and impact breakdown, your 6-month traffic projection, and the complete 90-day roadmap.\n\nShare it with your team or use it as a brief if you bring in external help.", capsules:[{label:"What is the next step?",key:"cta"},{label:"Can I speak with Manav?",key:"pricing"},{label:"Analyse another site",key:"boost"}] },
};

/* ── Build live cards from analysis ── */
function buildLiveCards(a: Analysis): LiveCard[] {
  return [
    {id:"lc0",type:"quick-win", title:a.quickWins[0]?.title.slice(0,50)||"Fix critical meta issues",          effort:"2h",impact:a.quickWins[0]?.impact||"+12% CTR", week:1,color:TC["quick-win"], revealed:false},
    {id:"lc1",type:"technical", title:a.quickWins[1]?.title.slice(0,50)||"Implement structured data markup",   effort:"3h",impact:"Rich results",                       week:1,color:TC["technical"],  revealed:false},
    {id:"lc2",type:"content",   title:a.quickWins[2]?.title.slice(0,50)||"Publish high-intent buyer guide",   effort:"5h",impact:a.quickWins[2]?.impact||"+18% traffic",week:2,color:TC["content"],   revealed:false},
    {id:"lc3",type:"geo",       title:"GEO optimise top 3 pages for AI search citation",                       effort:"4h",impact:"LLM visibility +15pt",               week:2,color:TC["geo"],        revealed:false},
  ];
}

/* ── Score Ring ── */
function Ring({score,potential,label,color}:{score:number;potential?:number;label:string;color:string}) {
  const r=18, circ=2*Math.PI*r;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <div style={{position:"relative",width:46,height:46}}>
        <svg viewBox="0 0 44 44" style={{width:46,height:46,transform:"rotate(-90deg)"}}>
          <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"/>
          <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ*(1-score/100)}
            style={{filter:"drop-shadow(0 0 4px "+color+")"}}/>
        </svg>
        <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:"white"}}>{score}</span>
      </div>
      {potential&&<span style={{fontSize:8,color:"#10b981",fontFamily:"monospace"}}>{"->"+potential}</span>}
      <span style={{fontSize:8,color:"rgba(255,255,255,0.35)",textAlign:"center",lineHeight:1.3,maxWidth:60}}>{label}</span>
    </div>
  );
}

/* ── Analysis Dashboard ── */
function AnalysisDashboard({a,cards,onDownload,downloading}:{a:Analysis;cards:LiveCard[];onDownload:()=>void;downloading:boolean}) {
  const maxT = Math.max(...a.trafficProjection,1);
  const svgPts = a.trafficProjection.map((v,i)=>({x:10+(i/5)*280, y:46-(v/maxT)*42}));
  const polyFill = "10,50 "+svgPts.map(p=>p.x+","+p.y).join(" ")+" 290,50";
  const polyLine = svgPts.map(p=>p.x+","+p.y).join(" ");
  return (
    <div style={{height:"100%",overflow:"auto",background:"#06091a"}}>
      <div style={{padding:"11px 14px",borderBottom:"1px solid rgba(99,102,241,0.12)",background:"rgba(20,15,50,0.4)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:13,fontWeight:900,color:"white"}}>{a.businessName}</div>
          <div style={{fontSize:9,color:"rgba(165,180,252,0.5)",fontFamily:"monospace"}}>{a.url}</div>
        </div>
        <button onClick={onDownload} disabled={downloading} style={{display:"flex",alignItems:"center",gap:5,background:downloading?"rgba(99,102,241,0.12)":"linear-gradient(135deg,#6366f1,#4f46e5)",border:"none",borderRadius:8,padding:"7px 12px",color:"white",fontSize:9,fontFamily:"monospace",fontWeight:700,cursor:"pointer"}}>
          {downloading?<Loader2 size={10} style={{animation:"spin 1s linear infinite"}}/>:<Download size={10}/>}
          {downloading?"Generating...":"Download PDF Report"}
        </button>
      </div>
      <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:9}}>
        <div style={{background:"rgba(99,102,241,0.08)",border:"1px solid rgba(99,102,241,0.22)",borderRadius:9,padding:"10px 13px"}}>
          <div style={{fontSize:8,fontFamily:"monospace",color:"rgba(165,180,252,0.6)",marginBottom:4}}>KEY INSIGHT</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.78)",lineHeight:1.65}}>{a.keyInsight}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7}}>
          <Ring score={a.llmScore}       potential={a.llmPotential}       label="LLM Visibility"  color="#a78bfa"/>
          <Ring score={a.healthScore}    potential={a.healthPotential}    label="Algo Health"     color="#10b981"/>
          <Ring score={a.eeatScore}      potential={a.eeatPotential}      label="E-E-A-T"         color="#f59e0b"/>
          <Ring score={a.authorityScore} potential={a.authorityPotential} label="Authority"       color="#06b6d4"/>
        </div>
        <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:9,padding:"11px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:8,fontFamily:"monospace",color:"rgba(255,255,255,0.25)"}}>TRAFFIC PROJECTION — 6 MONTHS</span>
            <span style={{fontSize:9,color:"#4ade80",fontFamily:"monospace"}}>{a.monthlyTraffic.toLocaleString()+" -> "+a.trafficPotential.toLocaleString()+"/mo"}</span>
          </div>
          <svg viewBox="0 0 300 50" style={{width:"100%",height:48,display:"block"}}>
            <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.35"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0"/></linearGradient></defs>
            <polygon points={polyFill} fill="url(#cg)"/>
            <polyline points={polyLine} fill="none" stroke="#6366f1" strokeWidth="2" style={{filter:"drop-shadow(0 0 3px rgba(99,102,241,0.8))"}}/>
            {svgPts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={i===svgPts.length-1?3.5:2} fill={i===svgPts.length-1?"#a5b4fc":"rgba(99,102,241,0.6)"}/>)}
            {svgPts.map((p,i)=><text key={"t"+i} x={p.x} y={48} textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.2)">{["Now","M1","M2","M3","M4","M5"][i]}</text>)}
          </svg>
        </div>
        <div>
          <div style={{fontSize:8,fontFamily:"monospace",color:"rgba(255,255,255,0.2)",marginBottom:5,letterSpacing:"0.1em"}}>QUICK WINS — WEEKS 1-2</div>
          {a.quickWins.slice(0,5).map((qw,i)=>(
            <div key={i} style={{display:"flex",gap:9,alignItems:"center",background:"rgba(255,255,255,0.02)",borderLeft:"3px solid "+(TC[qw.type]||"#6366f1"),borderRadius:7,padding:"7px 10px",marginBottom:5}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.72)",lineHeight:1.3,marginBottom:3}}>{qw.title}</div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{fontSize:7,color:"rgba(255,255,255,0.28)",fontFamily:"monospace"}}>{qw.effort}</span>
                  <div style={{flex:1,height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:Math.min(qw.impactPct,100)+"%",background:TC[qw.type]||"#6366f1",borderRadius:2}}/></div>
                  <span style={{fontSize:9,color:TC[qw.type]||"#6366f1",fontFamily:"monospace",flexShrink:0}}>{qw.impact}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {cards.filter(c=>c.revealed).length>0&&(
          <div>
            <div style={{fontSize:8,fontFamily:"monospace",color:"rgba(99,102,241,0.5)",marginBottom:5,letterSpacing:"0.08em",display:"flex",alignItems:"center",gap:5}}><Zap size={8}/> STRATEGY CANVAS — BEING BUILT</div>
            {cards.filter(c=>c.revealed).map((card)=>(
              <div key={card.id} style={{background:"rgba(255,255,255,0.02)",borderLeft:"3px solid "+card.color,borderRadius:7,padding:"7px 10px",marginBottom:5,animation:"fadeIn 0.4s ease"}}>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.7)"}}>{card.title}</div>
                <div style={{fontSize:7,color:"rgba(255,255,255,0.25)",fontFamily:"monospace",marginTop:2}}>{card.type+" · Week "+card.week+" · "+card.effort+" · "+card.impact}</div>
              </div>
            ))}
            {cards.filter(c=>!c.revealed).length>0&&(
              <div style={{fontSize:8,color:"rgba(99,102,241,0.4)",fontFamily:"monospace",display:"flex",alignItems:"center",gap:4}}><Loader2 size={8} style={{animation:"spin 1s linear infinite"}}/>Building more cards...</div>
            )}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          <div style={{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.18)",borderRadius:7,padding:"9px"}}>
            <div style={{fontSize:7,fontFamily:"monospace",color:"#fca5a5",marginBottom:3}}>BIGGEST RISK</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.45)",lineHeight:1.5}}>{a.biggestRisk}</div>
          </div>
          <div style={{background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.18)",borderRadius:7,padding:"9px"}}>
            <div style={{fontSize:7,fontFamily:"monospace",color:"#34d399",marginBottom:3}}>TOP OPPORTUNITY</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.45)",lineHeight:1.5}}>{a.topOpportunity}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Savings table ── */
function SavingsTable({savings}:{savings:Saving[]}) {
  return (
    <div style={{background:"rgba(16,185,129,0.05)",border:"1px solid rgba(16,185,129,0.18)",borderRadius:8,padding:"9px",marginTop:5}}>
      <div style={{fontSize:8,fontFamily:"monospace",color:"#34d399",marginBottom:5,display:"flex",alignItems:"center",gap:5}}><Clock size={9}/> TIME SAVINGS BREAKDOWN</div>
      {savings.map((s,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px",gap:5,padding:"3px 0",borderBottom:i<savings.length-1?"1px solid rgba(255,255,255,0.04)":"none",alignItems:"center"}}>
          <span style={{fontSize:9,color:"rgba(255,255,255,0.55)"}}>{s.task}</span>
          <span style={{fontSize:8,color:"rgba(255,100,100,0.6)",fontFamily:"monospace",textDecoration:"line-through"}}>{s.old}</span>
          <span style={{fontSize:8,color:"#10b981",fontFamily:"monospace"}}>{s.brain}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Page preview components ── */
function PagePlayground({data}:{data:DemoProject}) {
  return (
    <div style={{height:"100%",overflow:"auto",padding:"12px 14px",background:"#07091a"}}>
      <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
        {Object.entries(TC).map(([t,c])=><span key={t} style={{fontSize:7,fontFamily:"monospace",padding:"1px 7px",borderRadius:8,background:c+"18",border:"1px solid "+c+"30",color:c}}>{t}</span>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {[1,2,3].map(w=>(
          <div key={w}>
            <div style={{fontSize:8,fontFamily:"monospace",color:"rgba(255,255,255,0.2)",marginBottom:5,background:"rgba(99,102,241,0.1)",padding:"2px 7px",borderRadius:4,display:"inline-block"}}>WK {w}</div>
            <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:4}}>
              {data.canvas.filter((c:any)=>c.week===w).map((card:any,i:number)=>(
                <div key={i} style={{background:"rgba(255,255,255,0.025)",borderLeft:"3px solid "+(TC[card.type]||"#6366f1"),borderRadius:6,padding:"6px 8px"}}>
                  <div style={{fontSize:8,color:"rgba(255,255,255,0.65)",lineHeight:1.3,marginBottom:2}}>{card.title}</div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:7,color:TC[card.type]||"#6366f1",fontFamily:"monospace"}}>{card.type}</span>
                    <span style={{fontSize:7,fontFamily:"monospace",color:card.status==="done"?"#10b981":card.status==="in_progress"?"#f59e0b":"rgba(255,255,255,0.2)"}}>{card.status==="done"?"Done":card.status==="in_progress"?"Active":"Queued"}</span>
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
  const maxT = Math.max(...data.traffic_trend,1);
  const pts   = data.traffic_trend.map((v:number,i:number)=>({x:8+(i/5)*184,y:38-(v/maxT)*34}));
  const pf    = "8,42 "+pts.map((p:any)=>p.x+","+p.y).join(" ")+" 192,42";
  const pl    = pts.map((p:any)=>p.x+","+p.y).join(" ");
  return (
    <div style={{height:"100%",overflow:"auto",padding:"12px 14px",background:"#07091a",display:"flex",flexDirection:"column",gap:9}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
        <Ring score={data.llm}       label="LLM Visibility" color="#a78bfa"/>
        <Ring score={data.health}    label="Algo Health"    color="#10b981"/>
        <Ring score={data.eeat}      label="E-E-A-T"        color="#f59e0b"/>
        <Ring score={data.authority} label="Authority"      color="#06b6d4"/>
      </div>
      <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:9,padding:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontSize:8,fontFamily:"monospace",color:"rgba(255,255,255,0.25)"}}>ORGANIC TRAFFIC</span>
          <span style={{fontSize:8,color:"#4ade80",fontFamily:"monospace"}}>+14%</span>
        </div>
        <div style={{fontSize:22,fontWeight:900,color:"white",marginBottom:5}}>{data.organic.toLocaleString()}</div>
        <svg viewBox="0 0 200 42" style={{width:"100%",height:40}}>
          <defs><linearGradient id="dtg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0"/></linearGradient></defs>
          <polygon points={pf} fill="url(#dtg)"/>
          <polyline points={pl} fill="none" stroke="#6366f1" strokeWidth="2"/>
        </svg>
      </div>
      <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:9,padding:"10px"}}>
        <div style={{fontSize:8,fontFamily:"monospace",color:"rgba(255,255,255,0.25)",marginBottom:6}}>KEYWORD RANKINGS</div>
        {data.keywords.slice(0,4).map((kw:string,i:number)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
            <span style={{fontSize:9,color:"rgba(255,255,255,0.5)"}}>{kw}</span>
            <span style={{fontSize:8,fontFamily:"monospace",color:i<2?"#4ade80":"#f59e0b"}}>{"#"+[3,7,14,28][i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageDataRoom({data}:{data:DemoProject}) {
  const rows = [
    {l:"Keywords",c:"#a78bfa",v:data.keywords.length+" tracked"},
    {l:"Competitors",c:"#06b6d4",v:"2 mapped"},
    {l:"Organic Analytics",c:"#10b981",v:data.organic.toLocaleString()+"/mo"},
    {l:"Technical Baseline",c:"#f59e0b",v:"Audited"},
    {l:"Content Strategy",c:"#facc15",v:"Mapped"},
    {l:"GEO Optimisation",c:"#6366f1",v:"In progress"},
  ];
  return (
    <div style={{height:"100%",overflow:"auto",padding:"12px 14px",background:"#07091a",display:"flex",flexDirection:"column",gap:5}}>
      <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,padding:"9px 12px",marginBottom:3}}>
        <div style={{fontSize:11,fontWeight:700,color:"white"}}>{data.name}</div>
        <div style={{fontSize:8,color:"rgba(165,180,252,0.5)",fontFamily:"monospace"}}>{data.domain}</div>
      </div>
      {rows.map((s,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:7,padding:"7px 10px"}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:s.c,flexShrink:0}}/>
          <span style={{fontSize:9,color:"rgba(255,255,255,0.5)",flex:1}}>{s.l}</span>
          <span style={{fontSize:8,fontFamily:"monospace",color:s.c}}>{s.v}</span>
          <CheckCircle size={9} style={{color:"#10b981",flexShrink:0}}/>
        </div>
      ))}
    </div>
  );
}

function PageAlgorithm({data}:{data:DemoProject}) {
  const updates = [
    {n:"March 2025 Core Update",e:"Google",    i:"HIGH",c:"#ef4444",t:data.algo_impact.slice(0,70)},
    {n:"Helpful Content System v4",e:"Google", i:"HIGH",c:"#ef4444",t:"E-E-A-T signals weighted more heavily."},
    {n:"ChatGPT Search Algorithm",e:"ChatGPT", i:"NEW", c:"#a78bfa",t:"Citation authority signals introduced."},
    {n:"Perplexity Pro Ranking",e:"Perplexity",i:"MED", c:"#f59e0b",t:"Source credibility weighted higher."},
  ];
  return (
    <div style={{height:"100%",overflow:"auto",padding:"12px 14px",background:"#07091a",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.18)",borderRadius:8,padding:"8px 11px",marginBottom:2}}>
        <div style={{fontSize:8,fontFamily:"monospace",color:"rgba(165,180,252,0.6)",marginBottom:4}}>4 ENGINES · 47 SIGNALS · LIVE</div>
        <div style={{display:"flex",gap:5}}>
          {["Google","ChatGPT","Perplexity","Bing"].map((e,i)=><span key={i} style={{fontSize:7,fontFamily:"monospace",padding:"2px 7px",borderRadius:6,background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.4)"}}>{e}</span>)}
        </div>
      </div>
      {updates.map((u,i)=>(
        <div key={i} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:7,padding:"8px 10px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
            <span style={{fontSize:9,color:"rgba(255,255,255,0.65)",fontWeight:600}}>{u.n}</span>
            <span style={{fontSize:7,fontFamily:"monospace",color:u.c,background:u.c+"18",padding:"1px 5px",borderRadius:3}}>{u.i}</span>
          </div>
          <div style={{fontSize:7,color:"rgba(255,255,255,0.25)",fontFamily:"monospace",marginBottom:3}}>{u.e}</div>
          <div style={{fontSize:8,color:"rgba(255,255,255,0.32)"}}>{u.t}</div>
        </div>
      ))}
    </div>
  );
}

function PageAudit({data}:{data:DemoProject}) {
  const sc:Record<string,string>={critical:"#ef4444",high:"#f59e0b",medium:"#6366f1",low:"#10b981"};
  const stats=[
    {n:data.audits.filter((a:any)=>a.severity==="critical").length,l:"Critical",c:"#ef4444"},
    {n:data.audits.filter((a:any)=>a.severity==="high").length,    l:"High",    c:"#f59e0b"},
    {n:94,l:"Passed",c:"#10b981"},
    {n:3, l:"Warnings",c:"#6366f1"},
  ];
  return (
    <div style={{height:"100%",overflow:"auto",padding:"12px 14px",background:"#07091a",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:"9px 11px"}}>
        <div style={{fontSize:8,fontFamily:"monospace",color:"rgba(255,255,255,0.25)",marginBottom:5}}>AUDIT COMPLETE — {data.domain}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
          {stats.map((s,i)=><div key={i} style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:s.c}}>{s.n}</div><div style={{fontSize:7,color:"rgba(255,255,255,0.3)"}}>{s.l}</div></div>)}
        </div>
      </div>
      {data.audits.map((a:any,i:number)=>(
        <div key={i} style={{background:"rgba(255,255,255,0.02)",border:"1px solid "+(sc[a.severity]||"#6366f1")+"25",borderRadius:7,padding:"8px 10px",display:"flex",gap:7}}>
          <AlertCircle size={10} style={{color:sc[a.severity]||"#6366f1",flexShrink:0,marginTop:1}}/>
          <div>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.65)",lineHeight:1.3,marginBottom:2}}>{a.issue}</div>
            <span style={{fontSize:7,fontFamily:"monospace",color:sc[a.severity]||"#6366f1"}}>{a.severity}</span>
            <span style={{fontSize:7,color:"rgba(255,255,255,0.25)",marginLeft:6}}>{"-> "+a.fix}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PageBrainLearning({data}:{data:DemoProject}) {
  const tc2:Record<string,string>={technical:"#06b6d4",content:"#facc15",geo:"#6366f1","quick-win":"#4ade80"};
  return (
    <div style={{height:"100%",overflow:"auto",padding:"12px 14px",background:"#07091a",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{background:"rgba(99,102,241,0.05)",border:"1px solid rgba(99,102,241,0.18)",borderRadius:8,padding:"8px 11px",marginBottom:2}}>
        <div style={{fontSize:8,fontFamily:"monospace",color:"rgba(165,180,252,0.55)"}}>{data.learnings.length+" LEARNINGS · AUTO-CAPTURED · GROWING"}</div>
      </div>
      {data.learnings.map((l:any,i:number)=>(
        <div key={i} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:7,padding:"8px 10px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:7,fontFamily:"monospace",color:tc2[l.type]||"#6366f1",background:(tc2[l.type]||"#6366f1")+"18",padding:"1px 5px",borderRadius:3}}>{l.type.toUpperCase()}</span>
            <span style={{fontSize:7,color:"#10b981",fontFamily:"monospace"}}>{l.confidence+"% · "+l.applied+"x"}</span>
          </div>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.7)",fontWeight:600,marginBottom:2}}>{l.title}</div>
          <div style={{fontSize:8,color:"rgba(255,255,255,0.35)",lineHeight:1.4}}>{l.insight}</div>
        </div>
      ))}
    </div>
  );
}

const PAGE_VIEWS: Record<string,(d:DemoProject)=>React.ReactNode> = {
  playground:       d=><PagePlayground data={d}/>,
  dashboard:        d=><PageDashboard data={d}/>,
  "data-room":      d=><PageDataRoom data={d}/>,
  "algorithm-intel":d=><PageAlgorithm data={d}/>,
  audit:            d=><PageAudit data={d}/>,
  "brain-learning": d=><PageBrainLearning data={d}/>,
};

/* ── PDF Generator ── */
async function downloadPDF(a: Analysis) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit:"mm", format:"a4" });
  const W = 210, PH = 297;
  let y = 0;

  const setFont = (size:number, bold:boolean) => { doc.setFontSize(size); doc.setFont("helvetica", bold?"bold":"normal"); };
  const setColor = (r:number,g:number,b:number) => doc.setTextColor(r,g,b);
  const fillRect = (x:number,y1:number,w:number,h:number,r:number,g:number,b:number) => { doc.setFillColor(r,g,b); doc.roundedRect(x,y1,w,h,2,2,"F"); };
  const strokeRect = (x:number,y1:number,w:number,h:number,r:number,g:number,b:number) => { doc.setDrawColor(r,g,b); doc.setLineWidth(0.3); doc.roundedRect(x,y1,w,h,2,2,"S"); };
  const textLine = (t:string,x:number,yy:number,opts?:any) => doc.text(t,x,yy,opts);
  const splitText = (t:string,maxW:number) => doc.splitTextToSize(t,maxW);

  /* Background */
  doc.setFillColor(3,7,18); doc.rect(0,0,W,PH,"F");
  doc.setFillColor(20,15,50); doc.rect(0,0,W,12,"F");

  /* Header */
  y = 8;
  setFont(7,false); setColor(165,180,252);
  textLine("SEO SEASON — MANAV BRAIN ANALYSIS REPORT",14,y);
  textLine(new Date().toLocaleDateString("en-GB",{year:"numeric",month:"long",day:"numeric"}),W-14,y,{align:"right"});

  /* Title */
  y = 22;
  setFont(20,true); setColor(255,255,255);
  textLine(a.businessName||a.url,14,y);
  y = 30;
  setFont(10,false); setColor(165,180,252);
  textLine("AI-Powered SEO Analysis Report",14,y);
  y = 36;
  setFont(8,false); setColor(100,100,150);
  textLine(a.url,14,y);

  /* Divider */
  y = 41;
  doc.setDrawColor(99,102,241); doc.setLineWidth(0.4); doc.line(14,y,W-14,y);

  /* Key insight */
  y = 47;
  fillRect(14,y,W-28,20, 20,15,50);
  strokeRect(14,y,W-28,20, 99,102,241);
  setFont(7,true); setColor(165,180,252); textLine("KEY INSIGHT",18,y+7);
  setFont(8,false); setColor(220,220,255);
  const insLines = splitText(a.keyInsight, W-42);
  doc.text(insLines.slice(0,2),18,y+13);

  /* Scores */
  y = 73;
  const scores = [
    {l:"LLM Visibility",  cur:a.llmScore,       pot:a.llmPotential,       r:165,g:180,b:252},
    {l:"Algorithm Health",cur:a.healthScore,     pot:a.healthPotential,    r:16, g:185,b:129},
    {l:"E-E-A-T",         cur:a.eeatScore,       pot:a.eeatPotential,      r:245,g:158,b:11},
    {l:"Authority",       cur:a.authorityScore,  pot:a.authorityPotential, r:6,  g:182,b:212},
  ];
  const sw = (W-28)/4;
  scores.forEach((s,i) => {
    const x = 14+i*sw;
    fillRect(x+1,y,sw-3,22, Math.round(s.r*0.08)+4,Math.round(s.g*0.08)+4,Math.round(s.b*0.08)+10);
    setFont(18,true); setColor(s.r,s.g,s.b); textLine(String(s.cur), x+sw/2, y+12, {align:"center"});
    setFont(8,false); setColor(60,140,80); textLine("-> "+s.pot, x+sw/2, y+18, {align:"center"});
    setFont(6,false); setColor(s.r,s.g,s.b); textLine(s.l, x+sw/2, y+22, {align:"center"});
  });

  /* Traffic */
  y = 101;
  setFont(8,true); setColor(165,180,252); textLine("TRAFFIC PROJECTION",14,y);
  setFont(9,false); setColor(200,200,255);
  textLine(a.monthlyTraffic.toLocaleString()+" visits/mo now",14,y+8);
  setFont(9,true); setColor(52,211,153);
  textLine("-> "+a.trafficPotential.toLocaleString()+" visits/mo at Month 6",80,y+8);
  const gainPct = Math.round((a.trafficPotential/Math.max(a.monthlyTraffic,1)-1)*100);
  setFont(7,false); setColor(100,140,100);
  textLine("+" + gainPct + "% organic growth in 90 days",14,y+15);

  /* Quick wins */
  y = 122;
  doc.setDrawColor(60,60,100); doc.setLineWidth(0.3); doc.line(14,y,W-14,y);
  y = 127;
  setFont(8,true); setColor(165,180,252); textLine("TOP QUICK WINS — IMPLEMENTABLE IN 2 WEEKS",14,y);
  y = 133;
  const qwColorMap: Record<string,[number,number,number]> = {
    "quick-win":[74,222,128], technical:[6,182,212], content:[250,204,21], geo:[99,102,241], competitive:[251,146,60]
  };
  a.quickWins.slice(0,5).forEach((qw,i) => {
    const yy = y+i*17;
    fillRect(14,yy,W-28,14, 10,12,28);
    const [r,g,b] = qwColorMap[qw.type]||[99,102,241];
    doc.setFillColor(r,g,b); doc.rect(14,yy,3,14,"F");
    setFont(8,false); setColor(220,220,255);
    textLine((i+1)+". "+qw.title.slice(0,55), 20, yy+6);
    setFont(8,true); setColor(r,g,b); textLine(qw.impact, W-14, yy+6, {align:"right"});
    setFont(6,false); setColor(80,80,120); textLine(qw.effort+" effort · Week "+qw.week, 20, yy+11);
    const barW = Math.max(2,(W-80)*qw.impactPct/100);
    doc.setFillColor(20,20,40); doc.roundedRect(W-68,yy+5,W-80,4,1,1,"F");
    doc.setFillColor(r,g,b); doc.roundedRect(W-68,yy+5,barW,4,1,1,"F");
  });

  /* Risk + Opportunity */
  y = 222;
  const half = (W-32)/2;
  fillRect(14,y,half,22, 30,8,8); strokeRect(14,y,half,22, 100,30,30);
  setFont(7,true); setColor(252,165,165); textLine("BIGGEST RISK",18,y+8);
  setFont(7,false); setColor(200,160,160);
  doc.text(splitText(a.biggestRisk,half-10),18,y+14);
  fillRect(14+half+4,y,half,22, 8,25,15); strokeRect(14+half+4,y,half,22, 30,100,60);
  setFont(7,true); setColor(52,211,153); textLine("TOP OPPORTUNITY",18+half+4,y+8);
  setFont(7,false); setColor(130,200,150);
  doc.text(splitText(a.topOpportunity,half-10),18+half+4,y+14);

  /* PAGE 2 — Roadmap */
  doc.addPage();
  doc.setFillColor(3,7,18); doc.rect(0,0,W,PH,"F");
  doc.setFillColor(20,15,50); doc.rect(0,0,W,12,"F");
  y = 8;
  setFont(7,false); setColor(165,180,252);
  textLine("SEO SEASON — "+a.businessName+" — ROADMAP",14,y);
  textLine("Page 2 of 2",W-14,y,{align:"right"});
  y = 22; setFont(16,true); setColor(255,255,255); textLine("Your 90-Day Path to SEO Dominance",14,y);
  y = 28; doc.setDrawColor(99,102,241); doc.setLineWidth(0.4); doc.line(14,y,W-14,y);
  y = 36;
  const mColors: Array<[number,number,number]> = [[74,222,128],[6,182,212],[245,158,11],[165,180,252],[239,68,68]];
  a.roadmap.slice(0,5).forEach((m,i) => {
    const [r,g,b] = mColors[i]||[99,102,241];
    doc.setFillColor(r,g,b); doc.circle(20,y+5,3,"F");
    if(i<4){ doc.setDrawColor(40,40,80); doc.setLineWidth(0.3); doc.line(20,y+8,20,y+43); }
    fillRect(28,y,W-42,38, 10,12,28); strokeRect(28,y,W-42,38, r,g,b);
    setFont(8,true); setColor(r,g,b); textLine("WEEK "+m.week+" — "+m.label.toUpperCase(),33,y+9);
    setFont(8,true); setColor(52,211,153); textLine(m.gain,W-14,y+9,{align:"right"});
    setFont(7,false); setColor(180,180,220);
    m.tasks.slice(0,3).forEach((t,ti) => { textLine("• "+t,33,y+16+ti*7); });
    y += 43;
  });

  /* Summary */
  y += 4;
  fillRect(14,y,W-28,18, 15,10,40); strokeRect(14,y,W-28,18, 99,102,241);
  setFont(8,true); setColor(165,180,252); textLine("SUMMARY",18,y+8);
  setFont(8,false); setColor(200,200,255);
  doc.text(splitText(a.summary,W-40),18,y+14);
  setFont(7,false); setColor(60,60,100);
  textLine("Generated by Manav Brain — SEO Season · seoseason.app",W/2,PH-8,{align:"center"});

  const fname = (a.businessName||"site").replace(/[^a-z0-9]/gi,"-").toLowerCase()+"-seo-analysis.pdf";
  doc.save(fname);
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function GuestTour() {
  const navigate    = useNavigate();
  const [step,      setStep]       = useState(0);
  const [demoData,  setDemoData]   = useState<DemoProject|null>(null);
  const [view,      setView]       = useState<"tour"|"analysis">("tour");
  const [phase,     setPhase]      = useState<"idle"|"collecting"|"analyzing"|"done">("idle");
  const [narration, setNarration]  = useState("");
  const [narDone,   setNarDone]    = useState(false);
  const [msgs,      setMsgs]       = useState<BrainMsg[]>([]);
  const [input,     setInput]      = useState("");
  const [urlInput,  setUrlInput]   = useState("");
  const [descInput, setDescInput]  = useState("");
  const [busy,      setBusy]       = useState(false);
  const [analysis,  setAnalysis]   = useState<Analysis|null>(null);
  const [liveCards, setLiveCards]  = useState<LiveCard[]>([]);
  const [dl,        setDl]         = useState(false);
  const [showCta,   setShowCta]    = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const narRef    = useRef<any>(null);

  useEffect(()=>{
    const ind = localStorage.getItem("seo_demo_industry")||"saas";
    const d   = DEMO_INDUSTRIES[ind]||DEMO_INDUSTRIES["saas"];
    setDemoData(d);
    setTimeout(()=>typeNar(NARRATION["playground"](d)),500);
  },[]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  const typeNar = useCallback((text:string)=>{
    setNarDone(false); setNarration("");
    if(narRef.current) clearInterval(narRef.current);
    let i=0;
    narRef.current = setInterval(()=>{ i++; setNarration(text.slice(0,i)); if(i>=text.length){clearInterval(narRef.current);setNarDone(true);} },14);
  },[]);

  const goToStep = useCallback((idx:number)=>{
    if(!demoData) return;
    setStep(idx); setView("tour"); setNarDone(false); setNarration("");
    const sid = SECTIONS[idx].id;
    const fn  = NARRATION[sid as keyof typeof NARRATION];
    if(fn) setTimeout(()=>typeNar(fn(demoData)),250);
  },[demoData,typeNar]);

  /* Add a scripted message to chat */
  const pushScript = useCallback((key:string, overrideText?:string)=>{
    const s = SCRIPTS[key];
    if(!s) return;
    const text = overrideText || s.text;
    const msg: BrainMsg = {role:"brain", text, capsules:s.capsules, savings:s.savings};
    setMsgs(m=>[...m, msg]);
    if(s.createCards && analysis){
      const cards = buildLiveCards(analysis);
      setLiveCards(cards);
      cards.forEach((_c,ci)=>{
        setTimeout(()=>setLiveCards(prev=>prev.map((c,pi)=>pi===ci?{...c,revealed:true}:c)), 500+ci*600);
      });
      setView("analysis");
    }
  },[analysis]);

  /* Handle capsule tap */
  const handleCapsule = useCallback((key:string)=>{
    if(key==="boost"){
      setMsgs(m=>[...m,
        {role:"user", text:"Analyse my website"},
        {role:"brain", text:"Perfect. Paste your URL below and one line about your business.", capsules:[]},
      ]);
      return;
    }
    if(key==="signup"){ navigate("/"); return; }
    setMsgs(m=>[...m,{role:"user", text:key.replace(/_/g," ")}]);
    setTimeout(()=>pushScript(key), 150);
  },[pushScript, navigate]);

  /* Run real analysis */
  const runAnalysis = useCallback(async(url:string, desc:string)=>{
    setPhase("analyzing");
    setMsgs(m=>[...m,{role:"brain", text:"Running analysis for "+url+"..."}]);
    const q = "WEBSITE: "+url+"\nBUSINESS: "+desc+"\n\nReturn ONLY valid JSON, no markdown, no backticks, starting with {:\n{\"businessName\":\"name\",\"url\":\"x\",\"industry\":\"ecommerce|saas|local|agency\",""\"llmScore\":25,\"llmPotential\":68,\"healthScore\":55,\"healthPotential\":80,""\"eeatScore\":40,\"eeatPotential\":72,\"authorityScore\":35,\"authorityPotential\":60,""\"monthlyTraffic\":2000,\"trafficPotential\":9000,\"trafficProjection\":[2000,2800,4200,5800,7400,9000],""\"quickWins\":[{\"title\":\"Specific fix 1\",\"effort\":\"2h\",\"impact\":\"+15% CTR\",\"impactPct\":15,\"type\":\"technical\",\"week\":1},""{\"title\":\"Specific fix 2\",\"effort\":\"3h\",\"impact\":\"Rich results\",\"impactPct\":20,\"type\":\"quick-win\",\"week\":1},""{\"title\":\"Specific fix 3\",\"effort\":\"4h\",\"impact\":\"Rankings\",\"impactPct\":18,\"type\":\"content\",\"week\":1},""{\"title\":\"Specific fix 4\",\"effort\":\"2h\",\"impact\":\"AI citations\",\"impactPct\":12,\"type\":\"geo\",\"week\":2},""{\"title\":\"Specific fix 5\",\"effort\":\"5h\",\"impact\":\"Authority\",\"impactPct\":22,\"type\":\"competitive\",\"week\":2}],""\"roadmap\":[{\"week\":1,\"label\":\"Foundation\",\"tasks\":[\"Fix technical\",\"Optimise meta\",\"Schema markup\"],\"gain\":\"+15% crawl efficiency\"},""{\"week\":2,\"label\":\"Content\",\"tasks\":[\"2 guides\",\"Optimise top pages\",\"FAQ schema\"],\"gain\":\"+8 ranking positions\"},""{\"week\":4,\"label\":\"Authority\",\"tasks\":[\"Link building\",\"GEO optimisation\",\"E-E-A-T\"],\"gain\":\"+25% traffic\"},""{\"week\":8,\"label\":\"Scale\",\"tasks\":[\"Content gaps\",\"Competitor\"],\"gain\":\"+80% traffic\"},""{\"week\":12,\"label\":\"Dominance\",\"tasks\":[\"AI citations\",\"Brand\"],\"gain\":\"+200%\"}],""\"keyInsight\":\"specific insight for this site\",\"biggestRisk\":\"specific risk now\",""\"topOpportunity\":\"specific opportunity available\",\"summary\":\"2 sentence summary\"}";
    try {
      const res = await fetch("/api/intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"answer",question:q,projectSummary:"SEO analysis request",role:"senior_seo",brainAssistantContext:{systemExtra:"Return ONLY valid JSON. No markdown. Pure JSON starting with {."}})});
      if(!res.body) throw new Error("no body");
      const reader=res.body.getReader(); const dec=new TextDecoder(); let raw="";
      while(true){const{done,value}=await reader.read();if(done)break;raw+=dec.decode(value);}
      let parsed: Analysis;
      try {
        const clean=raw.replace(/```json
?/g,"").replace(/```
?/g,"").trim();
        parsed=JSON.parse(clean.slice(clean.indexOf("{"),clean.lastIndexOf("}")+1));
      } catch(_pe) {
        const d2=DEMO_INDUSTRIES[detectIndustry(desc)];
        parsed={businessName:url.split(".")[0],url,industry:detectIndustry(desc),llmScore:22,llmPotential:67,healthScore:54,healthPotential:79,eeatScore:38,eeatPotential:70,authorityScore:31,authorityPotential:57,monthlyTraffic:1400,trafficPotential:7800,trafficProjection:[1400,1900,2800,4200,5900,7800],quickWins:d2.canvas.slice(0,5).map((c:any)=>({title:c.title,effort:c.effort||"3h",impact:c.impact||"+12%",impactPct:Math.floor(Math.random()*18)+8,type:c.type,week:c.week})),roadmap:[{week:1,label:"Foundation",tasks:["Fix technical issues","Optimise meta data","Add schema markup"],gain:"+15% crawl efficiency"},{week:2,label:"Content Sprint",tasks:["2 high-intent guides","Optimise top 5 pages","FAQ structured data"],gain:"+8 ranking positions"},{week:4,label:"Authority Build",tasks:["Link acquisition","GEO optimisation","E-E-A-T signals"],gain:"+25% organic traffic"},{week:8,label:"Scale",tasks:["Content gap filling","Competitor analysis"],gain:"+80% traffic"},{week:12,label:"Dominance",tasks:["AI citation strategy","Brand authority"],gain:"+200% vs baseline"}],keyInsight:"Your LLM Visibility is critically low — AI search engines are answering queries in your space without mentioning your brand. This is the fastest-growing traffic source you are missing entirely.",biggestRisk:"Algorithm vulnerability from thin content and low E-E-A-T signals — actively affecting your rankings now.",topOpportunity:"GEO optimisation for AI search — structuring pages to be cited by ChatGPT and Perplexity for commercial queries.",summary:url+" has significant ranking upside that is currently untapped. The fastest path to growth is technical quick wins in week 1 and AI search optimisation from week 2."};
      }
      setAnalysis(parsed);
      setPhase("done");
      setView("analysis");
      /* Post-analysis messages — text pre-built as variables, NO template literals in callbacks */
      const insightText = "Analysis complete for "+parsed.businessName+".\n\n"+parsed.keyInsight+"\n\nThis is the thing most audits miss entirely — because most tools only look at Google rankings. I found "+parsed.quickWins.length+" quick wins. Want to see them?";
      const trafficGainPct = Math.round((parsed.trafficPotential/Math.max(parsed.monthlyTraffic,1)-1)*100);
      const trafficText = "Traffic projection: "+parsed.monthlyTraffic.toLocaleString()+" visits/month now, growing to "+parsed.trafficPotential.toLocaleString()+" at Month 6.\n\nThat is a "+trafficGainPct+"% increase — "+( parsed.trafficPotential-parsed.monthlyTraffic ).toLocaleString()+" additional monthly visitors.\n\nWant me to build your Week 1 strategy canvas?";
      const quickwinText = "Top quick win: "+parsed.quickWins[0]?.title+".\n\nEffort: "+parsed.quickWins[0]?.effort+". Expected impact: "+parsed.quickWins[0]?.impact+".\n\nImplementable today. I've added it to your strategy canvas along with "+( parsed.quickWins.length-1 )+" more quick wins — about 10 hours of work and measurable ranking movement within 14 days.";
      const riskText = "Biggest risk: "+parsed.biggestRisk+"\n\nThis is actively affecting your rankings right now. I've created a recovery task in your canvas with the specific fix.";
      setTimeout(()=>{
        setMsgs(m=>[...m,{role:"brain",text:insightText,capsules:[{label:"Show my quick wins",key:"_qw"},{label:"See my biggest risk",key:"_risk"},{label:"Build my Week 1 canvas",key:"post_canvas"}]}]);
      },400);
      setTimeout(()=>{
        setMsgs(m=>[...m,{role:"brain",text:trafficText,capsules:[{label:"Build my strategy canvas",key:"post_canvas"},{label:"Download PDF report",key:"post_pdf"},{label:"Get started",key:"cta"}]}]);
      },800);
      /* Store derived texts for capsule handlers */
      (window as any).__brainQW   = quickwinText;
      (window as any).__brainRisk = riskText;
    } catch(_e) {
      setPhase("idle");
      setMsgs(m=>[...m,{role:"brain",text:"Had trouble reaching the analysis engine. Tell me more about your business and I will give you a manual assessment.",capsules:[{label:"Try again",key:"boost"},{label:"Ask me questions",key:"questions"}]}]);
    }
  },[]);

  /* Handle free-text input */
  const handleSend = useCallback(async()=>{
    const val=input.trim(); if(!val||busy) return;
    setInput("");
    setMsgs(m=>[...m,{role:"user",text:val}]);
    const urlMatch = val.match(/[a-z0-9][\w.-]*\.[a-z]{2,}/i);
    if(urlMatch && phase==="idle"){
      setUrlInput(urlMatch[0]); setDescInput(val); setPhase("collecting");
      setMsgs(m=>[...m,{role:"brain",text:"Got "+urlMatch[0]+". What does your business do — one sentence?",capsules:[]}]);
      return;
    }
    if(phase==="collecting" && urlInput){ runAnalysis(urlInput, val); return; }
    /* Live AI response */
    setBusy(true);
    setMsgs(m=>[...m,{role:"brain",text:""}]);
    try {
      const res = await fetch("/api/intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"answer",question:val,projectSummary:"Guest demo visitor",role:"senior_seo",brainAssistantContext:{systemExtra:"You are Manav Brain on the SEO Season demo page. Expert SEO. Keep under 4 sentences. Always end with a specific hook to get their URL. Be direct and insightful."} })});
      if(!res.body) throw new Error("no body");
      const reader=res.body.getReader(); const dec=new TextDecoder(); let full="";
      while(true){const{done,value}=await reader.read();if(done)break;full+=dec.decode(value);setMsgs(m=>{const cp=[...m];cp[cp.length-1]={role:"brain",text:full};return cp;});}
      setMsgs(m=>{const cp=[...m];cp[cp.length-1]={...cp[cp.length-1],capsules:[{label:"Analyse my site",key:"boost"},{label:"How fast will I see results?",key:"speed"},{label:"Get started",key:"cta"}]};return cp;});
    } catch(_e) {
      setMsgs(m=>{const cp=[...m];cp[cp.length-1]={role:"brain",text:"Great question — the answer is specific to your site. Paste your URL and I'll give you the exact answer for your situation.",capsules:[{label:"Analyse my site",key:"boost"}]};return cp;});
    }
    setBusy(false);
  },[input,busy,phase,urlInput,runAnalysis]);

  /* Special capsule keys for post-analysis derived texts */
  const handleCapsuleEx = useCallback((key:string)=>{
    if(key==="_qw"){
      const t = (window as any).__brainQW || "Here are your top quick wins. Each one is in your strategy canvas with the exact fix.";
      setMsgs(m=>[...m,{role:"user",text:"Show my quick wins"},{role:"brain",text:t,capsules:[{label:"Build full Week 1",key:"post_canvas"},{label:"Download PDF",key:"post_pdf"},{label:"Get started",key:"cta"}]}]);
      return;
    }
    if(key==="_risk"){
      const t = (window as any).__brainRisk || "Your biggest risk is identified. A recovery task is in your canvas.";
      setMsgs(m=>[...m,{role:"user",text:"See my biggest risk"},{role:"brain",text:t,capsules:[{label:"How urgent is this?",key:"drops"},{label:"What is the fix?",key:"priority"},{label:"Get started",key:"cta"}]}]);
      return;
    }
    handleCapsule(key);
  },[handleCapsule]);

  const handleKey = (e:React.KeyboardEvent) => { if(e.key==="Enter"&&!e.shiftKey) handleSend(); };

  const sec = demoData ? SECTIONS[step] : SECTIONS[0];

  if(!demoData) return <div style={{minHeight:"100vh",background:"#030712",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"rgba(255,255,255,0.3)",fontFamily:"monospace"}}>Loading...</div></div>;

  return (
    <div style={{height:"100vh",background:"#030712",display:"flex",flexDirection:"column",overflow:"hidden",color:"white",fontFamily:"system-ui,sans-serif"}}>

      {/* TOP BAR */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 16px",background:"rgba(0,0,0,0.6)",borderBottom:"1px solid rgba(255,255,255,0.06)",backdropFilter:"blur(20px)",flexShrink:0,zIndex:20}}>
        <Brain size={16} style={{color:"#a5b4fc",filter:"drop-shadow(0 0 5px rgba(99,102,241,0.7))"}}/>
        <span style={{fontSize:11,fontWeight:900,fontFamily:"monospace",color:"#e0e7ff",letterSpacing:"0.08em"}}>SEO SEASON</span>
        <div style={{height:12,width:1,background:"rgba(255,255,255,0.1)"}}/>
        <span style={{fontSize:8,fontFamily:"monospace",color:"rgba(165,180,252,0.55)",background:"rgba(99,102,241,0.1)",padding:"2px 7px",borderRadius:5,border:"1px solid rgba(99,102,241,0.2)"}}>LIVE DEMO</span>
        {analysis&&<span style={{fontSize:8,fontFamily:"monospace",color:"#10b981",background:"rgba(16,185,129,0.08)",padding:"2px 8px",borderRadius:5,border:"1px solid rgba(16,185,129,0.2)",cursor:"pointer"}} onClick={()=>setView("analysis")}>YOUR ANALYSIS READY</span>}
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {SECTIONS.map((_,i)=>(
            <button key={i} onClick={()=>goToStep(i)} style={{width:i===step&&view==="tour"?16:6,height:6,borderRadius:3,background:i===step&&view==="tour"?"#6366f1":i<step?"rgba(99,102,241,0.4)":"rgba(255,255,255,0.1)",border:"none",cursor:"pointer",transition:"all 0.3s",padding:0}}/>
          ))}
        </div>
        <button onClick={()=>navigate("/")} style={{display:"flex",alignItems:"center",gap:5,background:"linear-gradient(135deg,#6366f1,#4f46e5)",border:"none",borderRadius:7,padding:"6px 12px",color:"white",fontSize:9,fontFamily:"monospace",fontWeight:700,cursor:"pointer"}}>
          <Lock size={9}/> Sign Up Free
        </button>
      </div>

      {/* MAIN LAYOUT */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:"170px 1fr 370px",overflow:"hidden"}}>

        {/* LEFT NAV — always interactive */}
        <div style={{borderRight:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.25)",display:"flex",flexDirection:"column",overflow:"auto"}}>
          <div style={{padding:"9px 12px 4px",fontSize:7,fontFamily:"monospace",color:"rgba(255,255,255,0.18)",letterSpacing:"0.1em"}}>DEMO PAGES</div>
          {SECTIONS.map((s,i)=>{
            const Icon=s.icon;
            const active=i===step&&view==="tour";
            const done=i<step;
            return (
              <button key={i} onClick={()=>goToStep(i)} style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"8px 12px",background:active?"rgba(99,102,241,0.1)":"none",borderLeft:active?"2px solid #6366f1":"2px solid transparent",border:"none",cursor:"pointer",textAlign:"left"}}>
                <Icon size={10} style={{color:active?s.color:done?"rgba(255,255,255,0.35)":"rgba(255,255,255,0.18)",flexShrink:0}}/>
                <span style={{fontSize:8,fontFamily:"monospace",color:active?"#e0e7ff":done?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.25)",fontWeight:active?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</span>
                {done&&view==="tour"&&<CheckCircle size={8} style={{color:"#10b981",marginLeft:"auto",flexShrink:0}}/>}
              </button>
            );
          })}
          {analysis&&(
            <>
              <div style={{margin:"6px 12px 3px",height:1,background:"rgba(99,102,241,0.15)"}}/>
              <button onClick={()=>setView("analysis")} style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"8px 12px",background:view==="analysis"?"rgba(16,185,129,0.1)":"none",borderLeft:view==="analysis"?"2px solid #10b981":"2px solid transparent",border:"none",cursor:"pointer"}}>
                <Star size={10} style={{color:view==="analysis"?"#10b981":"rgba(52,211,153,0.4)",flexShrink:0}}/>
                <span style={{fontSize:8,fontFamily:"monospace",color:view==="analysis"?"#34d399":"rgba(52,211,153,0.5)",fontWeight:view==="analysis"?700:400}}>Your Analysis</span>
              </button>
            </>
          )}
          <div style={{padding:"10px",marginTop:"auto"}}>
            <button onClick={()=>setShowCta(true)} style={{width:"100%",background:"linear-gradient(135deg,rgba(99,102,241,0.18),rgba(79,70,229,0.12))",border:"1px solid rgba(99,102,241,0.28)",borderRadius:7,padding:"7px 4px",color:"#a5b4fc",fontSize:8,fontFamily:"monospace",fontWeight:700,cursor:"pointer"}}>Get Started Free</button>
          </div>
        </div>

        {/* CENTRE */}
        <div style={{display:"flex",flexDirection:"column",overflow:"hidden",background:"#07091a"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:"rgba(0,0,0,0.4)",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
            <div style={{display:"flex",gap:4}}>{["#ef4444","#f59e0b","#10b981"].map((c,i)=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:c+"40"}}/>)}</div>
            <div style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,padding:"2px 8px",display:"flex",alignItems:"center",gap:5}}>
              <Globe size={8} style={{color:"rgba(255,255,255,0.2)"}}/>
              <span style={{fontSize:8,fontFamily:"monospace",color:"rgba(255,255,255,0.28)"}}>
                {"seoseason.app/"+(view==="analysis"&&analysis?"analysis/"+analysis.url:sec.id)}
              </span>
              {view==="analysis"&&<span style={{marginLeft:"auto",fontSize:7,fontFamily:"monospace",color:"#10b981",background:"rgba(16,185,129,0.1)",padding:"0 5px",borderRadius:3}}>YOUR DATA</span>}
            </div>
            <ChevronLeft size={10} style={{color:"rgba(255,255,255,0.35)",cursor:"pointer"}} onClick={()=>{if(view==="analysis")setView("tour");else if(step>0)goToStep(step-1);}}/>
            <ChevronRight size={10} style={{color:"rgba(255,255,255,0.35)",cursor:"pointer"}} onClick={()=>{if(view==="tour"&&step<SECTIONS.length-1)goToStep(step+1);}}/>
          </div>
          <div style={{flex:1,overflow:"auto"}}>
            {phase==="analyzing"?(
              <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:24}}>
                <Brain size={40} style={{color:"#a5b4fc",filter:"drop-shadow(0 0 20px rgba(99,102,241,0.8))",animation:"brainP 2s ease-in-out infinite"}}/>
                <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.65)"}}>{"Analysing "+urlInput+"..."}</div>
                <div style={{display:"flex",gap:3}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#6366f1",animation:"dotP 1.4s ease-in-out "+(i*0.2)+"s infinite"}}/>)}</div>
              </div>
            ):view==="analysis"&&analysis?(
              <AnalysisDashboard a={analysis} cards={liveCards} onDownload={async()=>{setDl(true);try{await downloadPDF(analysis);}catch(_e){}setDl(false);}} downloading={dl}/>
            ):(
              PAGE_VIEWS[sec.id]?.(demoData)
            )}
          </div>
        </div>

        {/* RIGHT — Brain panel */}
        <div style={{borderLeft:"1px solid rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",background:"rgba(3,5,15,0.85)"}}>
          <div style={{padding:"9px 12px",borderBottom:"1px solid rgba(99,102,241,0.1)",display:"flex",alignItems:"center",gap:7,background:"rgba(0,0,0,0.3)",flexShrink:0}}>
            <div style={{position:"relative"}}><Brain size={13} style={{color:"#a5b4fc"}}/><div style={{position:"absolute",top:-2,right:-2,width:5,height:5,borderRadius:"50%",background:"#10b981",border:"1px solid #030712"}}/></div>
            <div style={{flex:1}}>
              <div style={{fontSize:9,fontFamily:"monospace",color:"#e0e7ff",fontWeight:900}}>MANAV BRAIN</div>
              <div style={{fontSize:7,color:"rgba(255,255,255,0.2)",fontFamily:"monospace"}}>{busy?"Thinking...":phase==="analyzing"?"Analysing your site...":"Your SEO partner"}</div>
            </div>
            <sec.icon size={9} style={{color:sec.color}}/>
          </div>

          <div style={{flex:1,overflow:"auto",padding:"10px 11px",display:"flex",flexDirection:"column",gap:7}}>
            {/* Tour narration when no msgs */}
            {msgs.length===0&&(
              <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(6,182,212,0.09)",borderRadius:"4px 11px 11px 11px",padding:"10px 12px"}}>
                <p style={{fontSize:10,color:"rgba(255,255,255,0.68)",lineHeight:1.75,margin:0,whiteSpace:"pre-wrap"}}>
                  {narration}{!narDone&&<span style={{animation:"blink 0.8s step-end infinite",color:"#6366f1"}}>|</span>}
                </p>
              </div>
            )}
            {msgs.length===0&&narDone&&(
              <div style={{display:"flex",gap:5}}>
                {step>0&&<button onClick={()=>goToStep(step-1)} style={{display:"flex",alignItems:"center",gap:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"5px 9px",color:"rgba(255,255,255,0.38)",fontSize:8,fontFamily:"monospace",cursor:"pointer"}}><ChevronLeft size={9}/> Back</button>}
                {step<SECTIONS.length-1?(
                  <button onClick={()=>goToStep(step+1)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:3,background:"linear-gradient(135deg,rgba(99,102,241,0.15),rgba(79,70,229,0.1))",border:"1px solid rgba(99,102,241,0.25)",borderRadius:7,padding:"6px",color:"#a5b4fc",fontSize:8,fontFamily:"monospace",cursor:"pointer",fontWeight:700}}>
                    {SECTIONS[step+1].label}<ChevronRight size={9}/>
                  </button>
                ):(
                  <button onClick={()=>setShowCta(true)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:3,background:"linear-gradient(135deg,#6366f1,#4f46e5)",border:"none",borderRadius:7,padding:"7px",color:"white",fontSize:8,fontFamily:"monospace",cursor:"pointer",fontWeight:700}}><Sparkles size={9}/> Get Started</button>
                )}
              </div>
            )}

            {/* Chat */}
            {msgs.map((m,idx)=>(
              <div key={idx}>
                <div style={{display:"flex",alignItems:"flex-start",gap:6,justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                  {m.role==="brain"&&<div style={{width:18,height:18,borderRadius:"50%",background:"linear-gradient(135deg,#1e1b4b,#0a0f1e)",border:"1px solid rgba(99,102,241,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}><Brain size={8} style={{color:"#a5b4fc"}}/></div>}
                  <div style={{maxWidth:"88%",background:m.role==="user"?"rgba(99,102,241,0.12)":"rgba(255,255,255,0.02)",border:m.role==="user"?"1px solid rgba(99,102,241,0.2)":"1px solid rgba(6,182,212,0.07)",borderRadius:m.role==="user"?"10px 10px 2px 10px":"2px 10px 10px 10px",padding:"7px 10px"}}>
                    <p style={{fontSize:10,color:"rgba(255,255,255,0.7)",lineHeight:1.65,margin:0,whiteSpace:"pre-wrap"}}>{m.text}{m.role==="brain"&&idx===msgs.length-1&&busy&&<span style={{animation:"blink 0.8s step-end infinite",color:"#6366f1",marginLeft:2}}>|</span>}</p>
                  </div>
                </div>
                {m.savings&&m.savings.length>0&&<SavingsTable savings={m.savings}/>}
                {m.capsules&&m.capsules.length>0&&idx===msgs.length-1&&(
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5,paddingLeft:24}}>
                    {m.capsules.map((cap,ci)=>(
                      <button key={ci} onClick={()=>handleCapsuleEx(cap.key)} style={{background:"rgba(99,102,241,0.07)",border:"1px solid rgba(99,102,241,0.18)",borderRadius:14,padding:"4px 10px",fontSize:9,fontFamily:"monospace",color:"rgba(165,180,252,0.75)",cursor:"pointer",whiteSpace:"nowrap"}}>
                        {cap.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {msgs.length===0&&narDone&&(
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {(SECTION_CAPSULES[sec.id]||[]).map((cap,i)=>(
                  <button key={i} onClick={()=>handleCapsuleEx(cap.key)} style={{background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.15)",borderRadius:12,padding:"4px 9px",fontSize:9,fontFamily:"monospace",color:"rgba(165,180,252,0.7)",cursor:"pointer"}}>
                    {cap.label}
                  </button>
                ))}
              </div>
            )}

            {/* URL input box */}
            {(msgs.some(m=>m.text.includes("Paste your URL"))||phase==="collecting")&&(
              <div style={{background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:9,padding:"10px",marginTop:4}}>
                <div style={{fontSize:8,fontFamily:"monospace",color:"rgba(165,180,252,0.7)",marginBottom:6,display:"flex",alignItems:"center",gap:4}}><Activity size={9}/> LIVE ANALYSIS</div>
                <input value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder="yourwebsite.com" style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(99,102,241,0.22)",borderRadius:6,padding:"5px 9px",fontSize:10,color:"white",outline:"none",fontFamily:"monospace",boxSizing:"border-box",marginBottom:5}}/>
                <input value={descInput} onChange={e=>setDescInput(e.target.value)} placeholder="One line: what does your business do?" style={{width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:6,padding:"5px 9px",fontSize:10,color:"rgba(255,255,255,0.7)",outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:7}}/>
                <button onClick={()=>{if(urlInput.trim())runAnalysis(urlInput.trim(),descInput.trim()||urlInput.trim());}} disabled={!urlInput.trim()} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:5,background:urlInput.trim()?"linear-gradient(135deg,#6366f1,#4f46e5)":"rgba(99,102,241,0.12)",border:"none",borderRadius:7,padding:"8px",color:"white",fontSize:9,fontFamily:"monospace",fontWeight:700,cursor:urlInput.trim()?"pointer":"default"}}>
                  <Zap size={10}/> Run Live Analysis
                </button>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          <div style={{padding:"7px 10px",borderTop:"1px solid rgba(255,255,255,0.04)",flexShrink:0}}>
            <div style={{display:"flex",gap:5}}>
              <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} disabled={busy||phase==="analyzing"} placeholder={phase==="collecting"?"Describe your business...":"Ask anything or paste your URL..."} style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:7,padding:"6px 9px",fontSize:10,color:"rgba(255,255,255,0.75)",outline:"none",fontFamily:"inherit"}}/>
              <button onClick={handleSend} disabled={busy||!input.trim()||phase==="analyzing"} style={{width:30,height:30,background:busy||!input.trim()?"rgba(99,102,241,0.1)":"linear-gradient(135deg,#6366f1,#4f46e5)",border:"none",borderRadius:7,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {busy?<Loader2 size={10} style={{color:"rgba(255,255,255,0.4)",animation:"spin 1s linear infinite"}}/>:<Send size={10} style={{color:"white"}}/>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Modal */}
      {showCta&&(
        <div style={{position:"fixed",inset:0,background:"rgba(3,7,18,0.94)",backdropFilter:"blur(12px)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{maxWidth:480,width:"100%",background:"rgba(10,12,28,0.97)",border:"1px solid rgba(99,102,241,0.28)",borderRadius:18,padding:"28px",position:"relative",textAlign:"center"}}>
            <button onClick={()=>setShowCta(false)} style={{position:"absolute",top:12,right:12,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.25)"}}><X size={14}/></button>
            <Brain size={36} style={{color:"#a5b4fc",filter:"drop-shadow(0 0 14px rgba(99,102,241,0.8))",marginBottom:14}}/>
            <h2 style={{fontSize:20,fontWeight:900,color:"white",margin:"0 0 8px"}}><span style={{background:"linear-gradient(135deg,#6366f1,#a78bfa,#67e8f9)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Start your free project today.</span></h2>
            <p style={{fontSize:11,color:"rgba(255,255,255,0.4)",maxWidth:360,margin:"0 auto 20px",lineHeight:1.7}}>Everything from this demo — strategy canvas, live metrics, algorithm tracking, automated audits — ready for your real project immediately.</p>
            <button onClick={()=>navigate("/")} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:"linear-gradient(135deg,#6366f1,#4f46e5)",border:"none",borderRadius:10,padding:"12px",color:"white",fontSize:11,fontFamily:"monospace",fontWeight:900,cursor:"pointer",boxShadow:"0 0 22px rgba(99,102,241,0.5)",marginBottom:8}}>
              <Sparkles size={13}/> GET STARTED FREE <ArrowRight size={12}/>
            </button>
            <div style={{display:"flex",justifyContent:"center",gap:14}}>
              {["No credit card","Full access","Cancel any time"].map((t,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:3,fontSize:9,color:"rgba(255,255,255,0.28)"}}><CheckCircle size={8} style={{color:"#10b981"}}/>{t}</div>)}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes brainP{0%,100%{filter:drop-shadow(0 0 20px rgba(99,102,241,0.7));}50%{filter:drop-shadow(0 0 35px rgba(99,102,241,0.9));}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes dotP{0%,60%,100%{transform:scale(1);opacity:0.4;}30%{transform:scale(1.6);opacity:1;}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
      `}</style>
    </div>
  );
}
