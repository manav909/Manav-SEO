import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type DeliverableType = "Technical" | "On-Page" | "Off-Page" | "GEO";

interface RequestBody {
  url: string;
  keyword: string;
  deliverableType: DeliverableType;
}

interface SEOData {
  title: string;
  metaDescription: string;
  h1Tags: string[];
  h2Tags: string[];
  imageCount: number;
  imagesWithoutAlt: number;
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  loadTime?: number;
  mobileViewport: boolean;
  canonicalTag: string | null;
  robots: string | null;
  jsonLd: string[];
  og: Record<string, string>;
  twitterCard: Record<string, string>;
  structuredData: boolean;
}

const SYSTEM_PROMPTS: Record<DeliverableType, string> = {
  Technical: `You are a Senior Technical SEO Specialist with expertise in:\n- Core Web Vitals and page performance\n- Site architecture and crawlability\n- Technical implementation and structured data\n- Mobile optimization and responsive design\n- Security (HTTPS, SSL certificates)\n- Server response times and caching strategies\n\nAnalyze the provided website data and identify specific technical issues, provide actionable recommendations, and prioritize fixes by impact.`,

  "On-Page": `You are a Senior On-Page SEO Content Strategist specializing in:\n- Keyword optimization and semantic relevance\n- Meta tags (title, description) optimization\n- Header structure and content hierarchy\n- Content quality and keyword density\n- Internal linking strategy\n- User engagement signals\n\nProvide specific recommendations for improving on-page elements, content structure, and keyword targeting based on the actual website content provided.`,

  "Off-Page": `You are a Senior Off-Page SEO & Link Building Strategist with expertise in:\n- Backlink profile analysis\n- Domain authority and trust signals\n- Brand mentions and PR opportunities\n- Content marketing strategy\n- Link building opportunities\n- Competitor analysis\n\nAnalyze the website's visibility and suggest off-page optimization strategies, link building opportunities, and content distribution channels.`,

  GEO: `You are a Generative Engine Optimization (GEO) Specialist focused on:\n- AI search engine optimization (Perplexity, Google SGE, ChatGPT)\n- Citation generation and answer engine visibility\n- Knowledge panel optimization\n- AI-friendly content structure\n- Featured snippet optimization\n- Conversational query targeting\n\nProvide recommendations to optimize the website for AI search engines and answer engines.`,
};

// ─────────────────────────────────────────────
// Parses HTML and extracts SEO data
// ─────────────────────────────────────────────
function parseHTMLForSEO(html: string, url: string): SEOData {
  // Simple HTML tag extraction using regex
  const getTagContent = (tag: string): string[] => {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/ ${tag}>`, "gi");
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const content = match[1].trim().slice(0, 200);
      if (content) matches.push(content);
    }
    return matches;
  };

  const getMetaAttribute = (name: string): string | null => {
    const regex = new RegExp(
      `<meta\s+(?:name|property)= ["\']${name}["\']\s+ content = ["\']([^"\']*)["\']`,
      "i"
    );
    const match = html.match(regex);
    return match ? match[1] : null;
  };

  const getMetaAttributes = (prefix: string): Record<string, string> => {
    const regex = new RegExp(
      `<meta\s+(?:name|property)= ["\']${prefix}[^"\']*["\']\s+ content = ["\']([^"\']*)["\']`,
      "gi"
    );
    const result: Record<string, string> = {};
    let match;
    while ((match = regex.exec(html)) !== null) {
      const propertyMatch = html.substring(
        Math.max(0, match.index - 50),
        match.index + 100
      );
      const propName =
        propertyMatch.match(/(?:name|property) = ["']([^"']*)/)?.[1] || prefix;
      result[propName] = match[1];
    }
    return result;
  };

  const getCanonical = (): string | null => {
    const regex = /<link\s+rel=["\']canonical["\'][^>]*href=["\']([^"\']*)["\']/i;
    const match = html.match(regex);
    return match ? match[1] : null;
  };

  const countImages = (): { total: number; withoutAlt: number } => {
    const imgRegex = /<img[^>]*>/gi;
    const matches = html.match(imgRegex) || [];
    const withoutAlt = matches.filter((img) => !/alt\s*= /i.test(img)).length;
    return { total: matches.length, withoutAlt };
  };

  const countLinks = (): { internal: number; external: number } => {
    const linkRegex = /<a\s+href=["\']([^"\']*)["\'][^>]*>/gi;
    let match;
    let internal = 0;
    let external = 0;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href.startsWith("http") || href.includes(new URL(url).hostname)) {
        internal++;
      } else if (href.startsWith("http")) {
        external++;
      }
    }

    return { internal, external };
  };

  const getWordCount = (): number => {
    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleanText.split(/\s+/).length;
  };

  const getMobileViewport = (): boolean => {
    return /<meta\s+name=["\']viewport["\']/.test(html);
  };

  const getStructuredData = (): string[] => {
    const scriptRegex = /<script[^>]*type=["\']application\/ld\+json["\'][^>]*>([^<]*)<\/script>/gi;
    const data: string[] = [];
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      data.push(match[1].trim());
    }
    return data;
  };

  const images = countImages();
  const links = countLinks();

  return {
    title: getTagContent("title")[0] || "No title found",
    metaDescription: getMetaAttribute("description") || "No meta description",
    h1Tags: getTagContent("h1"),
    h2Tags: getTagContent("h2"),
    imageCount: images.total,
    imagesWithoutAlt: images.withoutAlt,
    internalLinks: links.internal,
    externalLinks: links.external,
    wordCount: getWordCount(),
    mobileViewport: getMobileViewport(),
    canonicalTag: getCanonical(),
    robots: getMetaAttribute("robots"),
    jsonLd: getStructuredData(),
    og: getMetaAttributes("og:"),
    twitterCard: getMetaAttributes("twitter:"),
    structuredData: getStructuredData().length > 0,
  };
}

// ─────────────────────────────────────────────
// Fetches the real website content with timing
// ─────────────────────────────────────────────
async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;

    // Jina AI Reader fully renders JavaScript websites before reading them
    const jinaUrl = `https://r.jina.ai/${fullUrl}`;

    const response = await fetch(jinaUrl, {
      headers: {
        "Accept": "text/plain",
        "X-Return-Format": "markdown",
        "X-Timeout": "30",
      },
      signal: AbortSignal.timeout(35000),
    });

    if (!response.ok) {
      return `Could not fetch website. Status: ${response.status}`;
    }

    const text = await response.text();

    if (!text || text.trim().length < 100) {
      return `Website content appears empty or too short to analyze.`;
    }

    // Limit to 15,000 characters to stay within token limits
    return text.trim().slice(0, 15000);

  } catch (err) {
    return `Could not fetch website: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

// ─────────────────────────────────────────────
// Formats SEO data for the prompt
// ─────────────────────────────────────────────
function formatSEODataForPrompt(seoData: SEOData, url: string): string {
  return `\n=== REAL-TIME WEBSITE DATA CRAWLED ===\nURL: ${url}\nCrawl Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n\n📌 BASIC METADATA:\n- Page Title: "${seoData.title}"\n- Meta Description: "${seoData.metaDescription}"\n- Canonical Tag: ${seoData.canonicalTag || "Not found"}\n- Robots Meta: ${seoData.robots || "Not specified"}\n\n📊 CONTENT STRUCTURE:\n- Total Words: ${seoData.wordCount}\n- H1 Tags: ${seoData.h1Tags.length} found\n  ${seoData.h1Tags.map((h1) => `  • "${h1}"`).join("\n")}\n- H2 Tags: ${seoData.h2Tags.length} found\n  ${seoData.h2Tags.slice(0, 5).map((h2) => `  • "${h2}"`).join("\n")}\n\n🖼️  IMAGES:\n- Total Images: ${seoData.imageCount}\n- Images Missing ALT Text: ${seoData.imagesWithoutAlt}\n\n🔗 LINKS:\n- Internal Links: ${seoData.internalLinks}\n- External Links: ${seoData.externalLinks}\n\n⚙️  TECHNICAL:\n- Mobile Viewport Meta Tag: ${seoData.mobileViewport ? "✅ Present" : "❌ Missing"}\n- Structured Data (JSON-LD): ${seoData.structuredData ? "✅ Present" : "❌ Missing"}\n- Load Time: ${seoData.loadTime}ms\n\n📱 OPEN GRAPH (Social Sharing):\n$ {
  Object.keys(seoData.og).length > 0
    ? Object.entries(seoData.og)
        .map(([key, value]) => `  • ${key}: "${value}"`)
        .join("\n")
    : "  • Not configured"
}\n\n🐦 TWITTER CARD:\n$ {
  Object.keys(seoData.twitterCard).length > 0
    ? Object.entries(seoData.twitterCard)
        .map(([key, value]) => `  • ${key}: "${value}"`)
        .join("\n")
    : "  • Not configured"
}\n\n=== END CRAWLED DATA ===`;
}

// ─────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { url, keyword, deliverableType } = req.body as RequestBody;

  if (!url || !keyword || !deliverableType) {
    return res.status(400).json({
      error: "Missing required fields: url, keyword, deliverableType",
    });
  }

  if (!SYSTEM_PROMPTS[deliverableType]) {
    return res.status(400).json({
      error: "Invalid deliverableType. Use: Technical, On-Page, Off-Page, or GEO",
    });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);
  
  try {
    // Fetch the REAL website content
    res.write("[CRAWLING] Fetching website content...\n");
    const { html, loadTime } = await fetchWebsiteContent(url);

    // Parse HTML and extract SEO data
    res.write("[PARSING] Extracting SEO data...\n");
    const seoData: SEOData = parseHTMLForSEO(html, url);
    seoData.loadTime = loadTime;

    // Format data for Claude
    const seoDataPrompt = formatSEODataForPrompt(seoData, url);

    res.write("[ANALYZING] Streaming AI analysis...\n\n");
    res.write("═".repeat(80) + "\n");

    const userMessage = `${seoDataPrompt}\n\nTarget Focus Keyword: "${keyword}"\n\nBased on the REAL website data crawled above, perform a comprehensive ${deliverableType} SEO analysis:\n\n✅ DO:\n- Analyze ONLY the real data shown above\n- Quote specific findings from the crawled data\n- Provide actionable, specific recommendations\n- Prioritize issues by impact and effort\n- Give concrete examples from the website\n\n❌ DON'T:\n- Make assumptions about data not shown\n- Suggest changes based on guesses\n- Reference outdated best practices without context\n- Ignore the actual numbers and metrics provided\n\nFormat your response with:\n1. Executive Summary (key findings)\n2. Detailed Analysis (by category)\n3. Actionable Recommendations (prioritized)\n4. Quick Wins (easy to implement)\n5. Resources & Tools (relevant links)\n    `.trim();

    const client = new Anthropic();

    const anthropicStream = await client.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 8096,
      system: SYSTEM_PROMPTS[deliverableType],
      messages: [{ role: "user", content: userMessage }],
    });

    for await (const chunk of anthropicStream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        res.write(chunk.delta.text);
      }
    }

    res.write("\n" + "═".repeat(80) + "\n");
    res.write(
      `\n[COMPLETE] Analysis finished at ${new Date().toISOString()}\n`
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred.";
    res.write(
      `\n\n[ERROR] ${message}\n\nPlease verify the URL is correct and accessible.`
    );
  } finally {
    res.end();
  }
}
