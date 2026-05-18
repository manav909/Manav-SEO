import { db } from "./db";

export const ROLE_PERMISSIONS: Record<string, any> = {
  hod: {
    can_see_all_staff: true, can_toggle_permissions: true, can_see_financials: true,
    can_manage_staff: true, can_see_all_leads: true, can_see_all_projects: true,
    can_access_brain: true, can_generate_reports: true, can_manage_templates: true,
    can_see_analytics: true, panels: ["all"],
  },
  sales_manager: {
    can_see_all_staff: true, can_toggle_permissions: false, can_see_financials: true,
    can_manage_staff: false, can_see_all_leads: true, can_see_all_projects: false,
    can_access_brain: true, can_generate_reports: true, can_manage_templates: true,
    can_see_analytics: true, panels: ["pipeline","team","leads","reports"],
  },
  bdm: {
    can_see_all_staff: false, can_toggle_permissions: false, can_see_financials: false,
    can_manage_staff: false, can_see_all_leads: false, can_see_all_projects: false,
    can_access_brain: true, can_generate_reports: false, can_manage_templates: true,
    can_see_analytics: false, panels: ["team","leads","tools","comms"],
  },
  bde: {
    can_see_all_staff: false, can_toggle_permissions: false, can_see_financials: false,
    can_manage_staff: false, can_see_all_leads: false, can_see_all_projects: false,
    can_access_brain: false, can_generate_reports: false, can_manage_templates: false,
    can_see_analytics: false, panels: ["leads","tools","comms","showcase"],
  },
  pm: {
    can_see_all_staff: false, can_toggle_permissions: false, can_see_financials: false,
    can_manage_staff: false, can_see_all_leads: false, can_see_all_projects: true,
    can_access_brain: true, can_generate_reports: true, can_manage_templates: false,
    can_see_analytics: false, panels: ["projects","tasks","reports","brain"],
  },
};

export async function getStaffWithStats() {
  const { data: staff } = await db().from("staff_members").select("*").eq("is_active", true).order("role");
  if (!staff?.length) return [];

  // Enrich with live stats
  const enriched = await Promise.all(staff.map(async (s: any) => {
    const [assignR, actR] = await Promise.allSettled([
      db().from("lead_assignments").select("stage,conversion_probability,deal_value")
        .eq("assigned_to", s.id),
      db().from("staff_activity").select("id").eq("staff_id", s.id)
        .gte("created_at", new Date(Date.now() - 7*864e5).toISOString()),
    ]);
    const assigns = assignR.status === "fulfilled" ? assignR.value.data || [] : [];
    const activity = actR.status === "fulfilled" ? actR.value.data || [] : [];
    const won = assigns.filter((a: any) => a.stage === "won").length;
    const total = assigns.length;
    return {
      ...s,
      live_stats: {
        total_leads: total, won_leads: won,
        conversion_rate: total ? Math.round(won/total*100) : 0,
        active_pipeline: assigns.filter((a: any) => !["won","lost"].includes(a.stage)).length,
        pipeline_value: assigns.reduce((s: number, a: any) => s + (a.deal_value || 0), 0),
        activity_this_week: activity.length,
      },
    };
  }));
  return enriched;
}

export async function analyseFiverrConversation(text: string, staffId?: string) {
  // Parse line by line - detect who is speaking
  const lines = text.split("\n").filter(l => l.trim().length > 2);
  const parsed = lines.map(line => {
    const clientIndicators = /^(client|buyer|them|he|she|they|[A-Z][a-z]+:|"[^"]+":)/i;
    const agencyIndicators = /^(me|i |us|we|seller|you|agency|seoseason)/i;
    const isClient = clientIndicators.test(line.trim()) || !agencyIndicators.test(line.trim().split(" ")[0]);
    return { text: line.trim(), speaker: isClient ? "client" : "agency", length: line.trim().length };
  });

  const clientLines = parsed.filter(l => l.speaker === "client").map(l => l.text).join("\n");
  const agencyLines = parsed.filter(l => l.speaker === "agency").map(l => l.text).join("\n");

  const prompt = `You are an expert Fiverr and freelance business development analyst.
Analyse this conversation between a potential client and an SEO agency.

FULL CONVERSATION:
${text.slice(0, 3000)}

CLIENT MESSAGES:
${clientLines.slice(0, 1500)}

Return JSON only:
{
  "conversation_type": "lead_enquiry|project_update_request|complaint|price_negotiation|scope_expansion|technical_question|review_request|repeat_client",
  "client_level": "beginner|intermediate|experienced|enterprise",
  "budget_signal": "budget_conscious|value_focused|quality_first|budget_unknown",
  "urgency": "browsing|considering|ready_to_buy|urgent",
  "technical_knowledge": "none|basic|intermediate|advanced",
  "main_need": "what they actually need in one sentence",
  "hidden_concern": "what they're worried about but not saying",
  "fiverr_specific": {
    "likely_gig_type": "which type of SEO gig they'd order",
    "order_probability": 0-100,
    "price_range_expectation": "budget estimate",
    "review_history": "experienced_buyer|new_buyer|returning",
    "conversion_blocker": "main thing stopping them from ordering"
  },
  "line_by_line": [
    {
      "line": "exact quote from client",
      "intent": "what they mean",
      "emotion": "curious|worried|interested|frustrated|excited|testing|skeptical",
      "response_needed": true/false,
      "suggested_reply": "ideal short reply to this specific line"
    }
  ],
  "best_next_message": "Complete ideal response to send right now — professional, conversion-focused, builds trust",
  "demo_to_show": ["what proof/demo would most help right now"],
  "quick_wins_to_mention": ["specific technical insight to mention"],
  "closing_move": "How to move toward order/hire"
}`;

  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  const aj = await ai.json() as any;
  let analysis: any = {};
  try { analysis = JSON.parse((aj?.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim()); }
  catch {}

  // Save thread
  const { data: saved } = await db().from("conversation_threads").insert({
    staff_id: staffId || null,
    channel: "fiverr",
    raw_text: text.slice(0, 5000),
    parsed_lines: parsed,
    analysis,
  }).select().single();

  // Log activity
  if (staffId) {
    await db().from("staff_activity").insert({
      staff_id: staffId,
      activity_type: "conversation_analysed",
      description: `Analysed ${parsed.length}-line Fiverr conversation`,
      metadata: { conv_type: analysis.conversation_type, order_probability: analysis.fiverr_specific?.order_probability },
    }).then(() => {}).catch(() => {});
  }

  return { id: saved?.id, analysis, parsed_lines: parsed };
}

export async function generateInstantAuditShowcase(url: string, forLead: string = "") {
  let siteData: any = {};
  try {
    const res = await fetch(`https://${url.replace(/^https?:\/\//, "").split("/")[0]}`, {
      headers: { "User-Agent": "Mozilla/5.0 SEOSeason-Audit/2.0" },
      signal: AbortSignal.timeout(10000),
    });
    const html = (await res.text()).slice(0, 8000);
    siteData = {
      title: (html.match(/<title>([^<]+)/) || [])[1]?.trim() || "Not found",
      hasMetaDesc: /meta name="description"/i.test(html),
      hasH1: /<h1[^>]*>[^<]{5,}/.test(html),
      hasSchema: /ld\+json/.test(html),
      hasOG: /og:title/.test(html),
      hasCanonical: /rel="canonical"/.test(html),
      hasViewport: /name="viewport"/.test(html),
      imgCount: (html.match(/<img/g) || []).length,
      linksCount: (html.match(/<a /g) || []).length,
      wordCount: html.replace(/<[^>]+>/g, " ").split(/\s+/).length,
    };
  } catch (e: any) { siteData.error = e.message; }

  const issues = [
    !siteData.hasMetaDesc && { issue: "Missing meta description", impact: "HIGH", fix: "Add unique 150-160 char meta description targeting primary keyword" },
    !siteData.hasH1 && { issue: "No H1 heading found", impact: "HIGH", fix: "Add single H1 with primary keyword at natural density" },
    !siteData.hasSchema && { issue: "No structured data", impact: "MEDIUM", fix: "Implement JSON-LD schema — Organization, WebPage minimum" },
    !siteData.hasOG && { issue: "Missing Open Graph tags", impact: "MEDIUM", fix: "Add og:title, og:description, og:image for social sharing" },
    !siteData.hasCanonical && { issue: "No canonical tag", impact: "MEDIUM", fix: "Add self-referencing canonical to prevent duplicate content issues" },
    siteData.imgCount > 20 && { issue: `${siteData.imgCount} images found — check alt tags`, impact: "MEDIUM", fix: "Audit all images for descriptive alt attributes with keywords" },
  ].filter(Boolean);

  const score = Math.max(0, 100 - issues.length * 12);

  const prompt = `You are presenting an instant SEO audit to a Fiverr prospect.

Site: ${url}
What we found:
- Title: ${siteData.title || "Not found"}
- Issues: ${issues.map((i: any) => i.issue).join(", ") || "none found"}
- Score: ${score}/100
- Words: ${siteData.wordCount}
- Links: ${siteData.linksCount}
${forLead ? `\nTheir context: ${forLead}` : ""}

Write a compelling technical audit message (for Fiverr chat or WhatsApp) that:
1. Shows immediate technical expertise
2. Lists 3-5 specific findings (use the real data above)
3. Explains the business impact of each issue
4. Positions us as the solution
5. Ends with a clear next step

Keep it under 300 words. Professional but conversational. Show you've actually looked at their site.`;

  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
  });
  const aj = await ai.json() as any;
  const message = aj?.content?.[0]?.text || "";

  return { url, score, issues, siteData, showcase_message: message };
}

export async function getPipelineOverview(staffId?: string, role?: string) {
  let q = db().from("lead_assignments").select(`
    *,
    prospects(name,email,company,url,lead_score,market),
    staff_members!lead_assignments_assigned_to_fkey(name,role)
  `);
  if (staffId && role !== "hod" && role !== "sales_manager") {
    q = q.eq("assigned_to", staffId);
  }
  const { data: assignments } = await q.order("updated_at", { ascending: false }).limit(100);

  const pipeline = {
    total: assignments?.length || 0,
    by_stage: {} as Record<string, number>,
    by_priority: {} as Record<string, number>,
    total_value: 0,
    hot_leads: [] as any[],
    stalling: [] as any[],
    won_this_week: [] as any[],
  };

  for (const a of assignments || []) {
    pipeline.by_stage[a.stage] = (pipeline.by_stage[a.stage] || 0) + 1;
    pipeline.by_priority[a.priority] = (pipeline.by_priority[a.priority] || 0) + 1;
    pipeline.total_value += a.deal_value || 0;
    if (a.priority === "hot") pipeline.hot_leads.push(a);
    const lastContact = a.last_contact ? new Date(a.last_contact) : null;
    if (lastContact && Date.now() - lastContact.getTime() > 3 * 864e5 && !["won","lost"].includes(a.stage)) {
      pipeline.stalling.push(a);
    }
    if (a.won_at && new Date(a.won_at) > new Date(Date.now() - 7*864e5)) {
      pipeline.won_this_week.push(a);
    }
  }

  return { pipeline, assignments: assignments || [] };
}
