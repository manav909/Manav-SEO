import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  Users, Plus, Globe, CheckCircle,
  ChevronDown, ChevronUp, Zap, DollarSign,
  ArrowLeft, Sparkles, Save, RefreshCw, AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const emptyMetricsForm = {
  llm_visibility_score:'', chatgpt_citations:'', perplexity_citations:'',
  google_ai_citations:'', llm_platforms:'', algorithm_health_score:'',
  eeat_score:'', content_authority_score:'', pages_indexed:'',
  pages_submitted:'', brand_mentions:'', overall_growth_score:'',
  competitor_rank:'', competitors_beaten:'', competitor_gap_note:'',
  milestone:'', milestone_impact:'',
  recorded_at: new Date().toISOString().split('T')[0],
};

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'clients'|'metrics'|'upsells'|'approve'>('clients');
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingAI, setFetchingAI] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string|null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [metricsForm, setMetricsForm] = useState<any>(emptyMetricsForm);
  const [clientForm, setClientForm] = useState({
    name:'', company:'', industry:'', website:'', email:'', retainer_amount:''
  });
  const [projectForm, setProjectForm] = useState({
    name:'', url:'', keywords:'', competitors:''
  });
  const [upsellForm, setUpsellForm] = useState({
    title:'', description:'', price:'', potential_impact:''
  });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const { data: c } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    const { data: p } = await supabase.from('projects').select('*');
    const { data: u } = await supabase.from('profiles').select('*').eq('approved', false);
    setClients(c || []);
    setProjects(p || []);
    setPendingUsers(u || []);
  };

  /* ── Populate form from AI result ── */
  const populateForm = (a: any) => {
    setMetricsForm({
      llm_visibility_score:    a.llm_visibility_score?.toString()    || '',
      chatgpt_citations:       a.chatgpt_citations?.toString()       || '',
      perplexity_citations:    a.perplexity_citations?.toString()    || '',
      google_ai_citations:     a.google_ai_citations?.toString()     || '',
      llm_platforms:           Array.isArray(a.llm_platforms)
                                 ? a.llm_platforms.join(', ')
                                 : (a.llm_platforms || ''),
      algorithm_health_score:  a.algorithm_health_score?.toString()  || '',
      eeat_score:              a.eeat_score?.toString()              || '',
      content_authority_score: a.content_authority_score?.toString() || '',
      pages_indexed:           a.pages_indexed?.toString()           || '',
      pages_submitted:         a.pages_submitted?.toString()         || '',
      brand_mentions:          a.brand_mentions?.toString()          || '',
      overall_growth_score:    a.overall_growth_score?.toString()    || '',
      competitor_rank:         a.competitor_rank?.toString()         || '',
      competitors_beaten:      a.competitors_beaten?.toString()      || '',
      competitor_gap_note:     a.competitor_gap_note                 || '',
      milestone:               a.milestone                           || '',
      milestone_impact:        a.milestone_impact                    || '',
      recorded_at:             new Date().toISOString().split('T')[0],
    });
  };

  /* ── Select project + auto-load saved analysis ── */
  const handleSelectProject = (projId: string) => {
    setSelectedProject(projId);
    setAiResult(null);
    if (!projId) { setMetricsForm(emptyMetricsForm); return; }
    const proj = projects.find(p => p.id === projId);
    if (proj?.last_analysis) {
      setAiResult(proj.last_analysis);
      populateForm(proj.last_analysis.analysis);
    } else {
      setMetricsForm(emptyMetricsForm);
    }
  };

  /* ── Run AI analysis ── */
  const runAIAnalysis = async () => {
    const proj = projects.find(p => p.id === selectedProject);
    if (!proj) return toast({ title:'Select a project first', variant:'destructive' });
    setFetchingAI(true);
    setAiResult(null);
    try {
      const res = await fetch('/api/auto-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: proj.url,
          competitors: proj.competitors || [],
          keywords: proj.keywords || [],
          brand_name: clients.find(c => c.id === proj.client_id)?.company || '',
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Analysis failed');

      /* Save permanently to the project */
      await supabase.from('projects').update({
        last_analysis: data,
        last_analysis_at: new Date().toISOString(),
      }).eq('id', selectedProject);

      fetchAll();
      setAiResult(data);
      populateForm(data.analysis);
      toast({ title:'Analysis complete!', description:'Saved to project. Review fields then save to dashboard.' });
    } catch (err: any) {
      toast({ title:'Analysis failed', description: err.message, variant:'destructive' });
    }
    setFetchingAI(false);
  };

  /* ── Save metrics to dashboard ── */
 const saveMetrics = async () => {
    if (!selectedProject) return toast({ title:'Select a project', variant:'destructive' });
    setLoading(true);
    const { error } = await supabase.from('metrics').insert({
      project_id:              selectedProject,
      llm_visibility_score:    parseInt(metricsForm.llm_visibility_score)    || 0,
      chatgpt_citations:       parseInt(metricsForm.chatgpt_citations)       || 0,
      perplexity_citations:    parseInt(metricsForm.perplexity_citations)    || 0,
      google_ai_citations:     parseInt(metricsForm.google_ai_citations)     || 0,
      llm_platforms:           typeof metricsForm.llm_platforms === 'string'
                                 ? metricsForm.llm_platforms.split(',').map((s:string) => s.trim()).filter(Boolean)
                                 : metricsForm.llm_platforms,
      algorithm_health_score:  parseInt(metricsForm.algorithm_health_score)  || 0,
      eeat_score:              parseInt(metricsForm.eeat_score)              || 0,
      content_authority_score: parseInt(metricsForm.content_authority_score) || 0,
      pages_indexed:           parseInt(metricsForm.pages_indexed)           || 0,
      pages_submitted:         parseInt(metricsForm.pages_submitted)         || 0,
      brand_mentions:          parseInt(metricsForm.brand_mentions)          || 0,
      overall_growth_score:    parseInt(metricsForm.overall_growth_score)    || 0,
      competitor_rank:         parseInt(metricsForm.competitor_rank)         || 0,
      competitors_beaten:      parseInt(metricsForm.competitors_beaten)      || 0,
      competitor_gap_note:     metricsForm.competitor_gap_note,
      milestone:               metricsForm.milestone,
      milestone_impact:        metricsForm.milestone_impact,
      recorded_at:             metricsForm.recorded_at,
      keyword_rankings:        aiResult?.analysis?.keyword_rankings || [],
      data_sources:            aiResult?.analysis?.data_sources     || {},
    });
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else toast({ title:'Saved to client dashboard!' });
    setLoading(false);
  };

  /* ── Create client ── */
  const createClient = async () => {
    if (!clientForm.name || !clientForm.email) return toast({ title:'Missing fields', variant:'destructive' });
    setLoading(true);
    const { error } = await supabase.from('clients').insert({
      ...clientForm, retainer_amount: parseFloat(clientForm.retainer_amount) || 0
    });
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else {
      toast({ title:'Client created!' });
      setClientForm({ name:'', company:'', industry:'', website:'', email:'', retainer_amount:'' });
      fetchAll();
    }
    setLoading(false);
  };

  /* ── Create project ── */
  const createProject = async () => {
    if (!selectedClient || !projectForm.name || !projectForm.url) return toast({ title:'Missing fields', variant:'destructive' });
    setLoading(true);
    const { error } = await supabase.from('projects').insert({
      client_id:   selectedClient,
      name:        projectForm.name,
      url:         projectForm.url,
      keywords:    projectForm.keywords.split(',').map((k:string) => k.trim()).filter(Boolean),
      competitors: projectForm.competitors.split(',').map((c:string) => c.trim()).filter(Boolean),
    });
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else {
      toast({ title:'Project created!' });
      setProjectForm({ name:'', url:'', keywords:'', competitors:'' });
      fetchAll();
    }
    setLoading(false);
  };

  /* ── Create upsell ── */
  const createUpsell = async () => {
    if (!selectedProject || !upsellForm.title || !upsellForm.price) return toast({ title:'Missing fields', variant:'destructive' });
    setLoading(true);
    const { error } = await supabase.from('upsells').insert({
      project_id: selectedProject,
      ...upsellForm,
      price: parseFloat(upsellForm.price),
    });
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else {
      toast({ title:'Upsell created!' });
      setUpsellForm({ title:'', description:'', price:'', potential_impact:'' });
    }
    setLoading(false);
  };

  /* ── Approve user ── */
  const approveUser = async (userId: string, clientIds: string[]) => {
    const primaryClientId = clientIds[0] || undefined;
    const updates: any = { approved: true, client_ids: clientIds.filter(Boolean) };
    if (primaryClientId) updates.client_id = primaryClientId;
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else { toast({ title:'User approved!' }); fetchAll(); }
  };

  /* ── Last analysis info for selected project ── */
  const lastAnalysisInfo = () => {
    if (!selectedProject) return null;
    const proj = projects.find(p => p.id === selectedProject);
    if (!proj?.last_analysis_at) return null;
    const ago = Math.round((Date.now() - new Date(proj.last_analysis_at).getTime()) / (1000 * 60 * 60));
    const timeStr = ago < 1 ? 'just now' : ago < 24 ? `${ago}h ago` : `${Math.round(ago/24)}d ago`;
    return {
      dateStr: new Date(proj.last_analysis_at).toLocaleDateString('en-GB', {
        day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
      }),
      timeStr,
    };
  };

  const inputClass   = "h-10 bg-background/60 border-border text-sm";
  const labelClass   = "text-xs font-medium text-muted-foreground uppercase tracking-wider";
  const lastAnalysis = lastAnalysisInfo();

  /* ── Shared project selector ── */
  const ProjectSelector = () => (
    <div className="space-y-1">
      <Label className={labelClass}>Select Project</Label>
      <select
        value={selectedProject}
        onChange={e => handleSelectProject(e.target.value)}
        className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3"
      >
        <option value="">— Choose project —</option>
        {clients.map(c => {
          const cProjects = projects.filter(p => p.client_id === c.id);
          if (!cProjects.length) return null;
          return (
            <optgroup key={c.id} label={`${c.name} — ${c.company}`}>
              {cProjects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.url}){p.last_analysis_at ? ' ✓' : ''}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );

  const tabs = [
    { id:'clients', label:'Clients',      icon: Users },
    { id:'metrics', label:'Run Analysis', icon: Sparkles },
    { id:'upsells', label:'Upsells',      icon: Zap },
    { id:'approve', label:`Approvals${pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ''}`, icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Header */}
      <div className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav"
              className="h-8 w-8 rounded-full object-cover ring-2 ring-primary"
              style={{ objectPosition:'center 20%' }} />
            <div>
              <div className="font-bold text-sm">Admin Panel</div>
              <div className="text-xs text-muted-foreground">SEO Seasons by Manav</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/')} className="border-border text-xs">
            <ArrowLeft className="h-3 w-3 mr-1.5" />Back to Site
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {tabs.map(({ id, label, icon:Icon }) => (
            <button key={id} onClick={() => setTab(id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                tab === id
                  ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)]'
                  : 'border-border bg-card/60 text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════
            CLIENTS TAB
        ══════════════════════════════ */}
        {tab === 'clients' && (
          <div className="grid lg:grid-cols-2 gap-6">

            {/* Register client */}
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />Register New Client
              </h2>
              <div className="space-y-3">
                {[
                  { key:'name',            label:'Client Name',          placeholder:'John Smith' },
                  { key:'company',         label:'Company',              placeholder:'Acme Corp' },
                  { key:'industry',        label:'Industry',             placeholder:'E-commerce, SaaS...' },
                  { key:'website',         label:'Website',              placeholder:'https://example.com' },
                  { key:'email',           label:'Email',                placeholder:'client@email.com' },
                  { key:'retainer_amount', label:'Monthly Retainer ($)', placeholder:'1500' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className={labelClass}>{label}</Label>
                    <Input
                      placeholder={placeholder}
                      value={(clientForm as any)[key]}
                      onChange={e => setClientForm(f => ({ ...f, [key]: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                ))}
                <Button onClick={createClient} disabled={loading}
                  className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" />Create Client
                </Button>
              </div>
            </div>

            {/* Add project */}
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />Add Project to Client
              </h2>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className={labelClass}>Select Client</Label>
                  <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
                    className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3">
                    <option value="">— Choose client —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} — {c.company}</option>
                    ))}
                  </select>
                </div>
                {[
                  { key:'name',        label:'Project Name',                      placeholder:'Main Website' },
                  { key:'url',         label:'Website URL',                       placeholder:'https://example.com' },
                  { key:'keywords',    label:'Target Keywords (comma separated)',  placeholder:'event rental dubai, av equipment' },
                  { key:'competitors', label:'Competitor URLs (comma separated)',  placeholder:'competitor1.com, competitor2.com' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className={labelClass}>{label}</Label>
                    <Input
                      placeholder={placeholder}
                      value={(projectForm as any)[key]}
                      onChange={e => setProjectForm(f => ({ ...f, [key]: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                ))}
                <Button onClick={createProject} disabled={loading}
                  className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" />Create Project
                </Button>
              </div>
            </div>

            {/* Client list */}
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4">All Clients ({clients.length})</h2>
              <div className="space-y-2">
                {clients.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No clients yet.</p>
                )}
                {clients.map(client => (
                  <div key={client.id} className="rounded-xl border border-border bg-background/40">
                    <button
                      onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                          {client.name[0]}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{client.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {client.company} · ${client.retainer_amount}/mo · {client.email}
                          </div>
                        </div>
                      </div>
                      {expandedClient === client.id
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {expandedClient === client.id && (
                      <div className="px-4 pb-3 border-t border-border pt-3">
                        <div className="text-xs font-mono text-muted-foreground mb-2">ID: {client.id}</div>
                        {projects.filter(p => p.client_id === client.id).length === 0 && (
                          <div className="text-xs text-muted-foreground italic">No projects yet</div>
                        )}
                        {projects.filter(p => p.client_id === client.id).map(p => (
                          <div key={p.id} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Globe className="h-3 w-3 text-primary" />
                              {p.name} — {p.url}
                            </div>
                            {p.last_analysis_at && (
                              <span className="text-xs text-green-400 font-mono">
                                ✓ analysed {Math.round((Date.now() - new Date(p.last_analysis_at).getTime()) / (1000*60*60*24))}d ago
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            METRICS / AI ANALYSIS TAB
        ══════════════════════════════ */}
        {tab === 'metrics' && (
          <div className="max-w-3xl space-y-5">

            {/* Step 1: Select project */}
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-1 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />AI Website Analysis
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Select a project to load its last analysis instantly.
                Run a new analysis anytime to refresh the data.
                Projects with ✓ already have a saved analysis.
              </p>
              <div className="space-y-3">
                <ProjectSelector />

                {/* Last analysis info */}
                {lastAnalysis && (
                  <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-mono text-green-400 uppercase tracking-wider">Last Analysis — Auto Loaded</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {lastAnalysis.dateStr} · {lastAnalysis.timeStr}
                      </div>
                    </div>
                    <div className="text-xs text-green-400 font-mono bg-green-400/10 px-2 py-1 rounded-full">✓ Saved</div>
                  </div>
                )}

                {!lastAnalysis && selectedProject && (
                  <div className="rounded-xl border border-border bg-background/40 p-3 text-xs text-muted-foreground">
                    No analysis saved for this project yet. Run one below.
                  </div>
                )}

                {/* Run button */}
                <Button
                  onClick={runAIAnalysis}
                  disabled={fetchingAI || !selectedProject}
                  className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold"
                >
                  {fetchingAI ? (
                    <span className="flex items-center gap-3">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Crawling website and competitors...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {lastAnalysis ? 'Re-run Fresh Analysis' : 'Run AI Analysis'}
                    </span>
                  )}
                </Button>

                {fetchingAI && (
                  <div className="text-xs text-center text-muted-foreground font-mono animate-pulse">
                    Fetching real data · Crawling competitors · Checking LLM visibility · Scoring...
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: AI result preview + edit form */}
            {aiResult && (
              <div className="space-y-4">

                {/* Warning */}
                <div className="rounded-xl border border-orange-400/30 bg-orange-400/5 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-orange-400 mb-1">Review Before Saving to Dashboard</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <span className="text-green-400 font-semibold">Green fields</span> (0–100 scores) are reliable — based on real content analysis.
                        <span className="text-orange-400 font-semibold ml-2">Orange fields</span> (citation counts, pages, rank) are AI estimates — verify in Google Search Console or Ahrefs before saving.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Preview card */}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="font-semibold text-sm">Analysis Preview</span>
                    {aiResult.fetched_at && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(aiResult.fetched_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Story */}
                  {aiResult.analysis?.story && (
                    <div className="rounded-xl border border-border bg-background/60 p-4">
                      <div className="text-xs font-mono text-primary uppercase tracking-wider mb-2">Website Story</div>
                      <p className="text-sm leading-relaxed">{aiResult.analysis.story}</p>
                    </div>
                  )}

                  {/* Score overview */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {[
                      { label:'LLM Score',     value: aiResult.analysis?.llm_visibility_score },
                      { label:'Google Health', value: aiResult.analysis?.algorithm_health_score },
                      { label:'E-E-A-T',       value: aiResult.analysis?.eeat_score },
                      { label:'Authority',     value: aiResult.analysis?.content_authority_score },
                      { label:'Growth',        value: aiResult.analysis?.overall_growth_score },
                    ].map(({ label, value }) => {
                      const color = !value ? 'text-muted-foreground'
                        : value >= 70 ? 'text-green-400'
                        : value >= 40 ? 'text-yellow-400'
                        : 'text-orange-400';
                      return (
                        <div key={label} className="rounded-xl border border-border bg-background/40 p-3 text-center">
                          <div className={`text-xl font-bold ${color}`}>{value ?? '—'}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Big win */}
                  {aiResult.analysis?.milestone && (
                    <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-4">
                      <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-1">Big Win Found</div>
                      <div className="font-semibold text-sm">{aiResult.analysis.milestone}</div>
                      {aiResult.analysis.milestone_impact && (
                        <p className="text-xs text-muted-foreground mt-1">{aiResult.analysis.milestone_impact}</p>
                      )}
                    </div>
                  )}

                  {/* Strengths + Opportunities */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    {aiResult.analysis?.verified_strengths?.length > 0 && (
                      <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-3">
                        <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-2">Verified Strengths</div>
                        {aiResult.analysis.verified_strengths.map((s:string, i:number) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground py-0.5">
                            <span className="text-green-400 shrink-0">✓</span>{s}
                          </div>
                        ))}
                      </div>
                    )}
                    {(aiResult.analysis?.growth_opportunities || aiResult.analysis?.verified_gaps || []).length > 0 && (
                      <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3">
                        <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-2">Growth Opportunities</div>
                        {(aiResult.analysis?.growth_opportunities || aiResult.analysis?.verified_gaps || []).map((g:string, i:number) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground py-0.5">
                            <span className="text-yellow-400 shrink-0">→</span>{g}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Competitive note */}
                  {aiResult.analysis?.competitor_gap_note && (
                    <div className="rounded-xl border border-border bg-background/40 p-3">
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Competitive Position</div>
                      <p className="text-sm">{aiResult.analysis.competitor_gap_note}</p>
                    </div>
                  )}
                </div>

                {/* Edit + Save form */}
                <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-5">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Save className="h-4 w-4 text-primary" />
                    Review Fields and Save to Dashboard
                  </h3>

                  {/* Reliable scores (green) */}
                  <div>
                    <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-400 inline-block" />
                      Reliable — based on real content analysis
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key:'llm_visibility_score',    label:'LLM Visibility Score' },
                        { key:'algorithm_health_score',  label:'Google Health Score' },
                        { key:'eeat_score',              label:'E-E-A-T Score' },
                        { key:'content_authority_score', label:'Content Authority' },
                        { key:'overall_growth_score',    label:'Overall Growth Score' },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs font-medium text-green-400/80 uppercase tracking-wider">{label}</Label>
                          <Input
                            value={metricsForm[key]}
                            onChange={e => setMetricsForm((f:any) => ({ ...f, [key]: e.target.value }))}
                            className="h-10 bg-background/60 border-green-400/25 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                {/* Verified real data */}
                  <div>
                    <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-cyan-400 inline-block" />
                      Verified Data — fetched live from real sources
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key:'pages_indexed',        label:'Pages Indexed (Google site: search)' },
                        { key:'pages_submitted',      label:'Pages Submitted (sitemap.xml)' },
                        { key:'brand_mentions',       label:'Brand Mentions (Google search count)' },
                        { key:'perplexity_citations', label:'Perplexity Appearances (live test)' },
                        { key:'google_ai_citations',  label:'Google AI Overview (live test)' },
                        { key:'chatgpt_citations',    label:'ChatGPT Citations (AI estimate)' },
                        { key:'competitor_rank',      label:'Content Quality Rank (#)' },
                        { key:'competitors_beaten',   label:'Competitors Outperformed' },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs font-medium text-cyan-400/80 uppercase tracking-wider">{label}</Label>
                          <Input
                            value={metricsForm[key]}
                            onChange={e => setMetricsForm((f:any) => ({ ...f, [key]: e.target.value }))}
                            className="h-10 bg-background/60 border-cyan-400/25 text-sm"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Keyword Rankings preview */}
                    {aiResult?.analysis?.keyword_rankings?.length > 0 && (
                      <div className="mt-4 rounded-xl border border-border bg-background/40 p-4">
                        <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-3">
                          Keyword Rankings — Live Google SERP Results
                        </div>
                        <div className="space-y-2">
                          {aiResult.analysis.keyword_rankings.map((k: any, i: number) => {
                            const color = !k.found ? 'text-orange-400'
                              : k.page === 1 ? 'text-green-400'
                              : k.page === 2 ? 'text-yellow-400'
                              : 'text-orange-400';
                            const bg = !k.found ? 'bg-orange-400/5 border-orange-400/20'
                              : k.page === 1 ? 'bg-green-400/5 border-green-400/20'
                              : k.page === 2 ? 'bg-yellow-400/5 border-yellow-400/20'
                              : 'bg-orange-400/5 border-orange-400/20';
                            return (
                              <div key={i} className={`rounded-lg border ${bg} px-3 py-2 flex items-center justify-between`}>
                                <div>
                                  <div className="text-xs font-semibold text-foreground">"{k.keyword}"</div>
                                  {k.snippet && <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{k.snippet}</div>}
                                </div>
                                <div className={`text-xs font-mono font-bold ${color} shrink-0 ml-2`}>
                                  {k.positionLabel}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          Source: Live Google SERP · These rankings will be shown on the client dashboard
                        </div>
                      </div>
                    )}
                  </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key:'pages_indexed',        label:'Pages Indexed' },
                        { key:'pages_submitted',      label:'Pages Submitted' },
                        { key:'chatgpt_citations',    label:'ChatGPT Citations' },
                        { key:'perplexity_citations', label:'Perplexity Citations' },
                        { key:'google_ai_citations',  label:'Google AI Citations' },
                        { key:'brand_mentions',       label:'Brand Mentions' },
                        { key:'competitor_rank',      label:'Market Rank (#)' },
                        { key:'competitors_beaten',   label:'Competitors Beaten' },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs font-medium text-orange-400/80 uppercase tracking-wider">{label}</Label>
                          <Input
                            value={metricsForm[key]}
                            onChange={e => setMetricsForm((f:any) => ({ ...f, [key]: e.target.value }))}
                            className="h-10 bg-background/60 border-orange-400/25 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Text fields */}
                  <div className="space-y-3">
                    {[
                      { key:'llm_platforms',       label:'LLM Platforms (comma separated)',    placeholder:'ChatGPT, Perplexity, Google AI Overviews' },
                      { key:'competitor_gap_note', label:'Competitive Insight (shown to client)', placeholder:'Now outranking competitor.com for 3 target keywords' },
                      { key:'milestone',           label:'Big Win Headline',                    placeholder:'Featured in Google AI Overviews for main keyword' },
                      { key:'milestone_impact',    label:'Why It Matters',                      placeholder:'This means buyers find your brand through AI without clicking ads' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key} className="space-y-1">
                        <Label className={labelClass}>{label}</Label>
                        <Input
                          placeholder={placeholder}
                          value={metricsForm[key]}
                          onChange={e => setMetricsForm((f:any) => ({ ...f, [key]: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    ))}

                    <div className="space-y-1">
                      <Label className={labelClass}>Report Date</Label>
                      <Input
                        type="date"
                        value={metricsForm.recorded_at}
                        onChange={e => setMetricsForm((f:any) => ({ ...f, recorded_at: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <Button onClick={saveMetrics} disabled={loading}
                    className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? 'Saving...' : 'Save to Client Dashboard'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            UPSELLS TAB
        ══════════════════════════════ */}
        {tab === 'upsells' && (
          <div className="max-w-lg">
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />Create Upsell Offer
              </h2>
              <div className="space-y-3">
                <ProjectSelector />
                {[
                  { key:'title',            label:'Offer Title',       placeholder:'AI Search Domination Package' },
                  { key:'description',      label:'Description',       placeholder:'You are visible in 3 AI platforms. With this package we target 8 more...' },
                  { key:'price',            label:'Price ($)',          placeholder:'499' },
                  { key:'potential_impact', label:'What Client Gains',  placeholder:'Featured in ChatGPT answers for 50+ buyer queries' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className={labelClass}>{label}</Label>
                    <Input
                      placeholder={placeholder}
                      value={(upsellForm as any)[key]}
                      onChange={e => setUpsellForm(f => ({ ...f, [key]: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                ))}
                <Button onClick={createUpsell} disabled={loading}
                  className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <DollarSign className="h-4 w-4 mr-2" />Create Upsell
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            APPROVALS TAB
        ══════════════════════════════ */}
        {tab === 'approve' && (
          <div className="max-w-2xl">
            <h2 className="font-bold text-base mb-4 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              Pending Approvals ({pendingUsers.length})
            </h2>
            {pendingUsers.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card/60 p-8 text-center text-muted-foreground">
                No pending requests 🎉
              </div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map(user => (
                  <div key={user.id} className="rounded-2xl border border-border bg-card/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{user.email}</div>
                        <div className="text-xs text-muted-foreground mb-3">
                          {user.phone || 'No phone'} · {new Date(user.created_at).toLocaleDateString()}
                        </div>
                        <div className="space-y-1">
                          <Label className={labelClass}>
                            Link to Client(s) — hold Ctrl/Cmd to select multiple
                          </Label>
                          <select
                            id={`cs-${user.id}`}
                            multiple
                            size={Math.min(clients.length + 1, 5)}
                            className="w-full rounded-md border border-border bg-background/60 text-xs px-2 py-1"
                          >
                            {clients.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} — {c.company}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          const sel = document.getElementById(`cs-${user.id}`) as HTMLSelectElement;
                          const selected = Array.from(sel?.selectedOptions || []).map(o => o.value);
                          approveUser(user.id, selected);
                        }}
                        className="bg-green-500 hover:bg-green-600 text-white shrink-0 mt-6"
                      >
                        <CheckCircle className="h-3 w-3 mr-1.5" />Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
