/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/panel-engine.ts

   THE PANEL — a working discussion of senior stakeholders over the verified
   evidence the deep steps gathered. It does NOT gather data. It frames the
   problem: builds the traffic scenarios that matter for THIS project and
   industry, and the sharp questions each role needs the pillars (scientists)
   to answer.

   Round 1 runs over the evidence, then STOPS at Manav's gate. Manav adds
   scenarios/context/data; round 2 re-discusses (round 1 + Manav input,
   non-destructive). Manav then releases to the pillars.

   Project-agnostic: scenarios are derived from the project's own evidence.
════════════════════════════════════════════════════════════════ */

import { db } from "../db.js";
import { llm, parseJsonResponse } from "./llm.js";
import { STAKEHOLDER_ROLES } from "./shared.js";

export interface PanelQuestion {
  role: string;        // which stakeholder is asking
  pillar: string;      // which pillar must answer
  question: string;    // the specific question
  why: string;         // why it matters to that role
}
export interface PanelScenario {
  title: string;
  description: string;     // grounded in evidence
  traffic_lever: string;   // how this moves traffic
  evidence_basis: string;  // which facts support it
}
export interface PanelOutput {
  headline: string;
  scenarios: PanelScenario[];
  questions: PanelQuestion[];
  cross_checks: string[];     // angles the panel wants verified
}

/* Build the prompt context from all step evidence reports for the run. */
async function loadStepEvidence(runId: string): Promise<{ reports: string; goal: string; framing: string }> {
  const { data: run } = await db().from("workspace_runs").select("goal, run_config").eq("id", runId).maybeSingle();
  const cfg = (run as any)?.run_config || null;
  const { data: steps } = await db().from("step_reports")
    .select("step_key, report_md, worth_deeper_json").eq("run_id", runId).order("created_at");
  const reports = ((steps || []) as any[]).map((s: any) =>
    `### Evidence: ${s.step_key}\n${s.report_md || ""}\n\nFlagged for deeper investigation:\n${(s.worth_deeper_json || []).map((w: string) => `- ${w}`).join("\n") || "- (none)"}`
  ).join("\n\n---\n\n");
  return {
    reports,
    goal: (run as any)?.goal || "grow organic traffic",
    framing: cfg?.panel_framing || "",
  };
}

/* Run a panel round. round=1 over evidence; round=2 incorporates Manav input. */
export async function runPanelRound(opts: {
  runId: string;
  projectId: string;
  round: number;
  manavInput?: string;     // round 2 only
  priorOutput?: PanelOutput;  // round 2: the round-1 result to build on
}): Promise<{ success: boolean; output?: PanelOutput; error?: string }> {
  const { reports, goal, framing } = await loadStepEvidence(opts.runId);
  if (!reports.trim()) return { success: false, error: "No step evidence found for this run." };

  const roleList = STAKEHOLDER_ROLES.join(", ");
  const system = `You are facilitating a panel of senior stakeholders analysing how to achieve a specific goal for a website, working ONLY from verified evidence. The panel roles are: ${roleList}.

Goal: ${goal}
${framing ? `\nHow to frame this goal:\n${framing}\n` : ""}
Your job is NOT to gather data or guess. It is to FRAME the problem for the analyst pillars who will answer with deep, sourced data. Produce:
1. SCENARIOS — the distinct, realistic paths to the goal that THIS project's evidence actually supports (e.g. recover near-ranking pages, fix indexation, capture untapped query clusters, displace specific competitors, convert existing traffic). Each grounded in specific evidence. No generic playbook items.
2. QUESTIONS — for each scenario, the sharp questions each relevant role needs answered. Tag every question with the asking role and the pillar that must answer it (visibility, query_opportunity, on_page_health, technical_performance, internal_links, engagement, monitoring).
3. CROSS-CHECKS — angles the panel wants verified before trusting any conclusion.

RULES: Every scenario and question must trace to a fact in the evidence. No assumptions, no fluff. If evidence is thin for a scenario, say what must be verified. Be specific to this project's actual data, never generic.

Respond with ONLY valid JSON, no prose, no fences:
{
  "headline": "one sentence on the biggest traffic opportunity this evidence reveals",
  "scenarios": [{"title":"","description":"","traffic_lever":"","evidence_basis":""}],
  "questions": [{"role":"client|dms|writer|brand|pm|investor","pillar":"visibility|query_opportunity|on_page_health|technical_performance|internal_links|engagement|monitoring","question":"","why":""}],
  "cross_checks": [""]
}`;

  let user = `VERIFIED EVIDENCE FROM THE DEEP STEPS:\n\n${reports}\n\n`;
  if (opts.round >= 2 && opts.priorOutput) {
    user += `\nThis is ROUND 2. Here is the panel's round-1 output — BUILD ON IT, do not discard it:\n${JSON.stringify(opts.priorOutput, null, 2)}\n`;
  }
  if (opts.round >= 2 && opts.manavInput) {
    user += `\nManav (the operator and a panel member) has added the following context/scenarios/data. Incorporate it: refine existing scenarios, add new ones it implies, and add or adjust questions accordingly:\n"""\n${opts.manavInput}\n"""\n`;
  }
  user += `\nProduce the panel output as JSON now.`;

  const raw = await llm({ system, user, maxTokens: 7000, timeoutMs: 120000, label: "panel" });
  if (!raw) return { success: false, error: "Panel discussion returned empty (LLM timeout or error)." };
  const output = parseJsonResponse<PanelOutput>(raw);
  if (!output || !Array.isArray(output.scenarios)) return { success: false, error: "Panel output could not be parsed." };

  return { success: true, output };
}

/* Render the panel discussion to a downloadable document. */
export function renderPanelDocument(o: PanelOutput, round: number, manavInput?: string): string {
  const roleLabel: Record<string, string> = { client: "Client", dms: "SEO Lead", writer: "Writer", brand: "Brand", pm: "PM", investor: "Investor", dev: "Dev" };
  const pillarLabel: Record<string, string> = {
    visibility: "Visibility", query_opportunity: "Query Opportunity", on_page_health: "On-Page Health",
    technical_performance: "Technical Performance", internal_links: "Internal Links", engagement: "Engagement", monitoring: "Monitoring",
  };
  const L: string[] = [];
  L.push(`# Panel Discussion${round > 1 ? ` — Round ${round}` : ""}`);
  L.push("");
  if (o.headline) { L.push(`> ${o.headline}`); L.push(""); }

  L.push(`## Scenarios on the table`);
  L.push("");
  (o.scenarios || []).forEach((s, i) => {
    L.push(`### ${i + 1}. ${s.title}`);
    if (s.description) { L.push(""); L.push(s.description); }
    if (s.traffic_lever) { L.push(""); L.push(`**How it would move traffic.** ${s.traffic_lever}`); }
    if (s.evidence_basis) { L.push(""); L.push(`**What the evidence shows.** ${s.evidence_basis}`); }
    L.push("");
  });

  // Questions grouped by PILLAR (which scientist must answer them), with the
  // asking role shown as a quiet metadata tag — not a screaming heading.
  const byPillar: Record<string, PanelQuestion[]> = {};
  (o.questions || []).forEach(q => { (byPillar[q.pillar] = byPillar[q.pillar] || []).push(q); });
  if (Object.keys(byPillar).length) {
    L.push(`## Questions to investigate`);
    L.push("");
    for (const pk of Object.keys(byPillar)) {
      L.push(`### ${pillarLabel[pk] || pk}`);
      for (const q of byPillar[pk]) {
        L.push(`- ${q.question} _(asked by ${roleLabel[q.role] || q.role}${q.why ? ` — ${q.why}` : ""})_`);
      }
      L.push("");
    }
  }

  if ((o.cross_checks || []).length) {
    L.push(`## Cross-checks`);
    L.push("");
    for (const c of o.cross_checks) L.push(`- ${c}`);
    L.push("");
  }

  if (manavInput) {
    L.push(`## Operator input (incorporated)`);
    L.push("");
    L.push(manavInput);
    L.push("");
  }

  return L.join("\n");
}
