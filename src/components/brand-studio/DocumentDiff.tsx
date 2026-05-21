/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/DocumentDiff.tsx
   Brand Studio H.5 — Section-by-section diff between two versions.

   Triggered from Library when a generated doc has version > 1.
   Shows side-by-side earlier vs. later. Color-coded per section:
   - green   = added
   - red     = removed
   - amber   = modified
   - muted   = unchanged
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import { getVersionDiff, type VersionDiff } from './api';

interface Props {
  documentId: string;
  onClose:    () => void;
}

export default function DocumentDiff({ documentId, onClose }: Props) {
  const [diff,    setDiff]    = useState<VersionDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const r = await getVersionDiff(documentId);
      if (cancelled) return;
      if (r.error || !r.diff) {
        setError(r.error || 'Could not load diff');
      } else {
        setDiff(r.diff);
        /* auto-open the first changed section */
        const firstChanged = r.diff.sections.find((s) => s.change_type !== 'unchanged');
        if (firstChanged) setOpenSection(firstChanged.key);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [documentId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Version comparison</div>
            {diff && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                v{diff.earlier.version} → v{diff.later.version} · {diff.changed_count} of {diff.sections.length} sections changed
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
              <div className="text-sm font-bold">Cannot show diff</div>
              <div className="text-xs text-muted-foreground mt-1">{error}</div>
            </div>
          </div>
        )}

        {!loading && diff && (
          <>
            {/* Header summary */}
            <div className="px-5 py-3 border-b border-border bg-card/80 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Earlier — v{diff.earlier.version}</div>
                <div className="text-xs font-semibold mt-0.5">{diff.earlier.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(diff.earlier.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Later — v{diff.later.version}</div>
                <div className="text-xs font-semibold mt-0.5">{diff.later.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(diff.later.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
            </div>

            {/* Filter */}
            <div className="px-5 py-2 border-b border-border flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                <input type="checkbox" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.target.checked)} className="accent-purple-500" />
                Show unchanged sections
              </label>
              <div className="ml-auto flex items-center gap-2 text-[10px]">
                <Legend tone="green"  label="Added" />
                <Legend tone="red"    label="Removed" />
                <Legend tone="amber"  label="Modified" />
                <Legend tone="muted"  label="Unchanged" />
              </div>
            </div>

            {/* Section diffs */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {diff.sections
                .filter((s) => showUnchanged || s.change_type !== 'unchanged')
                .map((s) => (
                  <SectionDiff
                    key={s.key}
                    section={s}
                    open={openSection === s.key}
                    onToggle={() => setOpenSection(openSection === s.key ? null : s.key)}
                  />
                ))
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Legend({ tone, label }: { tone: 'green'|'red'|'amber'|'muted'; label: string }) {
  const color =
    tone === 'green' ? 'bg-green-500/40' :
    tone === 'red'   ? 'bg-red-500/40'   :
    tone === 'amber' ? 'bg-amber-500/40' :
    'bg-muted';
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span className={`h-2 w-2 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function SectionDiff({
  section, open, onToggle,
}: {
  section: import('./api').VersionDiffSection;
  open: boolean;
  onToggle: () => void;
}) {
  const toneByChange = {
    added:     { border: 'border-green-500/30',  bg: 'bg-green-500/[0.03]',  badge: 'bg-green-500/15 text-green-400' },
    removed:   { border: 'border-red-500/30',    bg: 'bg-red-500/[0.03]',    badge: 'bg-red-500/15 text-red-400'     },
    modified:  { border: 'border-amber-500/30',  bg: 'bg-amber-500/[0.03]',  badge: 'bg-amber-500/15 text-amber-400' },
    unchanged: { border: 'border-border',         bg: 'bg-card/40 opacity-60',badge: 'bg-muted text-muted-foreground' },
  };
  const tone = toneByChange[section.change_type];

  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="text-sm font-semibold">{section.title}</span>
        <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${tone.badge}`}>
          {section.change_type}
        </span>
        {section.later_confidence && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {section.earlier_confidence || '—'} → {section.later_confidence}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Earlier</div>
            <div className="rounded-lg border border-border bg-background/40 p-2 text-[11px] text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
              {section.earlier_content || <span className="italic text-muted-foreground/60">(no content — section added in later version)</span>}
            </div>
            {section.earlier_sources.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {section.earlier_sources.map((src, i) => (
                  <span key={i} className="text-[9px] font-mono px-1 py-0.5 rounded bg-muted text-muted-foreground">{src}</span>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Later</div>
            <div className="rounded-lg border border-border bg-background/40 p-2 text-[11px] text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed">
              {section.later_content || <span className="italic text-muted-foreground/60">(no content — section removed in later version)</span>}
            </div>
            {section.later_sources.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {section.later_sources.map((src, i) => (
                  <span key={i} className="text-[9px] font-mono px-1 py-0.5 rounded bg-muted text-muted-foreground">{src}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
