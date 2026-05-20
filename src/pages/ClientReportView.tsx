/* ════════════════════════════════════════════════════════════════
   ClientReportView.tsx
   The public, read-only client report shown at /r/:token.
   No auth, no login — clients view the shared report directly.
   Loaded by signed-URL share token; only finalized/shared reports
   are returned by the backend.
════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Loader2 } from 'lucide-react';
import * as pmApi from '@/components/pm/api';
import { BlockRenderer } from '@/components/pm/BlockRenderer';
import type { SharedReport } from '@/components/pm/types';

export default function ClientReportView() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<SharedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const { report, error } = await pmApi.getSharedReport(token);
      setLoading(false);
      if (error || !report) { setError(error || 'Report not available.'); return; }
      setReport(report);
    })();
  }, [token]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading report…
      </div>
    </div>
  );

  if (error || !report) return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="text-center max-w-md">
        <div className="text-base font-semibold mb-2">Report not available</div>
        <div className="text-sm text-muted-foreground">{error || 'This share link is no longer active.'}</div>
      </div>
    </div>
  );

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <header className="space-y-2 pb-6 border-b border-border">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Client report
          </div>
          <h1 className="text-3xl font-bold text-foreground">{report.title}</h1>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
            {report.client && <span>{report.client}</span>}
            {report.project_name && <span>· {report.project_name}</span>}
            {(report.period_start || report.period_end) && (
              <span>· {fmtDate(report.period_start)} → {fmtDate(report.period_end)}</span>
            )}
          </div>
        </header>

        <main className="space-y-4">
          {report.blocks.map((b) => (
            <BlockRenderer key={b.id} block={b} />
          ))}
          {!report.blocks.length && (
            <div className="text-center text-sm text-muted-foreground py-8">
              This report has no blocks.
            </div>
          )}
        </main>

        <footer className="pt-6 border-t border-border text-[10px] text-muted-foreground text-center">
          Shared {new Date(report.shared_at).toLocaleString('en-GB')}
        </footer>
      </div>
    </div>
  );
}
