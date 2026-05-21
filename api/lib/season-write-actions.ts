/* ════════════════════════════════════════════════════════════════
   api/lib/season-write-actions.ts
   Phase 10c — Backend handlers for S.E.A.S.O.N. data-write actions.

   Each handler:
     • Validates required fields strictly (no surprises)
     • Performs the write
     • Writes an entry to activity_log with source='action'
     • Returns { success, changed, previous, message }

   The 'previous' field captures the state BEFORE the change so the
   audit log entry contains a full diff for inspection.

   These are the ONLY actions S.E.A.S.O.N. can take that modify data
   in Phase 10c. Each one is single-purpose, narrow, and reversible
   (a write to a single row).
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

interface WriteResult {
  success:    boolean;
  changed?:   any;
  previous?:  any;
  message?:   string;
  error?:     string;
}

/* ─── Helper: append to activity_log ─── */

async function logAction(opts: {
  projectId:    string;
  actionId:     string;
  headline:     string;
  detail?:      string;
  technical?:   any;
  severity?:    'info' | 'warning' | 'critical';
}) {
  try {
    await db().from("activity_log").insert({
      project_id: opts.projectId,
      event_type: "action_executed",
      source:     "action",
      headline:   opts.headline.slice(0, 240),
      detail:     (opts.detail || '').slice(0, 500),
      technical:  { action_id: opts.actionId, ...(opts.technical || {}) },
      severity:   opts.severity || 'info',
    });
  } catch (e) {
    /* eslint-disable-next-line no-console */
    console.error('[season-write-actions] activity_log write failed:', e);
  }
}

/* ════════════════════════════════════════════════════════════
   ACTION 1 — save_data_room_note
   Body: { projectId, category, field_key, note_text }
═══════════════════════════════════════════════════════════ */

export async function bsSeasonActionSaveDataRoomNote(body: any): Promise<WriteResult> {
  const { projectId, category, field_key, note_text } = body || {};
  if (!projectId)  return { success: false, error: "projectId required" };
  if (!category)   return { success: false, error: "category required" };
  if (!field_key)  return { success: false, error: "field_key required" };
  if (!note_text || typeof note_text !== 'string') return { success: false, error: "note_text required (string)" };
  if (note_text.length > 4000) return { success: false, error: "note_text too long (>4000 chars)" };

  const trimmed = note_text.trim();
  if (trimmed.length < 4)  return { success: false, error: "note_text too short" };

  try {
    /* Look up existing row */
    const { data: existing, error: readErr } = await db()
      .from("project_knowledge")
      .select("id, field_value, updated_at")
      .eq("project_id", projectId)
      .eq("category", category)
      .eq("field_key", field_key)
      .maybeSingle();
    if (readErr) return { success: false, error: readErr.message };

    let result: any;
    let previous: any = null;

    if (existing) {
      previous = { field_value: existing.field_value, updated_at: existing.updated_at };
      /* Append the note with a divider so the user can see the addition */
      const appended = `${existing.field_value || ''}\n\n--- note added by S.E.A.S.O.N. on ${new Date().toISOString().slice(0,10)} ---\n${trimmed}`.trim();
      const { data: updated, error: updateErr } = await db()
        .from("project_knowledge")
        .update({ field_value: appended })
        .eq("id", existing.id)
        .select("id, field_value")
        .maybeSingle();
      if (updateErr) return { success: false, error: updateErr.message };
      result = updated;
    } else {
      /* Create new */
      const { data: inserted, error: insertErr } = await db()
        .from("project_knowledge")
        .insert({
          project_id: projectId,
          category,
          field_key,
          field_value: trimmed,
        })
        .select("id, field_value")
        .maybeSingle();
      if (insertErr) return { success: false, error: insertErr.message };
      result = inserted;
    }

    await logAction({
      projectId,
      actionId: 'save_data_room_note',
      headline: `Saved note to Data Room · ${category} / ${field_key}`,
      detail:   trimmed.slice(0, 200),
      technical:{ note_length: trimmed.length, appended: !!existing },
    });

    return {
      success:  true,
      changed:  result,
      previous,
      message:  existing ? "Note appended to existing field." : "Note created.",
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "save failed" };
  }
}

/* ════════════════════════════════════════════════════════════
   ACTION 2 — update_strategy_status
   Body: { projectId, strategyId, new_status, reason? }

   Allowed transitions:
     drafting     → resourcing | paused
     resourcing   → executing  | drafting | paused
     executing    → measuring  | paused
     measuring    → concluded  | paused
     paused       → drafting   | resourcing | executing | measuring
     (concluded stays concluded — S.E.A.S.O.N. cannot reopen here)

   NOTE: this enforces the same transitions as bsAdvanceStrategy /
   bsConcludeStrategy. We don't bypass stage-gate blocker checks —
   those still apply, server-side. If a HARD blocker prevents the
   transition, this action returns an error explaining why.
═══════════════════════════════════════════════════════════ */

const VALID_TRANSITIONS: Record<string, string[]> = {
  drafting:   ['resourcing', 'paused'],
  resourcing: ['executing', 'drafting', 'paused'],
  executing:  ['measuring', 'paused'],
  measuring:  ['concluded', 'paused'],
  paused:     ['drafting', 'resourcing', 'executing', 'measuring'],
  concluded:  [],
};

export async function bsSeasonActionUpdateStrategyStatus(body: any): Promise<WriteResult> {
  const { projectId, strategyId, new_status, reason } = body || {};
  if (!projectId)   return { success: false, error: "projectId required" };
  if (!strategyId)  return { success: false, error: "strategyId required" };
  if (!new_status)  return { success: false, error: "new_status required" };

  try {
    const { data: strategy, error: readErr } = await db()
      .from("strategies")
      .select("id, name, status, on_track, card_ids")
      .eq("id", strategyId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (readErr) return { success: false, error: readErr.message };
    if (!strategy) return { success: false, error: "strategy not found in this project" };

    const currentStatus = strategy.status;
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(new_status)) {
      return {
        success: false,
        error: `cannot transition "${strategy.name}" from ${currentStatus} → ${new_status}. Allowed from here: ${allowed.length ? allowed.join(', ') : 'none (terminal state)'}.`,
      };
    }

    /* If moving to executing, check hard blockers (stage gate enforcement) */
    if (new_status === 'executing' && strategy.card_ids?.length > 0) {
      try {
        const { bsGetStrategyBlockers } = await import("./pm-blockers.js");
        const blockers = await bsGetStrategyBlockers({ projectId });
        if (blockers.success) {
          const hardForThis = (blockers.blockers || []).filter((b: any) =>
            b.required && b.blocks.some((blk: any) =>
              blk.type === "card" && (strategy.card_ids || []).includes(blk.id)
            )
          );
          if (hardForThis.length > 0) {
            return {
              success: false,
              error: `Cannot advance "${strategy.name}" to executing — ${hardForThis.length} HARD blocker(s) unresolved: ${hardForThis.slice(0,3).map((b: any) => b.label).join(', ')}.`,
            };
          }
        }
      } catch { /* if blocker check fails, don't block — assume green */ }
    }

    const previous = { status: currentStatus, name: strategy.name };

    /* Stamp the right lifecycle timestamp */
    const stampField =
      new_status === 'resourcing' ? 'finalized_at' :
      new_status === 'executing'  ? 'started_at'   :
      new_status === 'concluded'  ? 'concluded_at' :
      new_status === 'paused'     ? 'paused_at'    :
      null;

    const patch: any = { status: new_status };
    if (stampField) patch[stampField] = new Date().toISOString();

    const { data: updated, error: updateErr } = await db()
      .from("strategies")
      .update(patch)
      .eq("id", strategyId)
      .select("id, name, status")
      .maybeSingle();
    if (updateErr) return { success: false, error: updateErr.message };

    await logAction({
      projectId,
      actionId: 'update_strategy_status',
      headline: `Strategy "${strategy.name}": ${currentStatus} → ${new_status}`,
      detail:   reason ? String(reason).slice(0, 240) : `Lifecycle transition`,
      technical:{ strategyId, previous_status: currentStatus, new_status, reason },
      severity: new_status === 'paused' ? 'warning' : 'info',
    });

    return {
      success:  true,
      changed:  updated,
      previous,
      message:  `Moved "${strategy.name}" to ${new_status}.`,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "transition failed" };
  }
}

/* ════════════════════════════════════════════════════════════
   ACTION 3 — add_kanban_note
   Body: { projectId, cardId, note_text }
═══════════════════════════════════════════════════════════ */

export async function bsSeasonActionAddKanbanNote(body: any): Promise<WriteResult> {
  const { projectId, cardId, note_text } = body || {};
  if (!projectId)  return { success: false, error: "projectId required" };
  if (!cardId)     return { success: false, error: "cardId required" };
  if (!note_text || typeof note_text !== 'string') return { success: false, error: "note_text required" };
  const trimmed = note_text.trim();
  if (trimmed.length < 4)    return { success: false, error: "note_text too short" };
  if (trimmed.length > 2000) return { success: false, error: "note_text too long" };

  try {
    const { data: card, error: readErr } = await db()
      .from("kanban_tasks")
      .select("id, title, notes, status")
      .eq("id", cardId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (readErr) return { success: false, error: readErr.message };
    if (!card)   return { success: false, error: "card not found in this project" };

    const previous = { notes: card.notes };
    const stamp = new Date().toISOString().slice(0, 10);
    const newNote = `[S.E.A.S.O.N. · ${stamp}] ${trimmed}`;
    const updatedNotes = card.notes ? `${card.notes}\n\n${newNote}` : newNote;

    const { data: updated, error: updateErr } = await db()
      .from("kanban_tasks")
      .update({ notes: updatedNotes })
      .eq("id", cardId)
      .select("id, title, notes")
      .maybeSingle();
    if (updateErr) return { success: false, error: updateErr.message };

    await logAction({
      projectId,
      actionId: 'add_kanban_note',
      headline: `Added note to card "${card.title}"`,
      detail:   trimmed.slice(0, 200),
      technical:{ cardId, note_length: trimmed.length },
    });

    return {
      success:  true,
      changed:  updated,
      previous,
      message:  `Note added to "${card.title}".`,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "note add failed" };
  }
}
