# SEO Season — Fiverr Lead Evaluator (Chrome extension)

Evaluate Fiverr leads **live, on the open chat**, using your own SEO Season engine. It reads the
conversation from the page you are already logged into, sends it to `/api/task-engine`
(`bd_strategize`), and shows the deal stage, next move, what the client wants, objections, risks,
captured facts and a call script — in a floating panel. No copy-paste.

## Install (takes 1 minute)
1. Open **chrome://extensions** in Chrome (or Edge/Brave).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `fiverr-lead-evaluator` folder.
4. Pin the extension, click its icon, and set your **API address** (default `https://seoseason.com`).
   - This must be the domain where your SEO Season app is deployed and reachable.

## Use
1. Open a conversation in your Fiverr inbox.
2. Click the **◆ Evaluate lead** button (bottom-right of the page). It reads the chat and evaluates it.
3. If it grabs the wrong text, **highlight the conversation** with your mouse and click **Use selection**.

## Notes & limits (honest)
- **The API is called with no auth header**, exactly like your web app does. If you later put auth in
  front of `/api/task-engine`, this will need updating.
- **Cross-origin:** calls go through the extension's background worker, which is allowed to reach your
  domain via `host_permissions` in `manifest.json`. If your app is on a **different domain**, add it to
  `host_permissions` there and set it in the popup.
- **DOM scraping is best-effort.** Fiverr's page markup isn't public or stable, so the auto-grab finds
  the most text-dense conversation container. If your Fiverr layout makes it grab the sidebar or miss
  messages, the **Use selection** button is the reliable fallback — and if you tell me the conversation
  container's CSS class (right-click a message → Inspect), I can hard-target it so auto-grab is exact.
- It currently runs **bd_strategize** (lead evaluation). Order-page ingestion, document generation and
  the engagement timeline can be added the same way if you want them in the overlay too.
- No icons are bundled (Chrome uses a default). Drop `icon16/48/128.png` in the folder and add an
  `"icons"` block to `manifest.json` if you want a custom one.
