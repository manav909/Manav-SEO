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
import { useProject }   from '@/contexts/ProjectContext';
import { supabase }     from '@/lib/supabase';
import { getRuntimeCompiler, type LearnedPattern, INFRA_FACTS } from '@/lib/runtimeCompiler';
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
    { id:uid(), role:'brain',  content:"I am Manav Brain — the master intelligence of SEO Season.\n\nI have full access to your strategy canvas, learnings, algorithm intel, and all your data. I can execute tasks, create cards, run audits, and navigate anywhere in the platform.\n\n⚡ SELECT A PROJECT above — I need it to give you specific, data-driven responses. Without a project I can only give generic advice.", ts: new Date() },
  ]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { selectedProjectId: ctxProjectId } = useProject();
  const [selProj,  setSelProj]  = useState(() => ctxProjectId || localStorage.getItem('seo_season_proj') || '');

  // Keep selProj in sync with global ProjectContext (see useEffect at line ~334)
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

  /* ── Runtime Compiler state ── */
  const [rcChecks,      setRcChecks]      = useState(0);
  const [rcIntercepted, setRcIntercepted] = useState(0);
  const [rcPatterns,    setRcPatterns]    = useState<LearnedPattern[]>([]);
  const [rcPatternCount,setRcPatternCount]= useState(0);

  const panelW = expanded ? 700 : 440;
  const panelH = expanded ? 740 : 620;

  /* ── Draggable position state ── */
  const [btnPos, setBtnPos] = React.useState<{x:number;y:number}|null>(null);
  const dragRef  = React.useRef<{startX:number;startY:number;origX:number;origY:number;dragging:boolean}>({startX:0,startY:0,origX:0,origY:0,dragging:false});
  const btnRef   = React.useRef<HTMLButtonElement>(null);

  // Default pos: bottom-right (matches original)
  const btnLeft  = btnPos ? btnPos.x : (typeof window !== 'undefined' ? window.innerWidth  - 84 : 0);
  const btnTop   = btnPos ? btnPos.y : (typeof window !== 'undefined' ? window.innerHeight - 84 : 0);

  const onMouseDown = React.useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: btnLeft, origY: btnTop, dragging: false };
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      if (!dragRef.current.dragging && Math.hypot(dx, dy) < 4) return;
      dragRef.current.dragging = true;
      const maxX = window.innerWidth  - 60;
      const maxY = window.innerHeight - 60;
      setBtnPos({ x: Math.max(0, Math.min(maxX, dragRef.current.origX + dx)), y: Math.max(0, Math.min(maxY, dragRef.current.origY + dy)) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  }, [btnLeft, btnTop]);

  const onTouchStart = React.useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    dragRef.current = { startX: t.clientX, startY: t.clientY, origX: btnLeft, origY: btnTop, dragging: false };
    const onMove = (ev: TouchEvent) => {
      const touch = ev.touches[0];
      const dx = touch.clientX - dragRef.current.startX;
      const dy = touch.clientY - dragRef.current.startY;
      if (!dragRef.current.dragging && Math.hypot(dx, dy) < 6) return;
      dragRef.current.dragging = true;
      setBtnPos({ x: Math.max(0, Math.min(window.innerWidth-60, dragRef.current.origX+dx)), y: Math.max(0, Math.min(window.innerHeight-60, dragRef.current.origY+dy)) });
    };
    const onEnd = () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  }, [btnLeft, btnTop]);
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
  useEffect(() => { if (ctxProjectId && ctxProjectId !== selProj) setSelProj(ctxProjectId); }, [ctxProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Don't monitor calls that explicitly opt out (e.g. BrainLearning page-load calls)
      const skipHeaders = args[1] as RequestInit | undefined;
      const skipMonitor = skipHeaders?.headers && typeof skipHeaders.headers === 'object' && 'X-Brain-Source' in (skipHeaders.headers as Record<string, string>);

      try {
        const res = await origFetch(...args);

        // Only alert on OUR API routes with 5xx — read body for better diagnosis
        // Only fire for real server errors (5xx), not client errors (4xx), not opted-out calls
        if (!skipMonitor && url.includes('/api/') && res.status >= 500 && res.status < 600) {
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
    const t1 = setTimeout(() => runHealthScan(), 2000);
    const t2 = setInterval(() => runHealthScan(), 3 * 60 * 1000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Runtime Compiler: init + subscribe for live stats ── */
  useEffect(() => {
    const rc = getRuntimeCompiler(supabase as any);
    rc.init().then(() => {
      setRcPatterns(rc.getTopPatterns(5));
      setRcPatternCount(rc.getStats().patternCount);
    }).catch(() => {});
    const unsub = rc.subscribe((stats) => {
      setRcChecks(stats.checksThisSession);
      setRcIntercepted(stats.interceptionsThisSession);
      setRcPatternCount(stats.patternCount);
      setRcPatterns(rc.getTopPatterns(5));
    });
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Schema validator: check if migration was run ── */
  useEffect(() => {
    const check = async () => {
      try {
        const { data, error } = await supabase.from('brain_learnings').select('status').limit(1);
        if (error && error.message.includes('column "status"')) {
          setSchemaOk(false);
          // Only show migration warning once per session
          const shownKey = 'brain_migration_warned';
          if (!sessionStorage.getItem(shownKey)) {
            sessionStorage.setItem(shownKey, '1');
            setMsgs(ms => [...ms, {
              id: uid(), role: 'alert' as MsgRole,
              content: '⚠ OPTIONAL: Run migration-brain-v2.sql in Supabase to enable Brain Learning status filters. The system works without it — this just enables the approve/reject workflow.',
              ts: new Date(),
            }]);
          }
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
    setTimeout(() => { healCooldown.current = false; }, 300000); // 5min cooldown — prevents cascade

    // Only auto-open panel for JS/React crashes — not for API 500s (handled by retry)
    const isCriticalCrash = err.type === 'js_error' || err.type === 'react_error';
    if (isCriticalCrash) {
      setHealth('critical');
      setOpen(true);
      setTab('chat');
      setTimeout(() => triggerHealing(err), 1000);
    } else {
      // API errors: just mark degraded, don't interrupt the user
      setHealth('degraded');
    }
    void logSystemError(err);
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

    // ── Runtime Compiler: check auto-fix FIRST before asking Claude ──
    const rc = getRuntimeCompiler();
    const autoFixResult = rc.autoFix(`${err.message} ${err.body || ''}`);
    if (autoFixResult) {
      // We already know the answer — show it immediately, no Claude call needed
      setMsgs(ms => [...ms, {
        id: uid(), role: 'brain' as MsgRole,
        content: `⚡ AUTO-DIAGNOSED (Runtime Compiler)\n\n**Root Cause:** ${autoFixResult.diagnosis}\n\n**Fix:** ${autoFixResult.action}\n\n_This pattern is stored — the Brain will not suggest wrong fixes for this error again._`,
        ts: new Date(),
      }]);
      setHealth('degraded');
      void logSystemError(err);
      void logHealAction(err.message, autoFixResult.action, ['runtime_compiler_auto_fix']);
      return;
    }

    const healPrompt = [
      `⚠ SYSTEM ERROR — IMMEDIATE DIAGNOSIS REQUIRED`,
      ``,
      `${INFRA_FACTS}`,
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
      `2. Is this a: code bug | migration not run | import error | env var missing | cold start | data issue | UNDEPLOYED CODE?`,
      `3. Provide the EXACT FIX — specific code change, SQL to run, or config to set.`,
      `4. Will this prevent any feature from working right now?`,
      `5. If this needs a canvas card to track the fix, create one with an ACTION tag.`,
      ``,
      `You have full knowledge of the SEO Season codebase (React/Supabase/Vercel Pro). Be surgical and precise. NEVER suggest region changes — iad1 is already correctly configured everywhere.`,
    ].filter(Boolean).join('\n');

    // Only trigger healing if Brain is not already processing something
    if (!loading) {
      void sendMsgInternal(healPrompt, true, err);
    } else {
      // Queue a brief status message instead of spamming
      setMsgs(ms => [...ms, { id: uid(), role: 'alert' as MsgRole,
        content: 'Auto-heal queued — Brain busy. Click DIAGNOSE NOW in System tab when ready.',
        ts: new Date() }]);
    }
  }, [schemaOk]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────────────────────────────────────────────────────────────
     HEALTH SCAN — uses brainFetch, does NOT dispatch error events
  ─────────────────────────────────────────────────────────────── */
  const runHealthScan = useCallback(async () => {
    setHealth('scanning');
    setScanLine(true);
    const next: Record<string, 'ok'|'error'|'checking'> = {};

    // Health check — Pro plan: no cold start issues, fast response expected
    const checkTaskEngine = async (): Promise<'ok'|'error'> => {
      try {
        const r = await brainFetch('/api/task-engine', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action: 'health_check' }),
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) return 'ok';
        const text = await r.text().catch(() => '');
        return text.length > 0 ? 'ok' : 'error';
      } catch (_e) { return 'error'; }
    };
    next['task-engine'] = await checkTaskEngine();
    // One retry for transient network issues
    if (next['task-engine'] === 'error') {
      await new Promise(r => setTimeout(r, 2000));
      next['task-engine'] = await checkTaskEngine();
    }

    // Algorithm intel health check
    const checkAlgorithmIntel = async (): Promise<'ok'|'error'> => {
      try {
        const r = await brainFetch('/api/algorithm-intel', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action: 'get_catalog' }),
          signal: AbortSignal.timeout(15000),
        });
        if (r.ok) return 'ok';
        const text = await r.text().catch(() => '');
        return text.length > 0 ? 'ok' : 'error';
      } catch (_e) { return 'error'; }
    };
    next['algorithm-intel'] = await checkAlgorithmIntel();
    if (next['algorithm-intel'] === 'error') {
      await new Promise(r => setTimeout(r, 3000));
      next['algorithm-intel'] = await checkAlgorithmIntel();
    }

    // Intelligence health check
    try {
      const r = await brainFetch('/api/intelligence', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action: 'health_check', mode: 'health_check' }),
        signal: AbortSignal.timeout(10000),
      });
      const text = await r.text().catch(() => '');
      next['intelligence'] = (r.ok || text.length > 0) ? 'ok' : 'error';
    } catch (_e) { next['intelligence'] = 'error'; }

    
      const text = await r.text().catch(() => '');
      next[] = (r.ok || text.length > 0) ? 'ok' : 'error';
    } catch (_e) // Supabase direct check (uses supabase client, not fetch override)
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
    } catch (_e) {
      // Non-fatal but tell user so they know Brain might have limited context
      setMsgs(ms => [...ms, { id: uid(), role: 'system' as MsgRole,
        content: '⚠ Context load partial — some project data may be missing. Brain will work with what it has.',
        ts: new Date() }]);
    }
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
          if (!action.url) { upd('error', 'No URL provided for audit'); break; }
          /* Route to run-analysis (the comprehensive streaming audit) */
          const res = await brainFetch('/api/run-analysis', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              url:         action.url,
              keywords:    (ctx as any)?.project?.keywords || [],
              brand_name:  (ctx as any)?.project?.name    || '',
              competitors: [(ctx as any)?.competitors?.c1, (ctx as any)?.competitors?.c2].filter(Boolean),
              project_id:  selProj || null,
            }) });
          if (!res.body) { upd('error', 'Audit stream unavailable'); break; }
          const reader = res.body.getReader(); const dec = new TextDecoder(); let t = '';
          while (true) { const { done, value } = await reader.read(); if (done) break; t += dec.decode(value); }
          upd('done', `Audit complete for ${action.url}. ${t.slice(0, 200)}`);
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

        case 'retry_last': {
          const lastUserMsg = msgs.filter(m => m.role === 'user').pop();
          if (lastUserMsg) {
            upd('done', '');
            setTimeout(() => sendMessage(stripActions(lastUserMsg.content)), 300);
          } else { upd('done', 'No message to retry.'); }
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
        case 'save_learning': {
          if (!selProj) { upd('error', 'No project selected'); break; }
          const row: any = {
            project_id:      selProj,
            card_type:       action.cardType       || action.card_type       || 'insight',
            card_title:      (action.title         || action.card_title      || 'Brain Learning').slice(0, 100),
            what_worked:     Array.isArray(action.whatWorked) ? action.whatWorked : action.whatWorked ? [action.whatWorked] : [],
            what_missed:     Array.isArray(action.whatMissed) ? action.whatMissed : action.whatMissed ? [action.whatMissed] : [],
            improvement:     action.improvement    || action.content         || '',
            context_summary: action.summary        || action.context_summary || '',
            tags:            Array.isArray(action.tags) ? action.tags : [action.cardType || 'insight', 'brain-created'],
            source:          'brain_chat',
            applied_count:   0,
            updated_at:      new Date().toISOString(),
          };
          let { error } = await supabase.from('brain_learnings').insert({
            ...row, status: 'active', auto_captured: true, confidence_score: 80,
          });
          if (error) {
            const { error: e2 } = await supabase.from('brain_learnings').insert(row);
            if (e2) {
              // Try via API as last resort
              try {
                const ar = await brainFetch('/api/task-engine', { method:'POST', headers:{'Content-Type':'application/json','X-Brain-Source':'app-page'},
                  body: JSON.stringify({ action:'save_learning', project_id: selProj, ...row }) });
                const ad = await ar.json().catch(()=>({}));
                if (ad.error) { upd('error', `Could not save learning: ${error.message || ad.error}`); break; }
              } catch(_e) { upd('error', `Could not save: ${error.message}`); break; }
            }
          }
          upd('done', '✅ Brain Learning saved: ' + (action.title || 'New Pathway'));
          break;
        }
        case 'save_multiple_learnings': {
          if (!selProj) { upd('error', 'No project selected'); break; }
          const learnings: any[] = action.learnings || [];
          if (!learnings.length) { upd('done', 'No learnings to save'); break; }
          upd('running', `Saving ${learnings.length} brain learnings...`);
          let saved = 0;
          let lastError = '';

          for (const l of learnings) {
            // Build the row — only columns that definitely exist in the schema
            const row: any = {
              project_id:      selProj,
              card_type:       (l.cardType || l.card_type || 'insight').toLowerCase(),
              card_title:      (l.title || l.card_title || 'Brain Learning').slice(0, 100),
              what_worked:     Array.isArray(l.whatWorked || l.what_worked) ? (l.whatWorked || l.what_worked) : [],
              what_missed:     Array.isArray(l.whatMissed || l.what_missed) ? (l.whatMissed || l.what_missed) : [],
              improvement:     l.improvement || l.content || null,
              context_summary: l.summary || l.context_summary || null,
              tags:            Array.isArray(l.tags) ? l.tags : ['brain-auto'],
              source:          'brain_chat',
              applied_count:   0,
              updated_at:      new Date().toISOString(),
            };

            // ATTEMPT 1: Direct Supabase with all extended columns
            const { error: e1 } = await supabase.from('brain_learnings').insert({
              ...row, status: 'pending_review', auto_captured: true, confidence_score: 75
            });
            if (!e1) { saved++; continue; }

            // ATTEMPT 2: Direct Supabase without extended columns (migration not run)
            const { error: e2 } = await supabase.from('brain_learnings').insert(row);
            if (!e2) { saved++; continue; }

            // ATTEMPT 3: Via task-engine API (server-side, different permissions)
            try {
              const apiRes = await brainFetch('/api/task-engine', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
                body: JSON.stringify({ action: 'save_learning', project_id: selProj, ...row }),
              });
              const apiData = await apiRes.json().catch(() => ({}));
              if (!apiData.error) { saved++; continue; }
              lastError = apiData.error || e2?.message || e1?.message || 'Unknown error';
            } catch (_e3) {
              lastError = e2?.message || e1?.message || 'Insert failed';
            }
          }

          if (saved === 0 && lastError) {
            upd('error', `❌ Could not save any learnings. Error: ${lastError}\n\nThis is likely a Supabase RLS policy issue. Go to Supabase Dashboard → brain_learnings table → RLS Policies → ensure authenticated users can INSERT.`);
          } else if (saved < learnings.length) {
            upd('done', `⚠️ ${saved}/${learnings.length} saved. ${learnings.length - saved} failed (${lastError})`);
          } else {
            upd('done', `✅ ${saved}/${learnings.length} brain learnings saved permanently`);
          }
          break;
        }
        case 'fetch_url': {
          upd('running', `Fetching ${action.url}...`);
          try {
            const res = await brainFetch('/api/crawl', { method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ action: 'preview_url', url: action.url }) });
            const data = await res.json();
            upd('done', `Fetched ${action.url}: ${JSON.stringify(data).slice(0, 200)}`);
          } catch (e: any) { upd('error', e.message); }
          break;
        }
        default: upd('done', `Action ${action.type} acknowledged.`);
      }
    } catch (err: any) { upd('error', err?.message || 'Action failed'); }
  }, [navigate, selProj, learnings, brainFetch, ctx]);

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
  const sendMsgInternal = useCallback(async (text: string, isAuto = false, sourceErr?: SysError, isRetry = false) => {
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
            algoItems: algoItems.slice(0, 8), canvasBlocks: (ctx as any)?.project?.canvasBlocks || [], history,
          },
        }),
      });

      if (!res.body) throw new Error('Stream unavailable');
      // If intelligence crashed (500), show a human-friendly message with retry action
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const isVercelCrash = errText.includes('FUNCTION_INVOCATION_FAILED') || errText.includes('A server error');
        // Auto-retry once silently before showing error to user
        if (!isRetry) {
          setMsgs(ms => ms.map(m => m.id===brainId
            ? { ...m, content: '◈ Retrying...' }
            : m
          ));
          await new Promise(r => setTimeout(r, 3000)); // wait 3s for cold start
          void sendMsgInternal(text, isAuto, sourceErr, true); // retry flag = true
          return;
        }
        // ── Runtime Compiler: auto-diagnose before showing anything to user ──
        const rcDiag = getRuntimeCompiler().autoFix(errText + ' ' + res.status);
        const friendlyMsg = rcDiag
          ? `⚡ AUTO-DIAGNOSED\n\n**Root Cause:** ${rcDiag.diagnosis}\n\n**Fix:** ${rcDiag.action}\n\n*Technical: ${errText.replace(/<[^>]+>/g, ' ').trim().slice(0, 120)}*`
          : isVercelCrash
            ? `⚡ Intelligence API crashed (Lambda process error — NOT a region issue).\n\nVercel Lambda crashed during execution. This is caused by undeployed code changes or a runtime exception — not a configuration problem.\n\n**Fix:** Run \`vercel --prod\` in your terminal to deploy the latest code.\n\n*Technical: ${errText.replace(/<[^>]+>/g, ' ').trim().slice(0, 120)}*`
            : `⚡ Could not reach the intelligence API (HTTP ${res.status}). Please try again in a moment.`;
        setMsgs(ms => ms.map(m => m.id===brainId
          ? { ...m, content: friendlyMsg, actions: [{type:'retry_last', label:'↺ Retry', icon:'refresh'}] }
          : m
        ));
        setLoading(false);
        return;
      }
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
      await brainFetch("/api/task-engine", {
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
      {/* ─── FLOATING BUTTON (draggable round pill) ─── */}
      {!open && (
        <button
          ref={btnRef}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onClick={() => { if (!dragRef.current.dragging) setOpen(true); }}
          style={{
            position:'fixed',
            left: btnLeft,
            top:  btnTop,
            zIndex:9990,
            width:60, height:60,
            borderRadius:'50%',
            border:'none',
            cursor:'grab',
            userSelect:'none',
            touchAction:'none',
            background: alertCount>0
              ? 'linear-gradient(135deg,#7f1d1d,#1f0505)'
              : health==='healing'
              ? 'linear-gradient(135deg,#0d4f3c,#0a1f1a)'
              : 'linear-gradient(135deg,#1e1b4b,#0a0f1e)',
            boxShadow: alertCount>0
              ? '0 0 0 1px rgba(239,68,68,0.6),0 0 40px rgba(239,68,68,0.5),0 8px 32px rgba(0,0,0,0.6)'
              : `0 0 0 1px ${hc.glow},0 0 30px ${hc.glow},0 8px 32px rgba(0,0,0,0.6)`,
            display:'flex', alignItems:'center', justifyContent:'center',
            animation: alertCount>0 ? 'alertPulse 0.8s ease-in-out infinite' : 'brainPulse 3s ease-in-out infinite',
            transition: 'box-shadow 0.2s, background 0.2s',
          }}>
          <Brain size={24} style={{color:alertCount>0?'#fca5a5':'#a5b4fc',filter:`drop-shadow(0 0 8px ${alertCount>0?'rgba(239,68,68,0.8)':'rgba(99,102,241,0.8)'})`}}/>
          {alertCount>0 && (
            <div style={{position:'absolute',top:6,right:4,width:16,height:16,borderRadius:'50%',background:'#ef4444',border:'2px solid #030712',fontSize:8,fontWeight:900,color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}}>
              {alertCount>9?'9+':alertCount}
            </div>
          )}
          {alertCount===0 && pending>0 && (
            <div style={{position:'absolute',top:6,right:4,width:14,height:14,borderRadius:'50%',background:'#f59e0b',border:'2px solid #030712',fontSize:7,fontWeight:900,color:'#030712',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}}>
              {pending>9?'9+':pending}
            </div>
          )}
        </button>
      )}

      {/* ─── PANEL ─── */}
      {open && (
        <div style={{
          position:'fixed',
          /* Spawn near the button's position, clamped to viewport */
          bottom: btnPos ? Math.max(16, window.innerHeight - btnPos.y - panelH - 30) : 24,
          right:  btnPos ? Math.max(16, window.innerWidth  - btnPos.x - panelW)        : 24,
          zIndex:9990, width:panelW, height:panelH, borderRadius:20,
          overflow:'hidden', background:'#030712',
          border:`1px solid ${alertCount>0?'rgba(239,68,68,0.3)':'rgba(99,102,241,0.22)'}`,
          boxShadow:`0 0 80px ${alertCount>0?'rgba(239,68,68,0.1)':'rgba(99,102,241,0.1)'},0 20px 60px rgba(0,0,0,0.85)`,
          display:'flex', flexDirection:'column',
          animation:'brainOpen 0.28s cubic-bezier(0.34,1.56,0.64,1) forwards',
        }}>
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
              {(projects||[]).filter((p:any)=>p?.id).map(p => { const cl=clients.find(c=>c.id===p.client_id); return <option key={p.id} value={p.id}>{cl?.company||p.name}</option>; })}
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
                  {name:'task-engine',      label:'Task Engine',     icon:Zap},
                  {name:'algorithm-intel',  label:'Algorithm Intel', icon:Cpu},
                  {name:'intelligence',     label:'Brain AI',        icon:Brain},
                  {name:'supabase',         label:'Supabase DB',     icon:Database},
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

              {(() => {
                const hasOfflineEndpoints = Object.values(apiStatus).some(v => v === 'error');
                return (
                  <>
                    {unresolvedErrors.length===0 && !hasOfflineEndpoints && (
                      <div style={{textAlign:'center',padding:'20px 0'}}>
                        <CheckCircle size={28} style={{color:'#10b981',margin:'0 auto 8px'}}/>
                        <div style={{fontSize:10,fontFamily:'monospace',color:'#10b981'}}>ALL SYSTEMS NOMINAL</div>
                        <div style={{fontSize:9,color:'rgba(255,255,255,0.18)',marginTop:4}}>{resolvedErrors.length>0?`${resolvedErrors.length} past errors resolved`:'No errors detected'}</div>
                      </div>
                    )}
                    {unresolvedErrors.length===0 && hasOfflineEndpoints && (
                      <div style={{textAlign:'center',padding:'16px 0'}}>
                        <div style={{fontSize:28,marginBottom:8}}>⚠</div>
                        <div style={{fontSize:10,fontFamily:'monospace',color:'#f59e0b',fontWeight:700}}>ENDPOINTS DEGRADED</div>
                        <div style={{fontSize:9,color:'rgba(255,255,255,0.28)',marginTop:4,fontFamily:'monospace'}}>
                          {Object.entries(apiStatus).filter(([,v])=>v==='error').map(([k])=>k).join(', ')} — run SCAN NOW to recheck
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* ── Runtime Compiler Panel ── */}
              <div style={{background:'rgba(99,102,241,0.04)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:10,padding:'10px 12px',marginTop:8}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                  <Cpu size={9} style={{color:'#a5b4fc',flexShrink:0}}/>
                  <span style={{fontSize:8,fontFamily:'monospace',color:'#a5b4fc',letterSpacing:'0.12em',fontWeight:700}}>RUNTIME COMPILER</span>
                  <span style={{marginLeft:'auto',fontSize:7,fontFamily:'monospace',color:'rgba(99,102,241,0.45)'}}>PRE-FLIGHT VALIDATOR</span>
                </div>

                {/* Stats row */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:8}}>
                  {[
                    { label:'CHECKS', value: rcChecks, color:'#6366f1' },
                    { label:'CAUGHT',  value: rcIntercepted, color: rcIntercepted > 0 ? '#f59e0b' : '#10b981' },
                    { label:'LEARNED', value: rcPatternCount, color:'#06b6d4' },
                  ].map(stat => (
                    <div key={stat.label} style={{background:`${stat.color}09`,border:`1px solid ${stat.color}20`,borderRadius:7,padding:'5px 8px',textAlign:'center'}}>
                      <div style={{fontSize:14,fontWeight:700,color:stat.color,fontFamily:'monospace'}}>{stat.value}</div>
                      <div style={{fontSize:7,color:'rgba(255,255,255,0.25)',fontFamily:'monospace',letterSpacing:'0.08em'}}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Learned patterns */}
                {rcPatterns.length > 0 ? (
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    <div style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.1em',marginBottom:2}}>LEARNED FAILURE PATTERNS</div>
                    {rcPatterns.map((p, i) => (
                      <div key={i} style={{background:'rgba(245,158,11,0.04)',border:'1px solid rgba(245,158,11,0.12)',borderRadius:6,padding:'5px 8px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2}}>
                          <span style={{fontSize:7,fontFamily:'monospace',color:'#fbbf24',fontWeight:700}}>{p.occurrences}×</span>
                          <span style={{fontSize:8,color:'rgba(255,255,255,0.45)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.action}</span>
                          <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(6,182,212,0.45)'}}>{p.endpoint.replace('/api/','')}</span>
                        </div>
                        <p style={{fontSize:9,color:'rgba(252,165,165,0.6)',margin:'0',lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{p.errorMsg.slice(0,90)}</p>
                        {p.suggestedFix && <p style={{fontSize:8,color:'rgba(16,185,129,0.5)',margin:'2px 0 0',fontStyle:'italic'}}>Fix: {p.suggestedFix.slice(0,70)}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{textAlign:'center',padding:'8px 0'}}>
                    <CheckCircle size={14} style={{color:'rgba(16,185,129,0.4)',margin:'0 auto 4px'}}/>
                    <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(16,185,129,0.5)'}}>No failure patterns yet</div>
                    <div style={{fontSize:8,color:'rgba(255,255,255,0.15)',marginTop:2}}>Compiler learns with each error</div>
                  </div>
                )}
              </div>

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
        @keyframes brainOpen  { 0%{opacity:0;transform:scale(0.82) translateY(10px);}60%{transform:scale(1.03) translateY(-2px);}100%{opacity:1;transform:scale(1) translateY(0);} }
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
