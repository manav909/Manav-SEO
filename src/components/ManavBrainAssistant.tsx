/**
 * ◈ MANAV BRAIN — GOD MODE INTELLIGENCE SYSTEM ◈
 *
 * The master controller of SEO Season.
 * • Intercepts ALL errors: JS, React, API, network, console
 * • Self-diagnoses and generates exact fixes using AI
 * • Proactive system health scanner
 * • Immutable audit log — nothing ever deleted
 * • Controls entire software through conversation
 * • Hollywood-grade self-healing UI
 *
 * Error flow: intercept → dispatch 'manav-brain-error' → handleSystemError
 *   → logToSupabase (permanent) → healSystem → stream AI diagnosis + fix
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth }   from '@/contexts/AuthContext';
import { supabase }  from '@/lib/supabase';
import {
  Brain, Send, X, Zap, Activity, Globe, Target, Shield, FileText,
  CheckCircle, AlertCircle, Loader2, Cpu, RefreshCw, ChevronRight,
  AlertTriangle, Eye, Radio, Server, Database, Minimize2, Maximize2,
  WifiOff, Clock, Layers,
} from 'lucide-react';

/* ═══════════════ TYPES ═══════════════ */
type MsgRole  = 'user' | 'brain' | 'system' | 'alert';
type ErrType  = 'js_error' | 'react_error' | 'api_error' | 'network_error' | 'promise_rejection' | 'console_error' | 'route_error';
type Health   = 'healthy' | 'degraded' | 'critical' | 'scanning' | 'healing';
type TabId    = 'chat' | 'system' | 'log';

interface BrainMsg {
  id:       string;
  role:     MsgRole;
  content:  string;
  actions?: ParsedAction[];
  results?: ActionResult[];
  ts:       Date;
  truncated?:boolean;
  isError?: boolean;
}

interface ParsedAction {
  type: string; label: string;
  path?: string; url?: string; mode?: string;
  topicId?: string; topicLabel?: string;
  cardType?: string; title?: string; content?: string;
  priority?: string; week?: number; query?: string;
  [key: string]: any;
}

interface ActionResult {
  action: ParsedAction;
  status: 'running' | 'done' | 'error';
  result: string;
}

interface SystemError {
  id:       string;
  type:     ErrType;
  message:  string;
  stack?:   string;
  url?:     string;
  status?:  number;
  page:     string;
  ts:       Date;
  healed:   boolean;
  healNote: string;
}

/* ═══════════════ CONSTANTS ═══════════════ */
const IGNORE_PATTERNS = [
  'Warning:', 'Non-boolean attribute', 'Each child in a list should have a unique',
  'ResizeObserver loop', 'Script error.', 'favicon',
  'The play() request was interrupted', 'CORS', 'google-analytics',
  '%c %s', 'React DevTools', 'contentEditable', 'Warning: validateDOMNesting',
  'Warning: A component is', 'Warning: Cannot update',
];

const SUGGESTIONS = [
  "Scan my system for errors",
  "What should I fix first this week?",
  "Audit my homepage now",
  "Fetch the March 2025 Core Update",
  "Create a card for the biggest issue",
  "How do I improve my GEO score?",
  "Why is my algorithm health score low?",
];

const ACTION_ICONS: Record<string, any> = {
  navigate: Globe, run_audit: FileText, fetch_algorithm: Cpu,
  fetch_custom_algorithm: Cpu, add_card: Target, search_brain: Brain,
  crawl: Activity, default: Zap,
};

const HEALTH_CONFIG: Record<Health, { color: string; glow: string; label: string; icon: any }> = {
  healthy:  { color: '#10b981', glow: 'rgba(16,185,129,0.4)',  label: 'ONLINE',  icon: CheckCircle },
  degraded: { color: '#f59e0b', glow: 'rgba(245,158,11,0.4)',  label: 'DEGRADED',icon: AlertTriangle },
  critical: { color: '#ef4444', glow: 'rgba(239,68,68,0.5)',   label: 'ALERT',   icon: AlertCircle },
  scanning: { color: '#6366f1', glow: 'rgba(99,102,241,0.4)',  label: 'SCANNING',icon: Radio },
  healing:  { color: '#06b6d4', glow: 'rgba(6,182,212,0.4)',   label: 'HEALING', icon: Zap },
};

/* ═══════════════ HELPERS ═══════════════ */
let _uidN = 0;
function uid() { return `m${++_uidN}_${Math.random().toString(36).slice(2,6)}`; }

function shouldIgnore(msg: string): boolean {
  if (!msg) return true;
  return IGNORE_PATTERNS.some(p => msg.includes(p));
}

function parseActions(text: string): ParsedAction[] {
  const re = /⟦ACTION⟧([\s\S]*?)⟦\/ACTION⟧/g;
  const out: ParsedAction[] = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    try { out.push(JSON.parse(m[1].trim())); } catch { /* skip */ }
  }
  return out;
}

function stripActions(text: string): string {
  return text.replace(/⟦ACTION⟧[\s\S]*?⟦\/ACTION⟧/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600)return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

/* ═══════════════ SUB-COMPONENTS ═══════════════ */
const Scanlines = () => (
  <div style={{position:'absolute',inset:0,pointerEvents:'none',borderRadius:'inherit',background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px)',zIndex:1}}/>
);

function ActionCard({ result }: { result: ActionResult }) {
  const Icon  = ACTION_ICONS[result.action.type] || ACTION_ICONS.default;
  const color = result.status === 'done' ? '#10b981' : result.status === 'error' ? '#ef4444' : '#6366f1';
  return (
    <div style={{background:`${color}0a`,border:`1px solid ${color}22`,borderRadius:8,padding:'7px 10px',marginTop:5}}>
      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:result.result?3:0}}>
        {result.status === 'running' ? <Loader2 size={9} style={{color,animation:'spin 1s linear infinite',flexShrink:0}}/> :
         result.status === 'done'    ? <CheckCircle size={9} style={{color:'#10b981',flexShrink:0}}/> :
                                       <AlertCircle size={9} style={{color:'#ef4444',flexShrink:0}}/>}
        <span style={{fontSize:9,fontFamily:'monospace',color,fontWeight:700,letterSpacing:'0.08em'}}>
          {result.status === 'running' ? 'EXECUTING: ' : result.status === 'done' ? 'DONE: ' : 'ERROR: '}
          {result.action.label}
        </span>
      </div>
      {result.result && <p style={{fontSize:10,color:'rgba(255,255,255,0.4)',lineHeight:1.5,margin:'0 0 0 14px'}}>{result.result.slice(0,250)}{result.result.length>250?'...':''}</p>}
    </div>
  );
}

function MsgBubble({ msg, onAction }: { msg: BrainMsg; onAction: (a: ParsedAction) => void }) {
  const isUser  = msg.role === 'user';
  const isAlert = msg.role === 'alert';
  const isSys   = msg.role === 'system';
  if (isSys) return <div style={{textAlign:'center',padding:'3px 0'}}><span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.18)',letterSpacing:'0.1em'}}>{msg.content}</span></div>;
  if (isAlert) return (
    <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'8px 12px',display:'flex',alignItems:'center',gap:8}}>
      <AlertCircle size={12} style={{color:'#ef4444',flexShrink:0}}/>
      <span style={{fontSize:10,fontFamily:'monospace',color:'#fca5a5',fontWeight:700}}>{msg.content}</span>
    </div>
  );
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:isUser?'flex-end':'flex-start',gap:3}}>
      {!isUser && <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(99,102,241,0.5)',letterSpacing:'0.1em',paddingLeft:2}}>◈ MANAV BRAIN</span>}
      <div style={{maxWidth:'90%',background:isUser?'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(79,70,229,0.12))':'rgba(255,255,255,0.03)',border:isUser?'1px solid rgba(99,102,241,0.22)':'1px solid rgba(6,182,212,0.1)',borderRadius:isUser?'14px 14px 4px 14px':'4px 14px 14px 14px',padding:'9px 13px'}}>
        <p style={{fontSize:12,color:isUser?'rgba(255,255,255,0.82)':'rgba(255,255,255,0.68)',lineHeight:1.6,margin:0,whiteSpace:'pre-wrap'}}>
          {msg.role === 'brain' ? stripActions(msg.content) : msg.content}
        </p>
        {msg.actions && msg.actions.length > 0 && (
          <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:4}}>
            {msg.actions.map((a,i) => {
              const Icon = ACTION_ICONS[a.type] || ACTION_ICONS.default;
              return (
                <button key={i} onClick={() => onAction(a)} style={{display:'flex',alignItems:'center',gap:6,background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.18)',borderRadius:7,padding:'4px 9px',cursor:'pointer',textAlign:'left'}}>
                  <Icon size={9} style={{color:'#a5b4fc',flexShrink:0}}/>
                  <span style={{fontSize:9,fontFamily:'monospace',color:'#a5b4fc',fontWeight:600}}>{a.label}</span>
                  <Zap size={7} style={{color:'rgba(99,102,241,0.35)',marginLeft:'auto'}}/>
                </button>
              );
            })}
          </div>
        )}
        {msg.results?.map((r,i) => <ActionCard key={i} result={r}/>)}
        {msg.truncated && <p style={{fontSize:9,color:'rgba(251,191,36,0.5)',fontFamily:'monospace',margin:'5px 0 0'}}>⚠ Truncated — auto-continuing…</p>}
      </div>
      <span style={{fontSize:7,color:'rgba(255,255,255,0.1)',paddingLeft:isUser?0:2,paddingRight:isUser?2:0}}>{msg.ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
    </div>
  );
}

/* ═══════════════ MAIN COMPONENT ═══════════════ */
export default function ManavBrainAssistant() {
  const { projects, clients } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  /* ── Core chat state ── */
  const [open,      setOpen]      = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [tab,       setTab]       = useState<TabId>('chat');
  const [msgs,      setMsgs]      = useState<BrainMsg[]>([
    { id: uid(), role: 'system', content: '◈ MANAV BRAIN GOD MODE — ONLINE', ts: new Date() },
    { id: uid(), role: 'brain',  content: "I am Manav Brain — the master intelligence of SEO Season.\n\nI am monitoring this system in real-time. I will intercept any error, diagnose it, and fix it. I have full authority over every feature of this software.\n\nSelect your project to begin. Tell me anything — I control everything.", ts: new Date() },
  ]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [selProjId, setSelProjId] = useState('');
  const [context,   setContext]   = useState<any>(null);
  const [learnings, setLearnings] = useState<any[]>([]);
  const [algoItems, setAlgoItems] = useState<any[]>([]);
  const [pending,   setPending]   = useState(0);
  const [suggIdx,   setSuggIdx]   = useState(0);

  /* ── God Mode / Error monitoring state ── */
  const [health,       setHealth]       = useState<Health>('healthy');
  const [sysErrors,    setSysErrors]    = useState<SystemError[]>([]);
  const [apiStatus,    setApiStatus]    = useState<Record<string, 'ok'|'error'|'checking'>>({});
  const [lastScan,     setLastScan]     = useState<Date | null>(null);
  const [alertCount,   setAlertCount]   = useState(0);
  const [scanLine,     setScanLine]     = useState(false);

  /* ── Refs ── */
  const bottomRef        = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLTextAreaElement>(null);
  const streamActive     = useRef(false);
  const healCooldown     = useRef(false);
  const errorHandlerRef  = useRef<((d: any) => void) | null>(null);
  const originalFetchRef = useRef<typeof window.fetch | null>(null);

  const panelW = expanded ? 700 : 440;
  const panelH = expanded ? 740 : 620;
  const hc     = HEALTH_CONFIG[health];

  /* Auto-scroll */
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  /* Rotate suggestions */
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setSuggIdx(i => (i + 3) % SUGGESTIONS.length), 9000);
    return () => clearInterval(t);
  }, [open]);

  /* Reload context on project change */
  useEffect(() => { if (selProjId) loadContext(); }, [selProjId]);

  /* ─────────────────────────────────────────────────────────────────
     GOD MODE: Install all error interceptors once on mount
  ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    /* 1. Intercept window.fetch to catch 5xx + network failures */
    const origFetch = window.fetch.bind(window);
    originalFetchRef.current = origFetch;

    window.fetch = async function brainFetch(...args: Parameters<typeof fetch>) {
      try {
        const url  = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : '');
        const res  = await origFetch(...args);
        if (url.includes('/api/') && res.status >= 500) {
          window.dispatchEvent(new CustomEvent('manav-brain-error', {
            detail: { type: 'api_error', url, status: res.status, message: `HTTP ${res.status} from ${url.split('/').pop()}` }
          }));
        }
        return res;
      } catch (err: any) {
        const url = typeof args[0] === 'string' ? args[0] : '';
        if (url.includes('/api/')) {
          window.dispatchEvent(new CustomEvent('manav-brain-error', {
            detail: { type: 'network_error', url, message: err.message || 'Network request failed' }
          }));
        }
        throw err;
      }
    };

    /* 2. Global JS errors */
    const onJSError = (e: ErrorEvent) => {
      if (shouldIgnore(e.message)) return;
      window.dispatchEvent(new CustomEvent('manav-brain-error', {
        detail: { type: 'js_error', message: e.message, stack: e.error?.stack?.slice(0, 600), url: e.filename }
      }));
    };

    /* 3. Unhandled promise rejections */
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || String(e.reason);
      if (shouldIgnore(msg)) return;
      window.dispatchEvent(new CustomEvent('manav-brain-error', {
        detail: { type: 'promise_rejection', message: msg, stack: e.reason?.stack?.slice(0, 400) }
      }));
    };

    /* 4. Console.error override — catches React errors and warnings */
    const origConsoleError = console.error.bind(console);
    console.error = (...args: any[]) => {
      origConsoleError(...args);
      const msg = args.map(a => typeof a === 'string' ? a : (a?.message || String(a))).join(' ');
      if (!shouldIgnore(msg) && msg.length > 20 && (msg.includes('Error') || msg.includes('failed') || msg.includes('Cannot'))) {
        window.dispatchEvent(new CustomEvent('manav-brain-error', {
          detail: { type: 'console_error', message: msg.slice(0, 300) }
        }));
      }
    };

    /* 5. Listen for the unified event (also from BrainErrorBoundary) */
    const onBrainEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      errorHandlerRef.current?.(detail);
    };

    window.addEventListener('error', onJSError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('manav-brain-error', onBrainEvent);

    return () => {
      if (originalFetchRef.current) { window.fetch = originalFetchRef.current; }
      window.removeEventListener('error', onJSError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('manav-brain-error', onBrainEvent);
      console.error = origConsoleError;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Keep errorHandlerRef current without re-installing the listeners */
  useEffect(() => {
    errorHandlerRef.current = (detail: any) => handleSystemError(detail);
  });

  /* Periodic health scan every 5 minutes */
  useEffect(() => {
    const scan = () => runHealthScan();
    scan(); // initial
    const t = setInterval(scan, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─────────────────────────────────────────────────────────────────
     SYSTEM ERROR HANDLER
  ───────────────────────────────────────────────────────────────── */
  const handleSystemError = useCallback((detail: any) => {
    const err: SystemError = {
      id:       uid(),
      type:     detail.type as ErrType,
      message:  detail.message || 'Unknown error',
      stack:    detail.stack,
      url:      detail.url,
      status:   detail.status,
      page:     window.location.pathname,
      ts:       new Date(),
      healed:   false,
      healNote: '',
    };

    // Dedup by message (same error in last 20s)
    setSysErrors(prev => {
      if (prev.some(e => e.message === err.message && Date.now() - e.ts.getTime() < 20000)) return prev;
      const next = [err, ...prev].slice(0, 100);
      setAlertCount(next.filter(e => !e.healed).length);
      return next;
    });

    // Don't open + heal if in cooldown
    if (healCooldown.current) return;
    healCooldown.current = true;
    setTimeout(() => { healCooldown.current = false; }, 25000);

    setHealth('critical');
    setAlertCount(n => n + 1);

    // Log to Supabase immediately (immutable)
    void logSystemError(err);

    // Open brain and begin healing
    setOpen(true);
    setTab('chat');
    setTimeout(() => triggerHealing(err), 800);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─────────────────────────────────────────────────────────────────
     SELF-HEALING TRIGGER
  ───────────────────────────────────────────────────────────────── */
  const triggerHealing = useCallback((err: SystemError) => {
    setHealth('healing');
    setScanLine(true);
    setTimeout(() => setScanLine(false), 2500);

    // Inject alert message
    setMsgs(ms => [...ms, {
      id: uid(), role: 'alert' as MsgRole,
      content: `SYSTEM ANOMALY — ${err.type.replace(/_/g,' ').toUpperCase()} DETECTED ON ${err.page || 'app'}`,
      ts: new Date(),
    }]);

    // Build the healing prompt
    const healPrompt = `⚠ SYSTEM ERROR DETECTED — IMMEDIATE DIAGNOSIS REQUIRED

Error Type: ${err.type}
Message: ${err.message}
${err.stack ? `Stack Trace:\n${err.stack}` : ''}
${err.url ? `Endpoint/File: ${err.url}` : ''}
${err.status ? `HTTP Status: ${err.status}` : ''}
Page: ${err.page}
Time: ${err.ts.toISOString()}

CRITICAL TASK:
1. Identify the exact root cause of this error
2. Determine if this is: frontend code bug | API failure | data issue | config error | route problem
3. Provide the EXACT fix — specific code, configuration change, or step-by-step action
4. Tell me if this is preventing any feature from working
5. If a canvas card should be created to track this fix, create one with an ACTION tag

You have full knowledge of the SEO Season codebase (Next.js/React/Supabase/Vercel). Reference specific files and functions. This is a production system — be precise.`;

    // Auto-send healing request
    void sendMessageInternal(healPrompt, true, err);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─────────────────────────────────────────────────────────────────
     SUPABASE LOGGING (immutable)
  ───────────────────────────────────────────────────────────────── */
  const logSystemError = useCallback(async (err: SystemError) => {
    try {
      await supabase.from('brain_learnings').insert({
        project_id:      selProjId || null,
        card_type:       err.type.includes('api') ? 'technical' : 'general',
        card_title:      `System Error: ${err.type} — ${err.message.slice(0, 50)}`,
        what_worked:     [],
        what_missed:     [err.message, err.stack?.slice(0, 200) || 'No stack'].filter(Boolean),
        improvement:     `Fix: ${err.type} on ${err.page} — pending diagnosis`,
        context_summary: `${err.type} at ${err.ts.toISOString()} on ${err.page}${err.url ? ` (${err.url})` : ''}`,
        tags:            ['system_error_log', err.type, err.page.replace(/\//g,'')].filter(Boolean),
        source:          'system_error_log',
        status:          'active',
        auto_captured:   true,
        confidence_score:98,
        applied_count:   0,
        updated_at:      new Date().toISOString(),
      });
    } catch { /* silent */ }
  }, [selProjId]);

  const logHealAction = useCallback(async (errId: string, errMsg: string, fix: string, actions: string[]) => {
    try {
      await supabase.from('brain_learnings').insert({
        project_id:      selProjId || null,
        card_type:       'technical',
        card_title:      `Brain Healed: ${errMsg.slice(0, 50)}`,
        what_worked:     actions,
        what_missed:     [],
        improvement:     fix.slice(0, 400),
        context_summary: `Self-healing response to error ${errId} at ${new Date().toISOString()}`,
        tags:            ['brain_heal_log', 'self_healing', 'auto_fix'],
        source:          'brain_heal_log',
        status:          'active',
        auto_captured:   true,
        confidence_score:95,
        applied_count:   0,
        updated_at:      new Date().toISOString(),
      });
    } catch { /* silent */ }
  }, [selProjId]);

  const logConversation = useCallback(async (userMsg: string, brainResp: string, actions: ParsedAction[]) => {
    if (!selProjId) return;
    try {
      await supabase.from('brain_learnings').insert({
        project_id:      selProjId,
        card_type:       'general',
        card_title:      `Brain Chat: ${userMsg.slice(0, 55)}`,
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
    } catch { /* silent */ }
  }, [selProjId]);

  /* ─────────────────────────────────────────────────────────────────
     SYSTEM HEALTH SCAN
  ───────────────────────────────────────────────────────────────── */
  const runHealthScan = useCallback(async () => {
    setHealth('scanning');
    setScanLine(true);
    const next: Record<string, 'ok'|'error'|'checking'> = {};

    // Check task-engine
    try {
      const r = await fetch('/api/task-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_relevant', card_type: 'general', limit: 1 }),
        signal: AbortSignal.timeout(6000),
      });
      next['task-engine'] = r.ok ? 'ok' : 'error';
    } catch { next['task-engine'] = 'error'; }

    // Check algorithm-intel
    try {
      const r = await fetch('/api/algorithm-intel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_all' }),
        signal: AbortSignal.timeout(6000),
      });
      next['algorithm-intel'] = r.ok ? 'ok' : 'error';
    } catch { next['algorithm-intel'] = 'error'; }

    // Check Supabase
    try {
      const { error } = await supabase.from('brain_learnings').select('id').limit(1);
      next['supabase'] = error ? 'error' : 'ok';
    } catch { next['supabase'] = 'error'; }

    setApiStatus(next);
    setLastScan(new Date());
    setScanLine(false);

    const hasError = Object.values(next).some(v => v === 'error');
    setHealth(hasError ? 'degraded' : 'healthy');

    if (hasError) {
      const errAPI = Object.entries(next).filter(([,v]) => v === 'error').map(([k]) => k).join(', ');
      handleSystemError({
        type: 'api_error',
        message: `Health scan: ${errAPI} not responding`,
        url: errAPI,
      });
    }
  }, [handleSystemError]);

  /* ─────────────────────────────────────────────────────────────────
     ACTION EXECUTOR
  ───────────────────────────────────────────────────────────────── */
  const executeAction = useCallback(async (action: ParsedAction, msgId: string, idx: number) => {
    const upd = (status: ActionResult['status'], result: string) =>
      setMsgs(ms => ms.map(m => {
        if (m.id !== msgId || !m.results) return m;
        const r = [...m.results]; r[idx] = { ...r[idx], status, result };
        return { ...m, results: r };
      }));

    try {
      switch (action.type) {
        case 'navigate': navigate(action.path || '/'); upd('done', `Navigated to ${action.path}`); break;

        case 'run_audit': {
          const res = await fetch('/api/analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: action.url, mode: action.mode || 'standard', action: 'audit', projectId: selProjId }) });
          if (!res.body) { upd('error', 'Stream unavailable'); break; }
          const reader = res.body.getReader(); const dec = new TextDecoder(); let t = '';
          while (true) { const { done, value } = await reader.read(); if (done) break; t += dec.decode(value); }
          upd('done', `Audit complete: ${t.slice(0, 180)}`);
          break;
        }

        case 'fetch_algorithm': {
          const res  = await fetch('/api/algorithm-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_topic', topic_id: action.topicId, project_id: selProjId }) });
          const data = await res.json();
          if (data.error) { upd('error', data.error); break; }
          upd('done', `${data.item?.title}: ${data.item?.summary?.slice(0, 140)}`);
          break;
        }

        case 'fetch_custom_algorithm': {
          const res  = await fetch('/api/algorithm-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_custom_topic', label: action.topicLabel, project_id: selProjId }) });
          const data = await res.json();
          if (data.error) { upd('error', data.error); break; }
          upd('done', `${data.item?.title}: ${data.item?.summary?.slice(0, 140)}`);
          break;
        }

        case 'add_card': {
          if (!selProjId) { upd('error', 'No project selected'); break; }
          const res  = await fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_canvas_card', project_id: selProjId,
              card: { type: action.cardType, title: action.title, content: action.content, priority: action.priority, week: action.week || 1 } }) });
          const data = await res.json();
          if (data.error) { upd('error', data.error); break; }
          upd('done', `Canvas card "${action.title}" added to Week ${action.week || 1}.`);
          break;
        }

        case 'search_brain': {
          const q = (action.query || '').toLowerCase();
          const hits = learnings.filter(l => l.card_title?.toLowerCase().includes(q) || l.improvement?.toLowerCase().includes(q));
          upd('done', hits.length > 0 ? `Found ${hits.length}: ${hits.slice(0,3).map((l:any)=>l.card_title).join(' | ')}` : 'No matching learnings found.');
          break;
        }

        default: upd('done', `Action ${action.type} acknowledged.`);
      }
    } catch (err: any) {
      upd('error', err?.message || 'Action failed');
    }
  }, [navigate, selProjId, learnings]);

  const executeAllActions = useCallback(async (msgId: string, actions: ParsedAction[]) => {
    for (let i = 0; i < actions.length; i++) {
      setMsgs(ms => ms.map(m => {
        if (m.id !== msgId || !m.results) return m;
        const r = [...m.results]; r[i] = { action: actions[i], status: 'running', result: '' };
        return { ...m, results: r };
      }));
      await executeAction(actions[i], msgId, i);
      await new Promise(res => setTimeout(res, 150));
    }
  }, [executeAction]);

  /* ─────────────────────────────────────────────────────────────────
     LOAD CONTEXT
  ───────────────────────────────────────────────────────────────── */
  const loadContext = useCallback(async () => {
    if (!selProjId) return;
    try {
      const [ctxR, learnR, algoR] = await Promise.all([
        fetch('/api/control',       { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'get_context', projectId: selProjId }) }),
        fetch('/api/task-engine',   { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'get_all_learnings', project_id: selProjId }) }),
        fetch('/api/algorithm-intel',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'get_all' }) }),
      ]);
      const [ctxD, learnD, algoD] = await Promise.all([ctxR.json(), learnR.json(), algoR.json()]);
      if (ctxD.success)   setContext(ctxD.context);
      if (learnD.success) {
        const all = learnD.learnings || [];
        setLearnings(all.filter((l: any) => l.status === 'active'));
        setPending(all.filter((l: any) => l.status === 'pending_review').length);
      }
      if (algoD.success) setAlgoItems(algoD.items || []);
    } catch { /* silent */ }
  }, [selProjId]);

  /* ─────────────────────────────────────────────────────────────────
     SEND MESSAGE (internal + external API)
  ───────────────────────────────────────────────────────────────── */
  const sendMessageInternal = useCallback(async (text: string, isAuto = false, sourceError?: SystemError) => {
    if (!text.trim() || loading) return;
    streamActive.current = true;
    setLoading(true);
    if (!isAuto) setInput('');

    if (!isAuto) setMsgs(ms => [...ms, { id: uid(), role: 'user', content: text, ts: new Date() }]);

    const brainId = uid();
    setMsgs(ms => [...ms, { id: brainId, role: 'brain', content: '', ts: new Date() }]);

    const history = msgs.filter(m => m.role === 'user' || m.role === 'brain').slice(-8)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: stripActions(m.content).slice(0, 250) }));

    const proj   = projects.find(p => p.id === selProjId);
    const client = clients.find(c => c.id === proj?.client_id);
    const summary= [client?.company, proj?.name, context?.project?.url].filter(Boolean).join(' | ');

    try {
      const res = await fetch('/api/intelligence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
        full += dec.decode(value);
        setMsgs(ms => ms.map(m => m.id === brainId ? { ...m, content: full } : m));
      }

      const truncated = full.includes('reached the length limit');
      const actions   = parseActions(full);

      setMsgs(ms => ms.map(m => m.id === brainId
        ? { ...m, content: full, actions, results: actions.map(a => ({ action: a, status: 'running' as const, result: '' })), truncated }
        : m
      ));

      if (actions.length > 0) await executeAllActions(brainId, actions);

      // Log the conversation
      void logConversation(text, stripActions(full), actions);

      // If healing: mark error as healed + log the fix
      if (sourceError) {
        const fix = stripActions(full).slice(0, 400);
        setSysErrors(errs => errs.map(e => e.id === sourceError.id ? { ...e, healed: true, healNote: fix } : e));
        setAlertCount(n => Math.max(0, n - 1));
        setHealth(h => h === 'critical' ? 'healthy' : h);
        void logHealAction(sourceError.id, sourceError.message, fix, actions.map(a => a.label || a.type));
      }

      // Auto-continue if truncated
      if (truncated) {
        setTimeout(() => sendMessageInternal('You were cut off. Continue from where you left off.', true), 800);
        return;
      }

      // Reload context if data-changing actions ran
      if (actions.some(a => ['add_card', 'run_audit', 'fetch_algorithm'].includes(a.type))) void loadContext();

    } catch (err: any) {
      setMsgs(ms => ms.map(m => m.id === brainId ? { ...m, content: `Error: ${err?.message || 'Something went wrong.'}` } : m));
    }

    streamActive.current = false;
    setLoading(false);
  }, [loading, msgs, selProjId, context, learnings, algoItems, projects, clients, executeAllActions, logConversation, logHealAction, loadContext]);

  const sendMessage = useCallback((text: string) => sendMessageInternal(text, false), [sendMessageInternal]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  /* ─────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────── */
  const selProj  = projects.find(p => p.id === selProjId);
  const selClient= clients.find(c => c.id === selProj?.client_id);

  // Error summary for SYSTEM tab
  const unresolvedErrors = sysErrors.filter(e => !e.healed);
  const resolvedErrors   = sysErrors.filter(e =>  e.healed);

  return (
    <>
      {/* ─── FLOATING BUTTON ─── */}
      {!open && (
        <button onClick={() => setOpen(true)}
          style={{
            position:'fixed', bottom:24, right:24, zIndex:9990,
            width:60, height:60, borderRadius:'50%', border:'none', cursor:'pointer',
            background: alertCount > 0
              ? 'linear-gradient(135deg,#7f1d1d,#1f0a0a)'
              : health === 'healing'
              ? 'linear-gradient(135deg,#0d4f3c,#0a1f1a)'
              : 'linear-gradient(135deg,#1e1b4b,#0a0f1e)',
            boxShadow: alertCount > 0
              ? `0 0 0 1px rgba(239,68,68,0.6),0 0 40px rgba(239,68,68,0.5),0 4px 20px rgba(0,0,0,0.6)`
              : `0 0 0 1px ${hc.glow.replace('0.4','0.4')},0 0 30px ${hc.glow},0 4px 20px rgba(0,0,0,0.6)`,
            display:'flex', alignItems:'center', justifyContent:'center',
            animation: alertCount > 0 ? 'alertPulse 0.8s ease-in-out infinite' : 'brainPulse 3s ease-in-out infinite',
          }}
          title={alertCount > 0 ? `SYSTEM ALERT: ${alertCount} unresolved errors` : 'Open Manav Brain'}
        >
          <Brain size={24} style={{color: alertCount>0 ? '#fca5a5' : '#a5b4fc', filter:`drop-shadow(0 0 8px ${alertCount>0?'rgba(239,68,68,0.8)':'rgba(99,102,241,0.8)'})`}}/>
          {/* Error badge */}
          {alertCount > 0 && (
            <div style={{position:'absolute',top:2,right:2,width:20,height:20,borderRadius:'50%',background:'#ef4444',border:'2px solid #030712',fontSize:9,fontWeight:900,color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',animation:'alertBadge 0.5s ease-in-out infinite alternate'}}>
              {alertCount > 9 ? '9+' : alertCount}
            </div>
          )}
          {/* Pending badge (only if no errors) */}
          {alertCount === 0 && pending > 0 && (
            <div style={{position:'absolute',top:2,right:2,width:18,height:18,borderRadius:'50%',background:'#f59e0b',border:'2px solid #030712',fontSize:9,fontWeight:900,color:'#030712',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}}>
              {pending > 9 ? '9+' : pending}
            </div>
          )}
        </button>
      )}

      {/* ─── MAIN PANEL ─── */}
      {open && (
        <div style={{
          position:'fixed', bottom:24, right:24, zIndex:9990,
          width:panelW, height:panelH, borderRadius:20, overflow:'hidden',
          background:'#030712',
          border:`1px solid ${alertCount>0?'rgba(239,68,68,0.3)':'rgba(99,102,241,0.22)'}`,
          boxShadow:`0 0 80px ${alertCount>0?'rgba(239,68,68,0.1)':'rgba(99,102,241,0.1)'}, 0 20px 60px rgba(0,0,0,0.85)`,
          display:'flex', flexDirection:'column',
          transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <Scanlines/>

          {/* Scan animation overlay */}
          {scanLine && (
            <div style={{position:'absolute',top:0,left:0,right:0,height:2,zIndex:10,background:'linear-gradient(90deg,transparent,rgba(6,182,212,0.8),transparent)',animation:'scanSlide 2.5s linear forwards',pointerEvents:'none'}}/>
          )}

          {/* Grid bg */}
          <div style={{position:'absolute',inset:0,zIndex:0,overflow:'hidden',borderRadius:20}}>
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0.04}}>
              <defs><pattern id="bGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#00d4ff" strokeWidth="0.5"/></pattern></defs>
              <rect width="100%" height="100%" fill="url(#bGrid)"/>
            </svg>
            <div style={{position:'absolute',inset:0,background:`radial-gradient(ellipse 60% 30% at 50% 0%,${alertCount>0?'rgba(239,68,68,0.05)':'rgba(99,102,241,0.05)'} 0%,transparent 70%)`}}/>
          </div>

          {/* ─── HEADER ─── */}
          <div style={{position:'relative',zIndex:2,display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'rgba(0,0,0,0.45)',borderBottom:`1px solid ${alertCount>0?'rgba(239,68,68,0.12)':'rgba(99,102,241,0.12)'}`,backdropFilter:'blur(20px)'}}>
            <Brain size={16} style={{color:alertCount>0?'#fca5a5':'#a5b4fc',filter:`drop-shadow(0 0 5px ${alertCount>0?'rgba(239,68,68,0.8)':'rgba(99,102,241,0.7)'})`,flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,fontWeight:900,fontFamily:'monospace',color:alertCount>0?'#fca5a5':'#e0e7ff',letterSpacing:'0.12em'}}>
                ◈ MANAV BRAIN {alertCount > 0 ? '— SYSTEM ALERT' : '— GOD MODE'}
              </div>
              <div style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.08em'}}>
                {loading ? 'PROCESSING...' : health === 'healing' ? 'SELF-HEALING ACTIVE' : health === 'scanning' ? 'SCANNING SYSTEM...' : alertCount > 0 ? `${alertCount} UNRESOLVED ANOMALY${alertCount>1?'S':''}` : 'NEURAL INTELLIGENCE ONLINE · MONITORING ACTIVE'}
              </div>
            </div>

            {/* Status dot */}
            <div style={{width:6,height:6,borderRadius:'50%',background:hc.color,boxShadow:`0 0 8px ${hc.glow}`,flexShrink:0}}/>

            {/* Project selector */}
            <select value={selProjId} onChange={e => setSelProjId(e.target.value)} style={{height:24,padding:'0 6px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,fontSize:8,color:'rgba(255,255,255,0.55)',outline:'none',fontFamily:'monospace',cursor:'pointer',maxWidth:100,flexShrink:0}}>
              <option value="">PROJECT</option>
              {projects.map(p => { const cl=clients.find(c=>c.id===p.client_id); return <option key={p.id} value={p.id}>{cl?.company||p.name}</option>; })}
            </select>

            {/* Alert/pending badges */}
            {alertCount > 0 && <div style={{background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.35)',borderRadius:10,padding:'1px 6px',fontSize:7,fontFamily:'monospace',color:'#fca5a5',flexShrink:0,animation:'alertBadge 0.8s ease-in-out infinite alternate'}}>{alertCount} ERR</div>}
            {alertCount===0 && pending>0 && <div style={{background:'rgba(251,191,36,0.12)',border:'1px solid rgba(251,191,36,0.28)',borderRadius:10,padding:'1px 6px',fontSize:7,fontFamily:'monospace',color:'#fbbf24',flexShrink:0}}>{pending} P</div>}

            <button onClick={() => setExpanded(e=>!e)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.18)',padding:3,display:'flex'}}>
              {expanded?<Minimize2 size={11}/>:<Maximize2 size={11}/>}
            </button>
            <button onClick={() => setOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.22)',padding:3,display:'flex'}}>
              <X size={13}/>
            </button>
          </div>

          {/* ─── TABS ─── */}
          <div style={{position:'relative',zIndex:2,display:'flex',background:'rgba(0,0,0,0.25)',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            {([
              { id:'chat',   label:'CHAT',   badge: null },
              { id:'system', label:'SYSTEM', badge: unresolvedErrors.length > 0 ? unresolvedErrors.length : null, color:'#ef4444' },
              { id:'log',    label:'LOG',    badge: sysErrors.length > 0 ? sysErrors.length : null, color:'#6366f1' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id as TabId)}
                style={{flex:1,padding:'8px 4px',background:'none',border:'none',cursor:'pointer',fontSize:8,fontFamily:'monospace',letterSpacing:'0.1em',fontWeight:700,color:tab===t.id?(t.id==='system'&&unresolvedErrors.length>0?'#fca5a5':'#a5b4fc'):'rgba(255,255,255,0.2)',borderBottom:tab===t.id?`2px solid ${t.id==='system'&&unresolvedErrors.length>0?'#ef4444':'#6366f1'}`:'2px solid transparent',transition:'all 0.15s',position:'relative'}}>
                {t.label}
                {t.badge != null && t.badge > 0 && (
                  <span style={{position:'absolute',top:2,right:'25%',width:12,height:12,borderRadius:'50%',background:(t as any).color||'#6366f1',fontSize:7,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:900}}>{t.badge>9?'9+':t.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* ─── TAB: CHAT ─── */}
          {tab === 'chat' && (
            <>
              <div style={{flex:1,overflow:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:10,position:'relative',zIndex:2}}>
                {msgs.map(m => <MsgBubble key={m.id} msg={m} onAction={a => {
                  const tid=uid();
                  setMsgs(ms=>[...ms,{id:tid,role:'brain',content:`Executing: ${a.label}...`,actions:[a],results:[{action:a,status:'running',result:''}],ts:new Date()}]);
                  executeAction(a,tid,0);
                }}/>)}
                {loading && !streamActive.current && (
                  <div style={{display:'flex',alignItems:'center',gap:7,paddingLeft:3}}>
                    <div style={{display:'flex',gap:3}}>{[0,1,2].map(i=><div key={i} style={{width:4,height:4,borderRadius:'50%',background:'#6366f1',animation:`dotPulse 1.4s ease-in-out ${i*0.2}s infinite`}}/>)}</div>
                    <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(99,102,241,0.55)',letterSpacing:'0.1em'}}>THINKING...</span>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>
              {msgs.length <= 3 && (
                <div style={{position:'relative',zIndex:2,padding:'6px 14px 0',display:'flex',gap:5,flexWrap:'wrap',borderTop:'1px solid rgba(255,255,255,0.04)'}}>
                  {SUGGESTIONS.slice(suggIdx%SUGGESTIONS.length,(suggIdx%SUGGESTIONS.length)+3).map((s,i)=>(
                    <button key={i} onClick={()=>{setInput(s);inputRef.current?.focus();}} style={{background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.14)',borderRadius:12,padding:'3px 8px',fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.65)',cursor:'pointer',whiteSpace:'nowrap'}}>{s}</button>
                  ))}
                </div>
              )}
              <div style={{position:'relative',zIndex:2,padding:'10px 14px 14px',borderTop:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.18)'}}>
                <div style={{display:'flex',gap:7,alignItems:'flex-end'}}>
                  <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={loading} rows={1} placeholder="Tell Manav Brain what to do or ask anything..."
                    style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'8px 12px',fontSize:11,color:'rgba(255,255,255,0.78)',outline:'none',resize:'none',fontFamily:'inherit',lineHeight:1.5,minHeight:36,maxHeight:110,transition:'border-color 0.18s'}}
                    onFocus={e=>e.target.style.borderColor='rgba(99,102,241,0.4)'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.07)'}/>
                  <button onClick={()=>sendMessage(input)} disabled={loading||!input.trim()}
                    style={{width:36,height:36,borderRadius:9,border:'none',cursor:'pointer',flexShrink:0,background:loading||!input.trim()?'rgba(99,102,241,0.12)':'linear-gradient(135deg,#6366f1,#4f46e5)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:!loading&&input.trim()?'0 0 14px rgba(99,102,241,0.35)':'none',transition:'all 0.18s'}}>
                    {loading?<Loader2 size={14} style={{color:'rgba(255,255,255,0.3)',animation:'spin 1s linear infinite'}}/>:<Send size={12} style={{color:!input.trim()?'rgba(255,255,255,0.18)':'white'}}/>}
                  </button>
                </div>
                <div style={{marginTop:5,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.12)'}}>ENTER to send · SHIFT+ENTER new line</span>
                  <button onClick={runHealthScan} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:3,color:'rgba(255,255,255,0.18)',fontSize:7,fontFamily:'monospace',padding:0}}>
                    <RefreshCw size={7}/> SCAN
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ─── TAB: SYSTEM HEALTH ─── */}
          {tab === 'system' && (
            <div style={{flex:1,overflow:'auto',padding:'14px',position:'relative',zIndex:2,display:'flex',flexDirection:'column',gap:12}}>
              {/* Status banner */}
              <div style={{background:`${hc.color}0c`,border:`1px solid ${hc.color}28`,borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                <hc.icon size={16} style={{color:hc.color,flexShrink:0}}/>
                <div>
                  <div style={{fontSize:11,fontWeight:700,fontFamily:'monospace',color:hc.color,letterSpacing:'0.08em'}}>{hc.label}</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.3)',fontFamily:'monospace'}}>
                    {lastScan ? `Last scan: ${timeAgo(lastScan)}` : 'First scan pending...'} · {sysErrors.length} events captured
                  </div>
                </div>
                <button onClick={runHealthScan} style={{marginLeft:'auto',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:7,padding:'4px 10px',color:'rgba(255,255,255,0.4)',fontSize:8,fontFamily:'monospace',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                  <RefreshCw size={8} style={health==='scanning'?{animation:'spin 1s linear infinite'}:{}}/> SCAN NOW
                </button>
              </div>

              {/* API endpoint status */}
              <div>
                <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)',letterSpacing:'0.12em',marginBottom:8}}>API ENDPOINT STATUS</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {[
                    { name:'task-engine',    label:'Task Engine',     icon:Zap },
                    { name:'algorithm-intel',label:'Algorithm Intel', icon:Cpu },
                    { name:'supabase',       label:'Supabase DB',     icon:Database },
                  ].map(ep => {
                    const s = apiStatus[ep.name] || 'checking';
                    const c = s==='ok' ? '#10b981' : s==='error' ? '#ef4444' : '#6366f1';
                    const Icon = ep.icon;
                    return (
                      <div key={ep.name} style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.02)',border:`1px solid ${c}18`,borderRadius:8,padding:'7px 10px'}}>
                        <Icon size={10} style={{color:c,flexShrink:0}}/>
                        <span style={{fontSize:10,color:'rgba(255,255,255,0.5)',flex:1,fontFamily:'monospace'}}>{ep.label}</span>
                        <span style={{fontSize:8,fontFamily:'monospace',color:c,fontWeight:700,letterSpacing:'0.1em'}}>
                          {s==='checking'?'CHECKING':s==='ok'?'ONLINE':'OFFLINE'}
                        </span>
                        <div style={{width:5,height:5,borderRadius:'50%',background:c,boxShadow:`0 0 6px ${c}80`}}/>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Unresolved errors */}
              {unresolvedErrors.length > 0 && (
                <div>
                  <div style={{fontSize:8,fontFamily:'monospace',color:'#fca5a5',letterSpacing:'0.12em',marginBottom:8}}>⚠ UNRESOLVED ANOMALIES ({unresolvedErrors.length})</div>
                  {unresolvedErrors.slice(0,5).map(e => (
                    <div key={e.id} style={{background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.18)',borderRadius:8,padding:'8px 10px',marginBottom:6}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                        <span style={{fontSize:9,fontFamily:'monospace',color:'#fca5a5',fontWeight:700}}>{e.type.replace(/_/g,' ').toUpperCase()}</span>
                        <span style={{fontSize:8,color:'rgba(255,255,255,0.2)',fontFamily:'monospace'}}>{timeAgo(e.ts)}</span>
                      </div>
                      <p style={{fontSize:10,color:'rgba(255,255,255,0.45)',margin:'0 0 6px',lineHeight:1.4}}>{e.message.slice(0,120)}</p>
                      <button onClick={()=>{setTab('chat');sendMessageInternal(`Diagnose and fix this error:\nType: ${e.type}\nMessage: ${e.message}\nPage: ${e.page}\nTime: ${e.ts.toISOString()}`,true,e);}} style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:5,padding:'3px 8px',color:'#fca5a5',fontSize:8,fontFamily:'monospace',cursor:'pointer'}}>
                        DIAGNOSE NOW →
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {unresolvedErrors.length === 0 && (
                <div style={{textAlign:'center',padding:'20px 0'}}>
                  <CheckCircle size={28} style={{color:'#10b981',margin:'0 auto 8px'}}/>
                  <div style={{fontSize:10,fontFamily:'monospace',color:'#10b981'}}>ALL SYSTEMS NOMINAL</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.2)',marginTop:4}}>{resolvedErrors.length > 0 ? `${resolvedErrors.length} past errors resolved` : 'No errors detected'}</div>
                </div>
              )}

              {/* Quick actions */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:'auto'}}>
                {[
                  { label:'Scan System', icon:Radio,    fn: runHealthScan },
                  { label:'View Brain Log', icon:Eye,   fn: () => navigate('/brain-learning') },
                  { label:'Fix All Errors', icon:Zap,   fn: () => { setTab('chat'); sendMessageInternal('Run a complete system diagnosis. List every issue you can detect and provide the fix for each one. Create canvas cards for any major fixes needed.', true); }},
                  { label:'Algorithm Intel', icon:Cpu,  fn: () => navigate('/algorithm-intel') },
                ].map((item, i) => (
                  <button key={i} onClick={item.fn} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'8px',display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    <item.icon size={10} style={{color:'#6366f1',flexShrink:0}}/>
                    <span style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.4)'}}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── TAB: LOG ─── */}
          {tab === 'log' && (
            <div style={{flex:1,overflow:'auto',padding:'14px',position:'relative',zIndex:2,display:'flex',flexDirection:'column',gap:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)',letterSpacing:'0.12em'}}>BRAIN ACTIVITY LOG — {sysErrors.length} ENTRIES — IMMUTABLE</span>
                <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(99,102,241,0.4)'}}>◈ PERMANENT RECORD</span>
              </div>

              {sysErrors.length === 0 && (
                <div style={{textAlign:'center',padding:'32px 0'}}>
                  <Layers size={24} style={{color:'rgba(255,255,255,0.06)',margin:'0 auto 10px'}}/>
                  <div style={{fontSize:10,fontFamily:'monospace',color:'rgba(255,255,255,0.15)'}}>NO EVENTS LOGGED YET</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.1)',marginTop:4}}>Manav Brain logs every detected anomaly here</div>
                </div>
              )}

              {sysErrors.map(e => (
                <div key={e.id} style={{background:e.healed?'rgba(16,185,129,0.04)':'rgba(255,255,255,0.02)',border:`1px solid ${e.healed?'rgba(16,185,129,0.15)':'rgba(255,255,255,0.06)'}`,borderRadius:8,padding:'8px 10px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                    {e.healed ? <CheckCircle size={9} style={{color:'#10b981',flexShrink:0}}/> : <AlertCircle size={9} style={{color:'#ef4444',flexShrink:0}}/>}
                    <span style={{fontSize:9,fontFamily:'monospace',color:e.healed?'#10b981':'#fca5a5',fontWeight:700}}>{e.type.replace(/_/g,' ').toUpperCase()}</span>
                    <span style={{marginLeft:'auto',fontSize:7,color:'rgba(255,255,255,0.18)',fontFamily:'monospace'}}>{timeAgo(e.ts)}</span>
                  </div>
                  <p style={{fontSize:10,color:'rgba(255,255,255,0.4)',margin:'0 0 3px',lineHeight:1.4}}>{e.message.slice(0,120)}</p>
                  {e.healNote && <p style={{fontSize:9,color:'rgba(16,185,129,0.5)',margin:'3px 0 0',lineHeight:1.4,fontStyle:'italic'}}>Fix: {e.healNote.slice(0,100)}</p>}
                  <div style={{display:'flex',gap:4,marginTop:5,flexWrap:'wrap'}}>
                    <span style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.25)',fontFamily:'monospace'}}>{e.page}</span>
                    {e.url && <span style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.2)',fontFamily:'monospace'}}>{e.url.split('/').pop()}</span>}
                    <span style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.15)',color:'rgba(165,180,252,0.4)',fontFamily:'monospace'}}>brain_log</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes brainPulse  { 0%,100% { box-shadow:0 0 0 1px rgba(99,102,241,0.4),0 0 30px rgba(99,102,241,0.35),0 4px 20px rgba(0,0,0,0.6); } 50% { box-shadow:0 0 0 1px rgba(99,102,241,0.7),0 0 55px rgba(99,102,241,0.55),0 4px 20px rgba(0,0,0,0.6); } }
        @keyframes alertPulse  { 0%,100% { box-shadow:0 0 0 1px rgba(239,68,68,0.6),0 0 40px rgba(239,68,68,0.5); } 50% { box-shadow:0 0 0 2px rgba(239,68,68,0.9),0 0 65px rgba(239,68,68,0.75); } }
        @keyframes alertBadge  { from { transform:scale(1); } to { transform:scale(1.2); } }
        @keyframes scanSlide   { 0% { top:-2px; } 100% { top:100%; } }
        @keyframes spin        { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes dotPulse    { 0%,60%,100% { transform:scale(1); opacity:0.4; } 30% { transform:scale(1.6); opacity:1; } }
      `}</style>
    </>
  );
}
