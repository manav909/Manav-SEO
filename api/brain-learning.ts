/**
 * brain-learning.ts — DEPRECATED
 *
 * All brain learning actions have been merged into task-engine.ts to stay
 * within Vercel Hobby plan's 12 serverless function limit.
 *
 * DELETE this file from your /api folder.
 * If you cannot delete it immediately, this stub redirects every request
 * to task-engine so nothing breaks while the file still exists.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Forward every request body to task-engine unchanged.
  // task-engine handles all the same action names.
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const upstream = await fetch(`${base}/api/task-engine`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(req.body),
    });

    const text = await upstream.text();
    res.status(upstream.status).send(text);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
