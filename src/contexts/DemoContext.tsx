/**
 * DemoContext.tsx
 * Global context for guest demo mode.
 * Stores demo project, current tour step, and demo data factories.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

/* ── Demo data factories by industry ── */
export const DEMO_INDUSTRIES: Record<string, DemoProject> = {
  ecommerce: {
    id:'demo-ecomm', industry:'ecommerce',
    name:'StyleVault', tagline:'Premium Fashion E-Commerce',
    url:'stylevault.com', domain:'stylevault.com',
    keywords:['designer handbags uk','luxury fashion online','buy gucci bags london','premium leather accessories','authentic designer bags'],
    competitor1:'farfetch.com', competitor2:'matchesfashion.com',
    organic:14200, llm:28, health:61, eeat:44, authority:52,
    traffic_trend:[9200,10100,11400,12800,13500,14200],
    canvas:[
      {id:'c1',week:1,type:'quick-win',   title:'Fix 47 broken product image alt tags',          status:'done',      color:'#4ade80', effort:'2h',impact:'CTR +8%'},
      {id:'c2',week:1,type:'technical',   title:'Implement structured data for product pages',    status:'in_progress',color:'#06b6d4',effort:'4h',impact:'Rich snippets'},
      {id:'c3',week:1,type:'content',     title:"Buyer guide: How to spot authentic designer bags",status:'todo',    color:'#facc15', effort:'6h',impact:'Informational traffic'},
      {id:'c4',week:2,type:'technical',   title:'Compress hero images — currently 4.2MB average', status:'todo',    color:'#06b6d4', effort:'3h',impact:'LCP -1.8s'},
      {id:'c5',week:2,type:'geo',         title:'GEO-optimised FAQ for AI search engines',        status:'todo',     color:'#6366f1', effort:'5h',impact:'AI citations'},
      {id:'c6',week:2,type:'content',     title:'Seasonal lookbook: Autumn/Winter 2025 trends',   status:'todo',    color:'#facc15', effort:'8h',impact:'Brand traffic'},
      {id:'c7',week:3,type:'competitive', title:'Content gap: 23 topics Farfetch ranks for',      status:'todo',     color:'#fb923c', effort:'5h',impact:'Market share'},
      {id:'c8',week:3,type:'quick-win',   title:'Add internal links from blog to top 10 products',status:'todo',   color:'#4ade80', effort:'2h',impact:'Authority flow'},
    ],
    audits:[
      {issue:'Core Web Vitals — LCP 4.8s (target <2.5s)',        severity:'critical',fix:'Compress images + lazy load'},
      {issue:'182 product pages missing meta descriptions',       severity:'high',   fix:'AI-generate with product data'},
      {issue:'No hreflang tags for international variants',       severity:'medium', fix:'Add hreflang to <head>'},
      {issue:'Category pages with duplicate H1 tags',            severity:'medium', fix:'Unique H1 per category'},
    ],
    learnings:[
      {type:'technical',title:'Schema markup adds avg 12% CTR',     insight:'Product schema on 40 pages improved click-through rate by 12% in 3 weeks.',applied:4,confidence:94},
      {type:'content',  title:'Long guides outrank lists 3:1 in luxury niche',insight:'1,800+ word guides rank top 3 for target keywords vs short list posts.',applied:2,confidence:88},
      {type:'geo',      title:'FAQ sections cited 3x by ChatGPT',   insight:'Clear Q&A format pages are cited significantly more by AI search engines.',applied:3,confidence:91},
      {type:'quick-win',title:'Image optimisation = 0.8s LCP gain', insight:'Compressing hero images under 200KB improved Largest Contentful Paint by 0.8s.',applied:5,confidence:97},
    ],
    algo_impact:'The March 2025 Core Update penalised thin product descriptions. 23 category pages were impacted. Recovery tasks are already in your Week 2 canvas.',
  },
  saas: {
    id:'demo-saas', industry:'saas',
    name:'FlowSync', tagline:'Project Management SaaS',
    url:'flowsync.io', domain:'flowsync.io',
    keywords:['project management software','team collaboration tool','agile project tracker','best jira alternative','task management app'],
    competitor1:'monday.com', competitor2:'asana.com',
    organic:8900, llm:41, health:73, eeat:58, authority:61,
    traffic_trend:[5200,5800,6700,7400,8100,8900],
    canvas:[
      {id:'c1',week:1,type:'content',    title:'Comparison: FlowSync vs Asana (high purchase intent)',status:'done',   color:'#facc15',effort:'6h', impact:'Bottom-of-funnel'},
      {id:'c2',week:1,type:'technical',  title:'Fix duplicate title tags on pricing page variants',  status:'in_progress',color:'#06b6d4',effort:'2h',impact:'Crawl efficiency'},
      {id:'c3',week:2,type:'geo',        title:'Optimise for ChatGPT: "best project tools 2025"',   status:'todo',   color:'#6366f1', effort:'4h',impact:'AI search share'},
      {id:'c4',week:2,type:'content',    title:'Case study: Agency X scaled to 200 clients with FlowSync',status:'todo',color:'#facc15',effort:'8h',impact:'Trust + E-E-A-T'},
      {id:'c5',week:2,type:'quick-win',  title:'Add FAQ schema to 14 feature pages',                 status:'todo',  color:'#4ade80', effort:'2h',impact:'Featured snippets'},
      {id:'c6',week:3,type:'technical',  title:'Consolidate 3 thin blog category pages',             status:'todo',  color:'#06b6d4', effort:'4h',impact:'Content authority'},
      {id:'c7',week:3,type:'competitive','title':'Keyword gap: 31 terms Asana ranks for, we don\'t',  status:'todo', color:'#fb923c', effort:'5h',impact:'Organic share'},
    ],
    audits:[
      {issue:'23 feature pages with under 180 words — thin content',severity:'critical',fix:'Expand with benefit-led copy + FAQs'},
      {issue:'Missing E-E-A-T signals on About + Team pages',       severity:'high',   fix:'Add author bios with credentials'},
      {issue:'Mobile page speed score 67 — target 90+',            severity:'medium', fix:'Defer non-critical JS'},
      {issue:'No review schema on testimonial pages',               severity:'low',    fix:'Add AggregateRating schema'},
    ],
    learnings:[
      {type:'content',   title:'Comparison pages convert 4x better than feature pages',insight:'High-intent comparison articles drive 4x more trial signups than pure feature pages.',applied:3,confidence:92},
      {type:'technical', title:'PageSpeed above 90 correlates with top-3 rankings',   insight:'Every 10-point speed improvement correlates with 0.4 average ranking position gain.',applied:2,confidence:85},
      {type:'geo',       title:'ChatGPT cites pages with clear data points',           insight:'Pages with specific statistics and benchmarks get cited 5x more in AI answers.',applied:4,confidence:89},
    ],
    algo_impact:'The HCU update in Dec 2024 impacted SaaS blogs with generic content. Your blog has 14 affected posts. Recovery plan is in your Week 2-3 canvas.',
  },
  local: {
    id:'demo-local', industry:'local',
    name:'Bright Smiles Dental', tagline:'Premium Dental Practice, London',
    url:'brightsmilesdental.co.uk', domain:'brightsmilesdental.co.uk',
    keywords:['dentist london bridge','emergency dentist central london','dental implants london','teeth whitening london','cosmetic dentist london'],
    competitor1:'mydentist.co.uk', competitor2:'londonsmileclinic.co.uk',
    organic:2100, llm:19, health:54, eeat:67, authority:38,
    traffic_trend:[1200,1400,1600,1750,1950,2100],
    canvas:[
      {id:'c1',week:1,type:'technical',  title:'Create Google Business Profile posts (3x/week)',         status:'done',      color:'#06b6d4',effort:'2h',impact:'Local pack visibility'},
      {id:'c2',week:1,type:'content',    title:"FAQ: 'Is dental implant surgery painful?' — 800 words", status:'in_progress',color:'#facc15',effort:'3h',impact:'Informational intent'},
      {id:'c3',week:1,type:'quick-win',  title:'Request reviews from 12 recent patients',                status:'todo',     color:'#4ade80', effort:'1h',impact:'Star rating + trust'},
      {id:'c4',week:2,type:'geo',        title:'Optimise for "best dentist near me" AI responses',       status:'todo',     color:'#6366f1', effort:'4h',impact:'AI local citations'},
      {id:'c5',week:2,type:'content',    title:'Before/After gallery with patient testimonials',         status:'todo',     color:'#facc15', effort:'5h',impact:'Conversion rate'},
      {id:'c6',week:3,type:'technical',  title:'Build local citation links (Yell, Yelp, NHS directory)', status:'todo',    color:'#06b6d4', effort:'4h',impact:'Local authority'},
      {id:'c7',week:3,type:'competitive','title':'Analyse top 3 dental clinics ranking above us',        status:'todo',    color:'#fb923c', effort:'3h',impact:'Competitive intel'},
    ],
    audits:[
      {issue:'NAP inconsistency across 8 online directories',       severity:'critical',fix:'Standardise Name/Address/Phone everywhere'},
      {issue:'No medical/LocalBusiness schema on treatment pages',  severity:'high',   fix:'Add MedicalBusiness + MedicalCondition schema'},
      {issue:'Contact page missing LocalBusiness structured data',  severity:'medium', fix:'Add LocalBusiness JSON-LD'},
      {issue:'Google Business Profile missing 6 service categories',severity:'medium', fix:'Add all dental services to GBP'},
    ],
    learnings:[
      {type:'technical', title:'NAP consistency is the #1 local ranking signal',insight:'Fixing NAP consistency across directories improved local pack position by 3 spots in 6 weeks.',applied:2,confidence:95},
      {type:'content',   title:'Procedure FAQ pages capture 80% of local queries',insight:'Detailed FAQ pages about procedures dominate "near me" + procedure queries.',applied:3,confidence:88},
      {type:'quick-win', title:'New reviews within 30 days boost pack ranking',  insight:'Getting 5+ Google reviews in a month measurably improves local pack position.',applied:4,confidence:91},
    ],
    algo_impact:'Local SEO has been heavily influenced by Google\'s proximity and prominence updates. Your GBP optimisation and citation building tasks are timed to capture the current ranking signals.',
  },
  agency: {
    id:'demo-agency', industry:'agency',
    name:'Velocity Digital', tagline:'Growth Marketing Agency, London',
    url:'velocitydigital.agency', domain:'velocitydigital.agency',
    keywords:['digital marketing agency uk','seo agency london','ppc management services','growth marketing agency','b2b seo agency'],
    competitor1:'impression.co.uk', competitor2:'seoworks.co.uk',
    organic:5600, llm:35, health:69, eeat:72, authority:58,
    traffic_trend:[3400,3800,4200,4700,5100,5600],
    canvas:[
      {id:'c1',week:1,type:'content',    title:'SEO ROI calculator tool (lead magnet)',                    status:'done',    color:'#facc15',effort:'8h', impact:'Lead capture'},
      {id:'c2',week:1,type:'technical',  title:'Consolidate 4 service pages into hub-and-spoke',          status:'in_progress',color:'#06b6d4',effort:'5h',impact:'Authority consolidation'},
      {id:'c3',week:2,type:'geo',        title:"Get cited in Perplexity answers for 'best SEO agencies'", status:'todo',    color:'#6366f1', effort:'4h',impact:'AI visibility'},
      {id:'c4',week:2,type:'content',    title:'10 client case studies with real percentage metrics',      status:'todo',   color:'#facc15', effort:'12h',impact:'E-E-A-T proof'},
      {id:'c5',week:2,type:'quick-win',  title:'Add award badges and client logos to homepage',            status:'todo',   color:'#4ade80', effort:'2h',impact:'Trust signals'},
      {id:'c6',week:3,type:'competitive','title':'Reclaim backlinks from 3 competitors who moved domains',  status:'todo',  color:'#fb923c', effort:'4h',impact:'Link acquisition'},
    ],
    audits:[
      {issue:'47 blog posts under 400 words — needs consolidation', severity:'high',   fix:'Merge or expand to 1,200+ words'},
      {issue:'Testimonials not marked up with Review schema',       severity:'medium', fix:'Add AggregateRating + Review schema'},
      {issue:'No hreflang for US/AU service market variants',       severity:'low',    fix:'Add hreflang rel tags for target markets'},
    ],
    learnings:[
      {type:'content',   title:'Case studies with ROI data get 6x more backlinks',insight:'Client case studies featuring specific percentage improvements attract 6x more backlinks than generic content.',applied:3,confidence:93},
      {type:'technical', title:'Hub pages consolidate authority efficiently',      insight:'Merging service sub-pages into a hub model improved target page rankings by average 8 positions.',applied:2,confidence:87},
      {type:'geo',       title:'Tool pages get cited in AI answers 5x more',      insight:'Interactive tools like calculators appear in AI-generated answers significantly more than static content.',applied:1,confidence:89},
    ],
    algo_impact:'The E-E-A-T emphasis in recent core updates heavily rewards agencies with proven case studies and measurable client outcomes. Your content calendar prioritises this.',
  },
};

export function detectIndustry(input: string): string {
  const l = input.toLowerCase();
  if (l.match(/shop|store|product|fashion|ecomm|cloth|retail|sell|buy/)) return 'ecommerce';
  if (l.match(/saas|software|app|tech|startup|platform|tool|b2b/))       return 'saas';
  if (l.match(/dentist|doctor|clinic|restaurant|local|plumb|electri|physio|barber|gym/)) return 'local';
  if (l.match(/agency|marketing|seo|consult|pr firm|digital/))            return 'agency';
  return 'saas';
}

/* ── Types ── */
export interface DemoProject {
  id: string; industry: string; name: string; tagline: string;
  url: string; domain: string;
  keywords: string[]; competitor1: string; competitor2: string;
  organic: number; llm: number; health: number; eeat: number; authority: number;
  traffic_trend: number[];
  canvas: any[]; audits: any[]; learnings: any[]; algo_impact: string;
}

interface DemoContextValue {
  isDemoMode: boolean;
  demoProject: DemoProject | null;
  tourStep: number;
  setTourStep: (n: number) => void;
  startDemo: (industryKey: string) => void;
  endDemo: () => void;
}

const DemoContext = createContext<DemoContextValue>({
  isDemoMode:false, demoProject:null, tourStep:0,
  setTourStep:()=>{}, startDemo:()=>{}, endDemo:()=>{},
});

export const useDemoContext = () => useContext(DemoContext);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode,  setIsDemoMode]  = useState(false);
  const [demoProject, setDemoProject] = useState<DemoProject|null>(null);
  const [tourStep,    setTourStep]    = useState(0);

  const startDemo = useCallback((industryKey: string) => {
    const data = DEMO_INDUSTRIES[industryKey] || DEMO_INDUSTRIES['saas'];
    setDemoProject(data);
    setIsDemoMode(true);
    setTourStep(0);
  }, []);

  const endDemo = useCallback(() => {
    setIsDemoMode(false);
    setDemoProject(null);
    setTourStep(0);
  }, []);

  return (
    <DemoContext.Provider value={{isDemoMode,demoProject,tourStep,setTourStep,startDemo,endDemo}}>
      {children}
    </DemoContext.Provider>
  );
}
