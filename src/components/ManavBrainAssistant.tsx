/**
 * ManavBrainAssistant.tsx — Complete clean rewrite v4
 * Written in Python to avoid shell heredoc truncation.
 * Zero patches. Compiles first time.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth }  from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  Brain, Send, X, Zap, Globe, Target, Shield, FileText,
  CheckCircle, AlertCircle, Loader2, Cpu, RefreshCw,
  Radio, Database, Minimize2, Maximize2, Layers,
} from 'lucide-react';

/* ── Types ── */
type MsgRole = 'user' | 'brain' | 'system' | 'alert';
type ErrType = 'js_error' | 'react_error' | 'api_error' | 'network_error' | 'promise_rejection' | 'console_error';
type Health  = 'healthy' | 'degraded' | 'critical' | 'scanning' | 'healing';
type TabId   = 'chat' | 'system' | 'log';

interface BrainMsg {
  id: string; role: MsgRole; content: string;
  actions?: ParsedAction[]; results?: ActionResult[];
  ts: Date; truncated?: boolean;
}
interface ParsedAction {
  type: string; label: string;
  path?: string; url?: string; mode?: string;
  topicId?: string; topicLabel?: string;
  cardType?: string; title?: string; content?: string;
  priority?: string; week?: number; query?: string;
  contentType?: string; metadata?: any; tags?: string[];
  sections?: any[]; chartType?: string; data?: any[];
  dataKey?: string; cardId?: string; role?: string;
  [key: string]: any;
}
interface ActionResult { action: ParsedAction; status: 'running' | 'done' | 'error'; result: string; }
interface SysError {
  id: string; type: ErrType; message: string;
  stack?: string; url?: string; status?: number; body?: string;
  page: string; ts: Date; healed: boolean; healNote: string;
}
interface Reminder { id: string; text: string; }

/* ── Constants ── */
const REAL_ERR = ['Uncaught Error','TypeError','ReferenceError','Cannot read properties','is not a function','is not defined','Cannot set','Unexpected token','Failed to fetch','NetworkError','SyntaxError: Unexpected'];
const IGNORE   = ['Warning:','Each child in a list','validateDOMNesting','ReactDOM.render','React.createElement','key prop','findDOMNode','Non-boolean attribute','ResizeObserver loop','Script error.','favicon','google-analytics','The play() request was interrupted','%c %s','React DevTools','contentEditable','Cannot update a component','A component is changing'];

const PAGE_SUGGESTIONS: Record<string,string[]> = {
  '/playground':     ["What should I tackle first this week?","Which card will move the needle most?","Show me everything on my canvas"],
  '/dashboard':      ["How are my metrics trending?","What is the biggest opportunity right now?","What should I focus on this week?"],
  '/data-room':      ["What context am I missing?","What keywords should I be targeting?","Analyse my competitors"],
  '/audit':          ["Run a full audit of my site","What are my biggest technical issues?","Check my Core Web Vitals"],
  '/algorithm-intel':["What algorithm updates affect my site?","How does the March 2025 core update impact me?","What E-E-A-T signals am I missing?"],
  '/brain-learning': ["What has worked best for my project?","Show me my top learnings","Apply a learning to a new canvas card"],
  '/desk':           ["Remind me of my most important saved items","Summarise everything on my desk","Create an action plan from my notes"],
};
const DEFAULT_SUGGESTIONS = [
  "What is the most important thing I should do right now?",
  "Give me a quick win I can do in the next 30 minutes",
  "Check my site for any urgent issues",
  "Help me write a task for the canvas",
];

const ACTION_ICONS: Record<string,any> = { navigate:Globe, run_audit:FileText, fetch_algorithm:Cpu, fetch_custom_algorithm:Cpu, add_card:Target, search_brain:Brain, default:Zap };
const HEALTH_CFG: Record<Health,{color:string;glow:string;label:string}> = {
  healthy: {color:'#10b981',glow:'rgba(16,185,129,0.4)',label:'ONLINE'},
  degraded:{color:'#f59e0b',glow:'rgba(245,158,11,0.4)',label:'NEEDS ATTENTION'},
  critical:{color:'#ef4444',glow:'rgba(239,68,68,0.5)', label:'ALERT'},
  scanning:{color:'#6366f1',glow:'rgba(99,102,241,0.4)',label:'SCANNING'},
  healing: {color:'#06b6d4',glow:'rgba(6,182,212,0.4)', label:'HEALING'},
};

/* ── Helpers ── */
let _n = 0;
const uid        = () => `m${++_n}_${Math.random().toString(36).slice(2,6)}`;
const noiseMsg   = (m:string) => !m || IGNORE.some(p=>m.includes(p));
const realErr    = (m:string) => !(!m||m.length<10||noiseMsg(m)) && REAL_ERR.some(p=>m.includes(p));
const parseActs  = (t:string):ParsedAction[] => { const re=/\u27E6ACTION\u27E7([\s\S]*?)\u27E6\/ACTION\u27E7/g,out:ParsedAction[]=[]; let m; while((m=re.exec(t))!==null){try{out.push(JSON.parse(m[1].trim()));}catch(_e){}} return out; };
const stripActs  = (t:string) => t.replace(/\u27E6ACTION\u27E7[\s\S]*?\u27E6\/ACTION\u27E7/g,'').replace(/\n{3,}/g,'\n\n').trim();
const timeAgo    = (d:Date) => { const s=Math.floor((Date.now()-d.getTime())/1000); if(s<60)return s+'s ago'; if(s<3600)return Math.floor(s/60)+'m ago'; return Math.floor(s/3600)+'h ago'; };

/* ── UI: Scanlines ── */
const Scanlines = () => (
  <div style={{position:'absolute',inset:0,pointerEvents:'none',borderRadius:'inherit',background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px)',zIndex:1}}/>
);

/* ── UI: ActionCard ── */
function ActionCard({result}:{result:ActionResult}) {
  const Icon  = ACTION_ICONS[result.action.type]||ACTION_ICONS.default;
  const color = result.status==='done'?'#10b981':result.status==='error'?'#ef4444':'#6366f1';
  return (
    <div style={{background:color+'09',border:'1px solid '+color+'22',borderRadius:8,padding:'6px 10px',marginTop:4}}>
      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:result.result?3:0}}>
        {result.status==='running'?<Loader2 size={9} style={{color,animation:'spin 1s linear infinite',flexShrink:0}}/>
         :result.status==='done'?<CheckCircle size={9} style={{color:'#10b981',flexShrink:0}}/>
         :<AlertCircle size={9} style={{color:'#ef4444',flexShrink:0}}/>}
        <span style={{fontSize:9,fontFamily:'monospace',color,fontWeight:700}}>{result.status==='running'?'EXECUTING: ':result.status==='done'?'DONE: ':'ERROR: '}{result.action.label}</span>
      </div>
      {result.result&&<p style={{fontSize:10,color:'rgba(255,255,255,0.38)',lineHeight:1.5,margin:'0 0 0 14px'}}>{result.result.slice(0,220)}{result.result.length>220?'...':''}</p>}
    </div>
  );
}

/* ── UI: MsgBubble ── */
function MsgBubble({msg,onAction,onSaveToDesk}:{msg:BrainMsg;onAction:(a:ParsedAction)=>void;onSaveToDesk?:()=>void}) {
  const isUser=msg.role==='user', isAlert=msg.role==='alert', isSys=msg.role==='system';
  if (isSys)   return <div style={{textAlign:'center',padding:'2px 0'}}><span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.15)',letterSpacing:'0.1em'}}>{msg.content}</span></div>;
  if (isAlert) return <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:9,padding:'7px 12px',display:'flex',alignItems:'center',gap:8}}><AlertCircle size={11} style={{color:'#ef4444',flexShrink:0}}/><span style={{fontSize:10,fontFamily:'monospace',color:'#fca5a5',fontWeight:700}}>{msg.content}</span></div>;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:isUser?'flex-end':'flex-start',gap:3}}>
      {!isUser&&<span style={{fontSize:7,fontFamily:'monospace',color:'rgba(99,102,241,0.45)',letterSpacing:'0.1em',paddingLeft:2}}>MANAV BRAIN</span>}
      <div style={{maxWidth:'90%',background:isUser?'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(79,70,229,0.12))':'rgba(255,255,255,0.03)',border:isUser?'1px solid rgba(99,102,241,0.22)':'1px solid rgba(6,182,212,0.09)',borderRadius:isUser?'14px 14px 4px 14px':'4px 14px 14px 14px',padding:'9px 13px'}}>
        <p style={{fontSize:12,color:isUser?'rgba(255,255,255,0.82)':'rgba(255,255,255,0.68)',lineHeight:1.6,margin:0,whiteSpace:'pre-wrap'}}>{msg.role==='brain'?stripActs(msg.content):msg.content}</p>
        {msg.actions&&msg.actions.length>0&&(
          <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:4}}>
            {msg.actions.map((a,i)=>{const Icon=ACTION_ICONS[a.type]||ACTION_ICONS.default;return(<button key={i} onClick={()=>onAction(a)} style={{display:'flex',alignItems:'center',gap:6,background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.17)',borderRadius:7,padding:'4px 9px',cursor:'pointer',textAlign:'left'}}><Icon size={9} style={{color:'#a5b4fc',flexShrink:0}}/><span style={{fontSize:9,fontFamily:'monospace',color:'#a5b4fc',fontWeight:600}}>{a.label}</span><Zap size={7} style={{color:'rgba(99,102,241,0.3)',marginLeft:'auto'}}/></button>);})}
          </div>
        )}
        {msg.results?.map((r,i)=><ActionCard key={i} result={r}/>)}
        {msg.role==='brain'&&stripActs(msg.content).length>150&&onSaveToDesk&&(
          <button onClick={onSaveToDesk} style={{marginTop:5,background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:5,padding:'3px 10px',fontSize:9,fontFamily:'monospace',color:'rgba(52,211,153,0.7)',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
            <FileText size={7}/> Save to Desk
          </button>
        )}
        {msg.truncated&&<p style={{fontSize:8,color:'rgba(251,191,36,0.5)',fontFamily:'monospace',margin:'4px 0 0'}}>Truncated — auto-continuing</p>}
      </div>
      <span style={{fontSize:7,color:'rgba(255,255,255,0.1)',paddingLeft:isUser?0:2,paddingRight:isUser?2:0}}>{msg.ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function ManavBrainAssistant() {
  const {projects,clients} = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [open,          setOpen]          = useState(false);
  const [expanded,      setExpanded]      = useState(false);
  const [tab,           setTab]           = useState<TabId>('chat');
  const [msgs,          setMsgs]          = useState<BrainMsg[]>([
    {id:uid(),role:'system',content:'MANAV BRAIN — ONLINE',ts:new Date()},
    {id:uid(),role:'brain', content:"Hey! I'm Manav Brain, your SEO partner.\n\nI'm always watching — I'll flag things that need your attention, remind you of saved notes, and help you figure out what to do next.\n\nSelect a project up top and I'll get you started.",ts:new Date()},
  ]);
  const [input,         setInput]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [selProj,       setSelProj]       = useState('');
  const [autoProj,      setAutoProj]      = useState(false);
  const [ctx,           setCtx]           = useState<any>(null);
  const [learnings,     setLearnings]     = useState<any[]>([]);
  const [algoItems,     setAlgoItems]     = useState<any[]>([]);
  const [canvasBlocks,  setCanvasBlocks]  = useState<any[]>([]);
  const [metrics,       setMetrics]       = useState<any>(null);
  const [deskItems,     setDeskItems]     = useState<any[]>([]);
  const [pending,       setPending]       = useState(0);
  const [reminders,     setReminders]     = useState<Reminder[]>([]);
  const [proactiveDone, setProactiveDone] = useState<Set<string>>(new Set());
  const [codeSnippet,   setCodeSnippet]   = useState('');
  const [showCode,      setShowCode]      = useState(false);
  const [attachments,   setAttachments]   = useState<{type:string;data:string;mediaType:string;name:string}[]>([]);
  const [isSearching,   setIsSearching]   = useState(false);
  const [inlineCharts,  setInlineCharts]  = useState<Record<string,any>>({});
  const [health,        setHealth]        = useState<Health>('healthy');
  const [sysErrors,     setSysErrors]     = useState<SysError[]>([]);
  const [apiStatus,     setApiStatus]     = useState<Record<string,'ok'|'error'|'checking'>>({});
  const [lastScan,      setLastScan]      = useState<Date|null>(null);
  const [alertCount,    setAlerts]        = useState(0);
  const [scanLine,      setScanLine]      = useState(false);
  const [schemaOk,      setSchemaOk]      = useState<boolean|null>(null);

  const bottomRef       = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLTextAreaElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const streamActive    = useRef(false);
  const healCooldown    = useRef(false);
  const errHandlerRef   = useRef<((d:any)=>void)|null>(null);
  const origFetchRef    = useRef<typeof fetch|null>(null);
  const lastPageRef     = useRef('');
  const lastActivityRef = useRef(Date.now());
  const greetingDoneRef = useRef(false);

  const panelW = expanded?700:440;
  const panelH = expanded?740:620;
  const hc     = HEALTH_CFG[health];

  /* brainFetch — bypasses monitoring override */
  const brainFetch = useCallback((...args:Parameters<typeof fetch>) => {
    const orig = origFetchRef.current;
    return orig ? orig(...args) : window.fetch(...args);
  },[]);

  /* readFileAsBase64 */
  const readFileAsBase64 = useCallback((file:File):Promise<{data:string;mediaType:string;name:string;type:string}> =>
    new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>{const b64=(r.result as string).split(',')[1];const mt=file.type||'application/octet-stream';resolve({data:b64,mediaType:mt,name:file.name,type:mt.startsWith('image/')?'image':'document'});};
      r.onerror=reject;r.readAsDataURL(file);
    }),[]);

  /* Auto-scroll */
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[msgs]);

  /* Auto-select project */
  useEffect(()=>{
    const s=localStorage.getItem('seo_season_proj');
    if(s){setSelProj(s);setAutoProj(true);return;}
    if(projects.length===1){setSelProj(projects[0].id);setAutoProj(true);}
  },[projects]);

  /* Cross-tab sync */
  useEffect(()=>{
    const fn=(e:StorageEvent)=>{if(e.key==='seo_season_proj'&&e.newValue&&e.newValue!==selProj){setSelProj(e.newValue);setAutoProj(true);}};
    window.addEventListener('storage',fn);return()=>window.removeEventListener('storage',fn);
  },[selProj]);

  /* Persist selection */
  useEffect(()=>{if(selProj)localStorage.setItem('seo_season_proj',selProj);},[selProj]);

  /* Load context on project change */
  useEffect(()=>{if(selProj)loadContext();},[selProj]); // eslint-disable-line

  /* Daily greeting */
  useEffect(()=>{
    if(greetingDoneRef.current||!selProj||projects.length===0)return;
    const today=new Date().toDateString();
    if(localStorage.getItem('brain_last_greeting')===today)return;
    greetingDoneRef.current=true;
    localStorage.setItem('brain_last_greeting',today);
    const h=new Date().getHours();
    const tod=h<12?'morning':h<17?'afternoon':'evening';
    const hi=h<12?'Good morning!':h<17?'Good afternoon!':'Good evening!';
    setTimeout(()=>{
      setOpen(true);setTab('chat');
      setMsgs(ms=>[...ms,{id:uid(),role:'brain' as MsgRole,content:hi+" I've been keeping an eye on things. Let me pull up what matters most right now...",ts:new Date()}]);
      setTimeout(()=>sendMsgInternal('Give me a concise '+tod+' briefing. 3-4 short bullets: most urgent thing today, what is looking good, one thing to do in the next hour. Be warm and direct.',true),800);
    },2500);
  },[selProj,projects]); // eslint-disable-line

  /* Page navigation intelligence */
  useEffect(()=>{
    const page=location.pathname;
    if(!selProj||page===lastPageRef.current||page==='/')return;
    lastPageRef.current=page;
    const key='brain_page_'+page+'_'+new Date().toDateString();
    if(proactiveDone.has(key))return;
    const canvasMsg=canvasBlocks.length>0?'Looking at your canvas. You have '+canvasBlocks.length+' cards. Want me to tell you which one to focus on first?':'Your canvas looks empty. Want me to suggest a starting strategy?';
    const metricsMsg=metrics?'Checking your dashboard. Your LLM score is '+(metrics.llm_visibility??'??')+'/100.':'No metrics yet. Want me to run an audit to fill this in?';
    const learningsMsg=learnings.length>0?'You have '+learnings.length+' active learnings. Want me to apply the best ones to your canvas?':'As we work together I will build up your learning library.';
    const deskMsg=deskItems.length>0?'Your desk has '+deskItems.length+' saved items. Want me to summarise the most important ones?':'Save anything useful here and I will remind you about it.';
    const map:Record<string,string>={
      '/playground':canvasMsg,
      '/dashboard':metricsMsg,
      '/data-room':'This is where your project knowledge lives. The more you fill in, the smarter my advice gets. Want help completing it?',
      '/audit':'Ready to run an audit. Drop your URL in and I will find everything that needs fixing.',
      '/algorithm-intel':'Let me check what algorithm updates matter for your site.',
      '/brain-learning':learningsMsg,
      '/desk':deskMsg,
    };
    const msg=map[page];
    if(!msg)return;
    setProactiveDone(s=>new Set([...s,key]));
    setTimeout(()=>setMsgs(ms=>[...ms,{id:uid(),role:'brain' as MsgRole,content:msg,ts:new Date()}]),1500);
  },[location.pathname,selProj]); // eslint-disable-line

  /* Desk reminders */
  useEffect(()=>{
    if(!selProj||deskItems.length===0)return;
    const now=Date.now();
    const due=deskItems.filter(item=>now-new Date(item.created_at).getTime()>2*24*60*60*1000&&!sessionStorage.getItem('reminded_'+item.id)).slice(0,2);
    if(!due.length)return;
    setReminders(due.map(item=>({id:item.id,text:Math.floor((now-new Date(item.created_at).getTime())/(24*60*60*1000))+' days ago you saved: "'+item.title+'"'})));
  },[deskItems,selProj]);

  /* Idle nudge */
  useEffect(()=>{
    const reset=()=>{lastActivityRef.current=Date.now();};
    window.addEventListener('mousemove',reset);window.addEventListener('keydown',reset);
    const check=setInterval(()=>{
      const idle=Date.now()-lastActivityRef.current;
      const key='idle_'+new Date().toDateString()+'_'+new Date().getHours();
      if(idle>15*60*1000&&!open&&selProj&&!sessionStorage.getItem(key)){
        sessionStorage.setItem(key,'1');
        setMsgs(ms=>[...ms,{id:uid(),role:'brain' as MsgRole,content:'Still here if you need me. What are you working on?',ts:new Date()}]);
      }
    },60*1000);
    return()=>{window.removeEventListener('mousemove',reset);window.removeEventListener('keydown',reset);clearInterval(check);};
  },[open,selProj]); // eslint-disable-line

  /* Smart context scan */
  useEffect(()=>{
    if(!selProj||!ctx)return;
    const insights:string[]=[];
    const met=ctx?.metrics||metrics;
    if(met?.created_at){const age=Math.floor((Date.now()-new Date(met.created_at).getTime())/(1000*60*60*24));if(age>10)insights.push('Your metrics are '+age+' days old — a fresh audit would help.');}
    if(!ctx?.project?.url)insights.push('Your site URL is not set. Add it in the Data Room so I can run audits.');
    const week1=canvasBlocks.filter((b:any)=>b.placed&&b.week===1&&b.status!=='done');
    if(week1.length>0)insights.push('Week 1 has '+week1.length+' task'+(week1.length>1?'s':'')+' still to go.');
    if(!insights.length)return;
    const key='scan_'+selProj+'_'+new Date().toDateString();
    if(sessionStorage.getItem(key))return;
    sessionStorage.setItem(key,'1');
    setTimeout(()=>setMsgs(ms=>[...ms,{id:uid(),role:'brain' as MsgRole,content:"Here's what I'm noticing:\n\n"+insights.map(i=>'• '+i).join('\n'),ts:new Date()}]),3000);
  },[selProj,ctx,metrics,canvasBlocks]); // eslint-disable-line

  /* Error interceptors — mount once */
  useEffect(()=>{
    const orig=window.fetch.bind(window);
    origFetchRef.current=orig;
    window.fetch=async function mf(...args:Parameters<typeof fetch>){
      let url='';
      try{url=typeof args[0]==='string'?args[0]:(args[0] instanceof Request?args[0].url:'');}catch(_e){/* ok */}
      try{
        const res=await orig(...args);
        if(url.includes('/api/')&&res.status>=500){
          let body='';try{body=(await res.clone().text()).slice(0,400);}catch(_e){/* ok */}
          window.dispatchEvent(new CustomEvent('manav-brain-error',{detail:{type:'api_error',url,status:res.status,message:'HTTP '+res.status+' from '+(url.split('/').pop()||url),body}}));
        }
        return res;
      }catch(err:any){
        if(url.includes('/api/'))window.dispatchEvent(new CustomEvent('manav-brain-error',{detail:{type:'network_error',url,message:err.message||'Network failed'}}));
        throw err;
      }
    };
    const onJS=(e:ErrorEvent)=>{if(!realErr(e.message))return;window.dispatchEvent(new CustomEvent('manav-brain-error',{detail:{type:'js_error',message:e.message,stack:e.error?.stack?.slice(0,600),url:e.filename}}));};
    const onRej=(e:PromiseRejectionEvent)=>{const m=e.reason?.message||String(e.reason);if(!realErr(m))return;window.dispatchEvent(new CustomEvent('manav-brain-error',{detail:{type:'promise_rejection',message:m,stack:e.reason?.stack?.slice(0,400)}}));};
    const origConsole=console.error.bind(console);
    console.error=(...a:any[])=>{origConsole(...a);const m=a.map(x=>typeof x==='string'?x:(x?.message||'')).join(' ');if(realErr(m)&&m.length>30)window.dispatchEvent(new CustomEvent('manav-brain-error',{detail:{type:'console_error',message:m.slice(0,300)}}));};
    const onEv=(e:Event)=>{errHandlerRef.current?.((e as CustomEvent).detail);};
    window.addEventListener('error',onJS);window.addEventListener('unhandledrejection',onRej);window.addEventListener('manav-brain-error',onEv);
    return()=>{if(origFetchRef.current)window.fetch=origFetchRef.current;window.removeEventListener('error',onJS);window.removeEventListener('unhandledrejection',onRej);window.removeEventListener('manav-brain-error',onEv);console.error=origConsole;};
  },[]); // eslint-disable-line

  useEffect(()=>{errHandlerRef.current=(d:any)=>handleSystemError(d);});

  /* Health scan schedule */
  useEffect(()=>{
    const t1=setTimeout(()=>runHealthScan(),5000);
    const t2=setInterval(()=>runHealthScan(),5*60*1000);
    return()=>{clearTimeout(t1);clearInterval(t2);};
  },[]); // eslint-disable-line

  /* Schema check */
  useEffect(()=>{
    setTimeout(async()=>{
      try{const{error}=await supabase.from('brain_learnings').select('status').limit(1);setSchemaOk(!error||!error.message.includes('column "status"'));}
      catch(_e){/* silent */}
    },3000);
  },[]); // eslint-disable-line

  /* handleSystemError */
  const handleSystemError=useCallback((detail:any)=>{
    const err:SysError={id:uid(),type:detail.type as ErrType,message:detail.message||'Unknown error',stack:detail.stack,url:detail.url,status:detail.status,body:detail.body,page:window.location.pathname,ts:new Date(),healed:false,healNote:''};
    setSysErrors(prev=>{
      if(prev.some(e=>e.message===err.message&&Date.now()-e.ts.getTime()<15000))return prev;
      const next=[err,...prev].slice(0,100);setAlerts(next.filter(e=>!e.healed).length);return next;
    });
    if(healCooldown.current)return;
    healCooldown.current=true;setTimeout(()=>{healCooldown.current=false;},60000);
    setHealth('critical');setOpen(true);setTab('chat');
    void logSystemError(err);setTimeout(()=>triggerHealing(err),1000);
  },[]); // eslint-disable-line

  /* triggerHealing */
  const triggerHealing=useCallback((err:SysError)=>{
    setHealth('healing');setScanLine(true);setTimeout(()=>setScanLine(false),2500);
    setMsgs(ms=>[...ms,{id:uid(),role:'alert' as MsgRole,content:'ERROR DETECTED: '+err.type+' on '+err.page,ts:new Date()}]);
    const p=['Type: '+err.type,'Message: '+err.message,err.stack?'Stack: '+err.stack:'',err.url?'File: '+err.url:'',err.status?'HTTP: '+err.status:'',err.body?'Body: '+err.body:'','Diagnose this. What is the exact root cause? Give me the exact fix.'].filter(Boolean).join('\n');
    void sendMsgInternal(p,true,err);
  },[schemaOk]); // eslint-disable-line

  /* runHealthScan */
  const runHealthScan=useCallback(async()=>{
    setHealth('scanning');setScanLine(true);
    const next:Record<string,'ok'|'error'|'checking'>={};
    try{const r=await brainFetch('/api/task-engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'health_check'}),signal:AbortSignal.timeout(6000)});const d=await r.json().catch(()=>({}));next['task-engine']=d.healthy?'ok':'error';}catch(_e){next['task-engine']='error';}
    try{const r=await brainFetch('/api/algorithm-intel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'get_catalog'}),signal:AbortSignal.timeout(6000)});next['algorithm-intel']=r.ok?'ok':'error';}catch(_e){next['algorithm-intel']='error';}
    try{const{error}=await supabase.from('brain_learnings').select('id').limit(1);next['supabase']=error?'error':'ok';}catch(_e){next['supabase']='error';}
    setApiStatus(next);setLastScan(new Date());setScanLine(false);
    setHealth(Object.values(next).some(v=>v==='error')?'degraded':'healthy');
  },[brainFetch]);

  /* Log helpers */
  const logSystemError=useCallback(async(err:SysError)=>{
    try{const row:any={project_id:selProj||null,card_type:'technical',card_title:'Error: '+err.type+' '+err.message.slice(0,50),what_worked:[],what_missed:[err.message].filter(Boolean),improvement:'Fix pending',context_summary:err.type+' on '+err.page,tags:['system_error_log',err.type],source:'system_error_log',applied_count:0,updated_at:new Date().toISOString()};try{await supabase.from('brain_learnings').insert({...row,status:'active',auto_captured:true,confidence_score:98});}catch(_e){await supabase.from('brain_learnings').insert(row);}}catch(_e){/* silent */}
  },[selProj]);

  const logHealAction=useCallback(async(errMsg:string,fix:string,actions:string[])=>{
    try{const row:any={project_id:selProj||null,card_type:'technical',card_title:'Healed: '+errMsg.slice(0,50),what_worked:actions,what_missed:[],improvement:fix.slice(0,400),context_summary:'Self-heal '+new Date().toISOString(),tags:['brain_heal_log'],source:'brain_heal_log',applied_count:0,updated_at:new Date().toISOString()};try{await supabase.from('brain_learnings').insert({...row,status:'active',auto_captured:true,confidence_score:95});}catch(_e){await supabase.from('brain_learnings').insert(row);}}catch(_e){/* silent */}
  },[selProj]);

  const logConversation=useCallback(async(userMsg:string,brainResp:string,actions:ParsedAction[])=>{
    if(!selProj)return;
    try{const row:any={project_id:selProj,card_type:'general',card_title:'Chat: '+userMsg.slice(0,55),what_worked:actions.map(a=>a.label||a.type).filter(Boolean),what_missed:[],improvement:brainResp.slice(0,400),context_summary:'Brain conversation '+new Date().toLocaleDateString(),tags:['brain_assistant_log'],source:'brain_assistant_log',applied_count:0,updated_at:new Date().toISOString()};try{await supabase.from('brain_learnings').insert({...row,status:'active',auto_captured:true,confidence_score:90});}catch(_e){await supabase.from('brain_learnings').insert(row);}}catch(_e){/* silent */}
  },[selProj]);

  /* loadContext */
  const loadContext=useCallback(async()=>{
    if(!selProj)return;
    try{
      const[fullR,ctxR]=await Promise.all([
        brainFetch('/api/task-engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'get_full_context',project_id:selProj})}),
        brainFetch('/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'get_context',projectId:selProj})}),
      ]);
      const[fullD,ctxD]=await Promise.all([fullR.json().catch(()=>({})),ctxR.json().catch(()=>({}))]);
      if(ctxD.success)setCtx(ctxD.context);
      if(fullD.success){
        const fc=fullD.context;
        setLearnings((fc.learnings||[]).filter((l:any)=>!l.status||l.status==='active'));
        setPending((fc.learnings||[]).filter((l:any)=>l.status==='pending_review').length);
        setAlgoItems(fc.algorithmIntel||[]);setDeskItems(fc.deskItems||[]);
        if(fc.metrics)setMetrics(fc.metrics);
        try{const b=fc.canvas||[];setCanvasBlocks(Array.isArray(b)?b:[]);}catch(_e){setCanvasBlocks([]);}
      }
    }catch(_e){/* silent */}
  },[selProj,brainFetch]);

  /* executeAction */
  const executeAction=useCallback(async(action:ParsedAction,msgId:string,idx:number)=>{
    const upd=(status:ActionResult['status'],result:string)=>setMsgs(ms=>ms.map(m=>{if(m.id!==msgId||!m.results)return m;const r=[...m.results];r[idx]={...r[idx],status,result};return{...m,results:r};}));
    try{
      switch(action.type){
        case 'navigate':navigate(action.path||'/');upd('done','Navigated to '+(action.path||'/'));break;
        case 'run_audit':{const res=await brainFetch('/api/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:action.url,mode:action.mode||'standard',action:'audit',projectId:selProj})});if(!res.body){upd('error','Stream unavailable');break;}const rd=res.body.getReader();const dc=new TextDecoder();let t='';while(true){const{done,value}=await rd.read();if(done)break;t+=dc.decode(value);}upd('done','Audit: '+t.slice(0,180));break;}
        case 'fetch_algorithm':{const res=await brainFetch('/api/algorithm-intel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'fetch_topic',topic_id:action.topicId,project_id:selProj})});const d=await res.json();if(d.error){upd('error',d.error);break;}upd('done',(d.item?.title||'')+': '+(d.item?.summary?.slice(0,140)||''));break;}
        case 'fetch_custom_algorithm':{const res=await brainFetch('/api/algorithm-intel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'fetch_custom_topic',label:action.topicLabel,project_id:selProj})});const d=await res.json();if(d.error){upd('error',d.error);break;}upd('done',(d.item?.title||'')+': '+(d.item?.summary?.slice(0,140)||''));break;}
        case 'add_card':{if(!selProj){upd('error','No project selected');break;}const res=await brainFetch('/api/task-engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'add_canvas_card',project_id:selProj,card:{type:action.cardType,title:action.title,content:action.content,priority:action.priority,week:action.week||1}})});const d=await res.json();if(d.error){upd('error',d.error);break;}upd('done','Card "'+action.title+'" added to Week '+(action.week||1)+'.');break;}
        case 'search_brain':{const q=(action.query||'').toLowerCase();const hits=learnings.filter(l=>l.card_title?.toLowerCase().includes(q)||l.improvement?.toLowerCase().includes(q));upd('done',hits.length>0?'Found '+hits.length+': '+hits.slice(0,3).map((l:any)=>l.card_title).join(' | '):'No matching learnings.');break;}
        case 'check_data_sync':{if(!selProj){upd('error','No project selected');break;}const res=await brainFetch('/api/task-engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'check_sync',project_id:selProj})});const d=await res.json().catch(()=>({}));if(d.error){upd('error',d.error);break;}const iss=d.issues?.length>0?'\n\nIssues:\n'+d.issues.map((i:string)=>'- '+i).join('\n'):'\n\nAll looks good.';const inf=d.info?.length>0?'\n\n'+d.info.map((i:string)=>'- '+i).join('\n'):'';upd('done',d.summary+iss+inf);break;}
        case 'list_cards':{if(!canvasBlocks.length){upd('done','No canvas cards loaded.');break;}const bw:Record<number,any[]>={};canvasBlocks.forEach((b:any)=>{const w=b.week||1;if(!bw[w])bw[w]=[];bw[w].push(b);});upd('done',canvasBlocks.length+' cards:\n'+Object.entries(bw).sort(([a],[b])=>+a-+b).map(([w,cs])=>'Week '+w+': '+cs.map((c:any)=>c.title).join(', ')).join('\n'));break;}
        case 'execute_task':{if(!selProj){upd('error','No project selected');break;}const res=await brainFetch('/api/task-engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'execute',project_id:selProj,card:{id:action.cardId,type:action.cardType,title:action.title,content:action.content},role:action.role||'senior_seo'})});const d=await res.json().catch(()=>({}));if(d.error){upd('error',d.error);break;}upd('done',(d.result||'Task executed').slice(0,300));void loadContext();break;}
        case 'reload_canvas':{await loadContext();upd('done','Canvas reloaded. '+canvasBlocks.length+' cards ready.');break;}
        case 'generate_report':{
          try{const{jsPDF}=await import('jspdf');const doc=new jsPDF();const proj=projects.find(p=>p.id===selProj);doc.setFillColor(3,7,18);doc.rect(0,0,210,297,'F');doc.setTextColor(165,180,252);doc.setFontSize(20);doc.text(action.title||'SEO Report',20,25);doc.setTextColor(255,255,255);doc.setFontSize(10);doc.text('Project: '+(proj?.name||'Unknown')+' | '+new Date().toLocaleDateString(),20,35);doc.setDrawColor(99,102,241);doc.line(20,40,190,40);let y=52;(action.sections||[]).forEach((s:any)=>{if(y>260){doc.addPage();y=20;}doc.setTextColor(165,180,252);doc.setFontSize(13);doc.text(s.heading||'',20,y);y+=8;doc.setTextColor(200,200,200);doc.setFontSize(10);const ls=doc.splitTextToSize(s.content||'',170);doc.text(ls,20,y);y+=ls.length*6+8;});doc.save(((action.title||'report').replace(/\s+/g,'-').toLowerCase())+'.pdf');upd('done','Downloaded: '+(action.title||'SEO Report'));}
          catch(err:any){upd('error','Report failed: '+err.message);}
          break;
        }
        case 'generate_chart':{const cid='chart_'+Date.now();setInlineCharts(prev=>({...prev,[cid]:{...action,id:cid}}));setMsgs(ms=>ms.map(m=>m.id===msgId?{...m,chartId:cid}:m));upd('done','Chart rendered.');break;}
        case 'save_to_desk':{
          if(!selProj){upd('error','No project selected');break;}
          const res=await brainFetch('/api/task-engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'desk_save',project_id:selProj,title:action.title||'Brain Note',content_type:action.contentType||'text',content:action.content||'',metadata:action.metadata||{},tags:action.tags||[],source:'brain'})});
          const d=await res.json().catch(()=>({}));if(d.error){upd('error',d.error);break;}
          setDeskItems(prev=>[d.item,...prev]);
          upd('done','Saved to Desk: "'+( action.title||'Brain Note')+'". I will remind you about it.');
          break;
        }
        case 'fetch_url':{const res=await brainFetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'deep_dive',question:'Analyse this URL for SEO issues: '+action.url,checkUrl:action.url,projectSummary:'',role:'senior_seo'})});if(!res.body){upd('error','Fetch failed');break;}const rd=res.body.getReader();const dc=new TextDecoder();let t='';while(true){const{done,value}=await rd.read();if(done)break;t+=dc.decode(value);}upd('done',t.slice(0,400));break;}
        default:upd('done','Action '+action.type+' acknowledged.');
      }
    }catch(err:any){upd('error',err?.message||'Action failed');}
  },[navigate,selProj,learnings,canvasBlocks,projects,brainFetch,loadContext]); // eslint-disable-line

  const execAllActions=useCallback(async(msgId:string,actions:ParsedAction[])=>{
    for(let i=0;i<actions.length;i++){
      setMsgs(ms=>ms.map(m=>{if(m.id!==msgId||!m.results)return m;const r=[...m.results];r[i]={action:actions[i],status:'running',result:''};return{...m,results:r};}));
      await executeAction(actions[i],msgId,i);
      await new Promise(r=>setTimeout(r,120));
    }
  },[executeAction]);

  /* sendMsgInternal */
  const sendMsgInternal=useCallback(async(text:string,isAuto=false,sourceErr?:SysError)=>{
    if(!text.trim()||loading)return;
    streamActive.current=true;setLoading(true);
    if(!isAuto){setInput('');if(codeSnippet){setCodeSnippet('');setShowCode(false);}if(attachments.length)setAttachments([]);}
    if(!isAuto)setMsgs(ms=>[...ms,{id:uid(),role:'user',content:text,ts:new Date()}]);
    const brainId=uid();
    setMsgs(ms=>[...ms,{id:brainId,role:'brain',content:'',ts:new Date()}]);
    const history=msgs.filter(m=>m.role==='user'||m.role==='brain').slice(-8).map(m=>({role:m.role==='user'?'user':'assistant',content:stripActs(m.content).slice(0,250)}));
    const proj=projects.find(p=>p.id===selProj);
    const client=clients.find(c=>c.id===proj?.client_id);
    const summary=[client?.company,proj?.name,ctx?.project?.url].filter(Boolean).join(' | ');
    try{
      const res=await brainFetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'brain_assistant',question:text,projectId:selProj||null,attachments:attachments.map(a=>({type:a.type,data:a.data,mediaType:a.mediaType})),projectSummary:summary||'No project selected',role:'senior_seo',brainAssistantContext:{projectContext:ctx,learnings:learnings.slice(0,12),algoItems:algoItems.slice(0,8),canvasBlocks:canvasBlocks.slice(0,50),metrics,deskItems:deskItems.slice(0,10),history,codeContent:codeSnippet||undefined}})});
      if(!res.body)throw new Error('Stream unavailable');
      const reader=res.body.getReader();const dec=new TextDecoder();let full='';
      while(true){
        const{done,value}=await reader.read();if(done)break;
        const chunk=dec.decode(value);full+=chunk;
        if(chunk.includes('\uD83D\uDD0D Searching')||chunk.includes('\uD83D\uDCCB Processing'))setIsSearching(true);
        else if(full.length>200)setIsSearching(false);
        setMsgs(ms=>ms.map(m=>m.id===brainId?{...m,content:full}:m));
      }
      setIsSearching(false);
      const truncated=full.includes('reached the length limit');
      const actions=parseActs(full);
      setMsgs(ms=>ms.map(m=>m.id===brainId?{...m,content:full,actions,results:actions.map(a=>({action:a,status:'running' as const,result:''})),truncated}:m));
      if(actions.length>0)await execAllActions(brainId,actions);
      void logConversation(text,stripActs(full),actions);
      if(sourceErr){const fix=stripActs(full).slice(0,400);setSysErrors(e=>e.map(x=>x.id===sourceErr.id?{...x,healed:true,healNote:fix}:x));setAlerts(n=>Math.max(0,n-1));setHealth(h=>h==='critical'?'healthy':h);void logHealAction(sourceErr.message,fix,actions.map(a=>a.label||a.type));}
      if(truncated){setTimeout(()=>sendMsgInternal('You were cut off. Continue from where you left off.',true),800);return;}
      if(actions.some(a=>['add_card','run_audit','fetch_algorithm','execute_task','reload_canvas'].includes(a.type)))void loadContext();
    }catch(err:any){setMsgs(ms=>ms.map(m=>m.id===brainId?{...m,content:'Error: '+(err?.message||'Something went wrong.')}:m));}
    streamActive.current=false;setLoading(false);
  },[loading,msgs,selProj,ctx,learnings,algoItems,canvasBlocks,deskItems,metrics,codeSnippet,attachments,projects,clients,execAllActions,logConversation,logHealAction,loadContext,brainFetch]); // eslint-disable-line

  const sendMessage=useCallback((t:string)=>sendMsgInternal(t,false),[sendMsgInternal]);
  const handleKey=(e:React.KeyboardEvent<HTMLTextAreaElement>)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(input);}};

  const unresolvedErrors=sysErrors.filter(e=>!e.healed);
  const resolvedErrors=sysErrors.filter(e=>e.healed);

  /* ─── RENDER ─── */
  return (
    <>
      {/* Floating button */}
      {!open&&(
        <button onClick={()=>setOpen(true)} style={{position:'fixed',bottom:24,right:24,zIndex:9990,width:60,height:60,borderRadius:'50%',border:'none',cursor:'pointer',background:alertCount>0?'linear-gradient(135deg,#7f1d1d,#1f0505)':health==='healing'?'linear-gradient(135deg,#0d4f3c,#0a1f1a)':'linear-gradient(135deg,#1e1b4b,#0a0f1e)',boxShadow:alertCount>0?'0 0 0 1px rgba(239,68,68,0.6),0 0 40px rgba(239,68,68,0.5)':'0 0 0 1px '+hc.glow+',0 0 30px '+hc.glow,display:'flex',alignItems:'center',justifyContent:'center',animation:alertCount>0?'alertPulse 0.8s ease-in-out infinite':'brainPulse 3s ease-in-out infinite'}}>
          <Brain size={24} style={{color:alertCount>0?'#fca5a5':'#a5b4fc',filter:'drop-shadow(0 0 8px '+(alertCount>0?'rgba(239,68,68,0.8)':'rgba(99,102,241,0.8)')+')' }}/>
          {alertCount>0&&<div style={{position:'absolute',top:2,right:2,width:20,height:20,borderRadius:'50%',background:'#ef4444',border:'2px solid #030712',fontSize:9,fontWeight:900,color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}}>{alertCount>9?'9+':alertCount}</div>}
          {alertCount===0&&pending>0&&<div style={{position:'absolute',top:2,right:2,width:18,height:18,borderRadius:'50%',background:'#f59e0b',border:'2px solid #030712',fontSize:9,fontWeight:900,color:'#030712',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}}>{pending>9?'9+':pending}</div>}
        </button>
      )}

      {/* Panel */}
      {open&&(
        <div style={{position:'fixed',bottom:24,right:24,zIndex:9990,width:panelW,height:panelH,borderRadius:20,overflow:'hidden',background:'#030712',border:'1px solid '+(alertCount>0?'rgba(239,68,68,0.3)':'rgba(99,102,241,0.22)'),boxShadow:'0 0 80px '+(alertCount>0?'rgba(239,68,68,0.1)':'rgba(99,102,241,0.1)')+',0 20px 60px rgba(0,0,0,0.85)',display:'flex',flexDirection:'column',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}>
          <Scanlines/>
          {scanLine&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,zIndex:10,background:'linear-gradient(90deg,transparent,rgba(6,182,212,0.9),transparent)',animation:'scanSlide 2.5s linear forwards',pointerEvents:'none'}}/>}
          <div style={{position:'absolute',inset:0,zIndex:0,overflow:'hidden',borderRadius:20}}>
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0.04}}><defs><pattern id="bg" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#00d4ff" strokeWidth="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#bg)"/></svg>
            <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse 60% 30% at 50% 0%,'+(alertCount>0?'rgba(239,68,68,0.05)':'rgba(99,102,241,0.05)')+' 0%,transparent 70%)'}}/>
          </div>

          {/* Header */}
          <div style={{position:'relative',zIndex:2,display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'rgba(0,0,0,0.45)',borderBottom:'1px solid '+(alertCount>0?'rgba(239,68,68,0.12)':'rgba(99,102,241,0.12)'),backdropFilter:'blur(20px)'}}>
            <Brain size={16} style={{color:alertCount>0?'#fca5a5':'#a5b4fc',filter:'drop-shadow(0 0 5px '+(alertCount>0?'rgba(239,68,68,0.8)':'rgba(99,102,241,0.7)')+')',flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,fontWeight:900,fontFamily:'monospace',color:alertCount>0?'#fca5a5':'#e0e7ff',letterSpacing:'0.12em'}}>MANAV BRAIN</div>
              <div style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.2)'}}>
                {loading?'Thinking...':health==='healing'?'Self-healing...':health==='scanning'?'Scanning...':schemaOk===false?'Setup needed':alertCount>0?alertCount+' things to look at':hc.label}
              </div>
            </div>
            <div style={{width:5,height:5,borderRadius:'50%',background:hc.color,boxShadow:'0 0 6px '+hc.glow,flexShrink:0}}/>
            <div style={{display:'flex',flexDirection:'column',gap:2,flexShrink:0}}>
              <select value={selProj} onChange={e=>{setSelProj(e.target.value);setAutoProj(false);}} style={{height:24,padding:'0 6px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,fontSize:8,color:'rgba(255,255,255,0.55)',outline:'none',fontFamily:'monospace',cursor:'pointer',maxWidth:110}}>
                <option value="">PROJECT</option>
                {projects.map(p=>{const cl=clients.find(c=>c.id===p.client_id);return <option key={p.id} value={p.id}>{cl?.company||p.name}</option>;})}
              </select>
              {selProj&&(
                <div style={{display:'flex',gap:3,alignItems:'center'}}>
                  {autoProj&&<span style={{fontSize:6,fontFamily:'monospace',color:'#10b981'}}>AUTO</span>}
                  {canvasBlocks.length>0&&<span style={{fontSize:6,fontFamily:'monospace',color:'rgba(99,102,241,0.6)'}}>{canvasBlocks.length} cards</span>}
                </div>
              )}
            </div>
            {alertCount>0&&<div style={{background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.35)',borderRadius:10,padding:'1px 6px',fontSize:7,fontFamily:'monospace',color:'#fca5a5',flexShrink:0}}>{alertCount} ERR</div>}
            {alertCount===0&&pending>0&&<div style={{background:'rgba(251,191,36,0.12)',border:'1px solid rgba(251,191,36,0.28)',borderRadius:10,padding:'1px 6px',fontSize:7,fontFamily:'monospace',color:'#fbbf24',flexShrink:0}}>{pending}P</div>}
            <button onClick={()=>navigate('/desk')} style={{background:'none',border:'none',cursor:'pointer',color:deskItems.length>0?'rgba(52,211,153,0.7)':'rgba(255,255,255,0.18)',padding:3,display:'flex',alignItems:'center',gap:2,fontSize:7,fontFamily:'monospace'}}>
              <FileText size={10}/>{deskItems.length>0&&<span style={{fontSize:6}}>{deskItems.length}</span>}
            </button>
            <button onClick={()=>setExpanded(e=>!e)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.18)',padding:3,display:'flex'}}>{expanded?<Minimize2 size={11}/>:<Maximize2 size={11}/>}</button>
            <button onClick={()=>setOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.22)',padding:3,display:'flex'}}><X size={13}/></button>
          </div>

          {/* Tabs */}
          <div style={{position:'relative',zIndex:2,display:'flex',background:'rgba(0,0,0,0.25)',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            {([
              {id:'chat',   label:'CHAT',   badge:null,             badgeColor:''},
              {id:'system', label:'SYSTEM', badge:unresolvedErrors.length>0?unresolvedErrors.length:null, badgeColor:'#ef4444'},
              {id:'log',    label:'LOG',    badge:sysErrors.length>0?sysErrors.length:null,               badgeColor:'#6366f1'},
            ] as const).map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id as TabId)} style={{flex:1,padding:'8px 4px',background:'none',border:'none',cursor:'pointer',fontSize:8,fontFamily:'monospace',letterSpacing:'0.1em',fontWeight:700,color:tab===t.id?'#a5b4fc':'rgba(255,255,255,0.2)',borderBottom:tab===t.id?'2px solid #6366f1':'2px solid transparent',position:'relative',transition:'all 0.15s'}}>
                {t.label}
                {(t as any).badge>0&&<span style={{position:'absolute',top:2,right:'25%',width:12,height:12,borderRadius:'50%',background:(t as any).badgeColor,fontSize:7,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:900}}>{(t as any).badge>9?'9+':(t as any).badge}</span>}
              </button>
            ))}
          </div>

          {/* CHAT TAB */}
          {tab==='chat'&&(
            <>
              <div style={{flex:1,overflow:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:10,position:'relative',zIndex:2}}>
                {msgs.map(m=>(
                  <MsgBubble key={m.id} msg={m}
                    onSaveToDesk={m.role==='brain'?async()=>{
                      const r=await brainFetch('/api/task-engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'desk_save',project_id:selProj||null,title:'Brain '+m.ts.toLocaleDateString(),content_type:'text',content:stripActs(m.content),source:'brain_chat'})});
                      const d=await r.json().catch(()=>({}));if(d.success){setDeskItems(p=>[d.item,...p]);alert('Saved to Desk');}
                    }:undefined}
                    onAction={a=>{
                      const tid=uid();
                      setMsgs(ms=>[...ms,{id:tid,role:'brain' as MsgRole,content:'Executing: '+a.label+'...',actions:[a],results:[{action:a,status:'running' as const,result:''}],ts:new Date()}]);
                      executeAction(a,tid,0);
                    }}
                  />
                ))}
                {loading&&!streamActive.current&&(
                  <div style={{display:'flex',alignItems:'center',gap:7,paddingLeft:3}}>
                    <div style={{display:'flex',gap:3}}>{[0,1,2].map(i=><div key={i} style={{width:4,height:4,borderRadius:'50%',background:'#6366f1',animation:'dotPulse 1.4s ease-in-out '+(i*0.2)+'s infinite'}}/>)}</div>
                    <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(99,102,241,0.55)'}}>{isSearching?'Searching web...':'Thinking...'}</span>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>

              {/* Suggestion chips */}
              {msgs.length<=3&&(
                <div style={{position:'relative',zIndex:2,padding:'6px 14px 0',display:'flex',gap:5,flexWrap:'wrap',borderTop:'1px solid rgba(255,255,255,0.04)'}}>
                  {(PAGE_SUGGESTIONS[location.pathname]||DEFAULT_SUGGESTIONS).slice(0,3).map((s,i)=>(
                    <button key={i} onClick={()=>sendMessage(s)} style={{background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.14)',borderRadius:12,padding:'4px 10px',fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.7)',cursor:'pointer',whiteSpace:'nowrap'}}>{s}</button>
                  ))}
                </div>
              )}

              {/* Reminders */}
              {reminders.length>0&&(
                <div style={{position:'relative',zIndex:2,padding:'6px 14px',borderTop:'1px solid rgba(251,191,36,0.08)'}}>
                  {reminders.map((r,i)=>(
                    <div key={r.id} style={{background:'rgba(251,191,36,0.04)',border:'1px solid rgba(251,191,36,0.15)',borderRadius:8,padding:'7px 10px',marginBottom:4,display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:9,fontFamily:'monospace',color:'rgba(251,191,36,0.7)',flex:1,lineHeight:1.4}}>Reminder: {r.text}</span>
                      <button onClick={()=>{navigate('/desk');setOpen(false);}} style={{background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.25)',borderRadius:5,padding:'2px 8px',color:'#fbbf24',fontSize:8,fontFamily:'monospace',cursor:'pointer'}}>Open</button>
                      <button onClick={()=>{sessionStorage.setItem('reminded_'+r.id,'1');setReminders(prev=>prev.filter((_,j)=>j!==i));}} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.2)',fontSize:8,padding:'0 2px'}}>x</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input */}
              <div style={{position:'relative',zIndex:2,padding:'10px 14px 14px',borderTop:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.18)'}}>
                {attachments.length>0&&(
                  <div style={{marginBottom:6,display:'flex',gap:4,flexWrap:'wrap'}}>
                    {attachments.map((a,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:4,background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:6,padding:'2px 7px'}}>
                        <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.8)'}}>{a.type==='image'?'img':'doc'} {a.name.slice(0,18)}</span>
                        <button onClick={()=>setAttachments(prev=>prev.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.3)',fontSize:9,padding:0}}>x</button>
                      </div>
                    ))}
                  </div>
                )}
                {showCode&&(
                  <div style={{marginBottom:8,background:'rgba(6,182,212,0.04)',border:'1px solid rgba(6,182,212,0.15)',borderRadius:8,padding:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                      <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(6,182,212,0.7)'}}>CODE ATTACHED</span>
                      <button onClick={()=>{setCodeSnippet('');setShowCode(false);}} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.3)',fontSize:8}}>x</button>
                    </div>
                    <textarea value={codeSnippet} onChange={e=>setCodeSnippet(e.target.value)} rows={5} placeholder="Paste any file content here" style={{width:'100%',background:'rgba(0,0,0,0.4)',border:'1px solid rgba(6,182,212,0.1)',borderRadius:6,padding:'6px 8px',fontSize:9,color:'rgba(255,255,255,0.6)',outline:'none',resize:'vertical',fontFamily:'monospace',boxSizing:'border-box'}}/>
                  </div>
                )}
                <div style={{display:'flex',gap:7,alignItems:'flex-end'}}>
                  <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} disabled={loading} rows={1} placeholder="Ask me anything — what to focus on, what to do next..." style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'8px 12px',fontSize:11,color:'rgba(255,255,255,0.78)',outline:'none',resize:'none',fontFamily:'inherit',lineHeight:1.5,minHeight:36,maxHeight:110}} onFocus={e=>e.target.style.borderColor='rgba(99,102,241,0.4)'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.07)'}/>
                  <button onClick={()=>sendMessage(input)} disabled={loading||!input.trim()} style={{width:36,height:36,borderRadius:9,border:'none',cursor:'pointer',flexShrink:0,background:loading||!input.trim()?'rgba(99,102,241,0.12)':'linear-gradient(135deg,#6366f1,#4f46e5)',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.18s'}}>
                    {loading?<Loader2 size={14} style={{color:'rgba(255,255,255,0.3)',animation:'spin 1s linear infinite'}}/>:<Send size={12} style={{color:!input.trim()?'rgba(255,255,255,0.18)':'white'}}/>}
                  </button>
                </div>
                <div style={{marginTop:5,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.12)'}}>Enter to send</span>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <button onClick={()=>fileInputRef.current?.click()} style={{background:'none',border:'none',cursor:'pointer',fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.25)',padding:'1px 4px'}}>{attachments.length>0?attachments.length+'f':'FILE'}</button>
                    <button onClick={()=>setShowCode(v=>!v)} style={{background:'none',border:'none',cursor:'pointer',fontSize:7,fontFamily:'monospace',color:showCode?'rgba(6,182,212,0.8)':'rgba(255,255,255,0.25)',padding:'1px 4px'}}>CODE{codeSnippet?' ok':''}</button>
                    <button onClick={()=>sendMsgInternal('Run a complete data sync check for this project. Be direct.',false)} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:3,color:'rgba(255,255,255,0.18)',fontSize:7,fontFamily:'monospace',padding:0}}><Database size={7}/> SYNC</button>
                    <button onClick={runHealthScan} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:3,color:'rgba(255,255,255,0.18)',fontSize:7,fontFamily:'monospace',padding:0}}><RefreshCw size={7} style={health==='scanning'?{animation:'spin 1s linear infinite'}:{}}/> SCAN</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* SYSTEM TAB */}
          {tab==='system'&&(
            <div style={{flex:1,overflow:'auto',padding:'14px',position:'relative',zIndex:2,display:'flex',flexDirection:'column',gap:12}}>
              {schemaOk===false&&(
                <div style={{background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.25)',borderRadius:10,padding:'10px 12px'}}>
                  <div style={{fontSize:9,fontWeight:700,fontFamily:'monospace',color:'#fbbf24',marginBottom:4}}>MIGRATION NEEDED</div>
                  <p style={{fontSize:10,color:'rgba(255,255,255,0.45)',lineHeight:1.5,margin:'0 0 8px'}}>Run migration-brain-v2.sql in Supabase SQL Editor.</p>
                  <button onClick={()=>{setTab('chat');sendMsgInternal('How do I run migration-brain-v2.sql in Supabase?',true);}} style={{background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.3)',borderRadius:6,padding:'3px 10px',color:'#fbbf24',fontSize:8,fontFamily:'monospace',cursor:'pointer'}}>SHOW ME HOW</button>
                </div>
              )}
              <div style={{background:hc.color+'0c',border:'1px solid '+hc.color+'28',borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:hc.color,boxShadow:'0 0 8px '+hc.glow,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,fontFamily:'monospace',color:hc.color}}>{hc.label}</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.28)',fontFamily:'monospace'}}>{lastScan?'Scanned '+timeAgo(lastScan):'Scanning...'} — {sysErrors.length} events</div>
                </div>
                <button onClick={runHealthScan} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:7,padding:'4px 10px',color:'rgba(255,255,255,0.4)',fontSize:8,fontFamily:'monospace',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}><RefreshCw size={8}/> SCAN</button>
              </div>
              <div>
                <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.22)',letterSpacing:'0.12em',marginBottom:8}}>API STATUS</div>
                {[
                  {name:'task-engine',    label:'Task Engine',    Icon:Zap},
                  {name:'algorithm-intel',label:'Algorithm Intel',Icon:Cpu},
                  {name:'supabase',       label:'Supabase DB',    Icon:Database},
                ].map(ep=>{
                  const s=apiStatus[ep.name]||'checking';
                  const c=s==='ok'?'#10b981':s==='error'?'#ef4444':'#6366f1';
                  return (
                    <div key={ep.name} style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.02)',border:'1px solid '+c+'18',borderRadius:8,padding:'7px 10px',marginBottom:5}}>
                      <ep.Icon size={10} style={{color:c,flexShrink:0}}/>
                      <span style={{fontSize:10,color:'rgba(255,255,255,0.45)',flex:1,fontFamily:'monospace'}}>{ep.label}</span>
                      {s==='error'&&<button onClick={()=>{setTab('chat');sendMsgInternal('Diagnose why '+ep.label+' is offline. Give me the exact fix.',true);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:5,padding:'2px 7px',color:'#ef4444',fontSize:7,fontFamily:'monospace',cursor:'pointer'}}>DIAGNOSE</button>}
                      <span style={{fontSize:8,fontFamily:'monospace',color:c,fontWeight:700}}>{s==='checking'?'CHECKING':s==='ok'?'ONLINE':'OFFLINE'}</span>
                      <div style={{width:5,height:5,borderRadius:'50%',background:c,boxShadow:'0 0 6px '+c+'80'}}/>
                    </div>
                  );
                })}
              </div>
              {unresolvedErrors.length>0&&(
                <div>
                  <div style={{fontSize:8,fontFamily:'monospace',color:'#fca5a5',letterSpacing:'0.12em',marginBottom:8}}>UNRESOLVED ({unresolvedErrors.length})</div>
                  {unresolvedErrors.slice(0,5).map(e=>(
                    <div key={e.id} style={{background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:8,padding:'8px 10px',marginBottom:6}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                        <span style={{fontSize:9,fontFamily:'monospace',color:'#fca5a5',fontWeight:700}}>{e.type.replace(/_/g,' ').toUpperCase()}</span>
                        <span style={{fontSize:8,color:'rgba(255,255,255,0.18)',fontFamily:'monospace'}}>{timeAgo(e.ts)}</span>
                      </div>
                      <p style={{fontSize:10,color:'rgba(255,255,255,0.42)',margin:'0 0 5px',lineHeight:1.4}}>{e.message.slice(0,120)}</p>
                      {e.body&&<p style={{fontSize:9,color:'rgba(239,68,68,0.5)',margin:'0 0 5px',fontFamily:'monospace'}}>{e.body.slice(0,80)}</p>}
                      <button onClick={()=>{setTab('chat');sendMsgInternal('Diagnose and fix: '+e.type+': '+e.message+(e.body?' Body: '+e.body:''),true,e);}} style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:5,padding:'3px 8px',color:'#fca5a5',fontSize:8,fontFamily:'monospace',cursor:'pointer'}}>DIAGNOSE NOW</button>
                    </div>
                  ))}
                </div>
              )}
              {unresolvedErrors.length===0&&(
                <div style={{textAlign:'center',padding:'20px 0'}}>
                  <CheckCircle size={28} style={{color:'#10b981',margin:'0 auto 8px'}}/>
                  <div style={{fontSize:10,fontFamily:'monospace',color:'#10b981'}}>ALL SYSTEMS GOOD</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.18)',marginTop:4}}>{resolvedErrors.length>0?resolvedErrors.length+' past errors resolved':'No errors detected'}</div>
                </div>
              )}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:'auto'}}>
                {[
                  {label:'Open Desk',       Icon:FileText, fn:()=>navigate('/desk')},
                  {label:'What needs fixing',Icon:Shield,  fn:()=>{setTab('chat');sendMsgInternal('What needs fixing right now? Be direct.',true);}},
                  {label:'Fix API errors',  Icon:Zap,      fn:()=>{setTab('chat');sendMsgInternal('My APIs are returning 500 errors. What is broken and how do I fix it?',true);}},
                  {label:'Check database',  Icon:Database, fn:()=>{setTab('chat');sendMsgInternal('Is my database set up correctly? Check all migrations.',true);}},
                  {label:'Full health scan',Icon:Radio,    fn:()=>{runHealthScan();setTab('chat');sendMsgInternal('Do a full health scan and give me a prioritised list of everything that needs attention.',true);}},
                ].map((item,i)=>(
                  <button key={i} onClick={item.fn} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'8px',display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    <item.Icon size={10} style={{color:'#6366f1',flexShrink:0}}/>
                    <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.38)'}}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* LOG TAB */}
          {tab==='log'&&(
            <div style={{flex:1,overflow:'auto',padding:'14px',position:'relative',zIndex:2,display:'flex',flexDirection:'column',gap:7}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.22)',letterSpacing:'0.12em'}}>LOG — {sysErrors.length} ENTRIES</span>
                <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(99,102,241,0.35)'}}>PERMANENT</span>
              </div>
              {sysErrors.length===0&&(
                <div style={{textAlign:'center',padding:'32px 0'}}>
                  <Layers size={24} style={{color:'rgba(255,255,255,0.05)',margin:'0 auto 10px'}}/>
                  <div style={{fontSize:10,fontFamily:'monospace',color:'rgba(255,255,255,0.14)'}}>NO EVENTS YET</div>
                </div>
              )}
              {sysErrors.map(e=>(
                <div key={e.id} style={{background:e.healed?'rgba(16,185,129,0.04)':'rgba(255,255,255,0.02)',border:'1px solid '+(e.healed?'rgba(16,185,129,0.14)':'rgba(255,255,255,0.06)'),borderRadius:8,padding:'8px 10px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                    {e.healed?<CheckCircle size={8} style={{color:'#10b981',flexShrink:0}}/>:<AlertCircle size={8} style={{color:'#ef4444',flexShrink:0}}/>}
                    <span style={{fontSize:9,fontFamily:'monospace',color:e.healed?'#10b981':'#fca5a5',fontWeight:700}}>{e.type.replace(/_/g,' ').toUpperCase()}</span>
                    <span style={{marginLeft:'auto',fontSize:7,color:'rgba(255,255,255,0.15)',fontFamily:'monospace'}}>{timeAgo(e.ts)}</span>
                  </div>
                  <p style={{fontSize:10,color:'rgba(255,255,255,0.38)',margin:'0 0 2px',lineHeight:1.4}}>{e.message.slice(0,120)}</p>
                  {e.body&&<p style={{fontSize:8,color:'rgba(239,68,68,0.4)',margin:'1px 0',fontFamily:'monospace'}}>{e.body.slice(0,80)}</p>}
                  {e.healNote&&<p style={{fontSize:9,color:'rgba(16,185,129,0.45)',margin:'3px 0 0',lineHeight:1.4,fontStyle:'italic'}}>Fix: {e.healNote.slice(0,100)}</p>}
                  <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap'}}>
                    <span style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.22)',fontFamily:'monospace'}}>{e.page}</span>
                    {e.url&&<span style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.18)',fontFamily:'monospace'}}>{e.url.split('/').pop()}</span>}
                    <span style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:'rgba(99,102,241,0.06)',color:'rgba(165,180,252,0.35)',fontFamily:'monospace'}}>brain_log</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File input */}
      <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.docx,.xlsx,.csv,.txt,.ts,.tsx,.json" style={{display:'none'}}
        onChange={async e=>{
          const files=Array.from(e.target.files||[]).slice(0,3);
          const read=await Promise.all(files.map(readFileAsBase64));
          setAttachments(prev=>[...prev,...read].slice(0,3));
          e.target.value='';
        }}/>

      <style>{`
        @keyframes brainPulse{0%,100%{box-shadow:0 0 0 1px rgba(99,102,241,0.4),0 0 30px rgba(99,102,241,0.35);}50%{box-shadow:0 0 0 1px rgba(99,102,241,0.7),0 0 55px rgba(99,102,241,0.55);}}
        @keyframes alertPulse{0%,100%{box-shadow:0 0 0 1px rgba(239,68,68,0.6),0 0 40px rgba(239,68,68,0.5);}50%{box-shadow:0 0 0 2px rgba(239,68,68,0.9),0 0 65px rgba(239,68,68,0.75);}}
        @keyframes scanSlide{0%{top:-2px;}100%{top:100%;}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes dotPulse{0%,60%,100%{transform:scale(1);opacity:0.4;}30%{transform:scale(1.6);opacity:1;}}
      `}</style>
    </>
  );
}
