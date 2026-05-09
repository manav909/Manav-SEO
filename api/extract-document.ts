import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { content, fileName, docType, projectContext = "" } = req.body;
  if (!content) return res.status(400).json({ error: "No content provided" });

  const anthropic = new Anthropic();

  const prompt = `You are an expert SEO data analyst. Extract every piece of SEO-relevant data from this document.
The document is: ${fileName || "unknown"} (type: ${docType || "unknown"})
Project context: ${projectContext || "Not provided"}

DOCUMENT CONTENT:
${String(content).slice(0, 15000)}

Extract ALL useful data and return ONLY valid JSON:
{
  "doc_summary": "2-sentence description of what this document contains and its date range",
  "data_quality": "high|medium|low",
  "date_range": "e.g. Jan 2024 - Mar 2024 or null",
  "extracted": {
    "keywords": [{"keyword":"...","position":null,"impressions":null,"clicks":null,"ctr":null,"url":null}],
    "pages": [{"url":"...","status_code":null,"title":null,"meta_desc":null,"h1":null,"word_count":null,"issues":[]}],
    "backlinks": [{"source_url":"...","target_url":"...","anchor_text":"...","dr":null,"type":"dofollow|nofollow"}],
    "technical_issues": [{"issue":"...","severity":"critical|high|medium|low","count":null,"affected_urls":[]}],
    "metrics": {
      "total_pages": null,
      "indexed_pages": null,
      "total_keywords": null,
      "avg_position": null,
      "total_impressions": null,
      "total_clicks": null,
      "organic_traffic": null,
      "domain_rating": null,
      "referring_domains": null
    },
    "cms_detected": null,
    "site_speed": {"lcp":null,"cls":null,"fid":null,"ttfb":null},
    "competitors_mentioned": [],
    "top_pages": [{"url":"...","metric":"...","value":null}],
    "content_gaps": [],
    "action_items": [{"priority":"critical|high|medium|low","action":"...","evidence":"..."}]
  },
  "knowledge_fields": [
    {"category":"technical|analytics|competitor|content|cms","key":"field_name","value":"field_value","notes":"why this matters"}
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw   = response.content[0].type === "text" ? response.content[0].text : "{}";
    const first = raw.indexOf("{");
    const last  = raw.lastIndexOf("}");
    let parsed: any = {};
    try { parsed = JSON.parse(raw.slice(first, last + 1)); } catch {}

    return res.status(200).json({ success: true, extracted: parsed });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
