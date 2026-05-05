import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Globe, Clock, Zap, Star, BarChart3,
  Brain, ShieldCheck, LogOut, ArrowUpRight, CheckCircle,
  Target, DollarSign, Award, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';

export default function Dashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [upsells, setUpsells] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingUpsell, setApprovingUpsell] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadProjectData(selectedProject.id);
    }
  }, [selectedProject]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/'); return; }

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!prof?.approved) { navigate('/'); return; }
    setProfile(prof);

    if (prof.client_id) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('id', prof.client_id)
        .single();
      setClient(clientData);

      const { data: projs } = await supabase
        .from('projects')
        .select('*')
        .eq('client_id', prof.client_id);
      setProjects(projs || []);
      if (projs && projs.length > 0) {
        setSelectedProject(projs[0]);
      }
    }
    setLoading(false);
  };

  const loadProjectData = async (projectId: string) => {
    const [metricsRes, logsRes, upsellsRes] = await Promise.all([
      supabase.from('metrics').select('*').eq('project_id', projectId).order('recorded_at'),
      supabase.from('work_logs').select('*').eq('project_id', projectId).order('logged_at', { ascending: false }),
      supabase.from('upsells').select('*').eq('project_id', projectId).eq('status', 'pending'),
    ]);
    setMetrics(metricsRes.data || []);
    setWorkLogs(logsRes.data || []);
    setUpsells(upsellsRes.data || []);
  };

  const approveUpsell = async (upsellId: string) => {
    setApprovingUpsell(upsellId);
    const { error } = await supabase
      .from('upsells')
      .update({ status: 'approved' })
      .eq('id', upsellId);
    if (!error) {
      toast({ title: '✅ Sprint Approved!', description: 'Manav will be notified immediately.' });
      setUpsells(u => u.filter(x => x.id !== upsellId));
    }
    setApprovingUpsell(null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  // Latest + previous metrics for delta
  const latest = metrics[metrics.length - 1];
  const previous = metrics[metrics.length - 2];
  const delta = (key: string) => {
    if (!latest || !previous) return null;
    const diff = latest[key] - previous[key];
    return diff;
  };

  // Total hours logged
  const totalHours = workLogs.reduce((sum, l) => sum + (l.hours || 0), 0);

  // ROI estimate: traffic value at $2 per organic visitor
  const roiValue = latest ? (latest.organic_traffic * 2).toLocaleString() : '—';
  const retainer = client?.retainer_amount || 0;
  const roiMultiplier = latest && retainer > 0
    ? ((latest.organic_traffic * 2) / retainer).toFixed(1)
    : '—';

  // Progress to "market dominance" (based on DR)
  const dominanceScore = latest
    ? Math.min(100, Math.round((latest.domain_rating / 80) * 40 + (latest.organic_traffic / 50000) * 30 + (latest.ai_citations / 20) * 30))
    : 0;

  // Chart data
  const chartData = metrics.map(m => ({
    date: new Date(m.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    traffic: m.organic_traffic,
    dr: m.domain_rating,
    backlinks: m.backlinks,
    revenue: m.revenue_impact,
  }));

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground font-mono">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center rounded-2xl border border-border bg-card/60 p-10">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Dashboard Being Prepared</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Manav is setting up your client portal. You'll receive an email once your dashboard is ready with your first metrics.
          </p>
          <Button variant="outline" onClick={handleSignOut} className="border-border">
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>
      </div>
    );
  }

  const StatCard = ({ icon: Icon, label, value, delta: d, color = 'text-primary' }: any) => (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-foreground mb-1">{value ?? '—'}</div>
      {d !== null && d !== undefined && (
        <div className={`text-xs flex items-center gap-1 ${d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          <ArrowUpRight className={`h-3 w-3 ${d < 0 ? 'rotate-180' : ''}`} />
          {d >= 0 ? '+' : ''}{d} vs last period
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Header */}
      <div className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav" className="h-8 w-8 rounded-full object-cover ring-2 ring-primary" style={{ objectPosition: 'center 20%' }} />
            <div>
              <div className="font-bold text-sm">SEO Seasons</div>
              <div className="text-xs text-muted-foreground">Client Portal — {client.company}</div>
            </div>
          </div>

          {/* Project selector */}
          {projects.length > 1 && (
            <select
              value={selectedProject?.id || ''}
              onChange={e => {
                const p = projects.find(x => x.id === e.target.value);
                setSelectedProject(p);
              }}
              className="h-8 rounded-lg border border-border bg-background/60 text-xs px-3"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <Button variant="outline" size="sm" onClick={handleSignOut} className="border-border text-xs">
            <LogOut className="h-3 w-3 mr-1.5" /> Sign Out
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Welcome strip */}
        <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 to-transparent p-5 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-primary uppercase tracking-wider mb-1">Welcome back</div>
            <h1 className="text-xl font-bold">{client.name} — {selectedProject?.name}</h1>
            <div className="text-sm text-muted-foreground mt-0.5">{selectedProject?.url}</div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground border border-border rounded-full px-3 py-1.5 bg-background/60">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Active Campaign
          </div>
        </div>

        {/* ROI Banner */}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 grid sm:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Est. Traffic Value</div>
            <div className="text-3xl font-bold text-gradient-primary">${roiValue}</div>
            <div className="text-xs text-muted-foreground">organic visibility/mo</div>
          </div>
          <div className="text-center border-x border-border">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Monthly Retainer</div>
            <div className="text-3xl font-bold text-foreground">${retainer.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">you invest per month</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">ROI Multiplier</div>
            <div className="text-3xl font-bold text-green-400">{roiMultiplier}×</div>
            <div className="text-xs text-muted-foreground">return on investment</div>
          </div>
        </div>

        {/* Market Dominance Progress */}
        <div className="rounded-2xl border border-border bg-card/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Market Dominance Progress</span>
            </div>
            <span className="text-sm font-bold text-primary">{dominanceScore}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-secondary overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-1000"
              style={{ width: `${dominanceScore}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Starting Point</span>
            <span className="text-primary font-mono">{dominanceScore < 40 ? '🚀 Building momentum' : dominanceScore < 70 ? '⚡ Gaining ground' : '🏆 Market leader'}</span>
            <span>Maximum Dominance</span>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp} label="Organic Traffic" value={latest?.organic_traffic?.toLocaleString()} delta={delta('organic_traffic')} color="text-green-400" />
          <StatCard icon={Award} label="Domain Rating" value={latest?.domain_rating} delta={delta('domain_rating')} color="text-blue-400" />
          <StatCard icon={Globe} label="Backlinks" value={latest?.backlinks?.toLocaleString()} delta={delta('backlinks')} color="text-purple-400" />
          <StatCard icon={Brain} label="AI Citations" value={latest?.ai_citations} delta={delta('ai_citations')} color="text-yellow-400" />
        </div>

        {/* Traffic Chart */}
        {chartData.length > 0 && (
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Organic Traffic Growth</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="trafficGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                />
                <Area type="monotone" dataKey="traffic" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#trafficGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Revenue Impact Chart */}
        {chartData.length > 0 && (
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-4 w-4 text-green-400" />
              <span className="font-semibold text-sm">Revenue Impact</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                  formatter={(v: any) => [`$${v}`, 'Revenue Impact']}
                />
                <Line type="monotone" dataKey="revenue" stroke="#4ade80" strokeWidth={2} dot={{ fill: '#4ade80', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Proof of Work Timeline */}
        {workLogs.length > 0 && (
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Proof of Work — What We Did For You</span>
              <span className="ml-auto text-xs font-mono text-muted-foreground">{totalHours.toFixed(1)} hrs total</span>
            </div>
            <div className="space-y-3">
              {workLogs.slice(0, 8).map((log, i) => (
                <div key={log.id} className="flex gap-4 group">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                      <CheckCircle className="h-3.5 w-3.5 text-primary" />
                    </div>
                    {i < workLogs.slice(0, 8).length - 1 && <div className="w-px h-full bg-border mt-1" />}
                  </div>
                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <span className="text-sm font-semibold text-foreground">{log.title}</span>
                        <span className="ml-2 text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">{log.category}</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-mono text-muted-foreground">{log.hours}h</div>
                        <div className="text-xs text-muted-foreground">{new Date(log.logged_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                      </div>
                    </div>
                    {log.description && (
                      <p className="text-xs text-muted-foreground mb-1.5">{log.description}</p>
                    )}
                    {log.impact_metric && (
                      <div className="inline-flex items-center gap-1.5 text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2.5 py-1">
                        <ArrowUpRight className="h-3 w-3" />
                        {log.impact_metric}: {log.impact_value}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upsell Offers */}
        {upsells.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              <span className="font-semibold text-sm">Growth Opportunities Identified</span>
              <span className="text-xs bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded-full px-2 py-0.5">{upsells.length} available</span>
            </div>
            {upsells.map(upsell => (
              <div key={upsell.id} className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                      <span className="font-bold text-sm text-foreground">{upsell.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{upsell.description}</p>
                    {upsell.potential_impact && (
                      <div className="inline-flex items-center gap-1.5 text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2.5 py-1 mb-3">
                        <TrendingUp className="h-3 w-3" />
                        Potential: {upsell.potential_impact}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-foreground">${upsell.price}</span>
                      <span className="text-xs text-muted-foreground">added to next invoice</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => approveUpsell(upsell.id)}
                    disabled={approvingUpsell === upsell.id}
                    className="shrink-0 bg-gradient-to-r from-yellow-500 to-yellow-400 text-black font-bold hover:opacity-90"
                  >
                    {approvingUpsell === upsell.id ? (
                      <div className="h-4 w-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve Sprint
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {metrics.length === 0 && workLogs.length === 0 && (
          <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-2">Your Dashboard is Being Populated</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Manav is logging your first metrics and work entries. Check back shortly — your data will appear here automatically.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground py-4 border-t border-border">
          <div className="flex items-center justify-center gap-4 mb-2">
            {[
              { icon: ShieldCheck, text: 'Data is private & secure' },
              { icon: Star, text: 'Fiverr Top Rated' },
              { icon: Globe, text: 'SEO Seasons by Manav' },
            ].map(({ icon: Icon, text }) => (
              <span key={text} className="flex items-center gap-1.5">
                <Icon className="h-3 w-3 text-primary" />{text}
              </span>
            ))}
          </div>
          © 2026 SEO Seasons — Client Portal
        </div>
      </div>
    </div>
  );
}
