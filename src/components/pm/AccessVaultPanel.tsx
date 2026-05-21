/* ════════════════════════════════════════════════════════════════
   src/components/pm/AccessVaultPanel.tsx
   Phase 5 — Reference-only access vault.

   Stores label + URL + password-manager-link + status. NEVER stores
   the actual credential. The team uses this to track WHAT access we
   have and WHERE the credential lives (1Password/Bitwarden link).
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  Key, Plus, X, Save, Trash2, ExternalLink, AlertCircle, ChevronDown,
  ChevronRight, Calendar, User,
} from 'lucide-react';
import {
  listStoreItems, saveStoreItem, deleteStoreItem, suggestStoreLabels,
  type AccessItemClient,
} from './api';
import { StorePanelShell, StatusBadge, ResolvedIcon, FormField } from './ResolutionStoreHelpers';

interface Props { projectId: string; }

const ACCESS_CATEGORIES = [
  { value: 'cms',        label: 'CMS / Publishing' },
  { value: 'dev',        label: 'Developer / Code' },
  { value: 'analytics',  label: 'Analytics (GA4/GSC)' },
  { value: 'seo_tool',   label: 'SEO Tool (Ahrefs/SEMrush)' },
  { value: 'other',      label: 'Other' },
];

const ACCESS_STATUSES = [
  { value: 'held',      label: 'Held — we have it' },
  { value: 'requested', label: 'Requested — pending' },
  { value: 'expired',   label: 'Expired' },
  { value: 'revoked',   label: 'Revoked' },
];

export default function AccessVaultPanel({ projectId }: Props) {
  const [items, setItems] = useState<AccessItemClient[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ label: string; used_by_actions: string[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Partial<AccessItemClient> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const [itemsRes, suggRes] = await Promise.all([
      listStoreItems({ projectId, store: 'access', search }),
      suggestStoreLabels({ projectId, store: 'access' }),
    ]);
    if (itemsRes.error) setError(itemsRes.error);
    setItems(itemsRes.items || []);
    setSuggestions(suggRes.suggestions || []);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { if (projectId) load(); }, [projectId, search]);

  const filtered = statusFilter ? items.filter(i => i.status === statusFilter) : items;
  const stats = {
    total: items.length,
    resolved: items.filter(i => i.is_resolved).length,
    unresolved: items.filter(i => !i.is_resolved).length,
  };

  const handleSave = async () => {
    if (!editing?.label) { setError('Label is required.'); return; }
    setSaving(true);
    const r = await saveStoreItem({ projectId, store: 'access', item: editing });
    setSaving(false);
    if (r.error) { setError(r.error); return; }
    setEditing(null);
    await load(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this access item? Strategy cards needing it will become blocked.')) return;
    const r = await deleteStoreItem({ store: 'access', itemId: id });
    if (r.error) { setError(r.error); return; }
    await load(true);
  };

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-card/40 to-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Key className="h-4 w-4 text-amber-400" />
        <div>
          <div className="text-sm font-bold text-foreground">Access Vault</div>
          <div className="text-[10px] text-muted-foreground">Reference-only: we track <strong>what</strong> we have and <strong>where</strong> the credential lives — never the credential itself.</div>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 mb-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
        </div>
      )}

      <StorePanelShell
        title="Access"
        icon={Key}
        accentClass="bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30"
        stats={stats}
        onAddNew={() => setEditing({ label: '', category: 'cms', status: 'requested' })}
        isAdding={!!editing}
        searchValue={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={ACCESS_STATUSES}
        suggestionChips={suggestions}
        onSuggestionClick={(label) => setEditing({ label, category: 'cms', status: 'requested' })}
        onRefresh={() => load(true)}
        refreshing={refreshing}
      >
        {/* Add/edit form */}
        {editing && (
          <AccessForm
            value={editing}
            onChange={setEditing}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
            saving={saving}
          />
        )}

        {/* List */}
        {loading ? (
          <div className="text-center py-6 text-xs text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No access items yet. {suggestions.length > 0 ? 'Click a suggestion above to start.' : 'Add one above.'}
          </div>
        ) : (
          <div className="space-y-1.5 mt-3">
            {filtered.map(item => (
              <AccessRow key={item.id} item={item} onEdit={() => setEditing(item)} onDelete={() => handleDelete(item.id!)} />
            ))}
          </div>
        )}
      </StorePanelShell>
    </div>
  );
}

/* ─── Row ────────────────────────────────────────────────────── */

function AccessRow({
  item, onEdit, onDelete,
}: { item: AccessItemClient; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background/40 overflow-hidden">
      <div onClick={() => setOpen(!open)} className="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-muted/10">
        <ResolvedIcon resolved={!!item.is_resolved} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-foreground truncate">{item.label}</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{item.category}</span>
          </div>
          {(item.held_by || item.expires_at) && (
            <div className="text-[10px] text-muted-foreground">
              {item.held_by && <span><User className="h-2.5 w-2.5 inline mr-0.5" />{item.held_by}</span>}
              {item.held_by && item.expires_at && ' · '}
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
          {item.url && <Detail label="Login URL"><a href={item.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">{item.url}<ExternalLink className="h-2.5 w-2.5" /></a></Detail>}
          {item.password_manager_link && <Detail label="Credential"><a href={item.password_manager_link} target="_blank" rel="noreferrer" className="text-violet-400 hover:underline inline-flex items-center gap-0.5">Open in password manager<ExternalLink className="h-2.5 w-2.5" /></a></Detail>}
          {item.obtained_at && <Detail label="Obtained">{item.obtained_at}</Detail>}
          {item.notes && <Detail label="Notes">{item.notes}</Detail>}
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-20 shrink-0">{label}:</span>
      <span className="text-foreground/85 flex-1 break-all">{children}</span>
    </div>
  );
}

/* ─── Add/edit form ─────────────────────────────────────────── */

function AccessForm({
  value, onChange, onSave, onCancel, saving,
}: {
  value: Partial<AccessItemClient>;
  onChange: (v: Partial<AccessItemClient>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const u = (patch: Partial<AccessItemClient>) => onChange({ ...value, ...patch });
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3 mb-3">
      <div className="text-xs font-bold text-amber-400 mb-2">
        {value.id ? 'Edit access item' : 'New access item'}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <FormField label="Label" value={value.label} onChange={(v) => u({ label: v })} placeholder="e.g. CMS publishing access" required span={2} />
        <FormField label="Category" type="select" value={value.category} onChange={(v) => u({ category: v })} options={ACCESS_CATEGORIES} required />
        <FormField label="Status"   type="select" value={value.status}   onChange={(v) => u({ status: v })}   options={ACCESS_STATUSES} required />
        <FormField label="Login URL" type="url" value={value.url} onChange={(v) => u({ url: v })} placeholder="https://wp.example.com/login" />
        <FormField label="Password manager link" type="url" value={value.password_manager_link} onChange={(v) => u({ password_manager_link: v })} placeholder="1password://… or bitwarden://…" />
        <FormField label="Held by" value={value.held_by} onChange={(v) => u({ held_by: v })} placeholder="alice@agency.com" />
        <FormField label="Obtained" type="date" value={value.obtained_at} onChange={(v) => u({ obtained_at: v })} />
        <FormField label="Expires"  type="date" value={value.expires_at}  onChange={(v) => u({ expires_at: v })} />
        <FormField label="Notes" type="textarea" value={value.notes} onChange={(v) => u({ notes: v })} placeholder="e.g. requires 2FA via Authy" span={2} />
      </div>
      <div className="flex items-center justify-end gap-2 mt-2">
        <button onClick={onCancel} className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
        <button onClick={onSave} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-50 flex items-center gap-1.5">
          <Save className="h-3 w-3" />{saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="text-[10px] text-amber-400/70 italic mt-2">
        💡 We don't store the actual credential. Link to your password manager (1Password, Bitwarden, etc.) so the team knows where to find it.
      </div>
    </div>
  );
}
