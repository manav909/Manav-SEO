import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import React,{useState,useEffect,useRef} from "react";

const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
const STAGE_C:any={new:"hsl(var(--muted-foreground))",contacted:"#6366f1",demo_sent:"#8b5cf6",proposal_sent:"#a78bfa",negotiating:"#f59e0b",won:"#10b981",lost:"#ef4444",nurture:"#06b6d4"};
const MOOD_C=(s:number)=>s>=70?"#10b981":s>=50?"#6366f1":s>=30?"#f59e0b":"#ef4444";
const AGO=(d:string)=>{const s=Math.floor((Date.now()-new Date(d).getTime())/1000);if(s<60)return "just now";if(s<3600)return Math.floor(s/60)+"m ago";if(s<86400)return Math.floor(s/3600)+"h ago";return Math.floor(s/86400)+"d ago";};
const SUGG_ICON:any={close:"🎯",upsell:"⬆️",followup:"📨",audit:"🔍",content:"📝"};
const SUGG_C:any={high:"#ef4444",medium:"#f59e0b",low:"#6366f1"};

const DOC_TYPES=[
  {id:"proposal",label:"Custom Proposal",icon:"📋",desc:"Full personalised proposal"},
  {id:"pitch_email",label:"Cold Pitch Email",icon:"📧",desc:"Specific first-contact email"},
  {id:"followup_email",label:"Follow-up Email",icon:"✉️",desc:"Post discovery-call follow-up"},
  {id:"audit_summary",label:"Audit Summary",icon:"📊",desc:"Plain-English audit for client"},
  {id:"whatsapp_msg",label:"WhatsApp / Fiverr",icon:"💬",desc:"Short personalised message"},
  {id:"case_study",label:"Case Study",icon:"🏆",desc:"Results story for their industry"},
  {id:"objection_response",label:"Objection Response",icon:"🛡️",desc:"Address their specific concern"},
];

function DocGenerator({analysis,auditResult}:{analysis:any;auditResult:any}) {
  const [docType,setDocType]=React.useState("proposal");
  const [generating,setGenerating]=React.useState(false);
  const [html,setHtml]=React.useState("");
  const [title,setTitle]=React.useState("");
  const [clientName,setClientName]=React.useState("");
  const [leadUrl,setLeadUrl]=React.useState("");
  const [leadName,setLeadName]=React.useState("");
  const [leadIndustry,setLeadIndustry]=React.useState("");
  const iframeRef=React.useRef<HTMLIFrameElement>(null);
  const S3:any={
    card:{background:"hsl(var(--background))",border:"0.5px solid #1a1a3a",borderRadius:11,padding:14,marginBottom:10},
    btn:(c:string="#10b981")=>({background:`${c}18`,border:`0.5px solid ${c}40`,borderRadius:8,color:c,padding:"6px 14px",fontSize:12,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap" as const}),
    inp:{background:"hsl(var(--background))",border:"0.5px solid #1a1a3a",borderRadius:8,color:"hsl(var(--foreground))",padding:"7px 11px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const},
    sec:{fontSize:10,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase" as const,color:"hsl(var(--muted-foreground))",marginBottom:8},
  };
  const generate=async()=>{
    setGenerating(true);setHtml("");setTitle("");setClientName("");
    const r=await post("generate_client_doc",{docType,conversationAnalysis:analysis,auditResult,leadInfo:{url:leadUrl,name:leadName,industry:leadIndustry}});
    if((r as any).html){setHtml((r as any).html);setTitle((r as any).title||"SEO Season Document");setClientName((r as any).clientName||leadName||"");}
    else setHtml("<body style='font-family:sans-serif;padding:20px;color:#c00'><b>Error:</b> "+((r as any).error||"Failed")+"</body>");
    setGenerating(false);
  };
  const printDoc=()=>{const iw=iframeRef.current?.contentWindow;if(iw){iw.focus();iw.print();}};
  const downloadWord=()=>{
    const blob=new Blob(["﻿"+html],{type:"application/msword;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download="SEOSeason_"+(clientName||leadName||"Prospect").replace(/\s+/g,"_")+".doc";a.click();
  };
  return (
    <div>
      <div style={{color:"hsl(var(--muted-foreground))",fontSize:12,marginBottom:14}}>
        AI generates fully detailed client-ready documents — no placeholders. Uses conversation, audit, algorithm knowledge and proven results.
        {analysis?.main_need&&<span style={{color:"#10b981",marginLeft:6}}>✓ Conversation loaded</span>}
        {auditResult?.score!==undefined&&<span style={{color:"#10b981",marginLeft:6}}>✓ Audit loaded</span>}
      </div>
      {!html&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div>
            <div style={S3.sec}>Document Type</div>
            <div style={{display:"flex",flexDirection:"column" as const,gap:5}}>
              {DOC_TYPES.map(dt=>(
                <button key={dt.id} onClick={()=>setDocType(dt.id)} style={{padding:"10px 12px",borderRadius:9,cursor:"pointer",border:"none",textAlign:"left" as const,width:"100%",background:docType===dt.id?"rgba(99,102,241,.15)":"hsl(var(--background))",outline:docType===dt.id?"1.5px solid rgba(99,102,241,.5)":"0.5px solid #1a1a3a",color:"hsl(var(--foreground))"}}>
                  <span style={{fontSize:14,marginRight:8}}>{dt.icon}</span>
                  <span style={{fontSize:12,fontWeight:600}}>{dt.label}</span>
                  <div style={{fontSize:10,color:"hsl(var(--muted-foreground))",marginTop:2,marginLeft:22}}>{dt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={S3.sec}>Client Details</div>
            <div style={{display:"flex",flexDirection:"column" as const,gap:8,marginBottom:12}}>
              <input style={S3.inp} placeholder="Client website" value={leadUrl} onChange={(e:any)=>setLeadUrl(e.target.value)}/>
              <input style={S3.inp} placeholder="Client name or company" value={leadName} onChange={(e:any)=>setLeadName(e.target.value)}/>
              <input style={S3.inp} placeholder="Industry (e.g. dental clinic)" value={leadIndustry} onChange={(e:any)=>setLeadIndustry(e.target.value)}/>
            </div>
            {analysis?.main_need&&<div style={{...S3.card,borderColor:"rgba(16,185,129,.25)",padding:12,marginBottom:10}}><div style={{fontSize:10,color:"#10b981",fontWeight:700,marginBottom:4}}>CONVERSATION CONTEXT</div><div style={{fontSize:11,color:"hsl(var(--muted-foreground))",lineHeight:1.6}}><div><b>Need:</b> {analysis.main_need}</div>{analysis.hidden_concern&&<div><b>Concern:</b> {analysis.hidden_concern}</div>}</div></div>}
            {auditResult?.score!==undefined&&<div style={{...S3.card,borderColor:"rgba(99,102,241,.25)",padding:12,marginBottom:12}}><div style={{fontSize:10,color:"#a78bfa",fontWeight:700,marginBottom:4}}>AUDIT CONTEXT</div><div style={{fontSize:11,color:"hsl(var(--muted-foreground))",lineHeight:1.6}}><div><b>Score:</b> {auditResult.score}/100</div>{(auditResult.issues||[]).slice(0,2).map((iss:string,i:number)=><div key={i}>• {iss}</div>)}</div></div>}
            <button style={{...S3.btn("#6366f1"),width:"100%",padding:"12px 0",fontSize:13,borderRadius:10}} onClick={generate} disabled={generating}>{generating?"⏳ Generating...":"✨ Generate Document"}</button>
            {generating&&<div style={{fontSize:11,color:"hsl(var(--muted-foreground))",textAlign:"center" as const,marginTop:8}}>Fetching algorithm knowledge + writing full document...</div>}
          </div>
        </div>
      )}
      {html&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:8}}>
            <div style={{fontSize:13,fontWeight:700,color:"hsl(var(--foreground))",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{title}</div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button style={{...S3.btn("#10b981")}} onClick={downloadWord}>⬇ Download .doc</button>
              <button style={{...S3.btn("#6366f1")}} onClick={printDoc}>🖨 Print/PDF</button>
              <button style={{...S3.btn("hsl(var(--muted-foreground))")}} onClick={()=>{setHtml("");setTitle("");}}>← New</button>
            </div>
          </div>
          <div style={{fontSize:11,color:"hsl(var(--muted-foreground))",marginBottom:8,padding:"5px 10px",background:"rgba(16,185,129,.05)",borderRadius:6,border:"0.5px solid rgba(16,185,129,.2)"}}>💡 <b>Download .doc</b> opens in Word/Google Docs for editing before sending.</div>
          <div style={{border:"0.5px solid #1a1a3a",borderRadius:10,overflow:"hidden"}}>
            <iframe ref={iframeRef} srcDoc={html} style={{width:"100%",height:680,border:"none",background:"#fff"}} title="Document Preview"/>
          </div>
          <div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap" as const}}>
            <button style={{...S3.btn("#a78bfa"),fontSize:11}} onClick={generate} disabled={generating}>{generating?"Regenerating...":"↺ Regenerate"}</button>
            {DOC_TYPES.filter(d=>d.id!==docType).slice(0,3).map(d=>(
              <button key={d.id} style={{...S3.btn("hsl(var(--muted-foreground))"),fontSize:11}} onClick={()=>{setDocType(d.id);setTimeout(generate,50);}}>{d.icon} {d.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function BestMessagePanel({analysis,convText}:{analysis:any;convText:string}) {
  const [msg,setMsg]=React.useState("");
  const [edited,setEdited]=React.useState(false);
  const [considered,setConsidered]=React.useState<string[]>([]);
  const [loading,setLoading]=React.useState(false);
  const [emotion,setEmotion]=React.useState(5);
  const [tech,setTech]=React.useState(3);
  const [cp,setCp]=React.useState(false);
  const debRef=React.useRef<any>(null);

  React.useEffect(()=>{
    if(analysis?.main_need) gen(5,3);
  },[analysis?.main_need]);

  const gen=async(em:number,tc:number)=>{
    setLoading(true);setEdited(false);
    const r=await fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"generate_best_message",conversationText:convText,analysis,emotionLevel:em,technicalLevel:tc})}).then(r=>r.json()).catch(()=>({}));
    if((r as any).message){setMsg((r as any).message);setConsidered((r as any).considerations||[]);}
    setLoading(false);
  };

  const slide=(em:number,tc:number)=>{
    if(debRef.current)clearTimeout(debRef.current);
    debRef.current=setTimeout(()=>gen(em,tc),700);
  };

  const copy=()=>{navigator.clipboard.writeText(msg).catch(()=>{});setCp(true);setTimeout(()=>setCp(false),2000);};

  const SL:any={
    wrap:{background:"hsl(var(--background))",border:"0.5px solid #1a1a3a",borderRadius:11,padding:14,marginBottom:10},
    lbl:{fontSize:10,fontWeight:600,letterSpacing:1,textTransform:"uppercase" as const,color:"hsl(var(--muted-foreground))"},
    slRow:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4},
    slEnd:{fontSize:10,color:"hsl(var(--muted-foreground))"},
    slVal:{fontSize:11,fontWeight:700,color:"hsl(var(--foreground))",minWidth:50,textAlign:"center" as const},
    ta:{width:"100%",background:"rgba(16,185,129,.04)",border:"0.5px solid rgba(16,185,129,.2)",borderRadius:8,color:"#d0d0e8",padding:"10px 12px",fontSize:12,lineHeight:1.75,resize:"vertical" as const,outline:"none",fontFamily:"inherit",boxSizing:"border-box" as const,minHeight:100},
    btn:(c:string)=>({background:`${c}18`,border:`0.5px solid ${c}40`,borderRadius:8,color:c,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600}),
  };

  return (
    <div style={SL.wrap}>
      <div style={{fontSize:12,fontWeight:700,marginBottom:12,color:"hsl(var(--foreground))"}}>📋 Best Next Message</div>

      {/* Sliders */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:14}}>
        <div>
          <div style={SL.slRow}>
            <span style={SL.slEnd}>Professional</span>
            <span style={SL.slVal}>Emotion {emotion}</span>
            <span style={SL.slEnd}>Empathetic</span>
          </div>
          <input type="range" min={0} max={10} value={emotion} style={{width:"100%",accentColor:"#10b981"}}
            onChange={(e:any)=>{const v=Number(e.target.value);setEmotion(v);slide(v,tech);}}/>
        </div>
        <div>
          <div style={SL.slRow}>
            <span style={SL.slEnd}>Plain English</span>
            <span style={SL.slVal}>Technical {tech}</span>
            <span style={SL.slEnd}>Expert</span>
          </div>
          <input type="range" min={0} max={10} value={tech} style={{width:"100%",accentColor:"#6366f1"}}
            onChange={(e:any)=>{const v=Number(e.target.value);setTech(v);slide(emotion,v);}}/>
        </div>
      </div>

      {/* Message */}
      {loading?(
        <div style={{padding:"16px 12px",background:"rgba(99,102,241,.04)",borderRadius:8,border:"0.5px solid rgba(99,102,241,.2)",fontSize:12,color:"hsl(var(--muted-foreground))",textAlign:"center" as const}}>
          ✍️ Writing message at emotion {emotion} · technical {tech}...
        </div>
      ):(
        <textarea style={SL.ta} value={msg} rows={5}
          onChange={(e:any)=>{setMsg(e.target.value);setEdited(true);}}
          placeholder="Click Analyse to generate the message..."/>
      )}

      {/* Actions */}
      {msg&&!loading&&(
        <div style={{display:"flex",gap:6,marginTop:8,alignItems:"center",flexWrap:"wrap" as const}}>
          <button style={SL.btn(cp?"#10b981":"#a78bfa")} onClick={copy}>{cp?"✓ Copied!":"Copy Message"}</button>
          <button style={SL.btn("#6366f1")} onClick={()=>gen(emotion,tech)} disabled={loading}>↺ Regenerate</button>
          {edited&&<span style={{fontSize:10,color:"#f59e0b",padding:"2px 8px",background:"rgba(245,158,11,.1)",borderRadius:10}}>✏ Edited</span>}
        </div>
      )}

      {/* What I considered */}
      {considered.length>0&&!loading&&(
        <div style={{marginTop:12,padding:"8px 10px",background:"rgba(99,102,241,.04)",borderRadius:8,border:"0.5px solid rgba(99,102,241,.15)"}}>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:1.2,color:"#a78bfa",textTransform:"uppercase" as const,marginBottom:6}}>What I considered</div>
          <div style={{display:"flex",flexWrap:"wrap" as const,gap:5}}>
            {considered.map((c:string,i:number)=>(
              <span key={i} style={{fontSize:10,color:"#d0d0e8",background:"rgba(99,102,241,.08)",padding:"2px 8px",borderRadius:10,border:"0.5px solid rgba(99,102,241,.2)"}}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Show them / Quick wins */}
      {analysis?.demo_to_show?.length>0&&<><div style={{fontSize:10,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase" as const,color:"hsl(var(--muted-foreground))",marginTop:12,marginBottom:4}}>Show Them</div>{analysis.demo_to_show.map((d:string,i:number)=><div key={i} style={{fontSize:11,color:"#a78bfa",padding:"2px 0"}}>→ {d}</div>)}</>}
      {analysis?.quick_wins_to_mention?.length>0&&<><div style={{fontSize:10,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase" as const,color:"hsl(var(--muted-foreground))",marginTop:10,marginBottom:4}}>Quick Wins to Mention</div>{analysis.quick_wins_to_mention.map((w:string,i:number)=><div key={i} style={{fontSize:11,color:"#10b981",padding:"2px 0"}}>✓ {w}</div>)}</>}
    </div>
  );
}

export default function BdePanel() {
  const CTX_KEY = "bde_ctx_v3";
  // ── STATE ──
  const [tab,setTab]=useState<"fiverr"|"intel"|"tools"|"responses"|"leads"|"docs">("fiverr");
  const [convText,setConv]=useState("");
  const [analysing,setAnalysing]=useState(false);
  const [analysis,setAnalysis]=useState<any>(null);
  const [parsedLines,setParsed]=useState<any[]>([]);
  const [auditUrl,setAuditUrl]=useState("");
  const [auditFor,setAuditFor]=useState("");
  const [auditing,setAuditing]=useState(false);
  const [auditResult,setAuditResult]=useState<any>(null);
  const [quickResps,setQuickResps]=useState<any[]>([]);
  const [respCat,setRespCat]=useState("all");
  const [copied,setCopied]=useState<string|null>(null);
  const [assignments,setAssignments]=useState<any[]>([]);
  const [genResp,setGenResp]=useState(false);
  const [responses,setResponses]=useState<any>(null);
  const [selLine,setSelLine]=useState<number|null>(null);
  const textRef=useRef<HTMLTextAreaElement>(null);
  // Lead Intelligence
  const [leadNameInput,setLeadNameInput]=useState("");
  const [leadSaved,setLeadSaved]=useState(false);
  const [savingLead,setSavingLead]=useState(false);
  const [savedProspect,setSavedProspect]=useState<any>(null);
  const [prospects,setProspects]=useState<any[]>([]);
  const [loadingPros,setLoadingPros]=useState(false);
  const [selProspect,setSelProspect]=useState<any>(null);
  const [prospectConvs,setProspectConvs]=useState<any[]>([]);
  const [expandedConv,setExpandedConv]=useState<Set<number>>(new Set());
  const [suggestions,setSuggestions]=useState<any[]>([]);
  const [genSugg,setGenSugg]=useState(false);
  const [prospectTab,setProspectTab]=useState<"suggestions"|"history"|"docs">("suggestions");

  // ── RESTORE CONTEXT FROM LOCALSTORAGE ──
  useEffect(()=>{
    try {
      const stored = localStorage.getItem(CTX_KEY);
      if (stored) {
        const d = JSON.parse(stored);
        if (d.convText) setConv(d.convText);
        if (d.analysis) { setAnalysis(d.analysis); setParsed(d.parsed||[]); }
        if (d.auditResult) { setAuditResult(d.auditResult); setAuditUrl(d.auditUrl||''); }
        if (d.leadNameInput) setLeadNameInput(d.leadNameInput);
        if (d.savedProspect) { setSavedProspect(d.savedProspect); setLeadSaved(true); }
      }
    } catch {}
    post("get_quick_responses",{role:"bde"}).then(r=>setQuickResps((r as any).responses||[]));
    post("get_pipeline",{role:"bde"}).then(r=>setAssignments((r as any).assignments||[]));
    loadProspects();
  },[]);

  // ── PERSIST CONTEXT TO LOCALSTORAGE ──
  useEffect(()=>{
    if (!convText && !analysis && !auditResult) return;
    try {
      localStorage.setItem(CTX_KEY, JSON.stringify({
        convText: convText?.slice(0,3000), analysis, parsed: parsedLines?.slice(0,50),
        auditResult, auditUrl, leadNameInput, savedProspect, ts: Date.now()
      }));
    } catch {}
  },[convText, analysis, auditResult, leadNameInput, savedProspect]);

  // ── AUTO-EXTRACT URL FROM CONVERSATION ──
  useEffect(()=>{
    if (analysis && !auditUrl) {
      const m = convText.match(/(?:https?:\/\/)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/);
      if (m) setAuditUrl((m[1]||m[0]).replace(/^https?:\/\//,'').split('/')[0]);
    }
  },[analysis]);

  // ── SMART PULSE (contextual suggestions) ──
  const pulse = React.useMemo(()=>{
    const items:any[]=[];
    if (convText.trim() && !analysis && !analysing)
      items.push({icon:'🧠',msg:'Conversation ready to analyse',cta:'Analyse Now',target:'analyse',urgent:true});
    if (analysis && !auditResult && !auditing)
      items.push({icon:'🔍',msg:'Run site audit'+(auditUrl?' for '+auditUrl:'')+' — adds proof to pitch',cta:'Open Tools',target:'tools',urgent:(analysis?.fiverr_specific?.order_probability||0)>55});
    if (analysis && !leadSaved)
      items.push({icon:'💾',msg:'Save lead now — all context will be lost on browser close',cta:'Save Lead',target:'save',urgent:true});
    if (analysis && auditResult && !savedProspect)
      items.push({icon:'📋',msg:'Full context loaded — generate a personalised proposal',cta:'Generate Doc',target:'docs',urgent:false});
    if (savedProspect && !selProspect)
      items.push({icon:'🎯',msg:'AI closing suggestions ready for '+savedProspect.name,cta:'View Intel',target:'intel',urgent:false});
    return items;
  },[convText,analysis,auditResult,leadSaved,savedProspect,selProspect,analysing,auditing,auditUrl]);

  const handlePulse=(target:string)=>{
    if (target==='analyse') analyse();
    else if (target==='save') { if (leadNameInput||analysis) saveLead(); }
    else if (target==='tools') setTab('tools');
    else if (target==='docs') setTab('docs');
    else if (target==='intel') {
      if (savedProspect) { setSelProspect(savedProspect); setProspectConvs([]); setSuggestions([]); setProspectTab('suggestions'); }
      setTab('intel');
    }
  };

  const clearAll=()=>{
    if (!window.confirm('Clear all context? This will remove the current conversation, analysis and audit.')) return;
    setConv(''); setAnalysis(null); setParsed([]); setAuditResult(null); setAuditUrl(''); setAuditFor('');
    setLeadNameInput(''); setLeadSaved(false); setSavedProspect(null); setResponses(null); setSelLine(null);
    try { localStorage.removeItem(CTX_KEY); } catch {}
  };

  const loadProspects=async()=>{
    setLoadingPros(true);
    const r=await post("get_lead_prospects",{});
    setProspects((r as any).prospects||[]);
    setLoadingPros(false);
  };

  async function analyse(){
    if(!convText.trim())return;
    setAnalysing(true);setAnalysis(null);setParsed([]);setResponses(null);
    const r=await post("analyse_fiverr_conversation",{text:convText});
    setAnalysis((r as any).analysis);
    setParsed((r as any).parsed_lines||[]);
    setAnalysing(false);
  }

  async function saveLead(){
    if(!analysis)return;
    setSavingLead(true);
    const name=leadNameInput||analysis?.main_need?.split(' ').slice(0,4).join(' ')||'New Prospect';
    const np={name,url:auditResult?.url||auditUrl||'',industry:'',latestAnalysis:{...analysis,savedAt:new Date().toISOString()},lastSeen:new Date().toISOString(),conversationCount:1,status:'active'};
    setProspects(prev=>{const ex=prev.find((p:any)=>p.name===name);if(ex)return prev.map((p:any)=>p.name===name?{...p,conversationCount:p.conversationCount+1,latestAnalysis:np.latestAnalysis,lastSeen:np.lastSeen}:p);return [np,...prev];});
    setSavedProspect(np);
    setLeadSaved(true);
    setSavingLead(false);
    // Save to DB in background — pass FULL conversation text
    post("save_lead_conversation",{prospectName:name,prospectUrl:np.url,industry:"",analysis,conversationText:convText,auditResult,staffId:"bde"}).then((r:any)=>{if(r.error)console.warn("Lead DB save:",r.error);});
  }

  async function openProspect(p:any){
    setSelProspect(p);setProspectConvs([]);setSuggestions([]);setProspectTab('suggestions');setExpandedConv(new Set());
    setTab('intel');
    const r=await post("get_lead_conversations",{prospectName:p.name});
    setProspectConvs((r as any).conversations||[]);
  }

  async function generateSuggestions(){
    if(!selProspect)return;
    setGenSugg(true);setSuggestions([]);
    const latest=prospectConvs[0];
    let la:any=selProspect?.latestAnalysis||null;
    if (latest) { try{la=JSON.parse(latest?.response||'{}').analysis||la;}catch{} }
    const r=await post("generate_lead_suggestions",{prospectName:selProspect.name,prospectUrl:selProspect.url||"",latestAnalysis:la,auditData:null,conversationCount:prospectConvs.length});
    setSuggestions((r as any).suggestions||[]);
    setGenSugg(false);
  }

  async function doAudit(){
    if(!auditUrl.trim())return;
    setAuditing(true);setAuditResult(null);
    const r=await post("instant_audit_showcase",{url:auditUrl,forLead:auditFor});
    setAuditResult(r);setAuditing(false);
  }

  async function genResponses(){
    if(!analysis||!convText)return;
    setGenResp(true);
    const r=await post("generate_responses",{text:convText,analysis});
    setResponses(r);setGenResp(false);
  }

  function copyText(text:string,id:string){
    navigator.clipboard.writeText(text).catch(()=>{});
    setCopied(id);setTimeout(()=>setCopied(null),2000);
  }

  const cats=['all',...new Set(quickResps.map((r:any)=>r.category))];
  const filteredResps=respCat==='all'?quickResps:quickResps.filter((r:any)=>r.category===respCat);

  const S:any={
    root:{minHeight:'100vh',background:'hsl(var(--background))',color:'hsl(var(--foreground))',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'},
    hdr:{background:'var(--bg-deep,#0a0a1a)',borderBottom:'0.5px solid #1a1a3a',height:52,padding:'0 20px',position:'sticky' as const,top:0,zIndex:100,display:'flex',alignItems:'center',gap:14},
    tabs:{display:'flex',background:'var(--bg-deep,#0a0a1a)',borderBottom:'0.5px solid #1a1a3a',padding:'0 20px',overflowX:'auto' as const,gap:2},
    tab:{padding:'9px 13px',fontSize:12,fontWeight:500,cursor:'pointer',border:'none',background:'transparent',color:'hsl(var(--muted-foreground))',borderBottom:'2px solid transparent',whiteSpace:'nowrap' as const},
    tabA:{color:'#10b981',borderBottom:'2px solid #10b981'},
    body:{padding:'14px 18px'},
    card:{background:'var(--bg-card,hsl(var(--background)))',border:'0.5px solid #1a1a3a',borderRadius:11,padding:14,marginBottom:10},
    textarea:{width:'100%',background:'hsl(var(--background))',border:'0.5px solid #1a1a3a',borderRadius:9,color:'hsl(var(--foreground))',padding:'11px 13px',fontSize:13,lineHeight:1.6,resize:'vertical' as const,outline:'none',minHeight:120,boxSizing:'border-box' as const},
    inp:{background:'hsl(var(--background))',border:'0.5px solid #1a1a3a',borderRadius:8,color:'hsl(var(--foreground))',padding:'7px 11px',fontSize:13,outline:'none',boxSizing:'border-box' as const},
    btn:(c:string='#10b981')=>({background:`${c}18`,border:`0.5px solid ${c}40`,borderRadius:8,color:c,padding:'6px 12px',fontSize:12,cursor:'pointer',fontWeight:600}),
    badge:(c:string)=>({fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:20,background:`${c}20`,color:c}),
    sec:{fontSize:10,fontWeight:600,letterSpacing:1.2,textTransform:'uppercase' as const,color:'hsl(var(--muted-foreground))',marginBottom:8},
  };

  return (
    <div style={S.root}>
      <PortalNav/>

      {/* Header */}
      <div style={S.hdr}>
        <div style={{width:8,height:8,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 8px #10b981'}}/>
        <span style={{fontSize:14,fontWeight:700}}>💼 BDE Panel</span>
        <span style={S.badge('#10b981')}>BUSINESS DEVELOPMENT</span>
        <span style={{fontSize:10,color:'hsl(var(--muted-foreground))',marginLeft:'auto'}}>{assignments.length} leads · {prospects.length} in intel</span>
      </div>

      {/* Context Bar */}
      {(convText||analysis||auditResult)&&(
        <div style={{background:'rgba(99,102,241,.05)',borderBottom:'0.5px solid rgba(99,102,241,.15)',padding:'5px 18px',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' as const,fontSize:10}}>
          <span style={{color:'hsl(var(--muted-foreground))',fontWeight:700,fontSize:9,letterSpacing:1}}>CONTEXT:</span>
          {convText&&<span style={{color:'#10b981'}}>✓ {convText.split('\n').filter(Boolean).length} conversation lines</span>}
          {analysis&&<span style={{color:'#10b981'}}>✓ Analysed · {analysis.fiverr_specific?.order_probability||'?'}% close probability</span>}
          {auditResult&&<span style={{color:'#a78bfa'}}>✓ Audit: {auditResult.score}/100</span>}
          {leadSaved&&savedProspect&&<span style={{color:'#10b981'}}>✓ Saved: {savedProspect.name}</span>}
          {!leadSaved&&analysis&&<span style={{color:'#f59e0b'}}>⚠ Not saved yet</span>}
          <button style={{marginLeft:'auto',fontSize:10,background:'none',border:'0.5px solid rgba(239,68,68,.3)',borderRadius:6,color:'#ef4444',padding:'2px 8px',cursor:'pointer'}} onClick={clearAll}>✕ Clear</button>
        </div>
      )}

      {/* Smart Pulse */}
      {pulse.length>0&&(
        <div style={{borderBottom:'0.5px solid #1a1a3a',padding:'5px 18px',display:'flex',gap:6,overflowX:'auto' as const,background:'rgba(0,0,0,.08)'}}>
          {pulse.map((p:any,i:number)=>(
            <button key={i} onClick={()=>handlePulse(p.target)} style={{flexShrink:0,display:'flex',alignItems:'center',gap:6,background:p.urgent?'rgba(239,68,68,.06)':'rgba(99,102,241,.06)',border:`0.5px solid ${p.urgent?'rgba(239,68,68,.2)':'rgba(99,102,241,.2)'}`,borderRadius:8,padding:'4px 10px',cursor:'pointer',color:'hsl(var(--foreground))'}}>
              <span style={{fontSize:13}}>{p.icon}</span>
              <span style={{fontSize:11,color:'hsl(var(--muted-foreground))',maxWidth:260,whiteSpace:'nowrap' as const,overflow:'hidden',textOverflow:'ellipsis'}}>{p.msg}</span>
              <span style={{fontSize:10,fontWeight:700,color:p.urgent?'#ef4444':'#6366f1',marginLeft:4}}>→ {p.cta}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {([['fiverr','🟢 Fiverr'],['intel','🧠 Lead Intel'+(prospects.length?` (${prospects.length})`:'' )],['tools','⚡ Tools'],['responses','💬 Responses'],['leads','📋 Leads'],['docs','🏆 Documents']] as [string,string][]).map(([id,l])=>(
          <button key={id} style={{...S.tab,...(tab===id?S.tabA:{})}} onClick={()=>setTab(id as any)}>{l}</button>
        ))}
      </div>
      <div style={S.body}>

        {/* ═══ FIVERR ANALYSER ═══ */}
        {tab==='fiverr'&&(
          <div>
            <div style={{marginBottom:10,color:'hsl(var(--muted-foreground))',fontSize:12}}>Paste any Fiverr conversation — context is shared with all tools automatically.</div>
            <div style={S.card}>
              <textarea ref={textRef} style={S.textarea} value={convText} onChange={e=>setConv(e.target.value)}
                placeholder={'Paste Fiverr conversation here...\n\nClient: Hi can you help with my SEO?\nMe: Of course! Tell me about your business...'}/>
              <div style={{display:'flex',gap:8,marginTop:10}}>
                <button style={S.btn()} onClick={analyse} disabled={analysing||!convText.trim()}>{analysing?'Analysing...':'🧠 Analyse Conversation'}</button>
                {analysis&&<button style={S.btn('#a78bfa')} onClick={genResponses} disabled={genResp}>{genResp?'Generating...':'✍️ Generate Responses'}</button>}
                {convText&&<button style={S.btn('hsl(var(--muted-foreground))')} onClick={clearAll}>✕ Clear All</button>}
              </div>
            </div>

            {analysis&&(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  {/* Intelligence card */}
                  <div style={S.card}>
                    <div style={S.sec}>Conversation Intelligence</div>
                    <div style={{display:'flex',gap:10,marginBottom:10}}>
                      <div style={{background:'hsl(var(--background))',borderRadius:8,padding:'8px 12px',textAlign:'center' as const,flex:1}}>
                        <div style={{fontSize:20,fontWeight:700,color:MOOD_C(analysis.fiverr_specific?.order_probability||50)}}>{analysis.fiverr_specific?.order_probability||'?'}%</div>
                        <div style={{fontSize:9,color:'hsl(var(--muted-foreground))'}}>ORDER PROBABILITY</div>
                      </div>
                      <div style={{background:'hsl(var(--background))',borderRadius:8,padding:'8px 12px',flex:2}}>
                        <div style={{fontSize:10,fontWeight:600,marginBottom:2}}>Urgency</div>
                        <div style={{fontSize:13,color:analysis.urgency==='high'?'#ef4444':analysis.urgency==='medium'?'#f59e0b':'#10b981'}}>{analysis.urgency||'unknown'}</div>
                      </div>
                    </div>
                    <div style={{padding:'7px 10px',background:'rgba(16,185,129,.05)',borderRadius:7,border:'0.5px solid rgba(16,185,129,.15)',marginBottom:7}}>
                      <div style={{fontSize:9,color:'#10b981',fontWeight:600,marginBottom:2}}>MAIN NEED</div>
                      <div style={{fontSize:12,color:'#d0d0e8'}}>{analysis.main_need}</div>
                    </div>
                    <div style={{padding:'7px 10px',background:'rgba(245,158,11,.04)',borderRadius:7,border:'0.5px solid rgba(245,158,11,.15)',marginBottom:7}}>
                      <div style={{fontSize:9,color:'#f59e0b',fontWeight:600,marginBottom:2}}>HIDDEN CONCERN</div>
                      <div style={{fontSize:12,color:'#d0d0e8',fontStyle:'italic'}}>{analysis.hidden_concern}</div>
                    </div>
                    {analysis.fiverr_specific?.conversion_blocker&&(
                      <div style={{padding:'7px 10px',background:'rgba(239,68,68,.04)',borderRadius:7,border:'0.5px solid rgba(239,68,68,.15)'}}>
                        <div style={{fontSize:9,color:'#f87171',fontWeight:600,marginBottom:2}}>CONVERSION BLOCKER</div>
                        <div style={{fontSize:12,color:'#d0d0e8'}}>{analysis.fiverr_specific.conversion_blocker}</div>
                      </div>
                    )}
                  </div>
                  {/* Best message */}
                  <BestMessagePanel analysis={analysis} convText={convText}/>
                </div>

                {/* Save to Lead Intel */}
                {!leadSaved?(
                  <div style={{...S.card,borderColor:'rgba(99,102,241,.3)',background:'rgba(99,102,241,.04)'}}>
                    <div style={{fontSize:12,fontWeight:700,marginBottom:8,color:'#a78bfa'}}>💾 Save to Lead Intelligence</div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <input style={{...S.inp,flex:1}} placeholder='Prospect name or company...' value={leadNameInput} onChange={(e:any)=>setLeadNameInput(e.target.value)} onKeyDown={(e:any)=>{if(e.key==='Enter')saveLead();}}/>
                      <button style={{...S.btn('#6366f1'),padding:'7px 16px'}} onClick={saveLead} disabled={savingLead}>{savingLead?'Saving...':'Save Lead'}</button>
                      <button style={{...S.btn('#a78bfa'),padding:'7px 14px'}} onClick={()=>setTab('docs')}>Generate Doc</button>
                    </div>
                    <div style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginTop:6}}>Saves full conversation text, analysis, audit and all context. AI will suggest follow-ups based on algorithm updates.</div>
                  </div>
                ):(
                  <div style={{...S.card,borderColor:'rgba(16,185,129,.3)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:16}}>✅</span>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:'#10b981'}}>Saved — {savedProspect?.name}</div>
                        <div style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>Full conversation + analysis + audit stored. AI is tracking this lead.</div>
                      </div>
                      <button style={{...S.btn('#a78bfa'),marginLeft:'auto'}} onClick={()=>{if(savedProspect){setSelProspect(savedProspect);setProspectConvs([]);setSuggestions([]);setProspectTab('suggestions');}setTab('intel');}}>View Intel →</button>
                    </div>
                  </div>
                )}

                {/* Parsed lines */}
                {parsedLines.length>0&&(
                  <div style={S.card}>
                    <div style={S.sec}>Line-by-Line Analysis ({parsedLines.length} lines)</div>
                    <div style={{maxHeight:300,overflowY:'auto' as const}}>
                      {(analysis?.line_by_line||parsedLines).map((line:any,i:number)=>{
                        const isClient=line.speaker==='client'||line.intent;
                        return(
                          <div key={i} onClick={()=>setSelLine(selLine===i?null:i)} style={{padding:'7px 10px',marginBottom:4,borderRadius:8,cursor:'pointer',background:selLine===i?'rgba(99,102,241,.08)':isClient?'rgba(255,255,255,.03)':'transparent',border:`0.5px solid ${selLine===i?'rgba(99,102,241,.3)':isClient?'rgba(255,255,255,.06)':'transparent'}`}}>
                            <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                              <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:20,background:isClient?'rgba(99,102,241,.15)':'rgba(16,185,129,.15)',color:isClient?'#a78bfa':'#10b981',flexShrink:0}}>{isClient?'CLIENT':'YOU'}</span>
                              <div style={{flex:1}}>
                                <div style={{fontSize:12,color:'#d0d0e8'}}>{line.text||line.line}</div>
                                {(selLine===i||line.intent)&&isClient&&(
                                  <div style={{marginTop:5,display:'flex',gap:5,flexWrap:'wrap' as const}}>
                                    {line.intent&&<span style={{fontSize:9,color:'#f59e0b'}}>Intent: {line.intent}</span>}
                                    {line.emotion&&<span style={{fontSize:9,color:'#a78bfa'}}>Emotion: {line.emotion}</span>}
                                    {line.suggested_reply&&selLine===i&&(
                                      <div style={{width:'100%',marginTop:5,padding:'6px 10px',background:'rgba(16,185,129,.06)',borderRadius:6,border:'0.5px solid rgba(16,185,129,.2)'}}>
                                        <div style={{fontSize:9,color:'#10b981',marginBottom:2}}>SUGGESTED REPLY</div>
                                        <div style={{fontSize:11,color:'#d0d0e8'}}>{line.suggested_reply}</div>
                                        <button style={{...S.btn(),marginTop:4,padding:'3px 8px',fontSize:10}} onClick={e=>{e.stopPropagation();copyText(line.suggested_reply,`line_${i}`)}}>{copied===`line_${i}`?'✓':'Copy'}</button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Generated responses */}
                {responses?.responses?.length>0&&(
                  <div>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>Generated Response Options</div>
                    {responses.responses.map((r:any,idx:number)=>(
                      <div key={idx} style={{...S.card,borderColor:idx===0?'rgba(16,185,129,.3)':'hsl(var(--border))'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                          <div>
                            <div style={{fontSize:12,fontWeight:700}}>{r.title}</div>
                            <div style={{display:'flex',gap:6,marginTop:3}}>
                              <span style={S.badge('#6366f1')}>{r.tone}</span>
                              {r.conversion_probability&&<span style={S.badge(r.conversion_probability>=70?'#10b981':'#f59e0b')}>{r.conversion_probability}% chance</span>}
                            </div>
                          </div>
                          <button style={S.btn(copied===`resp_${idx}`?'#10b981':'#a78bfa')} onClick={()=>copyText(r.response||r.message||'',`resp_${idx}`)}>{copied===`resp_${idx}`?'✓ Copied!':'Copy'}</button>
                        </div>
                        <div style={{fontSize:12,color:'#d0d0e8',lineHeight:1.7,whiteSpace:'pre-wrap' as const}}>{r.response||r.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ LEAD INTELLIGENCE ═══ */}
        {tab==='intel'&&(
          <div>
            {selProspect?(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                  <button style={{...S.btn('hsl(var(--muted-foreground))'),fontSize:11}} onClick={()=>{setSelProspect(null);setSuggestions([]);setProspectConvs([]);}}>← All Leads</button>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:700}}>{selProspect.name}</div>
                    {selProspect.url&&<div style={{fontSize:11,color:'#6366f1'}}>{selProspect.url}</div>}
                  </div>
                  <span style={S.badge(STAGE_C[selProspect.status]||'#6366f1')}>{selProspect.status||'active'}</span>
                  <button style={S.btn('#10b981')} onClick={()=>{setAuditUrl(selProspect.url||'');setTab('tools');}}>🔍 Audit</button>
                  <button style={S.btn('#a78bfa')} onClick={()=>setTab('docs')}>📋 Doc</button>
                </div>
                <div style={{display:'flex',gap:4,marginBottom:14,borderBottom:'0.5px solid #1a1a3a',paddingBottom:0}}>
                  {(['suggestions','history','docs'] as const).map(t=>(
                    <button key={t} style={{...S.tab,...(prospectTab===t?S.tabA:{})}} onClick={()=>setProspectTab(t)}>
                      {t==='suggestions'?'🧠 AI Suggestions':t==='history'?'📅 Full History':'📎 Actions'}
                      {t==='suggestions'&&suggestions.length>0&&<span style={{...S.badge('#10b981'),marginLeft:4}}>{suggestions.length}</span>}
                    </button>
                  ))}
                </div>

                {prospectTab==='suggestions'&&(
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                      <div style={{fontSize:12,color:'hsl(var(--muted-foreground))'}}>Based on conversation history, algorithm updates and proven closing tactics.</div>
                      <button style={S.btn('#6366f1')} onClick={generateSuggestions} disabled={genSugg}>{genSugg?'⏳ Generating...':'✨ Generate Suggestions'}</button>
                    </div>
                    {suggestions.length===0&&!genSugg&&(
                      <div style={{...S.card,textAlign:'center' as const,padding:32}}>
                        <div style={{fontSize:28,marginBottom:8}}>🧠</div>
                        <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Get AI Suggestions for {selProspect.name}</div>
                        <div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginBottom:14}}>Claude analyses conversation history, current algorithm updates, and proven results to generate specific closing actions with scripts.</div>
                        <button style={{...S.btn('#6366f1'),padding:'10px 24px'}} onClick={generateSuggestions}>✨ Generate Suggestions</button>
                      </div>
                    )}
                    {genSugg&&<div style={{...S.card,textAlign:'center' as const,padding:32,color:'hsl(var(--muted-foreground))',fontSize:12}}>Fetching algorithm updates, analysing {prospectConvs.length} conversation(s), generating suggestions...</div>}
                    {suggestions.map((s:any,i:number)=>(
                      <div key={i} style={{...S.card,borderLeft:`3px solid ${SUGG_C[s.priority]||'#6366f1'}`,borderRadius:'0 11px 11px 0'}}>
                        <div style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:8}}>
                          <span style={{fontSize:18,flexShrink:0}}>{SUGG_ICON[s.type]||'💡'}</span>
                          <div style={{flex:1}}>
                            <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:4}}>
                              <span style={S.badge(SUGG_C[s.priority]||'#6366f1')}>{s.priority?.toUpperCase()||'ACTION'}</span>
                              <span style={S.badge('#6366f1')}>{s.type}</span>
                              {s.timing&&<span style={{fontSize:10,color:'hsl(var(--muted-foreground))'}}>⏰ {s.timing}</span>}
                            </div>
                            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{s.action}</div>
                            {s.reason&&<div style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:8,lineHeight:1.5}}>{s.reason}</div>}
                            {s.script&&(
                              <div style={{background:'rgba(99,102,241,.06)',border:'0.5px solid rgba(99,102,241,.2)',borderRadius:8,padding:'8px 12px'}}>
                                <div style={{fontSize:9,color:'#a78bfa',fontWeight:700,marginBottom:3}}>SCRIPT — COPY AND SEND</div>
                                <div style={{fontSize:12,color:'#d0d0e8',fontStyle:'italic',lineHeight:1.6}}>{s.script}</div>
                                <button style={{...S.btn('#a78bfa'),fontSize:10,marginTop:6,padding:'3px 10px'}} onClick={()=>copyText(s.script,`sugg_${i}`)}>{copied===`sugg_${i}`?'✓ Copied!':'Copy Script'}</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {prospectTab==='history'&&(
                  <div>
                    {prospectConvs.length===0&&(
                      <div>
                        {selProspect.latestAnalysis&&(
                          <div style={S.card}>
                            <div style={{fontSize:11,fontWeight:600,color:'hsl(var(--foreground))',marginBottom:8}}>Latest Context (from memory)</div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
                              {selProspect.latestAnalysis.main_need&&<div style={{background:'rgba(16,185,129,.05)',borderRadius:6,padding:'6px 8px'}}><div style={{fontSize:9,color:'#10b981',fontWeight:700}}>NEED</div><div style={{fontSize:11,color:'#d0d0e8'}}>{selProspect.latestAnalysis.main_need}</div></div>}
                              {selProspect.latestAnalysis.urgency&&<div style={{background:'rgba(245,158,11,.05)',borderRadius:6,padding:'6px 8px'}}><div style={{fontSize:9,color:'#f59e0b',fontWeight:700}}>URGENCY</div><div style={{fontSize:11,color:'#d0d0e8'}}>{selProspect.latestAnalysis.urgency}</div></div>}
                              {selProspect.latestAnalysis.fiverr_specific?.order_probability!==undefined&&<div style={{background:'rgba(99,102,241,.05)',borderRadius:6,padding:'6px 8px'}}><div style={{fontSize:9,color:'#a78bfa',fontWeight:700}}>PROBABILITY</div><div style={{fontSize:11,color:'#d0d0e8'}}>{selProspect.latestAnalysis.fiverr_specific.order_probability}%</div></div>}
                            </div>
                            <div style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>Full history loading from database...</div>
                          </div>
                        )}
                      </div>
                    )}
                    {prospectConvs.map((c:any,i:number)=>{
                      let d:any={};
                      try{d=JSON.parse(c.response||'{}');}catch{}
                      const isExpanded=expandedConv.has(i);
                      const toggleExpand=(idx:number)=>setExpandedConv(prev=>{const n=new Set(prev);n.has(idx)?n.delete(idx):n.add(idx);return n;});
                      return(
                        <div key={i} style={S.card}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                            <div style={{fontSize:11,fontWeight:600}}>Conversation #{prospectConvs.length-i}</div>
                            <span style={{fontSize:10,color:'hsl(var(--muted-foreground))'}}>{AGO(c.created_at)}</span>
                          </div>
                          {d.analysis&&(
                            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:10}}>
                              {d.analysis.main_need&&<div style={{background:'rgba(16,185,129,.05)',borderRadius:6,padding:'5px 8px'}}><div style={{fontSize:9,color:'#10b981',fontWeight:700}}>NEED</div><div style={{fontSize:11,color:'#d0d0e8'}}>{d.analysis.main_need}</div></div>}
                              {d.analysis.urgency&&<div style={{background:'rgba(245,158,11,.05)',borderRadius:6,padding:'5px 8px'}}><div style={{fontSize:9,color:'#f59e0b',fontWeight:700}}>URGENCY</div><div style={{fontSize:12,color:d.analysis.urgency==='high'?'#ef4444':d.analysis.urgency==='medium'?'#f59e0b':'#10b981'}}>{d.analysis.urgency}</div></div>}
                              {d.analysis.fiverr_specific?.order_probability!==undefined&&<div style={{background:'rgba(99,102,241,.05)',borderRadius:6,padding:'5px 8px'}}><div style={{fontSize:9,color:'#a78bfa',fontWeight:700}}>PROBABILITY</div><div style={{fontSize:12,color:'#d0d0e8'}}>{d.analysis.fiverr_specific.order_probability}%</div></div>}
                            </div>
                          )}
                          {/* FULL CONVERSATION TEXT */}
                          {d.conversationText&&(
                            <div style={{marginBottom:8}}>
                              <div style={{fontSize:9,color:'#6366f1',fontWeight:700,marginBottom:6,letterSpacing:1}}>FULL CONVERSATION</div>
                              <div style={{background:'rgba(0,0,0,.15)',borderRadius:7,padding:'8px 10px',maxHeight:isExpanded?600:140,overflow:'hidden' as const,position:'relative' as const}}>
                                {d.conversationText.split('\n').filter((l:string)=>l.trim()).map((line:string,li:number)=>{
                                  const isC=/^(client:|buyer:)/i.test(line.trim());
                                  return(
                                    <div key={li} style={{display:'flex',gap:6,marginBottom:5}}>
                                      <span style={{fontSize:9,fontWeight:700,color:isC?'#a78bfa':'#10b981',flexShrink:0,minWidth:20,paddingTop:1}}>{isC?'C:':'ME:'}</span>
                                      <span style={{fontSize:11,color:'#d0d0e8',lineHeight:1.55}}>{line.replace(/^(client:|me:|you:|buyer:)/i,'').trim()}</span>
                                    </div>
                                  );
                                })}
                                {!isExpanded&&<div style={{position:'absolute' as const,bottom:0,left:0,right:0,height:50,background:'linear-gradient(transparent,rgba(0,0,0,.6))'}}/>}
                              </div>
                              <button style={{fontSize:10,color:'#6366f1',background:'none',border:'none',cursor:'pointer',padding:'3px 0',marginTop:2}} onClick={()=>toggleExpand(i)}>{isExpanded?'▲ Collapse':'▼ Show full conversation'}</button>
                            </div>
                          )}
                          {d.auditResult&&<div style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>Audit: {d.auditResult.url} — {d.auditResult.score}/100</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {prospectTab==='docs'&&(
                  <div style={{...S.card,textAlign:'center' as const,padding:24}}>
                    <div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginBottom:12}}>Generate a document for {selProspect.name} with full context</div>
                    <button style={{...S.btn('#6366f1'),padding:'10px 24px'}} onClick={()=>setTab('docs')}>📋 Open Document Generator</button>
                  </div>
                )}
              </div>
            ):(
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                  <div style={{fontSize:12,color:'hsl(var(--muted-foreground))'}}>{loadingPros?'Loading...':`${prospects.length} leads tracked`}</div>
                  <button style={S.btn('#6366f1')} onClick={loadProspects}>↺ Refresh</button>
                </div>
                {prospects.length===0&&!loadingPros&&(
                  <div style={{...S.card,textAlign:'center' as const,padding:40}}>
                    <div style={{fontSize:32,marginBottom:12}}>🧠</div>
                    <div style={{fontSize:14,fontWeight:600,marginBottom:8}}>No leads saved yet</div>
                    <div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginBottom:16}}>Analyse a Fiverr conversation and save it. The AI will track every lead and generate follow-up suggestions.</div>
                    <button style={{...S.btn('#6366f1'),padding:'10px 24px'}} onClick={()=>setTab('fiverr')}>Start with Fiverr Analyser →</button>
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:10}}>
                  {prospects.map((p:any)=>{
                    const la=p.latestAnalysis;
                    const prob=la?.fiverr_specific?.order_probability;
                    return(
                      <div key={p.name} style={{...S.card,cursor:'pointer',transition:'border-color .15s'}} onClick={()=>openProspect(p)}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:700}}>{p.name}</div>
                            {p.url&&<div style={{fontSize:10,color:'#6366f1'}}>{p.url}</div>}
                          </div>
                          <div style={{display:'flex',flexDirection:'column' as const,alignItems:'flex-end',gap:3}}>
                            <span style={S.badge(STAGE_C[p.status]||'#6366f1')}>{p.status||'active'}</span>
                            {prob!==undefined&&<span style={S.badge(MOOD_C(prob))}>{prob}% close</span>}
                          </div>
                        </div>
                        {la&&(
                          <div style={{fontSize:11,color:'hsl(var(--muted-foreground))',lineHeight:1.5}}>
                            {la.main_need&&<div>📌 {la.main_need}</div>}
                            {la.urgency&&<div>⚡ <span style={{color:la.urgency==='high'?'#ef4444':la.urgency==='medium'?'#f59e0b':'#10b981'}}>{la.urgency} urgency</span></div>}
                            {la.savedAt&&<div style={{fontSize:10,marginTop:4}}>Last: {AGO(la.savedAt)}</div>}
                          </div>
                        )}
                        {p.conversationCount>1&&<div style={{fontSize:10,color:'#a78bfa',marginTop:6}}>{p.conversationCount} conversations</div>}
                        <div style={{marginTop:8,fontSize:10,color:'#6366f1',fontWeight:600}}>View Intelligence & Suggestions →</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ TOOLS ═══ */}
        {tab==='tools'&&(
          <div>
            <div style={S.card}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>⚡ Instant Site Audit</div>
              {analysis&&!auditUrl&&<div style={{fontSize:11,color:'#f59e0b',marginBottom:8}}>💡 Tip: URL auto-detected from conversation — verify below</div>}
              <div style={{display:'flex',gap:8,marginBottom:8}}>
                <input style={{...S.inp,flex:2}} value={auditUrl} onChange={e=>setAuditUrl(e.target.value)} placeholder='yourlead.com' onKeyDown={e=>e.key==='Enter'&&doAudit()}/>
                <input style={{...S.inp,flex:3}} value={auditFor} onChange={e=>setAuditFor(e.target.value)} placeholder='Lead context: e-commerce looking for organic traffic'/>
              </div>
              <button style={S.btn()} onClick={doAudit} disabled={auditing||!auditUrl}>{auditing?'Auditing...':'🔍 Generate Audit Showcase'}</button>
            </div>
            {auditResult&&(
              <div style={S.card}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700}}>{auditResult.url}</div>
                    <div style={{display:'flex',gap:8,marginTop:4}}>
                      <span style={S.badge(auditResult.score>=70?'#10b981':auditResult.score>=50?'#f59e0b':'#ef4444')}>Score: {auditResult.score}/100</span>
                      <span style={S.badge('#ef4444')}>{auditResult.issues?.length} issues</span>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button style={S.btn(copied==='audit_msg'?'#10b981':'#a78bfa')} onClick={()=>copyText(auditResult.showcase_message,'audit_msg')}>{copied==='audit_msg'?'✓ Copied!':'Copy Message'}</button>
                    <button style={S.btn('#6366f1')} onClick={()=>setTab('docs')}>Generate Proposal →</button>
                  </div>
                </div>
                <div style={{fontSize:12,color:'#d0d0e8',lineHeight:1.7,whiteSpace:'pre-wrap' as const,padding:'10px 12px',background:'hsl(var(--background))',borderRadius:8,border:'0.5px solid #1a1a3a',marginBottom:10}}>{auditResult.showcase_message}</div>
                {auditResult.issues?.length>0&&(
                  <><div style={S.sec}>Issues Found</div>
                  {auditResult.issues.map((issue:any,i:number)=>(
                    <div key={i} style={{fontSize:11,color:'hsl(var(--foreground))',padding:'5px 0',borderBottom:'0.5px solid #1a1a3a'}}>• {issue}</div>
                  ))}</> 
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ RESPONSES ═══ */}
        {tab==='responses'&&(
          <div>
            <div style={{marginBottom:10,color:'hsl(var(--muted-foreground))',fontSize:12}}>Pre-built responses for every Fiverr scenario.</div>
            <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap' as const}}>
              {cats.map(c=><button key={c} style={S.btn(respCat===c?'#10b981':'hsl(var(--muted-foreground))')} onClick={()=>setRespCat(c)}>{c.charAt(0).toUpperCase()+c.slice(1)}</button>)}
            </div>
            {filteredResps.map((r:any)=>(
              <div key={r.id} style={{...S.card,borderColor:copied===r.id?'rgba(16,185,129,.3)':'#1a1a3a'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700}}>{r.title}</div>
                    <div style={{display:'flex',gap:6,marginTop:3}}>
                      <span style={S.badge('#6366f1')}>{r.category}</span>
                      {r.usage_count&&<span style={{fontSize:9,color:'hsl(var(--muted-foreground))'}}>{r.usage_count} uses</span>}
                    </div>
                  </div>
                  <button style={S.btn(copied===r.id?'#10b981':'#a78bfa')} onClick={()=>{copyText(r.body,r.id);post('increment_response_usage',{responseId:r.id});}}>{copied===r.id?'✓ Copied!':'Copy'}</button>
                </div>
                <div style={{fontSize:12,color:'#d0d0e8',lineHeight:1.6,whiteSpace:'pre-wrap' as const}}>{r.body}</div>
              </div>
            ))}
            {!filteredResps.length&&<div style={{color:'hsl(var(--muted-foreground))',textAlign:'center' as const,padding:32}}>No responses found</div>}
          </div>
        )}

        {/* ═══ LEADS (assignments) ═══ */}
        {tab==='leads'&&(
          <div>
            <div style={{marginBottom:10,color:'hsl(var(--muted-foreground))',fontSize:12}}>{assignments.length} leads assigned via pipeline.</div>
            {assignments.map((a:any)=>(
              <div key={a.id} style={{...S.card,borderLeft:`3px solid ${STAGE_C[a.stage]||'hsl(var(--border))'}`,borderRadius:'0 11px 11px 0'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700}}>{a.prospects?.company||a.prospects?.name||a.prospects?.url||'Lead'}</div>
                    <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap' as const}}>
                      <span style={S.badge(STAGE_C[a.stage]||'hsl(var(--muted-foreground))')}>{a.stage}</span>
                      <span style={S.badge(a.priority==='hot'?'#ef4444':a.priority==='high'?'#f59e0b':'#6366f1')}>{a.priority}</span>
                      {a.prospects?.url&&<span style={{fontSize:10,color:'#6366f1'}}>{a.prospects.url}</span>}
                    </div>
                  </div>
                  {a.prospects?.url&&<button style={S.btn()} onClick={()=>{setAuditUrl(a.prospects.url);setTab('tools');}}>Quick Audit</button>}
                </div>
                {a.notes&&<div style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:8}}>{a.notes}</div>}
                {a.conversion_probability&&(
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <div style={{height:4,flex:1,background:'hsl(var(--border))',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${a.conversion_probability}%`,background:a.conversion_probability>=60?'#10b981':a.conversion_probability>=40?'#f59e0b':'#ef4444',borderRadius:2}}/>
                    </div>
                    <span style={{fontSize:10,color:'hsl(var(--muted-foreground))'}}>{a.conversion_probability}%</span>
                  </div>
                )}
              </div>
            ))}
            {!assignments.length&&<div style={{color:'hsl(var(--muted-foreground))',textAlign:'center' as const,padding:32}}>No leads assigned</div>}
          </div>
        )}

        {/* ═══ DOCUMENTS ═══ */}
        {tab==='docs'&&(
          <DocGenerator analysis={analysis} auditResult={auditResult}/>
        )}
      </div>
    </div>
  );
}