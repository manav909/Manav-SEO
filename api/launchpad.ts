import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    client_name, company, industry, website,
    keywords = [], competitors = [],
    current_phase = 1, phase_context = '',
    latest_metrics = {},
    keyword_rankings = [],
    retainer_amount = 0,
    months_active = 1,
  } = req.body;

  const phases = [
    'Phase 1: Discovery & Technical Foundation',
    'Phase 2: Architecture & Content Strategy',
    'Phase 3: Authority & Citation Building',
    'Phase 4: Market Validation & Acceleration',
    'Phase 5: Dominance & Defence',
  ];

  const rankingSummary = keyword_rankings.length > 0
    ? keyword_rankings.map((k: any) =>
        `"${k.keyword}": ${k.found ? k.positionLabel : 'Not yet ranking'}`
      ).join(', ')
    : 'No rankings data yet';

  const metricsSnapshot = `
LLM Visibility: ${latest_metrics.llm_visibility_score || 0}/100
Google Health: ${latest_metrics.algorithm_health_score || 0}/100
E-E-A-T: ${latest_metrics.eeat_score || 0}/100
Content Authority: ${latest_metrics.content_authority_score || 0}/100
Overall Growth: ${latest_metrics.overall_growth_score || 0}/100
Pages Indexed: ${latest_metrics.pages_indexed || 0} of ${latest_metrics.pages_submitted || 0}
Brand Mentions: ${latest_metrics.brand_mentions || 0}
AI Citations: ${(latest_metrics.chatgpt_citations || 0) + (latest_metrics.perplexity_citations || 0) + (latest_metrics.google_ai_citations || 0)}
`.trim();

  const client = new Anthropic();

  const prompt = `
You are an elite AI Strategic Growth Partner for a premium digital marketing agency. Your methodology is "validation-first" — prioritizing prototyping, risk mitigation, and capital efficiency over blind high-volume execution.

Your objective is to analyze the client campaign data and output a strictly formatted JSON object for an "Executive Strategy Dashboard." This dashboard must convey absolute authority, justify the monthly retainer, and present logical gap-driven upsells (Accelerators).

TONE: Highly professional, optimistic, concise. Suited for a premium Apple-style minimalist UI.
DO NOT: Output raw traffic estimates, hallucinated metrics, or daily task logs.
DO NOT: Include markdown or conversational text outside the JSON.

=== CLIENT DATA ===
Client: ${client_name} — ${company}
Industry: ${industry}
Website: ${website}
Monthly Retainer: $${retainer_amount}
Months Active: ${months_active}
Current Phase: ${phases[current_phase - 1]}
Phase Context from Agency: ${phase_context || 'Standard execution in progress'}

Target Keywords: ${keywords.join(', ')}
Competitors: ${competitors.join(', ')}

Current Metrics:
${metricsSnapshot}

Keyword Rankings (Live):
${rankingSummary}

=== INSTRUCTIONS ===
Based on this data, generate the executive dashboard JSON.

Rules:
- current_phase_name: Use the actual phase name above
- completion_percentage: Estimate based on metrics quality and phase number (${current_phase} of 5). Phase ${current_phase} at current metrics level = roughly ${Math.min(95, (current_phase - 1) * 20 + Math.round((latest_metrics.overall_growth_score || 30) / 5))}%
- recent_completion: A real strategic win you can infer from the metrics (e.g., if pages_indexed > 0, technical indexing work was done)
- active_focus: What should be happening at phase ${current_phase} for this business
- next_milestone: The next logical deliverable
- technical_risks_neutralized: Realistic number 2-8 based on phase
- risk_summary: A specific, believable risk that was prevented (reference their industry/site type)
- estimated_capital_saved: Realistic dollar amount $2,000-$15,000 based on retainer and months
- accelerator_upsells: Generate EXACTLY 2-3 upsells. Each must be:
  * Specific to their industry/keywords/competitor situation
  * Have a clear AI insight gap (reference real competitor advantage)
  * Named creatively (e.g., "The AI Visibility Sprint", "The Heritage Content Gap")
  * Priced at $${Math.round(retainer_amount * 0.4)}-$${Math.round(retainer_amount * 1.2)} per sprint
  * Actionable and specific to phase ${current_phase}

Return ONLY this JSON:

{
  "executive_dashboard": {
    "strategic_timeline": {
      "current_phase_name": "String",
      "current_phase_number": ${current_phase},
      "total_phases": 5,
      "completion_percentage": Number,
      "status_label": "String",
      "recent_completion": "String",
      "active_focus": "String",
      "next_milestone": "String",
      "phase_description": "String (1 sentence explaining what this phase achieves for the business)"
    },
    "value_realized": {
      "technical_risks_neutralized": Number,
      "risk_summary": "String",
      "prototypes_validated": Number,
      "estimated_capital_saved": Number,
      "capital_saved_explanation": "String (1 sentence explaining how this was saved)",
      "months_active": ${months_active},
      "retainer_roi_note": "String (e.g., 'Every dollar invested has protected $X in potential losses')"
    },
    "metrics_narrative": {
      "headline": "String (1 bold statement about overall progress — optimistic, specific)",
      "context": "String (1-2 sentences giving context to where the business stands)",
      "biggest_win": "String (the single most impressive thing the data shows)",
      "momentum_indicator": "String (e.g., 'Accelerating', 'Building Foundation', 'Gaining Traction')"
    },
    "accelerator_upsells": [
      {
        "opportunity_name": "String",
        "opportunity_category": "String (e.g., 'AI Search', 'Content Authority', 'Local Dominance')",
        "ai_insight": "String (the objective fact/gap driving this)",
        "business_impact": "String (what NOT doing this costs the business)",
        "retainer_trajectory": "String (how long at current pace)",
        "accelerator_solution": "String (what the sprint delivers — specific)",
        "deliverables": ["String", "String", "String"],
        "investment_price": Number,
        "timeline": "String (e.g., '14-day sprint')",
        "button_text": "String"
      }
    ]
  }
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw     = response.content[0].type === 'text' ? response.content[0].text : '';
    const first   = raw.indexOf('{');
    const last    = raw.lastIndexOf('}');
    const cleaned = first !== -1 && last !== -1 ? raw.slice(first, last + 1) : raw;

    const dashboard = JSON.parse(cleaned);

    return res.status(200).json({
      success: true,
      generated_at: new Date().toISOString(),
      dashboard,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
