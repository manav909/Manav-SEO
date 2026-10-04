/* Team → Client inbox. Every client conversation in one place, waiting
   ones first. When a client writes, an AI draft reply is ready; the team
   member reads it, edits it and sends it as Manvisha. Nothing AI-written
   reaches a client without a person sending it. */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Send, Trash2 } from 'lucide-react';
import PortalNav from '@/components/PortalNav';
import { toast } from '@/hooks/use-toast';

interface Thread {
  projectId: string;
  project?: { id: string; name?: string; url?: string };
  last: { from: string; name?: string; body: string; at: string };
  waiting: boolean;
  hasDraft: boolean;
  unread: number;
}
interface Msg { id: string; author_type: 'client' | 'staff' | 'ai_draft'; author_label?: string; staff_email?: string; body: string; created_at: string }

async function engine(body: object) {
  const r = await fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ success: false, error: 'Unexpected server reply' }));
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function TeamInbox() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [hint, setHint] = useState('');
  const [active, setActive] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<'' | 'send' | 'redraft' | 'thread'>('');
  const [name, setName] = useState('Manvisha');

  const loadInbox = useCallback(async () => {
    const r = await engine({ action: 'cps_inbox' });
    if (!r?.success) { toast({ title: 'Inbox unavailable', description: r?.error, variant: 'destructive' }); setThreads([]); return; }
    setThreads(r.threads); setHint(r.hint || ''); if (r.strategist?.name) setName(r.strategist.name);
  }, []);

  const openThread = useCallback(async (projectId: string) => {
    setActive(projectId); setBusy('thread');
    const r = await engine({ action: 'cps_thread', projectId });
    setBusy('');
    if (!r?.success) { toast({ title: 'Could not open conversation', description: r?.error, variant: 'destructive' }); return; }
    setMessages(r.messages || []);
    setDraftId(r.draft?.id || null);
    setReply(r.draft?.body || '');
  }, []);

  useEffect(() => { loadInbox(); const t = setInterval(loadInbox, 60_000); return () => clearInterval(t); }, [loadInbox]);

  const send = async () => {
    if (!reply.trim()) return;
    setBusy('send');
    const r = await engine({ action: 'cps_reply', projectId: active, body: reply.trim(), draftId });
    setBusy('');
    if (!r?.success) { toast({ title: 'Not sent', description: r?.error, variant: 'destructive' }); return; }
    toast({ title: 'Sent', description: `The client sees it from ${name}.` });
    await openThread(active); loadInbox();
  };

  const redraft = async () => {
    setBusy('redraft');
    const r = await engine({ action: 'cps_redraft', projectId: active });
    setBusy('');
    if (!r?.success) { toast({ title: 'No new draft', description: r?.error }); return; }
    await openThread(active);
  };

  const discard = async () => {
    if (draftId) await engine({ action: 'cps_discard_draft', draftId });
    setDraftId(null); setReply('');
  };

  const current = threads?.find((t) => t.projectId === active);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-xl font-bold">Client inbox</h1>
        <p className="text-sm text-muted-foreground mb-5">Clients write to {name}. A suggested reply is ready for each new message — check it, change anything, then send.</p>
        {hint && <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{hint}</div>}

        <div className="grid md:grid-cols-[320px_1fr] gap-4">
          <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border overflow-hidden">
            {!threads && <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            {threads?.length === 0 && <div className="p-5 text-sm text-muted-foreground">No client messages yet.</div>}
            {threads?.map((t) => (
              <button key={t.projectId} onClick={() => openThread(t.projectId)}
                className={`w-full text-left p-4 hover:bg-muted/40 ${active === t.projectId ? 'bg-muted/60' : ''}`}>
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-sm truncate">{t.project?.name || t.project?.url || 'Client'}</span>
                  {t.waiting && <span className="shrink-0 text-[11px] font-bold rounded-full px-2 py-0.5 bg-primary text-primary-foreground">Waiting</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.last.from === 'client' ? '' : `${name}: `}{t.last.body}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{when(t.last.at)}{t.hasDraft ? ' · draft ready' : ''}</div>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-4 min-h-[420px] flex flex-col gap-3">
            {!active && <div className="m-auto text-sm text-muted-foreground">Pick a conversation.</div>}
            {active && busy === 'thread' && <div className="m-auto"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            {active && busy !== 'thread' && (
              <>
                <div className="font-semibold">{current?.project?.name || 'Client'} <span className="text-xs text-muted-foreground font-normal">{current?.project?.url}</span></div>
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[50vh] pr-1">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.author_type === 'client' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.author_type === 'client' ? 'bg-muted' : 'bg-primary/15'}`}>
                        <div className="text-[11px] font-semibold mb-0.5">{m.author_type === 'client' ? m.author_label : `${m.author_label}${m.staff_email ? ` (${m.staff_email})` : ''}`}</div>
                        {m.body}
                        <div className="text-[10px] text-muted-foreground mt-1">{when(m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <label htmlFor="team-reply" className="text-xs font-semibold text-muted-foreground">
                    {draftId ? 'Suggested reply — edit before sending' : `Reply as ${name}`}
                  </label>
                  <textarea id="team-reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={5}
                    className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm" />
                  <div className="flex flex-wrap gap-2 justify-end">
                    {draftId && <button onClick={discard} className="px-3 py-2 rounded-lg border border-border text-sm inline-flex items-center gap-1.5"><Trash2 className="h-3.5 w-3.5" />Discard draft</button>}
                    <button onClick={redraft} disabled={!!busy} className="px-3 py-2 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                      {busy === 'redraft' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}New suggestion
                    </button>
                    <button onClick={send} disabled={!reply.trim() || !!busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                      {busy === 'send' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Send as {name}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
