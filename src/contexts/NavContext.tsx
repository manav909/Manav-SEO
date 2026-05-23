
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
  /* Phase 21 Block 2.22 — full ticker pool for the continuous SmartTopBar feed */
  tickerLines: string[];
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
   Phase 21 Block 2.22 — The Gossip Partner ticker
   A rich pool of one-liners generated from real signals — projects,
   learnings, alerts, leads, hour, day-of-week, recent activity.
   The SmartTopBar tickers through this pool continuously, never
   showing the same line twice in a row.
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

/* ════════════════════════════════════════════════════════════════════
   THE GOSSIP PARTNER — buildTickerPool()
   Generates the full pool of one-liners for the SmartTopBar ticker.
   Pulls from real signals: stats, hour, day, role, recent paths.
   Mixes witty, observational, motivating, reminding, joking, productive.
══════════════════════════════════════════════════════════════════════ */

function getDayName(d: Date): string {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}

function buildTickerPool(opts: {
  hour: number;
  stats: any;
  role: string;
  recentPaths: string[];
  currentPath: string;
}): string[] {
  const { hour: h, stats, role, recentPaths, currentPath } = opts;
  const now = new Date();
  const dayName = getDayName(now);
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isFriday  = dayOfWeek === 5;
  const isMonday  = dayOfWeek === 1;
  const date = now.getDate();

  const projects = stats.projects || 0;
  const learnings = stats.learnings || 0;
  const alerts = stats.alertsUnread || 0;
  const leads = stats.prospects || 0;

  const lines: string[] = [];

  /* ─── Time-of-day moods (12 in each window) ─── */
  if (h >= 5 && h < 10) {
    lines.push(
      "The empire ran overnight. The data is rested. So should the operator be — sip first, click second.",
      "Morning. Even your bugs slept. Be gentler with them than they deserve.",
      "Sunrise math: one good decision now is worth three good decisions at 4pm.",
      `${dayName} morning. The numbers haven't betrayed you yet today.`,
      "Coffee window. You're more dangerous in the next 90 minutes than the rest of the day combined.",
      "The to-do list still loves you. Try not to crush it on sight.",
      "Some genius wrote 'check positioning first thing' on yesterday's notes. That was you.",
      "Early hours bonus: your prospects are still loading their inbox. Beat them to it.",
      "Pre-noon clarity is a renewable resource. Don't spend it on Slack.",
      "Morning brief is fresh. Reading it costs three minutes. Skipping it costs the day.",
      `${learnings ? `${learnings} learnings accumulated.` : 'The brain is loading.'} Yesterday's wisdom is today's shortcut.`,
      "The sun came up. Google's algorithm didn't, fully. There may be drift to watch.",
    );
  } else if (h >= 10 && h < 13) {
    lines.push(
      "Peak hours. Your leads are checking email between meetings — they're more honest now than they will be at 3pm.",
      "Late morning is the sweet spot. Send the email you've been editing for three days.",
      "Pipeline is warmest now. Anything aging past today gets philosophical by tomorrow.",
      "Mid-morning data has settled. The morning's coffee thoughts are now testable.",
      "The 'I'll do it later' window is closing. Later is now.",
      "Active hours. Both prospects and pigeons are out. Aim accordingly.",
      `${leads ? `${leads} leads in pipeline.` : 'Pipeline is quiet.'} The aging ones know.`,
      "If you skip lunch to push one more thing — fine, but eat the fruit at least.",
      "Inbox is alive. Triage now or it triages you later.",
      "Most decisions made before noon get implemented. Most decisions after 4pm get postponed.",
      "Caffeine peaked. Confidence peaked. Use them on the brief you've been dodging.",
      "Workforce-online window. Use voice notes, not threads. Speed wins.",
    );
  } else if (h >= 13 && h < 16) {
    lines.push(
      "Post-lunch brain is analytical, not creative. Send it to a spreadsheet.",
      "Afternoon. Deep work clicks now — reports, audits, briefs.",
      "If you can't focus, that's the data telling you it's a walk-and-think problem, not a sit-and-type one.",
      "Around now is when yesterday's mistakes become today's lessons. Capture them.",
      "Mid-afternoon stretch. Your shoulders called — they want a 30-second pause.",
      "The second wind shows up between 2 and 3pm. Don't waste it on Slack.",
      "If a task has been on your list for 4+ days, it's lying about being important.",
      "Quiet creative window. Headphones in. One thing only.",
      "Reflection hour. Did the morning's work move anything? Genuinely?",
      "Your future self is currently grading your afternoon. Be kind to them.",
      "Watching the kanban board move feels productive. Moving it actually is.",
      "Afternoon's currency is depth, not speed. Trade accordingly.",
    );
  } else if (h >= 16 && h < 19) {
    lines.push(
      "Almost end-of-day. One last clean shipment beats five half-finished things.",
      "The 'I'll fix it tomorrow' temptation is loudest around now. Override gently.",
      "Pre-evening window. The pipeline you didn't touch today will look the same tomorrow — slightly worse.",
      "End of work hours for someone, somewhere. Probably not you.",
      "Your inbox isn't going to clear itself. But Slack genuinely could wait.",
      "Late afternoon = best time to draft, worst time to send. Hold sends till tomorrow.",
      "If today felt slow, check the kanban — sometimes 'slow' is actually 'deep'.",
      "The empire isn't watching the clock. Neither should the operator.",
      "Tomorrow's first hour is shaped by what you close today.",
      "Sundowner thoughts: what did the data tell you that you ignored?",
      "Fading-light pact: one task moved fully done, then you log off.",
      "Strategic patience window. Don't make irreversible calls at 5:45pm.",
    );
  } else if (h >= 19 && h < 23) {
    lines.push(
      "Evening. The empire keeps running. The operator should consider doing the opposite.",
      "Most great ideas show up between dinner and sleep. Keep a notebook nearby.",
      "If you're still reading dashboards at 9pm, the dashboards are winning.",
      "Twilight territory. Capture, don't decide. Decisions stale by morning.",
      "The day's done. The day's data isn't — and that's fine.",
      "Brain Learnings refreshes overnight. You don't have to.",
      "Wind-down hour. The to-do list isn't a love language.",
      "Pipeline runs on its own now. You've earned the next 30 minutes.",
      "Evening pause: name one thing today that moved. Bask in it briefly.",
      "Closing thought: what would past-you, three months ago, be proud of seeing tonight?",
      "Lights getting low. Save the brave decisions for morning courage.",
      "Don't end the day in the alerts tab. End it somewhere quieter.",
    );
  } else {
    lines.push(
      "Late hours. The empire's nocturnal — automations run while everyone sleeps.",
      "Anything you ship now, double-check it tomorrow. Owl hours lie.",
      "Notify-only mode. Don't email anyone after 11pm — the morning version of you will cringe.",
      "Midnight clarity is a myth. Midnight stubbornness is real. Beware.",
      "Burning oil. Whatever's keeping you up — write it down, then close the tab.",
      "Past hours. Even Atlas put the world down. The operator should too.",
      "Quiet hours: the most important task right now is rest. Yes, really.",
      "Brain dumps welcome. Decisions, less so. Sleep is the cheapest dev tool.",
      "If you're still here, at least open Manav's Pick — something interesting found you.",
      "Tomorrow-you will work twice as well if tonight-you closes the laptop.",
      "Late-night code is a love letter to refactors.",
      "The dashboards don't miss you. They'll be here. Go.",
    );
  }

  /* ─── Day-of-week flavor ─── */
  if (isMonday) {
    lines.push(
      "Monday. The week always looks bigger than it is. One thing at a time, friend.",
      "Mondays are auditions, not deadlines. Just show up.",
      "Fresh week. The pipeline is the same age as you. Slightly older now.",
    );
  }
  if (isFriday) {
    lines.push(
      "Friday. Close strong. One real win beats five rushed ones.",
      "Friday law: anything not shipped by 4pm is a Monday problem now.",
      "The week tried to push back. You're still here. That counts.",
    );
  }
  if (isWeekend) {
    lines.push(
      "Weekend. The empire runs lighter. So can the operator.",
      "Saturday/Sunday is for thinking, not for replying.",
      "Weekend tip: the alerts can wait. Probably. Mostly.",
      "Off-hours. The work pretends to be urgent. Most of it is lying.",
    );
  }

  /* ─── Project-aware ─── */
  if (projects > 0) {
    lines.push(
      `${projects} project${projects === 1 ? '' : 's'} in flight. Each one wishes you'd visit it briefly today.`,
      `${projects} active project${projects === 1 ? '' : 's'} — the math says the most-ignored one is also the loudest.`,
    );
  }

  /* ─── Learnings-aware ─── */
  if (learnings >= 100) {
    lines.push(
      `${learnings} learnings in the brain. Half are probably under 50% confidence — the honest ones.`,
      `${learnings} accumulated learnings — that's a lot of past you, talking to present you.`,
      `Brain has ${learnings} entries. Some of them are gold. The rest are gold-adjacent.`,
    );
  } else if (learnings > 0) {
    lines.push(
      `${learnings} learning${learnings === 1 ? '' : 's'} so far. Each one is past-you trying to help.`,
    );
  }

  /* ─── Alerts/leads urgency variants ─── */
  if (alerts >= 5) {
    lines.push(
      `${alerts} alerts piling up. Either triage them, or accept that they'll just keep accruing.`,
      `${alerts} unread alerts. The pile doesn't shrink on its own.`,
    );
  } else if (alerts >= 1) {
    lines.push(
      `${alerts} alert${alerts === 1 ? '' : 's'} sitting unread. Probably nothing. But check.`,
    );
  } else {
    lines.push(
      "Alert board is clean. Rare. Notice it.",
    );
  }
  if (leads >= 5) {
    lines.push(
      `${leads} leads waiting. The aging ones are basically time-bombs of politeness.`,
      `${leads} leads. Half of them think you forgot. Three of them are right.`,
    );
  } else if (leads >= 1) {
    lines.push(
      `${leads} lead${leads === 1 ? '' : 's'} in pipeline. Each one is hoping you'll remember.`,
    );
  }

  /* ─── Path-aware (where you spend time) ─── */
  if (currentPath === '/command') {
    lines.push(
      "Command page is the cockpit. Everything else is the wings.",
      "You're on /command. Translation: you're either deciding something or avoiding it.",
    );
  }
  if (recentPaths.includes('/data-room')) {
    lines.push(
      "The Data Room remembers everything you uploaded. Even the embarrassing CSV.",
    );
  }
  if (recentPaths.includes('/kanban') || currentPath === '/kanban') {
    lines.push(
      "Kanban tip: 'In Progress' isn't a personality trait. Move things.",
      "Cards in 'Doing' for over 7 days are emotionally attached to you. Let them go.",
    );
  }
  if (recentPaths.includes('/bde-panel')) {
    lines.push(
      "BDE Panel awaits. Fiverr never sleeps. Neither, apparently, does the prospect at 11:47pm.",
    );
  }
  if (currentPath.includes('manav') || currentPath === '/command') {
    lines.push(
      "Manav's Pick learns more every day. Today's connection might be 2 weeks old. The good ones age well.",
      "The pick engine is patient. It would rather skip a day than serve filler.",
    );
  }

  /* ─── Pure mood / motivational / observational ─── */
  lines.push(
    "Your future self will read today's commits with mild affection.",
    "If a meeting could be a Loom — it should be a Loom. If it could be a sentence, even better.",
    "Productivity tip: name the dread, then schedule it for 11am. Dread doesn't survive a meeting time.",
    "Most days don't feel like progress. Looking back across a quarter, they all were.",
    "The most underrated SEO move is finishing the brief you started.",
    "Hot take: the kanban is not a status report. It's a confession booth.",
    "An honest dashboard beats a beautiful one. Hide the metrics that are lying.",
    "The empire prefers slow, repeated correctness over fast, occasional brilliance.",
    "If you can't explain it to a client in one sentence, you don't understand it yet.",
    "Wishes get logged. Some become features. Some become legends. Most are accurate.",
    "Old data is wisdom in disguise. Don't trash it. Tag it.",
    "Confidence intervals are love letters. Wider isn't worse — it's honest.",
    "The best brief contains the second-best idea. The first idea hasn't survived editing yet.",
    "If the dashboard says you're great and the inbox says otherwise, trust the inbox.",
    "There's no such thing as a quick fix to organic traffic. There's just patient compounding.",
    "Google's algorithm is not your enemy. It's a poorly written contract that updates monthly.",
    "Your competitors are also winging it. They're just better dressed about it.",
    "Some operators ship daily. The good ones ship weekly. The best ship when it's actually ready.",
    "The hardest part of SEO isn't strategy — it's the patience to let the strategy work.",
    "Position 11 hurts more than position 50. Knowing that is half the job.",
    "Refresh the data. Then refresh it again. The third refresh is the one that's true.",
    "Empty kanban columns mean either 'all done' or 'haven't planned yet'. Usually the second.",
    "Don't measure success by what's on the screen. Measure it by what's no longer your problem.",
    `${date % 7 === 0 ? "Quiet days are when the empire compounds the most." : "Today is a day. Show up. That's the contract."}`,
  );

  /* ─── Role-aware ─── */
  if (role === 'hod') {
    lines.push(
      "HoD reality: your job is to make other people's days less chaotic. Even when yours is.",
      "Leading from the dashboard. The team can feel whether you're actually reading it.",
    );
  }
  if (role === 'bde' || role === 'bdm') {
    lines.push(
      "BDE move: the prospect who ghosted last week is back online today. Try a different angle.",
      "Sales truth: most won deals were lost twice before they were won.",
    );
  }

  /* Shuffle deterministically so the order is stable per page-load but
     different each load. Fisher-Yates with date-based seed. */
  const seed = getDaySeed() + h;
  const arr = [...lines];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

  /* Phase 21 Block 2.22 — build the ticker pool from current signals */
  const tickerLines = buildTickerPool({
    hour, stats: empireStats, role, recentPaths, currentPath: location.pathname,
  });

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
      suggestion,suggestedActions,tickerLines,recentPaths,frequentPaths,
      sidebarOpen,sidebarPinned,
      setSidebarOpen,setSidebarPinned:setSidebarPinnedWithSave,
      setRole,navigate,refreshStats,
    }}>
      {children}
    </Ctx.Provider>
  );
}
