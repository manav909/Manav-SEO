import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import PortalNav from '@/components/PortalNav';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Layers,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
  FileText,
  Globe,
  Target,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  Trash2,
  Save,
  Brain,
  Star,
  Shield,
  BarChart3,
  Settings,
  Calendar,
  Sparkles,
  ChevronRight,
  Link2,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  ExternalLink,
  GitCompare,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  Zap,
} from 'lucide-react';

/* ─── types ─── */
type KCategory = 'goal'|'cms'|'access'|'technical'|'competitor'|'content'|'analytics'|'manual'|'crawl';
interface KField { id?: string; category: KCategory; field_key: string; field_value: string; source: string; source_name?: string; data_date?: string; notes?: string; }
interface DocRecord { id?: string; name: string; doc_type: string; raw_content?: string; extracted_data?: any; source_date?: string; file_size_kb?: number; created_at?: string; }

/* ─── Data requirement definitions ─── */
const DATA_REQUIREMENTS = [
  {
    category: 'goal' as KCategory, label: 'Campaign Goals', icon: Target, color: '#a78bfa',
    fields: [
      {key:'primary_goal',      label:'Primary Business Goal',      type:'select',  options:['Organic Traffic Growth','Conversion Rate Increase','Brand Visibility','AI/GEO Citations','Local SEO','E-commerce Revenue','Lead Generation'],  required:true},
      {key:'target_timeline',   label:'Target Timeline',            type:'select',  options:['3 months','6 months','12 months','Ongoing'],  required:true},
      {key:'success_metric',    label:'What Does Success Look Like?',type:'text',   placeholder:'e.g. 50% increase in organic traffic, ranking #3 for "best seo agency london"', required:true},
      {key:'current_baseline',  label:'Current Baseline Metric',    type:'text',   placeholder:'e.g. 2,400 organic sessions/month as of Jan 2024'},
      {key:'target_keywords',   label:'Top 3 Target Keywords',      type:'text',   placeholder:'keyword1, keyword2, keyword3'},
      {key:'budget_monthly',    label:'Monthly Retainer Budget',    type:'text',   placeholder:'e.g. £2,500/month'},
      {key:'reporting_cadence', label:'Client Reporting Frequency', type:'select', options:['Weekly','Bi-weekly','Monthly','Quarterly']},
    ]
  },
  {
    category: 'cms' as KCategory, label: 'CMS & Tech Stack', icon: Settings, color: '#06b6d4',
    fields: [
      {key:'cms',          label:'CMS / Platform',          type:'select', options:['WordPress','Shopify','Webflow','Wix','Squarespace','Magento','Drupal','Joomla','Next.js/Custom','Other'], required:true},
      {key:'cms_version',  label:'CMS Version',             type:'text',   placeholder:'e.g. WordPress 6.4.2'},
      {key:'theme',        label:'Theme / Template',        type:'text',   placeholder:'e.g. Divi, Astra, Custom'},
      {key:'seo_plugin',   label:'SEO Plugin',              type:'select', options:['Yoast SEO','Rank Math','All in One SEO','SEOPress','The SEO Framework','Shopify SEO','None','Other']},
      {key:'caching_plugin',label:'Caching Plugin/CDN',     type:'text',   placeholder:'e.g. WP Rocket, Cloudflare, W3 Total Cache'},
      {key:'hosting',      label:'Hosting Provider',        type:'text',   placeholder:'e.g. Kinsta, SiteGround, AWS, Vercel'},
      {key:'other_plugins',label:'Other Key Plugins',       type:'text',   placeholder:'Forms, analytics, e-commerce plugins (comma separated)'},
      {key:'pagespeed_mobile', label:'PageSpeed Mobile Score', type:'text', placeholder:'0-100 from PageSpeed Insights'},
      {key:'pagespeed_desktop',label:'PageSpeed Desktop Score',type:'text', placeholder:'0-100 from PageSpeed Insights'},
      {key:'ssl',          label:'SSL / HTTPS Status',      type:'select', options:['Active','Issues','Not installed']},
    ]
  },
  {
    category: 'access' as KCategory, label: 'Tool Access', icon: Shield, color: '#4ade80',
    fields: [
      {key:'gsc_access',        label:'Google Search Console Access',  type:'select', options:['Full Owner','View Only','Need to Request','Client will share data'], required:true},
      {key:'ga4_access',        label:'Google Analytics 4 Access',     type:'select', options:['Full Admin','View Only','Need to Request','Using UA only','None']},
      {key:'ahrefs_access',     label:'Ahrefs / Semrush Access',       type:'select', options:['Full Agency Access','Limited','Client Account','No Access']},
      {key:'screaming_frog',    label:'Screaming Frog Available',      type:'select', options:['Yes — licensed','Yes — free (500 limit)','No']},
      {key:'cms_admin',         label:'CMS Admin Access',              type:'select', options:['Full Admin','Editor Only','Need to Request','Via Client']},
      {key:'hosting_access',    label:'Hosting/Server Access',         type:'select', options:['Full cPanel/SSH','Via Plugin','Client only','Not needed']},
    ]
  },
  {
    category: 'analytics' as KCategory, label: 'Analytics Baseline', icon: BarChart3, color: '#facc15',
    fields: [
      {key:'organic_sessions_monthly',  label:'Monthly Organic Sessions (current)',  type:'text', placeholder:'e.g. 2,400', required:true},
      {key:'organic_sessions_baseline_date', label:'Baseline Date',                 type:'date', placeholder:''},
      {key:'top_landing_pages',         label:'Top 5 Landing Pages',                type:'text', placeholder:'URL1, URL2, URL3, URL4, URL5'},
      {key:'bounce_rate',               label:'Organic Bounce Rate',                type:'text', placeholder:'e.g. 68%'},
      {key:'avg_session_duration',      label:'Avg Session Duration (Organic)',     type:'text', placeholder:'e.g. 2m 14s'},
      {key:'conversions_monthly',       label:'Monthly Conversions (Goal)',         type:'text', placeholder:'e.g. 47 leads, 12 sales'},
      {key:'gsc_total_impressions',     label:'GSC Monthly Impressions',            type:'text', placeholder:'e.g. 84,000'},
      {key:'gsc_total_clicks',          label:'GSC Monthly Clicks',                 type:'text', placeholder:'e.g. 2,100'},
      {key:'gsc_avg_position',          label:'GSC Average Position',               type:'text', placeholder:'e.g. 18.4'},
    ]
  },
  {
    category: 'technical' as KCategory, label: 'Technical Baseline', icon: Settings, color: '#f472b6',
    fields: [
      {key:'pages_indexed',        label:'Pages Indexed (GSC)',      type:'text', placeholder:'e.g. 847 from GSC Coverage report'},
      {key:'pages_submitted',      label:'Pages Submitted (Sitemap)',type:'text', placeholder:'e.g. 1,200'},
      {key:'crawl_errors',         label:'Known Crawl Errors',       type:'text', placeholder:'e.g. 23 404s, 5 redirect chains'},
      {key:'broken_links',         label:'Broken Internal Globes',    type:'text', placeholder:'e.g. 12 broken links (from Screaming Frog)'},
      {key:'duplicate_content',    label:'Duplicate Content Issues', type:'text', placeholder:'e.g. 8 duplicate title tags'},
      {key:'schema_markup',        label:'Schema Markup Present',    type:'select', options:['Yes — comprehensive','Partial','None','Unknown']},
      {key:'sitemap_url',          label:'Sitemap URL',              type:'text', placeholder:'e.g. https://domain.com/sitemap.xml'},
      {key:'robots_txt',           label:'Robots.txt Status',        type:'select', options:['OK','Blocking important pages','Missing','Not checked']},
      {key:'canonical_issues',     label:'Canonical Tag Issues',     type:'text', placeholder:'e.g. None / 4 self-referencing / 12 missing'},
    ]
  },
  {
    category: 'competitor' as KCategory, label: 'Competitor Intelligence', icon: Star, color: '#fb923c',
    fields: [
      {key:'competitor_1',       label:'Main Competitor #1',           type:'text', placeholder:'domain.com'},
      {key:'competitor_1_dr',    label:'Competitor 1 Domain Rating',   type:'text', placeholder:'e.g. DR 45 (Ahrefs)'},
      {key:'competitor_2',       label:'Main Competitor #2',           type:'text', placeholder:'domain.com'},
      {key:'competitor_2_dr',    label:'Competitor 2 Domain Rating',   type:'text', placeholder:'e.g. DR 38'},
      {key:'competitor_3',       label:'Main Competitor #3',           type:'text', placeholder:'domain.com'},
      {key:'our_domain_rating',  label:'Our Domain Rating',            type:'text', placeholder:'e.g. DR 22 (Ahrefs)'},
      {key:'our_referring_domains',label:'Our Referring Domains',      type:'text', placeholder:'e.g. 184 (Ahrefs)'},
      {key:'content_gap_keywords',label:'Key Competitor Content Gaps', type:'text', placeholder:'Keywords they rank for that we do not'},
    ]
  },
];

/* ─── Upload instructions per doc type ─── */
const UPLOAD_GUIDES: Record<string, {steps:string[];exportPath:string;fileType:string}> = {
  'gsc_export': {
    exportPath: 'Google Search Console → Performance → Export (top right) → Download CSV',
    fileType: 'CSV',
    steps: [
      'Open Google Search Console (search.google.com/search-console)',
      'Select your property from the top left dropdown',
      'Click "Performance" in the left sidebar',
      'Set the date range to "Last 3 months" or custom',
      'Click "Queries" tab — check the box for Pages, Countries if needed',
      'Click the Download button (↓) in the top right of the data table',
      'Select "Export to CSV" — this downloads a .csv file',
      'Upload that CSV file here',
    ]
  },
  'screaming_frog': {
    exportPath: 'Screaming Frog → Bulk Export → All Inlinks or Internal (HTML)',
    fileType: 'CSV',
    steps: [
      'Open Screaming Frog SEO Spider',
      'Enter the site URL and press Start to crawl',
      'Wait for crawl to complete (may take minutes for large sites)',
      'Go to File → Export at the top menu',
      'Click "Bulk Export" → "All Inlinks" to get a full link map',
      'OR: Filter to Internal tab, select HTML — then File → Export',
      'Save as CSV and upload here',
    ]
  },
  'semrush_export': {
    exportPath: 'Semrush → Organic Research → Positions → Export',
    fileType: 'CSV / XLSX',
    steps: [
      'Log into Semrush.com',
      'Go to "Organic Research" in the left sidebar',
      'Enter your domain name and press Enter',
      'Click the "Positions" tab',
      'Click the Export button (top right of the data table)',
      'Choose "Export to CSV" or XLSX',
      'Upload the downloaded file here',
    ]
  },
  'ahrefs_export': {
    exportPath: 'Ahrefs → Site Explorer → Organic Keywords → Export',
    fileType: 'CSV',
    steps: [
      'Log into Ahrefs.com',
      'Go to Site Explorer',
      'Enter your domain and press Enter',
      'Click "Organic keywords" in the left sidebar',
      'Apply any filters you need (position, volume, etc.)',
      'Click the Export button (top right)',
      'Download CSV and upload here',
    ]
  },
  'ga4_export': {
    exportPath: 'GA4 → Reports → Acquisition → Traffic Acquisition → Download',
    fileType: 'CSV',
    steps: [
      'Open Google Analytics 4 (analytics.google.com)',
      'Select your property',
      'Go to Reports → Acquisition → Traffic Acquisition',
      'Set your date range (e.g. last 3 months)',
      'Click the Download icon (↓) at the top right',
      'Select "Download CSV"',
      'Upload the file here',
    ]
  },
  'pagespeed': {
    exportPath: 'PageSpeed Insights → Run analysis → Copy results',
    fileType: 'Manual copy-paste',
    steps: [
      'Go to pagespeed.web.dev',
      'Enter your website URL',
      'Click "Analyze"',
      'Wait for results (30-60 seconds)',
      'Note: Mobile Performance score, LCP, CLS, FID/INP values',
      'Scroll down to "Opportunities" — note any critical issues',
      'Copy all scores and paste into the Technical Baseline fields above',
    ]
  },
};

const DOC_TYPES = [
  {value:'gsc_export',      label:'Google Search Console Export'},
  {value:'screaming_frog',  label:'Screaming Frog Crawl Export'},
  {value:'semrush_export',  label:'Semrush Export'},
  {value:'ahrefs_export',   label:'Ahrefs Export'},
  {value:'ga4_export',      label:'Google Analytics 4 Export'},
  {value:'audit_report',    label:'Previous SEO Audit Report'},
  {value:'pagespeed',       label:'PageSpeed Insights Results'},
  {value:'other',           label:'Other SEO Document'},
];

/* ─── Safe fetch-JSON helper ───────────────────────────────────────
   Always checks res.ok. If response is not JSON (e.g. Vercel 500
   plain-text error), throws a clean Error instead of a parse crash.
─────────────────────────────────────────────────────────────────── */
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    // Try to parse error JSON, fall back to raw text
    try { const e = JSON.parse(text); throw new Error(e.error || e.message || text.slice(0,200)); }
    catch (parseErr) { if (parseErr instanceof SyntaxError) throw new Error(text.slice(0,200)); throw parseErr; }
  }
  try { return JSON.parse(text); }
  catch { throw new Error(`Invalid JSON from server: ${text.slice(0,120)}`); }
}

/* ─── Impact map: Data Room changes → affected Playground sections ─── */
const IMPACT_MAP: Record<string, string[]> = {
  goal:       ['Strategy & Canvas Blocks', 'KPI Forecast', 'Execution Pipeline'],
  analytics:  ['Strategy & Canvas Blocks', 'KPI Forecast', 'All Week Agendas'],
  technical:  ['Strategy & Canvas Blocks', 'Execution Pipeline', 'All Week Agendas'],
  competitor: ['Strategy & Canvas Blocks', 'Execution Pipeline'],
  cms:        ['Strategy & Canvas Blocks', 'Technical Quick Wins'],
  access:     ['Execution Pipeline'],
};


/* ════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════ */
/* ────────────────────────────────────────────────────────
   PageResultCard — readable per-URL result card
──────────────────────────────────────────────────────── */
function PageResultCard({ r, isOwn, isComp, onSelectOwn, onSelectComp, selectedOwn, selectedComp }: Record<string,any>) {
  const [expanded, setExpanded] = React.useState(false);
  const p = r.page_analysis;
  const borderColor = isOwn ? 'border-blue-400/30' : isComp ? 'border-orange-400/30' : 'border-border';
  const bgColor     = isOwn ? 'bg-blue-400/3'      : isComp ? 'bg-orange-400/3'      : 'bg-card/40';
  const label       = isOwn ? 'Your page'           : isComp ? 'Competitor'           : '';
  const labelColor  = isOwn ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' : isComp ? 'text-orange-400 bg-orange-400/10 border-orange-400/20' : '';

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} overflow-hidden transition-all`}>
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3 cursor-pointer" onClick={()=>setExpanded(e=>!e)}>
        <div className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${r.status===200?'bg-green-400':r.error?'bg-red-400':'bg-yellow-400'}`}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground truncate max-w-[300px]">{r.url.replace(/https?:\/\//,'')}</span>
            {label && <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${labelColor}`}>{label}</span>}
            {p?.data_confidence && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full border ${p.data_confidence==='high'?'border-green-400/20 text-green-400/70':p.data_confidence==='medium'?'border-yellow-400/20 text-yellow-400/70':'border-border text-muted-foreground'}`}>{p.data_confidence} confidence</span>
            )}
          </div>
          {p?.title_tag && <div className="text-sm font-medium text-foreground mt-0.5 truncate">{p.title_tag}</div>}
          {!p && r.error && <div className="text-xs text-red-400 mt-0.5">{r.error}</div>}
          {/* Issue + opp pills */}
          {p && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {p.issues?.filter((i:any)=>i.severity==='critical'||i.severity==='high').length>0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 border border-red-400/20">
                  {p.issues.filter((i:any)=>i.severity==='critical'||i.severity==='high').length} critical/high
                </span>
              )}
              {p.issues?.filter((i:any)=>i.severity==='medium'||i.severity==='low').length>0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
                  {p.issues.filter((i:any)=>i.severity==='medium'||i.severity==='low').length} med/low
                </span>
              )}
              {p.opportunities?.length>0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20">
                  {p.opportunities.length} opp{p.opportunities.length!==1?'s':''}
                </span>
              )}
              {p.geo_readiness?.perplexity_citation_likelihood && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${p.geo_readiness.perplexity_citation_likelihood==='high'?'border-primary/20 text-primary':p.geo_readiness.perplexity_citation_likelihood==='medium'?'border-yellow-400/20 text-yellow-400/70':'border-border text-muted-foreground'}`}>
                  GEO: {p.geo_readiness.perplexity_citation_likelihood}
                </span>
              )}
              {p.word_count>0 && <span className="text-xs text-muted-foreground/50">{p.word_count}w</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Select for comparison buttons */}
          <button onClick={e=>{e.stopPropagation();isComp?onSelectComp():onSelectOwn();}}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
              (isComp?selectedComp:selectedOwn)
                ?'border-primary bg-primary/15 text-primary'
                :'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
            }`}>
            {(isComp?selectedComp:selectedOwn)?'✓ Selected':'Select'}
          </button>
          <div className={`transition-transform duration-200 ${expanded?'rotate-180':''}`}>
            <ChevronDown size={14} className="text-muted-foreground"/>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && p && (
        <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-4">

          {/* On-page signals grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              {label:'H1',          val: p.h1,                              warn: !p.h1||p.h1==='Not found'},
              {label:'Meta desc',   val: p.meta_description,               warn: !p.meta_description||p.meta_description==='Not visible'},
              {label:'Canonical',   val: p.canonical_url,                  warn: p.canonical_url==='Missing'},
              {label:'Schema',      val: p.schema_types?.join(', ')||'None',warn: !p.schema_types?.length},
              {label:'Internal lnk',val: String(p.internal_links||0),      warn: (p.internal_links||0)<3},
              {label:'Images no alt',val:String(p.images_no_alt||0),       warn: (p.images_no_alt||0)>0},
            ].map((item,i)=>(
              <div key={i} className={`rounded-lg border px-2.5 py-2 ${item.warn?'border-red-400/20 bg-red-400/5':'border-border/50 bg-background/30'}`}>
                <div className="text-xs text-muted-foreground">{item.label}</div>
                <div className={`text-xs font-medium mt-0.5 truncate ${item.warn?'text-red-400/80':'text-foreground'}`} title={item.val}>{item.val||'—'}</div>
              </div>
            ))}
          </div>

          {/* H2 headings */}
          {p.h2s?.length>0 && (
            <div>
              <div className="text-xs font-mono text-muted-foreground uppercase mb-1.5">Heading structure</div>
              <div className="space-y-1">
                {p.h2s.slice(0,4).map((h:string,i:number)=>(
                  <div key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-muted-foreground/40 shrink-0 font-mono">H2</span>
                    <span className="truncate">{h}</span>
                  </div>
                ))}
                {p.h3s?.slice(0,2).map((h:string,i:number)=>(
                  <div key={i} className="text-xs text-muted-foreground flex gap-2 pl-4">
                    <span className="text-muted-foreground/40 shrink-0 font-mono">H3</span>
                    <span className="truncate">{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FAQs detected */}
          {p.faqs_detected?.length>0 && (
            <div>
              <div className="text-xs font-mono text-primary uppercase mb-1.5">FAQs detected ({p.faqs_detected.length})</div>
              {p.faqs_detected.slice(0,3).map((q:string,i:number)=>(
                <div key={i} className="text-xs text-muted-foreground flex gap-2 mb-1">
                  <span className="text-primary shrink-0">Q.</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          )}

          {/* CTAs */}
          {p.cta_elements?.length>0 && (
            <div>
              <div className="text-xs font-mono text-muted-foreground uppercase mb-1.5">CTAs</div>
              <div className="flex flex-wrap gap-1.5">
                {p.cta_elements.slice(0,6).map((cta:string,i:number)=>(
                  <span key={i} className="text-xs px-2 py-1 rounded-lg border border-border bg-background/60 text-muted-foreground">{cta}</span>
                ))}
              </div>
            </div>
          )}

          {/* GEO */}
          {p.geo_readiness && (
            <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="text-xs"><span className="text-muted-foreground">Perplexity likelihood:</span> <span className={p.geo_readiness.perplexity_citation_likelihood==='high'?'text-green-400':p.geo_readiness.perplexity_citation_likelihood==='medium'?'text-yellow-400':'text-red-400/70'}>{p.geo_readiness.perplexity_citation_likelihood||'?'}</span></div>
              <div className="text-xs"><span className="text-muted-foreground">Answer format:</span> {p.geo_readiness.answer_format_quality||'?'}</div>
              <div className="text-xs"><span className="text-muted-foreground">FAQ schema:</span> <span className={p.geo_readiness.has_faq_schema?'text-green-400':'text-red-400/70'}>{p.geo_readiness.has_faq_schema?'Present':'Missing'}</span></div>
              <div className="text-xs"><span className="text-muted-foreground">HowTo schema:</span> <span className={p.geo_readiness.has_howto_schema?'text-green-400':'text-muted-foreground'}>{p.geo_readiness.has_howto_schema?'Present':'—'}</span></div>
            </div>
          )}

          {/* Issues */}
          {p.issues?.length>0 && (
            <div>
              <div className="text-xs font-mono text-red-400 uppercase mb-1.5">Issues</div>
              <div className="space-y-1.5">
                {p.issues.map((issue:any,i:number)=>(
                  <div key={i} className={`text-xs rounded-lg px-2.5 py-1.5 ${issue.severity==='critical'?'bg-red-400/8 text-red-400':issue.severity==='high'?'bg-orange-400/8 text-orange-400':'bg-yellow-400/5 text-yellow-400'}`}>
                    <span className="font-semibold">[{issue.severity}]</span> {issue.detail||issue.type}
                    {issue.fix && <div className="text-muted-foreground mt-0.5">Fix: {issue.fix}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opportunities */}
          {p.opportunities?.length>0 && (
            <div>
              <div className="text-xs font-mono text-green-400 uppercase mb-1.5">Opportunities</div>
              <div className="space-y-1.5">
                {p.opportunities.map((opp:any,i:number)=>(
                  <div key={i} className="text-xs rounded-lg bg-green-400/5 border border-green-400/15 px-2.5 py-1.5">
                    <span className="font-medium">{opp.action}</span>
                    {opp.impact && <span className="text-muted-foreground ml-2">→ {opp.impact}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default function DataRoom() {
  const { clients, projects } = useAuth();
  const [selProjId, setSelProjId] = useState('');
  const [tab,       setTab]       = useState<'overview'|'goals'|'cms'|'access'|'analytics'|'technical'|'competitors'|'documents'>('overview');
  const [knowledge, setKnowledge] = useState<Record<string,Record<string,KField>>>({});
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [showGuide, setShowGuide] = useState<string|null>(null);
  const [pendingFields, setPendingFields] = useState<Record<string,string>>({});
  const [expandedDoc,   setExpandedDoc]   = useState<string|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType,  setUploadDocType]  = useState('gsc_export');
  const [uploadStatus,   setUploadStatus]   = useState<'idle'|'uploading'|'extracting'|'saving'|'done'|'error'>('idle');
  const [uploadError,    setUploadError]    = useState('');
  const [reExtractingId, setReExtractingId] = useState<string|null>(null);
  // URL Crawler state
  const [crawlHistory,      setCrawlHistory]      = useState<any[]>([]);  // past crawl sessions from DB
  const [crawlUrls,         setCrawlUrls]         = useState('');
  const [crawlRunning,      setCrawlRunning]       = useState(false);
  const [crawlResults,      setCrawlResults]       = useState<any>(null);
  const [crawlSaving,       setCrawlSaving]        = useState(false);
  const [crawlSaved,        setCrawlSaved]         = useState(false);
  const [crawlPreview,      setCrawlPreview]       = useState<Record<string,any>>({});
  // Comparison analysis state
  const [compareRunning,    setCompareRunning]     = useState(false);
  const [compareResult,     setCompareResult]      = useState<any>(null);
  const [compareTab,        setCompareTab]         = useState<'urls'|'compare'|'matrix'|'errors'|'opportunities'|'geo'|'confidence'|'gaps'|'cards'>('urls');
  // Comparison pair selection
  const [selectedOwnUrl,  setSelectedOwnUrl]   = useState('');
  const [selectedCompUrl, setSelectedCompUrl]  = useState('');
  // Card proposal approval state: cardIdx → 'pending'|'approved'|'merged'|'rejected'
  const [cardApprovals,     setCardApprovals]      = useState<Record<number,string>>({});
  const [pendingCards,      setPendingCards]       = useState<any[]>([]);  // approved cards waiting to go to canvas
  // Conflict notifications: fields where new value differs from existing stored value
  const [pendingConflicts, setPendingConflicts] = useState<{
    field: string; label: string; category: string;
    oldVal: string; newVal: string; source: string;
    impacts: string[];
  }[]>([]);
  const [showConflicts, setShowConflicts] = useState(false);

  const selProj  = projects.find(p => p.id === selProjId);
  const client   = clients.find(c => c.id === selProj?.client_id);

  useEffect(() => {
    if (!selProjId) { setKnowledge({}); setDocuments([]); setCrawlHistory([]); return; }
    loadData();
  }, [selProjId]);

  // Load crawl history when crawl tab opens
  useEffect(() => {
    if (tab === 'crawl' && selProjId && !crawlHistory.length) {
      loadCrawlHistory();
    }
  }, [tab, selProjId]);

  const loadData = async () => {
    const [kr, dr] = await Promise.all([
      supabase.from('project_knowledge').select('*').eq('project_id', selProjId),
      supabase.from('project_documents').select('*').eq('project_id', selProjId).order('created_at', {ascending:false}),
    ]);
    if (kr.data) {
      const kMap: Record<string,Record<string,KField>> = {};
      for (const row of kr.data) {
        if (!kMap[row.category]) kMap[row.category] = {};
        kMap[row.category][row.field_key] = row;
      }
      setKnowledge(kMap);
    }
    if (dr.data) setDocuments(dr.data);
  };

  const getField = (category: string, key: string): string =>
    knowledge[category]?.[key]?.field_value || '';

  const setFieldPending = (category: string, key: string, value: string) => {
    setPendingFields(prev => ({ ...prev, [`${category}.${key}`]: value }));
  };

  const getFieldDisplay = (category: string, key: string): string => {
    const pKey = `${category}.${key}`;
    if (pKey in pendingFields) return pendingFields[pKey];
    return getField(category, key);
  };

  const saveCategory = async (category: KCategory) => {
    if (!selProjId) return;
    setSaving(true);

    const toSave = Object.entries(pendingFields)
      .filter(([k]) => k.startsWith(`${category}.`))
      .map(([k, v]) => ({
        project_id:  selProjId,
        category,
        field_key:   k.replace(`${category}.`, ''),
        field_value: v,
        source:      'manual',
        updated_at:  new Date().toISOString(),
      }));

    if (!toSave.length) { setSaving(false); return; }

    // Detect conflicts (new value differs from existing stored value)
    const conflicts: typeof pendingConflicts = [];
    const catDef = DATA_REQUIREMENTS.find(c => c.category === category);

    for (const row of toSave) {
      const existing = knowledge[category]?.[row.field_key]?.field_value;
      const fieldDef = catDef?.fields.find(f => f.key === row.field_key);

      if (existing && existing !== row.field_value) {
        conflicts.push({
          field:    row.field_key,
          label:    fieldDef?.label || row.field_key,
          category,
          oldVal:   existing,
          newVal:   row.field_value,
          source:   'Manual entry',
          impacts:  IMPACT_MAP[category] || [],
        });
      }
    }

    // Save to DB
    for (const row of toSave) {
      await supabase.from('project_knowledge').upsert(row, { onConflict: 'project_id,category,field_key' });
      const existing = knowledge[category]?.[row.field_key]?.field_value;
      if (existing !== row.field_value) {
        fetch('/api/control', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            action: 'log_change', projectId: selProjId,
            payload: {
              changeType: 'data_room',
              fieldPath:  `${category}.${row.field_key}`,
              oldValue:   existing || null,
              newValue:   row.field_value,
              sourceName: 'Data Room manual entry',
            },
          }),
        }).catch(() => {});
      }
    }

    setPendingFields(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(`${category}.`)) delete next[k]; });
      return next;
    });

    await loadData();
    setSaving(false);

    if (conflicts.length > 0) {
      setPendingConflicts(conflicts);
      setShowConflicts(true);
      toast({
        title: `${conflicts.length} field${conflicts.length!==1?'s':''} updated — review changes`,
        description: 'These values replaced existing data. Check the impact summary.',
      });
    } else {
      toast({ title: 'Saved!' });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selProjId) return;

    // Reject binary files (xlsx/xls) before sending to API
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'xlsx' || ext === 'xls') {
      toast({
        title: 'Export as CSV first',
        description: 'XLSX/XLS files cannot be read as text. In Excel or Google Sheets: File → Download → CSV, then upload the .csv file.',
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadStatus('uploading');
    setUploadError('');

    try {
      const text = await file.text();
      const sizeKb = Math.round(file.size / 1024);

      // Step 1 — save raw document to DB
      const { data: docRow, error: insertErr } = await supabase.from('project_documents').insert({
        project_id:   selProjId,
        name:         file.name,
        doc_type:     uploadDocType,
        raw_content:  text.slice(0, 50000),
        file_size_kb: sizeKb,
        source_date:  new Date().toISOString().split('T')[0],
      }).select().single();

      if (insertErr || !docRow) {
        throw new Error(insertErr?.message || 'Document save failed');
      }

      // Step 2 — extract via API
      setUploadStatus('extracting');
      const res = await fetch('/api/analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:         'extract',
          content:        text.slice(0, 15000),
          fileName:       file.name,
          docType:        uploadDocType,
          projectContext: `${client?.company || ''} | ${selProj?.url || ''} | ${client?.industry || ''}`,
          siteUrl:        selProj?.url || '',
        }),
      });
      // Read response text first — works whether server returns JSON or plain text
      const rawText = await res.text();
      if (!res.ok) {
        // Try to parse structured error, fall back to raw text
        let errMsg = rawText.slice(0, 200);
        try {
          const errJson = JSON.parse(rawText);
          if (errJson.error === 'binary_file') {
            await supabase.from('project_documents').delete().eq('id', docRow.id);
            throw new Error(errJson.message || 'Binary file detected — please export as CSV');
          }
          errMsg = errJson.error || errJson.message || errMsg;
        } catch (pe) {
          if (!(pe instanceof SyntaxError)) throw pe; // re-throw non-parse errors
        }
        throw new Error(errMsg);
      }
      let extracted: any;
      try { extracted = JSON.parse(rawText); }
      catch { throw new Error(`Server returned invalid response: ${rawText.slice(0, 120)}`); }

      // Step 3 — save extracted data
      setUploadStatus('saving');
      if (extracted.success && extracted.extracted) {
        await supabase.from('project_documents').update({
          extracted_data: { ...extracted.extracted, ...(extracted.live_verification ? { live_verification: extracted.live_verification } : {}) },
        }).eq('id', docRow.id);

        // Upsert knowledge fields
        const savedFields: string[] = [];
        const newConflicts: typeof pendingConflicts = [];
        if (extracted.extracted.knowledge_fields?.length) {
          for (const kf of extracted.extracted.knowledge_fields) {
            if (!kf.key || !kf.value) continue;
            // Check for conflict before overwriting
            const catKnowledge = knowledge[kf.category || 'manual'];
            const existingField = catKnowledge?.[kf.key];
            if (existingField?.field_value && existingField.field_value !== String(kf.value)) {
              newConflicts.push({
                field:   kf.key,
                label:   kf.key.replace(/_/g,' '),
                category: kf.category || 'manual',
                oldVal:  existingField.field_value,
                newVal:  String(kf.value),
                source:  file.name,
                impacts: IMPACT_MAP[kf.category || ''] || [],
              });
            }
            const { error: upsertErr } = await supabase.from('project_knowledge').upsert({
              project_id:  selProjId,
              category:    kf.category || 'manual',
              field_key:   kf.key,
              field_value: String(kf.value),
              source:      'uploaded',
              source_name: file.name,
              data_date:   extracted.extracted.date_range || null,
              notes:       kf.notes || null,
              updated_at:  new Date().toISOString(),
            }, { onConflict: 'project_id,category,field_key' });
            if (!upsertErr) savedFields.push(kf.key);
          }
        }

        // Mark strategy as stale — new data means old analysis is outdated
        fetch('/api/control', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'log_change', projectId: selProjId,
            payload: {
              changeType: 'document',
              fieldPath:  `document.${uploadDocType}`,
              oldValue:   null,
              newValue:   file.name,
              sourceName: file.name,
              sourceDate: new Date().toISOString().split('T')[0],
            },
          }),
        }).catch(() => {});

        const count = savedFields.length;
        if (newConflicts.length > 0) {
          setPendingConflicts(newConflicts);
          setShowConflicts(true);
          toast({
            title: `Upload complete · ${newConflicts.length} data point${newConflicts.length!==1?'s':''} changed`,
            description: 'New values differ from your existing knowledge base — review the changes.',
          });
        } else {
          toast({
            title: 'Upload complete!',
            description: `${count} data point${count !== 1 ? 's' : ''} saved to your knowledge base.${count === 0 ? ' No matching fields found — check document type.' : ''}`,
          });
        }
      } else {
        toast({ title: `${file.name} saved`, description: 'Extraction returned no structured data.' });
      }

      await loadData();
      setUploadStatus('done');
      setTimeout(() => setUploadStatus('idle'), 3000);
    } catch (e: any) {
      setUploadStatus('error');
      setUploadError(e.message);
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
      setTimeout(() => { setUploadStatus('idle'); setUploadError(''); }, 5000);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ══ URL Crawler functions ══════════════════════════════════════════
  const loadCrawlHistory = async () => {
    if (!selProjId) return;
    try {
      const { data } = await supabase
        .from('project_documents')
        .select('id,name,doc_type,extracted_data,source_date,raw_content,created_at')
        .eq('project_id', selProjId)
        .eq('doc_type', 'crawl_report')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setCrawlHistory(data);
    } catch { /* silent */ }
  };

  const restoreCrawlSession = (session: any) => {
    // Restore URLs from the session
    const urls = session.raw_content || '';
    setCrawlUrls(urls);
    // Restore crawl results if available
    if (session.extracted_data?.results) {
      setCrawlResults({
        success: true,
        urls_crawled: session.extracted_data.results.length,
        results: session.extracted_data.results,
        aggregated_knowledge: session.extracted_data.knowledge_fields || [],
        cross_page_issues: session.extracted_data.cross_page_issues || [],
        cross_page_opportunities: session.extracted_data.cross_page_opportunities || [],
        crawled_at: session.source_date,
      });
    }
    setCrawlSaved(true);
    setCrawlSaving(false);
    setCompareResult(null);
    setCardApprovals({});
    toast({ title: 'Session restored', description: `Crawl from ${session.source_date} loaded. Click compare to re-analyse.` });
  };

  const previewUrl = async (url: string) => {
    const clean = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
    setCrawlPreview(p => ({ ...p, [clean]: { status: 'loading' } }));
    try {
      const res  = await fetch('/api/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview_url', url: clean }),
      });
      const data = await safeJson(res);
      setCrawlPreview(p => ({ ...p, [clean]: data }));
    } catch (e: any) {
      setCrawlPreview(p => ({ ...p, [clean]: { success: false, error: e.message } }));
    }
  };

  const runCrawl = async () => {
    if (!selProjId) return;
    // Build task hints from project canvas blocks for focused crawling
    let crawlTaskHints: string[] = [];
    try {
      const { data: projData } = await supabase.from('projects').select('playground_canvas').eq('id', selProjId).single();
      crawlTaskHints = (projData?.playground_canvas || [])
        .filter((b: any) => b.placed && b.status !== 'done' && b.status !== 'verified')
        .slice(0, 8)
        .map((b: any) => `[${b.type}] "${b.title}" — ${(b.content||'').slice(0,80)}`);
    } catch { /* silent */ }
    const lines = crawlUrls.split(String.fromCharCode(10)).map((l:string) => l.trim()).filter(Boolean);
    if (!lines.length) { toast({ title: 'Add at least one URL', variant: 'destructive' }); return; }

    setCrawlRunning(true);
    setCrawlResults(null);
    setCrawlSaved(false);

    try {
      const res  = await fetch('/api/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:         'crawl_urls',
          urls:            lines,
          projectContext: `${client?.company || ''} | ${selProj?.url || ''} | ${client?.industry || ''}`,
          projectId:       selProjId,
          // Pass active canvas card titles as task hints so crawl focuses on what matters
          taskHints:       crawlTaskHints,
        }),
      });
      const data = await safeJson(res);
      if (data.success) {
        setCrawlResults(data);
        toast({
          title:       `${data.urls_crawled} page${data.urls_crawled !== 1 ? 's' : ''} crawled`,
          description: `${data.aggregated_knowledge?.length || 0} data points extracted. Review and save to knowledge base.`,
        });
      } else {
        toast({ title: 'Crawl failed', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Crawl error', description: e.message, variant: 'destructive' });
    }
    setCrawlRunning(false);
  };

  const saveCrawlToKnowledge = async () => {
    if (!crawlResults || !selProjId) return;
    setCrawlSaving(true);

    const newConflicts: typeof pendingConflicts = [];
    const saved: string[] = [];

    for (const kf of (crawlResults.aggregated_knowledge || [])) {
      if (!kf.key || !kf.value) continue;

      // Detect conflict with existing value
      const existing = knowledge[kf.category]?.[kf.key];
      if (existing?.field_value && existing.field_value !== String(kf.value)) {
        newConflicts.push({
          field:    kf.key,
          label:    kf.key.replace(/_/g, ' '),
          category: kf.category,
          oldVal:   existing.field_value,
          newVal:   String(kf.value),
          source:   kf.source_url || 'URL Crawler',
          impacts:  IMPACT_MAP[kf.category] || [],
        });
      }

      await supabase.from('project_knowledge').upsert({
        project_id:  selProjId,
        category:    kf.category,
        field_key:   kf.key,
        field_value: String(kf.value),
        source:      'crawled',
        source_name: kf.source_url || 'URL Crawler',
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'project_id,category,field_key' });
      saved.push(kf.key);
    }

    // Also save crawl results as a document record
    await supabase.from('project_documents').insert({
      project_id:     selProjId,
      name:           `URL Crawl — ${new Date().toLocaleDateString()} (${crawlResults.urls_crawled} pages)`,
      doc_type:       'crawl_report',
      raw_content:    crawlUrls,
      extracted_data: {
        doc_summary:      `Crawled ${crawlResults.urls_crawled} URL${crawlResults.urls_crawled !== 1 ? 's' : ''}`,
        knowledge_fields: crawlResults.aggregated_knowledge || [],
        cross_page_issues:       crawlResults.cross_page_issues || [],
        cross_page_opportunities: crawlResults.cross_page_opportunities || [],
        results:          crawlResults.results || [],
      },
      file_size_kb:   0,
      source_date:    new Date().toISOString().split('T')[0],
    });

    // Mark strategy stale
    fetch('/api/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'log_change', projectId: selProjId,
        payload: { changeType: 'document', fieldPath: 'crawl', oldValue: null, newValue: `Crawl ${new Date().toLocaleDateString()}`, sourceName: 'URL Crawler' },
      }),
    }).catch(() => {});

    await loadData();
    setCrawlSaving(false);
    setCrawlSaved(true);

    if (newConflicts.length > 0) {
      setPendingConflicts(newConflicts);
      setShowConflicts(true);
    }

    toast({
      title: `${saved.length} data point${saved.length !== 1 ? 's' : ''} saved to knowledge base`,
      description: 'Strategy will show as stale — regenerate to apply the new data.',
    });
  };

  // ══ Run Manav Brain comparison analysis on crawl results ══
  const runCompareAnalysis = async () => {
    if (!crawlResults || !selProjId) return;
    setCompareRunning(true);
    setCompareResult(null);
    setCardApprovals({});

    try {
      // Fetch existing canvas blocks from project for merge detection
      const { data: projData } = await supabase
        .from('projects')
        .select('playground_canvas,playground_strategy')
        .eq('id', selProjId)
        .single();
      const existingBlocks = (projData?.playground_canvas || []) as any[];

      const res = await fetch('/api/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:         'compare_analysis',
          crawlResults,
          projectContext: `${client?.company || ''} | ${selProj?.url || ''} | ${client?.industry || ''}`,
          existingBlocks,
        }),
      });
      const data = await safeJson(res);
      if (data.success) {
        setCompareResult(data.analysis);
        setCompareTab('matrix');
        toast({ title: 'Manav Brain analysis complete', description: `${data.analysis?.card_proposals?.length || 0} card proposals ready for review.` });
      } else {
        toast({ title: 'Analysis failed', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Analysis error', description: e.message, variant: 'destructive' });
    }
    setCompareRunning(false);
  };

  // ══ Send approved cards to Playground canvas ══
  const sendApprovedCardsToCanvas = async () => {
    if (!pendingCards.length || !selProjId) return;
    try {
      // Fetch existing canvas to append
      const { data: projData } = await supabase.from('projects').select('playground_canvas').eq('id', selProjId).single();
      const existing = (projData?.playground_canvas || []) as any[];

      const uid = () => Math.random().toString(36).slice(2, 10);
      const normT = (t: string) => (t||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim().slice(0,40);
      const existingTitles = new Set(existing.map((b: any) => normT(b.title || '')));

      const newCards = pendingCards
        .filter(c => !existingTitles.has(normT(c.title)))
        .map(c => ({
          id:        uid(),
          type:      c.type || 'quick-win',
          title:     (c.title || 'Crawl insight').slice(0, 70),
          content:   `${c.content || ''}${c.data_basis ? `

Evidence: ${c.data_basis}` : ''}`,
          priority:  c.priority || 'medium',
          week:      c.week || 1,
          placed:    true,
          status:    'todo',
          color:     '#94a3b8',
          tags:      ['from-crawl', '✓ hard-data'],
          source:    'URL Crawler Analysis',
          effort:    c.effort || null,
          impact:    c.impact || null,
        }));

      if (!newCards.length) {
        toast({ title: 'No new cards to add', description: 'All approved cards already exist on the canvas.' });
        return;
      }

      await supabase.from('projects').update({
        playground_canvas: [...existing, ...newCards],
      }).eq('id', selProjId);

      // Mark strategy stale
      fetch('/api/control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log_change', projectId: selProjId, payload: { changeType: 'canvas', fieldPath: 'canvas.crawl_cards', oldValue: null, newValue: `${newCards.length} cards from URL crawler`, sourceName: 'URL Crawler' } }),
      }).catch(() => {});

      toast({ title: `${newCards.length} card${newCards.length !== 1 ? 's' : ''} sent to Playground canvas`, description: 'Open the Canvas tab to see them placed.' });
      setPendingCards([]);
      setCardApprovals({});
    } catch (e: any) {
      toast({ title: 'Failed to send cards', description: e.message, variant: 'destructive' });
    }
  };

  // Re-extract an already-uploaded document
  const reExtractDoc = async (doc: DocRecord) => {
    if (!doc.id || !doc.raw_content || !selProjId) {
      toast({ title: 'Cannot re-extract', description: 'No raw content stored for this document.', variant: 'destructive' });
      return;
    }
    setReExtractingId(doc.id);
    try {
      const res = await fetch('/api/analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:         'extract',
          content:        doc.raw_content.slice(0, 15000),
          fileName:       doc.name,
          docType:        doc.doc_type,
          siteUrl:        selProj?.url || '',
          skipLiveVerify: true,   // re-extraction: skip live verify to avoid function timeout
          projectContext: `${client?.company || ''} | ${selProj?.url || ''} | ${client?.industry || ''}`,
        }),
      });
      const extracted = await safeJson(res);
      if (extracted.success && extracted.extracted) {
        await supabase.from('project_documents').update({ extracted_data: extracted.extracted }).eq('id', doc.id);
        const savedFields: string[] = [];
        const newConflicts: typeof pendingConflicts = [];
        if (extracted.extracted.knowledge_fields?.length) {
          for (const kf of extracted.extracted.knowledge_fields) {
            if (!kf.key || !kf.value) continue;
            // Check for conflict before overwriting
            const catMap = knowledge[kf.category || 'manual'] || {};
            const existingField: KField | undefined = catMap[kf.key];
            if (existingField?.field_value && existingField.field_value !== String(kf.value)) {
              newConflicts.push({
                field:   kf.key,
                label:   kf.key.replace(/_/g,' '),
                category: kf.category || 'manual',
                oldVal:  existingField.field_value,
                newVal:  String(kf.value),
                source:  doc.name,
                impacts: IMPACT_MAP[kf.category || ''] || [],
              });
            }
            await supabase.from('project_knowledge').upsert({
              project_id:  selProjId,
              category:    kf.category || 'manual',
              field_key:   kf.key,
              field_value: String(kf.value),
              source:      'uploaded',
              source_name: doc.name,
              data_date:   extracted.extracted.date_range || null,
              updated_at:  new Date().toISOString(),
            }, { onConflict: 'project_id,category,field_key' });
            savedFields.push(kf.key);
          }
        }
        await loadData();
        if (newConflicts.length > 0) {
          setPendingConflicts(newConflicts);
          setShowConflicts(true);
          toast({ title: `${savedFields.length} fields updated · ${newConflicts.length} value changes found`, description: 'Review what changed in the conflict panel.' });
        } else {
          toast({ title: 'Re-extraction complete', description: `${savedFields.length} data points updated.` });
        }
      } else {
        toast({ title: 'Re-extraction failed', description: 'No structured data returned.', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Re-extraction error', description: e.message, variant: 'destructive' });
    }
    setReExtractingId(null);
  };


  const deleteDoc = async (id: string) => {
    await supabase.from('project_documents').delete().eq('id', id);
    setDocuments(prev => prev.filter(d => d.id !== id));
    toast({ title: 'Document deleted' });
  };

  /* ── Completeness score ── */
  const completeness = (() => {
    const required = DATA_REQUIREMENTS.flatMap(cat => cat.fields.filter(f => f.required).map(f => `${cat.category}.${f.key}`));
    const filled   = required.filter(k => {
      const [cat, key] = k.split('.');
      return getField(cat, key).length > 0;
    });
    return { score: Math.round((filled.length / required.length) * 100), filled: filled.length, total: required.length };
  })();

  const catHealth = (cat: KCategory) => {
    const catDef = DATA_REQUIREMENTS.find(c => c.category === cat);
    if (!catDef) return 0;
    const req = catDef.fields.filter(f => f.required);
    if (!req.length) return 100;
    const filled = req.filter(f => getField(cat, f.key).length > 0).length;
    return Math.round((filled / req.length) * 100);
  };

  const selProj2 = selProj;

  /* ── Field renderer ── */
  const renderField = (category: KCategory, field: typeof DATA_REQUIREMENTS[0]['fields'][0]) => {
    const val     = getFieldDisplay(category, field.key);
    const saved   = getField(category, field.key);
    const dirty   = `${category}.${field.key}` in pendingFields && pendingFields[`${category}.${field.key}`] !== saved;
    const source  = knowledge[category]?.[field.key]?.source_name || knowledge[category]?.[field.key]?.source;
    const dDate   = knowledge[category]?.[field.key]?.data_date;

    return (
      <div key={field.key} className="space-y-1">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-foreground">
            {field.label}
            {field.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {val && !dirty && (
            <div className="flex items-center gap-1 ml-auto">
              {source && <span className="text-xs text-muted-foreground font-mono">{source}</span>}
              {dDate  && <span className="text-xs text-muted-foreground font-mono">· {dDate}</span>}
              <CheckCircle2 size={11} className="text-green-400"/>
            </div>
          )}
          {dirty && <span className="text-xs text-yellow-400 ml-auto">unsaved</span>}
        </div>

        {field.type === 'select' ? (
          <select
            value={val}
            onChange={e => setFieldPending(category, field.key, e.target.value)}
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
          >
            <option value="">— Select —</option>
            {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : field.type === 'date' ? (
          <input
            type="date"
            value={val}
            onChange={e => setFieldPending(category, field.key, e.target.value)}
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
          />
        ) : (
          <input
            type="text"
            value={val}
            onChange={e => setFieldPending(category, field.key, e.target.value)}
            placeholder={field.placeholder || ''}
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
          />
        )}
      </div>
    );
  };

  /* ── Category form ── */
  const CategoryForm = ({ catKey }: { catKey: KCategory }) => {
    const catDef = DATA_REQUIREMENTS.find(c => c.category === catKey);
    if (!catDef) return null;
    const health = catHealth(catKey);
    const hasPending = Object.keys(pendingFields).some(k => k.startsWith(`${catKey}.`));

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <catDef.icon size={16} style={{color: catDef.color}}/>
            <span className="font-bold">{catDef.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${health===100?'bg-green-400/15 text-green-400':health>=50?'bg-yellow-400/15 text-yellow-400':'bg-red-400/15 text-red-400'}`}>
              {health}%
            </span>
          </div>
          {hasPending && (
            <Button size="sm" onClick={()=>saveCategory(catKey)} disabled={saving} className="h-8 bg-primary text-primary-foreground text-xs">
              {saving?<><RefreshCw size={11} className="animate-spin mr-1"/>Saving...</>:<><Save size={11} className="mr-1"/>Save Changes</>}
            </Button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {catDef.fields.map(f => renderField(catKey, f))}
        </div>
        {hasPending && (
          <Button onClick={()=>saveCategory(catKey)} disabled={saving} className="w-full bg-primary text-primary-foreground">
            {saving?'Saving...':'Save All Changes'}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav
        companyName={client?.company ? `${client.company} — Data Room` : 'Data Room'}
        projects={projects}
        selectedProjectId={selProjId}
        onProjectChange={setSelProjId}
      />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary"/>
              Client Knowledge Base
            </h1>
            <p className="text-sm text-muted-foreground">
              Everything Manav Brain knows about this client — hard data, tool access, goals, tech stack. Nothing gets lost. Everything feeds Manav Brain.
            </p>
          </div>
        </div>

        {/* Project picker */}
        {!selProjId && (
          <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
            <Layers className="h-12 w-12 text-primary/30 mx-auto mb-4"/>
            <h3 className="font-bold text-lg mb-3">Select a project to open its data room</h3>
            <select value={selProjId} onChange={e=>setSelProjId(e.target.value)} className="h-10 rounded-lg border border-border bg-background/60 text-sm px-4">
              <option value="">— Choose project —</option>
              {clients.map(c => {
                const cp = projects.filter(p => p.client_id === c.id);
                if (!cp.length) return null;
                return (
                  <optgroup key={c.id} label={`${c.name} — ${c.company}`}>
                    {cp.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>
        )}

        {selProjId && (
          <>
            {/* Tab nav */}
            <div className="flex gap-1 border-b border-border overflow-x-auto">
              {[
                {id:'overview',    label:'Overview',      icon:Layers   },
                {id:'goals',       label:'Goals',         icon:Target     },
                {id:'cms',         label:'CMS & Tech',    icon:Settings       },
                {id:'access',      label:'Tool Access',   icon:Shield     },
                {id:'analytics',   label:'Analytics',     icon:BarChart3  },
                {id:'technical',   label:'Technical',     icon:Settings   },
                {id:'competitors', label:'Competitors',   icon:Star       },
                {id:'documents',   label:'Documents',     icon:FileText   },
                {id:'crawl',       label:'URL Crawler',   icon:Globe      },
              ].map(({id,label,icon:Icon})=>{
                const catKey = id === 'overview' || id === 'documents' ? null :
                               id === 'goals' ? 'goal' : id === 'competitors' ? 'competitor' : id as KCategory;
                const health = catKey ? catHealth(catKey) : null;
                return (
                  <button key={id} onClick={()=>setTab(id as any)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab===id?'border-primary text-foreground':'border-transparent text-muted-foreground hover:text-foreground'}`}>
                    <Icon size={12}/>
                    {label}
                    {health !== null && (
                      <span className={`text-xs px-1 rounded font-mono ${health===100?'text-green-400':health>=50?'text-yellow-400':'text-red-400'}`}>
                        {health}%
                      </span>
                    )}
                    {id === 'documents' && documents.length > 0 && (
                      <span className="bg-primary/20 text-primary text-xs px-1 rounded">{documents.length}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <div className="space-y-5">
                {/* Completeness */}
                <div className="rounded-2xl border border-border bg-card/60 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-bold text-lg">{completeness.score}% Data Complete</div>
                      <div className="text-xs text-muted-foreground">{completeness.filled} of {completeness.total} required fields filled</div>
                    </div>
                    <div className={`text-3xl font-black ${completeness.score===100?'text-green-400':completeness.score>=70?'text-yellow-400':'text-red-400'}`}>
                      {completeness.score}%
                    </div>
                  </div>
                  <div className="h-3 rounded-full bg-secondary overflow-hidden mb-4">
                    <div className={`h-full transition-all rounded-full ${completeness.score===100?'bg-green-500':completeness.score>=70?'bg-yellow-500':'bg-red-500'}`} style={{width:`${completeness.score}%`}}/>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {DATA_REQUIREMENTS.map(cat => {
                      const h = catHealth(cat.category);
                      const Icon = cat.icon;
                      return (
                        <button key={cat.category}
                          onClick={()=>{
                            if (cat.category==='goal') setTab('goals');
                            else if (cat.category==='cms') setTab('cms');
                            else if (cat.category==='access') setTab('access');
                            else if (cat.category==='analytics') setTab('analytics');
                            else if (cat.category==='technical') setTab('technical');
                            else if (cat.category==='competitor') setTab('competitors');
                          }}
                          className="rounded-xl border border-border bg-background/60 p-3 text-left hover:border-primary/30 transition-colors">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Icon size={13} style={{color:cat.color}}/>
                            <span className="text-xs font-medium">{cat.label}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div style={{width:`${h}%`,background:cat.color,opacity:0.7}} className="h-full rounded-full transition-all"/>
                          </div>
                          <div className={`text-xs font-mono mt-1 ${h===100?'text-green-400':h>=50?'text-yellow-400':'text-red-400'}`}>{h}% filled</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Where data comes from */}
                <div className="rounded-2xl border border-border bg-card/60 p-5">
                  <div className="font-semibold mb-4 flex items-center gap-2"><AlertTriangle size={15} className="text-primary"/>Where Does Manav Brain Get Its Data?</div>
                  <div className="space-y-3 text-sm">
                    {[
                      {icon:BarChart3,color:'#34d399',label:'Metrics Dashboard', desc:'Scores you enter manually in the Metrics section — LLM Visibility, Algorithm Health, E-E-A-T, Content Authority, Overall Growth, Indexed Pages, Brand Mentions, Perplexity/ChatGPT citations.'},
                      {icon:FileText, color:'#60a5fa',label:'Audit Reports',     desc:'AI-generated reports from the Audit Tool. These are Claude\'s analysis of your site — not raw tool data. They inform strategy but are estimates without hard data.'},
                      {icon:Layers, color:'#a78bfa',label:'This Data Room',    desc:'Every field you fill here — goals, CMS, analytics baseline, technical state, competitor data. This is the hard fact-check layer that makes all AI output reliable.'},
                      {icon:Upload,   color:'#facc15',label:'Uploaded Documents',desc:'CSV/TXT exports from GSC, Screaming Frog, Semrush, Ahrefs, GA4. Claude extracts data automatically and stores it here for permanent access.'},
                      {icon:Globe,    color:'#f472b6',label:'Live Site Checks',  desc:'When you run verification checks or pipeline analysis, Claude fetches your live site via Jina AI to cross-reference what\'s actually published vs what\'s planned.'},
                    ].map(({icon:Icon,color,label,desc}) => (
                      <div key={label} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-background/40">
                        <Icon size={15} style={{color}} className="shrink-0 mt-0.5"/>
                        <div>
                          <div className="font-medium text-xs mb-0.5">{label}</div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Missing required data */}
                {completeness.score < 100 && (
                  <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-5">
                    <div className="font-semibold mb-3 flex items-center gap-2 text-red-400"><AlertTriangle size={15}/>Required Data Missing</div>
                    <div className="space-y-2">
                      {DATA_REQUIREMENTS.flatMap(cat =>
                        cat.fields.filter(f => f.required && !getField(cat.category, f.key)).map(f => (
                          <div key={`${cat.category}.${f.key}`} className="flex items-center gap-3 text-sm">
                            <X size={12} className="text-red-400 shrink-0"/>
                            <span className="text-muted-foreground">{cat.label} →</span>
                            <span className="font-medium">{f.label}</span>
                            <button onClick={()=>{
                              if (cat.category==='goal') setTab('goals');
                              else if (cat.category==='cms') setTab('cms');
                              else if (cat.category==='access') setTab('access');
                              else if (cat.category==='analytics') setTab('analytics');
                              else if (cat.category==='technical') setTab('technical');
                              else if (cat.category==='competitor') setTab('competitors');
                            }} className="ml-auto text-xs text-primary hover:underline">Fill now →</button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SECTION FORMS ── */}
            {tab === 'goals'       && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="goal"/></div>}
            {tab === 'cms'         && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="cms"/></div>}
            {tab === 'access'      && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="access"/></div>}
            {tab === 'analytics'   && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="analytics"/></div>}
            {tab === 'technical'   && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="technical"/></div>}
            {tab === 'competitors' && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="competitor"/></div>}

            {/* ── CRAWL TAB ── */}
            {tab === 'crawl' && (
              <div className="space-y-5">
                {/* Crawl history */}
                {crawlHistory.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-mono text-muted-foreground uppercase">Past crawl sessions</div>
                      <button onClick={loadCrawlHistory} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RefreshCw size={10}/>Refresh</button>
                    </div>
                    <div className="space-y-2">
                      {crawlHistory.map((session,i)=>(
                        <div key={session.id||i} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{session.name}</div>
                            <div className="text-xs text-muted-foreground">{session.source_date} · {session.extracted_data?.results?.length||0} pages crawled</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={()=>restoreCrawlSession(session)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-primary/25 bg-primary/8 text-primary hover:bg-primary/15 font-medium"
                            >
                              Restore
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-xl bg-cyan-400/15 border border-cyan-400/25 flex items-center justify-center shrink-0">
                      <Globe size={14} className="text-cyan-400"/>
                    </div>
                    <div>
                      <div className="font-bold text-sm">URL Crawler</div>
                      <p className="text-xs text-muted-foreground">
                        Fetches pages live, extracts every observable SEO signal, maps data to knowledge base, and boosts canvas card confidence with page-specific intelligence.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="font-semibold text-sm">Pages to crawl</div>
                      <div className="text-xs text-muted-foreground mt-0.5">One URL per line · max 10</div>
                    </div>
                    {/* Quick-add buttons from existing knowledge */}
                    <div className="flex flex-wrap gap-1.5">
                      {selProj?.url && (
                        <button
                          onClick={()=>setCrawlUrls(v=>{const u=selProj!.url;return v&&!v.includes(u)?v+String.fromCharCode(10)+u:v||u;})}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                        >
                          <Plus size={9}/>Project root
                        </button>
                      )}
                      {/* Landing pages from analytics knowledge */}
                      {getField('analytics','top_landing_pages') && getField('analytics','top_landing_pages').split(',').filter(Boolean).slice(0,5).map((url:string,i:number)=>{
                        const u = url.trim();
                        if (!u) return null;
                        const full = u.startsWith('http') ? u : (selProj?.url ? selProj.url.replace(/\/+$/,'')+'/'+u.replace(/^\/+/,'') : u);
                        return (
                          <button key={i}
                            onClick={()=>setCrawlUrls(v=>{return v&&!v.includes(full)?v+String.fromCharCode(10)+full:v||full;})}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors max-w-[160px]"
                            title={full}
                          >
                            <Plus size={9}/>
                            <span className="truncate">{full.replace(/https?:\/\/[^/]+/,'').slice(0,25)||'/'}</span>
                          </button>
                        );
                      })}
                      {/* Competitors from knowledge */}
                      {['competitor_1','competitor_2','competitor_3'].map(key=>{
                        const comp = getField('competitor', key);
                        if (!comp) return null;
                        const full = comp.startsWith('http') ? comp : `https://${comp}`;
                        return (
                          <button key={key}
                            onClick={()=>setCrawlUrls(v=>{return v&&!v.includes(full)?v+String.fromCharCode(10)+full:v||full;})}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-orange-400/20 text-orange-400/70 hover:text-orange-400 hover:border-orange-400/40 transition-colors max-w-[160px]"
                            title={`Competitor: ${full}`}
                          >
                            <Plus size={9}/>
                            <span className="truncate">{comp.replace(/https?:\/\//,'').slice(0,20)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <textarea
                    value={crawlUrls}
                    onChange={e=>{setCrawlUrls(e.target.value);setCrawlResults(null);setCrawlSaved(false);}}
                    placeholder={'https://yourdomain.com' + String.fromCharCode(10) + 'https://yourdomain.com/about' + String.fromCharCode(10) + 'https://yourdomain.com/services'}
                    rows={6}
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50 resize-none font-mono text-xs"
                  />

                  {crawlUrls.trim() && (
                    <div className="flex flex-wrap gap-2">
                      {crawlUrls.split(String.fromCharCode(10)).map(l=>l.trim()).filter(Boolean).slice(0,10).map((url,i)=>{
                        const clean = url.startsWith('http') ? url : `https://${url}`;
                        const pv = crawlPreview[clean];
                        return (
                          <div key={i} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-mono ${
                            pv?.status===200 ? 'border-green-400/30 bg-green-400/8 text-green-400' :
                            pv?.status==='loading' ? 'border-primary/30 bg-primary/8 text-primary' :
                            pv?.error ? 'border-red-400/30 bg-red-400/8 text-red-400' :
                            'border-border text-muted-foreground'
                          }`}>
                            {pv?.status==='loading' && <Loader2 size={9} className="animate-spin shrink-0"/>}
                            {pv?.status===200        && <CheckCircle size={9} className="shrink-0"/>}
                            {pv?.error               && <XCircle size={9} className="shrink-0"/>}
                            {!pv                     && <Globe size={9} className="shrink-0"/>}
                            <span className="truncate max-w-[180px]">{clean.replace('https://','')}</span>
                            {pv?.chars>0 && <span className="opacity-60">{Math.round(pv.chars/1000)}k</span>}
                          </div>
                        );
                      })}
                      {crawlUrls.split(String.fromCharCode(10)).filter(Boolean).length>10 && <div className="text-xs text-orange-400 px-2 py-1">First 10 only</div>}
                    </div>
                  )}

                  {/* Load all known URLs if textarea is empty */}
                  {!crawlUrls.trim() && (selProj?.url || getField('analytics','top_landing_pages') || getField('competitor','competitor_1')) && (
                    <button
                      onClick={()=>{
                        const parts: string[] = [];
                        if (selProj?.url && !parts.includes(selProj.url)) parts.push(selProj.url);
                        const pages = getField('analytics','top_landing_pages');
                        if (pages) pages.split(',').filter(Boolean).slice(0,4).forEach((u:string)=>{
                          const t = u.trim(); if (!t) return;
                          const full = t.startsWith('http')?t:(selProj?.url?selProj.url.replace(/\/+$/,'')+'/'+t.replace(/^\/+/,''):t);
                          if (!parts.includes(full)) parts.push(full);
                        });
                        ['competitor_1','competitor_2','competitor_3'].forEach((k:string)=>{
                          const c = getField('competitor',k);
                          if (c) { const full = c.startsWith('http')?c:`https://${c}`; if (!parts.includes(full)) parts.push(full); }
                        });
                        setCrawlUrls(parts.join(String.fromCharCode(10)));
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/30 bg-primary/8 text-primary text-sm font-medium hover:bg-primary/15 transition-colors w-full justify-center"
                    >
                      <Globe size={13}/>Load all known URLs (project + landing pages + competitors)
                    </button>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={runCrawl}
                      disabled={crawlRunning||!crawlUrls.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-sm disabled:opacity-50 transition-colors"
                    >
                      {crawlRunning
                        ? <><Loader2 size={14} className="animate-spin"/>Crawling…</>
                        : <><Globe size={14}/>Crawl {crawlUrls.split(String.fromCharCode(10)).filter(Boolean).slice(0,10).length||''} page{crawlUrls.split(String.fromCharCode(10)).filter(Boolean).length!==1?'s':''}</>}
                    </button>
                    {crawlUrls.trim()&&!crawlRunning && (
                      <button
                        onClick={()=>crawlUrls.split(String.fromCharCode(10)).map(l=>l.trim()).filter(Boolean).slice(0,10).forEach(u=>{const c=u.startsWith('http')?u:`https://${u}`;if(!crawlPreview[c])previewUrl(c);})}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >Test reachability</button>
                    )}
                    {crawlRunning && <span className="text-xs text-muted-foreground">Fetching live + analysing with Manav Brain… ~15–30s</span>}
                  </div>
                </div>

                {crawlResults && (() => {
                  // ── Classify each URL as own or competitor ──
                  const ownDomain = (selProj?.url||'').replace(/https?:\/\//,'').replace(/\/+$/,'').split('/')[0];
                  const compDomains = ['competitor_1','competitor_2','competitor_3']
                    .map(k => getField('competitor',k))
                    .filter(Boolean)
                    .map(c => c.replace(/https?:\/\//,'').replace(/\/+$/,'').split('/')[0]);

                  const isOwn  = (url: string) => ownDomain && url.includes(ownDomain);
                  const isComp = (url: string) => compDomains.some(d => url.includes(d));

                  const ownResults  = crawlResults.results?.filter((r:any) => isOwn(r.url))  || [];
                  const compResults = crawlResults.results?.filter((r:any) => isComp(r.url)) || [];
                  const otherResults= crawlResults.results?.filter((r:any) => !isOwn(r.url) && !isComp(r.url)) || [];

                  return (
                    <div className="space-y-5">

                      {/* ── Top bar ── */}
                      <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-border bg-card/60 px-5 py-4">
                        <div>
                          <div className="font-bold text-sm flex items-center gap-3">
                            {crawlResults.urls_crawled} pages crawled
                            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20">{ownResults.length} own</span>
                            {compResults.length>0 && <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-orange-400/10 text-orange-400 border border-orange-400/20">{compResults.length} competitor</span>}
                            {otherResults.length>0 && <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-border/60 text-muted-foreground">{otherResults.length} other</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {crawlResults.cross_page_issues?.length||0} issues · {crawlResults.cross_page_opportunities?.length||0} opportunities
                            {crawlResults.crawled_at && <span className="ml-2">· crawled {crawlResults.crawled_at?.split('T')[0]||''}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {!crawlSaved && crawlResults.aggregated_knowledge?.length>0 && (
                            <button onClick={saveCrawlToKnowledge} disabled={crawlSaving}
                              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/80 disabled:opacity-50">
                              {crawlSaving?<><Loader2 size={11} className="animate-spin"/>Saving…</>:<><Save size={11}/>Save {crawlResults.aggregated_knowledge.length} fields</>}
                            </button>
                          )}
                          {crawlSaved && <div className="flex items-center gap-1 text-green-400 text-xs font-medium"><CheckCircle size={11}/>Saved</div>}
                          <button onClick={runCompareAnalysis} disabled={compareRunning}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-50">
                            {compareRunning?<><Loader2 size={13} className="animate-spin"/>Analysing…</>:<><Brain size={13}/>Ask Manav Brain</>}
                          </button>
                        </div>
                      </div>

                      {/* ── Main tab bar ── */}
                      <div className="flex gap-0 border-b border-border overflow-x-auto">
                        {([
                          {id:'urls',     label:'Page Results',   badge:null},
                          {id:'compare',  label:'Side-by-Side',   badge: selectedOwnUrl&&selectedCompUrl?'●':null},
                          ...(compareResult?[
                            {id:'matrix',       label:'Matrix',         badge:null},
                            {id:'errors',       label:'Errors',         badge:compareResult.errors?.filter((e:any)=>e.severity==='critical'||e.severity==='high').length||null},
                            {id:'opportunities',label:'Opportunities',  badge:compareResult.opportunities?.length||null},
                            {id:'geo',          label:'GEO & AI',       badge:null},
                            {id:'confidence',   label:'Confidence',     badge:compareResult.confidence_boosters?.length||null},
                            {id:'gaps',         label:'Gaps',           badge:null},
                            {id:'cards',        label:'Cards',          badge:compareResult.card_proposals?.length||null},
                          ]:[]),
                        ].map((tab:any)=>(
                          <button key={tab.id} onClick={()=>setCompareTab(tab.id)}
                            className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                              compareTab===tab.id?'border-primary text-primary':'border-transparent text-muted-foreground hover:text-foreground'
                            }`}>
                            {tab.label}
                            {tab.badge!=null && <span className={`px-1.5 py-0.5 rounded-full text-xs font-mono ${compareTab===tab.id?'bg-primary/20 text-primary':'bg-secondary text-muted-foreground'}`}>{tab.badge}</span>}
                          </button>
                        )))}
                      </div>

                      {/* ════════ PAGE RESULTS TAB ════════ */}
                      {compareTab==='urls' && (
                        <div className="space-y-4">

                          {/* Own pages */}
                          {ownResults.length>0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="h-2.5 w-2.5 rounded-full bg-blue-400 shrink-0"/>
                                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Your pages ({ownResults.length})</span>
                              </div>
                              <div className="space-y-3">
                                {ownResults.map((r:any,i:number)=>(
                                  <PageResultCard key={i} r={r} isOwn={isOwn(r.url)} isComp={isComp(r.url)} onSelectOwn={():void=>{setSelectedOwnUrl(selectedOwnUrl===r.url?'':r.url);}} onSelectComp={():void=>{}} selectedOwn={selectedOwnUrl===r.url} selectedComp={false}/>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Competitor pages */}
                          {compResults.length>0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="h-2.5 w-2.5 rounded-full bg-orange-400 shrink-0"/>
                                <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">Competitor pages ({compResults.length})</span>
                              </div>
                              <div className="space-y-3">
                                {compResults.map((r:any,i:number)=>(
                                  <PageResultCard key={i} r={r} isOwn={isOwn(r.url)} isComp={isComp(r.url)} onSelectOwn={():void=>{}} onSelectComp={():void=>{setSelectedCompUrl(selectedCompUrl===r.url?'':r.url);}} selectedOwn={false} selectedComp={selectedCompUrl===r.url}/>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Other pages */}
                          {otherResults.length>0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 shrink-0"/>
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Other pages ({otherResults.length})</span>
                              </div>
                              <div className="space-y-3">
                                {otherResults.map((r:any,i:number)=>(
                                  <PageResultCard key={i} r={r} isOwn={isOwn(r.url)} isComp={isComp(r.url)} onSelectOwn={():void=>{setSelectedOwnUrl(selectedOwnUrl===r.url?'':r.url);}} onSelectComp={():void=>{setSelectedCompUrl(selectedCompUrl===r.url?'':r.url);}} selectedOwn={selectedOwnUrl===r.url} selectedComp={selectedCompUrl===r.url}/>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Prompt to compare */}
                          {(selectedOwnUrl || selectedCompUrl) && (
                            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3">
                              <div className="text-xs">
                                {selectedOwnUrl && <span className="text-blue-400 font-medium">Own: {selectedOwnUrl.replace(/https?:\/\//,'').slice(0,40)}</span>}
                                {selectedOwnUrl && selectedCompUrl && <span className="text-muted-foreground mx-2">vs</span>}
                                {selectedCompUrl && <span className="text-orange-400 font-medium">Comp: {selectedCompUrl.replace(/https?:\/\//,'').slice(0,40)}</span>}
                              </div>
                              <button onClick={()=>setCompareTab('compare')}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90">
                                <GitCompare size={11}/>Compare these →
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ════════ SIDE-BY-SIDE COMPARE TAB ════════ */}
                      {compareTab==='compare' && (
                        <div className="space-y-4">

                          {/* Pair selector */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-blue-400/25 bg-blue-400/5 p-3">
                              <div className="text-xs font-mono text-blue-400 uppercase mb-2">Your page</div>
                              <select value={selectedOwnUrl} onChange={e=>setSelectedOwnUrl(e.target.value)}
                                className="w-full text-xs h-8 px-2 rounded-lg border border-border bg-background/60 outline-none">
                                <option value="">Select your page…</option>
                                {crawlResults.results?.filter((r:any)=>r.page_analysis).map((r:any,i:number)=>(
                                  <option key={i} value={r.url}>{r.url.replace(/https?:\/\//,'').slice(0,45)}</option>
                                ))}
                              </select>
                            </div>
                            <div className="rounded-xl border border-orange-400/25 bg-orange-400/5 p-3">
                              <div className="text-xs font-mono text-orange-400 uppercase mb-2">Competitor page</div>
                              <select value={selectedCompUrl} onChange={e=>setSelectedCompUrl(e.target.value)}
                                className="w-full text-xs h-8 px-2 rounded-lg border border-border bg-background/60 outline-none">
                                <option value="">Select competitor page…</option>
                                {crawlResults.results?.filter((r:any)=>r.page_analysis).map((r:any,i:number)=>(
                                  <option key={i} value={r.url}>{r.url.replace(/https?:\/\//,'').slice(0,45)}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {selectedOwnUrl && selectedCompUrl ? (() => {
                            const ownPage  = crawlResults.results?.find((r:any)=>r.url===selectedOwnUrl)?.page_analysis;
                            const compPage = crawlResults.results?.find((r:any)=>r.url===selectedCompUrl)?.page_analysis;
                            if (!ownPage || !compPage) return <p className="text-sm text-muted-foreground">Selected pages have no analysis data.</p>;

                            const signals = [
                              {label:'Title',            own: ownPage.title_tag,           comp: compPage.title_tag,          ownMeta: `${ownPage.title_length||0}ch`, compMeta: `${compPage.title_length||0}ch`},
                              {label:'H1',               own: ownPage.h1,                  comp: compPage.h1},
                              {label:'Meta description', own: ownPage.meta_description,    comp: compPage.meta_description,   ownMeta: `${ownPage.meta_desc_length||0}ch`, compMeta: `${compPage.meta_desc_length||0}ch`},
                              {label:'Word count',       own: String(ownPage.word_count||0), comp: String(compPage.word_count||0)},
                              {label:'Schema types',     own: ownPage.schema_types?.join(', ')||'None', comp: compPage.schema_types?.join(', ')||'None'},
                              {label:'Content quality',  own: ownPage.content_quality||'?', comp: compPage.content_quality||'?'},
                              {label:'Internal links',   own: String(ownPage.internal_links||0), comp: String(compPage.internal_links||0)},
                              {label:'GEO readiness',    own: ownPage.geo_readiness?.answer_format_quality||'?', comp: compPage.geo_readiness?.answer_format_quality||'?'},
                              {label:'FAQ detected',     own: ownPage.faqs_detected?.length?`${ownPage.faqs_detected.length} FAQs`:'None', comp: compPage.faqs_detected?.length?`${compPage.faqs_detected.length} FAQs`:'None'},
                              {label:'CTAs',             own: ownPage.cta_elements?.join(', ')||'None', comp: compPage.cta_elements?.join(', ')||'None'},
                              {label:'Images no alt',    own: String(ownPage.images_no_alt||0), comp: String(compPage.images_no_alt||0)},
                            ];

                            const ownIssues  = ownPage.issues  || [];
                            const compIssues = compPage.issues || [];
                            const ownOpps    = ownPage.opportunities  || [];
                            const compOpps   = compPage.opportunities || [];

                            return (
                              <div className="space-y-4">
                                {/* Signal comparison table */}
                                <div className="rounded-2xl border border-border bg-card/40 overflow-hidden">
                                  <div className="grid grid-cols-3 bg-card/80 border-b border-border">
                                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">Signal</div>
                                    <div className="px-3 py-2 text-xs font-semibold text-blue-400 border-l border-border">
                                      Your page <span className="font-normal opacity-60">{selectedOwnUrl.replace(/https?:\/\//,'').slice(0,25)}</span>
                                    </div>
                                    <div className="px-3 py-2 text-xs font-semibold text-orange-400 border-l border-border">
                                      Competitor <span className="font-normal opacity-60">{selectedCompUrl.replace(/https?:\/\//,'').slice(0,25)}</span>
                                    </div>
                                  </div>
                                  {signals.map((s,i)=>{
                                    const ownBad  = /missing|none|not found|0$/i.test(s.own||'');
                                    const compBad = /missing|none|not found|0$/i.test(s.comp||'');
                                    const ownWin  = !ownBad && compBad;
                                    const compWin = ownBad && !compBad;
                                    return (
                                      <div key={i} className={`grid grid-cols-3 border-b border-border/40 ${i%2===0?'bg-background/20':''}`}>
                                        <div className="px-3 py-2.5 text-xs font-medium text-muted-foreground">{s.label}</div>
                                        <div className={`px-3 py-2.5 text-xs border-l border-border/40 ${ownWin?'text-green-400':ownBad?'text-red-400/70':'text-foreground'}`}>
                                          <span className="break-words">{s.own||'—'}</span>
                                          {s.ownMeta && <span className="ml-1 text-muted-foreground/50">({s.ownMeta})</span>}
                                          {ownWin && <TrendingUp size={10} className="inline ml-1 text-green-400"/>}
                                          {compWin && <TrendingDown size={10} className="inline ml-1 text-red-400"/>}
                                        </div>
                                        <div className={`px-3 py-2.5 text-xs border-l border-border/40 ${compWin?'text-green-400':compBad?'text-red-400/70':'text-foreground'}`}>
                                          <span className="break-words">{s.comp||'—'}</span>
                                          {s.compMeta && <span className="ml-1 text-muted-foreground/50">({s.compMeta})</span>}
                                          {compWin && <TrendingUp size={10} className="inline ml-1 text-green-400"/>}
                                          {ownWin && <TrendingDown size={10} className="inline ml-1 text-red-400"/>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Issues comparison */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="rounded-xl border border-border bg-card/40 p-3 space-y-2">
                                    <div className="text-xs font-mono text-red-400 uppercase">Your page issues ({ownIssues.length})</div>
                                    {ownIssues.length===0 && <p className="text-xs text-green-400">No issues detected</p>}
                                    {ownIssues.map((issue:any,j:number)=>(
                                      <div key={j} className={`text-xs rounded-lg px-2.5 py-1.5 ${issue.severity==='critical'?'bg-red-400/8 text-red-400':issue.severity==='high'?'bg-orange-400/8 text-orange-400':'bg-yellow-400/5 text-yellow-400'}`}>
                                        <span className="font-semibold">[{issue.severity}]</span> {issue.detail||issue.type}
                                        {issue.fix && <div className="text-muted-foreground mt-0.5">→ {issue.fix}</div>}
                                      </div>
                                    ))}
                                  </div>
                                  <div className="rounded-xl border border-orange-400/15 bg-card/40 p-3 space-y-2">
                                    <div className="text-xs font-mono text-orange-400 uppercase">Competitor issues ({compIssues.length})</div>
                                    {compIssues.length===0 && <p className="text-xs text-green-400">No issues detected</p>}
                                    {compIssues.map((issue:any,j:number)=>(
                                      <div key={j} className={`text-xs rounded-lg px-2.5 py-1.5 ${issue.severity==='critical'?'bg-red-400/8 text-red-400':issue.severity==='high'?'bg-orange-400/8 text-orange-400':'bg-yellow-400/5 text-yellow-400'}`}>
                                        <span className="font-semibold">[{issue.severity}]</span> {issue.detail||issue.type}
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Opportunities comparison */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="rounded-xl border border-border bg-card/40 p-3 space-y-2">
                                    <div className="text-xs font-mono text-green-400 uppercase">Your opportunities ({ownOpps.length})</div>
                                    {ownOpps.map((opp:any,j:number)=>(
                                      <div key={j} className="text-xs rounded-lg bg-green-400/5 border border-green-400/15 px-2.5 py-1.5">
                                        <div className="font-medium">{opp.action}</div>
                                        {opp.impact && <div className="text-muted-foreground">Impact: {opp.impact}</div>}
                                      </div>
                                    ))}
                                    {ownOpps.length===0 && <p className="text-xs text-muted-foreground">None identified</p>}
                                  </div>
                                  <div className="rounded-xl border border-orange-400/15 bg-card/40 p-3 space-y-2">
                                    <div className="text-xs font-mono text-orange-400 uppercase">Competitor advantages ({compOpps.length})</div>
                                    {compOpps.map((opp:any,j:number)=>(
                                      <div key={j} className="text-xs rounded-lg bg-orange-400/5 border border-orange-400/15 px-2.5 py-1.5">
                                        <div className="font-medium">{opp.action}</div>
                                        {opp.impact && <div className="text-muted-foreground">Their edge: {opp.impact}</div>}
                                      </div>
                                    ))}
                                    {compOpps.length===0 && <p className="text-xs text-muted-foreground">None detected</p>}
                                  </div>
                                </div>

                                {/* GEO comparison */}
                                {(ownPage.geo_readiness||compPage.geo_readiness) && (
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-3 space-y-1.5">
                                      <div className="text-xs font-mono text-blue-400 uppercase">Your GEO readiness</div>
                                      <div className="text-xs"><span className="text-muted-foreground">AI citation likelihood:</span> <span className={ownPage.geo_readiness?.perplexity_citation_likelihood==='high'?'text-green-400':ownPage.geo_readiness?.perplexity_citation_likelihood==='medium'?'text-yellow-400':'text-red-400'}>{ownPage.geo_readiness?.perplexity_citation_likelihood||'?'}</span></div>
                                      <div className="text-xs"><span className="text-muted-foreground">Answer format:</span> {ownPage.geo_readiness?.answer_format_quality||'?'}</div>
                                      <div className="text-xs"><span className="text-muted-foreground">FAQ schema:</span> <span className={ownPage.geo_readiness?.has_faq_schema?'text-green-400':'text-red-400/70'}>{ownPage.geo_readiness?.has_faq_schema?'Present':'Missing'}</span></div>
                                      {ownPage.faqs_detected?.length>0 && <div className="text-xs text-muted-foreground">{ownPage.faqs_detected.length} FAQ{ownPage.faqs_detected.length!==1?'s':''} detected</div>}
                                    </div>
                                    <div className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3 space-y-1.5">
                                      <div className="text-xs font-mono text-orange-400 uppercase">Competitor GEO readiness</div>
                                      <div className="text-xs"><span className="text-muted-foreground">AI citation likelihood:</span> <span className={compPage.geo_readiness?.perplexity_citation_likelihood==='high'?'text-green-400':compPage.geo_readiness?.perplexity_citation_likelihood==='medium'?'text-yellow-400':'text-red-400'}>{compPage.geo_readiness?.perplexity_citation_likelihood||'?'}</span></div>
                                      <div className="text-xs"><span className="text-muted-foreground">Answer format:</span> {compPage.geo_readiness?.answer_format_quality||'?'}</div>
                                      <div className="text-xs"><span className="text-muted-foreground">FAQ schema:</span> <span className={compPage.geo_readiness?.has_faq_schema?'text-green-400':'text-red-400/70'}>{compPage.geo_readiness?.has_faq_schema?'Present':'Missing'}</span></div>
                                      {compPage.faqs_detected?.length>0 && <div className="text-xs text-muted-foreground">{compPage.faqs_detected.length} FAQ{compPage.faqs_detected.length!==1?'s':''} detected</div>}
                                    </div>
                                  </div>
                                )}

                                {/* Ask Manav Brain for this pair */}
                                <button onClick={runCompareAnalysis} disabled={compareRunning}
                                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-50">
                                  {compareRunning?<><Loader2 size={14} className="animate-spin"/>Analysing pair…</>:<><Brain size={14}/>Ask Manav Brain to analyse this pair fully</>}
                                </button>
                              </div>
                            );
                          })() : (
                            <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                              Select a page from each column above to compare them side by side.
                              <div className="text-xs mt-2 opacity-60">Go to Page Results tab to select pages, or use the dropdowns above.</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ════════ MANAV BRAIN ANALYSIS TABS ════════ */}
                      {compareRunning && (
                        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-8 flex flex-col items-center gap-3">
                          <Loader2 size={28} className="animate-spin text-violet-400"/>
                          <div className="font-semibold text-sm">Manav Brain analysing…</div>
                          <div className="text-xs text-muted-foreground text-center max-w-sm">
                            Building comparison matrix · Identifying gaps · Ranking opportunities · Generating card proposals
                          </div>
                        </div>
                      )}

                      {compareResult && !compareRunning && (() => {
                        const tabContent: Record<string,React.ReactNode> = {};

                        /* MATRIX */
                        tabContent['matrix'] = compareResult.comparison_matrix ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-border">
                                  {(compareResult.comparison_matrix.headers||[]).map((h:string,i:number)=>(
                                    <th key={i} className={`text-left py-2 font-semibold ${i===0?'pr-4 text-muted-foreground w-36':'px-3 text-center text-muted-foreground/70'}`}>{h}</th>
                                  ))}
                                  <th className="px-2 text-center text-muted-foreground/50 text-xs">Best</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(compareResult.comparison_matrix.rows||[]).map((row:any,i:number)=>(
                                  <tr key={i} className="border-b border-border/40 hover:bg-secondary/10">
                                    <td className="py-2.5 pr-4 font-medium text-foreground">{row.signal}</td>
                                    {(row.values||[]).map((val:string,j:number)=>{
                                      const ok  = /^(ok|yes|present|good|comprehensive|high|✓)/i.test(val);
                                      const bad = /missing|none|no |not found|too |absent|broken|low|0\s*ch/i.test(val);
                                      return <td key={j} className={`px-3 py-2.5 text-center ${ok?'text-green-400':bad?'text-red-400':'text-muted-foreground'}`}>
                                        <span className="block max-w-[120px] truncate mx-auto" title={val}>{val}</span>
                                      </td>;
                                    })}
                                    <td className="px-2 py-2.5 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-xs ${row.verdict==='best'?'bg-green-400/10 text-green-400':row.verdict==='worst'?'bg-red-400/10 text-red-400':'bg-secondary text-muted-foreground'}`}>{row.verdict||'—'}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : <p className="text-sm text-muted-foreground">No matrix data.</p>;

                        /* ERRORS */
                        tabContent['errors'] = (
                          <div className="space-y-2">
                            {!compareResult.errors?.length && <p className="text-sm text-muted-foreground">No errors found.</p>}
                            {(compareResult.errors||[]).map((err:any,i:number)=>(
                              <div key={i} className={`rounded-xl border p-3 space-y-1.5 ${err.severity==='critical'?'border-red-400/30 bg-red-400/5':err.severity==='high'?'border-orange-400/25 bg-orange-400/5':'border-yellow-400/20 bg-yellow-400/5'}`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${err.severity==='critical'?'bg-red-400/20 text-red-400':err.severity==='high'?'bg-orange-400/20 text-orange-400':'bg-yellow-400/15 text-yellow-400'}`}>{err.severity}</span>
                                  <span className="text-sm font-semibold flex-1">{err.issue}</span>
                                  {err.quick_fix && <span className="text-xs px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20">Quick fix</span>}
                                </div>
                                <p className="text-xs text-muted-foreground">{err.fix}</p>
                                {err.affected_urls?.length>0 && <div className="flex flex-wrap gap-1">{err.affected_urls.map((u:string,j:number)=><span key={j} className="text-xs font-mono px-2 py-0.5 rounded-lg bg-background/60 border border-border/50 text-muted-foreground/60">{u.replace(/https?:\/\//,'').slice(0,35)}</span>)}</div>}
                              </div>
                            ))}
                          </div>
                        );

                        /* OPPORTUNITIES */
                        tabContent['opportunities'] = (
                          <div className="space-y-3">
                            {!compareResult.opportunities?.length && <p className="text-sm text-muted-foreground">No opportunities identified.</p>}
                            {(compareResult.opportunities||[]).map((opp:any,i:number)=>(
                              <div key={i} className="rounded-xl border border-border bg-background/60 p-4 space-y-2">
                                <div className="flex items-start gap-3">
                                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${opp.impact==='high'?'bg-green-400/15 text-green-400':opp.impact==='medium'?'bg-yellow-400/15 text-yellow-400':'bg-muted/30 text-muted-foreground'}`}>#{opp.rank||i+1}</div>
                                  <div className="flex-1">
                                    <div className="font-semibold text-sm">{opp.title}</div>
                                    <p className="text-xs text-muted-foreground mt-0.5">{opp.description}</p>
                                  </div>
                                  <div className="flex flex-col gap-1 items-end shrink-0">
                                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${opp.impact==='high'?'border-green-400/30 text-green-400':opp.impact==='medium'?'border-yellow-400/30 text-yellow-400':'border-border text-muted-foreground'}`}>{opp.impact} impact</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${opp.effort==='low'?'border-green-400/20 text-green-400/70':'border-border text-muted-foreground'}`}>{opp.effort} effort</span>
                                  </div>
                                </div>
                                {opp.data_basis && <p className="text-xs text-muted-foreground/60 pl-10 italic">Evidence: {opp.data_basis}</p>}
                              </div>
                            ))}
                          </div>
                        );

                        /* GEO */
                        tabContent['geo'] = (
                          <div className="space-y-4">
                            {!compareResult.geo_analysis ? <p className="text-sm text-muted-foreground">No GEO analysis — run Manav Brain analysis first.</p> : (
                              <>
                                <div className="flex items-center gap-3">
                                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center font-black shrink-0 ${parseInt(compareResult.geo_analysis.overall_geo_score)>=70?'bg-green-400/15 text-green-400':parseInt(compareResult.geo_analysis.overall_geo_score)>=40?'bg-yellow-400/15 text-yellow-400':'bg-red-400/15 text-red-400'}`}>{compareResult.geo_analysis.overall_geo_score}</div>
                                  <div><div className="font-semibold text-sm">GEO / AI Visibility Score</div><div className="text-xs text-muted-foreground">{compareResult.geo_analysis.entity_coverage}</div></div>
                                </div>
                                {compareResult.geo_analysis.faq_opportunities?.length>0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-xs font-mono text-orange-400 uppercase">FAQ schema opportunities</div>
                                    {compareResult.geo_analysis.faq_opportunities.map((f:string,i:number)=>(
                                      <div key={i} className="flex gap-2 text-xs rounded-lg bg-orange-400/5 border border-orange-400/15 px-3 py-2"><ArrowRight size={10} className="text-orange-400 mt-0.5 shrink-0"/><span>{f}</span></div>
                                    ))}
                                  </div>
                                )}
                                {compareResult.geo_analysis.direct_answer_gaps?.length>0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-xs font-mono text-muted-foreground uppercase">Questions to answer directly</div>
                                    {compareResult.geo_analysis.direct_answer_gaps.map((q:string,i:number)=>(
                                      <div key={i} className="text-xs text-muted-foreground flex gap-1.5"><span className="text-muted-foreground/40 shrink-0">·</span>{q}</div>
                                    ))}
                                  </div>
                                )}
                                {compareResult.geo_analysis.recommendations?.length>0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-xs font-mono text-primary uppercase">GEO recommendations</div>
                                    {compareResult.geo_analysis.recommendations.map((r:string,i:number)=>(
                                      <div key={i} className="flex gap-2 text-xs rounded-lg bg-primary/5 border border-primary/15 px-3 py-2"><span className="text-primary font-bold shrink-0">{i+1}.</span><span>{r}</span></div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );

                        /* CONFIDENCE */
                        tabContent['confidence'] = (
                          <div className="space-y-3">
                            <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3 text-xs text-muted-foreground">Existing canvas cards where this crawl data improves execution confidence.</div>
                            {!compareResult.confidence_boosters?.length && <p className="text-sm text-muted-foreground">No confidence improvements found. Crawl pages relevant to your active canvas tasks.</p>}
                            {(compareResult.confidence_boosters||[]).map((boost:any,i:number)=>(
                              <div key={i} className="rounded-xl border border-violet-400/20 bg-card/60 p-4 space-y-2">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1"><div className="font-semibold text-sm">{boost.card_title}</div><div className="text-xs text-muted-foreground">{boost.new_data_available}</div></div>
                                  <div className="text-sm font-black text-violet-400 shrink-0">{boost.confidence_increase}</div>
                                </div>
                                <div className="flex gap-2 text-xs rounded-lg bg-violet-400/5 border border-violet-400/15 px-3 py-2"><ArrowRight size={10} className="text-violet-400 mt-0.5 shrink-0"/><span className="text-muted-foreground">{boost.action}</span></div>
                              </div>
                            ))}
                          </div>
                        );

                        /* GAPS */
                        tabContent['gaps'] = (
                          <div className="space-y-5">
                            {compareResult.competitive_gaps?.length>0 && (
                              <div>
                                <div className="text-xs font-mono text-orange-400 uppercase mb-2 flex items-center gap-2"><AlertTriangle size={11}/>Competitive gaps</div>
                                {compareResult.competitive_gaps.map((gap:any,i:number)=>(
                                  <div key={i} className="rounded-xl border border-orange-400/15 bg-orange-400/5 p-3 space-y-1.5 mb-2">
                                    <div className="flex items-start gap-2">
                                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${gap.priority==='high'?'bg-red-400/20 text-red-400':'bg-orange-400/20 text-orange-400'}`}>{gap.priority}</span>
                                      <div><div className="font-medium text-sm">{gap.gap}</div><p className="text-xs text-muted-foreground">{gap.evidence}</p></div>
                                    </div>
                                    <div className="flex gap-1.5 pl-10"><ArrowRight size={10} className="text-primary mt-0.5 shrink-0"/><span className="text-xs text-primary font-medium">{gap.action}</span></div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {compareResult.advantages?.length>0 && (
                              <div>
                                <div className="text-xs font-mono text-green-400 uppercase mb-2 flex items-center gap-2"><CheckCircle size={11}/>Your advantages</div>
                                {compareResult.advantages.map((adv:any,i:number)=>(
                                  <div key={i} className="rounded-xl border border-green-400/15 bg-green-400/5 p-3 space-y-1.5 mb-2">
                                    <div className="font-medium text-sm text-green-400">{adv.advantage}</div>
                                    {adv.how_to_leverage && <div className="flex gap-1.5"><ArrowRight size={10} className="text-green-400/70 mt-0.5 shrink-0"/><span className="text-xs text-muted-foreground">{adv.how_to_leverage}</span></div>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );

                        /* CARDS */
                        tabContent['cards'] = (
                          <div className="space-y-4">
                            {pendingCards.length>0 && (
                              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/8 px-4 py-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 size={14}/>{pendingCards.length} card{pendingCards.length!==1?'s':''} approved</div>
                                <button onClick={sendApprovedCardsToCanvas} className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90"><Sparkles size={11}/>Send to Canvas</button>
                              </div>
                            )}
                            {!compareResult.card_proposals?.length && <p className="text-sm text-muted-foreground">No card proposals. Run compare analysis with more pages.</p>}
                            {(compareResult.card_proposals||[]).map((card:any,i:number)=>{
                              const approval = cardApprovals[i];
                              return (
                                <div key={i} className={`rounded-xl border p-4 space-y-3 transition-all ${approval==='approved'?'border-green-400/30 bg-green-400/5':approval==='rejected'?'border-border/30 opacity-50':approval==='merged'?'border-yellow-400/30 bg-yellow-400/5':'border-border bg-background/60'}`}>
                                  <div className="flex items-start gap-3">
                                    <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground shrink-0 font-mono">{card.type}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm">{card.title}</div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs text-muted-foreground">Wk {card.week===5?'BL':card.week}</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${card.priority==='high'?'border-red-400/30 text-red-400':card.priority==='medium'?'border-yellow-400/30 text-yellow-400':'border-border text-muted-foreground'}`}>{card.priority}</span>
                                        {card.confidence!=null && <span className={`text-xs px-1.5 py-0.5 rounded-full border ${card.confidence>=80?'border-green-400/30 text-green-400':card.confidence>=60?'border-yellow-400/30 text-yellow-400':'border-orange-400/30 text-orange-400'}`}>{card.confidence}% conf</span>}
                                      </div>
                                    </div>
                                    {approval && <span className={`text-xs px-2 py-1 rounded-lg font-medium shrink-0 ${approval==='approved'?'bg-green-400/15 text-green-400':approval==='merged'?'bg-yellow-400/15 text-yellow-400':'bg-secondary text-muted-foreground'}`}>{approval}</span>}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{card.content}</p>
                                  {card.data_basis && <div className="flex gap-1.5 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2"><span className="text-xs font-mono text-primary shrink-0">Evidence:</span><span className="text-xs text-muted-foreground">{card.data_basis}</span></div>}
                                  {card.merge_candidate && <div className="flex gap-2 rounded-lg bg-yellow-400/8 border border-yellow-400/20 px-3 py-2"><AlertTriangle size={11} className="text-yellow-400 shrink-0 mt-0.5"/><div><span className="text-xs font-semibold text-yellow-400">Similar: </span><span className="text-xs text-muted-foreground">"{card.merge_candidate}" — {card.merge_reason}</span></div></div>}
                                  {!approval && (
                                    <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                                      <button onClick={()=>{setCardApprovals(p=>({...p,[i]:'approved'}));setPendingCards(p=>[...p,card]);}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-400/30 bg-green-400/8 text-green-400 hover:bg-green-400/15 font-medium"><CheckCircle2 size={10}/>Approve</button>
                                      {card.merge_candidate && <button onClick={()=>{setCardApprovals(p=>({...p,[i]:'merged'}));setPendingCards(p=>[...p,{...card,title:`${card.merge_candidate} [+scope]`,content:`${card.content}\n\n--- Scope from crawler ---\n${card.data_basis||''}`}]);}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-yellow-400/25 bg-yellow-400/8 text-yellow-400 hover:bg-yellow-400/15 font-medium"><ArrowRight size={10}/>Merge scope</button>}
                                      <button onClick={()=>setCardApprovals(p=>({...p,[i]:'rejected'}))} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground ml-auto"><X size={10}/></button>
                                    </div>
                                  )}
                                  {approval==='rejected' && <button onClick={()=>setCardApprovals(p=>{const n={...p};delete n[i];return n;})} className="text-xs text-muted-foreground hover:text-foreground">Undo</button>}
                                </div>
                              );
                            })}
                          </div>
                        );

                        return (
                          <div className="rounded-2xl border border-violet-400/20 bg-card/60 overflow-hidden">
                            <div className="px-5 py-4 border-b border-border bg-violet-400/5">
                              <div className="flex items-start gap-3">
                                <div className="h-9 w-9 rounded-xl bg-violet-400/15 border border-violet-400/25 flex items-center justify-center shrink-0"><Brain size={16} className="text-violet-400"/></div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm">Manav Brain Analysis</div>
                                  <div className="text-xs text-muted-foreground mt-0.5">{compareResult.executive_summary}</div>
                                </div>
                                {compareResult.overall_score!=null && (
                                  <div className={`flex flex-col items-center px-3 py-1.5 rounded-xl border shrink-0 ${compareResult.overall_score>=70?'border-green-400/30 bg-green-400/8':compareResult.overall_score>=40?'border-yellow-400/30 bg-yellow-400/8':'border-red-400/30 bg-red-400/8'}`}>
                                    <span className={`text-xl font-black ${compareResult.overall_score>=70?'text-green-400':compareResult.overall_score>=40?'text-yellow-400':'text-red-400'}`}>{compareResult.overall_score}</span>
                                    <span className="text-xs text-muted-foreground">/100</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="p-5">
                              {tabContent[compareTab] || <p className="text-sm text-muted-foreground">Select a tab above.</p>}
                            </div>
                          </div>
                        );
                      })()}

                    </div>
                  );
                })()}              </div>
            )}

            {/* ── DOCUMENTS ── */}
            {tab === 'documents' && (
              <div className="space-y-5">

                {/* Upload zone */}
                <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/3 p-6 text-center">
                  <Upload className="h-10 w-10 text-primary/30 mx-auto mb-3"/>
                  <h3 className="font-semibold mb-2">Upload SEO Reports & Exports</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                    Upload CSV, TXT, or XLSX exports from GSC, Screaming Frog, Semrush, Ahrefs, or GA4. Claude extracts every data point automatically.
                  </p>
                  <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
                    <select value={uploadDocType} onChange={e=>setUploadDocType(e.target.value)}
                      disabled={uploadStatus !== 'idle'}
                      className="h-9 text-sm px-3 rounded-xl border border-border bg-background/60 disabled:opacity-50">
                      {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button onClick={()=>fileInputRef.current?.click()} disabled={uploadStatus !== 'idle'}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
                      {uploadStatus === 'idle'      && <><Upload size={13}/>Choose File</>}
                      {uploadStatus === 'uploading' && <><RefreshCw size={13} className="animate-spin"/>Saving file…</>}
                      {uploadStatus === 'extracting'&& <><RefreshCw size={13} className="animate-spin"/>Extracting data…</>}
                      {uploadStatus === 'saving'    && <><RefreshCw size={13} className="animate-spin"/>Saving to knowledge base…</>}
                      {uploadStatus === 'done'      && <><CheckCircle2 size={13} className="text-green-400"/>Done!</>}
                      {uploadStatus === 'error'     && <><AlertTriangle size={13} className="text-red-400"/>Failed — try again</>}
                    </button>
                    <input ref={fileInputRef} type="file" accept=".csv,.txt,.html" onChange={handleFileUpload} className="hidden"/>
                  </div>
                  {/* Upload progress steps */}
                  {uploadStatus !== 'idle' && (
                    <div className="flex items-center justify-center gap-2 mb-3">
                      {(['uploading','extracting','saving','done'] as const).map((step, i) => {
                        const steps = ['uploading','extracting','saving','done'] as const;
                        const currentIdx = steps.indexOf(uploadStatus as any);
                        const stepIdx = i;
                        const labels = ['1. Saving file','2. Reading data','3. Updating knowledge base','✓ Complete'];
                        const isDone = uploadStatus === 'done' || (currentIdx > stepIdx);
                        const isActive = currentIdx === stepIdx;
                        return (
                          <div key={step} className={`text-xs px-2 py-1 rounded-lg font-medium transition-all ${
                            isDone ? 'bg-green-400/15 text-green-400' :
                            isActive ? 'bg-primary/15 text-primary' :
                            'text-muted-foreground/40'
                          }`}>{labels[i]}</div>
                        );
                      })}
                    </div>
                  )}
                  {uploadStatus === 'error' && uploadError && (
                    <div className="mb-3 text-xs text-red-400 text-center bg-red-400/10 rounded-lg px-4 py-2">{uploadError}</div>
                  )}
                  <p className="text-xs text-muted-foreground text-center">Accepts CSV, TXT, HTML — for XLSX/Excel files, save as CSV first</p>
                  {UPLOAD_GUIDES[uploadDocType] && (
                    <button onClick={()=>setShowGuide(showGuide===uploadDocType?null:uploadDocType)} className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto">
                      <AlertTriangle size={11}/>How to export from this tool
                    </button>
                  )}
                  {showGuide === uploadDocType && UPLOAD_GUIDES[uploadDocType] && (
                    <div className="mt-4 text-left rounded-xl border border-border bg-background/60 p-4 max-w-lg mx-auto">
                      <div className="font-semibold text-sm mb-2">{DOC_TYPES.find(t=>t.value===uploadDocType)?.label} Export Guide</div>
                      <div className="text-xs text-muted-foreground mb-3">
                        <span className="font-medium text-foreground">Path: </span>{UPLOAD_GUIDES[uploadDocType].exportPath}
                      </div>
                      <ol className="space-y-1.5">
                        {UPLOAD_GUIDES[uploadDocType].steps.map((step,i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <span className="h-4 w-4 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">{i+1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>

                {/* Document list */}
                {documents.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-card/60 p-8 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3"/>
                    <p className="text-sm text-muted-foreground">No documents uploaded yet. Upload your first export above.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map(doc => (
                      <div key={doc.id} className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3">
                          <FileText size={16} className="text-primary shrink-0"/>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{doc.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {DOC_TYPES.find(t=>t.value===doc.doc_type)?.label} · {doc.file_size_kb}KB
                              {doc.source_date && ` · ${doc.source_date}`}
                              {doc.extracted_data?.knowledge_fields?.length > 0 && ` · ${doc.extracted_data.knowledge_fields.length} data points extracted`}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={()=>setExpandedDoc(expandedDoc===doc.id?null:doc.id!)} className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground">
                              {expandedDoc===doc.id?'Collapse':'View data'}
                            </button>
                            <button
                              onClick={()=>reExtractDoc(doc)}
                              disabled={reExtractingId === doc.id}
                              title="Re-run extraction to update knowledge base with latest data from this document"
                              className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/30 disabled:opacity-50 flex items-center gap-1">
                              {reExtractingId === doc.id
                                ? <><RefreshCw size={10} className="animate-spin"/>Re-reading…</>
                                : <><RefreshCw size={10}/>Re-extract</>}
                            </button>
                            <button onClick={()=>doc.id&&deleteDoc(doc.id)} className="h-7 w-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30">
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        </div>
                        {expandedDoc === doc.id && doc.extracted_data && (
                          <div className="border-t border-border px-5 py-4 space-y-3">
                            {doc.extracted_data.doc_summary && (
                              <p className="text-sm text-muted-foreground">{doc.extracted_data.doc_summary}</p>
                            )}
                            {doc.extracted_data.extracted?.action_items?.length > 0 && (
                              <div>
                                <div className="text-xs font-mono text-primary uppercase mb-2">Action Items Extracted</div>
                                {doc.extracted_data.extracted.action_items.slice(0,5).map((item:any,i:number) => (
                                  <div key={i} className="flex items-start gap-2 text-xs mb-1.5">
                                    <span className={`shrink-0 font-bold ${item.priority==='critical'?'text-red-400':item.priority==='high'?'text-orange-400':'text-yellow-400'}`}>
                                      [{item.priority}]
                                    </span>
                                    <span>{item.action}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {doc.extracted_data.knowledge_fields?.length > 0 && (
                              <div>
                                <div className="text-xs font-mono text-primary uppercase mb-2">Data Points Saved to Knowledge Base</div>
                                <div className="grid sm:grid-cols-2 gap-1.5">
                                  {doc.extracted_data.knowledge_fields.slice(0,10).map((kf:any,i:number) => (
                                    <div key={i} className="text-xs flex gap-1.5">
                                      <span className="text-muted-foreground shrink-0">{kf.key}:</span>
                                      <span className="font-medium truncate">{kf.value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Live verification results */}
                            {doc.extracted_data.live_verification && (
                              <div className="space-y-2">
                                {doc.extracted_data.live_verification.discrepancies?.length > 0 && (
                                  <div className="rounded-xl border border-red-400/25 bg-red-400/5 p-3">
                                    <div className="text-xs font-mono text-red-400 uppercase mb-2 flex items-center gap-1.5">
                                      <AlertTriangle size={10}/>Live site discrepancies — document may be outdated
                                    </div>
                                    {doc.extracted_data.live_verification.discrepancies.map((d:any,i:number)=>(
                                      <div key={i} className="text-xs mb-1.5">
                                        <span className="font-medium text-foreground">{d.key}: </span>
                                        <span className="line-through text-red-400/70 mr-1">{d.extracted_value}</span>
                                        <span className="text-green-400">→ {d.live_value||'differs'}</span>
                                        {d.severity==='high' && <span className="ml-1 text-red-400 font-bold">[HIGH]</span>}
                                        {d.note && <p className="text-muted-foreground mt-0.5 ml-2">{d.note}</p>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {doc.extracted_data.live_verification.unverifiable?.length > 0 && (
                                  <div className="rounded-xl border border-muted/20 bg-muted/5 p-3">
                                    <div className="text-xs font-mono text-muted-foreground uppercase mb-1.5">Could not verify against live site</div>
                                    {doc.extracted_data.live_verification.unverifiable.map((u:any,i:number)=>(
                                      <div key={i} className="text-xs text-muted-foreground mb-1 flex items-start gap-1.5">
                                        <span className="shrink-0 mt-0.5">·</span>
                                        <span><span className="font-medium text-foreground">{u.key}</span>: {u.reason}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {doc.extracted_data.live_verification.verified?.length > 0 && (
                                  <div className="text-xs text-green-400/70 flex items-center gap-1.5">
                                    <CheckCircle2 size={10}/>
                                    {doc.extracted_data.live_verification.verified.length} field{doc.extracted_data.live_verification.verified.length!==1?'s':''} confirmed against live site
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ Conflict Notification Panel ══ */}
      {showConflicts && pendingConflicts.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
          <div className="w-full max-w-2xl pointer-events-auto">
            <div className="rounded-2xl border border-orange-400/40 bg-card shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-orange-400/5">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-orange-400"/>
                  <span className="font-bold text-sm">
                    {pendingConflicts.length} data point{pendingConflicts.length!==1?'s':''} changed from existing values
                  </span>
                </div>
                <button onClick={()=>setShowConflicts(false)} className="h-7 w-7 rounded-full flex items-center justify-center border border-border hover:bg-secondary/50">
                  <X size={13}/>
                </button>
              </div>

              {/* Conflict list */}
              <div className="px-5 py-4 space-y-3 max-h-72 overflow-y-auto">
                {pendingConflicts.map((c,i) => (
                  <div key={i} className="rounded-xl border border-border bg-background/60 p-3 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-medium text-sm">{c.label}</span>
                      <span className="text-xs text-muted-foreground font-mono">from {c.source}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs flex-wrap">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-400/10 border border-red-400/20">
                        <span className="text-muted-foreground">Was:</span>
                        <span className="font-mono text-red-400 line-through">{c.oldVal}</span>
                      </div>
                      <ChevronRight size={12} className="text-muted-foreground shrink-0"/>
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-400/10 border border-green-400/20">
                        <span className="text-muted-foreground">Now:</span>
                        <span className="font-mono text-green-400">{c.newVal}</span>
                      </div>
                    </div>
                    {c.impacts.length > 0 && (
                      <div className="flex items-start gap-2 pt-1">
                        <span className="text-xs text-muted-foreground shrink-0 mt-0.5">Impacts:</span>
                        <div className="flex flex-wrap gap-1">
                          {c.impacts.map(imp => (
                            <span key={imp} className="text-xs px-2 py-0.5 rounded-full bg-orange-400/10 border border-orange-400/20 text-orange-400">{imp}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="px-5 py-3 border-t border-border bg-background/40 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  The new values are already saved. Go to Playground → Canvas to refresh the sections marked above.
                </p>
                <button
                  onClick={()=>setShowConflicts(false)}
                  className="px-4 py-2 rounded-xl bg-primary/15 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/25"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
