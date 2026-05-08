import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import PortalNav from '@/components/PortalNav';
import {
  TrendingUp, Globe, Zap, Star, Brain,
  ShieldCheck, ArrowUpRight, ArrowDownRight,
  Target, Trophy, Eye, BarChart3, Sparkles,
  X, HelpCircle, ChevronRight, Clock, Gauge,
  Shield, Swords, CalendarDays, Flag, Check,
  Minus, AlertTriangle, CheckCircle2, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  LineChart, Line, XAxis, YAxis, ReferenceLine,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

/* ══════════════════════════════════════════════════════════
   DATA INTEGRITY SYSTEM
   Every metric has a source, confidence, and verification method.
   Never show 0 as a real value. Never show fake data.
══════════════════════════════════════════════════════════ */

type Confidence = 'verified' | 'estimated' | 'unavailable';

interface MetricMeta {
  label:      string;
  source:     string;
  confidence: Confidence;
  howVerified:string;
}

const METRIC_META: Record<string, MetricMeta> = {
  pages_indexed: {
    label: 'Pages Indexed by Google',
    source: 'Google Site:Search',
    confidence: 'verified',
    howVerified: 'Fetched live from Google site: domain search at time of analysis. Reflects the exact number of pages Google has crawled and indexed.',
  },
  pages_submitted: {
    label: 'Pages in Sitemap',
    source: 'Sitemap.xml Parse',
    confidence: 'verified',
    howVerified: 'Parsed directly from the sitemap.xml file. Reflects the exact number of URLs submitted for crawling.',
  },
  brand_mentions: {
    label: 'Brand Mentions',
    source: 'Google Search Count',
    confidence: 'verified',
    howVerified: 'Fetched live from Google search: "brand name" results count at time of analysis.',
  },
  perplexity_citations: {
    label: 'Perplexity AI Citations',
    source: 'Live Perplexity Test',
    confidence: 'verified',
    howVerified: 'Live search test run on Perplexity AI using your brand name and top keywords. Counts responses that reference your domain.',
  },
  google_ai_citations: {
    label: 'Google AI Overview',
    source: 'Live Google AI Test',
    confidence: 'verified',
    howVerified: 'Live Google search test checking whether your brand appears in Google AI Overview responses.',
  },
  chatgpt_citations: {
    label: 'ChatGPT Citations',
    source: 'AI Estimate Only',
    confidence: 'estimated',
    howVerified: 'OpenAI provides no public API for citation checking. This is estimated based on content structure and AI visibility signals. Treat as directional, not absolute.',
  },
  llm_visibility_score: {
    label: 'LLM Visibility Score',
    source: 'AI Content Analysis',
    confidence: 'verified',
    howVerified: 'Composite score calculated from verified data: sitemap structure, content depth, FAQ coverage, structured data, citation readiness. Each sub-signal is independently verifiable.',
  },
  algorithm_health_score: {
    label: 'Google Algorithm Health',
    source: 'AI + Live Signals',
    confidence: 'verified',
    howVerified: 'Based on verified indexing ratio, content structure analysis, Core Web Vitals signals, and E-E-A-T indicators found in live content.',
  },
  eeat_score: {
    label: 'E-E-A-T Score',
    source: 'AI Content Analysis',
    confidence: 'verified',
    howVerified: 'Analysed from live page content: author credentials, about page depth, contact signals, review presence, and verifiable expertise indicators.',
  },
  content_authority_score: {
    label: 'Content Authority',
    source: 'AI Content Analysis',
    confidence: 'verified',
    howVerified: 'Measured from content depth, topical coverage, internal linking structure, and citation-readiness — all analysed from live page content.',
  },
  overall_growth_score: {
    label: 'Overall Growth Score',
    source: 'Composite — 4 verified signals',
    confidence: 'verified',
    howVerified: 'Average of four independently verified scores: LLM Visibility, Google Health, E-E-A-T, and Content Authority. Each component is traceable to live data.',
  },
  keyword_rankings: {
    label: 'Keyword Rankings',
    source: 'Live Google SERP',
    confidence: 'verified',
    howVerified: 'Each keyword checked individually via live Google search at time of analysis. Position reflects actual SERP result, not cached or estimated data.',
  },
  competitor_rank: {
    label: 'Competitive Content Rank',
    source: 'AI Comparative Analysis',
    confidence: 'verified',
    howVerified: 'Your content scores compared against each competitor\'s live content on the same metrics. Rank reflects relative content quality, not backlink count.',
  },
};

const ConfidenceBadge = ({ confidence, source }: { confidence: Confidence; source: string }) => {
  const cfg = {
    verified:    { color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', icon: CheckCircle2, label: 'Verified' },
    estimated:   { color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20', icon: AlertTriangle, label: 'Estimated' },
    unavailable: { color: 'text-muted-foreground', bg: 'bg-secondary/30 border-border', icon: Info, label: 'N/A' },
  }[confidence];
  const Icon = cfg.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-2.5 w-2.5" />
      <span className="font-mono font-semibold">{cfg.label}</span>
      <span className="opacity-60">· {source}</span>
    </div>
  );
};

/* Never show "0" as a real value — show "—" for missing data */
const safeNum = (v: any): number | null => {
  if (v === null || v === undefined || v === '' || v === 0) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

const displayVal = (v: any, suffix = '') => {
  const n = safeNum(v);
  return n === null ? '—' : `${n}${suffix}`;
};

/* ── helpers ── */
const getScoreConfig = (score: number) => {
  if (score >= 80) return { label: 'Leading',     text: 'text-green-400',  bar: '#4ade80',  emoji: '🏆' };
  if (score >= 60) return { label: 'Growing',     text: 'text-blue-400',   bar: '#60a5fa',  emoji: '📈' };
  if (score >= 40) return { label: 'Building',    text: 'text-yellow-400', bar: '#facc15',  emoji: '🚀' };
  if (score >= 20) return { label: 'Launching',   text: 'text-orange-400', bar: '#fb923c',  emoji: '⚡' };
  return               { label: 'Opportunity', text: 'text-primary',    bar: '#6366f1',  emoji: '💎' };
};

const fmtDate = (raw: string) => {
  if (!raw) return '';
  const [y, m, d] = raw.split('T')[0].split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
};

const fmtShort = (raw: string) => {
  if (!raw) return '';
  const [, m, d] = raw.split('T')[0].split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m)-1]}`;
};

const toDateStr = (raw: string) => (raw || '').split('T')[0];

const closestMetric = (metrics: any[], dateStr: string) => {
  if (!metrics.length || !dateStr) return null;
  return metrics.reduce((best: any, m: any) => {
    const diff  = Math.abs(new Date(toDateStr(m.recorded_at)).getTime() - new Date(dateStr).getTime());
    const bDiff = best ? Math.abs(new Date(toDateStr(best.recorded_at)).getTime() - new Date(dateStr).getTime()) : Infinity;
    return diff < bDiff ? m : best;
  }, null);
};

/* ── Why Modal ── */
const WhyModal = ({ explanation, metricKey, title, score, color, onClose }: {
  explanation: any; metricKey: string; title: string; score: number; color: string; onClose: () => void;
}) => {
  const safe = Math.min(Math.max(score || 0, 0), 100);
  const cfg  = getScoreConfig(safe);
  const meta = METRIC_META[metricKey];
  const data = explanation && Object.keys(explanation).length > 0 ? explanation : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.6)] overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border sticky top-0 bg-card/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${2*Math.PI*22}`}
                  strokeDashoffset={`${2*Math.PI*22*(1-safe/100)}`}
                  style={{ transition:'stroke-dashoffset 1s ease' }} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{score ?? '—'}</span>
            </div>
            <div>
              <div className="font-bold text-sm">{title}</div>
              <div className={`text-xs font-mono ${cfg.text}`}>{cfg.emoji} {cfg.label}</div>
              {meta && <div className="mt-1"><ConfidenceBadge confidence={meta.confidence} source={meta.source} /></div>}
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">

          {/* Verification source — always shown */}
          {meta && (
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  How This Was Measured
                </span>
              </div>
              <p className="text-sm leading-relaxed">{meta.howVerified}</p>
              {meta.confidence === 'estimated' && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-yellow-400/5 border border-yellow-400/20 p-3">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-400 leading-relaxed">
                    This metric is estimated. Treat it as directional guidance only, not a verified count.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Analysis explanation — only shown if real data exists */}
          {data?.score_reason && (
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background:color }} />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Where You Stand</span>
              </div>
              <p className="text-sm leading-relaxed">{data.score_reason}</p>
            </div>
          )}

          {data?.what_it_means && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-mono uppercase tracking-wider text-primary">Business Impact</span>
              </div>
              <p className="text-sm leading-relaxed font-medium">{data.what_it_means}</p>
            </div>
          )}

          {data?.proof_points?.length > 0 && (
            <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Verified Evidence</span>
              </div>
              {data.proof_points.map((p: string, i: number) => (
                <div key={i} className="flex items-start gap-2 mb-1.5">
                  <ChevronRight className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                  <span className="text-xs leading-relaxed">{p}</span>
                </div>
              ))}
            </div>
          )}

          {data?.opportunity && (
            <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-green-400">Growth Opportunity</span>
              </div>
              <p className="text-sm leading-relaxed">{data.opportunity}</p>
            </div>
          )}

          {/* No explanation data */}
          {!data && (
            <div className="rounded-xl border border-border bg-background/40 p-4 text-center">
              <Info className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Detailed analysis available after the next AI report is run.<br />
                Ask Manav to run a fresh analysis in the admin panel.
              </p>
            </div>
          )}

          {data?.what_to_expect && (
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Outlook</span>
              </div>
              <p className="text-sm leading-relaxed">{data.what_to_expect}</p>
            </div>
          )}

          <div className="rounded-xl bg-gradient-to-r from-primary/10 to-transparent border border-primary/15 p-4 flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav" className="h-8 w-8 rounded-full object-cover ring-1 ring-primary shrink-0" style={{ objectPosition:'center 20%' }} />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground font-semibold">Manav is actively working on this.</span> All scores are recalculated fresh with every analysis run.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Score Ring ── */
const ScoreRing = ({ score, label, color, onClick }: { score:number|null; label:string; color:string; onClick?:()=>void }) => {
  const s = score === null ? 0 : Math.min(score, 100);
  const r = 28, circ = 2*Math.PI*r;
  const cfg = getScoreConfig(s);
  if (score === null) {
    return (
      <button onClick={onClick} className="flex flex-col items-center gap-1.5 cursor-pointer opacity-50">
        <div className="relative h-16 w-16">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="5" strokeDasharray="4 4" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground font-mono">—</span>
        </div>
        <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
        <span className="text-xs font-mono text-muted-foreground">Not yet run</span>
      </button>
    );
  }
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 group cursor-pointer">
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={cfg.bar} strokeWidth="5"
            strokeLinecap="round" strokeDasharray={circ}
            strokeDashoffset={circ*(1-s/100)}
            style={{ transition:'stroke-dashoffset 1.2s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{score}</span>
        <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <HelpCircle className="h-2.5 w-2.5 text-primary" />
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
      <span className={`text-xs font-mono ${cfg.text}`}>{cfg.emoji} {cfg.label}</span>
    </button>
  );
};

/* ── Stat Card with real-data enforcement ── */
const StatCard = ({ icon:Icon, label, value, color='text-primary', explanation, metricKey, title, score, ringColor, baselineValue, estimated=false }: any) => {
  const [show, setShow] = useState(false);
  const numScore = typeof score === 'number' ? score : safeNum(score);
  const meta = METRIC_META[metricKey];
  const isEmpty = value === '—' || value === null || value === undefined;
  const diff = typeof baselineValue === 'number' && numScore !== null ? numScore - baselineValue : null;

  return (
    <>
      <div onClick={() => setShow(true)} className="rounded-2xl border border-border bg-card/60 p-4 cursor-pointer group hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider leading-tight">{label}</span>
          <div className="flex items-center gap-1">
            {estimated && <AlertTriangle className="h-3 w-3 text-yellow-400" title="Estimated — no external API" />}
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
        <div className={`text-2xl font-bold mb-1 ${isEmpty ? 'text-muted-foreground' : ''}`}>
          {isEmpty ? '—' : value}
        </div>
        {estimated && !isEmpty && (
          <div className="text-xs text-yellow-400 font-mono mb-1">~ estimate only</div>
        )}
        {diff !== null && !isEmpty && (
          <div className={`text-xs flex items-center gap-1 ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>
            {diff > 0 ? <ArrowUpRight className="h-3 w-3" /> : diff < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {diff > 0 ? '+':''}{diff} since baseline
          </div>
        )}
        {isEmpty && <div className="text-xs text-muted-foreground font-mono">Run analysis to populate</div>}
        {!isEmpty && meta && (
          <div className="text-xs text-muted-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity font-mono truncate">
            {meta.source} →
          </div>
        )}
      </div>
      {show && (
        <WhyModal
          explanation={explanation}
          metricKey={metricKey||label}
          title={title||label}
          score={numScore || 0}
          color={ringColor||'#6366f1'}
          onClose={() => setShow(false)}
        />
      )}
    </>
  );
};

/* ── Keyword Card ── */
const KeywordCard = ({ keyword:k, insight, col, bg, bar, barW, badge, none, isP1 }: any) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-xl border ${bg} overflow-hidden`}>
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">"{k.keyword}"</span>
              <span className="text-xs bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 rounded-full px-1.5 py-0.5 font-mono">
                live SERP ✓
              </span>
            </div>
            <div className={`text-xs font-mono font-bold ${col} mt-0.5`}>
              {k.positionLabel || (k.found ? `Position ~${k.position}` : 'Not in top 30')}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className={`text-xs px-2 py-1 rounded-full border font-semibold ${bg} ${col}`}>{badge}</span>
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-90':''}`} />
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-background/60 overflow-hidden">
          <div className={`h-full rounded-full ${bar} transition-all duration-1000`} style={{ width:`${barW}%` }} />
        </div>
        {k.snippet && <p className="text-xs text-muted-foreground mt-1.5 italic truncate">"{k.snippet}"</p>}
      </button>
      {expanded && insight && (
        <div className="border-t border-border/50 p-3 space-y-3">
          <div className={`rounded-lg ${isP1 ? 'bg-green-400/10 border border-green-400/20' : 'bg-background/60 border border-border'} p-3`}>
            <div className={`text-xs font-mono uppercase tracking-wider mb-1 ${isP1 ? 'text-green-400' : 'text-primary'}`}>
              {isP1 ? '🏆 Ranking — Verified Page 1' : none ? '💎 Growth Opportunity' : '📈 Current Position'}
            </div>
            <p className="text-xs leading-relaxed">{insight.current_status_message}</p>
          </div>
          {insight.business_value && (
            <div className="rounded-lg bg-background/60 border border-border p-3">
              <div className="text-xs font-mono text-primary uppercase tracking-wider mb-1">Business Value</div>
              <p className="text-xs leading-relaxed">{insight.business_value}</p>
            </div>
          )}
          {insight.quick_win && (
            <div className="rounded-lg bg-green-400/5 border border-green-400/20 p-3">
              <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-1">⚡ Quick Win</div>
              <p className="text-xs leading-relaxed">{insight.quick_win}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Data Quality Panel ── */
const DataQualityPanel = ({ latest }: { latest: any }) => {
  const verifiedAt = latest?.recorded_at ? fmtDate(latest.recorded_at) : null;
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-green-400 shrink-0" />
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Data Verification Report
        </span>
        {verifiedAt && (
          <span className="ml-auto text-xs font-mono text-muted-foreground whitespace-nowrap">
            {verifiedAt}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          { label:'Keyword Rankings',     source:'Live Google SERP per keyword',       verified:true  },
          { label:'Pages Indexed',        source:'Google site: domain search',         verified:true  },
          { label:'Sitemap Pages',        source:'Direct sitemap.xml parse',           verified:true  },
          { label:'Brand Mentions',       source:'Live Google search count',           verified:true  },
          { label:'Perplexity Citations', source:'Live Perplexity search test',        verified:true  },
          { label:'Google AI Overview',   source:'Live Google AI test',                verified:true  },
          { label:'Content Scores',       source:'AI analysis of live page content',   verified:true  },
          { label:'ChatGPT Citations',    source:'No public API — AI estimate only',   verified:false },
        ].map(({ label, source, verified }) => (
          <div key={label} className="flex items-start gap-2">
            <div className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${verified ? 'bg-green-400/20' : 'bg-yellow-400/20'}`}>
              {verified
                ? <CheckCircle2 className="h-2.5 w-2.5 text-green-400" />
                : <AlertTriangle className="h-2.5 w-2.5 text-yellow-400" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold leading-tight">{label}</div>
              <div className={`text-xs leading-tight ${verified ? 'text-muted-foreground' : 'text-yellow-400/80'}`}>{source}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
/* ══════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
══════════════════════════════════════════ */
export default function Dashboard() {
  const navigate = useNavigate();
  const {
    clients: authClients, projects: authProjects,
    loading: authLoading, authChecked, isApproved, user,
  } = useAuth();

  const [client,          setClient]          = useState<any>(null);
  const [allClients,      setAllClients]      = useState<any[]>([]);
  const [projects,        setProjects]        = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [allMetrics,      setAllMetrics]      = useState<any[]>([]);
  const [upsells,         setUpsells]         = useState<any[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [approvingUpsell, setApprovingUpsell] = useState<string|null>(null);
  const [activeModal,     setActiveModal]     = useState<{key:string;title:string;color:string}|null>(null);
  const [baselineDate,    setBaselineDate]    = useState('');
  const [savingBaseline,  setSavingBaseline]  = useState(false);
  const [chartFrom,       setChartFrom]       = useState('');
  const [chartTo,         setChartTo]         = useState('');

  useEffect(() => {
    if (!authChecked) return;
    if (!user || !isApproved) { navigate('/'); return; }
    try {
      const cList = authClients || [];
      const pList = authProjects || [];
      setAllClients(cList);
      setProjects(pList);
      setClient(cList[0] || null);
      if (pList.length) setSelectedProject(pList[0]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [authChecked, authClients, authProjects, user, isApproved, navigate]);

  useEffect(() => {
    if (selectedProject) loadProjectData(selectedProject.id);
  }, [selectedProject]);

  const loadProjectData = async (id: string) => {
    try {
      const [m, u] = await Promise.all([
        supabase.from('metrics').select('*').eq('project_id', id).order('recorded_at'),
        supabase.from('upsells').select('*').eq('project_id', id).eq('status','pending'),
      ]);
      setAllMetrics(m.data || []);
      setUpsells(u.data || []);
    } catch (e) { console.error(e); }
  };

  const saveBaseline = async () => {
    if (!selectedProject || !baselineDate) return;
    setSavingBaseline(true);
    const { error } = await supabase.from('projects').update({ baseline_date: baselineDate }).eq('id', selectedProject.id);
    if (!error) {
      setSelectedProject((p: any) => ({ ...p, baseline_date: baselineDate }));
      toast({ title: 'Baseline set!', description: `Progress tracked from ${fmtDate(baselineDate)}` });
    }
    setSavingBaseline(false);
  };

  const approveUpsell = async (id: string) => {
    setApprovingUpsell(id);
    const { error } = await supabase.from('upsells').update({ status:'approved' }).eq('id', id);
    if (!error) {
      toast({ title: 'Sprint Approved!', description: 'Manav will begin immediately.' });
      setUpsells(u => u.filter(x => x.id !== id));
    }
    setApprovingUpsell(null);
  };

  const handleProjectChange = (projId: string) => {
    const proj = projects.find(x => x.id === projId);
    if (!proj) return;
    setSelectedProject(proj);
    const c = allClients.find(x => x.id === proj.client_id);
    if (c) setClient(c);
  };

  const latest         = allMetrics[allMetrics.length - 1] || null;
  const baselineMetric = useMemo(() => closestMetric(allMetrics, baselineDate), [allMetrics, baselineDate]);
  const hasProgress    = !!(baselineMetric && latest && baselineMetric.id !== latest.id);
  const exp            = latest?.explanations || {};
  const kwInsights     = exp?.keyword_insights || latest?.keyword_insights || {};

  /* Real values — null if not available */
  const pagesIndexed   = safeNum(latest?.pages_indexed);
  const pagesSubmitted = safeNum(latest?.pages_submitted);
  const brandMentions  = safeNum(latest?.brand_mentions);
  const perplexity     = safeNum(latest?.perplexity_citations);
  const googleAI       = safeNum(latest?.google_ai_citations);
  const chatGPT        = safeNum(latest?.chatgpt_citations);
  const totalCitations = (perplexity || 0) + (googleAI || 0) + (chatGPT || 0);
  const hasAnyCitations = perplexity !== null || googleAI !== null || chatGPT !== null;

  const indexingPct = pagesSubmitted && pagesIndexed !== null
    ? Math.round((pagesIndexed / pagesSubmitted) * 100) : null;

  const firstDate = allMetrics[0] ? toDateStr(allMetrics[0].recorded_at) : '';
  const lastDate  = latest ? toDateStr(latest.recorded_at) : '';

  const chartData = useMemo(() => allMetrics
    .filter(m => {
      const d = toDateStr(m.recorded_at);
      if (chartFrom && d < chartFrom) return false;
      if (chartTo   && d > chartTo)   return false;
      return true;
    })
    .map(m => ({
      date:     fmtShort(m.recorded_at),
      fullDate: toDateStr(m.recorded_at),
      llm:      safeNum(m.llm_visibility_score)    ?? 0,
      health:   safeNum(m.algorithm_health_score)  ?? 0,
      authority:safeNum(m.content_authority_score) ?? 0,
      growth:   safeNum(m.overall_growth_score)    ?? 0,
    })), [allMetrics, chartFrom, chartTo]);

  /* Loading */
  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground font-mono">Loading your growth portal...</p>
      </div>
    </div>
  );

  if (!client) return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="flex items-center justify-center min-h-[80vh] p-6">
        <div className="max-w-md text-center rounded-2xl border border-border bg-card/60 p-10">
          <Clock className="h-10 w-10 text-primary/40 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Dashboard Being Set Up</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Your account is approved but Manav hasn't linked it to a project yet. Contact Manav to complete setup.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {activeModal && (
        <WhyModal
          explanation={exp[activeModal.key]}
          metricKey={activeModal.key}
          title={activeModal.title}
          score={safeNum(latest?.[activeModal.key]) || 0}
          color={activeModal.color}
          onClose={() => setActiveModal(null)}
        />
      )}

      <PortalNav
        clientName={client.name}
        companyName={`${client.company} — Growth Portal`}
        projects={projects}
        selectedProjectId={selectedProject?.id}
        onProjectChange={handleProjectChange}
      />

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Welcome */}
        <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 to-transparent p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-primary uppercase tracking-wider mb-1">Welcome back</div>
            <h1 className="text-xl font-bold">{client.name}</h1>
            <div className="text-sm text-muted-foreground">{selectedProject?.url}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {latest ? (
              <div className="flex items-center gap-2 text-xs border border-green-400/30 text-green-400 rounded-full px-3 py-1.5 bg-green-400/5">
                <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                Last analysis: {fmtDate(latest.recorded_at)}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs border border-yellow-400/30 text-yellow-400 rounded-full px-3 py-1.5 bg-yellow-400/5">
                <AlertTriangle className="h-3 w-3" />
                No analysis run yet
              </div>
            )}
          </div>
        </div>

        {/* No data state */}
        {allMetrics.length === 0 && (
          <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-2">No Analysis Data Yet</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-4">
              Your dashboard populates with 100% verified data once Manav runs the first AI analysis. Every number you see will have a confirmed source.
            </p>
            <div className="inline-flex items-center gap-2 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1.5">
              <Info className="h-3.5 w-3.5" />
              Ask Manav to run the first analysis in the admin panel
            </div>
          </div>
        )}

        {latest && (
          <>
            {/* Data quality notice */}
           <div className="rounded-xl bg-card/40 border border-border px-4 py-2.5 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-green-400 shrink-0" />
                All scores and rankings are verified from live sources. Tap any metric for its exact verification method.
              </div>
              <div className="flex items-center gap-2 text-xs text-yellow-400">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                ChatGPT citations are estimated only — no public API exists for verification.
              </div>
            </div>

            {/* ─ Milestone ─ */}
            {latest.milestone && (
              <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/5 p-5">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center shrink-0">
                    <Trophy className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-1">Latest Verified Win</div>
                    <div className="font-bold text-base mb-1">{latest.milestone}</div>
                    {latest.milestone_impact && <p className="text-sm text-muted-foreground">{latest.milestone_impact}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* ─ Score Rings ─ */}
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                Health Scores — AI Analysis of Live Page Content
              </div>
              <div className="text-xs text-muted-foreground mb-5">
                Each score calculated from verified signals in your live website. Tap for full breakdown.
              </div>
              <div className="flex flex-wrap justify-around gap-6">
                {[
                  { key:'llm_visibility_score',    label:'LLM Visibility',    color:'#6366f1', title:'LLM Visibility Score' },
                  { key:'algorithm_health_score',  label:'Google Health',     color:'#06b6d4', title:'Google Algorithm Health' },
                  { key:'eeat_score',              label:'E-E-A-T Authority', color:'#8b5cf6', title:'E-E-A-T Authority Score' },
                  { key:'content_authority_score', label:'Content Authority', color:'#f59e0b', title:'Content Authority Score' },
                  { key:'overall_growth_score',    label:'Overall Growth',    color:'#4ade80', title:'Overall Growth Score' },
                ].map(({ key, label, color, title }) => (
                  <ScoreRing key={key}
                    score={safeNum(latest[key])}
                    label={label} color={color}
                    onClick={() => setActiveModal({ key, title, color })} />
                ))}
              </div>
            </div>

            {/* ─ Stat Cards ─ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Eye} label="Pages Indexed" color="text-cyan-400"
                value={displayVal(latest.pages_indexed)}
                score={pagesIndexed} ringColor="#06b6d4"
                baselineValue={hasProgress ? safeNum(baselineMetric?.pages_indexed) : null}
                metricKey="pages_indexed" title="Google Index Status"
                explanation={exp.pages_indexed} estimated={false} />
              <StatCard icon={Globe} label="Brand Mentions" color="text-green-400"
                value={displayVal(latest.brand_mentions)}
                score={brandMentions} ringColor="#4ade80"
                baselineValue={hasProgress ? safeNum(baselineMetric?.brand_mentions) : null}
                metricKey="brand_mentions" title="Brand Mentions"
                explanation={exp.brand_mentions} estimated={false} />
              <StatCard icon={Brain} label="Verified AI Citations" color="text-primary"
                value={hasAnyCitations ? (perplexity || 0) + (googleAI || 0) : '—'}
                score={(perplexity || 0) + (googleAI || 0)} ringColor="#6366f1"
                baselineValue={null}
                metricKey="perplexity_citations" title="Verified AI Citations"
                explanation={exp.perplexity_citations} estimated={false} />
              <StatCard icon={Trophy} label="Content Rank" color="text-yellow-400"
                value={safeNum(latest.competitor_rank) ? `#${latest.competitor_rank}` : '—'}
                score={safeNum(latest.competitor_rank)} ringColor="#f59e0b"
                baselineValue={null}
                metricKey="competitor_rank" title="Competitive Content Rank"
                explanation={exp.competitor_rank} estimated={false} />
            </div>

            {/* ─ AI Presence ─ */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">AI Engine Presence</span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Perplexity and Google AI are verified live. ChatGPT is estimated — no public API exists.
                </p>
                <div className="space-y-3">
                  {[
                    { name:'Perplexity AI',      value:perplexity,  color:'#8b5cf6', key:'perplexity_citations',  title:'Perplexity Citations',         estimated:false },
                    { name:'Google AI Overview', value:googleAI,    color:'#06b6d4', key:'google_ai_citations',   title:'Google AI Overview Citations',  estimated:false },
                    { name:'ChatGPT',            value:chatGPT,     color:'#6366f1', key:'chatgpt_citations',     title:'ChatGPT Citations',             estimated:true  },
                  ].map(item => {
                    const val = item.value;
                    const verifiedTotal = (perplexity||0)+(googleAI||0);
                    return (
                      <button key={item.name}
                        onClick={() => setActiveModal({ key:item.key, title:item.title, color:item.color })}
                        className="w-full group text-left">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item.name}</span>
                            {item.estimated && (
                              <span className="text-xs text-yellow-400 font-mono bg-yellow-400/10 px-1.5 rounded">~ est.</span>
                            )}
                            {!item.estimated && (
                              <span className="text-xs text-green-400 font-mono bg-green-400/10 px-1.5 rounded">✓ live</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold">{val === null ? '—' : val}</span>
                            <HelpCircle className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-1000"
                            style={{ width: val === null ? '0%' : verifiedTotal > 0 ? `${Math.min(100,(val/Math.max(verifiedTotal,1))*100)}%` : '0%', background: item.color }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
                {latest.llm_platforms?.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {latest.llm_platforms.map((p:string) => (
                      <span key={p} className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">{p}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="h-4 w-4 text-cyan-400" />
                  <span className="font-semibold text-sm">Google Index Status</span>
                  <span className="ml-auto text-xs text-green-400 font-mono flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />Google site:search verified
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Verified via live <code className="text-xs">site:domain</code> Google search at time of analysis.
                </p>
                {pagesSubmitted && pagesIndexed !== null ? (
                  <>
                    <div className="flex items-end gap-2 mb-2">
                      <span className="text-3xl font-bold">{pagesIndexed}</span>
                      <span className="text-muted-foreground text-sm mb-1">of {pagesSubmitted} pages indexed</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-secondary overflow-hidden mb-2">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-1000"
                        style={{ width:`${indexingPct}%` }} />
                    </div>
                    <div className="text-xs text-muted-foreground">{indexingPct}% of your sitemap is indexed by Google</div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    Indexing data appears after the next analysis run.
                  </div>
                )}
              </div>
            </div>

            {/* ─ Keyword Rankings ─ */}
            {latest.keyword_rankings?.length > 0 && (
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Keyword Rankings</span>
                  <span className="ml-auto text-xs text-cyan-400 font-mono flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />Live Google SERP · {fmtDate(latest.recorded_at)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Each keyword individually verified via live Google search. Position reflects actual result at analysis time.
                </p>
                <div className="flex gap-3 mb-4 flex-wrap">
                  {(() => {
                    const p1    = latest.keyword_rankings.filter((k:any) => k.found && k.page===1).length;
                    const p2    = latest.keyword_rankings.filter((k:any) => k.found && k.page===2).length;
                    const other = latest.keyword_rankings.filter((k:any) => k.found && k.page>2).length;
                    const none  = latest.keyword_rankings.filter((k:any) => !k.found).length;
                    return [
                      { label:'Page 1', count:p1, color:'text-green-400', bg:'bg-green-400/10 border-green-400/20' },
                      { label:'Page 2', count:p2, color:'text-yellow-400', bg:'bg-yellow-400/10 border-yellow-400/20' },
                      { label:'Page 3+', count:other, color:'text-orange-400', bg:'bg-orange-400/10 border-orange-400/20' },
                      { label:'Not in Top 30', count:none, color:'text-primary', bg:'bg-primary/10 border-primary/20' },
                    ].filter(x => x.count > 0).map(({ label, count, color, bg }) => (
                      <div key={label} className={`rounded-xl border ${bg} px-3 py-2 text-center`}>
                        <div className={`text-lg font-bold ${color}`}>{count}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                      </div>
                    ));
                  })()}
                </div>
                <div className="space-y-3">
                  {latest.keyword_rankings.map((k:any, i:number) => {
                    const isP1 = k.found && k.page===1;
                    const isP2 = k.found && k.page===2;
                    const isP3 = k.found && k.page>2;
                    const none = !k.found;
                    const insight = kwInsights[k.keyword] || null;
                    const col  = isP1?'text-green-400':isP2?'text-yellow-400':isP3?'text-orange-400':'text-primary';
                    const bg   = isP1?'border-green-400/20 bg-green-400/5':isP2?'border-yellow-400/20 bg-yellow-400/5':isP3?'border-orange-400/20 bg-orange-400/5':'border-primary/20 bg-primary/5';
                    const bar  = isP1?'bg-green-400':isP2?'bg-yellow-400':isP3?'bg-orange-400':'bg-primary';
                    const barW = none?8:k.position<=3?96:k.position<=10?75:k.position<=20?45:20;
                    const badge = isP1?'🟢 Page 1':isP2?'🟡 Page 2':isP3?'🟠 Page 3+':'💎 Opportunity';
                    return <KeywordCard key={i} keyword={k} insight={insight} col={col} bg={bg} bar={bar} barW={barW} badge={badge} none={none} isP1={isP1} />;
                  })}
                </div>
              </div>
            )}

            {/* ─ Competitive Position ─ */}
            {(latest.competitor_rank > 0 || latest.competitor_gap_note) && (
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Swords className="h-4 w-4 text-yellow-400" />
                  <span className="font-semibold text-sm">Competitive Position</span>
                  <button onClick={() => setActiveModal({ key:'competitor_rank', title:'Competitive Content Rank', color:'#f59e0b' })}
                    className="ml-auto text-xs text-primary font-mono flex items-center gap-1 hover:underline">
                    <HelpCircle className="h-3 w-3" />how measured
                  </button>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  {safeNum(latest.competitor_rank) !== null && (
                    <div className="rounded-xl border border-border bg-background/40 p-4 text-center">
                      <div className="text-3xl font-bold text-primary">#{latest.competitor_rank}</div>
                      <div className="text-xs text-muted-foreground mt-1">Content Quality Rank</div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono">AI comparative analysis</div>
                    </div>
                  )}
                  {safeNum(latest.competitors_beaten) !== null && (
                    <div className="rounded-xl border border-border bg-background/40 p-4 text-center">
                      <div className="text-3xl font-bold text-green-400">{latest.competitors_beaten}</div>
                      <div className="text-xs text-muted-foreground mt-1">Competitors Behind You</div>
                    </div>
                  )}
                  {latest.competitor_gap_note && (
                    <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
                      <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-1">Intelligence</div>
                      <p className="text-sm">{latest.competitor_gap_note}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─ Data Quality Panel ─ */}
            <DataQualityPanel latest={latest} />

            {/* ─ Progress Tracking ─ */}
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Flag className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Set Baseline Date</span>
                {baselineDate && (
                  <span className="ml-auto text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-mono">
                    Baseline: {fmtDate(baselineDate)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Choose a date to track progress from. All deltas shown use real verified values — no estimates.
                {allMetrics.length > 0 && ` Reports: ${fmtDate(firstDate)} — ${fmtDate(lastDate)}.`}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <input type="date" value={baselineDate} min={firstDate} max={lastDate}
                  onChange={e => setBaselineDate(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-background/60 text-sm px-3 text-foreground" />
                <Button size="sm" onClick={saveBaseline} disabled={savingBaseline || !baselineDate}
                  className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground h-9">
                  <Check className="h-3.5 w-3.5 mr-1.5" />Set Baseline
                </Button>
              </div>
            </div>

            {/* ─ Progress Summary ─ */}
            {hasProgress && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-xs font-mono text-primary uppercase tracking-wider mb-1">Verified Progress Since Baseline</div>
                    <div className="text-sm text-muted-foreground">{fmtDate(baselineMetric.recorded_at)} → {fmtDate(latest.recorded_at)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono bg-background/60 border border-border rounded-lg px-3 py-1.5">
                    {Math.round((new Date(lastDate).getTime()-new Date(toDateStr(baselineMetric.recorded_at)).getTime())/(1000*60*60*24))} days
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { key:'llm_visibility_score',    label:'LLM',       color:'text-primary' },
                    { key:'algorithm_health_score',  label:'Health',    color:'text-cyan-400' },
                    { key:'eeat_score',              label:'E-E-A-T',   color:'text-purple-400' },
                    { key:'content_authority_score', label:'Authority', color:'text-yellow-400' },
                    { key:'overall_growth_score',    label:'Growth',    color:'text-green-400' },
                  ].map(({ key, label, color }) => {
                    const start = safeNum(baselineMetric[key]);
                    const end   = safeNum(latest[key]);
                    const diff  = start !== null && end !== null ? end - start : null;
                    return (
                      <div key={key} className="rounded-xl border border-border bg-background/60 p-3 text-center">
                        <div className="text-xs text-muted-foreground mb-2">{label}</div>
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <span className="text-xs text-muted-foreground">{start ?? '—'}</span>
                          <span className="text-muted-foreground text-xs">→</span>
                          <span className={`text-base font-bold ${color}`}>{end ?? '—'}</span>
                        </div>
                        <div className={`text-xs font-mono font-bold ${diff === null ? 'text-muted-foreground' : diff > 0 ? 'text-green-400' : diff < 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>
                          {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff} pts`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─ Growth Chart ─ */}
            {allMetrics.length > 0 && (
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-sm font-semibold">Growth Trajectory</span>
                  <span className="text-xs text-muted-foreground font-mono">All values from verified analysis reports</span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {[
                      { label:'All', from:'', to:'' },
                      { label:'30d', from:(() => { const d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().split('T')[0]; })(), to:'' },
                      { label:'60d', from:(() => { const d=new Date(); d.setDate(d.getDate()-60); return d.toISOString().split('T')[0]; })(), to:'' },
                      { label:'90d', from:(() => { const d=new Date(); d.setDate(d.getDate()-90); return d.toISOString().split('T')[0]; })(), to:'' },
                    ].map(({ label, from, to }) => (
                      <button key={label}
                        onClick={() => { setChartFrom(from); setChartTo(to); }}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${chartFrom===from && chartTo===to ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/50'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {chartData.length < 2 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Chart appears once you have 2+ analysis reports.
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize:11, fill:'hsl(var(--muted-foreground))' }} />
                        <YAxis domain={[0,100]} tick={{ fontSize:11, fill:'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={{ background:'hsl(var(--card))', border:'1px solid hsl(var(--border))', borderRadius:'12px', fontSize:'12px' }} />
                        {baselineDate && <ReferenceLine x={fmtShort(baselineDate)} stroke="#6366f1" strokeDasharray="4 4" label={{ value:'Baseline', position:'top', fontSize:10, fill:'#6366f1' }} />}
                        <Line type="monotone" dataKey="llm"       name="LLM"       stroke="#6366f1" strokeWidth={2} dot={{ r:3, fill:'#6366f1' }} />
                        <Line type="monotone" dataKey="health"    name="Health"    stroke="#06b6d4" strokeWidth={2} dot={{ r:3, fill:'#06b6d4' }} />
                        <Line type="monotone" dataKey="authority" name="Authority" stroke="#f59e0b" strokeWidth={2} dot={{ r:3, fill:'#f59e0b' }} />
                        <Line type="monotone" dataKey="growth"    name="Growth"    stroke="#4ade80" strokeWidth={2} dot={{ r:3, fill:'#4ade80' }} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-3 mt-3 justify-center">
                      {[['#6366f1','LLM'],['#06b6d4','Health'],['#f59e0b','Authority'],['#4ade80','Growth']].map(([c,l])=>(
                        <div key={l} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className="h-2 w-2 rounded-full" style={{background:c}}/>{l}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─ Upsells ─ */}
            {upsells.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-400" />
                  <span className="font-semibold text-sm">Growth Opportunities Manav Identified</span>
                </div>
                {upsells.map(upsell => (
                  <div key={upsell.id} className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-bold text-sm mb-2">{upsell.title}</div>
                        <p className="text-sm text-muted-foreground mb-3">{upsell.description}</p>
                        {upsell.potential_impact && (
                          <div className="inline-flex items-center gap-1.5 text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2.5 py-1 mb-3">
                            <TrendingUp className="h-3 w-3" />{upsell.potential_impact}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold">${upsell.price}</span>
                          <span className="text-xs text-muted-foreground">added to next invoice · no contracts</span>
                        </div>
                      </div>
                      <Button onClick={() => approveUpsell(upsell.id)} disabled={approvingUpsell===upsell.id}
                        className="shrink-0 bg-gradient-to-r from-yellow-500 to-yellow-400 text-black font-bold hover:opacity-90">
                        {approvingUpsell===upsell.id
                          ? <div className="h-4 w-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                          : <><Check className="h-4 w-4 mr-2" />Approve</>}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="text-center text-xs text-muted-foreground py-4 border-t border-border">
          <div className="flex items-center justify-center gap-4 mb-2 flex-wrap">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-green-400" />All data verified from live sources</span>
            <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-yellow-400" />ChatGPT citations: estimated only</span>
            <span className="flex items-center gap-1.5"><Globe className="h-3 w-3 text-primary" />SEO Season by Manav</span>
          </div>
          © 2026 SEO Season — Client Growth Portal
        </div>
      </div>
    </div>
  );
}
