/* SEO Season — Fiverr Lead Evaluator (content script)
   Reads the open Fiverr conversation live, auto-detects attachments and calls, lets you drop
   the downloaded files into per-item slots (xlsx/csv/docx/txt parsed in-browser), and folds
   their contents into the evaluation. No clipboard scraping of file contents. */

(function () {
  if (window.__seoSeasonFiverrLoaded) return;
  window.__seoSeasonFiverrLoaded = true;

  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const arr = (x) => (Array.isArray(x) ? x.filter(Boolean) : []);

  const host = document.createElement("div");
  host.id = "seo-season-host";
  host.style.cssText = "position:fixed;z-index:2147483647;right:18px;bottom:18px;";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
    .launch{display:flex;align-items:center;gap:8px;cursor:pointer;border:none;border-radius:999px;padding:11px 16px;
      background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(79,70,229,.4)}
    .launch:hover{transform:translateY(-1px)}
    .panel{position:fixed;right:18px;bottom:18px;width:400px;max-width:calc(100vw - 36px);max-height:calc(100vh - 36px);
      display:flex;flex-direction:column;background:#0f1320;color:#e7e9f3;border:1px solid #262b3d;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden}
    .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #262b3d;background:#141828}
    .hd .dot{width:8px;height:8px;border-radius:50%;background:#6366f1;box-shadow:0 0 8px #6366f1}
    .hd .ttl{font-size:13px;font-weight:700;flex:1}
    .hd button{background:transparent;border:none;color:#9aa0b5;cursor:pointer;font-size:13px;padding:4px 7px;border-radius:7px}
    .hd button:hover{background:#222840;color:#fff}
    .syncs{font-size:10px;color:#34d399;margin-right:6px;white-space:nowrap}
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
    .fact{font-size:11px;background:#1a1f33;border:1px solid #262b3d;border-radius:7px;padding:3px 7px;color:#aeb3c9}.fact b{color:#e7e9f3;font-weight:600}
    .act{display:flex;gap:7px;align-items:flex-start;margin:4px 0}.act .b{margin-top:6px;width:5px;height:5px;border-radius:50%;background:#6366f1;flex:none}
    .muted{color:#7e84a3}
    .loading{display:flex;align-items:center;gap:9px;color:#aeb3c9;padding:8px 0}
    .spin{width:15px;height:15px;border:2px solid #6366f155;border-top-color:#6366f1;border-radius:50%;animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
    .err{background:#ef444415;border:1px solid #ef444433;border-radius:9px;padding:9px 11px;color:#fb7185;font-size:12px}
    .foot{display:flex;gap:7px;padding:10px 14px;border-top:1px solid #262b3d;background:#0c0f1a}
    .btn{flex:1;cursor:pointer;border:none;border-radius:9px;padding:8px;font-size:12px;font-weight:600}
    .btn.p{background:#4f46e5;color:#fff}.btn.p:hover{background:#5b53ea}
    .btn.s{background:#1a1f33;color:#aeb3c9;border:1px solid #262b3d}.btn.s:hover{color:#fff}
    .slot{border:1px solid #262b3d;border-radius:10px;padding:8px 9px;margin-bottom:7px;background:#141828}
    .slot-h{display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:11.5px}
    .slot-l{color:#dfe2f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
    .drop{border:1px dashed #33394f;border-radius:8px;padding:8px;font-size:11px;color:#8a90a8;text-align:center;transition:border-color .15s,background .15s}
    .drop.over{border-color:#6366f1;background:#6366f114;color:#c7cadb}
    .pick{color:#a5b4fc;cursor:pointer;text-decoration:underline}
    .pastetog{color:#a5b4fc;cursor:pointer;text-decoration:underline}
    .paste{width:100%;margin-top:6px;height:64px;background:#0c0f1a;border:1px solid #262b3d;border-radius:7px;color:#e7e9f3;padding:6px;font-size:11px;resize:vertical}
    .slot-s{font-size:10.5px;margin-top:5px;min-height:0}
    .sok{color:#34d399}.sret{color:#aeb3c9}.swarn{color:#fbbf24}.serr{color:#fb7185}
    details{margin-top:6px}summary{cursor:pointer;color:#a5b4fc;font-size:11px;font-weight:600}
  `;
  root.appendChild(style);
  const wrap = document.createElement("div");
  root.appendChild(wrap);

  let open = false, lastStrategy = null, slots = [], replies = [], replyMsg = "", askResult = null, askMsg = "";
  let dealId = "", dealName = "", deal = null, siteUrl = "", competitors = "", keywords = "", ops = {}, docsOpen = false;
  let syncedAt = 0, lastEvalLen = 0, lastEvalAt = 0, watching = false, autosaveTimer = null, suggestedTools = [], evalCached = false, evalErr = "";
  let view = "chat", inbox = [], inboxMsg = "";

  // ---- detection ---------------------------------------------------------------
  const EXT = /\.(xlsx|xls|csv|pdf|docx?|pptx?|txt|md|json|png|jpe?g|gif|zip|rar)$/i;
  const CALL = /(video call|voice call|audio call|missed call|call ended|call started|incoming call|outgoing call|zoom meeting|scheduled a call|call request|joined the call|left the call)/i;
  function uniqText(re, max) {
    const out = [], seen = new Set();
    const els = document.querySelectorAll("p,span,a,div,li");
    for (const el of els) {
      if (el.children && el.children.length) continue; // leaf only
      const t = (el.textContent || "").trim();
      if (!t || t.length > max) continue;
      if (re.test(t) && !seen.has(t)) { seen.add(t); out.push(t); }
    }
    return out;
  }
  function scan() {
    const files = uniqText(EXT, 200), calls = uniqText(CALL, 140);
    const next = [];
    files.forEach((name, i) => next.push({ id: "a" + i, kind: "attachment", label: name, text: "", status: "" }));
    calls.forEach((c, i) => next.push({ id: "c" + i, kind: "call", label: c, text: "", status: "" }));
    next.push({ id: "m", kind: "manual", label: "Other file or transcript", text: "", status: "" });
    for (const s of next) { const prev = slots.find((p) => p.label === s.label && p.kind === s.kind); if (prev) { s.text = prev.text; s.status = prev.status; } }
    slots = next;
  }

  // ---- parsing -----------------------------------------------------------------
  const readAB = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(f); });
  const readTx = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => rej(r.error); r.readAsText(f); });
  async function parseFile(file) {
    const n = (file.name || "").toLowerCase();
    try {
      if (/\.(xlsx|xls)$/.test(n) && typeof XLSX !== "undefined") {
        const wb = XLSX.read(await readAB(file), { type: "array" });
        let out = "";
        wb.SheetNames.forEach((sn) => { out += "# Sheet: " + sn + "\n" + XLSX.utils.sheet_to_csv(wb.Sheets[sn]) + "\n\n"; });
        return out.trim();
      }
      if (/\.docx$/.test(n) && typeof mammoth !== "undefined") {
        const r = await mammoth.extractRawText({ arrayBuffer: await readAB(file) });
        return String((r && r.value) || "").trim();
      }
      if (/\.(csv|txt|md|json)$/.test(n)) return (await readTx(file)).trim();
      if (/\.pdf$/.test(n)) return { unsupported: "PDF isn't read in-browser yet — paste its key text, or ask me to add PDF support." };
      if (/\.(png|jpe?g|gif)$/.test(n)) return { unsupported: "Images need OCR (not built in yet)." };
      return (await readTx(file)).trim();
    } catch (e) { return { error: String((e && e.message) || e) }; }
  }
  async function handleFile(id, file) {
    const s = slots.find((x) => x.id === id); if (!s || !file) return;
    s.status = "reading"; renderBody();
    const r = await parseFile(file);
    if (r && r.unsupported) { s.text = ""; s.status = "warn:" + r.unsupported; }
    else if (r && r.error) { s.text = ""; s.status = "err:" + r.error; }
    else if (typeof r === "string" && r.length) { s.text = r; s.status = "ok:" + r.length; if (s.kind === "manual" && file.name) s.label = file.name; }
    else { s.text = ""; s.status = "err:No readable text found in that file."; }
    renderBody();
  }

  // ---- rendering ---------------------------------------------------------------
  const launcher = () => `<button class="launch" id="ss-launch"><span style="font-size:14px">◆</span> Evaluate lead</button>`;

  function slotHtml(s) {
    const ico = s.kind === "call" ? "📞" : s.kind === "manual" ? "➕" : "📎";
    let st = "";
    if (s.status === "reading") st = `<span class="sret">reading…</span>`;
    else if (s.status.startsWith("ok:")) st = `<span class="sok">✓ read — ${esc(s.status.slice(3))} characters folded in</span>`;
    else if (s.status.startsWith("warn:")) st = `<span class="swarn">${esc(s.status.slice(5))}</span>`;
    else if (s.status.startsWith("err:")) st = `<span class="serr">${esc(s.status.slice(4))}</span>`;
    const allowPaste = s.kind !== "attachment";
    const pasted = s.status === "ok:pasted";
    return `<div class="slot">
      <div class="slot-h"><span>${ico}</span><span class="slot-l" title="${esc(s.label)}">${esc(s.label)}</span></div>
      <div class="drop" data-id="${s.id}">Drop the downloaded file here · <label class="pick">browse<input type="file" data-id="${s.id}" style="display:none"></label>${allowPaste ? ` · <span class="pastetog" data-id="${s.id}">paste text</span>` : ""}</div>
      ${allowPaste ? `<textarea class="paste" data-id="${s.id}" placeholder="…or paste transcript / text here" style="display:${pasted ? "block" : "none"}">${pasted ? esc(s.text) : ""}</textarea>` : ""}
      <div class="slot-s">${st}</div>
    </div>`;
  }

  function resultHtml(s, captured) {
    const ds = s.deal_state || {}, ci = s.client_intel || {}, f = s.deal_facts || {}, cs = s.call_script || {};
    const temp = String(ds.temperature || "").toLowerCase();
    const li = (items) => arr(items).map((x) => `<li>${esc(x)}</li>`).join("");
    let h = `<div class="row">`;
    if (ds.stage) h += `<span class="pill stage">${esc(ds.stage)}</span>`;
    if (temp) h += `<span class="pill ${temp === "hot" ? "hot" : temp === "warm" ? "warm" : "cold"}">${esc(ds.temperature)}</span>`;
    if (s.detected_client) h += `<span class="muted">${esc(s.detected_client)}</span>`;
    h += `</div>`;
    if (evalCached) h += `<div class="muted" style="font-size:10.5px;margin:2px 0 6px">Saved analysis from last time — nothing new in the chat. Tap <b>Evaluate</b> to refresh.</div>`;
    if (s.draft_reply) h += `<div class="lbl">Say this next</div><textarea class="saynext" style="width:100%;height:84px;background:#0c0f1a;border:1px solid #6366f155;border-radius:7px;color:#e7e9f3;padding:7px;font-size:11.5px;resize:vertical">${esc(s.draft_reply)}</textarea><div style="display:flex;gap:6px;margin-top:6px"><button class="sayins" style="cursor:pointer;border:none;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;background:#4f46e5;color:#fff">Insert into Fiverr</button><button class="saycpy" style="cursor:pointer;border:1px solid #262b3d;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;background:#1a1f33;color:#aeb3c9">Copy</button></div>`;
    if (s.next_move) h += `<div class="lbl">Why / next move</div><div class="next">${esc(s.next_move)}</div>`;
    if (ci.tone) h += `<div class="lbl">Client tone</div><div class="sum">${esc(ci.tone)}</div>`;
    if (s.expectations) h += `<div class="lbl">Their expectations</div><div class="sum">${esc(s.expectations)}</div>`;
    if (arr(s.risk_flags).length) h += `<div class="lbl">Watch out</div><ul class="risk">${li(s.risk_flags)}</ul>`;
    if (arr(ci.objections).length) h += `<div class="lbl">Objections to handle</div><ul>${li(ci.objections)}</ul>`;
    if (arr(s.action_items).length) h += `<div class="lbl">Do now</div>` + arr(s.action_items).map((a) => `<div class="act"><span class="b"></span><span>${esc(a && a.action ? a.action : a)}${a && a.platform_can_help ? ` <span class="muted" style="font-size:10px">· platform can run this</span>` : ""}</span></div>`).join("");
    if (arr(ci.buying_signals).length) h += `<div class="lbl">Buying signals</div><ul>${li(ci.buying_signals)}</ul>`;
    if (arr(ci.pain_points).length) h += `<div class="lbl">Pain points</div><ul>${li(ci.pain_points)}</ul>`;
    let extra = "";
    if (arr(ci.wants).length) extra += `<div class="lbl">What they want</div><ul>${li(ci.wants)}</ul>`;
    if (ds.summary) extra += `<div class="lbl">Thread summary</div><div class="sum">${esc(ds.summary)}</div>`;
    const facts = Object.entries(f).filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => `<span class="fact"><b>${esc(k.replace(/_/g, " "))}:</b> ${esc(Array.isArray(v) ? v.join(", ") : v)}</span>`).join("");
    if (facts) extra += `<div class="lbl">Facts on record</div><div class="facts">${facts}</div>`;
    if (cs.opening || arr(cs.discovery_questions).length || cs.close) {
      extra += `<div class="lbl">Call script</div>`;
      if (cs.opening) extra += `<div class="sum"><b>Open:</b> ${esc(cs.opening)}</div>`;
      if (arr(cs.discovery_questions).length) extra += `<ul>${li(cs.discovery_questions)}</ul>`;
      if (arr(cs.objection_handling).length) extra += `<ul>${li(cs.objection_handling)}</ul>`;
      if (cs.close) extra += `<div class="sum"><b>Close:</b> ${esc(cs.close)}</div>`;
    }
    if (extra) h += `<details style="margin-top:8px"><summary>More detail (summary, wants, facts, call script)</summary><div style="margin-top:6px">${extra}</div></details>`;
    if (captured) h += `<div class="muted" style="font-size:10px;margin-top:8px">Read ${esc(captured)} characters (chat + dropped files).</div>`;
    return h;
  }

  function render() {
    if (!open) { wrap.innerHTML = launcher(); bind(); return; }
    const foot = view === "inbox"
      ? `<div class="foot"><button class="btn p" id="ss-load">${inbox.length ? "Refresh list" : "Load visible leads"}</button></div>`
      : `<div class="foot"><button class="btn p" id="ss-eval">Evaluate</button><button class="btn p" id="ss-reply">✍ Reply</button><button class="btn s" id="ss-sel" title="Use highlighted text">Sel</button></div>`;
    wrap.innerHTML = `
      <div class="panel">
        <div class="hd"><span class="dot"></span><span class="ttl">SEO Season · Lead Cockpit</span><span class="syncs" id="ss-sync"></span><button id="ss-view" title="Toggle inbox board">${view === "inbox" ? "← Chat" : "Inbox"}</button><button id="ss-min" title="Minimise">—</button></div>
        <div class="body" id="ss-body"></div>
        ${foot}
      </div>`;
    bind();
    if (view === "inbox") renderInbox(); else renderBody();
  }

  function renderBody() {
    const body = root.getElementById("ss-body"); if (!body) return;
    if (view !== "chat") { renderSync(); return; }
    let h = expertHtml() + savedIntelHtml() + opsHtml();
    const detected = slots.filter((s) => s.kind !== "manual").length;
    h += `<div class="lbl" style="margin-top:0;display:flex;justify-content:space-between;align-items:center"><span id="ss-docstog" style="cursor:pointer">${docsOpen ? "▾" : "▸"} Documents &amp; calls${detected ? " (" + detected + ")" : ""}</span>${docsOpen ? `<span id="ss-rescan" style="cursor:pointer;color:#a5b4fc;text-transform:none;letter-spacing:0;font-weight:600">rescan</span>` : ""}</div>`;
    if (docsOpen) {
      const real = slots.filter((s) => s.kind !== "manual");
      if (!real.length) h += `<p class="muted" style="margin:0 0 7px">None auto-detected. Download any file from the chat and drop it below, or paste a transcript.</p>`;
      h += slots.map(slotHtml).join("");
    }
    h += `<div style="height:1px;background:#262b3d;margin:12px 0"></div>`;
    if (replyMsg === "loading") h += `<div class="loading"><span class="spin"></span> Writing reply options…</div>`;
    if (replies.length) {
      h += `<div class="lbl" style="margin-top:0">Reply drafts — edit, then insert</div>`;
      h += replies.map((v, i) => `<div class="slot"><div class="slot-h"><span>✍</span><span class="slot-l">${esc(v.label || ("Option " + (i + 1)))}</span></div><textarea class="reply" data-i="${i}" style="width:100%;height:88px;background:#0c0f1a;border:1px solid #262b3d;border-radius:7px;color:#e7e9f3;padding:7px;font-size:11.5px;resize:vertical">${esc(v.text)}</textarea><div style="display:flex;gap:6px;margin-top:6px"><button class="ins" data-i="${i}" style="cursor:pointer;border:none;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;background:#4f46e5;color:#fff">Insert into Fiverr</button><button class="cpy" data-i="${i}" style="cursor:pointer;border:1px solid #262b3d;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;background:#1a1f33;color:#aeb3c9">Copy</button></div></div>`).join("");
    }
    if (replyMsg && replyMsg !== "loading") h += `<div class="${replyMsg.indexOf("err:") === 0 ? "err" : "muted"}" style="margin:6px 0">${esc(replyMsg.replace(/^(err|ok):/, ""))}</div>`;
    if (replies.length) h += `<div style="height:1px;background:#262b3d;margin:12px 0"></div>`;
    if (body.dataset.state === "loading" || body.dataset.state === "retry") h += `<div class="loading"><span class="spin"></span> ${body.dataset.state === "retry" ? "Taking a moment — retrying…" : "Evaluating the chat + dropped files…"}</div>`;
    else if (body.dataset.error) h += `<div class="err">${esc(body.dataset.error)}</div>`;
    else if (lastStrategy) { if (evalErr) h += `<div class="err" style="margin-bottom:8px;background:#f59e0b15;border-color:#f59e0b44;color:#fbbf24">${esc(evalErr)}</div>`; h += resultHtml(lastStrategy, body.dataset.captured); }
    else h += `<p class="muted">Drop the downloaded audit / transcript into its slot above, then hit <b>Evaluate</b> — the contents get read into the analysis, not just the chat.</p>`;
    body.innerHTML = h;
    bindSlots();
    renderSync();
  }

  function maybeEvalOnOpen() {
    // Reuse the saved analysis (instant) and only spend an LLM call when there is none or the chat has grown since it synced.
    const liveLen = (grabText(false) || "").length;
    const savedLen = (deal && typeof deal.conversation === "string") ? deal.conversation.length : 0;
    const haveSaved = !!(lastStrategy && lastStrategy.deal_state);
    if (haveSaved && savedLen > 0 && liveLen - savedLen <= 150) {
      evalCached = true; lastEvalLen = liveLen; lastEvalAt = Date.now(); renderBody(); return;
    }
    evalCached = false; evaluate(false);
  }

  function grabText(forceSel) {
    const sel = (window.getSelection && window.getSelection().toString() || "").trim();
    if (forceSel) return sel;
    if (sel && sel.length > 40) return sel;
    let best = null, bestLen = 0; const seen = new Set();
    document.querySelectorAll('[class*="conversation" i],[class*="message" i],[class*="thread" i],[class*="chat" i],main,[role="main"]').forEach((el) => {
      if (seen.has(el)) return; seen.add(el);
      const t = (el.innerText || "").trim();
      if (t.length > bestLen && t.length < 80000) { best = el; bestLen = t.length; }
    });
    if (best && bestLen > 80) return best.innerText.trim();
    const main = document.querySelector('main,[role="main"]');
    return ((main && main.innerText) || document.body.innerText || "").trim();
  }

  function evaluate(forceSel, attempt) {
    attempt = attempt || 1;
    const conv = grabText(forceSel);
    const body = root.getElementById("ss-body");
    const haveFiles = slots.some((s) => s.text);
    if ((!conv || conv.length < 30) && !haveFiles) { if (body) { body.dataset.error = forceSel ? "Nothing is highlighted. Select the conversation first." : "No conversation text found. Highlight the chat and use 'Use selection'."; delete body.dataset.state; renderBody(); } return; }
    const extras = slots.filter((s) => s.text).map((s) => `\n\n[${s.kind === "call" ? "CALL TRANSCRIPT" : "ATTACHED DOCUMENT"}: ${s.label}]\n${s.text}`).join("");
    const full = (conv || "") + extras;
    if (body) { body.dataset.state = attempt > 1 ? "retry" : "loading"; delete body.dataset.error; delete body.dataset.captured; renderBody(); }
    lastEvalAt = Date.now(); evalCached = false; evalErr = "";
    chrome.runtime.sendMessage({ type: "callEngine", action: "bd_strategize", body: { conversation: full, id: dealId } }, (resp) => {
      const b = root.getElementById("ss-body"); if (!b) return;
      const data = (resp && resp.data) || {};
      if (resp && resp.ok && data.success && data.strategy) {
        delete b.dataset.state; lastStrategy = data.strategy; lastEvalLen = (conv || "").length; b.dataset.captured = String(full.length); evalErr = ""; renderBody(); autosave(); return;
      }
      if (attempt < 2) { setTimeout(() => evaluate(forceSel, attempt + 1), 1500); return; } // one quiet auto-retry — strategize timeouts are usually transient
      delete b.dataset.state;
      const errMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : (resp && (resp.error || data.error)) || "The analysis took too long. Tap Evaluate to try again.";
      if (lastStrategy && lastStrategy.deal_state) { evalErr = "Could not refresh just now — showing your last analysis. Tap Evaluate to retry."; renderBody(); }
      else { b.dataset.error = errMsg; renderBody(); }
    });
  }

  // ---- reply drafting + insertion into Fiverr's box (React-aware) --------------
  function findReplyBox() {
    const cands = Array.prototype.slice.call(document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]'));
    const vis = cands.filter((el) => {
      const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
      return r.width > 120 && r.height > 12 && st.visibility !== "hidden" && st.display !== "none" && el.offsetParent !== null;
    });
    if (!vis.length) return null;
    // composer is usually the lowest input on the page; tie-break by area
    vis.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (rb.top - ra.top) || (rb.width * rb.height - ra.width * ra.height); });
    return vis[0];
  }
  function insertIntoBox(el, text) {
    el.focus();
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") {
      const proto = tag === "textarea" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set; // native setter so React registers it
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // contenteditable / rich editor: replace contents via execCommand so React/Slate/Draft catch it
      const sel = window.getSelection(); sel.removeAllRanges();
      const range = document.createRange(); range.selectNodeContents(el); sel.addRange(range);
      let ok = false; try { ok = document.execCommand("insertText", false, text); } catch (e) { ok = false; }
      if (!ok) { el.textContent = text; try { el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" })); } catch (e) { el.dispatchEvent(new Event("input", { bubbles: true })); } }
    }
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { /* ignore */ }
    el.focus();
  }
  function draftReplies() {
    const conv = grabText(false);
    const extras = slots.filter((s) => s.text).map((s) => `\n\n[${s.kind === "call" ? "CALL TRANSCRIPT" : "ATTACHED DOCUMENT"}: ${s.label}]\n${s.text}`).join("");
    const full = (conv || "") + extras;
    if (!full || full.length < 30) { replyMsg = "err:No conversation found to reply to."; renderBody(); return; }
    replyMsg = "loading"; renderBody();
    chrome.runtime.sendMessage({ type: "callEngine", action: "bd_reply_variants", body: { conversation: full, id: dealId } }, (resp) => {
      if (chrome.runtime.lastError) { replyMsg = "err:" + chrome.runtime.lastError.message; renderBody(); return; }
      if (!resp || !resp.ok) { replyMsg = "err:" + ((resp && (resp.error || (resp.data && resp.data.error))) || "Request failed. Check the API address in settings."); renderBody(); return; }
      const data = resp.data || {};
      if (!data.success || !arr(data.variants).length) { replyMsg = "err:" + (data.error || "No reply drafts came back."); renderBody(); return; }
      replies = data.variants; replyMsg = ""; renderBody();
    });
  }
  function insertReply(i) {
    const ta = root.querySelector('.reply[data-i="' + i + '"]');
    const text = ta ? ta.value : (replies[i] && replies[i].text) || "";
    if (!text.trim()) return;
    const box = findReplyBox();
    if (!box) { replyMsg = "err:Could not find Fiverr's message box. Click into it once, then press Insert again — or use Copy."; renderBody(); return; }
    insertIntoBox(box, text);
    replyMsg = "ok:Inserted into the message box — review it and hit send on Fiverr.";
    renderBody();
  }

  // ---- the expert: ask anything / do the next move, drafted into a sendable reply ----
  const QUICK = [
    { label: "Handle objection", q: "The client has raised an objection or concern in this conversation. Identify their real objection and write an honest, senior-level response that addresses it and removes the risk — ready to send in my voice. No guaranteed rankings, no fabricated claims." },
    { label: "Answer their question", q: "Answer the client's most recent question using senior SEO and AEO expertise — accurate, specific to their situation, and honest — ready to send in my voice." },
    { label: "Explain the value", q: "In a message I can send, explain why this SEO/AEO work matters for THIS client's business and what it realistically achieves — specific to them, honest, no guarantees." },
    { label: "Pricing", q: "Help me present pricing to this client: what to quote for their situation and how to frame the value honestly, with a message ready to send." },
    { label: "Timeline", q: "Give the client an honest, senior answer on realistic SEO/AEO timelines for their situation, with a message ready to send." },
    { label: "My process", q: "Explain what I will do for this client and how I work, in clear confidence-building terms, with a message ready to send." },
    { label: "Close it", q: "Write a confident, low-pressure message that moves this client toward starting, based on where the conversation actually is — ready to send." }
  ];
  function ask(question) {
    const conv = grabText(false);
    const extras = slots.filter((s) => s.text).map((s) => `\n\n[${s.kind === "call" ? "CALL TRANSCRIPT" : "ATTACHED DOCUMENT"}: ${s.label}]\n${s.text}`).join("");
    const full = (conv || "") + extras;
    if ((!full || full.length < 20) && !question) { askMsg = "err:Open a conversation first (or use Sel to select the chat)."; renderBody(); return; }
    askMsg = "loading"; askResult = null; renderBody();
    chrome.runtime.sendMessage({ type: "callEngine", action: "bd_ask", body: { conversation: full, question, id: dealId } }, (resp) => {
      if (chrome.runtime.lastError) { askMsg = "err:" + chrome.runtime.lastError.message; renderBody(); return; }
      if (!resp || !resp.ok) { askMsg = "err:" + ((resp && (resp.error || (resp.data && resp.data.error))) || "Request failed. Check the API address in settings."); renderBody(); return; }
      const data = resp.data || {};
      if (!data.success) { askMsg = "err:" + (data.error || "Could not answer."); renderBody(); return; }
      askResult = { answer: data.answer || "", client_reply: data.client_reply || "" };
      suggestedTools = arr(data.suggested_tools);
      askMsg = (!askResult.answer && !askResult.client_reply) ? "err:Empty answer — try rephrasing." : "";
      renderBody();
    });
  }
  function expertHtml() {
    let h = `<div class="lbl" style="margin-top:0">Ask the expert · or tell it what to do</div>`;
    h += `<div style="display:flex;gap:6px;margin-bottom:8px"><input id="ss-ask" placeholder="handle their objection · answer about schema · what do I say?" style="flex:1;min-width:0;background:#0c0f1a;border:1px solid #262b3d;border-radius:8px;color:#e7e9f3;padding:7px 9px;font-size:11.5px"><button id="ss-asksend" style="cursor:pointer;border:none;border-radius:8px;padding:7px 12px;font-size:11.5px;font-weight:600;background:#4f46e5;color:#fff">Go</button></div>`;
    h += `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">`;
    QUICK.forEach((q, i) => { h += `<button class="chip" data-qi="${i}" style="cursor:pointer;border:1px solid #2b3147;background:#1a1f33;color:#c7cadb;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600">${esc(q.label)}</button>`; });
    if (lastStrategy && arr(lastStrategy.action_items).length) arr(lastStrategy.action_items).forEach((a, i) => { const act = a && a.action ? a.action : a; if (!act) return; h += `<button class="chip actitem" data-ai="${i}" title="${esc(String(act))}" style="cursor:pointer;border:1px solid #6366f155;background:#6366f114;color:#a5b4fc;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600">▶ ${esc(String(act).slice(0, 40))}${String(act).length > 40 ? "…" : ""}</button>`; });
    h += `</div>`;
    if (askMsg === "loading") h += `<div class="loading"><span class="spin"></span> Thinking like a senior SEO…</div>`;
    if (askResult) {
      if (askResult.answer) h += `<div class="lbl">Expert take</div><div class="sum">${esc(askResult.answer)}</div>`;
      if (askResult.client_reply) h += `<div class="lbl">Ready to send</div><textarea class="askreply" style="width:100%;height:84px;background:#0c0f1a;border:1px solid #262b3d;border-radius:7px;color:#e7e9f3;padding:7px;font-size:11.5px;resize:vertical">${esc(askResult.client_reply)}</textarea><div style="display:flex;gap:6px;margin-top:6px"><button class="askins" style="cursor:pointer;border:none;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;background:#4f46e5;color:#fff">Insert into Fiverr</button><button class="askcpy" style="cursor:pointer;border:1px solid #262b3d;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;background:#1a1f33;color:#aeb3c9">Copy</button></div>`;
    }
    if (suggestedTools.length) {
      const tools = suggestedTools.map((t) => ({ t, k: mapTool(t) })).filter((x) => x.k);
      if (tools.length) h += `<div class="lbl">Senior DMS suggests — run it now</div><div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px">` + tools.map((x) => `<button class="suggop" data-op="${x.k}" style="cursor:pointer;border:1px solid #34d39955;background:#34d39914;color:#6ee7b7;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600">⚡ ${esc(x.t)}</button>`).join("") + `</div>`;
    }
    if (askMsg && askMsg !== "loading") h += `<div class="${askMsg.indexOf("err:") === 0 ? "err" : "muted"}" style="margin:6px 0">${esc(askMsg.replace(/^(err|ok):/, ""))}</div>`;
    h += `<div style="height:1px;background:#262b3d;margin:12px 0"></div>`;
    return h;
  }

  // ---- client identity + saved intel + live SEO ops (persist to software, fetch back) ----
  const OPS = [
    { k: "audit", label: "Crawl & audit" },
    { k: "aeo", label: "AEO / schema" },
    { k: "competitor", label: "Competitor gap" }
  ];
  function clientHandle() {
    const p = location.pathname || "";
    const m = p.match(/\/inbox\/([^/?#]+)/i) || p.match(/\/users\/([^/?#]+)/i);
    let h = m ? decodeURIComponent(m[1]) : "";
    if (/^(inbox|messages|new|conversations)$/i.test(h)) h = "";
    return h.trim();
  }
  function detectSite(text) {
    const re = /((?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:\/[^\s)]*)?/gi;
    const skip = /(fiverr|gmail|google|youtube|facebook|fb|instagram|twitter|linkedin|whatsapp|paypal|loom|zoom|calendly|drive|docs|sheets|dropbox|bit\.ly|tinyurl|t\.co|wa\.me)\./i;
    const seen = new Set(); let best = ""; let mm;
    while ((mm = re.exec(text || ""))) {
      const d = mm[1].replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase().replace(/\.$/, "");
      if (!d.includes(".") || skip.test(d) || seen.has(d)) continue;
      const tld = d.split(".").pop();
      if (!/^[a-z]{2,24}$/.test(tld)) continue;                    // alpha TLD only — rejects ".m", ".23", "a.m.", "e.g.", versions, times
      if (!/[a-z]/.test(d.slice(0, d.lastIndexOf(".")))) continue; // the name part must contain a letter (rejects "12.34")
      seen.add(d); if (!best) best = d;
    }
    return best;
  }
  function findDeal(then) {
    if (!siteUrl) { const s = detectSite(grabText(false)); if (s) siteUrl = s; }
    const handle = clientHandle();
    if (!handle) { if (then) then(); return; }
    chrome.runtime.sendMessage({ type: "callEngine", action: "bd_deal_find", body: { client_handle: handle, platform: "fiverr", client_name: handle } }, (resp) => {
      if (resp && resp.ok && resp.data && resp.data.success && resp.data.deal) {
        deal = resp.data.deal; dealId = String(deal.id || ""); dealName = String(deal.client_name || handle);
        if (deal.strategy) lastStrategy = deal.strategy;
        renderBody();
      }
      if (then) then();
    });
  }
  function refreshDeal() {
    if (!dealId) return;
    chrome.runtime.sendMessage({ type: "callEngine", action: "bd_deal_get", body: { id: dealId } }, (resp) => {
      if (resp && resp.ok && resp.data && resp.data.success && resp.data.deal) { deal = resp.data.deal; renderBody(); }
    });
  }
  function convEl() {
    let best = null, bestLen = 0; const seen = new Set();
    document.querySelectorAll('[class*="conversation" i],[class*="message" i],[class*="thread" i],[class*="chat" i],main,[role="main"]').forEach((el) => {
      if (seen.has(el)) return; seen.add(el);
      const t = (el.innerText || "").trim();
      if (t.length > bestLen && t.length < 80000) { best = el; bestLen = t.length; }
    });
    return best || document.querySelector('main,[role="main"]') || document.body;
  }
  function renderSync() {
    const el = root.getElementById("ss-sync"); if (!el) return;
    if (!dealId) { el.textContent = watching ? "live" : ""; return; }
    if (!syncedAt) { el.textContent = "live"; el.title = "Synced with this client in the software"; return; }
    const s = Math.max(0, Math.round((Date.now() - syncedAt) / 1000));
    el.textContent = "✓ synced " + (s < 5 ? "now" : s < 60 ? s + "s" : Math.round(s / 60) + "m");
  }
  function autosave() {
    if (!dealId || !sameClient()) return;
    const conv = grabText(false); if (!conv || conv.length < 30) return;
    chrome.runtime.sendMessage({ type: "callEngine", action: "bd_deal_update", body: { id: dealId, conversation: conv, client_name: dealName || undefined } }, (resp) => {
      if (resp && resp.ok && resp.data && resp.data.success) { syncedAt = Date.now(); renderSync(); }
    });
  }
  function maybeAutoEval() {
    if (!sameClient()) return;
    const len = (grabText(false) || "").length;
    if (len - lastEvalLen > 200 && Date.now() - lastEvalAt > 90000) evaluate(false);
  }
  function watchChat() {
    if (watching) return; watching = true;
    try {
      const obs = new MutationObserver(() => { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => { autosave(); maybeAutoEval(); }, 3000); });
      obs.observe(convEl(), { childList: true, subtree: true, characterData: true });
    } catch (e) { /* ignore */ }
    setInterval(() => { autosave(); maybeAutoEval(); }, 25000); // backup for virtualized lists the observer can miss
    renderSync();
  }
  function mapTool(s) {
    s = String(s || "").toLowerCase();
    if (/competitor/.test(s)) return "competitor";
    if (/aeo|schema|geo|llms/.test(s)) return "aeo";
    if (/audit|crawl|\bsite\b/.test(s)) return "audit";
    return "";
  }
  function sameClient() {
    const h = clientHandle();
    if (!h) return false; // on the inbox list (no conversation open) — do not sync
    if (!deal || !deal.client_handle) return true;
    return h === deal.client_handle;
  }
  function runOp(k) {
    const siteEl = root.getElementById("ss-site"); const site = (siteEl ? siteEl.value : siteUrl || "").trim(); siteUrl = site;
    let action, body;
    if (k === "audit") { if (!site) { ops[k] = { err: "Add the client's website first." }; renderBody(); return; } action = "bd_run_audit"; body = { id: dealId, siteUrl: site, maxPages: 40 }; }
    else if (k === "aeo") { if (!site) { ops[k] = { err: "Add the client's website first." }; renderBody(); return; } action = "bd_aeo_check"; body = { id: dealId, siteUrl: site }; }
    else {
      const ce = root.getElementById("ss-comp"), ke = root.getElementById("ss-kw");
      const comps = (ce ? ce.value : competitors).split(",").map((x) => x.trim()).filter(Boolean);
      const kws = (ke ? ke.value : keywords).split(",").map((x) => x.trim()).filter(Boolean);
      competitors = comps.join(", "); keywords = kws.join(", ");
      if (!comps.length || !kws.length) { ops[k] = { err: "Add at least one competitor domain and a few target keywords." }; renderBody(); return; }
      action = "bd_competitor_snapshot"; body = { id: dealId, siteUrl: site, competitors: comps, keywords: kws };
    }
    ops[k] = { loading: true }; renderBody();
    chrome.runtime.sendMessage({ type: "callEngine", action, body }, (resp) => {
      if (chrome.runtime.lastError) { ops[k] = { err: chrome.runtime.lastError.message }; renderBody(); return; }
      if (!resp || !resp.ok) { ops[k] = { err: (resp && (resp.error || (resp.data && resp.data.error))) || "Request failed. Check the API address in settings." }; renderBody(); return; }
      const data = resp.data || {};
      if (!data.success) { ops[k] = { err: data.error || "Operation failed." }; renderBody(); return; }
      ops[k] = { report: data.report, done: true }; refreshDeal(); renderBody();
    });
  }
  function opSummary(k, r) {
    r = r || {};
    if (k === "audit") return `crawled ${r.pages_reachable || 0} pages${r.project_domain ? " of " + r.project_domain : ""}`;
    if (k === "aeo") { const sig = arr(r.signals); return `${sig.filter((s) => s && s.ok).length}/${sig.length} AEO signals OK; schema ${arr(r.schema_types).join(", ") || "none"}`; }
    if (k === "competitor") return String(r.summary || "competitor gap ready").slice(0, 160);
    return "done";
  }
  function savedIntelHtml() {
    if (!dealId) return "";
    const atts = (deal && Array.isArray(deal.attachments)) ? deal.attachments.filter((a) => a && a.text) : [];
    let h = `<div class="lbl" style="margin-top:0">Saved intel${dealName ? " · " + esc(dealName) : ""}</div>`;
    if (!atts.length) h += `<p class="muted" style="margin:0 0 8px">Nothing saved for this client yet. Run an SEO op below — results are stored on the deal, reused next time, and fed into every expert answer.</p>`;
    else {
      h += atts.map((a) => `<details><summary>${esc(a.kind || "note")} · ${esc(a.name || "saved")}</summary><div class="sum" style="margin-top:6px;white-space:pre-wrap">${esc(String(a.text || "").slice(0, 4000))}</div></details>`).join("");
      h += `<p class="muted" style="margin:7px 0 8px;font-size:10.5px">Stored on the deal — reused next time and fed into every expert answer.</p>`;
    }
    h += `<div style="height:1px;background:#262b3d;margin:12px 0"></div>`;
    return h;
  }
  function opsHtml() {
    let h = `<div class="lbl" style="margin-top:0">Live SEO ops <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· run on the server, saved to this client</span></div>`;
    h += `<input id="ss-site" placeholder="client website (auto-detected when present)" value="${esc(siteUrl)}" style="width:100%;background:#0c0f1a;border:1px solid #262b3d;border-radius:8px;color:#e7e9f3;padding:7px 9px;font-size:11.5px;margin-bottom:7px">`;
    h += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:7px">`;
    OPS.forEach((o) => { const busy = (ops[o.k] || {}).loading; h += `<button class="opbtn" data-op="${o.k}"${busy ? " disabled" : ""} style="cursor:${busy ? "default" : "pointer"};border:1px solid #2b3147;background:${busy ? "#0c0f1a" : "#1a1f33"};color:#c7cadb;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600">${esc(o.label)}</button>`; });
    h += `</div>`;
    h += `<div style="display:flex;gap:6px;margin-bottom:7px"><input id="ss-comp" placeholder="competitor domains, comma-separated" value="${esc(competitors)}" style="flex:1;min-width:0;background:#0c0f1a;border:1px solid #262b3d;border-radius:8px;color:#e7e9f3;padding:6px 8px;font-size:11px"><input id="ss-kw" placeholder="target keywords" value="${esc(keywords)}" style="flex:1;min-width:0;background:#0c0f1a;border:1px solid #262b3d;border-radius:8px;color:#e7e9f3;padding:6px 8px;font-size:11px"></div>`;
    OPS.forEach((o) => {
      const st = ops[o.k]; if (!st) return;
      if (st.loading) h += `<div class="loading"><span class="spin"></span> ${esc(o.label)} running on the server…</div>`;
      else if (st.err) h += `<div class="err" style="margin:4px 0">${esc(o.label)}: ${esc(st.err)}</div>`;
      else if (st.done) h += `<div class="sum" style="margin:4px 0"><b style="color:#34d399">✓ ${esc(o.label)}</b> — ${esc(opSummary(o.k, st.report))}. <span class="muted">Saved to this client + fed to the expert.</span></div>`;
    });
    h += `<div style="height:1px;background:#262b3d;margin:12px 0"></div>`;
    return h;
  }

  // ---- inbox board (strictly safe: reads only conversations already on screen — no auto-scroll, no auto-open) ----
  function inboxRows() {
    const out = []; const seen = new Set();
    document.querySelectorAll('a[href*="/inbox/"]').forEach((a) => {
      const m = (a.getAttribute("href") || "").match(/\/inbox\/([^/?#]+)/i);
      if (!m) return;
      const handle = decodeURIComponent(m[1]).trim();
      if (!handle || /^(inbox|new|conversations|archived|requests)$/i.test(handle) || seen.has(handle)) return;
      const row = a.closest("li,[role='listitem']") || a.parentElement || a;
      const txt = (row.innerText || a.innerText || "").trim();
      const lines = txt.split("\n").map((x) => x.trim()).filter(Boolean);
      const name = lines[0] || handle;
      const snippet = lines.slice(1).join(" · ").slice(0, 120);
      const unread = /unread|unseen|new-message/i.test(row.className || "") || row.querySelector('[class*="unread" i],[class*="unseen" i]') != null;
      seen.add(handle);
      out.push({ handle, name, snippet, unread });
    });
    return out;
  }
  function sortInbox(rows) {
    const t = (x) => x === "hot" ? 0 : x === "warm" ? 1 : x === "cold" ? 2 : 3;
    return rows.slice().sort((a, b) => (Number(b.unread) - Number(a.unread)) || (t(a.temperature) - t(b.temperature)) || (String(b.last_message_at || "").localeCompare(String(a.last_message_at || ""))));
  }
  function loadInbox() {
    const rows = inboxRows();
    if (!rows.length) { inbox = []; inboxMsg = "err:No conversations visible. Open your Fiverr inbox and scroll to the ones you want loaded, then Refresh."; renderInbox(); return; }
    inbox = rows; inboxMsg = "enriching"; renderInbox();
    chrome.runtime.sendMessage({ type: "callEngine", action: "bd_deal_lookup", body: { platform: "fiverr", handles: rows.map((r) => r.handle) } }, (resp) => {
      if (resp && resp.ok && resp.data && resp.data.success && Array.isArray(resp.data.deals)) {
        const byh = {}; resp.data.deals.forEach((d) => { byh[d.client_handle] = d; });
        inbox = inbox.map((r) => byh[r.handle] ? Object.assign({}, r, { stage: byh[r.handle].stage, temperature: byh[r.handle].temperature, status: byh[r.handle].status, evaluated: byh[r.handle].evaluated, has_intel: byh[r.handle].has_intel, last_message_at: byh[r.handle].last_message_at }) : r);
      }
      inbox = sortInbox(inbox); inboxMsg = ""; renderInbox();
    });
  }
  function navTo(handle) {
    const a = Array.prototype.slice.call(document.querySelectorAll('a[href*="/inbox/' + handle + '"]'))[0];
    if (a) a.click(); else location.href = "/inbox/" + handle;
  }
  function openLead(handle) {
    navTo(handle);
    view = "chat"; lastStrategy = null; deal = null; dealId = ""; replies = []; askResult = null; ops = {}; suggestedTools = []; siteUrl = ""; lastEvalLen = 0;
    render();
    let tries = 0;
    const wait = () => { tries++; if (clientHandle() === handle || tries > 12) { findDeal(() => maybeEvalOnOpen()); return; } setTimeout(wait, 350); };
    setTimeout(wait, 400);
  }
  function renderInbox() {
    const body = root.getElementById("ss-body"); if (!body) return;
    let h = "";
    if (inboxMsg.indexOf("err:") === 0) h += `<div class="err" style="margin-bottom:8px">${esc(inboxMsg.slice(4))}</div>`;
    else if (inboxMsg === "enriching") h += `<div class="loading"><span class="spin"></span> Matching to your deals…</div>`;
    if (inbox.length) {
      h += `<div class="lbl" style="margin-top:0">On screen · ${inbox.length} leads</div>`;
      h += inbox.map((r) => {
        const temp = String(r.temperature || "").toLowerCase();
        const pill = temp ? `<span class="pill ${temp === "hot" ? "hot" : temp === "warm" ? "warm" : "cold"}" style="margin-left:auto">${esc(r.temperature)}</span>` : (r.unread ? `<span class="pill hot" style="margin-left:auto">needs reply</span>` : "");
        const sub = [r.stage ? esc(r.stage) : "", r.snippet ? esc(r.snippet) : ""].filter(Boolean).join(" · ");
        return `<button class="leadrow" data-h="${esc(r.handle)}" style="display:block;width:100%;text-align:left;cursor:pointer;border:1px solid ${r.unread ? "#6366f155" : "#262b3d"};border-radius:10px;padding:8px 10px;margin-bottom:6px;background:${r.unread ? "#6366f114" : "#141828"};color:#e7e9f3"><div style="display:flex;align-items:center;gap:7px"><span style="font-weight:600;font-size:12px">${r.unread ? "● " : ""}${esc(r.name)}</span>${pill}</div>${sub ? `<div class="muted" style="font-size:10.5px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div>` : ""}</button>`;
      }).join("");
      h += `<p class="muted" style="font-size:10.5px;margin-top:8px">Reads only the conversations currently on your screen — it never scrolls or opens chats on its own. Scroll your Fiverr inbox to load more, then Refresh. Tap a lead to open it.</p>`;
    } else if (!inboxMsg) {
      h += `<p class="muted">Tap <b>Load visible leads</b> to read the conversations currently showing in your inbox. Hot/warm/cold and stage show for leads you have already worked. It reads only what is on screen — no auto-scroll, no auto-open. Scroll Fiverr yourself to load more.</p>`;
    }
    body.innerHTML = h;
    root.querySelectorAll(".leadrow").forEach((b) => b.addEventListener("click", () => openLead(b.dataset.h)));
    renderSync();
  }

  function bindSlots() {
    root.querySelectorAll(".drop").forEach((d) => {
      d.addEventListener("dragover", (e) => { e.preventDefault(); d.classList.add("over"); });
      d.addEventListener("dragleave", () => d.classList.remove("over"));
      d.addEventListener("drop", (e) => { e.preventDefault(); d.classList.remove("over"); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(d.dataset.id, f); });
    });
    root.querySelectorAll('input[type="file"]').forEach((inp) => inp.addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) handleFile(inp.dataset.id, f); }));
    root.querySelectorAll(".pastetog").forEach((p) => p.addEventListener("click", () => { const ta = root.querySelector('.paste[data-id="' + p.dataset.id + '"]'); if (ta) ta.style.display = ta.style.display === "none" ? "block" : "none"; }));
    root.querySelectorAll(".paste").forEach((ta) => ta.addEventListener("input", (e) => { const s = slots.find((x) => x.id === ta.dataset.id); if (s) { s.text = e.target.value; s.status = e.target.value ? "ok:pasted" : ""; } }));
    root.querySelectorAll(".reply").forEach((ta) => ta.addEventListener("input", (e) => { const i = +ta.dataset.i; if (replies[i]) replies[i].text = e.target.value; }));
    root.querySelectorAll(".ins").forEach((b) => b.addEventListener("click", () => insertReply(+b.dataset.i)));
    root.querySelectorAll(".cpy").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.i; const ta = root.querySelector('.reply[data-i="' + i + '"]'); const t = ta ? ta.value : (replies[i] && replies[i].text) || ""; try { navigator.clipboard.writeText(t); } catch (e) { /* ignore */ } b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy"; }, 1200); }));
    const ai = root.getElementById("ss-ask");
    if (ai) ai.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ask(ai.value.trim()); } });
    const asb = root.getElementById("ss-asksend"); if (asb) asb.onclick = () => { const v = root.getElementById("ss-ask"); ask(v ? v.value.trim() : ""); };
    root.querySelectorAll(".chip[data-qi]").forEach((b) => b.addEventListener("click", () => ask(QUICK[+b.dataset.qi].q)));
    root.querySelectorAll(".chip[data-ai]").forEach((b) => b.addEventListener("click", () => { const items = arr(lastStrategy && lastStrategy.action_items); const a = items[+b.dataset.ai]; const act = a && a.action ? a.action : a; if (act) ask("Do this for the client now and draft exactly what to send: " + act); }));
    root.querySelectorAll(".askreply").forEach((ta) => ta.addEventListener("input", (e) => { if (askResult) askResult.client_reply = e.target.value; }));
    const aii = root.querySelector(".askins"); if (aii) aii.onclick = () => { const ta = root.querySelector(".askreply"); const t = ta ? ta.value : (askResult && askResult.client_reply) || ""; if (!t.trim()) return; const box = findReplyBox(); if (!box) { askMsg = "err:Could not find Fiverr's message box. Click into it once, then press Insert again — or use Copy."; renderBody(); return; } insertIntoBox(box, t); askMsg = "ok:Inserted into the message box — review it and hit send on Fiverr."; renderBody(); };
    const aic = root.querySelector(".askcpy"); if (aic) aic.onclick = () => { const ta = root.querySelector(".askreply"); const t = ta ? ta.value : (askResult && askResult.client_reply) || ""; try { navigator.clipboard.writeText(t); } catch (e) { /* ignore */ } aic.textContent = "Copied"; setTimeout(() => { aic.textContent = "Copy"; }, 1200); };
    root.querySelectorAll(".opbtn").forEach((b) => b.addEventListener("click", () => runOp(b.dataset.op)));
    root.querySelectorAll(".suggop").forEach((b) => b.addEventListener("click", () => runOp(b.dataset.op)));
    root.querySelectorAll(".saynext").forEach((ta) => ta.addEventListener("input", (e) => { if (lastStrategy) lastStrategy.draft_reply = e.target.value; }));
    const syi = root.querySelector(".sayins"); if (syi) syi.onclick = () => { const ta = root.querySelector(".saynext"); const t = ta ? ta.value : (lastStrategy && lastStrategy.draft_reply) || ""; if (!t.trim()) return; const box = findReplyBox(); if (!box) { askMsg = "err:Could not find Fiverr's message box. Click into it once, then press Insert again — or use Copy."; renderBody(); return; } insertIntoBox(box, t); };
    const syc = root.querySelector(".saycpy"); if (syc) syc.onclick = () => { const ta = root.querySelector(".saynext"); const t = ta ? ta.value : (lastStrategy && lastStrategy.draft_reply) || ""; try { navigator.clipboard.writeText(t); } catch (e) { /* ignore */ } syc.textContent = "Copied"; setTimeout(() => { syc.textContent = "Copy"; }, 1200); };
    const si = root.getElementById("ss-site"); if (si) si.addEventListener("input", (e) => { siteUrl = e.target.value; });
    const ce = root.getElementById("ss-comp"); if (ce) ce.addEventListener("input", (e) => { competitors = e.target.value; });
    const ke = root.getElementById("ss-kw"); if (ke) ke.addEventListener("input", (e) => { keywords = e.target.value; });
    const dt = root.getElementById("ss-docstog"); if (dt) dt.onclick = () => { docsOpen = !docsOpen; renderBody(); };
    const rs = root.getElementById("ss-rescan"); if (rs) rs.onclick = () => { scan(); renderBody(); };
  }

  function bind() {
    const l = root.getElementById("ss-launch"); if (l) l.onclick = () => { open = true; scan(); render(); findDeal(() => { maybeEvalOnOpen(); watchChat(); }); };
    const m = root.getElementById("ss-min"); if (m) m.onclick = () => { open = false; render(); };
    const v = root.getElementById("ss-view"); if (v) v.onclick = () => { view = view === "inbox" ? "chat" : "inbox"; render(); if (view === "inbox" && !inbox.length && !inboxMsg) loadInbox(); };
    const ld = root.getElementById("ss-load"); if (ld) ld.onclick = () => loadInbox();
    const e = root.getElementById("ss-eval"); if (e) e.onclick = () => evaluate(false);
    const rp = root.getElementById("ss-reply"); if (rp) rp.onclick = () => draftReplies();
    const s = root.getElementById("ss-sel"); if (s) s.onclick = () => evaluate(true);
  }

  render();
})();
