import { db } from "./db";

// ── WORLD-CLASS CONVERSATION ANALYSER ──────────────────────
export async function analyseConversation(
  text: string,
  projectId?: string,
  channel: string = "email"
) {
  const prompt = `You are an elite client communication intelligence system with deep knowledge of:
- Global business culture, etiquette, and communication norms across all regions
- Geopolitical sensitivities and how they affect business relationships
- Psychological principles of client relationships and emotional intelligence
- Sales objection handling and conversion psychology
- SEO industry-specific client concerns and objections
- Multi-language communication nuances

Analyse this client/prospect communication deeply:

---
${text}
---

Return a comprehensive JSON analysis (no markdown, JSON only):
{
  "detected_language": "ISO 639-1 code (en, fr, de, ar, hi, zh, es, pt, etc.)",
  "language_name": "Full language name in English",
  "cultural_context": "1-2 sentences on cultural background and communication style norms for this person",
  "geopolitical_notes": "Any relevant geopolitical/economic context affecting their situation or mindset",
  "mood_score": number 0-100 (0=furious, 25=unhappy, 50=neutral, 75=positive, 100=delighted),
  "mood_label": "furious|very_unhappy|unhappy|neutral|satisfied|positive|excited|delighted",
  "emotional_state": "e.g. frustrated_but_professional|excited_and_impatient|politely_sceptical|genuinely_concerned",
  "emotional_subtext": "What they are REALLY feeling beneath the surface",
  "intent": "renewing|churning|upgrading|complaining|exploring|negotiating|escalating|praising|confused|urgent_need",
  "risk_level": "low|medium|high|critical",
  "urgency": "low|normal|high|immediate",
  "objections": [
    {
      "type": "price|results|trust|timing|competitor|internal_politics|budget|scope|agency_change|seo_scepticism|previous_bad_experience|roi_proof|boss_approval",
      "text": "exact objection stated or implied",
      "severity": "mild|moderate|strong|dealbreaker",
      "hidden": true/false
    }
  ],
  "key_themes": ["theme1","theme2"],
  "what_they_want": "What outcome they are seeking from this conversation",
  "what_they_fear": "Their underlying fear or concern",
  "power_dynamic": "equal|they_have_power|we_have_power|uncertain",
  "best_response_strategy": "Name of best approach: e.g. Empathy_First_Then_Evidence | Direct_ROI_Focus | Slow_Down_And_Listen | Urgency_Match | Cultural_Respect_Bridge",
  "response_tone": "empathetic|confident|educational|urgent|reassuring|challenging|consultative",
  "opening_move": "First sentence to open your response — must immediately address their dominant emotion",
  "key_messages": ["message that must land 1", "message 2", "message 3"],
  "what_not_to_say": ["phrase or approach to avoid 1", "avoid 2"],
  "relationship_temperature": "cold|warming|warm|hot|on_fire",
  "next_best_action": "Single most important thing to do next"
}`;

  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
  });
  const aj = await ai.json() as any;
  let analysis: any = {};
  try {
    analysis = JSON.parse((aj?.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
  } catch {
    analysis = { mood_score: 50, mood_label: "neutral", emotional_state: "unknown", objections: [], intent: "unknown", risk_level: "low" };
  }

  // Save to DB
  const { data: saved } = await db().from("client_conversations").insert({
    project_id: projectId || null,
    conversation_text: text.slice(0, 5000),
    channel,
    detected_language: analysis.detected_language || "en",
    language_name: analysis.language_name || "English",
    cultural_context: analysis.cultural_context || "",
    geopolitical_notes: analysis.geopolitical_notes || "",
    mood_score: analysis.mood_score || 50,
    mood_label: analysis.mood_label || "neutral",
    emotional_state: analysis.emotional_state || "neutral",
    objections: analysis.objections || [],
    intent: analysis.intent || "unknown",
    risk_level: analysis.risk_level || "low",
    urgency: analysis.urgency || "normal",
    key_themes: analysis.key_themes || [],
    best_response_strategy: analysis.best_response_strategy || "",
  }).select().single();

  return { id: saved?.id, analysis };
}

// ── SMART RESPONSE GENERATOR ──────────────────────────────
export async function generateResponses(
  conversationText: string,
  analysis: any,
  projectId?: string,
  projectContext?: any
) {
  const lang = analysis.detected_language || "en";
  const langName = analysis.language_name || "English";
  const strategy = analysis.best_response_strategy || "Empathy_First_Then_Evidence";

  const prompt = `You are an expert client communications specialist for an SEO agency.
Write 3 distinct response strategies to this client message.
CRITICAL: Respond in ${langName} (${lang}) — match their language exactly, not translated but native fluent.

Client message:
"${conversationText.slice(0, 1000)}"

Intelligence gathered:
- Mood: ${analysis.mood_score}/100 (${analysis.mood_label})
- Emotional state: ${analysis.emotional_state}
- What they really feel: ${analysis.emotional_subtext || "unknown"}
- Intent: ${analysis.intent}
- Risk: ${analysis.risk_level}
- Objections: ${JSON.stringify(analysis.objections || [])}
- Cultural context: ${analysis.cultural_context || "professional western business"}
- Best opening move: ${analysis.opening_move || "acknowledge their concern"}
- What NOT to say: ${JSON.stringify(analysis.what_not_to_say || [])}
${projectContext ? `\nProject context: ${JSON.stringify(projectContext)}` : ""}

Generate 3 responses in ${langName}:
{
  "responses": [
    {
      "strategy": "Strategy name (e.g. Empathetic Leader)",
      "tone": "empathetic|confident|direct|consultative",
      "when_to_use": "Use this when...",
      "subject_line": "Email subject if applicable",
      "body": "Full response in ${langName}. Well structured. Professional. Culturally appropriate. NO placeholders.",
      "risk": "low|medium|high",
      "conversion_probability": number 0-100
    }
  ],
  "objection_responses": [
    {
      "objection": "objection text",
      "response": "specific counter in ${langName}"
    }
  ],
  "follow_up_sequence": ["follow up 1 (after 2 days)", "follow up 2 (after 5 days)"]
}
Return JSON only.`;

  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  const aj = await ai.json() as any;
  let result: any = { responses: [], objection_responses: [], follow_up_sequence: [] };
  try {
    result = JSON.parse((aj?.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
  } catch {}

  // Update conversation with responses
  if (projectId) {
    await db().from("client_conversations")
      .update({ generated_responses: result.responses || [] })
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1);
  }

  return result;
}

// ── OBJECTION HANDLER ─────────────────────────────────────
export async function handleObjection(
  objectionType: string,
  objectionText: string,
  language: string = "en",
  projectContext?: any
) {
  // Check library first
  const { data: existing } = await db().from("objection_library")
    .select("*")
    .eq("objection_type", objectionType)
    .eq("language", language)
    .limit(1)
    .maybeSingle();

  const prompt = `You are a world-class SEO agency sales and client success expert.
Handle this specific objection from a client.

Objection type: ${objectionType}
What they said: "${objectionText}"
Language to respond in: ${language}
${projectContext ? `Project context: ${JSON.stringify(projectContext)}` : ""}

Respond in ${language}. Return JSON only:
{
  "immediate_response": "First thing to say — acknowledge and pivot",
  "full_response": "Complete response handling the objection. Fluent ${language}. No placeholders.",
  "supporting_evidence": ["evidence point 1", "point 2", "point 3"],
  "power_phrase": "One killer sentence that reframes the objection",
  "what_they_really_mean": "The real concern behind the stated objection",
  "escalation_needed": true/false,
  "close_move": "How to move toward yes after this response"
}`;

  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
  });
  const aj = await ai.json() as any;
  let response: any = {};
  try {
    response = JSON.parse((aj?.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
  } catch {}

  return { objection_type: objectionType, language, existing_template: existing, generated: response };
}

// ── CLIENT UPDATE GENERATOR ───────────────────────────────
export async function generateClientUpdate(
  projectId: string,
  updateType: "email" | "slack" | "whatsapp" | "formal" | "executive",
  language: string = "en"
) {
  const { data: project } = await db().from("projects").select("*").eq("id", projectId).single();
  if (!project) return null;

  const [tasksR, learnsR, verifR, metricsR] = await Promise.allSettled([
    db().from("task_executions").select("task_type,status,created_at").eq("project_id", projectId)
      .gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(20),
    db().from("brain_learnings").select("card_title,what_worked,confidence_score").eq("project_id", projectId)
      .gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(10),
    db().from("verification_queue").select("card_title,verdict").eq("project_id", projectId)
      .eq("status", "done").gte("updated_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    db().from("metrics").select("*").eq("project_id", projectId)
      .order("recorded_at", { ascending: false }).limit(3),
  ]);

  const tasks  = tasksR.status === "fulfilled"   ? tasksR.value.data   || [] : [];
  const learns = learnsR.status === "fulfilled"  ? learnsR.value.data  || [] : [];
  const verifs = verifR.status === "fulfilled"   ? verifR.value.data   || [] : [];
  const metrics= metricsR.status === "fulfilled" ? metricsR.value.data || [] : [];

  const formats: Record<string, string> = {
    email:     "Professional email. Subject line required. Paragraphs. Warm but professional.",
    slack:     "Slack message. Bullet points. Emojis ok. Max 300 words. Scannable.",
    whatsapp:  "WhatsApp message. Conversational. Short sentences. Emojis where natural. Under 200 words.",
    formal:    "Formal written report. Headings. Numbered points. Executive language. PDF-ready.",
    executive: "C-suite brief. Metrics-first. ROI-focused. Under 150 words. No fluff.",
  };

  const wins = verifs.filter((v: any) => v.verdict === "working").map((v: any) => v.card_title);
  const doneTasks = tasks.filter((t: any) => t.status === "done").length;

  const prompt = `Write a ${updateType} client update for ${project.name}.
Language: ${language === "en" ? "English" : language} — write entirely in this language.
Format: ${formats[updateType]}

DATA (use these real facts):
- Tasks completed this period: ${doneTasks}
- Verified wins: ${wins.slice(0, 4).join(", ") || "building..."}
- Learnings captured: ${learns.length}
- Goal: ${project.goals || "improve organic visibility"}
- Latest LLM visibility: ${metrics[0]?.llm_visibility_score || "measuring"}

Write it now. No placeholders. Real, specific, confident. Return the message text only.`;

  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const aj = await ai.json() as any;
  const content = aj?.content?.[0]?.text || "";

  // Save to DB
  await db().from("communication_templates").insert({
    category: "client_update",
    subcategory: updateType,
    title: `${project.name} — ${updateType} update — ${new Date().toLocaleDateString("en-GB")}`,
    language,
    template_body: content,
    tone: updateType === "whatsapp" || updateType === "slack" ? "casual" : "professional",
    use_case: `${updateType} update for ${project.name}`,
  }).then(() => {}).catch(() => {});

  return { content, updateType, language, project: project.name };
}

// ── PRESENTATION / DEMO GENERATOR ────────────────────────
export async function generatePresentation(
  type: string,
  projectId?: string,
  prospectId?: string,
  language: string = "en"
) {
  let context: any = {};
  if (projectId) {
    const { data: proj } = await db().from("projects").select("*").eq("id", projectId).single();
    const { data: learnings } = await db().from("brain_learnings")
      .select("card_title,what_worked,confidence_score").eq("project_id", projectId)
      .order("confidence_score", { ascending: false }).limit(8);
    const { data: verifs } = await db().from("verification_queue")
      .select("card_title,verdict").eq("project_id", projectId).eq("verdict", "working").limit(6);
    context = { project: proj, wins: verifs, learnings };
  }
  if (prospectId) {
    const { data: prospect } = await db().from("prospects").select("*").eq("id", prospectId).single();
    context = { ...context, prospect };
  }

  const typePrompts: Record<string, string> = {
    progress_update:   "Progress update presentation showing work done, results, wins, and next steps",
    proposal:          "Persuasive proposal presentation for a new prospect — make them say yes",
    onboarding:        "Friendly onboarding presentation explaining the process, timeline, and what to expect",
    quarterly_review:  "Quarterly business review with KPIs, ROI analysis, and strategic roadmap",
    case_study:        "Compelling case study presentation showing transformation and results",
    demo:              "Interactive demo presentation showing the SEO Season platform capabilities",
    walkthrough:       "Step-by-step walkthrough of the work completed and how it impacts their business",
  };

  const prompt = `Create a ${typePrompts[type] || type} as a complete HTML presentation.
Language: ${language === "en" ? "English" : language}
Context: ${JSON.stringify(context).slice(0, 2000)}

Requirements:
- Dark professional design (#070710 background, #6366f1 accent, white text)
- Slide-like sections with clear headings
- Real data from context (no placeholders)
- Visually impressive with inline CSS
- Compelling narrative flow
- Clear call-to-action at the end
- Mobile responsive

Return complete HTML body only (no html/head/body tags).`;

  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
  });
  const aj = await ai.json() as any;
  const html = aj?.content?.[0]?.text || "<p>Presentation generation failed.</p>";

  const { data: pres } = await db().from("client_presentations").insert({
    project_id: projectId || null,
    prospect_id: prospectId || null,
    title: `${type.replace(/_/g, " ").toUpperCase()} — ${new Date().toLocaleDateString("en-GB")}`,
    presentation_type: type,
    html_content: html,
    status: "ready",
  }).select().single();

  return { id: pres?.id, token: pres?.token, html, shareUrl: `/presentation/${pres?.token}` };
}

// ── TIMEZONE HELPER ───────────────────────────────────────
export function getClientTimezones() {
  const zones = [
    { region:"London",       tz:"Europe/London",          flag:"🇬🇧" },
    { region:"Dubai",        tz:"Asia/Dubai",             flag:"🇦🇪" },
    { region:"Mumbai",       tz:"Asia/Kolkata",           flag:"🇮🇳" },
    { region:"Singapore",    tz:"Asia/Singapore",         flag:"🇸🇬" },
    { region:"Sydney",       tz:"Australia/Sydney",       flag:"🇦🇺" },
    { region:"Tokyo",        tz:"Asia/Tokyo",             flag:"🇯🇵" },
    { region:"New York",     tz:"America/New_York",       flag:"🇺🇸" },
    { region:"Los Angeles",  tz:"America/Los_Angeles",    flag:"🇺🇸" },
    { region:"Toronto",      tz:"America/Toronto",        flag:"🇨🇦" },
    { region:"São Paulo",    tz:"America/Sao_Paulo",      flag:"🇧🇷" },
    { region:"Paris",        tz:"Europe/Paris",           flag:"🇫🇷" },
    { region:"Frankfurt",    tz:"Europe/Berlin",          flag:"🇩🇪" },
    { region:"Warsaw",       tz:"Europe/Warsaw",          flag:"🇵🇱" },
    { region:"Riyadh",       tz:"Asia/Riyadh",            flag:"🇸🇦" },
    { region:"Cairo",        tz:"Africa/Cairo",           flag:"🇪🇬" },
    { region:"Lagos",        tz:"Africa/Lagos",           flag:"🇳🇬" },
    { region:"Johannesburg", tz:"Africa/Johannesburg",    flag:"🇿🇦" },
    { region:"Istanbul",     tz:"Europe/Istanbul",        flag:"🇹🇷" },
    { region:"Jakarta",      tz:"Asia/Jakarta",           flag:"🇮🇩" },
    { region:"Manila",       tz:"Asia/Manila",            flag:"🇵🇭" },
  ];
  return zones.map(z => {
    try {
      const now = new Date();
      const time = now.toLocaleTimeString("en-GB", { timeZone: z.tz, hour: "2-digit", minute: "2-digit" });
      const hour = parseInt(now.toLocaleString("en-GB", { timeZone: z.tz, hour: "2-digit", hour12: false }));
      const day  = now.toLocaleDateString("en-GB", { timeZone: z.tz, weekday: "short" });
      const business = hour >= 9 && hour < 18;
      const early    = hour >= 7 && hour < 9;
      const late     = hour >= 18 && hour < 21;
      const status   = business ? "business" : early ? "early" : late ? "evening" : "off";
      return { ...z, time, day, hour, business_status: status };
    } catch {
      return { ...z, time: "--:--", day: "---", hour: 0, business_status: "unknown" };
    }
  });
}
