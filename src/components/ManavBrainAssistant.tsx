/**
 * ManavBrainAssistant — Floating AI Command Centre
 * The most intelligent SEO partner ever built.
 * Controls the entire SEO Season software through natural conversation.
 * Immutable conversation log. Self-healing on token limits.
 * Hollywood holographic aesthetic.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate }      from 'react-router-dom';
import { useAuth }          from '@/contexts/AuthContext';
import { supabase }         from '@/lib/supabase';
import {
  Brain, Send, X, ChevronDown, Minimize2, Maximize2,
  Zap, Activity, Globe, Target, Shield, FileText,
  CheckCircle, AlertCircle, Loader2, Cpu, RefreshCw,
} from 'lucide-react';

/* ─── Types ─── */
type MsgRole = 'user' | 'brain' | 'action' | 'system';

interface BrainMsg {
  id:        string;
  role:      MsgRole;
  content:   string;
  actions?:  ParsedAction[];
  results?:  ActionResult[];
  ts:        Date;
  truncated?:boolean;
}

interface ParsedAction {
  type:          string;
  label:         string;
  path?:         string;
  url?:          string;
  mode?:         string;
  topicId?:      string;
  topicLabel?:   string;
  cardType?:     string;
  title?:        string;
  content?:      string;
  priority?:     string;
  week?:         number;
  query?:        string;
  [key: string]: any;
}

interface ActionResult {
  action:  ParsedAction;
  status:  'running' | 'done' | 'error';
  result:  string;
}

/* ─── Constants ─── */
const ACTION_RE = /⟦ACTION⟧([\s\S]*?)⟦\/ACTION⟧/g;

const ACTION_ICONS: Record<string, any> = {
  navigate:              Globe,
  run_audit:             FileText,
  fetch_algorithm:       Cpu,
  fetch_custom_algorithm:Cpu,
  add_card:              Target,
  search_brain:          Brain,
  crawl:                 Activity,
  default:               Zap,
};

const SUGGESTIONS = [
  "What should I prioritise this week?",
  "Run an audit on my site",
  "What's my brain intelligence level?",
  "Fetch the March 2025 Google update",
  "Create a technical card for crawl errors",
  "What do I need to rank in AI search?",
];

/* ─── Helpers ─── */
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function parseActions(text: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  const re = /⟦ACTION⟧([\s\S]*?)⟦\/ACTION⟧/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try { actions.push(JSON.parse(m[1].trim())); } catch { /* skip malformed */ }
  }
  return actions;
}

function stripActions(text: string): string {
  return text.replace(/⟦ACTION⟧[\s\S]*?⟦\/ACTION⟧/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/* ─── Animated scanline overlay ─── */
const Scanlines = () => (
  <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 'inherit',
    background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
    zIndex: 1,
  }}/>
);

/* ─── Action result card ─── */
function ActionCard({ result }: { result: ActionResult }) {
  const Icon = ACTION_ICONS[result.action.type] || ACTION_ICONS.default;
  const color = result.status === 'done' ? '#10b981' : result.status === 'error' ? '#ef4444' : '#6366f1';
  return (
    <div style={{background:`${color}0a`,border:`1px solid ${color}25`,borderRadius:10,padding:'8px 12px',marginTop:6}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:result.result ? 4 : 0}}>
        {result.status === 'running'
          ? <Loader2 size={10} style={{color,animation:'spin 1s linear infinite',flexShrink:0}}/>
          : result.status === 'done'
          ? <CheckCircle size={10} style={{color:'#10b981',flexShrink:0}}/>
          : <AlertCircle size={10} style={{color:'#ef4444',flexShrink:0}}/>}
        <span style={{fontSize:9,fontFamily:'monospace',color,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>
          {result.status === 'running' ? 'EXECUTING: ' : result.status === 'done' ? 'DONE: ' : 'ERROR: '}
          {result.action.label}
        </span>
      </div>
      {result.result && (
        <p style={{fontSize:10,color:'rgba(255,255,255,0.45)',lineHeight:1.5,margin:0,paddingLeft:16}}>
          {result.result.slice(0, 300)}{result.result.length > 300 ? '...' : ''}
        </p>
      )}
    </div>
  );
}

/* ─── Message bubble ─── */
function MsgBubble({ msg, onActionClick }: { msg: BrainMsg; onActionClick: (a: ParsedAction) => void }) {
  const isUser   = msg.role === 'user';
  const isBrain  = msg.role === 'brain';
  const isSystem = msg.role === 'system';

  if (isSystem) {
    return (
      <div style={{textAlign:'center',padding:'4px 0'}}>
        <span style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.1em'}}>{msg.content}</span>
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:isUser?'flex-end':'flex-start',gap:4}}>
      {!isUser && (
        <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(99,102,241,0.6)',letterSpacing:'0.1em',paddingLeft:2}}>
          ◈ MANAV BRAIN
        </span>
      )}
      <div style={{
        maxWidth:'88%',
        background: isUser
          ? 'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(79,70,229,0.12))'
          : 'rgba(255,255,255,0.03)',
        border: isUser ? '1px solid rgba(99,102,241,0.25)' : '1px solid rgba(6,182,212,0.12)',
        borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
        padding: '10px 14px',
      }}>
        <p style={{fontSize:12,color:isUser?'rgba(255,255,255,0.85)':'rgba(255,255,255,0.7)',lineHeight:1.6,margin:0,whiteSpace:'pre-wrap',fontFamily: isBrain ? 'inherit' : 'inherit'}}>
          {isBrain ? stripActions(msg.content) : msg.content}
        </p>

        {/* Actions detected in response */}
        {msg.actions && msg.actions.length > 0 && (
          <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:5}}>
            {msg.actions.map((a, i) => {
              const Icon = ACTION_ICONS[a.type] || ACTION_ICONS.default;
              return (
                <button key={i} onClick={() => onActionClick(a)}
                  style={{display:'flex',alignItems:'center',gap:6,background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:8,padding:'5px 10px',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}>
                  <Icon size={10} style={{color:'#a5b4fc',flexShrink:0}}/>
                  <span style={{fontSize:10,fontFamily:'monospace',color:'#a5b4fc',fontWeight:600}}>{a.label}</span>
                  <Zap size={8} style={{color:'rgba(99,102,241,0.4)',marginLeft:'auto',flexShrink:0}}/>
                </button>
              );
            })}
          </div>
        )}

        {/* Action results */}
        {msg.results && msg.results.length > 0 && (
          <div style={{marginTop:8}}>
            {msg.results.map((r, i) => <ActionCard key={i} result={r}/>)}
          </div>
        )}

        {msg.truncated && (
          <p style={{fontSize:9,color:'rgba(251,191,36,0.6)',fontFamily:'monospace',marginTop:6,marginBottom:0}}>
            ⚠ Response was truncated — automatically continuing…
          </p>
        )}
      </div>
      <span style={{fontSize:8,color:'rgba(255,255,255,0.12)',paddingLeft:isUser?0:2,paddingRight:isUser?2:0}}>
        {msg.ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function ManavBrainAssistant() {
  const { projects, clients } = useAuth();
  const navigate = useNavigate();

  const [open,       setOpen]       = useState(false);
  const [expanded,   setExpanded]   = useState(false);
  const [msgs,       setMsgs]       = useState<BrainMsg[]>([
    { id: uid(), role: 'system', content: '◈ MANAV BRAIN ONLINE — NEURAL INTELLIGENCE ACTIVE', ts: new Date() },
    { id: uid(), role: 'brain',  content: "I am Manav Brain — your master SEO intelligence partner.\n\nI know everything about your project, your learnings, your algorithm intelligence, and I can control every feature of this software. Just tell me what you need.\n\nSelect a project above and I'll have full context.", ts: new Date() },
  ]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [selProjId,  setSelProjId]  = useState('');
  const [context,    setContext]    = useState<any>(null);
  const [learnings,  setLearnings]  = useState<any[]>([]);
  const [algoItems,  setAlgoItems]  = useState<any[]>([]);
  const [pending,    setPending]    = useState(0);
  const [suggIdx,    setSuggIdx]    = useState(0);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const streamRef  = useRef<boolean>(false);

  const panelW = expanded ? 680 : 420;
  const panelH = expanded ? 720 : 600;

  /* Auto-scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  /* Load context when project changes */
  useEffect(() => {
    if (!selProjId) return;
    loadContext();
  }, [selProjId]);

  /* Rotate suggestion chips */
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setSuggIdx(i => (i + 3) % SUGGESTIONS.length), 8000);
    return () => clearInterval(t);
  }, [open]);

  const loadContext = useCallback(async () => {
    if (!selProjId) return;
    try {
      const [ctxRes, learnRes, algoRes] = await Promise.all([
        fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_context', projectId: selProjId }) }),
        fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_all_learnings', project_id: selProjId }) }),
        fetch('/api/algorithm-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_all' }) }),
      ]);
      const [ctxData, learnData, algoData] = await Promise.all([ctxRes.json(), learnRes.json(), algoRes.json()]);
      if (ctxData.success)  setContext(ctxData.context);
      if (learnData.success) {
        const allL = learnData.learnings || [];
        setLearnings(allL.filter((l: any) => l.status === 'active'));
        setPending(allL.filter((l: any) => l.status === 'pending_review').length);
      }
      if (algoData.success) setAlgoItems(algoData.items || []);
    } catch { /* silent */ }
  }, [selProjId]);

  /* Execute a parsed action */
  const executeAction = useCallback(async (
    action: ParsedAction,
    msgId:  string,
    resultIdx: number
  ) => {
    const updateResult = (status: ActionResult['status'], result: string) => {
      setMsgs(ms => ms.map(m => {
        if (m.id !== msgId || !m.results) return m;
        const results = [...m.results];
        results[resultIdx] = { ...results[resultIdx], status, result };
        return { ...m, results };
      }));
    };

    try {
      switch (action.type) {
        case 'navigate':
          navigate(action.path || '/');
          updateResult('done', `Navigated to ${action.path}`);
          break;

        case 'run_audit': {
          const res = await fetch('/api/analysis', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: action.url, mode: action.mode || 'standard', action: 'audit', projectId: selProjId }),
          });
          if (!res.body) { updateResult('error', 'Stream unavailable'); break; }
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let text = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += dec.decode(value);
          }
          updateResult('done', `Audit complete. Top finding: ${text.slice(0, 200)}`);
          break;
        }

        case 'fetch_algorithm': {
          const res  = await fetch('/api/algorithm-intel', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_topic', topic_id: action.topicId, project_id: selProjId }),
          });
          const data = await res.json();
          if (data.error) { updateResult('error', data.error); break; }
          updateResult('done', `${data.item?.title}: ${data.item?.summary?.slice(0, 150)}`);
          break;
        }

        case 'fetch_custom_algorithm': {
          const res  = await fetch('/api/algorithm-intel', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_custom_topic', label: action.topicLabel, project_id: selProjId }),
          });
          const data = await res.json();
          if (data.error) { updateResult('error', data.error); break; }
          updateResult('done', `${data.item?.title}: ${data.item?.summary?.slice(0, 150)}`);
          break;
        }

        case 'add_card': {
          if (!selProjId) { updateResult('error', 'No project selected'); break; }
          const res  = await fetch('/api/task-engine', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add_canvas_card',
              project_id: selProjId,
              card: { type: action.cardType, title: action.title, content: action.content, priority: action.priority, week: action.week || 1 },
            }),
          });
          const data = await res.json();
          if (data.error) { updateResult('error', data.error); break; }
          updateResult('done', `Canvas card "${action.title}" added to Week ${action.week || 1}. Open Playground to see it.`);
          break;
        }

        case 'search_brain': {
          const q = (action.query || '').toLowerCase();
          const matches = learnings.filter(l =>
            l.card_title?.toLowerCase().includes(q) ||
            l.improvement?.toLowerCase().includes(q) ||
            l.source?.toLowerCase().includes(q)
          );
          updateResult('done', matches.length > 0
            ? `Found ${matches.length} matching learnings: ${matches.slice(0,3).map((l: any) => l.card_title).join(' | ')}`
            : 'No matching learnings found in the brain.'
          );
          break;
        }

        default:
          updateResult('done', `Action ${action.type} noted.`);
      }
    } catch (err: any) {
      updateResult('error', err?.message || 'Action failed');
    }
  }, [navigate, selProjId, learnings]);

  /* Execute all actions in a message */
  const executeMessageActions = useCallback(async (msgId: string, actions: ParsedAction[]) => {
    for (let i = 0; i < actions.length; i++) {
      setMsgs(ms => ms.map(m => {
        if (m.id !== msgId || !m.results) return m;
        const results = [...m.results];
        results[i] = { action: actions[i], status: 'running', result: '' };
        return { ...m, results };
      }));
      await executeAction(actions[i], msgId, i);
      await new Promise(r => setTimeout(r, 200)); // brief pause between actions
    }
  }, [executeAction]);

  /* Log conversation to Supabase (immutable) */
  const logConversation = useCallback(async (
    userMsg: string, brainResp: string, actions: ParsedAction[]
  ) => {
    if (!selProjId) return;
    try {
      await supabase.from('brain_learnings').insert({
        project_id:      selProjId,
        card_type:       'general',
        card_title:      `Brain: ${userMsg.slice(0, 60)}`,
        what_worked:     actions.map(a => a.label || a.type).filter(Boolean),
        what_missed:     [],
        improvement:     brainResp.slice(0, 400),
        context_summary: `Manav Brain conversation — ${new Date().toLocaleDateString()}`,
        tags:            ['brain_assistant_log', ...new Set(actions.map(a => a.type))],
        source:          'brain_assistant_log',
        status:          'active',
        auto_captured:   true,
        confidence_score:90,
        applied_count:   0,
        updated_at:      new Date().toISOString(),
      });
    } catch { /* silent — logging must never break the flow */ }
  }, [selProjId]);

  /* Send a message */
  const sendMessage = useCallback(async (text: string, isAuto = false) => {
    if (!text.trim() || loading) return;
    streamRef.current = true;
    setLoading(true);
    if (!isAuto) setInput('');

    // Append user message
    const userMsg: BrainMsg = { id: uid(), role: 'user', content: text, ts: new Date() };
    setMsgs(ms => [...ms, userMsg]);

    // Prepare brain message placeholder
    const brainId = uid();
    setMsgs(ms => [...ms, { id: brainId, role: 'brain', content: '', ts: new Date() }]);

    // Build history for context (last 8 messages, excluding system)
    const history = msgs.filter(m => m.role === 'user' || m.role === 'brain').slice(-8)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: stripActions(m.content).slice(0, 300) }));

    // Get project summary
    const proj    = projects.find(p => p.id === selProjId);
    const client  = clients.find(c => c.id === proj?.client_id);
    const summary = [client?.company, proj?.name, context?.project?.url].filter(Boolean).join(' | ');

    try {
      const res = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode:           'brain_assistant',
          question:       text,
          projectId:      selProjId || null,
          projectSummary: summary || 'No project selected',
          role:           'senior_seo',
          brainAssistantContext: {
            projectContext: context,
            learnings:      learnings.slice(0, 12),
            algoItems:      algoItems.slice(0, 8),
            canvasBlocks:   [],
            history,
          },
        }),
      });

      if (!res.body) throw new Error('Stream unavailable');
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   full   = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        full += chunk;
        setMsgs(ms => ms.map(m =>
          m.id === brainId ? { ...m, content: full } : m
        ));
      }

      // Check for truncation
      const wasTruncated = full.includes('reached the length limit');

      // Parse ACTION tags from full response
      const actions = parseActions(full);

      // Update message with parsed actions + result placeholders
      setMsgs(ms => ms.map(m => m.id === brainId
        ? { ...m, content: full, actions, results: actions.map(a => ({ action: a, status: 'running' as const, result: '' })), truncated: wasTruncated }
        : m
      ));

      // Execute actions
      if (actions.length > 0) {
        await executeMessageActions(brainId, actions);
      }

      // Log to Supabase (immutable brain log)
      void logConversation(text, stripActions(full), actions);

      // Self-heal: auto-continue if truncated
      if (wasTruncated) {
        setTimeout(() => sendMessage('You were cut off. Please continue your response from where you left off.', true), 800);
        return;
      }

      // Reload context after actions that change data
      if (actions.some(a => ['add_card', 'run_audit', 'fetch_algorithm'].includes(a.type))) {
        await loadContext();
      }

    } catch (err: any) {
      setMsgs(ms => ms.map(m => m.id === brainId
        ? { ...m, content: `Error: ${err?.message || 'Something went wrong. Please try again.'}` }
        : m
      ));
    }

    streamRef.current = false;
    setLoading(false);
  }, [loading, msgs, selProjId, context, learnings, algoItems, projects, clients, executeMessageActions, logConversation, loadContext]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSuggestion = (s: string) => {
    setInput(s);
    inputRef.current?.focus();
  };

  const selProj  = projects.find(p => p.id === selProjId);
  const selClient= clients.find(c => c.id === selProj?.client_id);

  /* ─── RENDER ─── */
  return (
    <>
      {/* ─── FLOATING BUTTON ─── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9990,
            width: 60, height: 60, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #1e1b4b 0%, #0a0f1e 100%)',
            boxShadow: '0 0 0 1px rgba(99,102,241,0.4), 0 0 30px rgba(99,102,241,0.35), 0 4px 20px rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            animation: 'brainPulse 3s ease-in-out infinite',
          }}
          title="Open Manav Brain"
        >
          <Brain size={24} style={{ color: '#a5b4fc', filter: 'drop-shadow(0 0 8px rgba(99,102,241,0.8))' }}/>
          {pending > 0 && (
            <div style={{
              position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
              background: '#f59e0b', border: '2px solid #030712',
              fontSize: 9, fontWeight: 900, color: '#030712',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace',
            }}>{pending > 9 ? '9+' : pending}</div>
          )}
        </button>
      )}

      {/* ─── CHAT PANEL ─── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9990,
          width: panelW, height: panelH, borderRadius: 20, overflow: 'hidden',
          background: '#030712',
          border: '1px solid rgba(99,102,241,0.25)',
          boxShadow: '0 0 0 1px rgba(99,102,241,0.1), 0 0 80px rgba(99,102,241,0.12), 0 20px 60px rgba(0,0,0,0.8)',
          display: 'flex', flexDirection: 'column',
          transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <Scanlines/>

          {/* Grid background */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', borderRadius: 20 }}>
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0.04}}>
              <defs>
                <pattern id="brainGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#00d4ff" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#brainGrid)"/>
            </svg>
            <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.06) 0%, transparent 70%)'}}/>
          </div>

          {/* ─── HEADER ─── */}
          <div style={{
            position: 'relative', zIndex: 2,
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(99,102,241,0.15)',
            backdropFilter: 'blur(20px)',
          }}>
            <Brain size={18} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 6px rgba(99,102,241,0.8))',flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,fontWeight:900,fontFamily:'monospace',color:'#e0e7ff',letterSpacing:'0.12em'}}>◈ MANAV BRAIN</div>
              <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)',letterSpacing:'0.08em'}}>
                {loading ? 'PROCESSING...' : 'NEURAL INTELLIGENCE ONLINE'}
              </div>
            </div>

            {/* Project selector */}
            <select value={selProjId} onChange={e => setSelProjId(e.target.value)}
              style={{height:26,padding:'0 8px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,fontSize:9,color:'rgba(255,255,255,0.6)',outline:'none',fontFamily:'monospace',cursor:'pointer',maxWidth:120,flexShrink:0}}>
              <option value="">SELECT PROJECT</option>
              {projects.map(p => {
                const cl = clients.find(c => c.id === p.client_id);
                return <option key={p.id} value={p.id}>{cl?.company || p.name}</option>;
              })}
            </select>

            {/* Pending count */}
            {pending > 0 && (
              <div style={{background:'rgba(251,191,36,0.15)',border:'1px solid rgba(251,191,36,0.3)',borderRadius:12,padding:'2px 6px',fontSize:8,fontFamily:'monospace',color:'#fbbf24',flexShrink:0}}>
                {pending} PENDING
              </div>
            )}

            <button onClick={() => setExpanded(e => !e)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.2)',padding:4,display:'flex'}}>
              {expanded ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}
            </button>
            <button onClick={() => setOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.25)',padding:4,display:'flex'}}>
              <X size={14}/>
            </button>
          </div>

          {/* ─── MESSAGES ─── */}
          <div style={{
            flex:1,overflow:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:12,
            position:'relative',zIndex:2,
          }}>
            {msgs.map(msg => (
              <MsgBubble key={msg.id} msg={msg} onActionClick={a => {
                const tempId = uid();
                setMsgs(ms => [...ms, {
                  id: tempId, role: 'brain', content: `Executing: ${a.label}...`,
                  actions: [a], results: [{ action: a, status: 'running', result: '' }], ts: new Date()
                }]);
                executeAction(a, tempId, 0);
              }}/>
            ))}
            {loading && !streamRef.current && (
              <div style={{display:'flex',alignItems:'center',gap:8,paddingLeft:4}}>
                <div style={{display:'flex',gap:4}}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{width:5,height:5,borderRadius:'50%',background:'#6366f1',animation:`dotPulse 1.4s ease-in-out ${i*0.2}s infinite`}}/>
                  ))}
                </div>
                <span style={{fontSize:9,fontFamily:'monospace',color:'rgba(99,102,241,0.6)',letterSpacing:'0.1em'}}>THINKING...</span>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* ─── SUGGESTION CHIPS ─── */}
          {msgs.length <= 3 && (
            <div style={{
              position:'relative',zIndex:2,
              padding:'8px 16px 0',display:'flex',gap:6,flexWrap:'wrap',
              borderTop:'1px solid rgba(255,255,255,0.04)',
            }}>
              {SUGGESTIONS.slice(suggIdx % SUGGESTIONS.length, (suggIdx % SUGGESTIONS.length) + 3).map((s, i) => (
                <button key={i} onClick={() => handleSuggestion(s)}
                  style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.18)',borderRadius:14,padding:'4px 10px',fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.7)',cursor:'pointer',letterSpacing:'0.04em',whiteSpace:'nowrap'}}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* ─── INPUT ─── */}
          <div style={{position:'relative',zIndex:2,padding:'12px 16px 16px',borderTop:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.2)'}}>
            <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={1}
                placeholder="Ask me anything or tell me what to do..."
                style={{
                  flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
                  borderRadius:12,padding:'10px 14px',fontSize:12,color:'rgba(255,255,255,0.8)',
                  outline:'none',resize:'none',fontFamily:'inherit',lineHeight:1.5,
                  transition:'border-color 0.2s',minHeight:40,maxHeight:120,
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                style={{
                  width:40,height:40,borderRadius:10,border:'none',cursor:'pointer',flexShrink:0,
                  background:loading||!input.trim() ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  transition:'all 0.2s',
                  boxShadow: !loading && input.trim() ? '0 0 16px rgba(99,102,241,0.4)' : 'none',
                }}
              >
                {loading
                  ? <Loader2 size={16} style={{color:'rgba(255,255,255,0.4)',animation:'spin 1s linear infinite'}}/>
                  : <Send size={14} style={{color: !input.trim() ? 'rgba(255,255,255,0.2)' : 'white'}}/>}
              </button>
            </div>
            <div style={{marginTop:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.15)'}}>
                ENTER to send · SHIFT+ENTER for new line
              </span>
              {selProjId && (
                <button onClick={loadContext} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:3,color:'rgba(255,255,255,0.2)',fontSize:8,fontFamily:'monospace',padding:0}}>
                  <RefreshCw size={8}/>SYNC CONTEXT
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes brainPulse {
          0%,100% { box-shadow: 0 0 0 1px rgba(99,102,241,0.4), 0 0 30px rgba(99,102,241,0.35), 0 4px 20px rgba(0,0,0,0.6); }
          50%      { box-shadow: 0 0 0 1px rgba(99,102,241,0.6), 0 0 50px rgba(99,102,241,0.5), 0 4px 20px rgba(0,0,0,0.6); }
        }
        @keyframes spin      { from { transform: rotate(0deg);   } to { transform: rotate(360deg); } }
        @keyframes dotPulse  {
          0%,60%,100% { transform: scale(1);   opacity: 0.4; }
          30%          { transform: scale(1.5); opacity: 1;   }
        }
      `}</style>
    </>
  );
}
