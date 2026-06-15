// SEO Season — Zoom recording transcript capture.
// Passive: reads only what is already on the page (the transcript YOU are viewing while logged in).
// It does not log in, fetch, or download anything from Zoom; it stashes the on-screen transcript
// locally so the Fiverr-side panel can attach it to the right client.
(function () {
  if (window.__ssZoomCapture) return; window.__ssZoomCapture = true;
  const KEY = "ss_pending_transcript";
  const onRecording = () => /\/rec\//i.test(location.pathname + location.hash + location.search);

  // Prefer an explicit text selection (bulletproof). Otherwise best-effort scrape of a transcript-looking block.
  function scrapeTranscript() {
    const sel = ((window.getSelection && window.getSelection().toString()) || "").trim();
    if (sel && sel.length > 80) return sel;
    let best = "", bestLen = 0;
    let cand = [];
    try {
      cand = document.querySelectorAll('[class*="transcript" i],[aria-label*="transcript" i],[class*="caption" i],[class*="subtitle" i],[role="log"],[role="list"],ul,ol');
    } catch (e) { cand = []; }
    cand.forEach((el) => {
      const t = (el.innerText || "").trim();
      if (t.length > bestLen && t.length > 200 && t.length < 300000) { best = t; bestLen = t.length; }
    });
    return best;
  }
  function label() {
    let h = null;
    try { h = document.querySelector("h1,h2,[class*='topic' i],[class*='title' i]"); } catch (e) { h = null; }
    return (((h && h.innerText) || document.title || "Zoom recording").trim().replace(/\s+/g, " ")).slice(0, 120);
  }

  let host, shadow, msg = "";
  function mount() {
    if (host) { paint(); return; }
    host = document.createElement("div");
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
    shadow = host.attachShadow({ mode: "open" });
    (document.documentElement || document.body).appendChild(host);
    paint();
  }
  function paint() {
    if (!shadow) return;
    shadow.innerHTML =
      '<style>' +
      '*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}' +
      '.card{background:#11141f;border:1px solid #2a3147;border-radius:12px;padding:11px 12px;width:272px;box-shadow:0 10px 30px rgba(0,0,0,.45);color:#e7e9f3}' +
      '.row{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.t{font-size:12px;font-weight:700}' +
      '.x{cursor:pointer;color:#6b7390;font-size:14px;line-height:1;border:none;background:none}' +
      '.s{font-size:10.8px;color:#9aa0b6;line-height:1.5;margin:5px 0 9px}' +
      '.b{cursor:pointer;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;background:#4f46e5;color:#fff;width:100%}' +
      '.b:hover{background:#5b53ea}' +
      '.ok{color:#34d399;font-size:10.8px;margin-top:8px;line-height:1.45}' +
      '.warn{color:#fbbf24;font-size:10.8px;margin-top:8px;line-height:1.45}' +
      '</style>' +
      '<div class="card">' +
      '<div class="row"><span class="t">📄 Capture call transcript</span><button class="x" id="ss-z-close" title="Hide">✕</button></div>' +
      '<div class="s">Open the <b>Audio Transcript</b> panel here (or highlight the transcript text), then capture. It will wait for you to attach it to the right client in your Fiverr panel.</div>' +
      '<button class="b" id="ss-z-cap">Capture transcript</button>' +
      (msg ? '<div class="' + (msg.indexOf("✓") >= 0 ? "ok" : "warn") + '">' + msg + '</div>' : '') +
      '</div>';
    const c = shadow.getElementById("ss-z-cap");
    if (c) c.onclick = () => {
      const text = scrapeTranscript();
      if (!text || text.length < 80) { msg = "Could not find the transcript on the page. Open the Audio Transcript panel, or highlight the transcript text, then capture again. (If it still misses, send me this page's transcript element and I will target it.)"; paint(); return; }
      try {
        chrome.storage.local.set({ [KEY]: { text: text.slice(0, 300000), label: label(), captured_at: new Date().toISOString(), url: location.href } }, () => {
          const err = chrome.runtime && chrome.runtime.lastError;
          msg = err ? ("Capture failed: " + err.message) : ("Captured ✓ (" + text.length.toLocaleString() + " chars). Open the client's Fiverr chat — the SEO Season panel offers to attach it under Documents & calls.");
          paint();
        });
      } catch (e) { msg = "Capture failed: " + ((e && e.message) || "storage error"); paint(); }
    };
    const x = shadow.getElementById("ss-z-close");
    if (x) x.onclick = () => { if (host) { host.remove(); host = null; shadow = null; } };
  }

  function tick() { if (onRecording()) mount(); }
  // Zoom is a single-page app and the recording UI loads late — poll briefly.
  let n = 0; const iv = setInterval(() => { n++; tick(); if (n > 40) clearInterval(iv); }, 1500);
  tick();
})();
