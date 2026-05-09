import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

const WAITING_DAYS: Record<string, number> = {
  "technical":   5,
  "content":     14,
  "geo":         7,
  "quick-win":   3,
  "competitive": 21,
  "insight":     0,
  "weekly":      3,
  "monthly":     30,
  "kpi":         7,
  "custom":      5,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { card, siteUrl, completedAt, checkType = "guidance" } = req.body;
  if (!card) return res.status(400).json({ error: "Missing card" });

  const waitDays    = WAITING_DAYS[card.type] || 5;
  const compDate    = completedAt ? new Date(completedAt) : new Date();
  const daysSince   = Math.floor((Date.now() - compDate.getTime()) / 86400000);
  const daysLeft    = Math.max(0, waitDays - daysSince);
  const waitExpired = daysLeft === 0;

  if (checkType === "waiting_check") {
    return res.status(200).json({
      success: true, waitDays, daysSince, daysLeft, waitExpired,
      message: waitExpired
        ? `${waitDays}-day waiting period complete. Ready to verify.`
        : `${daysLeft} more day${daysLeft !== 1 ? "s" : ""} before verification is reliable.`,
    });
  }

  let liveContent = "";
  if (siteUrl && checkType === "live_check") {
    try {
      const url = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
      const r   = await fetch(`https://r.jina.ai/${url}`, {
        headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "15" },
        signal: AbortSignal.timeout(18000),
      });
      if (r.ok) liveContent = (await r.text()).slice(0, 3000);
    } catch {}
  }

  const prompt = `You are an elite SEO quality controller. Verify whether this task has been completed correctly and its impact is visible.

TASK:
Type: ${card.type}
Title: "${card.title}"
What was done: ${card.content}
Priority: ${card.priority} | Impact claimed: ${card.impact || "unknown"}
Days since claimed complete: ${daysSince}
Waiting period required: ${waitDays} days | Elapsed: ${waitExpired ? "YES" : "NO — " + daysLeft + " days remain"}
${liveContent ? `
LIVE SITE DATA (${siteUrl}):
${liveContent}` : "
No live site data — provide manual verification guidance."}

${checkType === "live_check"
  ? "Perform a VERIFICATION ANALYSIS using the live site data. Determine if the task impact is visible."
  : "Provide VERIFICATION GUIDANCE — exactly what to check, how, and what pass/fail looks like."}

Return ONLY valid JSON:
{
  "verdict": "verified|not_verified|partial|waiting|cannot_determine",
  "confidence": 0,
  "evidence_found": [],
  "evidence_missing": [],
  "what_to_check": [
    {
      "tool": "exact tool name",
      "action": "exactly what to do in that tool",
      "what_to_look_for": "specific metric or element",
      "pass_condition": "what result means task is done",
      "fail_condition": "what result means task failed or is incomplete"
    }
  ],
  "timeline_note": "when full impact will be measurable",
  "next_action": "single most important thing to do right now",
  "approval_blocked": "if not verified, exactly why",
  "roles": {
    "who_should_verify": "which role runs these checks",
    "escalate_to": "who to go to if verification fails"
  }
}`;

  try {
    const anthropic = new Anthropic();
    const response  = await anthropic.messages.create({
      model: "claude-sonnet-4-5", max_tokens: 1200,
      system: "You are an elite SEO quality controller. Be strict. Never approve without evidence. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    });
    const raw  = response.content[0].type === "text" ? response.content[0].text : "{}";
    const f    = raw.indexOf("{");
    const l    = raw.lastIndexOf("}");
    let parsed: any = {};
    try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch {}

    return res.status(200).json({
      success:           true,
      verdict:           parsed.verdict           || "cannot_determine",
      confidence:        parsed.confidence         || 0,
      evidence_found:    parsed.evidence_found     || [],
      evidence_missing:  parsed.evidence_missing   || [],
      what_to_check:     parsed.what_to_check      || [],
      timeline_note:     parsed.timeline_note      || "",
      next_action:       parsed.next_action        || "",
      approval_blocked:  parsed.approval_blocked   || "",
      roles:             parsed.roles              || {},
      waiting_status:    { waitDays, daysSince, daysLeft, waitExpired },
      live_data_used:    liveContent.length > 0,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
