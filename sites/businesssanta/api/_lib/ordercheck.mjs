/* Order check: the work verified the way the HoD wants it.
   1. Scope comes from the requirement email sent to the project team, framed by the order (package, offer) and the client chat.
   2. Each requirement is followed through: what the team says in the group chat and emails, what the work report shows,
      and what the client's own site and Google data show live.
   3. Every problem is listed by step, with who must act. */

const host = u => { try{ return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); }catch(e){ return ""; } };
const cut = (t, n) => String(t || "").slice(0, n);

export function planPrompt(o, gig, convoText){
  const ai = o.ai || {}, pk = (gig && gig.packages && gig.packages[o.pkg]) || {};
  const system = `You plan the check of one order at an SEO, web and ads agency.
First find the REQUIREMENT EMAIL: the email our sales side sent to the project team listing what to do for this order (not Google or tool notices, not client messages). If there are several, the latest complete one wins; give its index, or -1 if none.
Then write the REQUIREMENTS: the work the project team must do. Take them from the requirement email first. Use the order scope (package and offer) to judge what is in scope. Use the client chat only to frame them; list what the client asked in chat that the email leaves out as "chatNotInMail", and email items outside the paid scope as "outOfScope". If there is no requirement email, take requirements from the order scope and what was agreed in chat, and say so.
Then CLAIMS: what the PROJECT TEAM said is done, only from the project group chat and team emails, with who and when, per requirement. What our sales side told the client in the client chat is not a team claim; give it separately as "told".
Then PROBES: live checks on the client's own site that prove or disprove each claim (at most 12), only on the client's site. A probe reads one URL and looks at: "title", "description", "h1", "robots" (meta robots), "canonical", "status", "robotstxt" (the robots.txt text), or "text:<exact phrase>". Pick the pages named in the work report or chat.
No dashes. Answer with one JSON object only:
{"reqMail":{"index":-1,"why":"one line"},"requirements":[{"id":"r1","text":"plain requirement","source":"requirement email | order scope | client chat","note":""}],"chatNotInMail":["client asked, not in the email"],"outOfScope":["in the email, outside what was paid"],"claims":[{"r":"r1","by":"","at":"","what":"what they said"}],"told":[{"r":"r1","at":"","what":"what we told the client in chat"}],"probes":[{"r":"r1","url":"https://...","look":"title","expect":"what right looks like"}]}`;
  const user = `ORDER ${o.id} for ${o.client.name || ""}, site ${o.client.website}, deadline ${o.deadline}.
ORDER SCOPE: gig "${(gig || {}).name || ""}", ${o.pkg} package: ${pk.what || ""}. Extras: ${o.extras || "none"}. What was sold: ${ai.summary || ""}
PROMISES IN CHAT: ${JSON.stringify((ai.promises || []).map(p => ({ what:p.what, by:p.by })))}
CLIENT CHAT (as laid out):
${cut(convoText, 30000)}
CALL NOTES: ${cut(o.calls, 4000) || "none"}
EMAILS (index, date, from, to, subject, text):
${(o.mails || []).map((m, i) => `[${i}] ${m.date} from ${m.from} to ${m.to || ""} | ${m.subject}\n${cut(m.text, 2500)}`).join("\n---\n") || "none"}
PROJECT GROUP CHAT:
${(o.teamChat || []).map(m => `${m.at} ${m.by}: ${cut(m.text, 600)}${(m.files || []).length ? " [files: " + m.files.join(", ") + "]" : ""}`).join("\n") || "none"}
ACCESS GROUP:
${(o.accessChat || []).map(m => `${m.at} ${m.by}: ${cut(m.text, 400)}`).join("\n") || "none"}`;
  return { system, user };
}

/* Read one page of the client's site the way a crawler sees it */
export async function probe(site, p){
  const h = host(site); let url = String(p.url || ""); if(!/^https?:/i.test(url)) url = "https://" + h + (url.startsWith("/") ? url : "/" + url);
  if(host(url) !== h) return { url, error:"not the client's site" };
  const look = String(p.look || "title"), out = { url, look };
  try{
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(url, { redirect:"follow", signal:ctl.signal, headers:{ "user-agent":"Mozilla/5.0 (compatible; BusinessSantaCheck/1.0)" } }); clearTimeout(tm);
    out.status = r.status; out.final = r.url;
    const t = (await r.text()).slice(0, 600000);
    if(look === "robotstxt" || /robots\.txt$/i.test(url)){ out.found = t.slice(0, 1500); return out; }
    const m = re => { const x = t.match(re); return x ? x[1].replace(/\s+/g, " ").trim() : ""; };
    const meta = n => m(new RegExp(`<meta[^>]+name=["']${n}["'][^>]*content=["']([^"']*)["']`, "i")) || m(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${n}["']`, "i"));
    if(look === "title") out.found = m(/<title[^>]*>([\s\S]*?)<\/title>/i);
    else if(look === "description") out.found = meta("description") || "(none)";
    else if(look === "h1") out.found = [...t.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(x => x[1].replace(/<[^>]+>/g, "").trim()).slice(0, 3).join(" | ") || "(none)";
    else if(look === "robots") out.found = meta("robots") || "(none: indexable by default)";
    else if(look === "canonical") out.found = m(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) || "(none)";
    else if(look.startsWith("text:")){ const ph = look.slice(5).trim().toLowerCase(); out.found = t.replace(/<[^>]+>/g, " ").toLowerCase().includes(ph) ? "phrase present" : "phrase not found"; }
    else out.found = "status " + r.status;
  }catch(e){ out.error = e.name === "AbortError" ? "timed out" : e.message; }
  return out;
}

export function judgePrompt(o, plan, reqMail, reads, probes, verifyTxt){
  const system = `You check one order of an SEO, web and ads agency, requirement by requirement, as the HoD wants: what the team SAYS (group chat, emails), what the WORK REPORT shows (which file, which tab), and what the client's site and Google show LIVE. Be fair to the team: a claim backed by the report and the live check is verified. Work that Google shows only later (indexing) is fine when what we did is live and the report says so honestly.
Status per requirement: "verified" (live check or Google confirms it), "said done, not proven" (the team says so but no report line or live check shows it), "contradicted" (the live site or report shows otherwise), "not started" (nothing said, nothing shown).
Then list every PROBLEM by step, each with who must act, including steps that might go wrong (for example a promise date that will be missed, access that is not enough, a report the client cannot read). Steps: client chat, order scope, requirement email, group chat, work report, access, QA, delivery.
No dashes. Plain words, no ids in text. Answer with one JSON object only:
{"verdict":"one line for the HoD","readyForQA":false,"rows":[{"r":"r1","team":"what the project team said in the group chat or team emails (who, when), or nothing said","told":"what we told the client about it, or empty","report":"file and tab that shows it, or not in the report","live":"what the live check or Google shows, or cannot be checked live","status":"verified | said done, not proven | contradicted | not started","problem":"what is wrong or missing, empty if fine"}],"problems":[{"step":"","text":"","who":"sales | PM | QA | manager"}]}`;
  const user = `ORDER ${o.id}, site ${o.client.website}, deadline ${o.deadline}, today ${new Date().toISOString().slice(0, 10)}.
REQUIREMENT EMAIL: ${reqMail ? reqMail.subject + " (" + reqMail.date + ", from " + reqMail.from + ")" : "none found"}
REQUIREMENTS: ${JSON.stringify(plan.requirements || [])}
CLIENT ASKED IN CHAT, NOT IN THE EMAIL: ${JSON.stringify(plan.chatNotInMail || [])}
IN THE EMAIL, OUTSIDE THE PAID SCOPE: ${JSON.stringify(plan.outOfScope || [])}
WHAT THE PROJECT TEAM SAYS (group chat and team emails only): ${JSON.stringify(plan.claims || [])}
WHAT WE TOLD THE CLIENT IN CHAT: ${JSON.stringify(plan.told || [])}
WORK REPORT AND FILES (every tab read):
${reads.map(x => "FILE: " + x.name + " (changed " + x.modified + (x.by ? " by " + x.by : "") + ")\n" + x.content).join("\n\n") || "none shared"}
LIVE CHECKS ON THE CLIENT'S SITE (read now):
${JSON.stringify(probes)}
SEARCH CONSOLE AND SITE CHECK (read with our access):
${verifyTxt || "not available"}
ACCESS ITEMS: ${JSON.stringify((o.access || []).map(a => ({ item:a.item, status:a.status, note:a.note || "" })))}`.slice(0, 110000);
  return { system, user };
}
