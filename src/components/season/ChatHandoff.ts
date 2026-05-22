/* ════════════════════════════════════════════════════════════════════
   src/components/season/ChatHandoff.ts
   Phase 21 — Block 2.11 Phase A — Chat-as-bridge infrastructure

   When the operator is working in the modal and clicks "Full briefing" to
   open /command, OR is on /command and Cmd+K's into the modal, the chat
   state (input, in-flight preview, exploration, response) needs to carry.

   Persistence: SessionStorage — survives navigation within the tab, doesn't
   leak across tabs/devices/sessions. Right balance of continuity + privacy.

   Lifecycle:
     1. SOURCE writes handoff via writeHandoff() before navigating
     2. DESTINATION reads via readHandoff() on mount
     3. After restoration, the destination calls consumeHandoff() to clear it
     4. Stale entries auto-expire after HANDOFF_TTL_MS
══════════════════════════════════════════════════════════════════════ */

const HANDOFF_KEY = 'season:chat_handoff';
const HANDOFF_TTL_MS = 5 * 60 * 1000;   // 5 minutes — long enough to navigate, short enough to be safe

export type HandoffSource = 'modal_orb' | 'modal_cmd_k' | 'page_command';

export interface ChatHandoffPayload {
  source:               HandoffSource;
  source_project_id?:   string;
  /* What the user was working on */
  input?:               string;
  /* Mid-flow surfaces — any of these may be present */
  response?:            any;
  exploration?:         any;
  pending_structure?:   any;
  pending_positioning?: any;
  pending_original?:    string;
  chat_suggestions?:    any[];
  suggestions_note?:    string | null;
  /* Metadata */
  written_at:           number;          // Date.now()
}

/* Write the handoff payload before navigating away.
   Pass only the fields that have meaningful state — undefined fields
   are dropped to keep the payload small. */
export function writeHandoff(payload: Omit<ChatHandoffPayload, 'written_at'>): void {
  try {
    const slim: ChatHandoffPayload = { ...payload, written_at: Date.now() };
    /* Drop empty fields so the destination doesn't restore noise. */
    if (slim.input != null && slim.input.trim() === '') delete (slim as any).input;
    if (Array.isArray(slim.chat_suggestions) && slim.chat_suggestions.length === 0) delete (slim as any).chat_suggestions;
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(slim));
  } catch {
    /* SessionStorage can fail in private browsing or quota-exceeded; swallow. */
  }
}

/* Read the handoff payload, if present and fresh.
   Returns null if no handoff exists, the entry is stale, or parsing fails. */
export function readHandoff(): ChatHandoffPayload | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatHandoffPayload;
    if (!parsed || typeof parsed !== 'object' || !parsed.written_at) {
      sessionStorage.removeItem(HANDOFF_KEY);
      return null;
    }
    if (Date.now() - parsed.written_at > HANDOFF_TTL_MS) {
      sessionStorage.removeItem(HANDOFF_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/* Consume the handoff — read AND clear in one call. */
export function consumeHandoff(): ChatHandoffPayload | null {
  const payload = readHandoff();
  if (payload) {
    try { sessionStorage.removeItem(HANDOFF_KEY); } catch { /* swallow */ }
  }
  return payload;
}

/* Check whether a handoff exists without consuming it. */
export function hasHandoff(): boolean {
  return readHandoff() !== null;
}

/* Explicit clear, used on logout / project change / etc. */
export function clearHandoff(): void {
  try { sessionStorage.removeItem(HANDOFF_KEY); } catch { /* swallow */ }
}
