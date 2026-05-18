import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

function db(): any {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
  );
}

export async function analyseFiverrConversation(text: string, staffId?: string): Promise<any> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: "Analyse this Fiverr conversation. Return ONLY valid JSON with these exact fields:\n" +
        "{\n" +
        "  \"main_need\": \"what the client actually wants in one sentence\",\n" +
        "  \"urgency\": \"high or medium or low\",\n" +
        "  \"hidden_concern\": \"what they haven't said but are worried about\",\n" +
        "  \"best_next_message\": \"the best reply to send right now\",\n" +
        "  \"demo_to_show\": [\"specific things to show them\"],\n" +
        "  \"quick_wins_to_mention\": [\"easy wins to mention\"],\n" +
        "  \"fiverr_specific\": {\n" +
        "    \"order_probability\": 70,\n" +
        "    \"conversion_blocker\": \"main thing stopping them ordering\"\n" +
        "  }\n" +
        "}\n\n" +
        "Return JSON only, no markdown, no explanation.\n\nConversation:\n" + text
    }]
  });

  const raw = (resp.content[0] as any).text || "{}";
  const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
  let analysis: any = {};
  try {
    analysis = JSON.parse(cleaned);
  } catch {
    analysis = {
      main_need: raw.slice(0, 200),
      urgency: "medium",
      hidden_concern: "Unable to determine from conversation",
      best_next_message: "Thank you for reaching out! I would love to help with your SEO needs. Could you tell me more about your main goal?",
      demo_to_show: [],
      quick_wins_to_mention: [],
      fiverr_specific: { order_probability: 50, conversion_blocker: "Need more information" }
    };
  }

  const parsed_lines = text.split("\n")
    .filter((line: string) => line.trim())
    .map((line: string) => ({
      text: line.replace(/^(client:|me:|you:|buyer:)/i, "").trim(),
      speaker: /^(client:|buyer:)/i.test(line.trim()) ? "client" : "me",
      intent: /^(client:|buyer:)/i.test(line.trim()) ? "inquiry" : undefined,
    }));

  return { analysis, parsed_lines };
}

export async function generateInstantAuditShowcase(url: string, forLead?: string): Promise<any> {
  const urlClean = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  let score = 50;
  const issues: string[] = [];

  try {
    const response = await fetch("https://" + urlClean, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = (await response.text()).slice(0, 8000);

    if (!/<title>[^<]{10,}/i.test(html)) issues.push("Missing title tag — hurting click-through rates");
    if (!/meta[^>]+name=.description./i.test(html)) issues.push("Missing meta description — Google writes its own (badly)");
    if (!/<h1[^>]*>[^<]{5,}/i.test(html)) issues.push("No H1 tag — primary keyword signal missing");
    if (!/application\/ld\+json/.test(html)) issues.push("No structured data — invisible to AI search engines");
    if (!/canonical/i.test(html)) issues.push("No canonical tag — duplicate content risk");

    score = Math.max(20, 100 - issues.length * 15);
  } catch {
    issues.push("Could not fetch site — may be blocking bots or loading slowly");
    score = 40;
  }

  const headline = issues.length > 0
    ? "Found " + issues.length + " critical issue" + (issues.length > 1 ? "s" : "") + " on " + urlClean + " hurting your rankings."
    : urlClean + " has solid technical foundations. Let's look deeper at content and authority.";

  const issueList = issues.map((iss: string, n: number) => (n + 1) + ". " + iss).join("\n");
  const showcase_message = "Hi! I ran a quick audit on " + urlClean + " and found " + issues.length + " immediate fixes:\n\n" +
    issueList + "\n\n" + headline + "\n\n" +
    "I specialise in fixing exactly these issues. Want a full audit with a prioritised action plan? I can show you the impact each fix will have on your rankings.";

  return { url: urlClean, score, issues, headline, showcase_message };
}

export async function getPipelineOverview(staffId?: string, role?: string): Promise<any> {
  const query = db()
    .from("lead_assignments")
    .select("*, prospects(*)");

  if (staffId) query.eq("assigned_to", staffId);

  const { data: assignments } = await query
    .order("updated_at", { ascending: false })
    .limit(30);

  return { assignments: assignments || [] };
}
