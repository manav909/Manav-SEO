import Anthropic from "@anthropic-ai/sdk";
import { extractAndSaveLearning } from "./ai-cache";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

/* ── Safe export ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _launchpad_h(req, res); }
  catch (e: any) { try { res.status(200).json({error: e?.message||"unknown"}); } catch (_) {} }
}
async function _launchpad_h(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(200).json({ error: 'Method not allowed' });

  const {
    client_name       = '',
    company           = '',
    industry          = '',
    website           = '',
    keywords          = [],
    competitors       = [],
    current_phase     = 1,
    phase_context     = '',
    months_active     = 1,
    retainer_amount   = 0,
    /* ── pre-fetched data from Supabase ── */
    latest_metrics    = {} as any,
    saved_analysis    = {} as any,   // project.last_analysis.analysis
    keyword_rankings  = [] as any[],
    keyword_insights  = {} as any,
    historical_metrics= [] as any[], // all metrics rows for trend
  } = req.body;

  const phases = [
    'Phase 1: Discovery & Technical Foundation',
    'Phase 2: Architecture & Content Strategy',
    'Phase 3: Authority & Citation Building',
    'Phase 4: Market Validation & Acceleration',
    'Phase 5: Dominance & Defence',
  ];

  /* ── Build rich context from existing data ── */
  const scores = `
LLM Visibility: ${latest_metrics.llm_visibility_score ?? saved_analysis.llm_visibility_score ?? 0}/100
Google Health: ${latest_metrics.algorithm_health_score ?? saved_analysis.algorithm_health_score ?? 0}/100
E-E-A-T: ${latest_metrics.eeat_score ?? saved_analysis.eeat_score ?? 0}/100
Content Authority: ${latest_metrics.content_authority_score ?? saved_analysis.content_authority_score ?? 0}/100
Overall Growth: ${latest_metrics.overall_growth_score ?? saved_analysis.overall_growth_score ?? 0}/100
Pages Indexed: ${latest_metrics.pages_indexed ?? 0} of ${latest_metrics.pages_submitted ?? 0}
Brand Mentions: ${latest_metrics.brand_mentions ?? 0}
Perplexity Citations: ${latest_metrics.perplexity_citations ?? 0}
Google AI Citations: ${latest_metrics.google_ai_citations ?? 0}`.trim();

  const rankingLines = keyword_rankings.length > 0
    ? keyword_rankings.map((k: any) =>
        `"${k.keyword}": ${k.found ? k.positionLabel : 'Not yet ranking'}${k.snippet ? ` — "${k.snippet.slice(0, 80)}"` : ''}`
      ).join('\n')
    : 'No ranking data yet';

  const insightLines = Object.keys(keyword_insights).length > 0
    ? Object.entries(keyword_insights).map(([kw, ins]: [string, any]) =>
        `"${kw}": business_value="${ins.business_value?.slice(0, 100) || ''}" buyer_intent="${ins.buyer_intent || ''}" priority=${ins.priority || 'high'}`
      ).join('\n')
    : '';

  const strengthLines = (saved_analysis.verified_strengths || []).slice(0, 5).join('\n') || 'Not yet assessed';
  const opportunityLines = (saved_analysis.growth_opportunities || saved_analysis.verified_gaps || []).slice(0, 5).join('\n') || 'Not yet assessed';
  const storyLine = saved_analysis.story || saved_analysis.competitor_gap_note || '';
  const milestone = saved_analysis.milestone || latest_metrics.milestone || '';
  const milestoneImpact = saved_analysis.milestone_impact || latest_metrics.milestone_impact || '';
  const competitorNote = saved_analysis.competitor_gap_note || latest_metrics.competitor_gap_note || '';

  /* ── Trend from historical metrics ── */
  let trendNote = '';
  if (historical_metrics.length >= 2) {
    const first = historical_metrics[0];
    const last  = historical_metrics[historical_metrics.length - 1];
    const growthDelta = (last.overall_growth_score || 0) - (first.overall_growth_score || 0);
    const indexDelta  = (last.pages_indexed || 0) - (first.pages_indexed || 0);
    trendNote = `Over ${historical_metrics.length} reports: Growth score ${growthDelta >= 0 ? '+' : ''}${growthDelta} pts. Pages indexed ${indexDelta >= 0 ? '+' : ''}${indexDelta}.`;
  }

  const client = new Anthropic();

  const prompt = `
You are an elite AI Strategic Growth Partner for a premium digital marketing agency.
Your methodology is "validation-first" — prioritise risk mitigation and capital efficiency.

Generate an Executive Strategy Dashboard JSON based ONLY on the pre-analysed data below.
DO NOT invent metrics. Use the provided scores and findings directly.
TONE: Highly professional, optimistic, concise. Apple-style minimalist UI copy.

=== CLIENT ===
Name: ${client_name} | Company: ${company} | Industry: ${industry}
Website: ${website} | Retainer: $${retainer_amount}/mo | Active: ${months_active} months
Phase: ${phases[current_phase - 1]}

=== CURRENT SCORES (already verified) ===
${scores}

=== KEYWORD RANKINGS (live data) ===
${rankingLines}

=== KEYWORD BUSINESS INSIGHTS ===
${insightLines || 'See keyword rankings above'}

=== WEBSITE STRENGTHS (from analysis) ===
${strengthLines}

=== GROWTH OPPORTUNITIES (from analysis) ===
${opportunityLines}

=== COMPETITIVE POSITION ===
${competitorNote || 'Analysis pending'}

=== CAMPAIGN MILESTONE ===
${milestone || 'None recorded yet'}: ${milestoneImpact}

=== WEBSITE STORY ===
${storyLine || 'Analysis in progress'}

=== PERFORMANCE TREND ===
${trendNote || `Month ${months_active} of campaign — baseline being established`}

=== MANAV'S CURRENT WORK (phase context) ===
${phase_context || `Standard ${phases[current_phase - 1]} execution in progress`}

=== COMPETITORS BEING TRACKED ===
${competitors.join(', ') || 'None specified'}

---

Using ONLY the data above, return this EXACT JSON — no markdown, no text outside JSON:

{
  "executive_dashboard": {
    "strategic_timeline": {
      "current_phase_name": "${phases[current_phase - 1]}",
      "current_phase_number": ${current_phase},
      "total_phases": 5,
      "completion_percentage": <Number 0-100: estimate from phase ${current_phase}/5 and score levels above>,
      "status_label": "<e.g. 'In Progress', 'Accelerating', 'On Track'>",
      "recent_completion": "<specific strategic win from the strengths/milestone data above — must reference something real>",
      "active_focus": "<what is being worked on per phase context above — no timestamps>",
      "next_milestone": "<the next logical deliverable based on phase ${current_phase} and opportunity gaps above>",
      "phase_description": "<1 sentence: what phase ${current_phase} achieves for ${company}>"
    },
    "value_realized": {
      "technical_risks_neutralized": <Number 2-8: realistic based on phase ${current_phase} and months_active ${months_active}>,
      "risk_summary": "<1 sentence: specific risk prevented this engagement — reference industry '${industry}' or site type>",
      "prototypes_validated": <Number 1-5: concepts tested at phase ${current_phase}>,
      "estimated_capital_saved": <Number: $${Math.round(retainer_amount * 0.8 * months_active)}-$${Math.round(retainer_amount * 2.5 * months_active)} based on retainer and months>,
      "capital_saved_explanation": "<1 sentence: how this capital was protected — reference the specific risks neutralized>",
      "months_active": ${months_active},
      "retainer_roi_note": "<e.g. 'At $${retainer_amount}/month, each dollar has returned X in protected growth and validated strategy'>"
    },
    "metrics_narrative": {
      "headline": "<1 bold confident statement about overall progress — use actual score numbers from above>",
      "context": "<1-2 sentences giving context using real scores and rankings from above>",
      "biggest_win": "<the single most impressive data point from above — be specific with numbers>",
      "momentum_indicator": "<'Accelerating' if growth trend positive, 'Building Foundation' if phase 1-2, 'Gaining Traction' if phase 3>"
    },
    "accelerator_upsells": [
      {
        "opportunity_name": "<Creative name referencing a real gap from the opportunity data above>",
        "opportunity_category": "<'AI Search', 'Content Authority', 'Local Dominance', 'Technical SEO', 'Link Building'>",
        "ai_insight": "<The specific gap from the opportunities/competitor data above — reference real numbers>",
        "business_impact": "<What NOT closing this gap costs — specific to ${industry}>",
        "retainer_trajectory": "<At current pace, how many months to close this gap>",
        "accelerator_solution": "<Specific deliverable sprint — reference the actual keywords or gaps above>",
        "deliverables": ["<specific deliverable 1>", "<specific deliverable 2>", "<specific deliverable 3>"],
        "investment_price": <${Math.round(retainer_amount * 0.5)}-${Math.round(retainer_amount * 1.5)}: round to nearest 50>,
        "timeline": "<'7-day sprint', '14-day sprint', '21-day sprint'>",
        "button_text": "Approve Accelerator Sprint"
      },
      {
        "opportunity_name": "<Second creative name referencing a different real gap>",
        "opportunity_category": "<different category from above>",
        "ai_insight": "<Different specific gap — use keyword rankings or competitor data>",
        "business_impact": "<Different business cost specific to ${industry}>",
        "retainer_trajectory": "<Timeline at standard pace>",
        "accelerator_solution": "<Different specific sprint deliverable>",
        "deliverables": ["<deliverable 1>", "<deliverable 2>", "<deliverable 3>"],
        "investment_price": <different price in range>,
        "timeline": "<sprint duration>",
        "button_text": "Approve Accelerator Sprint"
      }
    ]
  }
}`;

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 3000,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw     = response.content[0].type === 'text' ? response.content[0].text : '';
    const first   = raw.indexOf('{');
    const last    = raw.lastIndexOf('}');
    const cleaned = (first !== -1 && last !== -1) ? raw.slice(first, last + 1) : raw;
    const dashboard = JSON.parse(cleaned);

    return res.status(200).json({
      success:      true,
      generated_at: new Date().toISOString(),
      dashboard,
    });

  } catch (err: any) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
