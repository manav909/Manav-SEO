// Runs on seoseason.com. Copies your SEO Season login (the Supabase session the
// site keeps in localStorage) to the extension, so its calls to the engine are
// signed in as you. The site refreshes the token while it is open; we re-read it
// every minute so the extension always has the latest one.
(function () {
  function readSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
        const s = JSON.parse(localStorage.getItem(key) || "null");
        if (s && s.access_token) {
          return {
            accessToken: s.access_token,
            expiresAt: Number(s.expires_at || 0) * 1000,
            email: (s.user && s.user.email) || "",
          };
        }
      }
    } catch (e) { /* unreadable — treat as signed out */ }
    return null;
  }

  function sync() {
    try { chrome.runtime.sendMessage({ type: "authSession", session: readSession() }); }
    catch (e) { /* extension reloaded — this tab will pick up again on refresh */ }
  }

  sync();
  setInterval(sync, 60000);
  window.addEventListener("focus", sync);
})();
