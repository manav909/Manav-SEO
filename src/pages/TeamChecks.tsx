/* Team → Client checks. For one client: run the website foundations check
   now, confirm the things only a person can check (Business Profile,
   reviews, consistent details), and see / tune the AI visibility check. */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import PortalNav from '@/components/PortalNav';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

async function engine(body: object) {
  const r = await fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ success: false, error: 'Unexpected server reply' }));
}
const TEAM_KEYS = ['gbp', 'reviews', 'nap'];
const STATUS_LABEL: Record<string, string> = { good: 'Done', in_progress: 'Nearly there', todo: 'To do', unknown: 'Checking' };

export default function TeamChecks() {
  const [projects, setProjects] = useState<any[]>([]);
  const [pid, setPid] = useState('');
  const [site, setSite] = useState<any | null>(null);
  const [ai, setAi] = useState<any | null>(null);
  const [questions, setQuestions] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    supabase.from('projects').select('id,name,url').order('name').then(({ data }) => setProjects(data || []));
  }, []);

  const load = useCallback(async (id: string) => {
    setSite(null); setAi(null);
    const [s, a] = await Promise.all([engine({ action: 'cps_site_checks_get', projectId: id }), engine({ action: 'cps_ai_visibility_get', projectId: id })]);
    setSite(s); setAi(a); setQuestions((a?.questions || []).join('\n'));
  }, []);
  useEffect(() => { if (pid) load(pid); }, [pid, load]);

  const runSite = async () => {
    setBusy('site');
    const r = await engine({ action: 'cps_site_checks_run', projectId: pid });
    setBusy('');
    if (!r?.success) { toast({ title: 'Check failed', description: r?.error, variant: 'destructive' }); return; }
    setSite(r); toast({ title: 'Website checked' });
  };
  const setTeam = async (key: string, status: string) => {
    const r = await engine({ action: 'cps_site_check_set', projectId: pid, key, status });
    if (!r?.success) { toast({ title: 'Not saved', description: r?.error, variant: 'destructive' }); return; }
    load(pid);
  };
  const saveQuestions = async () => {
    const r = await engine({ action: 'cps_ai_visibility_questions', projectId: pid, questions: questions.split('\n') });
    if (!r?.success) { toast({ title: 'Not saved', description: r?.error, variant: 'destructive' }); return; }
    toast({ title: 'Questions saved', description: 'Used from the next check.' });
  };
  const runAi = async () => {
    setBusy('ai');
    const r = await engine({ action: 'cps_ai_visibility_run', projectId: pid, questions: questions.split('\n').filter((q) => q.trim()) });
    setBusy('');
    if (!r?.success) { toast({ title: 'AI check failed', description: r?.error, variant: 'destructive' }); return; }
    toast({ title: 'AI check done', description: `Mentioned in ${r.mentioned} of ${r.checked} answers.` });
    load(pid);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold">Client checks</h1>
          <p className="text-sm text-muted-foreground">Website foundations and AI visibility for one client. Both also run automatically every week.</p>
        </div>
        <select value={pid} onChange={(e) => setPid(e.target.value)} className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3 text-foreground" aria-label="Client project">
          <option value="">— Choose a client project —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.url})</option>)}
        </select>

        {pid && (
          <div className="grid lg:grid-cols-2 gap-4">
            <section className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
              <div className="flex justify-between items-center">
                <div className="font-semibold">Website foundations {site?.score != null && <span className="text-sm text-muted-foreground font-normal">· {site.score}/100</span>}</div>
                <button onClick={runSite} disabled={!!busy} className="px-3 py-1.5 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                  {busy === 'site' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Check now
                </button>
              </div>
              {!site && <Loader2 className="h-5 w-5 animate-spin" />}
              {site && !site.success && <div className="text-sm">{site.error}</div>}
              {site?.items?.map((i: any) => (
                <div key={i.key} className="flex justify-between gap-3 text-sm border-t border-border pt-2">
                  <div className="min-w-0"><div className="font-medium">{i.label}</div><div className="text-xs text-muted-foreground">{i.detail}</div></div>
                  {TEAM_KEYS.includes(i.key)
                    ? <select value={i.status} onChange={(e) => setTeam(i.key, e.target.value)} className="h-8 rounded-md border border-border bg-background/60 text-xs px-2 text-foreground shrink-0" aria-label={i.label}>
                        <option value="todo">To do</option><option value="in_progress">Nearly there</option><option value="good">Done</option>
                      </select>
                    : <span className="text-xs font-semibold shrink-0">{STATUS_LABEL[i.status]}</span>}
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
              <div className="font-semibold">AI visibility</div>
              {!ai && <Loader2 className="h-5 w-5 animate-spin" />}
              {ai?.success && (
                <>
                  <div className="text-xs text-muted-foreground">Assistants with keys set: {ai.engines.length ? ai.engines.join(', ') : 'none — add OPENAI_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY in Vercel'}</div>
                  <label className="text-sm block">Questions (one per line — built from real searches until you change them)
                    <textarea value={questions} onChange={(e) => setQuestions(e.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-border bg-background/60 p-2 text-sm text-foreground" />
                  </label>
                  <div className="flex gap-2">
                    <button onClick={saveQuestions} className="px-3 py-1.5 rounded-lg border border-border text-sm inline-flex items-center gap-1.5"><Save className="h-4 w-4" />Save questions</button>
                    <button onClick={runAi} disabled={!!busy || !ai.engines.length} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                      {busy === 'ai' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Run check now
                    </button>
                  </div>
                  {ai.runs?.length > 0 && (
                    <div className="text-sm border-t border-border pt-2">
                      History: {ai.runs.slice(-6).map((r: any) => `${new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${r.mentioned}/${r.total}`).join(' · ')}
                    </div>
                  )}
                </>
              )}
              {ai && !ai.success && <div className="text-sm">{ai.error}</div>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
