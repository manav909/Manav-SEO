# SEO Season — Fiverr Lead Cockpit (Chrome extension)

A senior Digital Marketing Specialist working the chat **with** you. It keeps the lead **synced into the
software automatically**, reads the client's **tone and expectations**, tells you **exactly what to say
next without being asked**, runs **real SEO operations on the spot** (saved forever, fed back into every
answer), and lets the expert **trigger those operations itself**. Built for someone non-technical: you
don't need to know what to ask.

## Install
1. **chrome://extensions** → **Developer mode** on → **Load unpacked** → select this folder.
2. Click the extension icon → set your **API address** (default `https://seoseason.com`).
3. After any file change: **↻ reload** on the extension card, **then refresh the Fiverr tab**.

## Always in sync (autosave)
Each Fiverr client maps to one **deal** in SEO Season, keyed by the `/inbox/<handle>` URL. When you open a
chat the panel finds-or-creates that deal and **starts watching the conversation**. As messages come and
go it **autosaves the chat to the software** (you'll see "✓ synced" in the header) and **re-reads the
situation automatically** when enough has changed — no button needed. Re-open the client next week and
everything is already there.

## What the panel shows (only the advanced — not what you can already read on Fiverr)
- **Say this next** — the exact next message to send, drafted for you. Edit it, **Insert into Fiverr**,
  send. This is the hand-in-hand part: you don't have to ask.
- **Why / next move · Client tone · Their expectations** — the read you can't see yourself: the client's
  current mood and what they're expecting (and whether it needs managing).
- **Watch out · Objections to handle · Do now · Buying signals** — what a senior DMS would flag.
- (Summary, wants, facts and the call script are tucked under **More detail** — you can already read the
  chat, so they don't lead.)

## Ask the expert · and it can act
- Type anything (*"handle their objection"*, *"answer about schema"*, *"what do I say?"*) or tap a quick
  action. You get an **Expert take** + a **Ready to send** message → Insert into Fiverr.
- **The expert triggers software actions itself.** When it decides a crawl, AEO check or competitor
  snapshot would strengthen your position, those appear as **⚡ run-it buttons** — one tap runs the op,
  saves it to the client, and feeds it back into the next answer.

## Live SEO ops (heavy lifting on the server)
Enter the client's site (auto-detected) and run **Crawl & audit**, **AEO / schema**, or **Competitor
gap** (add competitor domains + keywords). They run server-side, persist onto the deal, and show in
**Saved intel** — reused next time and fed into every expert answer.

## Documents & calls (collapsed)
Click to expand. Drop downloaded attachments / transcripts; parsed in-browser (`.xlsx/.xls/.csv`, `.docx`,
`.txt/.md/.json`; pdf/images not yet) and folded into the analysis and the expert.

## Insertion, and the honest limits
Fiverr is React, so insertion uses the native value setter + input events (textarea) or
`execCommand('insertText')` (contenteditable). The box is found heuristically (lowest visible text
input); if it grabs the wrong field, click into the real box once and press Insert again, or **Copy**.
**It never auto-sends** — that is always your click (account / ToS safety).

## Notes
- **No auth header** is sent (same as the web app); calls go through the background worker.
- The deal is the **same record** the web `/deals` workspace and BDE panel use — one shared CRM. What
  syncs from Fiverr shows up there.
- Auto-evaluate is rate-limited (only re-reads on meaningful change, and not more than ~once a minute) so
  it stays in sync without burning calls. Autosave of the chat text is cheap and runs more freely.
- Engine actions: `bd_deal_find` (identity), `bd_deal_update` (autosave + sync), `bd_strategize`
  (read-out, now incl. tone + expectations + the "say this next" draft), `bd_ask` (expert + suggested
  actions), `bd_reply_variants`, `bd_run_audit` / `bd_aeo_check` / `bd_competitor_snapshot` (live ops),
  `bd_deal_get` (refresh saved intel).
- KNOWN LIMITS: heuristic message-box + site detection; pdf/image parsing not built; the expert is fed
  your saved crawl/AEO/competitor intel but not yet your `algorithm_knowledge` / `brain_learnings`.
