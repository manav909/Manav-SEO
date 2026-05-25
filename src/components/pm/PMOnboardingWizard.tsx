/* ════════════════════════════════════════════════════════════════
   PMOnboardingWizard.tsx
   Full-screen step-by-step wizard for project managers.

   Steps:
     1. Client       — select existing or create new
     2. Project      — URL, name, keywords, goals
     3. Brain Brief  — 5 quick questions (skippable)
     4. Connect Data — GSC + GA4 inline OAuth (skippable)
     5. Launch       — first keyword campaign (skippable)

   On complete: refreshData() → setSelectedProjectId(newId)
════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronRight, ChevronLeft, Check, X, Building2, Globe,
  Brain, Plug, Rocket, Loader2, ExternalLink, SkipForward,
  AlertCircle, CheckCircle2, Search, BarChart3, Sparkles,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as pmApi from './api';

/* ── Props ─────────────────────────────────────────────────── */
interface Props {
  onComplete: (projectId: string) => void;
  onDismiss?: () => void;
}

/* ── Step meta ─────────────────────────────────────────────── */
const STEPS = [
  { id: 'client',   icon: Building2, label: 'Client',       desc: 'Who is this project for?' },
  { id: 'project',  icon: Globe,     label: 'Project',      desc: 'The site and target keywords' },
  { id: 'brain',    icon: Brain,     label: 'Brain Brief',  desc: 'Context that sharpens every AI output' },
  { id: 'data',     icon: Plug,      label: 'Connect Data', desc: 'GSC + GA4 for authentic metrics' },
  { id: 'launch',   icon: Rocket,    label: 'First Campaign', desc: 'Start ranking in minutes' },
];

/* ── Intelligence questions ────────────────────────────────── */
const INTEL_QS: { key: string; q: string; opts: string[] }[] = [
  {
    key: 'business_goal',
    q: 'What is the single most important outcome in 90 days?',
    opts: ['Rank on page 1 for 3+ keywords', 'Increase organic traffic 30%+', 'Get cited in AI search', 'Generate B2B leads from organic', 'Beat a specific competitor', 'Recover from Google penalty'],
  },
  {
    key: 'biggest_blocker',
    q: 'What is the biggest obstacle right now?',
    opts: ['Technical issues blocking indexation', 'Content too thin / wrong keywords', 'No backlinks / low authority', 'Site too slow', 'AI search not citing us', 'Not sure — need to audit first'],
  },
  {
    key: 'target_audience',
    q: 'Who makes the buying decision?',
    opts: ['IT Manager / CTO at mid-market', 'Marketing Director at enterprise', 'Founder / CEO of SMB', 'Operations Manager', 'Individual consumer', 'Mixed audience'],
  },
  {
    key: 'cms_platform',
    q: 'What CMS is the site on?',
    opts: ['WordPress + Yoast/RankMath', 'Webflow', 'Shopify', 'HubSpot', 'Custom build', 'Wix / Squarespace / Other'],
  },
  {
    key: 'timeline',
    q: 'Real deadline for results?',
    opts: ['30 days — critical milestone', '60 days — seasonal peak', '90 days — quarterly target', '6 months — strategic growth', '12 months — long-term', 'No hard deadline'],
  },
];

/* ────────────────────────────────────────────────────────────
   Main component
──────────────────────────────────────────────────────────── */
export default function PMOnboardingWizard({ onComplete, onDismiss }: Props) {
  const { clients, refreshData } = useAuth();
  const { toast } = useToast();

  /* Step state */
  const [step, setStep]       = useState(0);   // 0-4
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  /* Step 1 — Client */
  const [clientMode, setClientMode]   = useState<'existing' | 'new'>('existing');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientForm, setClientForm]   = useState({
    name: '', company: '', email: '', website: '', industry: '', retainer_amount: '',
  });

  /* Step 2 — Project */
  const [projectForm, setProjectForm] = useState({
    name: '', url: '', keywords: '', competitors: '', goals: '',
  });
  const [createdProjectId, setCreatedProjectId] = useState('');

  /* Step 3 — Brain */
  const [intel, setIntel] = useState<Record<string, string>>({});
  const [brainSaved, setBrainSaved] = useState(false);

  /* Step 4 — Data */
  const [gscConnected, setGscConnected] = useState(false);
  const [ga4Connected, setGa4Connected] = useState(false);
  const [connectingGsc, setConnectingGsc] = useState(false);
  const [connectingGa4, setConnectingGa4] = useState(false);

  /* Step 5 — Campaign */
  const [keyword, setKeyword]     = useState('');
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched]   = useState(false);

  /* ── Derived ── */
  const existingClients = clients || [];
  const progressPct     = ((step) / (STEPS.length - 1)) * 100;

  /* ── Check integrations when project is created ── */
  useEffect(() => {
    if (!createdProjectId) return;
    (async () => {
      const gsc = await pmApi.gscStatus(createdProjectId);
      const ga4 = await pmApi.ga4Status(createdProjectId);
      setGscConnected(!!gsc.status?.connected);
      setGa4Connected(!!ga4.status?.connected);
    })();
  }, [createdProjectId]);

  /* ── Listen for OAuth popup messages ── */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'gsc_connected') setGscConnected(true);
      if (e.data?.type === 'ga4_connected') setGa4Connected(true);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  /* ════════════════════════════════
     ACTION HANDLERS
  ════════════════════════════════ */

  const handleCreateClientAndProject = async () => {
    setErr('');
    const needsNewClient = clientMode === 'new';

    if (needsNewClient && (!clientForm.name || !clientForm.email))
      return setErr('Client name and email are required.');
    if (clientMode === 'existing' && !selectedClientId)
      return setErr('Please select an existing client.');
    if (!projectForm.name || !projectForm.url)
      return setErr('Project name and URL are required.');

    setSaving(true);
    try {
      /* Create client if needed */
      let clientId = selectedClientId;
      if (needsNewClient) {
        const { data: c, error: cErr } = await supabase.from('clients').insert({
          name:             clientForm.name,
          company:          clientForm.company || clientForm.name,
          email:            clientForm.email,
          website:          clientForm.website,
          industry:         clientForm.industry,
          retainer_amount:  parseFloat(clientForm.retainer_amount) || 0,
        }).select('id').single();
        if (cErr) throw new Error(cErr.message);
        clientId = (c as any).id;
      }

      /* Create project */
      const kws  = projectForm.keywords.split(',').map(k => k.trim()).filter(Boolean);
      const comp = projectForm.competitors.split(',').map(c => c.trim()).filter(Boolean);
      const { data: p, error: pErr } = await supabase.from('projects').insert({
        client_id:   clientId,
        name:        projectForm.name,
        url:         projectForm.url.startsWith('http') ? projectForm.url : `https://${projectForm.url}`,
        keywords:    kws,
        competitors: comp,
        goals:       projectForm.goals,
        status:      'active',
      }).select('id').single();
      if (pErr) throw new Error(pErr.message);
      setCreatedProjectId((p as any).id);
      await refreshData();
      setStep(2);
    } catch (e: any) {
      setErr(e.message || 'Failed to create project');
    }
    setSaving(false);
  };

  const handleSaveBrain = async () => {
    if (!createdProjectId) { setStep(3); return; }
    setSaving(true);
    try {
      const answers = Object.entries(intel);
      if (answers.length > 0) {
        const summary = answers.map(([k, v]) => `${k.toUpperCase().replace(/_/g, ' ')}: ${v}`).join('\n');
        await supabase.from('brain_learnings').insert({
          project_id:      createdProjectId,
          card_type:       'insight',
          card_title:      'Project Onboarding Intelligence',
          what_worked:     [],
          what_missed:     [intel.biggest_blocker || 'Not specified'],
          improvement:     intel.business_goal || 'Run full audit first',
          context_summary: summary,
          tags:            ['onboarding', 'permanent', 'project-context'],
          source:          'project_onboarding',
          applied_count:   0,
          status:          'active',
          auto_captured:   true,
          confidence_score: 95,
          updated_at:      new Date().toISOString(),
        });
      }
      setBrainSaved(true);
      setStep(3);
    } catch { setStep(3); }
    setSaving(false);
  };

  const connectGsc = async () => {
    if (!createdProjectId) return;
    setConnectingGsc(true);
    const { url, error } = await pmApi.gscOauthStart(createdProjectId);
    setConnectingGsc(false);
    if (error || !url) return toast({ title: 'GSC connect failed', description: error, variant: 'destructive' });
    const popup = window.open(url, '_blank', 'width=500,height=620,left=300,top=100');
    if (!popup) toast({ title: 'Pop-up blocked', description: 'Allow pop-ups for this site and try again.', variant: 'destructive' });
  };

  const connectGa4 = async () => {
    if (!createdProjectId) return;
    setConnectingGa4(true);
    const { url, error } = await pmApi.ga4OauthStart(createdProjectId);
    setConnectingGa4(false);
    if (error || !url) return toast({ title: 'GA4 connect failed', description: error, variant: 'destructive' });
    const popup = window.open(url, '_blank', 'width=500,height=620,left=300,top=100');
    if (!popup) toast({ title: 'Pop-up blocked', description: 'Allow pop-ups for this site and try again.', variant: 'destructive' });
  };

  const launchCampaign = async () => {
    if (!keyword.trim() || !createdProjectId) { finishWizard(); return; }
    setLaunching(true);
    try {
      const res = await pmApi.seasonPipelineCreate({
        projectId:    createdProjectId,
        pipelineType: 'rank_for_keyword',
        inputText:    keyword,
        scope:        { keyword },
      });
      if (res.error) throw new Error(res.error);
      setLaunched(true);
      toast({ title: `Pipeline started for "${keyword}"`, description: 'The 8-step pipeline is running. Check SEO Campaigns in PM Module.' });
    } catch (e: any) {
      toast({ title: 'Pipeline failed to start', description: e.message, variant: 'destructive' });
    }
    setLaunching(false);
  };

  const finishWizard = async () => {
    await refreshData();
    if (createdProjectId) onComplete(createdProjectId);
    else if (onDismiss) onDismiss();
  };

  /* ════════════════════════════════
     RENDER HELPERS
  ════════════════════════════════ */

  const Field = ({ label, placeholder, value, onChange, type = 'text', hint }: {
    label: string; placeholder: string; value: string;
    onChange: (v: string) => void; type?: string; hint?: string;
  }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-11 rounded-xl border border-border bg-background/60 text-sm px-4 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60 transition-all"
      />
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );

  const Btn = ({ onClick, disabled, children, variant = 'primary', className = '' }: {
    onClick: () => void; disabled?: boolean; children: React.ReactNode;
    variant?: 'primary' | 'ghost' | 'outline'; className?: string;
  }) => {
    const base = "h-11 px-6 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed";
    const styles = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.25)]',
      ghost:   'text-muted-foreground hover:text-foreground',
      outline: 'border border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-primary/40',
    };
    return (
      <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
        {children}
      </button>
    );
  };

  /* ════════════════════════════════
     STEP CONTENT
  ════════════════════════════════ */

  const renderStep0 = () => (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { mode: 'existing' as const, label: 'Existing client', desc: existingClients.length > 0 ? `${existingClients.length} client${existingClients.length > 1 ? 's' : ''} found` : 'No clients yet' },
          { mode: 'new' as const,      label: 'New client',      desc: 'First time with this client' },
        ].map(({ mode, label, desc }) => (
          <button key={mode} onClick={() => setClientMode(mode)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              clientMode === mode
                ? 'border-primary bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.4)]'
                : 'border-border bg-card/40 hover:border-primary/40'
            }`}>
            <div className="text-sm font-semibold mb-0.5">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </button>
        ))}
      </div>

      {clientMode === 'existing' ? (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Client</label>
          {existingClients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No clients yet — switch to "New client" above.
            </div>
          ) : (
            <div className="grid gap-2 max-h-60 overflow-y-auto pr-1">
              {existingClients.map((c: any) => (
                <button key={c.id} onClick={() => setSelectedClientId(c.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    selectedClientId === c.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background/40 hover:border-primary/30'
                  }`}>
                  <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                    {(c.name?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.company} {c.email ? `· ${c.email}` : ''}</div>
                  </div>
                  {selectedClientId === c.id && <CheckCircle2 className="h-4 w-4 text-primary ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact Name *" placeholder="Jane Smith" value={clientForm.name} onChange={v => setClientForm(f => ({ ...f, name: v }))} />
          <Field label="Company" placeholder="Acme Corp" value={clientForm.company} onChange={v => setClientForm(f => ({ ...f, company: v }))} />
          <Field label="Email *" placeholder="jane@company.com" type="email" value={clientForm.email} onChange={v => setClientForm(f => ({ ...f, email: v }))} />
          <Field label="Website" placeholder="https://company.com" value={clientForm.website} onChange={v => setClientForm(f => ({ ...f, website: v }))} />
          <Field label="Industry" placeholder="SaaS, E-commerce..." value={clientForm.industry} onChange={v => setClientForm(f => ({ ...f, industry: v }))} />
          <Field label="Monthly Retainer ($)" placeholder="1500" type="number" value={clientForm.retainer_amount} onChange={v => setClientForm(f => ({ ...f, retainer_amount: v }))} />
        </div>
      )}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Project Name *" placeholder="Main Website" value={projectForm.name}
          onChange={v => setProjectForm(f => ({ ...f, name: v }))} />
        <Field label="Website URL *" placeholder="https://example.com" value={projectForm.url}
          onChange={v => setProjectForm(f => ({ ...f, url: v }))} />
      </div>
      <Field label="Target Keywords" placeholder="best crm software, crm for small business, ..."
        value={projectForm.keywords} hint="Comma-separated. The first keyword becomes the primary campaign target."
        onChange={v => setProjectForm(f => ({ ...f, keywords: v }))} />
      <Field label="Competitor URLs" placeholder="competitor1.com, competitor2.com"
        value={projectForm.competitors} hint="Comma-separated domains — used in analysis and SERP benchmarking."
        onChange={v => setProjectForm(f => ({ ...f, competitors: v }))} />
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Goals</label>
        <textarea
          rows={3}
          placeholder="What does SEO success look like for this client? Rank top-3 for primary keyword, grow organic leads by 40%..."
          value={projectForm.goals}
          onChange={e => setProjectForm(f => ({ ...f, goals: e.target.value }))}
          className="w-full rounded-xl border border-border bg-background/60 text-sm px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60 resize-none"
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Answer 5 quick questions. Every AI output — strategies, content briefs, monitoring reports — will be calibrated to these answers. Takes 2 minutes.
        </p>
      </div>
      {INTEL_QS.map(({ key, q, opts }) => (
        <div key={key}>
          <div className="text-sm font-medium mb-3 leading-snug">{q}</div>
          <div className="flex flex-wrap gap-2">
            {opts.map(opt => (
              <button key={opt} onClick={() => setIntel(a => ({ ...a, [key]: a[key] === opt ? '' : opt }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                  intel[key] === opt
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-border bg-background/40 text-muted-foreground hover:border-primary/30'
                }`}>
                {intel[key] === opt ? '✓ ' : ''}{opt}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="text-xs text-muted-foreground text-center pt-2">
        Answered {Object.values(intel).filter(Boolean).length} of {INTEL_QS.length} — partial answers are saved too.
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Connecting GSC and GA4 unlocks authentic ranking data, engagement metrics, and AI-verified reports.
          Without these, the system uses estimates — still useful, but less precise.
        </p>
      </div>

      {/* GSC */}
      <div className={`rounded-2xl border p-5 transition-all ${gscConnected ? 'border-green-400/30 bg-green-400/5' : 'border-border bg-card/40'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${gscConnected ? 'bg-green-400/15 text-green-400' : 'bg-background/60 text-muted-foreground'}`}>
              <Search className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold">Google Search Console</span>
                {gscConnected && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full font-mono">Connected ✓</span>}
              </div>
              <p className="text-xs text-muted-foreground">Clicks, impressions, positions — direct from Google. The most important data source.</p>
            </div>
          </div>
          {!gscConnected && (
            <Btn onClick={connectGsc} disabled={connectingGsc || !createdProjectId} variant="outline" className="flex-shrink-0">
              {connectingGsc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              Connect
            </Btn>
          )}
        </div>
      </div>

      {/* GA4 */}
      <div className={`rounded-2xl border p-5 transition-all ${ga4Connected ? 'border-green-400/30 bg-green-400/5' : 'border-border bg-card/40'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ga4Connected ? 'bg-green-400/15 text-green-400' : 'bg-background/60 text-muted-foreground'}`}>
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold">Google Analytics 4</span>
                {ga4Connected && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full font-mono">Connected ✓</span>}
              </div>
              <p className="text-xs text-muted-foreground">Organic sessions, engagement rate, conversions. Gives the full user-behaviour picture.</p>
            </div>
          </div>
          {!ga4Connected && (
            <Btn onClick={connectGa4} disabled={connectingGa4 || !createdProjectId} variant="outline" className="flex-shrink-0">
              {connectingGa4 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              Connect
            </Btn>
          )}
        </div>
      </div>

      {(gscConnected || ga4Connected) && (
        <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-3 flex items-center gap-2 text-sm text-green-400">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {gscConnected && ga4Connected ? 'Both data sources connected. Every report will use live verified data.' : gscConnected ? 'GSC connected. Add GA4 when ready.' : 'GA4 connected. Add GSC when ready.'}
        </div>
      )}

      <p className="text-xs text-muted-foreground/60 text-center">
        You can connect or reconnect at any time from the Data Room.
      </p>
    </div>
  );

  const renderStep4 = () => {
    const primaryKw = projectForm.keywords.split(',')[0]?.trim() || '';
    if (!keyword && primaryKw) setKeyword(primaryKw);

    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Run the <strong className="text-foreground">Rank-for-Keyword</strong> pipeline — 8 automated steps that produce a keyword brief, competitor snapshot, strategy plan, content brief, forecast, and client update. Takes about 3 minutes.
          </p>
        </div>

        <Field
          label="Target Keyword *"
          placeholder="best crm for small business"
          value={keyword}
          hint="The primary keyword this client wants to rank for. More campaigns can be added from the PM Module."
          onChange={setKeyword}
        />

        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          {[
            { icon: Search,    label: 'Keyword research', desc: 'Intent, volume, SERP shape' },
            { icon: BarChart3, label: 'GSC context',       desc: 'Current rankings + neighbors' },
            { icon: Globe,     label: 'Competitor snapshot', desc: 'Top 5 ranking pages' },
            { icon: Brain,     label: 'Strategy + Brief',  desc: 'Full content brief + plan' },
            { icon: Sparkles,  label: 'Forecast',          desc: 'Data-backed projections' },
            { icon: Rocket,    label: 'Client update',     desc: 'Email draft in Manav\'s voice' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="rounded-xl border border-border bg-background/40 p-3 flex items-start gap-2">
              <Icon className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-foreground">{label}</div>
                <div>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {launched && (
          <div className="rounded-xl border border-green-400/30 bg-green-400/5 p-4 flex items-center gap-3 text-sm text-green-400">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <div>
              <div className="font-semibold">Pipeline running for "{keyword}"</div>
              <div className="text-xs text-muted-foreground mt-0.5">Find it in PM Module → SEO Campaigns. Steps complete one by one — check back in 3 minutes.</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ════════════════════════════════
     STEP ACTIONS
  ════════════════════════════════ */
  const nextLabel = ['Continue to Project →', null, 'Save & Continue →', 'Continue →', launched ? 'Go to PM Module' : 'Launch Campaign'];

  const handleNext = () => {
    setErr('');
    if (step === 0 || step === 1) {
      handleCreateClientAndProject();
    } else if (step === 2) {
      handleSaveBrain();
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      if (!launched && keyword.trim()) launchCampaign();
      else finishWizard();
    }
  };

  const handleSkip = () => {
    setErr('');
    if (step === 2) setStep(3);
    else if (step === 3) setStep(4);
    else if (step === 4) finishWizard();
  };

  const canSkip = step >= 2;
  const isLastStep = step === 4;

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4][step];

  /* ════════════════════════════════
     LAYOUT
  ════════════════════════════════ */
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4" style={{ backgroundImage: 'radial-gradient(ellipse at 30% 20%, hsl(var(--primary)/0.08) 0%, transparent 60%)' }}>
      <div className="w-full max-w-2xl flex flex-col gap-0 rounded-3xl border border-border bg-card shadow-2xl overflow-hidden max-h-[92vh]">

        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-border/50">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1.5">
                Step {step + 1} of {STEPS.length}
              </div>
              <h2 className="text-xl font-bold tracking-tight">{STEPS[step].label}</h2>
              <p className="text-sm text-muted-foreground mt-1">{STEPS[step].desc}</p>
            </div>
            {onDismiss && (
              <button onClick={onDismiss} className="h-8 w-8 rounded-xl border border-border bg-background/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-1">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Step progress dots + bar */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = i < step;
                const active = i === step;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                      done   ? 'bg-primary/20 text-primary' :
                      active ? 'bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.4)]' :
                               'bg-background/40 text-muted-foreground/40 border border-border'
                    }`}>
                      {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </div>
                    <span className={`text-xs hidden sm:block transition-colors ${active ? 'text-foreground font-medium' : done ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                      {s.label}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div className={`hidden sm:block h-px flex-1 mx-1 min-w-[12px] transition-colors ${done ? 'bg-primary/40' : 'bg-border/50'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {stepContent?.()}

          {/* Inline error */}
          {err && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-border/50 bg-background/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {step > 0 && step < 2 && (
              <Btn onClick={() => { setErr(''); setStep(s => s - 1); }} variant="ghost">
                <ChevronLeft className="h-4 w-4" />Back
              </Btn>
            )}
            {canSkip && !isLastStep && (
              <Btn onClick={handleSkip} variant="ghost" className="text-xs">
                <SkipForward className="h-3.5 w-3.5" />Skip this step
              </Btn>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isLastStep && !launched && (
              <Btn onClick={finishWizard} variant="outline">
                Skip & go to PM
              </Btn>
            )}
            <Btn
              onClick={handleNext}
              disabled={saving || launching}
              className="min-w-[160px]"
            >
              {saving || launching ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Working...</>
              ) : isLastStep && launched ? (
                <>Go to PM Module <ArrowRight className="h-4 w-4" /></>
              ) : isLastStep ? (
                <><Rocket className="h-4 w-4" />Launch Campaign</>
              ) : step === 0 || step === 1 ? (
                <>Continue <ChevronRight className="h-4 w-4" /></>
              ) : (
                <>{nextLabel[step]} <ChevronRight className="h-4 w-4" /></>
              )}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
