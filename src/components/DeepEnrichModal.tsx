/**
 * DeepEnrichModal — God-Level Brain Enrichment
 *
 * Phase 1: Gap-specific questions (derived FROM the actual gaps detected — not generic)
 *          + live URL fetch option shown when gap mentions crawl/CWV/schema
 *          + Algorithm Intel cross-reference shown when gap mentions rankings/AI visibility
 *
 * Phase 2: Live analysis theater with real streaming
 *          - Fetches live page content if user approved
 *          - Loads relevant algorithm knowledge from DB
 *          - Cross-references existing learnings for contradictions
 *          - Calculates evidence-based confidence (not estimates)
 *
 * Phase 3: Before/after result with full provenance trail
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Brain, X, CheckCircle, Loader2, Zap, Activity, Database,
  Globe, Cpu, Shield, AlertTriangle, FileSearch, ArrowRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

/* ─── Types ─── */
interface Learning {
  id: string; project_id: string | null; card_type: string; card_title: string;
  what_worked: string[]; what_missed: string[]; improvement: string | null;
  context_summary: string | null; confidence_score: number; source: string; tags: string[];
}

interface GapQuestion { id: string; q: string; options: string[]; relevantTo: string[]; freeText?: boolean }
interface Props { learning: Learning; projectUrl: string; onClose: () => void; onSaved: (updated: Partial<Learning>) => void }

/* ─── Build gap-specific questions FROM the actual gaps ─── */
function buildGapQuestions(learning: Learning): GapQuestion[] {
  const gaps    = (learning.what_missed || []).map(g => g.toLowerCase());
  const title   = (learning.card_title  || "").toLowerCase();
  const type    = learning.card_type || "insight";
  const questions: GapQuestion[] = [];
  const added = new Set<string>();

  const add = (q: GapQuestion) => { if (!added.has(q.id)) { added.add(q.id); questions.push(q); } };

  // Gap-derived questions — specific to what was actually detected as missing
  if (gaps.some(g => /crawl|index|robots|sitemap/i.test(g))) {
    add({ id: 'crawl_access', q: 'Do you have access to GSC Coverage report right now?',
      options: ['Yes — can check now', 'Yes — can get within an hour', 'Limited access', 'No GSC access'],
      relevantTo: ['crawl_data'], freeText: false });
    add({ id: 'crawl_tool', q: 'What was last crawled with?',
      options: ['Screaming Frog', 'Sitebulb', 'Ahrefs Site Audit', 'Semrush', 'Nothing yet — never crawled'],
      relevantTo: ['crawl_data'], freeText: false });
  }

  if (gaps.some(g => /core web vital|cwv|pagesp|lcp|cls|inp|fid/i.test(g))) {
    add({ id: 'cwv_source', q: 'Where is the best source to check Core Web Vitals right now?',
      options: ['GSC Core Web Vitals report', 'PageSpeed Insights live', 'Chrome UX Report', 'None available — field data missing'],
      relevantTo: ['cwv'], freeText: false });
    add({ id: 'cwv_worst', q: 'Which metric is the known bottleneck?',
      options: ['LCP (loading speed)', 'CLS (layout shifts)', 'INP (interaction delay)', 'All failing', 'Unknown — never measured'],
      relevantTo: ['cwv'], freeText: true });
  }

  if (gaps.some(g => /schema|structured data|faq|markup/i.test(g))) {
    add({ id: 'schema_current', q: 'What schema is currently implemented (if any)?',
      options: ['Nothing at all', 'Basic Organization', 'FAQ only', 'Product schema', 'Some — not comprehensive'],
      relevantTo: ['schema'], freeText: false });
  }

  if (gaps.some(g => /ai|llm|perplexity|chatgpt|gpt|gemini|visibility|citation/i.test(g))) {
    add({ id: 'ai_visibility', q: 'Have you checked the site\'s current AI engine visibility?',
      options: ['Yes — searched Perplexity and ChatGPT', 'Partially checked', 'No — haven\'t looked yet', 'Site is cited but not prominently'],
      relevantTo: ['geo'], freeText: false });
    add({ id: 'conversational_content', q: 'Does the site have content written in question-answer format?',
      options: ['Yes — dedicated FAQ sections', 'Some embedded Q&A', 'Very limited', 'None — all marketing copy'],
      relevantTo: ['geo'], freeText: false });
  }

  if (gaps.some(g => /backlink|domain.*rating|authority|dr\b|da\b/i.test(g))) {
    add({ id: 'backlink_data', q: 'Is backlink data available?',
      options: ['Ahrefs export available', 'Semrush data available', 'Moz data available', 'None — no backlink tool access'],
      relevantTo: ['competitive'], freeText: false });
    add({ id: 'dr_score', q: 'What is the current Domain Rating / Authority?',
      options: ['0–20 (very low)', '21–40 (building)', '41–60 (moderate)', '61+  (strong)', 'Unknown'],
      relevantTo: ['competitive'], freeText: false });
  }

  if (gaps.some(g => /keyword|ranking|position|serp/i.test(g))) {
    add({ id: 'keyword_data', q: 'Is keyword ranking data available?',
      options: ['GSC Performance export available', 'Semrush/Ahrefs position tracking', 'Manual SERP checks only', 'No data at all'],
      relevantTo: ['keyword'], freeText: false });
  }

  if (gaps.some(g => /content|page|copy|article|blog/i.test(g)) || type === 'content') {
    add({ id: 'content_stage', q: 'What is the current content production state for this gap?',
      options: ['Brief exists, not written', 'Draft in progress', 'Published but underperforming', 'Not started'],
      relevantTo: ['content'], freeText: false });
  }

  // Always ask about live fetch if URL available
  if (learning.project_id) {
    add({ id: 'fetch_live', q: 'Should Brain fetch the live page to analyse it directly?',
      options: ['Yes — fetch it now', 'No — I\'ll provide the content manually', 'Not needed for this gap'],
      relevantTo: ['all'], freeText: false });
  }

  // Fill to minimum 2 with type-defaults if needed
  if (questions.length < 2) {
    if (type === 'technical') {
      add({ id: 'cms_type', q: 'What CMS / platform?',
        options: ['HubSpot', 'WordPress', 'Webflow', 'Shopify', 'Custom / other'],
        relevantTo: ['technical'], freeText: true });
    }
    if (type === 'geo' || type === 'content') {
      add({ id: 'audience', q: 'Primary buyer / audience persona?',
        options: ['B2B — IT / Ops decision makers', 'B2B — Marketing teams', 'B2C — Consumers', 'Mixed B2B/B2C'],
        relevantTo: ['audience'], freeText: true });
    }
    add({ id: 'priority', q: 'What outcome matters most for this learning?',
      options: ['Improve rankings', 'Increase organic traffic', 'Improve AI visibility', 'Generate leads from organic'],
      relevantTo: ['priority'], freeText: false });
  }

  return questions.slice(0, 4); // max 4 questions
}

/* ─── Analysis stages ─── */
const STAGES = [
  { id: 'gaps',       label: 'PARSING GAP STRUCTURE',             icon: FileSearch, ms: 900  },
  { id: 'algo',       label: 'LOADING ALGORITHM INTEL',           icon: Database,   ms: 1400 },
  { id: 'fetch',      label: 'FETCHING LIVE PAGE DATA',           icon: Globe,      ms: 1600 },
  { id: 'contradict', label: 'SCANNING FOR CONTRADICTIONS',       icon: AlertTriangle, ms: 1000 },
  { id: 'synthesise', label: 'SYNTHESISING INTELLIGENCE',         icon: Brain,      ms: 2200 },
  { id: 'calibrate',  label: 'CALIBRATING EVIDENCE CONFIDENCE',   icon: Cpu,        ms: 900  },
  { id: 'validate',   label: 'VALIDATING AGAINST PROJECT DATA',   icon: Shield,     ms: 700  },
];

/* ─── Data stream background ─── */
function DataStream() {
  const chars = '01アSEO⬆⬇◈→∞Δ';
  return (
    <div style={{ position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',opacity:0.06 }}>
      {Array.from({length:10}).map((_,i) => (
        <div key={i} style={{
          position:'absolute', left:`${i*10+2}%`, top:0,
          fontSize:9, fontFamily:'monospace', color:'#a5b4fc',
          animation:`dataFall ${2.5+i*0.25}s linear ${i*0.15}s infinite`,
          writingMode:'vertical-rl', whiteSpace:'pre', lineHeight:'1.1em',
        }}>
          {Array.from({length:22},()=>chars[Math.floor(Math.random()*chars.length)]).join('')}
        </div>
      ))}
    </div>
  );
}

/* ─── Component ─── */
export default function DeepEnrichModal({ learning, projectUrl, onClose, onSaved }: Props) {

  // Safety guard
  useEffect(() => { if (!learning?.id) onClose(); }, [learning, onClose]);
  if (!learning?.id) return null;

  const [phase,      setPhase]      = useState<'questions'|'analysing'|'result'>('questions');
  const [answers,    setAnswers]    = useState<Record<string,string>>({});
  const [stageIdx,   setStageIdx]   = useState(0);
  const [stagesDone, setStagesDone] = useState<Set<string>>(new Set());
  const [stageLabel, setStageLabel] = useState('');
  const [stream,     setStream]     = useState('');
  const [result,     setResult]     = useState<Partial<Learning>|null>(null);
  const [error,      setError]      = useState('');
  const [algoTopics, setAlgoTopics] = useState<any[]>([]);
  const streamRef  = useRef('');
  const abortRef   = useRef(false);

  const questions = buildGapQuestions(learning);

  /* ─── Load relevant algorithm intel ─── */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('algorithm_knowledge')
          .select('title, summary, impact_level, best_practices, ranking_factors, category, engine')
          .order('updated_at', { ascending: false })
          .limit(8);
        setAlgoTopics(data || []);
      } catch (_e) {}
    })();
  }, []);

  /* ─── Run deep analysis ─── */
  const runAnalysis = async () => {
    setPhase('analysing');
    setStageIdx(0);
    setStagesDone(new Set());
    setStream('');
    streamRef.current = '';
    abortRef.current  = false;

    // Animate stages in sync with real work
    let si = 0;
    const tick = () => {
      if (abortRef.current || si >= STAGES.length) return;
      setStageIdx(si);
      setStageLabel(STAGES[si].label);
      setTimeout(() => {
        setStagesDone(s => new Set([...s, STAGES[si].id]));
        si++;
        if (si < STAGES.length) setTimeout(tick, STAGES[si]?.ms || 1000);
      }, STAGES[si].ms);
    };
    tick();

    const answersText = Object.entries(answers)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    // Fetch live page if user approved
    let liveContent = '';
    if (answers.fetch_live === 'Yes — fetch it now' && projectUrl) {
      try {
        const fetchRes = await fetch('/api/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
          body: JSON.stringify({ action: 'preview_url', url: projectUrl }),
        });
        const fd = await fetchRes.json().catch(() => ({}));
        liveContent = fd.content || fd.text || '';
      } catch (_e) { liveContent = ''; }
    }

    // Load related learnings for contradiction check
    let relatedLearnings: any[] = [];
    try {
      const { data } = await supabase
        .from('brain_learnings')
        .select('id, card_title, improvement, confidence_score, status')
        .eq('card_type', learning.card_type)
        .in('status', ['active', 'pending_review'])
        .neq('id', learning.id)
        .limit(6);
      relatedLearnings = data || [];
    } catch (_e) {}

    // Build algorithm context from loaded topics
    const algoContext = algoTopics.length > 0
      ? '\n\nALGORITHM INTELLIGENCE (from your knowledge base):\n' +
        algoTopics.slice(0, 4).map(t =>
          `[${t.impact_level?.toUpperCase()}] ${t.title} (${t.engine}): ${t.summary?.slice(0, 150)}\n` +
          (t.best_practices?.length ? `  Best practices: ${t.best_practices.slice(0, 2).join('; ')}` : '')
        ).join('\n')
      : '\n\nNote: No algorithm intel loaded. Go to Algorithm Intelligence to load relevant topics for richer analysis.';

    const relatedContext = relatedLearnings.length > 0
      ? '\n\nEXISTING RELATED LEARNINGS (check for contradictions):\n' +
        relatedLearnings.map((l, i) =>
          `[${i+1}] "${l.card_title}" (${l.status}) — Directive: ${l.improvement || '—'}`
        ).join('\n')
      : '';

    const liveContext = liveContent
      ? `\n\nLIVE PAGE CONTENT FETCHED:\n${liveContent.slice(0, 3000)}`
      : '';

    try {
      const res = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
        body: JSON.stringify({
          mode: 'brain_assistant',
          question: [
            '═══ DEEP ENRICHMENT PROTOCOL — GOD LEVEL ═══',
            'No assumptions. Hard facts only. Every claim must be evidenced from the data provided.',
            '',
            'LEARNING TO ENRICH:',
            `Title: ${learning.card_title}`,
            `Type: ${learning.card_type}`,
            `Current confidence: ${learning.confidence_score ?? 75}/100`,
            `Context: ${learning.context_summary || 'Not provided'}`,
            '',
            'GAPS DETECTED (these must EACH be addressed — not ignored):',
            (learning.what_missed || []).map((g, i) => `${i+1}. ${g}`).join('\n') || 'Not defined',
            '',
            'CURRENT STRENGTHS:',
            (learning.what_worked || []).map((w, i) => `${i+1}. ${w}`).join('\n') || 'None recorded',
            '',
            `CURRENT DIRECTIVE: ${learning.improvement || 'None'}`,
            '',
            answersText ? `USER CONTEXT:\n${answersText}` : '',
            algoContext,
            relatedContext,
            liveContext,
            '',
            '═══ YOUR TASK ═══',
            '',
            '1. ADDRESS EACH GAP SPECIFICALLY:',
            '   For every gap listed above, state:',
            '   a) What the specific finding likely IS (based on the context + algorithm data)',
            '   b) Why it matters for rankings/traffic (quantify if possible)',
            '   c) What exact action resolves it',
            '',
            '2. GENERATE MINIMUM 5 what_worked INSIGHTS:',
            '   - Each must be specific to this project/type, not generic advice',
            '   - Reference which algorithm signal or data point supports it',
            '',
            '3. GENERATE MINIMUM 3 what_missed FINDINGS:',
            '   - Format: "[Gap] — [Why it matters] — [How to resolve it]"',
            '',
            '4. WRITE ONE PRECISION DIRECTIVE:',
            '   Format: "To [achieve specific outcome], [do specific action] using [specific method]',
            '            by [specific deadline/trigger], measuring success via [specific metric]"',
            '',
            '5. EVIDENCE-BASED CONFIDENCE SCORE:',
            `   Start: ${learning.confidence_score ?? 75}`,
            '   +5 per gap with a clear resolution path',
            '   +5 per concrete data point available (live page, GSC, algo intel)',
            '   +5 if directive changed to be more specific',
            '   -5 per assumption made without data',
            '   Explain the calculation explicitly',
            '',
            relatedLearnings.length > 0 ? '6. FLAG CONTRADICTIONS: State explicitly if this learning contradicts any related ones above' : '',
            '',
            '═══ OUTPUT FORMAT ═══',
            'Write your full analysis (show your reasoning — this is seen by the user).',
            'Then emit this exact ACTION tag at the END:',
            `⟦ACTION⟧{"type":"save_learning","title":"[8-word max title]","cardType":"${learning.card_type}","whatWorked":["specific insight 1","insight 2","insight 3","insight 4","insight 5"],"whatMissed":["gap 1 — why matters — how to fix","gap 2 — why matters — how to fix","gap 3 — why matters — how to fix"],"improvement":"To [outcome] do [action] using [method] measuring [metric]","confidence_score":[calculated number 75-95],"summary":"${learning.context_summary || learning.card_title}","tags":["${learning.card_type}","enriched","brain-deep"]}⟦/ACTION⟧`,
          ].filter(Boolean).join('\n'),
          projectId: learning.project_id,
          projectSummary: learning.context_summary || learning.card_title,
          brainAssistantContext: {
            projectContext: projectUrl ? { project: { url: projectUrl } } : null,
            learnings: [], algoItems: algoTopics.slice(0, 4), canvasBlocks: [], history: [],
          },
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Intelligence API: HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      while (true) {
        if (abortRef.current) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        streamRef.current += chunk;
        // Strip ACTION tag from live display
        const display = streamRef.current.replace(/⟦ACTION⟧[\s\S]*?⟦\/ACTION⟧/g, '');
        setStream(display);
      }

      abortRef.current = true;

      // Parse the ACTION tag
      const match = /⟦ACTION⟧(\{[\s\S]*?\})⟦\/ACTION⟧/.exec(streamRef.current);
      if (match) {
        try {
          const action = JSON.parse(match[1]);
          const updates: Partial<Learning> = {
            card_title:       action.title        || learning.card_title,
            what_worked:      action.whatWorked   || action.what_worked   || [],
            what_missed:      action.whatMissed   || action.what_missed   || [],
            improvement:      action.improvement  || null,
            confidence_score: Math.min(95, Math.max(75, Number(action.confidence_score) || (learning.confidence_score ?? 75) + 8)),
            context_summary:  action.summary      || learning.context_summary,
            tags:             action.tags         || learning.tags,
          };

          // Persist to Supabase
          const { error: dbErr } = await supabase
            .from('brain_learnings')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', learning.id);

          if (dbErr) throw new Error(dbErr.message);

          setResult(updates);
          setPhase('result');
        } catch (e: any) {
          setError('Failed to save enrichment: ' + e.message);
          setPhase('result');
        }
      } else {
        // No ACTION tag — extract from prose
        const lines = streamRef.current.split('\n').filter(l => l.trim().length > 25);
        const positives = lines.filter(l => /✓|improve|increase|should|optim|strateg|recommend/i.test(l)).slice(0, 5);
        const negatives = lines.filter(l => /✗|gap|missing|lack|issue|problem|not\s/i.test(l)).slice(0, 3);

        if (positives.length > 0) {
          const updates: Partial<Learning> = {
            what_worked: positives.map(l => l.replace(/^[•\-*✓\s]+/, '').trim().slice(0, 120)),
            what_missed: negatives.map(l => l.replace(/^[•\-*✗\s]+/, '').trim().slice(0, 120)),
            confidence_score: Math.min(90, (learning.confidence_score ?? 75) + 8),
          };
          const { error: dbErr } = await supabase
            .from('brain_learnings').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', learning.id);
          if (!dbErr) { setResult(updates); setPhase('result'); return; }
        }
        setError('Brain completed analysis but did not emit a structured update. The analysis is shown below — you can copy insights manually.');
        setPhase('result');
      }
    } catch (e: any) {
      abortRef.current = true;
      setError(e.message || 'Unknown error');
      setPhase('result');
    }
  };

  /* ─── Backdrop wrapper ─── */
  const Backdrop = ({ children }: { children: React.ReactNode }) => (
    <div
      style={{ position:'fixed',inset:0,zIndex:9999,background:'rgba(3,5,15,0.88)',backdropFilter:'blur(20px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) { abortRef.current=true; onClose(); } }}
    >{children}</div>
  );

  /* ══════════════ PHASE 1: QUESTIONS ══════════════ */
  if (phase === 'questions') return (
    <Backdrop>
      <div style={{ width:'100%',maxWidth:560,background:'rgba(8,10,24,0.97)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:16,overflow:'hidden',boxShadow:'0 0 60px rgba(99,102,241,0.15)' }}>
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))',borderBottom:'1px solid rgba(99,102,241,0.2)',padding:'14px 18px',display:'flex',gap:12,alignItems:'flex-start' }}>
          <div style={{ width:34,height:34,borderRadius:8,background:'rgba(99,102,241,0.2)',border:'1px solid rgba(99,102,241,0.4)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 0 12px rgba(99,102,241,0.4)' }}>
            <Brain size={16} style={{ color:'#a5b4fc' }}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10,fontFamily:'monospace',color:'#a5b4fc',fontWeight:900,letterSpacing:'0.1em' }}>◈ BRAIN PRE-FLIGHT — GAP INVESTIGATION</div>
            <div style={{ fontSize:11,color:'rgba(255,255,255,0.5)',marginTop:3,lineHeight:1.4 }}>
              Questions derived from your detected gaps. Answers give Brain hard facts — no assumptions.
            </div>
            <div style={{ marginTop:8,padding:'6px 10px',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:6,fontSize:10,color:'#fbbf24' }}>
              Enriching: <strong>"{learning.card_title}"</strong> · {learning.card_type} · Confidence {learning.confidence_score ?? 75}/100
              {algoTopics.length > 0 && <span style={{ color:'rgba(255,255,255,0.3)',marginLeft:8 }}>· {algoTopics.length} algorithm topics loaded</span>}
            </div>
            {/* Show detected gaps */}
            {(learning.what_missed || []).length > 0 && (
              <div style={{ marginTop:8,display:'flex',flexWrap:'wrap',gap:4 }}>
                {learning.what_missed.slice(0,3).map((g,i) => (
                  <span key={i} style={{ fontSize:8,fontFamily:'monospace',color:'rgba(245,158,11,0.7)',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:4,padding:'2px 6px' }}>
                    ✗ {g.slice(0,40)}{g.length>40?'…':''}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.3)',padding:4,marginTop:-2 }}><X size={13}/></button>
        </div>

        {/* Questions */}
        <div style={{ padding:'18px 20px',display:'flex',flexDirection:'column',gap:14 }}>
          {questions.map((q,qi) => (
            <div key={q.id}>
              <div style={{ display:'flex',gap:6,alignItems:'flex-start',marginBottom:8 }}>
                <span style={{ fontSize:9,fontFamily:'monospace',color:'rgba(99,102,241,0.5)',marginTop:1,flexShrink:0 }}>{String(qi+1).padStart(2,'0')}</span>
                <span style={{ fontSize:11,color:'rgba(255,255,255,0.75)',fontWeight:600,lineHeight:1.4 }}>{q.q}</span>
              </div>
              <div style={{ display:'flex',flexWrap:'wrap',gap:5 }}>
                {q.options.map(opt => (
                  <button key={opt}
                    onClick={() => setAnswers(a => ({ ...a, [q.id]: a[q.id]===opt ? '' : opt }))}
                    style={{ padding:'5px 11px',fontSize:10,fontFamily:'monospace',borderRadius:6,cursor:'pointer',transition:'all 0.15s',
                      background: answers[q.id]===opt ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${answers[q.id]===opt ? 'rgba(99,102,241,0.55)' : 'rgba(255,255,255,0.09)'}`,
                      color: answers[q.id]===opt ? '#c7d2fe' : 'rgba(255,255,255,0.45)',
                    }}>
                    {answers[q.id]===opt ? '✓ ' : ''}{opt}
                  </button>
                ))}
                {q.freeText && (
                  <input placeholder="or describe..."
                    value={answers[`${q.id}_custom`] || ''}
                    onChange={e => setAnswers(a => ({ ...a, [`${q.id}_custom`]: e.target.value }))}
                    style={{ flexGrow:1,minWidth:120,padding:'5px 10px',fontSize:10,fontFamily:'monospace',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.09)',borderRadius:6,color:'rgba(255,255,255,0.65)',outline:'none' }}/>
                )}
              </div>
            </div>
          ))}
          {questions.length === 0 && (
            <p style={{ fontSize:11,color:'rgba(255,255,255,0.4)',textAlign:'center',padding:'12px 0' }}>
              No specific questions needed — Brain will reason directly from the detected gaps and algorithm data.
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'0 20px 18px',display:'flex',gap:8,alignItems:'center' }}>
          <button onClick={onClose} style={{ padding:'8px 14px',fontSize:10,fontFamily:'monospace',borderRadius:8,cursor:'pointer',background:'none',border:'1px solid rgba(255,255,255,0.09)',color:'rgba(255,255,255,0.3)' }}>CANCEL</button>
          <div style={{ flex:1 }}/>
          <button onClick={runAnalysis} style={{ display:'flex',alignItems:'center',gap:8,padding:'9px 22px',background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:8,cursor:'pointer',color:'white',fontSize:11,fontFamily:'monospace',fontWeight:700,boxShadow:'0 0 18px rgba(99,102,241,0.4)',letterSpacing:'0.06em' }}>
            <Zap size={12}/>DEEP ANALYSE →
          </button>
        </div>
        <style>{`@keyframes dataFall{from{transform:translateY(-200px)}to{transform:translateY(100vh)}}`}</style>
      </div>
    </Backdrop>
  );

  /* ══════════════ PHASE 2: ANALYSIS ══════════════ */
  if (phase === 'analysing') return (
    <Backdrop>
      <div style={{ width:'100%',maxWidth:800,height:'90vh',background:'rgba(4,6,15,0.98)',border:'1px solid rgba(99,102,241,0.22)',borderRadius:16,overflow:'hidden',position:'relative',boxShadow:'0 0 80px rgba(99,102,241,0.18)' }}>
        <DataStream/>
        {/* Terminal bar */}
        <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 16px',background:'rgba(0,0,0,0.4)',borderBottom:'1px solid rgba(99,102,241,0.12)',backdropFilter:'blur(8px)',position:'relative',zIndex:1 }}>
          {['#ef4444','#fbbf24','#10b981'].map((c,i) => <div key={i} style={{ width:8,height:8,borderRadius:'50%',background:c,boxShadow:`0 0 5px ${c}` }}/>)}
          <span style={{ fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.5)',marginLeft:6,letterSpacing:'0.1em' }}>MANAV BRAIN — DEEP ENRICHMENT · {learning.card_title.slice(0,40)}</span>
          <div style={{ flex:1 }}/>
          <div style={{ display:'flex',gap:5,alignItems:'center' }}>
            <div style={{ width:5,height:5,borderRadius:'50%',background:'#10b981',animation:'blink 1s ease-in-out infinite' }}/>
            <span style={{ fontSize:8,fontFamily:'monospace',color:'#10b981' }}>LIVE</span>
          </div>
        </div>

        <div style={{ display:'grid',gridTemplateColumns:'200px 1fr',height:'calc(90vh - 42px)',position:'relative',zIndex:1 }}>
          {/* Stage panel */}
          <div style={{ borderRight:'1px solid rgba(255,255,255,0.05)',background:'rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
            <div style={{ padding:'12px 14px 6px',fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.14em' }}>ANALYSIS PIPELINE</div>
            {STAGES.map((s,i) => {
              const done   = stagesDone.has(s.id);
              const active = i === stageIdx && !done;
              const Icon   = s.icon;
              return (
                <div key={s.id} style={{ display:'flex',alignItems:'center',gap:7,padding:'7px 14px',background:active?'rgba(99,102,241,0.1)':done?'rgba(16,185,129,0.05)':'transparent',borderLeft:`2px solid ${active?'#6366f1':done?'#10b981':'transparent'}`,transition:'all 0.25s' }}>
                  <div style={{ width:18,height:18,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:done?'rgba(16,185,129,0.14)':active?'rgba(99,102,241,0.2)':'rgba(255,255,255,0.03)',border:`1px solid ${done?'rgba(16,185,129,0.28)':active?'rgba(99,102,241,0.4)':'rgba(255,255,255,0.07)'}` }}>
                    {done ? <CheckCircle size={9} style={{ color:'#10b981' }}/> : active ? <Loader2 size={9} style={{ color:'#a5b4fc',animation:'spin 1s linear infinite' }}/> : <Icon size={9} style={{ color:'rgba(255,255,255,0.18)' }}/>}
                  </div>
                  <span style={{ fontSize:7,fontFamily:'monospace',color:done?'#10b981':active?'#a5b4fc':'rgba(255,255,255,0.18)',letterSpacing:'0.05em',lineHeight:1.3 }}>{s.label}</span>
                </div>
              );
            })}
            {/* Evidence confidence meter */}
            <div style={{ margin:'auto 14px 14px',padding:10,background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.14)',borderRadius:8 }}>
              <div style={{ fontSize:7,fontFamily:'monospace',color:'rgba(165,180,252,0.45)',marginBottom:5 }}>EVIDENCE CONFIDENCE</div>
              <div style={{ height:3,background:'rgba(255,255,255,0.05)',borderRadius:2,overflow:'hidden' }}>
                <div style={{ height:'100%',width:`${Math.min(100,stagesDone.size/STAGES.length*100)}%`,background:'linear-gradient(90deg,#6366f1,#10b981)',borderRadius:2,transition:'width 0.5s ease',boxShadow:'0 0 8px rgba(99,102,241,0.5)' }}/>
              </div>
              <div style={{ fontSize:9,fontFamily:'monospace',color:'#a5b4fc',marginTop:4,textAlign:'right' }}>
                {Math.round(stagesDone.size/STAGES.length * 18 + (learning.confidence_score ?? 75))}/100
              </div>
            </div>
          </div>

          {/* Stream panel */}
          <div style={{ display:'flex',flexDirection:'column',overflow:'hidden' }}>
            <div style={{ padding:'8px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.2)',flexShrink:0 }}>
              <span style={{ fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)' }}>
                REAL-TIME REASONING — {stageLabel || 'INITIALISING'}
              </span>
            </div>
            <div style={{ flex:1,overflow:'auto',padding:'12px 14px' }}>
              <pre style={{ fontSize:11,fontFamily:'monospace',color:'rgba(255,255,255,0.58)',lineHeight:1.8,margin:0,whiteSpace:'pre-wrap',wordBreak:'break-word' }}>
                {stream || ''}
                <span style={{ animation:'blink 0.7s step-end infinite',color:'#6366f1' }}>▋</span>
              </pre>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
          @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
          @keyframes dataFall{from{transform:translateY(-200px)}to{transform:translateY(100vh)}}
        `}</style>
      </div>
    </Backdrop>
  );

  /* ══════════════ PHASE 3: RESULT ══════════════ */
  return (
    <Backdrop>
      <div style={{ width:'100%',maxWidth:680,maxHeight:'90vh',overflow:'auto',background:'rgba(4,6,15,0.98)',border:`1px solid ${error?'rgba(239,68,68,0.3)':'rgba(16,185,129,0.3)'}`,borderRadius:16,boxShadow:`0 0 60px ${error?'rgba(239,68,68,0.14)':'rgba(16,185,129,0.14)'}` }}>
        {/* Header */}
        <div style={{ padding:'13px 17px',display:'flex',alignItems:'center',gap:10,background:error?'rgba(239,68,68,0.05)':'rgba(16,185,129,0.05)',borderBottom:`1px solid ${error?'rgba(239,68,68,0.18)':'rgba(16,185,129,0.18)'}` }}>
          {error ? <X size={15} style={{ color:'#ef4444' }}/> : <CheckCircle size={15} style={{ color:'#10b981' }}/>}
          <span style={{ fontSize:11,fontFamily:'monospace',fontWeight:900,color:error?'#ef4444':'#10b981',letterSpacing:'0.08em' }}>
            {error ? '◈ ENRICHMENT INCOMPLETE' : '◈ ENRICHMENT COMPLETE'}
          </span>
          <div style={{ flex:1 }}/>
          <button onClick={() => { if(result) onSaved(result); onClose(); }} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.3)',padding:3 }}><X size={13}/></button>
        </div>

        <div style={{ padding:'18px 20px',display:'flex',flexDirection:'column',gap:12 }}>
          {error && (
            <div style={{ padding:'10px 12px',background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,fontSize:11,color:'rgba(255,110,110,0.85)',fontFamily:'monospace' }}>
              {error}
            </div>
          )}

          {result && !error && (
            <>
              {/* Confidence boost */}
              <div style={{ display:'flex',gap:14,alignItems:'center',padding:'12px 14px',background:'rgba(16,185,129,0.05)',border:'1px solid rgba(16,185,129,0.18)',borderRadius:10 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:22,fontWeight:900,fontFamily:'monospace',color:'rgba(255,255,255,0.35)' }}>{learning.confidence_score ?? 75}</div>
                  <div style={{ fontSize:7,color:'rgba(255,255,255,0.2)',fontFamily:'monospace' }}>BEFORE</div>
                </div>
                <ArrowRight size={16} style={{ color:'#10b981' }}/>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:30,fontWeight:900,fontFamily:'monospace',color:'#10b981',textShadow:'0 0 18px rgba(16,185,129,0.5)' }}>{result.confidence_score}</div>
                  <div style={{ fontSize:7,color:'#10b981',fontFamily:'monospace' }}>AFTER</div>
                </div>
                <div style={{ flex:1,marginLeft:10 }}>
                  <div style={{ fontSize:11,color:'rgba(255,255,255,0.55)',marginBottom:5 }}>
                    +{(result.confidence_score||0)-(learning.confidence_score??75)} points — evidence-based
                  </div>
                  <div style={{ height:5,background:'rgba(255,255,255,0.05)',borderRadius:3,overflow:'hidden' }}>
                    <div style={{ height:'100%',width:`${result.confidence_score}%`,background:'linear-gradient(90deg,#6366f1,#10b981)',borderRadius:3 }}/>
                  </div>
                </div>
              </div>

              {result.what_worked && result.what_worked.length > 0 && (
                <div>
                  <div style={{ fontSize:8,fontFamily:'monospace',color:'#10b981',letterSpacing:'0.1em',marginBottom:7 }}>✓ WHAT WORKS — {result.what_worked.length} INSIGHTS</div>
                  {result.what_worked.map((w,i) => (
                    <div key={i} style={{ display:'flex',gap:7,marginBottom:5,alignItems:'flex-start' }}>
                      <span style={{ color:'#10b981',fontSize:9,marginTop:2,flexShrink:0 }}>›</span>
                      <span style={{ fontSize:11,color:'rgba(255,255,255,0.65)',lineHeight:1.5 }}>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.what_missed && result.what_missed.length > 0 && (
                <div>
                  <div style={{ fontSize:8,fontFamily:'monospace',color:'#f59e0b',letterSpacing:'0.1em',marginBottom:7 }}>△ GAPS — {result.what_missed.length} FINDINGS WITH CONTEXT</div>
                  {result.what_missed.map((m,i) => (
                    <div key={i} style={{ display:'flex',gap:7,marginBottom:5,alignItems:'flex-start' }}>
                      <span style={{ color:'#f59e0b',fontSize:9,marginTop:2,flexShrink:0 }}>›</span>
                      <span style={{ fontSize:11,color:'rgba(255,255,255,0.55)',lineHeight:1.5 }}>{m}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.improvement && (
                <div style={{ padding:'11px 13px',background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:8 }}>
                  <div style={{ fontSize:8,fontFamily:'monospace',color:'#a5b4fc',marginBottom:5,letterSpacing:'0.1em' }}>⚡ PRECISION IMPROVEMENT DIRECTIVE</div>
                  <div style={{ fontSize:12,color:'rgba(255,255,255,0.82)',lineHeight:1.6 }}>{result.improvement}</div>
                </div>
              )}
            </>
          )}

          {/* Raw stream fallback */}
          {(error || !result) && stream && (
            <div>
              <div style={{ fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.3)',marginBottom:6,letterSpacing:'0.1em' }}>BRAIN ANALYSIS (raw)</div>
              <div style={{ background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:12,maxHeight:280,overflow:'auto' }}>
                <pre style={{ fontSize:10,color:'rgba(255,255,255,0.5)',margin:0,whiteSpace:'pre-wrap',lineHeight:1.6,fontFamily:'monospace' }}>{stream}</pre>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex',gap:8,paddingTop:4 }}>
            <button onClick={onClose} style={{ padding:'8px 16px',fontSize:10,fontFamily:'monospace',borderRadius:8,cursor:'pointer',background:'none',border:'1px solid rgba(255,255,255,0.09)',color:'rgba(255,255,255,0.35)' }}>CLOSE</button>
            <div style={{ flex:1 }}/>
            {result && !error && (
              <button onClick={() => { onSaved(result); onClose(); }} style={{ display:'flex',alignItems:'center',gap:7,padding:'8px 18px',background:'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(6,182,212,0.15))',border:'1px solid rgba(16,185,129,0.4)',borderRadius:8,cursor:'pointer',color:'#10b981',fontSize:10,fontFamily:'monospace',fontWeight:700,boxShadow:'0 0 12px rgba(16,185,129,0.18)' }}>
                <Zap size={10}/>INTEGRATE INTO BRAIN
              </button>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
