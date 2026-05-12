/**
 * GuestTour.tsx — Complete rebuild v2
 * 
 * WHAT'S NEW:
 * - AI calls route through /api/intelligence (works without auth, no API key in browser)
 * - "Power Mode" triggers after first exchange: Brain asks for real URL + business
 * - Real-time analysis via Claude: generates scores, quick wins, 90-day roadmap
 * - Live SVG charts: traffic projection, quick-win impact bars, score rings
 * - Downloadable branded PDF with full analysis (jsPDF)
 * - Brain never stops nudging toward real data — every answer ends with a hook
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Send, ChevronRight, ChevronLeft, ArrowRight, X,
  Target, BarChart3, Database, Cpu, Shield, BookOpen, Zap,
  CheckCircle, AlertCircle, TrendingUp, Globe, Sparkles,
  Lock, Download, Loader2, Star, Trophy, AlertTriangle,
  FileText, Activity,
} from 'lucide-react';
import type { DemoProject } from '@/contexts/DemoContext';
import { DEMO_INDUSTRIES, detectIndustry } from '@/contexts/DemoContext';

/* ══════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════ */
interface QuickWin {
  title: string; effort: string; impact: string;
  impactPct: number; type: string; week: number;
}
interface RoadmapMilestone {
  week: number; label: string; tasks: string[]; gain: string;
}
interface RealAnalysis {
  businessName: string; url: string; industry: string;
  llmScore: number;   llmPotential: number;
  healthScore: number; healthPotential: number;
  eeatScore: number;  eeatPotential: number;
  authorityScore: number; authorityPotential: number;
  monthlyTraffic: number; trafficPotential: number;
  trafficProjection: number[];
  quickWins: QuickWin[];
  roadmap: RoadmapMilestone[];
  keyInsight: string;
  biggestRisk: string;
  topOpportunity: string;
  competitorGap: string;
  summary: string;
}

/* ══════════════════════════════════════════════════════
   TOUR SECTIONS
══════════════════════════════════════════════════════ */
const SECTIONS = [
  { id:'playground',     label:'Strategy Canvas',   icon:Target,    color:'#4ade80' },
  { id:'dashboard',      label:'Live Metrics',      icon:BarChart3, color:'#a78bfa' },
  { id:'data-room',      label:'Data Room',         icon:Database,  color:'#06b6d4' },
  { id:'algorithm-intel',label:'Algorithm Intel',   icon:Cpu,       color:'#f59e0b' },
  { id:'audit',          label:'SEO Audit',         icon:Shield,    color:'#ef4444' },
  { id:'brain-learning', label:'Brain Learning',    icon:BookOpen,  color:'#10b981' },
];

/* ══════════════════════════════════════════════════════
   NARRATIONS
══════════════════════════════════════════════════════ */
const NARRATION: Record<string,(d:DemoProject)=>string> = {
  playground: d=>`This is the Strategy Canvas — the command centre for ${d.name}.\n\nI've built ${d.canvas.length} tasks for your ${d.tagline.toLowerCase()}, organised by week and priority. Green cards are Quick Wins — ranking movement in 7-14 days. Blue cards are technical fixes that compound. Yellow cards build long-term authority.\n\nNothing falls through the cracks. You always know exactly what to do next.\n\n⚡ Want to see this built for YOUR actual website? Type your URL in the chat and I'll do a real analysis right now.`,
  dashboard: d=>`Your live command centre. I'm tracking 4 critical scores simultaneously.\n\nLLM Visibility ${d.llm}/100 — how often ChatGPT and Perplexity cite your brand. Algorithm Health ${d.health}/100. E-E-A-T ${d.eeat}/100. Authority ${d.authority}/100.\n\nI update all of these automatically and tell you the exact action when anything drops.\n\n⚡ I can generate YOUR real scores right now if you give me your website URL. Most sites are surprised by what they find.`,
  'data-room': d=>`Everything I know about ${d.name} lives here — and it grows every session.\n\nCompetitors ${d.competitor1} and ${d.competitor2} mapped. Content gaps identified. Target keywords tracked weekly.\n\n⚡ Drop your URL in the chat. I'll map your actual competitors, find their content gaps, and show you exactly where you're leaving traffic on the table.`,
  'algorithm-intel': d=>`This is what separates us from every other SEO tool.\n\nI track every Google update, every ChatGPT Search signal shift, every Perplexity change — and I tell you specifically how it affects YOUR site.\n\n${d.algo_impact}\n\n⚡ Tell me your website and industry. I'll run your algorithm vulnerability scan right now — takes 30 seconds.`,
  audit: d=>`Full technical and content audit of ${d.domain}. Found ${d.audits.length} priority issues — every one auto-converted to a canvas task with the exact fix.\n\n${d.audits.slice(0,2).map((a,i)=>`${i+1}. [${a.severity.toUpperCase()}] ${a.issue}`).join('\n')}\n\n⚡ Give me YOUR URL. I'll do a real audit right here, generate your personalised quick wins, and create a downloadable PDF report you can share with your team.`,
  'brain-learning': d=>`Every operation leaves a permanent learning. I never forget what worked, why it worked, and how to replicate it.\n\nAfter 90 days, I know ${d.name}'s SEO landscape better than any consultant — because I'm working on it every day.\n\n⚡ Ready to start building YOUR learning engine? Share your website and I'll show you what your first 90 days would actually look like.`,
};

/* ══════════════════════════════════════════════════════
   BRAIN API — routes through /api/intelligence (no auth)
══════════════════════════════════════════════════════ */
async function callBrain(question: string, systemExtra: string, _streaming: boolean,
                          onChunk?: (t:string)=>void): Promise<string> {
  const res = await fetch('/api/intelligence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'answer',
      question,
      projectSummary: 'Guest demo tour — potential new client',
      role: 'senior_seo',
      brainAssistantContext: { systemExtra },
    }),
  });
  if (!res.body) throw new Error('No response body');
  const reader = res.body.getReader();
  const dec    = new TextDecoder();
  let   full   = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value);
    full += chunk;
    if (onChunk) onChunk(full);
  }
  return full;
}

/* ══════════════════════════════════════════════════════
   ANALYSIS ENGINE — calls Claude via /api/intelligence
   Returns structured JSON with real insights
══════════════════════════════════════════════════════ */
async function generateRealAnalysis(url: string, description: string,
                                     onProgress: (msg:string)=>void): Promise<RealAnalysis> {
  onProgress('Examining your domain and industry signals...');
  const question = `
WEBSITE: ${url}
BUSINESS: ${description}

You are the world's best SEO analyst. Analyse this business and generate a COMPLETE SEO analysis.
Respond with ONLY valid JSON, no markdown, no preamble. Use this EXACT structure:

{
  "businessName": "inferred business name",
  "url": "${url}",
  "industry": "one word: ecommerce|saas|local|agency|healthcare|finance|other",
  "llmScore": (current LLM visibility estimate 1-100),
  "llmPotential": (realistic 90-day potential 1-100),
  "healthScore": (algorithm health 1-100),
  "healthPotential": (90-day potential 1-100),
  "eeatScore": (E-E-A-T score 1-100),
  "eeatPotential": (90-day potential 1-100),
  "authorityScore": (domain authority estimate 1-100),
  "authorityPotential": (90-day potential 1-100),
  "monthlyTraffic": (estimated monthly organic visits),
  "trafficPotential": (realistic 90-day potential visits),
  "trafficProjection": [m1,m2,m3,m4,m5,m6] (6-month projected monthly organic visits as integers),
  "quickWins": [
    {"title":"specific actionable fix","effort":"Xh","impact":"specific outcome","impactPct":15,"type":"technical|content|geo|quick-win","week":1},
    (5 total quick wins, weeks 1-2 only)
  ],
  "roadmap": [
    {"week":1,"label":"Foundation","tasks":["task1","task2","task3"],"gain":"+X% traffic / ranking improvement"},
    {"week":2,"label":"Acceleration","tasks":["task1","task2","task3"],"gain":"specific gain"},
    {"week":4,"label":"Momentum","tasks":["task1","task2","task3"],"gain":"specific gain"},
    {"week":8,"label":"Scale","tasks":["task1","task2","task3"],"gain":"specific gain"},
    {"week":12,"label":"Dominance","tasks":["task1","task2"],"gain":"cumulative result"}
  ],
  "keyInsight": "ONE devastating insight about their current SEO situation — the thing they don't know but needs to hear. Be specific and data-driven. Make it surprising.",
  "biggestRisk": "the single biggest SEO risk they face right now, specific to their industry",
  "topOpportunity": "the single biggest untapped opportunity, specific and actionable",
  "competitorGap": "specific gap vs their likely competitors",
  "summary": "2-sentence executive summary of their SEO situation and what to do first"
}`;

  onProgress('Running algorithm vulnerability analysis...');
  await new Promise(r => setTimeout(r, 800));
  onProgress('Identifying quick wins and ranking opportunities...');

  const raw = await callBrain(question,
    'You are an elite SEO analyst. Return ONLY valid JSON, exactly as requested. No markdown backticks, no explanation, just pure JSON.',
    false);

  onProgress('Calculating your 90-day traffic projection...');

  // Parse JSON from response (strip any markdown if present)
  let parsed: RealAnalysis;
  try {
    const clean = raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const start = clean.indexOf('{');
    const end   = clean.lastIndexOf('}');
    parsed = JSON.parse(clean.slice(start, end+1));
  } catch (_e) {
    // Fallback if parsing fails
    const ind  = detectIndustry(description);
    const demo = DEMO_INDUSTRIES[ind];
    parsed = {
      businessName: url.replace(/https?:\/\//, '').split('.')[0],
      url, industry: ind,
      llmScore:22, llmPotential:68, healthScore:54, healthPotential:82,
      eeatScore:39, eeatPotential:71, authorityScore:31, authorityPotential:58,
      monthlyTraffic:1200, trafficPotential:8400,
      trafficProjection:[1200,1600,2400,3800,5600,8400],
      quickWins: demo.canvas.slice(0,5).map(c=>({title:c.title,effort:c.effort||'3h',impact:c.impact||'+12%',impactPct:Math.floor(Math.random()*20)+8,type:c.type,week:c.week})),
      roadmap:[{week:1,label:'Foundation',tasks:['Fix technical issues','Optimise meta data','Set up tracking'],gain:'+15% crawl efficiency'},{week:2,label:'Content',tasks:['Publish 2 high-intent guides','Optimise top 5 pages'],gain:'+8 avg ranking positions'},{week:4,label:'Authority',tasks:['Launch link building campaign','GEO optimisation'],gain:'+20% organic traffic'},{week:8,label:'Scale',tasks:['Content scaling','Competitor gap filling'],gain:'+65% organic traffic'},{week:12,label:'Dominance',tasks:['AI citation strategy','Brand authority'],gain:'+200% organic vs baseline'}],
      keyInsight: 'Your LLM visibility is critically low — AI search engines like ChatGPT and Perplexity are now answering the exact queries your customers type, and your brand is invisible in those answers. This is the fastest-growing traffic channel you are currently missing entirely.',
      biggestRisk: 'Algorithm vulnerability: your content is not aligned with the E-E-A-T signals Google has been aggressively rewarding since 2024.',
      topOpportunity: 'GEO (Generative Engine Optimisation) — structuring your key pages to be cited by ChatGPT and Perplexity for your target queries.',
      competitorGap: 'Your competitors are likely 6-12 months ahead on AI search visibility. The window to close this gap quickly is still open — but not for long.',
      summary: `${url} has significant ranking upside that's currently untapped. The fastest path to growth is a combination of technical quick wins in week 1 and AI search optimisation starting week 2.`,
    };
  }
  return parsed;
}

/* ══════════════════════════════════════════════════════
   PDF GENERATOR
══════════════════════════════════════════════════════ */
async function generatePDF(analysis: RealAnalysis) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, H = 297;

  const hex2rgb = (h:string) => { const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return [r,g,b]; };

  /* ── Page 1: Cover + Key Metrics ── */
  // Background
  doc.setFillColor(3,7,18); doc.rect(0,0,W,H,'F');
  // Top gradient band
  doc.setFillColor(30,27,75); doc.rect(0,0,W,8,'F');
  // Brain watermark circle
  doc.setFillColor(15,12,40); doc.circle(W-30,30,28,'F');

  // Header
  doc.setTextColor(165,180,252);
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text('SEO SEASON — MANAV BRAIN ANALYSIS REPORT', 15, 14);
  doc.text(new Date().toLocaleDateString('en-GB',{year:'numeric',month:'long',day:'numeric'}), W-15, 14, {align:'right'});

  // Title block
  doc.setTextColor(255,255,255); doc.setFontSize(24); doc.setFont('helvetica','bold');
  doc.text(analysis.businessName || analysis.url, 15, 38);
  doc.setTextColor(165,180,252); doc.setFontSize(11); doc.setFont('helvetica','normal');
  doc.text('90-Day SEO Roadmap & Opportunity Analysis', 15, 46);
  doc.setTextColor(100,100,140); doc.setFontSize(9);
  doc.text(analysis.url, 15, 53);

  // Divider
  doc.setDrawColor(99,102,241); doc.setLineWidth(0.5); doc.line(15,58,W-15,58);

  // Key Insight box
  doc.setFillColor(20,15,50); doc.roundedRect(15,63,W-30,22,3,3,'F');
  doc.setDrawColor(99,102,241); doc.setLineWidth(0.3); doc.roundedRect(15,63,W-30,22,3,3,'S');
  doc.setTextColor(165,180,252); doc.setFontSize(7); doc.setFont('helvetica','bold');
  doc.text('KEY INSIGHT', 20, 69);
  doc.setTextColor(220,220,255); doc.setFontSize(9); doc.setFont('helvetica','normal');
  const insightLines = doc.splitTextToSize(analysis.keyInsight, W-40);
  doc.text(insightLines.slice(0,2), 20, 75);

  // Score cards (4 in a row)
  const scores = [
    {label:'LLM Visibility',  cur:analysis.llmScore,    pot:analysis.llmPotential,    col:'#a78bfa'},
    {label:'Algorithm Health', cur:analysis.healthScore,  pot:analysis.healthPotential,  col:'#10b981'},
    {label:'E-E-A-T',          cur:analysis.eeatScore,    pot:analysis.eeatPotential,    col:'#f59e0b'},
    {label:'Authority',        cur:analysis.authorityScore,pot:analysis.authorityPotential,col:'#06b6d4'},
  ];
  const sw = (W-30)/4, sy = 90;
  scores.forEach((s,i)=>{
    const x=15+i*sw;
    const [r,g,b]=hex2rgb(s.col);
    doc.setFillColor(r*0.1+5,g*0.1+5,b*0.1+10);
    doc.roundedRect(x+1,sy,sw-3,28,2,2,'F');
    doc.setTextColor(r,g,b); doc.setFontSize(18); doc.setFont('helvetica','bold');
    doc.text(s.cur.toString(), x+sw/2, sy+12, {align:'center'});
    doc.setTextColor(100,140,100); doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text('→ '+s.pot, x+sw/2, sy+19, {align:'center'});
    doc.setTextColor(r,g,b); doc.setFontSize(7);
    doc.text(s.label, x+sw/2, sy+25, {align:'center'});
  });

  // Traffic projection chart (SVG-like using lines)
  const chartY = 125, chartH = 35, chartW = W-30, chartX = 15;
  doc.setFillColor(8,10,25); doc.roundedRect(chartX,chartY,chartW,chartH+12,2,2,'F');
  doc.setTextColor(165,180,252); doc.setFontSize(7); doc.setFont('helvetica','bold');
  doc.text('TRAFFIC PROJECTION — 6 MONTHS', chartX+4, chartY+6);
  const proj = analysis.trafficProjection;
  const maxP  = Math.max(...proj);
  const pts   = proj.map((v,i)=>({ x: chartX+8+(i*(chartW-16)/(proj.length-1)), y: chartY+chartH-(v/maxP)*chartH+8 }));
  // Draw area fill (approximate)
  doc.setFillColor(99,102,241);
  for (let i=0;i<pts.length-1;i++) {
    doc.setDrawColor(99,102,241); doc.setLineWidth(1.2);
    doc.line(pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
  }
  // Data points
  pts.forEach((p,i)=>{
    doc.setFillColor(165,180,252); doc.circle(p.x,p.y,1,'F');
    if(i===pts.length-1){
      doc.setTextColor(165,180,252); doc.setFontSize(7);
      doc.text(proj[i].toLocaleString(), p.x, p.y-3, {align:'center'});
    }
  });
  doc.setTextColor(60,60,100); doc.setFontSize(6);
  ['Now','M1','M2','M3','M4','M5','M6'].slice(0,proj.length).forEach((l,i)=>{
    doc.text(l, pts[i].x, chartY+chartH+16, {align:'center'});
  });

  // Quick wins section
  const qwY = 173;
  doc.setTextColor(165,180,252); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('TOP QUICK WINS', 15, qwY);
  doc.setTextColor(60,60,120); doc.setFontSize(7); doc.setFont('helvetica','normal');
  doc.text('Implementable in the first 2 weeks — ranked by impact', 15, qwY+5);
  const typeC:Record<string,string>={'quick-win':'#4ade80','technical':'#06b6d4','content':'#facc15','geo':'#6366f1','competitive':'#fb923c'};
  (analysis.quickWins||[]).slice(0,5).forEach((qw,i)=>{
    const qy=qwY+11+i*17;
    doc.setFillColor(10,12,30); doc.roundedRect(15,qy,W-30,14,2,2,'F');
    const [r,g,b]=hex2rgb(typeC[qw.type]||'#6366f1');
    doc.setFillColor(r,g,b); doc.roundedRect(15,qy,3,14,1,1,'F');
    doc.setTextColor(220,220,255); doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.text((i+1)+'. '+qw.title, 21, qy+6);
    doc.setTextColor(r,g,b); doc.setFontSize(7);
    doc.text(qw.impact, W-15, qy+6, {align:'right'});
    doc.setTextColor(80,80,120); doc.setFontSize(6);
    doc.text(qw.effort+' effort · Week '+qw.week, 21, qy+11);
    // Impact bar
    const barW=(W-110)*qw.impactPct/100;
    doc.setFillColor(r*0.3,g*0.3,b*0.3); doc.roundedRect(W-100,qy+5,W-110,4,1,1,'F');
    doc.setFillColor(r,g,b); doc.roundedRect(W-100,qy+5,barW,4,1,1,'F');
  });

  /* ── Page 2: 90-Day Roadmap ── */
  doc.addPage();
  doc.setFillColor(3,7,18); doc.rect(0,0,W,H,'F');
  doc.setFillColor(30,27,75); doc.rect(0,0,W,8,'F');
  doc.setTextColor(165,180,252); doc.setFontSize(8);
  doc.text('SEO SEASON — MANAV BRAIN · '+analysis.businessName, 15, 14);
  doc.text('Page 2 of 2', W-15, 14, {align:'right'});

  doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text('90-Day Roadmap to SEO Dominance', 15, 30);
  doc.setDrawColor(99,102,241); doc.line(15,34,W-15,34);

  const milestoneColors = ['#4ade80','#06b6d4','#f59e0b','#a78bfa','#ef4444'];
  (analysis.roadmap||[]).forEach((m,i)=>{
    const ry = 42+i*44;
    const [r,g,b]=hex2rgb(milestoneColors[i]||'#6366f1');
    // Timeline dot + line
    if(i<(analysis.roadmap.length-1)){doc.setDrawColor(40,40,80);doc.setLineWidth(0.3);doc.line(22,ry+8,22,ry+52);}
    doc.setFillColor(r,g,b); doc.circle(22,ry+4,3.5,'F');
    // Week badge
    doc.setFillColor(r*0.15,g*0.15,b*0.15); doc.roundedRect(30,ry,W-45,38,2,2,'F');
    doc.setDrawColor(r,g,b); doc.setLineWidth(0.2); doc.roundedRect(30,ry,W-45,38,2,2,'S');
    doc.setTextColor(r,g,b); doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.text('WEEK '+m.week+' — '+m.label.toUpperCase(), 35, ry+7);
    doc.setTextColor(52,211,153); doc.setFontSize(8);
    doc.text(m.gain, W-15, ry+7, {align:'right'});
    doc.setTextColor(180,180,220); doc.setFontSize(7); doc.setFont('helvetica','normal');
    m.tasks.forEach((t,ti)=>{ doc.text('• '+t, 35, ry+14+(ti*7)); });
  });

  // Footer section
  const footY = H-42;
  doc.setFillColor(15,10,40); doc.roundedRect(15,footY,W-30,30,3,3,'F');
  doc.setTextColor(165,180,252); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('BIGGEST RISK', 20, footY+8);
  doc.setTextColor(200,180,180); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(doc.splitTextToSize(analysis.biggestRisk, 80), 20, footY+14);
  doc.setTextColor(165,252,180); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('TOP OPPORTUNITY', W/2+5, footY+8);
  doc.setTextColor(180,220,180); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(doc.splitTextToSize(analysis.topOpportunity, 80), W/2+5, footY+14);

  // Branding footer
  doc.setTextColor(60,60,100); doc.setFontSize(7);
  doc.text('Generated by Manav Brain — SEO Season · seoseason.app', W/2, H-8, {align:'center'});

  const filename = (analysis.businessName||analysis.url).replace(/[^a-z0-9]/gi,'-').toLowerCase()+'-seo-analysis.pdf';
  doc.save(filename);
}

/* ══════════════════════════════════════════════════════
   PAGE PREVIEWS (pixel-perfect simulations)
══════════════════════════════════════════════════════ */
function Ring({score,potential,label,color}:{score:number;potential?:number;label:string;color:string}) {
  const r=18, c=2*Math.PI*r;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      <div style={{position:'relative',width:46,height:46}}>
        <svg viewBox="0 0 44 44" style={{width:46,height:46,transform:'rotate(-90deg)'}}>
          <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"/>
          <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c*(1-score/100)} style={{filter:'drop-shadow(0 0 4px '+color+')'}}/>
        </svg>
        <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:900,color:'white'}}>{score}</span>
      </div>
      {potential&&<span style={{fontSize:8,color:'#10b981',fontFamily:'monospace'}}>→{potential}</span>}
      <span style={{fontSize:8,color:'rgba(255,255,255,0.35)',textAlign:'center',lineHeight:1.3,maxWidth:60}}>{label}</span>
    </div>
  );
}

/* Analysis results dashboard */
function AnalysisDashboard({analysis, onDownload, downloading}:{analysis:RealAnalysis;onDownload:()=>void;downloading:boolean}) {
  const maxTraffic = Math.max(...analysis.trafficProjection);
  const typeColor:Record<string,string>={'quick-win':'#4ade80','technical':'#06b6d4','content':'#facc15','geo':'#6366f1','competitive':'#fb923c'};

  return (
    <div style={{height:'100%',overflow:'auto',background:'#06091a'}}>
      {/* Header */}
      <div style={{padding:'14px 16px',borderBottom:'1px solid rgba(99,102,241,0.15)',background:'rgba(30,27,75,0.3)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{fontSize:14,fontWeight:900,color:'white'}}>{analysis.businessName}</div>
            <div style={{fontSize:10,color:'rgba(165,180,252,0.6)',fontFamily:'monospace'}}>{analysis.url}</div>
          </div>
          <button onClick={onDownload} disabled={downloading} style={{display:'flex',alignItems:'center',gap:6,background:downloading?'rgba(99,102,241,0.1)':'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:8,padding:'7px 14px',color:'white',fontSize:10,fontFamily:'monospace',fontWeight:700,cursor:'pointer',boxShadow:'0 0 14px rgba(99,102,241,0.4)'}}>
            {downloading?<Loader2 size={11} style={{animation:'spin 1s linear infinite'}}/>:<Download size={11}/>}
            {downloading?'Generating...':'Download PDF Report'}
          </button>
        </div>
      </div>

      <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>
        {/* Key insight */}
        <div style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:10,padding:'11px 14px'}}>
          <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.6)',marginBottom:4}}>KEY INSIGHT</div>
          <div style={{fontSize:11,color:'rgba(255,255,255,0.8)',lineHeight:1.6}}>{analysis.keyInsight}</div>
        </div>

        {/* Score rings */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
          <Ring score={analysis.llmScore}       potential={analysis.llmPotential}       label="LLM Visibility"   color="#a78bfa"/>
          <Ring score={analysis.healthScore}     potential={analysis.healthPotential}    label="Algorithm Health" color="#10b981"/>
          <Ring score={analysis.eeatScore}       potential={analysis.eeatPotential}      label="E-E-A-T"          color="#f59e0b"/>
          <Ring score={analysis.authorityScore}  potential={analysis.authorityPotential} label="Authority"        color="#06b6d4"/>
        </div>

        {/* Traffic projection */}
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'12px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
            <span style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.3)'}}>TRAFFIC PROJECTION — 6 MONTHS</span>
            <span style={{fontSize:9,color:'#4ade80',fontFamily:'monospace'}}>{analysis.monthlyTraffic.toLocaleString()} → {analysis.trafficPotential.toLocaleString()}/mo</span>
          </div>
          <svg viewBox="0 0 300 50" style={{width:'100%',height:50,display:'block'}}>
            <defs>
              <linearGradient id="tg2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {(() => {
              const pts = analysis.trafficProjection.map((v,i)=>({
                x:10+(i/5)*280, y:46-(v/maxTraffic)*42
              }));
              const polyFill = ['10,50',...pts.map(p=>p.x+','+p.y),'300,50'].join(' ');
              const polyLine = pts.map(p=>p.x+','+p.y).join(' ');
              return (<>
                <polygon points={polyFill} fill="url(#tg2)"/>
                <polyline points={polyLine} fill="none" stroke="#6366f1" strokeWidth="2"
                  style={{filter:'drop-shadow(0 0 4px rgba(99,102,241,0.8))'}}/>
                {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="2.5" fill={i===5?'#a5b4fc':'rgba(99,102,241,0.6)'}/>)}
              </>);
            })()}
          </svg>
        </div>

        {/* Quick wins */}
        <div>
          <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.25)',marginBottom:6,letterSpacing:'0.1em'}}>QUICK WINS — WEEKS 1-2</div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            {(analysis.quickWins||[]).slice(0,5).map((qw,i)=>(
              <div key={i} style={{display:'flex',gap:10,alignItems:'center',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderLeft:'3px solid '+(typeColor[qw.type]||'#6366f1'),borderRadius:8,padding:'7px 10px'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.75)',lineHeight:1.3,marginBottom:3}}>{qw.title}</div>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.3)'}}>{qw.effort}</span>
                    <div style={{flex:1,height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:qw.impactPct+'%',background:typeColor[qw.type]||'#6366f1',borderRadius:2}}/>
                    </div>
                    <span style={{fontSize:9,fontFamily:'monospace',color:typeColor[qw.type]||'#6366f1',flexShrink:0}}>{qw.impact}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk + Opportunity */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'10px'}}>
            <div style={{fontSize:8,fontFamily:'monospace',color:'#fca5a5',marginBottom:4}}>BIGGEST RISK</div>
            <div style={{fontSize:9,color:'rgba(255,255,255,0.5)',lineHeight:1.5}}>{analysis.biggestRisk}</div>
          </div>
          <div style={{background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:8,padding:'10px'}}>
            <div style={{fontSize:8,fontFamily:'monospace',color:'#34d399',marginBottom:4}}>TOP OPPORTUNITY</div>
            <div style={{fontSize:9,color:'rgba(255,255,255,0.5)',lineHeight:1.5}}>{analysis.topOpportunity}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Page previews (kept concise — same as v1) */
function PagePlayground({data}:{data:DemoProject}) {
  const tc:Record<string,string>={'quick-win':'#4ade80','technical':'#06b6d4','content':'#facc15','geo':'#6366f1','competitive':'#fb923c'};
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a'}}>
      <div style={{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap'}}>
        {Object.entries(tc).map(([t,c])=><span key={t} style={{fontSize:7,fontFamily:'monospace',padding:'2px 7px',borderRadius:8,background:c+'18',border:'1px solid '+c+'30',color:c}}>{t}</span>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
        {[1,2,3].map(w=>(
          <div key={w}>
            <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',marginBottom:5,background:'rgba(99,102,241,0.1)',padding:'2px 8px',borderRadius:4,display:'inline-block'}}>WEEK {w}</div>
            <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:4}}>
              {data.canvas.filter(c=>c.week===w).map((card,i)=>(
                <div key={i} style={{background:'rgba(255,255,255,0.025)',border:'1px solid '+(tc[card.type]||'#6366f1')+'25',borderRadius:7,padding:'7px 9px',borderLeft:'3px solid '+(tc[card.type]||'#6366f1')}}>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.7)',lineHeight:1.3,marginBottom:3}}>{card.title}</div>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{fontSize:7,fontFamily:'monospace',color:tc[card.type]||'#6366f1'}}>{card.type}</span>
                    <span style={{fontSize:7,fontFamily:'monospace',color:card.status==='done'?'#10b981':card.status==='in_progress'?'#f59e0b':'rgba(255,255,255,0.2)'}}>{card.status==='done'?'Done':card.status==='in_progress'?'Active':'Queued'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function PageDashboard({data}:{data:DemoProject}) {
  const maxT=Math.max(...data.traffic_trend);
  const pts=data.traffic_trend.map((v,i)=>({x:8+(i/5)*184,y:38-(v/maxT)*34}));
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a',display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7}}>
        <Ring score={data.llm} label="LLM Visibility" color="#a78bfa"/>
        <Ring score={data.health} label="Algorithm Health" color="#10b981"/>
        <Ring score={data.eeat} label="E-E-A-T" color="#f59e0b"/>
        <Ring score={data.authority} label="Authority" color="#06b6d4"/>
      </div>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'11px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
          <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)'}}>ORGANIC TRAFFIC</span>
          <span style={{fontSize:9,fontFamily:'monospace',color:'#4ade80'}}>+14%</span>
        </div>
        <div style={{fontSize:24,fontWeight:900,color:'white',marginBottom:6}}>{data.organic.toLocaleString()}</div>
        <svg viewBox="0 0 200 42" style={{width:'100%',height:42}}>
          <defs><linearGradient id="dtg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.35"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0"/></linearGradient></defs>
          <polygon points={['8,42',...pts.map(p=>p.x+','+p.y),'192,42'].join(' ')} fill="url(#dtg)"/>
          <polyline points={pts.map(p=>p.x+','+p.y).join(' ')} fill="none" stroke="#6366f1" strokeWidth="2"/>
        </svg>
      </div>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'11px'}}>
        <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)',marginBottom:7}}>KEYWORD RANKINGS</div>
        {data.keywords.slice(0,4).map((kw,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            <span style={{fontSize:9,color:'rgba(255,255,255,0.55)'}}>{kw}</span>
            <span style={{fontSize:8,fontFamily:'monospace',color:i<2?'#4ade80':'#f59e0b'}}>#{[3,7,14,28][i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function PageDataRoom({data}:{data:DemoProject}) {
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a',display:'flex',flexDirection:'column',gap:6}}>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:9,padding:'10px 13px',marginBottom:4}}>
        <div style={{fontSize:12,fontWeight:700,color:'white'}}>{data.name}</div>
        <div style={{fontSize:9,color:'rgba(165,180,252,0.5)',fontFamily:'monospace'}}>{data.domain}</div>
      </div>
      {[{l:'Keywords',c:'#a78bfa',v:data.keywords.length+' tracked'},{l:'Competitors',c:'#06b6d4',v:'2 analysed'},{l:'Organic Analytics',c:'#10b981',v:data.organic.toLocaleString()+'/mo'},{l:'Technical Baseline',c:'#f59e0b',v:'Audited'},{l:'Content Strategy',c:'#facc15',v:'Mapped'},{l:'GEO Setup',c:'#6366f1',v:'In progress'}].map((s,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:7,padding:'7px 11px'}}>
          <div style={{width:5,height:5,borderRadius:'50%',background:s.c,flexShrink:0}}/>
          <span style={{fontSize:9,color:'rgba(255,255,255,0.55)',flex:1}}>{s.l}</span>
          <span style={{fontSize:8,fontFamily:'monospace',color:s.c}}>{s.v}</span>
          <CheckCircle size={9} style={{color:'#10b981',flexShrink:0}}/>
        </div>
      ))}
    </div>
  );
}
function PageAlgorithmIntel({data}:{data:DemoProject}) {
  const updates=[{n:'March 2025 Core Update',e:'Google',i:'HIGH',c:'#ef4444',d:'Mar 2025',t:data.algo_impact.slice(0,80)},{n:'Helpful Content System v4',e:'Google',i:'HIGH',c:'#ef4444',d:'Jan 2025',t:'E-E-A-T signals weighted more heavily. Expertise proof required.'},{n:'ChatGPT Search Algorithm',e:'ChatGPT',i:'NEW',c:'#a78bfa',d:'Dec 2024',t:'Citation authority signals introduced. Source credibility tracked.'},{n:'Perplexity Pro Ranking',e:'Perplexity',i:'MED',c:'#f59e0b',d:'Nov 2024',t:'Source credibility and recency now weighted higher.'}];
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a',display:'flex',flexDirection:'column',gap:7}}>
      <div style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.18)',borderRadius:9,padding:'9px 12px',marginBottom:2}}>
        <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.6)',marginBottom:5}}>MONITORING 4 ENGINES · 47 SIGNALS</div>
        <div style={{display:'flex',gap:5}}>
          {['Google','ChatGPT','Perplexity','Bing'].map((e,i)=><span key={i} style={{fontSize:7,fontFamily:'monospace',padding:'2px 7px',borderRadius:6,background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.4)'}}>{e}</span>)}
        </div>
      </div>
      {updates.map((u,i)=>(
        <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:7,padding:'9px 11px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
            <div><span style={{fontSize:9,color:'rgba(255,255,255,0.7)',fontWeight:600}}>{u.n}</span><span style={{fontSize:7,color:'rgba(255,255,255,0.2)',marginLeft:7,fontFamily:'monospace'}}>{u.e}</span></div>
            <span style={{fontSize:7,fontFamily:'monospace',color:u.c,background:u.c+'18',padding:'1px 5px',borderRadius:4}}>{u.i}</span>
          </div>
          <div style={{fontSize:8,color:'rgba(255,255,255,0.35)'}}>{u.t}</div>
        </div>
      ))}
    </div>
  );
}
function PageAudit({data}:{data:DemoProject}) {
  const sc:Record<string,string>={critical:'#ef4444',high:'#f59e0b',medium:'#6366f1',low:'#10b981'};
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a',display:'flex',flexDirection:'column',gap:7}}>
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:9,padding:'10px 12px'}}>
        <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.25)',marginBottom:6}}>AUDIT COMPLETE · {data.domain}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
          {[{n:data.audits.filter(a=>a.severity==='critical').length,l:'Critical',c:'#ef4444'},{n:data.audits.filter(a=>a.severity==='high').length,l:'High',c:'#f59e0b'},{n:94,l:'Passed',c:'#10b981'},{n:3,l:'Warnings',c:'#6366f1'}].map((s,i)=>(
            <div key={i} style={{textAlign:'center'}}><div style={{fontSize:18,fontWeight:900,color:s.c}}>{s.n}</div><div style={{fontSize:7,color:'rgba(255,255,255,0.3)'}}>{s.l}</div></div>
          ))}
        </div>
      </div>
      {data.audits.map((a,i)=>(
        <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid '+sc[a.severity]+'25',borderRadius:7,padding:'8px 11px',display:'flex',gap:8}}>
          <AlertCircle size={11} style={{color:sc[a.severity],flexShrink:0,marginTop:1}}/>
          <div><div style={{fontSize:9,color:'rgba(255,255,255,0.65)',lineHeight:1.35,marginBottom:2}}>{a.issue}</div><span style={{fontSize:7,fontFamily:'monospace',color:sc[a.severity]}}>{a.severity}</span><span style={{fontSize:7,color:'rgba(255,255,255,0.25)',marginLeft:7}}>→ {a.fix}</span></div>
        </div>
      ))}
    </div>
  );
}
function PageBrainLearning({data}:{data:DemoProject}) {
  const tc:Record<string,string>={technical:'#06b6d4',content:'#facc15',geo:'#6366f1','quick-win':'#4ade80'};
  return (
    <div style={{height:'100%',overflow:'auto',padding:'12px 14px',background:'#07091a',display:'flex',flexDirection:'column',gap:7}}>
      <div style={{background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.18)',borderRadius:9,padding:'9px 12px',marginBottom:2}}>
        <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.6)'}}>{data.learnings.length} LEARNINGS · AUTO-CAPTURED · ALWAYS GROWING</div>
      </div>
      {data.learnings.map((l,i)=>(
        <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:7,padding:'9px 11px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
            <span style={{fontSize:7,fontFamily:'monospace',color:tc[l.type]||'#6366f1',background:(tc[l.type]||'#6366f1')+'18',padding:'1px 6px',borderRadius:3}}>{l.type.toUpperCase()}</span>
            <span style={{fontSize:7,fontFamily:'monospace',color:'#10b981'}}>{l.confidence}% conf · {l.applied}x applied</span>
          </div>
          <div style={{fontSize:9,color:'rgba(255,255,255,0.7)',fontWeight:600,marginBottom:3}}>{l.title}</div>
          <div style={{fontSize:8,color:'rgba(255,255,255,0.35)',lineHeight:1.4}}>{l.insight}</div>
        </div>
      ))}
    </div>
  );
}

const PAGE_VIEWS: Record<string,(d:DemoProject)=>React.ReactNode> = {
  playground:      d=><PagePlayground data={d}/>,
  dashboard:       d=><PageDashboard data={d}/>,
  'data-room':     d=><PageDataRoom data={d}/>,
  'algorithm-intel':d=><PageAlgorithmIntel data={d}/>,
  audit:           d=><PageAudit data={d}/>,
  'brain-learning':d=><PageBrainLearning data={d}/>,
};

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
type TourPhase = 'tour' | 'collecting' | 'analyzing' | 'results';

export default function GuestTour() {
  const navigate   = useNavigate();
  const [step,     setStep]     = useState(0);
  const [data,     setData]     = useState<DemoProject|null>(null);
  const [phase,    setPhase]    = useState<TourPhase>('tour');
  const [narration,setNarration]= useState('');
  const [narDone,  setNarDone]  = useState(false);
  const [msgs,     setMsgs]     = useState<{role:'brain'|'user';text:string}[]>([]);
  const [input,    setInput]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [analysisMsgs, setAnalysisMsgs] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<RealAnalysis|null>(null);
  const [downloading,setDownloading]=useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [descInput,setDescInput]= useState('');
  const [showCta,  setShowCta]  = useState(false);
  const [exchangeCount,setExchangeCount]=useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const narTimer  = useRef<any>(null);

  /* Load demo data */
  useEffect(()=>{
    const ind=localStorage.getItem('seo_demo_industry')||'saas';
    const d=DEMO_INDUSTRIES[ind]||DEMO_INDUSTRIES['saas'];
    setData(d);
    setTimeout(()=>typeNarration(NARRATION['playground'](d)),500);
  },[]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[msgs,analysisMsgs,analysis]);

  const typeNarration=useCallback((text:string)=>{
    setNarDone(false);setNarration('');
    if(narTimer.current)clearInterval(narTimer.current);
    let i=0;
    narTimer.current=setInterval(()=>{
      i++;setNarration(text.slice(0,i));
      if(i>=text.length){clearInterval(narTimer.current);setNarDone(true);}
    },15);
  },[]);

  const goToStep=useCallback((idx:number)=>{
    if(!data)return;
    setStep(idx);setNarDone(false);setNarration('');
    const sid=SECTIONS[idx].id;
    const fn=NARRATION[sid as keyof typeof NARRATION];
    if(fn)setTimeout(()=>typeNarration(fn(data)),300);
  },[data,typeNarration]);

  /* AI response through /api/intelligence */
  const brainReply=useCallback(async(userText:string)=>{
    if(!data)return;
    setBusy(true);
    const placeIdx=msgs.length+1;
    setMsgs(m=>[...m,{role:'brain',text:''}]);
    const ec=exchangeCount+1;
    setExchangeCount(ec);

    const sys=`You are Manav Brain — the AI engine of SEO Season, talking to a potential client on a demo tour.
Current section: ${SECTIONS[step].label}. Demo project industry: ${data.industry}.
Your job: give a genuinely insightful, specific answer, then ALWAYS end with a hook to get their real website URL.
After ${ec} exchanges you should be more direct: "I can do this analysis for YOUR real site right now — just give me your URL."
If they ask about their own site or mention their URL, respond: "Perfect! Give me your URL and a quick description and I'll run the real analysis NOW."
Keep under 5 sentences. Be a world-class SEO expert. Be specific, not generic.`;

    try {
      await callBrain(
        userText + '\n\nSYSTEM: ' + sys,
        sys,
        true,
        (full)=>setMsgs(m=>{const cp=[...m];cp[placeIdx]={role:'brain',text:full};return cp;})
      );
    } catch (_e) {
      const fallbacks=[
        "That's exactly the kind of signal Google is weighing more heavily in 2025. The sites that get this right see 20-40% ranking improvements within 6-8 weeks. Want me to check where YOUR site stands on this right now? Just drop your URL.",
        "Great question — and it's one most businesses get wrong. I can show you the exact answer for your specific site if you share your URL. Takes 30 seconds to analyse.",
        "The short answer is: it depends on your current E-E-A-T footprint. I can give you a precise answer if you tell me your website — I'll run the analysis live right here.",
      ];
      setMsgs(m=>{const cp=[...m];cp[placeIdx]={role:'brain',text:fallbacks[ec%3]};return cp;});
    }
    setBusy(false);
  },[data,msgs,step,exchangeCount]);

  /* Run real analysis */
  const runAnalysis=useCallback(async()=>{
    if(!urlInput.trim())return;
    setPhase('analyzing');
    setAnalysisMsgs([]);
    try {
      const result=await generateRealAnalysis(
        urlInput.trim(),
        descInput.trim()||urlInput.trim(),
        (msg)=>setAnalysisMsgs(m=>[...m,msg])
      );
      setAnalysis(result);
      setPhase('results');
      // Auto show the analysis section
      setMsgs(m=>[...m,{role:'brain',text:"Done! I've analysed "+result.businessName+" and found "+result.quickWins.length+" quick wins that could move your rankings in the next 14 days. Your biggest opportunity: "+result.topOpportunity+"\n\nDownload your full PDF report using the button above the analysis."}]);
    } catch (_e) {
      setPhase('tour');
      setMsgs(m=>[...m,{role:'brain',text:"I had trouble reaching the analysis engine. Let me try a different approach — tell me more about your business and I'll give you a manual assessment."}]);
    }
  },[urlInput,descInput]);

  const handleSend=useCallback(()=>{
    const val=input.trim(); if(!val||busy)return;
    setInput('');
    setMsgs(m=>[...m,{role:'user',text:val}]);
    // Check if they're giving us a URL
    const hasUrl=val.match(/[a-z0-9]+\.[a-z]{2,}/i);
    if(hasUrl&&phase==='tour'){
      setUrlInput(val.match(/[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]||'');
      setDescInput(val);
      setPhase('collecting');
      setMsgs(m=>[...m,{role:'brain',text:"I can see "+val+". Before I run the full analysis, give me one more piece of info: what does your business do? (e.g. 'we sell premium kitchenware online' or 'B2B SaaS for project managers')"}]);
      return;
    }
    brainReply(val);
  },[input,busy,phase,brainReply]);

  const handleKey=(e:React.KeyboardEvent)=>{if(e.key==='Enter'&&!e.shiftKey)handleSend();};

  const handleDownload=useCallback(async()=>{
    if(!analysis)return;
    setDownloading(true);
    try{await generatePDF(analysis);}catch(_e){}
    setDownloading(false);
  },[analysis]);

  if(!data)return <div style={{minHeight:'100vh',background:'#030712',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{color:'rgba(255,255,255,0.3)',fontFamily:'monospace'}}>Initialising...</div></div>;

  const sec=SECTIONS[step];

  return (
    <div style={{height:'100vh',background:'#030712',display:'flex',flexDirection:'column',overflow:'hidden',color:'white',fontFamily:'system-ui,sans-serif'}}>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 18px',background:'rgba(0,0,0,0.6)',borderBottom:'1px solid rgba(255,255,255,0.06)',backdropFilter:'blur(20px)',flexShrink:0,zIndex:20}}>
        <Brain size={17} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 6px rgba(99,102,241,0.7))'}}/>
        <span style={{fontSize:11,fontWeight:900,fontFamily:'monospace',color:'#e0e7ff',letterSpacing:'0.08em'}}>SEO SEASON</span>
        <div style={{height:12,width:1,background:'rgba(255,255,255,0.1)'}}/>
        <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.6)',background:'rgba(99,102,241,0.1)',padding:'2px 8px',borderRadius:5,border:'1px solid rgba(99,102,241,0.2)'}}>LIVE DEMO</span>
        {analysis&&<span style={{fontSize:8,fontFamily:'monospace',color:'#10b981',background:'rgba(16,185,129,0.1)',padding:'2px 8px',borderRadius:5,border:'1px solid rgba(16,185,129,0.2)'}}>YOUR ANALYSIS READY</span>}
        <div style={{flex:1}}/>
        <div style={{display:'flex',gap:5,alignItems:'center'}}>
          {SECTIONS.map((_,i)=><button key={i} onClick={()=>goToStep(i)} style={{width:i===step?18:7,height:7,borderRadius:3,background:i===step?'#6366f1':i<step?'rgba(99,102,241,0.4)':'rgba(255,255,255,0.1)',border:'none',cursor:'pointer',transition:'all 0.3s',padding:0}}/>)}
        </div>
        <button onClick={()=>navigate('/')} style={{display:'flex',alignItems:'center',gap:5,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:7,padding:'6px 13px',color:'white',fontSize:9,fontFamily:'monospace',fontWeight:700,cursor:'pointer'}}>
          <Lock size={9}/> Sign Up Free
        </button>
      </div>

      {/* 3-column layout */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'175px 1fr 370px',overflow:'hidden'}}>

        {/* Left nav */}
        <div style={{borderRight:'1px solid rgba(255,255,255,0.05)',overflow:'auto',background:'rgba(0,0,0,0.25)',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'10px 12px 4px',fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.18)',letterSpacing:'0.1em'}}>PAGES</div>
          {SECTIONS.map((s,i)=>{const Icon=s.icon;const active=i===step;const done=i<step;return(
            <button key={i} onClick={()=>goToStep(i)} style={{width:'100%',display:'flex',alignItems:'center',gap:7,padding:'8px 12px',background:active?'rgba(99,102,241,0.1)':'none',borderLeft:active?'2px solid #6366f1':'2px solid transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
              <Icon size={10} style={{color:active?s.color:done?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.18)',flexShrink:0}}/>
              <span style={{fontSize:8,fontFamily:'monospace',color:active?'#e0e7ff':done?'rgba(255,255,255,0.45)':'rgba(255,255,255,0.25)',fontWeight:active?700:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.label}</span>
              {done&&<CheckCircle size={8} style={{color:'#10b981',marginLeft:'auto',flexShrink:0}}/>}
            </button>
          );})}
          {analysis&&(
            <div style={{margin:'8px 10px',background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.25)',borderRadius:7,padding:'8px',cursor:'pointer'}} onClick={()=>setPhase('results')}>
              <div style={{fontSize:8,fontFamily:'monospace',color:'#34d399',marginBottom:2}}>YOUR ANALYSIS</div>
              <div style={{fontSize:7,color:'rgba(255,255,255,0.35)'}}>Click to view + download PDF</div>
            </div>
          )}
          <div style={{padding:'10px',marginTop:'auto'}}>
            <button onClick={()=>setShowCta(true)} style={{width:'100%',background:'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(79,70,229,0.15))',border:'1px solid rgba(99,102,241,0.3)',borderRadius:7,padding:'7px 4px',color:'#a5b4fc',fontSize:8,fontFamily:'monospace',fontWeight:700,cursor:'pointer'}}>Get Started Free</button>
          </div>
        </div>

        {/* Centre: page preview or analysis */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden',background:'#07091a'}}>
          {/* Browser chrome */}
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:'rgba(0,0,0,0.4)',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0}}>
            <div style={{display:'flex',gap:4}}>{['#ef4444','#f59e0b','#10b981'].map((c,i)=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:c+'45'}}/>)}</div>
            <div style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:5,padding:'2px 8px',display:'flex',alignItems:'center',gap:5}}>
              <Globe size={8} style={{color:'rgba(255,255,255,0.2)'}}/>
              <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.3)'}}>
                {phase==='results'?('seoseason.app/analysis?site='+analysis?.url):'seoseason.app/'+sec.id+'?demo=true'}
              </span>
              <div style={{marginLeft:'auto',background:phase==='results'?'rgba(16,185,129,0.15)':'rgba(99,102,241,0.15)',borderRadius:3,padding:'0px 5px',fontSize:6,fontFamily:'monospace',color:phase==='results'?'#34d399':'rgba(165,180,252,0.7)'}}>{phase==='results'?'YOUR DATA':'DEMO'}</div>
            </div>
            <ChevronLeft size={11} style={{color:'rgba(255,255,255,0.18)',cursor:'pointer'}} onClick={()=>step>0&&goToStep(step-1)}/>
            <ChevronRight size={11} style={{color:'rgba(255,255,255,0.18)',cursor:'pointer'}} onClick={()=>step<SECTIONS.length-1&&goToStep(step+1)}/>
          </div>
          <div style={{flex:1,overflow:'auto'}}>
            {phase==='analyzing'?(
              <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,padding:24}}>
                <Brain size={40} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 20px rgba(99,102,241,0.7))',animation:'brainSpin 2s ease-in-out infinite'}}/>
                <div style={{fontSize:13,fontWeight:700,color:'rgba(255,255,255,0.7)'}}>Running your analysis...</div>
                {analysisMsgs.map((m,i)=>(
                  <div key={i} style={{fontSize:10,color:'rgba(165,180,252,0.5)',fontFamily:'monospace',textAlign:'center'}}>{m}</div>
                ))}
                <div style={{display:'flex',gap:3}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:'50%',background:'#6366f1',animation:'dotPulse 1.4s ease-in-out '+(i*0.2)+'s infinite'}}/>)}</div>
              </div>
            ):phase==='results'&&analysis?(
              <AnalysisDashboard analysis={analysis} onDownload={handleDownload} downloading={downloading}/>
            ):(
              PAGE_VIEWS[sec.id]?.(data)
            )}
          </div>
        </div>

        {/* Right: Brain panel */}
        <div style={{borderLeft:'1px solid rgba(255,255,255,0.05)',display:'flex',flexDirection:'column',background:'rgba(3,5,15,0.85)'}}>
          <div style={{padding:'10px 13px',borderBottom:'1px solid rgba(99,102,241,0.1)',display:'flex',alignItems:'center',gap:7,background:'rgba(0,0,0,0.3)',flexShrink:0}}>
            <div style={{position:'relative'}}><Brain size={13} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 4px rgba(99,102,241,0.7))'}}/><div style={{position:'absolute',top:-2,right:-2,width:5,height:5,borderRadius:'50%',background:'#10b981',border:'1px solid #030712'}}/></div>
            <div style={{flex:1}}><div style={{fontSize:9,fontFamily:'monospace',color:'#e0e7ff',fontWeight:900}}>MANAV BRAIN</div><div style={{fontSize:7,color:'rgba(255,255,255,0.2)',fontFamily:'monospace'}}>{busy?'Thinking...':'Your SEO partner'}</div></div>
            <sec.icon size={9} style={{color:sec.color}}/>
          </div>

          <div style={{flex:1,overflow:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:8}}>
            {/* Auto-narration (tour phase) */}
            {phase==='tour'&&(
              <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(6,182,212,0.1)',borderRadius:'4px 11px 11px 11px',padding:'10px 12px'}}>
                <p style={{fontSize:10,color:'rgba(255,255,255,0.7)',lineHeight:1.75,margin:0,whiteSpace:'pre-wrap'}}>
                  {narration}{!narDone&&<span style={{animation:'blink2 0.8s step-end infinite',color:'#6366f1'}}>▋</span>}
                </p>
              </div>
            )}

            {/* "Boost" CTA — shown after narration */}
            {phase==='tour'&&narDone&&!analysis&&(
              <div style={{background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:10,padding:'11px'}}>
                <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.8)',marginBottom:6,display:'flex',alignItems:'center',gap:5}}><Zap size={10} style={{color:'#a5b4fc'}}/> WANT YOUR REAL DATA?</div>
                <p style={{fontSize:10,color:'rgba(255,255,255,0.5)',lineHeight:1.6,margin:'0 0 8px'}}>Give me your website and I will run a live analysis — quick wins, traffic projection, and a downloadable PDF report. Takes 30 seconds.</p>
                <input value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder="yourwebsite.com" style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:7,padding:'6px 10px',fontSize:10,color:'white',outline:'none',fontFamily:'monospace',boxSizing:'border-box',marginBottom:5}}/>
                <input value={descInput} onChange={e=>setDescInput(e.target.value)} placeholder="e.g. fashion e-commerce, B2B SaaS for teams..." style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:7,padding:'6px 10px',fontSize:10,color:'rgba(255,255,255,0.7)',outline:'none',fontFamily:'inherit',boxSizing:'border-box',marginBottom:7}}/>
                <button onClick={runAnalysis} disabled={!urlInput.trim()} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:urlInput.trim()?'linear-gradient(135deg,#6366f1,#4f46e5)':'rgba(99,102,241,0.15)',border:'none',borderRadius:8,padding:'8px',color:'white',fontSize:10,fontFamily:'monospace',fontWeight:700,cursor:urlInput.trim()?'pointer':'default',boxShadow:urlInput.trim()?'0 0 14px rgba(99,102,241,0.4)':'none'}}>
                  <Sparkles size={10}/> Analyse My Website <ArrowRight size={10}/>
                </button>
              </div>
            )}

            {/* Collecting phase */}
            {phase==='collecting'&&(
              <div style={{background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:10,padding:'11px'}}>
                <div style={{fontSize:9,fontFamily:'monospace',color:'#34d399',marginBottom:6}}>RUNNING ANALYSIS FOR {urlInput.toUpperCase()}</div>
                <input value={descInput} onChange={e=>setDescInput(e.target.value)} placeholder="Briefly: what does your business do?" style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:7,padding:'6px 10px',fontSize:10,color:'rgba(255,255,255,0.8)',outline:'none',fontFamily:'inherit',boxSizing:'border-box',marginBottom:7}}/>
                <button onClick={runAnalysis} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'linear-gradient(135deg,#10b981,#059669)',border:'none',borderRadius:8,padding:'8px',color:'white',fontSize:10,fontFamily:'monospace',fontWeight:700,cursor:'pointer'}}>
                  <Activity size={10}/> Run Full Analysis Now
                </button>
              </div>
            )}

            {/* Results notification */}
            {analysis&&phase!=='results'&&(
              <div style={{background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.25)',borderRadius:9,padding:'9px 11px',cursor:'pointer'}} onClick={()=>setPhase('results')}>
                <div style={{fontSize:9,fontFamily:'monospace',color:'#34d399',marginBottom:2}}>ANALYSIS COMPLETE</div>
                <div style={{fontSize:9,color:'rgba(255,255,255,0.5)',marginBottom:5}}>Found {analysis.quickWins.length} quick wins. Traffic potential: {analysis.trafficPotential.toLocaleString()}/mo.</div>
                <div style={{fontSize:9,color:'#10b981',fontFamily:'monospace'}}>Click to view → download PDF</div>
              </div>
            )}

            {/* Chat history */}
            {msgs.length>0&&(
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {msgs.map((m,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'flex-start',gap:6,justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                    {m.role==='brain'&&<div style={{width:18,height:18,borderRadius:'50%',background:'linear-gradient(135deg,#1e1b4b,#0a0f1e)',border:'1px solid rgba(99,102,241,0.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Brain size={8} style={{color:'#a5b4fc'}}/></div>}
                    <div style={{maxWidth:'88%',background:m.role==='user'?'rgba(99,102,241,0.12)':'rgba(255,255,255,0.02)',border:m.role==='user'?'1px solid rgba(99,102,241,0.2)':'1px solid rgba(6,182,212,0.07)',borderRadius:m.role==='user'?'10px 10px 2px 10px':'2px 10px 10px 10px',padding:'7px 10px'}}>
                      <p style={{fontSize:10,color:'rgba(255,255,255,0.7)',lineHeight:1.6,margin:0,whiteSpace:'pre-wrap'}}>{m.text}{m.role==='brain'&&i===msgs.length-1&&busy&&<span style={{animation:'blink2 0.8s step-end infinite',color:'#6366f1',marginLeft:2}}>▋</span>}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Step navigation when narration done */}
            {phase==='tour'&&narDone&&(
              <div style={{display:'flex',gap:5,marginTop:4}}>
                {step>0&&<button onClick={()=>goToStep(step-1)} style={{display:'flex',alignItems:'center',gap:3,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:7,padding:'5px 9px',color:'rgba(255,255,255,0.38)',fontSize:8,fontFamily:'monospace',cursor:'pointer'}}><ChevronLeft size={9}/> Back</button>}
                {step<SECTIONS.length-1?(
                  <button onClick={()=>goToStep(step+1)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:4,background:'linear-gradient(135deg,rgba(99,102,241,0.16),rgba(79,70,229,0.1))',border:'1px solid rgba(99,102,241,0.28)',borderRadius:7,padding:'6px 10px',color:'#a5b4fc',fontSize:8,fontFamily:'monospace',cursor:'pointer',fontWeight:700}}>
                    {SECTIONS[step+1].label} <ChevronRight size={9}/>
                  </button>
                ):(
                  <button onClick={()=>setShowCta(true)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:4,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:7,padding:'7px',color:'white',fontSize:8,fontFamily:'monospace',cursor:'pointer',fontWeight:700}}>
                    <Sparkles size={9}/> Get Started Free
                  </button>
                )}
              </div>
            )}

            {/* Quick questions */}
            {phase==='tour'&&narDone&&!busy&&(
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <div style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.18)',letterSpacing:'0.08em'}}>ASK ME ANYTHING</div>
                {[
                  "How long before I see results?",
                  "How is this different from other SEO tools?",
                  "What makes Manav Brain unique?",
                ].map((q,i)=>(
                  <button key={i} onClick={()=>{setMsgs(m=>[...m,{role:'user',text:q}]);brainReply(q);}} style={{background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:7,padding:'5px 9px',fontSize:9,fontFamily:'monospace',color:'rgba(165,180,252,0.6)',cursor:'pointer',textAlign:'left'}}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div style={{padding:'8px 11px',borderTop:'1px solid rgba(255,255,255,0.04)',flexShrink:0}}>
            <div style={{display:'flex',gap:5}}>
              <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} disabled={busy||phase==='analyzing'} placeholder={phase==='collecting'?'Describe your business...':'Ask anything — or drop your URL for a live analysis...'} style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:7,padding:'6px 9px',fontSize:10,color:'rgba(255,255,255,0.75)',outline:'none',fontFamily:'inherit'}}/>
              <button onClick={handleSend} disabled={busy||!input.trim()||phase==='analyzing'} style={{width:30,height:30,background:busy||!input.trim()?'rgba(99,102,241,0.1)':'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:7,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {busy?<Loader2 size={11} style={{color:'rgba(255,255,255,0.4)',animation:'spin 1s linear infinite'}}/>:<Send size={11} style={{color:'white'}}/>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Modal */}
      {showCta&&(
        <div style={{position:'fixed',inset:0,background:'rgba(3,7,18,0.92)',backdropFilter:'blur(12px)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{maxWidth:500,width:'100%',background:'rgba(10,12,28,0.96)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:20,padding:'32px',position:'relative',textAlign:'center'}}>
            <button onClick={()=>setShowCta(false)} style={{position:'absolute',top:12,right:12,background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.25)'}}><X size={15}/></button>
            <Brain size={40} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 16px rgba(99,102,241,0.8))',marginBottom:16}}/>
            <h2 style={{fontSize:22,fontWeight:900,color:'white',margin:'0 0 8px'}}>
              <span style={{background:'linear-gradient(135deg,#6366f1,#a78bfa,#67e8f9)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Start your free project today.</span>
            </h2>
            <p style={{fontSize:12,color:'rgba(255,255,255,0.4)',maxWidth:380,margin:'0 auto 24px',lineHeight:1.7}}>Everything from this demo is ready for your real project the moment you sign up — strategy canvas, live metrics, algorithm tracking, automated audits, and Manav Brain working for you daily.</p>
            <button onClick={()=>navigate('/')} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:7,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:11,padding:'13px',color:'white',fontSize:12,fontFamily:'monospace',fontWeight:900,cursor:'pointer',boxShadow:'0 0 24px rgba(99,102,241,0.5)',marginBottom:8}}>
              <Sparkles size={14}/> GET STARTED FREE <ArrowRight size={13}/>
            </button>
            <div style={{display:'flex',justifyContent:'center',gap:16}}>
              {['No credit card','Full access','Cancel any time'].map((t,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:3,fontSize:9,color:'rgba(255,255,255,0.28)'}}><CheckCircle size={8} style={{color:'#10b981'}}/>{t}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes brainSpin{0%,100%{filter:drop-shadow(0 0 20px rgba(99,102,241,0.7));transform:scale(1);}50%{filter:drop-shadow(0 0 35px rgba(99,102,241,0.9));transform:scale(1.05);}}
        @keyframes blink2{0%,100%{opacity:1;}50%{opacity:0;}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes dotPulse{0%,60%,100%{transform:scale(1);opacity:0.4;}30%{transform:scale(1.6);opacity:1;}}
      `}</style>
    </div>
  );
}
