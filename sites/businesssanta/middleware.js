/* AI and search crawler logger for businesssanta.com.
   Runs before each page request (not assets or APIs), notes known crawlers by user agent, and lets the request
   continue untouched: crawlers are never blocked or slowed.
   - Always: one line in Vercel's logs ("AI_BOT <bot> <path>").
   - With Upstash Redis connected to this project (Vercel > Storage, free tier): daily counts per bot and page for
     90 days, plus the last 200 visits, shown at /api/ai-bots. */
export const config = { matcher: ["/((?!assets/|api/|_vercel/|favicon|apple-touch-icon).*)"] };

/* user-agent token, label. Order matters: the more specific token first. */
export const BOTS = [
  ["OAI-SearchBot", "ChatGPT search"],
  ["ChatGPT-User", "ChatGPT (user asked)"],
  ["GPTBot", "OpenAI GPTBot (training)"],
  ["Claude-SearchBot", "Claude search"],
  ["Claude-User", "Claude (user asked)"],
  ["ClaudeBot", "Anthropic ClaudeBot (training)"],
  ["Perplexity-User", "Perplexity (user asked)"],
  ["PerplexityBot", "Perplexity search"],
  ["Google-CloudVertexBot", "Google Vertex AI"],
  ["Googlebot", "Googlebot"],
  ["bingbot", "Bingbot (also feeds ChatGPT and Copilot)"],
  ["DuckAssistBot", "DuckDuckGo AI"],
  ["meta-externalagent", "Meta AI"],
  ["Applebot", "Applebot (Siri, Apple Intelligence)"],
  ["Amazonbot", "Amazon (Alexa)"],
  ["MistralAI-User", "Mistral Le Chat"],
  ["YouBot", "You.com"],
  ["CCBot", "Common Crawl (feeds many AI models)"],
  ["Bytespider", "ByteDance (Doubao)"],
];

export function detect(ua) {
  const u = (ua || "").toLowerCase();
  return BOTS.find(([k]) => u.includes(k.toLowerCase())) || null;
}

export default function middleware(request, context) {
  const hit = detect(request.headers.get("user-agent"));
  if (!hit) return; /* not a crawler: carry on as normal */
  const url = new URL(request.url), now = new Date(), day = now.toISOString().slice(0, 10);
  const path = url.pathname.slice(0, 200);
  console.log("AI_BOT", hit[0], path);
  const R = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const T = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!R || !T) return;
  const key = "aibots:" + day;
  const save = fetch(R.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + T, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["HINCRBY", key, hit[0] + " " + path, 1],
      ["EXPIRE", key, 7776000],
      ["LPUSH", "aibots:recent", JSON.stringify({ t: now.toISOString(), bot: hit[0], path })],
      ["LTRIM", "aibots:recent", 0, 199],
    ]),
  }).catch(() => {});
  if (context && typeof context.waitUntil === "function") context.waitUntil(save);
}
