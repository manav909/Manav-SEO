import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  Users, Plus, Clock, TrendingUp, Globe,
  CheckCircle, ChevronDown, ChevronUp,
  BarChart3, Zap, DollarSign, ArrowLeft, Trophy
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'clients'|'logs'|'metrics'|'upsells'|'approve'>('clients');
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string|null>(null);

  const [clientForm, setClientForm] = useState({
    name:'', company:'', industry:'', website:'', email:'', retainer_amount:''
  });
  const [projectForm, setProjectForm] = useState({
    name:'', url:'', keywords:'', competitors:''
  });
  const [logForm, setLogForm] = useState({
    hours:'', category:'', title:'', description:'',
    impact_metric:'', impact_value:'',
    logged_at: new Date().toISOString().split('T')[0]
  });
  const [metricsForm, setMetricsForm] = useState({
    llm_visibility_score:'',
    chatgpt_citations:'',
    perplexity_citations:'',
    google_ai_citations:'',
    llm_platforms:'',
    algorithm_health_score:'',
    eeat_score:'',
    content_authority_score:'',
    pages_indexed:'',
    pages_submitted:'',
    brand_mentions:'',
    overall_growth_score:'',
    competitor_rank:'',
    competitors_beaten:'',
    competitor_gap_note:'',
    milestone:'',
    milestone_impact:'',
    recorded_at: new Date().toISOString().split('T')[0]
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

  const createClient = async () => {
    if (!clientForm.name || !clientForm.email) return toast({ title:'Missing fields', variant:'destructive' });
    setLoading(true);
    const { error } = await supabase.from('clients').insert({
      ...clientForm, retainer_amount: parseFloat(clientForm.retainer_amount) || 0
    });
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else { toast({ title:'Client created!' }); setClientForm({ name:'', company:'', industry:'', website:'', email:'', retainer_amount:'' }); fetchAll(); }
    setLoading(false);
  };

  const createProject = async () => {
    if (!selectedClient || !projectForm.name || !projectForm.url) return toast({ title:'Missing fields', variant:'destructive' });
    setLoading(true);
    const { error } = await supabase.from('projects').insert({
      client_id: selectedClient,
      name: projectForm.name,
      url: projectForm.url,
      keywords: projectForm.keywords.split(',').map((k:string) => k.trim()).filter(Boolean),
      competitors: projectForm.competitors.split(',').map((c:string) => c.trim()).filter(Boolean),
    });
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else { toast({ title:'Project created!' }); setProjectForm({ name:'', url:'', keywords:'', competitors:'' }); fetchAll(); }
    setLoading(false);
  };

  const logWork = async () => {
    if (!selectedProject || !logForm.hours || !logForm.title) return toast({ title:'Missing fields', variant:'destructive' });
    setLoading(true);
    const { error } = await supabase.from('work_logs').insert({
      project_id: selectedProject,
      hours: parseFloat(logForm.hours),
      category: logForm.category,
      title: logForm.title,
      description: logForm.description,
      impact_metric: logForm.impact_metric,
      impact_value: logForm.impact_value,
      logged_at: logForm.logged_at
    });
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else {
      toast({ title:'Work logged!' });
      setLogForm({ hours:'', category:'', title:'', description:'', impact_metric:'', impact_value:'', logged_at: new Date().toISOString().split('T')[0] });
    }
    setLoading(false);
  };

  const saveMetrics = async () => {
    if (!selectedProject) return toast({ title:'Select a project', variant:'destructive' });
    setLoading(true);
    const { error } = await supabase.from('metrics').insert({
      project_id: selectedProject,
      llm_visibility_score: parseInt(metricsForm.llm_visibility_score) || 0,
      chatgpt_citations: parseInt(metricsForm.chatgpt_citations) || 0,
      perplexity_citations: parseInt(metricsForm.perplexity_citations) || 0,
      google_ai_citations: parseInt(metricsForm.google_ai_citations) || 0,
      llm_platforms: metricsForm.llm_platforms.split(',').map((s:string) => s.trim()).filter(Boolean),
      algorithm_health_score: parseInt(metricsForm.algorithm_health_score) || 0,
      eeat_score: parseInt(metricsForm.eeat_score) || 0,
      content_authority_score: parseInt(metricsForm.content_authority_score) || 0,
      pages_indexed: parseInt(metricsForm.pages_indexed) || 0,
      pages_submitted: parseInt(metricsForm.pages_submitted) || 0,
      brand_mentions: parseInt(metricsForm.brand_mentions) || 0,
      overall_growth_score: parseInt(metricsForm.overall_growth_score) || 0,
      competitor_rank: parseInt(metricsForm.competitor_rank) || 0,
      competitors_beaten: parseInt(metricsForm.competitors_beaten) || 0,
      competitor_gap_note: metricsForm.competitor_gap_note,
      milestone: metricsForm.milestone,
      milestone_impact: metricsForm.milestone_impact,
      recorded_at: metricsForm.recorded_at
    });
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else {
      toast({ title:'Metrics saved!' });
      setMetricsForm({
        llm_visibility_score:'', chatgpt_citations:'', perplexity_citations:'',
        google_ai_citations:'', llm_platforms:'', algorithm_health_score:'',
        eeat_score:'', content_authority_score:'', pages_indexed:'',
        pages_submitted:'', brand_mentions:'', overall_growth_score:'',
        competitor_rank:'', competitors_beaten:'', competitor_gap_note:'',
        milestone:'', milestone_impact:'',
        recorded_at: new Date().toISOString().split('T')[0]
      });
    }
    setLoading(false);
  };

  const createUpsell = async () => {
    if (!selectedProject || !upsellForm.title || !upsellForm.price) return toast({ title:'Missing fields', variant:'destructive' });
    setLoading(true);
    const { error } = await supabase.from('upsells').insert({
      project_id: selectedProject,
      title: upsellForm.title,
      description: upsellForm.description,
      price: parseFloat(upsellForm.price),
      potential_impact: upsellForm.potential_impact
    });
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else { toast({ title:'Upsell created!' }); setUpsellForm({ title:'', description:'', price:'', potential_impact:'' }); }
    setLoading(false);
  };

  const approveUser = async (userId:string, clientId?:string) => {
    const updates:any = { approved: true };
    if (clientId) updates.client_id = clientId;
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
    if (error) toast({ title:'Error', description: error.message, variant:'destructive' });
    else { toast({ title:'User approved!' }); fetchAll(); }
  };

  const inputClass = "h-10 bg-background/60 border-border text-sm";
  const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider";

  const projectSelector = (
    <div className="space-y-1">
      <Label className={labelClass}>Select Project</Label>
      <select
        value={selectedProject}
        onChange={e => setSelectedProject(e.target.value)}
        className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3"
      >
        <option value="">— Choose project —</option>
        {projects.map(p => {
          const c = clients.find(x => x.id === p.client_id);
          return <option key={p.id} value={p.id}>{c?.name} — {p.name}</option>;
        })}
      </select>
    </div>
  );

  const tabs = [
    { id:'clients', label:'Clients', icon: Users },
    { id:'logs',    label:'Log Work', icon: Clock },
    { id:'metrics', label:'Update Metrics', icon: BarChart3 },
    { id:'upsells', label:'Upsells', icon: Zap },
    { id:'approve', label:`Approvals${pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ''}`, icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav" className="h-8 w-8 rounded-full object-cover ring-2 ring-primary" style={{ objectPosition:'center 20%' }} />
            <div>
              <div className="font-bold text-sm">Admin Panel</div>
              <div className="text-xs text-muted-foreground">SEO Seasons by Manav</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/')} className="border-border text-xs">
            <ArrowLeft className="h-3 w-3 mr-1.5" /> Back to Site
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
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

        {/* CLIENTS */}
        {tab === 'clients' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Register New Client</h2>
              <div className="space-y-3">
                {[
                  { key:'name', label:'Client Name', placeholder:'John Smith' },
                  { key:'company', label:'Company', placeholder:'Acme Corp' },
                  { key:'industry', label:'Industry', placeholder:'E-commerce, SaaS...' },
                  { key:'website', label:'Website', placeholder:'https://example.com' },
                  { key:'email', label:'Email', placeholder:'client@email.com' },
                  { key:'retainer_amount', label:'Monthly Retainer ($)', placeholder:'1500' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className={labelClass}>{label}</Label>
                    <Input placeholder={placeholder} value={(clientForm as any)[key]}
                      onChange={e => setClientForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} />
                  </div>
                ))}
                <Button onClick={createClient} disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" />Create Client
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2"><Globe className="h-4 w-4 text-primary" />Add Project</h2>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className={labelClass}>Select Client</Label>
                  <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
                    className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3">
                    <option value="">— Choose client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.company}</option>)}
                  </select>
                </div>
                {[
                  { key:'name', label:'Project Name', placeholder:'Main Website' },
                  { key:'url', label:'Website URL', placeholder:'https://example.com' },
                  { key:'keywords', label:'Target Keywords (comma separated)', placeholder:'event rental dubai, av equipment' },
                  { key:'competitors', label:'Competitors (comma separated)', placeholder:'competitor1.com, competitor2.com' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className={labelClass}>{label}</Label>
                    <Input placeholder={placeholder} value={(projectForm as any)[key]}
                      onChange={e => setProjectForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} />
                  </div>
                ))}
                <Button onClick={createProject} disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" />Create Project
                </Button>
              </div>
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4">All Clients ({clients.length})</h2>
              <div className="space-y-2">
                {clients.map(client => (
                  <div key={client.id} className="rounded-xl border border-border bg-background/40">
                    <button onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">{client.name[0]}</div>
                        <div>
                          <div className="font-medium text-sm">{client.name}</div>
                          <div className="text-xs text-muted-foreground">{client.company} · ${client.retainer_amount}/mo</div>
                        </div>
                      </div>
                      {expandedClient === client.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {expandedClient === client.id && (
                      <div className="px-4 pb-3 border-t border-border pt-3">
                        <div className="text-xs font-mono text-muted-foreground mb-2">ID: {client.id} · {client.email}</div>
                        {projects.filter(p => p.client_id === client.id).map(p => (
                          <div key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                            <Globe className="h-3 w-3 text-primary" />{p.name} — {p.url}
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

        {/* LOG WORK */}
        {tab === 'logs' && (
          <div className="max-w-xl">
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />Log Work Done</h2>
              <div className="space-y-3">
                {projectSelector}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className={labelClass}>Hours Spent</Label>
                    <Input placeholder="2.5" value={logForm.hours} onChange={e => setLogForm(f => ({ ...f, hours: e.target.value }))} className={inputClass} />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelClass}>Date</Label>
                    <Input type="date" value={logForm.logged_at} onChange={e => setLogForm(f => ({ ...f, logged_at: e.target.value }))} className={inputClass} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className={labelClass}>Category</Label>
                  <select value={logForm.category} onChange={e => setLogForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3">
                    <option value="">— Select —</option>
                    {['LLM Optimization','GEO Strategy','Content Authority','Google Algorithm Alignment','Competitor Analysis','Brand Building','AI Search Visibility','Indexing & Crawl','Schema & Structured Data','Strategy & Consulting'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {[
                  { key:'title', label:'What was done', placeholder:'Published authoritative FAQ content targeting Perplexity AI queries' },
                  { key:'description', label:'Details', placeholder:'Added 12 question-answer pairs targeting high-intent AI search queries...' },
                  { key:'impact_metric', label:'Impact Metric', placeholder:'Perplexity Citations' },
                  { key:'impact_value', label:'Result', placeholder:'Increased from 2 to 8 citations in 7 days' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className={labelClass}>{label}</Label>
                    <Input placeholder={placeholder} value={(logForm as any)[key]}
                      onChange={e => setLogForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} />
                  </div>
                ))}
                <Button onClick={logWork} disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Clock className="h-4 w-4 mr-2" />Log Work Entry
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* METRICS */}
        {tab === 'metrics' && (
          <div className="max-w-2xl">
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-1 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Update Client Metrics</h2>
              <p className="text-xs text-muted-foreground mb-5">All scores are 0–100. Enter what you've verified manually from your tools.</p>
              <div className="space-y-5">
                {projectSelector}

                {/* LLM Visibility */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="text-xs font-mono text-primary uppercase tracking-wider">LLM Visibility</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key:'llm_visibility_score', label:'Overall LLM Score (0-100)', placeholder:'72' },
                      { key:'chatgpt_citations', label:'ChatGPT Citations (count)', placeholder:'5' },
                      { key:'perplexity_citations', label:'Perplexity Citations (count)', placeholder:'8' },
                      { key:'google_ai_citations', label:'Google AI Overview Citations', placeholder:'3' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key} className="space-y-1">
                        <Label className={labelClass}>{label}</Label>
                        <Input placeholder={placeholder} value={(metricsForm as any)[key]}
                          onChange={e => setMetricsForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label className={labelClass}>LLM Platforms Where Visible (comma separated)</Label>
                    <Input placeholder="ChatGPT, Perplexity, Google AI Overviews, Copilot"
                      value={metricsForm.llm_platforms}
                      onChange={e => setMetricsForm(f => ({ ...f, llm_platforms: e.target.value }))} className={inputClass} />
                  </div>
                </div>

                {/* Google Health */}
                <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
                  <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Google Algorithm Health</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key:'algorithm_health_score', label:'Algorithm Compliance (0-100)', placeholder:'85' },
                      { key:'eeat_score', label:'E-E-A-T Score (0-100)', placeholder:'78' },
                      { key:'content_authority_score', label:'Content Authority (0-100)', placeholder:'70' },
                      { key:'pages_indexed', label:'Pages Currently Indexed', placeholder:'48' },
                      { key:'pages_submitted', label:'Total Pages Submitted', placeholder:'52' },
                      { key:'brand_mentions', label:'Brand Mentions This Period', placeholder:'24' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key} className="space-y-1">
                        <Label className={labelClass}>{label}</Label>
                        <Input placeholder={placeholder} value={(metricsForm as any)[key]}
                          onChange={e => setMetricsForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Competitive Position */}
                <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
                  <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Competitive Position</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key:'competitor_rank', label:'Current Market Rank (#)', placeholder:'3' },
                      { key:'competitors_beaten', label:'Competitors Now Behind You', placeholder:'2' },
                      { key:'overall_growth_score', label:'Overall Growth Score (0-100)', placeholder:'68' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key} className="space-y-1">
                        <Label className={labelClass}>{label}</Label>
                        <Input placeholder={placeholder} value={(metricsForm as any)[key]}
                          onChange={e => setMetricsForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label className={labelClass}>Competitive Insight (shown to client)</Label>
                    <Input placeholder="Now outranking TechRivals.com for 3 target keywords"
                      value={metricsForm.competitor_gap_note}
                      onChange={e => setMetricsForm(f => ({ ...f, competitor_gap_note: e.target.value }))} className={inputClass} />
                  </div>
                </div>

                {/* Win of the Period */}
                <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4 space-y-3">
                  <div className="text-xs font-mono text-green-400 uppercase tracking-wider">Big Win This Period</div>
                  {[
                    { key:'milestone', label:'Headline Win', placeholder:'Featured in Google AI Overviews for "event rental Dubai"' },
                    { key:'milestone_impact', label:'Why It Matters', placeholder:'This means your brand is recommended by AI to thousands of buyers without them clicking a single ad.' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1">
                      <Label className={labelClass}>{label}</Label>
                      <Input placeholder={placeholder} value={(metricsForm as any)[key]}
                        onChange={e => setMetricsForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label className={labelClass}>Report Date</Label>
                    <Input type="date" value={metricsForm.recorded_at}
                      onChange={e => setMetricsForm(f => ({ ...f, recorded_at: e.target.value }))} className={inputClass} />
                  </div>
                </div>

                <Button onClick={saveMetrics} disabled={loading} className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                  <TrendingUp className="h-4 w-4 mr-2" />Save to Client Dashboard
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* UPSELLS */}
        {tab === 'upsells' && (
          <div className="max-w-lg">
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />Create Upsell Offer</h2>
              <div className="space-y-3">
                {projectSelector}
                {[
                  { key:'title', label:'Offer Title', placeholder:'AI Search Domination Package' },
                  { key:'description', label:'Description', placeholder:'You are visible in 3 AI platforms. With this package we target 8 more...' },
                  { key:'price', label:'Price ($)', placeholder:'499' },
                  { key:'potential_impact', label:'What Client Gains', placeholder:'Featured in ChatGPT answers for 50+ buyer queries' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className={labelClass}>{label}</Label>
                    <Input placeholder={placeholder} value={(upsellForm as any)[key]}
                      onChange={e => setUpsellForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} />
                  </div>
                ))}
                <Button onClick={createUpsell} disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <DollarSign className="h-4 w-4 mr-2" />Create Upsell
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* APPROVALS */}
        {tab === 'approve' && (
          <div className="max-w-2xl">
            <h2 className="font-bold text-base mb-4 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />Pending Approvals ({pendingUsers.length})
            </h2>
            {pendingUsers.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card/60 p-8 text-center text-muted-foreground">No pending requests</div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map(user => (
                  <div key={user.id} className="rounded-2xl border border-border bg-card/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{user.email}</div>
                        <div className="text-xs text-muted-foreground mb-3">{user.phone || 'No phone'} · {new Date(user.created_at).toLocaleDateString()}</div>
                        <div className="space-y-1">
                          <Label className={labelClass}>Link to Client</Label>
                          <select id={`client-select-${user.id}`}
                            className="w-full h-8 rounded-md border border-border bg-background/60 text-xs px-2">
                            <option value="">— No client yet —</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.company}</option>)}
                          </select>
                        </div>
                      </div>
                      <Button size="sm"
                        onClick={() => {
                          const sel = document.getElementById(`client-select-${user.id}`) as HTMLSelectElement;
                          approveUser(user.id, sel?.value || undefined);
                        }}
                        className="bg-green-500 hover:bg-green-600 text-white shrink-0">
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
