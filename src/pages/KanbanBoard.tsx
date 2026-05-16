import React,{useState,useEffect,useCallback} from "react";
import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));

const COLS=[
  {id:"todo",label:"📋 To Do",color:"#4b4b6a"},
  {id:"in_progress",label:"⚡ In Progress",color:"var(--accent)"},
  {id:"review",label:"👁 Review",color:"#f59e0b"},
  {id:"done",label:"✅ Done",color:"#10b981"},
  {id:"verified",label:"🧠 Verified",color:"#a78bfa"},
];
const PRIORITY_C:any={critical:"#ef4444",high:"#f59e0b",medium:"var(--accent)",low:"#10b981"};
const CAT_I:any={seo:"🔍",content:"📝",technical:"⚙️",links:"🔗",reporting:"📊",comms:"💬",other:"📌"};

export default function KanbanBoard(){
  const[projects,setProjects]=useState<any[]>([]);
  const[staff,setStaff]=useState<any[]>([]);
  const[sel,setSel]=useState("");
  const[columns,setColumns]=useState<Record<string,any[]>>({});
  const[adding,setAdding]=useState<string|null>(null);
  const[newTask,setNew]=useState({title:"",description:"",priority:"medium",category:"seo",assignedTo:"",dueDate:""});
  const[dragging,setDragging]=useState<any>(null);
  const[loading,setLoading]=useState(false);

  useEffect(()=>{
    import("@/lib/supabase").then(({supabase})=>{
      supabase.from("projects").select("id,name").limit(20).then(({data})=>{
        setProjects(data||[]); if(data?.length)setSel(data[0].id);
      });
    });
    post("get_staff").then(r=>setStaff((r as any).staff||[]));
  },[]);

  const loadBoard=useCallback(async()=>{
    if(!sel)return;
    setLoading(true);
    const r=await post("get_kanban",{projectId:sel});
    setColumns((r as any).columns||{});
    setLoading(false);
  },[sel]);

  useEffect(()=>{loadBoard();},[loadBoard]);

  async function addTask(status:string){
    if(!newTask.title.trim()||!sel)return;
    await post("upsert_kanban_task",{...newTask,projectId:sel,status,
      assignedTo:newTask.assignedTo||undefined,dueDate:newTask.dueDate||undefined});
    setAdding(null); setNew({title:"",description:"",priority:"medium",category:"seo",assignedTo:"",dueDate:""});
    loadBoard();
  }

  async function moveTask(task:any,newStatus:string){
    await post("move_kanban_task",{taskId:task.id,newStatus});
    loadBoard();
  }

  async function deleteTask(taskId:string){
    await post("delete_kanban_task",{taskId});
    loadBoard();
  }

  function onDragStart(task:any){setDragging(task);}
  function onDragOver(e:any){e.preventDefault();}
  function onDrop(e:any,status:string){
    e.preventDefault();
    if(dragging&&dragging.status!==status){moveTask(dragging,status);}
    setDragging(null);
  }

  const S:any={
    root:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",
      fontFamily:"-apple-system,'SF Pro Display',system-ui,sans-serif"},
    hdr:{background:"rgba(8,8,24,.92)",backdropFilter:"blur(20px)",
      borderBottom:"0.5px solid var(--border)",height:56,padding:"0 20px",
      position:"sticky" as const,top:0,zIndex:100,
      display:"flex",alignItems:"center",justifyContent:"space-between"},
    board:{display:"flex",gap:12,padding:"16px 16px",overflowX:"auto" as const,
      minHeight:"calc(100vh - 56px)",alignItems:"flex-start"},
    col:{minWidth:280,maxWidth:280,flexShrink:0},
    colHdr:{padding:"10px 12px",borderRadius:"10px 10px 0 0",
      display:"flex",justifyContent:"space-between",alignItems:"center",
      background:"var(--bg-card)",borderBottom:"0.5px solid var(--border)"},
    colBody:{background:"var(--bg-deep)",borderRadius:"0 0 10px 10px",
      border:"0.5px solid var(--border)",borderTop:"none",
      minHeight:200,padding:8,display:"flex",flexDirection:"column" as const,gap:6},
    task:{background:"var(--bg-card)",border:"0.5px solid var(--border)",
      borderRadius:9,padding:"10px 12px",cursor:"grab" as const,
      transition:"box-shadow .15s,transform .15s",userSelect:"none" as const},
    inp:{background:"var(--bg-deep)",border:"0.5px solid var(--border)",borderRadius:7,
      color:"var(--text)",padding:"7px 10px",fontSize:12,outline:"none",width:"100%",
      boxSizing:"border-box" as const,marginBottom:6,fontFamily:"inherit"},
    sel:{background:"var(--bg-deep)",border:"0.5px solid var(--border)",borderRadius:7,
      color:"var(--text)",padding:"7px 10px",fontSize:12,width:"100%",marginBottom:6},
    addBtn:{background:"var(--accent-glow)",border:"0.5px solid var(--border-glow)",
      borderRadius:7,color:"var(--accent-soft)",padding:"6px 12px",fontSize:11,
      fontWeight:600,cursor:"pointer",width:"100%",marginTop:4},
  };

  return(
    <div style={S.root} className="empire-page">
      <AnimatedBg/>
      <div style={{position:"relative",zIndex:1}}>
        <div style={S.hdr}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:18}}>📋</span>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>Kanban Delivery Board</div>
              <div style={{fontSize:10,color:"var(--text-muted)",letterSpacing:"1px"}}>
                {Object.values(columns).flat().length} tasks across {Object.keys(columns).length} stages
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <select style={{background:"var(--bg-card)",border:"0.5px solid var(--border)",
              borderRadius:8,color:"var(--text)",padding:"6px 10px",fontSize:11}}
              value={sel} onChange={e=>setSel(e.target.value)}>
              {projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ThemeToggle compact/>
          </div>
        </div>

        {loading?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",
            height:"calc(100vh - 56px)",color:"var(--text-muted)"}}>Loading board...</div>
        ):(
          <div style={S.board}>
            {COLS.map(col=>{
              const tasks=columns[col.id]||[];
              return(
                <div key={col.id} style={S.col}>
                  <div style={S.colHdr}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:700,color:col.color}}>{col.label}</span>
                      <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,
                        background:`${col.color}18`,color:col.color}}>{tasks.length}</span>
                    </div>
                    <button onClick={()=>setAdding(adding===col.id?null:col.id)}
                      style={{background:"none",border:"none",color:"var(--text-muted)",
                        cursor:"pointer",fontSize:16,lineHeight:1}}>+</button>
                  </div>
                  <div style={S.colBody}
                    onDragOver={onDragOver} onDrop={e=>onDrop(e,col.id)}>
                    {/* Add task form */}
                    {adding===col.id&&(
                      <div style={{background:"var(--bg-card)",borderRadius:9,padding:10,
                        border:"0.5px solid var(--border-glow)"}}>
                        <input style={S.inp} value={newTask.title}
                          onChange={e=>setNew({...newTask,title:e.target.value})}
                          placeholder="Task title..." autoFocus/>
                        <textarea style={{...S.inp,resize:"none" as const,minHeight:50}}
                          value={newTask.description}
                          onChange={e=>setNew({...newTask,description:e.target.value})}
                          placeholder="Description (optional)"/>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                          <select style={S.sel} value={newTask.priority}
                            onChange={e=>setNew({...newTask,priority:e.target.value})}>
                            <option value="low">🟢 Low</option>
                            <option value="medium">🟡 Medium</option>
                            <option value="high">🟠 High</option>
                            <option value="critical">🔴 Critical</option>
                          </select>
                          <select style={S.sel} value={newTask.category}
                            onChange={e=>setNew({...newTask,category:e.target.value})}>
                            <option value="seo">🔍 SEO</option>
                            <option value="content">📝 Content</option>
                            <option value="technical">⚙️ Technical</option>
                            <option value="links">🔗 Links</option>
                            <option value="reporting">📊 Reporting</option>
                          </select>
                        </div>
                        <select style={S.sel} value={newTask.assignedTo}
                          onChange={e=>setNew({...newTask,assignedTo:e.target.value})}>
                          <option value="">Unassigned</option>
                          {staff.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <div style={{display:"flex",gap:6}}>
                          <button style={S.addBtn} onClick={()=>addTask(col.id)}>Add Task</button>
                          <button style={{...S.addBtn,background:"var(--bg-deep)",color:"var(--text-muted)"}}
                            onClick={()=>setAdding(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {tasks.map((t:any)=>(
                      <div key={t.id} style={{...S.task,borderLeft:`3px solid ${PRIORITY_C[t.priority]||"var(--border)"}`}}
                        draggable onDragStart={()=>onDragStart(t)}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                          <span style={{fontSize:12}}>{CAT_I[t.category]||"📌"}</span>
                          <div style={{display:"flex",gap:4,alignItems:"center"}}>
                            <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:20,
                              background:`${PRIORITY_C[t.priority]}18`,color:PRIORITY_C[t.priority]}}>
                              {t.priority?.toUpperCase()}
                            </span>
                            <button onClick={()=>deleteTask(t.id)}
                              style={{background:"none",border:"none",color:"var(--text-muted)",
                                cursor:"pointer",fontSize:12,padding:0,lineHeight:1}}>✕</button>
                          </div>
                        </div>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:t.description?4:0,lineHeight:1.3}}>
                          {t.title}
                        </div>
                        {t.description&&(
                          <div style={{fontSize:11,color:"var(--text-sub)",lineHeight:1.4,marginBottom:4}}>
                            {t.description.slice(0,80)}{t.description.length>80?"...":""}
                          </div>
                        )}
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                          {t.staff_members&&(
                            <div style={{display:"flex",gap:4,alignItems:"center"}}>
                              <div style={{width:18,height:18,borderRadius:"50%",
                                background:"var(--accent-glow)",border:"0.5px solid var(--border-glow)",
                                display:"flex",alignItems:"center",justifyContent:"center",
                                fontSize:8,fontWeight:700,color:"var(--accent-soft)"}}>
                                {(t.staff_members.avatar_initials||t.staff_members.name?.slice(0,2)||"?").toUpperCase()}
                              </div>
                              <span style={{fontSize:10,color:"var(--text-muted)"}}>{t.staff_members.name}</span>
                            </div>
                          )}
                          {t.due_date&&(
                            <span style={{fontSize:9,color:new Date(t.due_date)<new Date()?"#f87171":"var(--text-muted)"}}>
                              📅 {new Date(t.due_date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
                            </span>
                          )}
                        </div>
                        {/* Move buttons */}
                        <div style={{display:"flex",gap:3,marginTop:7,flexWrap:"wrap" as const}}>
                          {COLS.filter(c=>c.id!==col.id).map(c=>(
                            <button key={c.id} onClick={()=>moveTask(t,c.id)}
                              style={{fontSize:9,padding:"2px 7px",borderRadius:20,cursor:"pointer",
                                background:`${c.color}12`,border:`0.5px solid ${c.color}30`,color:c.color}}>
                              → {c.id.replace("_"," ")}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!tasks.length&&!adding&&(
                      <div style={{textAlign:"center" as const,padding:"20px 0",color:"var(--text-muted)",fontSize:11}}>
                        Drop here or +
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
