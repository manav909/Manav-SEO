import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
import React,{useState,useEffect,useRef} from "react";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
const STAGE_C:any={new:"var(--text-muted)",contacted:"#6366f1",demo_sent:"#8b5cf6",proposal_sent:"#a78bfa",negotiating:"#f59e0b",won:"#10b981",lost:"#ef4444",nurture:"#06b6d4"};
const MOOD_C=(s:number)=>s>=70?"#10b981":s>=50?"#6366f1":s>=30?"#f59e0b":"#ef4444";
export default function BdePanel(){
  const[tab,setTab]=useState<"fiverr"|"leads"|"tools"|"responses"|"showcase">("fiverr");
  const[convText,setConv]=useState("");
  const[analysing,setAnalysing]=useState(false);
  const[analysis,setAnalysis]=useState<any>(null);
  const[parsedLines,setParsed]=useState<any[]>([]);
  const[auditUrl,setAuditUrl]=useState("");
  const[auditForLead,setAuditFor]=useState("");
  const[auditing,setAuditing]=useState(false);
  const[auditResult,setAuditResult]=useState<any>(null);
  const[quickResps,setQuickResps]=useState<any[]>([]);
  const[respCat,setRespCat]=useState("all");
  const[copied,setCopied]=useState<string|null>(null);
  const[assignments,setAssignments]=useState<any[]>([]);
  const[genResp,setGenResp]=useState(false);
  const[responses,setResponses]=useState<any>(null);
  const[selLine,setSelLine]=useState<number|null>(null);
  const textRef=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{
    post("get_quick_responses",{role:"bde"}).then(r=>setQuickResps((r as any).responses||[]));
    post("get_pipeline",{role:"bde"}).then(r=>setAssignments((r as any).assignments||[]));
  },[]);
  async function analyse(){
    if(!convText.trim())return;
    setAnalysing(true); setAnalysis(null); setParsed([]); setResponses(null);
    const r=await post("analyse_fiverr_conversation",{text:convText});
    setAnalysis((r as any).analysis);
    setParsed((r as any).parsed_lines||[]);
    setAnalysing(false);
  }
  async function doAudit(){
    if(!auditUrl.trim())return;
    setAuditing(true); setAuditResult(null);
    const r=await post("instant_audit_showcase",{url:auditUrl,forLead:auditForLead});
    setAuditResult(r); setAuditing(false);
  }
  async function genResponses(){
    if(!analysis||!convText)return;
    setGenResp(true);
    const r=await post("generate_responses",{text:convText,analysis});
    setResponses(r); setGenResp(false);
  }
  function copyText(text:string,id:string){
    navigator.clipboard.writeText(text).catch(()=>{});
    setCopied(id); setTimeout(()=>setCopied(null),2000);
  }
  const cats=["all",...new Set(quickResps.map((r:any)=>r.category))];
  const filteredResps=respCat==="all"?quickResps:quickResps.filter((r:any)=>r.category===respCat);
  const S:any={
    root:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"-apple-system,var(--font-display)"},
    hdr:{background:"var(--bg-deep)",borderBottom:"0.5px solid #1a1a3a",height:52,padding:"0 20px",
      position:"sticky" as const,top:0,zIndex:100,display:"flex",alignItems:"center",gap:14},
    tabs:{display:"flex",background:"var(--bg-deep)",borderBottom:"0.5px solid #1a1a3a",padding:"0 20px",overflowX:"auto" as const},
    tab:{padding:"9px 13px",fontSize:12,fontWeight:500,cursor:"pointer",border:"none",
      background:"transparent",color:"var(--text-sub)",borderBottom:"2px solid transparent",whiteSpace:"nowrap" as const},
    tabA:{color:"#10b981",borderBottom:"2px solid #10b981"},
    body:{padding:"14px 18px"},
    card:{background:"var(--bg-card)",border:"0.5px solid #1a1a3a",borderRadius:11,padding:14,marginBottom:10},
    textarea:{width:"100%",background:"var(--bg)",border:"0.5px solid #1a1a3a",borderRadius:9,
      color:"var(--text)",padding:"11px 13px",fontSize:13,lineHeight:1.6,
      resize:"vertical" as const,outline:"none",minHeight:120,boxSizing:"border-box" as const},
    inp:{background:"var(--bg)",border:"0.5px solid #1a1a3a",borderRadius:8,color:"var(--text)",padding:"8px 12px",fontSize:12,outline:"none"},
    btn:(c:string="#10b981")=>({background:`${c}18`,border:`0.5px solid ${c}40`,borderRadius:8,color:c,padding:"7px 14px",fontSize:11,fontWeight:600,cursor:"pointer"}),
    badge:(c:string)=>({fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,background:`${c}18`,color:c}),
    sec:{fontSize:10,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase" as const,color:"var(--text-muted)",marginBottom:8,marginTop:10},
  };
  return(
    <div style={S.root}>
      <AnimatedBg/>>
      <div style={S.hdr}>
        <div style={{width:8,height:8,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 8px #10b981"}}/>
        <span style={{fontSize:14,fontWeight:700}}>💼 BDE Panel</span>
        <span style={S.badge("#10b981")}>BUSINESS DEVELOPMENT</span>
        <span style={{fontSize:10,color:"var(--text-muted)",marginLeft:"auto"}}>{assignments.length} assigned leads</span>
      </div>
      <div style={S.tabs}>
        {([["fiverr","🟢 Fiverr Analyser"],["tools","⚡ Instant Tools"],["responses","💬 Quick Responses"],["leads","📋 My Leads"],["showcase","🏆 Showcase"]] as [typeof tab,string][]).map(([id,l])=>(
          <button key={id} style={{...S.tab,...(tab===id?S.tabA:{})}} onClick={()=>setTab(id)}>{l}</button>
        ))}
      </div>
      <div style={S.body}>

        {tab==="fiverr"&&(
          <div>
            <div style={{marginBottom:10,color:"var(--text-sub)",fontSize:12}}>
              Paste any Fiverr conversation — line by line analysis, mood detection, instant response generation. Any language.
            </div>
            <div style={S.card}>
              <textarea ref={textRef} style={S.textarea} value={convText} onChange={e=>setConv(e.target.value)}
                placeholder={"Paste Fiverr conversation here...\n\nClient: Hi can you help with my SEO?\nMe: Yes absolutely, what's your website?\nClient: It's mysite.com, I need more traffic..."}/>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button style={S.btn()} onClick={analyse} disabled={analysing||!convText.trim()}>
                  {analysing?"Analysing...":"🧠 Analyse Conversation"}
                </button>
                {analysis&&<button style={S.btn("#a78bfa")} onClick={genResponses} disabled={genResp}>
                  {genResp?"Generating...":"✍️ Generate Responses"}
                </button>}
                {convText&&<button style={S.btn("var(--text-muted)")} onClick={()=>{setConv("");setAnalysis(null);setParsed([]);setResponses(null);}}>Clear</button>}
              </div>
            </div>

            {analysis&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div style={S.card}>
                  <div style={S.sec}>Conversation Intelligence</div>
                  <div style={{display:"flex",gap:10,marginBottom:10}}>
                    <div style={{background:"var(--bg)",borderRadius:8,padding:"8px 12px",textAlign:"center" as const,flex:1}}>
                      <div style={{fontSize:20,fontWeight:700,color:MOOD_C(analysis.fiverr_specific?.order_probability||50),fontFamily:"monospace"}}>{analysis.fiverr_specific?.order_probability||0}%</div>
                      <div style={{fontSize:9,color:"var(--text-muted)"}}>ORDER PROBABILITY</div>
                    </div>
                    <div style={{background:"var(--bg)",borderRadius:8,padding:"8px 12px",flex:2}}>
                      <div style={{fontSize:11,fontWeight:600,color:"var(--text)",marginBottom:3}}>{analysis.conversation_type?.replace(/_/g," ").toUpperCase()}</div>
                      <div style={{fontSize:10,color:"var(--text-sub)"}}>{analysis.urgency} urgency · {analysis.client_level} buyer</div>
                    </div>
                  </div>
                  <div style={{padding:"8px 10px",background:"rgba(16,185,129,.05)",borderRadius:8,border:"0.5px solid rgba(16,185,129,.2)",marginBottom:8}}>
                    <div style={{fontSize:9,color:"#10b981",fontWeight:600,marginBottom:3}}>MAIN NEED</div>
                    <div style={{fontSize:12,color:"#d0d0e8"}}>{analysis.main_need}</div>
                  </div>
                  <div style={{padding:"8px 10px",background:"rgba(245,158,11,.04)",borderRadius:8,border:"0.5px solid rgba(245,158,11,.15)"}}>
                    <div style={{fontSize:9,color:"#f59e0b",fontWeight:600,marginBottom:3}}>HIDDEN CONCERN</div>
                    <div style={{fontSize:12,color:"#d0d0e8",fontStyle:"italic"}}>{analysis.hidden_concern}</div>
                  </div>
                  {analysis.fiverr_specific?.conversion_blocker&&(
                    <div style={{marginTop:8,padding:"8px 10px",background:"rgba(239,68,68,.04)",borderRadius:8,border:"0.5px solid rgba(239,68,68,.15)"}}>
                      <div style={{fontSize:9,color:"#f87171",fontWeight:600,marginBottom:3}}>CONVERSION BLOCKER</div>
                      <div style={{fontSize:12,color:"#d0d0e8"}}>{analysis.fiverr_specific.conversion_blocker}</div>
                    </div>
                  )}
                </div>
                <div style={S.card}>
                  <div style={S.sec}>📋 Best Next Message</div>
                  <div style={{fontSize:12,color:"#d0d0e8",lineHeight:1.7,marginBottom:10,whiteSpace:"pre-wrap" as const}}>
                    {analysis.best_next_message}
                  </div>
                  <button style={S.btn()} onClick={()=>copyText(analysis.best_next_message,"best")}>
                    {copied==="best"?"✓ Copied!":"Copy Message"}
                  </button>
                  {analysis.demo_to_show?.length>0&&(
                    <>
                      <div style={S.sec}>Show Them</div>
                      {analysis.demo_to_show.map((d:string,i:number)=>(
                        <div key={i} style={{fontSize:11,color:"#a78bfa",padding:"3px 0"}}>→ {d}</div>
                      ))}
                    </>
                  )}
                  {analysis.quick_wins_to_mention?.length>0&&(
                    <>
                      <div style={S.sec}>Quick Wins to Mention</div>
                      {analysis.quick_wins_to_mention.map((w:string,i:number)=>(
                        <div key={i} style={{fontSize:11,color:"#10b981",padding:"3px 0"}}>✓ {w}</div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {parsedLines.length>0&&(
              <div style={S.card}>
                <div style={S.sec}>Line-by-Line Analysis ({parsedLines.length} lines)</div>
                <div style={{maxHeight:350,overflowY:"auto" as const}}>
                  {(analysis?.line_by_line||parsedLines).map((line:any,i:number)=>{
                    const isClient=line.speaker==="client"||line.intent;
                    return(
                      <div key={i} onClick={()=>setSelLine(selLine===i?null:i)}
                        style={{padding:"8px 10px",marginBottom:4,borderRadius:8,cursor:"pointer",
                          background:selLine===i?"rgba(99,102,241,.08)":isClient?"rgba(255,255,255,.02)":"rgba(16,185,129,.02)",
                          border:`0.5px solid ${selLine===i?"rgba(99,102,241,.3)":isClient?"rgba(255,255,255,.05)":"rgba(16,185,129,.1)"}`}}>
                        <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                          <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:20,flexShrink:0,marginTop:1,
                            background:isClient?"rgba(99,102,241,.15)":"rgba(16,185,129,.15)",
                            color:isClient?"#a78bfa":"#10b981"}}>
                            {isClient?"CLIENT":"YOU"}
                          </span>
                          <div style={{flex:1}}>
                            <div style={{fontSize:12,color:"#d0d0e8"}}>{line.text||line.line}</div>
                            {(selLine===i||line.intent)&&isClient&&(
                              <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap" as const}}>
                                {line.intent&&<span style={{fontSize:9,color:"#f59e0b"}}>Intent: {line.intent}</span>}
                                {line.emotion&&<span style={{fontSize:9,color:line.emotion==="frustrated"?"#f87171":line.emotion==="excited"?"#10b981":"var(--text-sub)"}}>
                                  Emotion: {line.emotion}
                                </span>}
                                {line.suggested_reply&&selLine===i&&(
                                  <div style={{width:"100%",marginTop:6,padding:"6px 10px",background:"rgba(16,185,129,.05)",borderRadius:6,border:"0.5px solid rgba(16,185,129,.15)"}}>
                                    <div style={{fontSize:9,color:"#10b981",marginBottom:3}}>SUGGESTED REPLY</div>
                                    <div style={{fontSize:11,color:"#d0d0e8"}}>{line.suggested_reply}</div>
                                    <button style={{...S.btn(),marginTop:4,padding:"3px 8px",fontSize:9}} onClick={e=>{e.stopPropagation();copyText(line.suggested_reply,`line_${i}`);}}>
                                      {copied===`line_${i}`?"✓":"Copy"}
                                    </button>
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

            {responses?.responses?.length>0&&(
              <div>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text)",marginBottom:10}}>✍️ Response Strategies</div>
                {responses.responses.map((r:any,idx:number)=>(
                  <div key={idx} style={{...S.card,borderColor:idx===0?"rgba(16,185,129,.3)":"var(--border)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>{r.strategy}</div>
                        <div style={{display:"flex",gap:6,marginTop:3}}>
                          <span style={S.badge("#6366f1")}>{r.tone}</span>
                          {r.conversion_probability&&<span style={S.badge(r.conversion_probability>=60?"#10b981":"#f59e0b")}>{r.conversion_probability}% conv.</span>}
                        </div>
                      </div>
                      <button style={S.btn(copied===`resp_${idx}`?"#10b981":"#a78bfa")} onClick={()=>copyText(r.body,`resp_${idx}`)}>
                        {copied===`resp_${idx}`?"✓ Copied!":"Copy"}
                      </button>
                    </div>
                    <div style={{fontSize:12,color:"#d0d0e8",lineHeight:1.7,whiteSpace:"pre-wrap" as const}}>{r.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab==="tools"&&(
          <div>
            <div style={S.card}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>⚡ Instant Site Audit for Leads</div>
              <div style={{color:"var(--text-sub)",fontSize:12,marginBottom:12}}>
                Enter a lead's website URL. Get a technical audit message ready to paste into Fiverr or any chat — shows technical expertise instantly.
              </div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input style={{...S.inp,flex:2}} value={auditUrl} onChange={e=>setAuditUrl(e.target.value)}
                  placeholder="yourlead.com" onKeyDown={e=>e.key==="Enter"&&doAudit()}/>
                <input style={{...S.inp,flex:3}} value={auditFor} onChange={e=>setAuditFor(e.target.value)}
                  placeholder="Lead context: 'e-commerce site looking for more organic traffic'"/>
              </div>
              <button style={S.btn()} onClick={doAudit} disabled={auditing||!auditUrl}>
                {auditing?"Auditing...":"🔍 Generate Audit Showcase"}
              </button>
            </div>
            {auditResult&&(
              <div style={S.card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700}}>{auditResult.url}</div>
                    <div style={{display:"flex",gap:8,marginTop:4}}>
                      <span style={S.badge(auditResult.score>=70?"#10b981":auditResult.score>=50?"#f59e0b":"#ef4444")}>
                        SEO Score: {auditResult.score}/100
                      </span>
                      <span style={S.badge("#ef4444")}>{auditResult.issues?.length} issues found</span>
                    </div>
                  </div>
                  <button style={S.btn(copied==="audit_msg"?"#10b981":"#a78bfa")} onClick={()=>copyText(auditResult.showcase_message,"audit_msg")}>
                    {copied==="audit_msg"?"✓ Copied!":"Copy Message"}
                  </button>
                </div>
                <div style={{fontSize:12,color:"#d0d0e8",lineHeight:1.7,marginBottom:12,whiteSpace:"pre-wrap" as const,
                  padding:"12px",background:"var(--bg)",borderRadius:8,border:"0.5px solid rgba(16,185,129,.2)"}}>
                  {auditResult.showcase_message}
                </div>
                {auditResult.issues?.length>0&&(
                  <>
                    <div style={S.sec}>Issues Found</div>
                    {auditResult.issues.map((issue:any,i:number)=>(
                      <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"0.5px solid #111128"}}>
                        <span style={S.badge(issue.impact==="HIGH"?"#ef4444":"#f59e0b")}>{issue.impact}</span>
                        <div>
                          <div style={{fontSize:11,fontWeight:600,color:"var(--text)"}}>{issue.issue}</div>
                          <div style={{fontSize:10,color:"var(--text-sub)"}}>{issue.fix}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
            <div style={S.card}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>📊 Quick Technical Reports</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8}}>
                {[
                  {label:"Competitor Analysis",icon:"🔬",action:"analyze_competitor",desc:"Compare client vs competitors"},
                  {label:"LLM Visibility Check",icon:"🤖",action:"check_llm_visibility",desc:"Is client cited by AI?"},
                  {label:"Content Brief",icon:"📝",action:"generate_content_brief",desc:"Keyword-targeted content plan"},
                  {label:"Morning Brief",icon:"🌅",action:"get_morning_brief",desc:"Empire status & priorities"},
                ].map(tool=>(
                  <div key={tool.action} style={{background:"var(--bg)",border:"0.5px solid #1a1a3a",borderRadius:9,
                    padding:"12px",textAlign:"center" as const}}>
                    <div style={{fontSize:20,marginBottom:6}}>{tool.icon}</div>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--text)",marginBottom:3}}>{tool.label}</div>
                    <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:8}}>{tool.desc}</div>
                    <a href={`/${tool.action.replace(/_/g,"-")}`} style={{...S.btn(),fontSize:9,padding:"4px 8px",textDecoration:"none",display:"inline-block"}}>Open</a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==="responses"&&(
          <div>
            <div style={{marginBottom:10,color:"var(--text-sub)",fontSize:12}}>
              Pre-built responses for every Fiverr scenario. Click to copy instantly.
            </div>
            <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap" as const}}>
              {cats.map(c=>(
                <button key={c} style={S.btn(respCat===c?"#10b981":"var(--text-muted)")} onClick={()=>setRespCat(c)}>
                  {c.charAt(0).toUpperCase()+c.slice(1)}
                </button>
              ))}
            </div>
            {filteredResps.map((r:any)=>(
              <div key={r.id} style={{...S.card,borderColor:copied===r.id?"rgba(16,185,129,.3)":"var(--border)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>{r.title}</div>
                    <div style={{display:"flex",gap:6,marginTop:3}}>
                      <span style={S.badge("#6366f1")}>{r.category}</span>
                      <span style={{fontSize:9,color:"var(--text-muted)"}}>{r.usage_count} uses</span>
                      <span style={{fontSize:9,color:"var(--text-muted)"}}>{r.effectiveness}% effective</span>
                    </div>
                  </div>
                  <button style={S.btn(copied===r.id?"#10b981":"#a78bfa")}
                    onClick={()=>{copyText(r.body,r.id);post("increment_response_usage",{responseId:r.id});}}>
                    {copied===r.id?"✓ Copied!":"Copy"}
                  </button>
                </div>
                <div style={{fontSize:12,color:"#d0d0e8",lineHeight:1.6,whiteSpace:"pre-wrap" as const}}>{r.body}</div>
              </div>
            ))}
            {!filteredResps.length&&<div style={{color:"var(--text-muted)",textAlign:"center",padding:30}}>No responses in this category yet.</div>}
          </div>
        )}

        {tab==="leads"&&(
          <div>
            <div style={{marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:12,color:"var(--text-sub)"}}>{assignments.length} leads assigned to you</div>
            </div>
            {assignments.map((a:any)=>(
              <div key={a.id} style={{...S.card,borderLeft:`3px solid ${STAGE_C[a.stage]||"var(--border)"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>
                      {a.prospects?.company||a.prospects?.name||a.prospects?.url||"Lead"}
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap" as const}}>
                      <span style={S.badge(STAGE_C[a.stage]||"var(--text-muted)")}>{a.stage?.replace(/_/g," ").toUpperCase()}</span>
                      <span style={S.badge(a.priority==="hot"?"#ef4444":a.priority==="high"?"#f59e0b":"var(--text-muted)")}>{a.priority?.toUpperCase()}</span>
                      {a.prospects?.url&&<span style={{fontSize:10,color:"#6366f1"}}>{a.prospects.url}</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {a.prospects?.url&&(
                      <button style={S.btn()} onClick={()=>{setAuditUrl(a.prospects.url);setTab("tools");}}>
                        Quick Audit
                      </button>
                    )}
                  </div>
                </div>
                {a.notes&&<div style={{fontSize:11,color:"var(--text-sub)",marginBottom:8}}>{a.notes}</div>}
                {a.conversion_probability&&(
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{height:4,flex:1,background:"var(--border)",borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${a.conversion_probability}%`,
                        background:a.conversion_probability>=60?"#10b981":a.conversion_probability>=40?"#f59e0b":"#ef4444",
                        borderRadius:2,transition:"width .3s"}}/>
                    </div>
                    <span style={{fontSize:10,color:"var(--text-muted)",flexShrink:0}}>{a.conversion_probability}% likely</span>
                  </div>
                )}
              </div>
            ))}
            {!assignments.length&&<div style={{color:"var(--text-muted)",textAlign:"center",padding:40}}>No leads assigned yet. Contact your manager.</div>}
          </div>
        )}

        {tab==="showcase"&&(
          <div>
            <div style={{marginBottom:10,color:"var(--text-sub)",fontSize:12}}>
              Ready-to-share showcase materials. One click to copy for any Fiverr conversation.
            </div>
            <div style={{...S.card,borderColor:"rgba(99,102,241,.2)"}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Generate Instant Showcase</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  {type:"demo",label:"🎮 Interactive Demo",desc:"Generate platform walkthrough"},
                  {type:"case_study",label:"🏆 Case Study",desc:"Results from similar project"},
                  {type:"proposal",label:"📋 Custom Proposal",desc:"Tailored for their niche"},
                  {type:"walkthrough",label:"🗺 Process Walkthrough",desc:"How you work, step by step"},
                ].map(item=>(
                  <button key={item.type} onClick={()=>window.location.href="/client-comms"}
                    style={{background:"var(--bg)",border:"0.5px solid #1a1a3a",borderRadius:9,padding:"12px",
                      textAlign:"left" as const,cursor:"pointer"}}>
                    <div style={{fontSize:13,color:"var(--text)",fontWeight:600,marginBottom:3}}>{item.label}</div>
                    <div style={{fontSize:11,color:"var(--text-muted)"}}>{item.desc}</div>
                    <div style={{fontSize:10,color:"#6366f1",marginTop:6}}>→ Open in Comms →</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:8,color:"var(--text)"}}>📊 Technical Proof Points</div>
              <div style={{color:"var(--text-sub)",fontSize:11,marginBottom:10}}>Copy these technical credibility statements for Fiverr conversations</div>
              {[
                {text:"✅ We use a proprietary AI Brain system that learns from every client — tactics proven to work for one client are applied intelligently to your site.",cat:"credibility"},
                {text:"✅ Every change we make is verified with data before we move on. We don't assume — we measure.",cat:"process"},
                {text:"✅ Our LLM Visibility tracking ensures your site gets cited by ChatGPT and Claude — not just ranked on Google.",cat:"technical"},
                {text:"✅ We run morning intelligence briefs on your project daily — you'll never be in the dark about what's happening.",cat:"reporting"},
                {text:"✅ Full transparent reporting — you see exactly what tasks were done, what results were measured, what was learned.",cat:"transparency"},
              ].map((item,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                  padding:"8px 10px",marginBottom:6,background:"var(--bg)",borderRadius:8,border:"0.5px solid rgba(99,102,241,.12)"}}>
                  <div style={{fontSize:12,color:"#d0d0e8",flex:1,lineHeight:1.5,marginRight:10}}>{item.text}</div>
                  <button style={S.btn(copied===`proof_${i}`?"#10b981":"#6366f1")}
                    onClick={()=>copyText(item.text,`proof_${i}`)}>
                    {copied===`proof_${i}`?"✓":"Copy"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
