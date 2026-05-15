/**
 * api/lib/ai-cache.ts
 * Manav Brain — Auto-Learning Extraction Engine
 * Called fire-and-forget from all 9 AI generation points.
 * Extracts structured learnings from raw AI output and saves to brain_learnings.
 */

import { db } from './db';

export interface LearningInput {
  source: string;           // which generation point: task_execution, strategy_generation, etc.
  projectId: string;
  content: string;          // raw AI output
  context?: string;         // what prompted this output
  cardType?: string;        // technical, content, geo, quick-win, competitive
  existingTitle?: string;   // if we already know the card title
}

export interface ExtractedLearning {
  card_type: string;
  card_title: string;
  what_worked: string[];
  what_missed: string[];
  improvement: string;
  context_summary: string;
  tags: string[];
  confidence_score: number;
}

/**
 * Fire-and-forget: extract learnings from AI output and save to brain_learnings.
 * Never throws. Never blocks the calling function.
 */
export function extractAndSaveLearning(input: LearningInput): void {
  if (!input.projectId || !input.content || input.content.length < 50) return;

  // Run async without blocking
  Promise.resolve().then(async () => {
    try {
      const extracted = await callClaudeExtract(input);
      if (!extracted) return;

      // Check for existing card with same title to update vs insert
      const { data: existing } = await db()
        .from('brain_learnings')
        .select('id, applied_count, what_worked, what_missed')
        .eq('project_id', input.projectId)
        .ilike('card_title', extracted.card_title.slice(0, 50) + '%')
        .limit(1)
        .single();

      if (existing) {
        // Merge learnings into existing card
        const merged_worked = [...new Set([...(existing.what_worked || []), ...extracted.what_worked])].slice(0, 10);
        const merged_missed = [...new Set([...(existing.what_missed || []), ...extracted.what_missed])].slice(0, 10);
        await db()
          .from('brain_learnings')
          .update({
            what_worked: merged_worked,
            what_missed: merged_missed,
            improvement: extracted.improvement,
            applied_count: (existing.applied_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        // Insert new learning card
        await db()
          .from('brain_learnings')
          .insert({
            project_id:      input.projectId,
            card_type:       extracted.card_type,
            card_title:      extracted.card_title,
            what_worked:     extracted.what_worked,
            what_missed:     extracted.what_missed,
            improvement:     extracted.improvement,
            context_summary: extracted.context_summary,
            tags:            extracted.tags,
            source:          input.source,
            confidence_score: extracted.confidence_score,
            status:          'active',
            applied_count:   1,
          });
      }
    } catch (_) {
      // Silent failure — never block the main flow
    }
  });
}

async function callClaudeExtract(input: LearningInput): Promise<ExtractedLearning | null> {
  const prompt = `You are extracting a Brain Learning card from an SEO AI output.

SOURCE: ${input.source}
CONTEXT: ${input.context?.slice(0, 300) || 'SEO task execution'}
OUTPUT TO ANALYSE:
${input.content.slice(0, 1500)}

Extract a structured learning card. Return ONLY valid JSON, no markdown:
{
  "card_type": "technical|content|geo|quick-win|competitive|strategy",
  "card_title": "concise title describing the pattern learned (max 60 chars)",
  "what_worked": ["specific thing that worked 1", "specific thing 2"],
  "what_missed": ["gap or risk 1", "gap 2"],
  "improvement": "one sentence: what to do differently next time",
  "context_summary": "2 sentence summary of when this learning applies",
  "tags": ["tag1", "tag2", "tag3"],
  "confidence_score": 70
}

Rules:
- what_worked and what_missed: 1-4 items each, specific and actionable
- confidence_score: 50-90 based on how clear the signal is
- card_title: pattern-focused, not project-specific
- If the output has no clear learning signal, return {"skip": true}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // Use Haiku — fast, cheap for extraction
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json() as any;
    const raw = data?.content?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed.skip) return null;
    return parsed as ExtractedLearning;
  } catch (_) {
    return null;
  }
}
