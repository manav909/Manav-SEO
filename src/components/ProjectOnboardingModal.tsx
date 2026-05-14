/**
 * ProjectOnboardingModal — Brilliant onboarding questions for new projects
 *
 * Questions are informed by patterns from Brain Learnings across all projects.
 * Answers permanently stored in project's playground_strategy.onboarding_data.
 * Brain reads this context in every single response for that project.
 */
import React, { useState, useEffect } from 'react';
import { Brain, ChevronRight, Zap, X, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  projectId:   string;
  projectName: string;
  projectUrl:  string;
  onComplete:  () => void;
  onSkip:      () => void;
}

/* ─── The 10 brilliant questions ─── */
const QUESTIONS = [
  {
    id: 'primary_goal',
    q:  'What is the single most important business outcome this project must achieve in 90 days?',
    why: 'Brain uses this to filter every recommendation — only surfaces actions that move this metric.',
    options: [
      'Rank on page 1 for 3+ target keywords',
      'Increase organic traffic by 30%+',
      'Get cited in AI search results (Perplexity/ChatGPT)',
      'Generate qualified B2B leads from organic',
      'Beat a specific competitor on core keyword set',
      'Recover from a Google core update penalty',
    ],
    freeText: true,
  },
  {
    id: 'biggest_blocker',
    q:  'What is the single biggest obstacle between you and that goal right now?',
    why: 'Brain uses this to prioritise what to fix first — often not what looks obvious.',
    options: [
      'Technical issues blocking indexation',
      'Content too thin or not targeting right keywords',
      'No backlinks / low domain authority',
      'Site too slow for ranking competition',
      'Not sure — haven\'t audited yet',
      'AI search not citing us at all',
      'Competing with much bigger brands',
    ],
    freeText: true,
  },
  {
    id: 'buyer_persona',
    q:  'Who is the person making the buying decision? Be specific.',
    why: 'Brain uses this to calibrate every content piece — same words mean different things to a CTO vs marketing manager.',
    options: [
      'IT Manager / CTO at mid-market company',
      'Marketing Director at enterprise',
      'Founder / CEO of SMB',
      'Operations Manager replacing paper processes',
      'Procurement officer evaluating vendors',
      'Individual consumer researching a purchase',
    ],
    freeText: true,
  },
  {
    id: 'current_ranking',
    q:  'Where do your most important pages rank today on your top 3 keywords?',
    why: 'Brain calculates the gap and estimates realistic improvement timeline from here.',
    options: [
      'Not ranking at all (page 5+)',
      'Page 2–4 (positions 11–40)',
      'Page 1 bottom half (positions 6–10)',
      'Page 1 top half (positions 1–5)',
      'Mixed — some ranking, some not',
      'No idea — haven\'t checked yet',
    ],
    freeText: false,
  },
  {
    id: 'content_status',
    q:  'What is the current state of the site\'s content?',
    why: 'Brain structures the execution order differently depending on whether you need to create vs optimise.',
    options: [
      'No real content yet — mainly homepage + product pages',
      'Some content but thin — under 500 words per page',
      'Decent content volume, but not keyword-optimised',
      'Well-written content but no SEO structure',
      'Strong content, needs GEO/AI optimisation layer',
    ],
    freeText: false,
  },
  {
    id: 'past_seo',
    q:  'What has been tried before that did NOT work?',
    why: 'Brain avoids recommending things you\'ve already tried. This is one of the most underrated inputs.',
    options: [
      'Keyword stuffing / exact match overuse',
      'Bought backlinks that got penalised',
      'Published lots of low-quality content fast',
      'Redesigned site and lost all rankings',
      'Agency work that moved nothing',
      'Nothing — this is the first SEO effort',
    ],
    freeText: true,
  },
  {
    id: 'timeline',
    q:  'What is the real deadline? (Not the ideal, the one that has actual consequences)',
    why: 'Brain calculates execution velocity — how many cards per week, which to skip.',
    options: [
      '30 days — critical business milestone',
      '60 days — seasonal peak approaching',
      '90 days — quarterly target',
      '6 months — strategic growth target',
      '12 months — long-term investment',
      'No hard deadline — steady growth focus',
    ],
    freeText: false,
  },
  {
    id: 'measurement',
    q:  'How will you know this project succeeded? What is the specific number you\'re tracking?',
    why: 'Brain checks every recommendation against this metric — filters out anything that doesn\'t move it.',
    options: [
      'Organic sessions per month (specific target)',
      'Keyword rankings on specific terms',
      'Leads or conversions from organic',
      'AI engine citations (Perplexity/ChatGPT)',
      'Domain Rating or backlink count',
      'Revenue attributable to organic channel',
    ],
    freeText: true,
  },
  {
    id: 'budget_resource',
    q:  'What resources are available for execution?',
    why: 'Brain scopes execution plans to what is actually deployable — no point suggesting things you can\'t do.',
    options: [
      'Just me — founder doing everything',
      'Small team (1–3 people)',
      'Marketing team with dev support available',
      'Full in-house team',
      'External agency / freelancers on budget',
      'Hybrid — some internal, some outsourced',
    ],
    freeText: false,
  },
  {
    id: 'one_thing',
    q:  'If Manav Brain could only do one thing for this project, what should it be?',
    why: 'Brain uses this as a tiebreaker when two high-priority actions are equal in value.',
    options: [
      'Get us ranking on our #1 keyword',
      'Fix whatever is blocking our indexation',
      'Get us cited in AI search',
      'Build a backlink acquisition system',
      'Create a content architecture from scratch',
      'Run a full audit and tell us exactly what to fix first',
    ],
    freeText: true,
  },
];

/* ─── Capsule suggestion logic ─── */
// Later populated from cross-project learnings
const LEARNING_CAPSULES: Record<string, string[]> = {
  primary_goal:    [],
  biggest_blocker: [],
  one_thing:       [],
};

export default function ProjectOnboardingModal({ projectId, projectName, projectUrl, onComplete, onSkip }: Props) {
  const [step,      setStep]      = useState(0);
  const [answers,   setAnswers]   = useState<Record<string, string>>({});
  const [saving,    setSaving]    = useState(false);
  const [capsules,  setCapsules]  = useState<Record<string, string[]>>(LEARNING_CAPSULES);
  const [saved,     setSaved]     = useState(false);

  const q = QUESTIONS[step];
  const progress = ((step) / QUESTIONS.length) * 100;

  /* Load cross-project learning patterns as capsule suggestions */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('brain_learnings')
          .select('card_type, card_title, improvement, tags')
          .eq('status', 'active')
          .order('applied_count', { ascending: false })
          .limit(30);
        if (!data) return;
        // Build capsules from insight-type learnings
        const goalCapsules = data
          .filter((l: any) => ['insight','strategy'].includes(l.card_type) && l.improvement)
          .slice(0, 3)
          .map((l: any) => l.card_title.slice(0, 50));
        if (goalCapsules.length > 0) {
          setCapsules(c => ({ ...c, primary_goal: goalCapsules, one_thing: goalCapsules }));
        }
      } catch (_e) {}
    })();
  }, []);

  const answer = (value: string) => {
    setAnswers(a => ({ ...a, [q.id]: value }));
  };

  const next = () => {
    if (!answers[q.id]) return; // require answer
    if (step < QUESTIONS.length - 1) setStep(s => s + 1);
    else handleSave();
  };

  const prev = () => setStep(s => Math.max(0, s - 1));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Store answers permanently in project record
      const onboardingData = {
        completed_at: new Date().toISOString(),
        project_name: projectName,
        project_url:  projectUrl,
        answers,
        // Distill into Brain-readable summary
        brain_summary: [
          answers.primary_goal   ? `PRIMARY GOAL: ${answers.primary_goal}`          : '',
          answers.biggest_blocker? `BIGGEST BLOCKER: ${answers.biggest_blocker}`     : '',
          answers.buyer_persona  ? `BUYER: ${answers.buyer_persona}`                 : '',
          answers.current_ranking? `CURRENT RANKING: ${answers.current_ranking}`     : '',
          answers.past_seo       ? `WHAT FAILED BEFORE: ${answers.past_seo}`         : '',
          answers.timeline       ? `DEADLINE: ${answers.timeline}`                   : '',
          answers.measurement    ? `SUCCESS METRIC: ${answers.measurement}`          : '',
          answers.budget_resource? `RESOURCES: ${answers.budget_resource}`           : '',
          answers.one_thing      ? `BRAIN PRIORITY: ${answers.one_thing}`            : '',
        ].filter(Boolean).join('\n'),
      };

      // Save to playground_strategy.onboarding_data (persists across sessions)
      const { data: proj } = await supabase
        .from('projects')
        .select('playground_strategy')
        .eq('id', projectId)
        .single();

      const strategy = (proj as any)?.playground_strategy || {};
      strategy.onboarding_data = onboardingData;

      await supabase.from('projects').update({
        playground_strategy: strategy,
        // Also store key fields at top level for quick access
        keywords:    answers.primary_goal ? [answers.primary_goal.slice(0, 50)] : [],
      }).eq('id', projectId);

      // Also save as a permanent Brain Learning for this project
      await supabase.from('brain_learnings').insert({
        project_id:      projectId,
        card_type:       'insight',
        card_title:      `${projectName}: Project Onboarding Intelligence`,
        what_worked:     [],
        what_missed:     [answers.biggest_blocker || 'Not specified'],
        improvement:     answers.one_thing || answers.primary_goal || 'Run full audit first',
        context_summary: onboardingData.brain_summary,
        tags:            ['onboarding', 'permanent', 'project-context'],
        source:          'project_onboarding',
        applied_count:   0,
        status:          'active',
        auto_captured:   true,
        confidence_score: 95,
        updated_at:      new Date().toISOString(),
      });

      setSaved(true);
      setTimeout(() => { onComplete(); }, 1500);
    } catch (e: any) {
      console.error('Onboarding save failed:', e);
      onComplete(); // Don't block project creation on onboarding failure
    }
    setSaving(false);
  };

  if (saved) return (
    <div style={{position:'fixed',inset:0,zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(3,7,18,0.9)',backdropFilter:'blur(24px)'}}>
      <div style={{textAlign:'center',color:'white'}}>
        <CheckCircle size={48} style={{color:'#10b981',margin:'0 auto 16px'}}/>
        <div style={{fontSize:18,fontWeight:700,fontFamily:'monospace',letterSpacing:'0.05em'}}>INTELLIGENCE STORED</div>
        <div style={{fontSize:12,color:'rgba(255,255,255,0.4)',marginTop:6}}>Brain is now calibrated for {projectName}</div>
      </div>
    </div>
  );

  return (
    <div style={{position:'fixed',inset:0,zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(3,7,18,0.92)',backdropFilter:'blur(20px)',padding:16}}>
      <div style={{width:'100%',maxWidth:600,background:'rgba(8,10,24,0.98)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:16,overflow:'hidden',boxShadow:'0 0 80px rgba(99,102,241,0.15)'}}>

        {/* Header */}
        <div style={{padding:'14px 20px',background:'rgba(99,102,241,0.08)',borderBottom:'1px solid rgba(99,102,241,0.15)',display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:'rgba(99,102,241,0.2)',border:'1px solid rgba(99,102,241,0.4)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Brain size={14} style={{color:'#a5b4fc'}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontFamily:'monospace',color:'#a5b4fc',fontWeight:900,letterSpacing:'0.1em'}}>◈ BRAIN ONBOARDING — {projectName.toUpperCase()}</div>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.35)',marginTop:1}}>These answers permanently calibrate Brain for this project — every response uses them.</div>
          </div>
          <button onClick={onSkip} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.2)',padding:4}}>
            <X size={13}/>
          </button>
        </div>

        {/* Progress */}
        <div style={{height:3,background:'rgba(255,255,255,0.05)'}}>
          <div style={{height:'100%',width:`${progress}%`,background:'linear-gradient(90deg,#6366f1,#10b981)',transition:'width 0.4s ease',boxShadow:'0 0 8px rgba(99,102,241,0.6)'}}/>
        </div>

        <div style={{padding:'20px 20px 0'}}>
          {/* Step counter */}
          <div style={{display:'flex',gap:4,marginBottom:14}}>
            {QUESTIONS.map((_,i) => (
              <div key={i} style={{
                flex:1,height:3,borderRadius:2,
                background:i<step?'#6366f1':i===step?'rgba(99,102,241,0.5)':'rgba(255,255,255,0.06)',
                transition:'background 0.3s',
              }}/>
            ))}
          </div>

          {/* Question */}
          <div style={{marginBottom:6,fontSize:8,fontFamily:'monospace',color:'rgba(99,102,241,0.6)',letterSpacing:'0.1em'}}>
            QUESTION {step + 1} OF {QUESTIONS.length}
          </div>
          <div style={{fontSize:15,fontWeight:700,color:'rgba(255,255,255,0.9)',lineHeight:1.5,marginBottom:6}}>
            {q.q}
          </div>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.35)',marginBottom:14,lineHeight:1.5}}>
            <span style={{color:'rgba(99,102,241,0.5)'}}>WHY BRAIN NEEDS THIS: </span>{q.why}
          </div>

          {/* Cross-project learning capsules */}
          {(capsules[q.id]?.length || 0) > 0 && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(16,185,129,0.5)',marginBottom:5,letterSpacing:'0.1em'}}>
                ✓ PATTERNS FROM YOUR BRAIN LEARNINGS
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                {capsules[q.id].map((c, i) => (
                  <button key={i} onClick={() => answer(c)}
                    style={{padding:'3px 10px',fontSize:9,fontFamily:'monospace',borderRadius:4,cursor:'pointer',
                      background: answers[q.id]===c ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.06)',
                      border:`1px solid ${answers[q.id]===c ? 'rgba(16,185,129,0.5)' : 'rgba(16,185,129,0.2)'}`,
                      color: answers[q.id]===c ? '#10b981' : 'rgba(16,185,129,0.6)'}}>
                    🧠 {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Options */}
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
            {q.options.map((opt) => (
              <button key={opt} onClick={() => answer(opt)}
                style={{
                  textAlign:'left', padding:'9px 12px', fontSize:12, borderRadius:8, cursor:'pointer',
                  background: answers[q.id]===opt ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${answers[q.id]===opt ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  color: answers[q.id]===opt ? '#c7d2fe' : 'rgba(255,255,255,0.6)',
                  transition:'all 0.15s',
                  display:'flex', alignItems:'center', gap:8,
                }}>
                <span style={{fontSize:9,color:answers[q.id]===opt?'#a5b4fc':'rgba(255,255,255,0.2)'}}>
                  {answers[q.id]===opt ? '●' : '○'}
                </span>
                {opt}
              </button>
            ))}
            {q.freeText && (
              <input
                placeholder="Or type your own specific answer..."
                value={!q.options.includes(answers[q.id] || '') ? (answers[q.id] || '') : ''}
                onChange={e => answer(e.target.value)}
                style={{padding:'9px 12px',fontSize:12,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'rgba(255,255,255,0.7)',outline:'none',fontFamily:'inherit'}}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:'12px 20px 16px',display:'flex',gap:8,alignItems:'center',borderTop:'1px solid rgba(255,255,255,0.04)'}}>
          {step > 0 && (
            <button onClick={prev} style={{background:'none',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px 14px',cursor:'pointer',color:'rgba(255,255,255,0.3)',fontSize:10,fontFamily:'monospace'}}>
              ← BACK
            </button>
          )}
          <button onClick={onSkip} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.2)',fontSize:10,fontFamily:'monospace',padding:'8px 4px'}}>
            SKIP ONBOARDING
          </button>
          <div style={{flex:1}}/>
          <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.2)'}}>
            {Object.keys(answers).length}/{QUESTIONS.length} answered
          </div>
          <button
            onClick={next}
            disabled={!answers[q.id] || saving}
            style={{
              display:'flex',alignItems:'center',gap:6,padding:'9px 18px',
              background: answers[q.id] ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'rgba(255,255,255,0.04)',
              border:'none',borderRadius:8,cursor:answers[q.id]?'pointer':'default',
              color:answers[q.id]?'white':'rgba(255,255,255,0.2)',
              fontSize:10,fontFamily:'monospace',fontWeight:700,
              boxShadow:answers[q.id]?'0 0 16px rgba(99,102,241,0.4)':'none',
              transition:'all 0.2s',
            }}>
            {saving ? <><Loader2 size={11} style={{animation:'spin 1s linear infinite'}}/>SAVING...</>
              : step < QUESTIONS.length - 1 ? <>NEXT <ChevronRight size={11}/></>
              : <><Zap size={11}/>ACTIVATE BRAIN</>}
          </button>
        </div>

        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}
