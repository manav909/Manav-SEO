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

function DocGenerator({analysis,auditResult,prospectName="",prospectUrl="",clientIndustry=""}:{analysis:any;auditResult:any;prospectName?:string;prospectUrl?:string;clientIndustry?:string}) {
  const [docType,setDocType]=React.useState("proposal");
  const [generating,setGenerating]=React.useState(false);
  const [html,setHtml]=React.useState("");
  const [title,setTitle]=React.useState("");
  const [clientName,setClientName]=React.useState("");
  const [leadUrl,setLeadUrl]=React.useState("");
  const [leadName,setLeadName]=React.useState("");
  const [leadIndustry,setLeadIndustry]=React.useState("");
  const iframeRef=React.useRef<HTMLIFrameElement>(null);
  // Auto-fill fields from context (only when field is still empty)
  React.useEffect(()=>{
    if(prospectUrl&&!leadUrl) setLeadUrl(prospectUrl);
    else if(auditResult?.url&&!leadUrl) setLeadUrl(auditResult.url);
    if(prospectName&&!leadName) setLeadName(prospectName);
    if(clientIndustry&&!leadIndustry) setLeadIndustry(clientIndustry);
    // Infer industry from analysis main_need if not set
    if(!leadIndustry&&analysis?.main_need){
      const mn=(analysis.main_need||"").toLowerCase();
      const industryMap:Record<string,string>={dental:"dental clinic",clinic:"medical clinic",restaurant:"restaurant",ecommerce:"e-commerce",shop:"retail/e-commerce",store:"retail",lawyer:"legal services",law:"legal services",gym:"fitness",fitness:"fitness",salon:"beauty salon",hotel:"hospitality",real:"real estate",estate:"real estate",saas:"SaaS",software:"software/tech",plumb:"plumbing",electr:"electrical services",clean:"cleaning services"};
      for(const[k,v]of Object.entries(industryMap)){if(mn.includes(k)){setLeadIndustry(v);break;}}
    }
  },[prospectName,prospectUrl,clientIndustry,auditResult?.url,analysis?.main_need]);
  const S3:any={
    card:{background:"hsl(var(--background))",border:"0.5px solid #1a1a3a",borderRadius:11,padding:14,marginBottom:10},
    btn:(c:string="#10b981")=>({background:`${c}18`,border:`0.5px solid ${c}40`,borderRadius:8,color:c,padding:"6px 14px",fontSize:12,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap" as const}),
    inp:{background:"hsl(var(--background))",border:"0.5px solid #1a1a3a",borderRadius:8,color:"hsl(var(--foreground))",padding:"7px 11px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const},
    sec:{fontSize:10,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase" as const,color:"hsl(var(--muted-foreground))",marginBottom:8},
  };
  const generate=async()=>{
    setGenerating(true);setHtml("");setTitle("");setClientName("");
    const r=await post("generate_client_doc",{docType,conversationAnalysis:analysis,auditResult,brandName:brandName||'Manav S',leadInfo:{url:leadUrl,name:leadName,industry:leadIndustry}});
    if((r as any).html){setHtml((r as any).html);setTitle((r as any).title||"SEO Season Document");setClientName((r as any).clientName||leadName||"");}
    else setHtml("<body style='font-family:sans-serif;padding:20px;color:#c00'><b>Error:</b> "+((r as any).error||"Failed")+"</body>");
    setGenerating(false);
  };
  const printDoc=()=>{const iw=iframeRef.current?.contentWindow;if(iw){iw.focus();iw.print();}};
  const downloadWord=()=>{
    const blob=new Blob(["﻿"+html],{type:"application/msword;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=(brandName||"MaNavS").replace(/\s+/g,"_")+"_"+(clientName||leadName||"Prospect").replace(/\s+/g,"_")+".doc";a.click();
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


// ─── Fiverr conversation parser ───────────────────────────────

// ─── Fiverr parser ─────────────────────────────────────────────────────────────
// Fiverr copy format per line: USERNAME → (PROMOTED) → TIMESTAMP → message lines
// Key insight: a real speaker line is ALWAYS followed within 3 lines by a timestamp.
// Without lookahead, single words in long messages (Schema, Redirects, etc.) get
// mistaken for usernames. Lookahead prevents every false positive.
function parseFiverr(raw: string): any[] {
  const TS_RE  = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s+\d{1,2}:\d{2}\s*(am|pm)$/i;
  const UN_RE  = /^[a-zA-Z0-9][a-zA-Z0-9_.]{2,29}$/;
  const SKIP_EXACT = new Set(['promoted','we have your back','learn more','translate to english']);
  const SKIP_STARTS = ['for added safety','for your protection','this message relates to'];

  const allLines = raw.split('\n').map(l => l.trim());

  const isTS    = (l: string) => TS_RE.test(l);
  const isSkip  = (l: string) => {
    const ll = l.toLowerCase();
    if (!l) return true;
    if (SKIP_EXACT.has(ll)) return true;
    if (ll.includes('translate to english')) return true;
    return SKIP_STARTS.some(p => ll.startsWith(p));
  };
  const isUN    = (l: string) => l === 'Me' || UN_RE.test(l);

  // A line is a real speaker header ONLY if a timestamp follows within 4 non-empty lines
  // (handles: USERNAME, PROMOTED, blank, TIMESTAMP  — all valid gaps)
  const isSpeakerLine = (idx: number): boolean => {
    if (!isUN(allLines[idx])) return false;
    for (let j = idx + 1; j < Math.min(idx + 5, allLines.length); j++) {
      const next = allLines[j].trim();
      if (!next) continue;               // blank line — keep looking
      if (isTS(next)) return true;       // timestamp found — confirmed speaker
      if (isSkip(next)) continue;        // PROMOTED etc — keep looking
      return false;                      // real content before timestamp — not a speaker
    }
    return false;
  };

  const msgs: any[] = [];
  let cur: any = null;
  let clientName = '';
  let skipGig = false;

  for (let li = 0; li < allLines.length; li++) {
    const line = allLines[li];
    if (!line) continue;

    if (skipGig) {
      if (isSpeakerLine(li)) { skipGig = false; }
      else { continue; }
    }

    if (isSkip(line)) {
      if (line.toLowerCase().startsWith('this message relates to')) skipGig = true;
      continue;
    }

    if (isTS(line)) {
      if (cur && !cur.timestamp) cur.timestamp = line;
      continue;
    }

    if (isSpeakerLine(li)) {
      if (cur && cur.text.trim()) msgs.push({ ...cur, text: cur.text.trim() });
      const isMe = line === 'Me';
      if (!isMe && !clientName) clientName = line;
      cur = { speaker: isMe ? 'me' : 'client', speakerName: line, text: '', timestamp: '' };
      continue;
    }

    // Regular message text
    if (cur) cur.text = cur.text ? cur.text + '\n' + line : line;
    else {
      // Text before any speaker detected — treat as client
      if (!clientName) clientName = 'Client';
      cur = { speaker: 'client', speakerName: clientName, text: line, timestamp: '' };
    }
  }
  if (cur && cur.text.trim()) msgs.push({ ...cur, text: cur.text.trim() });
  return msgs.filter(m => m.text.trim().length > 1);
}


// ─── Styles for flags / emotions ────────────────────────────────────────────────
const RISK_C: any = {
  TOS_VIOLATION:'#ef4444', MULTIPLE_MESSAGES:'#f59e0b',
  WEAK_CLOSE:'#a78bfa',   NO_VALUE_PROP:'#f59e0b',
};
const RISK_LABEL: any = {
  TOS_VIOLATION:'🚨 ToS Violation',  MULTIPLE_MESSAGES:'📨 Multiple msgs',
  WEAK_CLOSE:'⚡ Weak close',          NO_VALUE_PROP:'💡 No value shown',
};
const EMO_C: any = {
  curious:'#6366f1', interested:'#10b981', trusting:'#10b981',
  hesitant:'#f59e0b', frustrated:'#ef4444', sceptical:'#ef4444', price_sensitive:'#f59e0b',
};
const EMO_ICON: any = {
  curious:'🤔', interested:'😊', trusting:'🤝',
  hesitant:'🤷', frustrated:'😤', sceptical:'🧐', price_sensitive:'💰',
};
const QUALITY_C: any = { good:'#10b981', ok:'#f59e0b', poor:'#ef4444' };

// ─── ConversationView ────────────────────────────────────────────────────────────
function ConversationView({
  msgs, deepAnalysis, onAction,
}: {
  msgs: any[]; deepAnalysis: any;
  onAction: (type: string, value: string) => void;
}) {
  const [showBetter, setShowBetter] = React.useState<Set<number>>(new Set());
  const [expandedMsgs, setExpandedMsgs] = React.useState<Set<number>>(new Set());
  const toggleMsg = (i: number) => setExpandedMsgs(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const [cpId, setCpId] = React.useState<string|null>(null);

  const toggleBetter = (i: number) =>
    setShowBetter(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  // Exact 0-based index match — Claude is told to use same integer as INDEX in the list
  const ma = (idx: number) =>
    deepAnalysis?.messages?.find((m: any) => Number(m.index) === idx);

  const cp = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCpId(id); setTimeout(() => setCpId(null), 2000);
  };

  if (!msgs.length) return (
    <div style={{color:'hsl(var(--muted-foreground))',fontSize:12,padding:20,textAlign:'center' as const}}>
      Paste a Fiverr conversation above to see the preview.
    </div>
  );

  // Conversion probability timeline bar
  const timeline = msgs.map((_, i) => ma(i)?.conversionAfter).filter(v => v !== undefined) as number[];

  return (
    <div>
      {/* Emotional / conversion timeline */}
      {timeline.length > 0 && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,color:'hsl(var(--muted-foreground))',fontWeight:700,letterSpacing:1.2,marginBottom:5}}>
            CONVERSION PROBABILITY FLOW
          </div>
          <div style={{display:'flex',alignItems:'flex-end',gap:3,height:44,background:'rgba(0,0,0,.1)',padding:'4px 6px',borderRadius:8}}>
            {msgs.map((_, i) => {
              const a = ma(i); const v = a?.conversionAfter;
              if (v === undefined) return <div key={i} style={{flex:1,height:4,background:'rgba(255,255,255,.1)',borderRadius:2}}/>;
              const h = Math.max(4, Math.round(v / 100 * 36));
              const c = v >= 70 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444';
              return (
                <div key={i} title={`Msg ${i+1}: ${v}%`} style={{flex:1,height:h,background:c,borderRadius:'2px 2px 0 0',opacity:.9}}/>
              );
            })}
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'hsl(var(--muted-foreground))',marginTop:3}}>
            <span>Message 1</span>
            <span style={{fontWeight:700,color:deepAnalysis.overallConversion>=60?'#10b981':'#ef4444'}}>
              Final: {deepAnalysis.overallConversion}%
            </span>
          </div>
        </div>
      )}

      {/* Per-message bubbles */}
      <div style={{display:'flex',flexDirection:'column' as const,gap:10}}>
        {msgs.map((msg, i) => {
          const a    = ma(i);
          const isMe = msg.speaker === 'me';
          const prob = a?.conversionAfter;
          const pc   = prob !== undefined ? (prob >= 70 ? '#10b981' : prob >= 50 ? '#f59e0b' : '#ef4444') : undefined;
          const hasIssue = !!(a && (a.missed || a.riskFlag || a.betterReply));

          return (
            <div key={i}>
              {/* Row */}
              <div style={{display:'flex',flexDirection:isMe?'row-reverse':'row' as const,alignItems:'flex-start',gap:8}}>
                {/* Avatar */}
                <div style={{
                  width:34,height:34,borderRadius:'50%',flexShrink:0,
                  background: isMe ? '#19345E' : '#8B6914',
                  border:`2px solid ${isMe?'#2a4a7a':'#a07820'}`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:13,fontWeight:700,color:'#fff',
                }}>
                  {isMe ? 'Y' : msg.speakerName?.charAt(0)?.toUpperCase() || 'C'}
                </div>

                {/* Bubble column */}
                <div style={{maxWidth:'74%',display:'flex',flexDirection:'column' as const,alignItems:isMe?'flex-end':'flex-start'}}>
                  {/* Speaker line */}
                  <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:3,flexWrap:'wrap' as const,flexDirection:isMe?'row-reverse':'row' as const}}>
                    <span style={{fontSize:11,fontWeight:700,color:'hsl(var(--foreground))'}}>
                      {isMe ? 'Me' : msg.speakerName}
                    </span>
                    {msg.timestamp && (
                      <span style={{fontSize:10,color:'hsl(var(--muted-foreground))'}}>{msg.timestamp}</span>
                    )}
                    {/* Client emotion badge */}
                    {!isMe && a?.emotion && (
                      <span style={{
                        fontSize:10,fontWeight:600,padding:'1px 8px',borderRadius:10,
                        background:`${EMO_C[a.emotion]||'#6366f1'}20`,
                        color:EMO_C[a.emotion]||'#6366f1',
                        border:`0.5px solid ${EMO_C[a.emotion]||'#6366f1'}50`,
                      }}>
                        {EMO_ICON[a.emotion]||'💬'} {a.emotion}
                      </span>
                    )}
                    {/* Risk flag */}
                    {a?.riskFlag && (
                      <span style={{
                        fontSize:10,fontWeight:700,padding:'1px 8px',borderRadius:10,
                        background:`${RISK_C[a.riskFlag]||'#f59e0b'}20`,
                        color:RISK_C[a.riskFlag]||'#f59e0b',
                        border:`0.5px solid ${RISK_C[a.riskFlag]||'#f59e0b'}50`,
                      }}>
                        {RISK_LABEL[a.riskFlag]||a.riskFlag}
                      </span>
                    )}
                    {/* Quality pill for me messages */}
                    {isMe && a?.quality && (
                      <span style={{fontSize:9,color:QUALITY_C[a.quality]||'#6366f1',fontWeight:600}}>
                        {a.quality==='good'?'✓ Good':a.quality==='ok'?'~ OK':'✗ Poor'}
                      </span>
                    )}
                  </div>

                  {/* Message bubble */}
                  <div style={{
                    background: isMe?'rgba(25,52,94,.6)':'rgba(99,102,241,.1)',
                    border:`0.5px solid ${isMe?'rgba(25,52,94,.9)':'rgba(99,102,241,.25)'}`,
                    borderRadius: isMe?'12px 2px 12px 12px':'2px 12px 12px 12px',
                    padding:'9px 13px',fontSize:13,color:'hsl(var(--foreground))',
                    lineHeight:1.65,whiteSpace:'pre-wrap' as const,
                  }}>
                    {expandedMsgs.has(i)||msg.text.length<=400?msg.text:msg.text.slice(0,400)+'…'}
                  </div>

                  {/* Show more/less for long messages */}
                  {msg.text.length > 400 && (
                    <button style={{fontSize:10,background:'none',border:'none',color:'#6366f1',cursor:'pointer',padding:'2px 0',alignSelf:isMe?'flex-end':'flex-start'}} onClick={()=>toggleMsg(i)}>
                      {expandedMsgs.has(i)?'▲ Show less':'▼ Show full message ('+msg.text.length+' chars)'}
                    </button>
                  )}
                  {/* Probability bar */}
                  {prob !== undefined && (
                    <div style={{display:'flex',alignItems:'center',gap:5,marginTop:4,flexDirection:isMe?'row-reverse':'row' as const}}>
                      <div style={{width:72,height:3,background:'rgba(255,255,255,.1)',borderRadius:2,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${prob}%`,background:pc,borderRadius:2}}/>
                      </div>
                      <span style={{fontSize:10,color:pc,fontWeight:700}}>{prob}%</span>
                      {a.delta!==undefined && a.delta!==0 && (
                        <span style={{fontSize:10,color:a.delta>0?'#10b981':'#ef4444'}}>
                          {a.delta>0?'+':''}{a.delta}%
                        </span>
                      )}
                    </div>
                  )}

                  {/* Client intent */}
                  {!isMe && a?.intent && (
                    <div style={{fontSize:10,color:'hsl(var(--muted-foreground))',marginTop:2,fontStyle:'italic',maxWidth:320}}>{a.intent}</div>
                  )}
                </div>
              </div>

              {/* Analysis panel — always visible for me messages with any issue */}
              {isMe && a && (a.missed || a.betterReply || a.riskFlag) && (
                <div style={{
                  margin:'5px 0 0 42px',borderRadius:10,padding:'10px 14px',
                  background:'rgba(0,0,0,.18)',
                  border:`0.5px solid ${a.riskFlag?RISK_C[a.riskFlag]+'40':'rgba(245,158,11,.2)'}`,
                }}>
                  {/* TOS warning */}
                  {a.riskFlag === 'TOS_VIOLATION' && (
                    <div style={{marginBottom:8,padding:'7px 10px',background:'rgba(239,68,68,.1)',borderRadius:7,border:'0.5px solid rgba(239,68,68,.4)',fontSize:11,color:'#f87171',lineHeight:1.55}}>
                      🚨 <b>Fiverr ToS Violation.</b> Sharing external contacts (email, phone) can permanently suspend your account. Fiverr actively scans for this. Always use Fiverr's messaging system only.
                    </div>
                  )}
                  {/* Missed */}
                  {a.missed && (
                    <div style={{marginBottom:a.betterReply?8:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#f59e0b',letterSpacing:1,marginBottom:3}}>⚠ WHAT YOU MISSED</div>
                      <div style={{fontSize:12,color:'#d0d0e8',lineHeight:1.55}}>{a.missed}</div>
                    </div>
                  )}
                  {/* Better reply */}
                  {a.betterReply && (
                    <div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                        <div style={{fontSize:10,fontWeight:700,color:'#10b981',letterSpacing:1}}>💡 BETTER VERSION</div>
                        <button style={{fontSize:10,background:'none',border:'none',color:'#6366f1',cursor:'pointer',padding:0}} onClick={()=>toggleBetter(i)}>
                          {showBetter.has(i)?'▲ Hide':'▼ Show'}
                        </button>
                      </div>
                      {showBetter.has(i) && (
                        <div>
                          <div style={{fontSize:12,color:'#d0d0e8',lineHeight:1.65,background:'rgba(16,185,129,.06)',padding:'8px 12px',borderRadius:8,border:'0.5px solid rgba(16,185,129,.2)',whiteSpace:'pre-wrap' as const,fontStyle:'italic',marginBottom:6}}>
                            {a.betterReply}
                          </div>
                          <button style={{fontSize:10,background:'rgba(16,185,129,.15)',border:'0.5px solid rgba(16,185,129,.3)',borderRadius:6,color:'#10b981',padding:'3px 12px',cursor:'pointer',fontWeight:600}}
                            onClick={()=>{cp(a.betterReply,'b'+i); onAction('use_as_next',a.betterReply);}}>
                            {cpId==='b'+i?'✓ Copied!':'Use as Next Message'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Good message note */}
              {isMe && a?.quality==='good' && !a.missed && !a.riskFlag && (
                <div style={{margin:'3px 0 0 42px',fontSize:10,color:'#10b981'}}>✓ Good message</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Overall summary */}
      {deepAnalysis?.topMiss && (
        <div style={{marginTop:16,padding:'10px 14px',background:'rgba(245,158,11,.06)',borderRadius:10,border:'0.5px solid rgba(245,158,11,.2)'}}>
          <div style={{fontSize:9,color:'#f59e0b',fontWeight:700,letterSpacing:1,marginBottom:3}}>BIGGEST MISTAKE</div>
          <div style={{fontSize:12,color:'#d0d0e8',marginBottom:deepAnalysis.nextAction?8:0}}>{deepAnalysis.topMiss}</div>
          {deepAnalysis.nextAction && (
            <div>
              <div style={{fontSize:9,color:'#10b981',fontWeight:700,letterSpacing:1,marginBottom:3}}>DO THIS RIGHT NOW</div>
              <div style={{fontSize:12,color:'#d0d0e8',marginBottom:6}}>{deepAnalysis.nextAction}</div>
              <button style={{fontSize:10,background:'rgba(16,185,129,.15)',border:'0.5px solid rgba(16,185,129,.3)',borderRadius:6,color:'#10b981',padding:'3px 12px',cursor:'pointer'}}
                onClick={()=>onAction('use_as_next',deepAnalysis.nextAction)}>
                Use as Next Message
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default function BdePanel() {
  const CTX_KEY = "bde_ctx_v3";
  const [tab,setTab]=useState<'fiverr'|'intel'|'tools'|'responses'|'leads'|'docs'>('fiverr');
  // Conversation state
  const [rawPaste,setRawPaste]=useState('');
  const [parsedMsgs,setParsedMsgs]=useState<any[]>([]);
  const [convText,setConv]=useState('');
  const [analysing,setAnalysing]=useState(false);
  const [analysis,setAnalysis]=useState<any>(null);
  const [deepAnalysis,setDeepAnalysis]=useState<any>(null);
  const [deepLoading,setDeepLoading]=useState(false);
  const [deepError,setDeepError]=useState('');
  const [parsedLines,setParsed]=useState<any[]>([]);
  const [responses,setResponses]=useState<any>(null);
  const [genResp,setGenResp]=useState(false);
  const [selLine,setSelLine]=useState<number|null>(null);
  const [nextMsg,setNextMsg]=useState('');
  const [attachments,setAttachments]=useState<any[]>([]);
  const [extracting,setExtracting]=useState(false);
  // Audit state
  const [auditUrl,setAuditUrl]=useState('');
  const [auditFor,setAuditFor]=useState('');
  const [auditing,setAuditing]=useState(false);
  const [auditResult,setAuditResult]=useState<any>(null);
  // UI state
  const [quickResps,setQuickResps]=useState<any[]>([]);
  const [respCat,setRespCat]=useState('all');
  const [copied,setCopied]=useState<string|null>(null);
  const [assignments,setAssignments]=useState<any[]>([]);
  // Lead state
  const [leadNameInput,setLeadNameInput]=useState('');
  const [leadSaved,setLeadSaved]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [savingLead,setSavingLead]=useState(false);
  const [savedProspect,setSavedProspect]=useState<any>(null);
  const [prospects,setProspects]=useState<any[]>([]);
  const [loadingPros,setLoadingPros]=useState(false);
  const [showLeadPicker,setShowLeadPicker]=useState(false);
  const [loadingLead,setLoadingLead]=useState(false);
  const [selProspect,setSelProspect]=useState<any>(null);
  const [prospectConvs,setProspectConvs]=useState<any[]>([]);
  const [expandedConv,setExpandedConv]=useState<Set<number>>(new Set());
  const [suggestions,setSuggestions]=useState<any[]>([]);
  const [genSugg,setGenSugg]=useState(false);
  const [prospectTab,setProspectTab]=useState<'suggestions'|'history'|'docs'>('suggestions');
  const textRef=useRef<HTMLTextAreaElement>(null);

  // ── RESTORE FROM LOCALSTORAGE ──
  useEffect(()=>{
    try {
      const d=JSON.parse(localStorage.getItem(CTX_KEY)||'{}');
      if (d.rawPaste) { setRawPaste(d.rawPaste); const p=parseFiverr(d.rawPaste); setParsedMsgs(p); setConv(p.map((m:any)=>(m.speaker==='me'?'Me':'Client')+': '+m.text).join('\n')); }
      if (d.analysis) { setAnalysis(d.analysis); setParsed(d.parsed||[]); }
      if (d.deepAnalysis) setDeepAnalysis(d.deepAnalysis);
      if (d.auditResult) { setAuditResult(d.auditResult); setAuditUrl(d.auditUrl||''); }
      if (d.leadNameInput) setLeadNameInput(d.leadNameInput);
      if (d.savedProspect) { setSavedProspect(d.savedProspect); setLeadSaved(true); }
    } catch {}
    post('get_quick_responses',{role:'bde'}).then(r=>setQuickResps((r as any).responses||[]));
    post('get_pipeline',{role:'bde'}).then(r=>setAssignments((r as any).assignments||[]));
    loadProspects();
  },[]);

  // ── PERSIST TO LOCALSTORAGE ──
  useEffect(()=>{
    if (!rawPaste && !analysis) return;
    try { localStorage.setItem(CTX_KEY,JSON.stringify({rawPaste:rawPaste?.slice(0,4000),analysis,parsed:parsedLines?.slice(0,50),deepAnalysis,auditResult,auditUrl,leadNameInput,savedProspect,ts:Date.now()})); } catch {}
  },[rawPaste,analysis,deepAnalysis,auditResult,leadNameInput,savedProspect]);

  // ── AUTO EXTRACT URL ──
  useEffect(()=>{
    if (analysis && !auditUrl) {
      const m=rawPaste.match(/(?:https?:\/\/)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/);
      if (m) setAuditUrl((m[1]||m[0]).replace(/^https?:\/\//,'').split('/')[0]);
    }
  },[analysis]);

  // ── SMART PULSE ──
  const pulse=React.useMemo(()=>{
    const items:any[]=[];
    if (parsedMsgs.length>0&&!analysis&&!analysing) items.push({icon:'🧠',msg:'Conversation parsed — analyse for intelligence',cta:'Analyse',target:'analyse',urgent:true});
    if (analysis&&!auditResult&&!auditing) items.push({icon:'🔍',msg:'Run site audit'+(auditUrl?' for '+auditUrl:'')+' to add proof',cta:'Open Tools',target:'tools',urgent:(analysis?.fiverr_specific?.order_probability||0)>55});
    if (analysis&&!leadSaved) items.push({icon:'💾',msg:'Save this lead — context lost on close',cta:'Save Lead',target:'save',urgent:true});
    if (analysis&&auditResult&&!savedProspect) items.push({icon:'📋',msg:'Full context — generate a personalised proposal now',cta:'Generate Doc',target:'docs',urgent:false});
    if (deepAnalysis?.topMiss) items.push({icon:'⚠',msg:deepAnalysis.topMiss,cta:'Fix It',target:'fix',urgent:true});
    return items;
  },[parsedMsgs,analysis,auditResult,leadSaved,savedProspect,analysing,auditing,deepAnalysis]);

  const handlePulse=(target:string)=>{
    if (target==='analyse') { analyse(); if (parsedMsgs.length) runDeepAnalysis(); }
    else if (target==='save') saveLead();
    else if (target==='tools') setTab('tools');
    else if (target==='docs') setTab('docs');
    else if (target==='fix') { const msg=deepAnalysis?.nextAction; if(msg) setNextMsg(msg); }
    else if (target==='intel') { if(savedProspect){setSelProspect(savedProspect);setProspectConvs([]);setSuggestions([]);setProspectTab('suggestions');} setTab('intel'); loadProspects(); }
  };

  const clearAll=()=>{
    if (!window.confirm('Clear all context?')) return;
    setRawPaste('');setParsedMsgs([]);setConv('');setAnalysis(null);setDeepAnalysis(null);setParsed([]);setAttachments([]);
    setAuditResult(null);setAuditUrl('');setLeadNameInput('');setLeadSaved(false);setSavedProspect(null);setResponses(null);setNextMsg('');
    try { localStorage.removeItem(CTX_KEY); } catch {}
    setShowLeadPicker(false);
  };

  const handlePaste=(raw:string)=>{
    setRawPaste(raw);
    const msgs=parseFiverr(raw);
    setParsedMsgs(msgs);
    setConv(msgs.map((m:any)=>(m.speaker==='me'?'Me':'Client')+': '+m.text).join('\n'));
    setAnalysis(null); setDeepAnalysis(null); setDeepError(''); setParsed([]); setResponses(null);
  };

  const loadProspects=async()=>{
    setLoadingPros(true);
    const r=await post('get_lead_prospects',{});
    setProspects((r as any).prospects||[]);
    setLoadingPros(false);
  };

  async function analyse(){
    if(!convText.trim())return;
    setAnalysing(true);setAnalysis(null);setParsed([]);setResponses(null);
    const attCtx=attachments.filter((a:any)=>a.status==='done').map((a:any)=>'[ATTACHMENT: '+a.name+']\n'+a.description).join('\n\n');
    const fullText=convText+(attCtx?'\n\n--- ATTACHED FILES ---\n'+attCtx:'');
    const r=await post('analyse_fiverr_conversation',{text:fullText});
    setAnalysis((r as any).analysis);
    setParsed((r as any).parsed_lines||[]);
    setAnalysing(false);
  }

  async function runDeepAnalysis(){
    if (!parsedMsgs.length) return;
    setDeepLoading(true); setDeepAnalysis(null); setDeepError('');
    const r=await post('analyse_conversation_deep',{messages:parsedMsgs.map((m:any,i:number)=>({index:i,speaker:m.speaker,text:m.text}))});
    if ((r as any).success && Array.isArray((r as any).messages)) {
      setDeepAnalysis(r);
    } else {
      const err=(r as any).error||'Deep analysis failed — try again';
      setDeepError(err);
      if ((r as any).rawPreview) console.warn('Deep analysis raw preview:', (r as any).rawPreview);
      if ((r as any).parsed) console.warn('Parsed (partial):', (r as any).parsed);
    }
    setDeepLoading(false);
  }

  const handleFiles=async(files:FileList|null)=>{
    if(!files||!files.length)return;
    setExtracting(true);
    const ALLOWED=['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/markdown'];
    const MAX_MB=10;
    for(let i=0;i<Math.min(files.length,5);i++){
      const f=files[i];
      if(!ALLOWED.includes(f.type)&&!f.name.endsWith('.txt')&&!f.name.endsWith('.md')){
        setAttachments(prev=>[...prev,{name:f.name,type:f.type,status:'error',description:'Unsupported format. Use: JPG, PNG, PDF, TXT'}]);
        continue;
      }
      if(f.size>MAX_MB*1024*1024){
        setAttachments(prev=>[...prev,{name:f.name,type:f.type,status:'error',description:`File too large (max ${MAX_MB}MB)`}]);
        continue;
      }
      const placeholder={name:f.name,type:f.type,status:'extracting',description:'',size:f.size};
      setAttachments(prev=>[...prev,placeholder]);
      const base64:string=await new Promise(res=>{const rd=new FileReader();rd.onload=()=>res(String(rd.result).split(',')[1]||'');rd.readAsDataURL(f);});
      if(f.type==='text/plain'||f.name.endsWith('.txt')||f.name.endsWith('.md')){
        const text:string=await new Promise(res=>{const rd=new FileReader();rd.onload=()=>res(String(rd.result));rd.readAsText(f);});
        setAttachments(prev=>prev.map(a=>a.name===f.name&&a.status==='extracting'?{...a,status:'done',description:text.slice(0,2000),isText:true}:a));
        continue;
      }
      const r=await post('extract_attachment_context',{base64,mimeType:f.type,fileName:f.name,conversationContext:convText.slice(0,300)});
      if((r as any).success){
        setAttachments(prev=>prev.map(a=>a.name===f.name&&a.status==='extracting'?{...a,status:'done',description:(r as any).description}:a));
      } else {
        setAttachments(prev=>prev.map(a=>a.name===f.name&&a.status==='extracting'?{...a,status:'error',description:(r as any).error||'Failed to extract'}:a));
      }
    }
    setExtracting(false);
  };

  // Smart attachment prompt: detect when conversation mentions files
  const attachmentPrompt=React.useMemo(()=>{
    const t=(rawPaste||convText).toLowerCase();
    const hints:string[]=[];
    if((t.includes('screenshot')||t.includes('screengrab'))&&!attachments.length) hints.push('Client may have shared a screenshot — upload it for full context');
    if((t.includes('search console')||t.includes('gsc'))&&!attachments.some(a=>a.name.toLowerCase().includes('console'))) hints.push('GSC data mentioned — upload the Search Console screenshot');
    if((t.includes('analytics')||t.includes('ga4'))&&!attachments.some(a=>a.name.toLowerCase().includes('analytic'))) hints.push('Analytics mentioned — upload the report screenshot');
    if(t.includes('pdf')||t.includes('brief')||t.includes('document')) hints.push('Document mentioned — upload the PDF or brief');
    if(t.includes('error')||t.includes('issue')) hints.push('Issues mentioned — a screenshot would help diagnose exactly');
    return hints.slice(0,2);
  },[rawPaste,convText,attachments]);

  async function loadLeadIntoAnalyser(prospect:any){
    setLoadingLead(true); setShowLeadPicker(false);
    // Load the most recent conversation for this prospect
    const r=await post('get_lead_conversations',{prospectName:prospect.name});
    const convs=(r as any).conversations||[];
    const latest=convs[0];
    let d:any={};
    try{ d=JSON.parse(latest?.response||'{}'); }catch{}
    // Restore conversation text
    const ct=d.conversationText||'';
    if(ct){ setRawPaste(ct); const msgs=parseFiverr(ct); setParsedMsgs(msgs); setConv(msgs.map((m:any)=>(m.speaker==='me'?'Me':'Client')+': '+m.text).join('\n')); }
    // Restore analysis
    if(d.analysis){ setAnalysis(d.analysis); }
    // Restore audit
    if(d.auditResult){ setAuditResult(d.auditResult); setAuditUrl(d.auditResult.url||''); }
    // Pre-fill lead name and URL
    setLeadNameInput(prospect.name);
    if(prospect.url&&!auditUrl) setAuditUrl(prospect.url);
    // Mark as already saved
    setSavedProspect(prospect); setLeadSaved(true);
    setLoadingLead(false);
  }

  async function deleteLead(name:string){
    setProspects(prev=>prev.filter((p:any)=>p.name!==name));
    if(selProspect?.name===name){setSelProspect(null);setSuggestions([]);setProspectConvs([]);}
    if(savedProspect?.name===name){setSavedProspect(null);setLeadSaved(false);}
    await post('delete_lead',{prospectName:name});
  }

  async function archiveLead(name:string){
    setProspects(prev=>prev.map((p:any)=>p.name===name?{...p,status:'archived'}:p));
    await post('archive_lead',{prospectName:name,status:'archived'});
  }

  async function saveLead(){
    if(!analysis)return;
    setSavingLead(true); setSaveError('');
    const name=leadNameInput||parsedMsgs.find((m:any)=>m.speaker==='client')?.speakerName||analysis?.main_need?.split(' ').slice(0,4).join(' ')||'New Prospect';
    const np={name,url:auditResult?.url||auditUrl||'',industry:'',latestAnalysis:{...analysis,savedAt:new Date().toISOString()},lastSeen:new Date().toISOString(),conversationCount:1,status:'active'};
    // Optimistic update
    setProspects(prev=>{const ex=prev.find((p:any)=>p.name===name);if(ex)return prev.map((p:any)=>p.name===name?{...p,conversationCount:p.conversationCount+1,latestAnalysis:np.latestAnalysis,lastSeen:np.lastSeen}:p);return [np,...prev];});
    setSavedProspect(np);
    // Wait for DB confirmation — brain_learnings is primary, doesn't need project_id
    const r=await post('save_lead_conversation',{prospectName:name,prospectUrl:np.url,industry:'',analysis,conversationText:rawPaste||convText,deepAnalysis,auditResult,staffId:'bde',attachments:attachments.filter((a:any)=>a.status==='done').map((a:any)=>({name:a.name,description:a.description}))});
    if((r as any).success){
      setLeadSaved(true);
      loadProspects(); // Reload from DB to confirm it's there
    } else {
      setSaveError((r as any).error||'DB save failed — check Supabase permissions for brain_learnings table');
      setLeadSaved(false);
    }
    setSavingLead(false);
  }
  async function openProspect(p:any){
    setSelProspect(p);setProspectConvs([]);setSuggestions([]);setProspectTab('suggestions');setExpandedConv(new Set());
    setTab('intel');
    const r=await post('get_lead_conversations',{prospectName:p.name});
    setProspectConvs((r as any).conversations||[]);
  }

  async function generateSuggestions(){
    if(!selProspect)return;
    setGenSugg(true);setSuggestions([]);
    const latest=prospectConvs[0];
    let la:any=selProspect?.latestAnalysis||null;
    if (latest) { try{la=JSON.parse(latest?.response||'{}').analysis||la;}catch{} }
    const r=await post('generate_lead_suggestions',{prospectName:selProspect.name,prospectUrl:selProspect.url||'',latestAnalysis:la,auditData:null,conversationCount:prospectConvs.length});
    setSuggestions((r as any).suggestions||[]);
    setGenSugg(false);
  }

  async function doAudit(){
    if(!auditUrl.trim())return;
    setAuditing(true);setAuditResult(null);
    const r=await post('instant_audit_showcase',{url:auditUrl,forLead:auditFor});
    setAuditResult(r);setAuditing(false);
  }

  async function genResponses(){
    if(!analysis||!convText)return;
    setGenResp(true);
    const r=await post('generate_responses',{text:convText,analysis});
    setResponses(r);setGenResp(false);
  }

  function copyText(text:string,id:string){
    navigator.clipboard.writeText(text).catch(()=>{});
    setCopied(id);setTimeout(()=>setCopied(null),2000);
  }

  const handleConvAction=(type:string,value:string)=>{
    if (type==='copy_reply'||type==='use_as_next') { navigator.clipboard.writeText(value).catch(()=>{}); setNextMsg(value); }
    if (type==='audit_url') { setAuditUrl(value); setTab('tools'); }
  };

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
    inp:{background:'hsl(var(--background))',border:'0.5px solid #1a1a3a',borderRadius:8,color:'hsl(var(--foreground))',padding:'7px 11px',fontSize:13,outline:'none',boxSizing:'border-box' as const},
    btn:(c:string='#10b981')=>({background:`${c}18`,border:`0.5px solid ${c}40`,borderRadius:8,color:c,padding:'6px 12px',fontSize:12,cursor:'pointer',fontWeight:600}),
    badge:(c:string)=>({fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:20,background:`${c}20`,color:c}),
    sec:{fontSize:10,fontWeight:600,letterSpacing:1.2,textTransform:'uppercase' as const,color:'hsl(var(--muted-foreground))',marginBottom:8},
  };

  return (
    <div style={S.root}>
      <PortalNav/>
      <div style={S.hdr}>
        <div style={{width:8,height:8,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 8px #10b981'}}/>
        <span style={{fontSize:14,fontWeight:700}}>💼 BDE Panel</span>
        <span style={S.badge('#10b981')}>BUSINESS DEVELOPMENT</span>
        <span style={{fontSize:10,color:'hsl(var(--muted-foreground))',marginLeft:'auto'}}>{assignments.length} leads · {prospects.length} in intel</span>
      </div>

      {/* Context bar */}
      {(rawPaste||analysis||auditResult)&&(
        <div style={{background:'rgba(99,102,241,.05)',borderBottom:'0.5px solid rgba(99,102,241,.15)',padding:'5px 18px',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' as const,fontSize:10}}>
          <span style={{color:'hsl(var(--muted-foreground))',fontWeight:700,fontSize:9,letterSpacing:1}}>CONTEXT:</span>
          {parsedMsgs.length>0&&<span style={{color:'#10b981'}}>✓ {parsedMsgs.length} messages parsed</span>}
          {analysis&&<span style={{color:'#10b981'}}>✓ Analysed · {analysis.fiverr_specific?.order_probability||'?'}% close</span>}
          {deepAnalysis&&<span style={{color:'#a78bfa'}}>✓ Deep analysis · {deepAnalysis.overallConversion}%</span>}
          {auditResult&&<span style={{color:auditResult.reachable===false?'#ef4444':'#a78bfa'}}>{auditResult.reachable===false?'⚠ Unreachable: '+auditResult.url:'✓ Audit: '+auditResult.score+'/100 · '+(auditResult.categories?.length||0)+' categories'}</span>}
          {leadSaved&&savedProspect&&<span style={{color:'#10b981'}}>✓ Saved: {savedProspect.name}</span>}
          {!leadSaved&&analysis&&<span style={{color:'#f59e0b'}}>⚠ Not saved</span>}
          <button style={{marginLeft:'auto',fontSize:10,background:'none',border:'0.5px solid rgba(239,68,68,.3)',borderRadius:6,color:'#ef4444',padding:'2px 8px',cursor:'pointer'}} onClick={clearAll}>✕ Clear</button>
        </div>
      )}

      {/* Smart pulse */}
      {pulse.length>0&&(
        <div style={{borderBottom:'0.5px solid #1a1a3a',padding:'5px 18px',display:'flex',gap:6,overflowX:'auto' as const,background:'rgba(0,0,0,.08)'}}>
          {pulse.map((p:any,i:number)=>(
            <button key={i} onClick={()=>handlePulse(p.target)} style={{flexShrink:0,display:'flex',alignItems:'center',gap:5,background:p.urgent?'rgba(239,68,68,.06)':'rgba(99,102,241,.06)',border:`0.5px solid ${p.urgent?'rgba(239,68,68,.2)':'rgba(99,102,241,.2)'}`,borderRadius:8,padding:'4px 10px',cursor:'pointer',color:'hsl(var(--foreground))'}}>
              <span style={{fontSize:13}}>{p.icon}</span>
              <span style={{fontSize:11,color:'hsl(var(--muted-foreground))',maxWidth:240,whiteSpace:'nowrap' as const,overflow:'hidden',textOverflow:'ellipsis'}}>{p.msg}</span>
              <span style={{fontSize:10,fontWeight:700,color:p.urgent?'#ef4444':'#6366f1',marginLeft:4}}>→ {p.cta}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {([['fiverr','🟢 Fiverr Analyser'],['intel','🧠 Lead Intel'+(prospects.length?` (${prospects.length})`:'' )],['tools','⚡ Tools'],['responses','💬 Responses'],['leads','📋 Leads'],['docs','🏆 Documents']] as [string,string][]).map(([id,l])=>(
          <button key={id} style={{...S.tab,...(tab===id?S.tabA:{})}} onClick={()=>setTab(id as any)}>{l}</button>
        ))}
      </div>
      <div style={S.body}>

        {/* ═══ FIVERR ANALYSER ═══ */}
        {tab==='fiverr'&&(
          <div>
            {/* Load from saved lead — always visible */}
            {(
              <div style={{marginBottom:10}}>
                {!showLeadPicker?(
                  <button style={{...S.btn('#6366f1'),width:'100%',justifyContent:'space-between',display:'flex',padding:'8px 14px',fontSize:12}} onClick={()=>setShowLeadPicker(true)}>
                    <span>📂 {loadingPros?'Loading leads...':`Load from saved lead (${prospects.length} saved)`}</span>
                    <span>▼</span>
                  </button>
                ):(
                  <div style={{...S.card,padding:10,border:'0.5px solid rgba(99,102,241,.3)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <span style={{fontSize:12,fontWeight:700,color:'#a78bfa'}}>Select a lead to load</span>
                      <button style={{fontSize:10,background:'none',border:'none',color:'hsl(var(--muted-foreground))',cursor:'pointer'}} onClick={()=>setShowLeadPicker(false)}>✕</button>
                    </div>
                    <div style={{display:'flex',flexDirection:'column' as const,gap:4,maxHeight:220,overflowY:'auto' as const}}>
                      {loadingPros&&<div style={{fontSize:11,color:'hsl(var(--muted-foreground))',padding:'12px',textAlign:'center' as const}}>Loading saved leads...</div>}
                      {!loadingPros&&prospects.length===0&&<div style={{fontSize:11,color:'hsl(var(--muted-foreground))',padding:'12px',textAlign:'center' as const}}>No saved leads yet — analyse a conversation and save it first</div>}
                      {prospects.map((p:any)=>{
                        const prob=p.latestAnalysis?.fiverr_specific?.order_probability;
                        return(
                          <div key={p.name} onClick={()=>loadLeadIntoAnalyser(p)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',borderRadius:8,cursor:'pointer',background:'rgba(99,102,241,.05)',border:'0.5px solid rgba(99,102,241,.15)'}}>
                            <div>
                              <div style={{fontSize:12,fontWeight:600,color:'hsl(var(--foreground))'}}>{p.name}</div>
                              {p.url&&<div style={{fontSize:10,color:'#6366f1'}}>{p.url}</div>}
                              {p.latestAnalysis?.main_need&&<div style={{fontSize:10,color:'hsl(var(--muted-foreground))',marginTop:1}}>{p.latestAnalysis.main_need}</div>}
                            </div>
                            <div style={{display:'flex',flexDirection:'column' as const,alignItems:'flex-end',gap:3,flexShrink:0,marginLeft:10}}>
                              {prob!==undefined&&<span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:10,background:`${MOOD_C(prob)}20`,color:MOOD_C(prob)}}>{prob}%</span>}
                              <span style={{fontSize:9,color:'hsl(var(--muted-foreground))'}}>{AGO(p.lastSeen)}</span>
                              {p.conversationCount>1&&<span style={{fontSize:9,color:'#a78bfa'}}>{p.conversationCount} convs</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {loadingLead&&<div style={{fontSize:11,color:'#6366f1',marginTop:8,textAlign:'center' as const}}>⏳ Loading conversation...</div>}
                  </div>
                )}
              </div>
            )}
            {/* Smart paste area */}
            <div style={S.card}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>📋 Paste Fiverr Conversation</div>
              <div style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:10}}>Copy the full conversation from Fiverr and paste below. It auto-parses the format — usernames, timestamps, multi-line messages, UI noise is all filtered out.</div>
              <textarea
                style={{width:'100%',background:'hsl(var(--background))',border:'0.5px solid #1a1a3a',borderRadius:9,color:'hsl(var(--foreground))',padding:'11px 13px',fontSize:12,lineHeight:1.6,resize:'vertical' as const,outline:'none',minHeight:100,boxSizing:'border-box' as const,fontFamily:'monospace'}}
                value={rawPaste}
                onChange={e=>handlePaste(e.target.value)}
                placeholder={'Paste raw Fiverr conversation here...\n\nEverything is auto-parsed: usernames, timestamps, multi-line messages, "Translate to English" labels — all handled.'}
              />
              {parsedMsgs.length>0&&(
                <div style={{display:'flex',gap:8,marginTop:8,alignItems:'center',flexWrap:'wrap' as const}}>
                  <span style={{fontSize:11,color:'#10b981'}}>✓ {parsedMsgs.length} messages parsed ({parsedMsgs.filter((m:any)=>m.speaker==='client').length} client, {parsedMsgs.filter((m:any)=>m.speaker==='me').length} me)</span>
                  <button style={S.btn()} onClick={()=>{analyse();runDeepAnalysis();}} disabled={analysing||deepLoading}>{analysing||deepLoading?'Analysing...':'🧠 Analyse All'}</button>
                  <button style={S.btn('hsl(var(--muted-foreground))')} onClick={clearAll}>✕ Clear</button>
                </div>
              )}
            </div>

            {/* Attachment uploader */}
            <div style={{...S.card,marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700}}>📎 Attachments <span style={{fontSize:10,fontWeight:400,color:'hsl(var(--muted-foreground))'}}>— images, PDFs, screenshots, docs</span></div>
                <label style={{...S.btn('#6366f1'),fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                  <input type="file" multiple accept="image/*,.pdf,.txt,.md" style={{display:'none'}} onChange={e=>handleFiles(e.target.files)} disabled={extracting}/>
                  {extracting?'⏳ Reading...':'+ Add File'}
                </label>
              </div>
              {/* Smart prompts */}
              {attachmentPrompt.map((hint:string,i:number)=>(
                <div key={i} style={{fontSize:11,color:'#6366f1',padding:'5px 10px',background:'rgba(99,102,241,.06)',borderRadius:7,border:'0.5px dashed rgba(99,102,241,.3)',marginBottom:6,display:'flex',alignItems:'center',gap:6}}>
                  <span>💡</span><span>{hint}</span>
                  <label style={{marginLeft:'auto',fontSize:10,background:'rgba(99,102,241,.15)',border:'0.5px solid rgba(99,102,241,.3)',borderRadius:5,color:'#a78bfa',padding:'2px 8px',cursor:'pointer'}}>
                    <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e=>handleFiles(e.target.files)}/>Upload
                  </label>
                </div>
              ))}
              {/* Drop zone when no files */}
              {!attachments.length&&!attachmentPrompt.length&&(
                <label style={{display:'block',border:'1px dashed rgba(99,102,241,.25)',borderRadius:9,padding:'16px',textAlign:'center' as const,cursor:'pointer',color:'hsl(var(--muted-foreground))',fontSize:11}}>
                  <input type="file" multiple accept="image/*,.pdf,.txt,.md" style={{display:'none'}} onChange={e=>handleFiles(e.target.files)}/>
                  📂 Drop or click to attach images, PDFs, screenshots — client shared files, GSC reports, briefs
                </label>
              )}
              {/* Attachment chips */}
              {attachments.length>0&&(
                <div style={{display:'flex',flexDirection:'column' as const,gap:6}}>
                  {attachments.map((a:any,i:number)=>(
                    <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',padding:'8px 10px',background:'rgba(0,0,0,.12)',borderRadius:8,border:`0.5px solid ${a.status==='error'?'rgba(239,68,68,.3)':a.status==='extracting'?'rgba(99,102,241,.2)':'rgba(16,185,129,.2)'}`}}>
                      <span style={{fontSize:16,flexShrink:0}}>{a.type?.startsWith('image')?'🖼️':a.type==='application/pdf'?'📄':'📝'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                          <span style={{fontSize:11,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{a.name}</span>
                          <div style={{display:'flex',gap:5,flexShrink:0}}>
                            {a.status==='done'&&<span style={{fontSize:9,color:'#10b981',fontWeight:700}}>✓ Read</span>}
                            {a.status==='extracting'&&<span style={{fontSize:9,color:'#6366f1'}}>⏳ Reading...</span>}
                            {a.status==='error'&&<span style={{fontSize:9,color:'#ef4444'}}>✗ Error</span>}
                            <button style={{fontSize:9,background:'none',border:'none',color:'hsl(var(--muted-foreground))',cursor:'pointer',padding:0}} onClick={()=>setAttachments(prev=>prev.filter((_:any,j:number)=>j!==i))}>✕</button>
                          </div>
                        </div>
                        {a.description&&<div style={{fontSize:11,color:'hsl(var(--muted-foreground))',lineHeight:1.5,maxHeight:80,overflow:'hidden'}}>{a.description.slice(0,300)}{a.description.length>300?'…':''}</div>}
                        {a.status==='error'&&<div style={{fontSize:11,color:'#f87171'}}>{a.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Summary bar when deep analysis done */}
            {deepAnalysis&&(
              <div style={{...S.card,background:'rgba(0,0,0,.2)',marginBottom:10}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:10}}>
                  <div style={{textAlign:'center' as const}}>
                    <div style={{fontSize:22,fontWeight:700,color:deepAnalysis.overallConversion>=70?'#10b981':deepAnalysis.overallConversion>=50?'#f59e0b':'#ef4444'}}>{deepAnalysis.overallConversion}%</div>
                    <div style={{fontSize:9,color:'hsl(var(--muted-foreground))'}}>CLOSE PROBABILITY</div>
                  </div>
                  <div style={{textAlign:'center' as const}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#ef4444'}}>{deepAnalysis.urgency}</div>
                    <div style={{fontSize:9,color:'hsl(var(--muted-foreground))'}}>URGENCY</div>
                  </div>
                  <div style={{gridColumn:'span 2'}}>
                    <div style={{fontSize:9,color:'#f59e0b',fontWeight:700,marginBottom:3}}>TOP MISS</div>
                    <div style={{fontSize:11,color:'#d0d0e8'}}>{deepAnalysis.topMiss}</div>
                  </div>
                </div>
                {deepAnalysis.nextAction&&(
                  <div style={{background:'rgba(16,185,129,.06)',border:'0.5px solid rgba(16,185,129,.2)',borderRadius:8,padding:'8px 12px'}}>
                    <div style={{fontSize:9,color:'#10b981',fontWeight:700,marginBottom:3}}>NEXT ACTION RIGHT NOW</div>
                    <div style={{fontSize:12,color:'#d0d0e8'}}>{deepAnalysis.nextAction}</div>
                  </div>
                )}
              </div>
            )}

            {/* Next message composer */}
            {(analysis||deepAnalysis)&&(
              <div style={S.card}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>💬 Next Message to Send</div>
                <textarea
                  style={{width:'100%',background:'rgba(16,185,129,.04)',border:'0.5px solid rgba(16,185,129,.25)',borderRadius:8,color:'hsl(var(--foreground))',padding:'10px 12px',fontSize:13,lineHeight:1.6,resize:'vertical' as const,outline:'none',minHeight:80,boxSizing:'border-box' as const}}
                  value={nextMsg}
                  onChange={e=>setNextMsg(e.target.value)}
                  placeholder='Your next message to the client — gets pre-filled from Best Next Message or from clicking Better Reply on any message...'
                />
                {nextMsg&&(
                  <div style={{display:'flex',gap:6,marginTop:8}}>
                    <button style={S.btn(copied==='nextmsg'?'#10b981':'#a78bfa')} onClick={()=>copyText(nextMsg,'nextmsg')}>{copied==='nextmsg'?'✓ Copied!':'Copy Message'}</button>
                    <button style={S.btn('hsl(var(--muted-foreground))')} onClick={()=>setNextMsg('')}>Clear</button>
                  </div>
                )}
              </div>
            )}

            {/* Visual conversation preview */}
            {parsedMsgs.length>0&&(
              <div style={S.card}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700}}>💬 Conversation Preview</div>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    {deepLoading&&<span style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>⏳ Deep analysis running...</span>}{deepError&&!deepLoading&&<button style={{fontSize:10,color:'#ef4444',background:'rgba(239,68,68,.1)',border:'0.5px solid rgba(239,68,68,.3)',borderRadius:6,padding:'3px 10px',cursor:'pointer'}} onClick={runDeepAnalysis}>⚠ {deepError} — retry</button>}
                    {!deepAnalysis&&!deepLoading&&parsedMsgs.length>0&&<button style={S.btn('#6366f1')} onClick={runDeepAnalysis}>🔬 Deep Analysis</button>}
                    {analysis&&<button style={S.btn('#a78bfa')} onClick={()=>setTab('docs')}>Generate Doc →</button>}
                  </div>
                </div>
                <div style={{maxHeight:620,overflowY:'auto' as const,paddingRight:4}}><ConversationView msgs={parsedMsgs} deepAnalysis={deepAnalysis} onAction={handleConvAction}/></div>
              </div>
            )}

            {/* Overall analysis + save */}
            {analysis&&(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div style={S.card}>
                    <div style={S.sec}>Overall Intelligence</div>
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
                  <BestMessagePanel analysis={analysis} convText={convText}/>
                </div>
                {/* Save to Lead Intel */}
                {!leadSaved?(
                  <div style={{...S.card,borderColor:'rgba(99,102,241,.3)',background:'rgba(99,102,241,.04)'}}>
                    <div style={{fontSize:12,fontWeight:700,marginBottom:8,color:'#a78bfa'}}>💾 Save to Lead Intelligence</div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <input style={{...S.inp,flex:1}} placeholder={parsedMsgs.find((m:any)=>m.speaker==='client')?.speakerName||'Prospect name...'} value={leadNameInput} onChange={(e:any)=>setLeadNameInput(e.target.value)} onKeyDown={(e:any)=>{if(e.key==='Enter')saveLead();}}/>
                      <button style={{...S.btn('#6366f1'),padding:'7px 16px'}} onClick={saveLead} disabled={savingLead}>{savingLead?'Saving...':'Save Lead'}</button>
                      <button style={{...S.btn('#a78bfa'),padding:'7px 14px'}} onClick={()=>setTab('docs')}>Generate Doc</button>
                    </div>
                    <div style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginTop:6}}>Saves to database permanently — survives cookie clears, browser restarts, and new devices.</div>{saveError&&<div style={{fontSize:11,color:'#ef4444',marginTop:4,padding:'4px 8px',background:'rgba(239,68,68,.08)',borderRadius:6}}>⚠ {saveError}</div>}
                  </div>
                ):(
                  <div style={{...S.card,borderColor:'rgba(16,185,129,.3)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:16}}>✅</span>
                      <div><div style={{fontSize:12,fontWeight:700,color:'#10b981'}}>Saved — {savedProspect?.name}</div><div style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>Full context stored. AI is tracking this lead.</div></div>
                      <button style={{...S.btn('#a78bfa'),marginLeft:'auto'}} onClick={()=>{if(savedProspect){setSelProspect(savedProspect);setProspectConvs([]);setSuggestions([]);setProspectTab('suggestions');}setTab('intel');}}>View Intel →</button>
                    </div>
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
                  <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700}}>{selProspect.name}</div>{selProspect.url&&<div style={{fontSize:11,color:'#6366f1'}}>{selProspect.url}</div>}</div>
                  <button style={S.btn('#10b981')} onClick={()=>{setAuditUrl(selProspect.url||'');setTab('tools');}}>🔍 Audit</button>
                  <button style={S.btn('#a78bfa')} onClick={()=>setTab('docs')}>📋 Doc</button>
                </div>
                <div style={{display:'flex',gap:4,marginBottom:14,borderBottom:'0.5px solid #1a1a3a',paddingBottom:0}}>
                  {(['suggestions','history','docs'] as const).map(t=>(
                    <button key={t} style={{...S.tab,...(prospectTab===t?S.tabA:{})}} onClick={()=>setProspectTab(t)}>
                      {t==='suggestions'?'🧠 AI Suggestions':t==='history'?'📅 Conversation History':'📎 Actions'}
                      {t==='suggestions'&&suggestions.length>0&&<span style={{...S.badge('#10b981'),marginLeft:4}}>{suggestions.length}</span>}
                    </button>
                  ))}
                </div>
                {prospectTab==='suggestions'&&(
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                      <div style={{fontSize:12,color:'hsl(var(--muted-foreground))'}}>Based on full conversation history, algorithm updates and proven closing tactics.</div>
                      <button style={S.btn('#6366f1')} onClick={generateSuggestions} disabled={genSugg}>{genSugg?'⏳ Generating...':'✨ Generate Suggestions'}</button>
                    </div>
                    {suggestions.length===0&&!genSugg&&(
                      <div style={{...S.card,textAlign:'center' as const,padding:32}}>
                        <div style={{fontSize:28,marginBottom:8}}>🧠</div>
                        <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Get AI Suggestions for {selProspect.name}</div>
                        <div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginBottom:14}}>Claude analyses conversation history, algorithm updates, and proven closing tactics.</div>
                        <button style={{...S.btn('#6366f1'),padding:'10px 24px'}} onClick={generateSuggestions}>✨ Generate Suggestions</button>
                      </div>
                    )}
                    {genSugg&&<div style={{...S.card,textAlign:'center' as const,padding:32,color:'hsl(var(--muted-foreground))',fontSize:12}}>Generating suggestions...</div>}
                    {suggestions.map((s:any,i:number)=>(
                      <div key={i} style={{...S.card,borderLeft:`3px solid ${SUGG_C[s.priority]||'#6366f1'}`,borderRadius:'0 11px 11px 0'}}>
                        <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                          <span style={{fontSize:18,flexShrink:0}}>{SUGG_ICON[s.type]||'💡'}</span>
                          <div style={{flex:1}}>
                            <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:4}}>
                              <span style={S.badge(SUGG_C[s.priority]||'#6366f1')}>{s.priority?.toUpperCase()}</span>
                              <span style={S.badge('#6366f1')}>{s.type}</span>
                              {s.timing&&<span style={{fontSize:10,color:'hsl(var(--muted-foreground))'}}>⏰ {s.timing}</span>}
                            </div>
                            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{s.action}</div>
                            {s.reason&&<div style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:8,lineHeight:1.5}}>{s.reason}</div>}
                            {s.script&&(
                              <div style={{background:'rgba(99,102,241,.06)',border:'0.5px solid rgba(99,102,241,.2)',borderRadius:8,padding:'8px 12px'}}>
                                <div style={{fontSize:9,color:'#a78bfa',fontWeight:700,marginBottom:3}}>SCRIPT</div>
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
                    {prospectConvs.length===0&&selProspect.latestAnalysis&&(
                      <div style={S.card}>
                        <div style={{fontSize:11,fontWeight:600,marginBottom:8}}>Latest Context</div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                          {selProspect.latestAnalysis.main_need&&<div style={{background:'rgba(16,185,129,.05)',borderRadius:6,padding:'6px 8px'}}><div style={{fontSize:9,color:'#10b981',fontWeight:700}}>NEED</div><div style={{fontSize:11,color:'#d0d0e8'}}>{selProspect.latestAnalysis.main_need}</div></div>}
                          {selProspect.latestAnalysis.urgency&&<div style={{background:'rgba(245,158,11,.05)',borderRadius:6,padding:'6px 8px'}}><div style={{fontSize:9,color:'#f59e0b',fontWeight:700}}>URGENCY</div><div style={{fontSize:11,color:'#d0d0e8'}}>{selProspect.latestAnalysis.urgency}</div></div>}
                        </div>
                      </div>
                    )}
                    {prospectConvs.map((c:any,i:number)=>{
                      let d:any={};try{d=JSON.parse(c.response||'{}');}catch{}
                      const isExp=expandedConv.has(i);
                      const tog=(idx:number)=>setExpandedConv(prev=>{const n=new Set(prev);n.has(idx)?n.delete(idx):n.add(idx);return n;});
                      return(
                        <div key={i} style={S.card}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                            <div style={{fontSize:11,fontWeight:600}}>Conversation #{prospectConvs.length-i}</div>
                            <span style={{fontSize:10,color:'hsl(var(--muted-foreground))'}}>{AGO(c.created_at)}</span>
                          </div>
                          {d.analysis&&<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:8}}>
                            {d.analysis.main_need&&<div style={{background:'rgba(16,185,129,.05)',borderRadius:6,padding:'5px 8px'}}><div style={{fontSize:9,color:'#10b981',fontWeight:700}}>NEED</div><div style={{fontSize:11,color:'#d0d0e8'}}>{d.analysis.main_need}</div></div>}
                            {d.analysis.urgency&&<div style={{background:'rgba(245,158,11,.05)',borderRadius:6,padding:'5px 8px'}}><div style={{fontSize:9,color:'#f59e0b',fontWeight:700}}>URGENCY</div><div style={{fontSize:11,color:'#d0d0e8'}}>{d.analysis.urgency}</div></div>}
                            {d.analysis.fiverr_specific?.order_probability!==undefined&&<div style={{background:'rgba(99,102,241,.05)',borderRadius:6,padding:'5px 8px'}}><div style={{fontSize:9,color:'#a78bfa',fontWeight:700}}>PROBABILITY</div><div style={{fontSize:11,color:'#d0d0e8'}}>{d.analysis.fiverr_specific.order_probability}%</div></div>}
                          </div>}
                          {d.conversationText&&(
                            <div style={{marginBottom:8}}>
                              <div style={{fontSize:9,color:'#6366f1',fontWeight:700,marginBottom:5,letterSpacing:1}}>CONVERSATION</div>
                              <div style={{background:'rgba(0,0,0,.15)',borderRadius:7,padding:'8px 10px',maxHeight:isExp?600:130,overflow:'hidden' as const,position:'relative' as const}}>
                                {String(d.conversationText||'').split('\n').filter((l:string)=>l.trim()).map((line:string,li:number)=>{
                                  const isC=/^(client:|buyer:|c:)/i.test(line.trim());
                                  return(<div key={li} style={{display:'flex',gap:6,marginBottom:4}}><span style={{fontSize:9,fontWeight:700,color:isC?'#a78bfa':'#10b981',flexShrink:0,minWidth:22,paddingTop:1}}>{isC?'C:':'ME:'}</span><span style={{fontSize:11,color:'#d0d0e8',lineHeight:1.55}}>{line.replace(/^(client:|me:|you:|buyer:|c:)/i,'').trim()}</span></div>);
                                })}
                                {!isExp&&<div style={{position:'absolute' as const,bottom:0,left:0,right:0,height:50,background:'linear-gradient(transparent,rgba(0,0,0,.6))'}}/>}
                              </div>
                              <button style={{fontSize:10,color:'#6366f1',background:'none',border:'none',cursor:'pointer',padding:'3px 0'}} onClick={()=>tog(i)}>{isExp?'▲ Collapse':'▼ Show full conversation'}</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {prospectTab==='docs'&&(
                  <div style={{...S.card,textAlign:'center' as const,padding:24}}>
                    <div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginBottom:12}}>Generate a document for {selProspect.name}</div>
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
                    <button style={{...S.btn('#6366f1'),padding:'10px 24px'}} onClick={()=>setTab('fiverr')}>Start with Fiverr Analyser →</button>
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:10}}>
                  {prospects.map((p:any)=>{
                    const la=p.latestAnalysis;const prob=la?.fiverr_specific?.order_probability;
                    return(
                      <div key={p.name} style={{...S.card,cursor:'pointer'}} onClick={()=>openProspect(p)}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                          <div><div style={{fontSize:13,fontWeight:700}}>{p.name}</div>{p.url&&<div style={{fontSize:10,color:'#6366f1'}}>{p.url}</div>}</div>
                          <div style={{display:'flex',flexDirection:'column' as const,alignItems:'flex-end',gap:3}}>
                            <span style={S.badge(STAGE_C[p.status]||'#6366f1')}>{p.status||'active'}</span>
                            {prob!==undefined&&<span style={S.badge(MOOD_C(prob))}>{prob}% close</span>}
                          </div>
                        </div>
                        {la&&<div style={{fontSize:11,color:'hsl(var(--muted-foreground))',lineHeight:1.5}}>{la.main_need&&<div>📌 {la.main_need}</div>}{la.urgency&&<div>⚡ {la.urgency} urgency</div>}{la.savedAt&&<div style={{fontSize:10,marginTop:4}}>Last: {AGO(la.savedAt)}</div>}</div>}
                        <div style={{marginTop:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:10,color:'#6366f1',fontWeight:600}}>View Intelligence →</span>
                          <div style={{display:'flex',gap:4}} onClick={(e:any)=>e.stopPropagation()}>
                            <button style={{fontSize:9,padding:'2px 7px',borderRadius:5,background:'rgba(245,158,11,.1)',border:'0.5px solid rgba(245,158,11,.3)',color:'#f59e0b',cursor:'pointer'}} onClick={()=>archiveLead(p.name)}>Archive</button>
                            <button style={{fontSize:9,padding:'2px 7px',borderRadius:5,background:'rgba(239,68,68,.1)',border:'0.5px solid rgba(239,68,68,.3)',color:'#ef4444',cursor:'pointer'}} onClick={()=>{if(window.confirm('Delete '+p.name+'? This cannot be undone.'))deleteLead(p.name);}}>Delete</button>
                          </div>
                        </div>
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
              <div style={{display:'flex',gap:8,marginBottom:8}}>
                <input style={{...S.inp,flex:2}} value={auditUrl} onChange={e=>setAuditUrl(e.target.value)} placeholder='yourlead.com' onKeyDown={e=>e.key==='Enter'&&doAudit()}/>
                <input style={{...S.inp,flex:3}} value={auditFor} onChange={e=>setAuditFor(e.target.value)} placeholder='Lead context: e-commerce looking for organic traffic'/>
              </div>
              <button style={S.btn()} onClick={doAudit} disabled={auditing||!auditUrl}>{auditing?'Auditing...':'🔍 Generate Audit Showcase'}</button>
            </div>
            {auditResult&&(
              <div style={S.card}>
                {/* Score header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,marginBottom:3}}>{auditResult.url}</div>
                    <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' as const}}>
                      {auditResult.reachable===false
                        ?<span style={{fontSize:12,color:'#ef4444',fontWeight:700}}>⚠ Site Unreachable</span>
                        :<><div style={{width:52,height:52,borderRadius:'50%',background:`conic-gradient(${auditResult.score>=70?'#10b981':auditResult.score>=50?'#f59e0b':'#ef4444'} ${auditResult.score*3.6}deg, rgba(255,255,255,.1) 0deg)`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                            <div style={{width:38,height:38,borderRadius:'50%',background:'hsl(var(--background))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:auditResult.score>=70?'#10b981':auditResult.score>=50?'#f59e0b':'#ef4444'}}>{auditResult.score}</div>
                          </div>
                          <div><div style={{fontSize:11,fontWeight:700,color:'hsl(var(--foreground))'}}>SEO Score</div><div style={{fontSize:10,color:'hsl(var(--muted-foreground))'}}>out of 100</div></div></>
                      }
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'flex-start'}}>
                    <button style={S.btn(copied==='audit_msg'?'#10b981':'#a78bfa')} onClick={()=>copyText(auditResult.showcase_message,'audit_msg')}>{copied==='audit_msg'?'✓ Copied!':'Copy Pitch Message'}</button>
                    <button style={S.btn('#6366f1')} onClick={()=>setTab('docs')}>Generate Proposal →</button>
                  </div>
                </div>

                {/* Algorithm Highlights */}
                {auditResult.algorithmHighlights?.length>0&&(
                  <div style={{marginBottom:12,padding:'8px 12px',background:'rgba(99,102,241,.06)',borderRadius:8,border:'0.5px solid rgba(99,102,241,.2)'}}>
                    <div style={{fontSize:9,fontWeight:700,color:'#a78bfa',letterSpacing:1,marginBottom:5}}>🔬 LATEST ALGORITHM RELEVANCE</div>
                    {auditResult.algorithmHighlights.map((h:string,i:number)=>(
                      <div key={i} style={{fontSize:11,color:'#d0d0e8',lineHeight:1.5,marginBottom:2}}>• {h}</div>
                    ))}
                  </div>
                )}

                {/* Quick Wins */}
                {auditResult.quickWins?.length>0&&(
                  <div style={{marginBottom:12,padding:'8px 12px',background:'rgba(16,185,129,.06)',borderRadius:8,border:'0.5px solid rgba(16,185,129,.2)'}}>
                    <div style={{fontSize:9,fontWeight:700,color:'#10b981',letterSpacing:1,marginBottom:5}}>⚡ QUICK WINS — FIX THESE FIRST</div>
                    {auditResult.quickWins.map((w:string,i:number)=>(
                      <div key={i} style={{fontSize:11,color:'#d0d0e8',lineHeight:1.5,marginBottom:2}}>• {w}</div>
                    ))}
                  </div>
                )}

                {/* Categories */}
                {auditResult.categories?.map((cat:any,ci:number)=>(
                  <div key={ci} style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                      <div style={{fontSize:11,fontWeight:700,color:'hsl(var(--foreground))'}}>{cat.name}</div>
                      <div style={{display:'flex',alignItems:'center',gap:5}}>
                        <div style={{width:60,height:4,background:'rgba(255,255,255,.1)',borderRadius:2,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${cat.score}%`,background:cat.score>=70?'#10b981':cat.score>=50?'#f59e0b':'#ef4444',borderRadius:2}}/>
                        </div>
                        <span style={{fontSize:10,color:'hsl(var(--muted-foreground))'}}>{cat.score}/100</span>
                      </div>
                    </div>
                    {cat.issues?.map((iss:any,ii:number)=>{
                      const sevC:any={critical:'#ef4444',high:'#f59e0b',medium:'#6366f1',low:'hsl(var(--muted-foreground))'};
                      const sevBg:any={critical:'rgba(239,68,68,.08)',high:'rgba(245,158,11,.06)',medium:'rgba(99,102,241,.06)',low:'rgba(255,255,255,.03)'};
                      return(
                        <div key={ii} style={{padding:'7px 10px',marginBottom:4,borderRadius:7,background:sevBg[iss.severity]||sevBg.low,border:`0.5px solid ${sevC[iss.severity]||'#333'}30`}}>
                          <div style={{display:'flex',gap:6,alignItems:'flex-start',marginBottom:iss.fix||iss.algorithmNote?4:0}}>
                            <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:10,background:`${sevC[iss.severity]||'#6366f1'}20`,color:sevC[iss.severity]||'#6366f1',flexShrink:0,marginTop:1}}>{(iss.severity||'low').toUpperCase()}</span>
                            <span style={{fontSize:12,color:'hsl(var(--foreground))',lineHeight:1.5}}>{iss.issue}</span>
                          </div>
                          {iss.fix&&<div style={{fontSize:11,color:'#10b981',marginLeft:40,lineHeight:1.45}}>→ {iss.fix}</div>}
                          {iss.algorithmNote&&<div style={{fontSize:10,color:'#a78bfa',marginLeft:40,marginTop:3,fontStyle:'italic'}}>🔬 {iss.algorithmNote}</div>}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Showcase message */}
                {auditResult.showcase_message&&(
                  <div style={{marginTop:10}}>
                    <div style={{fontSize:9,fontWeight:700,color:'hsl(var(--muted-foreground))',letterSpacing:1,marginBottom:5}}>READY-TO-SEND PITCH MESSAGE</div>
                    <div style={{fontSize:12,color:'#d0d0e8',lineHeight:1.7,whiteSpace:'pre-wrap' as const,padding:'10px 12px',background:'hsl(var(--background))',borderRadius:8,border:'0.5px solid #1a1a3a',marginBottom:6}}>{auditResult.showcase_message}</div>
                    <button style={S.btn(copied==='audit_msg2'?'#10b981':'#a78bfa')} onClick={()=>copyText(auditResult.showcase_message,'audit_msg2')}>{copied==='audit_msg2'?'✓ Copied!':'Copy Message'}</button>
                  </div>
                )}

                {/* Fallback: flat issues list (legacy) */}
                {!auditResult.categories?.length&&auditResult.issues?.length>0&&(
                  <div>{auditResult.issues.map((iss:any,i:number)=>(
                    <div key={i} style={{fontSize:11,color:'hsl(var(--foreground))',padding:'4px 0',borderBottom:'0.5px solid #1a1a3a'}}>• {typeof iss==='string'?iss:iss.issue}</div>
                  ))}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ RESPONSES ═══ */}
        {tab==='responses'&&(
          <div>
            <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap' as const}}>
              {cats.map(c=><button key={c} style={S.btn(respCat===c?'#10b981':'hsl(var(--muted-foreground))')} onClick={()=>setRespCat(c)}>{c.charAt(0).toUpperCase()+c.slice(1)}</button>)}
            </div>
            {filteredResps.map((r:any)=>(
              <div key={r.id} style={{...S.card,borderColor:copied===r.id?'rgba(16,185,129,.3)':'#1a1a3a'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div><div style={{fontSize:12,fontWeight:700}}>{r.title}</div><div style={{display:'flex',gap:6,marginTop:3}}><span style={S.badge('#6366f1')}>{r.category}</span></div></div>
                  <button style={S.btn(copied===r.id?'#10b981':'#a78bfa')} onClick={()=>{copyText(r.body,r.id);post('increment_response_usage',{responseId:r.id});}}>{copied===r.id?'✓ Copied!':'Copy'}</button>
                </div>
                <div style={{fontSize:12,color:'#d0d0e8',lineHeight:1.6,whiteSpace:'pre-wrap' as const}}>{r.body}</div>
              </div>
            ))}
            {!filteredResps.length&&<div style={{color:'hsl(var(--muted-foreground))',textAlign:'center' as const,padding:32}}>No responses found</div>}
          </div>
        )}

        {/* ═══ LEADS ═══ */}
        {tab==='leads'&&(
          <div>
            {assignments.map((a:any)=>(
              <div key={a.id} style={{...S.card,borderLeft:`3px solid ${STAGE_C[a.stage]||'hsl(var(--border))'}`,borderRadius:'0 11px 11px 0'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div><div style={{fontSize:13,fontWeight:700}}>{a.prospects?.company||a.prospects?.name||a.prospects?.url||'Lead'}</div><div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap' as const}}><span style={S.badge(STAGE_C[a.stage]||'hsl(var(--muted-foreground))')}>{a.stage}</span><span style={S.badge(a.priority==='hot'?'#ef4444':'#f59e0b')}>{a.priority}</span></div></div>
                  {a.prospects?.url&&<button style={S.btn()} onClick={()=>{setAuditUrl(a.prospects.url);setTab('tools');}}>Quick Audit</button>}
                </div>
              </div>
            ))}
            {!assignments.length&&<div style={{color:'hsl(var(--muted-foreground))',textAlign:'center' as const,padding:32}}>No leads assigned</div>}
          </div>
        )}

        {/* ═══ DOCUMENTS ═══ */}
        {tab==='docs'&&(
          <DocGenerator analysis={analysis} auditResult={auditResult} prospectName={savedProspect?.name||leadNameInput||parsedMsgs.find((m:any)=>m.speaker==='client')?.speakerName||''} prospectUrl={savedProspect?.url||auditResult?.url||auditUrl||''} clientIndustry={savedProspect?.industry||''}/>
        )}
      </div>
      {/* Confirm delete modal */}
      {confirmDelete&&(
          <div style={{background:'hsl(var(--background))',border:'0.5px solid #1a1a3a',borderRadius:14,padding:24,maxWidth:360,width:'90%'}} onClick={(e:any)=>e.stopPropagation()}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>Delete lead?</div>
            <div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginBottom:16}}>This will permanently delete <b>{confirmDelete}</b> and all their conversation history. Cannot be undone.</div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button style={{padding:'7px 16px',borderRadius:8,background:'rgba(239,68,68,.15)',border:'0.5px solid rgba(239,68,68,.4)',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:700}} onClick={()=>deleteLead(confirmDelete)}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}