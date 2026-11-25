/* Order desk helpers: the access checklist for each kind of gig, a quick website check, and the AI calls
   (order analysis, lead help, client reply digest). Every AI call is metered: tokens and USD per month and per kind. */
import { pipe } from "./store.mjs";
import zlib from "node:zlib";

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
  const a = await siteCheck1(url); if(!a.error) return a;
  await new Promise(r => setTimeout(r, 2500)); const b = await siteCheck1(url, 15000);
  if(b.error) b.error += " (tried twice; one slow answer from our server is not proof the site is slow for visitors)";
  return b;
}
async function siteCheck1(url, ms){
  let u = String(url).trim(); if(!/^https?:\/\//i.test(u)) u = "https://" + u;
  const t0 = Date.now();
  try{
    const r = await fetch(u, { redirect:"follow", signal:AbortSignal.timeout(ms || 9000), headers:{ "user-agent":"Mozilla/5.0 (compatible; BusinessSantaCheck/1.0)" } });
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
/* Speed: copying and sorting jobs run on Haiku with no thinking; judgement jobs run on Sonnet at medium effort (default is high). */
const FAST = { output_config:{ effort:"low" }, thinking:{ type:"disabled" } }, MED = { output_config:{ effort:"medium" } };
const SPEED = { format:FAST, intake:FAST, reply:FAST, recheck:FAST, order:MED, rethink:MED, proof:MED, lead:MED };
export async function askAI(kind, model, system, user, maxTokens){
  const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", signal:AbortSignal.timeout(170000),
    headers:{ "x-api-key":process.env.ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01", "content-type":"application/json" },
    body:JSON.stringify(Object.assign({ model, max_tokens:maxTokens || 8000, system, messages:[{ role:"user", content:user }] }, SPEED[kind] || {})) });
  const j = await r.json().catch(() => null);
  if(!r.ok || !j) throw new Error("The AI did not answer (" + r.status + (j && j.error ? ": " + j.error.message : "") + ")");
  const inT = j.usage ? (j.usage.input_tokens || 0) + (j.usage.cache_read_input_tokens || 0) + (j.usage.cache_creation_input_tokens || 0) : 0, outT = j.usage ? j.usage.output_tokens || 0 : 0;
  const p = PRICE[model] || [2, 10], usd = (inT * p[0] + outT * p[1]) / 1e6;
  const k = "bsp:ai:" + new Date().toISOString().slice(0, 7);
  await pipe([["HINCRBY", k, "calls", 1], ["HINCRBY", k, "in", inT], ["HINCRBY", k, "out", outT], ["HINCRBY", k, "micro", Math.round(usd * 1e6)],
    ["HINCRBY", k, "micro:" + kind, Math.round(usd * 1e6)], ["HINCRBY", k, "calls:" + kind, 1], ["EXPIRE", k, 60 * 60 * 24 * 400]]).catch(() => {});
  if(j.stop_reason === "max_tokens") throw new Error("The AI answer was cut off before the end. Press Run the order desk again.");
  const text = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").replace(/```(json)?/gi, "");
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
Turn every risk, special remark and open promise that needs information or a step into an action with an owner. Client facing actions get a message the client messages person can paste on the marketplace. Internal actions get a message for the project team or executive (they are asked over Google Chat), so the client messages person always has every answer before replying.
Only ask for access this exact scope needs; drop standard items the work does not use. Never repeat passwords or email addresses from the chat.
Today is ${new Date().toISOString().slice(0, 10)}. Convert relative dates in the chat ("tomorrow", "Monday") to real dates from the message dates.
Answer with one JSON object only, no other text, in this shape:
{"summary":"2 to 3 plain lines: what was sold and what the client will judge us on",
"deliverables":["each thing we must deliver, concrete and checkable, include what sales promised in chat"],
"access":[{"item":"","level":"exact role or permission","why":"","status":"received if the chat shows the client already gave it at the right level, else needed","evidence":"where in the chat, or empty"}],
"done":["work the chat shows is already done, with the date"],
"promises":[{"what":"every promise our side made: dates, reports, recordings, calls, extras, quick fixes","by":"YYYY-MM-DD or empty","status":"open | kept"}],
"next":"the very next thing the team must do, and by when, in one line",
"questions":["things to confirm with the client before starting, only real gaps"],
"remarks":["special remarks: promises, sensitivities, deadlines inside the deadline, tone the client likes"],
"risks":[{"risk":"","prevent":"","level":"high | medium | low","status":"open | watch | handled | happened"}],
"actions":[{"title":"short action","why":"which risk, remark or promise it serves","owner":"comms | pm | qa | manager","type":"client | internal | task","to":"client | project team | QA | manager","severity":"high | medium | low","message":"for client and internal types: the exact copy and paste message, ready to send. Internal messages are short chat messages to the project team or executive asking exactly what we need to know or what must be done, with the order id and a by-when. Empty for task type."}],
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

/* Turns the raw inbox paste into a readable conversation. The wording of every message is kept exactly; only the layout changes. */
export function formatPrompt(raw){
  const system = `You turn a raw copy and paste of a marketplace inbox chat into a clean conversation. ${RAW}
Rules: copy every message's text exactly as written, word for word, with its line breaks. Do not fix spelling, do not shorten, do not summarise, do not translate, do not drop any message.
Drop only screen noise (button labels, "Seen", file sizes). Join lines that belong to one message. Put messages oldest first.
Answer with one JSON object only: {"client":"client's username or name","us":"our username or name","messages":[{"who":"client | us","name":"","time":"date and time as written, or empty","text":"","files":["file names mentioned as attachments"]}]}`;
  return { system, user:cleanChat(raw).slice(0, 90000) };
}

/* Clients sometimes paste logins into the chat. Before an order is stored, email addresses and anything that looks like a
   password or login is masked, so no secret ever sits in our storage. */
export function redact(t){
  return String(t || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email hidden]")
    .replace(/\b(pass(word)?|pwd|passcode|pin|otp|user ?name|username|login|user)\s*[:=-]\s*\S+/gi, "$1: [hidden]")
    .replace(/(^|\n)(\s*(password|pass|pwd)\s*:?\s*\n)([^\n]+)/gi, "$1$2[hidden]");
}

/* Proof of work: link checks, text from Office files, and the AI pre-check that QA reads before checking by hand. */
export async function checkLink(url){
  let u = String(url || "").trim(); if(!/^https?:\/\//i.test(u)) u = "https://" + u;
  try{
    const r = await fetch(u, { redirect:"follow", signal:AbortSignal.timeout(12000), headers:{ "user-agent":"Mozilla/5.0 (compatible; BusinessSantaQA/1.0)" } });
    const html = (await r.text()).slice(0, 400000), fin = r.url || u;
    const login = /accounts\.google\.com\/(v3\/)?signin|ServiceLogin|login\.microsoftonline|\/login\b|\/signin\b/i.test(fin) || r.status === 401 || r.status === 403;
    const drivePrivate = /drive\.google|docs\.google/.test(u) && /You need access|Request access|Sign in/i.test(html.slice(0, 60000));
    const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || "";
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
    return { url:u, final:fin, status:r.status, ok:r.ok && !login && !drivePrivate, private:login || drivePrivate, title:title.trim().slice(0, 160), text };
  }catch(e){ return { url:u, ok:false, error:"Did not open (" + String(e.message || e).slice(0, 80) + ")" }; }
}
function unzip(buf, want){
  const out = {}; let e = -1;
  for(let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if(buf.readUInt32LE(i) === 0x06054b50){ e = i; break; }
  if(e < 0) return out;
  let p = buf.readUInt32LE(e + 16); const n = buf.readUInt16LE(e + 10);
  for(let k = 0; k < n && buf.readUInt32LE(p) === 0x02014b50; k++){
    const m = buf.readUInt16LE(p + 10), cs = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nl); p += 46 + nl + xl + cl;
    if(!want.test(name)) continue;
    const s = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), raw = buf.subarray(s, s + cs);
    try{ out[name] = (m === 8 ? zlib.inflateRawSync(raw) : raw).toString("utf8"); }catch(_){}
  }
  return out;
}
const ent = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
export function officeText(buf, name){
  const ext = (name.split(".").pop() || "").toLowerCase();
  if(["txt", "csv", "md", "html", "htm", "json"].includes(ext)) return buf.toString("utf8").slice(0, 40000);
  if(ext === "docx"){ const f = unzip(buf, /^word\/(document|header\d*|footer\d*)\.xml$/); return ent(Object.values(f).join("\n").replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").slice(0, 40000); }
  if(ext === "pptx"){ const f = unzip(buf, /^ppt\/slides\/slide\d+\.xml$/); return Object.keys(f).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/))).map((k, i) => "Slide " + (i + 1) + ": " + ent(f[k].replace(/<\/a:p>/g, "\n").replace(/<[^>]+>/g, ""))).join("\n").slice(0, 40000); }
  if(ext === "xlsx"){
    const f = unzip(buf, /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/), ss = [];
    (f["xl/sharedStrings.xml"] || "").replace(/<si>([\s\S]*?)<\/si>/g, (_, x) => { ss.push(ent(x.replace(/<[^>]+>/g, ""))); return ""; });
    return Object.keys(f).filter(k => /sheet\d+/.test(k)).sort().map(k => k.replace(/.*\//, "") + ":\n" + (f[k].match(/<row[\s\S]*?<\/row>/g) || []).slice(0, 400).map(r => (r.match(/<c [^>]*?(\/>|>[\s\S]*?<\/c>)/g) || []).map(c => {
      const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || (c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || ""; return / t="s"/.test(c) ? (ss[+v] || "") : ent(v); }).join("\t")).join("\n")).join("\n\n").slice(0, 40000);
  }
  return "";
}
export async function proofCheck(o, d, items){
  const content = [{ type:"text", text:`Order ${o.id} for client "${o.client.name}" (${o.client.website || "no site"}).
What was sold: ${(o.ai && o.ai.summary) || ""}
Deliverable to check: ${d.text}
Proofs follow. Each starts with a label.` }];
  for(const it of items){
    if(it.kind === "link"){ content.push({ type:"text", text:`PROOF LINK ${it.url}\nResult of opening it: ${JSON.stringify({ status:it.check && it.check.status, opens:it.check && it.check.ok, private:it.check && it.check.private, title:it.check && it.check.title, error:it.check && it.check.error })}\nPage text start: ${(it.check && it.check.text) || ""}` }); continue; }
    content.push({ type:"text", text:`PROOF FILE ${it.name} (${it.type || "unknown type"}, ${Math.round((it.size || 0) / 1024)} KB)` });
    if(it.image) content.push({ type:"image", source:{ type:"base64", media_type:it.type, data:it.b64 } });
    else if(it.pdf) content.push({ type:"document", source:{ type:"base64", media_type:"application/pdf", data:it.b64 } });
    else if(it.text) content.push({ type:"text", text:"File text:\n" + it.text });
    else content.push({ type:"text", text:it.note || "You cannot open this file. A human must check it." });
  }
  const system = `You are the QA assistant of an SEO, web and ads agency. You check the proof for ONE deliverable before a human QA does the final check.
Judge only from the proof given. Be strict and specific: the goal is that no wrong work, false report or not-live work reaches the client.
Check: does the proof really show this deliverable done (and live, where that matters)? Is it the right client and site? What is missing compared with the deliverable?
Red flags: another client's name or data, numbers or claims the proof cannot back up, promised rankings or traffic, email, phone or outside links in client documents, placeholder text (lorem, TODO, [our access email]), clear spelling mistakes in client documents, links that do not open or need a login, screenshots that do not show the date or the site, wrong dates.
Recordings and files you cannot open go into qaManual. Write in plain simple English, no dashes.
Answer with one JSON object only: {"verdict":"complete | gaps | wrong","summary":"one line","shows":["what the proof does show"],"missing":["what is missing"],"redFlags":["problems found"],"qaManual":["what the human QA must still check by hand"]}`;
  return askAI("proof", "claude-sonnet-5-5", system, content, 6000);
}

/* Order updates: whatever the team pastes (the whole chat again, only new messages, call notes, a team reply, files shared) is sorted first, then the order is re-thought. */
export function intakePrompt(raw){
  const system = `You sort something the order team pasted into an order record. ${RAW}
Decide what it is: "chat" (marketplace messages, the whole conversation again or only new ones), "call" (notes from a call), "team" (a reply or report from our project team, executive or QA), "media" (files, screenshots or recordings shared, described or linked), or "note" (anything else).
For chat: copy every message exactly, word for word, oldest first, with who, name and time. Drop only screen noise. Do not summarise chat.
For the other kinds: keep the full text in note.text, give it a short title, and say who it came from if known.
Answer with one JSON object only: {"kind":"chat | call | team | media | note","messages":[{"who":"client | us","name":"","time":"","text":"","files":[]}],"note":{"title":"","text":"","from":""},"files":["file names or links mentioned"]}`;
  return { system, user:cleanChat(raw).slice(0, 90000) };
}
export function rethinkPrompt(o, fresh){
  const ai = o.ai || {};
  const tail = ((o.convo && o.convo.messages) || []).slice(-40).map(m => `${m.who === "us" ? "US" : "CLIENT"} ${m.time || ""}: ${String(m.text).slice(0, 600)}`).join("\n");
  const system = `You keep an order of an SEO, web and ads agency up to date. New information just arrived. Re-think the order like a sharp delivery manager: what changed, which promises are now kept or broken, which risks got better or worse, which actions are done, what must happen next.
${SAFE}
Rules: keep the ids of existing actions. Never mark an action done unless the new information shows it. You may add new actions (no id) with ready copy and paste messages: client type for the marketplace, internal type for the project team or executive over Google Chat, asking exactly what we need with the order id and a by-when.
Today is ${new Date().toISOString().slice(0, 10)}. Use real dates.
Answer with one JSON object only:
{"changed":"one or two lines: what this update changed","health":"on track | watch | at risk | late","next":"the very next step and by when",
"promises":[{"what":"","by":"YYYY-MM-DD or empty","status":"open | kept | broken"}],
"risks":[{"risk":"","prevent":"","level":"high | medium | low","status":"open | watch | handled | happened"}],
"actions":[{"id":"existing id or empty","title":"","why":"","owner":"comms | pm | qa | manager","type":"client | internal | task","to":"","severity":"high | medium | low","message":"","status":"open | sent | waiting | done | blocked","statusWhy":"why this status"}],
"done":["work now shown as done, with date"],"scopeChange":"empty, or what the client now wants that was not sold","mood":"happy | neutral | worried | upset",
"askNext":["what the order team should paste or ask next to keep this order fully known"]}`;
  const user = `ORDER ${o.id} for ${o.client.name} (${o.client.website || "no site"}), deadline ${o.deadline}, stage ${o.stage}.
Sold: ${ai.summary || ""}
Deliverables: ${JSON.stringify((o.deliverables || []).map(d => ({ text:d.text, done:!!d.done, qa:d.qa || "" })))}
Access: ${JSON.stringify((o.access || []).map(a => a.item + ": " + a.status))}
Current promises: ${JSON.stringify(ai.promises || [])}
Current risks: ${JSON.stringify(ai.risks || [])}
Current actions: ${JSON.stringify((o.actions || []).map(a => ({ id:a.id, title:a.title, owner:a.owner, type:a.type, status:a.status, note:a.note || "" })))}
Team notes so far: ${JSON.stringify((o.notes || []).slice(-10).map(n => ({ kind:n.kind, title:n.title, text:String(n.text).slice(0, 1500), at:n.at })))}
Recent conversation:
${tail}

NEW INFORMATION JUST ADDED:
${fresh}`;
  return { system, user };
}
