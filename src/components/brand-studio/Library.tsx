/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/Library.tsx
   The Library sub-tab — read-only view of every document attached
   to the project. In H.0 it shows the existing project_documents
   rows with the new Brand Studio fields visible (kind, stakeholder
   role, audience role, published-to-client flag) so the PM can
   immediately start to see the new structure. H.1 will add the
   ingestion entry points; H.2 will add generation entries.

   Filters: kind (ingested/generated/all), stakeholder, audience,
   published-only (for client portal mode).
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { FileText, Sparkles, Filter, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { listDocuments } from './api';
import type { BrandStudioDocument, BrandStudioCatalogs } from './types';

interface Props {
  projectId: string;
  catalogs:  BrandStudioCatalogs | null;
}

type KindFilter = 'all' | 'ingested' | 'generated';

export default function Library({ projectId, catalogs }: Props) {
  const [docs,            setDocs]            = useState<BrandStudioDocument[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [kindFilter,      setKindFilter]      = useState<KindFilter>('all');
  const [stakeholderF,    setStakeholderF]    = useState<string>('');
  const [audienceF,       setAudienceF]       = useState<string>('');
  const [publishedOnly,   setPublishedOnly]   = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { documents } = await listDocuments({
        projectId,
        kind:             kindFilter === 'all' ? undefined : kindFilter,
        stakeholderRole:  stakeholderF || undefined,
        audienceRole:     audienceF || undefined,
        publishedOnly:    publishedOnly || undefined,
      });
      if (cancelled) return;
      setDocs(documents);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, kindFilter, stakeholderF, audienceF, publishedOnly]);

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="rounded-xl border border-border bg-card/40 p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
          <Filter className="h-3 w-3" />
          Filter
        </div>

        {/* Kind filter */}
        <div className="flex items-center gap-1 bg-background/40 rounded-lg p-0.5">
          {(['all', 'ingested', 'generated'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-colors ${
                kindFilter === k
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {k === 'all' ? 'All' : k === 'ingested' ? 'Uploaded' : 'Generated'}
            </button>
          ))}
        </div>

        {/* Stakeholder filter */}
        <select
          value={stakeholderF}
          onChange={(e) => setStakeholderF(e.target.value)}
          className="text-xs h-7 px-2 rounded-lg border border-border bg-background/60 outline-none focus:border-primary/50"
        >
          <option value="">All stakeholders</option>
          {catalogs?.stakeholder_roles.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>

        {/* Audience filter */}
        <select
          value={audienceF}
          onChange={(e) => setAudienceF(e.target.value)}
          className="text-xs h-7 px-2 rounded-lg border border-border bg-background/60 outline-none focus:border-primary/50"
        >
          <option value="">All audiences</option>
          {catalogs?.audience_roles.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>

        {/* Published-only toggle */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={publishedOnly}
            onChange={(e) => setPublishedOnly(e.target.checked)}
            className="accent-primary h-3 w-3"
          />
          Published to client only
        </label>

        <div className="ml-auto text-[10px] text-muted-foreground">
          {loading ? 'Loading…' : `${docs.length} document${docs.length === 1 ? '' : 's'}`}
        </div>
      </div>

      {/* Document list */}
      {!loading && docs.length === 0 && (
        <div className="rounded-2xl border border-border bg-card/40 p-10 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <div className="text-sm font-semibold text-foreground">No documents match</div>
          <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            {kindFilter === 'all' && !stakeholderF && !audienceF && !publishedOnly
              ? 'This project has no documents yet. Use the Ingest tab to upload, or wait for H.2 to generate.'
              : 'No documents match the current filters. Adjust the filters above to see more.'}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {docs.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} catalogs={catalogs} />
        ))}
      </div>
    </div>
  );
}

function DocumentRow({ doc, catalogs }: { doc: BrandStudioDocument; catalogs: BrandStudioCatalogs | null }) {
  const isGenerated = doc.kind === 'generated';
  const stakeholderLabel = catalogs?.stakeholder_roles.find((r) => r.key === doc.stakeholder_role)?.label;
  const audienceLabel    = catalogs?.audience_roles.find((r) => r.key === doc.audience_role)?.label;

  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3 hover:bg-card/80 transition-colors">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
          isGenerated ? 'bg-purple-500/10 text-purple-400' : 'bg-primary/10 text-primary'
        }`}>
          {isGenerated ? <Sparkles className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{doc.name}</span>
            {isGenerated && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-bold">
                Generated
              </span>
            )}
            {doc.version && doc.version > 1 && (
              <span className="text-[9px] text-muted-foreground font-mono">v{doc.version}</span>
            )}
            {doc.published_to_client ? (
              <span title="Visible in client portal" className="text-green-400">
                <Eye className="h-3 w-3" />
              </span>
            ) : (
              <span title="Internal only" className="text-muted-foreground/40">
                <EyeOff className="h-3 w-3" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
            {doc.doc_type && <span className="font-mono">{doc.doc_type}</span>}
            {doc.confidence && (
              <span className={`font-semibold ${
                doc.confidence === 'high' ? 'text-green-400' :
                doc.confidence === 'medium' ? 'text-amber-400' :
                'text-orange-400'
              }`}>
                {doc.confidence} confidence
              </span>
            )}
            {doc.created_at && <span>{new Date(doc.created_at).toLocaleDateString('en-GB')}</span>}
            {doc.file_size_kb && <span>{doc.file_size_kb}KB</span>}
          </div>

          {/* Stakeholder + audience tags */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {stakeholderLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                From: {stakeholderLabel}
              </span>
            )}
            {audienceLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                For: {audienceLabel}
              </span>
            )}
            {doc.source_url && (
              <a
                href={doc.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 inline-flex items-center gap-1"
              >
                Source URL <ExternalLink className="h-2 w-2" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
