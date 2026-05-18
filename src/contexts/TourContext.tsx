import React,{createContext,useContext,useState,useEffect,useCallback} from "react";

export interface TourStep {
  id: string;
  target?: string;        // CSS selector to spotlight
  title: string;
  body: string;
  hint?: string;          // smaller tip text
  position?: "top"|"bottom"|"left"|"right"|"center";
  action?: { label: string; href?: string; fn?: string };
  page?: string;          // page this step belongs to
  highlight?: string[];   // additional elements to highlight
  icon?: string;
}

interface TourCtx {
  active: boolean;
  step: number;
  steps: TourStep[];
  role: string;
  start: (role?: string) => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  goTo: (i: number) => void;
  setRole: (r: string) => void;
  completed: boolean;
}

const Ctx = createContext<TourCtx>({} as TourCtx);
export const useTour = () => useContext(Ctx);

// ── TOUR STEPS ──────────────────────────────────────────────
const ALL_STEPS: Record<string, TourStep[]> = {

  hod: [
    {
      id:"welcome",
      title:"Welcome to SEO Season Empire 👑",
      body:"You're looking at the most advanced SEO agency management platform ever built. This tour will take you through every capability in under 5 minutes. Everything is AI-powered, everything learns, and everything is designed to make you unstoppable.",
      position:"center",
      icon:"👑",
      hint:"Press → or click Next to continue",
    },
    {
      id:"hud_bar",
      target:".hud-stats-bar",
      title:"HUD Stats Bar — Live Empire Intelligence",
      body:"This bar is always visible. It shows your live empire stats — projects, learnings captured, verified tactics, LLM citations, leads, and alerts — updated in real time. The LIVE indicator means data is streaming.",
      position:"bottom",
      icon:"📡",
      hint:"Stats update every 30 seconds automatically",
    },
    {
      id:"dock",
      target:".dock-container",
      title:"Floating Dock — Navigate Anywhere Instantly",
      body:"Your command dock. Every major area of the empire is one click away. Hover any icon to see magnification. The glowing dot shows your current location. Works from any page.",
      position:"top",
      icon:"🚀",
      hint:"Try hovering the icons — they magnify like macOS",
    },
    {
      id:"build_dashboard",
      title:"📡 Build Dashboard — Mission Control",
      body:"Your surveillance screen. Every action Claude Code and Claude Chat take appears in the Live Feed. Stats bar shows empire health at a glance. DB Tables shows exactly what data is flowing. Health tab shows client scores. Generate morning briefs with one click.",
      position:"center",
      icon:"🏗",
      action:{ label:"Open Build Dashboard", href:"/build" },
      page:"/build",
    },
    {
      id:"empire_command",
      title:"👑 Empire Command — God View",
      body:"The single screen that shows your entire business. Client health scores, today's priority actions from the AI, unread alerts, hot leads. Open this every morning — the morning brief headline tells you the empire status in one sentence.",
      position:"center",
      icon:"👑",
      action:{ label:"Open Empire Command", href:"/empire" },
      page:"/empire",
    },
    {
      id:"ask_ai",
      title:"🤖 Ask the Empire — AI Intelligence",
      body:"Natural language access to everything. Ask 'Which client has the highest churn risk?', 'What SEO tactics worked best this month?', 'Who's my top BDE?'. The AI has full context on every client, project, staff member, learning, and metric.",
      position:"center",
      icon:"🤖",
      action:{ label:"Try Ask AI", href:"/ask" },
      page:"/ask",
    },
    {
      id:"staff_command",
      title:"🏛 Staff Command — HOD Control Panel",
      body:"Your department management screen. See every BDE's conversion rate, pipeline value, and activity. Toggle 12 individual permissions per staff member. Add new staff. The pipeline tab shows every lead across every BDE with deal values and stages.",
      position:"center",
      icon:"🏛",
      action:{ label:"Open Staff Command", href:"/staff-command" },
      page:"/staff-command",
    },
    {
      id:"revenue_bi",
      title:"💰 Revenue & BI — Business Intelligence",
      body:"MRR, ARR, pipeline value, monthly trend charts, client health vs revenue. See exactly how much you're making, what's pending, what's overdue. Add revenue records inline. The pipeline funnel shows conversion at every stage.",
      position:"center",
      icon:"💰",
      action:{ label:"Open Revenue BI", href:"/revenue" },
      page:"/revenue",
    },
    {
      id:"morning_brief",
      title:"🌅 Morning Brief — Daily AI Intelligence",
      body:"Generated every morning at 6am UTC. Analyses all empire data overnight and produces: one-line status headline, 3 priority actions with impact ratings, yesterday's wins, risks building up, opportunities spotted, algorithm watch. Your daily briefing in seconds.",
      position:"center",
      icon:"🌅",
      action:{ label:"See Today's Brief", href:"/morning-brief" },
      page:"/morning-brief",
    },
    {
      id:"brain",
      title:"🧠 The Brain — Compound Intelligence",
      body:"Every task executed extracts a learning. Every learning improves the next task. Learnings have confidence scores (79-95%) and are cross-applied to similar projects. The Brain is why the empire gets smarter every single day — not just for one client, but for all of them.",
      position:"center",
      icon:"🧠",
      action:{ label:"Open Brain Command", href:"/brain-command" },
      page:"/brain-command",
    },
    {
      id:"tour_complete_hod",
      title:"You're ready to run the empire 🚀",
      body:"You've seen the core of the system. Key daily flow: Morning Brief → Empire Command → Staff Command → Build Dashboard. The empire runs automatically — tasks execute, learnings capture, reports generate, health scores update. You just need to steer.",
      position:"center",
      icon:"🎯",
      hint:"You can restart this tour anytime from the ? button",
    },
  ],

  bde: [
    {
      id:"bde_welcome",
      title:"Welcome to your BDE Powerhouse 💼",
      body:"This tour shows you every tool you need to convert Fiverr leads and manage clients. Every tool is AI-powered and designed to make you faster, smarter, and more persuasive. Let's go.",
      position:"center",
      icon:"💼",
    },
    {
      id:"bde_panel",
      title:"💼 BDE Panel — Your Home Base",
      body:"This is your command centre. Five tabs: Fiverr Analyser, Instant Tools, Quick Responses, My Leads, and Showcase. Everything you need for a day on Fiverr is here — no switching between apps.",
      position:"center",
      icon:"💼",
      action:{ label:"Open BDE Panel", href:"/bde-panel" },
      page:"/bde-panel",
    },
    {
      id:"fiverr_analyser",
      title:"🟢 Fiverr Conversation Analyser",
      body:"Paste any Fiverr conversation. The AI gives you: order probability (0-100%), what the client really needs, their hidden concern, what's blocking the conversion, and the single best next message to send — ready to copy-paste.",
      position:"center",
      icon:"🟢",
      hint:"Works in any language — Arabic, Hindi, French, Spanish, German",
    },
    {
      id:"instant_audit",
      title:"⚡ Instant Site Audit — Technical Credibility in 10 Seconds",
      body:"Enter any lead's URL. The system crawls their site, finds real SEO issues, and generates a professional audit message ready to paste into Fiverr. Clients instantly see you're technical. Builds trust before they even reply.",
      position:"center",
      icon:"⚡",
      hint:"Most sellers never look at the site. You do. That's your edge.",
    },
    {
      id:"quick_responses",
      title:"💬 Quick Responses — Pre-built for Every Situation",
      body:"10+ tested responses covering intro, trust-building, pricing objections, project updates, and closing moves. All copy-ready. Usage is tracked — the most-used responses are shown first. You can save your own best performers.",
      position:"center",
      icon:"💬",
    },
    {
      id:"client_comms",
      title:"🧠 Client Communications Powerhouse",
      body:"For complex situations: paste any message in any language, get mood analysis with a visual meter (0-100), cultural context awareness, objection detection, and 3 response strategies with conversion probability scores. Used for difficult clients or high-value negotiations.",
      position:"center",
      icon:"🧠",
      action:{ label:"Open Client Comms", href:"/client-comms" },
      page:"/client-comms",
    },
    {
      id:"profile_chat",
      title:"👤 Your Profile — Performance & Department Chat",
      body:"Your professional profile shows your pipeline, conversion rate vs target, and permissions. The Dept Chat tab has 6 channels (General, Sales, Delivery, Leadership) for internal team communication. Your manager can see your stats here.",
      position:"center",
      icon:"👤",
      action:{ label:"Open My Profile", href:"/profile" },
      page:"/profile",
    },
    {
      id:"bde_complete",
      title:"You're ready to win on Fiverr 🏆",
      body:"Daily flow: BDE Panel → paste new conversations → Fiverr Analyser → copy best response → send. For technical questions: Instant Audit. For tough clients: Client Comms. Check My Leads tab to follow up stalling deals.",
      position:"center",
      icon:"🏆",
    },
  ],

  client: [
    {
      id:"client_welcome",
      title:"Welcome to Your SEO Dashboard 👋",
      body:"This is your window into your SEO campaign. Real metrics, real progress, no jargon. Everything here is updated automatically — you'll always see exactly what's happening with your project.",
      position:"center",
      icon:"👋",
    },
    {
      id:"client_metrics",
      title:"📈 Your Key Metrics",
      body:"Traffic, keyword rankings, AI visibility score, and backlinks — all tracked weekly. The trend indicators show whether you're growing or need attention. These update every week automatically.",
      position:"center",
      icon:"📈",
      action:{ label:"See My Dashboard", href:"/client-dashboard" },
      page:"/client-dashboard",
    },
    {
      id:"client_brief",
      title:"🎯 This Week's Focus",
      body:"Every Monday, the AI analyses all your data and creates a prioritised brief. It tells you the 3 most important things being worked on this week and why they matter for your goals. HIGH priority items move the needle most.",
      position:"center",
      icon:"🎯",
    },
    {
      id:"client_wins",
      title:"✅ Verified Wins",
      body:"We don't just say something worked — we verify it with data before claiming it as a win. Every item in the Wins section has been tested, measured, and confirmed to be working on your specific site.",
      position:"center",
      icon:"✅",
      hint:"Wins compound — each one makes the next one faster",
    },
    {
      id:"client_llm",
      title:"🤖 AI Visibility Score",
      body:"When someone asks ChatGPT or Claude for recommendations in your industry, are you mentioned? This score tracks exactly that. 40% of searches now go to AI first. Being cited here is the new page 1.",
      position:"center",
      icon:"🤖",
      action:{ label:"Check AI Visibility", href:"/llm-visibility" },
    },
    {
      id:"client_reports",
      title:"📋 Your Reports",
      body:"Monthly reports are generated automatically every Monday. They show exactly what was done, what results were produced, and what's planned next. Each report has a shareable link you can send to your team or board.",
      position:"center",
      icon:"📋",
      action:{ label:"View Reports", href:"/reports" },
    },
    {
      id:"client_complete",
      title:"You're all set 🌟",
      body:"Check your dashboard weekly. The morning brief updates automatically with your priorities. If you ever have questions, the AI assistant (bottom right) can answer anything about your campaign instantly.",
      position:"center",
      icon:"🌟",
    },
  ],

  pm: [
    {
      id:"pm_welcome",
      title:"Welcome, Project Manager 🗂",
      body:"This tour covers the delivery stack — Kanban, Brain learnings, task verifications, and client reporting. Everything in one place.",
      position:"center", icon:"🗂",
    },
    {
      id:"kanban",
      title:"📋 Kanban Delivery Board",
      body:"5 columns: Todo → In Progress → Review → Done → Verified. Drag tasks between columns. When you move a task to Done, it automatically creates a verification ticket in the Brain queue. Assign to staff, set due dates, track hours.",
      position:"center", icon:"📋",
      action:{ label:"Open Kanban", href:"/kanban" },
    },
    {
      id:"brain_pm",
      title:"🧠 Brain Learnings — Quality Control",
      body:"Every task execution feeds the Brain. As PM, review learnings regularly — high confidence scores (80+) mean a tactic is proven. Low confidence means it needs more testing. The Brain is your institutional knowledge.",
      position:"center", icon:"🧠",
      action:{ label:"Open Brain Command", href:"/brain-command" },
    },
    {
      id:"reports_pm",
      title:"📊 Client Reports",
      body:"Generate weekly/monthly/quarterly reports in one click. They pull from real task data — tasks completed, verified wins, learnings captured. Monday morning the system auto-generates weekly reports for all active projects.",
      position:"center", icon:"📊",
      action:{ label:"Open Reports", href:"/reports" },
    },
    {
      id:"pm_complete",
      title:"Ready to deliver excellence 🚀",
      body:"Daily flow: Check Kanban → move completed tasks to Done → review Brain learnings → check client health scores. Weekly: review reports before they go to clients.",
      position:"center", icon:"🚀",
    },
  ],
};

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive]    = useState(false);
  const [step, setStep]        = useState(0);
  const [role, setRole_]       = useState("hod");
  const [completed, setDone]   = useState(false);

  useEffect(() => {
    // Tour disabled — re-enable by restoring auto-start logic
    setDone(true); // always mark as done so overlay never shows
  }, []);

  const steps = ALL_STEPS[role] || ALL_STEPS.hod;

  const start = useCallback((r?: string) => {
    if (r) setRole_(r);
    setStep(0);
    setActive(true);
    setDone(false);
  }, []);

  const next = useCallback(() => {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      setActive(false);
      setDone(true);
      localStorage.setItem("seosZ_tour_done", "1");
    }
  }, [step, steps.length]);

  const prev = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
  }, [step]);

  const skip = useCallback(() => {
    setActive(false);
    setDone(true);
    localStorage.setItem("seosZ_tour_done", "1");
  }, []);

  const goTo = useCallback((i: number) => {
    setStep(Math.max(0, Math.min(i, steps.length - 1)));
  }, [steps.length]);

  const setRole = useCallback((r: string) => {
    setRole_(r);
    setStep(0);
  }, []);

  return (
    <Ctx.Provider value={{ active, step, steps, role, start, next, prev, skip, goTo, setRole, completed }}>
      {children}
    </Ctx.Provider>
  );
}
