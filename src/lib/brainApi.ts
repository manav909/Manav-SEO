/* ═══════════════════════════════════════════════════════════
   brainApi — single entry point for all AI calls from the frontend.

   Usage:
     // Streaming (chat, brain_assistant, pipeline, deep_dive)
     const stop = await streamBrain({
       mode: 'brain_assistant',
       question: 'What should I do today?',
       projectId: '...',
       brainAssistantContext: { ... },
       onChunk: (text) => setAnswer(a => a + text),
       onDone:  (full) => setHistory(h => [...h, { q, a: full }]),
     });

     // JSON (non-streaming actions like save, get_context)
     const result = await callTaskEngine({ action: 'save_learning', ... });
     const result = await callControl({ action: 'get_context', projectId });
═══════════════════════════════════════════════════════════ */

export type BrainMode =
  | 'chat'
  | 'brain_assistant'
  | 'pipeline'
  | 'deep_dive'
  | 'agenda'
  | 'dependencies';

export interface StreamBrainOpts {
  mode:                  BrainMode;
  question:              string;
  projectId?:            string | null;
  projectSummary?:       string;
  brainAssistantContext?: Record<string, any>;
  blocks?:               any[];
  role?:                 string;
  focusBlockId?:         string | null;
  checkUrl?:             string | null;
  week?:                 number;
  weekLabel?:            string;
  weekCards?:            any[];
  allPlacedCards?:       any[];
  projectContext?:       Record<string, any>;
  dataRoom?:             Record<string, any>;
  onChunk?:              (text: string) => void;
  onDone?:               (fullOutput: string) => void;
  onError?:              (err: string) => void;
  signal?:               AbortSignal;
}

/* Stream from /api/intelligence (returns text chunks) */
export async function streamBrain(opts: StreamBrainOpts): Promise<() => void> {
  const {
    mode, question, projectId, projectSummary, brainAssistantContext,
    blocks, role, focusBlockId, checkUrl, week, weekLabel,
    weekCards, allPlacedCards, projectContext, dataRoom,
    onChunk, onDone, onError, signal,
  } = opts;

  const controller = new AbortController();
  const effectiveSignal = signal || controller.signal;
  const abort = () => controller.abort();

  (async () => {
    try {
      const res = await fetch('/api/intelligence', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  effectiveSignal,
        body: JSON.stringify({
          mode, question, projectId, projectSummary,
          brainAssistantContext, blocks, role, focusBlockId,
          checkUrl, week, weekLabel, weekCards, allPlacedCards,
          projectContext, dataRoom,
        }),
      });

      if (!res.ok || !res.body) {
        onError?.(`Brain unavailable (${res.status})`);
        return;
      }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let full     = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        full += chunk;
        onChunk?.(chunk);
      }

      onDone?.(full);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        onError?.(err?.message || 'Brain stream failed');
      }
    }
  })();

  return abort;
}

/* Non-streaming call to /api/task-engine */
export async function callTaskEngine(body: Record<string, any>): Promise<any> {
  try {
    const res = await fetch('/api/task-engine', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    return await res.json();
  } catch (err: any) {
    return { error: err?.message || 'task-engine unavailable' };
  }
}

/* Non-streaming call to /api/control (context, fingerprint, staleness) */
export async function callControl(body: Record<string, any>): Promise<any> {
  try {
    const res = await fetch('/api/control', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    return await res.json();
  } catch (err: any) {
    return { error: err?.message || 'control unavailable' };
  }
}

/* Streaming call to /api/task-engine execute action */
export interface StreamExecuteOpts {
  card:          any;
  context:       any;
  userInputs?:   Record<string, any>;
  role?:         string;
  brainLearnings?: any[];
  projectId?:    string | null;
  onChunk?:      (text: string) => void;
  onDone?:       (fullOutput: string) => void;
  onError?:      (err: string) => void;
}

export async function streamExecute(opts: StreamExecuteOpts): Promise<() => void> {
  const controller = new AbortController();
  const abort = () => controller.abort();

  (async () => {
    try {
      const res = await fetch('/api/task-engine', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  controller.signal,
        body: JSON.stringify({
          action:        'execute',
          card:          opts.card,
          context:       opts.context,
          userInputs:    opts.userInputs || {},
          role:          opts.role || 'senior_seo',
          brainLearnings: opts.brainLearnings || [],
          projectId:     opts.projectId,
        }),
      });

      if (!res.ok || !res.body) {
        opts.onError?.(`Execute unavailable (${res.status})`);
        return;
      }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let full     = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        full += chunk;
        opts.onChunk?.(chunk);
      }

      opts.onDone?.(full);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        opts.onError?.(err?.message || 'Execute stream failed');
      }
    }
  })();

  return abort;
}

/* Parse ⟦ACTION⟧{...}⟦/ACTION⟧ tags from Brain output */
export function parseActionTags(text: string): { clean: string; actions: any[] } {
  const actions: any[] = [];
  const clean = text.replace(/⟦ACTION⟧([\s\S]*?)⟦\/ACTION⟧/g, (_, json) => {
    try { actions.push(JSON.parse(json.trim())); } catch (_e) {}
    return '';
  }).trim();
  return { clean, actions };
}

/* Save a learning via task-engine */
export async function saveLearning(opts: {
  projectId:     string;
  cardType:      string;
  title:         string;
  improvement:   string;
  whatWorked?:   string[];
  whatMissed?:   string[];
  tags?:         string[];
  source?:       string;
  contextSummary?: string;
}): Promise<{ success: boolean; id?: string; rejected?: boolean; reason?: string }> {
  return callTaskEngine({
    action:          'save_learning',
    project_id:      opts.projectId,
    card_type:       opts.cardType,
    card_title:      opts.title,
    improvement:     opts.improvement,
    what_worked:     opts.whatWorked || [],
    what_missed:     opts.whatMissed || [],
    tags:            opts.tags || [],
    source:          opts.source || 'brain_chat',
    context_summary: opts.contextSummary || '',
  });
}
