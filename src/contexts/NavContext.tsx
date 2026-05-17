
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

function getSituation(hour:number,stats:any,path:string,role:string):{
  suggestion:string; actions:Action[];
}{
  const h=hour;
  const alerts=stats.alertsUnread||0;
  const leads=stats.prospects||0;

  // JARVIS speaks based on context
  let suggestion="";
  const actions:Action[]=[];

  if(h>=6&&h<10){
    suggestion="Good morning. Your empire ran overnight. Check the morning brief first.";
    actions.push({icon:"🌅",label:"Morning Brief",href:"/morning-brief",why:"Generated overnight with today's priorities",urgency:"now"});
    if(alerts>0)actions.push({icon:"🚨",label:`${alerts} Alerts`,href:"/alerts",why:`${alerts} unread alerts need attention`,urgency:"now"});
    actions.push({icon:"❤️",label:"Client Health",href:"/health",why:"Daily health check — spot churn risk early",urgency:"soon"});
  }else if(h>=10&&h<14){
    suggestion="Peak hours. Your leads are online. Best time to send responses and audits.";
    if(role==="bde"||role==="bdm"){
      actions.push({icon:"💼",label:"BDE Panel",href:"/bde-panel",why:"Fiverr is most active now",urgency:"now"});
      actions.push({icon:"💬",label:"Client Comms",href:"/client-comms",why:"Handle pending conversations",urgency:"now"});
    }else{
      actions.push({icon:"📋",label:"Kanban Board",href:"/kanban",why:"Move tasks forward during peak hours",urgency:"now"});
      actions.push({icon:"👑",label:"Empire Command",href:"/empire",why:"Check pipeline and team status",urgency:"now"});
    }
    if(leads>0)actions.push({icon:"🎯",label:"New Leads",href:"/bde-panel",why:`${leads} leads in pipeline need attention`,urgency:"soon"});
  }else if(h>=14&&h<18){
    suggestion="Afternoon. Good time for deep work — reports, analysis, content briefs.";
    actions.push({icon:"📊",label:"Reports",href:"/reports",why:"Generate or review client reports",urgency:"soon"});
    actions.push({icon:"📝",label:"Content Hub",href:"/content-hub",why:"Create briefs while thinking is sharp",urgency:"soon"});
    actions.push({icon:"🤖",label:"LLM Visibility",href:"/llm-visibility",why:"Run AI citation checks",urgency:"later"});
  }else if(h>=18&&h<22){
    suggestion="Evening wind-down. Great time to plan tomorrow and review today's work.";
    actions.push({icon:"🧠",label:"Brain Learnings",href:"/brain-command",why:"Review what the AI learned today",urgency:"soon"});
    actions.push({icon:"💰",label:"Revenue BI",href:"/revenue",why:"Check today's pipeline movement",urgency:"soon"});
    actions.push({icon:"📡",label:"Build Dashboard",href:"/build",why:"End-of-day empire status check",urgency:"later"});
  }else{
    suggestion="Late session. The empire runs while you rest. Automation is handling the rest.";
    actions.push({icon:"🤖",label:"Ask the Empire",href:"/ask",why:"Quick AI briefing on status",urgency:"now"});
    actions.push({icon:"📡",label:"Build Dashboard",href:"/build",why:"See what happened today",urgency:"soon"});
  }

  // Alert urgency always surfaces
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
