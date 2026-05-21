/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/AttachmentManager.tsx
   Brand Studio Phase 1C — Document image attachment manager.

   PM-side modal: drag-drop or pick image files, manage existing
   attachments, copy the `document://attachment-id` syntax to embed
   each image in the document body via the ::image directive.
═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import {
  Image as ImageIcon, Upload, Trash2, Copy, X, Loader2, AlertTriangle,
  Edit3, CheckCircle2, FileImage,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  attachImage, listAttachments, deleteAttachment,
  type DocumentAttachment,
} from './api';
import { compressImage } from './image-compression';

interface Props {
  documentId: string;
  projectId:  string;
  authorId:   string;
  authorLabel:string;
  brandColor?:string;
  onClose:    () => void;
  /** Called whenever attachments are added/removed so the parent can
   *  refresh the document viewer's dataContext. */
  onChange?:  (attachments: DocumentAttachment[]) => void;
}

const MAX_BYTES = 25 * 1024 * 1024;

export default function AttachmentManager({
  documentId, projectId, authorId, authorLabel, brandColor, onClose, onChange,
}: Props) {
  const accent = brandColor || '#8b5cf6';
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([]);
  const [loading, setLoading]         = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [dragOver, setDragOver]       = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editAlt, setEditAlt]         = useState('');
  const [editCaption, setEditCaption] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listAttachments({ documentId });
    setAttachments(r.attachments);
    if (onChange) onChange(r.attachments);
    setLoading(false);
  }, [documentId, onChange]);

  useEffect(() => { load(); }, [load]);

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);

    for (const file of arr) {
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Not an image', description: `${file.name} skipped — only images are supported.`, variant: 'destructive' });
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast({ title: 'Too large', description: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Max is 25MB.`, variant: 'destructive' });
        continue;
      }

      try {
        const compressed = await compressImage(file);
        const r = await attachImage({
          documentId,
          projectId,
          fileName:        file.name,
          contentType:     compressed.contentType,
          base64:          compressed.base64,
          width:           compressed.width,
          height:          compressed.height,
          uploadedByType:  'staff',
          uploadedById:    authorId,
          uploadedByLabel: authorLabel,
        });
        if (r.error) {
          toast({ title: 'Upload failed', description: r.error, variant: 'destructive' });
        } else if (r.attachment) {
          toast({
            title: 'Uploaded',
            description: compressed.compressed
              ? `${file.name} compressed from ${(compressed.originalSize / 1024).toFixed(0)}KB to ${(compressed.sizeBytes / 1024).toFixed(0)}KB.`
              : `${file.name} added.`,
          });
        }
      } catch (e: any) {
        toast({ title: 'Compression failed', description: e?.message || String(e), variant: 'destructive' });
      }
    }
    setUploading(false);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this attachment? Any document content referencing it will show a missing-image placeholder.')) return;
    const r = await deleteAttachment({ id, projectId });
    if (r.success) {
      toast({ title: 'Deleted' });
      load();
    } else {
      toast({ title: 'Delete failed', description: r.error, variant: 'destructive' });
    }
  };

  const copyEmbed = async (att: DocumentAttachment) => {
    const syntax = `::image{src="document://${att.id}" alt="${att.alt || att.name}"${att.caption ? ` caption="${att.caption}"` : ''}}`;
    try {
      await navigator.clipboard.writeText(syntax);
      toast({ title: 'Embed code copied', description: 'Paste into the document body to embed this image.' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const startEdit = (att: DocumentAttachment) => {
    setEditingId(att.id);
    setEditAlt(att.alt || '');
    setEditCaption(att.caption || '');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" style={{ color: accent }} />
            <div className="text-sm font-bold">Image attachments</div>
            <span className="text-[10px] text-muted-foreground">— {attachments.length}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Drop zone */}
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
            }}
            className={`block rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              dragOver ? 'bg-muted/40' : 'hover:bg-muted/20'
            }`}
            style={{ borderColor: dragOver ? accent : undefined }}
          >
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" style={{ color: accent }} />
                <div className="text-sm font-semibold">Uploading…</div>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1" />
                <div className="text-sm font-semibold">Drop images here or click to browse</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  JPEG / PNG / WebP / GIF / SVG · Files {`>`} 2MB are auto-compressed · Max 25MB
                </div>
              </>
            )}
          </label>

          {/* Existing attachments */}
          {loading && (
            <div className="text-center py-6">
              <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}

          {!loading && attachments.length === 0 && (
            <div className="text-center py-8">
              <FileImage className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <div className="text-xs text-muted-foreground">No images attached yet.</div>
            </div>
          )}

          {!loading && attachments.length > 0 && (
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Attached images
              </div>
              {attachments.map((att) => (
                <AttachmentRow
                  key={att.id}
                  attachment={att}
                  brandColor={accent}
                  editing={editingId === att.id}
                  editAlt={editAlt}
                  editCaption={editCaption}
                  setEditAlt={setEditAlt}
                  setEditCaption={setEditCaption}
                  onEdit={() => startEdit(att)}
                  onEditDone={() => setEditingId(null)}
                  onCopy={() => copyEmbed(att)}
                  onDelete={() => handleDelete(att.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Embed via <code className="font-mono ml-0.5">::image{`{src="document://<id>"}`}</code>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground hover:bg-muted/40"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachmentRow({
  attachment, brandColor, editing, editAlt, editCaption,
  setEditAlt, setEditCaption,
  onEdit, onEditDone, onCopy, onDelete,
}: {
  attachment: DocumentAttachment;
  brandColor: string;
  editing: boolean;
  editAlt: string;
  editCaption: string;
  setEditAlt: (v: string) => void;
  setEditCaption: (v: string) => void;
  onEdit: () => void;
  onEditDone: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3 flex items-start gap-3">
      <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted/30 flex items-center justify-center">
        {attachment.signedUrl ? (
          <img
            src={attachment.signedUrl}
            alt={attachment.alt || attachment.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }}
          />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{attachment.name}</div>
        <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
          <span>{attachment.content_type}</span>
          <span>·</span>
          <span>{(attachment.size_bytes / 1024).toFixed(0)} KB</span>
          {attachment.width && attachment.height && (
            <>
              <span>·</span>
              <span>{attachment.width} × {attachment.height}</span>
            </>
          )}
        </div>
        {editing ? (
          <div className="space-y-1.5 mt-2">
            <input
              value={editAlt}
              onChange={(e) => setEditAlt(e.target.value)}
              placeholder="Alt text (for accessibility + SEO)"
              className="w-full h-7 text-xs px-2 rounded-lg border border-border bg-background/60 outline-none focus:border-purple-400"
            />
            <input
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              placeholder="Caption (shown below the image)"
              className="w-full h-7 text-xs px-2 rounded-lg border border-border bg-background/60 outline-none focus:border-purple-400"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={onEditDone}
                className="text-[10px] px-2 py-0.5 rounded bg-muted text-foreground hover:bg-muted/80"
              >Done</button>
              <span className="text-[9px] text-muted-foreground italic">
                Edits show in the next viewer reload — apply edits inline via the directive attrs
              </span>
            </div>
          </div>
        ) : (
          <>
            {(attachment.alt || attachment.caption) && (
              <div className="text-[10px] text-muted-foreground mt-1 italic">
                {attachment.alt && <span>alt: "{attachment.alt}"</span>}
                {attachment.alt && attachment.caption && <span> · </span>}
                {attachment.caption && <span>caption: "{attachment.caption}"</span>}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <button
          onClick={onCopy}
          className="text-[10px] px-2 py-1 rounded-lg font-semibold text-white flex items-center gap-1"
          style={{ backgroundColor: brandColor }}
          title="Copy embed code to paste into document body"
        >
          <Copy className="h-2.5 w-2.5" /> Copy embed
        </button>
        <div className="flex items-center gap-0.5">
          {!editing && (
            <button
              onClick={onEdit}
              className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"
              title="Edit alt + caption"
            >
              <Edit3 className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
            title="Delete attachment"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
