/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/InvestorBundleButton.tsx
   Brand Studio Phase 1G — Investor data room export.

   PM-side button that:
   1. Opens a small modal with options (include cover letter, include
      source docs)
   2. Calls bs_export_investor_bundle
   3. Shows progress + the bundle report when done
   4. Auto-triggers download of the ZIP via signed URL
   5. Lets PM copy the signed URL (7-day shareable)
═══════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import {
  Briefcase, Download, Copy, X, Loader2, CheckCircle2, AlertTriangle,
  FileText, BarChart3, Mail, FolderOpen,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportInvestorBundle, type InvestorBundleReport } from './api';

interface Props {
  projectId:   string;
  brandColor?: string;
}

export default function InvestorBundleButton({ projectId, brandColor }: Props) {
  const accent = brandColor || '#8b5cf6';
  const [open, setOpen]               = useState(false);
  const [includeCoverLetter, setICL]  = useState(false);
  const [includeSources, setIS]       = useState(true);
  const [building, setBuilding]       = useState(false);
  const [result, setResult]           = useState<{
    signedUrl?: string;
    filename?:  string;
    sizeBytes?: number;
    report?:    InvestorBundleReport;
    error?:     string;
  } | null>(null);

  const handleExport = async () => {
    setBuilding(true);
    setResult(null);
    const r = await exportInvestorBundle({
      projectId,
      cover_letter:     includeCoverLetter,
      source_documents: includeSources,
    });
    setBuilding(false);
    if (r.error) {
      toast({ title: 'Bundle failed', description: r.error, variant: 'destructive' });
      setResult({ error: r.error });
      return;
    }
    setResult(r);
    /* Auto-trigger download */
    if (r.signedUrl && r.filename) {
      const a = document.createElement('a');
      a.href     = r.signedUrl;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: 'Bundle ready', description: `${r.filename} (${formatBytes(r.sizeBytes || 0)})` });
    }
  };

  const handleCopyLink = async () => {
    if (!result?.signedUrl) return;
    try {
      await navigator.clipboard.writeText(result.signedUrl);
      toast({ title: 'Link copied', description: 'Shareable for 7 days.' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
    setBuilding(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white flex items-center gap-1.5"
        style={{ backgroundColor: accent }}
        title="Build a ZIP with all investor documents + metrics + source files"
      >
        <Briefcase className="h-3 w-3" /> Investor bundle
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" style={{ color: accent }} />
                <div className="text-sm font-bold">Investor data room bundle</div>
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {!result && !building && (
                <>
                  <div className="rounded-xl border border-border bg-background/40 p-4 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                      What's included
                    </div>
                    <ul className="text-xs space-y-1 text-foreground/90">
                      <li className="flex gap-2"><FileText className="h-3 w-3 mt-0.5 shrink-0 opacity-50" /> Each of the 5 investor templates as `.docx` (latest version)</li>
                      <li className="flex gap-2"><BarChart3 className="h-3 w-3 mt-0.5 shrink-0 opacity-50" /> `metrics-snapshot.csv` — current Data Room state</li>
                      <li className="flex gap-2"><FolderOpen className="h-3 w-3 mt-0.5 shrink-0 opacity-50" /> `source-documents/` — ingested docs flagged for inclusion (optional)</li>
                      <li className="flex gap-2"><Mail className="h-3 w-3 mt-0.5 shrink-0 opacity-50" /> `cover-letter.md` — templated investor briefing (optional)</li>
                      <li className="flex gap-2"><FileText className="h-3 w-3 mt-0.5 shrink-0 opacity-50" /> `README.md` — index + audit trail of what was included</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSources}
                        onChange={(e) => setIS(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>Include source documents (ingested docs flagged for investor pack)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeCoverLetter}
                        onChange={(e) => setICL(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>Include templated cover letter</span>
                    </label>
                  </div>

                  <div className="text-[10px] text-muted-foreground italic">
                    To mark an ingested document for inclusion, open it in the Library and toggle the "Include in investor pack" option.
                  </div>
                </>
              )}

              {building && (
                <div className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" style={{ color: accent }} />
                  <div className="text-sm font-bold">Building bundle…</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Exporting 5 investor documents, fetching metrics, and packing the ZIP. Up to 60 seconds.
                  </div>
                </div>
              )}

              {result && result.error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                  <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                    <AlertTriangle className="h-4 w-4" /> Bundle failed
                  </div>
                  <div className="text-xs text-foreground/80 mt-1">{result.error}</div>
                </div>
              )}

              {result && !result.error && result.report && (
                <BundleReportView
                  report={result.report}
                  signedUrl={result.signedUrl}
                  filename={result.filename}
                  sizeBytes={result.sizeBytes}
                  brandColor={accent}
                  onCopyLink={handleCopyLink}
                />
              )}
            </div>

            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <div className="text-[10px] text-muted-foreground">
                {result?.signedUrl
                  ? '✓ Link is valid for 7 days'
                  : '~30-60s build time · 5 investor templates packed automatically'}
              </div>
              <div className="flex items-center gap-2">
                {!result && (
                  <>
                    <button
                      onClick={handleClose}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted/40"
                    >Cancel</button>
                    <button
                      onClick={handleExport}
                      disabled={building}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-60"
                      style={{ backgroundColor: accent }}
                    >
                      <Briefcase className="h-3 w-3" /> Build bundle
                    </button>
                  </>
                )}
                {result && (
                  <button
                    onClick={handleClose}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ backgroundColor: accent }}
                  >Done</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BundleReportView({
  report, signedUrl, filename, sizeBytes, brandColor, onCopyLink,
}: {
  report: InvestorBundleReport;
  signedUrl?: string;
  filename?: string;
  sizeBytes?: number;
  brandColor: string;
  onCopyLink: () => void;
}) {
  const includedCount   = report.investorDocs.filter((d) => d.status === 'included').length;
  const missingCount    = report.investorDocs.filter((d) => d.status === 'missing').length;
  const failedCount     = report.investorDocs.filter((d) => d.status === 'export_failed').length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card/40 p-4" style={{ borderColor: `${brandColor}30` }}>
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <div className="text-sm font-bold">Bundle ready</div>
        </div>
        <div className="text-xs text-muted-foreground">
          {filename} · {formatBytes(sizeBytes || 0)}
        </div>
        {signedUrl && (
          <div className="mt-3 flex items-center gap-2">
            <a
              href={signedUrl}
              download={filename}
              className="text-[11px] px-2 py-1 rounded-lg font-semibold text-white flex items-center gap-1"
              style={{ backgroundColor: brandColor }}
            >
              <Download className="h-2.5 w-2.5" /> Download again
            </a>
            <button
              onClick={onCopyLink}
              className="text-[11px] px-2 py-1 rounded-lg border border-border hover:bg-muted/40 flex items-center gap-1"
            >
              <Copy className="h-2.5 w-2.5" /> Copy link
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Investor documents</div>
        <div className="text-xs text-foreground/80 mb-3">
          {includedCount} included
          {missingCount > 0 && <span className="text-amber-400"> · {missingCount} missing</span>}
          {failedCount > 0 && <span className="text-red-400"> · {failedCount} failed</span>}
        </div>
        <div className="space-y-1.5">
          {report.investorDocs.map((d, i) => (
            <div key={i} className="text-xs flex items-start gap-2">
              {d.status === 'included' && <CheckCircle2 className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />}
              {d.status === 'missing' && <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />}
              {d.status === 'export_failed' && <AlertTriangle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {d.templateLabel}
                  {d.version != null && <span className="opacity-50 ml-1">v{d.version}</span>}
                </div>
                {d.documentName && <div className="opacity-70 text-[10px]">{d.documentName}</div>}
                {d.note && <div className="opacity-70 text-[10px] italic">{d.note}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Other contents</div>
        <ul className="text-xs text-foreground/80 space-y-1">
          <li className="flex gap-1.5"><BarChart3 className="h-3 w-3 opacity-50" /> metrics-snapshot.csv — {report.metricsRowCount} Data Room fields</li>
          {report.sourceDocs.length > 0
            ? <li className="flex gap-1.5"><FolderOpen className="h-3 w-3 opacity-50" /> source-documents/ — {report.sourceDocs.length} files</li>
            : <li className="text-[10px] italic text-muted-foreground">No source documents included (none flagged for investor pack).</li>}
          {report.coverLetterIncluded && <li className="flex gap-1.5"><Mail className="h-3 w-3 opacity-50" /> cover-letter.md</li>}
          <li className="flex gap-1.5"><FileText className="h-3 w-3 opacity-50" /> README.md</li>
        </ul>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
