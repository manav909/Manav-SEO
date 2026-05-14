/**
 * ProjectDataBanner — shows when critical project data is missing.
 * Displayed on Oval and Mission Control.
 * Brain quality degrades without: CMS, keywords, goals, competitors.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, X, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProject } from '@/contexts/ProjectContext';

interface Props { project: any; onSave?: () => void; }

export function ProjectDataBanner({ project, onSave }: Props) {
  const navigate  = useNavigate();
  const { refreshBrainContext } = useProject();
  const [dismissed, setDismissed] = useState(false);
  const [editMode,  setEditMode]  = useState(false);
  const [saving,    setSaving]    = useState(false);

  const [cms,         setCms]         = useState(project?.cms || '');
  const [seoPlugin,   setSeoPlugin]   = useState(project?.seo_plugin || '');
  const [keywords,    setKeywords]    = useState((project?.keywords || []).join(', '));
  const [goals,       setGoals]       = useState(project?.goals || '');
  const [competitors, setCompetitors] = useState((project?.competitors || []).join(', '));

  if (!project || dismissed) return null;

  const gaps: { field: string; label: string; critical: boolean }[] = [];
  if (!project.cms)              gaps.push({ field: 'cms',      label: 'CMS Platform',   critical: true  });
  if (!project.keywords?.length) gaps.push({ field: 'keywords', label: 'Keywords',        critical: true  });
  if (!project.goals)            gaps.push({ field: 'goals',    label: 'Goals',           critical: false });
  if (!project.competitors?.length) gaps.push({ field: 'competitors', label: 'Competitors', critical: false });

  if (gaps.length === 0) return null;

  const criticalCount = gaps.filter(g => g.critical).length;

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from('projects').update({
        cms:         cms.trim() || null,
        seo_plugin:  seoPlugin.trim() || null,
        keywords:    keywords.split(',').map((k: string) => k.trim()).filter(Boolean),
        goals:       goals.trim() || null,
        competitors: competitors.split(',').map((c: string) => c.trim()).filter(Boolean),
      }).eq('id', project.id);
      await refreshBrainContext();
      onSave?.();
      setEditMode(false);
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (editMode) {
    return (
      <div className="mx-4 mt-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-amber-400"/>
            <span className="text-xs font-semibold text-amber-400">Fill Brain gaps for <em>{project.name}</em></span>
          </div>
          <button onClick={() => setEditMode(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5"/>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'CMS Platform', value: cms, set: setCms, ph: 'WordPress / HubSpot / Webflow…', imp: 'HIGH' },
            { label: 'SEO Plugin',   value: seoPlugin, set: setSeoPlugin, ph: 'Yoast / RankMath / none', imp: '' },
          ].map(({ label, value, set, ph, imp }) => (
            <div key={label}>
              <div className="flex items-center gap-1 mb-1">
                <label className="text-[10px] text-muted-foreground/70">{label}</label>
                {imp && <span className="text-[8px] px-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">{imp}</span>}
              </div>
              <input value={value} onChange={e => set(e.target.value)} placeholder={ph}
                className="w-full h-7 rounded-lg border border-border/40 bg-background/60 px-2.5 text-xs outline-none focus:border-amber-400/40"/>
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="text-[10px] text-muted-foreground/70 mb-1 block flex items-center gap-1">
              Keywords <span className="text-[8px] px-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">HIGH</span>
            </label>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="keyword1, keyword2, keyword3…"
              className="w-full h-7 rounded-lg border border-border/40 bg-background/60 px-2.5 text-xs outline-none focus:border-amber-400/40"/>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] text-muted-foreground/70 mb-1 block">Competitors (comma separated)</label>
            <input value={competitors} onChange={e => setCompetitors(e.target.value)} placeholder="competitor.com, another.io…"
              className="w-full h-7 rounded-lg border border-border/40 bg-background/60 px-2.5 text-xs outline-none focus:border-amber-400/40"/>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] text-muted-foreground/70 mb-1 block">Goals</label>
            <textarea value={goals} onChange={e => setGoals(e.target.value)} rows={2}
              placeholder="Rank #1 for X keyword by Q3 2026. Grow organic from 4,000 to 20,000/month…"
              className="w-full rounded-lg border border-border/40 bg-background/60 px-2.5 py-1.5 text-xs outline-none focus:border-amber-400/40 resize-none"/>
          </div>
        </div>
        <button onClick={save} disabled={saving}
          className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 text-xs font-medium hover:bg-amber-500/25 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save & Activate Brain'}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5 flex items-center gap-3">
      <AlertTriangle className={`h-4 w-4 shrink-0 ${criticalCount > 0 ? 'text-amber-400' : 'text-amber-400/60'}`}/>
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-amber-400/80 font-medium">Brain gaps on <em>{project.name}</em>:</span>
        {gaps.map(g => (
          <span key={g.field} className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${g.critical ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
            {g.label.toUpperCase()}
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground/50">Brain is giving generic advice for these dimensions.</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => setEditMode(true)}
          className="text-xs text-amber-400 hover:underline flex items-center gap-0.5">
          Fix now <ChevronRight className="h-3 w-3"/>
        </button>
        <button onClick={() => setDismissed(true)} className="text-muted-foreground/40 hover:text-muted-foreground">
          <X className="h-3 w-3"/>
        </button>
      </div>
    </div>
  );
}
