/* SEO Season — Fiverr Lead Evaluator (content script)
   Reads the open Fiverr conversation from the live page and renders your engine's
   evaluation as a floating panel. No clipboard, no copy-paste. */

(function () {
  if (window.__seoSeasonFiverrLoaded) return;
  window.__seoSeasonFiverrLoaded = true;

  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const arr = (x) => (Array.isArray(x) ? x.filter(Boolean) : []);

  // ---- Shadow host so Fiverr styles never touch us -------------------------------
  const host = document.createElement("div");
  host.id = "seo-season-host";
  host.style.cssText = "position:fixed;z-index:2147483647;right:18px;bottom:18px;";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
    .launch{display:flex;align-items:center;gap:8px;cursor:pointer;border:none;border-radius:999px;padding:11px 16px;
      background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-size:13px;font-weight:600;
      box-shadow:0 8px 24px rgba(79,70,229,.4);transition:transform .15s,box-shadow .15s}
    .launch:hover{transform:translateY(-1px);box-shadow:0 12px 30px rgba(79,70,229,.5)}
    .panel{position:fixed;right:18px;bottom:18px;width:392px;max-width:calc(100vw - 36px);max-height:calc(100vh - 36px);
      display:flex;flex-direction:column;background:#0f1320;color:#e7e9f3;border:1px solid #262b3d;border-radius:16px;
      box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden}
    .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #262b3d;background:#141828}
    .hd .dot{width:8px;height:8px;border-radius:50%;background:#6366f1;box-shadow:0 0 8px #6366f1}
    .hd .ttl{font-size:13px;font-weight:700;flex:1;letter-spacing:.01em}
    .hd button{background:transparent;border:none;color:#9aa0b5;cursor:pointer;font-size:13px;padding:4px 7px;border-radius:7px}
    .hd button:hover{background:#222840;color:#fff}
    .body{padding:12px 14px;overflow-y:auto;font-size:12.5px;line-height:1.5}
    .row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:10px}
    .pill{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px}
    .pill.hot{background:#ef444422;color:#fb7185}.pill.warm{background:#f59e0b22;color:#fbbf24}.pill.cold{background:#3b82f622;color:#93c5fd}
    .pill.stage{background:#6366f122;color:#a5b4fc}
    .lbl{font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#7e84a3;margin:14px 0 5px}
    .sum{color:#c7cadb;margin-bottom:4px}
    .next{background:#6366f114;border:1px solid #6366f133;border-radius:10px;padding:9px 11px;color:#e7e9f3}
    ul{margin:0;padding-left:17px}li{margin:3px 0;color:#c7cadb}
    .risk li{color:#fb7185}
    .facts{display:flex;flex-wrap:wrap;gap:5px}
    .fact{font-size:11px;background:#1a1f33;border:1px solid #262b3d;border-radius:7px;padding:3px 7px;color:#aeb3c9}
    .fact b{color:#e7e9f3;font-weight:600}
    .act{display:flex;gap:7px;align-items:flex-start;margin:4px 0}
    .act .b{margin-top:6px;width:5px;height:5px;border-radius:50%;background:#6366f1;flex:none}
    .muted{color:#7e84a3}
    .loading{display:flex;align-items:center;gap:9px;color:#aeb3c9;padding:8px 0}
    .spin{width:15px;height:15px;border:2px solid #6366f155;border-top-color:#6366f1;border-radius:50%;animation:sp 1s linear infinite}
    @keyframes sp{to{transform:rotate(360deg)}}
    .err{background:#ef444415;border:1px solid #ef444433;border-radius:9px;padding:9px 11px;color:#fb7185;font-size:12px}
    .foot{display:flex;gap:7px;padding:10px 14px;border-top:1px solid #262b3d;background:#0c0f1a}
    .btn{flex:1;cursor:pointer;border:none;border-radius:9px;padding:8px;font-size:12px;font-weight:600}
    .btn.p{background:#4f46e5;color:#fff}.btn.p:hover{background:#5b53ea}
    .btn.s{background:#1a1f33;color:#aeb3c9;border:1px solid #262b3d}.btn.s:hover{color:#fff}
    .cfg{font-size:11px;color:#7e84a3;padding:8px 14px;border-top:1px solid #262b3d}
    .cfg input{width:100%;margin-top:4px;background:#0c0f1a;border:1px solid #262b3d;border-radius:7px;color:#e7e9f3;padding:6px 8px;font-size:11px}
    .cap{font-size:10px;color:#5b6079;margin-top:8px}
    details{margin-top:6px}summary{cursor:pointer;color:#a5b4fc;font-size:11px;font-weight:600}
  `;
  root.appendChild(style);

  const wrap = document.createElement("div");
  root.appendChild(wrap);

  let open = false;
  let lastStrategy = null;

  const launcher = () =>
    `<button class="launch" id="ss-launch"><span style="font-size:14px">◆</span> Evaluate lead</button>`;

  function render() {
    if (!open) { wrap.innerHTML = launcher(); bind(); return; }
    wrap.innerHTML = `
      <div class="panel">
        <div class="hd"><span class="dot"></span><span class="ttl">SEO Season · Lead Evaluation</span>
          <button id="ss-min" title="Minimise">—</button></div>
        <div class="body" id="ss-body"></div>
        <div class="foot">
          <button class="btn p" id="ss-eval">Evaluate this chat</button>
          <button class="btn s" id="ss-sel" title="Use the text you have highlighted">Use selection</button>
        </div>
      </div>`;
    bind();
    renderBody();
  }

  function renderBody() {
    const body = root.getElementById("ss-body");
    if (!body) return;
    if (body.dataset.state === "loading") {
      body.innerHTML = `<div class="loading"><span class="spin"></span> Reading the conversation and evaluating…</div>`;
      return;
    }
    if (body.dataset.error) { body.innerHTML = `<div class="err">${esc(body.dataset.error)}</div>`; return; }
    const s = lastStrategy;
    if (!s) {
      body.innerHTML = `<p class="muted">Open a Fiverr conversation, then hit <b>Evaluate this chat</b>. If it grabs the wrong text, highlight the conversation and use <b>Use selection</b>.</p>`;
      return;
    }
    const ds = s.deal_state || {};
    const ci = s.client_intel || {};
    const f = s.deal_facts || {};
    const temp = String(ds.temperature || "").toLowerCase();
    const cs = s.call_script || {};
    const list = (items) => arr(items).map((x) => `<li>${esc(x)}</li>`).join("");
    let h = "";
    h += `<div class="row">`;
    if (ds.stage) h += `<span class="pill stage">${esc(ds.stage)}</span>`;
    if (temp) h += `<span class="pill ${temp === "hot" ? "hot" : temp === "warm" ? "warm" : "cold"}">${esc(ds.temperature)}</span>`;
    if (s.detected_client) h += `<span class="muted">${esc(s.detected_client)}</span>`;
    h += `</div>`;
    if (ds.summary) h += `<div class="sum">${esc(ds.summary)}</div>`;
    if (s.next_move) h += `<div class="lbl">Next move</div><div class="next">${esc(s.next_move)}</div>`;
    if (arr(s.action_items).length) {
      h += `<div class="lbl">Do now</div>`;
      h += arr(s.action_items).map((a) => `<div class="act"><span class="b"></span><span>${esc(a && a.action ? a.action : a)}</span></div>`).join("");
    }
    if (arr(ci.wants).length) h += `<div class="lbl">What they want</div><ul>${list(ci.wants)}</ul>`;
    if (arr(ci.pain_points).length) h += `<div class="lbl">Pain points</div><ul>${list(ci.pain_points)}</ul>`;
    if (arr(ci.objections).length) h += `<div class="lbl">Objections / concerns</div><ul>${list(ci.objections)}</ul>`;
    if (arr(ci.buying_signals).length) h += `<div class="lbl">Buying signals</div><ul>${list(ci.buying_signals)}</ul>`;
    if (arr(s.risk_flags).length) h += `<div class="lbl">Risks</div><ul class="risk">${list(s.risk_flags)}</ul>`;
    const facts = Object.entries(f).filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) =>
      `<span class="fact"><b>${esc(k.replace(/_/g, " "))}:</b> ${esc(Array.isArray(v) ? v.join(", ") : v)}</span>`).join("");
    if (facts) h += `<div class="lbl">Facts captured</div><div class="facts">${facts}</div>`;
    if (cs.opening || arr(cs.discovery_questions).length || cs.close) {
      h += `<details><summary>Call script</summary><div style="margin-top:6px">`;
      if (cs.opening) h += `<div class="lbl">Opening</div><div class="sum">${esc(cs.opening)}</div>`;
      if (arr(cs.discovery_questions).length) h += `<div class="lbl">Discovery</div><ul>${list(cs.discovery_questions)}</ul>`;
      if (arr(cs.objection_handling).length) h += `<div class="lbl">Objection handling</div><ul>${list(cs.objection_handling)}</ul>`;
      if (cs.close) h += `<div class="lbl">Close</div><div class="sum">${esc(cs.close)}</div>`;
      h += `</div></details>`;
    }
    if (body.dataset.captured) h += `<div class="cap">Read ${esc(body.dataset.captured)} characters from the page.</div>`;
    body.innerHTML = h;
  }

  // ---- Scrape the open conversation ---------------------------------------------
  function grabText(forceSelection) {
    const sel = (window.getSelection && window.getSelection().toString() || "").trim();
    if (forceSelection) return sel;
    if (sel && sel.length > 40) return sel;
    // Heuristic: among likely containers, take the one with the most (but not absurd) text.
    let best = null, bestLen = 0;
    const seen = new Set();
    document.querySelectorAll('[class*="conversation" i],[class*="message" i],[class*="thread" i],[class*="chat" i],main,[role="main"]').forEach((el) => {
      if (seen.has(el)) return; seen.add(el);
      const t = (el.innerText || "").trim();
      if (t.length > bestLen && t.length < 80000) { best = el; bestLen = t.length; }
    });
    if (best && bestLen > 80) return best.innerText.trim();
    const main = document.querySelector('main,[role="main"]');
    return ((main && main.innerText) || document.body.innerText || "").trim();
  }

  function evaluate(forceSelection) {
    const text = grabText(forceSelection);
    const body = root.getElementById("ss-body");
    if (!text || text.length < 30) {
      if (body) { body.dataset.error = forceSelection ? "Nothing is highlighted. Select the conversation text first." : "Could not find conversation text. Try highlighting the chat and using 'Use selection'."; delete body.dataset.state; renderBody(); }
      return;
    }
    if (body) { body.dataset.state = "loading"; delete body.dataset.error; delete body.dataset.captured; renderBody(); }
    chrome.runtime.sendMessage({ type: "callEngine", action: "bd_strategize", body: { conversation: text } }, (resp) => {
      const b = root.getElementById("ss-body");
      if (!b) return;
      delete b.dataset.state;
      if (chrome.runtime.lastError) { b.dataset.error = chrome.runtime.lastError.message; renderBody(); return; }
      if (!resp || !resp.ok) { b.dataset.error = (resp && (resp.error || (resp.data && resp.data.error))) || "Request failed. Check the API address in the extension settings."; renderBody(); return; }
      const data = resp.data || {};
      if (!data.success || !data.strategy) { b.dataset.error = data.error || "The engine could not evaluate this conversation."; renderBody(); return; }
      lastStrategy = data.strategy;
      b.dataset.captured = String(text.length);
      renderBody();
    });
  }

  function bind() {
    const l = root.getElementById("ss-launch");
    if (l) l.onclick = () => { open = true; render(); if (!lastStrategy) evaluate(false); };
    const m = root.getElementById("ss-min");
    if (m) m.onclick = () => { open = false; render(); };
    const e = root.getElementById("ss-eval");
    if (e) e.onclick = () => evaluate(false);
    const s = root.getElementById("ss-sel");
    if (s) s.onclick = () => evaluate(true);
  }

  render();
})();
