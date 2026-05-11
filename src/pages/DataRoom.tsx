import { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';

/* ─── types ─── */
type KCategory = 'goal'|'cms'|'access'|'technical'|'competitor'|'content'|'analytics'|'manual';
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

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════ */
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

  const selProj  = projects.find(p => p.id === selProjId);
  const client   = clients.find(c => c.id === selProj?.client_id);

  useEffect(() => {
    if (!selProjId) { setKnowledge({}); setDocuments([]); return; }
    loadData();
  }, [selProjId]);

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

    for (const row of toSave) {
      const existing = knowledge[category]?.[row.field_key]?.field_value;
      await supabase.from('project_knowledge').upsert(row, { onConflict: 'project_id,category,field_key' });
      // Log change to system control
      if (existing !== row.field_value) {
        fetch('/api/control', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            action: 'log_change', projectId: selProjId,
            payload: {
              changeType: 'data_room',
              fieldPath: `${category}.${row.field_key}`,
              oldValue: existing || null,
              newValue: row.field_value,
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
    toast({ title: 'Saved!' });
    setSaving(false);
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
        }),
      });
      const extracted = await res.json();

      if (!res.ok) {
        if (extracted.error === 'binary_file') {
          // Delete the already-saved doc row and show error
          await supabase.from('project_documents').delete().eq('id', docRow.id);
          throw new Error(extracted.message || 'Binary file detected — please export as CSV');
        }
        throw new Error(extracted.error || 'Extraction API failed');
      }

      // Step 3 — save extracted data
      setUploadStatus('saving');
      if (extracted.success && extracted.extracted) {
        await supabase.from('project_documents').update({
          extracted_data: extracted.extracted,
        }).eq('id', docRow.id);

        // Upsert knowledge fields
        const savedFields: string[] = [];
        if (extracted.extracted.knowledge_fields?.length) {
          for (const kf of extracted.extracted.knowledge_fields) {
            if (!kf.key || !kf.value) continue;
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
        toast({
          title: 'Upload complete!',
          description: `${count} data point${count !== 1 ? 's' : ''} saved to your knowledge base.${count === 0 ? ' No matching fields found — check document type.' : ''}`,
        });
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
          projectContext: `${client?.company || ''} | ${selProj?.url || ''} | ${client?.industry || ''}`,
        }),
      });
      const extracted = await res.json();
      if (extracted.success && extracted.extracted) {
        await supabase.from('project_documents').update({ extracted_data: extracted.extracted }).eq('id', doc.id);
        const savedFields: string[] = [];
        if (extracted.extracted.knowledge_fields?.length) {
          for (const kf of extracted.extracted.knowledge_fields) {
            if (!kf.key || !kf.value) continue;
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
        toast({ title: 'Re-extraction complete', description: `${savedFields.length} data points updated.` });
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
    </div>
  );
}
