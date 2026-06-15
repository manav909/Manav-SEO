# SEO Season — Fiverr Lead Cockpit (Chrome extension)

A senior Digital Marketing Specialist working the chat with you. It keeps the lead you're in synced into
the software, reads tone and expectations, tells you what to say next, runs real SEO ops on the spot, and
gives you a **strictly-safe inbox board** of the conversations on your screen — prioritised by your own
deal data — with one-tap to open any of them.

## Install
1. **chrome://extensions** → **Developer mode** on → **Load unpacked** → select this folder.
2. Click the extension icon → set your **API address** (default `https://seoseason.com`).
3. After any file change: **↻ reload** on the extension card, **then refresh the Fiverr tab**.

## Safety model (read this)
The extension is built to never produce a non-human access pattern on Fiverr:
- It **reads only what is already on your screen** (the open chat, or the inbox rows currently rendered).
  That generates no extra requests to Fiverr — same as you reading the page yourself.
- It **never auto-scrolls, never auto-opens conversations, never bulk-fetches** anything from Fiverr.
- Opening a lead happens only when **you tap it** (one navigation, like clicking it in Fiverr's own list).
- It **never auto-sends** a message — sending is always your click.
- Data it sends goes to **your own server** (`seoseason.com`), which Fiverr cannot see.

There is no "process my whole inbox" sweep and no automated crawl of your conversations — those were
removed on purpose, because programmatic scrolling / mass-opening is the kind of automated access Fiverr
prohibits and monitors for. You stay inside normal-use behaviour.

## Inbox board (strictly safe)
Tap **Inbox** in the header. **Load visible leads** reads the conversations *currently showing* in your
inbox list — name, snippet, unread — and matches each to your deals (read-only; nothing created, no LLM,
no Fiverr fetch). Worked leads show **stage** and **hot/warm/cold**; unread shows "needs reply". Sorted so
unread + hottest are first. **Tap a lead to open it** and the cockpit takes over. Want more leads on the
board? Scroll your Fiverr inbox yourself to load them, then **Refresh**. It will never scroll for you.

## Chat cockpit (per lead)
- **Say this next** — the exact next message, drafted, edit-and-insert.
- Why/next move, **client tone**, **their expectations**, watch-out, objections, do-now, buying signals.
- **Ask the expert / do** — any question or objection; Expert take + Ready-to-send → insert. The expert
  can surface ⚡ run-it buttons that fire a crawl / AEO / competitor op itself.
- **Saved intel** + **Live SEO ops** (Crawl & audit, AEO/schema, Competitor gap) — server-side, saved to
  the deal, fed back into every answer.
- **Documents & calls** (collapsed) — drop downloaded files/transcripts. **✍ Reply** — three angles.
- Always-in-sync: the open chat autosaves to its deal as it changes ("✓ synced" in the header).

## Honest limits
The message box, site detection, and the inbox-row detection are heuristic and depend on Fiverr's markup —
expect a tuning pass once it runs against your real inbox (right-click an inbox row → Inspect → send me the
element and I'll hard-target it). The board reflects only what Fiverr has loaded on screen. Pdf/image
parsing isn't built. The expert is fed your saved crawl/AEO/competitor intel but not yet your
`algorithm_knowledge` / `brain_learnings`.

## Notes
- **No auth header** is sent. The deal is the same record your web `/deals` workspace and BDE panel use.
- Engine actions: `bd_deal_find` (identity), `bd_deal_lookup` (board enrichment, read-only),
  `bd_deal_update` (autosave), `bd_strategize` (read-out incl. tone/expectations/"say this next"),
  `bd_ask` (expert + suggestions), `bd_reply_variants`, `bd_run_audit`/`bd_aeo_check`/`bd_competitor_snapshot`
  (live ops), `bd_deal_get` (refresh).
