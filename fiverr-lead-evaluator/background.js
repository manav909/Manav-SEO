// Service worker: forwards requests from the content script to the SEO Season engine.
// Because the API host is declared in host_permissions, fetches here are NOT subject to
// page CORS — so this works even if the API does not send CORS headers.

function apiBase(cb) {
  chrome.storage.sync.get({ apiBase: "https://seoseason.com" }, (s) => {
    cb(String(s.apiBase || "https://seoseason.com").replace(/\/+$/, ""));
  });
}

// Your SEO Season login, copied over by auth-bridge.js from an open seoseason.com tab.
const SIGN_IN_MSG = "Not signed in. Open seoseason.com in a tab, log in, then try again.";

function getSession(cb) {
  chrome.storage.local.get({ session: null }, (s) => cb(s.session));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "authSession") {
    // A signed-out read from the site clears the stored login; a fresh one replaces it.
    chrome.storage.local.set({ session: msg.session || null });
    return false;
  }
  if (msg && msg.type === "getSession") {
    getSession((session) => sendResponse({ session }));
    return true;
  }
  if (msg && msg.type === "callEngine") {
    apiBase((base) => getSession((session) => {
      (async () => {
        const token = session && session.accessToken && session.expiresAt > Date.now() ? session.accessToken : "";
        if (!token) { sendResponse({ ok: false, status: 401, error: SIGN_IN_MSG, data: { error: SIGN_IN_MSG } }); return; }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 150000); // ceiling sits above the server LLM timeouts (strategize 90s, engagement 100s, doc-gen 110s) so genuine calls finish; only a true hang aborts
        try {
          const res = await fetch(base + "/api/task-engine", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
            body: JSON.stringify({ action: msg.action, ...(msg.body || {}) }),
            signal: ctrl.signal,
          });
          if (res.status === 401) { sendResponse({ ok: false, status: 401, error: SIGN_IN_MSG, data: { error: SIGN_IN_MSG } }); return; }
          const text = await res.text();
          let data;
          try { data = JSON.parse(text); } catch { data = { error: "Non-JSON response (" + res.status + "): " + text.slice(0, 200) }; }
          sendResponse({ ok: res.ok, status: res.status, data });
        } catch (e) {
          const aborted = e && e.name === "AbortError";
          sendResponse({ ok: false, timedOut: aborted, error: aborted ? "The server took too long to respond. Tap to try again." : String((e && e.message) || e) });
        } finally {
          clearTimeout(timer);
        }
      })();
    }));
    return true; // keep the message channel open for the async response
  }
});
