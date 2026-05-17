import React,{useState,useRef,useEffect} from "react";
import PortalNav from "@/components/PortalNav";
import {useProject} from "@/contexts/ProjectContext";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
export default function AskEmpire(){
  const{selectedProjectId:projectId}=useProject();
  const[messages,setMessages]=useState<{role:string,content:string}[]>([]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[sid]=useState(()=>`s_${Date.now()}`);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ref.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  const send=async()=>{ const q=input.trim(); if(!q||loading)return; setInput(""); setLoading(true); setMessages(m=>[...m,{role:"user",content:q}]); const r=await post("ask_empire",{question:q,sessionId:sid,projectId}); setMessages(m=>[...m,{role:"assistant",content:(r as any).answer||(r as any).error||"No response."}]); setLoading(false); };
  return(<div className="min-h-screen bg-background text-foreground flex flex-col"><PortalNav/><div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-4"><div><h1 className="text-2xl font-bold">Ask the Empire</h1><p className="text-sm text-muted-foreground mt-1">AI with full empire context</p></div><div className="flex-1 rounded-2xl border border-border bg-card p-4 overflow-y-auto min-h-96 max-h-[55vh] space-y-4">{!messages.length&&<div className="text-center py-12"><div className="text-3xl mb-2">🤖</div><div className="text-sm text-muted-foreground">Ask about clients, rankings, revenue or strategy.</div></div>}{messages.map((m,i)=>(<div key={i} className={`flex gap-2 ${m.role==="user"?"justify-end":""}`}>{m.role==="assistant"&&<div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs flex-shrink-0">AI</div>}<div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role==="user"?"bg-primary text-primary-foreground":"bg-secondary"}`}>{m.content}</div></div>))}{loading&&<div className="flex gap-2"><div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs flex-shrink-0">AI</div><div className="bg-secondary rounded-2xl px-4 py-2.5 text-sm text-muted-foreground">Thinking...</div></div>}<div ref={ref}></div></div><div className="flex gap-2"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask anything..." className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"/><button onClick={send} disabled={loading||!input.trim()} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Send</button></div></div></div>);
}
