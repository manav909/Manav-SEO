/* ════════════════════════════════════════════════════════════════
   src/components/pm/VerifyPanel.tsx
   The verification modal — close the loop on a completed card.

   The project manager confirms the work was actually done correctly,
   against a concrete per-type evidence checklist (what to check, with
   which tool). A card is only marked verified once the evidence is in.
════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import type { TaskCard, CardType } from './types';
import { TYPE_LABEL } from './engine';
import * as pmApi from './api';

/* Per-type evidence — concrete checks, not vague. */
const EVIDENCE: Record<string, { tool: string; what: string }[]> = {
  technical: [
    { tool: 'Google Search Console', what: 'Coverage report — affected pages indexed, no new errors' },
    { tool: 'Browser DevTools',      what: 'HTTP status codes of the affected URLs are correct' },
  ],
  content: [
    { tool: 'Live URL in browser',   what: 'Page is published and the content is live' },
    { tool: 'Google Search Console', what: 'Target keyword shows impressions after a few days' },
  ],
  geo: [
    { tool: 'Perplexity / ChatGPT',  what: 'Search the target query — note if the site is cited' },
    { tool: 'validator.schema.org',  what: 'FAQ / schema markup validates with zero errors' },
  ],
  'quick-win': [
    { tool: 'Browser — View Source', what: 'New meta title / description is live and correct length' },
    { tool: 'Google Search Console', what: 'CTR holding or improving after ~7 days' },
  ],
  competitive: [
    { tool: 'Google (incognito)',    what: 'Target gap keywords — competitor visible, opportunity confirmed' },
  ],
  weekly: [
    { tool: 'The deliverable',       what: 'Output matches the brief — every step complete' },
  ],
};

const DEFAULT_EVIDENCE = [
  { tool: 'Review', what: 'The task output is complete and matches what was asked' },
];

export default function VerifyPanel({
  card, onClose, onVerified,
}: {
  card: TaskCard;
  onClose: () => void;
  onVerified: () => void;
}) {
  const checks = EVIDENCE[card.type as CardType] || DEFAULT_EVIDENCE;
  const [done, setDone]     = useState<Set<number>>(new Set());
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const allChecked = done.size === checks.length;

  const verify = async () => {
    setSaving(true);
    setErr('');
    const ok = await pmApi.verifyCard(card.id, notes);
    setSaving(false);
    if (ok) onVerified();
    else setErr('Could not save verification — try again.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg">

        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Verify · {TYPE_LABEL[card.type]}
            </div>
            <h2 className="text-base font-bold leading-tight">{card.title}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Confirm the work was actually done correctly. Check each item against the real
            tool — a card is only verified once the evidence is in.
          </p>

          {/* Evidence checklist */}
          <div className="space-y-2">
            {checks.map((c, i) => (
              <label
                key={i}
                className="flex items-start gap-3 rounded-xl border border-border bg-background/50 p-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={done.has(i)}
                  onChange={() => setDone(s => {
                    const n = new Set(s);
                    n.has(i) ? n.delete(i) : n.add(i);
                    return n;
                  })}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-xs font-semibold">{c.what}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Tool: {c.tool}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Optional notes */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Verification notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything worth recording — what you saw, what to watch."
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary resize-none"
            />
          </div>

          {err && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">{err}</div>
          )}

          <button
            onClick={verify}
            disabled={!allChecked || saving}
            className="w-full py-2.5 rounded-lg bg-green-500/90 text-white text-sm font-semibold hover:bg-green-500 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : allChecked ? 'Mark Verified' : `Check all ${checks.length} items to verify`}
          </button>
        </div>
      </div>
    </div>
  );
}
