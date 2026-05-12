/**
 * GuestTour.tsx — Public route at /tour
 * Full-screen demo experience guided by Manav Brain.
 * Reads demo industry from localStorage, generates personalised demo project.
 * Navigates through pixel-perfect simulations of all 7 system pages.
 * Brain uses Claude API for live responses to visitor questions.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Send, ChevronRight, ChevronLeft, ArrowRight, X,
  Target, BarChart3, Database, Cpu, Shield, BookOpen, Zap,
  CheckCircle, AlertCircle, TrendingUp, Globe, Sparkles,
  Lock, Star, Layers, FileText,
} from 'lucide-react';
import { DEMO_INDUSTRIES, detectIndustry, type DemoProject } from '@/contexts/DemoContext';

/* ── Tour sections metadata ── */
const SECTIONS = [
  { id:'playground',     label:'Strategy Canvas',    icon:Target,    color:'#4ade80' },
  { id:'dashboard',      label:'Live Metrics',       icon:BarChart3, color:'#a78bfa' },
  { id:'data-room',      label:'Data Room',          icon:Database,  color:'#06b6d4' },
  { id:'algorithm-intel',label:'Algorithm Intel',    icon:Cpu,       color:'#f59e0b' },
  { id:'audit',          label:'SEO Audit',          icon:Shield,    color:'#ef4444' },
  { id:'brain-learning', label:'Brain Learning',     icon:BookOpen,  color:'#10b981' },
];

/* ── Pre-scripted narrations ── */
const NARRATION = {
  playground: (d:DemoProject) =>
    `This is the Strategy Canvas — the command centre for ${d.name}.\n\nI've already built ${d.canvas.length} tasks specifically for your ${d.tagline.toLowerCase()}. The green cards are Quick Wins — things that will move your rankings in 7–14 days without heavy lifting. Blue cards are technical fixes that compound over time. Yellow cards are content opportunities that build long-term authority.\n\nEverything is organised by week so there's never a question of "what should I work on today?" — the answer is always clear. Nothing falls through the cracks.`,

  dashboard: (d:DemoProject) =>
    `This is your live command centre. Right now I'm tracking 4 critical scores for ${d.name}.\n\nYour LLM Visibility is ${d.llm}/100 — that measures how often ChatGPT, Perplexity and Gemini cite your brand when someone asks a relevant question. This is the new SEO battleground and most businesses have zero visibility into it.\n\nAlgorithm Health: ${d.health}/100. E-E-A-T score: ${d.eeat}/100. Domain Authority: ${d.authority}/100. I track all of these automatically and tell you exactly what to do when any of them drops.\n\nYour organic traffic is ${d.organic.toLocaleString()} monthly visits and trending up. I built your traffic projection based on completing the strategy canvas I showed you.`,

  'data-room': (d:DemoProject) =>
    `Everything I know about ${d.name} lives here — and it grows every time we work together.\n\nI've loaded your top competitors: ${d.competitor1} and ${d.competitor2}. I've analysed their content strategy, found the 23 topics they rank for that you don't yet, and turned those gaps into canvas tasks.\n\nYour 5 target keywords are tracked and their positions update weekly. I've also stored your technical baseline, content inventory, and backlink profile.\n\nThe richer this becomes, the more precise every strategy I generate. Most SEO failures happen because there's no single source of truth. This is yours.`,

  'algorithm-intel': (d:DemoProject) =>
    `This is something no other SEO platform does.\n\nI track every Google Core Update, every ChatGPT Search signal shift, every Perplexity ranking change — and I tell you specifically, in plain English, how it affects ${d.name}.\n\n${d.algo_impact}\n\nMost businesses find out about algorithm impact months later, through lost rankings, when it's already too late. With this, you know within days — and you already have a plan in your canvas before the traffic drops.`,

  audit: (d:DemoProject) =>
    `I just ran a full technical and content audit of ${d.domain}.\n\nFound ${d.audits.length} priority issues across technical SEO, content quality, structured data, and Core Web Vitals.\n\n${d.audits.slice(0,2).map((a,i)=>(i+1)+'. ['+a.severity.toUpperCase()+'] '+a.issue).join('\n')}\n\nHere's what makes this different from other audit tools: every single issue is automatically converted into a canvas task with the specific fix. Not "improve your content" — the exact change, why it matters, and what ranking improvement to expect.\n\nRun this any time. Weekly audits catch problems before they become ranking drops.`,

  'brain-learning': (d:DemoProject) =>
    `Every operation I perform leaves a trace.\n\nEvery task I execute, every audit I run, every strategy I generate — I extract the specific insight that worked, why it worked, and how to replicate it. These learnings build automatically and make every future recommendation sharper.\n\nRight now I have ${d.learnings.length} captured learnings for ${d.name}. One of them: "${d.learnings[0].title}" — applied ${d.learnings[0].applied} times and showing ${d.learnings[0].confidence}% confidence.\n\nAfter 90 days working with a project, I know its SEO landscape better than any consultant you've ever hired. Because I never forget, never lose context, and I'm working on it constantly.`,
};

/* ── Score ring component ── */
function Ring({score,label,color}:{score:number;label:string;color:string}) {
  const r=18, c=2*Math.PI*r;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
      <div style={{position:'relative',width:46,height:46}}>
        <svg viewBox="0 0 44 44" style={{width:46,height:46,transform:'rotate(-90deg)'}}>
          <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"/>
          <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c*(1-score/100)} style={{filter:'drop-shadow(0 0 4px '+color+')'}}/>
        </svg>
        <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900,color:'white'}}>{score}</span>
      </div>
      <span style={{fontSize:8,color:'rgba(255,255,255,0.38)',textAlign:'center',lineHeight:1.3,maxWidth:60}}>{label}</span>
    </div>
  );
}

/* ── Page simulation components ── */
function PagePlayground({data}:{data:DemoProject}) {
  const weeks=[1,2,3];
  const typeColor:Record<string,string>={
    'quick-win':'#4ade80','technical':'#06b6d4','content':'#facc15',
    'geo':'#6366f1','competitive':'#fb923c'
  };
  return (
    <div style={{height:'100%',overflow:'auto',padding:'14px 16px',background:'#070a14'}}>
      <div style={{display:'flex',gap:5,marginBottom:12,flexWrap:'wrap'}}>
        {Object.entries(typeColor).map(([t,c])=>(
          <span key={t} style={{fontSize:8,fontFamily:'monospace',padding:'2px 8px',borderRadius:10,background:c+'18',border:'1px solid '+c+'30',color:c}}>{t}</span>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
        {weeks.map(w=>(
          <div key={w}>
            <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.25)',marginBottom:7,letterSpacing:'0.08em',display:'flex',alignItems:'center',gap:6}}>
              <span style={{background:'rgba(99,102,241,0.15)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:4,padding:'1px 7px'}}>WEEK {w}</span>
              <span style={{color:'rgba(255,255,255,0.15)'}}>{data.canvas.filter(c=>c.week===w).length} tasks</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:5}}>
              {data.canvas.filter(c=>c.week===w).map((card,i)=>(
                <div key={i} style={{background:'rgba(255,255,255,0.025)',border:'1px solid '+(typeColor[card.type]||'#6366f1')+'28',borderRadius:8,padding:'8px 10px',borderLeft:'3px solid '+(typeColor[card.type]||'#6366f1')}}>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.7)',lineHeight:1.35,marginBottom:4}}>{card.title}</div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:8,fontFamily:'monospace',color:typeColor[card.type]||'#6366f1'}}>{card.type}</span>
                    <span style={{fontSize:8,fontFamily:'monospace',color:card.status==='done'?'#10b981':card.status==='in_progress'?'#f59e0b':'rgba(255,255,255,0.2)'}}>{card.status==='done'?'Done':card.status==='in_progress'?'Active':'Queued'}</span>
                  </div>
                  <div style={{fontSize:7,color:'rgba(255,255,255,0.2)',marginTop:3}}>{card.effort} effort · {card.impact}</div>
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
  const pts=data.traffic_trend.map((v,i)=>({x:i,y:v}));
  const maxV=Math.max(...data.traffic_trend);
  return (
    <div style={{height:'100%',overflow:'auto',padding:'14px 16px',background:'#070a14',display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
        <Ring score={data.llm}       label="LLM Visibility"   color="#a78bfa"/>
        <Ring score={data.health}    label="Algorithm Health" color="#10b981"/>
        <Ring score={data.eeat}      label="E-E-A-T Score"    color="#f59e0b"/>
        <Ring score={data.authority} label="Domain Authority" color="#06b6d4"/>
      </div>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'12px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
          <div><span style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.3)'}}>ORGANIC TRAFFIC</span></div>
          <span style={{fontSize:9,color:'#4ade80',fontFamily:'monospace'}}>+14% this month</span>
        </div>
        <div style={{fontSize:26,fontWeight:900,color:'white',marginBottom:8}}>{data.organic.toLocaleString()}</div>
        {/* Mini sparkline */}
        <svg viewBox={"0 0 200 40"} style={{width:'100%',height:40}}>
          <polyline fill="none" stroke="#6366f1" strokeWidth="2"
            points={pts.map((p,i)=>`${(i/(pts.length-1))*200},${40-(p.y/maxV)*36}`).join(' ')}
            style={{filter:'drop-shadow(0 0 4px rgba(99,102,241,0.6))'}}/>
          <polyline fill="url(#tg)" strokeWidth="0"
            points={['0,40',...pts.map((p,i)=>`${(i/(pts.length-1))*200},${40-(p.y/maxV)*36}`),'200,40'].join(' ')}/>
          <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0"/></linearGradient></defs>
        </svg>
      </div>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'10px 12px'}}>
        <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.3)',marginBottom:8}}>KEYWORD RANKINGS</div>
        {data.keywords.slice(0,4).map((kw,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            <span style={{fontSize:10,color:'rgba(255,255,255,0.6)'}}>{kw}</span>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{height:4,width:40,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                <div style={{height:'100%',width:[85,72,45,20][i]+'%',background:i<2?'#4ade80':'#f59e0b',borderRadius:2}}/>
              </div>
              <span style={{fontSize:9,fontFamily:'monospace',color:i<2?'#4ade80':'#f59e0b',minWidth:20,textAlign:'right'}}>#{[3,7,14,28][i]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageDataRoom({data}:{data:DemoProject}) {
  const sections=[
    {label:'Keywords & Rankings', count:data.keywords.length+' tracked',     icon:'🎯',color:'#a78bfa'},
    {label:'Competitor Analysis',  count:'2 profiles loaded',                icon:'⚔️', color:'#06b6d4'},
    {label:'Organic Analytics',    count:data.organic.toLocaleString()+'/mo',icon:'📊', color:'#10b981'},
    {label:'Technical Baseline',   count:'Audited',                          icon:'⚙️', color:'#f59e0b'},
    {label:'Content Inventory',    count:'Strategy mapped',                  icon:'📝', color:'#facc15'},
    {label:'GEO Optimisation',     count:'In progress',                      icon:'🤖', color:'#6366f1'},
  ];
  return (
    <div style={{height:'100%',overflow:'auto',padding:'14px 16px',background:'#070a14',display:'flex',flexDirection:'column',gap:7}}>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'10px 14px',marginBottom:4}}>
        <div style={{fontSize:12,fontWeight:700,color:'white',marginBottom:3}}>{data.name}<span style={{fontSize:9,color:'rgba(255,255,255,0.35)',fontWeight:400,marginLeft:8}}>— {data.tagline}</span></div>
        <div style={{display:'flex',gap:12}}>
          <span style={{fontSize:9,color:'rgba(165,180,252,0.6)',fontFamily:'monospace'}}>{data.domain}</span>
          <span style={{fontSize:9,color:'rgba(255,255,255,0.25)',fontFamily:'monospace'}}>vs {data.competitor1}</span>
          <span style={{fontSize:9,color:'rgba(255,255,255,0.25)',fontFamily:'monospace'}}>vs {data.competitor2}</span>
        </div>
      </div>
      {sections.map((s,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:8,padding:'8px 12px'}}>
          <span style={{fontSize:14}}>{s.icon}</span>
          <span style={{fontSize:10,color:'rgba(255,255,255,0.6)',flex:1}}>{s.label}</span>
          <span style={{fontSize:9,fontFamily:'monospace',color:s.color}}>{s.count}</span>
          <CheckCircle size={10} style={{color:'#10b981',flexShrink:0}}/>
        </div>
      ))}
      <div style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.15)',borderRadius:8,padding:'8px 12px',marginTop:4}}>
        <div style={{fontSize:9,color:'rgba(165,180,252,0.6)',fontFamily:'monospace',marginBottom:3}}>CONTENT GAP ANALYSIS</div>
        <div style={{fontSize:10,color:'rgba(255,255,255,0.5)'}}>23 topics {data.competitor1} ranks for that {data.name} does not yet. All converted to canvas tasks.</div>
      </div>
    </div>
  );
}

function PageAlgorithmIntel({data}:{data:DemoProject}) {
  const updates=[
    {name:'March 2025 Core Update',    engines:'Google',     impact:'HIGH',  color:'#ef4444',date:'Mar 2025',detail:'Thin content and low E-E-A-T hit hardest. '+data.name+' affected.'},
    {name:'Helpful Content System v4', engines:'Google',     impact:'HIGH',  color:'#ef4444',date:'Jan 2025',detail:'E-E-A-T signals weighted more heavily than ever.'},
    {name:'ChatGPT Search Algorithm',  engines:'ChatGPT',    impact:'NEW',   color:'#a78bfa',date:'Dec 2024',detail:'Citation authority and expertise signals introduced.'},
    {name:'Perplexity Pro Ranking',    engines:'Perplexity', impact:'MED',   color:'#f59e0b',date:'Nov 2024',detail:'Source credibility and recency weighted higher.'},
    {name:'Link Spam Update 2024',     engines:'Google',     impact:'MED',   color:'#f59e0b',date:'Oct 2024',detail:'Unnatural link patterns detected and penalised.'},
  ];
  return (
    <div style={{height:'100%',overflow:'auto',padding:'14px 16px',background:'#070a14',display:'flex',flexDirection:'column',gap:8}}>
      <div style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:10,padding:'10px 14px',marginBottom:4}}>
        <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.7)',marginBottom:6}}>MONITORING 4 ENGINES · 47 SIGNALS · LIVE</div>
        <div style={{display:'flex',gap:6}}>
          {['Google','ChatGPT','Perplexity','Bing','Gemini'].map((e,i)=>(
            <span key={i} style={{fontSize:8,fontFamily:'monospace',padding:'2px 8px',borderRadius:8,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.45)'}}>{e}</span>
          ))}
        </div>
      </div>
      {updates.map((u,i)=>(
        <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:8,padding:'10px 12px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
            <div>
              <span style={{fontSize:10,color:'rgba(255,255,255,0.75)',fontWeight:600}}>{u.name}</span>
              <span style={{fontSize:8,color:'rgba(255,255,255,0.25)',marginLeft:8,fontFamily:'monospace'}}>{u.engines}</span>
            </div>
            <div style={{display:'flex',gap:5,alignItems:'center'}}>
              <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.2)'}}>{u.date}</span>
              <span style={{fontSize:8,fontFamily:'monospace',color:u.color,background:u.color+'18',padding:'1px 6px',borderRadius:4}}>{u.impact}</span>
            </div>
          </div>
          <div style={{fontSize:9,color:'rgba(255,255,255,0.38)',lineHeight:1.4}}>{u.detail}</div>
        </div>
      ))}
    </div>
  );
}

function PageAudit({data}:{data:DemoProject}) {
  const sevColor:Record<string,string>={critical:'#ef4444',high:'#f59e0b',medium:'#6366f1',low:'#10b981'};
  return (
    <div style={{height:'100%',overflow:'auto',padding:'14px 16px',background:'#070a14',display:'flex',flexDirection:'column',gap:8}}>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'12px 14px'}}>
        <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.3)',marginBottom:8}}>AUDIT COMPLETE · {data.domain}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:6}}>
          {[{n:data.audits.filter(a=>a.severity==='critical').length,l:'Critical',c:'#ef4444'},{n:data.audits.filter(a=>a.severity==='high').length,l:'High',c:'#f59e0b'},{n:94,l:'Passed',c:'#10b981'},{n:3,l:'Warnings',c:'#6366f1'}].map((s,i)=>(
            <div key={i} style={{textAlign:'center'}}>
              <div style={{fontSize:20,fontWeight:900,color:s.c}}>{s.n}</div>
              <div style={{fontSize:8,color:'rgba(255,255,255,0.3)'}}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
      {data.audits.map((a,i)=>(
        <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid '+sevColor[a.severity]+'25',borderRadius:8,padding:'9px 12px',display:'flex',gap:9,alignItems:'flex-start'}}>
          <AlertCircle size={12} style={{color:sevColor[a.severity],flexShrink:0,marginTop:1}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.7)',lineHeight:1.4,marginBottom:3}}>{a.issue}</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:8,fontFamily:'monospace',color:sevColor[a.severity],background:sevColor[a.severity]+'15',padding:'1px 6px',borderRadius:3}}>{a.severity}</span>
              <span style={{fontSize:8,color:'rgba(255,255,255,0.3)'}}>Fix: {a.fix}</span>
            </div>
          </div>
        </div>
      ))}
      <div style={{background:'rgba(16,185,129,0.05)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:8,padding:'8px 12px'}}>
        <div style={{fontSize:9,color:'rgba(52,211,153,0.8)',fontFamily:'monospace'}}>All {data.audits.length} issues automatically queued as canvas tasks with exact fixes</div>
      </div>
    </div>
  );
}

function PageBrainLearning({data}:{data:DemoProject}) {
  const typeColor:Record<string,string>={technical:'#06b6d4',content:'#facc15',geo:'#6366f1','quick-win':'#4ade80'};
  return (
    <div style={{height:'100%',overflow:'auto',padding:'14px 16px',background:'#070a14',display:'flex',flexDirection:'column',gap:8}}>
      <div style={{background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:10,padding:'10px 14px',marginBottom:4}}>
        <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.7)',marginBottom:2}}>{data.learnings.length} ACTIVE LEARNINGS · AUTO-CAPTURED · ALWAYS IMPROVING</div>
        <div style={{fontSize:10,color:'rgba(255,255,255,0.4)'}}>Every operation Manav Brain performs generates a permanent learning for {data.name}</div>
      </div>
      {data.learnings.map((l,i)=>(
        <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:8,padding:'10px 12px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
            <span style={{fontSize:8,fontFamily:'monospace',color:typeColor[l.type]||'#6366f1',background:(typeColor[l.type]||'#6366f1')+'18',padding:'1px 6px',borderRadius:4}}>{l.type.toUpperCase()}</span>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <span style={{fontSize:8,color:'rgba(255,255,255,0.25)',fontFamily:'monospace'}}>Applied {l.applied}x</span>
              <span style={{fontSize:8,color:'#10b981',fontFamily:'monospace'}}>{l.confidence}% conf.</span>
            </div>
          </div>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.75)',fontWeight:600,marginBottom:4}}>{l.title}</div>
          <div style={{fontSize:9,color:'rgba(255,255,255,0.38)',lineHeight:1.5}}>{l.insight}</div>
        </div>
      ))}
      <div style={{background:'rgba(16,185,129,0.04)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:8,padding:'8px 12px',marginTop:4}}>
        <div style={{fontSize:9,color:'rgba(52,211,153,0.65)',fontFamily:'monospace',marginBottom:2}}>HOW THIS GROWS</div>
        <div style={{fontSize:9,color:'rgba(255,255,255,0.35)',lineHeight:1.5}}>After 90 days, Manav Brain knows {data.name} better than any SEO consultant. Because it never forgets and never stops learning.</div>
      </div>
    </div>
  );
}

const PAGE_COMPONENTS: Record<string, (d:DemoProject)=>React.ReactNode> = {
  'playground':      d=><PagePlayground data={d}/>,
  'dashboard':       d=><PageDashboard data={d}/>,
  'data-room':       d=><PageDataRoom data={d}/>,
  'algorithm-intel': d=><PageAlgorithmIntel data={d}/>,
  'audit':           d=><PageAudit data={d}/>,
  'brain-learning':  d=><PageBrainLearning data={d}/>,
};

/* ── Main component ── */
export default function GuestTour() {
  const navigate  = useNavigate();
  const [step,     setStep]     = useState(0);
  const [data,     setData]     = useState<DemoProject|null>(null);
  const [asking,   setAsking]   = useState(false);
  const [narration,setNarration]= useState('');
  const [narDone,  setNarDone]  = useState(false);
  const [msgs,     setMsgs]     = useState<{role:'brain'|'user';text:string}[]>([]);
  const [input,    setInput]    = useState('');
  const [streaming,setStreaming]= useState(false);
  const [showCta,  setShowCta]  = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const narRef    = useRef<ReturnType<typeof setInterval>|null>(null);

  /* Load demo data */
  useEffect(()=>{
    const ind = localStorage.getItem('seo_demo_industry') || 'saas';
    const d   = DEMO_INDUSTRIES[ind] || DEMO_INDUSTRIES['saas'];
    setData(d);
    setTimeout(()=>typeNarration(NARRATION['playground'](d)), 600);
  },[]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[msgs]);

  const typeNarration = useCallback((text:string)=>{
    setNarDone(false); setNarration('');
    if(narRef.current) clearInterval(narRef.current);
    let i=0;
    narRef.current = setInterval(()=>{
      i++;
      setNarration(text.slice(0,i));
      if(i>=text.length){clearInterval(narRef.current!);setNarDone(true);}
    },16);
  },[]);

  const goToStep = useCallback((idx:number)=>{
    if(!data) return;
    setStep(idx); setNarDone(false); setNarration('');
    const sid = SECTIONS[idx].id;
    const fn  = NARRATION[sid as keyof typeof NARRATION];
    if(fn) setTimeout(()=>typeNarration(fn(data)), 300);
  },[data,typeNarration]);

  /* Stream a brain response */
  const streamReply = useCallback(async(userText:string)=>{
    if(!data) return;
    setStreaming(true);
    setMsgs(m=>[...m,{role:'brain',text:''}]);
    const sys = `You are Manav Brain, the AI engine of SEO Season — a professional AI-powered SEO management platform.
You are giving a live tour to a potential customer. Their demo project is: ${data.name} (${data.tagline}, ${data.domain}).
Current tour section: ${SECTIONS[step].label}.
SEO Season has: Strategy Canvas (task cards by week), Live Metrics Dashboard (LLM visibility, algorithm health, E-E-A-T, authority), Data Room (competitors, keywords, knowledge), Algorithm Intel (tracks Google/ChatGPT/Perplexity updates), Automated Audit (converts issues to tasks), Brain Learning (auto-captures learnings from every operation).
Be an expert SEO consultant. Be enthusiastic, specific, and show genuine insight about their industry and situation.
Keep responses under 4 sentences. Reference specific features and data from their demo project where relevant.`;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:350,stream:true,system:sys,messages:[{role:'user',content:userText}]})});
      if(!res.body) throw new Error('no body');
      const reader=res.body.getReader(); const dec=new TextDecoder(); let full='';
      while(true){
        const{done,value}=await reader.read(); if(done) break;
        const lines=dec.decode(value).split('\n').filter(l=>l.startsWith('data: '));
        for(const line of lines){
          try{const d=JSON.parse(line.slice(6));if(d.type==='content_block_delta'&&d.delta?.text){full+=d.delta.text;setMsgs(m=>{const cp=[...m];cp[cp.length-1]={role:'brain',text:full};return cp;});}}catch(_e){}
        }
      }
    } catch(_e) {
      setMsgs(m=>{const cp=[...m];cp[cp.length-1]={role:'brain',text:"Great question! The system handles this automatically as part of your strategy canvas. Want me to show you another section of the platform?"};return cp;});
    }
    setStreaming(false);
  },[data,step]);

  const handleSend=useCallback(()=>{
    const val=input.trim(); if(!val||streaming) return;
    setInput('');
    setMsgs(m=>[...m,{role:'user',text:val}]);
    streamReply(val);
  },[input,streaming,streamReply]);

  const handleKey=(e:React.KeyboardEvent)=>{if(e.key==='Enter')handleSend();};

  if(!data) return <div style={{minHeight:'100vh',background:'#030712',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{color:'rgba(255,255,255,0.3)',fontFamily:'monospace',fontSize:12}}>Initialising your demo...</div></div>;

  const sec = SECTIONS[step];

  return (
    <div style={{height:'100vh',background:'#030712',display:'flex',flexDirection:'column',overflow:'hidden',color:'white',fontFamily:'system-ui,sans-serif'}}>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 18px',background:'rgba(0,0,0,0.6)',borderBottom:'1px solid rgba(255,255,255,0.06)',backdropFilter:'blur(20px)',flexShrink:0,zIndex:20}}>
        <Brain size={18} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 6px rgba(99,102,241,0.7))' }}/>
        <span style={{fontSize:12,fontWeight:900,fontFamily:'monospace',color:'#e0e7ff',letterSpacing:'0.08em'}}>SEO SEASON</span>
        <div style={{height:14,width:1,background:'rgba(255,255,255,0.1)'}}/>
        <span style={{fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.6)',background:'rgba(99,102,241,0.1)',padding:'2px 8px',borderRadius:6,border:'1px solid rgba(99,102,241,0.2)'}}>GUIDED DEMO</span>
        <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.04)',borderRadius:6,padding:'2px 10px'}}>
          {data.name} — {data.tagline}
        </div>
        <div style={{flex:1}}/>
        {/* Progress bar */}
        <div style={{display:'flex',gap:5,alignItems:'center'}}>
          {SECTIONS.map((_,i)=>(
            <button key={i} onClick={()=>goToStep(i)} style={{width:i===step?20:8,height:8,borderRadius:4,background:i===step?'#6366f1':i<step?'rgba(99,102,241,0.4)':'rgba(255,255,255,0.1)',border:'none',cursor:'pointer',transition:'all 0.3s',padding:0}}/>
          ))}
          <span style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.3)',marginLeft:4}}>{step+1}/{SECTIONS.length}</span>
        </div>
        <button onClick={()=>navigate('/')} style={{display:'flex',alignItems:'center',gap:5,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:8,padding:'6px 14px',color:'white',fontSize:10,fontFamily:'monospace',fontWeight:700,cursor:'pointer'}}>
          <Lock size={10}/> Sign Up Free
        </button>
      </div>

      {/* Main 3-column layout */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'180px 1fr 360px',overflow:'hidden'}}>

        {/* Left nav */}
        <div style={{borderRight:'1px solid rgba(255,255,255,0.05)',overflow:'auto',background:'rgba(0,0,0,0.3)',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'12px 14px 6px',fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.1em'}}>PAGES</div>
          {SECTIONS.map((s,i)=>{
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <button key={i} onClick={()=>goToStep(i)} style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'9px 14px',background:active?'rgba(99,102,241,0.1)':'none',borderLeft:active?'2px solid #6366f1':'2px solid transparent',border:'none',cursor:'pointer',textAlign:'left',position:'relative'}}>
                <Icon size={11} style={{color:active?s.color:done?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.2)',flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:9,fontFamily:'monospace',color:active?'#e0e7ff':done?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.28)',fontWeight:active?700:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.label}</div>
                </div>
                {done && <CheckCircle size={9} style={{color:'#10b981',flexShrink:0}}/>}
              </button>
            );
          })}
          <div style={{padding:'14px',marginTop:'auto'}}>
            <button onClick={()=>setShowCta(true)} style={{width:'100%',background:'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(79,70,229,0.15))',border:'1px solid rgba(99,102,241,0.3)',borderRadius:8,padding:'8px 6px',color:'#a5b4fc',fontSize:9,fontFamily:'monospace',fontWeight:700,cursor:'pointer'}}>
              Get Started Free
            </button>
          </div>
        </div>

        {/* Centre: page simulation */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden',background:'#07091a'}}>
          {/* Browser chrome */}
          <div style={{display:'flex',alignItems:'center',gap:7,padding:'7px 12px',background:'rgba(0,0,0,0.4)',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0}}>
            <div style={{display:'flex',gap:5}}>
              {['#ef4444','#f59e0b','#10b981'].map((c,i)=><div key={i} style={{width:9,height:9,borderRadius:'50%',background:c+'50'}}/>)}
            </div>
            <div style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:6,padding:'3px 10px',display:'flex',alignItems:'center',gap:6}}>
              <Globe size={9} style={{color:'rgba(255,255,255,0.25)'}}/>
              <span style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.35)'}}>seoseason.app/{sec.id}?project={data.id}</span>
              <div style={{marginLeft:'auto',background:'rgba(16,185,129,0.15)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:4,padding:'0px 6px',fontSize:7,fontFamily:'monospace',color:'#34d399'}}>DEMO</div>
            </div>
            <div style={{display:'flex',gap:6}}>
              <ChevronLeft size={12} style={{color:'rgba(255,255,255,0.2)',cursor:'pointer'}} onClick={()=>step>0&&goToStep(step-1)}/>
              <ChevronRight size={12} style={{color:'rgba(255,255,255,0.2)',cursor:'pointer'}} onClick={()=>step<SECTIONS.length-1&&goToStep(step+1)}/>
            </div>
          </div>
          {/* Page content */}
          <div style={{flex:1,overflow:'hidden'}}>
            {PAGE_COMPONENTS[sec.id]?.(data)}
          </div>
        </div>

        {/* Right: Brain panel */}
        <div style={{borderLeft:'1px solid rgba(255,255,255,0.05)',display:'flex',flexDirection:'column',background:'rgba(3,5,15,0.8)'}}>
          {/* Brain header */}
          <div style={{padding:'11px 14px',borderBottom:'1px solid rgba(99,102,241,0.1)',display:'flex',alignItems:'center',gap:8,background:'rgba(0,0,0,0.35)',flexShrink:0}}>
            <div style={{position:'relative'}}>
              <Brain size={14} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 5px rgba(99,102,241,0.7))'}}/>
              <div style={{position:'absolute',top:-2,right:-2,width:5,height:5,borderRadius:'50%',background:'#10b981',border:'1px solid #030712'}}/>
            </div>
            <div>
              <div style={{fontSize:9,fontFamily:'monospace',color:'#e0e7ff',fontWeight:900,letterSpacing:'0.1em'}}>MANAV BRAIN</div>
              <div style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.2)'}}>Narrating your tour</div>
            </div>
            <div style={{marginLeft:'auto',display:'flex',gap:5,alignItems:'center'}}>
              <sec.icon size={10} style={{color:sec.color}}/>
              <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.3)'}}>{sec.label}</span>
            </div>
          </div>

          {/* Narration */}
          <div style={{flex:1,overflow:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:10}}>
            {/* Auto-narration bubble */}
            <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(6,182,212,0.1)',borderRadius:'4px 12px 12px 12px',padding:'11px 13px'}}>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.7)',lineHeight:1.75,margin:0,whiteSpace:'pre-wrap'}}>
                {narration}
                {!narDone && <span style={{animation:'blink2 0.8s step-end infinite',color:'#6366f1'}}>▋</span>}
              </p>
            </div>

            {/* Nav buttons when narration done */}
            {narDone && (
              <div style={{display:'flex',gap:6}}>
                {step > 0 && (
                  <button onClick={()=>goToStep(step-1)} style={{display:'flex',alignItems:'center',gap:4,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'6px 10px',color:'rgba(255,255,255,0.4)',fontSize:9,fontFamily:'monospace',cursor:'pointer'}}>
                    <ChevronLeft size={9}/> Back
                  </button>
                )}
                {step < SECTIONS.length-1 ? (
                  <button onClick={()=>goToStep(step+1)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:4,background:'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(79,70,229,0.12))',border:'1px solid rgba(99,102,241,0.3)',borderRadius:8,padding:'6px 10px',color:'#a5b4fc',fontSize:9,fontFamily:'monospace',cursor:'pointer',fontWeight:700}}>
                    Next: {SECTIONS[step+1].label} <ChevronRight size={9}/>
                  </button>
                ) : (
                  <button onClick={()=>setShowCta(true)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:4,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:8,padding:'7px',color:'white',fontSize:9,fontFamily:'monospace',cursor:'pointer',fontWeight:700,boxShadow:'0 0 14px rgba(99,102,241,0.4)'}}>
                    <Sparkles size={10}/> Get Started Free <ArrowRight size={9}/>
                  </button>
                )}
              </div>
            )}

            {/* Conversation history */}
            {msgs.length > 0 && (
              <div style={{display:'flex',flexDirection:'column',gap:7,marginTop:4}}>
                {msgs.map((m,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'flex-start',gap:6,justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                    {m.role==='brain'&&<div style={{width:18,height:18,borderRadius:'50%',background:'linear-gradient(135deg,#1e1b4b,#0a0f1e)',border:'1px solid rgba(99,102,241,0.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Brain size={8} style={{color:'#a5b4fc'}}/></div>}
                    <div style={{maxWidth:'88%',background:m.role==='user'?'rgba(99,102,241,0.12)':'rgba(255,255,255,0.02)',border:m.role==='user'?'1px solid rgba(99,102,241,0.2)':'1px solid rgba(6,182,212,0.07)',borderRadius:m.role==='user'?'10px 10px 2px 10px':'2px 10px 10px 10px',padding:'7px 10px'}}>
                      <p style={{fontSize:10,color:'rgba(255,255,255,0.68)',lineHeight:1.6,margin:0}}>{m.text}{m.role==='brain'&&i===msgs.length-1&&streaming&&<span style={{animation:'blink2 0.8s step-end infinite',color:'#6366f1',marginLeft:2}}>▋</span>}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick questions */}
            {narDone && !streaming && (
              <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:4}}>
                <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',marginBottom:2}}>ASK ME ANYTHING</div>
                {[
                  "How long before I see results?",
                  "How does this compare to other SEO tools?",
                  "What happens after I sign up?",
                ].map((q,i)=>(
                  <button key={i} onClick={()=>{setMsgs(m=>[...m,{role:'user',text:q}]);streamReply(q);}} style={{background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.14)',borderRadius:8,padding:'5px 9px',fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.65)',cursor:'pointer',textAlign:'left'}}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Chat input */}
          <div style={{padding:'8px 12px',borderTop:'1px solid rgba(255,255,255,0.05)',flexShrink:0}}>
            <div style={{display:'flex',gap:6}}>
              <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} disabled={streaming} placeholder="Ask me anything about your project..." style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'6px 10px',fontSize:10,color:'rgba(255,255,255,0.75)',outline:'none',fontFamily:'inherit'}}/>
              <button onClick={handleSend} disabled={streaming||!input.trim()} style={{width:30,height:30,background:streaming||!input.trim()?'rgba(99,102,241,0.1)':'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:7,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <Send size={11} style={{color:'white'}}/>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Modal */}
      {showCta && (
        <div style={{position:'fixed',inset:0,background:'rgba(3,7,18,0.92)',backdropFilter:'blur(12px)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{maxWidth:520,width:'100%',background:'rgba(10,12,28,0.95)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:20,padding:'36px',position:'relative',textAlign:'center',boxShadow:'0 0 80px rgba(99,102,241,0.15)'}}>
            <button onClick={()=>setShowCta(false)} style={{position:'absolute',top:14,right:14,background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.3)',display:'flex'}}><X size={16}/></button>
            <Brain size={44} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 16px rgba(99,102,241,0.8))',marginBottom:20}}/>
            <h2 style={{fontSize:26,fontWeight:900,color:'white',margin:'0 0 10px',lineHeight:1.2}}>
              {data.name} deserves<br/>
              <span style={{background:'linear-gradient(135deg,#6366f1,#a78bfa,#67e8f9)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>this system.</span>
            </h2>
            <p style={{fontSize:13,color:'rgba(255,255,255,0.45)',maxWidth:420,margin:'0 auto 28px',lineHeight:1.7}}>
              Everything you just saw — the strategy canvas, live metrics, algorithm tracking, automated audits — is ready for your real project the moment you sign up. No setup. No waiting.
            </p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:24}}>
              {[{e:'🎯',t:'Strategy Canvas',n:'Pre-built for your industry'},{e:'📊',t:'Live Metrics',n:'Updated automatically'},{e:'🧠',t:'Manav Brain',n:'Working for you 24/7'},{e:'⚡',t:'Algorithm Alerts',n:'Instant when things change'}].map((f,i)=>(
                <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'12px'}}>
                  <div style={{fontSize:18,marginBottom:4}}>{f.e}</div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.7)',fontWeight:600}}>{f.t}</div>
                  <div style={{fontSize:8,color:'rgba(255,255,255,0.3)',marginTop:2}}>{f.n}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>navigate('/')} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:12,padding:'14px',color:'white',fontSize:13,fontFamily:'monospace',fontWeight:900,cursor:'pointer',boxShadow:'0 0 30px rgba(99,102,241,0.5)',marginBottom:10}}>
              <Sparkles size={15}/> START FREE — NO CREDIT CARD <ArrowRight size={14}/>
            </button>
            <div style={{display:'flex',justifyContent:'center',gap:20}}>
              {['No credit card','Full access immediately','Cancel any time'].map((t,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'rgba(255,255,255,0.3)'}}>
                  <CheckCircle size={9} style={{color:'#10b981'}}/>{t}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink2{0%,100%{opacity:1;}50%{opacity:0;}}
      `}</style>
    </div>
  );
}
