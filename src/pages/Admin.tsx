import ProjectOnboardingModal from '@/components/ProjectOnboardingModal';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import AnimatedBg from '@/components/AnimatedBg';
import PortalNav from '@/components/PortalNav';
import {
  Users, Plus, Globe, CheckCircle,
  ChevronDown, ChevronUp, Zap, DollarSign,
  ArrowLeft, Sparkles, Save, RefreshCw,
  AlertCircle, Rocket, Shield, BarChart3,
  AlertTriangle, CheckCircle2, Info
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Key, Mail, Copy, Eye, EyeOff, Trash2 } from 'lucide-react';

const EMPTY_FORM = {
  llm_visibility_score: '', chatgpt_citations: '', perplexity_citations: '',
  google_ai_citations: '', llm_platforms: '', algorithm_health_score: '',
  eeat_score: '', content_authority_score: '', pages_indexed: '',
  pages_submitted: '', brand_mentions: '', overall_growth_score: '',
  competitor_rank: '', competitors_beaten: '', competitor_gap_note: '',
  milestone: '', milestone_impact: '',
  recorded_at: new Date().toISOString().split('T')[0],
};

export default function Admin() {
  const navigate = useNavigate();

  /* ── tabs ── */
  const [tab, setTab] = useState<'control'|'clients'|'metrics'|'upsells'|'launchpad'|'approve'|'staff'>('control');

  /* ── data ── */
  const [clients,       setClients]       = useState<any[]>([]);
  const [projects,      setProjects]      = useState<any[]>([]);
  const [pendingUsers,  setPendingUsers]  = useState<any[]>([]);
  const [auditReports,  setAuditReports]  = useState<any[]>([]);

  /* ── selection ── */
  const [selectedClient,  setSelectedClient]  = useState('');
  const [selectedProject, setSelectedProject] = useState('');

  /* ── loading ── */
  const [loading,             setLoading]             = useState(false);
  const [fetchingAI,          setFetchingAI]          = useState(false);
  const [generatingLaunchpad, setGeneratingLaunchpad] = useState(false);
  const [loadingReports,      setLoadingReports]      = useState(false);
  const [syncingId,           setSyncingId]           = useState<string|null>(null);
  const [launchpadTimer,      setLaunchpadTimer]      = useState(0);
  const [launchpadError,      setLaunchpadError]      = useState('');

  /* ── UI ── */
  const [expandedClient,   setExpandedClient]   = useState<string|null>(null);
  const [aiResult,         setAiResult]         = useState<any>(null);
  const [launchpadPreview, setLaunchpadPreview] = useState<any>(null);

  /* ── forms ── */
  const [metricsForm,  setMetricsForm]  = useState<any>(EMPTY_FORM);
  const [clientForm,   setClientForm]   = useState({ name:'', company:'', industry:'', website:'', email:'', retainer_amount:'' });
  const [projectForm,  setProjectForm]  = useState({ name:'', url:'', keywords:'', competitors:'' });
  const [onboardingProject, setOnboardingProject] = useState<{id:string;name:string;url:string}|null>(null);
  const [projectStep,  setProjectStep]  = useState<'basics'|'intelligence'>('basics');
  const [intelAnswers, setIntelAnswers] = useState<Record<string,string>>({});
  const [newProjId,    setNewProjId]    = useState<string|null>(null);

  /* ── staff / PM state ── */
  const [staff,           setStaff]           = useState<any[]>([]);
  const [pmForm,          setPmForm]          = useState({ name:'', email:'', role:'pm', timezone:'Europe/London' });
  const [pmPerms,         setPmPerms]         = useState({
    dashboard: true, playground: true, data_room: true,
    audit_tools: true, algorithm_intel: false, brain_learning: false,
    morning_brief: true, system_control: false,
    bde_panel: false, staff_command: false, lead_intel: false,
  });
  const [creatingPm,      setCreatingPm]      = useState(false);
  const [inviteLink,      setInviteLink]       = useState<string|null>(null);
  const [inviteSent,      setInviteSent]       = useState(false);
  const [editingStaffId,  setEditingStaffId]  = useState<string|null>(null);
  const [editPerms,       setEditPerms]       = useState<Record<string,boolean>>({});
  const [upsellForm,   setUpsellForm]   = useState({ title:'', description:'', price:'', potential_impact:'' });
  const [launchpadPhase,   setLaunchpadPhase]   = useState(1);
  const [launchpadContext, setLaunchpadContext] = useState('');
  const [launchpadMonths,  setLaunchpadMonths]  = useState(1);
  const launchpadAbortRef = { current: null as AbortController|null };

  /* ══ DATA FETCHING ══ */
  useEffect(() => { fetchAll(); loadAuditReports(); }, []);

  const fetchAll = async () => {
    const { data: c } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    const { data: p } = await supabase.from('projects').select('*');
    const { data: u } = await supabase.from('profiles').select('*').eq('approved', false);
    setClients(c || []);
    setProjects(p || []);
    setPendingUsers(u || []);
    /* load staff */
    const r = await fetch('/api/task-engine', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'get_staff' }) }).then(x=>x.json()).catch(()=>({ staff:[] }));
    setStaff(r.staff || []);
  };

  const loadAuditReports = async () => {
    setLoadingReports(true);
    const { data } = await supabase
      .from('audit_reports')
      .select('id,created_at,url,overall_score,synced_to_metrics,synced_at,saved_by,keywords,competitors,project_id')
      .order('created_at', { ascending: false })
      .limit(50);
    setAuditReports(data || []);
    setLoadingReports(false);
  };

  /* ══ HELPERS ══ */
  const populateForm = (a: any) => {
    setMetricsForm({
      llm_visibility_score:    a.llm_visibility_score?.toString()    ?? '',
      chatgpt_citations:       a.chatgpt_citations?.toString()       ?? '',
      perplexity_citations:    a.perplexity_citations?.toString()    ?? '',
      google_ai_citations:     a.google_ai_citations?.toString()     ?? '',
      llm_platforms:           Array.isArray(a.llm_platforms) ? a.llm_platforms.join(', ') : (a.llm_platforms ?? ''),
      algorithm_health_score:  a.algorithm_health_score?.toString()  ?? '',
      eeat_score:              a.eeat_score?.toString()              ?? '',
      content_authority_score: a.content_authority_score?.toString() ?? '',
      pages_indexed:           a.pages_indexed?.toString()           ?? '',
      pages_submitted:         a.pages_submitted?.toString()         ?? '',
      brand_mentions:          a.brand_mentions?.toString()          ?? '',
      overall_growth_score:    a.overall_growth_score?.toString()    ?? '',
      competitor_rank:         a.competitor_rank?.toString()         ?? '',
      competitors_beaten:      a.competitors_beaten?.toString()      ?? '',
      competitor_gap_note:     a.competitor_gap_note                 ?? '',
      milestone:               a.milestone                           ?? '',
      milestone_impact:        a.milestone_impact                    ?? '',
      recorded_at:             new Date().toISOString().split('T')[0],
    });
  };

  const handleSelectProject = (projId: string) => {
    setSelectedProject(projId);
    setAiResult(null);
    setLaunchpadPreview(null);
    if (!projId) { setMetricsForm(EMPTY_FORM); return; }
    const proj = projects.find(p => p.id === projId);
    if (proj?.last_analysis) {
      setAiResult(proj.last_analysis);
      populateForm(proj.last_analysis.analysis);
    } else {
      setMetricsForm(EMPTY_FORM);
    }
    if (proj?.current_phase)  setLaunchpadPhase(proj.current_phase);
    if (proj?.launchpad_data) setLaunchpadPreview(proj.launchpad_data);
  };

  const getLastAnalysisInfo = () => {
    if (!selectedProject) return null;
    const proj = projects.find(p => p.id === selectedProject);
    if (!proj?.last_analysis_at) return null;
    const ms  = Date.now() - new Date(proj.last_analysis_at).getTime();
    const hrs = Math.round(ms / (1000 * 60 * 60));
    const ago = hrs < 1 ? 'just now' : hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs/24)}d ago`;
    return {
      dateStr: new Date(proj.last_analysis_at).toLocaleDateString('en-GB', {
        day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit',
      }),
      ago,
    };
  };

  /* ══ ACTIONS ══ */
  const runAIAnalysis = async () => {
    const proj = projects.find(p => p.id === selectedProject);
    if (!proj) return toast({ title: 'Select a project first', variant: 'destructive' });
    setFetchingAI(true);
    setAiResult(null);
    try {
      const clientData = clients.find(c => c.id === proj.client_id);
      const res = await fetch('/api/run-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url:         proj.url,
          competitors: proj.competitors || [],
          keywords:    proj.keywords    || [],
          brand_name:  clientData?.company || '',
          project_id:  proj.id,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Analysis failed');

      await supabase.from('projects').update({
        last_analysis:    data,
        last_analysis_at: new Date().toISOString(),
      }).eq('id', selectedProject);

      /* Auto-save as audit report */
      await supabase.from('audit_reports').insert({
        project_id:   proj.id,
        url:          proj.url,
        keywords:     proj.keywords || [],
        competitors:  proj.competitors || [],
        sections:     data.sections,
        confidence:   data.cross_verifications,
        data_sources: data.analysis?.data_sources,
        cross_verified: data.cross_verifications,
        overall_score:  data.overall_confidence,
        saved_by:     'admin',
      });

      fetchAll();
      loadAuditReports();
      setAiResult(data);
      populateForm(data.analysis);
      toast({ title: `Analysis complete! Confidence: ${data.overall_confidence}%`, description: 'Auto-saved as audit report. Review then push to dashboard.' });
    } catch (err: any) {
      toast({ title: 'Analysis failed', description: err.message, variant: 'destructive' });
    }
    setFetchingAI(false);
  };

  const saveMetrics = async () => {
    if (!selectedProject) return toast({ title: 'Select a project', variant: 'destructive' });
    setLoading(true);
    const { error } = await supabase.from('metrics').insert({
      project_id:              selectedProject,
      llm_visibility_score:    parseInt(metricsForm.llm_visibility_score)    || null,
      chatgpt_citations:       parseInt(metricsForm.chatgpt_citations)       || null,
      perplexity_citations:    parseInt(metricsForm.perplexity_citations)    || null,
      google_ai_citations:     parseInt(metricsForm.google_ai_citations)     || null,
      llm_platforms:           typeof metricsForm.llm_platforms === 'string'
                                 ? metricsForm.llm_platforms.split(',').map((s:string)=>s.trim()).filter(Boolean)
                                 : (metricsForm.llm_platforms || []),
      algorithm_health_score:  parseInt(metricsForm.algorithm_health_score)  || null,
      eeat_score:              parseInt(metricsForm.eeat_score)              || null,
      content_authority_score: parseInt(metricsForm.content_authority_score) || null,
      pages_indexed:           parseInt(metricsForm.pages_indexed)           || null,
      pages_submitted:         parseInt(metricsForm.pages_submitted)         || null,
      brand_mentions:          parseInt(metricsForm.brand_mentions)          || null,
      overall_growth_score:    parseInt(metricsForm.overall_growth_score)    || null,
      competitor_rank:         parseInt(metricsForm.competitor_rank)         || null,
      competitors_beaten:      parseInt(metricsForm.competitors_beaten)      || null,
      competitor_gap_note:     metricsForm.competitor_gap_note               || null,
      milestone:               metricsForm.milestone                         || null,
      milestone_impact:        metricsForm.milestone_impact                  || null,
      recorded_at:             metricsForm.recorded_at,
      keyword_rankings:        aiResult?.analysis?.keyword_rankings          || [],
      data_sources:            aiResult?.analysis?.data_sources              || {},
      explanations:            aiResult?.analysis?.explanations              || {},
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Saved to client dashboard!' });
    setLoading(false);
  };

  const syncAuditToMetrics = async (reportId: string) => {
    setSyncingId(reportId);
    try {
      const report = auditReports.find(r => r.id === reportId);
      if (!report?.project_id) throw new Error('No project linked to this report');
      const proj = projects.find(p => p.id === report.project_id);
      if (!proj?.last_analysis?.analysis) throw new Error('No analysis data on project — re-run analysis first');
      const a = proj.last_analysis.analysis;
      const { error } = await supabase.from('metrics').insert({
        project_id:              report.project_id,
        recorded_at:             new Date().toISOString().split('T')[0],
        llm_visibility_score:    a.llm_visibility_score    || null,
        algorithm_health_score:  a.algorithm_health_score  || null,
        eeat_score:              a.eeat_score              || null,
        content_authority_score: a.content_authority_score || null,
        overall_growth_score:    a.overall_growth_score    || null,
        pages_indexed:           a.pages_indexed           || null,
        pages_submitted:         a.pages_submitted         || null,
        brand_mentions:          a.brand_mentions          || null,
        perplexity_citations:    a.perplexity_citations    || null,
        google_ai_citations:     a.google_ai_citations     || null,
        chatgpt_citations:       a.chatgpt_citations       || null,
        competitor_rank:         a.competitor_rank         || null,
        competitors_beaten:      a.competitors_beaten      || null,
        keyword_rankings:        a.keyword_rankings        || [],
        milestone:               a.milestone               || null,
        milestone_impact:        a.milestone_impact        || null,
        explanations:            a.explanations            || {},
        data_sources:            a.data_sources            || {},
      });
      if (error) throw error;
      await supabase.from('audit_reports')
        .update({ synced_to_metrics: true, synced_at: new Date().toISOString() })
        .eq('id', reportId);
      loadAuditReports();
      toast({ title: 'Synced to Dashboard!', description: 'All verified data is now live for the client.' });
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err.message, variant: 'destructive' });
    }
    setSyncingId(null);
  };

  /* ── PM creation ── */
  const PM_PERM_LABELS: Record<string, string> = {
    dashboard:       'Dashboard & Metrics',
    playground:      'PM Module & Kanban',
    data_room:       'Data Room & Documents',
    audit_tools:     'Audit Tool',
    morning_brief:   'Morning Brief',
    algorithm_intel: 'Algorithm Intel',
    brain_learning:  'Brain Learning',
    system_control:  'System Control',
    bde_panel:       'BDE Sales Panel',
    staff_command:   'Staff Command',
    lead_intel:      'Lead Intake',
  };

  const createPmAccount = async () => {
    if (!pmForm.name || !pmForm.email) return toast({ title: 'Name and email required', variant: 'destructive' });
    setCreatingPm(true);
    setInviteLink(null);
    setInviteSent(false);
    try {
      /* 1. Create staff_members row — this is what gives permissions on login */
      const res = await fetch('/api/task-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_staff', name: pmForm.name, email: pmForm.email, role: pmForm.role, timezone: pmForm.timezone, permissions: pmPerms }),
      }).then(r => r.json());
      if (!res.success) throw new Error(res.error || 'Failed to create staff record');

      /* 2. Send magic link via Supabase so PM can sign in without a password */
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: pmForm.email,
        options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/pm` },
      });
      if (otpErr) {
        /* Non-fatal: staff record created, just couldn't send the magic link */
        toast({ title: 'Staff created — invite link failed', description: `Account created but email failed: ${otpErr.message}. Share this login URL manually.`, variant: 'destructive' });
        setInviteLink(`${window.location.origin}/`);
      } else {
        setInviteSent(true);
        toast({ title: `✅ PM account created & invite sent!`, description: `${pmForm.email} will receive a magic link to sign in. They land on /pm automatically.` });
      }
      setPmForm({ name:'', email:'', role:'pm', timezone:'Europe/London' });
      fetchAll();
    } catch (e: any) {
      toast({ title: 'Error creating PM account', description: e.message, variant: 'destructive' });
    }
    setCreatingPm(false);
  };

  const saveStaffPerms = async (staffId: string) => {
    const res = await fetch('/api/task-engine', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'update_staff_permissions', staffId, permissions: editPerms }),
    }).then(r=>r.json());
    if (res.success) { toast({ title:'Permissions updated' }); setEditingStaffId(null); fetchAll(); }
    else toast({ title:'Error', description: res.error, variant:'destructive' });
  };

  const createClient = async () => {
    if (!clientForm.name || !clientForm.email) return toast({ title: 'Missing fields', variant: 'destructive' });
    setLoading(true);
    const { error } = await supabase.from('clients').insert({
      ...clientForm,
      retainer_amount: parseFloat(clientForm.retainer_amount) || 0,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Client created!' });
      setClientForm({ name:'', company:'', industry:'', website:'', email:'', retainer_amount:'' });
      fetchAll();
    }
    setLoading(false);
  };

  const createProject = async () => {
    if (!selectedClient || !projectForm.name || !projectForm.url)
      return toast({ title: 'Missing fields', variant: 'destructive' });
    setLoading(true);
    const { data: proj, error } = await supabase.from('projects').insert({
      client_id:   selectedClient,
      name:        projectForm.name,
      url:         projectForm.url,
      keywords:    projectForm.keywords.split(',').map((k:string)=>k.trim()).filter(Boolean),
      competitors: projectForm.competitors.split(',').map((c:string)=>c.trim()).filter(Boolean),
    }).select().single();
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setNewProjId(proj.id);
      setProjectStep('intelligence');
      toast({ title: '✅ Project created', description: 'Now tell Brain about the project — 5 questions.' });
      fetchAll();
    }
    setLoading(false);
  };

  const saveIntelligence = async () => {
    if (!newProjId) return;
    setLoading(true);
    try {
      // Build permanent brain_summary from all 10 answers
      const brainSummary = [
        intelAnswers.business_goal    ? `PRIMARY GOAL: ${intelAnswers.business_goal}`              : '',
        intelAnswers.biggest_blocker  ? `BIGGEST BLOCKER: ${intelAnswers.biggest_blocker}`         : '',
        intelAnswers.target_audience  ? `BUYER PERSONA: ${intelAnswers.target_audience}`           : '',
        intelAnswers.cms_platform     ? `CMS: ${intelAnswers.cms_platform}`                        : '',
        intelAnswers.current_ranking  ? `CURRENT RANKING: ${intelAnswers.current_ranking}`         : '',
        intelAnswers.content_status   ? `CONTENT STATE: ${intelAnswers.content_status}`            : '',
        intelAnswers.past_seo         ? `WHAT FAILED BEFORE: ${intelAnswers.past_seo}`             : '',
        intelAnswers.timeline         ? `DEADLINE: ${intelAnswers.timeline}`                       : '',
        intelAnswers.monthly_traffic  ? `ORGANIC TRAFFIC: ${intelAnswers.monthly_traffic}/mo`      : '',
        intelAnswers.budget_resource  ? `RESOURCES: ${intelAnswers.budget_resource}`               : '',
      ].filter(Boolean).join('\n');

      // Store permanently in project record
      const { data: currentProj } = await supabase.from('projects').select('playground_strategy').eq('id', newProjId).single();
      const strategy = (currentProj as any)?.playground_strategy || {};
      strategy.onboarding_data = {
        completed_at: new Date().toISOString(),
        answers:      intelAnswers,
        brain_summary: brainSummary,
      };
      await supabase.from('projects').update({ playground_strategy: strategy }).eq('id', newProjId);

      // Save as ONE permanent Brain Learning at confidence 95 (never needs re-review)
      await supabase.from('brain_learnings').insert({
        project_id:      newProjId,
        card_type:       'insight',
        card_title:      'Project Onboarding Intelligence',
        what_worked:     [],
        what_missed:     [intelAnswers.biggest_blocker || 'Not specified'],
        improvement:     intelAnswers.business_goal || 'Run full audit first',
        context_summary: brainSummary,
        tags:            ['onboarding','permanent','project-context'],
        source:          'project_onboarding',
        applied_count:   0,
        status:          'active',
        auto_captured:   true,
        confidence_score: 95,
        updated_at:      new Date().toISOString(),
      });

      // Save individual learnings for high-impact answers
      const keyLearnings = [
        intelAnswers.past_seo        ? { type:'insight',    title:'What failed: '+intelAnswers.past_seo.slice(0,40),     improvement:'Avoid this approach' }               : null,
        intelAnswers.biggest_blocker ? { type:'technical',  title:'Blocker: '+intelAnswers.biggest_blocker.slice(0,40),  improvement:'Resolve this first' }                : null,
        intelAnswers.target_audience ? { type:'content',    title:'Buyer persona: '+intelAnswers.target_audience.slice(0,40), improvement:'Calibrate all content for this buyer' } : null,
      ].filter(Boolean) as any[];

      for (const l of keyLearnings) {
        await supabase.from('brain_learnings').insert({
          project_id: newProjId, card_type: l.type, card_title: l.title,
          what_worked: [], what_missed: [], improvement: l.improvement,
          context_summary: 'From project onboarding',
          tags: ['onboarding', l.type], source: 'project_onboarding',
          applied_count: 0, status: 'active', auto_captured: true,
          confidence_score: 90, updated_at: new Date().toISOString(),
        });
      }

      toast({ title: `🧠 Brain calibrated for this project`, description: `${Object.keys(intelAnswers).length} intelligence pathways activated.` });
      setProjectStep('basics');
      setProjectForm({ name:'', url:'', keywords:'', competitors:'' });
      setIntelAnswers({});
      setNewProjId(null);
      fetchAll();
    } catch (e: any) {
      toast({ title: 'Error saving intelligence', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

    const createUpsell = async () => {
    if (!selectedProject || !upsellForm.title || !upsellForm.price)
      return toast({ title: 'Missing fields', variant: 'destructive' });
    setLoading(true);
    const { error } = await supabase.from('upsells').insert({
      project_id:       selectedProject,
      title:            upsellForm.title,
      description:      upsellForm.description,
      price:            parseFloat(upsellForm.price),
      potential_impact: upsellForm.potential_impact,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Upsell created!' });
      setUpsellForm({ title:'', description:'', price:'', potential_impact:'' });
    }
    setLoading(false);
  };

  const approveUser = async (userId: string, clientIds: string[]) => {
    const primaryClientId = clientIds[0] || undefined;
    const updates: any = { approved: true, client_ids: clientIds.filter(Boolean) };
    if (primaryClientId) updates.client_id = primaryClientId;
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'User approved!' }); fetchAll(); }
  };

  const generateLaunchpad = async () => {
    const proj = projects.find(p => p.id === selectedProject);
    if (!proj) return toast({ title: 'Select a project first', variant: 'destructive' });
    setGeneratingLaunchpad(true);
    setLaunchpadPreview(null);
    setLaunchpadError('');
    setLaunchpadTimer(0);
    const timerInterval = setInterval(() => setLaunchpadTimer(t => t + 1), 1000);
    const controller = new AbortController();
    launchpadAbortRef.current = controller;
    const hardTimeout = setTimeout(() => controller.abort(), 90000);
    try {
      const clientData = clients.find(c => c.id === proj.client_id);
      const { data: allMetricsData } = await supabase
        .from('metrics').select('*').eq('project_id', proj.id).order('recorded_at');
      const allMetrics = allMetricsData || [];
      const latest     = allMetrics[allMetrics.length - 1] || {};
      const res = await fetch('/api/launchpad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          client_name:      clientData?.name            || '',
          company:          clientData?.company         || '',
          industry:         clientData?.industry        || '',
          website:          proj.url,
          keywords:         proj.keywords               || [],
          competitors:      proj.competitors            || [],
          current_phase:    launchpadPhase,
          phase_context:    launchpadContext,
          months_active:    launchpadMonths,
          retainer_amount:  clientData?.retainer_amount || 0,
          latest_metrics:   latest,
          saved_analysis:   proj.last_analysis?.analysis || {},
          keyword_rankings: latest.keyword_rankings || proj.last_analysis?.analysis?.keyword_rankings || [],
          keyword_insights: latest.explanations?.keyword_insights || proj.last_analysis?.analysis?.explanations?.keyword_insights || {},
          historical_metrics: allMetrics,
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Generation failed');
      await supabase.from('projects').update({
        launchpad_data:         data,
        launchpad_generated_at: data.generated_at,
        current_phase:          launchpadPhase,
      }).eq('id', selectedProject);
      fetchAll();
      setLaunchpadPreview(data);
      toast({ title: 'Launchpad generated!', description: 'Live on client portal immediately.' });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setLaunchpadError('Request timed out after 90s. Check Vercel function logs.');
      } else {
        setLaunchpadError(err.message || 'Unknown error');
      }
      toast({ title: 'Generation failed', description: err.message, variant: 'destructive' });
    } finally {
      clearInterval(timerInterval);
      clearTimeout(hardTimeout);
      setGeneratingLaunchpad(false);
    }
  };

  /* ══ SHARED STYLES ══ */
  const ic = 'h-10 bg-background/60 border-border text-sm';
  const lc = 'text-xs font-medium text-muted-foreground uppercase tracking-wider';
  const lastInfo = getLastAnalysisInfo();

  const ProjectSelector = () => (
    <div className="space-y-1">
      <Label className={lc}>Select Project</Label>
      <select value={selectedProject} onChange={e => handleSelectProject(e.target.value)}
        className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3">
        <option value="">— Choose project —</option>
        {(clients||[]).filter((c:any)=>c?.id).map(c => {
          const cp = projects.filter(p => p.client_id === c.id);
          if (!cp.length) return null;
          return (
            <optgroup key={c.id} label={`${c.name} — ${c.company}`}>
      <PortalNav />
              {cp.map(p => (
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
    { id: 'control',   label: 'Control Panel',  icon: Shield },
    { id: 'clients',   label: 'Clients',         icon: Users },
    { id: 'metrics',   label: 'Run Analysis',    icon: Sparkles },
    { id: 'upsells',   label: 'Upsells',         icon: Zap },
    { id: 'launchpad', label: 'Launchpad',        icon: Rocket },
    { id: 'approve',   label: `Approvals${pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ''}`, icon: CheckCircle },
    { id: 'staff',     label: `Staff & PM${staff.length > 0 ? ` (${staff.length})` : ''}`,                   icon: UserPlus },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AnimatedBg/>

      {/* Header */}
      <div className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav"
              className="h-8 w-8 rounded-full object-cover ring-2 ring-primary"
              style={{ objectPosition: 'center 20%' }} />
            <div>
              <div className="font-bold text-sm">Admin Panel</div>
              <div className="text-xs text-muted-foreground">SEO Season by Manav</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="border-border text-xs">
              <BarChart3 className="h-3 w-3 mr-1.5" />Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/launchpad')} className="border-border text-xs">
              <Sparkles className="h-3 w-3 mr-1.5" />Launchpad
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/')} className="border-border text-xs">
              <ArrowLeft className="h-3 w-3 mr-1.5" />Home
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {tabs.map(({ id, label, icon: Icon }) => (
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

        {/* ════════════════════════════════════════
            CONTROL PANEL
        ════════════════════════════════════════ */}
        {tab === 'control' && (
          <div className="space-y-6">

            {/* System overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Clients',   value: clients.length,                                          color: 'text-primary' },
                { label: 'Total Projects',  value: projects.length,                                         color: 'text-cyan-400' },
                { label: 'Audit Reports',   value: auditReports.length,                                     color: 'text-purple-400' },
                { label: 'Synced to Dash',  value: auditReports.filter(r => r.synced_to_metrics).length,   color: 'text-green-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-2xl border border-border bg-card/60 p-4 text-center">
                  <div className={`text-3xl font-black mb-1 ${color}`}>{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            {/* Confidence system info */}
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-primary" />Data Confidence System
              </div>
              <div className="grid sm:grid-cols-4 gap-3">
                {[
                  { range:'80–100%', label:'Verified',  desc:'Two+ independent sources agree.',       color:'text-green-400',      bg:'bg-green-400/10 border-green-400/20' },
                  { range:'50–79%',  label:'Likely',    desc:'Single live source, plausible result.',  color:'text-yellow-400',     bg:'bg-yellow-400/10 border-yellow-400/20' },
                  { range:'1–49%',   label:'Estimated', desc:'AI inference or single weak signal.',    color:'text-orange-400',     bg:'bg-orange-400/10 border-orange-400/20' },
                  { range:'0%',      label:'N/A',       desc:'Cannot be verified — not shown.',        color:'text-muted-foreground',bg:'bg-secondary/30 border-border' },
                ].map(({ range, label, desc, color, bg }) => (
                  <div key={range} className={`rounded-xl border ${bg} p-3`}>
                    <div className={`text-xs font-bold font-mono ${color} mb-1`}>{range} — {label}</div>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit Reports */}
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />All Audit Reports
                </h3>
                <Button size="sm" variant="outline" onClick={loadAuditReports} disabled={loadingReports} className="border-border text-xs h-8">
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingReports ? 'animate-spin' : ''}`} />Refresh
                </Button>
              </div>
              {auditReports.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No audit reports yet. Run analysis in the Analysis tab or use the Audit Tool.
                </p>
              ) : (
                <div className="space-y-2">
                  {auditReports.map(r => {
                    const proj = projects.find(p => p.id === r.project_id);
                    const c    = proj ? clients.find(x => x.id === proj.client_id) : null;
                    const conf = r.overall_score || 0;
                    const confColor = conf >= 75 ? 'text-green-400' : conf >= 50 ? 'text-yellow-400' : 'text-orange-400';
                    return (
                      <div key={r.id} className="rounded-xl border border-border bg-background/40 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{r.url}</div>
                            <div className="text-xs text-muted-foreground mb-1.5">
                              {c ? `${c.company} — ${proj?.name}` : 'Unlinked audit'} ·{' '}
                              {new Date(r.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                            </div>
                            {r.keywords?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {r.keywords.slice(0, 4).map((k: string) => (
                                  <span key={k} className="text-xs bg-secondary/50 border border-border rounded-full px-1.5 py-0.5 text-muted-foreground">{k}</span>
                                ))}
                                {r.keywords.length > 4 && <span className="text-xs text-muted-foreground">+{r.keywords.length - 4} more</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-center">
                              <div className={`text-xl font-black ${confColor}`}>{conf}%</div>
                              <div className="text-xs text-muted-foreground">confidence</div>
                            </div>
                            {r.synced_to_metrics ? (
                              <div className="flex items-center gap-1 text-xs text-green-400 font-mono">
                                <CheckCircle2 className="h-3.5 w-3.5" />Synced to dashboard
                              </div>
                            ) : (
                              <Button size="sm"
                                disabled={syncingId === r.id || !r.project_id}
                                onClick={() => syncAuditToMetrics(r.id)}
                                className="h-8 text-xs bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30">
                                {syncingId === r.id
                                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                                  : 'Sync to Dashboard'}
                              </Button>
                            )}
                          </div>
                        </div>
                        {r.synced_at && (
                          <div className="text-xs text-muted-foreground mt-1.5 font-mono">
                            Synced: {new Date(r.synced_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Per-project confidence overview */}
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />Project Data Status
              </h3>
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No clients yet.</p>
              ) : (
                <div className="space-y-3">
                  {(clients||[]).filter((c:any)=>c?.id).map(c => {
                    const cProjects = projects.filter(p => p.client_id === c.id);
                    if (!cProjects.length) return null;
                    return cProjects.map(proj => {
                      const reports      = auditReports.filter(r => r.project_id === proj.id);
                      const latestReport = reports[0];
                      const hasAnalysis  = !!proj.last_analysis_at;
                      const hasDash      = !!latestReport?.synced_to_metrics;
                      const hasLaunchpad = !!proj.launchpad_generated_at;
                      return (
                        <div key={proj.id} className="rounded-xl border border-border bg-background/40 p-3">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <div className="text-sm font-medium">{c.company} — {proj.name}</div>
                              <div className="text-xs text-muted-foreground">{proj.url}</div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 shrink-0">
                              <span className={`text-xs font-mono flex items-center gap-1 px-2 py-0.5 rounded-full border ${hasAnalysis ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-muted-foreground bg-secondary/30 border-border'}`}>
                                {hasAnalysis ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Info className="h-2.5 w-2.5" />}
                                {hasAnalysis ? 'Analysed' : 'No analysis'}
                              </span>
                              <span className={`text-xs font-mono flex items-center gap-1 px-2 py-0.5 rounded-full border ${hasDash ? 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' : 'text-muted-foreground bg-secondary/30 border-border'}`}>
                                {hasDash ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Info className="h-2.5 w-2.5" />}
                                {hasDash ? 'Dashboard live' : 'Dashboard empty'}
                              </span>
                              <span className={`text-xs font-mono flex items-center gap-1 px-2 py-0.5 rounded-full border ${hasLaunchpad ? 'text-purple-400 bg-purple-400/10 border-purple-400/20' : 'text-muted-foreground bg-secondary/30 border-border'}`}>
                                {hasLaunchpad ? <Rocket className="h-2.5 w-2.5" /> : <Info className="h-2.5 w-2.5" />}
                                {hasLaunchpad ? 'Launchpad live' : 'No launchpad'}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { l:'Audit Reports',    v: reports.length },
                              { l:'Synced',           v: reports.filter(r=>r.synced_to_metrics).length },
                              { l:'Best Confidence',  v: latestReport ? `${latestReport.overall_score||0}%` : '—' },
                            ].map(({ l, v }) => (
                              <span key={l} className="text-xs text-muted-foreground bg-secondary/30 rounded-full px-2 py-0.5">
                                {l}: <strong className="text-foreground">{v}</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            CLIENTS
        ════════════════════════════════════════ */}
        {tab === 'clients' && (
          <div className="grid lg:grid-cols-2 gap-6">

            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />Register New Client
              </h2>
              <div className="space-y-3">
                {[
                  { key:'name',            label:'Client Name',           placeholder:'John Smith' },
                  { key:'company',         label:'Company',               placeholder:'Acme Corp' },
                  { key:'industry',        label:'Industry',              placeholder:'E-commerce, SaaS...' },
                  { key:'website',         label:'Website',               placeholder:'https://example.com' },
                  { key:'email',           label:'Email',                 placeholder:'client@email.com' },
                  { key:'retainer_amount', label:'Monthly Retainer ($)',  placeholder:'1500' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className={lc}>{label}</Label>
                    <Input placeholder={placeholder} value={(clientForm as any)[key]}
                      onChange={e => setClientForm(f => ({ ...f, [key]: e.target.value }))} className={ic} />
                  </div>
                ))}
                <Button onClick={createClient} disabled={loading}
                  className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" />Create Client
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                {projectStep === 'basics' ? 'Add Project to Client' : '🧠 Tell Brain About This Project'}
              </h2>

              {/* Step indicator */}
              <div style={{display:'flex',gap:6,marginBottom:16}}>
                {['basics','intelligence'].map((s,i) => (
                  <div key={s} style={{flex:1,height:3,borderRadius:2,background:
                    s===projectStep?'#6366f1':i<(['basics','intelligence'].indexOf(projectStep))?'#10b981':'rgba(255,255,255,0.1)'}}/>
                ))}
              </div>

              {projectStep === 'basics' ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className={lc}>Select Client</Label>
                    <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
                      className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3">
                      <option value="">— Choose client —</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.company}</option>)}
                    </select>
                  </div>
                  {[
                    { key:'name',        label:'Project Name',                       placeholder:'Main Website' },
                    { key:'url',         label:'Website URL',                        placeholder:'https://example.com' },
                    { key:'keywords',    label:'Target Keywords (comma separated)',   placeholder:'seo software, rank tracker' },
                    { key:'competitors', label:'Competitor URLs (comma separated)',   placeholder:'competitor1.com, competitor2.com' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1">
                      <Label className={lc}>{label}</Label>
                      <Input placeholder={placeholder} value={(projectForm as any)[key]}
                        onChange={e => setProjectForm(f => ({ ...f, [key]: e.target.value }))} className={ic} />
                    </div>
                  ))}
                  <Button onClick={createProject} disabled={loading}
                    className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                    <Plus className="h-4 w-4 mr-2" />Create & Brief Brain →
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p style={{fontSize:12,color:'rgba(255,255,255,0.5)',lineHeight:1.6,margin:0}}>
                    Brain permanently stores these answers as project intelligence. Every future response uses this context.
                    <strong style={{color:'rgba(165,180,252,0.8)'}}> Answers stored as active Brain Learnings — Brain never forgets.</strong>
                  </p>
                  {([
                    { key:"business_goal", q:"What is the single most important business outcome in 90 days?",
                      opts:["Rank on page 1 for 3+ target keywords","Increase organic traffic 30%+","Get cited in AI search (Perplexity/ChatGPT)","Generate B2B leads from organic","Beat a specific competitor","Recover from Google core update penalty"] },
                    { key:"biggest_blocker", q:"What is the single biggest obstacle between you and that goal?",
                      opts:["Technical issues blocking indexation","Content too thin or not targeting right keywords","No backlinks / low domain authority","Site too slow for ranking competition","AI search not citing us at all","Not sure — have not audited yet"] },
                    { key:"target_audience", q:"Who is the person making the buying decision?",
                      opts:["IT Manager / CTO at mid-market company","Marketing Director at enterprise","Founder / CEO of SMB","Operations Manager replacing paper processes","Individual consumer researching a purchase","Mixed audience"] },
                    { key:"cms_platform", q:"What CMS or platform is the site on?",
                      opts:["HubSpot","WordPress + Yoast/RankMath","Webflow","Shopify","Custom build","Wix / Squarespace / Other"] },
                    { key:"current_ranking", q:"Where do most important pages rank today?",
                      opts:["Not ranking at all (page 5+)","Page 2-4 (positions 11-40)","Page 1 bottom half (6-10)","Page 1 top half (1-5)","Mixed — some ranking, some not","No idea — have not checked yet"] },
                    { key:"monthly_traffic", q:"Current organic monthly sessions (estimate)?",
                      opts:["0-500 (just starting)","500-2,000","2,000-10,000","10,000-50,000","50,000+ (established)","Unknown — no analytics access"] },
                    { key:"timeline", q:"What is the real deadline for results?",
                      opts:["30 days — critical business milestone","60 days — seasonal peak approaching","90 days — quarterly target","6 months — strategic growth target","12 months — long-term investment","No hard deadline"] },
                    { key:"past_seo", q:"What SEO has been tried before that did NOT work?",
                      opts:["Keyword stuffing or exact match overuse","Bought backlinks that got penalised","Published lots of low-quality content fast","Agency work that moved nothing","Nothing — this is the first SEO effort"] },
                  ] as {key:string;q:string;opts:string[]}[]).map(({key, q, opts}) => (
                    <div key={key}>
                      <div style={{fontSize:12,color:'rgba(255,255,255,0.75)',fontWeight:600,marginBottom:8,lineHeight:1.4}}>{q}</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                        {opts.map(opt => (
                          <button key={opt}
                            onClick={() => setIntelAnswers(a => ({...a, [key]: a[key]===opt?'':opt}))}
                            style={{padding:'5px 11px',fontSize:10,fontFamily:'monospace',borderRadius:6,cursor:'pointer',transition:'all 0.15s',
                              background: intelAnswers[key]===opt?'rgba(99,102,241,0.22)':'rgba(255,255,255,0.03)',
                              border: `1px solid ${intelAnswers[key]===opt?'rgba(99,102,241,0.55)':'rgba(255,255,255,0.09)'}`,
                              color: intelAnswers[key]===opt?'#c7d2fe':'rgba(255,255,255,0.5)'}}>
                            {intelAnswers[key]===opt?'✓ ':''}{opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{display:'flex',gap:8,paddingTop:4}}>
                    <button onClick={saveIntelligence} disabled={loading} style={{flex:1,padding:'10px',fontSize:11,fontFamily:'monospace',fontWeight:700,borderRadius:8,cursor:'pointer',background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',color:'white',boxShadow:'0 0 16px rgba(99,102,241,0.4)'}}>
                      🧠 Save to Brain & Activate
                    </button>
                    <button onClick={()=>{setProjectStep('basics');setProjectForm({name:'',url:'',keywords:'',competitors:''});setIntelAnswers({});setNewProjId(null);}}
                      style={{padding:'10px 14px',fontSize:10,fontFamily:'monospace',borderRadius:8,cursor:'pointer',background:'none',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.4)'}}>
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4">All Clients ({clients.length})</h2>
              {clients.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No clients yet.</p>}
              <div className="space-y-2">
                {clients.map(client => (
                  <div key={client.id} className="rounded-xl border border-border bg-background/40">
                    <button onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left">
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
                          <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Globe className="h-3 w-3 text-primary shrink-0" />
                              <span className="font-medium text-foreground">{p.name}</span>
                              <span>—</span>
                              <span>{p.url}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {p.last_analysis_at && (
                                <span className="text-xs text-green-400 font-mono">
                                  ✓ {Math.round((Date.now() - new Date(p.last_analysis_at).getTime()) / (1000*60*60*24))}d ago
                                </span>
                              )}
                              {p.launchpad_generated_at && (
                                <span className="text-xs text-purple-400 font-mono">🚀 launchpad</span>
                              )}
                            </div>
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

        {/* ════════════════════════════════════════
            RUN ANALYSIS
        ════════════════════════════════════════ */}
        {tab === 'metrics' && (
          <div className="max-w-3xl space-y-5">

            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-1 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />4-Agent AI Analysis
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Runs Technical Crawler, Content Analyser, AI Visibility Tester, and Ranking Agent simultaneously.
                Results are cross-verified and saved as an audit report. Review then push to client dashboard.
              </p>
              <div className="space-y-3">
                <ProjectSelector />

                {lastInfo && (
                  <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-mono text-green-400 uppercase tracking-wider">Last Analysis — Auto Loaded</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{lastInfo.dateStr} · {lastInfo.ago}</div>
                    </div>
                    <span className="text-xs text-green-400 font-mono bg-green-400/10 px-2 py-1 rounded-full">✓ Saved</span>
                  </div>
                )}

                {!lastInfo && selectedProject && (
                  <div className="rounded-xl border border-border bg-background/40 p-3 text-xs text-muted-foreground">
                    No saved analysis for this project yet.
                  </div>
                )}

                <Button onClick={runAIAnalysis} disabled={fetchingAI || !selectedProject}
                  className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                  {fetchingAI ? (
                    <span className="flex items-center gap-3">
                      <RefreshCw className="h-4 w-4 animate-spin" />Running 4-agent cross-verified analysis...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {lastInfo ? 'Re-run Analysis' : 'Run Full Analysis'}
                    </span>
                  )}
                </Button>

                {fetchingAI && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['Technical','Content','AI Visibility','Rankings'].map((a,i) => (
                      <div key={a} className="rounded-lg border border-border bg-background/40 p-2 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay:`${i*0.25}s` }} />
                          <span className="text-xs font-mono text-primary">Running</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{a}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* AI result preview */}
            {aiResult && (
              <div className="space-y-4">

                <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-yellow-400 mb-1">Review Before Pushing to Dashboard</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Overall confidence: <span className="font-bold text-foreground">{aiResult?.overall_confidence ?? 0}%</span>.
                      Verified data shown in <span className="text-green-400 font-semibold">green</span>.
                      Estimated data in <span className="text-yellow-400 font-semibold">yellow</span>.
                      Edit any value, then save to dashboard.
                    </p>
                  </div>
                </div>

                {/* Cross-verification results */}
                {Object.keys(aiResult?.cross_verifications || {}).length > 0 && (
                  <div className="rounded-2xl border border-border bg-card/60 p-4">
                    <div className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />Cross-Verification Results
                    </div>
                    <div className="space-y-2">
                      {Object.entries(aiResult?.cross_verifications).map(([key, v]: [string, any]) => (
                        <div key={key} className={`rounded-lg border p-3 ${v.agreement ? 'border-green-400/20 bg-green-400/5' : 'border-yellow-400/20 bg-yellow-400/5'}`}>
                          <div className="flex items-center gap-2 mb-0.5">
                            {v.agreement
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                              : <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />}
                            <span className={`text-xs font-semibold ${v.agreement ? 'text-green-400' : 'text-yellow-400'}`}>
                              {v.agreement ? 'Agents agree' : 'Agents diverge'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{v.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Score preview */}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="font-semibold text-sm">Analysis Preview</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(aiResult?.fetched_at).toLocaleString()}
                    </span>
                  </div>

                  {aiResult?.synthesis?.overall_verdict && (
                    <div className="rounded-xl border border-border bg-background/60 p-3 mb-4">
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Verdict</div>
                      <p className="text-sm">{aiResult?.synthesis?.overall_verdict}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
                    {[
                      { label:'LLM Score',     v:aiResult.analysis?.llm_visibility_score,    verified:true },
                      { label:'Google Health', v:aiResult.analysis?.algorithm_health_score,  verified:true },
                      { label:'E-E-A-T',       v:aiResult.analysis?.eeat_score,              verified:true },
                      { label:'Authority',     v:aiResult.analysis?.content_authority_score, verified:true },
                      { label:'ChatGPT',       v:aiResult.analysis?.chatgpt_citations,       verified:false },
                    ].map(({ label, v, verified }) => {
                      const col = v == null ? 'text-muted-foreground' : v >= 70 ? 'text-green-400' : v >= 40 ? 'text-yellow-400' : 'text-orange-400';
                      return (
                        <div key={label} className="rounded-xl border border-border bg-background/40 p-3 text-center">
                          <div className={`text-xl font-bold ${col}`}>{v ?? '—'}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                          {!verified && <div className="text-xs text-yellow-400 font-mono">~est</div>}
                          {verified && v !== null && <div className="text-xs text-green-400 font-mono">✓live</div>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Keyword rankings */}
                  {aiResult.analysis?.keyword_rankings?.length > 0 && (
                    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 mb-4">
                      <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-3">
                        Keyword Rankings — Live Google SERP ✓
                      </div>
                      <div className="space-y-2">
                        {(aiResult?.analysis?.keyword_rankings || []).map((k: any, i: number) => {
                          const col = !k.found ? 'text-orange-400' : k.page===1 ? 'text-green-400' : k.page===2 ? 'text-yellow-400' : 'text-orange-400';
                          const bg  = !k.found ? 'bg-orange-400/5 border-orange-400/20' : k.page===1 ? 'bg-green-400/5 border-green-400/20' : k.page===2 ? 'bg-yellow-400/5 border-yellow-400/20' : 'bg-orange-400/5 border-orange-400/20';
                          return (
                            <div key={i} className={`rounded-lg border ${bg} px-3 py-2 flex items-center justify-between`}>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold truncate">"{k.keyword}"</div>
                                {k.snippet && <div className="text-xs text-muted-foreground mt-0.5 truncate">{k.snippet}</div>}
                              </div>
                              <div className={`text-xs font-mono font-bold ${col} shrink-0 ml-3`}>
                                {k.positionLabel || (k.found ? `~${k.position}` : 'Not in top 30')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {aiResult.synthesis?.data_limitations_summary && (
                    <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-1">Verification Limitations</div>
                        <p className="text-xs text-muted-foreground">{aiResult.synthesis.data_limitations_summary}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Edit & Save form */}
                <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-5">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Save className="h-4 w-4 text-primary" />Review and Push to Dashboard
                  </h3>

                  <div>
                    <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-400" />Verified Scores — AI analysis of live content
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
                          <Input value={metricsForm[key]}
                            onChange={e => setMetricsForm((f: any) => ({ ...f, [key]: e.target.value }))}
                            className="h-10 bg-background/60 border-green-400/25 text-sm" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />Verified Live Data
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key:'pages_indexed',        label:'Pages Indexed (Google ✓)' },
                        { key:'pages_submitted',      label:'Pages in Sitemap (✓)' },
                        { key:'brand_mentions',       label:'Brand Mentions (Google ✓)' },
                        { key:'perplexity_citations', label:'Perplexity (Live test ✓)' },
                        { key:'google_ai_citations',  label:'Google AI (not verifiable)' },
                        { key:'competitor_rank',      label:'Content Rank vs Competitors' },
                        { key:'competitors_beaten',   label:'Competitors Outperformed' },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs font-medium text-cyan-400/80 uppercase tracking-wider">{label}</Label>
                          <Input value={metricsForm[key]}
                            onChange={e => setMetricsForm((f: any) => ({ ...f, [key]: e.target.value }))}
                            className="h-10 bg-background/60 border-cyan-400/25 text-sm" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-yellow-400" />Estimated Only — No External API
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key:'chatgpt_citations', label:'ChatGPT (~estimated only)' },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs font-medium text-yellow-400/80 uppercase tracking-wider">{label}</Label>
                          <Input value={metricsForm[key]}
                            onChange={e => setMetricsForm((f: any) => ({ ...f, [key]: e.target.value }))}
                            className="h-10 bg-background/60 border-yellow-400/25 text-sm" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      { key:'llm_platforms',       label:'LLM Platforms (comma separated)',       placeholder:'ChatGPT, Perplexity, Google AI' },
                      { key:'competitor_gap_note', label:'Competitive Intel (shown to client)',    placeholder:'Now outranking competitor.com for 3 keywords' },
                      { key:'milestone',           label:'Big Win Headline',                      placeholder:'Featured in Google AI Overviews' },
                      { key:'milestone_impact',    label:'Why It Matters',                        placeholder:'Buyers find your brand through AI' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key} className="space-y-1">
                        <Label className={lc}>{label}</Label>
                        <Input placeholder={placeholder} value={metricsForm[key]}
                          onChange={e => setMetricsForm((f: any) => ({ ...f, [key]: e.target.value }))}
                          className={ic} />
                      </div>
                    ))}
                    <div className="space-y-1">
                      <Label className={lc}>Report Date</Label>
                      <Input type="date" value={metricsForm.recorded_at}
                        onChange={e => setMetricsForm((f: any) => ({ ...f, recorded_at: e.target.value }))}
                        className={ic} />
                    </div>
                  </div>

                  <Button onClick={saveMetrics} disabled={loading}
                    className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? 'Saving...' : 'Push to Client Dashboard'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            UPSELLS
        ════════════════════════════════════════ */}
        {tab === 'upsells' && (
          <div className="max-w-lg">
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />Create Upsell Offer
              </h2>
              <div className="space-y-3">
                <ProjectSelector />
                {[
                  { key:'title',            label:'Offer Title',        placeholder:'AI Search Domination Package' },
                  { key:'description',      label:'Description',        placeholder:'You are visible in 3 AI platforms...' },
                  { key:'price',            label:'Price ($)',           placeholder:'499' },
                  { key:'potential_impact', label:'What Client Gains',   placeholder:'Featured in ChatGPT for 50+ queries' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className={lc}>{label}</Label>
                    <Input placeholder={placeholder} value={(upsellForm as any)[key]}
                      onChange={e => setUpsellForm(f => ({ ...f, [key]: e.target.value }))} className={ic} />
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

        {/* ════════════════════════════════════════
            LAUNCHPAD
        ════════════════════════════════════════ */}
        {tab === 'launchpad' && (
          <div className="max-w-2xl space-y-5">
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-1 flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />Generate Executive Strategy Launchpad
              </h2>
              <p className="text-xs text-muted-foreground mb-5">
                Uses verified audit data and real metrics to generate the client's strategy portal.
                No re-crawling — pulls from saved analysis.
              </p>

              <div className="space-y-4">
                <ProjectSelector />

                {/* Phase selector */}
                <div className="space-y-2">
                  <Label className={lc}>Current Campaign Phase (1–5)</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      {n:1,label:'Foundation'},{n:2,label:'Architecture'},
                      {n:3,label:'Authority'},{n:4,label:'Validation'},{n:5,label:'Dominance'},
                    ].map(({n,label}) => (
                      <button key={n} onClick={() => setLaunchpadPhase(n)}
                        className={`rounded-xl border p-3 text-center transition-all ${
                          launchpadPhase===n
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background/40 text-muted-foreground hover:border-primary/50'
                        }`}>
                        <div className="text-lg font-bold">{n}</div>
                        <div className="text-xs leading-tight">{label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className={lc}>Months Active with This Client</Label>
                  <Input type="number" min="1" max="36" value={launchpadMonths}
                    onChange={e => setLaunchpadMonths(parseInt(e.target.value)||1)}
                    className={ic} placeholder="1" />
                </div>

                <div className="space-y-1">
                  <Label className={lc}>What You're Actually Doing Right Now (Phase Context)</Label>
                  <textarea value={launchpadContext} onChange={e => setLaunchpadContext(e.target.value)}
                    rows={4}
                    placeholder="e.g. Completed competitor content gap audit. Building FAQ pages for top 5 keywords. Identified competitor has 40+ AI Overview appearances..."
                    className="w-full rounded-lg border border-border bg-background/60 text-sm px-3 py-2.5 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                  />
                </div>

                {!generatingLaunchpad ? (
                  <Button onClick={generateLaunchpad} disabled={!selectedProject}
                    className="w-full h-12 bg-gradient-to-r from-primary to-purple-500 text-white font-semibold">
                    <Rocket className="h-4 w-4 mr-2" />Generate & Publish Launchpad
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 text-primary animate-spin" />
                          <span className="text-sm font-semibold">Generating...</span>
                        </div>
                        <span className="text-sm font-mono text-primary">{launchpadTimer}s</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-background/60 overflow-hidden mb-3">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-1000"
                          style={{ width:`${Math.min(95,(launchpadTimer/60)*100)}%` }} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-center">
                        {[
                          { label:'Loading data',    done:launchpadTimer>3 },
                          { label:'AI analysis',     done:launchpadTimer>15 },
                          { label:'Building report', done:launchpadTimer>30 },
                        ].map(({label,done}) => (
                          <div key={label} className={`rounded-lg border px-2 py-1.5 transition-colors ${done?'border-green-400/30 bg-green-400/10 text-green-400':'border-border text-muted-foreground'}`}>
                            {done?'✓':''} {label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {launchpadError && !generatingLaunchpad && (
                  <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-red-400 mb-1">Generation Failed</div>
                        <p className="text-xs text-muted-foreground">{launchpadError}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Launchpad preview */}
            {launchpadPreview?.dashboard && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span className="font-semibold text-sm">Live on Client Portal</span>
                  {launchpadPreview.generated_at && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(launchpadPreview.generated_at).toLocaleString()}
                    </span>
                  )}
                </div>
                {launchpadPreview.dashboard?.executive_dashboard?.strategic_timeline && (
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <div className="text-xs font-mono text-primary uppercase tracking-wider mb-2">Strategic Timeline</div>
                    <div className="font-bold text-sm">
                      {launchpadPreview.dashboard.executive_dashboard.strategic_timeline.current_phase_name}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {launchpadPreview.dashboard.executive_dashboard.strategic_timeline.completion_percentage}% complete
                    </div>
                  </div>
                )}
                {launchpadPreview.dashboard?.executive_dashboard?.accelerator_upsells?.length > 0 && (
                  <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-4">
                    <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-3">
                      {launchpadPreview.dashboard.executive_dashboard.accelerator_upsells.length} Accelerators Generated
                    </div>
                    {launchpadPreview.dashboard.executive_dashboard.accelerator_upsells.map((u:any,i:number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                        <div>
                          <div className="text-sm font-medium">{u.opportunity_name}</div>
                          <div className="text-xs text-muted-foreground">{u.timeline}</div>
                        </div>
                        <span className="text-sm text-primary font-mono font-bold">${u.investment_price?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <a href="/launchpad" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline font-mono flex items-center gap-1">
                    <Rocket className="h-3.5 w-3.5" />View Client Launchpad
                  </a>
                  <span className="text-muted-foreground text-xs">·</span>
                  <a href="/dashboard" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground font-mono">
                    View Dashboard
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            APPROVALS
        ════════════════════════════════════════ */}
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
                          <Label className={lc}>Link to Client(s) — hold Ctrl/Cmd for multiple</Label>
                          <select id={`cs-${user.id}`} multiple size={Math.min(clients.length+1, 5)}
                            className="w-full rounded-md border border-border bg-background/60 text-xs px-2 py-1">
                            {(clients||[]).filter((c:any)=>c?.id).map(c => (
                              <option key={c.id} value={c.id}>{c.name} — {c.company}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Button size="sm"
                        onClick={() => {
                          const sel = document.getElementById(`cs-${user.id}`) as HTMLSelectElement;
                          const selected = Array.from(sel?.selectedOptions||[]).map(o => o.value);
                          approveUser(user.id, selected);
                        }}
                        className="bg-green-500 hover:bg-green-600 text-white shrink-0 mt-6">
                        <CheckCircle className="h-3 w-3 mr-1.5" />Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            STAFF & PM
        ════════════════════════════════════════ */}
        {tab === 'staff' && (
          <div className="space-y-6">

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label:'Active Staff', value: staff.filter((s:any)=>s.is_active!==false).length, color:'text-primary' },
                { label:'PMs',         value: staff.filter((s:any)=>s.role==='pm').length,         color:'text-cyan-400' },
                { label:'Pending',     value: pendingUsers.length,                                 color:'text-yellow-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-2xl border border-border bg-card/60 p-4 text-center">
                  <div className={`text-3xl font-black mb-1 ${color}`}>{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">

              {/* ── CREATE PM ACCOUNT ── */}
              <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-4">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />Create PM Login
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Creates a staff record with PM permissions and sends a magic-link sign-in email.
                  PM lands on <span className="font-mono text-primary">/pm</span> automatically.
                </p>

                {/* Basic info */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key:'name',     label:'Full Name',   placeholder:'Sarah Johnson' },
                    { key:'email',    label:'Work Email',  placeholder:'sarah@yourteam.com' },
                    { key:'timezone', label:'Timezone',    placeholder:'Europe/London' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className={`space-y-1 ${key === 'email' ? 'col-span-2' : ''}`}>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
                      <input
                        className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3 text-foreground"
                        placeholder={placeholder}
                        value={(pmForm as any)[key]}
                        onChange={e => setPmForm(f => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</label>
                    <select
                      className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3 text-foreground"
                      value={pmForm.role}
                      onChange={e => setPmForm(f => ({ ...f, role: e.target.value }))}
                    >
                      <option value="pm">Project Manager</option>
                      <option value="seo">SEO Specialist</option>
                      <option value="content">Content Writer</option>
                      <option value="analyst">Analyst</option>
                    </select>
                  </div>
                </div>

                {/* Permissions */}
                <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Key className="h-3.5 w-3.5" />Permissions
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setPmPerms(Object.fromEntries(Object.keys(pmPerms).map(k=>[k,true])) as any)}
                        className="text-xs text-primary hover:underline font-mono">all on</button>
                      <span className="text-muted-foreground text-xs">·</span>
                      <button onClick={() => setPmPerms(Object.fromEntries(Object.keys(pmPerms).map(k=>[k,false])) as any)}
                        className="text-xs text-muted-foreground hover:underline font-mono">all off</button>
                      <span className="text-muted-foreground text-xs">·</span>
                      <button onClick={() => setPmPerms({
                        dashboard:true, playground:true, data_room:true, audit_tools:true,
                        morning_brief:true, algorithm_intel:false, brain_learning:false,
                        system_control:false, bde_panel:false, staff_command:false, lead_intel:false,
                      })}
                        className="text-xs text-cyan-400 hover:underline font-mono">PM preset</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PM_PERM_LABELS).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer group">
                        <div
                          onClick={() => setPmPerms(p => ({ ...p, [key]: !p[key as keyof typeof p] }))}
                          className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                            (pmPerms as any)[key]
                              ? 'bg-primary border-primary'
                              : 'border-border bg-background/60 group-hover:border-primary/50'
                          }`}
                        >
                          {(pmPerms as any)[key] && (
                            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-xs transition-colors ${(pmPerms as any)[key] ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* What PM can access summary */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="text-xs font-mono text-primary mb-2">PM will see:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(pmPerms).filter(([,v])=>v).map(([k]) => (
                      <span key={k} className="text-xs bg-primary/10 border border-primary/20 text-primary rounded-full px-2 py-0.5 font-mono">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={createPmAccount}
                  disabled={creatingPm || !pmForm.name || !pmForm.email}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
                >
                  {creatingPm ? (
                    <><RefreshCw className="h-4 w-4 animate-spin" />Creating account & sending invite...</>
                  ) : (
                    <><Mail className="h-4 w-4" />Create Account & Send Magic Link</>
                  )}
                </button>

                {inviteSent && (
                  <div className="rounded-xl border border-green-400/30 bg-green-400/5 p-4 flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-green-400 mb-1">Account created & invite sent!</div>
                      <p className="text-xs text-muted-foreground">
                        PM will receive a magic link to sign in. On first click they land on <span className="font-mono text-primary">/pm</span> with full PM access.
                        Link expires in 1 hour — resend from the staff list if needed.
                      </p>
                    </div>
                  </div>
                )}

                {inviteLink && !inviteSent && (
                  <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-4">
                    <div className="text-xs font-mono text-yellow-400 mb-2">Email failed — share this login URL manually:</div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-background/60 border border-border rounded px-2 py-1 flex-1 truncate">{inviteLink}</code>
                      <button onClick={() => { navigator.clipboard.writeText(inviteLink); toast({ title:'Copied!' }); }}
                        className="h-8 px-3 rounded-lg border border-border bg-background/60 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                        <Copy className="h-3 w-3" />Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── STAFF LIST ── */}
              <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />Staff Members ({staff.length})
                  </h2>
                  <button onClick={fetchAll} className="h-8 w-8 rounded-lg border border-border bg-background/60 flex items-center justify-center text-muted-foreground hover:text-foreground">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>

                {staff.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-background/40 p-8 text-center text-muted-foreground text-sm">
                    No staff yet — create the first PM above.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {staff.map((s: any) => {
                      const isEditing = editingStaffId === s.id;
                      const permCount = Object.values(s.permissions || {}).filter(Boolean).length;
                      const roleColors: Record<string, string> = {
                        pm: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
                        seo: 'text-green-400 bg-green-400/10 border-green-400/20',
                        content: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
                        analyst: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
                        bde: 'text-primary bg-primary/10 border-primary/20',
                      };
                      const roleColor = roleColors[s.role] || 'text-muted-foreground bg-secondary/30 border-border';
                      return (
                        <div key={s.id} className="rounded-xl border border-border bg-background/40 overflow-hidden">
                          <div className="p-3 flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                              {(s.avatar_initials || s.name?.[0] || '?').toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{s.name}</span>
                                <span className={`text-xs font-mono px-2 py-0.5 rounded-full border flex-shrink-0 ${roleColor}`}>
                                  {s.role}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground truncate">{s.email || 'No email'}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-muted-foreground font-mono">{permCount} perms</span>
                              <button
                                onClick={() => {
                                  if (isEditing) { setEditingStaffId(null); }
                                  else { setEditingStaffId(s.id); setEditPerms(s.permissions || {}); }
                                }}
                                className={`h-7 px-2 rounded-lg border text-xs flex items-center gap-1 transition-colors ${isEditing ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'}`}
                              >
                                <Key className="h-3 w-3" />{isEditing ? 'Cancel' : 'Edit'}
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm(`Resend magic link to ${s.email}?`)) return;
                                  const { error } = await supabase.auth.signInWithOtp({ email: s.email, options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/pm` } });
                                  if (error) toast({ title: 'Failed to send', description: error.message, variant: 'destructive' });
                                  else toast({ title: `Magic link sent to ${s.email}` });
                                }}
                                disabled={!s.email}
                                className="h-7 px-2 rounded-lg border border-border bg-background/60 text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              >
                                <Mail className="h-3 w-3" />Resend
                              </button>
                            </div>
                          </div>

                          {/* Permission editor */}
                          {isEditing && (
                            <div className="px-3 pb-3 border-t border-border pt-3 space-y-3">
                              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Edit permissions</div>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(PM_PERM_LABELS).map(([key, label]) => (
                                  <label key={key} className="flex items-center gap-2 cursor-pointer group">
                                    <div
                                      onClick={() => setEditPerms(p => ({ ...p, [key]: !p[key] }))}
                                      className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                                        editPerms[key] ? 'bg-primary border-primary' : 'border-border bg-background/60'
                                      }`}
                                    >
                                      {editPerms[key] && (
                                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </div>
                                    <span className={`text-xs ${editPerms[key] ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                                  </label>
                                ))}
                              </div>
                              <button
                                onClick={() => saveStaffPerms(s.id)}
                                className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-2"
                              >
                                <Save className="h-3.5 w-3.5" />Save Permissions
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pending approvals reminder */}
                {pendingUsers.length > 0 && (
                  <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3 flex items-center justify-between">
                    <div className="text-xs text-yellow-400 flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {pendingUsers.length} pending user approval{pendingUsers.length > 1 ? 's' : ''}
                    </div>
                    <button onClick={() => setTab('approve')} className="text-xs text-yellow-400 hover:underline font-mono">
                      Go to Approvals →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── PM WORKFLOW GUIDE ── */}
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />End-to-End PM Workflow
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    step:'1', color:'text-primary border-primary/30 bg-primary/5',
                    title:'Create Client & Project',
                    desc:'Clients tab → Register client → Add project with URL, keywords, competitors → Brain intelligence questionnaire.',
                    action:'Go to Clients', tab:'clients',
                  },
                  {
                    step:'2', color:'text-cyan-400 border-cyan-400/30 bg-cyan-400/5',
                    title:'Connect Data Sources',
                    desc:'Project → Data Room → Connect GSC and GA4. This unlocks authentic ranking data across all pipelines.',
                    action:'Go to Dashboard', tab:'control',
                  },
                  {
                    step:'3', color:'text-purple-400 border-purple-400/30 bg-purple-400/5',
                    title:'Run the Pipeline',
                    desc:'PM Module → SEO Campaigns tab → New Campaign → keyword → Run Rank-for-Keyword pipeline. All 8 steps produce deliverables.',
                    action:'Open PM Module', tab:null, href:'/pm',
                  },
                  {
                    step:'4', color:'text-green-400 border-green-400/30 bg-green-400/5',
                    title:'Monitor & Deliver',
                    desc:'Monitoring pillar runs automatically. Board view tracks tasks. Documents tab holds all client-ready artifacts.',
                    action:'Go to PM Module', tab:null, href:'/pm',
                  },
                ].map(({ step, color, title, desc, action, tab: t, href }) => (
                  <div key={step} className={`rounded-xl border ${color} p-4 space-y-3`}>
                    <div className="flex items-center gap-2">
                      <div className={`h-7 w-7 rounded-full border ${color} flex items-center justify-center text-sm font-black`}>{step}</div>
                      <div className="text-sm font-semibold leading-tight">{title}</div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className={`text-xs font-mono hover:underline ${color.split(' ')[0]}`}>
                        {action} →
                      </a>
                    ) : (
                      <button onClick={() => setTab(t as any)} className={`text-xs font-mono hover:underline ${color.split(' ')[0]}`}>
                        {action} →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}