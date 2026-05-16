import React,{useState,useEffect,useRef} from "react";

const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));

interface Props { onClose: () => void; }

const SECTION_META:any={
  projects:{icon:"🏗",label:"Projects",href:(r:any)=>`/client-dashboard?p=${r.id}`},
  learnings:{icon:"🧠",label:"Learnings",href:(r:any)=>`/brain-command`},
  prospects:{icon:"🎯",label:"Leads",href:(r:any)=>`/bde-panel`},
  staff:{icon:"👤",label:"Staff",href:(r:any)=>`/profile/${r.id}`},
};

export default function GlobalSearch({onClose}:Props){
  const[query,setQuery]=useState("");
  const[results,setResults]=useState<any>({});
  const[loading,setLoading]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);
  const debounceRef=useRef<any>(null);

  useEffect(()=>{inputRef.current?.focus();},[]);

  useEffect(()=>{
    if(debounceRef.current)clearTimeout(debounceRef.current);
    if(query.length<2){setResults({});return;}
    debounceRef.current=setTimeout(async()=>{
      setLoading(true);
      const r=await post("global_search",{query,limit:4});
      setResults((r as any).results||{});
      setLoading(false);
    },300);
  },[query]);

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[onClose]);

  const hasResults=Object.values(results).some((arr:any)=>arr?.length>0);

  return(
    <div style={{position:"fixed" as const,inset:0,zIndex:9999,display:"flex",
      alignItems:"flex-start" as const,justifyContent:"center" as const,
      paddingTop:80,background:"rgba(0,0,0,.7)",backdropFilter:"blur(8px)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{width:"100%",maxWidth:580,background:"var(--bg-card)",
        border:"0.5px solid var(--border-glow)",borderRadius:16,overflow:"hidden" as const,
        boxShadow:"0 20px 60px rgba(0,0,0,.5)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",
          borderBottom:"0.5px solid var(--border)"}}>
          <span style={{fontSize:16,color:"var(--text-muted)"}}>🔍</span>
          <input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Search projects, leads, staff, learnings..."
            style={{flex:1,background:"none",border:"none",outline:"none",
              color:"var(--text)",fontSize:15,fontFamily:"inherit"}}/>
          {loading&&<div style={{width:14,height:14,border:"2px solid var(--accent)",
            borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>}
          <button onClick={onClose} style={{background:"none",border:"none",
            color:"var(--text-muted)",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        {hasResults&&(
          <div style={{maxHeight:400,overflowY:"auto" as const}}>
            {Object.entries(results).map(([section,items]:any)=>{
              if(!items?.length)return null;
              const meta=SECTION_META[section];
              return(
                <div key={section}>
                  <div style={{padding:"8px 18px 4px",fontSize:9,fontWeight:700,
                    letterSpacing:"1.2px",textTransform:"uppercase" as const,
                    color:"var(--text-muted)"}}>
                    {meta?.icon} {meta?.label||section}
                  </div>
                  {items.map((r:any)=>(
                    <a key={r.id} href={meta?.href(r)||"#"}
                      onClick={onClose}
                      style={{display:"flex",gap:12,padding:"10px 18px",
                        alignItems:"center",textDecoration:"none",
                        borderBottom:"0.5px solid var(--border)",
                        transition:"background .1s"}}
                      onMouseEnter={e=>(e.currentTarget.style.background="var(--bg-deep)")}
                      onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                      <div style={{width:28,height:28,borderRadius:8,flexShrink:0,
                        background:"var(--accent-glow)",display:"flex",
                        alignItems:"center",justifyContent:"center",fontSize:12}}>
                        {meta?.icon||"•"}
                      </div>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>
                          {r.name||r.card_title||r.company||r.title||r.url}
                        </div>
                        <div style={{fontSize:11,color:"var(--text-muted)"}}>
                          {r.industry||r.card_type||r.role||r.lead_score&&`Score: ${r.lead_score}`||""}
                          {r.url&&` · ${r.url}`}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {query.length>=2&&!hasResults&&!loading&&(
          <div style={{padding:"24px",textAlign:"center" as const,color:"var(--text-muted)",fontSize:13}}>
            No results for "{query}"
          </div>
        )}
        {query.length<2&&(
          <div style={{padding:"16px 18px",display:"flex",gap:8,flexWrap:"wrap" as const}}>
            {[["⌘K","Open search"],["↑↓","Navigate"],["↵","Open"],["Esc","Close"]].map(([k,l])=>(
              <div key={k} style={{display:"flex",gap:4,alignItems:"center",fontSize:11,color:"var(--text-muted)"}}>
                <span style={{background:"var(--bg-deep)",border:"0.5px solid var(--border)",
                  borderRadius:4,padding:"2px 6px",fontFamily:"monospace",fontSize:10}}>{k}</span>
                <span>{l}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
