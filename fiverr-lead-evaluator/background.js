// Service worker: forwards requests from the content script to the SEO Season engine.
// Because the API host is declared in host_permissions, fetches here are NOT subject to
// page CORS — so this works even if the API does not send CORS headers.

function apiBase(cb) {
  chrome.storage.sync.get({ apiBase: "https://seoseason.com" }, (s) => {
    cb(String(s.apiBase || "https://seoseason.com").replace(/\/+$/, ""));
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "callEngine") {
    apiBase((base) => {
      (async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45000); // never let a request hang the panel forever
        try {
          const res = await fetch(base + "/api/task-engine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: msg.action, ...(msg.body || {}) }),
            signal: ctrl.signal,
          });
          const text = await res.text();
          let data;
          try { data = JSON.parse(text); } catch { data = { error: "Non-JSON response (" + res.status + "): " + text.slice(0, 200) }; }
          sendResponse({ ok: res.ok, status: res.status, data });
        } catch (e) {
          const aborted = e && e.name === "AbortError";
          sendResponse({ ok: false, error: aborted ? "The server took too long to respond. Tap to try again." : String((e && e.message) || e) });
        } finally {
          clearTimeout(timer);
        }
      })();
    });
    return true; // keep the message channel open for the async response
  }
});
