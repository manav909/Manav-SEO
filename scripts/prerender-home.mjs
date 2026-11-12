// Runs after `vite build` (npm "postbuild").
// 1. Keeps the plain app shell as dist/app.html: every app route (dashboard, client portal...) is served from it.
// 2. Puts a readable HTML copy of the home page inside #root of dist/index.html, which only "/" serves.
//    Search engines and AI assistants that don't run JavaScript then read the real home page text.
//    React's createRoot replaces it the moment the app starts, so people see the normal page.
// Keep the text below in step with src/pages/Index.tsx.
import { readFileSync, writeFileSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");
writeFileSync(new URL("app.html", dist), html);

const get = [
  ["AI Search Visibility", "Your brand cited in ChatGPT, Perplexity, and Google AI Overviews. Buyers who ask AI find you."],
  ["Live Keyword Rankings", "Every ranking verified with live Google SERP checks, not cached data from 3 months ago."],
  ["Validation-First Strategy", "Every tactic tested in a controlled sprint before we invest in it. Your budget is protected."],
  ["Competitive Intelligence", "Live competitive positioning. You see exactly where you rank against every named competitor."],
  ["E-E-A-T Authority Building", "Google's trust signals built systematically: experience, expertise, authoritativeness, trust."],
  ["Executive Strategy Launchpad", "A premium portal showing your campaign phase, value realised, and accelerator opportunities."],
];
const steps = [
  ["Validation Audit", "I crawl your site and competitors live. Every score is verified, not estimated. You see reality on day one."],
  ["Architecture Sprint", "Based on verified gaps, I build a targeted content and technical strategy. Nothing is launched without testing."],
  ["Authority Build", "Link signals, E-E-A-T improvements, AI citation strategy, all tracked in your live dashboard weekly."],
  ["Compounding Growth", "Month over month, your authority compounds. Competitors plateau. Your rankings grow without paid ads."],
];

const snapshot = `<div class="pre-home">
<style>.pre-home{max-width:1080px;margin:0 auto;padding:28px 24px 60px;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:rgba(255,255,255,.72);background:#04040d}
.pre-home h1,.pre-home h2,.pre-home h3{color:#fff;line-height:1.15}.pre-home h1{font-size:clamp(2rem,4.5vw,3.3rem);margin:28px 0 14px}.pre-home h2{margin:44px 0 12px}
.pre-home a{color:#a5b4fc}.pre-home ul,.pre-home ol{padding-left:1.2em}.pre-home li{margin:8px 0}.pre-home .brand{display:flex;gap:10px;align-items:center;color:#fff;font-weight:800}.pre-home img{border-radius:50%}</style>
<header class="brand"><img src="/manav.jpg" alt="Manav S" width="36" height="36">SEO Season by Manav</header>
<main>
<h1>I architect search authority that compounds, for brands that can't afford to fail.</h1>
<p>I'm Manav, a validation-first SEO strategist. I take on a select few clients and personally build their digital authority from the ground up.</p>
<p>AI-native SEO · 2,000+ projects delivered across 30+ countries · 4.9 average rating</p>
<p>Access the client portal. No commitment required.</p>
<h2>Not reports. Not vanity metrics. Real, compounding authority.</h2>
<ul>${get.map(([t, d]) => `<li><h3>${t}</h3><p>${d}</p></li>`).join("")}</ul>
<h2>How SEO Season works</h2>
<ol>${steps.map(([t, d]) => `<li><h3>${t}</h3><p>${d}</p></li>`).join("")}</ol>
<h2>See where you actually stand</h2>
<p>A free SEO audit, powered by the same AI framework I use for every client. Sign in or request access to run the full audit.</p>
<h2>Ready to build authority that compounds?</h2>
<p>I work with a select few clients at a time. Your personalised growth portal is waiting. Approved clients only, managed personally by Manav.</p>
</main>
<footer><p>SEO Season by Manav: I don't do vanity SEO. AI-native SEO, GEO and SEO. Data private.</p>
<p><a href="https://www.businesssanta.com/">Business Santa: SEO for US small businesses, powered by SEO Season</a> · <a href="https://seoseason.com/businesssanta">Business Santa services and prices</a></p>
<p>© 2026 SEO Season</p></footer>
</div>`;

if (!html.includes('<div id="root"></div>')) throw new Error("prerender-home: #root not found in dist/index.html");
writeFileSync(new URL("index.html", dist), html.replace('<div id="root"></div>', `<div id="root">${snapshot}</div>`));
console.log("prerender-home: dist/index.html has the home page text; app routes use dist/app.html");
