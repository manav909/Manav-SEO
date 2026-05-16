import React,{useState,useEffect} from "react";
import {useParams} from "react-router-dom";
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
  if(loading)return<div style={{minHeight:"100vh",background:"#070710",display:"flex",alignItems:"center",justifyContent:"center",color:"#4b4b6a",fontFamily:"system-ui"}}>Loading...</div>;
  const html=data?.presentation?.html_content||data?.proposal?.html_content;
  if(!html)return<div style={{minHeight:"100vh",background:"#070710",display:"flex",alignItems:"center",justifyContent:"center",color:"#4b4b6a",fontFamily:"system-ui"}}>Not found.</div>;
  return<div style={{minHeight:"100vh",background:"#070710",fontFamily:"-apple-system,system-ui,sans-serif"}}><div style={{maxWidth:960,margin:"0 auto",padding:"32px 20px"}} dangerouslySetInnerHTML={{__html:html}}/></div>;
}
