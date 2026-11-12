/* Business Santa measurement: one tracker for the desktop page, the mobile page and the SEO pages.
   - Meta Pixel loads on the first scroll or tap, or 1.5 s after the page has loaded (fast page, nearly every visit counted).
   - Every event carries the page, the page type, the traffic source (UTM tags, fbclid) and the business type when known.
   - Standard events Meta can optimize ads for: PageView, ViewContent (key sections seen), Contact (WhatsApp or email), Lead (form sent).
   - Custom events for improving the page: ScrollDepth, EngagedTime, FormStart, FormError, VideoProgress, and the page's own events.
   - The same events go to /api/capi (Meta Conversions API) with the same event id, so Meta counts each once.
     That server route does nothing until a Conversions API token is set in Vercel. */
(function () {
  if (window.BST) return;
  var PX = "28943176985310116";
  var w = window, d = document, ss = {};
  try { ss = w.sessionStorage || {}; } catch (e) { }

  /* where the visitor came from: kept for the whole visit */
  var q = new URLSearchParams(location.search), src = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) { if (q.get(k)) src[k] = q.get(k).slice(0, 80); });
  if (q.get("fbclid")) src.fbclid = 1;
  try { if (Object.keys(src).length) ss.bsSrc = JSON.stringify(src); else src = JSON.parse(ss.bsSrc || "{}"); } catch (e) { }
  var ref = d.referrer ? (function () { try { return new URL(d.referrer).hostname; } catch (e) { return ""; } })() : "";
  var traffic = src.fbclid || /paid|cpc|ads?$/i.test(src.utm_medium || "") ? "paid" : src.utm_source ? "campaign"
    : /google\.|bing\.|duckduckgo\.|yahoo\./.test(ref) ? "organic" : /chatgpt|openai|perplexity|gemini|copilot|claude/.test(ref) ? "ai"
    : /facebook|instagram|fb\.|l\.instagram/.test(ref) ? "social" : ref && ref.indexOf("businesssanta.com") < 0 ? "referral" : "direct";
  var path = location.pathname.replace(/\.html$/, "") || "/";
  var ptype = path === "/" || path === "/m" ? (innerWidth <= 760 ? "home mobile" : "home desktop") : path.indexOf("/guides/") === 0 ? "guide" : "service page";
  var base = { page: path, page_type: ptype, traffic: traffic };
  if (src.utm_source) base.utm_source = src.utm_source;
  if (src.utm_campaign) base.utm_campaign = src.utm_campaign;
  if (src.utm_content) base.utm_content = src.utm_content;
  var biz = "";

  /* Meta Pixel */
  !function (f) { if (f.fbq) return; var n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; }(w);
  fbq("init", PX);
  var on = false;
  function load() { if (on) return; on = true; var t = d.createElement("script"); t.async = true; t.src = "https://connect.facebook.net/en_US/fbevents.js"; d.head.appendChild(t); }
  ["scroll", "pointerdown", "keydown", "touchstart"].forEach(function (e) { addEventListener(e, load, { once: true, passive: true }); });
  /* No touch or scroll yet: wait until the page is fully settled. The Conversions API already records the visit
     from the server, so nothing is lost by keeping Meta's 100 KB script off the first seconds of the load. */
  function later() { setTimeout(function () { (w.requestIdleCallback || setTimeout)(load, { timeout: 2000 }); }, 6000); }
  if (d.readyState === "complete") later(); else addEventListener("load", later);

  function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function mix(data) { var o = {}, k; for (k in base) o[k] = base[k]; if (biz) o.business_type = biz; for (k in data || {}) o[k] = data[k]; return o; }
  var SERVER = { PageView: 1, ViewContent: 1, Contact: 1, Lead: 1 };
  function capi(name, eid, data, user) {
    if (!SERVER[name]) return;
    try {
      var body = JSON.stringify({ event: name, id: eid, url: location.href, data: data, user: user || null });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/capi", new Blob([body], { type: "application/json" }));
      else fetch("/api/capi", { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "application/json" } });
    } catch (e) { }
  }
  function std(name, data, user) { var eid = id(), o = mix(data); try { fbq("track", name, o, { eventID: eid }); } catch (e) { } capi(name, eid, o, user); }
  function custom(name, data) { try { fbq("trackCustom", name, mix(data)); } catch (e) { } }

  std("PageView");

  /* how far people read */
  var marks = [25, 50, 75, 90], hit = {};
  addEventListener("scroll", function () {
    var h = d.documentElement, p = (h.scrollTop + innerHeight) / h.scrollHeight * 100;
    marks.forEach(function (m) { if (p >= m && !hit[m]) { hit[m] = 1; custom("ScrollDepth", { percent: m }); } });
  }, { passive: true });

  /* time actually spent looking at the page (tab visible) */
  var seen = 0, last = Date.now(), steps = [30, 90, 180], sent = {};
  setInterval(function () {
    var now = Date.now(); if (d.visibilityState === "visible") seen += (now - last) / 1000; last = now;
    steps.forEach(function (s) { if (seen >= s && !sent[s]) { sent[s] = 1; custom("EngagedTime", { seconds: s }); } });
  }, 5000);

  /* key sections seen: any element with data-track="name" that is half on screen */
  function watch() {
    if (!("IntersectionObserver" in w)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); std("ViewContent", { content_name: e.target.getAttribute("data-track") }); } });
    }, { threshold: .4 });
    d.querySelectorAll("[data-track]").forEach(function (el) { io.observe(el); });
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", watch); else watch();

  /* forms: first field touched, and which field stops people */
  d.addEventListener("focusin", function (e) {
    var f = e.target.form; if (!f || f.dataset.bsStart) return; f.dataset.bsStart = 1; custom("FormStart", { form: f.id || "form", field: e.target.id || e.target.name || "" });
  });

  /* videos: how much is watched */
  d.addEventListener("timeupdate", function (e) {
    var v = e.target; if (!v || v.tagName !== "VIDEO" || !v.duration) return;
    var p = v.currentTime / v.duration * 100; v._bs = v._bs || {};
    [25, 50, 75, 95].forEach(function (m) { if (p >= m && !v._bs[m]) { v._bs[m] = 1; custom("VideoProgress", { video: v.id || v.currentSrc.split("/").pop(), percent: m, sound: v.muted ? "off" : "on" }); } });
  }, true);

  w.BST = {
    /* a custom event, e.g. BST.event("ChoseBusinessType", { type: "Roofing" }) */
    event: custom,
    /* a standard Meta event */
    std: std,
    /* the business type the visitor picked, added to every later event */
    type: function (t) { biz = t || ""; },
    /* a WhatsApp, email or phone tap */
    contact: function (method, where) { std("Contact", { method: method, content_name: where || method }); },
    /* the free check form was sent. user = { email, phone, name, city, state } for better matching (Meta hashes it) */
    lead: function (data, user) {
      user = user || {};
      var m = {}; if (user.email) m.em = String(user.email).trim().toLowerCase();
      if (user.phone) { var ph = String(user.phone).replace(/\D/g, ""); if (ph.length === 10) ph = "1" + ph; if (ph.length >= 11) m.ph = ph; }
      if (user.name) m.fn = String(user.name).trim().split(/\s+/)[0].toLowerCase();
      if (user.city) m.ct = String(user.city).split(",")[0].trim().toLowerCase().replace(/[^a-z]/g, "");
      var st = String(user.city || "").split(",")[1]; if (st) m.st = st.trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 2);
      m.country = "us";
      try { fbq("init", PX, m); } catch (e) { }
      std("Lead", data, m);
    },
    formError: function (form, field) { custom("FormError", { form: form, field: field }); },
    source: function () { return mix({}); },
    /* one line for the lead email: how this visitor found us */
    sourceText: function () { return [traffic, src.utm_source, src.utm_campaign, src.utm_content, ref && "from " + ref, "page " + path].filter(Boolean).join(" \u00b7 "); }
  };
})();
