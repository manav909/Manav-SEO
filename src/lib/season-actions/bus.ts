/* ════════════════════════════════════════════════════════════════
   src/lib/season-actions/bus.ts
   Phase 10b — Action bus.

   Some actions need to drive UI state INSIDE a page (filter the Kanban,
   switch Data Room tabs). The registry handler can't directly call
   setState on a page it doesn't know about — so we use a tiny pub/sub
   bus.

   Pages subscribe with subscribeAction('data_room_set_tab', handler).
   Action handlers publish with publishAction('data_room_set_tab', payload).
   If no subscriber is listening, the action handler reports back
   honestly: "I can't filter from here — open the Kanban first".

   Lightweight on purpose. No external deps. Listeners get cleaned up
   on page unmount.
═══════════════════════════════════════════════════════════════ */

type ActionHandler = (payload: any) => void | Promise<void>;

const SUBSCRIBERS = new Map<string, Set<ActionHandler>>();

export function subscribeAction(actionId: string, handler: ActionHandler): () => void {
  if (!SUBSCRIBERS.has(actionId)) SUBSCRIBERS.set(actionId, new Set());
  SUBSCRIBERS.get(actionId)!.add(handler);
  return () => {
    SUBSCRIBERS.get(actionId)?.delete(handler);
    if (SUBSCRIBERS.get(actionId)?.size === 0) SUBSCRIBERS.delete(actionId);
  };
}

export function publishAction(actionId: string, payload?: any): { delivered: boolean; subscribers: number } {
  const subs = SUBSCRIBERS.get(actionId);
  if (!subs || subs.size === 0) return { delivered: false, subscribers: 0 };
  for (const handler of subs) {
    try { handler(payload); }
    catch (e) { /* eslint-disable-next-line no-console */ console.error(`[action-bus] subscriber failed for ${actionId}:`, e); }
  }
  return { delivered: true, subscribers: subs.size };
}

export function hasSubscribers(actionId: string): boolean {
  return (SUBSCRIBERS.get(actionId)?.size || 0) > 0;
}
