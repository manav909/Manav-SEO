import { useEffect, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import {
  Brain, ChevronRight, AlertTriangle, CheckCircle2,
  RefreshCw, X, Copy, Save, Sparkles, Target,
  Clock, FileText, Globe, Shield, Star, Settings,
  BarChart3, Zap, Play, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Block {
  id:string; type:string; title:string; content:string;
  priority:string; impact?:string; assignee?:string;
}

interface Props {
  block:     Block;
  projectId: string;
  role?:     string;
  onClose:   () => void;
  onMarkForVerification?: (block: Block) => void;
}

const ROLE_OPTIONS = [
  {id:'senior_seo',      label:'Senior SEO Strategist', icon:Brain   },
  {id:'content_writer',  label:'Content Writer',         icon:FileText},
  {id:'team_lead',       label:'Team Lead',              icon:Target  },
  {id:'project_manager', label:'Project Manager',        icon:Clock   },
  {id:'executive',       label:'Executive',              icon:Star    },
  {id:'biz_dev',         label:'Biz Dev Manager',        icon:Globe   },
];

const TYPE_ICONS: Record<string,any> = {
  technical:'#06b6d4', content:'#facc15', geo:'#6366f1',
  'quick-win':'#4ade80', competitive:'#fb923c', insight:'#f472b6',
  weekly:'#60a5fa', monthly:'#a78bfa', kpi:'#34d399', custom:'#94a3b8',
};

export default function TaskExecutor({ block, projectId, role: initRole, onClose, onMarkForVerification }: Props) {
  const [role,       setRole]       = useState(initRole || 'senior_seo');
  const [phase,      setPhase]      = useState<'loading'|'requirements'|'inputs'|'executing'|'done'>('loading');
  const [blueprint,  setBlueprint]  = useState<any>(null);
  const [available,  setAvailable]  = useState<any[]>([]);
  const [missing,    setMissing]    = useState<any[]>([]);
  const [dataGaps,   setDataGaps]   = useState<string[]>([]);
  const [userInputs, setUserInputs] = useState<Record<string,string>>({});
  const [context,    setContext]    = useState<any>(null);
  const [output,     setOutput]     = useState('');
  const [showReview, setShowReview] = useState(false);
  const [copied,     setCopied]     = useState(false);

  useEffect(() => { loadRequirements(); }, [block.id, projectId]);

  const loadRequirements = async () => {
    setPhase('loading');
    setOutput('');

    try {
      // 1. Get full project context
      const ctxRes = await fetch('/api/control', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action: 'get_context', projectId }),
      });
      const ctxData = await ctxRes.json();
      const ctx = ctxData.context || {};
      setContext(ctx);

      // 2. Get requirements for this task type
      const reqRes = await fetch('/api/task-engine', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'requirements', card:block, context:ctx }),
      });
      const reqData = await reqRes.json();
      setBlueprint(reqData.blueprint);
      setAvailable(reqData.available || []);
      setMissing(reqData.missing || []);
      setDataGaps(reqData.data_room_gaps || []);
      setPhase(reqData.can_execute_now ? 'requirements' : 'inputs');
    } catch (e: any) {
      toast({ title:'Failed to load', description:(e as Error).message, variant:'destructive' });
      setPhase('requirements');
    }
  };

  const execute = async () => {
    setPhase('executing');
    setOutput('');

    try {
      const res = await fetch('/api/task-engine', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'execute', card:block, context, userInputs, role }),
      });
      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setOutput(acc);
      }
      setPhase('done');
      setShowReview(true);
    } catch (e: any) {
      setOutput(`Error: ${(e as Error).message}`);
      setPhase('done');
    }
  };

  const copyOutput = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied to clipboard!' });
  };

  const saveToCache = async () => {
    if (!output || !projectId) return;
    try {
      await supabase.from('ai_content_cache').upsert({
        project_id:   projectId,
        content_type: `execution_${block.id}`,
        content:      output,
        status:       'complete',
      }, { onConflict: 'project_id,content_type' });
      toast({ title: 'Saved to project cache' });
    } catch {
      toast({ title: 'Could not save — check Supabase connection' });
    }
  };

  const color = TYPE_ICONS[block.type] || '#94a3b8';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"/>
      <div
        className="relative w-full max-w-4xl bg-[#0f0f13] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight:'94vh' }}
        onClick={e=>e.stopPropagation()}
      >
        {/* Header gradient */}
        <div className="h-1 w-full" style={{ background:`linear-gradient(90deg,${color},#8b5cf6,${color})` }}/>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 shrink-0">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background:`${color}18`, border:`1px solid ${color}28` }}>
            <Sparkles size={16} style={{ color }}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">AI Execution</span>
              <span className="text-xs px-2 py-0.5 rounded-full border font-mono" style={{ borderColor:`${color}40`, color, background:`${color}15` }}>{block.type}</span>
            </div>
            <div className="text-xs text-white/40 truncate mt-0.5">"{block.title}"</div>
          </div>

          {/* Role selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-white/30">As:</span>
            <select value={role} onChange={e=>setRole(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white/80 outline-none">
              {ROLE_OPTIONS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>

          <button onClick={onClose} className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 ml-1">
            <X size={13} className="text-white/50"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Loading ── */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-16">
              <RefreshCw size={24} className="animate-spin text-violet-400"/>
              <p className="text-sm text-white/50">Loading project intelligence...</p>
            </div>
          )}

          {/* ── Requirements / Inputs ── */}
          {(phase === 'requirements' || phase === 'inputs') && blueprint && (
            <div className="p-6 space-y-5">

              {/* What AI will produce */}
              <div className="rounded-xl border border-violet-400/25 bg-violet-400/5 p-4">
                <div className="text-xs font-mono text-violet-400 uppercase mb-2">What AI will produce</div>
                <p className="text-sm text-white/80">{blueprint.what_ai_produces}</p>
              </div>

              {/* Data Room gaps warning */}
              {dataGaps.length > 0 && (
                <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={13} className="text-yellow-400"/>
                    <span className="text-xs font-semibold text-yellow-400">Data Room incomplete — AI output will be less precise</span>
                  </div>
                  {dataGaps.map((g,i)=>(
                    <div key={i} className="text-xs text-white/50 flex items-start gap-2 mb-1">
                      <span className="text-yellow-400 shrink-0">⚠</span><span>{g}</span>
                    </div>
                  ))}
                  <a href="/data-room" target="_blank" rel="noreferrer" className="text-xs text-violet-400 hover:underline mt-1 inline-block">
                    Fill Data Room → (opens in new tab)
                  </a>
                </div>
              )}

              {/* What AI already has */}
              {available.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-white mb-2 flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-green-400"/>
                    Information AI already has ({available.length} inputs)
                  </div>
                  <div className="space-y-1.5">
                    {available.map((a,i)=>(
                      <div key={i} className="flex items-start gap-2 rounded-lg border border-green-400/15 bg-green-400/5 px-3 py-2">
                        <CheckCircle2 size={11} className="text-green-400 shrink-0 mt-0.5"/>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-white/70">{a.label}: </span>
                          <span className="text-xs text-green-400 font-mono truncate">{String(a.value).slice(0,80)}{String(a.value).length>80?'…':''}</span>
                        </div>
                        <span className="text-xs text-white/25 shrink-0">{a.source}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* What AI needs from you */}
              {missing.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-white mb-2 flex items-center gap-2">
                    <AlertTriangle size={12} className="text-orange-400"/>
                    AI needs this from you to avoid assumptions ({missing.length} inputs required)
                  </div>
                  <div className="space-y-3">
                    {missing.map((m: any,i: number)=>(
                      <div key={i} className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3">
                        <label className="text-xs font-semibold text-white flex items-center gap-1.5 mb-1.5">
                          <span className="text-orange-400">{i+1}.</span>
                          {m.label}
                        </label>
                        <div className="text-xs text-white/40 mb-2 flex items-start gap-1.5">
                          <ChevronRight size={10} className="text-orange-400 shrink-0 mt-0.5"/>
                          <span>Why needed: {m.why}</span>
                        </div>
                        <textarea
                          value={userInputs[m.key] || ''}
                          onChange={e=>setUserInputs(prev=>({...prev,[m.key]:e.target.value}))}
                          placeholder={`Enter ${m.label.toLowerCase()}...`}
                          rows={2}
                          className="w-full text-sm px-3 py-2 rounded-xl border border-white/10 bg-white/3 text-white placeholder-white/20 outline-none focus:border-violet-400/50 resize-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Human review checklist preview */}
              <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                <button onClick={()=>setShowReview(!showReview)} className="w-full flex items-center justify-between text-xs font-semibold text-white/60">
                  <span>Human review checklist ({blueprint.review_checklist?.length} items) — you will run these after AI executes</span>
                  {showReview?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
                </button>
                {showReview && (
                  <div className="mt-3 space-y-1.5">
                    {blueprint.review_checklist?.map((item: string,i: number)=>(
                      <div key={i} className="flex items-start gap-2 text-xs text-white/50">
                        <span className="text-white/20 shrink-0 w-4">{i+1}.</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Executing ── */}
          {phase === 'executing' && (
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <RefreshCw size={16} className="animate-spin text-violet-400"/>
                <span className="text-sm text-white/60">AI is executing this task — streaming output...</span>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/2 p-4">
                <pre className="text-xs text-white/70 whitespace-pre-wrap leading-relaxed font-mono">{output || 'Starting...'}</pre>
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {phase === 'done' && output && (
            <div className="p-6 space-y-4">
              {/* Output */}
              <div className="rounded-xl border border-white/8 bg-white/2 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 bg-white/3">
                  <span className="text-xs font-semibold text-white">AI Output — Review before using</span>
                  <div className="flex gap-2">
                    <button onClick={copyOutput} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-white/10 text-white/50 hover:text-white/80 transition-colors">
                      <Copy size={10}/>{copied?'Copied!':'Copy all'}
                    </button>
                    <button onClick={saveToCache} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-violet-400/30 bg-violet-400/10 text-violet-400 hover:bg-violet-400/20 transition-colors">
                      <Save size={10}/>Save to project
                    </button>
                  </div>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto">
                  <OutputRenderer text={output}/>
                </div>
              </div>

              {/* Human review checklist — mandatory */}
              {blueprint?.review_checklist && (
                <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield size={14} className="text-yellow-400"/>
                    <span className="text-sm font-bold text-yellow-400">Mandatory Human Review Before This Is Done</span>
                  </div>
                  <div className="space-y-2">
                    {blueprint.review_checklist.map((item: string, i: number) => (
                      <ReviewItem key={i} index={i+1} text={item}/>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-yellow-400/15">
                    <p className="text-xs text-yellow-400/70">
                      <span className="font-semibold">Verification method:</span> {blueprint.verification_method}
                    </p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={()=>onMarkForVerification?.(block)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors"
                >
                  <CheckCircle2 size={14}/>I have reviewed — submit for verification
                </button>
                <button
                  onClick={()=>{ setPhase('inputs'); setOutput(''); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-sm text-white/60 transition-colors"
                >
                  <RefreshCw size={13}/>Re-execute with more input
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer action bar */}
        {(phase === 'requirements' || phase === 'inputs') && (
          <div className="px-6 py-4 border-t border-white/8 shrink-0 bg-white/2">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={execute}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm transition-all"
                style={{ background: `linear-gradient(135deg,#7c3aed,${color})` }}
              >
                <Play size={14}/>Execute Task with AI
              </button>
              {missing.length > 0 && (
                <p className="text-xs text-white/30">
                  {missing.filter(m=>!userInputs[m.key]).length} input{missing.filter(m=>!userInputs[m.key]).length!==1?'s':''} empty — AI will note gaps and proceed with available data
                </p>
              )}
              {dataGaps.length > 0 && (
                <p className="text-xs text-orange-400/60">
                  Fill Data Room for better output quality
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Review item with checkbox ── */
function ReviewItem({ index, text }: { index: number; text: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <div
      className={`flex items-start gap-3 cursor-pointer rounded-lg p-2 transition-colors ${checked?'bg-green-400/5':'hover:bg-white/3'}`}
      onClick={()=>setChecked(!checked)}
    >
      <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all ${checked?'bg-green-500 border-green-500':'border-white/20'}`}>
        {checked&&<CheckCircle2 size={10} className="text-white"/>}
      </div>
      <div className="flex-1">
        <span className="text-xs text-yellow-400/60 font-mono mr-2">{index}.</span>
        <span className={`text-xs ${checked?'line-through text-white/25':'text-white/60'}`}>{text}</span>
      </div>
    </div>
  );
}

/* ── Output renderer with markdown-like formatting ── */
function OutputRenderer({ text }: { text: string }) {
  return (
    <div className="text-xs leading-relaxed space-y-1">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('# '))   return <div key={i} className="font-bold text-sm text-white mt-4 mb-2">{line.slice(2)}</div>;
        if (line.startsWith('## '))  return <div key={i} className="font-bold text-xs text-violet-400 uppercase tracking-wider mt-3 mb-1.5 pb-1 border-b border-white/8">{line.slice(3)}</div>;
        if (line.startsWith('### ')) return <div key={i} className="font-semibold text-xs text-white/80 mt-2">{line.slice(4)}</div>;
        if (line.includes('[AI GENERATED')) return <div key={i} className="text-xs px-2 py-1 rounded bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 font-mono my-1">{line}</div>;
        if (line.startsWith('⚠'))   return <div key={i} className="text-xs px-2 py-1 rounded bg-orange-400/10 border border-orange-400/20 text-orange-400 my-1">{line}</div>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} className="flex gap-2 text-white/60 my-0.5"><span className="text-violet-400 shrink-0">•</span><span dangerouslySetInnerHTML={{__html:line.slice(2).replace(/\*\*(.+?)\*\*/g,'<strong class="text-white/80">$1</strong>')}}/></div>;
        if (/^\d+\./.test(line))    return <div key={i} className="flex gap-2 text-white/60 my-0.5"><span className="text-violet-400 shrink-0 font-mono">{line.match(/^\d+/)?.[0]}.</span><span dangerouslySetInnerHTML={{__html:line.replace(/^\d+\.\s*/,'').replace(/\*\*(.+?)\*\*/g,'<strong class="text-white/80">$1</strong>')}}/></div>;
        if (line.startsWith('---')) return <hr key={i} className="border-white/8 my-2"/>;
        if (!line.trim())           return <div key={i} className="h-1.5"/>;
        return <p key={i} className="text-white/60 my-0.5" dangerouslySetInnerHTML={{__html:line.replace(/\*\*(.+?)\*\*/g,'<strong class="text-white/80">$1</strong>')}}/>;
      })}
    </div>
  );
}
