
import React,{createContext,useContext,useState,useEffect,useCallback,useRef} from "react";
import {useLocation,useNavigate} from "react-router-dom";

interface NavBrainState {
  // Current situation
  currentPath: string;
  role: string;
  hour: number;
  empireStats: any;
  // Intelligence
  suggestion: string;
  suggestedActions: Action[];
  recentPaths: string[];
  frequentPaths: Record<string,number>;
  // UI state
  sidebarOpen: boolean;
  sidebarPinned: boolean;
  setSidebarOpen: (v:boolean)=>void;
  setSidebarPinned: (v:boolean)=>void;
  setRole: (r:string)=>void;
  navigate: (path:string)=>void;
  refreshStats: ()=>void;
}
interface Action { icon:string; label:string; href:string; why:string; urgency:"now"|"soon"|"later"; }

const Ctx = createContext<NavBrainState>({} as NavBrainState);
export const useNav = () => useContext(Ctx);

const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));

/* ════════════════════════════════════════════════════════════════════
   Phase 21 Block 2.21 — JARVIS daily mood freshness
   The TopBar suggestion line was static per time slot. Now it rotates
   through a pool, biased by day-of-week (mornings) or seeded per-day
   (other slots), so each day brings something different but stable
   for the whole day.
══════════════════════════════════════════════════════════════════════ */

/* Stable-per-day seed so the suggestion doesn't flicker on re-renders */
function getDaySeed(): number {
  const d = new Date();
  return d.getFullYear() * 1000 + (d.getMonth() + 1) * 31 + d.getDate();
}

/* Day-of-week-specific morning messages — Mon..Sun feel different */
const MORNING_BY_DAY = [
  /* 0 Sun */ "Sunday. Quiet check-in. Set the tone for the week ahead.",
  /* 1 Mon */ "Monday. Fresh slate. The empire's overnight run is your best starting move.",
  /* 2 Tue */ "Tuesday. Yesterday's signals are clearer now — worth a quick look.",
  /* 3 Wed */ "Wednesday. Midweek pivot. What's working, what's drifting?",
  /* 4 Thu */ "Thursday. The week is real now. Ship one good thing today.",
  /* 5 Fri */ "Friday. Close strong. One real win beats five rushed ones.",
  /* 6 Sat */ "Saturday. Empire runs lighter. Check anything that actually woke you up.",
];

const PEAK_POOL = [
  "Peak hours. Your leads are online. Best time to send responses and audits.",
  "Mid-morning. The data has settled — worth a closer read on what shifted.",
  "Pipeline's warmest now. Anything aging gets cold by tomorrow.",
  "Live hours. Anything needing a human voice belongs here.",
  "Prime time. People are between meetings — quick wins land easily.",
  "Active window. Make the calls, send the briefs, ship the audits.",
  "Inbox is alive. Triage now or it triages you later.",
  "High-attention window. Save the deep work for this afternoon — use this for momentum.",
];

const AFTERNOON_POOL = [
  "Afternoon. Deep work clicks now — reports, analysis, content briefs.",
  "Post-lunch focus zone. What needs your full brain?",
  "Quiet creative window. Reports, audits, content briefs all open up here.",
  "Sharp thinking hours. Don't waste them on email — pick the hard thing.",
  "Mid-afternoon. The brain is most analytical now. Use it on the gnarly task.",
  "Afternoon stretch. One deep task beats five shallow ones today.",
  "Calm hours. Step back — what pattern is the data trying to show you?",
  "Reflection window. The morning shipped things. Now check whether they're working.",
];

const EVENING_POOL = [
  "Evening wind-down. Plan tomorrow before you close the laptop.",
  "Day's ending. The Brain Command knows more than it did this morning.",
  "Quieter hours. Light review, no irreversible moves.",
  "End of day. What's one thing worth carrying into tomorrow?",
  "Sunset hours. You've done what you could. The empire runs.",
  "Wind-down. Capture what you learned today — Brain Learnings is listening.",
  "Twilight. The pipeline will still be there in the morning. Take the win.",
  "Evening pause. The best ideas come AFTER you stop reaching for them.",
];

const LATE_POOL = [
  "Late session. The empire runs while you rest.",
  "Night work. Notify-only mode — don't make big calls now.",
  "Owl hours. Whatever you ship now, double-check tomorrow.",
  "Burning oil. Something on your mind? Capture it, then sleep.",
  "Quiet hours. The most important thing right now is rest.",
  "Midnight territory. Brain dumps welcome. Decisions, less so.",
  "Late shift. Even Atlas put the world down sometimes.",
  "Past hours. Something's keeping you up — write it down, close the tab.",
];

function pickFromPool(pool: string[], seed: number): string {
  return pool[((seed % pool.length) + pool.length) % pool.length];
}

function getSituation(hour:number,stats:any,_path:string,role:string):{
  suggestion:string; actions:Action[];
}{
  const h=hour;
  const alerts=stats.alertsUnread||0;
  const leads=stats.prospects||0;
  const seed = getDaySeed();
  const dayOfWeek = new Date().getDay();

  let suggestion="";
  const actions:Action[]=[];

  if(h>=6&&h<10){
    suggestion = MORNING_BY_DAY[dayOfWeek] || "Good morning. Your empire ran overnight. Check the morning brief first.";
    actions.push({icon:"🌅",label:"Morning Brief",href:"/morning-brief",why:"Generated overnight with today's priorities",urgency:"now"});
    if(alerts>0)actions.push({icon:"🚨",label:`${alerts} Alerts`,href:"/alerts",why:`${alerts} unread alerts need attention`,urgency:"now"});
    actions.push({icon:"❤️",label:"Client Health",href:"/health",why:"Daily health check — spot churn risk early",urgency:"soon"});
  }else if(h>=10&&h<14){
    suggestion = pickFromPool(PEAK_POOL, seed);
    if(role==="bde"||role==="bdm"){
      actions.push({icon:"💼",label:"BDE Panel",href:"/bde-panel",why:"Fiverr is most active now",urgency:"now"});
      actions.push({icon:"💬",label:"Client Comms",href:"/client-comms",why:"Handle pending conversations",urgency:"now"});
    }else{
      actions.push({icon:"📋",label:"Kanban Board",href:"/kanban",why:"Move tasks forward during peak hours",urgency:"now"});
      actions.push({icon:"👑",label:"Empire Command",href:"/empire",why:"Check pipeline and team status",urgency:"now"});
    }
    if(leads>0)actions.push({icon:"🎯",label:"New Leads",href:"/bde-panel",why:`${leads} leads in pipeline need attention`,urgency:"soon"});
  }else if(h>=14&&h<18){
    suggestion = pickFromPool(AFTERNOON_POOL, seed);
    actions.push({icon:"📊",label:"Reports",href:"/reports",why:"Generate or review client reports",urgency:"soon"});
    actions.push({icon:"📝",label:"Content Hub",href:"/content-hub",why:"Create briefs while thinking is sharp",urgency:"soon"});
    actions.push({icon:"🤖",label:"LLM Visibility",href:"/llm-visibility",why:"Run AI citation checks",urgency:"later"});
  }else if(h>=18&&h<22){
    suggestion = pickFromPool(EVENING_POOL, seed);
    actions.push({icon:"🧠",label:"Brain Learnings",href:"/brain-command",why:"Review what the AI learned today",urgency:"soon"});
    actions.push({icon:"💰",label:"Revenue BI",href:"/revenue",why:"Check today's pipeline movement",urgency:"soon"});
    actions.push({icon:"📡",label:"Build Dashboard",href:"/build",why:"End-of-day empire status check",urgency:"later"});
  }else{
    suggestion = pickFromPool(LATE_POOL, seed);
    actions.push({icon:"🤖",label:"Ask the Empire",href:"/ask",why:"Quick AI briefing on status",urgency:"now"});
    actions.push({icon:"📡",label:"Build Dashboard",href:"/build",why:"See what happened today",urgency:"soon"});
  }

  /* Data-driven flavor overrides — when something interesting is happening,
     surface it instead of the generic time-slot line. Order matters: most
     urgent wins. */
  if (alerts >= 3) {
    suggestion = `${alerts} alerts came in. Triage them before they pile up.`;
  } else if (alerts === 0 && leads >= 5 && h >= 10 && h < 18) {
    suggestion = `${leads} leads in the pipeline — and a clean alert board. Use the breathing room.`;
  } else if (leads >= 8) {
    suggestion = `${leads} leads in the pipeline. Some are aging — work them today.`;
  }

  /* Alert urgency always surfaces */
  if(alerts>2&&!actions.find(a=>a.href==="/alerts")){
    actions.unshift({icon:"🚨",label:`${alerts} Alerts`,href:"/alerts",why:`${alerts} alerts need review`,urgency:"now"});
  }

  return{suggestion,actions:actions.slice(0,4)};
}

export function NavProvider({children}:{children:React.ReactNode}){
  const location=useLocation();
  const nav=useNavigate();
  const [role,setRole_]=useState(()=>localStorage.getItem("seosZ_role")||"hod");
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [sidebarPinned,setSidebarPinned]=useState(()=>localStorage.getItem("seosZ_sidebar_pinned")==="1");
  const [empireStats,setStats]=useState<any>({});
  const [recentPaths,setRecent]=useState<string[]>(()=>{
    try{return JSON.parse(localStorage.getItem("seosZ_recent")||"[]");}catch{return[];}
  });
  const [frequentPaths,setFrequent]=useState<Record<string,number>>(()=>{
    try{return JSON.parse(localStorage.getItem("seosZ_frequent")||"{}");}catch{return{};}
  });

  const hour=new Date().getHours();
  const {suggestion,actions:suggestedActions}=getSituation(hour,empireStats,location.pathname,role);

  // Track navigation
  useEffect(()=>{
    const path=location.pathname;
    setRecent(prev=>{
      const next=[path,...prev.filter(p=>p!==path)].slice(0,8);
      localStorage.setItem("seosZ_recent",JSON.stringify(next));
      return next;
    });
    setFrequent(prev=>{
      const next={...prev,[path]:(prev[path]||0)+1};
      localStorage.setItem("seosZ_frequent",JSON.stringify(next));
      return next;
    });
  },[location.pathname]);

  const refreshStats=useCallback(()=>{
    post("get_empire_stats").then(r=>setStats((r as any).stats||{}));
  },[]);

  useEffect(()=>{refreshStats();},[]);
  useEffect(()=>{const id=setInterval(refreshStats,30000);return()=>clearInterval(id);},[]);

  const setRole=(r:string)=>{setRole_(r);localStorage.setItem("seosZ_role",r);};
  const setSidebarPinnedWithSave=(v:boolean)=>{
    setSidebarPinned(v);
    localStorage.setItem("seosZ_sidebar_pinned",v?"1":"0");
  };
  const navigate=(path:string)=>{ nav(path); if(!sidebarPinned)setSidebarOpen(false); };

  return(
    <Ctx.Provider value={{
      currentPath:location.pathname,role,hour,empireStats,
      suggestion,suggestedActions,recentPaths,frequentPaths,
      sidebarOpen,sidebarPinned,
      setSidebarOpen,setSidebarPinned:setSidebarPinnedWithSave,
      setRole,navigate,refreshStats,
    }}>
      {children}
    </Ctx.Provider>
  );
}
