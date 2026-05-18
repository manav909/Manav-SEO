import React,{useState,useEffect} from "react";
import {useParams} from "react-router-dom";
import PortalNav from '@/components/PortalNav';
export default function PresentationView(){
  const{token}=useParams<{token:string}>();
  const[data,setData]=useState<any>(null);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!token)return;
    fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"get_proposal_by_token",token})})
      .then(r=>r.json()).then(d=>{setData(d);setLoading(false);}).catch(()=>setLoading(false));
  },[token]);
  if(loading)return(
    <div className="empire-page" style={{minHeight:"100vh",background:"hsl(var(--background))",display:"flex",
      alignItems:"center",justifyContent:"center" as const,color:"hsl(var(--muted-foreground))",fontFamily:"inherit"}}>
      <PortalNav />
      
      <div style={{position:"relative",zIndex:1,textAlign:"center" as const}}>
        <div style={{width:36,height:36,border:"2.5px solid var(--accent)",borderTopColor:"transparent",
          borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
        <div style={{fontSize:13}}>Loading presentation...</div>
      </div>
    </div>
  );
  const html=data?.presentation?.html_content||data?.proposal?.html_content;
  if(!html)return(
    <div className="empire-page" style={{minHeight:"100vh",background:"hsl(var(--background))",display:"flex",
      alignItems:"center",justifyContent:"center" as const,color:"hsl(var(--muted-foreground))",fontFamily:"inherit"}}>
      
      <div style={{position:"relative",zIndex:1,textAlign:"center" as const}}>
        <div style={{fontSize:32,marginBottom:12}}>🔗</div>
        <div style={{fontSize:15,fontWeight:600,color:"hsl(var(--foreground))",marginBottom:6}}>Presentation not found</div>
        <div style={{fontSize:13}}>This link may have expired or is invalid.</div>
      </div>
    </div>
  );
  return(
    <div style={{minHeight:"100vh",background:"hsl(var(--background))",fontFamily:"inherit",color:"hsl(var(--foreground))"}}>
      <div style={{maxWidth:960,margin:"0 auto",padding:"32px 20px"}} dangerouslySetInnerHTML={{__html:html}}/>
    </div>
  );
}