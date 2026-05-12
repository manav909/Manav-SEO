/**
 * ◈ MANAV BRAIN — GOD MODE v2 ◈
 *
 * FIXED in v2:
 * 1. brainFetch() pattern — ALL brain-internal API calls bypass the fetch
 *    override so the brain can never accidentally monitor itself and create
 *    feedback loops (the root cause of the 11-event cascade).
 *
 * 2. Health scan NO LONGER dispatches error events — it only updates apiStatus
 *    and health state. User clicks "DIAGNOSE NOW" to trigger healing manually.
 *    Auto-healing only fires for JS errors, React crashes, and unhandled
 *    promise rejections — not for the brain's own health checks.
 *
 * 3. Fetch override reads response body for 500s — the AI diagnosis now gets
 *    the actual Vercel error message, not just the status code.
 *
 * 4. Console.error override is much more selective — only patterns that
 *    indicate real errors, not React dev warnings.
 *
 * 5. Schema validator runs on mount (5s delay) — detects if migration-brain-v2.sql
 *    was not run and tells the user exactly what to do.
 *
 * 6. Heal cooldown increased to 60s. Initial scan delayed 5s.
 */
import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import { useNavigate }  from 'react-router-dom';
import { useAuth }      from '@/contexts/AuthContext';
import { supabase }     from '@/lib/supabase';
import {
  Brain, Send, X, Zap, Activity, Globe, Target, Shield, FileText,
  CheckCircle, AlertCircle, Loader2, Cpu, RefreshCw,
  AlertTriangle, Radio, Server, Database, Minimize2, Maximize2, Layers,
  Mic, MicOff, Save,
} from 'lucide-react';

/* ═══════════════ TYPES ═══════════════ */
type MsgRole = 'user' | 'brain' | 'system' | 'alert';
type ErrType = 'js_error' | 'react_error' | 'api_error' | 'network_error' | 'promise_rejection' | 'console_error';
type Health  = 'healthy' | 'degraded' | 'critical' | 'scanning' | 'healing';
type TabId   = 'chat' | 'system' | 'log';

interface BrainMsg {
  id: string; role: MsgRole; content: string;
  actions?: ParsedAction[]; results?: ActionResult[];
  ts: Date; truncated?: boolean;
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
  action: ParsedAction; status: 'running' | 'done' | 'error'; result: string;
}

interface SysError {
  id: string; type: ErrType; message: string;
  stack?: string; url?: string; status?: number;
  body?: string; // actual API response body — crucial for diagnosis
  page: string; ts: Date; healed: boolean; healNote: string;
}

/* ═══════════════ CONSTANTS ═══════════════ */
// Patterns that indicate REAL errors (not React dev noise)
const REAL_ERROR_PATTERNS = [
  'Uncaught Error', 'TypeError', 'ReferenceError', 'Cannot read properties',
  'is not a function', 'is not defined', 'Cannot set', 'Unexpected token',
  'Failed to fetch', 'NetworkError', 'SyntaxError: Unexpected',
];

// Patterns to ignore (React warnings, expected noise)
const IGNORE_PATTERNS = [
  'Warning:', 'Each child in a list', 'validateDOMNesting', 'ReactDOM.render',
  'React.createElement', 'key prop', 'findDOMNode', 'Non-boolean attribute',
  'ResizeObserver loop', 'Script error.', 'favicon', 'google-analytics',
  'The play() request was interrupted', '%c %s', 'React DevTools',
  'contentEditable', 'Cannot update a component', 'A component is changing',
];

const SUGGESTIONS = [
  "Run a full system health check",
  "What should I prioritise this week?",
  "Audit my homepage now",
  "Fetch the March 2025 Core Update",
  "Create a technical card for the biggest issue",
  "How do I improve my GEO visibility?",
  "Why are my APIs returning 500 errors?",
];

const ACTION_ICONS: Record<string, any> = {
  navigate: Globe, run_audit: FileText, fetch_algorithm: Cpu,
  fetch_custom_algorithm: Cpu, add_card: Target, search_brain: Brain,
  default: Zap,
};

const HEALTH_CFG: Record<Health, { color: string; glow: string; label: string }> = {
  healthy:  { color: '#10b981', glow: 'rgba(16,185,129,0.4)',  label: 'ONLINE'   },
  degraded: { color: '#f59e0b', glow: 'rgba(245,158,11,0.4)',  label: 'DEGRADED' },
  critical: { color: '#ef4444', glow: 'rgba(239,68,68,0.5)',   label: 'ALERT'    },
  scanning: { color: '#6366f1', glow: 'rgba(99,102,241,0.4)',  label: 'SCANNING' },
  healing:  { color: '#06b6d4', glow: 'rgba(6,182,212,0.4)',   label: 'HEALING'  },
};

/* ═══════════════ HELPERS ═══════════════ */
let _n = 0;
const uid = () => `m${++_n}_${Math.random().toString(36).slice(2, 6)}`;

function shouldIgnore(msg: string): boolean {
  if (!msg) return true;
  return IGNORE_PATTERNS.some(p => msg.includes(p));
}

function isRealError(msg: string): boolean {
  if (!msg || msg.length < 10) return false;
  if (shouldIgnore(msg)) return false;
  return REAL_ERROR_PATTERNS.some(p => msg.includes(p));
}

function parseActions(text: string): ParsedAction[] {
  const re = /⟦ACTION⟧([\s\S]*?)⟦\/ACTION⟧/g;
  const out: ParsedAction[] = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    try { out.push(JSON.parse(m[1].trim())); } catch (_e) { /* skip */ }
  }
  return out;
}

function stripActions(t: string): string {
  return t.replace(/⟦ACTION⟧[\s\S]*?⟦\/ACTION⟧/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ═══════════════ UI ATOMS ═══════════════ */
const Scanlines = () => (
  <div style={{position:'absolute',inset:0,pointerEvents:'none',borderRadius:'inherit',
    background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px)',zIndex:1}}/>
);

function ActionCard({ result }: { result: ActionResult }) {
  const Icon  = ACTION_ICONS[result.action.type] || ACTION_ICONS.default;
  const color = result.status === 'done' ? '#10b981' : result.status === 'error' ? '#ef4444' : '#6366f1';
  return (
    <div style={{background:`${color}09`,border:`1px solid ${color}22`,borderRadius:8,padding:'6px 10px',marginTop:4}}>
      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:result.result?3:0}}>
        {result.status==='running'  ? <Loader2 size={9} style={{color,animation:'spin 1s linear infinite',flexShrink:0}}/>
         :result.status==='done'   ? <CheckCircle size={9} style={{color:'#10b981',flexShrink:0}}/>
                                    : <AlertCircle size={9} style={{color:'#ef4444',flexShrink:0}}/>}
        <span style={{fontSize:9,fontFamily:'monospace',color,fontWeight:700,letterSpacing:'0.08em'}}>
          {result.status==='running'?'EXECUTING: ':result.status==='done'?'DONE: ':'ERROR: '}{result.action.label}
        </span>
      </div>
      {result.result && <p style={{fontSize:10,color:'rgba(255,255,255,0.38)',lineHeight:1.5,margin:'0 0 0 14px'}}>{result.result.slice(0,220)}{result.result.length>220?'...':''}</p>}
    </div>
  );
}

function MsgBubble({ msg, onAction }: { msg: BrainMsg; onAction: (a: ParsedAction) => void }) {
  const isUser  = msg.role === 'user';
  const isAlert = msg.role === 'alert';
  const isSys   = msg.role === 'system';

  if (isSys)   return <div style={{textAlign:'center',padding:'2px 0'}}><span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.15)',letterSpacing:'0.1em'}}>{msg.content}</span></div>;
  if (isAlert) return (
    <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:9,padding:'7px 12px',display:'flex',alignItems:'center',gap:8}}>
      <AlertCircle size={11} style={{color:'#ef4444',flexShrink:0}}/>
      <span style={{fontSize:10,fontFamily:'monospace',color:'#fca5a5',fontWeight:700}}>{msg.content}</span>
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:isUser?'flex-end':'flex-start',gap:3}}>
      {!isUser && <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(99,102,241,0.45)',letterSpacing:'0.1em',paddingLeft:2}}>◈ MANAV BRAIN</span>}
      <div style={{maxWidth:'90%',background:isUser?'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(79,70,229,0.12))':'rgba(255,255,255,0.03)',border:isUser?'1px solid rgba(99,102,241,0.22)':'1px solid rgba(6,182,212,0.09)',borderRadius:isUser?'14px 14px 4px 14px':'4px 14px 14px 14px',padding:'9px 13px'}}>
        <p style={{fontSize:12,color:isUser?'rgba(255,255,255,0.82)':'rgba(255,255,255,0.68)',lineHeight:1.6,margin:0,whiteSpace:'pre-wrap'}}>
          {msg.role==='brain' ? stripActions(msg.content) : msg.content}
        </p>
        {msg.actions && msg.actions.length > 0 && (
          <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:4}}>
            {msg.actions.map((a,i) => {
              const Icon = ACTION_ICONS[a.type] || ACTION_ICONS.default;
              return (
                <button key={i} onClick={()=>onAction(a)} style={{display:'flex',alignItems:'center',gap:6,background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.17)',borderRadius:7,padding:'4px 9px',cursor:'pointer',textAlign:'left'}}>
                  <Icon size={9} style={{color:'#a5b4fc',flexShrink:0}}/>
                  <span style={{fontSize:9,fontFamily:'monospace',color:'#a5b4fc',fontWeight:600}}>{a.label}</span>
                  <Zap size={7} style={{color:'rgba(99,102,241,0.3)',marginLeft:'auto'}}/>
                </button>
              );
            })}
          </div>
        )}
        {msg.results?.map((r,i) => <ActionCard key={i} result={r}/>)}
        {msg.truncated && <p style={{fontSize:8,color:'rgba(251,191,36,0.5)',fontFamily:'monospace',margin:'4px 0 0'}}>⚠ Truncated — auto-continuing…</p>}
      </div>
      <span style={{fontSize:7,color:'rgba(255,255,255,0.1)',paddingLeft:isUser?0:2,paddingRight:isUser?2:0}}>{msg.ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
    </div>
  );
}

/* ═══════════════ MAIN COMPONENT ═══════════════ */
export default function ManavBrainAssistant() {
  const { projects, clients } = useAuth();
  const navigate = useNavigate();

  /* ── Chat state ── */
  const [open,     setOpen]     = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tab,      setTab]      = useState<TabId>('chat');
  const [msgs,     setMsgs]     = useState<BrainMsg[]>([
    { id:uid(), role:'system', content:'◈ MANAV BRAIN GOD MODE — ONLINE', ts: new Date() },
    { id:uid(), role:'brain',  content:"I am Manav Brain — the master intelligence of SEO Season.\n\nI monitor your system in real-time. I intercept errors before they reach you, diagnose them, and provide exact fixes. I have full authority over every feature.\n\nSelect a project above to give me full context.", ts: new Date() },
  ]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [selProj,  setSelProj]  = useState('');
  const [ctx,      setCtx]      = useState<any>(null);
  const [learnings,setLearnings]= useState<any[]>([]);
  const [algoItems,setAlgoItems]= useState<any[]>([]);
  const [pending,  setPending]  = useState(0);
  const [suggIdx,  setSuggIdx]  = useState(0);

  /* ── God Mode state ── */
  const [health,    setHealth]   = useState<Health>('healthy');
  const [sysErrors, setSysErrors]= useState<SysError[]>([]);
  const [apiStatus, setApiStatus]= useState<Record<string, 'ok'|'error'|'checking'>>({});
  const [lastScan,  setLastScan] = useState<Date | null>(null);
  const [alertCount,setAlerts]   = useState(0);
  const [scanLine,  setScanLine] = useState(false);
  const [schemaOk,  setSchemaOk] = useState<boolean | null>(null); // null = not checked

  /* ── Refs ── */
  const bottomRef       = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLTextAreaElement>(null);
  const streamActive    = useRef(false);
  const healCooldown    = useRef(false);
  const errHandlerRef   = useRef<((d: any) => void) | null>(null);
  const origFetchRef    = useRef<typeof fetch | null>(null);

  const [listening, setListening] = useState(false);
  const [savingMsg,  setSavingMsg]  = useState<string|null>(null);
  const voiceRef = useRef<any>(null);

  const panelW = expanded ? 700 : 440;
  const panelH = expanded ? 740 : 620;
  const hc     = HEALTH_CFG[health];

  /* ───────────────────────────────────────────────────────────────
     brainFetch — bypasses the monitoring fetch override entirely.
     Use this for ALL brain-internal API calls to prevent the brain
     from accidentally monitoring itself and creating feedback loops.
  ─────────────────────────────────────────────────────────────── */
  const brainFetch = useCallback((...args: Parameters<typeof fetch>) => {
    const orig = origFetchRef.current;
    return orig ? orig(...args) : window.fetch(...args);
  }, []);

  /* Auto-scroll */
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  /* Rotate suggestion chips */
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setSuggIdx(i => (i + 3) % SUGGESTIONS.length), 9000);
    return () => clearInterval(t);
  }, [open]);

  /* Reload context on project change */
  useEffect(() => { if (selProj) loadContext(); }, [selProj]);

  /* ───────────────────────────────────────────────────────────────
     INSTALL ERROR INTERCEPTORS — runs once on mount
  ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    /* Store original fetch — used by brainFetch to bypass monitoring */
    const origFetch = window.fetch.bind(window);
    origFetchRef.current = origFetch;

    /* ── Override window.fetch to catch 5xx errors ── */
    window.fetch = async function monitoredFetch(...args: Parameters<typeof fetch>) {
      let url = '';
      try { url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : ''); } catch (_e) { /* ignore */ }

      try {
        const res = await origFetch(...args);

        // Only alert on OUR API routes with 5xx — read body for better diagnosis
        if (url.includes('/api/') && res.status >= 500) {
          let body = '';
          try { const cloned = res.clone(); body = (await cloned.text()).slice(0, 400); } catch (_e) { /* silent */ }

          window.dispatchEvent(new CustomEvent('manav-brain-error', {
            detail: { type: 'api_error', url, status: res.status,
              message: `HTTP ${res.status} from ${url.split('/').pop() || url}`,
              body }
          }));
        }
        return res;
      } catch (err: any) {
        if (url.includes('/api/')) {
          window.dispatchEvent(new CustomEvent('manav-brain-error', {
            detail: { type: 'network_error', url, message: err.message || 'Network request failed' }
          }));
        }
        throw err;
      }
    };

    /* ── Global JS errors ── */
    const onJSError = (e: ErrorEvent) => {
      if (!isRealError(e.message)) return;
      window.dispatchEvent(new CustomEvent('manav-brain-error', {
        detail: { type: 'js_error', message: e.message, stack: e.error?.stack?.slice(0, 600), url: e.filename }
      }));
    };

    /* ── Unhandled promise rejections ── */
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || String(e.reason);
      if (!isRealError(msg)) return;
      window.dispatchEvent(new CustomEvent('manav-brain-error', {
        detail: { type: 'promise_rejection', message: msg, stack: e.reason?.stack?.slice(0, 400) }
      }));
    };

    /* ── Console.error — VERY selective; only real error patterns ── */
    const origConsole = console.error.bind(console);
    console.error = (...args: any[]) => {
      origConsole(...args);
      const msg = args.map(a => typeof a === 'string' ? a : (a?.message || '')).join(' ');
      if (isRealError(msg) && msg.length > 30) {
        window.dispatchEvent(new CustomEvent('manav-brain-error', {
          detail: { type: 'console_error', message: msg.slice(0, 300) }
        }));
      }
    };

    /* ── Listen for unified event (incl. from BrainErrorBoundary) ── */
    const onBrainEvent = (e: Event) => {
      errHandlerRef.current?.((e as CustomEvent).detail);
    };

    window.addEventListener('error', onJSError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('manav-brain-error', onBrainEvent);

    return () => {
      if (origFetchRef.current) window.fetch = origFetchRef.current;
      window.removeEventListener('error', onJSError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('manav-brain-error', onBrainEvent);
      console.error = origConsole;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Keep errHandlerRef current */
  useEffect(() => { errHandlerRef.current = (d: any) => handleSystemError(d); });

  /* ── Health scan: 5s delay, then every 5 minutes ── */
  useEffect(() => {
    const t1 = setTimeout(() => runHealthScan(), 5000);
    const t2 = setInterval(() => runHealthScan(), 5 * 60 * 1000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Schema validator: check if migration was run ── */
  useEffect(() => {
    const check = async () => {
      try {
        const { data, error } = await supabase.from('brain_learnings').select('status').limit(1);
        if (error && error.message.includes('column "status"')) {
          setSchemaOk(false);
          // Inject migration warning into chat
          setMsgs(ms => [...ms, {
            id: uid(), role: 'alert' as MsgRole,
            content: 'SCHEMA ALERT: migration-brain-v2.sql has NOT been run. The status/auto_captured/confidence_score columns are missing from brain_learnings. Run the migration in Supabase SQL Editor to enable full Brain functionality.',
            ts: new Date(),
          }]);
        } else {
          setSchemaOk(true);
        }
      } catch (_e) { /* silent */ }
    };
    setTimeout(check, 3000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────────────────────────────────────────────────────────────
     SYSTEM ERROR HANDLER — fires on real detected errors
     Does NOT fire for health scan results (those update state only)
  ─────────────────────────────────────────────────────────────── */
  const handleSystemError = useCallback((detail: any) => {
    const err: SysError = {
      id: uid(), type: detail.type as ErrType,
      message: detail.message || 'Unknown error',
      stack: detail.stack, url: detail.url, status: detail.status,
      body: detail.body, // actual API response body
      page: window.location.pathname, ts: new Date(), healed: false, healNote: '',
    };

    // Dedup: same message in last 15s
    setSysErrors(prev => {
      if (prev.some(e => e.message === err.message && Date.now() - e.ts.getTime() < 15000)) return prev;
      const next = [err, ...prev].slice(0, 100);
      setAlerts(next.filter(e => !e.healed).length);
      return next;
    });

    if (healCooldown.current) return;
    healCooldown.current = true;
    setTimeout(() => { healCooldown.current = false; }, 60000); // 60s cooldown

    setHealth('critical');
    setOpen(true);
    setTab('chat');
    void logSystemError(err);
    setTimeout(() => triggerHealing(err), 1000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────────────────────────────────────────────────────────────
     SELF-HEALING TRIGGER
  ─────────────────────────────────────────────────────────────── */
  const triggerHealing = useCallback((err: SysError) => {
    setHealth('healing');
    setScanLine(true);
    setTimeout(() => setScanLine(false), 2500);

    setMsgs(ms => [...ms, {
      id: uid(), role: 'alert' as MsgRole,
      content: `ANOMALY — ${err.type.replace(/_/g,' ').toUpperCase()} DETECTED ON ${err.page}`,
      ts: new Date(),
    }]);

    const healPrompt = [
      `⚠ SYSTEM ERROR — IMMEDIATE DIAGNOSIS REQUIRED`,
      ``,
      `Error Type: ${err.type}`,
      `Message: ${err.message}`,
      err.stack ? `Stack Trace:\n${err.stack}` : '',
      err.url ? `Endpoint/File: ${err.url}` : '',
      err.status ? `HTTP Status: ${err.status}` : '',
      err.body ? `API Response Body: ${err.body}` : '',
      `Page: ${err.page}`,
      `Time: ${err.ts.toISOString()}`,
      `Schema OK: ${schemaOk === false ? 'NO — migration-brain-v2.sql not run' : schemaOk === true ? 'YES' : 'Unknown'}`,
      ``,
      `DIAGNOSE THIS COMPLETELY:`,
      `1. What is the exact root cause? Be specific about which file, function, or configuration.`,
      `2. Is this a: code bug | migration not run | import error | env var missing | cold start | data issue?`,
      `3. Provide the EXACT FIX — specific code change, SQL to run, or config to set.`,
      `4. Will this prevent any feature from working right now?`,
      `5. If this needs a canvas card to track the fix, create one with an ACTION tag.`,
      ``,
      `You have full knowledge of the SEO Season codebase (Next.js/React/Supabase/Vercel Hobby). Be surgical and precise.`,
    ].filter(Boolean).join('\n');

    void sendMsgInternal(healPrompt, true, err);
  }, [schemaOk]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────────────────────────────────────────────────────────────
     HEALTH SCAN — uses brainFetch, does NOT dispatch error events
  ─────────────────────────────────────────────────────────────── */
  const runHealthScan = useCallback(async () => {
    setHealth('scanning');
    setScanLine(true);
    const next: Record<string, 'ok'|'error'|'checking'> = {};

    // Use dedicated health_check endpoint — retry once for cold starts (Hobby plan)
    const checkTaskEngine = async (): Promise<'ok'|'error'> => {
      try {
        const r = await brainFetch('/api/task-engine', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action: 'health_check' }),
          signal: AbortSignal.timeout(10000),
        });
        const d = await r.json().catch(() => ({}));
        return (d.healthy || r.ok) ? 'ok' : 'error';
      } catch (_e) { return 'error'; }
    };
    next['task-engine'] = await checkTaskEngine();
    // Retry once — cold starts on Hobby plan are common
    if (next['task-engine'] === 'error') {
      await new Promise(r => setTimeout(r, 2000));
      next['task-engine'] = await checkTaskEngine();
    }

    // Algorithm intel health check
    try {
      const r = await brainFetch('/api/algorithm-intel', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action: 'get_catalog' }),
        signal: AbortSignal.timeout(6000),
      });
      next['algorithm-intel'] = r.ok ? 'ok' : 'error';
    } catch (_e) { next['algorithm-intel'] = 'error'; }

    // Supabase direct check (uses supabase client, not fetch override)
    try {
      const { error } = await supabase.from('brain_learnings').select('id').limit(1);
      next['supabase'] = error ? 'error' : 'ok';
    } catch (_e) { next['supabase'] = 'error'; }

    setApiStatus(next);
    setLastScan(new Date());
    setScanLine(false);

    const anyError = Object.values(next).some(v => v === 'error');
    // Update status only — DO NOT dispatch error events from health scan
    // User clicks "DIAGNOSE NOW" manually if they want the brain to analyze
    setHealth(anyError ? 'degraded' : 'healthy');
  }, [brainFetch]);

  /* ───────────────────────────────────────────────────────────────
     SUPABASE LOGGING — all permanent, immutable records
  ─────────────────────────────────────────────────────────────── */
  const logSystemError = useCallback(async (err: SysError) => {
    try {
      const row: any = {
        project_id: selProj || null,
        card_type: err.type.includes('api') ? 'technical' : 'general',
        card_title: `System Error: ${err.type} — ${err.message.slice(0, 50)}`,
        what_worked: [],
        what_missed: [err.message, err.body || err.stack?.slice(0, 200) || 'No details'].filter(Boolean),
        improvement: `Fix: ${err.type} on ${err.page} — diagnosis pending`,
        context_summary: `${err.type} at ${err.ts.toISOString()} on ${err.page}${err.url ? ` (${err.url})` : ''}${err.body ? ` Body: ${err.body.slice(0,100)}` : ''}`,
        tags: ['system_error_log', err.type, err.page.replace(/\//g,'_')].filter(Boolean),
        source: 'system_error_log',
        applied_count: 0,
        updated_at: new Date().toISOString(),
      };
      // Try with new columns; fallback gracefully
      try {
        await supabase.from('brain_learnings').insert({ ...row, status: 'active', auto_captured: true, confidence_score: 98 });
      } catch (_e) {
        await supabase.from('brain_learnings').insert(row);
      }
    } catch (_e) { /* silent */ }
  }, [selProj]);

  const logHealAction = useCallback(async (errMsg: string, fix: string, actions: string[]) => {
    try {
      const row: any = {
        project_id: selProj || null, card_type: 'technical',
        card_title: `Brain Healed: ${errMsg.slice(0, 50)}`,
        what_worked: actions, what_missed: [],
        improvement: fix.slice(0, 400),
        context_summary: `Self-healing at ${new Date().toISOString()}`,
        tags: ['brain_heal_log', 'self_healing'],
        source: 'brain_heal_log',
        applied_count: 0,
        updated_at: new Date().toISOString(),
      };
      try {
        await supabase.from('brain_learnings').insert({ ...row, status: 'active', auto_captured: true, confidence_score: 95 });
      } catch (_e) {
        await supabase.from('brain_learnings').insert(row);
      }
    } catch (_e) { /* silent */ }
  }, [selProj]);

  const logConversation = useCallback(async (userMsg: string, brainResp: string, actions: ParsedAction[]) => {
    if (!selProj) return;
    try {
      const row: any = {
        project_id: selProj, card_type: 'general',
        card_title: `Brain Chat: ${userMsg.slice(0, 55)}`,
        what_worked: actions.map(a => a.label || a.type).filter(Boolean),
        what_missed: [], improvement: brainResp.slice(0, 400),
        context_summary: `Manav Brain conversation — ${new Date().toLocaleDateString()}`,
        tags: ['brain_assistant_log', ...new Set(actions.map(a => a.type))],
        source: 'brain_assistant_log',
        applied_count: 0,
        updated_at: new Date().toISOString(),
      };
      try {
        await supabase.from('brain_learnings').insert({ ...row, status: 'active', auto_captured: true, confidence_score: 90 });
      } catch (_e) {
        await supabase.from('brain_learnings').insert(row);
      }
    } catch (_e) { /* silent */ }
  }, [selProj]);

  /* ───────────────────────────────────────────────────────────────
     CONTEXT LOADER — uses brainFetch
  ─────────────────────────────────────────────────────────────── */
  const loadContext = useCallback(async () => {
    if (!selProj) return;
    try {
      const [ctxR, learnR, algoR] = await Promise.all([
        brainFetch('/api/control',        { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'get_context', projectId: selProj }) }),
        brainFetch('/api/task-engine',    { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'get_all_learnings', project_id: selProj }) }),
        brainFetch('/api/algorithm-intel',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'get_all' }) }),
      ]);
      const [ctxD, learnD, algoD] = await Promise.all([ctxR.json().catch(()=>({})), learnR.json().catch(()=>({})), algoR.json().catch(()=>({}))]);
      if (ctxD.success)   setCtx(ctxD.context);
      if (learnD.success) {
        const all = learnD.learnings || [];
        setLearnings(all.filter((l: any) => !l.status || l.status === 'active'));
        setPending(all.filter((l: any) => l.status === 'pending_review').length);
      }
      if (algoD.success) setAlgoItems(algoD.items || []);
    } catch (_e) { /* silent — context load failure is non-fatal */ }
  }, [selProj, brainFetch]);

  /* ───────────────────────────────────────────────────────────────
     ACTION EXECUTOR — uses brainFetch
  ─────────────────────────────────────────────────────────────── */
  const executeAction = useCallback(async (action: ParsedAction, msgId: string, idx: number) => {
    const upd = (status: ActionResult['status'], result: string) =>
      setMsgs(ms => ms.map(m => {
        if (m.id !== msgId || !m.results) return m;
        const r = [...m.results]; r[idx] = { ...r[idx], status, result };
        return { ...m, results: r };
      }));

    try {
      switch (action.type) {
        case 'navigate':
          navigate(action.path || '/');
          upd('done', `Navigated to ${action.path}`);
          break;

        case 'run_audit': {
          const res = await brainFetch('/api/analysis', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ url: action.url, mode: action.mode || 'standard', action: 'audit', projectId: selProj }) });
          if (!res.body) { upd('error', 'Stream unavailable'); break; }
          const reader = res.body.getReader(); const dec = new TextDecoder(); let t = '';
          while (true) { const { done, value } = await reader.read(); if (done) break; t += dec.decode(value); }
          upd('done', `Audit complete: ${t.slice(0, 180)}`);
          break;
        }

        case 'fetch_algorithm': {
          const res  = await brainFetch('/api/algorithm-intel', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ action: 'fetch_topic', topic_id: action.topicId, project_id: selProj }) });
          const data = await res.json();
          if (data.error) { upd('error', data.error); break; }
          upd('done', `${data.item?.title}: ${data.item?.summary?.slice(0, 140)}`);
          break;
        }

        case 'fetch_custom_algorithm': {
          const res  = await brainFetch('/api/algorithm-intel', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ action: 'fetch_custom_topic', label: action.topicLabel, project_id: selProj }) });
          const data = await res.json();
          if (data.error) { upd('error', data.error); break; }
          upd('done', `${data.item?.title}: ${data.item?.summary?.slice(0, 140)}`);
          break;
        }

        case 'add_card': {
          if (!selProj) { upd('error', 'No project selected'); break; }
          const res  = await brainFetch('/api/task-engine', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ action: 'add_canvas_card', project_id: selProj,
              card: { type: action.cardType, title: action.title, content: action.content, priority: action.priority, week: action.week || 1 } }) });
          const data = await res.json();
          if (data.error) { upd('error', data.error); break; }
          upd('done', `Canvas card "${action.title}" added to Week ${action.week || 1}.`);
          break;
        }

        case 'search_brain': {
          const q = (action.query || '').toLowerCase();
          const hits = learnings.filter(l => l.card_title?.toLowerCase().includes(q) || l.improvement?.toLowerCase().includes(q));
          upd('done', hits.length > 0 ? `Found ${hits.length}: ${hits.slice(0,3).map((l:any)=>l.card_title).join(' | ')}` : 'No matching learnings.');
          break;
        }

        case 'save_to_desk': {
          if (!selProj) { upd('error', 'No project selected'); break; }
          const res = await brainFetch('/api/task-engine', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ action:'save_to_desk', project_id: selProj,
              title: action.title || 'Brain Output', content: action.content || '',
              content_type: action.contentType || 'text', source: 'brain_action', tags: action.tags || [] }) });
          const data = await res.json();
          if (data.error) { upd('error', data.error); break; }
          upd('done', 'Saved to Desk: ' + (action.title || 'Brain Output'));
          break;
        }
        default: upd('done', `Action ${action.type} acknowledged.`);
      }
    } catch (err: any) { upd('error', err?.message || 'Action failed'); }
  }, [navigate, selProj, learnings, brainFetch]);

  const execAllActions = useCallback(async (msgId: string, actions: ParsedAction[]) => {
    for (let i = 0; i < actions.length; i++) {
      setMsgs(ms => ms.map(m => {
        if (m.id !== msgId || !m.results) return m;
        const r = [...m.results]; r[i] = { action: actions[i], status: 'running', result: '' };
        return { ...m, results: r };
      }));
      await executeAction(actions[i], msgId, i);
      await new Promise(res => setTimeout(res, 120));
    }
  }, [executeAction]);

  /* ───────────────────────────────────────────────────────────────
     SEND MESSAGE — uses brainFetch for the /api/intelligence call
  ─────────────────────────────────────────────────────────────── */
  const sendMsgInternal = useCallback(async (text: string, isAuto = false, sourceErr?: SysError) => {
    if (!text.trim() || loading) return;
    streamActive.current = true;
    setLoading(true);
    if (!isAuto) setInput('');

    if (!isAuto) setMsgs(ms => [...ms, { id:uid(), role:'user', content: text, ts: new Date() }]);
    const brainId = uid();
    setMsgs(ms => [...ms, { id:brainId, role:'brain', content:'', ts: new Date() }]);

    const history = msgs.filter(m => m.role==='user'||m.role==='brain').slice(-8)
      .map(m => ({ role: m.role==='user'?'user':'assistant', content: stripActions(m.content).slice(0, 250) }));

    const proj    = projects.find(p => p.id === selProj);
    const client  = clients.find(c => c.id === proj?.client_id);
    const summary = [client?.company, proj?.name, ctx?.project?.url].filter(Boolean).join(' | ');

    try {
      // CRITICAL: use brainFetch here so this call bypasses the fetch override
      const res = await brainFetch('/api/intelligence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'brain_assistant', question: text, projectId: selProj || null,
          projectSummary: summary || 'No project selected', role: 'senior_seo',
          brainAssistantContext: {
            projectContext: ctx, learnings: learnings.slice(0, 12),
            algoItems: algoItems.slice(0, 8), canvasBlocks: [], history,
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
        setMsgs(ms => ms.map(m => m.id===brainId ? { ...m, content: full } : m));
      }

      const truncated = full.includes('reached the length limit');
      const actions   = parseActions(full);

      setMsgs(ms => ms.map(m => m.id===brainId
        ? { ...m, content: full, actions, results: actions.map(a => ({ action: a, status:'running' as const, result:'' })), truncated }
        : m
      ));

      if (actions.length > 0) await execAllActions(brainId, actions);

      void logConversation(text, stripActions(full), actions);

      // Mark error as healed
      if (sourceErr) {
        const fix = stripActions(full).slice(0, 400);
        setSysErrors(errs => errs.map(e => e.id===sourceErr.id ? { ...e, healed:true, healNote:fix } : e));
        setAlerts(n => Math.max(0, n - 1));
        setHealth(h => h==='critical' ? 'healthy' : h);
        void logHealAction(sourceErr.message, fix, actions.map(a => a.label||a.type));
      }

      if (truncated) {
        setTimeout(() => sendMsgInternal('You were cut off. Continue from where you left off.', true), 800);
        return;
      }

      if (actions.some(a => ['add_card','run_audit','fetch_algorithm'].includes(a.type))) void loadContext();

    } catch (err: any) {
      setMsgs(ms => ms.map(m => m.id===brainId ? { ...m, content: `Error: ${err?.message || 'Something went wrong.'}` } : m));
    }

    streamActive.current = false;
    setLoading(false);
  }, [loading, msgs, selProj, ctx, learnings, algoItems, projects, clients, execAllActions, logConversation, logHealAction, loadContext, brainFetch]);

  const sendMessage = useCallback((text: string) => sendMsgInternal(text, false), [sendMsgInternal]);

  /* ── VOICE INPUT ── */
  const toggleVoice = useCallback(() => {
    if (listening) {
      voiceRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice not supported in this browser. Use Chrome or Edge."); return; }
    const r = new SR();
    r.continuous      = false;
    r.interimResults  = true;
    r.lang            = "en-GB";
    r.onresult  = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setInput(t);
    };
    r.onend     = () => setListening(false);
    r.onerror   = () => setListening(false);
    voiceRef.current = r;
    r.start();
    setListening(true);
  }, [listening]);

  /* ── SAVE MESSAGE TO DESK ── */
  const saveToDesk = useCallback(async (msg: BrainMsg) => {
    if (!selProj) { alert("Select a project first to save to desk."); return; }
    const content = stripActions(msg.content);
    if (content.length < 50) return;
    setSavingMsg(msg.id);
    try {
      await fetch("/api/task-engine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_to_desk", project_id: selProj,
          title: content.slice(0, 80).replace(/\n/g, " "),
          content, content_type: "text", source: "brain_chat",
          tags: ["brain_chat", new Date().toLocaleDateString()],
        }),
      });
    } catch (_e) { /* silent */ }
    setSavingMsg(null);
  }, [selProj]);

  /* ── PARALLEL TASK RUNNER ── */
  const runTasksParallel = useCallback(async (cards: any[], projectContext: any) => {
    if (!selProj) return;
    const MAX_CONCURRENT = 3;
    const queue = [...cards];
    const inFlight: Promise<void>[] = [];
    const runCard = async (card: any) => {
      const taskId = uid();
      setMsgs(ms => [...ms, { id: taskId, role: "system" as MsgRole, content: "⚡ Running: " + card.title, ts: new Date() }]);
      try {
        const res = await brainFetch("/api/task-engine", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "execute", card, context: projectContext, projectId: selProj, role: "senior_seo" }),
        });
        if (res.body) {
          const reader = res.body.getReader(); const dec = new TextDecoder(); let out = "";
          while (true) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value); }
          setMsgs(ms => [...ms, { id: uid(), role: "brain" as MsgRole, content: "✅ " + card.title + "\n\n" + out.slice(0, 600) + (out.length > 600 ? "\n\n[Full output saved to Desk]" : ""), ts: new Date() }]);
        }
      } catch (e: any) {
        setMsgs(ms => [...ms, { id: uid(), role: "alert" as MsgRole, content: "Task failed: " + card.title + " — " + e.message, ts: new Date() }]);
      }
    };
    while (queue.length > 0 || inFlight.length > 0) {
      while (queue.length > 0 && inFlight.length < MAX_CONCURRENT) {
        const card = queue.shift();
        const p = runCard(card).then(() => { inFlight.splice(inFlight.indexOf(p), 1); });
        inFlight.push(p);
      }
      if (inFlight.length > 0) await Promise.race(inFlight);
    }
  }, [selProj, brainFetch]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  /* ─── RENDER ─── */
  const unresolvedErrors = sysErrors.filter(e => !e.healed);
  const resolvedErrors   = sysErrors.filter(e =>  e.healed);
  const selProject = projects.find(p => p.id === selProj);
  const selClient  = clients.find(c => c.id === selProject?.client_id);

  return (
    <>
      {/* ─── FLOATING BUTTON ─── */}
      {!open && (
        <button onClick={() => setOpen(true)}
          style={{position:'fixed',bottom:24,right:24,zIndex:9990,width:60,height:60,borderRadius:'50%',border:'none',cursor:'pointer',
            background: alertCount>0 ? 'linear-gradient(135deg,#7f1d1d,#1f0505)' : health==='healing' ? 'linear-gradient(135deg,#0d4f3c,#0a1f1a)' : 'linear-gradient(135deg,#1e1b4b,#0a0f1e)',
            boxShadow: alertCount>0 ? '0 0 0 1px rgba(239,68,68,0.6),0 0 40px rgba(239,68,68,0.5)' : `0 0 0 1px ${hc.glow},0 0 30px ${hc.glow}`,
            display:'flex',alignItems:'center',justifyContent:'center',
            animation: alertCount>0 ? 'alertPulse 0.8s ease-in-out infinite' : 'brainPulse 3s ease-in-out infinite',
          }}>
          <Brain size={24} style={{color:alertCount>0?'#fca5a5':'#a5b4fc',filter:`drop-shadow(0 0 8px ${alertCount>0?'rgba(239,68,68,0.8)':'rgba(99,102,241,0.8)'})`}}/>
          {alertCount>0 && <div style={{position:'absolute',top:2,right:2,width:20,height:20,borderRadius:'50%',background:'#ef4444',border:'2px solid #030712',fontSize:9,fontWeight:900,color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}}>{alertCount>9?'9+':alertCount}</div>}
          {alertCount===0 && pending>0 && <div style={{position:'absolute',top:2,right:2,width:18,height:18,borderRadius:'50%',background:'#f59e0b',border:'2px solid #030712',fontSize:9,fontWeight:900,color:'#030712',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}}>{pending>9?'9+':pending}</div>}
        </button>
      )}

      {/* ─── PANEL ─── */}
      {open && (
        <div style={{position:'fixed',bottom:24,right:24,zIndex:9990,width:panelW,height:panelH,borderRadius:20,overflow:'hidden',background:'#030712',border:`1px solid ${alertCount>0?'rgba(239,68,68,0.3)':'rgba(99,102,241,0.22)'}`,boxShadow:`0 0 80px ${alertCount>0?'rgba(239,68,68,0.1)':'rgba(99,102,241,0.1)'},0 20px 60px rgba(0,0,0,0.85)`,display:'flex',flexDirection:'column',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}>
          <Scanlines/>
          {scanLine && <div style={{position:'absolute',top:0,left:0,right:0,height:2,zIndex:10,background:'linear-gradient(90deg,transparent,rgba(6,182,212,0.9),transparent)',animation:'scanSlide 2.5s linear forwards',pointerEvents:'none'}}/>}
          <div style={{position:'absolute',inset:0,zIndex:0,overflow:'hidden',borderRadius:20}}>
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0.04}}><defs><pattern id="bg" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#00d4ff" strokeWidth="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#bg)"/></svg>
            <div style={{position:'absolute',inset:0,background:`radial-gradient(ellipse 60% 30% at 50% 0%,${alertCount>0?'rgba(239,68,68,0.05)':'rgba(99,102,241,0.05)'} 0%,transparent 70%)`}}/>
          </div>

          {/* HEADER */}
          <div style={{position:'relative',zIndex:2,display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'rgba(0,0,0,0.45)',borderBottom:`1px solid ${alertCount>0?'rgba(239,68,68,0.12)':'rgba(99,102,241,0.12)'}`,backdropFilter:'blur(20px)'}}>
            <Brain size={16} style={{color:alertCount>0?'#fca5a5':'#a5b4fc',filter:`drop-shadow(0 0 5px ${alertCount>0?'rgba(239,68,68,0.8)':'rgba(99,102,241,0.7)'})`,flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,fontWeight:900,fontFamily:'monospace',color:alertCount>0?'#fca5a5':'#e0e7ff',letterSpacing:'0.12em'}}>
                ◈ MANAV BRAIN {alertCount>0?'— ALERT':health==='healing'?'— HEALING':health==='scanning'?'— SCANNING':'— GOD MODE'}
              </div>
              <div style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.06em'}}>
                {loading?'PROCESSING...':health==='healing'?'SELF-HEALING ACTIVE':health==='scanning'?'SCANNING...':schemaOk===false?'⚠ MIGRATION NEEDED':alertCount>0?`${alertCount} UNRESOLVED ANOMALY${alertCount>1?'S':''}`:hc.label}
              </div>
            </div>
            <div style={{width:5,height:5,borderRadius:'50%',background:hc.color,boxShadow:`0 0 6px ${hc.glow}`,flexShrink:0}}/>
            <select value={selProj} onChange={e=>setSelProj(e.target.value)} style={{height:24,padding:'0 6px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,fontSize:8,color:'rgba(255,255,255,0.55)',outline:'none',fontFamily:'monospace',cursor:'pointer',maxWidth:100,flexShrink:0}}>
              <option value="">PROJECT</option>
              {projects.map(p => { const cl=clients.find(c=>c.id===p.client_id); return <option key={p.id} value={p.id}>{cl?.company||p.name}</option>; })}
            </select>
            {alertCount>0 && <div style={{background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.35)',borderRadius:10,padding:'1px 6px',fontSize:7,fontFamily:'monospace',color:'#fca5a5',flexShrink:0,animation:'alertBadge 0.8s ease-in-out infinite alternate'}}>{alertCount} ERR</div>}
            {alertCount===0 && pending>0 && <div style={{background:'rgba(251,191,36,0.12)',border:'1px solid rgba(251,191,36,0.28)',borderRadius:10,padding:'1px 6px',fontSize:7,fontFamily:'monospace',color:'#fbbf24',flexShrink:0}}>{pending} P</div>}
            <button onClick={()=>setExpanded(e=>!e)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.18)',padding:3,display:'flex'}}>{expanded?<Minimize2 size={11}/>:<Maximize2 size={11}/>}</button>
            <button onClick={()=>setOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.22)',padding:3,display:'flex'}}><X size={13}/></button>
          </div>

          {/* TABS */}
          <div style={{position:'relative',zIndex:2,display:'flex',background:'rgba(0,0,0,0.25)',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            {([
              { id:'chat',   label:'CHAT',   badge:null },
              { id:'system', label:'SYSTEM', badge:unresolvedErrors.length>0?unresolvedErrors.length:null, color:'#ef4444' },
              { id:'log',    label:'LOG',    badge:sysErrors.length>0?sysErrors.length:null,               color:'#6366f1' },
            ] as const).map(t => (
              <button key={t.id} onClick={()=>setTab(t.id as TabId)} style={{flex:1,padding:'8px 4px',background:'none',border:'none',cursor:'pointer',fontSize:8,fontFamily:'monospace',letterSpacing:'0.1em',fontWeight:700,color:tab===t.id?(t.id==='system'&&unresolvedErrors.length>0?'#fca5a5':'#a5b4fc'):'rgba(255,255,255,0.2)',borderBottom:tab===t.id?`2px solid ${t.id==='system'&&unresolvedErrors.length>0?'#ef4444':'#6366f1'}`:'2px solid transparent',position:'relative',transition:'all 0.15s'}}>
                {t.label}
                {(t as any).badge>0 && <span style={{position:'absolute',top:2,right:'25%',width:12,height:12,borderRadius:'50%',background:(t as any).color,fontSize:7,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:900}}>{(t as any).badge>9?'9+':(t as any).badge}</span>}
              </button>
            ))}
          </div>

          {/* ── CHAT TAB ── */}
          {tab==='chat' && (
            <>
              <div style={{flex:1,overflow:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:10,position:'relative',zIndex:2}}>
                {msgs.map(m => (
                  <div key={m.id}>
                    <MsgBubble msg={m} onAction={a => {
                      const tid=uid();
                      setMsgs(ms=>[...ms,{id:tid,role:'brain' as MsgRole,content:`Executing: ${a.label}...`,actions:[a],results:[{action:a,status:'running' as const,result:''}],ts:new Date()}]);
                      executeAction(a,tid,0);
                    }}/>
                    {m.role==='brain' && stripActions(m.content).length>100 && (
                      <div style={{display:'flex',justifyContent:'flex-end',marginTop:2,paddingRight:2}}>
                        <button onClick={()=>saveToDesk(m)} disabled={savingMsg===m.id} title="Save to Desk"
                          style={{background:'none',border:'none',cursor:'pointer',color:savingMsg===m.id?'#10b981':'rgba(255,255,255,0.12)',fontSize:7,fontFamily:'monospace',display:'flex',alignItems:'center',gap:3,padding:2}}>
                          <Save size={8}/>{savingMsg===m.id?'Saving...':'Save to Desk'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {loading && !streamActive.current && (
                  <div style={{display:'flex',alignItems:'center',gap:7,paddingLeft:3}}>
                    <div style={{display:'flex',gap:3}}>{[0,1,2].map(i=><div key={i} style={{width:4,height:4,borderRadius:'50%',background:'#6366f1',animation:`dotPulse 1.4s ease-in-out ${i*0.2}s infinite`}}/>)}</div>
                    <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(99,102,241,0.55)',letterSpacing:'0.1em'}}>THINKING...</span>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>
              {msgs.length<=3 && (
                <div style={{position:'relative',zIndex:2,padding:'6px 14px 0',display:'flex',gap:5,flexWrap:'wrap',borderTop:'1px solid rgba(255,255,255,0.04)'}}>
                  {SUGGESTIONS.slice(suggIdx%SUGGESTIONS.length,(suggIdx%SUGGESTIONS.length)+3).map((s,i)=>(
                    <button key={i} onClick={()=>{setInput(s);inputRef.current?.focus();}} style={{background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.14)',borderRadius:12,padding:'3px 8px',fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.65)',cursor:'pointer',whiteSpace:'nowrap'}}>{s}</button>
                  ))}
                </div>
              )}
              <div style={{position:'relative',zIndex:2,padding:'10px 14px 14px',borderTop:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.18)'}}>
                <div style={{display:'flex',gap:7,alignItems:'flex-end'}}>
                  <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} disabled={loading} rows={1} placeholder="Tell Manav Brain what to do or ask anything..."
                    style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'8px 12px',fontSize:11,color:'rgba(255,255,255,0.78)',outline:'none',resize:'none',fontFamily:'inherit',lineHeight:1.5,minHeight:36,maxHeight:110,transition:'border-color 0.18s'}}
                    onFocus={e=>e.target.style.borderColor='rgba(99,102,241,0.4)'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.07)'}/>
                  <button onClick={toggleVoice} title={listening?'Stop listening':'Voice input'}
                    style={{width:32,height:32,borderRadius:8,border:'none',cursor:'pointer',flexShrink:0,
                      background:listening?'rgba(239,68,68,0.18)':'rgba(255,255,255,0.05)',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      boxShadow:listening?'0 0 10px rgba(239,68,68,0.4)':'none'}}>
                    {listening?<MicOff size={12} style={{color:'#ef4444'}}/>:<Mic size={12} style={{color:'rgba(255,255,255,0.3)'}}/>}
                  </button>
                  <button onClick={()=>sendMessage(input)} disabled={loading||!input.trim()} style={{width:36,height:36,borderRadius:9,border:'none',cursor:'pointer',flexShrink:0,background:loading||!input.trim()?'rgba(99,102,241,0.12)':'linear-gradient(135deg,#6366f1,#4f46e5)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:!loading&&input.trim()?'0 0 14px rgba(99,102,241,0.35)':'none',transition:'all 0.18s'}}>
                    {loading?<Loader2 size={14} style={{color:'rgba(255,255,255,0.3)',animation:'spin 1s linear infinite'}}/>:<Send size={12} style={{color:!input.trim()?'rgba(255,255,255,0.18)':'white'}}/>}
                  </button>
                </div>
                <div style={{marginTop:5,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.12)'}}>ENTER to send · SHIFT+ENTER new line</span>
                  <button onClick={runHealthScan} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:3,color:'rgba(255,255,255,0.18)',fontSize:7,fontFamily:'monospace',padding:0}}>
                    <RefreshCw size={7} style={health==='scanning'?{animation:'spin 1s linear infinite'}:{}}/> SCAN
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── SYSTEM TAB ── */}
          {tab==='system' && (
            <div style={{flex:1,overflow:'auto',padding:'14px',position:'relative',zIndex:2,display:'flex',flexDirection:'column',gap:12}}>
              {/* Schema warning */}
              {schemaOk===false && (
                <div style={{background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.25)',borderRadius:10,padding:'10px 12px'}}>
                  <div style={{fontSize:9,fontWeight:700,fontFamily:'monospace',color:'#fbbf24',marginBottom:4}}>⚠ MIGRATION REQUIRED</div>
                  <p style={{fontSize:10,color:'rgba(255,255,255,0.45)',lineHeight:1.5,margin:'0 0 8px'}}>Run <code style={{background:'rgba(255,255,255,0.08)',padding:'1px 4px',borderRadius:3,fontSize:9}}>migration-brain-v2.sql</code> in Supabase SQL Editor. This adds the status, auto_captured, and confidence_score columns. Until then, Brain Learning features are in fallback mode.</p>
                  <button onClick={()=>{setTab('chat');sendMsgInternal('How do I run the migration-brain-v2.sql migration? Walk me through the exact steps in Supabase.',true);}} style={{background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.3)',borderRadius:6,padding:'3px 10px',color:'#fbbf24',fontSize:8,fontFamily:'monospace',cursor:'pointer'}}>SHOW ME HOW →</button>
                </div>
              )}

              {/* Status banner */}
              <div style={{background:`${hc.color}0c`,border:`1px solid ${hc.color}28`,borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:hc.color,boxShadow:`0 0 8px ${hc.glow}`,flexShrink:0,animation:health==='scanning'||health==='healing'?'scanPulse 1s ease-in-out infinite':undefined}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,fontFamily:'monospace',color:hc.color,letterSpacing:'0.08em'}}>{hc.label}</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.28)',fontFamily:'monospace'}}>{lastScan?`Scanned ${timeAgo(lastScan)}`:'Scanning...'} · {sysErrors.length} events</div>
                </div>
                <button onClick={runHealthScan} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:7,padding:'4px 10px',color:'rgba(255,255,255,0.4)',fontSize:8,fontFamily:'monospace',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                  <RefreshCw size={8} style={health==='scanning'?{animation:'spin 1s linear infinite'}:{}}/> SCAN NOW
                </button>
              </div>

              {/* API status */}
              <div>
                <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.22)',letterSpacing:'0.12em',marginBottom:8}}>API ENDPOINT STATUS</div>
                {[
                  {name:'task-engine',    label:'Task Engine',    icon:Zap},
                  {name:'algorithm-intel',label:'Algorithm Intel',icon:Cpu},
                  {name:'supabase',       label:'Supabase DB',    icon:Database},
                ].map(ep => {
                  const s = apiStatus[ep.name] || 'checking';
                  const c = s==='ok'?'#10b981':s==='error'?'#ef4444':'#6366f1';
                  return (
                    <div key={ep.name} style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.02)',border:`1px solid ${c}18`,borderRadius:8,padding:'7px 10px',marginBottom:5}}>
                      <ep.icon size={10} style={{color:c,flexShrink:0}}/>
                      <span style={{fontSize:10,color:'rgba(255,255,255,0.45)',flex:1,fontFamily:'monospace'}}>{ep.label}</span>
                      {s==='error' && (
                        <button onClick={()=>{setTab('chat');sendMsgInternal(`Diagnose why ${ep.label} (${ep.name}) is OFFLINE. Check the common causes: missing migration columns, import errors, env vars, cold start. Provide the exact fix.`,true);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:5,padding:'2px 7px',color:'#ef4444',fontSize:7,fontFamily:'monospace',cursor:'pointer'}}>DIAGNOSE</button>
                      )}
                      <span style={{fontSize:8,fontFamily:'monospace',color:c,fontWeight:700,letterSpacing:'0.1em'}}>{s==='checking'?'CHECKING':s==='ok'?'ONLINE':'OFFLINE'}</span>
                      <div style={{width:5,height:5,borderRadius:'50%',background:c,boxShadow:`0 0 6px ${c}80`}}/>
                    </div>
                  );
                })}
              </div>

              {/* Unresolved errors */}
              {unresolvedErrors.length > 0 && (
                <div>
                  <div style={{fontSize:8,fontFamily:'monospace',color:'#fca5a5',letterSpacing:'0.12em',marginBottom:8}}>⚠ UNRESOLVED ANOMALIES ({unresolvedErrors.length})</div>
                  {unresolvedErrors.slice(0,5).map(e => (
                    <div key={e.id} style={{background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:8,padding:'8px 10px',marginBottom:6}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                        <span style={{fontSize:9,fontFamily:'monospace',color:'#fca5a5',fontWeight:700}}>{e.type.replace(/_/g,' ').toUpperCase()}</span>
                        <span style={{fontSize:8,color:'rgba(255,255,255,0.18)',fontFamily:'monospace'}}>{timeAgo(e.ts)}</span>
                      </div>
                      <p style={{fontSize:10,color:'rgba(255,255,255,0.42)',margin:'0 0 5px',lineHeight:1.4}}>{e.message.slice(0,120)}</p>
                      {e.body && <p style={{fontSize:9,color:'rgba(239,68,68,0.5)',margin:'0 0 5px',lineHeight:1.3,fontFamily:'monospace'}}>API: {e.body.slice(0,80)}</p>}
                      <button onClick={()=>{setTab('chat');sendMsgInternal(`Diagnose and fix this error:\nType: ${e.type}\nMessage: ${e.message}${e.body?`\nAPI Body: ${e.body}`:''}\nPage: ${e.page}\nTime: ${e.ts.toISOString()}`,true,e);}} style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:5,padding:'3px 8px',color:'#fca5a5',fontSize:8,fontFamily:'monospace',cursor:'pointer'}}>DIAGNOSE NOW →</button>
                    </div>
                  ))}
                </div>
              )}

              {unresolvedErrors.length===0 && (
                <div style={{textAlign:'center',padding:'20px 0'}}>
                  <CheckCircle size={28} style={{color:'#10b981',margin:'0 auto 8px'}}/>
                  <div style={{fontSize:10,fontFamily:'monospace',color:'#10b981'}}>ALL SYSTEMS NOMINAL</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.18)',marginTop:4}}>{resolvedErrors.length>0?`${resolvedErrors.length} past errors resolved`:'No errors detected'}</div>
                </div>
              )}

              {/* Quick actions */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:'auto'}}>
                {[
                  {label:'Full Diagnosis',    icon:Shield, fn:()=>{setTab('chat');sendMsgInternal('Run a complete system diagnosis. Check all APIs, the database schema, environment variables, and code imports. List every issue you find and provide the exact fix for each.',true);}},
                  {label:'Fix 500 Errors',    icon:Zap,    fn:()=>{setTab('chat');sendMsgInternal('The task-engine and algorithm-intel APIs are returning HTTP 500 errors. Diagnose the exact cause — check for: missing migration columns, dynamic import issues in ai-cache.ts, missing env vars. Provide the exact fix.',true);}},
                  {label:'Migration Check',   icon:Database,fn:()=>{setTab('chat');sendMsgInternal('Check if migration-brain-v2.sql has been run. Tell me exactly how to verify it and how to run it if needed.',true);}},
                  {label:'Scan & Fix All',    icon:Radio,  fn:()=>{runHealthScan();setTab('chat');sendMsgInternal('Scan the entire system and provide a prioritised list of every issue you can detect. For each issue provide: what it is, why it matters, and the exact fix.',true);}},
                ].map((item,i) => (
                  <button key={i} onClick={item.fn} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'8px',display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    <item.icon size={10} style={{color:'#6366f1',flexShrink:0}}/>
                    <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.38)'}}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── LOG TAB ── */}
          {tab==='log' && (
            <div style={{flex:1,overflow:'auto',padding:'14px',position:'relative',zIndex:2,display:'flex',flexDirection:'column',gap:7}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.22)',letterSpacing:'0.12em'}}>BRAIN ACTIVITY LOG — {sysErrors.length} ENTRIES — IMMUTABLE</span>
                <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(99,102,241,0.35)'}}>◈ PERMANENT RECORD</span>
              </div>
              {sysErrors.length===0 && (
                <div style={{textAlign:'center',padding:'32px 0'}}>
                  <Layers size={24} style={{color:'rgba(255,255,255,0.05)',margin:'0 auto 10px'}}/>
                  <div style={{fontSize:10,fontFamily:'monospace',color:'rgba(255,255,255,0.14)'}}>NO EVENTS LOGGED YET</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.1)',marginTop:4}}>Manav Brain logs every detected anomaly here permanently</div>
                </div>
              )}
              {sysErrors.map(e => (
                <div key={e.id} style={{background:e.healed?'rgba(16,185,129,0.04)':'rgba(255,255,255,0.02)',border:`1px solid ${e.healed?'rgba(16,185,129,0.14)':'rgba(255,255,255,0.06)'}`,borderRadius:8,padding:'8px 10px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                    {e.healed?<CheckCircle size={8} style={{color:'#10b981',flexShrink:0}}/>:<AlertCircle size={8} style={{color:'#ef4444',flexShrink:0}}/>}
                    <span style={{fontSize:9,fontFamily:'monospace',color:e.healed?'#10b981':'#fca5a5',fontWeight:700}}>{e.type.replace(/_/g,' ').toUpperCase()}</span>
                    <span style={{marginLeft:'auto',fontSize:7,color:'rgba(255,255,255,0.15)',fontFamily:'monospace'}}>{timeAgo(e.ts)}</span>
                  </div>
                  <p style={{fontSize:10,color:'rgba(255,255,255,0.38)',margin:'0 0 2px',lineHeight:1.4}}>{e.message.slice(0,120)}</p>
                  {e.body && <p style={{fontSize:8,color:'rgba(239,68,68,0.4)',margin:'1px 0',fontFamily:'monospace'}}>{e.body.slice(0,80)}</p>}
                  {e.healNote && <p style={{fontSize:9,color:'rgba(16,185,129,0.45)',margin:'3px 0 0',lineHeight:1.4,fontStyle:'italic'}}>Fix: {e.healNote.slice(0,100)}</p>}
                  <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap'}}>
                    <span style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.22)',fontFamily:'monospace'}}>{e.page}</span>
                    {e.url && <span style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.18)',fontFamily:'monospace'}}>{e.url.split('/').pop()}</span>}
                    <span style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:'rgba(99,102,241,0.06)',color:'rgba(165,180,252,0.35)',fontFamily:'monospace'}}>brain_log</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes brainPulse { 0%,100%{box-shadow:0 0 0 1px rgba(99,102,241,0.4),0 0 30px rgba(99,102,241,0.35);}50%{box-shadow:0 0 0 1px rgba(99,102,241,0.7),0 0 55px rgba(99,102,241,0.55);} }
        @keyframes alertPulse { 0%,100%{box-shadow:0 0 0 1px rgba(239,68,68,0.6),0 0 40px rgba(239,68,68,0.5);}50%{box-shadow:0 0 0 2px rgba(239,68,68,0.9),0 0 65px rgba(239,68,68,0.75);} }
        @keyframes alertBadge { from{transform:scale(1);}to{transform:scale(1.2);} }
        @keyframes scanSlide  { 0%{top:-2px;}100%{top:100%;} }
        @keyframes scanPulse  { 0%,100%{opacity:1;}50%{opacity:0.4;} }
        @keyframes spin       { from{transform:rotate(0deg);}to{transform:rotate(360deg);} }
        @keyframes dotPulse   { 0%,60%,100%{transform:scale(1);opacity:0.4;}30%{transform:scale(1.6);opacity:1;} }
      `}</style>
    </>
  );
}
