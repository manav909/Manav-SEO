/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/ClientUploadPanel.tsx
   Brand Studio H.6a — Client-side file upload.

   Uploads route through the existing ingest pipeline. Backend tags
   client_uploaded=true and sets approval_state='draft' until PM
   reviews. Same NEVER_OVERWRITE discipline preserved.

   25MB hard cap matches backend.
═══════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { Upload, Loader2, X, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { clientSessionUploadFile } from './api';

interface Props {
  sessionToken: string;
  brandColor?:  string;
}

const MAX_BYTES = 25 * 1024 * 1024;

export default function ClientUploadPanel({ sessionToken, brandColor }: Props) {
  const [file, setFile]           = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]       = useState<{ ok: boolean; message: string } | null>(null);
  const accent = brandColor || '#06b6d4';

  const handleFileChange = (f: File | null) => {
    setResult(null);
    if (!f) { setFile(null); return; }
    if (f.size > MAX_BYTES) {
      toast({ title: 'File too large', description: `Files must be 25MB or smaller. This file is ${(f.size / 1024 / 1024).toFixed(1)}MB.`, variant: 'destructive' });
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      /* Read as base64 */
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => {
          const s = String(reader.result || '');
          const idx = s.indexOf(',');
          res(idx >= 0 ? s.slice(idx + 1) : s);
        };
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const r = await clientSessionUploadFile({
        sessionToken,
        fileName:      file.name,
        contentType:   file.type || 'application/octet-stream',
        contentBase64: base64,
      });
      if (r.error) {
        setResult({ ok: false, message: r.error });
        toast({ title: 'Upload failed', description: r.error, variant: 'destructive' });
      } else {
        setResult({ ok: true, message: 'Uploaded. Your account manager will review it before it becomes part of the project record.' });
        toast({ title: 'Uploaded' });
        setFile(null);
      }
    } catch (e: any) {
      setResult({ ok: false, message: e?.message || 'Upload failed' });
    }
    setUploading(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4" style={{ color: accent }} />
        <div className="text-sm font-bold">Share a file with your account manager</div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Upload compliance updates, customer testimonials, brand assets, or anything else relevant. Files are reviewed by your account manager before becoming part of the project record. Max 25MB per file.
      </div>

      {!file ? (
        <label className="block rounded-xl border-2 border-dashed border-border hover:bg-muted/20 cursor-pointer p-6 text-center transition-colors">
          <input type="file" className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)} />
          <Upload className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1" />
          <div className="text-sm font-semibold">Click to choose a file</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">PDF, DOCX, XLSX, images, text — anything up to 25MB</div>
        </label>
      ) : (
        <div className="rounded-xl border border-border bg-background/40 p-3 flex items-center gap-3">
          <FileText className="h-5 w-5 shrink-0" style={{ color: accent }} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{file.name}</div>
            <div className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · {file.type || 'unknown'}</div>
          </div>
          <button onClick={() => setFile(null)} disabled={uploading} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {file && (
        <button onClick={upload} disabled={uploading}
          className="w-full px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: accent }}>
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          Upload
        </button>
      )}

      {result && (
        <div className={`rounded-xl border p-3 text-xs flex items-start gap-2 ${
          result.ok ? 'border-green-500/30 bg-green-500/[0.04] text-green-400' :
          'border-red-500/30 bg-red-500/[0.04] text-red-400'
        }`}>
          {result.ok ? <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
}
