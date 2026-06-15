# SEO Season — Fiverr Lead Evaluator (Chrome extension)

A senior Digital Marketing Specialist + your SEO Season engine, live on the Fiverr chat. It **remembers
each client**, runs **real SEO operations on the spot** (crawl + audit, AEO/schema, competitor gap) with
the **heavy lifting on the server and the results saved forever**, **fetches what's already known back
into the panel**, and **answers/handles/drafts** anything — dropping the message into Fiverr's box for
you to send.

## Install
1. **chrome://extensions** → **Developer mode** on → **Load unpacked** → select this folder.
2. Click the extension icon → set your **API address** (default `https://seoseason.com`).
3. After any file change: **↻ reload** on the extension card, **then refresh the Fiverr tab**.

## How the memory works (take it to the software, save forever, fetch on the go)
Every Fiverr client maps to one **deal record** in SEO Season, keyed by the conversation handle in the
URL (`/inbox/<handle>`) — stable, not dependent on Fiverr's markup. When you open a chat the panel
finds-or-creates that deal, so from then on:

- **Evaluating** the lead **saves the full strategy** (stage, facts, intel) onto the deal.
- **Every SEO op saves its result** onto the deal as durable intel.
- **Every expert answer / reply draft is fed everything saved** — past crawl, AEO, competitor gap,
  facts — pulled back automatically. So the longer you work a client, the smarter the panel gets.
- **Saved intel** appears at the top when you re-open the chat — no re-running, it's just there.

The heavy work (crawling, SERP analysis) runs on the **server**, not the browser, and persists in
Supabase. The panel is the live cockpit over it.

## What's in the panel (top to bottom)
1. **Ask the expert / do** — type *"handle their objection"*, *"answer about schema"*, *"what's my next
   move?"*, or tap a quick action (Handle objection · Answer their question · Explain the value ·
   Pricing · Timeline · My process · Close it). After you evaluate, every recommended action becomes a
   **▶ do-this chip**. Each result → **Expert take** + a **Ready to send** message → **Insert into Fiverr**.
2. **Saved intel** — everything stored for this client so far (crawl, AEO, competitor gap, facts).
3. **Live SEO ops** — enter the client's site (auto-detected when present) and run **Crawl & audit**,
   **AEO / schema**, or **Competitor gap** (add competitor domains + target keywords). Runs server-side,
   saves to the client, feeds the expert.
4. **Documents & calls** — collapsed by default; click to expand. Drop downloaded attachments /
   transcripts; parsed in-browser and folded into the analysis and the expert.
5. **✍ Reply** (footer) — three reply angles to choose from; **Evaluate** / **Sel** for the read-out.

## Dropped files (parsed in-browser)
`.xlsx` / `.xls` / `.csv` (SheetJS) · `.docx` (mammoth) · `.txt` / `.md` / `.json` — full content.
`.pdf` and images — not yet (paste the key text, or ask for PDF/OCR support).

## Insertion, and the honest limits
Fiverr is React, so insertion uses the native value setter + input events (textarea) or
`execCommand('insertText')` (contenteditable) so text sticks. The box is found heuristically (lowest
visible text input); if it grabs the wrong field, click into the real box once and press Insert again,
or use **Copy**. **It never auto-sends** — that's always your click (account / ToS safety).

## Why files are dropped, not auto-fetched
Fiverr attachment links have no static URL (JS-minted, expiring). Dropping the downloaded file is
durable and parses locally; contents only ever go to your own engine, as text.

## Notes
- **No auth header** is sent (same as the web app); calls go through the background worker (allowed via
  `host_permissions`). On another domain, add it there and set it in the popup.
- The deal is **not user-scoped** server-side (service-key), so it lines up with the web app's BD module
  and the `/deals` workspace — the same client record.
- Engine actions used: `bd_deal_find` (identity), `bd_strategize` (read-out + saved strategy),
  `bd_ask` (expert), `bd_reply_variants` (reply drafts), `bd_run_audit` / `bd_aeo_check` /
  `bd_competitor_snapshot` (live ops), `bd_deal_get` (refresh saved intel).
- KNOWN LIMITS: message-box targeting is heuristic; the saved raw conversation isn't persisted (the live
  chat is always re-read); pdf/image parsing not built. Vendored parsers: `vendor-xlsx.js`, `vendor-mammoth.js`.
