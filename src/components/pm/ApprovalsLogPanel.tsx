/* ════════════════════════════════════════════════════════════════
   src/components/pm/ApprovalsLogPanel.tsx
   Phase 5 — Approvals log with audit (who decided, when, evidence).
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { Shield, X, Save, Trash2, ExternalLink, AlertCircle, ChevronDown, ChevronRight, Calendar, User } from 'lucide-react';
import { listStoreItems, saveStoreItem, deleteStoreItem, suggestStoreLabels, type ApprovalItemClient } from './api';
import { StorePanelShell, StatusBadge, ResolvedIcon, FormField } from './ResolutionStoreHelpers';

interface Props { projectId: string; }

const APPROVAL_TYPES = [
  { value: 'client',   label: 'Client sign-off' },
  { value: 'internal', label: 'Internal review' },
  { value: 'budget',   label: 'Budget approval' },
  { value: 'legal',    label: 'Legal review' },
];

const APPROVAL_STATUSES = [
  { value: 'pending',  label: 'Pending — awaiting decision' },
  { value: 'approved', label: 'Approved — resolved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'revoked',  label: 'Revoked' },
];

export default function ApprovalsLogPanel({ projectId }: Props) {
  const [items, setItems] = useState<ApprovalItemClient[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ label: string; used_by_actions: string[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Partial<ApprovalItemClient> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const [r1, r2] = await Promise.all([
      listStoreItems({ projectId, store: 'approval', search }),
      suggestStoreLabels({ projectId, store: 'approval' }),
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
    const r = await saveStoreItem({ projectId, store: 'approval', item: editing });
    setSaving(false);
    if (r.error) { setError(r.error); return; }
    setEditing(null); await load(true);
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this approval item?')) return;
    const r = await deleteStoreItem({ store: 'approval', itemId: id });
    if (r.error) setError(r.error);
    await load(true);
  };

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] via-card/40 to-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-violet-400" />
        <div>
          <div className="text-sm font-bold text-foreground">Approvals Log</div>
          <div className="text-[10px] text-muted-foreground">Sign-offs with audit trail (who decided, when, evidence). Mark "approved" to resolve dependent strategy cards.</div>
        </div>
      </div>
      {error && (
        <div className="px-3 py-2 mb-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><div className="flex-1">{error}</div>
          <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
        </div>
      )}
      <StorePanelShell
        title="Approvals" icon={Shield}
        accentClass="bg-violet-500/20 text-violet-400 border border-violet-500/40 hover:bg-violet-500/30"
        stats={stats}
        onAddNew={() => setEditing({ label: '', approval_type: 'client', status: 'pending' })}
        isAdding={!!editing}
        searchValue={search} onSearchChange={setSearch}
        statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
        statusOptions={APPROVAL_STATUSES}
        suggestionChips={suggestions}
        onSuggestionClick={(label) => setEditing({ label, approval_type: 'client', status: 'pending' })}
        onRefresh={() => load(true)} refreshing={refreshing}
      >
        {editing && (
          <ApprovalForm value={editing} onChange={setEditing} onSave={handleSave} onCancel={() => setEditing(null)} saving={saving} />
        )}
        {loading ? <div className="text-center py-6 text-xs text-muted-foreground">Loading…</div>
         : filtered.length === 0 ? <div className="text-center py-6 text-xs text-muted-foreground">No approval items yet.</div>
         : <div className="space-y-1.5 mt-3">{filtered.map(item => <ApprovalRow key={item.id} item={item} onEdit={() => setEditing(item)} onDelete={() => handleDelete(item.id!)} />)}</div>
        }
      </StorePanelShell>
    </div>
  );
}

function ApprovalRow({ item, onEdit, onDelete }: { item: ApprovalItemClient; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background/40 overflow-hidden">
      <div onClick={() => setOpen(!open)} className="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-muted/10">
        <ResolvedIcon resolved={!!item.is_resolved} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-foreground truncate">{item.label}</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{item.approval_type}</span>
          </div>
          {(item.requested_from || item.decided_by) && (
            <div className="text-[10px] text-muted-foreground">
              {item.requested_from && <span><User className="h-2.5 w-2.5 inline mr-0.5" />from {item.requested_from}</span>}
              {item.decided_by && <span> · decided by {item.decided_by}</span>}
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
          {item.requested_at && <div className="flex gap-2"><span className="text-muted-foreground w-20">Requested:</span><span>{new Date(item.requested_at).toLocaleString()}</span></div>}
          {item.decided_at   && <div className="flex gap-2"><span className="text-muted-foreground w-20">Decided:</span><span>{new Date(item.decided_at).toLocaleString()}</span></div>}
          {item.evidence_url && <div className="flex gap-2"><span className="text-muted-foreground w-20">Evidence:</span><a href={item.evidence_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">View<ExternalLink className="h-2.5 w-2.5" /></a></div>}
          {item.decision_notes && <div className="flex gap-2"><span className="text-muted-foreground w-20">Decision:</span><span className="text-foreground/85 flex-1">{item.decision_notes}</span></div>}
          {item.notes && <div className="flex gap-2"><span className="text-muted-foreground w-20">Notes:</span><span className="text-foreground/85 flex-1">{item.notes}</span></div>}
        </div>
      )}
    </div>
  );
}

function ApprovalForm({ value, onChange, onSave, onCancel, saving }: any) {
  const u = (patch: any) => onChange({ ...value, ...patch });
  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.04] p-3 mb-3">
      <div className="text-xs font-bold text-violet-400 mb-2">{value.id ? 'Edit approval' : 'New approval request'}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <FormField label="Label" value={value.label} onChange={(v) => u({ label: v })} required span={2} placeholder="e.g. Client sign-off on new titles" />
        <FormField label="Type" type="select" value={value.approval_type} onChange={(v) => u({ approval_type: v })} options={APPROVAL_TYPES} required />
        <FormField label="Status" type="select" value={value.status} onChange={(v) => u({ status: v })} options={APPROVAL_STATUSES} required />
        <FormField label="Requested from" type="email" value={value.requested_from} onChange={(v) => u({ requested_from: v })} placeholder="client@example.com" />
        <FormField label="Decided by" type="email" value={value.decided_by} onChange={(v) => u({ decided_by: v })} placeholder="(once they decide)" />
        <FormField label="Evidence URL" type="url" value={value.evidence_url} onChange={(v) => u({ evidence_url: v })} placeholder="Email link / screenshot URL / document" span={2} />
        <FormField label="Decision notes" type="textarea" value={value.decision_notes} onChange={(v) => u({ decision_notes: v })} placeholder="Why approved/rejected, conditions, scope" span={2} />
        <FormField label="Internal notes" type="textarea" value={value.notes} onChange={(v) => u({ notes: v })} span={2} />
      </div>
      <div className="flex items-center justify-end gap-2 mt-2">
        <button onClick={onCancel} className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
        <button onClick={onSave} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-violet-500/20 text-violet-400 border border-violet-500/40 hover:bg-violet-500/30 disabled:opacity-50 flex items-center gap-1.5">
          <Save className="h-3 w-3" />{saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
