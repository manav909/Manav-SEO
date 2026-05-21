/* ════════════════════════════════════════════════════════════════
   src/pages/BrandStudio.tsx
   Brand Studio — main route page.

   Phase H.0 foundation:
   - 7 sub-tabs: Library (default) / Ingest / Generate / Brand / Investor / Market / Triggers
   - Brand Bar visible at top of every sub-tab
   - Entitlement-gated nav: sub-tabs the project doesn't have access to are hidden
   - Library is functional (shows existing project_documents with new fields)
   - All other tabs show "Coming in H.x" placeholder cards
   - Brand sub-tab has a basic form for editing brand_assets

   Future phases plug into this scaffold:
     H.1   Ingest V2     → replaces the Ingest placeholder
     H.1.5 Client portal → standalone /client/* routes; this page stays internal
     H.2   Generate      → replaces the Generate placeholder
     H.3   Investor      → replaces the Investor placeholder + adds Brand Studio IR data
     H.4   Market/Trig.  → replaces those placeholders
     H.5   Polish        → stakeholder views, cross-doc intelligence
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth }    from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { LucideIcon } from 'lucide-react';
import {
  Library as LibraryIcon, Upload, Sparkles, Palette as PaletteIcon,
  TrendingUp, Globe, Bell, Loader2, Save, Lock, KeyRound, Users,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import BrandBar from '@/components/brand-studio/BrandBar';
import Library from '@/components/brand-studio/Library';
import Ingest from '@/components/brand-studio/Ingest';
import Generate from '@/components/brand-studio/Generate';
import InvestorPanel from '@/components/brand-studio/InvestorPanel';
import MonitorsPanel from '@/components/brand-studio/MonitorsPanel';
import TriggersPanel from '@/components/brand-studio/TriggersPanel';
import StakeholdersPanel from '@/components/brand-studio/StakeholdersPanel';
import ClientAccess from '@/components/brand-studio/ClientAccess';
import ClientUsersPanel  from '@/components/brand-studio/ClientUsersPanel';
import { IntakeFormsManager } from '@/components/brand-studio/IntakeForms';
import NotificationInbox from '@/components/brand-studio/NotificationInbox';
import EntitlementGate from '@/components/brand-studio/EntitlementGate';
import {
  getEntitlements, getBrandAssets, updateBrandAssets, getCatalogs,
} from '@/components/brand-studio/api';
import type {
  EntitlementResolution, BrandAssets, BrandStudioCatalogs,
} from '@/components/brand-studio/types';

type Tab = 'library' | 'ingest' | 'generate' | 'brand' | 'investor' | 'market' | 'triggers' | 'stakeholders' | 'client_access';

interface TabDef {
  id:      Tab;
  label:   string;
  icon:    LucideIcon;
  feature: string;          /* entitlement key required to show */
}

const TABS: TabDef[] = [
  { id: 'library',       label: 'Library',       icon: LibraryIcon, feature: 'brand_studio.library'  },
  { id: 'ingest',        label: 'Ingest',        icon: Upload,      feature: 'brand_studio.ingest'   },
  { id: 'generate',      label: 'Generate',      icon: Sparkles,    feature: 'brand_studio.generate' },
  { id: 'brand',         label: 'Brand',         icon: PaletteIcon, feature: 'brand_studio.brand'    },
  { id: 'investor',      label: 'Investor',      icon: TrendingUp,  feature: 'brand_studio.investor' },
  { id: 'market',        label: 'Market',        icon: Globe,       feature: 'brand_studio.market'   },
  { id: 'triggers',      label: 'Triggers',      icon: Bell,        feature: 'brand_studio.triggers' },
  /* Stakeholders + synthesis (H.5) — gated on Brand Studio access (any tier with the studio gets it) */
  { id: 'stakeholders',  label: 'Stakeholders',  icon: Users,       feature: 'brand_studio.access'   },
  /* Client Access is gated on the master Brand Studio access flag,
     not on a specific feature — every tier that has Brand Studio access
     gets the ability to configure client access. */
  { id: 'client_access', label: 'Client Access', icon: KeyRound,    feature: 'brand_studio.access'   },
];

export default function BrandStudio() {
  const { selectedProjectId } = useProject();
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<Tab>('library');

  const [entitlements, setEntitlements] = useState<EntitlementResolution | null>(null);
  const [assets,       setAssets]       = useState<BrandAssets | null>(null);
  const [catalogs,     setCatalogs]     = useState<BrandStudioCatalogs | null>(null);

  const [loadingEnt,    setLoadingEnt]    = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [projectName,   setProjectName]   = useState<string>('');
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);

  const projectId = selectedProjectId || '';
  /* H.6a: PM staff identity for collaboration actions */
  const pmStaffId    = user?.id || 'pm';
  const pmStaffLabel = (profile as any)?.display_name || user?.email || 'Staff';

  /* ── load entitlements + brand assets when project changes ── */
  const loadEverything = useCallback(async () => {
    if (!projectId) {
      setEntitlements(null);
      setAssets(null);
      setProjectName('');
      return;
    }
    setLoadingEnt(true);
    setLoadingAssets(true);

    /* fetch project name in parallel */
    const projP = supabase.from('projects').select('name').eq('id', projectId).maybeSingle();
    const entP  = getEntitlements(projectId);
    const assP  = getBrandAssets(projectId);
    const catP  = catalogs ? Promise.resolve({ catalogs }) : getCatalogs();

    const [{ data: proj }, ent, ass, cat] = await Promise.all([projP, entP, assP, catP]);
    setProjectName((proj as any)?.name || '');
    setEntitlements(ent.entitlements || null);
    setAssets(ass.assets || null);
    if (cat.catalogs) setCatalogs(cat.catalogs);
    setLoadingEnt(false);
    setLoadingAssets(false);
  }, [projectId, catalogs]);

  useEffect(() => { loadEverything(); }, [loadEverything]);

  /* ── ensure the currently-selected tab is actually accessible ── */
  useEffect(() => {
    if (!entitlements) return;
    const tabDef = TABS.find((t) => t.id === tab);
    if (tabDef && entitlements.features?.[tabDef.feature] !== true) {
      /* find the first enabled tab and switch */
      const firstEnabled = TABS.find((t) => entitlements.features?.[t.feature] === true);
      if (firstEnabled) setTab(firstEnabled.id);
    }
  }, [entitlements, tab]);

  /* ── no project selected ── */
  if (!projectId) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <PortalNav />
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <h1 className="text-2xl font-bold mb-2">Brand Studio</h1>
          <div className="rounded-2xl border border-border bg-card/40 p-10 text-center">
            <PaletteIcon className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <div className="text-sm font-semibold">Pick a project to open Brand Studio</div>
            <div className="text-xs text-muted-foreground mt-1">
              Use the project picker in the top nav. Brand Studio is a per-project workspace.
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── tier hasn't enabled Brand Studio at all (basic tier) ── */
  const studioEnabled = entitlements?.features?.['brand_studio.access'] === true;
  if (entitlements && !studioEnabled) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <PortalNav />
        <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
          <h1 className="text-2xl font-bold">Brand Studio</h1>
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Lock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <div className="text-sm font-semibold">Brand Studio isn't on this project's plan</div>
            <div className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
              Current tier: <span className="font-mono">{entitlements.tier}</span>.
              Upgrade this project to <span className="font-mono">studio</span> or higher to unlock brand intelligence, document generation, and the Library.
            </div>
            <div className="mt-4 text-[10px] text-muted-foreground/70">
              Internal note: use <span className="font-mono">bs_update_entitlements</span> to change the tier.
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── filter tabs to the ones this project has access to ── */
  const visibleTabs = entitlements
    ? TABS.filter((t) => entitlements.features?.[t.feature] === true)
    : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PaletteIcon className="h-6 w-6 text-purple-400" />
              Brand Studio
              {entitlements && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-bold">
                  {entitlements.tier}
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Brand intelligence, document ingestion + generation, market visibility, and investor-grade artifacts.
            </p>
          </div>
          {projectId && (
            <NotificationInbox
              mode="staff"
              projectId={projectId}
              recipientId={`pm:${projectId}`}
            />
          )}
        </div>

        {/* ── Brand Bar ── */}
        <BrandBar
          projectName={projectName}
          assets={assets}
          loading={loadingAssets}
          onOpenBrandTab={() => setTab('brand')}
        />

        {/* ── Tabs ── */}
        {loadingEnt && !entitlements && (
          <div className="rounded-2xl border border-border bg-card/40 p-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Resolving project entitlements…</p>
          </div>
        )}

        {entitlements && (
          <div className="border-b border-border flex items-center gap-1 overflow-x-auto">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                    active
                      ? 'border-purple-400 text-purple-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Tab content ── */}
        {entitlements && tab === 'library' && (
          <Library key={libraryRefreshKey} projectId={projectId} catalogs={catalogs} />
        )}

        {entitlements && tab === 'ingest' && (
          <EntitlementGate entitlements={entitlements} feature="brand_studio.ingest" showLockedState>
            <Ingest
              projectId={projectId}
              catalogs={catalogs}
              onIngested={() => setLibraryRefreshKey((k) => k + 1)}
            />
          </EntitlementGate>
        )}

        {entitlements && tab === 'generate' && (
          <EntitlementGate entitlements={entitlements} feature="brand_studio.generate" showLockedState>
            <Generate
              projectId={projectId}
              catalogs={catalogs}
              onSaved={() => setLibraryRefreshKey((k) => k + 1)}
            />
          </EntitlementGate>
        )}

        {entitlements && tab === 'brand' && (
          <EntitlementGate entitlements={entitlements} feature="brand_studio.brand" showLockedState>
            <BrandTab
              projectId={projectId}
              assets={assets}
              onAssetsChange={setAssets}
            />
          </EntitlementGate>
        )}

        {entitlements && tab === 'investor' && (
          <EntitlementGate entitlements={entitlements} feature="brand_studio.investor" showLockedState>
            <InvestorPanel projectId={projectId} />
          </EntitlementGate>
        )}

        {entitlements && tab === 'market' && (
          <EntitlementGate entitlements={entitlements} feature="brand_studio.market" showLockedState>
            <MonitorsPanel projectId={projectId} />
          </EntitlementGate>
        )}

        {entitlements && tab === 'triggers' && (
          <EntitlementGate entitlements={entitlements} feature="brand_studio.triggers" showLockedState>
            <TriggersPanel
              projectId={projectId}
              onSuggestGenerate={(_templateId) => setTab('generate')}
            />
          </EntitlementGate>
        )}

        {entitlements && tab === 'stakeholders' && (
          <StakeholdersPanel projectId={projectId} catalogs={catalogs} />
        )}

        {entitlements && tab === 'client_access' && (
          <div className="space-y-6">
            <ClientAccess
              projectId={projectId}
              entitlements={entitlements}
              onEntitlementsChange={(e) => setEntitlements(e)}
            />
            <div className="border-t border-border pt-6">
              <ClientUsersPanel projectId={projectId} />
            </div>
            <div className="border-t border-border pt-6">
              <IntakeFormsManager projectId={projectId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Placeholder card for tabs not yet built ──────────────── */

function PlaceholderCard({ title, description }: { title: string; description: string[] }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6">
      <div className="text-sm font-bold text-foreground mb-2">{title}</div>
      <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
        {description.map((d, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-purple-400 mt-0.5">•</span>
            <span>{d}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Brand sub-tab — basic editing form for brand assets ── */

function BrandTab({
  projectId, assets, onAssetsChange,
}: {
  projectId: string;
  assets: BrandAssets | null;
  onAssetsChange: (a: BrandAssets) => void;
}) {
  const [draft, setDraft] = useState<Partial<BrandAssets>>({});
  const [saving, setSaving] = useState(false);

  /* combine saved + draft for display */
  const merged = { ...(assets || {}), ...draft } as BrandAssets;

  const save = async () => {
    if (!projectId) return;
    setSaving(true);
    const { assets: updated, error } = await updateBrandAssets({
      projectId,
      patch: draft,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error, variant: 'destructive' });
      return;
    }
    if (updated) {
      onAssetsChange(updated);
      setDraft({});
      toast({ title: 'Brand assets saved' });
    }
  };

  const dirty = Object.keys(draft).length > 0;

  const updateColor = (idx: number, patch: Partial<{ name: string; hex: string; role: string }>) => {
    const arr = [...(merged.color_palette || [])];
    arr[idx] = { ...arr[idx], ...patch };
    setDraft({ ...draft, color_palette: arr });
  };
  const addColor    = () => setDraft({ ...draft, color_palette: [...(merged.color_palette || []), { name: '', hex: '#000000', role: '' }] });
  const removeColor = (idx: number) => setDraft({ ...draft, color_palette: (merged.color_palette || []).filter((_, i) => i !== idx) });

  const updateFont = (idx: number, patch: Partial<{ name: string; role: string; source: string }>) => {
    const arr = [...(merged.font_families || [])];
    arr[idx] = { ...arr[idx], ...patch };
    setDraft({ ...draft, font_families: arr });
  };
  const addFont    = () => setDraft({ ...draft, font_families: [...(merged.font_families || []), { name: '', role: '', source: '' }] });
  const removeFont = (idx: number) => setDraft({ ...draft, font_families: (merged.font_families || []).filter((_, i) => i !== idx) });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
        <div>
          <div className="text-sm font-bold text-foreground mb-1">Visual identity</div>
          <div className="text-[11px] text-muted-foreground">
            Logo URL, color palette, and typography. These appear in the Brand Bar at the top of every Brand Studio tab.
          </div>
        </div>

        {/* Logo URL */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Primary logo URL</label>
          <input
            value={merged.primary_logo_url || ''}
            onChange={(e) => setDraft({ ...draft, primary_logo_url: e.target.value })}
            placeholder="https://…"
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
          />
        </div>

        {/* Color palette */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground flex items-center justify-between">
            <span>Color palette</span>
            <button onClick={addColor} className="text-[10px] text-primary hover:underline">+ Add color</button>
          </label>
          {(merged.color_palette || []).length === 0 && (
            <div className="text-[10px] text-muted-foreground">No colors yet.</div>
          )}
          {(merged.color_palette || []).map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={c.hex || '#000000'}
                onChange={(e) => updateColor(i, { hex: e.target.value })}
                className="h-9 w-12 rounded-lg border border-border cursor-pointer bg-transparent"
              />
              <input
                value={c.name || ''}
                onChange={(e) => updateColor(i, { name: e.target.value })}
                placeholder="Name (e.g. Primary)"
                className="flex-1 h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
              />
              <input
                value={c.role || ''}
                onChange={(e) => updateColor(i, { role: e.target.value })}
                placeholder="Role (primary, accent…)"
                className="flex-1 h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
              />
              <input
                value={c.hex || ''}
                onChange={(e) => updateColor(i, { hex: e.target.value })}
                placeholder="#hex"
                className="w-24 h-9 text-xs px-2 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50 font-mono"
              />
              <button onClick={() => removeColor(i)} className="text-[10px] text-red-400 hover:text-red-300 px-2">Remove</button>
            </div>
          ))}
        </div>

        {/* Font families */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground flex items-center justify-between">
            <span>Typography</span>
            <button onClick={addFont} className="text-[10px] text-primary hover:underline">+ Add font</button>
          </label>
          {(merged.font_families || []).length === 0 && (
            <div className="text-[10px] text-muted-foreground">No fonts yet.</div>
          )}
          {(merged.font_families || []).map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={f.name || ''}
                onChange={(e) => updateFont(i, { name: e.target.value })}
                placeholder="Family (e.g. Inter)"
                className="flex-1 h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
              />
              <input
                value={f.role || ''}
                onChange={(e) => updateFont(i, { role: e.target.value })}
                placeholder="Role (heading, body…)"
                className="flex-1 h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
              />
              <input
                value={f.source || ''}
                onChange={(e) => updateFont(i, { source: e.target.value })}
                placeholder="Source (google_fonts, …)"
                className="flex-1 h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
              />
              <button onClick={() => removeFont(i)} className="text-[10px] text-red-400 hover:text-red-300 px-2">Remove</button>
            </div>
          ))}
        </div>
      </div>

      {/* Verbal identity */}
      <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
        <div>
          <div className="text-sm font-bold text-foreground mb-1">Verbal identity</div>
          <div className="text-[11px] text-muted-foreground">
            Tagline, archetype, brand application notes. These feed the document generation engine in H.2.
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Primary tagline</label>
          <input
            value={merged.primary_tagline || ''}
            onChange={(e) => setDraft({ ...draft, primary_tagline: e.target.value })}
            placeholder="One-line tagline that appears in the Brand Bar."
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Tagline rationale</label>
          <textarea
            value={merged.tagline_rationale || ''}
            onChange={(e) => setDraft({ ...draft, tagline_rationale: e.target.value })}
            placeholder="Why this tagline? What does it convey? Helps the AI keep generated content on-brand."
            rows={2}
            className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50 resize-y"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Brand archetype</label>
          <input
            value={merged.brand_archetype || ''}
            onChange={(e) => setDraft({ ...draft, brand_archetype: e.target.value })}
            placeholder="E.g. Sage, Hero, Outlaw, Caregiver, Creator, Ruler…"
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Brand application notes</label>
          <textarea
            value={merged.brand_application_notes || ''}
            onChange={(e) => setDraft({ ...draft, brand_application_notes: e.target.value })}
            placeholder="Rules for how the brand should be applied. What to do, what to avoid. This goes into the AI generation context."
            rows={4}
            className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50 resize-y"
          />
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-4 flex items-center justify-end gap-2">
        {dirty && (
          <span className="text-[11px] text-yellow-400">Unsaved changes</span>
        )}
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save brand assets
        </button>
      </div>
    </div>
  );
}
