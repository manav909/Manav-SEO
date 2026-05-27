/* ════════════════════════════════════════════════════════════════
   src/components/pm/PMChatPanel.tsx
   PM Strategic Chat — always-on advisor for the project manager.

   Knows: audits, campaigns, dev tasks, board, documents.
   Answers: strategy, audit comparison, impact analysis, priorities.
   Lives as a floating panel — visible on every PM tab.
════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface PMChatPanelProps {
  projectId: string;
  activeTab: string;
}

async function callApi<T = unknown>(action: string, payload: Record<string, unknown>) {
  try {
    const res = await fetch('/api/task-engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const text = await res.text();
    if (!text.trim()) return { ok: false, error: 'Empty response' } as any;
    const json = JSON.parse(text);
    return { ok: !json.error, data: json as T, error: json.error };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

const SUGGESTED: Record<string, string[]> = {
  board:        ['What should I prioritise this week?', 'Which tasks have the biggest SEO impact?', 'Are we on track?'],
  reports:      ['Summarise what changed since last audit', 'What improved and what got worse?', 'What should the client focus on?'],
  seo_campaigns:['Are our campaigns gaining traction?', 'Which keyword is closest to ranking?', 'What is blocking better rankings?'],
  developer:    ['Which dev fix will move rankings the most?', 'Is Phase 0 complete?', 'What happens if we skip the LCP fix?'],
  documents:    ['What does the latest audit report say?', 'Compare the last two audits', 'What are the top issues?'],
  autopilot:    ['What is autopilot doing this week?', 'Is the automation on track?'],
  default:      ['What is the biggest priority right now?', 'Compare our last two audits', 'What is blocking rankings?', 'Give me a strategy overview'],
};

export default function PMChatPanel({ projectId, activeTab }: PMChatPanelProps) {
  const [open,       setOpen]      = useState(false);
  const [messages,   setMessages]  = useState<Message[]>([]);
  const [input,      setInput]     = useState('');
  const [loading,    setLoading]   = useState(false);
  const [minimised,  setMinimised] = useState(false);
  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = SUGGESTED[activeTab] || SUGGESTED.default;

  // Reset messages when project changes
  useEffect(() => { setMessages([]); }, [projectId]);

  // Focus input when opened
  useEffect(() => {
    if (open && !minimised) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimised]);

  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [messages, loading]);

  const send = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');

    const newMessages: Message[] = [...messages, { role: 'user', content: msg }];
    setMessages(newMessages);
    setLoading(true);

    const result = await callApi<{ reply: string }>('pm_chat', {
      message:   msg,
      projectId,
      activeTab,
      history:   newMessages.slice(-10).slice(0, -1).map(m => ({ role: m.role, content: m.content })),
    });

    const reply = result.ok && (result as any).data?.reply
      ? (result as any).data.reply
      : 'I could not get a response. Try again.';

    setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    setLoading(false);
  }, [input, loading, messages, projectId, activeTab]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const unread = !open && messages.length > 0 && messages[messages.length - 1].role === 'assistant';

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => { setOpen(true); setMinimised(false); }}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold transition-all ${
          open && !minimised
            ? 'opacity-0 pointer-events-none'
            : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_30px_hsl(var(--primary)/0.4)]'
        }`}
      >
        <span className="text-base">✦</span>
        <span>Ask Manav</span>
        {unread && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-400 border-2 border-background" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className={`fixed bottom-6 right-6 z-40 flex flex-col bg-card border border-border rounded-2xl shadow-2xl transition-all duration-200 ${
          minimised ? 'w-64 h-12' : 'w-[420px]'
        }`}
        style={{ maxHeight: minimised ? 48 : 'calc(100vh - 120px)', minHeight: minimised ? 48 : 400 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                ✦
              </div>
              <div>
                <div className="text-sm font-semibold leading-none">Manav</div>
                {!minimised && <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">{activeTab.replace('_',' ')} · Project advisor</div>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setMinimised(v => !v)}
                className="w-7 h-7 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                {minimised ? '↑' : '–'}
              </button>
              <button type="button" onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                ✕
              </button>
            </div>
          </div>

          {!minimised && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

                {messages.length === 0 && (
                  <div className="py-4 text-center">
                    <div className="text-2xl mb-2">✦</div>
                    <p className="text-sm font-medium mb-1">Project Advisor</p>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                      I know your audits, campaigns, dev tasks, and board. Ask me anything — strategy, comparisons, priorities.
                    </p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary mt-0.5">
                        ✦
                      </div>
                    )}
                    <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-muted/50 border border-border text-foreground rounded-tl-sm'
                    }`}>
                      {msg.content}
                    </div>
                    {msg.role === 'user' && (
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted/60 border border-border flex items-center justify-center text-[10px] text-muted-foreground font-medium mt-0.5">
                        You
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-2.5 justify-start">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">✦</div>
                    <div className="px-3.5 py-2.5 rounded-2xl bg-muted/50 border border-border text-muted-foreground text-sm">
                      <span className="animate-pulse">Analysing…</span>
                    </div>
                  </div>
                )}

                <div ref={endRef} />
              </div>

              {/* Suggestions — shown when no messages or after assistant responds */}
              {(messages.length === 0 || (!loading && messages[messages.length - 1]?.role === 'assistant')) && (
                <div className="px-4 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
                  {suggestions.map(s => (
                    <button key={s} type="button"
                      onClick={() => send(s)}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="flex gap-2 p-3 border-t border-border flex-shrink-0">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Ask about strategy, audits, campaigns…"
                  disabled={loading}
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50 placeholder:text-muted-foreground/40"
                />
                <button type="button" onClick={() => send()}
                  disabled={loading || !input.trim()}
                  className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-base hover:bg-primary/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_12px_hsl(var(--primary)/0.3)]"
                >
                  ↑
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
