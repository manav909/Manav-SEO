/* ════════════════════════════════════════════════════════════════
   api/lib/dev-engine.ts  —  Developer Task Engine
   
   The complete developer-as-Claude system. Takes audit findings,
   detects the site's CMS, and generates exact step-by-step
   instructions written for non-technical users on THEIR specific
   platform — WordPress + Yoast, Webflow, Squarespace, Wix, 
   Shopify, HubSpot, custom HTML, and more.

   Loop per task:
     parse → detect CMS → execute (fetch + Claude) → 
     fix_ready (code + platform steps) → user applies →
     verify (re-fetch live page) → done
════════════════════════════════════════════════════════════════ */

import { db } from './db.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';

/* ═══════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════ */

export type CmsPlatform =
  | 'wordpress'
  | 'webflow'
  | 'squarespace'
  | 'wix'
  | 'shopify'
  | 'hubspot'
  | 'drupal'
  | 'joomla'
  | 'ghost'
  | 'framer'
  | 'custom'
  | 'unknown';

export type SeoPlugin =
  | 'yoast'
  | 'rankmath'
  | 'aioseo'
  | 'seopress'
  | 'squirrly'
  | 'none'
  | 'unknown';

export interface CmsContext {
  platform: CmsPlatform;
  seoPlugin: SeoPlugin;
  confidence: number;      // 0-100 — how sure we are of the detection
  signals: string[];       // what we found that told us the CMS
  adminPath: string;       // e.g. "/wp-admin", "/admin", app-specific
  notes?: string;          // extra context for instructions
}

export interface DevTask {
  id?: string;
  project_id: string;
  campaign_id?: string | null;
  audit_run_id?: string | null;
  phase: 'phase_0' | 'phase_2' | 'phase_3';
  category: 'performance' | 'schema' | 'on_page' | 'content' | 'indexing';
  task_type: string;
  title: string;
  description?: string;
  finding_ref?: string;
  finding_title?: string;
  finding_detail?: string;
  severity: 'critical' | 'warning' | 'info';
  target_url?: string;
  priority: number;
  status: 'pending' | 'running' | 'fix_ready' | 'applied' | 'verifying' | 'done' | 'skipped' | 'failed';
  analysis?: string;
  fix_code?: string;
  fix_language?: string;
  apply_instructions?: string;
  verification_method?: string;
  verified_at?: string;
  verification_result?: 'pass' | 'fail' | 'partial';
  verification_evidence?: any;
  cms_platform?: string;
  llm_calls_used?: number;
  executed_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface AuditFinding {
  audit_kind: string;
  severity: string;
  finding_title: string;
  finding_detail?: string;
  recommendation?: string;
  evidence?: any;
}

/* ═══════════════════════════════════════════════════════════════
   CMS DETECTION
   Fetches the live page and reads fingerprints.
   Also accepts project-stored CMS info as a starting point.
═══════════════════════════════════════════════════════════════ */

export async function detectCms(
  url: string,
  hints?: { cms?: string; seoPlugin?: string },
): Promise<CmsContext> {
  const signals: string[] = [];

  // Trust stored project context if already set and specific
  const stored = (hints?.cms || '').toLowerCase();
  const storedPlugin = (hints?.seoPlugin || '').toLowerCase();
  if (stored && stored !== 'unknown' && stored !== 'not set') {
    return {
      platform: normaliseCms(stored),
      seoPlugin: normaliseSeoPlugin(storedPlugin),
      confidence: 90,
      signals: [`Project context: ${hints?.cms}`],
      adminPath: getAdminPath(normaliseCms(stored)),
    };
  }

  // Fetch the live page
  let html = '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SEOSeason/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) html = await res.text();
  } catch { /* detection still runs on empty html */ }

  // WordPress
  if (/wp-content\b|wp-includes\b/i.test(html)) { signals.push('wp-content in HTML'); }
  if (/name="generator"[^>]+WordPress/i.test(html)) signals.push('WordPress generator meta');
  if (/class="wp-/i.test(html)) signals.push('wp- CSS classes');
  if (signals.some(s => s.includes('WordPress') || s.includes('wp-'))) {
    const hasYoast = /yoast|Yoast/i.test(html);
    const hasRankMath = /rank-math|rankmath/i.test(html);
    const hasAioseo = /aioseo/i.test(html);
    const seoPlugin: SeoPlugin = hasYoast ? 'yoast' : hasRankMath ? 'rankmath' : hasAioseo ? 'aioseo' : 'unknown';
    return { platform: 'wordpress', seoPlugin, confidence: 97, signals, adminPath: '/wp-admin' };
  }

  // Webflow
  if (/data-wf-site|webflow\.com/i.test(html)) signals.push('Webflow attribute');
  if (/x-wf-page|generator.*webflow/i.test(html)) signals.push('Webflow generator');
  if (signals.some(s => s.includes('Webflow'))) {
    return { platform: 'webflow', seoPlugin: 'none', confidence: 97, signals, adminPath: 'https://webflow.com/dashboard' };
  }

  // Squarespace
  if (/squarespace-cdn\.com|sqs-layout|static[0-9]*\.squarespace\.com/i.test(html)) signals.push('Squarespace CDN');
  if (signals.some(s => s.includes('Squarespace'))) {
    return { platform: 'squarespace', seoPlugin: 'none', confidence: 97, signals, adminPath: '/config' };
  }

  // Wix
  if (/parastorage\.com|wixsite\.com|_wix_|wix-/i.test(html)) signals.push('Wix storage/domain');
  if (signals.some(s => s.includes('Wix'))) {
    return { platform: 'wix', seoPlugin: 'none', confidence: 95, signals, adminPath: 'https://manage.wix.com' };
  }

  // Shopify
  if (/cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html)) signals.push('Shopify CDN/variable');
  if (signals.some(s => s.includes('Shopify'))) {
    return { platform: 'shopify', seoPlugin: 'none', confidence: 97, signals, adminPath: '/admin' };
  }

  // HubSpot
  if (/hs-sites\.com|hubspot\.com|hbspt\.|hs-beacon/i.test(html)) signals.push('HubSpot script/domain');
  if (signals.some(s => s.includes('HubSpot'))) {
    return { platform: 'hubspot', seoPlugin: 'none', confidence: 95, signals, adminPath: 'https://app.hubspot.com' };
  }

  // Drupal
  if (/Drupal\.settings|\/sites\/default\/files|drupal\.js|drupal-/i.test(html)) signals.push('Drupal variable/path');
  if (signals.some(s => s.includes('Drupal'))) {
    return { platform: 'drupal', seoPlugin: 'unknown', confidence: 92, signals, adminPath: '/admin' };
  }

  // Ghost
  if (/ghost\.io|data-ghost|content\.ghost\.io/i.test(html)) signals.push('Ghost CDN/attribute');
  if (signals.some(s => s.includes('Ghost'))) {
    return { platform: 'ghost', seoPlugin: 'none', confidence: 93, signals, adminPath: '/ghost' };
  }

  // Framer
  if (/framer\.com|framer-motion|framerusercontent/i.test(html)) signals.push('Framer asset/script');
  if (signals.some(s => s.includes('Framer'))) {
    return { platform: 'framer', seoPlugin: 'none', confidence: 93, signals, adminPath: 'https://framer.com' };
  }

  // Custom / unknown
  return {
    platform: html.length > 0 ? 'custom' : 'unknown',
    seoPlugin: 'unknown',
    confidence: html.length > 0 ? 60 : 0,
    signals: html.length > 0 ? ['No known CMS fingerprint found — likely custom-built'] : ['Page could not be fetched'],
    adminPath: '',
    notes: 'Ask your developer or hosting provider which CMS/technology this site uses.',
  };
}

function normaliseCms(s: string): CmsPlatform {
  const m: Record<string, CmsPlatform> = {
    wordpress: 'wordpress', wp: 'wordpress',
    webflow: 'webflow',
    squarespace: 'squarespace',
    wix: 'wix',
    shopify: 'shopify',
    hubspot: 'hubspot',
    drupal: 'drupal',
    joomla: 'joomla',
    ghost: 'ghost',
    framer: 'framer',
    custom: 'custom',
  };
  for (const [k, v] of Object.entries(m)) {
    if (s.toLowerCase().includes(k)) return v;
  }
  return 'unknown';
}

function normaliseSeoPlugin(s: string): SeoPlugin {
  if (/yoast/i.test(s)) return 'yoast';
  if (/rank.?math/i.test(s)) return 'rankmath';
  if (/aioseo|all.in.one/i.test(s)) return 'aioseo';
  if (/seopress/i.test(s)) return 'seopress';
  if (/squirrly/i.test(s)) return 'squirrly';
  return 'unknown';
}

function getAdminPath(p: CmsPlatform): string {
  const paths: Record<CmsPlatform, string> = {
    wordpress: '/wp-admin',
    webflow: 'https://webflow.com/dashboard',
    squarespace: '/config',
    wix: 'https://manage.wix.com',
    shopify: '/admin',
    hubspot: 'https://app.hubspot.com',
    drupal: '/admin',
    joomla: '/administrator',
    ghost: '/ghost',
    framer: 'https://framer.com',
    custom: '',
    unknown: '',
  };
  return paths[p] || '';
}

/* ═══════════════════════════════════════════════════════════════
   CMS-SPECIFIC STEP-BY-STEP INSTRUCTIONS
   Written in plain English for non-technical users.
   Every path, button name, and field is spelled out exactly.
═══════════════════════════════════════════════════════════════ */

function buildCmsInstructions(
  taskType: string,
  cms: CmsContext,
  fixData: { fixCode?: string; pageUrl?: string; keyword?: string; h1?: string; newH1?: string; paaQuestions?: string[] },
): string {
  const { platform, seoPlugin } = cms;
  const baseUrl = fixData.pageUrl ? new URL(fixData.pageUrl).origin : 'https://yoursite.com';
  const pagePath = fixData.pageUrl ? new URL(fixData.pageUrl).pathname : '/mobile-forms';
  const adminUrl = cms.adminPath.startsWith('http') ? cms.adminPath : baseUrl + cms.adminPath;

  const lines: string[] = [];

  // ── Prerequisite block ───────────────────────────────────────
  lines.push('## What you need before starting');
  switch (platform) {
    case 'wordpress':
      lines.push(`- Log in to your WordPress dashboard: **${adminUrl}**`);
      lines.push('- You need "Editor" or "Administrator" access level');
      if (seoPlugin === 'yoast') lines.push('- You have Yoast SEO installed — these instructions use Yoast');
      if (seoPlugin === 'rankmath') lines.push('- You have RankMath SEO installed — these instructions use RankMath');
      break;
    case 'webflow':
      lines.push(`- Log in to Webflow: **${adminUrl}**`);
      lines.push('- Open your project, go to the Designer');
      lines.push('- Find the page: usually listed in the Pages panel on the left sidebar');
      break;
    case 'squarespace':
      lines.push(`- Log in to Squarespace: **${baseUrl}/config**`);
      lines.push('- Go to Pages → click the page you want to edit');
      break;
    case 'wix':
      lines.push('- Log in to Wix at **https://manage.wix.com**');
      lines.push('- Click "Edit Site" on your website');
      break;
    case 'shopify':
      lines.push(`- Log in to Shopify: **${adminUrl}**`);
      lines.push('- Go to Online Store → Pages (for content pages) or Themes (for template changes)');
      break;
    case 'hubspot':
      lines.push('- Log in to HubSpot: **https://app.hubspot.com**');
      lines.push('- Go to Marketing → Website → Website Pages');
      break;
    default:
      lines.push('- Ask your developer for access to the website files or admin panel');
      lines.push(`- You need access to edit the HTML of this page: **${fixData.pageUrl}**`);
  }
  lines.push('');

  // ── Task-specific instructions ───────────────────────────────
  switch (taskType) {

    // ────────────────────────────────────────────────────────────
    case 'lazy_loading': {
      lines.push('## Steps to add lazy loading to images');
      lines.push('');
      lines.push('> **What this does:** tells the browser to only load images when a visitor scrolls down to them, instead of loading all 20 images the moment the page opens. This makes the page load faster — especially on mobile.');
      lines.push('');

      switch (platform) {
        case 'wordpress':
          lines.push('**WordPress handles this automatically since version 5.5.** Here\'s how to check and ensure it\'s working:');
          lines.push('');
          lines.push('1. In your WordPress dashboard, go to **Settings → Media**');
          lines.push('2. If you see a "Lazy Loading" option, make sure it is enabled');
          lines.push('3. If you use a performance plugin, check these settings:');
          lines.push('   - **WP Rocket:** Settings → Media → Lazy Load Images → enable it');
          lines.push('   - **W3 Total Cache:** Performance → Browser Cache → enable lazy load');
          lines.push('   - **Autoptimize:** Extra → "Lazy-load images" checkbox');
          lines.push('   - **Imagify / ShortPixel / Smush:** these add their own lazy loading setting in their plugin options');
          lines.push('4. If you don\'t use a plugin, WordPress should add it automatically. To verify, right-click any image on your page → Inspect → look for `loading="lazy"` in the HTML');
          break;

        case 'webflow':
          lines.push('**Webflow added native lazy loading in 2022. Here\'s how to check and set it:**');
          lines.push('');
          lines.push('1. In the Webflow Designer, click on any image on your page');
          lines.push('2. In the right panel, look for **"Loading"** under the Image settings');
          lines.push('3. Change the dropdown from **"Eager"** to **"Lazy"** for all images that are below the main visible area');
          lines.push('4. Keep the very first/hero image as "Eager" (so it loads immediately)');
          lines.push('5. Repeat for each image on the page');
          lines.push('6. Click **Publish** when done');
          break;

        case 'squarespace':
          lines.push('**Squarespace doesn\'t have a native lazy loading toggle, so we\'ll use their Code Injection feature:**');
          lines.push('');
          lines.push('1. Go to **Settings → Advanced → Code Injection**');
          lines.push('2. In the **Footer** box, paste this code:');
          lines.push('```html');
          lines.push('<script>');
          lines.push('document.querySelectorAll("img:not([loading])").forEach(function(img) {');
          lines.push('  if (img.getBoundingClientRect().top > window.innerHeight) {');
          lines.push('    img.setAttribute("loading", "lazy");');
          lines.push('  }');
          lines.push('});');
          lines.push('</script>');
          lines.push('```');
          lines.push('3. Click **Save** at the top');
          lines.push('4. Visit your live page and verify images below the fold load as you scroll');
          break;

        case 'wix':
          lines.push('**Wix handles lazy loading automatically for most images.** To make sure it\'s enabled:');
          lines.push('');
          lines.push('1. In the Wix Editor, click on any image');
          lines.push('2. Click **Settings** (gear icon) in the toolbar above the image');
          lines.push('3. Under **Loading**, select **Lazy** (if the option exists)');
          lines.push('4. For images added via the Image block: Wix applies lazy loading automatically');
          lines.push('5. Click **Publish** when done');
          break;

        case 'shopify':
          lines.push('1. In your Shopify admin, go to **Online Store → Themes**');
          lines.push('2. Click **Actions → Edit code** next to your active theme');
          lines.push('3. In the file tree on the left, open **Sections** or search for the template containing your page images');
          lines.push('4. Find your `<img>` tags and add `loading="lazy"` to each one below the fold');
          lines.push('5. Example change:');
          lines.push('   - Before: `<img src="{{ image.src }}" alt="{{ image.alt }}">`');
          lines.push('   - After:  `<img src="{{ image.src }}" alt="{{ image.alt }}" loading="lazy">`');
          lines.push('6. Click **Save**');
          break;

        default:
          lines.push('Share the code block below with your developer. They need to add `loading="lazy"` to image tags:');
          lines.push('');
          if (fixData.fixCode) {
            lines.push('```html');
            lines.push(fixData.fixCode.slice(0, 2000));
            lines.push('```');
          }
      }
      break;
    }

    // ────────────────────────────────────────────────────────────
    case 'faq_schema': {
      lines.push('## Steps to add FAQ schema (structured data)');
      lines.push('');
      lines.push('> **What this does:** tells Google exactly which questions and answers are on your page. This unlocks "People Also Ask" box appearances and makes your page more likely to be cited in AI Overviews. It\'s invisible code — visitors don\'t see it.');
      lines.push('');

      switch (platform) {
        case 'wordpress':
          if (seoPlugin === 'yoast') {
            lines.push('**You have Yoast SEO — it handles FAQ schema through the Block Editor:**');
            lines.push('');
            lines.push('1. Go to **Pages → All Pages** in your WordPress dashboard');
            lines.push('2. Find your mobile forms page and click **Edit**');
            lines.push('3. In the Block Editor (Gutenberg), click the **"+"** button to add a new block');
            lines.push('4. Search for **"FAQ"** and select the **Yoast FAQ block**');
            lines.push('5. Add each question and answer pair:');
            if (fixData.paaQuestions?.length) {
              fixData.paaQuestions.forEach((q, i) => lines.push(`   - Question ${i + 1}: ${q}`));
            }
            lines.push('6. Each answer should be 40–80 words and directly answer the question');
            lines.push('7. Click **Update** (top right) to save');
            lines.push('8. Yoast will automatically add the FAQPage JSON-LD schema to your page');
          } else if (seoPlugin === 'rankmath') {
            lines.push('**You have RankMath SEO — it has a built-in FAQ Schema block:**');
            lines.push('');
            lines.push('1. Go to **Pages → All Pages** in your WordPress dashboard');
            lines.push('2. Find your mobile forms page and click **Edit**');
            lines.push('3. Click **"+"** to add a new block → search for **"RankMath FAQ"**');
            lines.push('4. Add each question and answer from the list above');
            lines.push('5. Click **Update** to save');
          } else {
            lines.push('**Option 1 (recommended): Install a free plugin**');
            lines.push('1. Go to **Plugins → Add New** in your WordPress dashboard');
            lines.push('2. Search for **"Schema & Structured Data"** → install and activate it');
            lines.push('3. Go to the plugin settings → Add Schema → FAQPage type');
            lines.push('');
            lines.push('**Option 2: Add the code manually to your page**');
            lines.push('1. Go to **Pages → All Pages** → edit your mobile forms page');
            lines.push('2. Add a **Custom HTML block** at the end of the page');
            lines.push('3. Paste the code from the "Fix Code" section above');
            lines.push('4. Click **Update** to save');
          }
          break;

        case 'webflow':
          lines.push('1. Open your project in the **Webflow Designer**');
          lines.push('2. Click on the **Pages** icon in the left toolbar → select your mobile forms page');
          lines.push('3. Click the **gear icon ⚙** next to the page name → **Page Settings**');
          lines.push('4. Scroll down to **Custom Code → Head Code**');
          lines.push('5. Paste the JSON-LD code from the "Fix Code" section into that box');
          lines.push('6. Click **Save** → then **Publish** your site');
          break;

        case 'squarespace':
          lines.push('1. Go to **Pages** → click the page you want to edit');
          lines.push('2. Hover over the page and click the **gear icon ⚙** → **Page Settings**');
          lines.push('3. Click the **Advanced** tab');
          lines.push('4. In the **Page Header Code Injection** box, paste the JSON-LD code from "Fix Code"');
          lines.push('5. Click **Save**');
          break;

        case 'wix':
          lines.push('1. In your **Wix Editor**, click on the page you want to edit');
          lines.push('2. Go to **Page → SEO (Google) → Additional SEO Settings**');
          lines.push('3. Scroll to **Structured Data Markup**');
          lines.push('4. Click **Add Item** and paste the JSON-LD code from "Fix Code"');
          lines.push('5. Click **Apply** → then **Publish**');
          break;

        case 'shopify':
          lines.push('1. In Shopify admin, go to **Online Store → Themes → Actions → Edit Code**');
          lines.push('2. Open `layout/theme.liquid`');
          lines.push('3. Find `</head>` near the top of the file');
          lines.push('4. Paste the JSON-LD code from "Fix Code" just before `</head>`');
          lines.push('5. Click **Save**');
          lines.push('');
          lines.push('⚠️ If this schema is only for one page (not site-wide), ask your developer to add it conditionally.');
          break;

        case 'hubspot':
          lines.push('1. In HubSpot, go to **Marketing → Website → Website Pages**');
          lines.push('2. Find and click your mobile forms page → click **Edit**');
          lines.push('3. Click **Settings** tab at the top → **Advanced Options**');
          lines.push('4. Find **Head HTML** and paste the JSON-LD code from "Fix Code"');
          lines.push('5. Click **Update** → **Publish**');
          break;

        default:
          lines.push('Share the JSON-LD code with your developer. They need to paste it inside the `<head>` section of this specific page\'s HTML.');
          lines.push('');
          lines.push('If you have access to the HTML directly, find the `</head>` tag and paste the code just before it.');
      }
      break;
    }

    // ────────────────────────────────────────────────────────────
    case 'h1_update': {
      lines.push('## Steps to update the H1 heading');
      lines.push('');
      lines.push('> **What this does:** the H1 is the main large heading on your page (not the browser tab title — that\'s the "Title tag"). Google reads it as the clearest signal of what the page is about. Currently it says "Best Mobile Data Collection Apps for Business" which doesn\'t contain "mobile forms" — the keyword you\'re trying to rank for.');
      lines.push('');

      switch (platform) {
        case 'wordpress':
          lines.push('1. Go to **Pages → All Pages** in your WordPress dashboard');
          lines.push('2. Find your mobile forms page and click **Edit**');
          lines.push('3. At the very top of the page editor, you\'ll see the main heading in a large text box — that\'s the H1');
          lines.push('4. Click on it and change it to one of the options generated above');
          lines.push('5. **Before saving:** open GSC → Performance → Pages → click this URL → check the Queries tab to see what keywords it already ranks for. If "mobile data collection" appears there with impressions, choose an H1 that keeps that phrase too.');
          lines.push('6. Click **Update** (top right)');
          break;

        case 'webflow':
          lines.push('1. Open your page in the **Webflow Designer**');
          lines.push('2. Click on the main heading at the top of the page');
          lines.push('3. Double-click to edit the text');
          lines.push('4. Change it to one of the options generated above');
          lines.push('5. In the right panel, confirm the element type shows **"H1"** (not H2 or H3)');
          lines.push('6. Click **Publish**');
          break;

        case 'squarespace':
          lines.push('1. Go to **Pages** → click your mobile forms page → click **Edit**');
          lines.push('2. Click on the main title area at the top of the page');
          lines.push('3. Click the text to edit it');
          lines.push('4. Change it to one of the options above');
          lines.push('5. Click **Save** (top right)');
          lines.push('');
          lines.push('⚠️ In Squarespace, make sure the text style is set to **Heading 1** in the text formatting toolbar.');
          break;

        case 'wix':
          lines.push('1. Open your site in the **Wix Editor**');
          lines.push('2. Click on the main heading text on your mobile forms page');
          lines.push('3. Click **Edit Text**');
          lines.push('4. Change the text to one of the options above');
          lines.push('5. With the text selected, go to **Text Settings** and ensure the HTML tag is set to **H1**');
          lines.push('6. Click **Publish**');
          break;

        default:
          lines.push('1. Find the `<h1>` tag in your page\'s HTML');
          lines.push('2. Change the text between the opening and closing tags');
          lines.push('3. Example:');
          lines.push(`   - Before: \`<h1>Best Mobile Data Collection Apps for Business</h1>\``);
          lines.push(`   - After:  \`<h1>[new heading from Fix Code above]</h1>\``);
          lines.push('4. Save and publish your changes');
      }
      break;
    }

    // ────────────────────────────────────────────────────────────
    case 'first_para': {
      lines.push('## Steps to update the opening paragraph');
      lines.push('');
      lines.push('> **What this does:** the first paragraph is what Google reads to understand the page topic, and it\'s what potential visitors see first. Currently it\'s a generic tagline. Rewriting it to mention "mobile forms" directly and state who the page is for will improve both rankings and click-through rate.');
      lines.push('');

      switch (platform) {
        case 'wordpress':
          lines.push('1. Go to **Pages → All Pages** in your WordPress dashboard');
          lines.push('2. Find your mobile forms page → click **Edit**');
          lines.push('3. Scroll to the first paragraph of text on the page (below the heading)');
          lines.push('4. Click on it to select the text block');
          lines.push('5. Select all the existing text (Ctrl+A or Cmd+A within that block)');
          lines.push('6. Replace it with the new paragraph from "Fix Code" above');
          lines.push('7. Click **Update** to save');
          break;

        case 'webflow':
          lines.push('1. Open your page in the **Webflow Designer**');
          lines.push('2. Click on the first paragraph of text on the page');
          lines.push('3. Double-click to enter edit mode');
          lines.push('4. Select all the text (Ctrl+A or Cmd+A) and replace with the new text above');
          lines.push('5. Click outside to deselect → then **Publish**');
          break;

        case 'squarespace':
          lines.push('1. Go to **Pages** → click your mobile forms page → click **Edit**');
          lines.push('2. Click on the first text block below the heading');
          lines.push('3. Select all the text and replace with the new paragraph above');
          lines.push('4. Click **Save**');
          break;

        case 'wix':
          lines.push('1. Open the **Wix Editor** → navigate to your mobile forms page');
          lines.push('2. Click on the first paragraph text element');
          lines.push('3. Click **Edit Text** → select all → paste the new text from above');
          lines.push('4. Click **Publish**');
          break;

        default:
          lines.push('1. Open your page template or content file in your editor');
          lines.push('2. Find the first `<p>` tag after the H1');
          lines.push('3. Replace its content with the new paragraph from "Fix Code" above');
          lines.push('4. Save and publish');
      }
      break;
    }

    // ────────────────────────────────────────────────────────────
    case 'h2_section': {
      const questions = fixData.paaQuestions || ["What's the best app to fill out forms?"];
      lines.push(`## Steps to add ${questions.length} new H2 section(s)`);
      lines.push('');
      lines.push('> **What this does:** Google shows "People Also Ask" questions in search results. If your page has a heading and answer for those exact questions, Google may show your page as the answer — both in the PAA box and in AI Overviews. This is one of the highest-leverage SEO changes for this page.');
      lines.push('');
      lines.push('Questions to add:');
      questions.forEach((q, i) => lines.push(`- ${i + 1}. ${q}`));
      lines.push('');

      switch (platform) {
        case 'wordpress':
          lines.push('1. Go to **Pages → All Pages** in your WordPress dashboard');
          lines.push('2. Find your mobile forms page → click **Edit**');
          lines.push('3. Click at the end of your existing content (below the last paragraph)');
          lines.push('4. Add a new **Heading block**: click the **"+"** button → search for "Heading"');
          lines.push('5. Set the heading level to **H2** in the toolbar');
          lines.push(`6. Type the heading: **"${questions[0]}"** (use the exact wording — Google matches it)`);
          lines.push('7. Below it, add a **Paragraph block** with the answer from "Fix Code" above');
          lines.push('8. The answer should start with a direct 40-80 word response, then expand');
          lines.push('9. Repeat for each question');
          lines.push('10. Click **Update** to save');
          lines.push('');
          lines.push('⚠️ After publishing, wait 24 hours, then add FAQPage schema (separate task) to register these Q&As with Google.');
          break;

        case 'webflow':
          lines.push('1. Open your page in the **Webflow Designer**');
          lines.push('2. Click at the end of your content area');
          lines.push('3. Add a new element: drag in a **Heading** component from the left panel');
          lines.push('4. Set it to **H2** using the tag selector in the right panel');
          lines.push(`5. Type the heading text: **"${questions[0]}"**`);
          lines.push('6. Below it, add a **Text Block** with the answer from "Fix Code"');
          lines.push('7. Repeat for each question → then **Publish**');
          break;

        case 'squarespace':
          lines.push('1. Edit your mobile forms page');
          lines.push('2. Click at the end of your last content block');
          lines.push('3. Click the **+** button to add a new block → choose **Text**');
          lines.push(`4. Type the heading **"${questions[0]}"** → select it → set formatting to **Heading 2**`);
          lines.push('5. Press Enter and type the answer paragraph below it');
          lines.push('6. Repeat for each additional question');
          lines.push('7. Click **Save**');
          break;

        case 'wix':
          lines.push('1. Open the **Wix Editor** → navigate to your mobile forms page');
          lines.push('2. Click **Add Elements** (+ icon) → **Text** → drag a **Heading** onto the page');
          lines.push('3. Set it as **Heading 2** in Text Settings');
          lines.push(`4. Type: **"${questions[0]}"**`);
          lines.push('5. Add a text block below for the answer');
          lines.push('6. Repeat for each question → **Publish**');
          break;

        default:
          lines.push('Share the full HTML from "Fix Code" above with your developer.');
          lines.push('They need to paste it into the page\'s HTML, inside the main content area,');
          lines.push('after the existing content and before the closing `</main>` or `</article>` tag.');
      }
      break;
    }

    // ────────────────────────────────────────────────────────────
    case 'script_defer':
    case 'lcp_fix': {
      lines.push('## Steps to fix JavaScript blocking (performance fix)');
      lines.push('');
      lines.push('> **What this does:** JavaScript files are loading before the page can show any content — causing the 16+ second load time on mobile. Adding "defer" tells the browser: load the JS after the page is visible, not before. This is the single most impactful fix for your mobile load time.');
      lines.push('');
      lines.push('⚠️ **This is the most technical task in the list. If you are not comfortable with code, stop here and show the "Fix Code" section to your developer.** The steps below are for those who have direct file/template access.');
      lines.push('');

      switch (platform) {
        case 'wordpress':
          lines.push('**Best approach: use a performance plugin (no coding needed)**');
          lines.push('');
          lines.push('**Option A — WP Rocket (paid, easiest):**');
          lines.push('1. In WordPress admin, go to **Settings → WP Rocket**');
          lines.push('2. Click the **File Optimization** tab');
          lines.push('3. Under JavaScript, enable **"Defer JS execution"** and **"Delay JS execution"**');
          lines.push('4. Click **Save Changes**');
          lines.push('5. Clear WP Rocket\'s cache: click **Purge Cache** at the top of the screen');
          lines.push('');
          lines.push('**Option B — Autoptimize (free):**');
          lines.push('1. Go to **Plugins → Add New** → search **"Autoptimize"** → Install & Activate');
          lines.push('2. Go to **Settings → Autoptimize**');
          lines.push('3. Under **JavaScript Options**, check **"Defer scripts"**');
          lines.push('4. Click **Save Changes and Empty Cache**');
          lines.push('');
          lines.push('**Option C — Manual (ask your developer):**');
          lines.push('Show your developer the "Fix Code" section above. They need to add `defer` attribute to the `<script>` tags identified.');
          break;

        case 'webflow':
          lines.push('1. Open your project in the **Webflow Designer**');
          lines.push('2. Click **Page Settings** (gear ⚙ next to page name)');
          lines.push('3. Scroll to **Custom Code → Before `</body>` tag**');
          lines.push('4. If you have any third-party scripts (analytics, chat, etc.) in the Head section, move them here instead');
          lines.push('5. This ensures they load after the page content is visible');
          lines.push('6. For external scripts already there, add `defer` to each: `<script defer src="..."></script>`');
          lines.push('7. Click **Save → Publish**');
          break;

        case 'squarespace':
          lines.push('1. Go to **Settings → Advanced → Code Injection**');
          lines.push('2. Any scripts in your **Header** section — move them to the **Footer** section');
          lines.push('3. Add `defer` to any remaining header scripts: `<script defer src="..."></script>`');
          lines.push('4. Click **Save**');
          lines.push('');
          lines.push('Also: check **Settings → Analytics** — disable any unused analytics integrations as they add blocking scripts.');
          break;

        case 'wix':
          lines.push('1. In the Wix Editor, go to **Settings → Advanced → Custom Code**');
          lines.push('2. Review all code snippets — any scripts loading in the **Head** section should be moved to **Body - end**');
          lines.push('3. Click on each Head script → change placement to **Body - end**');
          lines.push('4. Click **Apply** for each → then **Publish**');
          break;

        default:
          lines.push('This requires direct HTML/template access. Show the "Fix Code" section to your developer.');
          lines.push('They need to:');
          lines.push('1. Open the main template file (e.g. layout.html, base.html, header.php)');
          lines.push('2. Find the `<script>` tags listed in the fix');
          lines.push('3. Add the `defer` attribute to each one');
          lines.push('4. Save and deploy');
      }
      break;
    }

    // ────────────────────────────────────────────────────────────
    case 'image_format': {
      lines.push('## Steps to convert images to modern format (webp/avif)');
      lines.push('');
      lines.push('> **What this does:** webp images are typically 30-50% smaller than jpg/png for the same visual quality. On a page with 20 images, this meaningfully reduces load time — especially on slow mobile connections.');
      lines.push('');

      switch (platform) {
        case 'wordpress':
          lines.push('**Use an image optimization plugin — this is a one-click setup:**');
          lines.push('');
          lines.push('**Option A — Imagify (free tier, easiest):**');
          lines.push('1. Go to **Plugins → Add New** → search **"Imagify"** → Install & Activate');
          lines.push('2. Go to **Settings → Imagify**');
          lines.push('3. Under **Optimization Options**, check **"Convert to WebP"**');
          lines.push('4. Click **Bulk Optimize** to convert your existing images');
          lines.push('5. Imagify will automatically convert future uploads too');
          lines.push('');
          lines.push('**Option B — ShortPixel (free tier):**');
          lines.push('1. Install **ShortPixel Image Optimizer** plugin');
          lines.push('2. Go to **Settings → ShortPixel**');
          lines.push('3. Enable **"Create WebP versions of images"**');
          lines.push('4. Run the bulk optimization');
          lines.push('');
          lines.push('**Option C — Smush (free tier):**');
          lines.push('1. Install **Smush** plugin');
          lines.push('2. In the Smush dashboard, enable **"WebP Conversion"**');
          break;

        case 'webflow':
          lines.push('Good news: **Webflow automatically serves WebP** when a visitor\'s browser supports it (which is 95%+ of browsers in 2026). You don\'t need to do anything.');
          lines.push('');
          lines.push('To verify: Right-click an image on your live page → Open image in new tab → check the URL ends in `.webp` or the Content-Type header says `image/webp`.');
          break;

        case 'squarespace':
          lines.push('**Squarespace automatically converts images to WebP** for compatible browsers since 2021. No action needed.');
          lines.push('');
          lines.push('If you see legacy format images, they may be from older uploads. Re-uploading them will trigger WebP conversion.');
          break;

        case 'shopify':
          lines.push('**Shopify automatically serves WebP** via its CDN for browsers that support it. No action needed.');
          lines.push('');
          lines.push('To serve AVIF as well, consider using a third-party image CDN like Cloudflare Images.');
          break;

        default:
          lines.push('Show the bash conversion script in "Fix Code" to your developer.');
          lines.push('They can run it locally to convert images, then re-upload the webp versions.');
          lines.push('');
          lines.push('Alternatively: sign up for **Cloudflare Images** or **Cloudinary** (both have free tiers) to serve format-on-demand without touching your files.');
      }
      break;
    }

    // ────────────────────────────────────────────────────────────
    case 'gsc_indexing': {
      lines.push('## Steps to request Google indexing');
      lines.push('');
      lines.push('> **What this does:** Google hasn\'t listed your page in its search index yet (or it\'s there with zero impressions). Requesting indexing tells Google to crawl and add it. Without this, no SEO improvement matters — the page simply doesn\'t exist in Google Search.');
      lines.push('');
      lines.push('**You need:** access to Google Search Console for this website. If you don\'t have it, contact the person who manages your Google account or ask your developer to set it up.');
      lines.push('');
      lines.push('1. Go to **Google Search Console**: https://search.google.com/search-console');
      lines.push('2. Select the property for your website (make sure it\'s the right domain)');
      lines.push('3. In the top search bar, paste your page URL:');
      lines.push(`   \`${fixData.pageUrl || 'https://yoursite.com/mobile-forms'}\``);
      lines.push('4. Press **Enter** — GSC will check if the URL is indexed');
      lines.push('5. If it shows **"URL is not on Google"**:');
      lines.push('   - Click **"Request Indexing"** button');
      lines.push('   - Google will crawl the page within 24-48 hours');
      lines.push('6. If it shows **"URL is on Google"**:');
      lines.push('   - Your page IS indexed — the issue is zero impressions for this keyword');
      lines.push('   - This is a ranking problem, not an indexing problem');
      lines.push('   - The LCP fix (Task 1) is the priority — you can\'t rank if the page loads in 16 seconds');
      lines.push('7. Come back in 2-3 days and check if impressions have appeared in GSC → Performance');
      break;
    }

    // ────────────────────────────────────────────────────────────
    case 'date_modified_schema': {
      lines.push('## Steps to add dateModified to your schema');
      lines.push('');
      lines.push('> **What this does:** tells Google when the page was last genuinely updated. This helps Google treat your page as "fresh" content, which matters for queries where recency is a factor. Currently, only the Last-Modified HTTP header signals freshness — that\'s unreliable because it can be triggered by a server restart without any content change.');
      lines.push('');
      switch (platform) {
        case 'wordpress':
          if (seoPlugin === 'yoast') {
            lines.push('1. Go to **Pages → All Pages** → edit your mobile forms page');
            lines.push('2. In the Yoast SEO box at the bottom, click the **Schema** tab');
            lines.push('3. Under **Article type**, select **Web Page** or **Article**');
            lines.push('4. Yoast will automatically include the `dateModified` field based on the WordPress last-modified date');
            lines.push('5. Also add a visible **"Last updated: [date]"** label near the top of your content so it\'s human-readable too');
          } else {
            lines.push('1. Edit your mobile forms page');
            lines.push('2. Add a **Custom HTML block** at the bottom of the page');
            lines.push('3. Paste the updated schema from "Fix Code" above');
            lines.push('4. Update the **page\'s modification date** in WordPress (click "Edit" on the date under the page title, change to today)');
            lines.push('5. Also add a visible "Last updated:" date line in the page content');
          }
          break;
        default:
          lines.push('1. Find the existing `<script type="application/ld+json">` block in your page\'s `<head>`');
          lines.push('2. Add the `dateModified` field shown in "Fix Code" above');
          lines.push('3. Also add a visible "Last updated: [date]" label on the page');
          lines.push('4. Save and publish');
      }
      break;
    }

    default:
      lines.push('## Steps to apply this fix');
      lines.push('');
      lines.push('Share the code in "Fix Code" with your developer, or follow the instructions in the Analysis section above.');
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## How to verify it worked');
  lines.push('After applying the fix, click **"Verify Fix on Live Page"** — Claude will re-fetch your page and confirm whether the change is in place.');

  return lines.join('\n');
}

/* ═══════════════════════════════════════════════════════════════
   PARSE FINDINGS → TASKS
═══════════════════════════════════════════════════════════════ */

export function parseFindingsToTasks(
  findings: AuditFinding[],
  opts: { projectId: string; campaignId?: string; auditRunId?: string; targetUrl?: string },
): DevTask[] {
  const tasks: DevTask[] = [];
  for (const f of findings) {
    const t = classifyFinding(f, opts);
    if (t) tasks.push(t);
  }
  const phaseOrder: Record<string, number> = { phase_0: 0, phase_2: 1, phase_3: 2 };
  const sevOrder:   Record<string, number> = { critical: 0, warning: 1, info: 2 };
  tasks.sort((a, b) => {
    const ph = (phaseOrder[a.phase] ?? 9) - (phaseOrder[b.phase] ?? 9);
    if (ph !== 0) return ph;
    const sv = (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9);
    if (sv !== 0) return sv;
    return a.priority - b.priority;
  });
  return tasks;
}

function classifyFinding(
  f: AuditFinding,
  opts: { projectId: string; campaignId?: string; auditRunId?: string; targetUrl?: string },
): DevTask | null {
  const base = {
    project_id: opts.projectId,
    campaign_id: opts.campaignId || null,
    audit_run_id: opts.auditRunId || null,
    target_url: opts.targetUrl,
    finding_title: f.finding_title,
    finding_detail: f.finding_detail,
    severity: (f.severity === 'red' ? 'critical' : f.severity === 'amber' ? 'warning' : 'info') as DevTask['severity'],
    status: 'pending' as const,
  };

  if (/MOBILE LCP.*exceeds/i.test(f.finding_title))
    return { ...base, phase: 'phase_0', category: 'performance', task_type: 'lcp_fix',
      title: 'Fix render-blocking JavaScript causing mobile LCP failure',
      description: `Mobile LCP is ${f.evidence?.lcp_ms ? (f.evidence.lcp_ms/1000).toFixed(1)+'s' : '16s+'}. TBT: ${f.evidence?.tbt_ms ? Math.round(f.evidence.tbt_ms)+'ms' : 'high'}. Fix JS blocking first — nothing else matters until this is resolved.`,
      priority: 1 };

  if (/TBT.*severe|severe.*TBT/i.test(f.finding_title))
    return { ...base, phase: 'phase_0', category: 'performance', task_type: 'script_defer',
      title: `Defer render-blocking scripts (${/MOBILE/i.test(f.finding_title) ? 'mobile' : 'desktop'} TBT ${f.evidence?.tbt_ms ? Math.round(f.evidence.tbt_ms)+'ms' : 'high'})`,
      description: 'Profile Long Tasks, identify blocking JS bundles, add defer/async.',
      priority: 2 };

  if (/Page not in GSC top pages/i.test(f.finding_title))
    return { ...base, phase: 'phase_0', category: 'indexing', task_type: 'gsc_indexing',
      title: 'Submit page for Google indexing (not found in GSC)',
      description: 'Page has 0 organic impressions. GSC URL Inspection → Request Indexing.',
      priority: 5 };

  if (/Lazy-loading.*low|loading.*lazy/i.test(f.finding_title))
    return { ...base, phase: 'phase_3', category: 'performance', task_type: 'lazy_loading',
      title: `Add lazy loading to images (${f.evidence?.total_images || 20} images, 0% lazy)`,
      description: 'Free performance win — no asset changes needed, just add loading="lazy" attribute.',
      priority: 30 };

  if (/modern image format|jpg\/png\/gif/i.test(f.finding_title))
    return { ...base, phase: 'phase_3', category: 'performance', task_type: 'image_format',
      title: `Convert ${f.evidence?.legacy_format || 12} images to webp/avif`,
      description: '30-50% file size reduction. Many CMS platforms handle this automatically.',
      priority: 31 };

  if (/FAQPage schema missing/i.test(f.finding_title))
    return { ...base, phase: 'phase_2', category: 'schema', task_type: 'faq_schema',
      title: 'Add FAQPage JSON-LD schema for PAA questions',
      description: `${f.evidence?.paa_count || 4} PAA questions on the SERP. Schema unlocks rich results + AI Overview citations.`,
      priority: 10 };

  if (/Content freshness.*authenticity/i.test(f.finding_title))
    return { ...base, phase: 'phase_3', category: 'schema', task_type: 'date_modified_schema',
      title: 'Add dateModified to schema + visible "Last updated" label',
      description: 'Current freshness signal (Last-Modified header) is unreliable. Add verified dateModified.',
      priority: 35 };

  if (/keyword.*present in only one.*title.*H1/i.test(f.finding_title))
    return { ...base, phase: 'phase_2', category: 'on_page', task_type: 'h1_update',
      title: 'Update H1 to include "mobile forms" keyword',
      description: 'H1 is partial match only. Claude generates 3 options that include the keyword naturally.',
      priority: 12 };

  if (/First paragraph weakly aligned/i.test(f.finding_title))
    return { ...base, phase: 'phase_2', category: 'on_page', task_type: 'first_para',
      title: 'Rewrite opening paragraph (18% keyword overlap)',
      description: 'Generic tagline as first paragraph. Claude rewrites it for search intent alignment.',
      priority: 15 };

  if (/PAA questions.*NOT addressed/i.test(f.finding_title)) {
    const u = Array.isArray(f.evidence?.unanswered) ? f.evidence.unanswered : [];
    return { ...base, phase: 'phase_2', category: 'content', task_type: 'h2_section',
      title: `Write ${u.length || 1} new H2 section(s) for unanswered PAA questions`,
      description: u.length > 0 ? `Missing: ${u.join(' | ')}` : 'Unanswered PAA questions = missed featured snippet opportunities.',
      priority: 11 };
  }

  return null;
}

/* ═══════════════════════════════════════════════════════════════
   EXECUTE TASK
═══════════════════════════════════════════════════════════════ */

export async function executeDevTask(
  task: DevTask,
  cmsOverride?: CmsContext,
): Promise<Partial<DevTask>> {
  // 1. Detect CMS if not provided
  const cms = cmsOverride || (await detectCms(task.target_url || ''));

  // 2. Fetch live page HTML
  let pageHtml = '';
  try {
    const res = await fetch(task.target_url || '', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOSeason/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const raw = await res.text();
      const headMatch = raw.match(/<head[\s\S]*?<\/head>/i)?.[0] || '';
      pageHtml = headMatch + '\n...\n' + raw.slice(0, 7000);
    }
  } catch { /* continue without HTML */ }

  // 3. Build Claude prompt
  const prompt = buildExecutorPrompt(task, pageHtml, cms);

  // 4. Call Claude
  let raw = '';
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
        model: MODEL, max_tokens: 3500,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    });
    callsMade++;
    const data = await resp.json() as any;
    raw = data?.content?.[0]?.text?.trim() || '';
  } catch (e: any) {
    return { status: 'failed', analysis: 'Claude API error: ' + e?.message, updated_at: new Date().toISOString() };
  }

  // 5. Parse Claude's JSON response
  let analysis = '', fixCode = '', fixLanguage = 'html', paaQuestions: string[] = [];
  try {
    const j = JSON.parse((raw.match(/\{[\s\S]+\}/) || ['{}'])[0]);
    analysis     = j.analysis     || raw.slice(0, 600);
    fixCode      = j.fix_code     || '';
    fixLanguage  = j.fix_language || 'html';
    paaQuestions = j.paa_questions || [];
  } catch {
    analysis = raw.slice(0, 800);
  }

  // 6. Build CMS-specific instructions
  const applyInstructions = buildCmsInstructions(task.task_type, cms, {
    fixCode,
    pageUrl: task.target_url,
    paaQuestions,
  });

  const verificationMethod = buildVerificationMethod(task.task_type, task.target_url || '');

  return {
    status: 'fix_ready',
    analysis,
    fix_code: fixCode,
    fix_language: fixLanguage,
    apply_instructions: applyInstructions,
    verification_method: verificationMethod,
    cms_platform: cms.platform,
    executed_at: new Date().toISOString(),
    llm_calls_used: callsMade,
    updated_at: new Date().toISOString(),
  };
}

function buildVerificationMethod(taskType: string, url: string): string {
  const methods: Record<string, string> = {
    lazy_loading:        `Right-click any image below the fold on ${url} → Inspect Element → check for loading="lazy". Or run: document.querySelectorAll('img[loading="lazy"]').length in browser console.`,
    faq_schema:          `Visit ${url} → right-click → View Page Source → search (Ctrl+F) for "FAQPage". Or test at https://validator.schema.org/?url=${encodeURIComponent(url)}`,
    h1_update:           `Visit ${url} → right-click → View Page Source → search for "<h1" → verify the new heading text is there.`,
    first_para:          `Visit ${url} and read the first paragraph — verify it contains "mobile forms" and starts with the searcher's problem.`,
    h2_section:          `Visit ${url} and scroll to the bottom — verify the new H2 heading is visible and readable.`,
    script_defer:        `Run Google PageSpeed Insights on ${url} (mobile) after deploying. Check if TBT has improved. New score should be < 300ms for "good".`,
    lcp_fix:             `Run Google PageSpeed Insights at https://pagespeed.web.dev on ${url} using Mobile mode. LCP should be below 4 seconds. Field data (CrUX) may take 2-4 weeks to update.`,
    image_format:        `Visit ${url} → right-click any image → "Open image in new tab" → check the URL ends in .webp or .avif.`,
    date_modified_schema:`Visit ${url} → View Page Source → search for "dateModified" → verify the date is present and correct.`,
    gsc_indexing:        `Go to Google Search Console → URL Inspection → paste ${url} → check status shows "URL is on Google".`,
  };
  return methods[taskType] || `Visit ${url} and verify the change is visible. Use View Page Source (Ctrl+U) to check the HTML.`;
}

/* ═══════════════════════════════════════════════════════════════
   CLAUDE EXECUTOR PROMPTS
   Generate the actual fix code. CMS context is already known;
   these prompts focus purely on generating the correct code.
═══════════════════════════════════════════════════════════════ */

function buildExecutorPrompt(task: DevTask, pageHtml: string, cms: CmsContext): { system: string; user: string } {
  const htmlBlock = pageHtml
    ? `LIVE PAGE HTML (truncated):\n\`\`\`html\n${pageHtml}\n\`\`\``
    : '[Page HTML not available — generate based on task context]';

  const system = `You are a senior web developer generating exact code fixes for SEO and performance issues.
CMS detected: ${cms.platform} | SEO plugin: ${cms.seoPlugin} | Confidence: ${cms.confidence}%

Your job: analyze the live HTML and generate ONLY the exact code needed. No explanations in the code itself.

Reply with ONLY valid JSON:
{
  "analysis": "2-3 sentences: what exactly is wrong on THIS page (reference actual elements/scripts/tags you see in the HTML)",
  "fix_code": "The exact code block to copy-paste. Complete and ready to use.",
  "fix_language": "html|json|javascript|bash",
  "paa_questions": ["array of PAA questions if this is an h2_section or faq_schema task, else empty array"]
}`;

  const taskCtx = `Task: ${task.title}\nURL: ${task.target_url}\nFinding: ${task.finding_title}\nDetail: ${(task.finding_detail || '').slice(0, 300)}`;

  const taskPrompts: Record<string, string> = {
    lcp_fix: `${taskCtx}\n\n${htmlBlock}\n\nFind all <script> tags in the <head> that lack defer or async. For each: show BEFORE and AFTER with defer added. Focus on third-party scripts (analytics, chat, tag managers) first — these are the safest to defer. Generate a complete diff block.`,
    script_defer: `${taskCtx}\n\n${htmlBlock}\n\nIdentify blocking <script> tags. Generate the modified versions with defer or async. Show which script src is being changed.`,
    lazy_loading: `${taskCtx}\n\n${htmlBlock}\n\nFind all <img> tags. Add loading="lazy" to images below the first 3. Keep the first 1-2 (hero images) as eager. Return the complete modified img tag list showing before→after.`,
    image_format: `${taskCtx}\n\n${htmlBlock}\n\nList all jpg/png/gif image URLs found. Generate: (1) a node.js script using sharp to convert them to webp, (2) example <picture> element showing webp with fallback for the first 3 images found.`,
    faq_schema: `${taskCtx}\n\n${htmlBlock}\n\nGenerate a complete FAQPage JSON-LD schema <script> block. Extract answers from the page HTML where available — this is a mobile forms software page (AlphaSoftware). Each answer must be 40-80 words, direct, factual. PAA questions: ${JSON.stringify(task.description?.match(/"([^"]+\?)"/g) || ['What are mobile forms?', 'Can you make a form on mobile?', "What's the best app to fill out forms?", 'Does forms have a mobile app?'])}`,
    h1_update: `${taskCtx}\n\n${htmlBlock}\n\nCurrent H1 is "Best Mobile Data Collection Apps for Business". Campaign keyword: "mobile forms". Generate exactly 3 H1 options that: include "mobile forms", maintain commercial/product intent, are 5-9 words. Rank them. Return all 3 in fix_code.`,
    first_para: `${taskCtx}\n\n${htmlBlock}\n\nCurrent first paragraph: "Capture accurate data anywhere, even offline, and instantly deliver it to the systems that run your business." Rewrite it: 60-100 words, contains "mobile forms", opens with searcher's problem, says who it's for, previews unique value. Return ONLY the new paragraph text in fix_code.`,
    h2_section: `${taskCtx}\n\n${htmlBlock}\n\nWrite complete H2 sections for the unanswered PAA questions in the task description. For each: write the H2 tag + 40-80 word opening answer + 250-400 word body (evaluation criteria, comparison, decision guidance). AlphaSoftware sells mobile forms software — include them as one option among others, honestly. Competitors to mention: JotForm, doForms, Zoho Forms. Return complete HTML ready to paste.`,
    date_modified_schema: `${taskCtx}\n\n${htmlBlock}\n\nFind the existing JSON-LD schema block. Add "dateModified": "${new Date().toISOString().slice(0,10)}" to it. Return the complete updated schema block. Also return the HTML for a small "Last updated: ${new Date().toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric'})}" label to add to the page.`,
    gsc_indexing: `${taskCtx}\n\n${htmlBlock}\n\nCheck the HTML for any indexing blockers: noindex meta tags, X-Robots-Tag, disallow in robots.txt references, canonical pointing elsewhere. Report what you find. If none found, say so explicitly.`,
  };

  return {
    system,
    user: taskPrompts[task.task_type] || `${taskCtx}\n\n${htmlBlock}\n\nGenerate the exact fix code for this task.`,
  };
}

/* ═══════════════════════════════════════════════════════════════
   VERIFY TASK
═══════════════════════════════════════════════════════════════ */

export async function verifyDevTask(task: DevTask): Promise<Partial<DevTask>> {
  const url = task.target_url || '';
  let pageHtml = '';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOSeason/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) pageHtml = await res.text();
  } catch (e: any) {
    return {
      status: 'failed',
      verification_result: 'fail',
      verification_evidence: { error: 'Could not fetch live page: ' + e?.message },
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const evidence: Record<string, any> = {};
  let result: 'pass' | 'fail' | 'partial' = 'fail';
  let message = '';

  switch (task.task_type) {
    case 'lazy_loading': {
      const lazyCount  = (pageHtml.match(/loading=["']lazy["']/gi) || []).length;
      const totalImgs  = (pageHtml.match(/<img\b/gi) || []).length;
      evidence.lazy_count = lazyCount; evidence.total_images = totalImgs;
      result = lazyCount === 0 ? 'fail' : lazyCount >= totalImgs * 0.5 ? 'pass' : 'partial';
      message = result === 'pass' ? `${lazyCount} of ${totalImgs} images now have loading="lazy"` : result === 'partial' ? `${lazyCount} of ${totalImgs} images lazy-loaded — apply to remaining images` : 'No lazy loading found yet — check if changes were published';
      break;
    }
    case 'faq_schema': {
      const hasFaq = /["']FAQPage["']/i.test(pageHtml);
      const hasLD  = /application\/ld\+json/i.test(pageHtml);
      evidence.has_faq_schema = hasFaq; evidence.has_json_ld = hasLD;
      result = hasFaq ? 'pass' : 'fail';
      message = hasFaq ? 'FAQPage JSON-LD schema detected on live page' : 'FAQPage schema not found yet — check if changes were published';
      break;
    }
    case 'h1_update': {
      const h1 = (pageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, '').trim() || '';
      evidence.h1_text = h1; evidence.has_keyword = /mobile forms/i.test(h1);
      result = evidence.has_keyword ? 'pass' : 'fail';
      message = evidence.has_keyword ? `H1 now reads: "${h1}"` : `H1 still reads: "${h1}" — "mobile forms" not found`;
      break;
    }
    case 'image_format': {
      const webp = (pageHtml.match(/\.webp/gi) || []).length;
      const avif = (pageHtml.match(/\.avif/gi) || []).length;
      evidence.webp_references = webp; evidence.avif_references = avif;
      result = (webp + avif) > 0 ? 'pass' : 'fail';
      message = (webp + avif) > 0 ? `Found ${webp} webp + ${avif} avif image references` : 'No webp/avif images detected yet';
      break;
    }
    case 'date_modified_schema': {
      const hasDM = /dateModified/i.test(pageHtml);
      evidence.has_date_modified = hasDM;
      result = hasDM ? 'pass' : 'fail';
      message = hasDM ? 'dateModified field found in schema' : 'dateModified not found in schema yet';
      break;
    }
    case 'script_defer':
    case 'lcp_fix': {
      const deferCount  = (pageHtml.match(/\bdefer\b/gi) || []).length;
      const asyncCount  = (pageHtml.match(/\basync\b/gi) || []).length;
      evidence.defer_count = deferCount; evidence.async_count = asyncCount;
      result = (deferCount + asyncCount) > 0 ? 'partial' : 'fail';
      message = (deferCount + asyncCount) > 0
        ? `Found ${deferCount} deferred + ${asyncCount} async scripts. Run PageSpeed Insights to confirm TBT improvement.`
        : 'No deferred scripts detected — check if changes were published';
      break;
    }
    case 'gsc_indexing': {
      evidence.note = 'GSC indexing cannot be verified by page fetch — check GSC directly';
      evidence.check_url = 'https://search.google.com/search-console/inspect';
      result = 'partial';
      message = 'Go to Google Search Console → URL Inspection → paste the URL → check if it shows "URL is on Google"';
      break;
    }
    default: {
      evidence.note = 'Manual verification recommended for this task type';
      result = 'partial';
      message = 'Check the live page manually to confirm the change is visible';
    }
  }

  evidence.message = message;
  return {
    status: result === 'pass' ? 'done' : 'applied',
    verification_result: result,
    verification_evidence: evidence,
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/* ═══════════════════════════════════════════════════════════════
   DB HELPERS
═══════════════════════════════════════════════════════════════ */

export async function saveTasks(tasks: DevTask[]): Promise<{ saved: number; error?: string }> {
  if (!tasks.length) return { saved: 0 };
  try {
    const rows = tasks.map(t => ({
      project_id: t.project_id, campaign_id: t.campaign_id || null,
      audit_run_id: t.audit_run_id || null, phase: t.phase, category: t.category,
      task_type: t.task_type, title: t.title, description: t.description || null,
      finding_ref: t.finding_ref || null, finding_title: t.finding_title || null,
      finding_detail: (t.finding_detail || '').slice(0, 2000), severity: t.severity,
      target_url: t.target_url || null, priority: t.priority, status: t.status,
    }));
    const { error } = await db().from('dev_tasks').insert(rows);
    if (error) return { saved: 0, error: error.message };
    return { saved: rows.length };
  } catch (e: any) { return { saved: 0, error: e?.message }; }
}

export async function updateTask(taskId: string, updates: Partial<DevTask>): Promise<void> {
  const sanitized: any = { ...updates, updated_at: new Date().toISOString() };
  delete sanitized.id;
  await db().from('dev_tasks').update(sanitized).eq('id', taskId);
}

export async function getTask(taskId: string): Promise<DevTask | null> {
  const { data } = await db().from('dev_tasks').select('*').eq('id', taskId).maybeSingle();
  return (data as DevTask) || null;
}

export async function getTasksForProject(projectId: string, opts?: { campaignId?: string }): Promise<DevTask[]> {
  let q = db().from('dev_tasks').select('*').eq('project_id', projectId);
  if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId);
  q = q.order('priority', { ascending: true }).order('created_at', { ascending: false });
  const { data } = await q;
  return (data as DevTask[]) || [];
}

export async function deleteProjectTasks(projectId: string, auditRunId?: string): Promise<void> {
  let q = db().from('dev_tasks').delete().eq('project_id', projectId);
  if (auditRunId) q = q.eq('audit_run_id', auditRunId);
  await q;
}

export async function detectCmsForProject(projectId: string): Promise<CmsContext | null> {
  try {
    const { data: proj } = await db().from('projects').select('url,cms,seo_plugin').eq('id', projectId).maybeSingle();
    if (!proj) return null;
    const url = (proj as any).url || '';
    const hints = { cms: (proj as any).cms, seoPlugin: (proj as any).seo_plugin };
    return detectCms(url, hints);
  } catch { return null; }
}
