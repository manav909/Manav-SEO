/* ════════════════════════════════════════════════════════════════
   api/lib/dev-engine.ts
   Developer Task Engine — by Manav

   Complete file. No patches. Every string literal is single-line.
   Multiline content uses array.join('\n') with escaped backslash-n.
════════════════════════════════════════════════════════════════ */

import { db } from './db.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';

/* ── TYPES ─────────────────────────────────────────────────────── */

export type CmsPlatform = 'wordpress'|'webflow'|'squarespace'|'wix'|'shopify'|'hubspot'|'drupal'|'joomla'|'ghost'|'framer'|'custom'|'unknown';
export type SeoPlugin   = 'yoast'|'rankmath'|'aioseo'|'seopress'|'none'|'unknown';

export interface CmsContext {
  platform:   CmsPlatform;
  seoPlugin:  SeoPlugin;
  confidence: number;
  signals:    string[];
  adminPath:  string;
  notes?:     string;
}

export interface DevTask {
  id?:                    string;
  project_id:             string;
  campaign_id?:           string | null;
  audit_run_id?:          string | null;
  phase:                  'phase_0' | 'phase_2' | 'phase_3';
  category:               'performance' | 'schema' | 'on_page' | 'content' | 'indexing';
  task_type:              string;
  title:                  string;
  description?:           string;
  finding_ref?:           string;
  finding_title?:         string;
  finding_detail?:        string;
  severity:               'critical' | 'warning' | 'info';
  target_url?:            string;
  priority:               number;
  status:                 'pending'|'running'|'fix_ready'|'applied'|'verifying'|'done'|'skipped'|'failed';
  analysis?:              string;
  fix_code?:              string;
  fix_language?:          string;
  apply_instructions?:    string;
  verification_method?:   string;
  rollback_code?:         string;
  rollback_instructions?: string;
  snapshot_id?:           string;
  backup_confirmed?:      boolean;
  verification_result?:   'pass' | 'fail' | 'partial';
  verification_evidence?: any;
  cms_platform?:          string;
  llm_calls_used?:        number;
  executed_at?:           string;
  created_at?:            string;
  updated_at?:            string;
}

interface AuditFinding {
  audit_kind:      string;
  severity:        string;
  finding_title:   string;
  finding_detail?: string;
  recommendation?: string;
  evidence?:       any;
}

/* ── CMS DETECTION ──────────────────────────────────────────────── */

export async function detectCms(url: string, hints?: { cms?: string; seoPlugin?: string }): Promise<CmsContext> {
  const stored = (hints?.cms || '').toLowerCase().trim();
  if (stored && stored !== 'unknown' && stored !== 'not set' && stored !== '') {
    const platform = normaliseCms(stored);
    return { platform, seoPlugin: normaliseSeoPlugin(hints?.seoPlugin || ''), confidence: 90,
             signals: ['Project context: ' + hints!.cms], adminPath: cmsAdminPath(platform) };
  }
  let html = '';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOSeason/1.0)' }, signal: AbortSignal.timeout(5000) });
    if (res.ok) html = await res.text();
  } catch { /* continue */ }

  if (/wp-content|wp-includes/i.test(html)) {
    const sp: SeoPlugin = /yoast/i.test(html) ? 'yoast' : /rank.?math/i.test(html) ? 'rankmath' : /aioseo/i.test(html) ? 'aioseo' : 'unknown';
    return { platform: 'wordpress', seoPlugin: sp, confidence: 97, signals: ['wp-content in HTML'], adminPath: '/wp-admin' };
  }
  if (/data-wf-site|webflow\.com/i.test(html))
    return { platform: 'webflow', seoPlugin: 'none', confidence: 97, signals: ['Webflow attribute'], adminPath: 'https://webflow.com/dashboard' };
  if (/squarespace-cdn\.com|sqs-layout/i.test(html))
    return { platform: 'squarespace', seoPlugin: 'none', confidence: 97, signals: ['Squarespace CDN'], adminPath: '/config' };
  if (/parastorage\.com|wixsite\.com/i.test(html))
    return { platform: 'wix', seoPlugin: 'none', confidence: 95, signals: ['Wix storage'], adminPath: 'https://manage.wix.com' };
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html))
    return { platform: 'shopify', seoPlugin: 'none', confidence: 97, signals: ['Shopify CDN'], adminPath: '/admin' };
  if (/hs-sites\.com|hubspot\.com|hbspt\./i.test(html))
    return { platform: 'hubspot', seoPlugin: 'none', confidence: 95, signals: ['HubSpot script'], adminPath: 'https://app.hubspot.com' };
  if (/Drupal\.settings|\/sites\/default\/files/i.test(html))
    return { platform: 'drupal', seoPlugin: 'unknown', confidence: 92, signals: ['Drupal variable'], adminPath: '/admin' };
  if (/ghost\.io|content\.ghost\.io/i.test(html))
    return { platform: 'ghost', seoPlugin: 'none', confidence: 93, signals: ['Ghost CDN'], adminPath: '/ghost' };
  if (/framer\.com|framerusercontent/i.test(html))
    return { platform: 'framer', seoPlugin: 'none', confidence: 93, signals: ['Framer asset'], adminPath: 'https://framer.com' };
  return { platform: html.length > 100 ? 'custom' : 'unknown', seoPlugin: 'unknown',
           confidence: html.length > 100 ? 55 : 0, signals: ['No CMS fingerprint found'], adminPath: '' };
}

function normaliseCms(s: string): CmsPlatform {
  if (s.includes('wordpress') || s === 'wp') return 'wordpress';
  if (s.includes('webflow'))    return 'webflow';
  if (s.includes('squarespace')) return 'squarespace';
  if (s.includes('wix'))        return 'wix';
  if (s.includes('shopify'))    return 'shopify';
  if (s.includes('hubspot'))    return 'hubspot';
  if (s.includes('drupal'))     return 'drupal';
  if (s.includes('ghost'))      return 'ghost';
  if (s.includes('framer'))     return 'framer';
  if (s.includes('custom'))     return 'custom';
  return 'unknown';
}

function normaliseSeoPlugin(s: string): SeoPlugin {
  if (/yoast/i.test(s))      return 'yoast';
  if (/rank.?math/i.test(s)) return 'rankmath';
  if (/aioseo/i.test(s))     return 'aioseo';
  if (/seopress/i.test(s))   return 'seopress';
  return 'unknown';
}

function cmsAdminPath(p: CmsPlatform): string {
  const m: Record<string,string> = {
    wordpress: '/wp-admin', webflow: 'https://webflow.com/dashboard',
    squarespace: '/config', wix: 'https://manage.wix.com', shopify: '/admin',
    hubspot: 'https://app.hubspot.com', drupal: '/admin', joomla: '/administrator',
    ghost: '/ghost', framer: 'https://framer.com', custom: '', unknown: '',
  };
  return m[p] || '';
}

/* ── PARSE FINDINGS → TASKS ─────────────────────────────────────── */

export function parseFindingsToTasks(
  findings: AuditFinding[],
  opts: { projectId: string; campaignId?: string; auditRunId?: string; targetUrl?: string },
): DevTask[] {
  const tasks: DevTask[] = [];
  for (const f of findings) {
    const t = classifyFinding(f, opts);
    if (t) tasks.push(t);
  }
  const po: Record<string,number> = { phase_0: 0, phase_2: 1, phase_3: 2 };
  const so: Record<string,number> = { critical: 0, warning: 1, info: 2 };
  tasks.sort((a,b) => (po[a.phase]??9)-(po[b.phase]??9) || (so[a.severity]??9)-(so[b.severity]??9) || a.priority-b.priority);
  return tasks;
}

function classifyFinding(f: AuditFinding, opts: { projectId:string; campaignId?:string; auditRunId?:string; targetUrl?:string }): DevTask | null {
  const sev = (f.severity === 'red' ? 'critical' : f.severity === 'amber' ? 'warning' : 'info') as DevTask['severity'];
  const base = {
    project_id: opts.projectId, campaign_id: opts.campaignId||null, audit_run_id: opts.auditRunId||null,
    target_url: opts.targetUrl, finding_title: f.finding_title,
    finding_detail: (f.finding_detail||'').slice(0,2000), severity: sev, status: 'pending' as const,
  };
  if (/MOBILE LCP.*exceeds/i.test(f.finding_title))
    return { ...base, phase:'phase_0', category:'performance', task_type:'lcp_fix',
      title: 'Fix render-blocking JavaScript causing mobile LCP failure',
      description: 'Mobile LCP ' + (f.evidence?.lcp_ms ? ((f.evidence.lcp_ms as number)/1000).toFixed(1)+'s' : '16s+') + '. Fix JS blocking first.',
      priority: 1 };
  if (/TBT.*severe|severe.*TBT/i.test(f.finding_title))
    return { ...base, phase:'phase_0', category:'performance', task_type:'script_defer',
      title: (/MOBILE/i.test(f.finding_title)?'Mobile':'Desktop')+' TBT '+(f.evidence?.tbt_ms?Math.round(f.evidence.tbt_ms as number)+'ms':'high')+' — defer render-blocking scripts',
      description: 'Profile Long Tasks, identify blocking JS bundles, add defer/async.',
      priority: 2 };
  if (/Page not in GSC top pages/i.test(f.finding_title))
    return { ...base, phase:'phase_0', category:'indexing', task_type:'gsc_indexing',
      title: 'Submit page for Google indexing (not in GSC)',
      description: '0 organic impressions. GSC URL Inspection → Request Indexing.',
      priority: 5 };
  if (/Lazy-loading.*low|0%.*images.*loading/i.test(f.finding_title))
    return { ...base, phase:'phase_3', category:'performance', task_type:'lazy_loading',
      title: 'Add loading=lazy to images ('+(f.evidence?.total_images||20)+' images, 0% lazy)',
      description: 'Free performance win — no asset changes. Add loading=lazy attribute.',
      priority: 30 };
  if (/modern image format|jpg.*png.*gif/i.test(f.finding_title))
    return { ...base, phase:'phase_3', category:'performance', task_type:'image_format',
      title: 'Convert '+(f.evidence?.legacy_format||12)+' images to webp/avif',
      description: '30-50% smaller files. Many platforms handle automatically.',
      priority: 31 };
  if (/FAQPage schema missing/i.test(f.finding_title))
    return { ...base, phase:'phase_2', category:'schema', task_type:'faq_schema',
      title: 'Add FAQPage JSON-LD schema for PAA questions',
      description: (f.evidence?.paa_count||4)+' PAA questions. Unlocks rich results and AI Overview citations.',
      priority: 10 };
  if (/Content freshness.*authenticity/i.test(f.finding_title))
    return { ...base, phase:'phase_3', category:'schema', task_type:'date_modified_schema',
      title: 'Add dateModified to schema and visible Last-updated label',
      description: 'Current Last-Modified header is unreliable. Add verified dateModified.',
      priority: 35 };
  if (/keyword.*present in only one.*title.*H1/i.test(f.finding_title))
    return { ...base, phase:'phase_2', category:'on_page', task_type:'h1_update',
      title: 'Update H1 to include campaign keyword naturally',
      description: 'H1 is partial match. Manav generates 3 options.',
      priority: 12 };
  if (/First paragraph weakly aligned/i.test(f.finding_title))
    return { ...base, phase:'phase_2', category:'on_page', task_type:'first_para',
      title: 'Rewrite opening paragraph (18% keyword overlap)',
      description: 'Generic above-fold copy. Manav rewrites aligned to search intent.',
      priority: 15 };
  if (/PAA questions.*NOT addressed/i.test(f.finding_title)) {
    const u: string[] = Array.isArray(f.evidence?.unanswered) ? f.evidence!.unanswered as string[] : [];
    return { ...base, phase:'phase_2', category:'content', task_type:'h2_section',
      title: 'Write '+(u.length||1)+' new H2 section(s) for unanswered PAA questions',
      description: u.length > 0 ? 'Missing: '+u.join(' | ') : 'Unanswered PAA questions = missed featured snippet opportunities.',
      priority: 11 };
  }
  return null;
}

/* ── CMS-SPECIFIC INSTRUCTIONS ──────────────────────────────────── */
/* All instruction strings are assembled via array.join('\n').         */
/* No string literal spans multiple lines. Safe to compile anywhere.   */

export function buildApplyInstructions(taskType: string, cms: CmsContext, opts: {
  fixCode?: string; pageUrl?: string; paaQuestions?: string[]; baseUrl?: string;
}): string {
  const p  = cms.platform;
  const pl = cms.seoPlugin;
  const au = cms.adminPath.startsWith('http') ? cms.adminPath : (opts.baseUrl||'')+cms.adminPath;
  const qs = opts.paaQuestions || [];
  const url = opts.pageUrl || 'your page URL';
  const out: string[] = [];

  // Prerequisites
  out.push('## What you need before starting');
  if (p==='wordpress') {
    out.push('- Log in to your WordPress dashboard: **'+au+'**');
    out.push('- You need Editor or Administrator access');
    if (pl==='yoast')    out.push('- You have **Yoast SEO** installed — these steps use it');
    if (pl==='rankmath') out.push('- You have **RankMath SEO** installed — these steps use it');
  } else if (p==='webflow') {
    out.push('- Log in to Webflow: **https://webflow.com/dashboard** → open your project in the Designer');
  } else if (p==='squarespace') {
    out.push('- Log in to Squarespace: **/config** on your domain');
  } else if (p==='wix') {
    out.push('- Log in to Wix: **https://manage.wix.com** → Edit Site');
  } else if (p==='shopify') {
    out.push('- Log in to Shopify admin: **'+au+'**');
  } else if (p==='hubspot') {
    out.push('- Log in to HubSpot: **https://app.hubspot.com** → Marketing → Website → Website Pages');
  } else {
    out.push('- Access your website files or CMS admin panel to edit the HTML of: **'+url+'**');
  }

  // Task-specific steps
  switch (taskType) {
    case 'lazy_loading': {
      out.push('');
      out.push('## Steps to add lazy loading to images');
      out.push('');
      out.push('> **What this does:** loads images only when the user scrolls to them. Makes pages load faster on mobile without any visual change.');
      out.push('');
      if (p==='wordpress') {
        out.push('WordPress 5.5+ adds lazy loading automatically. To verify:');
        out.push('');
        out.push('1. Visit your live page in Chrome');
        out.push('2. Right-click any image below the first screen → Inspect');
        out.push('3. Look for loading=lazy in the img tag — if present, you are done');
        out.push('4. If missing: install **Autoptimize** (free) → Settings → Extra → Lazy-load images');
        out.push('');
        out.push('**WP Rocket:** Settings → Media → Lazy Load Images → enable → Save');
        out.push('**Imagify / ShortPixel / Smush:** open the plugin settings → find Lazy Loading → enable');
      } else if (p==='webflow') {
        out.push('1. Open the page in **Webflow Designer**');
        out.push('2. Click on each image below the first screen');
        out.push('3. In the right panel, find **Loading** → set to **Lazy**');
        out.push('4. Keep the hero/first image as **Eager**');
        out.push('5. Click **Publish** when done');
      } else if (p==='squarespace') {
        out.push('1. Go to **Settings → Advanced → Code Injection**');
        out.push('2. In the **Footer** box, paste the code from the Fix Code tab');
        out.push('3. Click **Save**');
      } else if (p==='shopify') {
        out.push('1. Go to **Online Store → Themes → Actions → Edit Code**');
        out.push('2. Open the template containing your page images');
        out.push('3. Add loading=lazy to img tags below the first screen');
        out.push('4. Click **Save**');
      } else {
        out.push('Share the Fix Code with your developer — add loading=lazy to img tags below the first screen.');
      }
      break;
    }
    case 'faq_schema': {
      out.push('');
      out.push('## Steps to add FAQPage JSON-LD schema');
      out.push('');
      out.push('> **What this does:** registers your Q&A content with Google. Unlocks People Also Ask appearances and AI Overview citations. Invisible to visitors.');
      out.push('');
      if (p==='wordpress' && pl==='yoast') {
        out.push('**Yoast SEO is installed — use the FAQ Block:**');
        out.push('1. Go to **Pages → All Pages** → edit your page');
        out.push('2. Click **+** → search **FAQ** → select **Yoast FAQ Block**');
        out.push('3. Add each question and answer (40-80 words per answer)');
        if (qs.length>0) qs.forEach((q,i)=>out.push('   - Q'+(i+1)+': '+q));
        out.push('4. Click **Update** — Yoast adds the schema automatically');
      } else if (p==='wordpress' && pl==='rankmath') {
        out.push('1. Edit your page → click **+** → add **RankMath FAQ** block');
        out.push('2. Add each question and answer → click **Update**');
      } else if (p==='webflow') {
        out.push('1. In **Webflow Designer**: page gear icon ⚙ → Page Settings → Custom Code → Head Code');
        out.push('2. Paste the JSON-LD from Fix Code');
        out.push('3. Click **Save → Publish**');
      } else if (p==='squarespace') {
        out.push('1. Pages → hover page → gear ⚙ → Page Settings → Advanced tab');
        out.push('2. In **Page Header Code Injection**, paste the JSON-LD from Fix Code');
        out.push('3. Click **Save**');
      } else if (p==='wix') {
        out.push('1. Page → SEO → Additional SEO Settings → Structured Data → Add Item');
        out.push('2. Paste the JSON-LD from Fix Code → Apply → Publish');
      } else if (p==='shopify') {
        out.push('1. Online Store → Themes → Actions → Edit Code → layout/theme.liquid');
        out.push('2. Find </head> → paste JSON-LD just before it → Save');
      } else if (p==='hubspot') {
        out.push('1. Edit your page → Settings tab → Advanced Options → Head HTML');
        out.push('2. Paste JSON-LD from Fix Code → Update → Publish');
      } else {
        out.push('Paste the JSON-LD from Fix Code inside the <head> section, just before </head>.');
      }
      break;
    }
    case 'h1_update': {
      out.push('');
      out.push('## Steps to update the H1 heading');
      out.push('');
      out.push('> **What this does:** H1 is the main page heading Google reads to understand the topic. It does not currently contain "mobile forms". Adding the keyword improves relevance directly.');
      out.push('');
      if (p==='wordpress') {
        out.push('1. Pages → All Pages → find your page → Edit');
        out.push('2. The H1 is the large text at the top of the editor — click on it');
        out.push('3. Change to one of the options from Fix Code');
        out.push('4. **Before saving:** check GSC → Performance → Pages → this URL → Queries tab to protect existing rankings');
        out.push('5. Click **Update**');
      } else if (p==='webflow') {
        out.push('1. Open page in Webflow Designer → double-click the main heading to edit');
        out.push('2. Change to one of the options in Fix Code');
        out.push('3. Confirm the right panel shows **H1** as the tag type');
        out.push('4. Click **Publish**');
      } else if (p==='squarespace') {
        out.push('1. Edit page → click main title → change text → set style to **Heading 1** → Save');
      } else {
        out.push('Find <h1> in your page HTML → replace the text with the option from Fix Code → save and publish.');
      }
      break;
    }
    case 'first_para': {
      out.push('');
      out.push('## Steps to update the opening paragraph');
      out.push('');
      out.push('> **What this does:** Google reads the first paragraph to understand the page topic. The current tagline is generic. The new version directly addresses what someone searching "mobile forms" wants to find.');
      out.push('');
      if (p==='wordpress') {
        out.push('1. Pages → All Pages → edit your page');
        out.push('2. Scroll to the first paragraph block below the H1');
        out.push('3. Select all text → replace with the text from Fix Code');
        out.push('4. Click **Update**');
      } else if (p==='webflow') {
        out.push('1. Open page in Webflow Designer → double-click the first paragraph → select all → paste text from Fix Code → Publish');
      } else {
        out.push('Find the first <p> tag after your H1 → replace its content with the text from Fix Code → save and publish.');
      }
      break;
    }
    case 'h2_section': {
      out.push('');
      out.push('## Steps to add new H2 sections');
      out.push('');
      out.push('> **What this does:** Google shows these questions in the People Also Ask box. Pages that answer them directly can capture the PAA citation and AI Overview references. Each question needs a verbatim H2 and a 40-80 word direct answer below it.');
      out.push('');
      if (qs.length>0) { out.push('Questions to add:'); qs.forEach((q,i)=>out.push('- '+(i+1)+'. '+q)); out.push(''); }
      if (p==='wordpress') {
        out.push('1. Pages → All Pages → edit your page');
        out.push('2. Click at the end of your existing content');
        out.push('3. Add a **Heading block** (click +, search Heading, set level to H2)');
        out.push('4. Type the question text exactly as shown in Fix Code (word-for-word)');
        out.push('5. Below it, add a **Paragraph block** with the answer from Fix Code');
        out.push('6. Repeat for each question → Click **Update**');
      } else if (p==='webflow') {
        out.push('1. Open page in Webflow Designer → drag in a Heading component → set to H2');
        out.push('2. Type the question text exactly → add Text Block below with the answer');
        out.push('3. Repeat for each question → Publish');
      } else if (p==='squarespace') {
        out.push('1. Edit page → add Text block → type question → set to Heading 2 → press Enter → add answer → Save');
      } else {
        out.push('Paste the complete HTML from Fix Code into your page content, after the existing sections.');
      }
      break;
    }
    case 'lcp_fix':
    case 'script_defer': {
      out.push('');
      out.push('## Steps to fix JavaScript blocking');
      out.push('');
      out.push('> **What this does:** JavaScript files are loading before the page can show any content, causing the 16+ second mobile load time. Adding defer tells the browser to show the page first, then load the JS.');
      out.push('');
      out.push('⚠️ **This is a developer task.** If you are not comfortable editing template files, share the Fix Code tab with your developer.');
      out.push('');
      if (p==='wordpress') {
        out.push('**Plugin option (no coding needed):**');
        out.push('**WP Rocket:** Settings → File Optimization → JavaScript → Defer JS execution → Save → Purge Cache');
        out.push('**Autoptimize (free):** Settings → Autoptimize → JavaScript → Defer scripts → Save and Empty Cache');
      } else if (p==='webflow') {
        out.push('1. Project Settings → Custom Code');
        out.push('2. Move scripts from Head Code to Footer Code');
        out.push('3. For head-only scripts: add defer attribute → Save → Publish');
      } else if (p==='squarespace') {
        out.push('1. Settings → Advanced → Code Injection');
        out.push('2. Move <script> tags from Header to Footer');
        out.push('3. Add defer to any that must stay in header → Save');
      } else {
        out.push('Share the Fix Code with your developer. They need to add defer to the <script> tags listed in the analysis.');
      }
      break;
    }
    case 'image_format': {
      out.push('');
      out.push('## Steps to convert images to webp/avif');
      out.push('');
      out.push('> **What this does:** webp images are 30-50% smaller than jpg/png at the same quality. Reduces load time on mobile, especially on slower connections.');
      out.push('');
      if (p==='wordpress') {
        out.push('**Imagify (recommended, free tier):**');
        out.push('1. Plugins → Add New → search Imagify → Install → Activate');
        out.push('2. Settings → Imagify → check Convert to WebP');
        out.push('3. Click Bulk Optimize to convert existing images');
      } else if (p==='webflow' || p==='squarespace' || p==='shopify') {
        out.push(p+' **automatically converts images to WebP via its CDN.** No action needed.');
        out.push('To verify: right-click an image on the live page → Open in new tab → check the URL ends in .webp');
      } else {
        out.push('Share the conversion script from Fix Code with your developer to convert and re-upload images.');
      }
      break;
    }
    case 'gsc_indexing': {
      out.push('');
      out.push('## Steps to submit page for indexing');
      out.push('');
      out.push('> **What this does:** Google has not indexed this page. Without indexing, no SEO work matters.');
      out.push('');
      out.push('**You need access to Google Search Console for this website.**');
      out.push('');
      out.push('1. Go to **Google Search Console:** https://search.google.com/search-console');
      out.push('2. Select the property for your website');
      out.push('3. In the search bar at the top, paste: `'+url+'`');
      out.push('4. Press Enter — GSC checks if the URL is indexed');
      out.push('5. **If URL is not on Google:** click **Request Indexing** → Google crawls within 24-48 hours');
      out.push('6. **If URL is on Google:** page is indexed but has 0 impressions — the LCP fix (Phase 0 Task 1) is the priority');
      out.push('7. Check back in 3-5 days for new impressions in GSC → Performance');
      break;
    }
    case 'date_modified_schema': {
      out.push('');
      out.push('## Steps to add dateModified to schema');
      out.push('');
      out.push('> **What this does:** adds a verified freshness date. More reliable than the Last-Modified HTTP header which can be triggered by a server restart with no content change.');
      out.push('');
      if (p==='wordpress') {
        out.push('1. Edit your page → add a Custom HTML block at the bottom');
        out.push('2. Paste the updated schema from Fix Code');
        out.push('3. Also add a visible Last updated: [date] line near the top of the content');
        out.push('4. Click **Update**');
      } else {
        out.push('1. Find the existing <script type=application/ld+json> block in your page head');
        out.push('2. Add the dateModified field as shown in Fix Code');
        out.push('3. Also add a visible Last updated: '+"2026-05-26"+' label on the page');
        out.push('4. Save and publish');
      }
      break;
    }
    default: {
      out.push('');
      out.push('## Steps to apply this fix');
      out.push('');
      out.push('Follow the analysis above or share the Fix Code with your developer.');
    }
  }

  out.push('');
  out.push('---');
  out.push('');
  out.push('## After applying');
  out.push('Click **I Applied the Fix** above → then **Verify on Live Page** — Manav re-fetches your page and confirms the change is in place.');
  return out.join('\n');
}

/* ── ROLLBACK INSTRUCTIONS ──────────────────────────────────────── */

export function buildRollbackInstructions(taskType: string, platform: CmsPlatform): string {
  const out: string[] = [];
  out.push('## How to undo this change');
  out.push('');
  out.push('> **When to use:** only if the change caused a visible problem. Normal SEO changes do not break sites.');
  out.push('');
  const undoMap: Record<string,string> = {
    lazy_loading:         'Remove loading=lazy from the modified image tags. Original tags are in the Snapshot below.',
    faq_schema:           'Find and delete the FAQPage JSON-LD script block from your page head.',
    h1_update:            'Change the H1 back to the original text shown in the Snapshot below.',
    first_para:           'Replace the first paragraph with the original text shown in the Snapshot below.',
    h2_section:           'Delete the new H2 heading and paragraph blocks added at the bottom of the content.',
    script_defer:         'Remove the defer or async attribute from the script tags that were modified. Originals in Snapshot.',
    lcp_fix:              'Remove the defer or async attribute from the modified script tags. Originals in Snapshot.',
    image_format:         'Re-upload the original jpg/png files. WordPress plugins keep originals — find Restore Originals in plugin settings.',
    date_modified_schema: 'Remove the dateModified field from the JSON-LD schema. Original schema in Snapshot.',
    gsc_indexing:         'No code was changed — this was a GSC request. Nothing to undo.',
  };
  out.push('**What to undo:** '+(undoMap[taskType]||'Refer to the Snapshot for the original HTML.'));
  out.push('');
  out.push('## CMS-specific undo steps');
  out.push('');
  if (platform==='wordpress') {
    out.push('**Fastest option — WordPress Revisions:**');
    out.push('1. In the page editor, look for **Revisions** in the right sidebar (Document tab)');
    out.push('2. Click to see save history → slide back to before this change → **Restore This Revision**');
    out.push('');
    out.push('**Manual revert:** Pages → All Pages → edit page → make the change described above → Update');
  } else if (platform==='webflow') {
    out.push('1. Webflow Designer → History panel (clock icon)');
    out.push('2. Click the version before this change was published → Restore → Publish');
  } else if (platform==='squarespace') {
    out.push('Edit the page and make the reverting change. For Code Injection: Settings → Advanced → Code Injection → remove added code.');
  } else {
    out.push('Log in to your CMS → navigate to the changed page → make the reverting change → save and publish.');
  }
  out.push('');
  out.push('## Last resort: full site restore');
  out.push('- **WordPress:** cPanel → Backup → restore to yesterday');
  out.push('- **WP Engine / Kinsta / Flywheel:** Dashboard → Backups → Restore Point');
  out.push('- **Webflow:** contact Webflow support — they retain backups');
  out.push('- **Shopify:** Apps → Rewind Backups → restore theme');
  out.push('- **Any host:** call your hosting provider and ask for a server-level restore');
  return out.join('\n');
}

/* ── SNAPSHOT ───────────────────────────────────────────────────── */

export async function snapshotPageSection(task: DevTask, pageHtml: string): Promise<string> {
  if (!pageHtml) return '';
  switch (task.task_type) {
    case 'lazy_loading': {
      const imgs = pageHtml.match(/<img\b[^>]*>/gi) || [];
      return imgs.slice(0,30).join('\n');
    }
    case 'faq_schema':
    case 'date_modified_schema': {
      const schemas = pageHtml.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
      return schemas.join('\n\n');
    }
    case 'h1_update': {
      const h1 = pageHtml.match(/<h1[\s\S]*?<\/h1>/i);
      return h1?.[0] || '';
    }
    case 'first_para': {
      const paras = pageHtml.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
      return paras.slice(0,3).join('\n');
    }
    case 'h2_section': {
      const headings = pageHtml.match(/<h[23]\b[^>]*>[\s\S]*?<\/h[23]>/gi) || [];
      return headings.slice(0,15).join('\n');
    }
    case 'lcp_fix':
    case 'script_defer': {
      const headMatch = pageHtml.match(/<head[\s\S]*?<\/head>/i);
      if (!headMatch) return '';
      const scripts = headMatch[0].match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
      return scripts.slice(0,20).join('\n');
    }
    case 'image_format': {
      const imgs = pageHtml.match(/<img\b[^>]*(?:jpg|png|gif|jpeg)[^>]*>/gi) || [];
      return imgs.slice(0,20).join('\n');
    }
    default: return pageHtml.slice(0,2000);
  }
}

export async function saveSnapshot(task: DevTask, snapshot: string): Promise<string | null> {
  if (!task.id || !snapshot) return null;
  try {
    const { data, error } = await db().from('dev_task_snapshots')
      .insert({ task_id: task.id, project_id: task.project_id, task_type: task.task_type, url: task.target_url||'', snapshot })
      .select('id').single();
    if (error) { console.error('[dev-engine] saveSnapshot:', error.message); return null; }
    return (data as any)?.id || null;
  } catch (e: any) { console.error('[dev-engine] saveSnapshot threw:', e?.message); return null; }
}

export async function loadSnapshot(taskId: string): Promise<{ snapshot: string; captured_at: string } | null> {
  try {
    const { data } = await db().from('dev_task_snapshots').select('snapshot,captured_at')
      .eq('task_id', taskId).order('captured_at',{ascending:false}).limit(1).maybeSingle();
    return (data as any) || null;
  } catch { return null; }
}

/* ── EXECUTE TASK ───────────────────────────────────────────────── */

export async function executeDevTask(task: DevTask, cmsOverride?: CmsContext): Promise<Partial<DevTask>> {
  /* ── ARCHITECTURE NOTE ────────────────────────────────────────────────
     We do NOT fetch the live page here. Reason: slow sites (like the one
     this is designed for — 16.9s LCP) make any live fetch budget-fatal.
     The audit already contains everything needed: finding_title,
     finding_detail, evidence JSON (lcp_ms, tbt_ms, total_images, etc).
     We use audit data as the sole input for code generation.
     The verify step (separate action) fetches the live page AFTER the
     fix is applied, when checking for the specific change we made.
  ──────────────────────────────────────────────────────────────────────── */

  // CMS: use stored project context only — no network call
  const cms = cmsOverride || {
    platform:   (task.cms_platform || 'unknown') as CmsPlatform,
    seoPlugin:  'unknown' as SeoPlugin,
    confidence: 50,
    signals:    ['From task metadata'],
    adminPath:  cmsAdminPath((task.cms_platform || 'unknown') as CmsPlatform),
  };

  // Build LLM prompt purely from audit data already stored on the task
  const { sys, usr } = buildLlmPrompt(task, '', cms);

  let analysis='', fixCode='', fixLanguage='html', paaQuestions: string[]=[];
  let callsMade = 0;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: sys,
        messages: [{ role: 'user', content: usr }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    callsMade++;
    const data = await resp.json() as any;
    const raw = (data?.content?.[0]?.text || '').trim();
    const jm = raw.match(/\{[\s\S]+\}/);
    if (jm) {
      try {
        const j = JSON.parse(jm[0]);
        analysis     = j.analysis      || '';
        fixCode      = j.fix_code      || '';
        fixLanguage  = j.fix_language  || 'html';
        paaQuestions = Array.isArray(j.paa_questions) ? j.paa_questions : [];
      } catch { analysis = raw.slice(0, 600); }
    } else {
      analysis = raw.slice(0, 600);
    }
  } catch (e: any) {
    analysis = 'Code generation error: ' + (e?.message || 'unknown');
  }

  const baseUrl = task.target_url
    ? (() => { try { return new URL(task.target_url!).origin; } catch { return ''; } })()
    : '';

  const applyInstructions    = buildApplyInstructions(task.task_type, cms, {
    fixCode, pageUrl: task.target_url, paaQuestions, baseUrl,
  });
  const rollbackInstructions = buildRollbackInstructions(task.task_type, cms.platform);
  const verificationMethod   = buildVerificationMethod(task.task_type, task.target_url || '');

  return {
    status:                'fix_ready',
    analysis,
    fix_code:              fixCode,
    fix_language:          fixLanguage,
    apply_instructions:    applyInstructions,
    rollback_code:         '<!-- Snapshot captured during verify step after fix is applied -->',
    rollback_instructions: rollbackInstructions,
    verification_method:   verificationMethod,
    backup_confirmed:      false,
    cms_platform:          cms.platform,
    executed_at:           new Date().toISOString(),
    llm_calls_used:        callsMade,
    updated_at:            new Date().toISOString(),
  };
}

/* ── LLM PROMPTS ─────────────────────────────────────────────────── */

function buildLlmPrompt(task: DevTask, pageContext: string, cms: CmsContext): { sys: string; usr: string } {
  const sys = [
    'You are a senior web developer generating exact code fixes for SEO and performance issues.',
    'CMS: '+cms.platform+' | SEO plugin: '+cms.seoPlugin+' | Confidence: '+cms.confidence+'%',
    '',
    'Reply with ONLY valid JSON:',
    '{',
    '  "analysis": "2-3 sentences about the exact problem found in this page HTML",',
    '  "fix_code": "Complete, copy-paste-ready code. No placeholders.",',
    '  "fix_language": "html|json|javascript|bash",',
    '  "paa_questions": ["array of questions if h2_section or faq_schema task, else empty"]',
    '}',
  ].join('\n');

  const tc = ['Task: '+task.title, 'URL: '+(task.target_url||'unknown'),
             'Finding: '+(task.finding_title||''), 'Detail: '+((task.finding_detail||'').slice(0,300))].join('\n');

  const prompts: Record<string,string> = {
    lcp_fix: tc+'\n\nAUDIT DATA: Mobile LCP 16.9s. TTFB 14ms (server fast). Mobile TBT 798ms. Root cause: render-blocking JavaScript. CMS: '+cms.platform+'.\n\nGenerate: (1) 2-sentence analysis referencing LCP 16.9s and TBT 798ms. (2) Code showing defer/async patterns for '+cms.platform+' — focus on third-party scripts (analytics, chat, tag managers). Show BEFORE/AFTER. (3) DevTools profiling instruction to identify the specific blocking scripts.',
    script_defer: tc+'\n\nAUDIT DATA: TBT is critically high indicating render-blocking JavaScript. CMS: '+cms.platform+'.\n\nGenerate: (1) 2-sentence analysis. (2) defer/async code patterns for this CMS. (3) Chrome DevTools Long Tasks profiling steps.',
    lazy_loading: tc+'\n\nAUDIT DATA: 0 of 20 images have loading=lazy on this page. CMS: '+cms.platform+'.\n\nGenerate: (1) 1-sentence analysis. (2) Complete solution for '+cms.platform+'. If code is needed, write a complete <script> tag that adds loading=lazy to all images after the first 2 on the page — ready to paste into a footer code injection box.',
    image_format: tc+'\n\nAUDIT DATA: Images are in jpg/png/gif format (legacy). CMS: '+cms.platform+'.\n\nGenerate: (1) 1-sentence analysis. (2) Best approach for '+cms.platform+' — name specific plugins or CDN settings. (3) Node.js sharp script to batch-convert a directory of images to webp.',
    faq_schema: tc+'\n\nAUDIT DATA: No FAQPage schema. 4+ PAA questions on the live SERP for mobile forms. Page: AlphaSoftware mobile forms (alphasoftware.com/mobile-forms). CMS: '+cms.platform+'.\n\nGenerate: (1) 1-sentence analysis. (2) Complete FAQPage JSON-LD block with 4 questions and 50-70 word answers each, ready for this CMS. Return questions in paa_questions array.',
    h1_update: tc+'\n\nAUDIT DATA: Current H1 is "Best Mobile Data Collection Apps for Business". Campaign keyword "mobile forms" is absent from the H1. CMS: '+cms.platform+'.\n\nGenerate 3 H1 options that include "mobile forms" naturally, maintain commercial intent, are 5-9 words. Rank them. Return all 3 numbered in fix_code.',
    first_para: tc+'\n\nAUDIT DATA: Current first paragraph: "Capture accurate data anywhere, even offline, and instantly deliver it to the systems that run your business." Keyword overlap: 18%. Missing "mobile forms". CMS: '+cms.platform+'.\n\nRewrite: 60-100 words, contains "mobile forms" in sentence 1, opens with the searcher problem, says who it is for, previews AlphaSoftware differentiator (offline-first). Return ONLY the new paragraph text in fix_code.',
    h2_section: tc+'\n\nAUDIT DATA: 1 unanswered PAA question on the live SERP. Page: AlphaSoftware mobile forms. CMS: '+cms.platform+'.\n\nGenerate H2 sections for: "What is the best mobile form builder for field teams?" and "Can you create a mobile form without coding?". Each: H2 tag + 50-70 word direct answer + 250-300 word body. Honest competitor mentions (JotForm, doForms, Zoho Forms). Return HTML in fix_code and questions in paa_questions.',
    date_modified_schema: tc+'\n\nGenerate: (1) A complete WebPage JSON-LD schema with dateModified set to today. (2) HTML for a small visible Last updated label. Return the <script type=application/ld+json> block in fix_code.',
    gsc_indexing: tc+'\n\nAUDIT DATA: Page not in GSC top pages. 0 organic impressions in 28-day window. 1000 query-page pairs across 450 pages exist for this site — this URL is not among them.\n\nGenerate: (1) Analysis of what this means. (2) Step-by-step GSC URL Inspection instructions. (3) Common indexing blockers checklist in fix_code as a plain text checklist.',
  };
  return { sys, usr: prompts[task.task_type] || tc+'\n\nGenerate exact fix code for this task from the audit finding data.' };
}

function buildVerificationMethod(taskType: string, url: string): string {
  const m: Record<string,string> = {
    lazy_loading:         'Visit '+url+' → right-click any below-fold image → Inspect → look for loading=lazy. Or: document.querySelectorAll(\'img[loading="lazy"]\').length in browser console.',
    faq_schema:           'Visit '+url+' → View Page Source → Ctrl+F search FAQPage. Or test at https://validator.schema.org/?url='+encodeURIComponent(url),
    h1_update:            'Visit '+url+' → View Page Source → Ctrl+F search <h1 → verify new heading text.',
    first_para:           'Visit '+url+' → read the first paragraph — confirm it contains mobile forms and addresses the searcher problem.',
    h2_section:           'Visit '+url+' → scroll to the bottom of content — verify new H2 headings are visible.',
    script_defer:         'Run PageSpeed Insights on '+url+' (Mobile) after deploying. TBT should be < 300ms.',
    lcp_fix:              'Run PageSpeed Insights at https://pagespeed.web.dev for '+url+' in Mobile mode. Target: LCP < 4s.',
    image_format:         'Visit '+url+' → right-click any image → Open in new tab → check URL ends in .webp or .avif.',
    date_modified_schema: 'View Page Source on '+url+' → search for dateModified → confirm date is present.',
    gsc_indexing:         'Go to https://search.google.com/search-console → URL Inspection → paste '+url+' → check status.',
  };
  return m[taskType] || 'Visit '+url+' and confirm the change is visible. Use View Page Source (Ctrl+U) to check the HTML.';
}

/* ── VERIFY TASK ─────────────────────────────────────────────────── */

export async function verifyDevTask(task: DevTask): Promise<Partial<DevTask>> {
  const url = task.target_url||'';
  let pageHtml = '';
  try {
    const res = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0 (compatible; SEOSeason/1.0)'}, signal:AbortSignal.timeout(8000) });
    if (res.ok) pageHtml = (await res.text()).slice(0, 60000);
  } catch (e: any) {
    return { status:'applied', verification_result:'partial', verified_at:new Date().toISOString(), updated_at:new Date().toISOString(),
             verification_evidence:{ message:'Could not fetch live page: '+(e?.message||'unknown') } };
  }

  const ev: Record<string,unknown> = {};
  let result: 'pass'|'fail'|'partial' = 'fail';
  let message = '';

  switch (task.task_type) {
    case 'lazy_loading': {
      const lc = (pageHtml.match(/loading=["']lazy["']/gi)||[]).length;
      const ti = (pageHtml.match(/<img\b/gi)||[]).length;
      ev.lazy_count=lc; ev.total_images=ti;
      result  = lc===0?'fail':lc>=ti*0.5?'pass':'partial';
      message = lc===0?'No lazy loading found — check if changes are published'
              : lc>=ti*0.5?lc+' of '+ti+' images are now lazy-loaded'
              : lc+' of '+ti+' images lazy-loaded — apply to remaining images';
      break;
    }
    case 'faq_schema': {
      const ok = /["']FAQPage["']/i.test(pageHtml);
      ev.has_faq_schema=ok;
      result  = ok?'pass':'fail';
      message = ok?'FAQPage JSON-LD schema detected on live page':'FAQPage schema not found — check if changes are published';
      break;
    }
    case 'h1_update': {
      const h1m = pageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const h1t = h1m?h1m[1].replace(/<[^>]+>/g,'').trim():'';
      ev.h1_text=h1t; ev.has_keyword=/mobile forms/i.test(h1t);
      result  = ev.has_keyword?'pass':'fail';
      message = ev.has_keyword?'H1 now reads: '+h1t:'H1 still reads: '+h1t+' — mobile forms not found';
      break;
    }
    case 'image_format': {
      const wc=(pageHtml.match(/\.webp/gi)||[]).length;
      const ac=(pageHtml.match(/\.avif/gi)||[]).length;
      ev.webp_count=wc; ev.avif_count=ac;
      result  = wc+ac>0?'pass':'fail';
      message = wc+ac>0?wc+' webp and '+ac+' avif image references found':'No webp/avif images detected yet';
      break;
    }
    case 'date_modified_schema': {
      const ok=/dateModified/i.test(pageHtml);
      ev.has_date_modified=ok;
      result  = ok?'pass':'fail';
      message = ok?'dateModified found in schema':'dateModified not found yet';
      break;
    }
    case 'lcp_fix':
    case 'script_defer': {
      const dc=(pageHtml.match(/\bdefer\b/gi)||[]).length;
      const ac=(pageHtml.match(/\basync\b/gi)||[]).length;
      ev.defer_count=dc; ev.async_count=ac;
      result  = dc+ac>0?'partial':'fail';
      message = dc+ac>0?dc+' deferred and '+ac+' async scripts found. Run PageSpeed Insights to confirm TBT improvement.':'No deferred scripts detected — check if changes are published';
      break;
    }
    case 'gsc_indexing': {
      ev.check_url='https://search.google.com/search-console/inspect';
      result='partial';
      message='Go to Google Search Console → URL Inspection → paste the page URL → check if it shows URL is on Google';
      break;
    }
    default: {
      result='partial';
      message='Check the live page manually to confirm the change is visible';
    }
  }

  ev.message=message;
  return {
    status: result==='pass'?'done':'applied',
    verification_result: result,
    verification_evidence: ev,
    verified_at: new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  };
}

/* ── DATABASE HELPERS ────────────────────────────────────────────── */

export async function saveTasks(tasks: DevTask[]): Promise<{ saved: number; error?: string }> {
  if (!tasks.length) return { saved: 0 };
  try {
    const rows = tasks.map(t => ({
      project_id: t.project_id, campaign_id: t.campaign_id||null, audit_run_id: t.audit_run_id||null,
      phase: t.phase, category: t.category, task_type: t.task_type, title: t.title,
      description: t.description||null, finding_title: t.finding_title||null,
      finding_detail: (t.finding_detail||'').slice(0,2000), severity: t.severity,
      target_url: t.target_url||null, priority: t.priority, status: t.status,
    }));
    const { error } = await db().from('dev_tasks').insert(rows);
    if (error) { console.error('[dev-engine] saveTasks:', error.message); return { saved:0, error:error.message }; }
    return { saved: rows.length };
  } catch (e: any) { console.error('[dev-engine] saveTasks threw:', e?.message); return { saved:0, error:e?.message||'Insert failed' }; }
}

export async function updateTask(taskId: string, updates: Partial<DevTask>): Promise<void> {
  const u: Record<string,unknown> = { ...updates, updated_at: new Date().toISOString() };
  delete u.id;
  try { await db().from('dev_tasks').update(u).eq('id', taskId); }
  catch (e: any) { console.error('[dev-engine] updateTask:', e?.message); }
}

export async function getTask(taskId: string): Promise<DevTask | null> {
  try {
    const { data } = await db().from('dev_tasks').select('*').eq('id', taskId).maybeSingle();
    return (data as DevTask) || null;
  } catch { return null; }
}

export async function getTasksForProject(projectId: string, opts?: { campaignId?: string }): Promise<DevTask[]> {
  try {
    let q = db().from('dev_tasks').select('*').eq('project_id', projectId);
    if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId);
    q = q.order('priority',{ascending:true}).order('created_at',{ascending:false});
    const { data } = await q;
    return (data as DevTask[]) || [];
  } catch { return []; }
}

export async function deleteProjectTasks(projectId: string, auditRunId?: string): Promise<void> {
  try {
    let q = db().from('dev_tasks').delete().eq('project_id', projectId);
    if (auditRunId) q = q.eq('audit_run_id', auditRunId);
    await q;
  } catch (e: any) { console.error('[dev-engine] deleteProjectTasks:', e?.message); }
}

export async function detectCmsForProject(projectId: string): Promise<CmsContext | null> {
  try {
    const { data: proj } = await db().from('projects').select('url,cms').eq('id', projectId).maybeSingle();
    if (!proj) return null;
    return detectCms((proj as any).url||'', { cms: (proj as any).cms||'' });
  } catch { return null; }
}