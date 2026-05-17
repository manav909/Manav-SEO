import React,{useState,useEffect} from "react";
import {useParams} from "react-router-dom";
export default function PresentationView(){
  const{token}=useParams<{token:string}>();
  const[html,setHtml]=useState("");
  const[loading,setLoading]=useState(true);
  useEffect(()=>{ if(!token)return; fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"get_proposal_by_token",token})}).then(r=>r.json()).then(d=>{setHtml(d?.presentation?.html_content||d?.proposal?.html_content||"");setLoading(false);}).catch(()=>setLoading(false)); },[token]);
  if(loading)return(<div className="min-h-screen bg-background flex items-center justify-center"><div className="text-sm text-muted-foreground">Loading...</div></div>);
  if(!html)return(<div className="min-h-screen bg-background flex items-center justify-center"><div className="text-center"><div className="text-3xl mb-3">🔗</div><div className="text-sm text-muted-foreground">Not found.</div></div></div>);
  return(<div className="min-h-screen bg-background text-foreground"><div className="max-w-4xl mx-auto px-5 py-8" dangerouslySetInnerHTML={{__html:html}}></div></div>);
}
