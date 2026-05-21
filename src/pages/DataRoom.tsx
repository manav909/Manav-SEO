import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectSync } from '@/hooks/useProjectSync';
import { useSeasonAwareness } from '@/hooks/useSeasonAwareness';
import PortalNav from '@/components/PortalNav';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { seedV2DataRoom, aiFillPreview as apiAiFillPreview, aiFillApply as apiAiFillApply, type SeedSummary, type AIFillPreview, type AIFieldProposal } from '@/components/pm/api';
import AnalyticsIntelPanel from '@/components/pm/AnalyticsIntelPanel';
import AccessVaultPanel       from '@/components/pm/AccessVaultPanel';
import ContentLibraryPanel    from '@/components/pm/ContentLibraryPanel';
import InfoRepositoryPanel    from '@/components/pm/InfoRepositoryPanel';
import ApprovalsLogPanel      from '@/components/pm/ApprovalsLogPanel';
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
  Zap, Database, Users, Briefcase, History, FileEdit, Building2} from 'lucide-react';

/* ─── types ─── */
type KCategory = 'goal'|'cms'|'access'|'technical'|'competitor'|'content'|'analytics'|'manual'|'crawl'
  /* Data Room V2 additions — see strategic doc in DATA_REQUIREMENTS comments below */
  |'identity'|'audience'|'backlinks'|'commercial'|'history'
  /* Brand Studio H.0 — brand narrative anchors */
  |'brand_narrative';
interface KField { id?: string; category: KCategory; field_key: string; field_value: string; source: string; source_name?: string; data_date?: string; notes?: string; }
interface DocRecord { id?: string; name: string; doc_type: string; raw_content?: string; extracted_data?: any; source_date?: string; file_size_kb?: number; created_at?: string; }

/* ─── Data requirement definitions ─── */
const DATA_REQUIREMENTS = [
  {
    category: 'goal' as KCategory, label: 'Campaign Goals', icon: Target, color: '#a78bfa',
    fields: [
      {key:'primary_goal',      label:'Primary Business Goal',      type:'select',  options:['Organic Traffic Growth','Conversion Rate Increase','Brand Visibility','AI/GEO Citations','Local SEO','E-commerce Revenue','Lead Generation'],  required:true},
      {key:'primary_goal_narrative', label:'Goal in Plain Language', type:'text', placeholder:'e.g. "Double SaaS trial signups from organic by end of Q4 — we are currently at 47/mo, target is 95/mo"', required:true},
      {key:'target_timeline',   label:'Target Timeline',            type:'select',  options:['3 months','6 months','12 months','Ongoing'],  required:true},
      {key:'success_metric',    label:'What Does Success Look Like?',type:'text',   placeholder:'e.g. 50% increase in organic traffic, ranking #3 for "best seo agency london"', required:true},
      {key:'current_baseline',  label:'Current Baseline Metric',    type:'text',   placeholder:'e.g. 2,400 organic sessions/month as of Jan 2024'},
      {key:'target_keywords',   label:'Top 3 Target Keywords',      type:'text',   placeholder:'keyword1, keyword2, keyword3'},
      {key:'secondary_goals',   label:'Secondary Goals (up to 3)',  type:'text',   placeholder:'e.g. Build authority in topic X / improve mobile UX / capture more featured snippets'},
      {key:'anti_goals',        label:'Anti-Goals (what NOT to do)',type:'text',   placeholder:'e.g. "Do not mention competitors by name", "Avoid claims that imply regulatory advice"'},
      {key:'budget_monthly',    label:'Monthly Retainer Budget',    type:'text',   placeholder:'e.g. £2,500/month'},
      {key:'reporting_cadence', label:'Client Reporting Frequency', type:'select', options:['Weekly','Bi-weekly','Monthly','Quarterly']},
      {key:'report_audience',   label:'Who Reads The Reports?',     type:'text',   placeholder:'e.g. "CMO + VP Growth"; titles not names — calibrates tone & depth'},
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
      {key:'gsc_access',        label:'Google Search Console Access',  type:'select', options:['Full Owner','View Only','Need to Request','Client will share data','Connected via OAuth'], required:true},
      {key:'ga4_access',        label:'Google Analytics 4 Access',     type:'select', options:['Full Admin','View Only','Need to Request','Using UA only','None','Connected via OAuth'], required:true},
      {key:'ahrefs_access',     label:'Ahrefs / Semrush Access',       type:'select', options:['Full Agency Access','Limited','Client Account','No Access']},
      {key:'screaming_frog',    label:'Screaming Frog Available',      type:'select', options:['Yes — licensed','Yes — free (500 limit)','No']},
      {key:'cms_admin',         label:'CMS Admin Access',              type:'select', options:['Full Admin','Editor Only','Need to Request','Via Client'], required:true},
      {key:'hosting_access',    label:'Hosting/Server Access',         type:'select', options:['Full cPanel/SSH','Via Plugin','Client only','Not needed']},
      {key:'dns_access',        label:'DNS Edit Access',               type:'select', options:['Yes — direct','Via client','Need to Request','Not needed for this work']},
      {key:'schema_edit_ability', label:'Can We Edit Structured Data?',type:'select', options:['Yes — directly via CMS','Via plugin','Dev team only','No']},
      {key:'robots_edit_ability', label:'Can We Edit robots.txt?',     type:'select', options:['Yes — directly','Via dev request','No']},
      {key:'sitemap_regeneration', label:'Sitemap Regeneration',       type:'select', options:['Automatic on publish','Manual rebuild needed','Unknown']},
      {key:'deploy_access',     label:'Deploy Access',                 type:'select', options:['Yes — we can deploy','Via dev gatekeeper','Client only']},
      {key:'access_notes',      label:'Other Tool Access Notes',       type:'text',   placeholder:'e.g. "GA4 client manages — they send monthly screenshots"'},
    ]
  },
  {
    category: 'analytics' as KCategory, label: 'Analytics Baseline', icon: BarChart3, color: '#facc15',
    fields: [
      {key:'organic_sessions_monthly',  label:'Monthly Organic Sessions (current)',  type:'text', placeholder:'e.g. 2,400 — auto-filled if GA4 connected', required:true},
      {key:'organic_sessions_baseline_date', label:'Baseline Date',                 type:'date', placeholder:''},
      {key:'top_landing_pages',         label:'Top 5 Landing Pages',                type:'text', placeholder:'URL1, URL2, URL3, URL4, URL5'},
      {key:'bounce_rate',               label:'Organic Bounce Rate',                type:'text', placeholder:'e.g. 68% — auto-filled if GA4 connected'},
      {key:'avg_session_duration',      label:'Avg Session Duration (Organic)',     type:'text', placeholder:'e.g. 2m 14s'},
      {key:'conversions_monthly',       label:'Monthly Conversions (Goal)',         type:'text', placeholder:'e.g. 47 leads — auto-filled if GA4 connected'},
      {key:'ga4_conversion_events',     label:'GA4 Conversion Event Names',         type:'text', placeholder:'e.g. "purchase, generate_lead, contact_form_submit" — what GA4 calls a conversion here'},
      {key:'value_per_lead',            label:'Value Per Lead (£/$)',               type:'text', placeholder:'e.g. £125 average — enables ROI claims in reports'},
      {key:'value_per_customer',        label:'Value Per Customer (LTV)',           type:'text', placeholder:'e.g. £1,800 lifetime — enables ROI claims'},
      {key:'gsc_total_impressions',     label:'GSC Monthly Impressions',            type:'text', placeholder:'e.g. 84,000 — auto-filled if GSC connected'},
      {key:'gsc_total_clicks',          label:'GSC Monthly Clicks',                 type:'text', placeholder:'e.g. 2,100 — auto-filled if GSC connected'},
      {key:'gsc_avg_position',          label:'GSC Average Position',               type:'text', placeholder:'e.g. 18.4 — auto-filled if GSC connected'},
      {key:'gsc_ctr',                   label:'GSC Click-Through Rate',             type:'text', placeholder:'e.g. 2.5% — auto-filled if GSC connected'},
      {key:'rank_tracker_source',       label:'Rank Tracker Source',                type:'select', options:['Ahrefs','SEMrush','Moz','Serpstat','SE Ranking','Manual Check','None']},
      {key:'last_manual_rank_check',    label:'Last Manual Rank Check Date',        type:'date', placeholder:'Helpful when no rank tracker is connected'},
      {key:'last_manual_rank_notes',    label:'Manual Rank Check Notes',            type:'text', placeholder:'e.g. "Target keyword 1: pos 8 → 5 over last week"'},
    ]
  },
  {
    category: 'technical' as KCategory, label: 'Technical Baseline', icon: Settings, color: '#f472b6',
    fields: [
      {key:'pages_indexed',        label:'Pages Indexed (GSC)',      type:'text', placeholder:'e.g. 847 from GSC Coverage report'},
      {key:'pages_submitted',      label:'Pages Submitted (Sitemap)',type:'text', placeholder:'e.g. 1,200'},
      {key:'crawl_errors',         label:'Known Crawl Errors',       type:'text', placeholder:'e.g. 23 404s, 5 redirect chains'},
      {key:'broken_links',         label:'Broken Internal Links',    type:'text', placeholder:'e.g. 12 broken links (from Screaming Frog)'},
      {key:'duplicate_content',    label:'Duplicate Content Issues', type:'text', placeholder:'e.g. 8 duplicate title tags'},
      {key:'schema_markup',        label:'Schema Markup Present',    type:'select', options:['Yes — comprehensive','Partial','None','Unknown']},
      {key:'sitemap_url',          label:'Sitemap URL',              type:'text', placeholder:'e.g. https://domain.com/sitemap.xml'},
      {key:'robots_txt',           label:'Robots.txt Status',        type:'select', options:['OK','Blocking important pages','Missing','Not checked']},
      {key:'canonical_issues',     label:'Canonical Tag Issues',     type:'text', placeholder:'e.g. None / 4 self-referencing / 12 missing'},
      {key:'cwv_lcp',              label:'Core Web Vitals — LCP',    type:'text', placeholder:'e.g. 2.4s (good <2.5s)'},
      {key:'cwv_inp',              label:'Core Web Vitals — INP',    type:'text', placeholder:'e.g. 180ms (good <200ms) — INP replaced FID in March 2024'},
      {key:'cwv_cls',              label:'Core Web Vitals — CLS',    type:'text', placeholder:'e.g. 0.08 (good <0.1)'},
      {key:'mobile_usability',     label:'Mobile Usability Issues',  type:'text', placeholder:'e.g. 0 issues from GSC Mobile Usability report'},
      {key:'hreflang_setup',       label:'Hreflang Setup',           type:'select', options:['Not needed (single market)','Implemented correctly','Implemented with errors','Missing']},
      {key:'https_status',         label:'HTTPS / SSL Status',       type:'select', options:['Active everywhere','Mixed content warnings','Not active','Unknown']},
      {key:'js_rendering',         label:'JavaScript Rendering',     type:'select', options:['Server-rendered (good for SEO)','Hybrid SSR/CSR','Client-only (SPA — needs careful config)','Unknown']},
    ]
  },
  {
    category: 'competitor' as KCategory, label: 'Competitor Intelligence', icon: Star, color: '#fb923c',
    fields: [
      {key:'competitor_1',       label:'Main Competitor #1',           type:'text', placeholder:'domain.com'},
      {key:'competitor_1_dr',    label:'Competitor 1 Domain Rating',   type:'text', placeholder:'e.g. DR 45 (Ahrefs)'},
      {key:'competitor_1_position', label:'Competitor 1 — Where They Win', type:'text', placeholder:'e.g. "Strong on transactional keywords; weak on educational TOFU"'},
      {key:'competitor_2',       label:'Main Competitor #2',           type:'text', placeholder:'domain.com'},
      {key:'competitor_2_dr',    label:'Competitor 2 Domain Rating',   type:'text', placeholder:'e.g. DR 38'},
      {key:'competitor_2_position', label:'Competitor 2 — Where They Win', type:'text', placeholder:'e.g. "Owns informational SERPs with deep guides"'},
      {key:'competitor_3',       label:'Main Competitor #3',           type:'text', placeholder:'domain.com'},
      {key:'competitor_3_dr',    label:'Competitor 3 Domain Rating',   type:'text', placeholder:'e.g. DR 28'},
      {key:'aspirational_competitor',  label:'Aspirational Competitor',type:'text', placeholder:'e.g. "stripe.com — who we want to look like in 18 months"'},
      {key:'our_domain_rating',  label:'Our Domain Rating',            type:'text', placeholder:'e.g. DR 22 (Ahrefs)'},
      {key:'our_referring_domains',label:'Our Referring Domains',      type:'text', placeholder:'e.g. 184 (Ahrefs)'},
      {key:'content_gap_keywords',label:'Key Competitor Content Gaps', type:'text', placeholder:'Keywords they rank for that we do not'},
      {key:'differentiation',    label:'Our Differentiation in One Sentence', type:'text', placeholder:'e.g. "Only platform built for SEO consultants, not in-house teams"', required:true},
    ]
  },

  /* ═══════════════════════════════════════════════════════════════════
     Data Room V2 — additional categories added during the integration
     foundation work. These do not replace any existing categories;
     they expand the Data Room's coverage so reports, audits, card
     generation, and the AI narrative have richer human-supplied
     context to work with.

     STRATEGIC NOTES (as digital marketing specialist):
     - identity: who the client is at the business level. Required
       because every AI output should feel client-specific, not generic.
     - audience: who we are writing for. Without this, content strategy
       is guesswork.
     - content: brand voice, prohibited topics, capacity. Calibrates
       every piece of generated text.
     - backlinks: authority context. Mostly manual since most backlink
       tools have no free API; treat as periodic manual updates.
     - commercial: retainer terms + stakeholders. Shapes report style
       and what cards we can realistically execute.
     - history: institutional memory. Stops the AI repeating mistakes
       and lets it acknowledge prior wins.

     Required-vs-optional discipline: required only when the field's
     absence genuinely degrades downstream output. Everything else is
     optional with helpful placeholders.
  ═══════════════════════════════════════════════════════════════════ */

  {
    category: 'identity' as KCategory, label: 'Client & Project Identity', icon: Building2, color: '#60a5fa',
    fields: [
      {key:'client_name',       label:'Client / Brand Name',         type:'text',   placeholder:'The trading name', required:true},
      {key:'legal_entity',      label:'Legal Entity (if different)', type:'text',   placeholder:'e.g. Acme Limited (UK) — used in contracts/disclaimers'},
      {key:'industry',          label:'Industry',                    type:'select', options:['SaaS','E-commerce','Professional Services','Healthcare','Finance/Fintech','Education','Travel/Hospitality','Real Estate','Manufacturing','Marketplace','Media/Publishing','Nonprofit','Retail','Legal','Other'], required:true},
      {key:'industry_specific', label:'Industry — Specific',         type:'text',   placeholder:'e.g. "B2B SaaS for SEO agencies", "DTC men\'s skincare", "RIA financial advisor"'},
      {key:'business_model',    label:'Business Model',              type:'select', options:['B2B','B2C','B2B2C','Marketplace','DTC','Agency','Nonprofit','Government'], required:true},
      {key:'lifecycle_stage',   label:'Company Lifecycle Stage',     type:'select', options:['Pre-launch','Early traction','Growth','Mature','Pivoting','Acquired/being acquired'], required:true},
      {key:'primary_offering',  label:'Primary Product / Service',   type:'text',   placeholder:'One-paragraph description of what they sell and to whom', required:true},
      {key:'unique_value_prop', label:'Unique Value Proposition',    type:'text',   placeholder:'One sentence — what makes them different/better', required:true},
      {key:'annual_revenue',    label:'Annual Revenue Range',        type:'select', options:['Under £100k','£100k-£1M','£1M-£10M','£10M-£100M','£100M+','Public company','Prefer not to say']},
      {key:'geographic_markets',label:'Geographic Markets',          type:'text',   placeholder:'e.g. "UK + Ireland primary, EU secondary"', required:true},
      {key:'languages',         label:'Languages Targeted',          type:'text',   placeholder:'e.g. "English (UK), French, German"', required:true},
      {key:'year_founded',      label:'Year Founded',                type:'text',   placeholder:'e.g. 2018'},
      {key:'headcount',         label:'Headcount Range',             type:'select', options:['Solo founder','2-10','11-50','51-200','201-1000','1000+']},
      {key:'public_or_private', label:'Public or Private',           type:'select', options:['Private','Public (listed)','Private equity backed','VC-backed','Bootstrapped']},
    ]
  },

  {
    category: 'audience' as KCategory, label: 'Audience & Positioning', icon: Users, color: '#22d3ee',
    fields: [
      {key:'ideal_customer_profile', label:'Ideal Customer Profile (ICP)', type:'text', placeholder:'B2B: firmographics — industry, size, role, geography. B2C: demographics — age, income, life stage, interests', required:true},
      {key:'persona_1_name',         label:'Buyer Persona #1 — Title/Role', type:'text', placeholder:'e.g. "Marketing Director at mid-market SaaS"', required:true},
      {key:'persona_1_motivations',  label:'Persona #1 — Motivations',      type:'text', placeholder:'What pain are they solving / what outcome do they want'},
      {key:'persona_1_objections',   label:'Persona #1 — Objections',       type:'text', placeholder:'Common reasons they hesitate — price, fit, switching cost, etc.'},
      {key:'persona_2_name',         label:'Buyer Persona #2 — Title/Role', type:'text', placeholder:'Optional — second persona if there is one'},
      {key:'persona_2_motivations',  label:'Persona #2 — Motivations',      type:'text', placeholder:''},
      {key:'persona_3_name',         label:'Buyer Persona #3 — Title/Role', type:'text', placeholder:'Optional'},
      {key:'search_intent_split',    label:'Search Intent Priority',        type:'select', options:['Mostly informational (TOFU)','Mostly commercial/transactional (BOFU)','Balanced TOFU + BOFU','Mostly navigational (brand)','Mixed — depends on persona']},
      {key:'funnel_focus',           label:'Funnel Stage Focus',            type:'select', options:['TOFU — awareness/education','MOFU — consideration','BOFU — decision/conversion','Full-funnel'], required:true},
      {key:'positioning_statement',  label:'Positioning Statement',         type:'text', placeholder:'e.g. "For [audience] who [need], [brand] is the [category] that [unique benefit]"'},
    ]
  },

  {
    category: 'content' as KCategory, label: 'Content & Editorial', icon: FileEdit, color: '#a3e635',
    fields: [
      {key:'brand_voice',          label:'Brand Voice (1-2 sentences)',  type:'text', placeholder:'e.g. "Confident, plain-spoken, never jargon-y. Treats the reader as smart and busy."', required:true},
      {key:'brand_tone_words',     label:'Brand Tone Words (3-5)',       type:'text', placeholder:'e.g. "warm, direct, evidence-based, occasionally witty"', required:true},
      {key:'reading_level',        label:'Target Reading Level',         type:'select', options:['Plain English (Grade 6-8)','Professional (Grade 9-12)','Specialist (industry-aware)','Academic/technical (postgrad)']},
      {key:'prohibited_topics',    label:'Prohibited Claims / Topics',   type:'text', placeholder:'e.g. "No medical advice; no comparisons by competitor name; no claims about regulatory approval"'},
      {key:'required_disclaimers', label:'Required Legal Disclaimers',   type:'text', placeholder:'e.g. "All financial figures are illustrative" / GDPR notes'},
      {key:'content_themes',       label:'Top 3-5 Content Themes',       type:'text', placeholder:'e.g. "Technical SEO, AI search, agency operations, case studies, industry commentary"', required:true},
      {key:'content_gaps_known',   label:'Acknowledged Content Gaps',    type:'text', placeholder:'e.g. "We know we should cover [topic] but have not — would be priority for next quarter"'},
      {key:'content_capacity',     label:'Content Production Capacity',  type:'select', options:['In-house writer(s) — full-time','In-house — part-time','Freelance pool','Agency-written','AI-assisted with editor','Mixed']},
      {key:'content_hours_weekly', label:'Content Hours / Week',         type:'text', placeholder:'e.g. "8-10 hours of writing + 2 of editing"'},
      {key:'editorial_calendar',   label:'Editorial Calendar System',    type:'select', options:['Notion','Airtable','Asana','Trello','Spreadsheet','None — ad hoc','Other']},
      {key:'publishing_workflow',  label:'Publishing Workflow',          type:'text', placeholder:'e.g. "Draft → editor review → SEO check → publish → distribute"'},
    ]
  },

  {
    category: 'backlinks' as KCategory, label: 'Backlinks & Authority', icon: Link2, color: '#c084fc',
    fields: [
      {key:'domain_rating_ahrefs', label:'Ahrefs Domain Rating (DR)',    type:'text', placeholder:'e.g. 22 — refreshed quarterly is fine'},
      {key:'domain_authority_moz', label:'Moz Domain Authority (DA)',    type:'text', placeholder:'e.g. 28 — if Moz is used instead'},
      {key:'trust_flow_majestic',  label:'Majestic Trust Flow',          type:'text', placeholder:'Optional — if Majestic is the tool of choice'},
      {key:'referring_domains',    label:'Total Referring Domains',      type:'text', placeholder:'e.g. 184 — from Ahrefs/Semrush'},
      {key:'high_quality_links',   label:'Notable Quality Links (top 5)',type:'text', placeholder:'List the 5 best — from publications, .edu, .gov, industry sites'},
      {key:'anchor_text_health',   label:'Anchor Text Distribution',     type:'select', options:['Healthy mix','Over-optimized (penalty risk)','Mostly branded','Mostly naked URLs','Unknown']},
      {key:'link_building_approach', label:'Link Building Approach',     type:'select', options:['Digital PR','Manual outreach','Guest posting','HARO/Qwoted/Connectively','Broken link building','None active','Mixed']},
      {key:'link_building_capacity', label:'Link Building Hours / Month',type:'text', placeholder:'e.g. "10-15 hours/mo via freelance specialist"'},
      {key:'backlink_audit_date',  label:'Last Backlink Audit Date',     type:'date', placeholder:''},
      {key:'toxic_links',          label:'Known Toxic Links',            type:'text', placeholder:'e.g. "12 disavowed in March 2024" or "None known"'},
    ]
  },

  {
    category: 'commercial' as KCategory, label: 'Commercial & Engagement', icon: Briefcase, color: '#fbbf24',
    fields: [
      {key:'engagement_type',      label:'Engagement Type',              type:'select', options:['Monthly retainer','Project-based','Hybrid retainer + project','Performance/results-based','One-off audit','Consulting hours'], required:true},
      {key:'monthly_hours',        label:'Monthly Hours (if retainer)',  type:'text',   placeholder:'e.g. "20 hours/month" or "5 days strategic + ad hoc"'},
      {key:'contract_start',       label:'Contract Start Date',          type:'date', placeholder:''},
      {key:'contract_renewal',     label:'Contract Renewal Date',        type:'date', placeholder:''},
      {key:'point_of_contact_role',label:'Primary Point of Contact (Role)', type:'text', placeholder:'e.g. "Head of Marketing" — titles, not names', required:true},
      {key:'decision_maker_role',  label:'Final Decision Maker (Role)',  type:'text',   placeholder:'e.g. "CMO" or "Founder/CEO"'},
      {key:'communication_channel',label:'Communication Channel',        type:'select', options:['Slack Connect','Email only','Microsoft Teams','Weekly calls + email','Daily Slack + monthly calls','Other'], required:true},
      {key:'comms_response_sla',   label:'Expected Response SLA',        type:'select', options:['Same day','Within 24h','Within 48h','Within a week','No formal SLA']},
      {key:'deliverables_expected',label:'Reporting Deliverables Expected', type:'text', placeholder:'e.g. "Monthly PDF report + quarterly strategic review"', required:true},
      {key:'escalation_path',      label:'Escalation Path',              type:'text',   placeholder:'e.g. "If contact unresponsive → CMO (with notice)"'},
      {key:'invoice_terms',        label:'Invoice / Payment Terms',      type:'select', options:['Net 7','Net 14','Net 30','Net 45','Net 60','Prepaid quarterly','Prepaid annually']},
    ]
  },

  {
    category: 'history' as KCategory, label: 'History & Context', icon: History, color: '#94a3b8',
    fields: [
      {key:'prior_seo_work',       label:'Previous SEO Work',            type:'select', options:['None — we are first','In-house team','Previous agency','Freelance consultant','Mixed history'], required:true},
      {key:'prior_agency_name',    label:'Previous Agency / Consultant', type:'text',   placeholder:'Optional — useful for context, not for blame'},
      {key:'what_worked',          label:'What Worked Previously',       type:'text',   placeholder:'e.g. "Technical fixes lifted indexed pages 40%" — informs what to double down on'},
      {key:'what_didnt_work',      label:'What Did Not Work',            type:'text',   placeholder:'e.g. "Generic link building from PBNs caused manual action" — informs what to avoid'},
      {key:'active_penalties',     label:'Active Penalties / Manual Actions', type:'select', options:['None','Manual action (lifted)','Manual action (active)','Algorithmic suspected','Unknown']},
      {key:'penalty_notes',        label:'Penalty Notes',                type:'text',   placeholder:'Date, type, status, recovery plan if applicable'},
      {key:'recent_migrations',    label:'Recent Migrations / Replatforms', type:'text', placeholder:'e.g. "Moved from WordPress to Webflow in Aug 2024 — 18% traffic drop"'},
      {key:'recent_redesigns',     label:'Recent Site Redesigns',        type:'text',   placeholder:'e.g. "Q3 2024 full redesign — URL structure changed"'},
      {key:'algorithm_impacts',    label:'Notable Algorithm Update Impacts', type:'text', placeholder:'e.g. "Lost 25% from Sept 2023 Helpful Content; recovered Jan 2024"'},
      {key:'business_changes',     label:'Business Changes That Affect SEO', type:'text', placeholder:'e.g. "New product line in Q1 2025 — need new keyword cluster"'},
    ]
  },
  /* ── Brand Studio H.0 — brand narrative anchors ──
     The story-arc, mission, vision, and verbal anchors that feed
     every generated brand asset (statements, taglines, positioning).
     Lives in Data Room because it's source-of-truth context; the
     Brand Studio "Brand" tab reads from here. */
  {
    category: 'brand_narrative' as KCategory, label: 'Brand Narrative', icon: Sparkles, color: '#c084fc',
    fields: [
      {key:'origin_story',                label:'Origin Story',                  type:'text', placeholder:'Why the company exists. Founding moment, the problem the founder saw, the conviction that started it.'},
      {key:'mission_statement',           label:'Mission Statement',             type:'text', placeholder:'One sentence — what we do, for whom, to what end.'},
      {key:'vision_statement',            label:'Vision Statement',              type:'text', placeholder:'One sentence — the future state the company is working toward.'},
      {key:'values',                      label:'Core Values',                   type:'text', placeholder:'3-5 values that guide decisions, in priority order. Comma-separated.'},
      {key:'brand_personality_archetype', label:'Brand Personality / Archetype', type:'select', options:['Sage','Hero','Outlaw','Caregiver','Creator','Ruler','Magician','Innocent','Explorer','Jester','Lover','Everyman','Mixed']},
      {key:'story_arc',                   label:'Story Arc',                     type:'text', placeholder:'Where the brand has been, where it is now, where it\'s heading. The narrative thread.'},
      {key:'primary_tagline',             label:'Primary Tagline',               type:'text', placeholder:'The one tagline the brand leads with. Also shown in the Brand Studio Brand Bar.'},
      {key:'secondary_taglines',          label:'Secondary Taglines',            type:'text', placeholder:'Alternate taglines for specific contexts. Comma-separated.'},
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
  /* V2 Data Room seed migration UI state — one-shot from Overview tab */
  const [seedRunning, setSeedRunning] = useState(false);
  const [seedResult,  setSeedResult]  = useState<SeedSummary | null>(null);
  const [seedScope,   setSeedScope]   = useState<'this' | 'all'>('this');
  /* V2 Data Room AI Fill UI state — preview modal + apply */
  const [aiFillRunning,   setAiFillRunning]   = useState(false);
  const [aiFillApplying,  setAiFillApplying]  = useState(false);
  const [aiFillPreview,   setAiFillPreview]   = useState<AIFillPreview | null>(null);
  const [aiFillSelected,  setAiFillSelected]  = useState<Record<string, boolean>>({});
  const [aiFillModalOpen, setAiFillModalOpen] = useState(false);
  const handleProjectChange = useProjectSync(selProjId, setSelProjId);
  const [tab,       setTab]       = useState<'overview'|'goals'|'cms'|'access'|'analytics'|'technical'|'competitors'|'documents'|'crawl'|'identity'|'audience'|'content'|'backlinks'|'commercial'|'history'|'brand_narrative'|'access_vault'|'content_library'|'info_repository'|'approvals_log'>('overview');

  /* Phase 9 — declare awareness so S.E.A.S.O.N. knows what's on screen */
  useSeasonAwareness(selProjId ? {
    page: 'data-room',
    page_label: `Data Room · ${tab.replace(/_/g, ' ')}`,
    selected: {
      type: 'page',
      title: tab.replace(/_/g, ' '),
      meta: { tab },
    },
    visible_filters: { tab },
  } : null);
  const [knowledge, setKnowledge] = useState<Record<string,Record<string,KField>>>({});
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [showGuide, setShowGuide] = useState<string|null>(null);
  const [pendingFields, setPendingFields] = useState<Record<string,string>>({});
  /* Piece 2: PM-acknowledged overrides on GSC-auto-synced fields.
     Keyed by `${category}.${field_key}`. When set, the input is editable
     even though the field came from GSC. Reset when the field is saved. */
  const [editOverrides, setEditOverrides] = useState<Record<string, boolean>>({});
  const [expandedDoc,   setExpandedDoc]   = useState<string|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType,  setUploadDocType]  = useState('gsc_export');
  const [uploadStatus,   setUploadStatus]   = useState<'idle'|'uploading'|'extracting'|'saving'|'done'|'error'>('idle');
  const [uploadError,    setUploadError]    = useState('');
  const [reExtractingId, setReExtractingId] = useState<string|null>(null);
  // URL Crawler state
  // All historically crawled pages for this project (from crawled_pages table)
  const [allCachedPages,    setAllCachedPages]    = useState<any[]>([]);
  const [libLoading,        setLibLoading]        = useState(false);
  const [forceRefresh,      setForceRefresh]      = useState(false);
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
  // Comparison criteria state
  const [compareCriteria, setCompareCriteria] = useState<string[]>([
    'title_and_meta', 'heading_structure', 'content_quality', 'schema_markup',
    'internal_linking', 'geo_readiness', 'technical_issues', 'cta_effectiveness',
  ]);
  const [customCriterion, setCustomCriterion] = useState('');
  // Live URL management: crawledUrls tracks all results, activeCrawlUrls is the current selection
  const [activeCrawlUrls,   setActiveCrawlUrls]   = useState<string[]>([]);  // subset used for comparison
  const [addingUrl,         setAddingUrl]          = useState('');            // new URL input
  const [recrawlingUrl,     setRecrawlingUrl]      = useState('');            // url being re-crawled
  // Card proposal approval state: cardIdx → 'pending'|'approved'|'merged'|'rejected'
  const [cardApprovals,     setCardApprovals]      = useState<Record<number,string>>({});
  const [pendingCards,      setPendingCards]       = useState<any[]>([]);
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
    if (!selProjId) { setKnowledge({}); setDocuments([]); return; }
    loadData();
  }, [selProjId]);

  // Load crawl history when crawl tab opens
  useEffect(() => {
    // Load per-URL Page Library when entering the crawl tab
    if (tab === 'crawl' && selProjId) {
      loadAllCachedPages();
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
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
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
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
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
  // ── Load ALL historically crawled pages for this project from crawled_pages ──
  // This is the Page Library — every URL ever crawled, individually, not bundled into sessions.
  const loadAllCachedPages = async () => {
    if (!selProjId) return;
    setLibLoading(true);
    try {
      const res = await fetch('/api/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
        body: JSON.stringify({ action: 'load_cached', projectId: selProjId }),
      });
      const data = await safeJson(res);
      if (data.success && data.results?.length) {
        setAllCachedPages(data.results);
      } else {
        setAllCachedPages([]);
      }
    } catch { /* silent */ }
    setLibLoading(false);
  };

  // Build crawlResults from the current activeCrawlUrls selection in the Page Library
  const buildResultsFromSelection = (urls: string[], library: any[]) => {
    const selected = library.filter(p => urls.includes(p.url));
    if (!selected.length) return null;
    const agg: Record<string, any> = {};
    for (const r of selected) for (const kf of (r.knowledge_fields || [])) agg[kf.key] = { ...kf, source_url: r.url };
    return {
      success:                  true,
      urls_crawled:             selected.length,
      crawled_at:               selected[0]?.cached_at || new Date().toISOString(),
      results:                  selected,
      aggregated_knowledge:     Object.values(agg),
      cross_page_issues:        selected.flatMap(r => (r.page_analysis?.issues || []).map((i: any) => ({ ...i, url: r.url }))),
      cross_page_opportunities: selected.flatMap(r => (r.page_analysis?.opportunities || []).map((o: any) => ({ ...o, url: r.url }))),
    };
  };

  // Toggle a page in/out of the active analysis selection
  const togglePageInAnalysis = (url: string, library: any[]) => {
    setActiveCrawlUrls(prev => {
      const next = prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url];
      setCrawlResults(buildResultsFromSelection(next, library));
      setCrawlSaved(true);
      return next;
    });
  };

  const previewUrl = async (url: string) => {
    const clean = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
    setCrawlPreview(p => ({ ...p, [clean]: { status: 'loading' } }));
    try {
      const res  = await fetch('/api/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
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
      const res = await fetch('/api/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
        body: JSON.stringify({
          action:         'crawl_urls',
          urls:            lines,
          projectContext: `${client?.company || ''} | ${selProj?.url || ''} | ${client?.industry || ''}`,
          projectId:       selProjId,
          taskHints:       crawlTaskHints,
          forceRefresh:    forceRefresh,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.text();
        toast({ title: 'Crawl failed', description: err.slice(0, 200), variant: 'destructive' });
        setCrawlRunning(false);
        return;
      }

      // Read NDJSON stream: each \n-terminated line is one JSON message
      const reader  = res.body.getReader();
      const dec     = new TextDecoder();
      let   buf     = '';
      const partial: any[] = [];

      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === 'url_complete') {
            partial.push(msg.result);
            // Render each result as it arrives — don't wait for all URLs
            setCrawlResults({
              success: true, urls_crawled: partial.length,
              results: [...partial],
              aggregated_knowledge: partial.flatMap((r:any) => r.knowledge_fields || []),
              cross_page_issues: partial.flatMap((r:any) => (r.page_analysis?.issues||[]).map((i:any)=>({...i,url:r.url}))),
              cross_page_opportunities: partial.flatMap((r:any) => (r.page_analysis?.opportunities||[]).map((o:any)=>({...o,url:r.url}))),
            });
            setActiveCrawlUrls(partial.filter((r:any)=>r.page_analysis).map((r:any)=>r.url));
          }
          if (msg.type === 'complete') {
            setCrawlResults(msg);
            const ok = (msg.results||[]).filter((r:any)=>r.page_analysis).map((r:any)=>r.url);
            const activeUrls = ok.length > 0 ? ok : (msg.results||[]).map((r:any)=>r.url);
            setActiveCrawlUrls(activeUrls);
            const cached = (msg.results||[]).filter((r:any)=>r.from_cache).length;
            const fresh  = (msg.results||[]).filter((r:any)=>!r.from_cache&&r.page_analysis).length;
            const failed = (msg.results||[]).filter((r:any)=>!r.page_analysis).length;
            // Refresh the Page Library so newly crawled pages appear immediately
            loadAllCachedPages();
            toast({
              title: `${msg.urls_crawled} page${msg.urls_crawled!==1?'s':''} ready`,
              description: [
                fresh  ? `${fresh} freshly crawled`   : '',
                cached ? `${cached} from cache`        : '',
                failed ? `${failed} failed`            : '',
              ].filter(Boolean).join(' · ') || 'Done',
            });
          }
        } catch { /* malformed JSON line — skip */ }
      };

      while (true) {
        const { done, value } = await reader.read();
        // Decode chunk — stream:true keeps multi-byte chars intact across chunks
        buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
        // Split on newline and process every complete line
        const parts = buf.split('\n');
        // Last element may be an incomplete line — keep it in buf
        buf = parts.pop() ?? '';
        for (const line of parts) processLine(line);
        // When stream ends, flush whatever remains in buf
        if (done) { processLine(buf); break; }
      }
    } catch (e: any) {
      toast({ title: 'Crawl error', description: e.message, variant: 'destructive' });
    }
    setCrawlRunning(false);
  };

  const saveCrawlToKnowledge = async () => {
    if (!crawlResults || !selProjId) return;
    setCrawlSaving(true);

    // ── Identify own-domain URLs ──────────────────────────────────────
    // Strip protocol + trailing slash, take the hostname only.
    // e.g. "https://acme.com/page" → "acme.com"
    const ownHostname = (selProj?.url || '')
      .replace(/https?:\/\//, '')
      .replace(/\/.*$/, '')   // remove path
      .toLowerCase()
      .trim();

    // A URL belongs to the project if its hostname contains the own hostname.
    // This correctly handles "www.acme.com" matching "acme.com" and subdomains.
    const isOwnUrl = (url: string): boolean => {
      if (!ownHostname) return false;
      const host = url.replace(/https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
      return host === ownHostname || host.endsWith('.' + ownHostname);
    };

    // ── Build knowledge list ONLY from own pages ──────────────────────
    // Competitor knowledge_fields must NEVER overwrite project knowledge.
    // They are used for comparison display but must not touch the Data Room.
    const ownResults = (crawlResults.results || []).filter((r: any) => isOwnUrl(r.url));
    const competitorResults = (crawlResults.results || []).filter((r: any) => !isOwnUrl(r.url));

    // Merge own-page knowledge_fields (last-write-wins within own pages only)
    const ownKnowledge: Record<string, any> = {};
    for (const r of ownResults) {
      for (const kf of (r.knowledge_fields || [])) {
        if (kf.key && kf.value) {
          ownKnowledge[kf.key] = { ...kf, source_url: r.url };
        }
      }
    }

    const newConflicts: typeof pendingConflicts = [];
    const saved: string[] = [];
    const skipped: string[] = [];

    // Log what we're skipping so the user can see it
    for (const r of competitorResults) {
      for (const kf of (r.knowledge_fields || [])) {
        if (kf.key) skipped.push(kf.key);
      }
    }

    for (const kf of Object.values(ownKnowledge)) {
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

    // Each URL is already saved individually in crawled_pages — no session bundle needed.
    // Mark strategy stale
    fetch('/api/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
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
      title: `${saved.length} data point${saved.length !== 1 ? 's' : ''} saved from ${ownResults.length} own page${ownResults.length !== 1 ? 's' : ''}`,
      description: competitorResults.length > 0
        ? `${competitorResults.length} competitor page${competitorResults.length !== 1 ? 's' : ''} used for comparison only — their data was NOT written to your knowledge base.`
        : 'Strategy will show as stale — regenerate to apply the new data.',
    });
  };

  // ══ Run Manav Brain comparison analysis on crawl results ══
  // ── Add a new URL to the comparison without re-crawling everything ──
  const addSingleUrl = async (url: string) => {
    if (!url.trim() || !selProjId) return;
    const clean = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;

    // Check it isn't already in results
    if (crawlResults?.results?.some((r: any) => r.url === clean)) {
      setActiveCrawlUrls(prev => prev.includes(clean) ? prev : [...prev, clean]);
      setAddingUrl('');
      toast({ title: 'URL already crawled', description: 'Added to active comparison.' });
      return;
    }

    setRecrawlingUrl(clean);
    try {
      const { data: projData } = await supabase.from('projects').select('playground_canvas').eq('id', selProjId).single();
      const hints = (projData?.playground_canvas || [])
        .filter((b: any) => b.placed && b.status !== 'done').slice(0, 6)
        .map((b: any) => `[${b.type}] "${b.title}"`);

      const res  = await fetch('/api/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
        body: JSON.stringify({
          action: 'crawl_urls', urls: [clean],
          projectContext: `${client?.company || ''} | ${selProj?.url || ''} | ${client?.industry || ''}`,
          taskHints: hints,
        }),
      });
      const data = await safeJson(res);
      if (data.success && data.results?.[0]) {
        const newResult = data.results[0];
        // Merge into existing crawlResults
        setCrawlResults((prev: any) => {
          if (!prev) return data;
          const existingResults = (prev.results || []).filter((r: any) => r.url !== clean);
          const merged = { ...prev, results: [...existingResults, newResult], urls_crawled: existingResults.length + 1 };
          // Update aggregated knowledge
          const agg = { ...Object.fromEntries((prev.aggregated_knowledge || []).map((k: any) => [k.key, k])) };
          for (const kf of (newResult.knowledge_fields || [])) agg[kf.key] = { ...kf, source_url: clean };
          merged.aggregated_knowledge = Object.values(agg);
          merged.cross_page_issues = merged.results.flatMap((r: any) => (r.page_analysis?.issues || []).map((i: any) => ({ ...i, url: r.url })));
          merged.cross_page_opportunities = merged.results.flatMap((r: any) => (r.page_analysis?.opportunities || []).map((o: any) => ({ ...o, url: r.url })));
          return merged;
        });
        setActiveCrawlUrls(prev => [...prev.filter(u => u !== clean), clean]);
        // Refresh library so this URL appears/updates in the Page Library
        loadAllCachedPages();
        toast({ title: `${clean.replace(/https?:\/\//, '').slice(0, 40)} crawled`, description: newResult.page_analysis ? 'Analysis complete' : newResult.error });
      }
    } catch (e: any) {
      toast({ title: 'Could not crawl URL', description: e.message, variant: 'destructive' });
    }
    setRecrawlingUrl('');
    setAddingUrl('');
  };

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
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
        body: JSON.stringify({
          action:         'compare_analysis',
          // Only send the active URL subset for comparison
          crawlResults: {
            ...crawlResults,
            results: (crawlResults.results || []).filter((r: any) =>
              activeCrawlUrls.length === 0 || activeCrawlUrls.includes(r.url)
            ),
          },
          projectContext: `${client?.company || ''} | ${selProj?.url || ''} | ${client?.industry || ''}`,
          existingBlocks,
          compareCriteria,
        }),
      });
      const data = await safeJson(res);
      if (data.success) {
        // Guard against empty analysis object (indicates server-side parse failure)
        const hasContent = data.analysis && Object.keys(data.analysis).length >= 3;
        if (!hasContent) {
          toast({
            title: 'Analysis returned empty',
            description: 'The model could not parse the response. Try again — if it repeats, reduce the number of URLs or use Force re-crawl to refresh stale data.',
            variant: 'destructive',
          });
        } else {
          setCompareResult(data.analysis);
          setCompareTab('matrix');
          toast({
            title: 'Manav Brain analysis complete',
            description: `${data.analysis?.card_proposals?.length || 0} card proposals · ${data.analysis?.errors?.length || 0} errors · ${data.analysis?.opportunities?.length || 0} opportunities`,
          });
        }
      } else {
        toast({ title: 'Analysis failed', description: data.error || 'Unknown error', variant: 'destructive' });
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
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
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
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
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

  /* ── V2 Data Room seed migration trigger ──
     Pulls honest data from clients, projects, project_integrations
     and existing project_knowledge into the new V2 fields. Never
     overwrites existing values. Idempotent: safe to re-run. */
  const runSeed = async () => {
    if (seedRunning) return;
    setSeedRunning(true);
    setSeedResult(null);
    const { summary, error } = await seedV2DataRoom(
      seedScope === 'this' && selProjId ? selProjId : undefined
    );
    setSeedRunning(false);
    if (error) {
      toast({ title: 'Seed failed', description: error, variant: 'destructive' });
      return;
    }
    setSeedResult(summary || null);
    /* refresh the knowledge view so newly-seeded values show up immediately */
    if (selProjId) {
      const { data } = await supabase.from('project_knowledge')
        .select('*').eq('project_id', selProjId);
      const grouped: Record<string, Record<string, KField>> = {};
      for (const row of (data || [])) {
        const k = row as KField;
        (grouped[k.category] ||= {})[k.field_key] = k;
      }
      setKnowledge(grouped);
    }
    toast({
      title: 'Seed complete',
      description: summary
        ? `${summary.totals.fields_seeded_total} field${summary.totals.fields_seeded_total === 1 ? '' : 's'} populated across ${summary.totals.projects} project${summary.totals.projects === 1 ? '' : 's'}.`
        : 'Done.',
    });
  };

  /* ── V2 Data Room AI Fill ──
     Honest AI-generated proposals for Tier 1+2 fields, drawn from
     website crawl, competitors, existing knowledge and audit data.
     Two-step PM-in-the-loop flow: preview → review → apply selected.
     Tier 3 fields stay empty but produce ready-to-send client questions. */
  const runAiFillPreview = async () => {
    if (!selProjId) {
      toast({ title: 'Pick a project first', description: 'AI Fill works on one project at a time.', variant: 'destructive' });
      return;
    }
    if (aiFillRunning) return;
    setAiFillRunning(true);
    setAiFillPreview(null);
    setAiFillModalOpen(true);
    const { preview, error } = await apiAiFillPreview(selProjId);
    setAiFillRunning(false);
    if (error || !preview) {
      toast({ title: 'AI Fill preview failed', description: error || 'Try again later.', variant: 'destructive' });
      setAiFillModalOpen(false);
      return;
    }
    setAiFillPreview(preview);
    /* default: select every NOT-already-filled proposal at high or medium confidence.
       PM can adjust before applying. */
    const defaults: Record<string, boolean> = {};
    for (const p of preview.proposals) {
      const key = `${p.category}.${p.field_key}`;
      defaults[key] = !p.already_filled && (p.proposal.confidence === 'high' || p.proposal.confidence === 'medium');
    }
    setAiFillSelected(defaults);
  };

  const runAiFillApply = async () => {
    if (!selProjId || !aiFillPreview || aiFillApplying) return;
    const selected = aiFillPreview.proposals
      .filter((p) => aiFillSelected[`${p.category}.${p.field_key}`] && !p.already_filled)
      .map((p) => ({
        category:   p.category,
        field_key:  p.field_key,
        value:      p.proposal.value,
        confidence: p.proposal.confidence,
        reasoning:  p.proposal.reasoning,
        sources:    p.proposal.sources,
      }));
    if (!selected.length) {
      toast({ title: 'Nothing selected', description: 'Tick at least one proposal to apply.' });
      return;
    }
    setAiFillApplying(true);
    const { success, applied, skipped_existing, error } = await apiAiFillApply({
      projectId:      selProjId,
      selectedFields: selected,
    });
    setAiFillApplying(false);
    if (!success) {
      toast({ title: 'AI Fill apply failed', description: error || 'Try again.', variant: 'destructive' });
      return;
    }
    toast({
      title: 'AI Fill applied',
      description: `${applied || 0} field${(applied || 0) === 1 ? '' : 's'} written${skipped_existing ? ` · ${skipped_existing} skipped (already filled)` : ''}.`,
    });
    /* refresh knowledge so AI-inferred values appear with their badge */
    const { data } = await supabase.from('project_knowledge')
      .select('*').eq('project_id', selProjId);
    const grouped: Record<string, Record<string, KField>> = {};
    for (const row of (data || [])) {
      const k = row as KField;
      (grouped[k.category] ||= {})[k.field_key] = k;
    }
    setKnowledge(grouped);
    setAiFillModalOpen(false);
    setAiFillPreview(null);
  };

  const toggleAiFillSelection = (category: string, fieldKey: string) => {
    const key = `${category}.${fieldKey}`;
    setAiFillSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
    const knData  = knowledge[category]?.[field.key];
    const source  = knData?.source_name || knData?.source;
    const dDate   = knData?.data_date;
    /* Piece 2: auto-synced fields (gsc_auto, ga4_auto) get a distinct badge
       + edit lock. The PM must click "Edit anyway" to override an auto-
       synced value, which prevents accidental overwrites of live data. */
    const autoSource: string | null =
      knData?.source === 'gsc_auto' ? 'GSC' :
      knData?.source === 'ga4_auto' ? 'GA4' :
      null;
    const isAutoSynced = !!autoSource;
    const overrideKey  = `${category}.${field.key}`;
    const overriding   = !!editOverrides[overrideKey];
    const inputLocked  = isAutoSynced && !overriding && !dirty;

    /* AI-inferred state — purple badge with the confidence + reasoning
       on click. Distinct from manual entry, distinct from GSC/GA4 sync.
       The PM can edit freely; once they save, source becomes 'manual'. */
    const isAiInferred = knData?.source === 'ai_inferred';
    let aiNotes: { confidence?: string; reasoning?: string; sources_used?: string[]; inferred_at?: string } | null = null;
    if (isAiInferred && knData?.notes) {
      try { aiNotes = JSON.parse(knData.notes); } catch { aiNotes = null; }
    }
    const aiConfidence = aiNotes?.confidence || 'medium';
    const aiBadgeTone =
      aiConfidence === 'high'   ? 'bg-purple-500/15 text-purple-300' :
      aiConfidence === 'medium' ? 'bg-purple-500/10 text-purple-400' :
                                   'bg-purple-500/8 text-purple-400/80';
    /* "stale" if AI-inferred and older than 60 days — prompt PM to verify */
    const isAiStale = isAiInferred && aiNotes?.inferred_at &&
      (Date.now() - new Date(aiNotes.inferred_at).getTime()) / 86_400_000 > 60;

    /* Document-extracted state — blue badge. Field was populated by
       extracting from an ingested document (Brand Studio H.1). The
       `notes` JSON includes confidence + evidence + source_doc id. */
    const isDocExtracted = knData?.source === 'document_extracted';
    let docNotes: { confidence?: string; evidence?: string; source_doc?: string; extracted_at?: string } | null = null;
    if (isDocExtracted && knData?.notes) {
      try { docNotes = JSON.parse(knData.notes); } catch { docNotes = null; }
    }
    const docConfidence = docNotes?.confidence || 'medium';
    const docBadgeTone =
      docConfidence === 'high'   ? 'bg-blue-500/15 text-blue-300' :
      docConfidence === 'medium' ? 'bg-blue-500/10 text-blue-400' :
                                    'bg-blue-500/8 text-blue-400/80';

    return (
      <div key={field.key} className="space-y-1">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-foreground">
            {field.label}
            {field.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {isAutoSynced && !dirty && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">
              <CheckCircle2 size={10}/> Auto-synced from {autoSource}
              {dDate && <span className="text-green-400/70 font-mono ml-1">{dDate}</span>}
            </span>
          )}
          {isAiInferred && !isAutoSynced && !dirty && (
            <span className={`ml-auto flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${aiBadgeTone}`} title={aiNotes?.reasoning || 'AI-inferred from sources'}>
              <Sparkles size={10}/> AI inferred · {aiConfidence}
              {isAiStale && <span className="text-amber-400 ml-1">· verify</span>}
            </span>
          )}
          {isDocExtracted && !isAutoSynced && !isAiInferred && !dirty && (
            <span className={`ml-auto flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${docBadgeTone}`} title={docNotes?.evidence || 'From an ingested document'}>
              <FileText size={10}/> From document · {docConfidence}
            </span>
          )}
          {!isAutoSynced && !isAiInferred && !isDocExtracted && val && !dirty && (
            <div className="flex items-center gap-1 ml-auto">
              {source && <span className="text-xs text-muted-foreground font-mono">{source}</span>}
              {dDate  && <span className="text-xs text-muted-foreground font-mono">· {dDate}</span>}
              <CheckCircle2 size={11} className="text-green-400"/>
            </div>
          )}
          {dirty && <span className="text-xs text-yellow-400 ml-auto">unsaved</span>}
        </div>

        {/* AI-inferred reasoning panel — collapsible, shows evidence */}
        {isAiInferred && aiNotes?.reasoning && !dirty && (
          <details className="text-[10px] pl-1">
            <summary className="cursor-pointer text-purple-400/70 hover:text-purple-400">Why this value?</summary>
            <div className="mt-1 pl-2 border-l-2 border-purple-500/30 space-y-0.5">
              <div className="text-foreground/80 italic">{aiNotes.reasoning}</div>
              {aiNotes.sources_used && aiNotes.sources_used.length > 0 && (
                <div className="text-muted-foreground">
                  <span className="font-semibold">Sources: </span>{aiNotes.sources_used.join(', ')}
                </div>
              )}
              {aiNotes.inferred_at && (
                <div className="text-muted-foreground/70">
                  Inferred {new Date(aiNotes.inferred_at).toLocaleDateString('en-GB')}{isAiStale ? ' (stale — verify with client)' : ''}
                </div>
              )}
            </div>
          </details>
        )}

        {/* Document-extracted evidence panel — parallel to AI inferred */}
        {isDocExtracted && docNotes?.evidence && !dirty && (
          <details className="text-[10px] pl-1">
            <summary className="cursor-pointer text-blue-400/70 hover:text-blue-400">From which document?</summary>
            <div className="mt-1 pl-2 border-l-2 border-blue-500/30 space-y-0.5">
              <div className="text-foreground/80 italic">{docNotes.evidence}</div>
              {source && (
                <div className="text-muted-foreground">
                  <span className="font-semibold">Source: </span>{source}
                </div>
              )}
              {docNotes.extracted_at && (
                <div className="text-muted-foreground/70">
                  Extracted {new Date(docNotes.extracted_at).toLocaleDateString('en-GB')}
                </div>
              )}
            </div>
          </details>
        )}

        {field.type === 'select' ? (
          <select
            value={val}
            onChange={e => setFieldPending(category, field.key, e.target.value)}
            disabled={inputLocked}
            className={`w-full h-9 text-sm px-3 rounded-xl border ${inputLocked ? 'border-green-500/20 bg-green-500/5 cursor-not-allowed' : 'border-border bg-background/60'} outline-none focus:border-primary/50`}
          >
            <option value="">— Select —</option>
            {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : field.type === 'date' ? (
          <input
            type="date"
            value={val}
            onChange={e => setFieldPending(category, field.key, e.target.value)}
            disabled={inputLocked}
            className={`w-full h-9 text-sm px-3 rounded-xl border ${inputLocked ? 'border-green-500/20 bg-green-500/5 cursor-not-allowed' : 'border-border bg-background/60'} outline-none focus:border-primary/50`}
          />
        ) : (
          <input
            type="text"
            value={val}
            onChange={e => setFieldPending(category, field.key, e.target.value)}
            placeholder={field.placeholder || ''}
            disabled={inputLocked}
            className={`w-full h-9 text-sm px-3 rounded-xl border ${inputLocked ? 'border-green-500/20 bg-green-500/5 cursor-not-allowed' : 'border-border bg-background/60'} outline-none focus:border-primary/50`}
          />
        )}
        {isAutoSynced && !overriding && !dirty && (
          <button
            type="button"
            onClick={() => setEditOverrides(prev => ({ ...prev, [overrideKey]: true }))}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >Edit anyway (overrides live {autoSource} value)</button>
        )}
        {isAutoSynced && overriding && !dirty && (
          <button
            type="button"
            onClick={() => setEditOverrides(prev => { const n = { ...prev }; delete n[overrideKey]; return n; })}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >Cancel override — keep live {autoSource} value</button>
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
        onProjectChange={handleProjectChange}
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
              {(clients||[]).filter((c:any)=>c?.id).map(c => {
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
                {id:'overview',    label:'Overview',      icon:Layers     },
                {id:'identity',    label:'Identity',      icon:Building2  },
                {id:'goals',       label:'Goals',         icon:Target     },
                {id:'audience',    label:'Audience',      icon:Users      },
                {id:'competitors', label:'Competitors',   icon:Star       },
                {id:'analytics',   label:'Analytics',     icon:BarChart3  },
                {id:'access_vault',    label:'🔑 Access Vault',     icon:Shield    },
                {id:'content_library', label:'📄 Content Library',  icon:FileEdit  },
                {id:'info_repository', label:'ℹ Info Repository',   icon:Sparkles  },
                {id:'approvals_log',   label:'🛡 Approvals Log',    icon:Shield    },
                {id:'technical',   label:'Technical',     icon:Settings   },
                {id:'backlinks',   label:'Backlinks',     icon:Link2      },
                {id:'content',     label:'Content',       icon:FileEdit   },
                {id:'cms',         label:'CMS & Tech',    icon:Settings   },
                {id:'access',      label:'Tool Access',   icon:Shield     },
                {id:'commercial',  label:'Commercial',    icon:Briefcase  },
                {id:'history',     label:'History',       icon:History    },
                {id:'brand_narrative', label:'Brand Narrative', icon:Sparkles},
                {id:'documents',   label:'Documents',     icon:FileText   },
                {id:'crawl',       label:'URL Crawler',   icon:Globe      },
              ].map(({id,label,icon:Icon})=>{
                const catKey = id === 'overview' || id === 'documents' || id === 'crawl' ? null :
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
                {/* ── V2 Data Room seed migration ──
                    One-shot tool to populate new V2 fields (identity, access
                    status, goal narrative draft) from data that already
                    exists elsewhere in the database. Idempotent — never
                    overwrites manually-entered values. */}
                <div className="rounded-2xl border border-blue-500/30 bg-blue-500/[0.04] p-5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">
                        Seed V2 fields from existing data
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        One-time helper to populate new V2 fields (Identity, Access status, Goal narrative) using data already in your database — client name, industry, GSC/GA4 connections, existing goal + success metric. Never overwrites anything you've typed manually. Safe to re-run.
                      </div>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="text-muted-foreground mr-1">Scope:</span>
                          <button
                            onClick={() => setSeedScope('this')}
                            disabled={seedRunning || !selProjId}
                            className={`px-2 py-1 rounded font-semibold uppercase tracking-wider ${
                              seedScope === 'this' ? 'bg-blue-500/15 text-blue-400' : 'text-muted-foreground hover:text-foreground'
                            } disabled:opacity-40`}
                          >
                            This project
                          </button>
                          <button
                            onClick={() => setSeedScope('all')}
                            disabled={seedRunning}
                            className={`px-2 py-1 rounded font-semibold uppercase tracking-wider ${
                              seedScope === 'all' ? 'bg-blue-500/15 text-blue-400' : 'text-muted-foreground hover:text-foreground'
                            } disabled:opacity-40`}
                          >
                            All projects
                          </button>
                        </div>
                        <button
                          onClick={runSeed}
                          disabled={seedRunning || (seedScope === 'this' && !selProjId)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-500/90 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {seedRunning ? (
                            <>
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                              Running…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              Run seed
                            </>
                          )}
                        </button>
                      </div>

                      {/* Results panel — shown after a run completes */}
                      {seedResult && (
                        <div className="mt-4 rounded-xl border border-border bg-background/60 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-foreground">Seed results</div>
                            <button
                              onClick={() => setSeedResult(null)}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              Dismiss
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-2">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Seeded</div>
                              <div className="text-lg font-bold font-mono text-green-400">{seedResult.totals.fields_seeded_total}</div>
                            </div>
                            <div className="rounded-lg bg-muted/40 border border-border p-2">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Already filled</div>
                              <div className="text-lg font-bold font-mono text-foreground/70">{seedResult.totals.fields_skipped_existing}</div>
                            </div>
                            <div className="rounded-lg bg-muted/20 border border-border p-2">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">No source</div>
                              <div className="text-lg font-bold font-mono text-muted-foreground">{seedResult.totals.fields_skipped_no_source}</div>
                            </div>
                          </div>
                          <div className="text-[10px] text-muted-foreground mb-2">
                            {seedResult.totals.projects} project{seedResult.totals.projects === 1 ? '' : 's'} processed.
                          </div>
                          {/* Per-project details (collapsible) */}
                          {seedResult.reports.length > 0 && (
                            <details className="text-[11px]">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-semibold">
                                Per-project detail
                              </summary>
                              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                                {seedResult.reports.map((r) => (
                                  <div key={r.project_id} className="rounded-lg border border-border/60 bg-background/40 p-2">
                                    <div className="text-xs font-semibold text-foreground/90">
                                      {r.client_name || r.project_name || r.project_id.slice(0, 8)}
                                    </div>
                                    {r.fields_seeded.length > 0 && (
                                      <div className="mt-1">
                                        <span className="text-[10px] text-green-400 font-semibold">Seeded {r.fields_seeded.length}: </span>
                                        <span className="text-[10px] text-muted-foreground">{r.fields_seeded.join(', ')}</span>
                                      </div>
                                    )}
                                    {r.fields_skipped_existing.length > 0 && (
                                      <div className="mt-0.5">
                                        <span className="text-[10px] text-foreground/60 font-semibold">Already filled {r.fields_skipped_existing.length}: </span>
                                        <span className="text-[10px] text-muted-foreground">{r.fields_skipped_existing.join(', ')}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── V2 Data Room AI Fill ──
                    Honest AI inference from website + competitors + existing data.
                    Tier 1+2 fields only (Tier 3 = client-only knowledge → questions). */}
                <div className="rounded-2xl border border-purple-500/30 bg-purple-500/[0.04] p-5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">
                        AI Fill — propose values from website + existing data
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Reads your crawled pages, competitors, and existing knowledge to propose honest values for fields the client hasn't filled. Every proposal carries a confidence level and the evidence behind it. PM reviews each one before anything is written. Fields only the client can answer (history, anti-goals, conversion economics, prohibited topics) stay empty — you get a ready-to-send list of questions instead.
                      </div>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <button
                          onClick={runAiFillPreview}
                          disabled={aiFillRunning || !selProjId}
                          className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 text-white hover:bg-purple-500/90 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {aiFillRunning ? (
                            <>
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                              Analyzing…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              AI Fill this project
                            </>
                          )}
                        </button>
                        <span className="text-[10px] text-muted-foreground">
                          Works on the currently-selected project · runs ~10-20 seconds
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

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
                            /* Category → tab id. Most are 1:1 but 'goal' and 'competitor'
                               historically have plural tab ids ('goals', 'competitors'). */
                            const tabId =
                              cat.category === 'goal'       ? 'goals' :
                              cat.category === 'competitor' ? 'competitors' :
                              cat.category;
                            setTab(tabId as any);
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
                              const tabId =
                                cat.category === 'goal'       ? 'goals' :
                                cat.category === 'competitor' ? 'competitors' :
                                cat.category;
                              setTab(tabId as any);
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
            {tab === 'analytics'   && (
              <div className="space-y-4">
                {/* Cross-link to the new Planning workspace */}
                {selProjId && (
                  <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.06] via-card/40 to-violet-500/[0.04] p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-400 text-lg">📋</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-foreground">Strategy planning moved to its own workspace</div>
                      <div className="text-[11px] text-muted-foreground">What-If Simulator, Goal Engine, and Strategy Blockers now live in <strong>Planning</strong> — alongside the strategy pipeline board, builder, and impact tracker.</div>
                    </div>
                    <a href="/planning" className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/30 whitespace-nowrap">
                      Open Planning →
                    </a>
                  </div>
                )}
                {/* Pure data layer — what we know */}
                {selProjId && <AnalyticsIntelPanel projectId={selProjId} />}
                <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="analytics"/></div>
              </div>
            )}
            {tab === 'access_vault'    && selProjId && <AccessVaultPanel    projectId={selProjId} />}
            {tab === 'content_library' && selProjId && <ContentLibraryPanel projectId={selProjId} />}
            {tab === 'info_repository' && selProjId && <InfoRepositoryPanel projectId={selProjId} />}
            {tab === 'approvals_log'   && selProjId && <ApprovalsLogPanel   projectId={selProjId} />}
            {tab === 'technical'   && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="technical"/></div>}
            {tab === 'competitors' && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="competitor"/></div>}
            {/* Data Room V2 sections — added during integration foundation work */}
            {tab === 'identity'    && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="identity"/></div>}
            {tab === 'audience'    && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="audience"/></div>}
            {tab === 'content'     && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="content"/></div>}
            {tab === 'backlinks'   && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="backlinks"/></div>}
            {tab === 'commercial'  && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="commercial"/></div>}
            {tab === 'history'     && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="history"/></div>}
            {tab === 'brand_narrative' && <div className="rounded-2xl border border-border bg-card/60 p-6"><CategoryForm catKey="brand_narrative"/></div>}

            {/* ── CRAWL TAB ── */}
            {tab === 'crawl' && (
              <div className="space-y-5">
                {/* ── Page Library — all historically crawled URLs ── */}
                <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80">
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        <Database size={13} className="text-primary"/>
                        Page Library
                        {allCachedPages.length > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-normal">
                            {allCachedPages.length} saved
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Every URL crawled for this project — pick any combination for Manav Brain analysis
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {allCachedPages.length > 0 && (
                        <>
                          <button
                            onClick={()=>{
                              const ownHost = (selProj?.url||'').replace(/https?:\/\//,'').replace(/\/.*$/,'').toLowerCase();
                              const ownUrls = allCachedPages.filter(p=>p.url.replace(/https?:\/\//,'').replace(/\/.*$/,'').toLowerCase()===ownHost||p.url.replace(/https?:\/\//,'').replace(/\/.*$/,'').toLowerCase().endsWith('.'+ownHost)).map(p=>p.url);
                              setActiveCrawlUrls(ownUrls);
                              setCrawlResults(buildResultsFromSelection(ownUrls, allCachedPages));
                              setCrawlSaved(true);
                            }}
                            className="text-xs px-2 py-1 rounded-lg border border-blue-400/25 text-blue-400/80 hover:bg-blue-400/10 hover:text-blue-400"
                          >Own only</button>
                          <button
                            onClick={()=>{
                              const allUrls = allCachedPages.filter(p=>p.page_analysis).map(p=>p.url);
                              setActiveCrawlUrls(allUrls);
                              setCrawlResults(buildResultsFromSelection(allUrls, allCachedPages));
                              setCrawlSaved(true);
                            }}
                            className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                          >Select all</button>
                          <button
                            onClick={()=>{ setActiveCrawlUrls([]); setCrawlResults(null); }}
                            className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                          >Clear</button>
                        </>
                      )}
                      <button onClick={loadAllCachedPages} disabled={libLoading}
                        className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50">
                        <RefreshCw size={9} className={libLoading?'animate-spin':''}/>Refresh
                      </button>
                    </div>
                  </div>

                  {libLoading && (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 size={13} className="animate-spin"/>Loading page library…
                    </div>
                  )}

                  {!libLoading && allCachedPages.length === 0 && (
                    <div className="px-4 py-8 text-center">
                      <Globe size={22} className="text-muted-foreground/20 mx-auto mb-2"/>
                      <p className="text-sm text-muted-foreground">No pages crawled yet.</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Crawl some URLs below — they'll appear here permanently.</p>
                    </div>
                  )}

                  {!libLoading && allCachedPages.length > 0 && (()=>{
                    const ownHost = (selProj?.url||'').replace(/https?:\/\//,'').replace(/\/.*$/,'').toLowerCase();
                    const isOwn  = (url:string) => {
                      if (!ownHost) return false;
                      const h = url.replace(/https?:\/\//,'').replace(/\/.*$/,'').toLowerCase();
                      return h===ownHost||h.endsWith('.'+ownHost);
                    };
                    const isComp = (url:string) => {
                      const compHosts = ['competitor_1','competitor_2','competitor_3']
                        .map(k=>getField('competitor',k)).filter(Boolean)
                        .map(c=>c.replace(/https?:\/\//,'').replace(/\/.*$/,'').toLowerCase());
                      const h = url.replace(/https?:\/\//,'').replace(/\/.*$/,'').toLowerCase();
                      return compHosts.some(c=>h===c||h.endsWith('.'+c));
                    };

                    // Group: own pages first, then competitors, then other
                    const sorted = [
                      ...allCachedPages.filter(p=>isOwn(p.url)),
                      ...allCachedPages.filter(p=>isComp(p.url)&&!isOwn(p.url)),
                      ...allCachedPages.filter(p=>!isOwn(p.url)&&!isComp(p.url)),
                    ];

                    return (
                      <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
                        {sorted.map((page:any) => {
                          const checked = activeCrawlUrls.includes(page.url);
                          const own  = isOwn(page.url);
                          const comp = isComp(page.url);
                          const ok   = !!page.page_analysis;
                          const conf = page.page_analysis?.data_confidence;
                          const age  = page.cached_at
                            ? Math.floor((Date.now()-new Date(page.cached_at).getTime())/86400000)
                            : null;
                          const isRecrawlingThis = recrawlingUrl === page.url;
                          return (
                            <div key={page.url}
                              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${checked?own?'bg-blue-400/4':comp?'bg-orange-400/4':'bg-primary/3':'hover:bg-secondary/20'}`}>
                              <input type="checkbox" checked={checked}
                                onChange={()=>togglePageInAnalysis(page.url, allCachedPages)}
                                className="accent-primary shrink-0 h-3.5 w-3.5"/>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-mono text-foreground truncate max-w-[280px]">
                                    {page.url.replace(/https?:\/\//, '')}
                                  </span>
                                  {own  && <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400 font-medium shrink-0">Own</span>}
                                  {comp && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-400/10 text-orange-400 font-medium shrink-0">Comp</span>}
                                </div>
                                {page.page_analysis?.title_tag && page.page_analysis.title_tag !== 'Not found' && (
                                  <div className="text-xs text-muted-foreground truncate mt-0.5">{page.page_analysis.title_tag}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {ok ? (
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full border ${conf==='high'?'border-green-400/25 text-green-400':conf==='medium'?'border-yellow-400/25 text-yellow-400':'border-border text-muted-foreground'}`}>
                                    {conf||'?'}
                                  </span>
                                ) : (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full border border-red-400/25 text-red-400">failed</span>
                                )}
                                {age !== null && (
                                  <span className="text-xs text-muted-foreground/50">{age===0?'today':`${age}d ago`}</span>
                                )}
                                <button onClick={()=>addSingleUrl(page.url)} disabled={!!recrawlingUrl || crawlRunning}
                                  title="Re-crawl this URL with fresh data"
                                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-cyan-400 hover:bg-cyan-400/10 disabled:opacity-30 transition-colors">
                                  {isRecrawlingThis
                                    ? <Loader2 size={11} className="animate-spin text-cyan-400"/>
                                    : <RefreshCw size={11}/>}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {activeCrawlUrls.length > 0 && (
                    <div className="px-4 py-2.5 border-t border-border bg-background/30 flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{activeCrawlUrls.length}</span> page{activeCrawlUrls.length!==1?'s':''} selected for analysis
                      </span>
                      {!crawlSaved && crawlResults?.aggregated_knowledge?.length > 0 && (
                        <button onClick={saveCrawlToKnowledge} disabled={crawlSaving}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 disabled:opacity-50 font-medium">
                          {crawlSaving?<><Loader2 size={10} className="animate-spin"/>Saving…</>:<><Save size={10}/>Save to Data Room</>}
                        </button>
                      )}
                      {crawlSaved && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={10}/>Saved</span>}
                    </div>
                  )}
                </div>

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
                  <div className="space-y-2.5">
                    {/* Primary action row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={runCrawl}
                        disabled={crawlRunning||!crawlUrls.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-sm disabled:opacity-50 transition-colors"
                      >
                        {crawlRunning
                          ? <><Loader2 size={14} className="animate-spin"/>Crawling…</>
                          : <><Globe size={14}/>Crawl {crawlUrls.split(String.fromCharCode(10)).filter(Boolean).slice(0,10).length||''} URL{crawlUrls.split(String.fromCharCode(10)).filter(Boolean).length!==1?'s':''}</>}
                      </button>

                      {crawlUrls.trim()&&!crawlRunning && (
                        <button
                          onClick={()=>crawlUrls.split(String.fromCharCode(10)).map((l:string)=>l.trim()).filter(Boolean).slice(0,10).forEach((u:string)=>{const c=u.startsWith('http')?u:`https://${u}`;if(!crawlPreview[c])previewUrl(c);})}
                          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5"
                        >Test reachability</button>
                      )}
                    </div>
                    {/* Force refresh toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                      <input type="checkbox" checked={forceRefresh} onChange={e=>setForceRefresh(e.target.checked)}
                        className="accent-primary h-3.5 w-3.5"/>
                      <span className="text-xs text-muted-foreground">
                        Force re-crawl
                        <span className="text-muted-foreground/50 ml-1">(ignore saved cache — fetch everything fresh)</span>
                      </span>
                    </label>
                    {/* Progress indicator */}
                    {crawlRunning && (
                      <div className="flex items-center gap-2 text-xs text-cyan-400/80">
                        <Loader2 size={11} className="animate-spin"/>
                        Fetching pages · results appear as each URL completes · auto-saved to cache
                      </div>
                    )}
                  </div>
                </div>

                {crawlResults && (() => {
                  const ownDomain  = (selProj?.url||'').replace(/https?:\/\//,'').replace(/\/+$/,'').split('/')[0];
                  const compDomains = ['competitor_1','competitor_2','competitor_3']
                    .map(k=>getField('competitor',k)).filter(Boolean)
                    .map(c=>c.replace(/https?:\/\//,'').replace(/\/+$/,'').split('/')[0]);
                  const isOwn  = (url:string) => !!ownDomain && url.includes(ownDomain);
                  const isComp = (url:string) => compDomains.some(d=>url.includes(d));

                  // Full results pool + active subset for comparison
                  const allResults    = crawlResults.results || [];
                  const activeResults = activeCrawlUrls.length > 0
                    ? allResults.filter((r:any) => activeCrawlUrls.includes(r.url))
                    : allResults;

                  const CRITERIA_LIBRARY = [
                    { id:'title_and_meta',     label:'Title & Meta',          desc:'Title tag quality, length, keyword presence; meta description completeness' },
                    { id:'heading_structure',  label:'Heading Structure',     desc:'H1 presence and quality, H2/H3 hierarchy, topic coverage through headings' },
                    { id:'content_quality',    label:'Content Quality',       desc:'Word count, reading level, content depth, E-E-A-T signals, trust elements' },
                    { id:'schema_markup',      label:'Schema / Structured Data', desc:'JSON-LD types present, schema completeness, FAQ/HowTo/Article schema' },
                    { id:'internal_linking',   label:'Internal Linking',      desc:'Internal link count, anchor text quality, crawlability signals' },
                    { id:'geo_readiness',      label:'GEO & AI Visibility',   desc:'FAQ sections, direct answer format, Perplexity citation likelihood, entity coverage' },
                    { id:'technical_issues',   label:'Technical Issues',      desc:'Canonical tags, robots meta, OG tags, image alt attributes, broken signals' },
                    { id:'cta_effectiveness',  label:'CTAs & Conversion',     desc:'CTA presence, button text quality, conversion element placement' },
                    { id:'keyword_targeting',  label:'Keyword Targeting',     desc:'Primary keyword in title/H1/meta, LSI term coverage, semantic relevance' },
                    { id:'competitive_gaps',   label:'Competitive Gaps',      desc:'What competitors have that your pages lack; features, content angles, schema' },
                    { id:'content_freshness',  label:'Content Signals',       desc:'Recency signals, date markup, update frequency indicators' },
                    { id:'page_speed_signals', label:'Page Speed Signals',    desc:'Observable performance signals: lazy loading, image optimisation, render-blocking' },
                  ];

                  return (
                    <div className="space-y-4">

                      {/* ── Top summary bar ── */}
                      <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-border bg-card/60 px-5 py-4">
                        <div>
                          <div className="font-bold text-sm flex items-center gap-3">
                            {allResults.length} pages crawled
                            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20">
                              {allResults.filter((r:any)=>isOwn(r.url)).length} own
                            </span>
                            {allResults.filter((r:any)=>isComp(r.url)).length>0 && (
                              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-orange-400/10 text-orange-400 border border-orange-400/20">
                                {allResults.filter((r:any)=>isComp(r.url)).length} competitor
                              </span>
                            )}
                            {activeCrawlUrls.length > 0 && activeCrawlUrls.length < allResults.length && (
                              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                {activeCrawlUrls.length} in comparison
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {crawlResults.cross_page_issues?.length||0} issues · {crawlResults.cross_page_opportunities?.length||0} opportunities
                            {crawlResults.crawled_at && <span className="ml-2">· {crawlResults.crawled_at.split('T')[0]}</span>}
                          </div>
                        </div>

                      </div>

                      {/* ══ CRITERIA SELECTOR + URL MANAGER (always visible) ══ */}
                      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                        <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">

                          {/* LEFT: Comparison criteria */}
                          <div className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-sm">Comparison criteria</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{compareCriteria.length} selected — Manav Brain will focus on these</div>
                              </div>
                              <div className="flex gap-1">
                                <button onClick={()=>setCompareCriteria(CRITERIA_LIBRARY.map(c=>c.id))}
                                  className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground">All</button>
                                <button onClick={()=>setCompareCriteria(['title_and_meta','schema_markup','geo_readiness','technical_issues'])}
                                  className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground">Quick</button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-1 max-h-56 overflow-y-auto pr-1">
                              {CRITERIA_LIBRARY.map(c=>(
                                <label key={c.id}
                                  className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${compareCriteria.includes(c.id)?'bg-primary/8 border border-primary/20':'border border-transparent hover:bg-secondary/30'}`}>
                                  <input type="checkbox" checked={compareCriteria.includes(c.id)}
                                    onChange={e=>setCompareCriteria(prev=>e.target.checked?[...prev,c.id]:prev.filter(x=>x!==c.id))}
                                    className="mt-0.5 accent-primary shrink-0"/>
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold leading-tight">{c.label}</div>
                                    <div className="text-xs text-muted-foreground leading-relaxed mt-0.5">{c.desc}</div>
                                  </div>
                                </label>
                              ))}
                            </div>
                            {/* Custom criterion */}
                            <div className="flex gap-2 pt-1 border-t border-border/50">
                              <input value={customCriterion} onChange={e=>setCustomCriterion(e.target.value)}
                                onKeyDown={e=>{if(e.key==='Enter'&&customCriterion.trim()){setCompareCriteria(p=>[...p,customCriterion.trim()]);setCustomCriterion('');}}}
                                placeholder="Add custom criterion…"
                                className="flex-1 h-7 text-xs px-2.5 rounded-lg border border-border bg-background/60 outline-none focus:border-primary/50"/>
                              <button onClick={()=>{if(customCriterion.trim()){setCompareCriteria(p=>[...p,customCriterion.trim()]);setCustomCriterion('');}}}
                                disabled={!customCriterion.trim()}
                                className="h-7 px-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs hover:bg-primary/20 disabled:opacity-40">
                                <Plus size={11}/>
                              </button>
                            </div>
                            {/* Custom criteria pills */}
                            {compareCriteria.filter(c=>!CRITERIA_LIBRARY.some(l=>l.id===c)).length>0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {compareCriteria.filter(c=>!CRITERIA_LIBRARY.some(l=>l.id===c)).map(c=>(
                                  <span key={c} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-primary/25 bg-primary/8 text-primary">
                                    {c}
                                    <button onClick={()=>setCompareCriteria(p=>p.filter(x=>x!==c))} className="hover:text-red-400"><X size={9}/></button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* RIGHT: URL management */}
                          <div className="p-4 space-y-3">
                            <div>
                              <div className="font-semibold text-sm">URLs in comparison</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Toggle to include/exclude · Add new URLs to crawl live
                              </div>
                            </div>

                            {/* URL list with toggles */}
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {allResults.map((r:any)=>{
                                const active  = activeCrawlUrls.includes(r.url);
                                const own     = isOwn(r.url);
                                const comp    = isComp(r.url);
                                const isRecrawling = recrawlingUrl === r.url;
                                return (
                                  <div key={r.url} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border transition-all ${active?own?'border-blue-400/25 bg-blue-400/5':comp?'border-orange-400/25 bg-orange-400/5':'border-border bg-background/30':'border-border/30 bg-background/10 opacity-50'}`}>
                                    <input type="checkbox" checked={active}
                                      onChange={e=>setActiveCrawlUrls(prev=>e.target.checked?[...prev,r.url]:prev.filter(u=>u!==r.url))}
                                      className="accent-primary shrink-0"/>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-mono truncate">{r.url.replace(/https?:\/\//,'')}</div>
                                      {r.page_analysis?.title_tag && (
                                        <div className="text-xs text-muted-foreground truncate">{r.page_analysis.title_tag}</div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {own  && <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400 font-medium">Own</span>}
                                      {comp && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-400/10 text-orange-400 font-medium">Comp</span>}
                                      {!r.page_analysis && <span className="text-xs text-red-400/70">Failed</span>}
                                      <button
                                        onClick={()=>addSingleUrl(r.url)}
                                        disabled={!!recrawlingUrl}
                                        title="Re-crawl this URL"
                                        className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-30">
                                        {isRecrawling?<Loader2 size={10} className="animate-spin"/>:<RefreshCw size={10}/>}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Add new URL */}
                            <div className="flex gap-2 pt-1 border-t border-border/50">
                              <input value={addingUrl} onChange={e=>setAddingUrl(e.target.value)}
                                onKeyDown={e=>e.key==='Enter'&&addingUrl.trim()&&!recrawlingUrl&&addSingleUrl(addingUrl)}
                                placeholder="https://… add new URL"
                                className="flex-1 h-8 text-xs px-2.5 rounded-lg border border-border bg-background/60 outline-none focus:border-primary/50 font-mono"/>
                              <button
                                onClick={()=>addingUrl.trim()&&addSingleUrl(addingUrl)}
                                disabled={!addingUrl.trim()||!!recrawlingUrl}
                                className="h-8 px-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 disabled:opacity-40 flex items-center gap-1">
                                {recrawlingUrl&&addingUrl.trim()&&recrawlingUrl.includes(addingUrl.replace(/https?:\/\//,'').slice(0,10))
                                  ?<Loader2 size={11} className="animate-spin"/>:<Plus size={11}/>}
                                Crawl
                              </button>
                            </div>

                            {/* Quick-add from knowledge */}
                            {(selProj?.url || getField('competitor','competitor_1')) && (
                              <div className="flex flex-wrap gap-1.5">
                                {selProj?.url && !allResults.some((r:any)=>r.url===selProj.url) && (
                                  <button onClick={()=>addSingleUrl(selProj!.url)} disabled={!!recrawlingUrl}
                                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-blue-400/20 text-blue-400/70 hover:text-blue-400 hover:border-blue-400/40 disabled:opacity-40">
                                    <Plus size={9}/>{selProj.url.replace(/https?:\/\//,'').slice(0,25)}
                                  </button>
                                )}
                                {['competitor_1','competitor_2','competitor_3'].map(k=>{
                                  const comp = getField('competitor',k);
                                  if (!comp) return null;
                                  const full = comp.startsWith('http')?comp:`https://${comp}`;
                                  if (allResults.some((r:any)=>r.url===full)) return null;
                                  return (
                                    <button key={k} onClick={()=>addSingleUrl(full)} disabled={!!recrawlingUrl}
                                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-orange-400/20 text-orange-400/70 hover:text-orange-400 hover:border-orange-400/40 disabled:opacity-40">
                                      <Plus size={9}/>{comp.replace(/https?:\/\//,'').slice(0,22)}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Analyse button spanning full width */}
                        <div className="px-4 py-3 border-t border-border bg-background/20">
                          <button onClick={runCompareAnalysis} disabled={compareRunning||activeCrawlUrls.length===0}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                            {compareRunning
                              ?<><Loader2 size={14} className="animate-spin"/>Manav Brain analysing {activeResults.length} pages on {compareCriteria.length} criteria…</>
                              :<><Brain size={14}/>Ask Manav Brain — {activeResults.length} page{activeResults.length!==1?'s':''} · {compareCriteria.length} criteri{compareCriteria.length===1?'on':'a'}</>}
                          </button>
                          {compareRunning && (
                            <p className="text-xs text-muted-foreground text-center mt-1.5">
                              Comparing: {CRITERIA_LIBRARY.filter(c=>compareCriteria.includes(c.id)).map(c=>c.label).join(' · ')}
                              {compareCriteria.filter(c=>!CRITERIA_LIBRARY.some(l=>l.id===c)).map(c=>` · ${c}`)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* ── Main tab bar (appears after first analysis) ── */}
                      <div className="flex gap-0 border-b border-border overflow-x-auto">
                        {([
                          {id:'urls',    label:'Page Results', badge:null},
                          {id:'compare', label:'Side-by-Side', badge: selectedOwnUrl&&selectedCompUrl?'●':null},
                          ...(compareResult?[
                            {id:'matrix',        label:'Matrix',      badge:null},
                            {id:'errors',        label:'Errors',      badge:compareResult.errors?.filter((e:any)=>e.severity==='critical'||e.severity==='high').length||null},
                            {id:'opportunities', label:'Opportunities',badge:compareResult.opportunities?.length||null},
                            {id:'geo',           label:'GEO & AI',    badge:null},
                            {id:'confidence',    label:'Confidence',  badge:compareResult.confidence_boosters?.length||null},
                            {id:'gaps',          label:'Gaps',        badge:null},
                            {id:'cards',         label:'Cards',       badge:compareResult.card_proposals?.length||null},
                          ]:[]),
                        ]).map((tab:any)=>(
                          <button key={tab.id} onClick={()=>setCompareTab(tab.id)}
                            className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${compareTab===tab.id?'border-primary text-primary':'border-transparent text-muted-foreground hover:text-foreground'}`}>
                            {tab.label}
                            {tab.badge!=null && <span className={`px-1.5 py-0.5 rounded-full text-xs font-mono ${compareTab===tab.id?'bg-primary/20 text-primary':'bg-secondary text-muted-foreground'}`}>{tab.badge}</span>}
                          </button>
                        ))}
                      </div>

                      {/* ════════ PAGE RESULTS TAB ════════ */}
                      {compareTab==='urls' && (
                        <div className="space-y-4">
                          {(() => {
                            const ownR  = (crawlResults.results||[]).filter((r:any)=>isOwn(r.url));
                            const compR = (crawlResults.results||[]).filter((r:any)=>isComp(r.url));
                            const othR  = (crawlResults.results||[]).filter((r:any)=>!isOwn(r.url)&&!isComp(r.url));
                            return (<>
                              {ownR.length>0&&(<div><div className="flex items-center gap-2 mb-2"><div className="h-2.5 w-2.5 rounded-full bg-blue-400 shrink-0"/><span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Your pages ({ownR.length})</span></div><div className="space-y-3">{ownR.map((r:any,i:number)=>(<PageResultCard key={i} r={r} isOwn={isOwn(r.url)} isComp={isComp(r.url)} onSelectOwn={():void=>{setSelectedOwnUrl(selectedOwnUrl===r.url?'':r.url);}} onSelectComp={():void=>{}} selectedOwn={selectedOwnUrl===r.url} selectedComp={false as boolean}/>))}</div></div>)}
                              {compR.length>0&&(<div><div className="flex items-center gap-2 mb-2"><div className="h-2.5 w-2.5 rounded-full bg-orange-400 shrink-0"/><span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">Competitor pages ({compR.length})</span></div><div className="space-y-3">{compR.map((r:any,i:number)=>(<PageResultCard key={i} r={r} isOwn={isOwn(r.url)} isComp={isComp(r.url)} onSelectOwn={():void=>{}} onSelectComp={():void=>{setSelectedCompUrl(selectedCompUrl===r.url?'':r.url);}} selectedOwn={false as boolean} selectedComp={selectedCompUrl===r.url}/>))}</div></div>)}
                              {othR.length>0&&(<div><div className="flex items-center gap-2 mb-2"><div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 shrink-0"/><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Other ({othR.length})</span></div><div className="space-y-3">{othR.map((r:any,i:number)=>(<PageResultCard key={i} r={r} isOwn={isOwn(r.url)} isComp={isComp(r.url)} onSelectOwn={():void=>{setSelectedOwnUrl(selectedOwnUrl===r.url?'':r.url);}} onSelectComp={():void=>{setSelectedCompUrl(selectedCompUrl===r.url?'':r.url);}} selectedOwn={selectedOwnUrl===r.url} selectedComp={selectedCompUrl===r.url}/>))}</div></div>)}
                              {(selectedOwnUrl||selectedCompUrl)&&(<div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3"><div className="text-xs">{selectedOwnUrl&&<span className="text-blue-400 font-medium">Own: {selectedOwnUrl.replace(/https?:\/\//,'').slice(0,40)}</span>}{selectedOwnUrl&&selectedCompUrl&&<span className="text-muted-foreground mx-2">vs</span>}{selectedCompUrl&&<span className="text-orange-400 font-medium">Comp: {selectedCompUrl.replace(/https?:\/\//,'').slice(0,40)}</span>}</div><button onClick={()=>setCompareTab('compare')} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90"><GitCompare size={11}/>Compare →</button></div>)}
                            </>);
                          })()}
                        </div>
                      )}

                      {/* ════════ SIDE-BY-SIDE TAB ════════ */}
                      {compareTab==='compare' && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-blue-400/25 bg-blue-400/5 p-3"><div className="text-xs font-mono text-blue-400 uppercase mb-2">Your page</div><select value={selectedOwnUrl} onChange={e=>setSelectedOwnUrl(e.target.value)} className="w-full text-xs h-8 px-2 rounded-lg border border-border bg-background/60 outline-none"><option value="">Select your page…</option>{(crawlResults.results||[]).filter((r:any)=>r.page_analysis).map((r:any,i:number)=>(<option key={i} value={r.url}>{r.url.replace(/https?:\/\//,'').slice(0,45)}</option>))}</select></div>
                            <div className="rounded-xl border border-orange-400/25 bg-orange-400/5 p-3"><div className="text-xs font-mono text-orange-400 uppercase mb-2">Competitor page</div><select value={selectedCompUrl} onChange={e=>setSelectedCompUrl(e.target.value)} className="w-full text-xs h-8 px-2 rounded-lg border border-border bg-background/60 outline-none"><option value="">Select competitor page…</option>{(crawlResults.results||[]).filter((r:any)=>r.page_analysis).map((r:any,i:number)=>(<option key={i} value={r.url}>{r.url.replace(/https?:\/\//,'').slice(0,45)}</option>))}</select></div>
                          </div>
                          {selectedOwnUrl&&selectedCompUrl?(()=>{
                            const ownPage  = (crawlResults.results||[]).find((r:any)=>r.url===selectedOwnUrl)?.page_analysis;
                            const compPage = (crawlResults.results||[]).find((r:any)=>r.url===selectedCompUrl)?.page_analysis;
                            if(!ownPage||!compPage) return <p className="text-sm text-muted-foreground">Select pages with analysis data.</p>;
                            const signals=[{label:'Title',own:ownPage.title_tag,comp:compPage.title_tag,ownMeta:`${ownPage.title_length||0}ch`,compMeta:`${compPage.title_length||0}ch`},{label:'H1',own:ownPage.h1,comp:compPage.h1},{label:'Meta',own:ownPage.meta_description,comp:compPage.meta_description,ownMeta:`${ownPage.meta_desc_length||0}ch`,compMeta:`${compPage.meta_desc_length||0}ch`},{label:'Words',own:String(ownPage.word_count||0),comp:String(compPage.word_count||0)},{label:'Schema',own:ownPage.schema_types?.join(', ')||'None',comp:compPage.schema_types?.join(', ')||'None'},{label:'Quality',own:ownPage.content_quality||'?',comp:compPage.content_quality||'?'},{label:'Int.links',own:String(ownPage.internal_links||0),comp:String(compPage.internal_links||0)},{label:'GEO',own:ownPage.geo_readiness?.answer_format_quality||'?',comp:compPage.geo_readiness?.answer_format_quality||'?'},{label:'FAQs',own:ownPage.faqs_detected?.length?`${ownPage.faqs_detected.length} FAQs`:'None',comp:compPage.faqs_detected?.length?`${compPage.faqs_detected.length} FAQs`:'None'},{label:'CTAs',own:ownPage.cta_elements?.join(', ')||'None',comp:compPage.cta_elements?.join(', ')||'None'}];
                            return (<div className="space-y-3">
                              <div className="rounded-2xl border border-border bg-card/40 overflow-hidden"><div className="grid grid-cols-3 bg-card/80 border-b border-border"><div className="px-3 py-2 text-xs font-semibold text-muted-foreground">Signal</div><div className="px-3 py-2 text-xs font-semibold text-blue-400 border-l border-border">Your page <span className="font-normal opacity-60">{selectedOwnUrl.replace(/https?:\/\//,'').slice(0,25)}</span></div><div className="px-3 py-2 text-xs font-semibold text-orange-400 border-l border-border">Competitor <span className="font-normal opacity-60">{selectedCompUrl.replace(/https?:\/\//,'').slice(0,25)}</span></div></div>{signals.map((s,i)=>{const ob=/missing|none|not found|^0$/i.test(s.own||'');const cb=/missing|none|not found|^0$/i.test(s.comp||'');return(<div key={i} className={`grid grid-cols-3 border-b border-border/40 ${i%2===0?'bg-background/20':''}`}><div className="px-3 py-2.5 text-xs font-medium text-muted-foreground">{s.label}</div><div className={`px-3 py-2.5 text-xs border-l border-border/40 ${!ob&&cb?'text-green-400':ob?'text-red-400':'text-foreground'}`}><span className="break-words">{s.own||'—'}</span>{s.ownMeta&&<span className="ml-1 text-muted-foreground/50">({s.ownMeta})</span>}</div><div className={`px-3 py-2.5 text-xs border-l border-border/40 ${!cb&&ob?'text-green-400':cb?'text-red-400':'text-foreground'}`}><span className="break-words">{s.comp||'—'}</span>{s.compMeta&&<span className="ml-1 text-muted-foreground/50">({s.compMeta})</span>}</div></div>);})}</div>
                              <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-border bg-card/40 p-3 space-y-1.5"><div className="text-xs font-mono text-red-400 uppercase">Your issues ({(ownPage.issues||[]).length})</div>{(ownPage.issues||[]).map((issue:any,j:number)=>(<div key={j} className={`text-xs rounded-lg px-2.5 py-1.5 ${issue.severity==='critical'?'bg-red-400/8 text-red-400':issue.severity==='high'?'bg-orange-400/8 text-orange-400':'bg-yellow-400/5 text-yellow-400'}`}><span className="font-semibold">[{issue.severity}]</span> {issue.detail}{issue.fix&&<div className="text-muted-foreground mt-0.5">→ {issue.fix}</div>}</div>))}{!(ownPage.issues?.length)&&<p className="text-xs text-green-400">None detected</p>}</div><div className="rounded-xl border border-orange-400/15 bg-card/40 p-3 space-y-1.5"><div className="text-xs font-mono text-orange-400 uppercase">Competitor issues ({(compPage.issues||[]).length})</div>{(compPage.issues||[]).map((issue:any,j:number)=>(<div key={j} className={`text-xs rounded-lg px-2.5 py-1.5 ${issue.severity==='critical'?'bg-red-400/8 text-red-400':issue.severity==='high'?'bg-orange-400/8 text-orange-400':'bg-yellow-400/5 text-yellow-400'}`}><span className="font-semibold">[{issue.severity}]</span> {issue.detail}</div>))}{!(compPage.issues?.length)&&<p className="text-xs text-green-400">None detected</p>}</div></div>
                            </div>);
                          })():<div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">Select one page from each column to compare side by side.</div>}
                        </div>
                      )}

                      {/* ════════ MANAV BRAIN ANALYSIS ════════ */}
                      {compareRunning&&(<div className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-8 flex flex-col items-center gap-3"><Loader2 size={28} className="animate-spin text-violet-400"/><div className="font-semibold text-sm">Manav Brain analysing…</div><div className="text-xs text-muted-foreground text-center max-w-sm">Evaluating {activeResults.length} pages across {compareCriteria.length} criteria</div></div>)}

                      {compareResult&&!compareRunning&&(()=>{
                        const tabContent:Record<string,React.ReactNode>={};

                        tabContent['matrix']=compareResult.comparison_matrix?(<div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead><tr className="border-b border-border">{(compareResult.comparison_matrix.headers||[]).map((h:string,i:number)=>(<th key={i} className={`text-left py-2 font-semibold ${i===0?'pr-4 text-muted-foreground w-36':'px-3 text-center text-muted-foreground/70'}`}>{h}</th>))}<th className="px-2 text-center text-muted-foreground/50 text-xs">Best</th></tr></thead><tbody>{(compareResult.comparison_matrix.rows||[]).map((row:any,i:number)=>(<tr key={i} className="border-b border-border/40 hover:bg-secondary/10"><td className="py-2.5 pr-4 font-medium text-foreground">{row.signal}</td>{(row.values||[]).map((val:string,j:number)=>{const ok=/^(ok|yes|present|good|comprehensive|high|✓)/i.test(val);const bad=/missing|none|no |not found|too |absent|broken|low|0\s*ch/i.test(val);return <td key={j} className={`px-3 py-2.5 text-center ${ok?'text-green-400':bad?'text-red-400':'text-muted-foreground'}`}><span className="block max-w-[120px] truncate mx-auto" title={val}>{val}</span></td>;})}<td className="px-2 py-2.5 text-center"><span className={`px-2 py-0.5 rounded-full text-xs ${row.verdict==='best'?'bg-green-400/10 text-green-400':row.verdict==='worst'?'bg-red-400/10 text-red-400':'bg-secondary text-muted-foreground'}`}>{row.verdict||'—'}</span></td></tr>))}</tbody></table></div>):<p className="text-sm text-muted-foreground">No matrix data.</p>;

                        tabContent['errors']=(<div className="space-y-2">{!compareResult.errors?.length&&<p className="text-sm text-muted-foreground">No errors found.</p>}{(compareResult.errors||[]).map((err:any,i:number)=>(<div key={i} className={`rounded-xl border p-3 space-y-1.5 ${err.severity==='critical'?'border-red-400/30 bg-red-400/5':err.severity==='high'?'border-orange-400/25 bg-orange-400/5':'border-yellow-400/20 bg-yellow-400/5'}`}><div className="flex items-center gap-2 flex-wrap"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${err.severity==='critical'?'bg-red-400/20 text-red-400':err.severity==='high'?'bg-orange-400/20 text-orange-400':'bg-yellow-400/15 text-yellow-400'}`}>{err.severity}</span><span className="text-sm font-semibold flex-1">{err.issue}</span>{err.quick_fix&&<span className="text-xs px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20">Quick fix</span>}</div><p className="text-xs text-muted-foreground">{err.fix}</p>{err.affected_urls?.length>0&&<div className="flex flex-wrap gap-1">{err.affected_urls.map((u:string,j:number)=><span key={j} className="text-xs font-mono px-2 py-0.5 rounded-lg bg-background/60 border border-border/50 text-muted-foreground/60">{u.replace(/https?:\/\//,'').slice(0,35)}</span>)}</div>}</div>))}</div>);

                        tabContent['opportunities']=(<div className="space-y-3">{!compareResult.opportunities?.length&&<p className="text-sm text-muted-foreground">No opportunities identified.</p>}{(compareResult.opportunities||[]).map((opp:any,i:number)=>(<div key={i} className="rounded-xl border border-border bg-background/60 p-4 space-y-2"><div className="flex items-start gap-3"><div className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${opp.impact==='high'?'bg-green-400/15 text-green-400':opp.impact==='medium'?'bg-yellow-400/15 text-yellow-400':'bg-muted/30 text-muted-foreground'}`}>#{opp.rank||i+1}</div><div className="flex-1"><div className="font-semibold text-sm">{opp.title}</div><p className="text-xs text-muted-foreground mt-0.5">{opp.description}</p></div><div className="flex flex-col gap-1 items-end shrink-0"><span className={`text-xs px-2 py-0.5 rounded-full border ${opp.impact==='high'?'border-green-400/30 text-green-400':opp.impact==='medium'?'border-yellow-400/30 text-yellow-400':'border-border text-muted-foreground'}`}>{opp.impact} impact</span><span className={`text-xs px-2 py-0.5 rounded-full border ${opp.effort==='low'?'border-green-400/20 text-green-400/70':'border-border text-muted-foreground'}`}>{opp.effort} effort</span></div></div>{opp.data_basis&&<p className="text-xs text-muted-foreground/60 pl-10 italic">Evidence: {opp.data_basis}</p>}</div>))}</div>);

                        tabContent['geo']=(<div className="space-y-4">{!compareResult.geo_analysis?<p className="text-sm text-muted-foreground">No GEO analysis — run Manav Brain first.</p>:(<><div className="flex items-center gap-3"><div className={`h-11 w-11 rounded-xl flex items-center justify-center font-black shrink-0 ${parseInt(compareResult.geo_analysis.overall_geo_score)>=70?'bg-green-400/15 text-green-400':parseInt(compareResult.geo_analysis.overall_geo_score)>=40?'bg-yellow-400/15 text-yellow-400':'bg-red-400/15 text-red-400'}`}>{compareResult.geo_analysis.overall_geo_score}</div><div><div className="font-semibold text-sm">GEO / AI Score</div><div className="text-xs text-muted-foreground">{compareResult.geo_analysis.entity_coverage}</div></div></div>{compareResult.geo_analysis.faq_opportunities?.length>0&&(<div className="space-y-1.5"><div className="text-xs font-mono text-orange-400 uppercase">FAQ opportunities</div>{compareResult.geo_analysis.faq_opportunities.map((f:string,i:number)=>(<div key={i} className="flex gap-2 text-xs rounded-lg bg-orange-400/5 border border-orange-400/15 px-3 py-2"><ArrowRight size={10} className="text-orange-400 mt-0.5 shrink-0"/><span>{f}</span></div>))}</div>)}{compareResult.geo_analysis.recommendations?.length>0&&(<div className="space-y-1.5"><div className="text-xs font-mono text-primary uppercase">Recommendations</div>{compareResult.geo_analysis.recommendations.map((r:string,i:number)=>(<div key={i} className="flex gap-2 text-xs rounded-lg bg-primary/5 border border-primary/15 px-3 py-2"><span className="text-primary font-bold shrink-0">{i+1}.</span><span>{r}</span></div>))}</div>)}</>)}</div>);

                        tabContent['confidence']=(<div className="space-y-3"><div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3 text-xs text-muted-foreground">Canvas cards improved by this crawl data.</div>{!compareResult.confidence_boosters?.length&&<p className="text-sm text-muted-foreground">No improvements found. Crawl pages relevant to your active tasks.</p>}{(compareResult.confidence_boosters||[]).map((b:any,i:number)=>(<div key={i} className="rounded-xl border border-violet-400/20 bg-card/60 p-4 space-y-2"><div className="flex items-center gap-3"><div className="flex-1"><div className="font-semibold text-sm">{b.card_title}</div><div className="text-xs text-muted-foreground">{b.new_data_available}</div></div><div className="text-sm font-black text-violet-400 shrink-0">{b.confidence_increase}</div></div><div className="flex gap-2 text-xs rounded-lg bg-violet-400/5 border border-violet-400/15 px-3 py-2"><ArrowRight size={10} className="text-violet-400 mt-0.5 shrink-0"/><span className="text-muted-foreground">{b.action}</span></div></div>))}</div>);

                        tabContent['gaps']=(<div className="space-y-5">{compareResult.competitive_gaps?.length>0&&(<div><div className="text-xs font-mono text-orange-400 uppercase mb-2 flex items-center gap-2"><AlertTriangle size={11}/>Gaps</div>{compareResult.competitive_gaps.map((g:any,i:number)=>(<div key={i} className="rounded-xl border border-orange-400/15 bg-orange-400/5 p-3 space-y-1.5 mb-2"><div className="flex items-start gap-2"><span className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${g.priority==='high'?'bg-red-400/20 text-red-400':'bg-orange-400/20 text-orange-400'}`}>{g.priority}</span><div><div className="font-medium text-sm">{g.gap}</div><p className="text-xs text-muted-foreground">{g.evidence}</p></div></div><div className="flex gap-1.5 pl-10"><ArrowRight size={10} className="text-primary mt-0.5 shrink-0"/><span className="text-xs text-primary font-medium">{g.action}</span></div></div>))}</div>)}{compareResult.advantages?.length>0&&(<div><div className="text-xs font-mono text-green-400 uppercase mb-2 flex items-center gap-2"><CheckCircle size={11}/>Advantages</div>{compareResult.advantages.map((a:any,i:number)=>(<div key={i} className="rounded-xl border border-green-400/15 bg-green-400/5 p-3 space-y-1.5 mb-2"><div className="font-medium text-sm text-green-400">{a.advantage}</div>{a.how_to_leverage&&<div className="flex gap-1.5"><ArrowRight size={10} className="text-green-400/70 mt-0.5 shrink-0"/><span className="text-xs text-muted-foreground">{a.how_to_leverage}</span></div>}</div>))}</div>)}</div>);

                        tabContent['cards']=(<div className="space-y-4">{pendingCards.length>0&&(<div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/8 px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 size={14}/>{pendingCards.length} approved</div><button onClick={sendApprovedCardsToCanvas} className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90"><Sparkles size={11}/>Send to Canvas</button></div>)}{!compareResult.card_proposals?.length&&<p className="text-sm text-muted-foreground">No card proposals.</p>}{(compareResult.card_proposals||[]).map((card:any,i:number)=>{const approval=cardApprovals[i];return(<div key={i} className={`rounded-xl border p-4 space-y-3 ${approval==='approved'?'border-green-400/30 bg-green-400/5':approval==='rejected'?'border-border/30 opacity-50':approval==='merged'?'border-yellow-400/30 bg-yellow-400/5':'border-border bg-background/60'}`}><div className="flex items-start gap-3"><span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground shrink-0 font-mono">{card.type}</span><div className="flex-1 min-w-0"><div className="font-semibold text-sm">{card.title}</div><div className="flex items-center gap-2 mt-0.5"><span className="text-xs text-muted-foreground">Wk {card.week===5?'BL':card.week}</span><span className={`text-xs px-1.5 py-0.5 rounded-full border ${card.priority==='high'?'border-red-400/30 text-red-400':card.priority==='medium'?'border-yellow-400/30 text-yellow-400':'border-border text-muted-foreground'}`}>{card.priority}</span>{card.confidence!=null&&<span className={`text-xs px-1.5 py-0.5 rounded-full border ${card.confidence>=80?'border-green-400/30 text-green-400':card.confidence>=60?'border-yellow-400/30 text-yellow-400':'border-orange-400/30 text-orange-400'}`}>{card.confidence}% conf</span>}</div></div>{approval&&<span className={`text-xs px-2 py-1 rounded-lg font-medium shrink-0 ${approval==='approved'?'bg-green-400/15 text-green-400':approval==='merged'?'bg-yellow-400/15 text-yellow-400':'bg-secondary text-muted-foreground'}`}>{approval}</span>}</div><p className="text-xs text-muted-foreground">{card.content}</p>{card.data_basis&&<div className="flex gap-1.5 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2"><span className="text-xs font-mono text-primary shrink-0">Evidence:</span><span className="text-xs text-muted-foreground">{card.data_basis}</span></div>}{card.merge_candidate&&<div className="flex gap-2 rounded-lg bg-yellow-400/8 border border-yellow-400/20 px-3 py-2"><AlertTriangle size={11} className="text-yellow-400 shrink-0 mt-0.5"/><div><span className="text-xs font-semibold text-yellow-400">Similar: </span><span className="text-xs text-muted-foreground">"{card.merge_candidate}" — {card.merge_reason}</span></div></div>}{!approval&&(<div className="flex items-center gap-2 pt-1 border-t border-border/40"><button onClick={()=>{setCardApprovals(p=>({...p,[i]:'approved'}));setPendingCards(p=>[...p,card]);}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-400/30 bg-green-400/8 text-green-400 hover:bg-green-400/15 font-medium"><CheckCircle2 size={10}/>Approve</button>{card.merge_candidate&&<button onClick={()=>{setCardApprovals(p=>({...p,[i]:'merged'}));setPendingCards(p=>[...p,{...card,title:`${card.merge_candidate} [+scope]`,content:`${card.content}\n\n--- Scope from crawler ---\n${card.data_basis||''}`}]);}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-yellow-400/25 bg-yellow-400/8 text-yellow-400 hover:bg-yellow-400/15 font-medium"><ArrowRight size={10}/>Merge</button>}<button onClick={()=>setCardApprovals(p=>({...p,[i]:'rejected'}))} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground ml-auto"><X size={10}/></button></div>)}{approval==='rejected'&&<button onClick={()=>setCardApprovals(p=>{const n={...p};delete n[i];return n;})} className="text-xs text-muted-foreground hover:text-foreground">Undo</button>}</div>);})}</div>);

                        return (
                          <div className="rounded-2xl border border-violet-400/20 bg-card/60 overflow-hidden">
                            <div className="px-5 py-4 border-b border-border bg-violet-400/5">
                              <div className="flex items-start gap-3">
                                <div className="h-9 w-9 rounded-xl bg-violet-400/15 border border-violet-400/25 flex items-center justify-center shrink-0"><Brain size={16} className="text-violet-400"/></div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm">Manav Brain Analysis</div>
                                  <div className="text-xs text-muted-foreground mt-0.5">{compareResult.executive_summary}</div>
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {CRITERIA_LIBRARY.filter(c=>compareCriteria.includes(c.id)).map(c=>(
                                      <span key={c.id} className="text-xs px-1.5 py-0.5 rounded-full bg-primary/8 border border-primary/15 text-primary/70">{c.label}</span>
                                    ))}
                                    {compareCriteria.filter(c=>!CRITERIA_LIBRARY.some(l=>l.id===c)).map(c=>(
                                      <span key={c} className="text-xs px-1.5 py-0.5 rounded-full bg-primary/8 border border-primary/15 text-primary/70">{c}</span>
                                    ))}
                                  </div>
                                </div>
                                {compareResult.overall_score!=null&&(<div className={`flex flex-col items-center px-3 py-1.5 rounded-xl border shrink-0 ${compareResult.overall_score>=70?'border-green-400/30 bg-green-400/8':compareResult.overall_score>=40?'border-yellow-400/30 bg-yellow-400/8':'border-red-400/30 bg-red-400/8'}`}><span className={`text-xl font-black ${compareResult.overall_score>=70?'text-green-400':compareResult.overall_score>=40?'text-yellow-400':'text-red-400'}`}>{compareResult.overall_score}</span><span className="text-xs text-muted-foreground">/100</span></div>)}
                              </div>
                            </div>
                            <div className="p-5">{tabContent[compareTab]||<p className="text-sm text-muted-foreground">Select a tab above.</p>}</div>
                          </div>
                        );
                      })()}

                    </div>
                  );
                })()}
              </div>
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

      {/* ═══════════════════════════════════════════════════════════════
          AI Fill Preview Modal — full-screen overlay
          Shows every AI-proposed value with confidence + reasoning.
          PM ticks which ones to apply. Tier 3 fields appear as client
          questions ready to copy-paste into an email.
      ═══════════════════════════════════════════════════════════════ */}
      {aiFillModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-5 w-5 text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold">AI Fill Preview</div>
                  <div className="text-[10px] text-muted-foreground">
                    Review every proposal. Tick the ones to apply, untick anything that doesn't ring true.
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setAiFillModalOpen(false); setAiFillPreview(null); }}
                disabled={aiFillApplying}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {aiFillRunning && (
                <div className="py-12 text-center">
                  <svg className="animate-spin h-6 w-6 mx-auto mb-3 text-purple-400" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <div className="text-sm text-muted-foreground">Reading website pages, competitors, and existing data…</div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1">This usually takes 10-20 seconds.</div>
                </div>
              )}

              {!aiFillRunning && aiFillPreview && (
                <>
                  {/* Source summary */}
                  <div className="rounded-xl border border-border bg-background/40 p-3 text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
                    <span><strong className="text-foreground/90">Sources analyzed:</strong></span>
                    <span>{aiFillPreview.source_summary.pages} pages crawled</span>
                    <span>·</span>
                    <span>{aiFillPreview.source_summary.competitors} competitor{aiFillPreview.source_summary.competitors === 1 ? '' : 's'}</span>
                    {aiFillPreview.source_summary.has_audit && (<><span>·</span><span>latest audit synthesis</span></>)}
                  </div>

                  {aiFillPreview.proposals.length === 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4 text-sm text-foreground/90">
                      <div className="font-semibold mb-1">No proposals generated</div>
                      <div className="text-xs text-muted-foreground">
                        Likely cause: no website pages have been crawled for this project yet. Run a site crawl from the URL Crawler tab, then come back. The AI needs actual website content to ground its inferences.
                      </div>
                    </div>
                  )}

                  {/* Proposals grouped by category */}
                  {aiFillPreview.proposals.length > 0 && (() => {
                    const byCategory: Record<string, AIFieldProposal[]> = {};
                    for (const p of aiFillPreview.proposals) {
                      (byCategory[p.category] ||= []).push(p);
                    }
                    return Object.entries(byCategory).map(([cat, items]) => (
                      <div key={cat}>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                          {cat}
                        </div>
                        <div className="space-y-2">
                          {items.map((p) => {
                            const sel = `${p.category}.${p.field_key}`;
                            const isSelected = !!aiFillSelected[sel];
                            const confTone =
                              p.proposal.confidence === 'high'   ? 'border-green-500/30 bg-green-500/[0.04]' :
                              p.proposal.confidence === 'medium' ? 'border-amber-500/30 bg-amber-500/[0.04]' :
                                                                    'border-orange-500/30 bg-orange-500/[0.04]';
                            const confLabel = p.proposal.confidence === 'high' ? 'High confidence'
                                            : p.proposal.confidence === 'medium' ? 'Medium confidence'
                                            : 'Low confidence';
                            return (
                              <div key={sel} className={`rounded-xl border ${confTone} p-3 ${p.already_filled ? 'opacity-50' : ''}`}>
                                <div className="flex items-start gap-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleAiFillSelection(p.category, p.field_key)}
                                    disabled={p.already_filled || aiFillApplying}
                                    className="mt-0.5 shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-semibold text-foreground/90 font-mono">{p.field_key}</span>
                                      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
                                        p.proposal.confidence === 'high' ? 'bg-green-500/15 text-green-400'
                                        : p.proposal.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400'
                                        : 'bg-orange-500/15 text-orange-400'
                                      }`}>{confLabel}</span>
                                      {p.already_filled && (
                                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">
                                          Already filled ({p.existing_source || 'manual'})
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm text-foreground mt-1 leading-relaxed">{p.proposal.value}</div>
                                    <details className="mt-1.5">
                                      <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                                        Why this value?
                                      </summary>
                                      <div className="mt-1.5 pl-2 border-l-2 border-border space-y-1">
                                        <div className="text-[10px] text-foreground/85 italic">{p.proposal.reasoning}</div>
                                        {p.proposal.sources.length > 0 && (
                                          <div className="text-[10px] text-muted-foreground">
                                            <span className="font-semibold">Sources: </span>{p.proposal.sources.join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    </details>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}

                  {/* Client questions section */}
                  {aiFillPreview.client_questions.length > 0 && (
                    <div className="mt-6">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 text-blue-400" />
                        Questions for the client — copy-paste ready
                      </div>
                      <div className="text-[10px] text-muted-foreground mb-2">
                        These fields can only be answered by the client. The AI hasn't generated values — instead it's prepared questions you can send.
                      </div>
                      <div className="rounded-xl border border-blue-500/30 bg-blue-500/[0.03] p-3 space-y-3">
                        {aiFillPreview.client_questions.map((q, i) => (
                          <div key={i} className="border-l-2 border-blue-500/30 pl-3">
                            <div className="text-[10px] text-muted-foreground font-mono mb-0.5">{q.field_path}</div>
                            <div className="text-xs text-foreground/90 leading-relaxed">{q.question}</div>
                            {q.why_we_need_it && (
                              <div className="text-[10px] text-muted-foreground/80 mt-0.5 italic">Why: {q.why_we_need_it}</div>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const text = aiFillPreview.client_questions
                              .map((q, i) => `${i + 1}. ${q.question}`).join('\n\n');
                            navigator.clipboard.writeText(text);
                            toast({ title: 'Copied questions', description: 'Paste into an email to the client.' });
                          }}
                          className="text-[10px] px-2.5 py-1 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/5 font-semibold"
                        >
                          Copy all questions
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border bg-background/40 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] text-muted-foreground">
                {aiFillPreview ? (() => {
                  const eligible = aiFillPreview.proposals.filter((p) => !p.already_filled);
                  const selectedCount = eligible.filter((p) => aiFillSelected[`${p.category}.${p.field_key}`]).length;
                  return `${selectedCount} of ${eligible.length} eligible proposal${eligible.length === 1 ? '' : 's'} selected`;
                })() : ''}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setAiFillModalOpen(false); setAiFillPreview(null); }}
                  disabled={aiFillApplying}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={runAiFillApply}
                  disabled={aiFillApplying || aiFillRunning || !aiFillPreview || aiFillPreview.proposals.length === 0}
                  className="text-xs px-4 py-1.5 rounded-lg bg-purple-500 text-white hover:bg-purple-500/90 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {aiFillApplying ? (
                    <>
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Applying…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Apply selected
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}