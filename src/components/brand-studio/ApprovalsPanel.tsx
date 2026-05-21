/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/ApprovalsPanel.tsx
   Brand Studio H.6a — Approval requests on documents.

   Two modes:
   - PM: shows current approval state, lets PM request approval / cancel
   - Client: shows pending requests directed at the user, lets them
     respond approved / needs_changes
═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import { FileCheck2, FileWarning, Send, Loader2, X, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listApprovals, requestApproval, cancelApproval,
  clientSessionListApprovals, clientSessionRespondApproval,
  listClientUsers,
  type DocumentApproval, type ClientUser,
} from './api';

interface PropsStaff {
  mode: 'staff';
  documentId:    string;
  projectId:     string;
  pmStaffId:     string;
  pmStaffLabel:  string;
}

interface PropsClient {
  mode: 'client_session';
  documentId:    string;
  sessionToken:  string;
}

type Props = PropsStaff | PropsClient;

export default function ApprovalsPanel(props: Props) {
  const [approvals, setApprovals] = useState<DocumentApproval[]>([]);
  const [loading, setLoading]     = useState(false);
  const [showRequest, setShowRequest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    if (props.mode === 'staff') {
      const r = await listApprovals({ projectId: props.projectId, documentId: props.documentId });
      setApprovals(r.approvals);
    } else {
      const r = await clientSessionListApprovals({
        sessionToken: props.sessionToken, documentId: props.documentId, openOnly: true,
      });
      setApprovals(r.approvals);
    }
    setLoading(false);
  }, [props]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (id: string) => {
    if (props.mode !== 'staff') return;
    if (!window.confirm('Cancel this approval request?')) return;
    const { success, error } = await cancelApproval({ id, projectId: props.projectId });
    if (!success) {
      toast({ title: 'Cancel failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Approval cancelled' });
    load();
  };

  const handleRespond = async (id: string, decision: 'approved' | 'needs_changes', message?: string) => {
    if (props.mode !== 'client_session') return;
    const { error } = await clientSessionRespondApproval({
      sessionToken: props.sessionToken, id, decision, responseMessage: message,
    });
    if (error) {
      toast({ title: 'Response failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: decision === 'approved' ? 'Approved' : 'Changes requested' });
    load();
  };

  const openRequest = approvals.find((a) => a.state === 'in_review');
  const historic = approvals.filter((a) => a.state !== 'in_review');

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-bold">Approval</div>
        {openRequest && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">awaiting response</span>
        )}
        {props.mode === 'staff' && !openRequest && (
          <button onClick={() => setShowRequest(true)} className="ml-auto text-[10px] px-2 py-1 rounded-lg bg-purple-500 text-white font-semibold hover:bg-purple-500/90 flex items-center gap-1">
            <Send className="h-2.5 w-2.5" /> Request approval
          </button>
        )}
      </div>

      {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}

      {!loading && approvals.length === 0 && (
        <div className="text-[11px] text-muted-foreground italic text-center py-3">
          No approval requests yet.
        </div>
      )}

      {openRequest && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">In review (v{openRequest.document_version})</div>
          <div className="text-xs">
            <strong>{openRequest.requested_by_label}</strong> requested approval
            <span className="text-muted-foreground"> · {new Date(openRequest.requested_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
          {openRequest.request_message && (
            <div className="text-[11px] text-foreground/80 italic border-l-2 border-amber-500/30 pl-2">
              "{openRequest.request_message}"
            </div>
          )}
          {props.mode === 'client_session' && (
            <ClientRespondActions onRespond={(decision, msg) => handleRespond(openRequest.id, decision, msg)} />
          )}
          {props.mode === 'staff' && (
            <button onClick={() => handleCancel(openRequest.id)} className="text-[10px] text-muted-foreground hover:text-red-400">
              Cancel request
            </button>
          )}
        </div>
      )}

      {historic.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">History</div>
          {historic.map((a) => <HistoricApproval key={a.id} approval={a} />)}
        </div>
      )}

      {props.mode === 'staff' && showRequest && (
        <RequestApprovalDialog
          projectId={props.projectId}
          documentId={props.documentId}
          pmStaffId={props.pmStaffId}
          pmStaffLabel={props.pmStaffLabel}
          onClose={() => setShowRequest(false)}
          onSent={() => { setShowRequest(false); load(); }}
        />
      )}
    </div>
  );
}

function HistoricApproval({ approval }: { approval: DocumentApproval }) {
  const tone =
    approval.state === 'approved'      ? 'bg-green-500/10 border-green-500/30 text-green-400' :
    approval.state === 'needs_changes' ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' :
    'bg-muted/30 border-border text-muted-foreground';
  return (
    <div className={`rounded-lg border p-2 text-[11px] ${tone}`}>
      <div className="font-semibold flex items-center gap-1">
        {approval.state === 'approved' && <CheckCircle2 className="h-3 w-3" />}
        {approval.state === 'needs_changes' && <FileWarning className="h-3 w-3" />}
        {approval.state === 'cancelled' && <XCircle className="h-3 w-3" />}
        v{approval.document_version} — {approval.state.replace(/_/g, ' ')}
      </div>
      {approval.responded_by_label && (
        <div className="text-foreground/80 mt-0.5">
          {approval.responded_by_label} · {approval.responded_at ? new Date(approval.responded_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : ''}
        </div>
      )}
      {approval.response_message && <div className="italic text-foreground/70 mt-0.5">"{approval.response_message}"</div>}
    </div>
  );
}

function ClientRespondActions({
  onRespond,
}: {
  onRespond: (decision: 'approved' | 'needs_changes', msg?: string) => void;
}) {
  const [mode, setMode] = useState<null | 'approved' | 'needs_changes'>(null);
  const [msg, setMsg] = useState('');

  if (mode === null) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => setMode('approved')}
          className="text-[10px] px-3 py-1.5 rounded-lg bg-green-500 text-white font-bold hover:bg-green-500/90 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Approve
        </button>
        <button onClick={() => setMode('needs_changes')}
          className="text-[10px] px-3 py-1.5 rounded-lg bg-orange-500 text-white font-bold hover:bg-orange-500/90 flex items-center gap-1">
          <FileWarning className="h-3 w-3" /> Request changes
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder={mode === 'approved' ? 'Optional message…' : 'Describe the changes you need…'}
        className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background/60 outline-none focus:border-purple-400 resize-y"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => onRespond(mode, msg.trim() || undefined)}
          className={`text-[10px] px-3 py-1.5 rounded-lg text-white font-bold flex items-center gap-1 ${
            mode === 'approved' ? 'bg-green-500 hover:bg-green-500/90' : 'bg-orange-500 hover:bg-orange-500/90'
          }`}
        >
          {mode === 'approved' ? 'Confirm approval' : 'Send changes'}
        </button>
        <button onClick={() => setMode(null)} className="text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </div>
  );
}

function RequestApprovalDialog({
  projectId, documentId, pmStaffId, pmStaffLabel, onClose, onSent,
}: {
  projectId: string; documentId: string; pmStaffId: string; pmStaffLabel: string;
  onClose: () => void; onSent: () => void;
}) {
  const [message, setMessage]   = useState('');
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [approvers, setApprovers] = useState<ClientUser[]>([]);
  const [sending, setSending]   = useState(false);

  useEffect(() => {
    (async () => {
      const r = await listClientUsers({ projectId });
      setApprovers(r.client_users.filter((u) => u.active));
    })();
  }, [projectId]);

  const send = async () => {
    setSending(true);
    const { error } = await requestApproval({
      documentId, projectId,
      requestedById: pmStaffId, requestedByLabel: pmStaffLabel,
      requestMessage: message.trim() || undefined,
      requestedFromUserId: targetUserId || undefined,
    });
    setSending(false);
    if (error) {
      toast({ title: 'Could not send request', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Approval requested' });
    onSent();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-lg w-full">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-bold">Request approval</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Approver</label>
            <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400">
              <option value="">Any approver with grant</option>
              {approvers.map((u) => (
                <option key={u.id} value={u.id}>{u.display_name || u.email} ({u.role})</option>
              ))}
            </select>
            <div className="text-[10px] text-muted-foreground">
              If "Any approver" — all client users with approve-level grant on this document are notified.
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Message (optional)</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000}
              placeholder={`e.g. "Ready for your review. Pay attention to section 3 — that's the new positioning we discussed."`}
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={send} disabled={sending}
            className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1.5">
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Send request
          </button>
        </div>
      </div>
    </div>
  );
}
