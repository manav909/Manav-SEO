/**
 * DeepEnrichModal — Hollywood-style Brain deepening experience
 *
 * Phase 1: Pre-flight questions (targeted, card-type-specific)
 * Phase 2: Live analysis theater (streaming + stage progress)
 * Phase 3: Result reveal with before/after
 */
import React, { useState, useEffect, useRef } from 'react';
import { Brain, X, ChevronRight, CheckCircle, Loader2, Zap, Activity, Database, Globe, Cpu, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/* ─── Types ─── */
interface Learning {
  id: string; project_id: string | null; card_type: string; card_title: string;
  what_worked: string[]; what_missed: string[]; improvement: string | null;
  context_summary: string | null; confidence_score: number; source: string;
}
interface Answers { [key: string]: string }
interface Props {
  learning:   Learning;
  projectUrl: string;
  onClose:    () => void;
  onSaved:    (updated: Partial<Learning>) => void;
}

/* ─── Question sets per card type ─── */
const QUESTIONS: Record<string, { id: string; q: string; options: string[]; freeText?: boolean }[]> = {
  technical: [
    { id: 'cms', q: 'What CMS / hosting platform?', options: ['HubSpot', 'WordPress', 'Webflow', 'Shopify', 'Custom', 'Not sure'] },
    { id: 'scope', q: 'How many pages does the site have?', options: ['<50', '50–200', '200–1000', '1000+', 'Not sure'] },
    { id: 'priority', q: 'Biggest known technical pain right now?', options: ['Slow PageSpeed', 'Crawl errors', 'Missing schema', 'Thin content', 'No indexation', 'Not sure'], freeText: true },
  ],
  content: [
    { id: 'stage', q: 'Current content production stage?', options: ['No content yet', 'Drafts in progress', 'Published, needs optimising', 'Optimised, needs amplifying'] },
    { id: 'target', q: 'Primary keyword intent to target?', options: ['Informational (guides/blogs)', 'Commercial (comparison/reviews)', 'Transactional (pricing/buy)', 'Navigational (brand)'] },
    { id: 'gap', q: 'Biggest content gap right now?', options: ['No top-of-funnel content', 'No product comparison content', 'No case studies / social proof', 'Missing FAQ / conversational content'], freeText: true },
  ],
  geo: [
    { id: 'visibility', q: 'Current AI engine visibility?', options: ['Zero — not cited anywhere', 'Occasionally cited', 'Cited but not prominently', 'Strong visibility'] },
    { id: 'platform', q: 'Priority AI platform to target?', options: ['Perplexity', 'ChatGPT Search', 'Google AI Overviews', 'All three equally'] },
    { id: 'schema', q: 'Existing structured data?', options: ['No schema at all', 'Basic FAQ schema', 'Some schema, not comprehensive', 'Full schema suite'] },
  ],
  competitive: [
    { id: 'known', q: 'How well do you know competitors?', options: ['Not researched yet', 'Know top 2–3 domains', 'Have backlink data', 'Full gap analysis done'] },
    { id: 'gap', q: 'Biggest competitive gap?', options: ['Content volume', 'Backlink authority', 'Brand awareness', 'Technical quality', 'AI visibility'] },
  ],
  insight: [
    { id: 'data', q: 'What data is available to validate this insight?', options: ['GSC data', 'Analytics data', 'Audit reports', 'User research', 'None yet'] },
    { id: 'confidence', q: 'How confident are you in this insight?', options: ['Hypothesis only', 'Some evidence', 'Strong evidence', 'Verified fact'] },
  ],
  default: [
    { id: 'context', q: 'What additional context matters most?', options: ['Timeline is urgent', 'Budget is limited', 'Technical team available', 'Content team available', 'Going it alone'] },
    { id: 'priority', q: 'What outcome matters most here?', options: ['Rankings increase', 'Traffic increase', 'Lead generation', 'Brand awareness', 'AI visibility'] },
  ],
};

/* ─── Analysis stages ─── */
const STAGES = [
  { id: 'scan',       label: 'SCANNING GAP STRUCTURE',         icon: Activity,  duration: 1200 },
  { id: 'cross',      label: 'CROSS-REFERENCING ALGORITHM DB',  icon: Database,  duration: 1800 },
  { id: 'fetch',      label: 'FETCHING LIVE CONTEXT',           icon: Globe,     duration: 1500 },
  { id: 'synthesise', label: 'SYNTHESISING INTELLIGENCE',        icon: Brain,     duration: 2000 },
  { id: 'validate',   label: 'VALIDATING AGAINST PROJECT DATA',  icon: Shield,    duration: 1200 },
  { id: 'calibrate',  label: 'CALIBRATING CONFIDENCE SCORE',     icon: Cpu,       duration: 800  },
];

/* ─── Particle stream ─── */
function DataStream() {
  const chars = '01アイウエオカキクケコSEO⬆⬇◈→←∞Δ';
  const cols = 12;
  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none', opacity:0.07 }}>
      {Array.from({length:cols}).map((_,i) => (
        <div key={i} style={{
          position:'absolute', left:`${(i/cols)*100}%`, top:0,
          fontSize:10, fontFamily:'monospace', color:'#a5b4fc',
          animation:`dataFall ${2+i*0.3}s linear ${i*0.2}s infinite`,
          whiteSpace:'pre', lineHeight:'1.2em',
          writingMode:'vertical-rl',
        }}>
          {Array.from({length:20}).map(() => chars[Math.floor(Math.random()*chars.length)]).join('')}
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ─── */
export default function DeepEnrichModal({ learning, projectUrl, onClose, onSaved }: Props) {
  // Safety guard — if learning is incomplete/undefined, close immediately
  React.useEffect(() => {
    if (!learning || !learning.id) { onClose(); }
  }, [learning, onClose]);

  const [phase,        setPhase]        = useState<'questions'|'analysing'|'result'>('questions');
  const [answers,      setAnswers]      = useState<Answers>({});
  const [stageIdx,     setStageIdx]     = useState(0);
  const [stagesDone,   setStagesDone]   = useState<Set<string>>(new Set());
  const [streamText,   setStreamText]   = useState('');
  const [result,       setResult]       = useState<Partial<Learning> | null>(null);
  const [error,        setError]        = useState('');
  const streamRef  = useRef('');
  const abortRef   = useRef(false);

  const questions = QUESTIONS[learning.card_type] || QUESTIONS.default;

  /* ─── Run analysis ─── */
  const runAnalysis = async () => {
    setPhase('analysing');
    setStageIdx(0);
    setStagesDone(new Set());
    setStreamText('');
    streamRef.current = '';
    abortRef.current  = false;

    // Animate stages while streaming
    let idx = 0;
    const advanceStage = () => {
      if (abortRef.current || idx >= STAGES.length) return;
      setStageIdx(idx);
      setTimeout(() => {
        setStagesDone(s => new Set([...s, STAGES[idx].id]));
        idx++;
        if (idx < STAGES.length) {
          setTimeout(advanceStage, STAGES[idx]?.duration || 1000);
        }
      }, STAGES[idx].duration);
    };
    advanceStage();

    const answerContext = Object.entries(answers)
      .map(([k, v]) => `${k}: ${v}`).join('; ');

    try {
      const res = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
        body: JSON.stringify({
          mode: 'brain_assistant',
          question: [
            `DEEP ENRICHMENT PROTOCOL — No assumptions, hard facts only.`,
            ``,
            `LEARNING TO ENRICH:`,
            `Title: ${learning.card_title || 'Brain Learning'}`,
            `Type: ${learning.card_type || 'insight'}`,
            `Confidence: ${(learning.confidence_score ?? 75)}/100`,
            `Gaps: ${(learning.what_missed||[]).join(' | ') || 'Not defined'}`,
            `Current directive: ${learning.improvement || 'Not defined'}`,
            `Context: ${learning.context_summary || 'Not provided'}`,
            ``,
            `USER CONTEXT PROVIDED:`,
            answerContext || 'No additional context provided',
            projectUrl ? `Site URL: ${projectUrl}` : '',
            ``,
            `YOUR TASK — go above and beyond:`,
            `1. For EACH gap detected, state: what specific data resolves it + what the likely finding IS based on industry patterns for this CMS/vertical`,
            `2. Generate MINIMUM 4 what_worked insights — each must be specific and actionable, not generic`,
            `3. Generate MINIMUM 3 what_missed findings — each must explain WHY it matters for rankings/traffic`,
            `4. Write ONE precise improvement directive: "To [achieve X], do [specific action] by [specific method] to reach [specific outcome]"`,
            `5. Calculate new confidence score: start at 75, +5 for each gap that has a clear resolution path, +5 for each concrete data point available`,
            ``,
            `HARD RULES:`,
            `- Never say "we need to check" without also stating what the answer likely is`,
            `- Every insight must reference the specific card type (${learning.card_type}) and context`,
            `- Confidence must increase from current ${(learning.confidence_score ?? 75)} — explain why`,
            ``,
            `After your analysis, emit this exact ACTION tag:`,
            `⟦ACTION⟧{"type":"save_learning","title":"[improved title]","cardType":"${learning.card_type}","whatWorked":["insight1","insight2","insight3","insight4"],"whatMissed":["gap1 — why it matters","gap2 — why it matters","gap3 — why it matters"],"improvement":"[sharp one-sentence directive]","confidence_score":[number 75-95],"summary":"${learning.context_summary||learning.card_title}","tags":["${learning.card_type}","enriched","brain-deep"]}⟦/ACTION⟧`,
          ].filter(Boolean).join('\n'),
          projectId:      learning.project_id,
          projectSummary: learning.context_summary || learning.card_title,
          brainAssistantContext: {
            projectContext: projectUrl ? { project: { url: projectUrl } } : null,
            learnings: [], algoItems: [], canvasBlocks: [], history: [],
          },
        }),
      });

      if (!res.ok || !res.body) throw new Error('Intelligence API unavailable — check Vercel logs');
      const reader = res.body.getReader();
      const dec    = new TextDecoder();

      while (true) {
        if (abortRef.current) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        streamRef.current += chunk;
        // Strip ACTION tags from display
        const display = streamRef.current.replace(/⟦ACTION⟧[\s\S]*?⟦\/ACTION⟧/g, '');
        setStreamText(display);
      }

      abortRef.current = true; // stop stage animation

      // Parse ACTION tag
      const actionMatch = /⟦ACTION⟧(\{[\s\S]*?\})⟦\/ACTION⟧/.exec(streamRef.current);
      if (actionMatch) {
        try {
          const action = JSON.parse(actionMatch[1]);
          const updates: Partial<Learning> = {
            card_title:      action.title          || learning.card_title,
            what_worked:     action.whatWorked      || action.what_worked   || [],
            what_missed:     action.whatMissed      || action.what_missed   || [],
            improvement:     action.improvement     || null,
            confidence_score:Math.min(95, Number(action.confidence_score) || ((learning.confidence_score ?? 75)) + 10),
            context_summary: action.summary         || learning.context_summary,
          };

          // Update Supabase
          if (!learning?.id) throw new Error('Learning ID missing — cannot update');
          const { error: dbErr } = await supabase
            .from('brain_learnings')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', learning.id);

          if (dbErr) throw new Error(dbErr.message);

          setResult(updates);
          setPhase('result');
        } catch (e: any) {
          setError('Parsing failed: ' + e.message);
          setPhase('result');
        }
      } else {
        setError('Brain did not return structured enrichment. Showing raw analysis below.');
        setPhase('result');
      }
    } catch (e: any) {
      abortRef.current = true;
      setError(e.message);
      setPhase('result');
    }
  };

  /* ─── Backdrop ─── */
  const Backdrop = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      position:'fixed', inset:0, zIndex:9999,
      background:'rgba(3,5,15,0.85)', backdropFilter:'blur(24px)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:24,
    }} onClick={(e) => { if (e.target === e.currentTarget) { abortRef.current=true; onClose(); } }}>
      {children}
    </div>
  );

  /* ══════════════════════════════════
     PHASE 1: PRE-FLIGHT QUESTIONS
  ══════════════════════════════════ */
  if (phase === 'questions') return (
    <Backdrop>
      <div style={{
        width:'100%', maxWidth:580, background:'rgba(8,10,24,0.95)',
        border:'1px solid rgba(99,102,241,0.3)', borderRadius:16, overflow:'hidden',
        boxShadow:'0 0 60px rgba(99,102,241,0.15), 0 0 120px rgba(99,102,241,0.05)',
        position:'relative',
      }}>
        {/* Header */}
        <div style={{
          background:'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.1))',
          borderBottom:'1px solid rgba(99,102,241,0.2)', padding:'16px 20px',
          display:'flex', alignItems:'flex-start', gap:12,
        }}>
          <div style={{
            width:36, height:36, borderRadius:9, background:'rgba(99,102,241,0.2)',
            border:'1px solid rgba(99,102,241,0.4)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            boxShadow:'0 0 16px rgba(99,102,241,0.4)',
          }}>
            <Brain size={16} style={{color:'#a5b4fc'}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:11, fontFamily:'monospace', color:'#a5b4fc', fontWeight:900, letterSpacing:'0.1em'}}>
              ◈ BRAIN PRE-FLIGHT — FACT COLLECTION
            </div>
            <div style={{fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:3, lineHeight:1.4}}>
              Answer to guide Brain. Skip anything you don't know — Brain will reason from what's available.
            </div>
            <div style={{
              marginTop:8, padding:'6px 10px', background:'rgba(251,191,36,0.08)',
              border:'1px solid rgba(251,191,36,0.2)', borderRadius:6, fontSize:10, color:'#fbbf24',
            }}>
              Enriching: <strong>{learning.card_title}</strong> ({learning.card_type}) · Confidence {learning.confidence_score||75}/100
            </div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.3)',padding:4,marginTop:-4}}>
            <X size={14}/>
          </button>
        </div>

        {/* Questions */}
        <div style={{padding:'20px', display:'flex', flexDirection:'column', gap:16}}>
          {questions.map((q, qi) => (
            <div key={q.id}>
              <div style={{fontSize:11, color:'rgba(255,255,255,0.7)', marginBottom:8, fontWeight:600, display:'flex', gap:8, alignItems:'center'}}>
                <span style={{fontFamily:'monospace', color:'rgba(99,102,241,0.6)', fontSize:10}}>{String(qi+1).padStart(2,'0')}</span>
                {q.q}
              </div>
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {q.options.map(opt => (
                  <button key={opt} onClick={() => setAnswers(a => ({...a, [q.id]: a[q.id]===opt ? '' : opt}))}
                    style={{
                      padding:'5px 12px', fontSize:10, fontFamily:'monospace', borderRadius:6, cursor:'pointer',
                      background: answers[q.id]===opt ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${answers[q.id]===opt ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)'}`,
                      color: answers[q.id]===opt ? '#c7d2fe' : 'rgba(255,255,255,0.5)',
                      transition:'all 0.15s',
                    }}>
                    {answers[q.id]===opt ? '✓ ' : ''}{opt}
                  </button>
                ))}
                {q.freeText && (
                  <input placeholder="or type your own..."
                    value={answers[`${q.id}_custom`] || ''}
                    onChange={e => setAnswers(a => ({...a, [`${q.id}_custom`]: e.target.value}))}
                    style={{
                      flex:1, minWidth:140, padding:'5px 10px', fontSize:10, fontFamily:'monospace',
                      background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
                      borderRadius:6, color:'rgba(255,255,255,0.7)', outline:'none',
                    }}/>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Launch */}
        <div style={{padding:'0 20px 20px', display:'flex', gap:10, alignItems:'center'}}>
          <button onClick={onClose}
            style={{padding:'8px 16px', fontSize:10, fontFamily:'monospace', borderRadius:8, cursor:'pointer', background:'none', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.3)'}}>
            CANCEL
          </button>
          <div style={{flex:1}}/>
          <button onClick={runAnalysis}
            style={{
              display:'flex', alignItems:'center', gap:8, padding:'10px 24px',
              background:'linear-gradient(135deg,#6366f1,#4f46e5)', border:'none', borderRadius:8,
              cursor:'pointer', color:'white', fontSize:11, fontFamily:'monospace', fontWeight:700,
              boxShadow:'0 0 20px rgba(99,102,241,0.4)', letterSpacing:'0.06em',
            }}>
            <Zap size={12}/>BEGIN DEEP ANALYSIS →
          </button>
        </div>

        <style>{`@keyframes dataFall { from { transform: translateY(-100%) } to { transform: translateY(100vh) } }`}</style>
      </div>
    </Backdrop>
  );

  /* ══════════════════════════════════
     PHASE 2: LIVE ANALYSIS THEATER
  ══════════════════════════════════ */
  if (phase === 'analysing') return (
    <Backdrop>
      <div style={{
        width:'100%', maxWidth:760, maxHeight:'90vh',
        background:'rgba(4,6,15,0.97)', border:'1px solid rgba(99,102,241,0.25)',
        borderRadius:16, overflow:'hidden', position:'relative',
        boxShadow:'0 0 80px rgba(99,102,241,0.2), 0 0 160px rgba(99,102,241,0.05)',
      }}>
        <DataStream/>

        {/* Top bar */}
        <div style={{
          display:'flex', alignItems:'center', gap:10, padding:'12px 18px',
          background:'rgba(0,0,0,0.4)', borderBottom:'1px solid rgba(99,102,241,0.15)',
          backdropFilter:'blur(10px)', position:'relative', zIndex:1,
        }}>
          <div style={{width:8,height:8,borderRadius:'50%',background:'#ef4444',boxShadow:'0 0 6px #ef4444'}}/>
          <div style={{width:8,height:8,borderRadius:'50%',background:'#fbbf24',boxShadow:'0 0 6px #fbbf24'}}/>
          <div style={{width:8,height:8,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 6px #10b981'}}/>
          <span style={{fontSize:10,fontFamily:'monospace',color:'rgba(165,180,252,0.6)',marginLeft:8,letterSpacing:'0.1em'}}>
            MANAV BRAIN — DEEP ENRICHMENT PROTOCOL
          </span>
          <div style={{flex:1}}/>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <div style={{width:5,height:5,borderRadius:'50%',background:'#10b981',animation:'pulse 1s ease-in-out infinite'}}/>
            <span style={{fontSize:9,fontFamily:'monospace',color:'#10b981'}}>LIVE</span>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'220px 1fr',height:'calc(90vh - 50px)',overflow:'hidden',position:'relative',zIndex:1}}>
          {/* Stage panel */}
          <div style={{borderRight:'1px solid rgba(255,255,255,0.05)',padding:'16px 0',background:'rgba(0,0,0,0.2)',display:'flex',flexDirection:'column',gap:2}}>
            <div style={{padding:'0 16px 10px',fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.15em'}}>
              ANALYSIS PIPELINE
            </div>
            {STAGES.map((s, i) => {
              const done    = stagesDone.has(s.id);
              const active  = i === stageIdx && !done;
              const pending = i > stageIdx;
              const Icon    = s.icon;
              return (
                <div key={s.id} style={{
                  display:'flex', alignItems:'center', gap:8, padding:'8px 16px',
                  background: active ? 'rgba(99,102,241,0.1)' : done ? 'rgba(16,185,129,0.05)' : 'transparent',
                  borderLeft: active ? '2px solid #6366f1' : done ? '2px solid #10b981' : '2px solid transparent',
                  transition:'all 0.3s',
                }}>
                  <div style={{width:20, height:20, borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                    background: done ? 'rgba(16,185,129,0.15)' : active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${done ? 'rgba(16,185,129,0.3)' : active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  }}>
                    {done
                      ? <CheckCircle size={10} style={{color:'#10b981'}}/>
                      : active
                      ? <Loader2 size={10} style={{color:'#a5b4fc',animation:'spin 1s linear infinite'}}/>
                      : <Icon size={10} style={{color:'rgba(255,255,255,0.2)'}}/>}
                  </div>
                  <span style={{
                    fontSize:8, fontFamily:'monospace', letterSpacing:'0.06em',
                    color: done ? '#10b981' : active ? '#a5b4fc' : 'rgba(255,255,255,0.2)',
                    lineHeight:1.3,
                  }}>
                    {s.label}
                  </span>
                </div>
              );
            })}

            {/* Confidence meter */}
            <div style={{margin:'auto 16px 0',padding:'12px',background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.15)',borderRadius:8}}>
              <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.5)',marginBottom:6}}>CONFIDENCE BUILDING</div>
              <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                <div style={{
                  height:'100%',
                  width:`${Math.min(100, (stagesDone.size / STAGES.length) * 100)}%`,
                  background:'linear-gradient(90deg,#6366f1,#10b981)',
                  borderRadius:2, transition:'width 0.5s ease',
                  boxShadow:'0 0 8px rgba(99,102,241,0.6)',
                }}/>
              </div>
              <div style={{fontSize:9,fontFamily:'monospace',color:'#a5b4fc',marginTop:4,textAlign:'right'}}>
                {Math.round((stagesDone.size / STAGES.length) * 20 + (learning.confidence_score||75))}/100
              </div>
            </div>
          </div>

          {/* Stream panel */}
          <div style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.2)'}}>
              <span style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.3)'}}>
                REAL-TIME ANALYSIS STREAM — {learning.card_title.slice(0,50)}
              </span>
            </div>
            <div style={{flex:1,overflow:'auto',padding:'14px 16px'}}>
              <pre style={{
                fontSize:11, fontFamily:'monospace', color:'rgba(255,255,255,0.6)',
                lineHeight:1.8, margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word',
              }}>
                {streamText || ''}
                <span style={{animation:'blink 0.7s step-end infinite',color:'#6366f1'}}>▋</span>
              </pre>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
          @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
          @keyframes blink { 0%,100%{opacity:1}50%{opacity:0} }
          @keyframes dataFall { from{transform:translateY(-200px)}to{transform:translateY(100vh)} }
        `}</style>
      </div>
    </Backdrop>
  );

  /* ══════════════════════════════════
     PHASE 3: RESULT REVEAL
  ══════════════════════════════════ */
  return (
    <Backdrop>
      <div style={{
        width:'100%', maxWidth:680, maxHeight:'90vh', overflow:'auto',
        background:'rgba(4,6,15,0.97)', border:`1px solid ${error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
        borderRadius:16, overflow:'hidden',
        boxShadow:`0 0 60px ${error ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}`,
      }}>
        {/* Header */}
        <div style={{
          padding:'14px 18px', display:'flex', alignItems:'center', gap:10,
          background: error ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)',
          borderBottom:`1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
        }}>
          {error
            ? <><X size={16} style={{color:'#ef4444'}}/><span style={{fontSize:11,fontFamily:'monospace',color:'#ef4444',fontWeight:900}}>ENRICHMENT INCOMPLETE</span></>
            : <><CheckCircle size={16} style={{color:'#10b981'}}/><span style={{fontSize:11,fontFamily:'monospace',color:'#10b981',fontWeight:900}}>◈ ENRICHMENT COMPLETE</span></>
          }
          <div style={{flex:1}}/>
          <button onClick={() => { if (result) onSaved(result); onClose(); }}
            style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.3)',padding:4}}>
            <X size={13}/>
          </button>
        </div>

        <div style={{padding:'20px', overflow:'auto', maxHeight:'calc(90vh - 60px)', display:'flex', flexDirection:'column', gap:14}}>
          {error && (
            <div style={{padding:'12px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,fontSize:11,color:'rgba(255,100,100,0.9)',fontFamily:'monospace'}}>
              {error}
            </div>
          )}

          {result && !error && (
            <>
              {/* Confidence boost */}
              <div style={{display:'flex',gap:12,alignItems:'center',padding:'12px 16px',background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:10}}>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:22,fontWeight:900,fontFamily:'monospace',color:'rgba(255,255,255,0.4)'}}>{learning.confidence_score||75}</div>
                  <div style={{fontSize:8,color:'rgba(255,255,255,0.2)',fontFamily:'monospace'}}>BEFORE</div>
                </div>
                <div style={{fontSize:18,color:'#10b981'}}>→</div>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:28,fontWeight:900,fontFamily:'monospace',color:'#10b981',textShadow:'0 0 20px rgba(16,185,129,0.5)'}}>
                    {result.confidence_score}
                  </div>
                  <div style={{fontSize:8,color:'#10b981',fontFamily:'monospace'}}>AFTER</div>
                </div>
                <div style={{flex:1,marginLeft:8}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.6)',marginBottom:4}}>Confidence boosted by {(result.confidence_score||0)-(learning.confidence_score||75)} points</div>
                  <div style={{height:6,background:'rgba(255,255,255,0.06)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${result.confidence_score}%`,background:'linear-gradient(90deg,#6366f1,#10b981)',borderRadius:3}}/>
                  </div>
                </div>
              </div>

              {/* What worked */}
              {result.what_worked && result.what_worked.length > 0 && (
                <div>
                  <div style={{fontSize:9,fontFamily:'monospace',color:'#10b981',letterSpacing:'0.1em',marginBottom:8}}>✓ WHAT WORKED / STRENGTHS</div>
                  {result.what_worked.map((w, i) => (
                    <div key={i} style={{display:'flex',gap:8,marginBottom:5,alignItems:'flex-start'}}>
                      <span style={{color:'#10b981',fontSize:10,marginTop:2,flexShrink:0}}>›</span>
                      <span style={{fontSize:11,color:'rgba(255,255,255,0.65)',lineHeight:1.5}}>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* What missed */}
              {result.what_missed && result.what_missed.length > 0 && (
                <div>
                  <div style={{fontSize:9,fontFamily:'monospace',color:'#f59e0b',letterSpacing:'0.1em',marginBottom:8}}>△ GAPS — WHY THEY MATTER</div>
                  {result.what_missed.map((m, i) => (
                    <div key={i} style={{display:'flex',gap:8,marginBottom:5,alignItems:'flex-start'}}>
                      <span style={{color:'#f59e0b',fontSize:10,marginTop:2,flexShrink:0}}>›</span>
                      <span style={{fontSize:11,color:'rgba(255,255,255,0.55)',lineHeight:1.5}}>{m}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Improvement */}
              {result.improvement && (
                <div style={{padding:'12px 14px',background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:8}}>
                  <div style={{fontSize:9,fontFamily:'monospace',color:'#a5b4fc',marginBottom:5,letterSpacing:'0.1em'}}>⚡ NEURAL IMPROVEMENT DIRECTIVE</div>
                  <div style={{fontSize:12,color:'rgba(255,255,255,0.8)',lineHeight:1.6}}>{result.improvement}</div>
                </div>
              )}
            </>
          )}

          {/* Raw stream fallback */}
          {error && streamText && (
            <div style={{background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:12,maxHeight:300,overflow:'auto'}}>
              <pre style={{fontSize:10,color:'rgba(255,255,255,0.5)',margin:0,whiteSpace:'pre-wrap',lineHeight:1.6,fontFamily:'monospace'}}>
                {streamText}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div style={{display:'flex',gap:10,paddingTop:4}}>
            <button onClick={onClose}
              style={{padding:'9px 18px',fontSize:10,fontFamily:'monospace',borderRadius:8,cursor:'pointer',background:'none',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.4)'}}>
              CLOSE
            </button>
            <div style={{flex:1}}/>
            {result && !error && (
              <button
                onClick={() => { onSaved(result); onClose(); }}
                style={{
                  display:'flex',alignItems:'center',gap:8,padding:'9px 20px',
                  background:'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(6,182,212,0.2))',
                  border:'1px solid rgba(16,185,129,0.4)',borderRadius:8,cursor:'pointer',
                  color:'#10b981',fontSize:10,fontFamily:'monospace',fontWeight:700,
                  boxShadow:'0 0 14px rgba(16,185,129,0.2)',
                }}>
                <Zap size={11}/>INTEGRATE INTO BRAIN
              </button>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
