/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/CommentsPanel.tsx
   Brand Studio H.6a — Threaded comments on documents.

   Works for both PM and client modes:
   - PM (staff):   pass { mode: 'staff', authorId, authorLabel }
   - Client:       pass { mode: 'client_session', sessionToken, authorId, authorLabel }
═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import {
  MessageCircle, Send, CheckCheck, Trash2, Loader2, RotateCcw, X,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listComments, postComment, resolveComment, deleteComment,
  clientSessionListComments, clientSessionPostComment,
  type DocumentComment,
} from './api';

interface PropsBase {
  documentId:  string;
  projectId:   string;
  sectionKey?: string | null;
  authorId:    string;
  authorLabel: string;
}

interface PropsStaff extends PropsBase {
  mode: 'staff';
}

interface PropsClient extends PropsBase {
  mode: 'client_session';
  sessionToken: string;
  /* When mode=client_session, posting/listing route through session API */
}

type Props = PropsStaff | PropsClient;

export default function CommentsPanel(props: Props) {
  const [comments, setComments]    = useState<DocumentComment[]>([]);
  const [loading, setLoading]      = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [draft, setDraft]          = useState('');
  const [replyTo, setReplyTo]      = useState<string | null>(null);
  const [posting, setPosting]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    if (props.mode === 'staff') {
      const r = await listComments({
        documentId: props.documentId, projectId: props.projectId,
        includeResolved: showResolved,
      });
      setComments(r.comments);
    } else {
      const r = await clientSessionListComments({
        sessionToken: props.sessionToken, documentId: props.documentId,
      });
      const filtered = showResolved ? r.comments : r.comments.filter((c) => !c.resolved);
      setComments(filtered);
    }
    setLoading(false);
  }, [props, showResolved]);

  useEffect(() => { load(); }, [load]);

  /* Group: root comments + their replies */
  const grouped = comments
    .filter((c) => !c.deleted_at)
    .reduce((acc, c) => {
      if (!c.parent_comment_id) {
        acc.roots.push(c);
      } else {
        (acc.repliesByParent[c.parent_comment_id] ||= []).push(c);
      }
      return acc;
    }, { roots: [] as DocumentComment[], repliesByParent: {} as Record<string, DocumentComment[]> });

  /* Filter for section if specified */
  const visibleRoots = props.sectionKey != null
    ? grouped.roots.filter((c) => c.section_key === props.sectionKey)
    : grouped.roots;

  const submit = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    if (props.mode === 'staff') {
      const r = await postComment({
        documentId:      props.documentId,
        projectId:       props.projectId,
        sectionKey:      props.sectionKey,
        parentCommentId: replyTo,
        bodyText:        draft.trim(),
        authorType:      'staff',
        authorId:        props.authorId,
        authorLabel:     props.authorLabel,
      });
      if (r.error) toast({ title: 'Comment failed', description: r.error, variant: 'destructive' });
    } else {
      const r = await clientSessionPostComment({
        sessionToken:    props.sessionToken,
        documentId:      props.documentId,
        sectionKey:      props.sectionKey,
        parentCommentId: replyTo,
        bodyText:        draft.trim(),
      });
      if (r.error) toast({ title: 'Comment failed', description: r.error, variant: 'destructive' });
    }
    setDraft('');
    setReplyTo(null);
    setPosting(false);
    load();
  };

  const handleResolve = async (id: string, undo: boolean) => {
    if (props.mode !== 'staff') return;
    const { success, error } = await resolveComment({
      id, projectId: props.projectId, undo,
      resolvedByType: 'staff', resolvedById: props.authorId, resolvedByLabel: props.authorLabel,
    });
    if (!success) {
      toast({ title: 'Update failed', description: error, variant: 'destructive' });
      return;
    }
    load();
  };

  const handleDelete = async (id: string) => {
    if (props.mode !== 'staff') return;
    if (!window.confirm('Delete this comment? Thread context is preserved but body is hidden.')) return;
    const { success } = await deleteComment({ id, projectId: props.projectId });
    if (success) {
      toast({ title: 'Deleted' });
      load();
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-bold">
          {props.sectionKey ? `Comments on this section` : 'Document comments'}
        </div>
        <span className="text-[10px] text-muted-foreground">— {visibleRoots.length}</span>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="accent-purple-500" />
          Show resolved
        </label>
      </div>

      {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}

      {!loading && visibleRoots.length === 0 && (
        <div className="text-[11px] text-muted-foreground italic text-center py-4">
          No comments yet. Start the conversation below.
        </div>
      )}

      <div className="space-y-2">
        {visibleRoots.map((c) => (
          <CommentThread
            key={c.id}
            root={c}
            replies={grouped.repliesByParent[c.id] || []}
            canResolve={props.mode === 'staff'}
            onReply={() => setReplyTo(c.id)}
            onResolve={(undo) => handleResolve(c.id, undo)}
            onDelete={() => handleDelete(c.id)}
            isReplyTarget={replyTo === c.id}
          />
        ))}
      </div>

      {/* Composer */}
      <div className="border-t border-border pt-3 space-y-2">
        {replyTo && (
          <div className="text-[10px] text-purple-400 flex items-center gap-1.5">
            <span>Replying to comment</span>
            <button onClick={() => setReplyTo(null)} className="hover:text-foreground"><X className="h-2.5 w-2.5" /></button>
          </div>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={8000}
          placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
          className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y"
        />
        <div className="flex items-center justify-end gap-2">
          <span className="text-[10px] text-muted-foreground mr-auto">Posting as {props.authorLabel}</span>
          <button
            onClick={submit}
            disabled={!draft.trim() || posting}
            className="px-3 py-1.5 rounded-xl bg-purple-500 text-white text-xs font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1"
          >
            {posting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentThread({
  root, replies, canResolve, onReply, onResolve, onDelete, isReplyTarget,
}: {
  root: DocumentComment;
  replies: DocumentComment[];
  canResolve: boolean;
  onReply: () => void;
  onResolve: (undo: boolean) => void;
  onDelete: () => void;
  isReplyTarget: boolean;
}) {
  return (
    <div className={`rounded-xl border ${
      root.resolved ? 'border-green-500/20 bg-green-500/[0.02] opacity-70' :
      isReplyTarget ? 'border-purple-500/40 bg-purple-500/[0.04]' :
      'border-border bg-background/40'
    } p-3`}>
      <CommentBubble c={root} canResolve={canResolve} onReply={onReply} onResolve={onResolve} onDelete={onDelete} isRoot />
      {replies.length > 0 && (
        <div className="mt-2 ml-4 pl-3 border-l border-border space-y-2">
          {replies.map((r) => (
            <CommentBubble key={r.id} c={r} canResolve={canResolve} onReply={onReply} onResolve={() => {}} onDelete={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentBubble({
  c, canResolve, onReply, onResolve, onDelete, isRoot,
}: {
  c: DocumentComment;
  canResolve: boolean;
  onReply: () => void;
  onResolve: (undo: boolean) => void;
  onDelete: () => void;
  isRoot?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-bold">{c.author_label}</span>
        <span className={`text-[9px] uppercase tracking-wider px-1 py-0 rounded font-bold ${
          c.author_type === 'staff' ? 'bg-purple-500/15 text-purple-400' : 'bg-cyan-500/15 text-cyan-400'
        }`}>{c.author_type}</span>
        <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
        {c.resolved && <span className="text-[9px] uppercase tracking-wider px-1 py-0 rounded bg-green-500/15 text-green-400 font-bold">resolved</span>}
      </div>
      <div className="text-xs text-foreground/90 mt-0.5 whitespace-pre-wrap">{c.body}</div>
      {isRoot && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <button onClick={onReply} className="text-[10px] text-muted-foreground hover:text-foreground">Reply</button>
          {canResolve && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <button onClick={() => onResolve(c.resolved)}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                {c.resolved ? <><RotateCcw className="h-2.5 w-2.5" /> Reopen</> : <><CheckCheck className="h-2.5 w-2.5" /> Resolve</>}
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button onClick={onDelete} className="text-[10px] text-muted-foreground hover:text-red-400 flex items-center gap-0.5">
                <Trash2 className="h-2.5 w-2.5" /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
