/* Order desk helpers: the access checklist for each kind of gig, a quick website check, and the AI calls
   (order analysis, lead help, client reply digest). Every AI call is metered: tokens and USD per month and per kind. */
import { pipe } from "./store.mjs";

/* What each kind of work needs from the client, and at what level. Used straight away, and refined by the AI. */
const A = (item, level, why) => ({ item, level, why });
export const ACCESS = {
  onpage: [A("Website admin login (CMS)", "Editor or Admin user for our access email. Not the owner's own password", "To edit titles, text, headings and the SEO plugin"),
    A("Google Search Console", "Full user", "To see what Google sees and request indexing"),
    A("Google Analytics 4", "Viewer", "To measure results before and after"),
    A("Target keywords and main pages", "A list from the client", "So we optimise what the client cares about")],
  ecom: [A("Store staff account (Shopify or similar)", "Staff with Products, Online Store and Apps, or a collaborator request", "To edit product, collection and theme SEO"),
    A("Google Search Console", "Full user", "Indexing and errors"),
    A("Google Analytics 4", "Viewer", "Sales and traffic baseline"),
    A("Top products and collections", "A list from the client", "Where to start")],
  offpage: [A("Target pages", "URLs from the client", "Where the links should point"),
    A("Target keywords and anchor wishes", "A list from the client", "Natural anchor mix"),
    A("Topics or sites to avoid", "From the client", "No link on a site the client dislikes"),
    A("Google Search Console", "Restricted user (optional)", "To show new links in the client's own report")],
  technical: [A("Google Search Console", "Full user (Owner only if verification is needed)", "Indexing, sitemap, errors"),
    A("Website admin login (CMS)", "Admin user", "robots.txt, sitemap, schema, redirects"),
    A("Google Analytics 4", "Viewer", "Baseline"),
    A("Domain or hosting (DNS)", "Only if Search Console verification fails", "Verification record")],
  monthly: [A("Website admin login (CMS)", "Editor or Admin user", "Monthly on-page work"),
    A("Google Search Console", "Full user", "Monthly report and indexing"),
    A("Google Analytics 4", "Viewer", "Monthly report"),
    A("Google Business Profile", "Manager (only for local businesses)", "Local SEO"),
    A("Keywords and competitors", "A list from the client", "What we track every month")],
  geo: [A("Website admin login (CMS)", "Editor or Admin user", "Answer blocks, FAQ, schema"),
    A("Google Search Console", "Full user", "Indexing"),
    A("Brand facts", "From the client: founding year, team, awards, review links", "AI answers quote facts, so they must be true"),
    A("Questions customers ask", "A list from the client", "Pages that answer them")],
  ads: [A("Google Ads account", "Standard access (or accept our manager link)", "Build and run campaigns"),
    A("Google Analytics 4", "Editor", "Link conversions"),
    A("Google Tag Manager", "Publish", "Conversion tags"),
    A("Billing", "Set up by the client in their own Ads account", "We never handle card details"),
    A("Monthly budget and goal", "From the client", "Campaign plan")],
  design: [A("Brand logo, colours and fonts", "Files from the client", "Matches the brand"),
    A("Reference sites they like", "Links from the client", "Style direction"),
    A("Page text and pictures", "From the client, or approval for us to write", "Real content, no surprises"),
    A("Figma file or website admin", "Edit access, only if we build into their file or site", "Where the design goes")]
};

/* A plain website check: one fetch of the home page, facts only (the AI explains them). */
export async function siteCheck(url){
  if(!url) return null;
  let u = String(url).trim(); if(!/^https?:\/\//i.test(u)) u = "https://" + u;
  const t0 = Date.now();
  try{
    const r = await fetch(u, { redirect:"follow", signal:AbortSignal.timeout(9000), headers:{ "user-agent":"Mozilla/5.0 (compatible; BusinessSantaCheck/1.0)" } });
    const html = (await r.text()).slice(0, 600000), ms = Date.now() - t0;
    const one = re => { const m = html.match(re); return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 300) : ""; };
    const cms = /wp-content|wordpress/i.test(html) ? "WordPress" : /cdn\.shopify|Shopify\.theme/i.test(html) ? "Shopify" : /wix\.com|wixstatic/i.test(html) ? "Wix"
      : /squarespace/i.test(html) ? "Squarespace" : /webflow/i.test(html) ? "Webflow" : /framer/i.test(html) ? "Framer" : "Not clear";
    return { url:r.url, status:r.status, https:/^https:/.test(r.url), ms, kb:Math.round(html.length / 1024), cms,
      title:one(/<title[^>]*>([^<]*)<\/title>/i), description:one(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i),
      h1:(html.match(/<h1[\s>]/gi) || []).length, firstH1:one(/<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, ""),
      canonical:!!/rel=["']canonical["']/i.test(html), noindex:/<meta[^>]+robots[^>]+noindex/i.test(html), viewport:/name=["']viewport["']/i.test(html),
      schema:(html.match(/application\/ld\+json/gi) || []).length, images:(html.match(/<img\s/gi) || []).length, imagesNoAlt:(html.match(/<img(?![^>]*\balt=)[^>]*>/gi) || []).length };
  }catch(e){ return { url:u, error:"The site did not open in 9 seconds (" + String(e.message || e).slice(0, 80) + ")" }; }
}

/* Sales paste chats raw from the inbox: names, times, "Seen", file cards, buttons. Drop only lines that are pure screen
   noise and squeeze blank runs; every real message, name and time stays (times show promises and deadlines). */
const NOISE = /^(seen|delivered|read|sent|typing\.{0,3}|translate|show original|see translation|report|download|download all|copy|reply|react|more|view order|view offer|withdraw offer|accept|decline|edit|delete|unsend|like|\u2713+|\d+(\.\d+)?\s?(kb|mb|gb)|attachment|file|image|video|voice message|play|pause|\d{1,2}:\d{2}(\s?[ap]m)?\s?\/\s?\d{1,2}:\d{2}|new messages?|unread messages?|load more|load older messages|online|offline|away|local time.*|last seen.*|response time.*|avg\.? response time.*)$/i;
export function cleanChat(t){
  const lines = String(t || "").replace(/\r/g, "").replace(/[\u200b\u200e\u200f\ufeff]/g, "").split("\n").map(l => l.replace(/[ \t\u00a0]+/g, " ").trim());
  const outL = []; let blank = 0, prev = "";
  for(const l of lines){
    if(!l){ if(++blank <= 1 && outL.length) outL.push(""); continue; }
    if(NOISE.test(l)) continue;
    if(l === prev && l.length < 40) continue;   // a name or time repeated by the screen
    blank = 0; outL.push(l); prev = l;
  }
  return outL.join("\n").trim();
}
const RAW = `The chat is a raw copy and paste from the marketplace inbox. Expect usernames, dates and times on their own lines, leftover button labels, and possibly newest messages first.
Work out who is who from the content: the seller side offers and explains our services (that is us), the buyer side asks for help and pays (that is the client). If the order of messages looks reversed, read it in time order.
Quote nothing private. Treat any promise our side made in the chat (dates, extras, reports, results) as part of the order.`;

/* USD per million tokens, from the Claude Platform price list (Nov 2026). */
const PRICE = { "claude-sonnet-5-5":[2, 10], "claude-haiku-5-5":[0.1, 0.5] };
export const aiOn = () => !!process.env.ANTHROPIC_API_KEY;
export async function askAI(kind, model, system, user, maxTokens){
  const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", signal:AbortSignal.timeout(110000),
    headers:{ "x-api-key":process.env.ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01", "content-type":"application/json" },
    body:JSON.stringify({ model, max_tokens:maxTokens || 8000, system, messages:[{ role:"user", content:user }] }) });
  const j = await r.json().catch(() => null);
  if(!r.ok || !j) throw new Error("The AI did not answer (" + r.status + (j && j.error ? ": " + j.error.message : "") + ")");
  const inT = j.usage ? (j.usage.input_tokens || 0) + (j.usage.cache_read_input_tokens || 0) + (j.usage.cache_creation_input_tokens || 0) : 0, outT = j.usage ? j.usage.output_tokens || 0 : 0;
  const p = PRICE[model] || [2, 10], usd = (inT * p[0] + outT * p[1]) / 1e6;
  const k = "bsp:ai:" + new Date().toISOString().slice(0, 7);
  await pipe([["HINCRBY", k, "calls", 1], ["HINCRBY", k, "in", inT], ["HINCRBY", k, "out", outT], ["HINCRBY", k, "micro", Math.round(usd * 1e6)],
    ["HINCRBY", k, "micro:" + kind, Math.round(usd * 1e6)], ["HINCRBY", k, "calls:" + kind, 1], ["EXPIRE", k, 60 * 60 * 24 * 400]]).catch(() => {});
  const text = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  let data = null; try{ data = JSON.parse(text.slice(a, b + 1)); }catch(e){ throw new Error("The AI answer could not be read, please try again"); }
  return { data, usd, inT, outT, model };
}

const SAFE = `The client came through an online freelance marketplace. Every message to the client must follow marketplace rules:
never ask for or give email addresses, phone numbers, WhatsApp, Skype or any way to talk or pay outside the marketplace, and never add links except the client's own site.
Where an access email is needed, write the placeholder [our access email] and the team fills it in. Write client messages in warm, simple US English, short paragraphs, no jargon, no dashes.`;

export function orderPrompt(o, gig, site, cfg){
  const pk = gig && gig.packages[o.pkg];
  const system = `You are the order desk of a small SEO, web and ads agency. A sales person has just closed an order and pasted everything they know.
Your job is to stop mistakes before work starts: wrong scope, missing or wrong-level access, promises the team does not know about, reports that cannot be proven, work that never goes live.
${SAFE}
${RAW}
Answer with one JSON object only, no other text, in this shape:
{"summary":"2 to 3 plain lines: what was sold and what the client will judge us on",
"deliverables":["each thing we must deliver, concrete and checkable, include what sales promised in chat"],
"access":[{"item":"","level":"exact role or permission","why":""}],
"questions":["things to confirm with the client before starting, only real gaps"],
"remarks":["special remarks: promises, sensitivities, deadlines inside the deadline, tone the client likes"],
"risks":[{"risk":"","prevent":""}],
"kt":"handover note for the project team in plain words, 6 to 10 lines, so nobody needs to read the chat",
"qa":["checks QA must do before delivery, each tied to a deliverable, always including a live check and proof"],
"profile":{"type":"what kind of client","goal":"what they really want","style":"how they like to talk","watch":"what could upset them","budget":"budget signal"},
"site":{"verdict":"one line","issues":["from the facts given only"],"quickWins":["small things that would delight the client"]},
"price":{"verdict":"good bargain | value for money | undercharged","why":"","fair":"a fair USD range for this exact scope","hours":0},
"pitch":["upsell ideas tied to this client's real gaps, each with a rough USD price"],
"retainer":{"offer":"a monthly plan that fits them","price":"USD per month","when":"the right moment to offer it","line":"one sentence the comms person can say"},
"msgs":{"access":"ready message asking for the access, step by step for a non technical client","questions":"ready message with the questions, or empty"}}
"good bargain" means the client pays well for the work. "undercharged" means we are giving too much for the price. hours = honest team hours for this scope.`;
  const user = `Gig: ${gig ? gig.name : "unknown"}
Package: ${o.pkg} at $${pk ? pk.price : "?"} (package says: ${pk ? pk.what : "?"})
Price the client actually paid: $${o.price}  Extras: ${o.extras || "none"}
Deadline: ${o.deadline}
Team cost for your price view: about $${cfg.hourly} per team hour, marketplace keeps ${cfg.fee}% of the price.
Client: ${o.client.name || "?"} ${o.client.country ? "(" + o.client.country + ")" : ""}  Website: ${o.client.website || "none given"}
Standard access for this kind of work: ${JSON.stringify(ACCESS[gig ? gig.cat : "onpage"] || [])}
Website facts from one check of the home page: ${JSON.stringify(site || {})}

Sales remarks:
${o.remarks || "none"}

Call notes:
${o.calls || "none"}

Full chat with the client:
${cleanChat(o.chat).slice(0, 60000)}`;
  return { system, user };
}

export function leadPrompt(chat, gigs, note){
  const system = `You help a sales person on an online freelance marketplace win a client they are struggling with, for an SEO, web and ads agency.
${SAFE}
${RAW}
Use only these gigs and packages (USD): ${JSON.stringify(gigs.map(g => ({ id:g.id, name:g.name, packages:Object.fromEntries(Object.entries(g.packages).map(([k, v]) => [k, v.price + " " + v.what])) })))}
Answer with one JSON object only:
{"wants":"what the client really wants, in one or two lines","stage":"cold | warm | hot","chance":0,"blocker":"the main thing stopping them",
"objections":[{"objection":"","answer":""}],"offer":{"gig":"gig id","package":"basic | standard | premium","price":0,"custom":"custom offer wording if a package does not fit"},
"reply":"the exact next message to send, short, human, ends with one easy question",
"dont":["things the sales person must not do with this client"],"followup":"when to follow up and what to say if there is no answer",
"redFlags":["signs of a bad fit or risk, empty if none"]}
chance is 0 to 100.`;
  return { system, user:`Sales note: ${note || "none"}\n\nChat so far:\n${cleanChat(chat).slice(0, 50000)}` };
}

export function replyPrompt(o, text){
  const system = `You read a client's new message on an order and tell the project team what changed. Answer with one JSON object only:
{"summary":"one or two plain lines","accessGiven":["names of access items the client says they gave"],"scopeChange":"empty, or what the client is now asking that was not in the order",
"urgent":false,"mood":"happy | neutral | worried | upset","actions":["what the team should do now"]}`;
  return { system, user:`Order deliverables: ${JSON.stringify((o.deliverables || []).map(d => d.text))}\nAccess list: ${JSON.stringify((o.access || []).map(a => a.item))}\n\nClient message:\n${String(text).slice(0, 12000)}` };
}
