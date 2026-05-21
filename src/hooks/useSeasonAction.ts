/* ════════════════════════════════════════════════════════════════
   src/hooks/useSeasonAction.ts
   Phase 10a — React-side action runner.

   Wires the action registry to React. Components call useSeasonAction()
   and get back a function `run(actionId, payload?)` that:
     • Looks up the action
     • Checks permissions against current settings
     • Prompts for confirmation if required (via in-modal state)
     • Fires the handler with full ActionContext
     • Toasts the result

   It also exposes:
     • pendingConfirm — the action awaiting confirmation, if any
     • confirm() — fire the pending action
     • cancel() — drop the pending action

   The SeasonModal uses this to render the "Tap to confirm: Filter
   overdue?" prompt when an action requires confirmation.
═══════════════════════════════════════════════════════════════ */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeason } from '@/contexts/SeasonContext';
import { useProject } from '@/contexts/ProjectContext';
import { useToast } from '@/hooks/use-toast';
import {
  getAction, runAction, actionNeedsConfirm, isActionAllowed,
  type ActionContext, type ActionResult, type ActionDef,
} from '@/lib/season-actions/registry';

interface PendingConfirm {
  action:   ActionDef;
  payload:  any;
}

export function useSeasonAction() {
  const navigate = useNavigate();
  const { awareness, settings } = useSeason();
  const { selectedProjectId } = useProject() as any;
  const { toast } = useToast();
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [running, setRunning] = useState(false);

  const buildCtx = (payload?: any): ActionContext => ({
    projectId: selectedProjectId,
    awareness,
    payload,
    navigate,
    toast: (msg, kind) => toast({
      title: msg,
      variant: kind === 'error' ? 'destructive' : 'default',
    }),
  });

  /* The public runner. Returns { ok: false, message } if blocked,
     or { ok: true, awaiting_confirm: true } if confirmation is needed
     (the UI should render the prompt and call confirm() later). */
  const run = useCallback(async (actionId: string, payload?: any): Promise<ActionResult & { awaiting_confirm?: boolean }> => {
    const def = getAction(actionId);
    if (!def) {
      return { ok: false, message: `Unknown action "${actionId}".` };
    }

    /* Gate */
    const gate = isActionAllowed(def, settings);
    if (!gate.allowed) {
      toast({ title: gate.reason || 'Action not allowed', variant: 'destructive' });
      return { ok: false, message: gate.reason };
    }

    /* Confirm flow */
    if (actionNeedsConfirm(def, settings)) {
      setPendingConfirm({ action: def, payload });
      return { ok: true, awaiting_confirm: true };
    }

    /* Run directly */
    setRunning(true);
    try {
      const result = await runAction(actionId, buildCtx(payload), settings);
      if (result.ok && result.message) toast({ title: result.message });
      if (!result.ok && result.message) toast({ title: result.message, variant: 'destructive' });
      return result;
    } finally {
      setRunning(false);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [selectedProjectId, awareness, settings, navigate]);

  /* Confirm the pending action */
  const confirm = useCallback(async (): Promise<ActionResult> => {
    if (!pendingConfirm) return { ok: false, message: 'Nothing to confirm.' };
    setRunning(true);
    try {
      const result = await runAction(pendingConfirm.action.id, buildCtx(pendingConfirm.payload), settings);
      if (result.ok && result.message) toast({ title: result.message });
      if (!result.ok && result.message) toast({ title: result.message, variant: 'destructive' });
      setPendingConfirm(null);
      return result;
    } finally {
      setRunning(false);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [pendingConfirm, selectedProjectId, awareness, settings, navigate]);

  const cancel = useCallback(() => setPendingConfirm(null), []);

  return { run, confirm, cancel, pendingConfirm, running };
}
