import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  Users, Plus, Clock, TrendingUp, Globe,
  CheckCircle, Trash2, ChevronDown, ChevronUp,
  BarChart3, Zap, DollarSign, ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const [fetchedMetrics, setFetchedMetrics] = useState<any>(null);
  const navigate = useNavigate();
  const [tab, setTab] = useState<'clients' | 'logs' | 'upsells' | 'approve'>('clients');
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  // New client form
  const [clientForm, setClientForm] = useState({
    name: '', company: '', industry: '', website: '', email: '', retainer_amount: ''
  });

  // New project form
  const [projectForm, setProjectForm] = useState({
    name: '', url: '', keywords: '', competitors: ''
  });

  // Work log form
  const [logForm, setLogForm] = useState({
    hours: '', category: '', title: '', description: '', impact_metric: '', impact_value: '', logged_at: new Date().toISOString().split('T')[0]
  });

  // Metrics form
  const [metricsForm, setMetricsForm] = useState({
    organic_traffic: '', domain_rating: '', backlinks: '', ai_citations: '', conversions: '', revenue_impact: '', recorded_at: new Date().toISOString().split('T')[0]
  });

  // Upsell form
  const [upsellForm, setUpsellForm] = useState({
    title: '', description: '', price: '', potential_impact: ''
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
    if (!clientForm.name || !clientForm.email) return toast({ title: 'Missing fields', variant: 'destructive' });
    setLoading(true);
    const { error } = await supabase.from('clients').insert({
      ...clientForm,
      retainer_amount: parseFloat(clientForm.retainer_amount) || 0
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else { toast({ title: '✅ Client created!' }); setClientForm({ name: '', company: '', industry: '', website: '', email: '', retainer_amount: '' }); fetchAll(); }
    setLoading(false);
  };

  const createProject = async () => {
    if (!selectedClient || !projectForm.name || !projectForm.url) return toast({ title: 'Missing fields', variant: 'destructive' });
    setLoading(true);
    const { error } = await supabase.from('projects').insert({
      client_id: selectedClient,
      name: projectForm.name,
      url: projectForm.url,
      keywords: projectForm.keywords.split(',').map(k => k.trim()).filter(Boolean),
      competitors: projectForm.competitors.split(',').map(c => c.trim()).filter(Boolean),
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else { toast({ title: '✅ Project created!' }); setProjectForm({ name: '', url: '', keywords: '', competitors: '' }); fetchAll(); }
    setLoading(false);
  };

  const logWork = async () => {
    if (!selectedProject || !logForm.hours || !logForm.title) return toast({ title: 'Missing fields', variant: 'destructive' });
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
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else { toast({ title: '✅ Work logged!' }); setLogForm({ hours: '', category: '', title: '', description: '', impact_metric: '', impact_value: '', logged_at: new Date().toISOString().split('T')[0] }); }
    setLoading(false);
  };

  const saveMetrics = async () => {
    if (!selectedProject) return toast({ title: 'Select a project first', variant: 'destructive' });
    setLoading(true);
    const { error } = await supabase.from('metrics').insert({
      project_id: selectedProject,
      organic_traffic: parseInt(metricsForm.organic_traffic) || 0,
      domain_rating: parseFloat(metricsForm.domain_rating) || 0,
      backlinks: parseInt(metricsForm.backlinks) || 0,
      ai_citations: parseInt(metricsForm.ai_citations) || 0,
      conversions: parseInt(metricsForm.conversions) || 0,
      revenue_impact: parseFloat(metricsForm.revenue_impact) || 0,
      recorded_at: metricsForm.recorded_at
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else { toast({ title: '✅ Metrics saved!' }); setMetricsForm({ organic_traffic: '', domain_rating: '', backlinks: '', ai_citations: '', conversions: '', revenue_impact: '', recorded_at: new Date().toISOString().split('T')[0] }); }
    setLoading(false);
  };

  const createUpsell = async () => {
    if (!selectedProject || !upsellForm.title || !upsellForm.price) return toast({ title: 'Missing fields', variant: 'destructive' });
    setLoading(true);
    const { error } = await supabase.from('upsells').insert({
      project_id: selectedProject,
      title: upsellForm.title,
      description: upsellForm.description,
      price: parseFloat(upsellForm.price),
      potential_impact: upsellForm.potential_impact
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else { toast({ title: '✅ Upsell created!' }); setUpsellForm({ title: '', description: '', price: '', potential_impact: '' }); }
    setLoading(false);
  };

  const approveUser = async (userId: string, clientId?: string) => {
    const updates: any = { approved: true };
    if (clientId) updates.client_id = clientId;
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: '✅ User approved!' }); fetchAll(); }
  };

  const tabs = [
    { id: 'clients', label: 'Clients & Projects', icon: Users },
    { id: 'logs', label: 'Log Work', icon: Clock },
    { id: 'upsells', label: 'Upsells', icon: Zap },
    { id: 'approve', label: `Approvals ${pendingUsers.length > 0 ? `(${pendingUsers.length})` : ''}`, icon: CheckCircle },
  ];

  const inputClass = "h-10 bg-background/60 border-border text-sm";
  const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav" className="h-8 w-8 rounded-full object-cover ring-2 ring-primary" style={{ objectPosition: 'center 20%' }} />
            <div>
              <div className="font-bold text-sm">Admin Panel</div>
              <div className="text-xs text-muted-foreground">SEO Seasons by Manav</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/')} className="border-border text-xs">
            <ArrowLeft className="h-3 w-3 mr-1.5" />
            Back to Site
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                tab === id
                  ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)]'
                  : 'border-border bg-card/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── CLIENTS & PROJECTS TAB ── */}
        {tab === 'clients' && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Create Client */}
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Register New Client</h2>
              <div className="space-y-3">
                {[
                  { key: 'name', label: 'Client Name', placeholder: 'John Smith' },
                  { key: 'company', label: 'Company', placeholder: 'Acme Corp' },
                  { key: 'industry', label: 'Industry', placeholder: 'E-commerce, SaaS, etc.' },
                  { key: 'website', label: 'Website', placeholder: 'https://example.com' },
                  { key: 'email', label: 'Email', placeholder: 'client@email.com' },
                  { key: 'retainer_amount', label: 'Monthly Retainer ($)', placeholder: '1500' },
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
                <Button onClick={createClient} disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" /> Create Client
                </Button>
              </div>
            </div>

            {/* Create Project */}
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> Add Project to Client</h2>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className={labelClass}>Select Client</Label>
                  <select
                    value={selectedClient}
                    onChange={e => setSelectedClient(e.target.value)}
                    className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3"
                  >
                    <option value="">— Choose client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.company}</option>)}
                  </select>
                </div>
                {[
                  { key: 'name', label: 'Project Name', placeholder: 'Main Website' },
                  { key: 'url', label: 'Website URL', placeholder: 'https://example.com' },
                  { key: 'keywords', label: 'Target Keywords (comma separated)', placeholder: 'seo agency, digital marketing' },
                  { key: 'competitors', label: 'Competitors (comma separated)', placeholder: 'competitor1.com, competitor2.com' },
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
                <Button onClick={createProject} disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" /> Create Project
                </Button>
              </div>
            </div>

            {/* Client List */}
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4">All Clients ({clients.length})</h2>
              <div className="space-y-2">
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
                          <div className="text-xs text-muted-foreground">{client.company} · ${client.retainer_amount}/mo</div>
                        </div>
                      </div>
                      {expandedClient === client.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {expandedClient === client.id && (
                      <div className="px-4 pb-3 border-t border-border pt-3">
                        <div className="text-xs text-muted-foreground mb-2">
                          <span className="font-mono">ID: {client.id}</span> · {client.email} · {client.industry}
                        </div>
                        <div className="text-xs text-muted-foreground font-semibold mb-1">Projects:</div>
                        {projects.filter(p => p.client_id === client.id).map(p => (
                          <div key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                            <Globe className="h-3 w-3 text-primary" />
                            {p.name} — {p.url}
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

        {/* ── LOG WORK TAB ── */}
        {tab === 'logs' && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Log Work */}
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Log Work Done</h2>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className={labelClass}>Select Project</Label>
                  <select
                    value={selectedProject}
                    onChange={e => setSelectedProject(e.target.value)}
                    className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3"
                  >
                    <option value="">— Choose project —</option>
                    {projects.map(p => {
                      const client = clients.find(c => c.id === p.client_id);
                      return <option key={p.id} value={p.id}>{client?.name} → {p.name}</option>;
                    })}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className={labelClass}>Hours</Label>
                    <Input placeholder="2.5" value={logForm.hours} onChange={e => setLogForm(f => ({ ...f, hours: e.target.value }))} className={inputClass} />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelClass}>Date</Label>
                    <Input type="date" value={logForm.logged_at} onChange={e => setLogForm(f => ({ ...f, logged_at: e.target.value }))} className={inputClass} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className={labelClass}>Category</Label>
                  <select
                    value={logForm.category}
                    onChange={e => setLogForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3"
                  >
                    <option value="">— Select category —</option>
                    {['Technical SEO', 'On-Page SEO', 'Link Building', 'Content Creation', 'GEO Optimization', 'Analytics & Reporting', 'Strategy'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {[
                  { key: 'title', label: 'What was done', placeholder: 'Optimized Core Web Vitals across 12 pages' },
                  { key: 'description', label: 'Details (optional)', placeholder: 'Compressed images, deferred scripts...' },
                  { key: 'impact_metric', label: 'Impact Metric', placeholder: 'Page Load Speed' },
                  { key: 'impact_value', label: 'Impact Value', placeholder: 'Improved from 4.2s → 1.8s' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className={labelClass}>{label}</Label>
                    <Input placeholder={placeholder} value={(logForm as any)[key]} onChange={e => setLogForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} />
                  </div>
                ))}
                <Button onClick={logWork} disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Clock className="h-4 w-4 mr-2" /> Log Work Entry
                </Button>
              </div>
            </div>

            {/* Log Metrics */}
<div className="rounded-2xl border border-border bg-card/60 p-6">
  <h2 className="font-bold text-base mb-4 flex items-center gap-2">
    <BarChart3 className="h-4 w-4 text-primary" /> Update Metrics
  </h2>
  <div className="space-y-3">
    <div className="space-y-1">
      <Label className={labelClass}>Select Project</Label>
      <select
        value={selectedProject}
        onChange={e => setSelectedProject(e.target.value)}
        className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3"
      >
        <option value="">— Choose project —</option>
        {projects.map(p => {
          const client = clients.find(c => c.id === p.client_id);
          return <option key={p.id} value={p.id}>{client?.name} → {p.name}</option>;
        })}
      </select>
    </div>

    {/* Auto-fetch button */}
    {selectedProject && (() => {
      const proj = projects.find(p => p.id === selectedProject);
      return proj?.url ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="text-xs font-mono text-primary uppercase tracking-wider mb-2">
            ⚡ Auto-fetch Real Data
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Fetches live PageSpeed scores, Core Web Vitals, and SEO data directly from Google for <span className="text-foreground font-mono">{proj.url}</span>
          </p>
          <Button
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch('/api/fetch-site-metrics', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: proj.url }),
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);

                // Auto-fill metrics form with REAL data
                setMetricsForm(f => ({
                  ...f,
                  organic_traffic: f.organic_traffic, // keep manual — needs GSC
                  domain_rating: data.raw_scores.seo?.toString() || f.domain_rating,
                  backlinks: f.backlinks, // keep manual — needs Ahrefs
                  ai_citations: f.ai_citations,
                  conversions: f.conversions,
                  revenue_impact: f.revenue_impact,
                }));

                // Store full results for display
                setFetchedMetrics(data);
                toast({ title: '✅ Real data fetched!', description: 'Scores from Google PageSpeed Insights' });
              } catch (err: any) {
                toast({ title: 'Fetch failed', description: err.message, variant: 'destructive' });
              }
              setLoading(false);
            }}
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Fetching from Google...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Fetch Live Metrics for {proj.url}
              </span>
            )}
          </Button>
        </div>
      ) : null;
    })()}

    {/* Show fetched real data */}
    {fetchedMetrics && (
      <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-green-400 uppercase tracking-wider">
          <CheckCircle className="h-3.5 w-3.5" />
          Real Data — Source: {fetchedMetrics.source}
        </div>
        <div className="text-xs text-muted-foreground">
          Fetched: {new Date(fetchedMetrics.fetched_at).toLocaleString()}
        </div>

        {/* PageSpeed Scores */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Mobile Performance', value: fetchedMetrics.raw_scores.mobile_performance, color: fetchedMetrics.raw_scores.mobile_performance >= 90 ? 'text-green-400' : fetchedMetrics.raw_scores.mobile_performance >= 50 ? 'text-yellow-400' : 'text-red-400' },
            { label: 'Desktop Performance', value: fetchedMetrics.raw_scores.desktop_performance, color: fetchedMetrics.raw_scores.desktop_performance >= 90 ? 'text-green-400' : fetchedMetrics.raw_scores.desktop_performance >= 50 ? 'text-yellow-400' : 'text-red-400' },
            { label: 'SEO Score', value: fetchedMetrics.raw_scores.seo, color: fetchedMetrics.raw_scores.seo >= 90 ? 'text-green-400' : 'text-yellow-400' },
            { label: 'Accessibility', value: fetchedMetrics.raw_scores.accessibility, color: fetchedMetrics.raw_scores.accessibility >= 90 ? 'text-green-400' : 'text-yellow-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-border bg-background/40 px-3 py-2">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={`text-lg font-bold ${color}`}>{value}/100</div>
            </div>
          ))}
        </div>

        {/* Core Web Vitals */}
        <div>
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Core Web Vitals (Mobile)</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'LCP', value: fetchedMetrics.cwv.lcp },
              { label: 'CLS', value: fetchedMetrics.cwv.cls },
              { label: 'FCP', value: fetchedMetrics.cwv.fcp },
              { label: 'TBT', value: fetchedMetrics.cwv.tbt },
              { label: 'TTI', value: fetchedMetrics.cwv.tti },
              { label: 'Speed Index', value: fetchedMetrics.cwv.speed_index },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-background/40 px-2 py-1.5 text-center">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-xs font-bold text-foreground">{value || '—'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Analysis */}
        {fetchedMetrics.analysis && (
          <>
            {fetchedMetrics.analysis.ai_summary && (
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">AI Summary</div>
                <p className="text-xs text-foreground leading-relaxed">{fetchedMetrics.analysis.ai_summary}</p>
              </div>
            )}
            {fetchedMetrics.analysis.technical_issues?.length > 0 && (
              <div>
                <div className="text-xs font-mono text-red-400 uppercase tracking-wider mb-1">Confirmed Issues</div>
                {fetchedMetrics.analysis.technical_issues.map((issue: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground py-0.5">
                    <span className="text-red-400 shrink-0 mt-0.5">✗</span>{issue}
                  </div>
                ))}
              </div>
            )}
            {fetchedMetrics.analysis.confirmed_positives?.length > 0 && (
              <div>
                <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-1">Confirmed Good</div>
                {fetchedMetrics.analysis.confirmed_positives.map((item: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground py-0.5">
                    <span className="text-green-400 shrink-0 mt-0.5">✓</span>{item}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          ⚠️ Organic traffic, backlinks & DR require Google Search Console / Ahrefs — enter manually below
        </div>
      </div>
    )}

    {/* Manual fields for data requiring paid APIs */}
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">
        Manual Entry (requires GSC / Ahrefs)
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { key: 'organic_traffic', label: 'Organic Traffic (GSC)', placeholder: '12500' },
          { key: 'domain_rating', label: 'Domain Rating (Ahrefs)', placeholder: '42' },
          { key: 'backlinks', label: 'Backlinks (Ahrefs)', placeholder: '310' },
          { key: 'ai_citations', label: 'AI Citations (manual test)', placeholder: '8' },
          { key: 'conversions', label: 'Conversions (GSC/GA)', placeholder: '45' },
          { key: 'revenue_impact', label: 'Revenue Impact ($)', placeholder: '4500' },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1">
            <Label className={labelClass}>{label}</Label>
            <Input
              placeholder={placeholder}
              value={(metricsForm as any)[key]}
              onChange={e => setMetricsForm(f => ({ ...f, [key]: e.target.value }))}
              className={inputClass}
            />
          </div>
        ))}
      </div>
      <div className="space-y-1 mt-3">
        <Label className={labelClass}>Date</Label>
        <Input type="date" value={metricsForm.recorded_at} onChange={e => setMetricsForm(f => ({ ...f, recorded_at: e.target.value }))} className={inputClass} />
      </div>
    </div>

    <Button onClick={saveMetrics} disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
      <TrendingUp className="h-4 w-4 mr-2" /> Save Metrics to Dashboard
    </Button>
  </div>
</div>
        {/* ── UPSELLS TAB ── */}
        {tab === 'upsells' && (
          <div className="max-w-lg">
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Create Upsell Offer</h2>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className={labelClass}>Select Project</Label>
                  <select
                    value={selectedProject}
                    onChange={e => setSelectedProject(e.target.value)}
                    className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3"
                  >
                    <option value="">— Choose project —</option>
                    {projects.map(p => {
                      const client = clients.find(c => c.id === p.client_id);
                      return <option key={p.id} value={p.id}>{client?.name} → {p.name}</option>;
                    })}
                  </select>
                </div>
                {[
                  { key: 'title', label: 'Offer Title', placeholder: 'GEO Content Acceleration Package' },
                  { key: 'description', label: 'Description', placeholder: 'You are missing 80% of AI search traffic...' },
                  { key: 'price', label: 'Price ($)', placeholder: '499' },
                  { key: 'potential_impact', label: 'Potential Impact', placeholder: '+500 AI impressions/month' },
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
                <Button onClick={createUpsell} disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <DollarSign className="h-4 w-4 mr-2" /> Create Upsell
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── APPROVALS TAB ── */}
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
                  <div key={user.id} className="rounded-2xl border border-border bg-card/60 p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-sm">{user.email}</div>
                      <div className="text-xs text-muted-foreground">{user.phone || 'No phone'} · Signed up {new Date(user.created_at).toLocaleDateString()}</div>
                      <div className="mt-2 space-y-1">
                        <Label className={labelClass}>Link to Client (optional)</Label>
                        <select
                          onChange={e => {
                            const el = document.getElementById(`approve-btn-${user.id}`) as any;
                            if (el) el.dataset.clientId = e.target.value;
                          }}
                          className="w-full h-8 rounded-md border border-border bg-background/60 text-xs px-2"
                        >
                          <option value="">— No client yet —</option>
                          {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.company}</option>)}
                        </select>
                      </div>
                    </div>
                    <Button
                      id={`approve-btn-${user.id}`}
                      size="sm"
                      onClick={e => {
                        const clientId = (e.currentTarget as any).dataset.clientId;
                        approveUser(user.id, clientId || undefined);
                      }}
                      className="bg-green-500 hover:bg-green-600 text-white shrink-0"
                    >
                      <CheckCircle className="h-3 w-3 mr-1.5" />
                      Approve
                    </Button>
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
