import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Shield, RefreshCw, X, CheckCircle2, AlertTriangle,
  Clock, Globe, Brain, ChevronRight, Save,
} from 'lucide-react';

interface Block {
  id: string; type: string; title: string; content: string;
  priority: string; impact?: string; assignee?: string;
  effort?: string; aiAssisted?: boolean;
}

interface VerifyResult {
  verdict: string; confidence: number;
  evidence_found: string[]; evidence_missing: string[];
  what_to_check: {tool:string;action:string;what_to_look_for:string;pass_condition:string;fail_condition:string}[];
  timeline_note: string; next_action: string;
  approval_blocked: string; hod_note?: string;
  roles?: {who_should_verify:string;escalate_to:string};
  waiting_status?: {waitDays:number;daysLeft:number;waitExpired:boolean};
  live_data_used?: boolean;
}

interface Props {
  block:     Block;
  siteUrl:   string;
  onApprove: (block: Block) => void;
  onWait:    (block: Block, days: number) => void;
  onClose:   () => void;
}

const WAIT_DAYS: Record<string,number> = {
  technical:5, content:14, geo:7, 'quick-win':3,
  competitive:21, insight:0, weekly:3, monthly:30, kpi:7, custom:5,
};

const EVIDENCE_REQ: Record<string,{tool:string;what:string;paste:string}[]> = {
  technical: [
    {tool:'Google Search Console',   what:'Coverage report — indexed page count before vs after the fix', paste:'Paste: indexed pages BEFORE and AFTER. Example: Before: 823 / After: 847'},
    {tool:'Screaming Frog or browser', what:'HTTP status code of the affected URLs', paste:'Paste 2-3 affected URLs with their new HTTP status. Example: /old-url → 301 → /new-url (confirmed)'},
    {tool:'PageSpeed Insights',       what:'If speed task: LCP, CLS, FID scores',paste:'Paste scores before and after if available'},
  ],
  content: [
    {tool:'Browser — live URL',       what:'Confirm the page is published and content is live', paste:'Paste the live URL and confirm: title, H1, approximate word count visible'},
    {tool:'Google Search Console',    what:'Performance → target keyword impressions/position (14+ days needed)', paste:'Paste keyword, impressions, clicks, avg position. Note: may show "No data" if < 14 days'},
    {tool:'Google (incognito tab)',   what:'Search the target keyword — does the page appear?', paste:'Paste: keyword searched + position found (or "not yet indexed")'},
  ],
  geo: [
    {tool:'Perplexity.ai',            what:'Search your target query — is your site cited as a source?', paste:'Paste: query used + whether your domain appeared as citation (yes/no + URL if yes)'},
    {tool:'ChatGPT or Claude',        what:'Ask a question where your content should be authoritative', paste:'Paste: the question + whether your brand/URL was mentioned in the response'},
    {tool:'Google (AI Overview)',     what:'Search the keyword in Google — does AI Overview cite your content?', paste:'Paste: keyword + whether AI Overview appeared + if your site was mentioned'},
  ],
  'quick-win': [
    {tool:'Relevant tool for this task', what:'The specific metric this quick win was supposed to improve', paste:'Paste: metric name + value BEFORE + value NOW + date of measurement'},
    {tool:'Google Search Console',       what:'Any GSC signal reflecting the change', paste:'Paste relevant GSC data if available'},
  ],
  competitive: [
    {tool:'Semrush or Ahrefs',         what:'Your ranking position vs competitor for target keyword', paste:'Paste: keyword + your position + competitor position + date checked'},
    {tool:'Google incognito',          what:'Manual SERP check for the target keyword', paste:'Paste: keyword + your result position + competitor position'},
  ],
};

export default function VerifyModal({ block, siteUrl, onApprove, onWait, onClose }: Props) {
  const [step,           setStep]           = useState<1|2|3>(1);
  const [completionNote, setCompletionNote] = useState('');
  const [evidenceData,   setEvidenceData]   = useState('');
  const [completedDate,  setCompletedDate]  = useState(new Date().toISOString().split('T')[0]);
  const [loading,        setLoading]        = useState(false);
  const [result,         setResult]         = useState<VerifyResult|null>(null);

  const waitDays  = WAIT_DAYS[block.type] || 5;
  const compDate  = new Date(completedDate);
  const daysSince = Math.floor((Date.now() - compDate.getTime()) / 86400000);
  const daysLeft  = Math.max(0, waitDays - daysSince);
  const waitReady = daysLeft === 0;
  const evReqs    = EVIDENCE_REQ[block.type] || EVIDENCE_REQ['quick-win'];

  const runCheck = async (checkType: 'live_check' | 'guidance') => {
    setLoading(true);
    setResult(null);
    setStep(3);
    try {
      const res = await fetch('/api/task-engine', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:         'verify',
          card:           block,
          siteUrl,
          completedAt:    new Date(completedDate).toISOString(),
          checkType,
          completionNote,
          evidenceData,
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setResult({
        verdict: 'cannot_determine', confidence: 0,
        evidence_found: [], evidence_missing: [],
        what_to_check: [], timeline_note: '',
        next_action: 'Please try again — if the issue persists check your internet connection.',
        approval_blocked: `Error: ${(e as Error).message}`,
      });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
      <div
        className="relative w-full max-w-2xl bg-[#0f0f13] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{maxHeight:'92vh'}}
        onClick={e => e.stopPropagation()}
      >
        {/* Top gradient bar */}
        <div className="h-1 w-full" style={{background:'linear-gradient(90deg,#f59e0b,#8b5cf6,#22c55e)'}}/>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 shrink-0">
          <div className="h-9 w-9 rounded-xl bg-yellow-400/15 border border-yellow-400/25 flex items-center justify-center shrink-0">
            <Shield size={16} className="text-yellow-400"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-white">Task Verification</div>
            <div className="text-xs text-white/40 truncate">"{block.title}"</div>
          </div>
          {/* Step indicators */}
          <div className="flex items-center gap-1.5 shrink-0">
            {([1,2,3] as const).map(n => (
              <button key={n} onClick={()=>n<step?setStep(n):undefined}
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                  step>n  ? 'bg-green-500 border-green-500 text-white' :
                  step===n? 'bg-violet-500 border-violet-500 text-white' :
                  'bg-white/5 border-white/10 text-white/30'
                }`}>{step>n?'✓':n}</button>
            ))}
          </div>
          {!loading && (
            <button onClick={onClose} className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 ml-1">
              <X size={13} className="text-white/60"/>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── STEP 1: What was done ── */}
          {step === 1 && (
            <>
              <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                <div className="text-xs font-mono text-white/40 uppercase mb-2">Task being submitted</div>
                <p className="text-sm text-white/80 leading-relaxed">{block.content}</p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded border border-white/10 text-white/40">{block.type}</span>
                  {block.impact && <span className="text-xs px-2 py-0.5 rounded border border-orange-400/30 text-orange-400">expected: {block.impact}</span>}
                  {block.assignee && <span className="text-xs px-2 py-0.5 rounded border border-violet-400/30 text-violet-400">{block.assignee}</span>}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white flex items-center gap-1">
                  <span className="text-red-400">*</span>What exactly did you do to complete this?
                  <span className="text-white/30 font-normal ml-auto">{completionNote.length}/50 min</span>
                </label>
                <textarea
                  value={completionNote}
                  onChange={e => setCompletionNote(e.target.value)}
                  placeholder={"Describe precisely what was changed, which files/pages/settings, which tools you used, and the before/after state.\n\nExample: \"Fixed 3 broken 404s — added 301 redirects in .htaccess for /old-page-1, /old-page-2, /old-page-3 pointing to /correct-destination. Tested in browser. All return 301 confirmed.\""}
                  className="w-full h-32 text-sm px-3 py-2.5 rounded-xl border border-white/10 bg-white/3 text-white placeholder-white/20 outline-none focus:border-violet-400/50 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">When did you finish this task?</label>
                <input type="date" value={completedDate} onChange={e=>setCompletedDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="h-9 text-sm px-3 rounded-xl border border-white/10 bg-white/3 text-white outline-none focus:border-violet-400/50"/>
              </div>
            </>
          )}

          {/* ── STEP 2: Evidence ── */}
          {step === 2 && (
            <>
              {/* Wait period */}
              <div className={`rounded-xl border p-4 ${waitReady?'border-green-400/25 bg-green-400/5':'border-orange-400/25 bg-orange-400/5'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={13} className={waitReady?'text-green-400':'text-orange-400'}/>
                  <span className={`text-sm font-semibold ${waitReady?'text-green-400':'text-orange-400'}`}>
                    {waitReady
                      ? `Waiting period complete — ${daysSince} days since completion`
                      : `${daysLeft} day${daysLeft!==1?'s':''} remaining before verification is reliable`}
                  </span>
                </div>
                <p className="text-xs text-white/50">
                  {waitReady
                    ? `${block.type} changes need ~${waitDays} days to propagate. That time has passed — evidence should now be visible in tools.`
                    : `${block.type} changes take ~${waitDays} days to appear in GSC and other tools. Checking earlier may give false negatives.`}
                </p>
              </div>

              {/* Required evidence */}
              <div>
                <div className="text-xs font-semibold text-white mb-3">
                  Required evidence for <span className="text-violet-400">{block.type}</span> tasks — check each tool:
                </div>
                <div className="space-y-2">
                  {evReqs.map((req, i) => (
                    <div key={i} className="rounded-xl border border-white/8 bg-white/3 p-3">
                      <div className="text-xs font-semibold text-violet-400 mb-1">{i+1}. {req.tool}</div>
                      <div className="text-xs text-white/60 mb-1.5">{req.what}</div>
                      <div className="text-xs text-white/40 flex items-start gap-1.5">
                        <ChevronRight size={10} className="shrink-0 mt-0.5 text-violet-400"/>
                        <span>{req.paste}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Paste your data from the tools above:</label>
                <textarea
                  value={evidenceData}
                  onChange={e => setEvidenceData(e.target.value)}
                  placeholder={"Copy and paste raw data from the tools listed above.\n\nExamples:\nGSC Coverage: Indexed pages = 847 (was 823)\n/old-page → 301 → /new-page confirmed\n\nOR:\nKeyword 'seo agency london': Position 8 (was 14) — Semrush 15 Jan 2024"}
                  className="w-full h-28 text-sm px-3 py-2.5 rounded-xl border border-white/10 bg-white/3 text-white placeholder-white/20 outline-none focus:border-violet-400/50 resize-none font-mono"
                />
                <p className="text-xs text-white/30">More specific data = more accurate verdict. No data = cannot_determine.</p>
              </div>
            </>
          )}

          {/* ── STEP 3: Verdict ── */}
          {step === 3 && (
            <>
              {loading && (
                <div className="flex flex-col items-center gap-3 py-12">
                  <RefreshCw size={24} className="animate-spin text-violet-400"/>
                  <p className="text-sm text-white/50 text-center">
                    {siteUrl ? 'Fetching live site + analysing evidence...' : 'Analysing evidence against task requirements...'}
                  </p>
                </div>
              )}

              {result && !loading && (
                <div className="space-y-3">
                  {/* Verdict badge */}
                  <div className={`rounded-xl border p-4 ${
                    result.verdict==='verified'?'border-green-400/30 bg-green-400/5':
                    result.verdict==='partial'  ?'border-yellow-400/30 bg-yellow-400/5':
                    'border-red-400/30 bg-red-400/5'
                  }`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-sm font-black ${
                        result.verdict==='verified'?'bg-green-500 text-white':
                        result.verdict==='partial' ?'bg-yellow-500 text-black':
                        'bg-red-500/20 border border-red-500/30 text-red-400'
                      }`}>{result.verdict==='verified'?'✓':result.verdict==='partial'?'~':'!'}</div>
                      <div>
                        <div className="font-bold text-white capitalize">{result.verdict?.replace(/_/g,' ')}</div>
                        <div className="text-xs text-white/40">
                          {result.confidence>0&&`${result.confidence}% confidence`}
                          {result.live_data_used&&' · live site checked'}
                        </div>
                      </div>
                    </div>

                    {result.evidence_found?.length>0&&(
                      <div className="mb-3">
                        <div className="text-xs font-mono text-green-400 uppercase mb-2">Evidence Confirmed</div>
                        {result.evidence_found.map((e,i)=>(
                          <div key={i} className="flex items-start gap-2 text-xs text-white/70 mb-1.5">
                            <span className="text-green-400 shrink-0">✓</span><span>{e}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.evidence_missing?.length>0&&(
                      <div className="mb-3">
                        <div className="text-xs font-mono text-red-400 uppercase mb-2">Not Confirmed</div>
                        {result.evidence_missing.map((e,i)=>(
                          <div key={i} className="flex items-start gap-2 text-xs text-white/70 mb-1.5">
                            <span className="text-red-400 shrink-0">✗</span><span>{e}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.approval_blocked&&result.verdict!=='verified'&&(
                      <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-3">
                        <div className="text-xs font-mono text-red-400 uppercase mb-1">Approval Blocked</div>
                        <p className="text-xs text-white/60">{result.approval_blocked}</p>
                      </div>
                    )}
                  </div>

                  {result.what_to_check?.length>0&&(
                    <div>
                      <div className="text-xs font-mono text-violet-400 uppercase mb-2">Manual Checklist</div>
                      {result.what_to_check.map((c,i)=>(
                        <div key={i} className="rounded-xl border border-white/8 bg-white/3 p-3 mb-2 space-y-1 text-xs">
                          <div className="font-semibold text-violet-400">{c.tool}</div>
                          <div className="text-white/60"><span className="text-white/40">Action: </span>{c.action}</div>
                          <div className="text-white/60"><span className="text-white/40">Look for: </span>{c.what_to_look_for}</div>
                          <div className="text-green-400/80 font-medium">Pass: {c.pass_condition}</div>
                          <div className="text-red-400/80 font-medium">Fail: {c.fail_condition}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {result.hod_note&&(
                    <div className="rounded-xl border border-white/8 bg-white/3 p-3">
                      <div className="text-xs font-mono text-white/40 uppercase mb-1">HoD Review Note</div>
                      <p className="text-xs text-white/60 italic">{result.hod_note}</p>
                    </div>
                  )}

                  {result.next_action&&(
                    <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
                      <div className="text-xs font-mono text-violet-400 uppercase mb-1">Required Next Action</div>
                      <p className="text-sm font-medium text-white">{result.next_action}</p>
                    </div>
                  )}

                  {result.timeline_note&&(
                    <p className="text-xs text-white/40 italic">{result.timeline_note}</p>
                  )}
                  {result.roles?.who_should_verify&&(
                    <p className="text-xs text-white/40">
                      Verify: <span className="text-white/60">{result.roles.who_should_verify}</span>
                      {result.roles.escalate_to&&<> · Escalate: <span className="text-white/60">{result.roles.escalate_to}</span></>}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 shrink-0 bg-white/2">
          <div className="flex items-center gap-2 flex-wrap">

            {step===1&&(
              <>
                <button
                  onClick={()=>{
                    if(completionNote.trim().length<50){
                      toast({title:'Required',description:'Describe what was done in at least 50 characters.',variant:'destructive'});
                      return;
                    }
                    setStep(2);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
                >
                  Next: Collect Evidence →
                </button>
                <button onClick={onClose} className="text-sm text-white/40 hover:text-white/70 px-3">Cancel</button>
                <span className="text-xs text-white/25 ml-auto">{completionNote.length}/50 minimum</span>
              </>
            )}

            {step===2&&(
              <>
                <button onClick={()=>setStep(1)} className="text-sm text-white/40 hover:text-white/70 px-3">← Back</button>
                <button
                  onClick={()=>runCheck('live_check')}
                  disabled={loading||!siteUrl}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
                >
                  <Globe size={14}/>{siteUrl?'Run Live Check':'No URL set on project'}
                </button>
                <button
                  onClick={()=>runCheck('guidance')}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-40 text-white/70 text-sm transition-colors"
                >
                  <Brain size={14}/>Get Checklist Only
                </button>
                {!waitReady&&(
                  <button
                    onClick={()=>onWait(block, daysLeft)}
                    className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl border border-orange-400/30 bg-orange-400/10 text-orange-400 hover:bg-orange-400/15 transition-colors ml-auto"
                  >
                    <Clock size={13}/>Wait {daysLeft} more days
                  </button>
                )}
              </>
            )}

            {step===3&&!loading&&result&&(
              <>
                {result.verdict==='verified'?(
                  <button
                    onClick={()=>onApprove(block)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors"
                  >
                    <CheckCircle2 size={15}/>Approve & Mark Verified
                  </button>
                ):(
                  <>
                    <button onClick={()=>{setStep(2);setResult(null);}} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-sm text-white/70 transition-colors">
                      ← Add More Evidence
                    </button>
                    {(result.waiting_status?.daysLeft||0)>0&&(
                      <button onClick={()=>onWait(block,result.waiting_status!.daysLeft)} className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl border border-orange-400/30 bg-orange-400/10 text-orange-400 transition-colors">
                        <Clock size={13}/>Mark as Waiting
                      </button>
                    )}
                    <button onClick={()=>onApprove(block)} className="text-xs px-3 py-2 rounded-xl border border-white/10 text-white/30 hover:text-white/60 ml-auto transition-colors" title="Use only if you have manually verified outside this system">
                      Override — approve anyway
                    </button>
                  </>
                )}
              </>
            )}

            {step===3&&loading&&(
              <div className="flex items-center gap-2 text-sm text-white/40">
                <RefreshCw size={14} className="animate-spin"/>Analysing...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
