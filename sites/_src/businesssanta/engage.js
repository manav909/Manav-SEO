/* Business Santa engagement: a "Questions?" chat button on every page and a polite "before you go" offer.
   - Chat: instant answers to the common questions; anything else goes to our inbox by email, or straight to
     Instagram DM or WhatsApp if the visitor prefers.
   - Offer: desktop = when the mouse leaves for the address bar; phone = small bottom card after half the page or 45 s.
     At most once a week, never after a request was sent, never while someone is typing in a form,
     and small on phones (Google penalizes full-screen popups on mobile).
   Needs window.BST from track.js (loaded first). */
(function () {
  "use strict";
  var w = window, d = document;
  if (w.__bsEngage) return; w.__bsEngage = 1;
  var EMAIL = "seo@businesssanta.com", IG = "https://ig.me/m/businesssanta", WA = "https://wa.me/917009775189?text=";
  var FACE = "/assets/img/face-manav-64.webp";
  var path = location.pathname.replace(/\.html$/, "");
  if (/^\/(privacy|terms)$/.test(path)) return;
  var MOB = w.matchMedia("(max-width: 760px)").matches || w.matchMedia("(hover: none)").matches;
  var RM = w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function B() { return w.BST || { event: function () { }, contact: function () { }, lead: function () { }, source: function () { return {}; }, sourceText: function () { return ""; } }; }
  function el(tag, attrs, html) { var e = d.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function send(subject, fields) {
    var body = { _subject: subject, _template: "box", _captcha: "false", came_from: B().sourceText(), page: location.href };
    for (var k in fields) body[k] = fields[k];
    return fetch("https://formsubmit.co/ajax/" + encodeURIComponent(EMAIL), { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || String(j.success) === "false") throw new Error("send"); }); });
  }
  function goCheck() { var c = d.getElementById("check"); if (c) c.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" }); else location.href = "/#check"; }
  var okMail = function (m) { return /^\S+@\S+\.\S+$/.test(m); };

  var css = "\
.bsx,.bsx *{box-sizing:border-box}\
.bsx{font-family:inherit;-webkit-font-smoothing:antialiased}\
.bsx-fab{position:fixed;right:18px;bottom:calc(var(--bsx-b,0px) + 18px);z-index:60;display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 18px 6px 6px;border:0;border-radius:999px;background:#0b1220;color:#fff;font:700 15px/1 inherit;font-family:inherit;box-shadow:0 10px 30px rgba(11,18,32,.28);cursor:pointer;transition:transform .2s,bottom .2s}\
.bsx-fab:hover{transform:translateY(-2px)}\
.bsx-fab img{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #FDB913}\
.bsx-fab .dot{position:absolute;left:36px;top:6px;width:11px;height:11px;border-radius:50%;background:#22c55e;border:2px solid #0b1220}\
.bsx-panel{position:fixed;right:18px;bottom:calc(var(--bsx-b,0px) + 82px);z-index:61;width:370px;max-width:calc(100vw - 24px);max-height:min(620px,calc(100vh - var(--bsx-b,0px) - 110px));display:none;flex-direction:column;background:#fff;color:#0f172a;border-radius:20px;box-shadow:0 24px 60px rgba(11,18,32,.3);overflow:hidden}\
.bsx-panel.on{display:flex}\
.bsx-hd{display:flex;align-items:center;gap:12px;padding:16px 16px 14px;background:#0b1220;color:#fff}\
.bsx-hd img{width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid #FDB913}\
.bsx-hd b{display:block;font-size:16px}.bsx-hd span{font-size:13px;color:#cbd5e1}\
.bsx-x{margin-left:auto;width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:20px;cursor:pointer}\
.bsx-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f8fafc}\
.bsx-m{max-width:88%;padding:10px 13px;border-radius:16px;font-size:14.5px;line-height:1.45}\
.bsx-m.us{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:6px}\
.bsx-m.me{align-self:flex-end;background:#0b1220;color:#fff;border-bottom-right-radius:6px}\
.bsx-qs{display:flex;flex-wrap:wrap;gap:8px}\
.bsx-q{min-height:38px;padding:8px 13px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;color:#0f172a;font:600 13.5px inherit;font-family:inherit;cursor:pointer}\
.bsx-q:hover{border-color:#FDB913;background:#fffbeb}\
.bsx-q.y{background:#FDB913;border-color:#FDB913}\
.bsx-ch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff}\
.bsx-ch a,.bsx-ch button{display:flex;flex-direction:column;align-items:center;gap:4px;min-height:52px;justify-content:center;border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#0f172a;text-decoration:none;font:600 12.5px inherit;font-family:inherit;cursor:pointer}\
.bsx-ch a:hover,.bsx-ch button:hover{border-color:#0b1220}\
.bsx-ch svg{width:20px;height:20px}\
.bsx-ask{display:none;flex-direction:column;gap:8px;padding:12px 16px 14px;border-top:1px solid #e5e7eb;background:#fff}\
.bsx-ask.on{display:flex}\
.bsx-ask textarea,.bsx-ask input,.bsx-pop input{width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:12px;font:15px/1.4 inherit;font-family:inherit;color:#0f172a;background:#fff}\
.bsx-ask textarea{min-height:70px;resize:vertical}\
.bsx-ask textarea:focus,.bsx-ask input:focus,.bsx-pop input:focus{outline:2px solid #FDB913;outline-offset:1px;border-color:#FDB913}\
.bsx-btn{min-height:46px;border:0;border-radius:999px;background:#0b1220;color:#fff;font:700 15px inherit;font-family:inherit;cursor:pointer}\
.bsx-btn.y{background:#FDB913;color:#0f172a}\
.bsx-err{min-height:0;font-size:13px;color:#b42318}\
.bsx-pop{position:fixed;z-index:62;background:#fff;color:#0f172a;box-shadow:0 24px 70px rgba(11,18,32,.35)}\
.bsx-pop.dt{left:50%;top:50%;width:460px;max-width:calc(100vw - 32px);transform:translate(-50%,-50%);border-radius:22px;overflow:hidden}\
.bsx-pop.mb{left:10px;right:10px;bottom:calc(var(--bsx-b,0px) + 10px);border-radius:18px;padding:16px 16px 14px}\
.bsx-veil{position:fixed;inset:0;z-index:61;background:rgba(11,18,32,.55)}\
.bsx-pop .top{background:#0b1220;color:#fff;padding:24px 26px 20px}\
.bsx-pop .top small{display:block;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#FDB913;margin-bottom:8px}\
.bsx-pop h3{margin:0;font-size:24px;line-height:1.2}\
.bsx-pop .top p{margin:8px 0 0;font-size:15px;line-height:1.5;color:#cbd5e1}\
.bsx-pop form{display:flex;flex-direction:column;gap:10px;padding:20px 26px 22px}\
.bsx-pop .no{border:0;background:none;color:#475569;font:600 14px inherit;font-family:inherit;text-decoration:underline;cursor:pointer;min-height:40px}\
.bsx-pop .px{position:absolute;right:10px;top:10px;width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:20px;cursor:pointer}\
.bsx-pop.mb .px{background:#f1f5f9;color:#0f172a;right:8px;top:8px}\
.bsx-pop.mb b{display:block;font-size:17px;line-height:1.3;padding-right:40px}\
.bsx-pop.mb p{margin:6px 0 12px;font-size:14px;line-height:1.45;color:#334155}\
.bsx-pop.mb .bsx-btn{width:100%}\
@media (max-width:760px){.bsx-fab{padding:6px;right:12px}.bsx-fab .t{display:none}.bsx-panel{right:12px;left:12px;width:auto}}\
@media (prefers-reduced-motion:no-preference){.bsx-panel.on,.bsx-pop{animation:bsxIn .22s ease-out}}\
@keyframes bsxIn{from{opacity:0;transform:translateY(10px)}}\
.bsx-pop.dt{animation:none}";
  d.head.appendChild(el("style", {}, css));

  /* keep clear of each page's sticky bottom bar */
  function barOffset() {
    var bar = d.querySelector(".bar"), off = 0;
    if (bar) { var cs = getComputedStyle(bar), r = bar.getBoundingClientRect(); if ((cs.position === "fixed" || cs.position === "sticky") && cs.display !== "none" && cs.visibility !== "hidden" && r.top < innerHeight && r.bottom > innerHeight - 4 && r.height < 160) off = Math.max(0, innerHeight - r.top); }
    d.documentElement.style.setProperty("--bsx-b", Math.round(off) + "px");
  }
  var tick = 0; function onMove() { if (!tick) { tick = 1; requestAnimationFrame(function () { tick = 0; barOffset(); }); } }
  addEventListener("scroll", onMove, { passive: true }); addEventListener("resize", onMove);

  /* ---------- chat ---------- */
  var QA = [
    ["cost", "How much does it cost?", "Your first check is free. One-time fixes start at $120 for on-page work and $160 for technical work. Monthly plans are priced after your free check, so you only pay for what you need. No long contracts."],
    ["time", "How fast will I see results?", "Google profile fixes can help within a few weeks. Ranking across your whole area usually builds over 3 to 6 months, depending on how busy your market is."],
    ["state", "Do you work in my state?", "Yes. We work with small businesses in all 50 states. Everything happens online, by email, video call or chat, so you never have to go anywhere."],
    ["what", "What do you actually do?", "We get you found on Google Maps, Google search and AI assistants like ChatGPT: your Google profile, website fixes, listings and reviews. You approve every change."],
    ["guar", "Can you guarantee #1?", "No, and be careful with anyone who does. Google says no one can guarantee a ranking. We show you every change, and you see the results in your own Google account."]
  ];
  var IC = {
    ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8c-1-.4-1.8-1.2-2.2-2.2l.8-1-1-2z"/></svg>',
    em: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>'
  };
  var root = el("div", { "class": "bsx" });
  var fab = el("button", { "class": "bsx-fab", type: "button", "aria-expanded": "false", "aria-controls": "bsxPanel" }, '<img src="' + FACE + '" alt="" width="40" height="40"><i class="dot" aria-hidden="true"></i><span class="t">Questions? Ask us</span>');
  fab.setAttribute("aria-label", "Questions? Chat with Business Santa");
  var panel = el("div", { "class": "bsx-panel", id: "bsxPanel", role: "dialog", "aria-label": "Chat with Business Santa" },
    '<div class="bsx-hd"><img src="' + FACE + '" alt="" width="42" height="42"><div><b>Business Santa</b><span>Real people. Plain English.</span></div><button class="bsx-x" type="button" aria-label="Close chat">&times;</button></div>' +
    '<div class="bsx-body" aria-live="polite"></div>' +
    '<div class="bsx-ask"><label class="vh-bsx" style="font-size:13px;font-weight:600">Your question</label><textarea rows="3" placeholder="Type your question"></textarea><input type="email" autocomplete="email" placeholder="Your email, so we can reply"><div class="bsx-err" role="alert"></div><button class="bsx-btn" type="button">Send</button></div>' +
    '<div class="bsx-ch"><a href="' + IG + '" target="_blank" rel="noopener" data-c="Instagram">' + IC.ig + 'Instagram</a><a href="#" data-c="WhatsApp">' + IC.wa + 'WhatsApp</a><button type="button" data-c="Email">' + IC.em + 'Email</button></div>');
  root.appendChild(fab); root.appendChild(panel); d.body.appendChild(root);
  var body = panel.querySelector(".bsx-body"), ask = panel.querySelector(".bsx-ask"), asked = {};
  function say(who, html) { var m = el("div", { "class": "bsx-m " + who }, html); body.appendChild(m); body.scrollTop = body.scrollHeight; return m; }
  function menu() {
    var old = body.querySelector(".bsx-qs"); if (old) old.remove();
    var qs = el("div", { "class": "bsx-qs" });
    QA.forEach(function (q) { if (!asked[q[0]]) qs.appendChild(el("button", { "class": "bsx-q", type: "button", "data-q": q[0] }, esc(q[1]))); });
    qs.appendChild(el("button", { "class": "bsx-q y", type: "button", "data-q": "check" }, "Get my free check"));
    qs.appendChild(el("button", { "class": "bsx-q", type: "button", "data-q": "ask" }, "Ask my own question"));
    body.appendChild(qs); body.scrollTop = body.scrollHeight;
  }
  var started = false;
  function openChat(how) {
    panel.classList.add("on"); fab.setAttribute("aria-expanded", "true"); barOffset();
    if (!started) { started = true; say("us", "Hi there! I'm Manav from Business Santa. What would you like to know?"); menu(); }
    var f = panel.querySelector(".bsx-q"); if (f && !MOB) f.focus({ preventScroll: true });
    B().event("ChatOpen", { how: how || "button" });
  }
  function closeChat() { panel.classList.remove("on"); fab.setAttribute("aria-expanded", "false"); }
  fab.addEventListener("click", function () { panel.classList.contains("on") ? closeChat() : openChat("button"); });
  panel.querySelector(".bsx-x").addEventListener("click", function () { closeChat(); fab.focus(); });
  d.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("on")) { closeChat(); fab.focus(); } });
  body.addEventListener("click", function (e) {
    var b = e.target.closest(".bsx-q"); if (!b) return;
    var k = b.getAttribute("data-q");
    if (k === "check") { say("me", "I want my free check"); say("us", "Great! It takes about a minute. Taking you there now."); B().event("ChatQuestion", { q: "check" }); setTimeout(function () { closeChat(); goCheck(); }, 700); return; }
    if (k === "ask") { say("me", "I have my own question"); say("us", "Sure. Type it below and leave your email. A real person will reply, usually the same day."); ask.classList.add("on"); ask.querySelector("textarea").focus(); var q0 = body.querySelector(".bsx-qs"); if (q0) q0.remove(); B().event("ChatQuestion", { q: "own" }); return; }
    var qa = QA.filter(function (x) { return x[0] === k; })[0]; if (!qa) return;
    asked[k] = 1; say("me", esc(qa[1])); say("us", esc(qa[2])); menu(); B().event("ChatQuestion", { q: k });
  });
  ask.querySelector(".bsx-btn").addEventListener("click", function () {
    var t = ask.querySelector("textarea").value.trim(), m = ask.querySelector("input").value.trim(), er = ask.querySelector(".bsx-err"), btn = this;
    if (!t) { er.textContent = "Type your question first."; ask.querySelector("textarea").focus(); return; }
    if (!okMail(m)) { er.textContent = "Add an email we can reply to, like name@yourbusiness.com."; ask.querySelector("input").focus(); return; }
    er.textContent = ""; btn.disabled = true; btn.textContent = "Sending…";
    send("Website chat question", { _replyto: m, email: m, question: t, business_type: (B().source() || {}).business_type || "Not chosen" }).then(function () {
      say("me", esc(t)); say("us", "Thanks! We'll reply to " + esc(m) + " soon. Want your free check while you wait?");
      ask.classList.remove("on"); ask.querySelector("textarea").value = ""; btn.disabled = false; btn.textContent = "Send"; menu();
      B().contact("Chat", "chat question"); ls("bs_lead", "1");
    }).catch(function () { btn.disabled = false; btn.textContent = "Send"; er.innerHTML = 'That didn\'t go through. Email us at <a href="mailto:' + EMAIL + '">' + EMAIL + "</a>."; });
  });
  panel.querySelector(".bsx-ch").addEventListener("click", function (e) {
    var a = e.target.closest("[data-c]"); if (!a) return; var c = a.getAttribute("data-c");
    if (c === "WhatsApp") { e.preventDefault(); w.open(WA + encodeURIComponent("Hi Business Santa! I have a question about getting my business found on Google."), "_blank", "noopener"); }
    if (c === "Email") { say("me", "I'd rather email"); say("us", "No problem. Type your message below, or write to us any time at " + EMAIL + "."); ask.classList.add("on"); ask.querySelector("textarea").focus(); }
    B().contact(c, "chat widget");
  });

  /* ---------- the "before you go" offer ---------- */
  var t0 = Date.now(), shown = false, WEEK = 7 * 864e5;
  function canPop() {
    if (shown || ls("bs_lead")) return false;
    var last = +(ls("bs_pop") || 0); if (Date.now() - last < WEEK) return false;
    if (Date.now() - t0 < 12000) return false;
    if (panel.classList.contains("on")) return false;
    var a = d.activeElement; if (a && a.closest && a.closest("form")) return false;
    var done = d.querySelector("#done.on, .done.on"); if (done) return false;
    return true;
  }
  function closePop(p, veil, why) { p.remove(); if (veil) veil.remove(); B().event("PopupClosed", { why: why }); }
  function popDesktop() {
    shown = true; ls("bs_pop", String(Date.now()));
    var veil = el("div", { "class": "bsx-veil" });
    var p = el("div", { "class": "bsx bsx-pop dt", role: "dialog", "aria-modal": "true", "aria-labelledby": "bsxPopH" },
      '<button class="px" type="button" aria-label="Close">&times;</button>' +
      '<div class="top"><small>Free check · No card · No contract</small><h3 id="bsxPopH">Before you go: are customers finding you on Google Maps?</h3><p>A real person on our team checks your business and emails you your top 3 fixes. Takes about a minute.</p></div>' +
      '<form novalidate><input name="biz" autocomplete="organization" placeholder="Business name" aria-label="Business name"><input name="city" autocomplete="address-level2" placeholder="City and state" aria-label="City and state"><input name="email" type="email" autocomplete="email" placeholder="Your email" aria-label="Your email"><div class="bsx-err" role="alert"></div><button class="bsx-btn y" type="submit">Send my free check</button><button class="no" type="button">No thanks</button></form>');
    d.body.appendChild(veil); d.body.appendChild(p);
    var f = p.querySelector("form"), prev = d.activeElement; f.biz.focus();
    function shut(why) { closePop(p, veil, why); d.removeEventListener("keydown", key); if (prev && prev.focus) prev.focus({ preventScroll: true }); }
    function key(e) { if (e.key === "Escape") shut("esc"); if (e.key === "Tab") { var fs = p.querySelectorAll("button,input"), first = fs[0], last = fs[fs.length - 1]; if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); } } }
    d.addEventListener("keydown", key);
    veil.addEventListener("click", function () { shut("outside"); });
    p.querySelector(".px").addEventListener("click", function () { shut("x"); });
    p.querySelector(".no").addEventListener("click", function () { shut("no thanks"); });
    f.addEventListener("submit", function (e) {
      e.preventDefault(); var er = p.querySelector(".bsx-err"), biz = f.biz.value.trim(), city = f.city.value.trim(), m = f.email.value.trim(), btn = f.querySelector(".bsx-btn");
      if (!biz) { er.textContent = "Add your business name."; f.biz.focus(); return; }
      if (!city) { er.textContent = "Add your city and state, so we check your local competition."; f.city.focus(); return; }
      if (!okMail(m)) { er.textContent = "Add an email we can send your check to."; f.email.focus(); return; }
      er.textContent = ""; btn.disabled = true; btn.textContent = "Sending…";
      send("Free check request (popup): " + biz + " (" + city + ")", { _replyto: m, email: m, business_name: biz, city: city, business_type: (B().source() || {}).business_type || "Not chosen" }).then(function () {
        B().lead({ content_name: "Free check (popup)", method: "Popup" }, { email: m, city: city });
        f.innerHTML = '<p style="margin:0;font-size:16px;line-height:1.5"><b>Thank you!</b> Your free check is on its way to ' + esc(m) + ". Keep an eye on your inbox.</p>";
        setTimeout(function () { shut("sent"); }, 3500);
      }).catch(function () { btn.disabled = false; btn.textContent = "Send my free check"; er.innerHTML = 'That didn\'t go through. Email us at <a href="mailto:' + EMAIL + '">' + EMAIL + "</a>."; });
    });
    B().event("PopupShown", { kind: "exit" });
  }
  function popMobile() {
    shown = true; ls("bs_pop", String(Date.now())); barOffset();
    var p = el("div", { "class": "bsx bsx-pop mb", role: "dialog", "aria-label": "Free check offer" },
      '<button class="px" type="button" aria-label="Close">&times;</button><b>Are customers finding you on Google Maps?</b><p>Get a free check from a real person. Your top 3 fixes, by email. No card, no contract.</p><button class="bsx-btn y" type="button">Get my free check</button>');
    d.body.appendChild(p);
    p.querySelector(".px").addEventListener("click", function () { closePop(p, null, "x"); });
    p.querySelector(".bsx-btn").addEventListener("click", function () { closePop(p, null, "go"); B().event("PopupClick", { kind: "mobile" }); goCheck(); });
    B().event("PopupShown", { kind: "mobile" });
  }
  if (!MOB) {
    d.addEventListener("mouseout", function (e) { if (!e.relatedTarget && e.clientY <= 0 && canPop()) popDesktop(); });
  } else {
    var timer = setTimeout(function () { if (canPop()) popMobile(); }, 45000);
    addEventListener("scroll", function sc() { var h = d.documentElement.scrollHeight - innerHeight; if (h > 0 && scrollY / h > .5 && canPop()) { clearTimeout(timer); removeEventListener("scroll", sc); popMobile(); } }, { passive: true });
  }
  barOffset();
})();
