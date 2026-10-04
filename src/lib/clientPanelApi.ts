/* Calls for the client panel (/c/home …). Every call carries the client's
   session token; the server works out the project from it. */

import { getStoredClientSession, clearClientSession } from '@/components/brand-studio/api';

export type Delta = { from: number; to: number; pct: number; direction: 'up' | 'down' | 'flat' } | null;

export interface PanelInfo {
  plan: string;
  plan_label: string;
  features: Record<string, boolean>;
  availability: Record<string, 'mandatory' | 'optional' | 'none'>;
  limits: { goals: number | null; sites: number | null; seats: number | null };
  upgrade_previews: boolean;
}

export interface ClientGoal {
  id: string; name: string; description?: string; metric: string;
  target: number; targetDate?: string; baseline?: number; status?: string;
  current: number | null; onTrack: boolean | null; updatedAt?: string | null;
}

export interface Win { query: string; position: number; kind: string; clicks?: number }

export interface HomeData {
  user: { name: string; email: string };
  project: { id: string; name?: string; url?: string };
  strategist: { name: string };
  panel: PanelInfo;
  numbers: null | {
    window: string;
    clicks: number | null; impressions: number | null; avgPosition: number | null;
    sessions: number | null; conversions: number | null;
    change: Record<'clicks' | 'impressions' | 'position' | 'sessions' | 'conversions', Delta>;
  };
  wins: Win[];
  goals: ClientGoal[];
  latestReport: null | { id: string; title: string; link: string; periodStart?: string; periodEnd?: string };
  unreadMessages: number;
}

export interface ChatMessage { id: string; from: 'client' | 'team'; name?: string; body: string; at: string }

export class SessionEndedError extends Error {}

export async function cp<T = any>(action: string, extra: object = {}): Promise<T> {
  const session = getStoredClientSession();
  if (!session?.token) throw new SessionEndedError('Please sign in.');
  const r = await fetch('/api/task-engine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, sessionToken: session.token, ...extra }),
  });
  const json = await r.json().catch(() => ({ success: false, error: 'Something went wrong — please try again.' }));
  if (!json?.success) {
    if (json?.code === 'session' || /session|Portal not enabled/i.test(json?.error || '')) {
      clearClientSession();
      throw new SessionEndedError(json?.error || 'Please sign in again.');
    }
    throw new Error(json?.error || 'Something went wrong — please try again.');
  }
  return json as T;
}

/** Share of the way from baseline to target, 0–1. Position: lower is better. */
export function goalProgress(g: ClientGoal): number | null {
  if (g.current == null || g.target == null) return null;
  const base = g.baseline ?? 0;
  const lowerIsBetter = g.metric === 'avg_position';
  const span = lowerIsBetter ? base - g.target : g.target - base;
  if (!span) return g.current === g.target ? 1 : null;
  const done = lowerIsBetter ? base - g.current : g.current - base;
  return Math.max(0, Math.min(1, done / span));
}

export const METRIC_LABEL: Record<string, string> = {
  clicks: 'visits from Google',
  impressions: 'times shown on Google',
  sessions: 'website visits',
  conversions: 'enquiries & bookings',
  avg_position: 'average Google position',
  ctr: 'click rate',
  health_score: 'site health score',
};
