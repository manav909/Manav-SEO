import React,{useState,useRef,useEffect} from "react";
import {useLocation} from "react-router-dom";
import {useTour} from "@/contexts/TourContext";

const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));

const PAGE_CONTEXT: Record<string,string> = {
  "/build":          "Build dashboard — live surveillance, empire stats, feed, health, DB tables",
  "/empire":         "Empire Command — god view, client health, alerts, morning brief priorities",
  "/ask":            "AI Ask Anything — natural language empire queries",
  "/morning-brief":  "Morning Brief — daily AI intelligence, priorities, wins, risks",
  "/health":         "Client Health — churn risk, upsell detection, health scores",
  "/alerts":         "Alert Center — ranking drops, LLM visibility losses, churn risks",
  "/client-comms":   "Client Communications — conversation analyser, objection handler, updates",
  "/bde-panel":      "BDE Panel — Fiverr analyser, instant audit, quick responses",
  "/staff-command":  "Staff Command — HOD view, pipeline, team performance, staff management",
  "/kanban":         "Kanban Board — delivery task management, 5 stages",
  "/revenue":        "Revenue & BI — MRR, ARR, pipeline value, client health vs revenue",
  "/brain-command":  "Brain Command — learning velocity, confidence scores, project health",
  "/llm-visibility": "LLM Visibility — AI citation tracking, improvement hints",
  "/reports":        "Reports — automated weekly/monthly/quarterly client reports",
  "/content-hub":    "Content Hub — LLM-optimised content briefs",
  "/intake":         "Intake — lead capture with instant site audit",
  "/client-dashboard":"Client Dashboard — your campaign metrics, wins, reports",
  "/content-writer": "Content Writer — briefs, calendar, LLM tips",
  "/profile":        "Staff Profile — performance metrics, pipeline, department chat",
  "/themes":         "Theme Gallery — preview all 12 smart themes",
};

const QUICK_QUESTIONS: Record<string,string[]> = {
  "/build":         ["What should I focus on today?","Explain the live feed","How do I read health scores?"],
  "/bde-panel":     ["How do I analyse a Fiverr message?","Best way to audit a lead's site?","How do quick responses work?"],
  "/staff-command": ["How do I add a new BDE?","What do the permission toggles do?","How is conversion rate calculated?"],
  "/client-comms":  ["How does the mood meter work?","How to handle a price objection?","Generate an update in Arabic"],
  "/brain-command": ["What is a confidence score?","How does cross-client learning work?","Why is brain score low?"],
  "/revenue":       ["How do I add a revenue record?","What does MRR mean?","How is ARR calculated?"],
  "/kanban":        ["How do I move tasks between columns?","What happens when I click Done?","How do I assign a task?"],
  "default":        ["What can I do on this page?","Show me the most important feature here","What should I do next?"],
};

export default function AIConcierge() {
  const location = useLocation();
  const { start, completed } = useTour();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{role:string;content:string}[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [sessionId] = useState(()=>`concierge_${Date.now()}`);
  const bottomRef = useRef<HTMLDivElement>(null);

  const currentPath = location.pathname;
  const pageCtx = PAGE_CONTEXT[currentPath] || `Page: ${currentPath}`;
  const quickQ = QUICK_QUESTIONS[currentPath] || QUICK_QUESTIONS.default;

  // Pulse when page changes to suggest help
  useEffect(() => {
    if (!open) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 4000);
      return () => clearTimeout(t);
    }
  }, [currentPath]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  // Welcome message when opened
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role:"assistant",
        content:`Hi! I'm your AI concierge. You're on **${pageCtx}**.\n\nI can answer anything about this page or the entire empire. What do you need?`,
      }]);
    }
  }, [open]);

  async function ask(q?: string) {
    const question = (q || input).trim();
    if (!question || loading) return;
    setInput("");
    setMessages(m => [...m, { role:"user", content:question }]);
    setLoading(true);
    const r = await post("ask_empire", {
      question: `[User is on ${pageCtx}] ${question}`,
      sessionId,
    });
    const answer = (r as any).answer || "I couldn't answer that right now.";
    setMessages(m => [...m, { role:"assistant", content:answer }]);
    setLoading(false);
  }

  return (
    <>
      {/* Floating button */}
      <div style={{
        position:"fixed", bottom:84, right:20, zIndex:890,
        display:"flex", flexDirection:"column" as const, alignItems:"flex-end", gap:8,
      }}>
        {/* Restart tour prompt (shows if tour completed) */}
        {completed && !open && pulsing && (
          <div style={{
            background:"rgba(6,6,20,.95)",
            border:"0.5px solid var(--border-glow)",
            borderRadius:12, padding:"8px 14px",
            fontSize:12, color:"var(--text-sub)",
            backdropFilter:"blur(20px)",
            animation:"warp-in .3s ease both",
            cursor:"pointer", maxWidth:200,
          }} onClick={() => start()}>
            Need help with this page? 💡
          </div>
        )}

        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width:48, height:48, borderRadius:"50%",
            background: open ? "var(--accent)" : "rgba(6,6,20,.9)",
            border:`1.5px solid ${open?"var(--accent)":"var(--border-glow)"}`,
            cursor:"pointer", fontSize:20,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow: open
              ? `0 0 20px var(--accent-glow), 0 8px 32px rgba(0,0,0,.5)`
              : `0 0 12px var(--accent-glow), 0 4px 16px rgba(0,0,0,.4)`,
            transition:"all .25s cubic-bezier(.34,1.56,.64,1)",
            transform: open ? "scale(1.1) rotate(0deg)" : pulsing ? "scale(1.05)" : "scale(1)",
            animation: pulsing && !open ? "breathe 2s ease-in-out infinite" : "none",
          }}
        >
          {open ? "✕" : "✦"}
        </button>
      </div>

      {/* Chat panel */}
      {open && (
        <div style={{
          position:"fixed", bottom:144, right:20, zIndex:889,
          width:340, height:420,
          background:"rgba(4,4,16,.97)",
          backdropFilter:"blur(40px)",
          borderRadius:18, overflow:"hidden",
          border:"0.5px solid var(--border-glow)",
          boxShadow:"0 20px 80px rgba(0,0,0,.7), 0 0 40px var(--accent-glow)",
          display:"flex", flexDirection:"column" as const,
          animation:"slide-up .3s cubic-bezier(.2,0,.2,1) both",
        }}>
          {/* Header */}
          <div style={{
            padding:"12px 16px", borderBottom:"0.5px solid var(--border)",
            background:"linear-gradient(180deg,rgba(255,255,255,.04) 0%,transparent 100%)",
            display:"flex", justifyContent:"space-between", alignItems:"center",
            flexShrink:0,
          }}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{
                width:28,height:28,borderRadius:9,background:"var(--accent-glow)",
                border:"0.5px solid var(--border-glow)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
              }}>✦</div>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>AI Concierge</div>
                <div style={{fontSize:9,color:"var(--text-muted)"}}>Context-aware · Always on</div>
              </div>
            </div>
            <button onClick={()=>start()}
              style={{fontSize:10,color:"var(--accent-soft)",background:"var(--accent-glow)",
                border:"0.5px solid var(--border-glow)",borderRadius:6,padding:"3px 8px",cursor:"pointer"}}>
              Tour
            </button>
          </div>

          {/* Messages */}
          <div style={{flex:1,overflowY:"auto" as const,padding:"10px 14px",display:"flex",
            flexDirection:"column" as const,gap:8}}>
            {messages.map((m,i)=>(
              <div key={i} style={{
                display:"flex",justifyContent:m.role==="user"?"flex-end" as const:"flex-start" as const,
              }}>
                <div style={{
                  maxWidth:"85%",padding:"9px 13px",
                  borderRadius:m.role==="user"?"13px 13px 4px 13px":"13px 13px 13px 4px",
                  background:m.role==="user"?"var(--accent)":"rgba(255,255,255,.06)",
                  border:m.role==="user"?"none":"0.5px solid var(--border)",
                  fontSize:12,color:m.role==="user"?"#fff":"var(--text-sub)",
                  lineHeight:1.55,
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{display:"flex",justifyContent:"flex-start" as const}}>
                <div style={{padding:"9px 13px",borderRadius:"13px 13px 13px 4px",
                  background:"rgba(255,255,255,.06)",border:"0.5px solid var(--border)",
                  display:"flex",gap:4,alignItems:"center"}}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{width:5,height:5,borderRadius:"50%",
                      background:"var(--accent)",opacity:.4,
                      animation:`breathe 1.2s ease-in-out ${i*0.2}s infinite`}}/>
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Quick questions */}
          {messages.length <= 1 && (
            <div style={{padding:"6px 14px",display:"flex",flexDirection:"column" as const,gap:4,flexShrink:0}}>
              {quickQ.map((q,i)=>(
                <button key={i} onClick={()=>ask(q)} style={{
                  textAlign:"left" as const,padding:"6px 10px",borderRadius:8,
                  fontSize:11,color:"var(--text-muted)",
                  background:"rgba(255,255,255,.04)",border:"0.5px solid var(--border)",
                  cursor:"pointer",transition:"all .15s",
                }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{padding:"10px 12px",borderTop:"0.5px solid var(--border)",
            display:"flex",gap:8,flexShrink:0}}>
            <input
              value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask();}}}
              placeholder="Ask anything..."
              style={{flex:1,background:"rgba(255,255,255,.05)",border:"0.5px solid var(--border)",
                borderRadius:9,color:"var(--text)",padding:"7px 10px",fontSize:12,
                outline:"none",fontFamily:"inherit"}}
            />
            <button onClick={()=>ask()} disabled={loading||!input.trim()}
              style={{width:32,height:32,borderRadius:9,background:"var(--accent)",
                border:"none",color:"#fff",cursor:"pointer",fontSize:14,
                display:"flex",alignItems:"center",justifyContent:"center",
                opacity:loading||!input.trim()?0.4:1}}>→</button>
          </div>
        </div>
      )}
    </>
  );
}
