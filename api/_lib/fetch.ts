/* ═══════════════════════════════════════════════════════════
   Shared URL fetch utilities.
   Used by: api/crawl.ts, api/_lib/audit-orchestrator.ts

   Never duplicate these functions in individual API routes.
═══════════════════════════════════════════════════════════ */

const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const GBOT_UA   = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

export interface FetchResult {
  html:       string;
  status:     number;
  strategy:   string;
  chars:      number;
  error?:     string;
  allFailed?: boolean;
}

export function cleanHtml(html: string, maxChars = 12000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxChars);
}

export function parseJson(text: string): any | null {
  const clean = text
    .replace(/^```[a-z]*\n?/gm, "")
    .replace(/^```\s*$/gm, "")
    .trim();
  const f = clean.indexOf("{");
  const l = clean.lastIndexOf("}");
  if (f < 0 || l < 0) return null;
  try { return JSON.parse(clean.slice(f, l + 1)); } catch (_e) {}
  try { return JSON.parse(clean.slice(f) + '"}]}'); } catch (_e) {}
  try { return JSON.parse(clean.slice(f) + '"}'); }  catch (_e) {}
  try { return JSON.parse(clean.slice(f) + '}');   } catch (_e) {}
  return null;
}

async function tryFetch(url: string, ua: string, name: string, ms: number): Promise<FetchResult | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal, redirect: "follow",
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text/")) return null;
    const text = await r.text();
    if (!text || text.trim().length < 200) return null;
    if (
      text.includes("cf-browser-verification") ||
      text.includes("Just a moment...") ||
      text.includes("Checking your browser before accessing") ||
      (text.includes("Enable JavaScript") && text.length < 3000)
    ) return null;
    const c = cleanHtml(text);
    return { html: c, status: r.status, strategy: name, chars: c.length };
  } catch (_e) { clearTimeout(t); return null; }
}

async function tryJina(url: string): Promise<FetchResult | null> {
  const key = process.env.JINA_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      signal: ctrl.signal,
      headers: {
        "Authorization": `Bearer ${key}`,
        "Accept": "text/plain",
        "X-Return-Format": "text",
        "X-Timeout": "12",
      },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const text = await r.text();
    if (!text || text.trim().length < 100) return null;
    return { html: text.slice(0, 12000), status: 200, strategy: "jina", chars: text.length };
  } catch (_e) { clearTimeout(t); return null; }
}

async function tryGoogleCache(url: string): Promise<FetchResult | null> {
  return tryFetch(
    `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}&hl=en`,
    CHROME_UA, "google-cache", 10000
  );
}

export async function fetchUrl(url: string): Promise<FetchResult> {
  const s1 = await tryFetch(url, CHROME_UA, "chrome", 8000);
  if (s1) return s1;
  await new Promise(r => setTimeout(r, 300));
  const s2 = await tryFetch(url, GBOT_UA, "googlebot", 8000);
  if (s2) return s2;
  const s3 = await tryJina(url);
  if (s3) return s3;
  await new Promise(r => setTimeout(r, 300));
  const s4 = await tryGoogleCache(url);
  if (s4) return s4;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": CHROME_UA } });
    clearTimeout(t);
    const code = r.status;
    return {
      html: "", status: code, strategy: "failed", chars: 0, allFailed: true,
      error: code === 403 ? "Blocked (403). Add JINA_API_KEY env var to bypass." :
             code === 429 ? "Rate limited (429)" :
             code === 503 ? "Server unavailable (503)" : `HTTP ${code}`,
    };
  } catch (e: any) {
    clearTimeout(t);
    const m = String(e.message || "");
    return {
      html: "", status: 0, strategy: "failed", chars: 0, allFailed: true,
      error: m.includes("abort")      ? "Timeout — page too slow (>8s)" :
             m.includes("ENOTFOUND")  ? "Domain not found" :
             m.includes("ECONNRESET") ? "Connection reset" : m.slice(0, 80) || "Unknown error",
    };
  }
}
