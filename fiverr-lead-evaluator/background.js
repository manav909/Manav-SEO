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
        try {
          const res = await fetch(base + "/api/task-engine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: msg.action, ...(msg.body || {}) }),
          });
          const text = await res.text();
          let data;
          try { data = JSON.parse(text); } catch { data = { error: "Non-JSON response (" + res.status + "): " + text.slice(0, 200) }; }
          sendResponse({ ok: res.ok, status: res.status, data });
        } catch (e) {
          sendResponse({ ok: false, error: String((e && e.message) || e) });
        }
      })();
    });
    return true; // keep the message channel open for the async response
  }
});
