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
import { FileText, Sparkles, Filter, ExternalLink, Eye, EyeOff, Loader2, FileWarning, GitCompare, BookOpen, X } from 'lucide-react';
import { listDocuments, publishDocument, listStaleDocs, getDocumentDetail } from './api';
import { toast } from '@/hooks/use-toast';
import DocumentDiff from './DocumentDiff';
import DocumentViewer from './DocumentViewer';
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
  /* H.4 — stale doc IDs (from document_subscriptions) */
  const [staleDocIds,     setStaleDocIds]     = useState<Set<string>>(new Set());
  const [staleReasons,    setStaleReasons]    = useState<Map<string, string[]>>(new Map());
  /* H.5 — diff modal */
  const [diffDocId,       setDiffDocId]       = useState<string | null>(null);
  /* Doc viewer modal */
  const [viewerDoc,       setViewerDoc]       = useState<(BrandStudioDocument & { raw_content?: string }) | null>(null);
  const [viewerLoading,   setViewerLoading]   = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [docsResp, staleResp] = await Promise.all([
        listDocuments({
          projectId,
          kind:             kindFilter === 'all' ? undefined : kindFilter,
          stakeholderRole:  stakeholderF || undefined,
          audienceRole:     audienceF || undefined,
          publishedOnly:    publishedOnly || undefined,
        }),
        listStaleDocs(projectId),
      ]);
      if (cancelled) return;
      setDocs(docsResp.documents);
      const ids = new Set<string>();
      const reasons = new Map<string, string[]>();
      for (const sd of staleResp.stale_docs) {
        ids.add(sd.document_id);
        reasons.set(sd.document_id, sd.reasons);
      }
      setStaleDocIds(ids);
      setStaleReasons(reasons);
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
          <DocumentRow
            key={doc.id}
            doc={doc}
            catalogs={catalogs}
            isStale={staleDocIds.has(doc.id)}
            staleReasons={staleReasons.get(doc.id) || []}
            onCompareToParent={() => setDiffDocId(doc.id)}
            onOpen={async () => {
              setViewerLoading(true);
              setViewerDoc({ ...doc });
              const r = await getDocumentDetail(doc.id);
              if (r.document) {
                setViewerDoc(r.document as any);
              } else if (r.error) {
                toast({ title: 'Could not load document', description: r.error, variant: 'destructive' });
                setViewerDoc(null);
              }
              setViewerLoading(false);
            }}
            onPublishChange={(id, published) => {
              setDocs((prev) => prev.map((d) => d.id === id ? { ...d, published_to_client: published, published_at: published ? new Date().toISOString() : undefined } : d));
            }}
          />
        ))}
      </div>

      {diffDocId && <DocumentDiff documentId={diffDocId} onClose={() => setDiffDocId(null)} />}

      {/* ── Document viewer modal ────────────────────────────────── */}
      {viewerDoc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 print:p-0 print:bg-white print:static">
          <div className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col print:border-0 print:rounded-none print:max-w-none print:max-h-none print:bg-white">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between print:hidden">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate">{viewerDoc.name}</div>
              </div>
              <button onClick={() => setViewerDoc(null)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 print:overflow-visible print:p-0">
              {viewerLoading && !viewerDoc.raw_content ? (
                <div className="text-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  <div className="text-xs text-muted-foreground mt-2">Loading document…</div>
                </div>
              ) : (
                <DocumentViewer
                  content={viewerDoc.raw_content || ''}
                  documentName={viewerDoc.name}
                  meta={{
                    docType:      viewerDoc.doc_type,
                    audienceRole: viewerDoc.audience_role,
                    confidence:   viewerDoc.confidence,
                    version:      viewerDoc.version,
                    publishedAt:  viewerDoc.published_at,
                    providedBy:   (viewerDoc as any).provided_by,
                    sourceUrl:    viewerDoc.source_url,
                  }}
                  summary={(viewerDoc as any).extracted_data?.doc_summary}
                  keyFindings={(viewerDoc as any).extracted_data?.key_findings}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentRow({
  doc, catalogs, onPublishChange, isStale, staleReasons, onCompareToParent, onOpen,
}: {
  doc: BrandStudioDocument;
  catalogs: BrandStudioCatalogs | null;
  onPublishChange: (id: string, published: boolean) => void;
  isStale?: boolean;
  staleReasons?: string[];
  onCompareToParent?: () => void;
  onOpen?: () => void;
}) {
  const isGenerated = doc.kind === 'generated';
  const stakeholderLabel = catalogs?.stakeholder_roles.find((r) => r.key === doc.stakeholder_role)?.label;
  const audienceLabel    = catalogs?.audience_roles.find((r) => r.key === doc.audience_role)?.label;
  const [publishing, setPublishing] = useState(false);

  const togglePublish = async () => {
    setPublishing(true);
    const next = !doc.published_to_client;
    const { success, error } = await publishDocument({ documentId: doc.id, publish: next });
    setPublishing(false);
    if (!success) {
      toast({ title: 'Publish failed', description: error, variant: 'destructive' });
      return;
    }
    onPublishChange(doc.id, next);
    toast({
      title: next ? 'Published to client' : 'Unpublished',
      description: next ? 'Client can now see this in their workspace.' : 'No longer visible in the client portal.',
    });
  };

  return (
    <div
      className="rounded-xl border border-border bg-card/60 px-4 py-3 hover:bg-card/80 transition-colors cursor-pointer"
      onClick={() => onOpen && onOpen()}
    >
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
            {isStale && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-bold flex items-center gap-0.5"
                title={(staleReasons || []).join(' · ')}>
                <FileWarning className="h-2.5 w-2.5" />
                Inputs changed
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
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 inline-flex items-center gap-1"
              >
                Source URL <ExternalLink className="h-2 w-2" />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Read (open viewer) */}
          {onOpen && (
            <button
              onClick={onOpen}
              title="Read the full formatted document"
              className="text-[10px] px-2 py-1 rounded-lg font-bold bg-purple-500 text-white hover:bg-purple-500/90 flex items-center gap-1"
            >
              <BookOpen className="h-2.5 w-2.5" />
              Read
            </button>
          )}

          {/* Compare to v1 (only for versioned docs with parent) */}
          {doc.version && doc.version > 1 && onCompareToParent && (
            <button
              onClick={onCompareToParent}
              title="Compare to previous version"
              className="text-[10px] px-2 py-1 rounded-lg font-bold border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 flex items-center gap-1"
            >
              <GitCompare className="h-2.5 w-2.5" />
              Compare to v{doc.version - 1}
            </button>
          )}

          {/* Publish toggle (PM-only) */}
          <button
            onClick={togglePublish}
            disabled={publishing}
            title={doc.published_to_client ? 'Click to unpublish — client will no longer see this' : 'Click to publish — client can see this in their workspace'}
            className={`text-[10px] px-2 py-1 rounded-lg font-bold flex items-center gap-1 disabled:opacity-50 ${
              doc.published_to_client
                ? 'bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25'
                : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20'
            }`}
          >
            {publishing ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : doc.published_to_client ? (
              <><Eye className="h-2.5 w-2.5" /> Published</>
            ) : (
              <><EyeOff className="h-2.5 w-2.5" /> Internal</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
