import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

const WAITING_DAYS: Record<string, number> = {
  "technical": 5, "content": 14, "geo": 7, "quick-win": 3,
  "competitive": 21, "insight": 0, "weekly": 3, "monthly": 30, "kpi": 7, "custom": 5,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    card, siteUrl, completedAt, checkType = "guidance",
    completionNote = "", evidenceData = "",
  } = req.body;

  if (!card) return res.status(400).json({ error: "Missing card" });

  const waitDays    = WAITING_DAYS[card.type] || 5;
  const compDate    = completedAt ? new Date(completedAt) : new Date();
  const daysSince   = Math.floor((Date.now() - compDate.getTime()) / 86400000);
  const daysLeft    = Math.max(0, waitDays - daysSince);
  const waitExpired = daysLeft === 0;

  if (checkType === "waiting_check") {
    return res.status(200).json({ success: true, waitDays, daysSince, daysLeft, waitExpired });
  }

  /* Fetch live site data */
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

  const prompt = `You are the Head of Department for Digital Marketing performing a strict quality review.
A task has been submitted for approval. You must verify it has been completed correctly and the expected SEO impact is real and measurable.
You never approve on good faith alone. You require hard evidence.

TASK SUBMITTED FOR APPROVAL:
Type: ${card.type}
Title: "${card.title}"
What was required: ${card.content}
Priority: ${card.priority} | Expected impact: ${card.impact || "not specified"}
Days since completion claimed: ${daysSince} / Required waiting period: ${waitDays} days
Waiting period ${waitExpired ? "COMPLETE" : `INCOMPLETE — ${daysLeft} days remain`}

COMPLETION STATEMENT FROM EXECUTOR:
${completionNote || "(No completion note provided — this is a red flag)"}

EVIDENCE DATA PROVIDED:
${evidenceData || "(No evidence data provided — approval cannot be granted without evidence)"}

${liveContent ? `LIVE SITE DATA (fetched from ${siteUrl}):
${liveContent}` : "No live site data available."}

Based on all the above, provide your quality control verdict.

If no evidence was provided AND no live data is available: verdict must be "not_verified".
If the completion note is vague or generic: flag it specifically.
If the waiting period has not elapsed: note this affects evidence reliability.

Return ONLY valid JSON:
{
  "verdict": "verified|not_verified|partial|waiting|cannot_determine",
  "confidence": 0,
  "evidence_found": ["specific confirmed item from the evidence provided"],
  "evidence_missing": ["what is absent that would be needed for full approval"],
  "what_to_check": [
    {
      "tool": "exact tool name",
      "action": "exactly what to do in that tool step by step",
      "what_to_look_for": "specific metric, page, or data point",
      "pass_condition": "exact value or state that means pass",
      "fail_condition": "exact value or state that means fail"
    }
  ],
  "timeline_note": "when the full impact will be measurable and what to look for then",
  "next_action": "the single most important thing to do right now to get this approved",
  "approval_blocked": "if verdict is not verified — the specific reason approval is blocked",
  "hod_note": "brief senior-level comment on the quality of work and evidence submitted",
  "roles": {
    "who_should_verify": "which role should run these manual checks",
    "escalate_to": "who to escalate to if verification fails after corrections"
  }
}`;

  try {
    const anthropic = new Anthropic();
    const response  = await anthropic.messages.create({
      model: "claude-sonnet-4-5", max_tokens: 1500,
      system: "You are the Head of Department for Digital Marketing. You are strict, evidence-driven, and never approve work without proof. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    });

    const raw  = response.content[0].type === "text" ? response.content[0].text : "{}";
    const f    = raw.indexOf("{");
    const l    = raw.lastIndexOf("}");
    let parsed: any = {};
    try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch {}

    return res.status(200).json({
      success:          true,
      verdict:          parsed.verdict          || "cannot_determine",
      confidence:       parsed.confidence        || 0,
      evidence_found:   parsed.evidence_found    || [],
      evidence_missing: parsed.evidence_missing  || [],
      what_to_check:    parsed.what_to_check     || [],
      timeline_note:    parsed.timeline_note     || "",
      next_action:      parsed.next_action       || "",
      approval_blocked: parsed.approval_blocked  || "",
      hod_note:         parsed.hod_note          || "",
      roles:            parsed.roles             || {},
      waiting_status:   { waitDays, daysSince, daysLeft, waitExpired },
      live_data_used:   liveContent.length > 0,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
