/* ════════════════════════════════════════════════════════════════
   src/components/pm/InfoRepositoryPanel.tsx
   Phase 5 — Info / research / data repository.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { Info, X, Save, Trash2, ExternalLink, AlertCircle, ChevronDown, ChevronRight, Calendar, User } from 'lucide-react';
import { listStoreItems, saveStoreItem, deleteStoreItem, suggestStoreLabels, type InfoItemClient } from './api';
import { StorePanelShell, StatusBadge, ResolvedIcon, FormField } from './ResolutionStoreHelpers';

interface Props { projectId: string; }

const INFO_TYPES = [
  { value: 'research',    label: 'Research finding' },
  { value: 'data',        label: 'Data / numbers' },
  { value: 'competitor',  label: 'Competitor intel' },
  { value: 'persona',     label: 'Persona / audience' },
  { value: 'strategy',    label: 'Strategy decision' },
  { value: 'other',       label: 'Other' },
];

const INFO_STATUSES = [
  { value: 'needed',   label: 'Needed — looking for it' },
  { value: 'gathered', label: 'Gathered — resolved' },
  { value: 'stale',    label: 'Stale (out of date)' },
];

export default function InfoRepositoryPanel({ projectId }: Props) {
  const [items, setItems] = useState<InfoItemClient[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ label: string; used_by_actions: string[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Partial<InfoItemClient> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const [r1, r2] = await Promise.all([
      listStoreItems({ projectId, store: 'info', search }),
      suggestStoreLabels({ projectId, store: 'info' }),
    ]);
    if (r1.error) setError(r1.error);
    setItems(r1.items || []);
    setSuggestions(r2.suggestions || []);
    setLoading(false); setRefreshing(false);
  };
  useEffect(() => { if (projectId) load(); }, [projectId, search]);

  const filtered = statusFilter ? items.filter(i => i.status === statusFilter) : items;
  const stats = { total: items.length, resolved: items.filter(i => i.is_resolved).length, unresolved: items.filter(i => !i.is_resolved).length };

  const handleSave = async () => {
    if (!editing?.label) { setError('Label required.'); return; }
    setSaving(true);
    const r = await saveStoreItem({ projectId, store: 'info', item: editing });
    setSaving(false);
    if (r.error) { setError(r.error); return; }
    setEditing(null); await load(true);
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this info item?')) return;
    const r = await deleteStoreItem({ store: 'info', itemId: id });
    if (r.error) setError(r.error);
    await load(true);
  };

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.06] via-card/40 to-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Info className="h-4 w-4 text-blue-400" />
        <div>
          <div className="text-sm font-bold text-foreground">Info Repository</div>
          <div className="text-[10px] text-muted-foreground">Research, data, competitor intel. Mark "gathered" once you have it — strategy cards needing it auto-resolve.</div>
        </div>
      </div>
      {error && (
        <div className="px-3 py-2 mb-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><div className="flex-1">{error}</div>
          <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
        </div>
      )}
      <StorePanelShell
        title="Info" icon={Info}
        accentClass="bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-blue-500/30"
        stats={stats}
        onAddNew={() => setEditing({ label: '', info_type: 'research', status: 'needed' })}
        isAdding={!!editing}
        searchValue={search} onSearchChange={setSearch}
        statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
        statusOptions={INFO_STATUSES}
        suggestionChips={suggestions}
        onSuggestionClick={(label) => setEditing({ label, info_type: 'research', status: 'needed' })}
        onRefresh={() => load(true)} refreshing={refreshing}
      >
        {editing && (
          <InfoForm value={editing} onChange={setEditing} onSave={handleSave} onCancel={() => setEditing(null)} saving={saving} />
        )}
        {loading ? <div className="text-center py-6 text-xs text-muted-foreground">Loading…</div>
         : filtered.length === 0 ? <div className="text-center py-6 text-xs text-muted-foreground">No info items yet.</div>
         : <div className="space-y-1.5 mt-3">{filtered.map(item => <InfoRow key={item.id} item={item} onEdit={() => setEditing(item)} onDelete={() => handleDelete(item.id!)} />)}</div>
        }
      </StorePanelShell>
    </div>
  );
}

function InfoRow({ item, onEdit, onDelete }: { item: InfoItemClient; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background/40 overflow-hidden">
      <div onClick={() => setOpen(!open)} className="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-muted/10">
        <ResolvedIcon resolved={!!item.is_resolved} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-foreground truncate">{item.label}</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{item.info_type}</span>
          </div>
          {(item.gathered_by || item.expires_at) && (
            <div className="text-[10px] text-muted-foreground">
              {item.gathered_by && <span><User className="h-2.5 w-2.5 inline mr-0.5" />{item.gathered_by}</span>}
              {item.gathered_by && item.expires_at && ' · '}
              {item.expires_at && <span><Calendar className="h-2.5 w-2.5 inline mr-0.5" />expires {item.expires_at}</span>}
            </div>
          )}
        </div>
        <StatusBadge status={item.status} />
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-[10px] text-muted-foreground hover:text-foreground px-1">Edit</button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="h-3 w-3" /></button>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      {open && (
        <div className="px-3 pb-2 pt-1 border-t border-border/40 space-y-1 text-[10px]">
          {item.value_text && <div className="flex gap-2"><span className="text-muted-foreground w-20">Value:</span><span className="text-foreground/85 flex-1 whitespace-pre-wrap">{item.value_text}</span></div>}
          {item.source_url && <div className="flex gap-2"><span className="text-muted-foreground w-20">Source:</span><a href={item.source_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">{item.source_url}<ExternalLink className="h-2.5 w-2.5" /></a></div>}
          {item.gathered_at && <div className="flex gap-2"><span className="text-muted-foreground w-20">Gathered:</span><span>{new Date(item.gathered_at).toLocaleDateString()}</span></div>}
          {item.notes && <div className="flex gap-2"><span className="text-muted-foreground w-20">Notes:</span><span className="text-foreground/85 flex-1">{item.notes}</span></div>}
        </div>
      )}
    </div>
  );
}

function InfoForm({ value, onChange, onSave, onCancel, saving }: any) {
  const u = (patch: any) => onChange({ ...value, ...patch });
  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/[0.04] p-3 mb-3">
      <div className="text-xs font-bold text-blue-400 mb-2">{value.id ? 'Edit info item' : 'New info item'}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <FormField label="Label" value={value.label} onChange={(v) => u({ label: v })} required span={2} placeholder="e.g. PageSpeed Insights baseline" />
        <FormField label="Type" type="select" value={value.info_type} onChange={(v) => u({ info_type: v })} options={INFO_TYPES} required />
        <FormField label="Status" type="select" value={value.status} onChange={(v) => u({ status: v })} options={INFO_STATUSES} required />
        <FormField label="Value / summary" type="textarea" value={value.value_text} onChange={(v) => u({ value_text: v })} placeholder="The information itself, or summary" span={2} />
        <FormField label="Source URL" type="url" value={value.source_url} onChange={(v) => u({ source_url: v })} placeholder="Where you found it" span={2} />
        <FormField label="Gathered by" type="email" value={value.gathered_by} onChange={(v) => u({ gathered_by: v })} />
        <FormField label="Expires" type="date" value={value.expires_at} onChange={(v) => u({ expires_at: v })} />
        <FormField label="Notes" type="textarea" value={value.notes} onChange={(v) => u({ notes: v })} span={2} />
      </div>
      <div className="flex items-center justify-end gap-2 mt-2">
        <button onClick={onCancel} className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
        <button onClick={onSave} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-blue-500/30 disabled:opacity-50 flex items-center gap-1.5">
          <Save className="h-3 w-3" />{saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
