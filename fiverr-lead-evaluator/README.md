# SEO Season — Fiverr Lead Cockpit (Chrome extension)

A senior Digital Marketing Specialist working the chat with you, now across your whole inbox. It keeps
each lead synced into the software, reads tone and expectations, tells you what to say next, runs real
SEO ops on the spot, and — new in v1.6 — gives you an **Inbox board** of every conversation (prioritised
by how hot they are and who's waiting on you) plus a **paced review** that opens and evaluates each lead
at human speed so your CRM fills itself.

## Install
1. **chrome://extensions** → **Developer mode** on → **Load unpacked** → select this folder.
2. Click the extension icon → set your **API address** (default `https://seoseason.com`).
3. After any file change: **↻ reload** on the extension card, **then refresh the Fiverr tab**.

## Two views — toggle in the header
- **Chat** (default): the full cockpit for the conversation you have open (below).
- **Inbox**: a board of your conversations. Tap **Inbox** in the header.

## Inbox board (v1.6)
- Tap **Load inbox** and it auto-scrolls your conversation list to load the whole inbox, then reads each
  row: name, last-message snippet, and unread.
- It matches every handle to your deals (read-only — no LLM, nothing created) and shows **stage** and
  **hot/warm/cold** for leads you've already worked; unworked leads show the raw inbox until you open
  them. Sorted so unread + hottest float to the top, so you see who to hit first.
- Tap any row to open that conversation — the cockpit re-resolves to that client and evaluates it.
- **Review all** runs a paced pass: it opens each conversation one at a time, waits for it to load,
  evaluates it (which syncs the strategy to that deal), then moves on after a short delay. **Pause**,
  **Resume**, and **Stop** are always there. Human-speed by design — it does not hammer Fiverr.

## Chat cockpit (per lead)
- **Say this next** — the exact next message, drafted, edit-and-insert.
- Why/next move, **client tone**, **their expectations**, watch-out, objections, do-now, buying signals.
- **Ask the expert / do** — any question or objection; Expert take + Ready-to-send → insert. The expert
  can also surface ⚡ run-it buttons that fire a crawl / AEO / competitor op itself.
- **Saved intel** + **Live SEO ops** (Crawl & audit, AEO/schema, Competitor gap) — server-side, saved to
  the deal, fed back into every answer.
- **Documents & calls** (collapsed) — drop downloaded files/transcripts. **✍ Reply** — three angles.
- Always-in-sync: the open chat autosaves to its deal as it changes ("✓ synced" in the header).

## Insertion, and the honest limits
React-aware insert into Fiverr's box (never auto-sends — you send). The message box, site detection, and
**now the inbox list/scroll detection are all heuristic** and depend on Fiverr's markup; expect a tuning
pass once it runs against your real inbox (right-click an inbox row → Inspect → send me the element and I
will hard-target it). Inbox reading is limited to the on-page list — no private endpoints. The list is
virtualised, so the board reads what auto-scroll manages to load.

## Notes
- **No auth header** is sent. The deal is the same record your web `/deals` workspace and BDE panel use.
- Engine actions: `bd_deal_find` (identity), `bd_deal_lookup` (board enrichment, read-only),
  `bd_deal_update` (autosave), `bd_strategize` (read-out incl. tone/expectations/"say this next"),
  `bd_ask` (expert + suggestions), `bd_reply_variants`, `bd_run_audit`/`bd_aeo_check`/`bd_competitor_snapshot`
  (live ops), `bd_deal_get` (refresh).
- KNOWN LIMITS: heuristic inbox/message-box/site detection; paced review is one-at-a-time (an LLM call
  per lead); pdf/image parsing not built; expert fed saved crawl/AEO/competitor intel but not yet your
  `algorithm_knowledge`/`brain_learnings`.
