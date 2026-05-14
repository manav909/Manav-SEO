/**
 * PresidentialAdvisor — Shared strategic/operational Brain advisor
 * Used on both The Oval (strategic mode) and Mission Control (operational mode).
 *
 * Strategic mode: thinks long-term, scenarios, competitive strategy
 * Operational mode: concise, actionable, now-focused
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Brain, Send, ChevronDown, ChevronUp, Sparkles, Zap } from 'lucide-react';

interface Props {
  mode: 'strategic' | 'operational';
  projectName?: string;
  projectContext?: string;
  compact?: boolean;
  learnings?: any[];
  algoItems?: any[];
  canvasBlocks?: any[];
}

const STRATEGIC_PROMPTS = [
  "What is my strongest strategic position right now?",
  "If I double my publishing frequency, what happens?",
  "Which competitor gap should I attack first and how?",
  "What's the single highest-leverage move this month?",
  "Where am I most vulnerable to algorithm changes?",
];

const OPERATIONAL_PROMPTS = [
  "What needs my attention in the next 30 minutes?",
  "Brain quality report — weakest projects first.",
  "What failed recently and what should I do about it?",
  "Top 3 directives to issue across all projects today.",
];

export default function PresidentialAdvisor({ mode, projectName, projectContext, compact, learnings, algoItems, canvasBlocks }: Props) {
  const [input,    setInput]    = useState('');
  const [answer,   setAnswer]   = useState('');
  const [asking,   setAsking]   = useState(false);
  const [history,  setHistory]  = useState<{q:string;a:string}[]>([]);
  const [expanded, setExpanded] = useState(!compact);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isStrategic = mode === 'strategic';
  const accentColor = isStrategic ? 'text-amber-400' : 'text-primary';
  const accentBg    = isStrategic ? 'bg-amber-500/10 border-amber-500/25' : 'bg-primary/10 border-primary/25';
  const prompts     = isStrategic ? STRATEGIC_PROMPTS : OPERATIONAL_PROMPTS;
  const title       = isStrategic ? '◈ CHIEF STRATEGIST' : '◈ OPERATIONAL ADVISOR';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [answer]);

  const ask = useCallback(async (query: string) => {
    if (!query.trim() || asking) return;
    setAsking(true);
    const q = query.trim();
    setInput('');
    setAnswer('');
    const historyForApi = history.slice(-6).map(h => [
      { role: 'user', content: h.q },
      { role: 'assistant', content: h.a },
    ]).flat();

    const systemContext = isStrategic
      ? `You are the Chief Strategist to President Manav, the founder of SEO Season — an elite intelligence-led SEO empire. Your role is to give bold, specific, competitive strategic advice. Think like a war room advisor: scenarios, predictions, competitive moves, leverage points. Never hedge. Never give generic advice. Every response should make the president more confident and capable.${projectName ? ` Current focus: ${projectName}.` : ''}${projectContext ? ` Context: ${projectContext}` : ''}`
      : `You are the Operational Advisor to President Manav at SEO Season Mission Control. Your role is to give sharp, immediate, actionable briefings. Be concise. Prioritise. Every sentence should drive a specific decision or action. No fluff.${projectName ? ` Current project: ${projectName}.` : ''}${projectContext ? ` Context: ${projectContext}` : ''}`;

    try {
      const r = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          question: q,
          projectSummary: projectContext || `SEO Season Empire | ${projectName || 'All Projects'}`,
          brainAssistantContext: {
            systemOverride: systemContext,
            projectContext: { name: projectName || 'SEO Season' },
            learnings:    learnings    || [],
            algoItems:    algoItems    || [],
            canvasBlocks: canvasBlocks || [],
            history:      historyForApi,
          },
        }),
      });

      if (!r.ok || !r.body) throw new Error('Advisor unavailable');
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value);
        setAnswer(full);
      }
      setHistory(prev => [...prev.slice(-4), { q, a: full }]);
    } catch {
      setAnswer('Your advisor is unavailable. Check the API is running.');
    }
    setAsking(false);
  }, [asking, isStrategic, projectName, projectContext, learnings, algoItems, canvasBlocks, history]);

  if (compact && !expanded) {
    return (
      <button onClick={() => setExpanded(true)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border ${accentBg} transition-all`}>
        <div className="flex items-center gap-2">
          <Sparkles className={`h-3.5 w-3.5 ${accentColor}`}/>
          <span className={`text-xs font-semibold ${accentColor}`}>{title}</span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 ${accentColor}`}/>
      </button>
    );
  }

  return (
    <div className={`flex flex-col rounded-xl border ${accentBg} overflow-hidden ${compact ? '' : 'h-full'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${isStrategic ? 'border-amber-500/15' : 'border-primary/15'}`}>
        <div className="flex items-center gap-2">
          <Brain className={`h-3.5 w-3.5 ${accentColor}`}/>
          <span className={`text-xs font-bold ${accentColor}`}>{title}</span>
          {asking && (
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className={`h-1 w-1 rounded-full ${isStrategic ? 'bg-amber-400' : 'bg-primary'}`}
                  style={{ animation: `bounce 1.2s ease ${i * 0.2}s infinite` }}/>
              ))}
            </div>
          )}
        </div>
        {compact && (
          <button onClick={() => setExpanded(false)}>
            <ChevronUp className={`h-3.5 w-3.5 ${accentColor}`}/>
          </button>
        )}
      </div>

      {/* Conversation */}
      {(history.length > 0 || answer) && (
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0 max-h-56">
          {history.slice(-2).map((h, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground/40 font-mono">YOU</p>
              <p className="text-xs text-foreground/60">{h.q}</p>
              <p className="text-[10px] text-muted-foreground/40 font-mono mt-1.5">ADVISOR</p>
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">{h.a}</pre>
            </div>
          ))}
          {answer && !history.find(h => h.a === answer) && (
            <div>
              <p className="text-[10px] text-muted-foreground/40 font-mono mb-1">ADVISOR</p>
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">{answer}</pre>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>
      )}

      {/* Quick prompts — shown when no answer */}
      {!answer && !asking && history.length === 0 && (
        <div className="px-3 py-2 flex flex-col gap-1.5 flex-1 overflow-y-auto">
          {prompts.map((p, i) => (
            <button key={i} onClick={() => ask(p)}
              className={`text-left text-xs px-2.5 py-1.5 rounded-lg border ${
                isStrategic
                  ? 'border-amber-500/15 bg-amber-500/5 text-amber-300/70 hover:bg-amber-500/12 hover:text-amber-200'
                  : 'border-primary/15 bg-primary/5 text-primary/70 hover:bg-primary/12 hover:text-primary/90'
              } transition-all leading-snug`}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className={`flex items-center gap-2 px-2.5 py-2 border-t ${isStrategic ? 'border-amber-500/12' : 'border-primary/12'}`}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask(input)}
          placeholder={isStrategic ? 'Ask your strategist…' : 'Ask your advisor…'}
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/30"
        />
        <button onClick={() => ask(input)} disabled={asking || !input.trim()}
          className={`h-6 w-6 rounded flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0 ${
            isStrategic ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/35' : 'bg-primary/20 text-primary hover:bg-primary/35'
          }`}>
          <Send className="h-2.5 w-2.5"/>
        </button>
      </div>
      <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
