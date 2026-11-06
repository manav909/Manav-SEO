/* Business Santa landing page. Native scrolling, compositor-only animations, no libraries. */
import { buildGrow } from "./grow.js";

const CONFIG = { whatsapp: "917009775189", email: "seo@businesssanta.com", metaPixelId: "28943176985310116" };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOB = () => innerWidth <= 760;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = ms => new Promise(r => setTimeout(r, ms));
function tween(d, fn, done) {
  const t0 = performance.now(); let id = 0, dead = false;
  const step = now => { if (dead) return; const p = Math.min(1, (now - t0) / d); fn(1 - Math.pow(1 - p, 3)); if (p < 1) id = requestAnimationFrame(step); else if (done) done(); };
  id = requestAnimationFrame(step); return () => { dead = true; cancelAnimationFrame(id); };
}
$("#yr").textContent = new Date().getFullYear();

/* ---------- Meta Pixel: events queue at once, the script loads after the first scroll or tap ---------- */
!function (f) { if (f.fbq) return; const n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; }(window);
fbq("init", CONFIG.metaPixelId); fbq("track", "PageView");
let pxOn = false;
const loadPixel = () => { if (pxOn) return; pxOn = true; const t = document.createElement("script"); t.async = true; t.src = "https://connect.facebook.net/en_US/fbevents.js"; document.head.appendChild(t); };
["scroll", "pointerdown", "keydown", "touchstart"].forEach(e => addEventListener(e, loadPixel, { once: true, passive: true }));
addEventListener("load", () => setTimeout(loadPixel, 6000));
const track = (ev, d) => { try { fbq("track", ev, d || {}); } catch (e) { } };
const trackC = (ev, d) => { try { fbq("trackCustom", ev, d || {}); } catch (e) { } };

/* ---------- business types ---------- */
const TYPES = {
  plumbing: { worth: 350, l: "Plumbing", pn: "Rivera Plumbing", pw: "riveraplumbing.com", n: "Your Plumbing Co.", q: "plumber near me", svc: "Plumber", qs: ["plumber near me", "emergency plumber open now", "water heater repair", "who fixes leaky pipes"], c: ["Mike's Plumbing", "FastFlow Pipe Co.", "City Rooter Pros"], a: "plumber", why: '"plumber near me"', book: "Water heater check, tomorrow 10 AM" },
  restaurant: { worth: 60, l: "Restaurant", pn: "Rosa's Kitchen", pw: "rosaskitchen.com", n: "Your Restaurant", q: "best restaurant near me", svc: "Restaurant", qs: ["best restaurant near me", "dinner open late", "takeout near me", "good spot for date night"], c: ["Tony's Grill", "Main Street Diner", "The Corner Kitchen"], a: "restaurant", why: '"dinner near me"', book: "Table for 4, Friday 7 PM" },
  dental: { worth: 300, l: "Dental", pn: "Lakeside Dental", pw: "lakesidedental.com", n: "Your Dental Office", q: "dentist near me", svc: "Dentist", qs: ["dentist near me", "emergency dentist today", "teeth cleaning near me", "dentist taking new patients"], c: ["Bright Smile Dental", "Family Dental Care", "Downtown Dentistry"], a: "dentist", why: '"dentist near me"', book: "New patient cleaning, Monday 9 AM" },
  roofing: { worth: 1500, l: "Roofing", pn: "Summit Roofing", pw: "summitroofing.com", n: "Your Roofing Co.", q: "roofer near me", svc: "Roofer", qs: ["roofer near me", "roof leak repair", "storm damage roof", "new roof cost"], c: ["Top Notch Roofing", "Peak Roof Pros", "All Weather Roofing"], a: "roofer", why: '"roof leak repair"', book: "Free roof estimate, Thursday 2 PM" },
  salon: { worth: 80, l: "Salon or spa", pn: "Bella Hair Studio", pw: "bellahairstudio.com", n: "Your Salon", q: "hair salon near me", svc: "Hair salon", qs: ["hair salon near me", "haircut open now", "nail salon walk in", "best massage nearby"], c: ["Glow Studio", "Main Street Cuts", "Luxe Hair Bar"], a: "salon", why: '"haircut near me"', book: "Cut and color, Saturday 11 AM" },
  law: { worth: 1500, l: "Law office", pn: "Carter Law Firm", pw: "carterlawfirm.com", n: "Your Law Office", q: "lawyer near me", svc: "Lawyer", qs: ["lawyer near me", "car accident lawyer", "free consultation attorney", "family lawyer near me"], c: ["Smith and Cole Law", "Justice Legal Group", "Parker Law Office"], a: "lawyer", why: '"lawyer near me"', book: "Free consultation, Wednesday 3 PM" },
  store: { worth: 50, l: "Shop or store", pn: "Willow Gift Shop", pw: "willowgiftshop.com", n: "Your Store", q: "gift shop near me", svc: "Gift shop", qs: ["gift shop near me", "store open Sunday", "local boutique", "unique gifts nearby"], c: ["The Gift Box", "Maple and Co.", "Corner Boutique"], a: "shop", why: '"gift shop near me"', book: "Order pickup, today 5 PM" },
  other: { worth: 150, l: "Something else", pn: "Rivera and Sons", pw: "riveraandsons.com", n: "Your Business", q: "best service near me", svc: "Local business", qs: ["best service near me", "open now near me", "top rated near me", "who can help with this"], c: ["Main Street Pros", "Hometown Experts", "City Service Co."], a: "local business", why: '"near me"', book: "Appointment, tomorrow 10 AM" }
};
let T = "plumbing";
const fType = $("#fType"), chips = $("#chips");
$$("#chips button").forEach(b => b.addEventListener("click", () => { setType(b.dataset.k); trackC("ChoseBusinessType", { type: TYPES[b.dataset.k].l }); }));
fType.addEventListener("change", () => setType(fType.value));
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "");
const res = (name, rating, count, me) => `<div class="res${me ? " me" : ""}">${me ? '<span class="tg">You</span>' : ""}<div class="u">${slug(name)}.com</div><div class="t">${esc(name)}</div><div class="st">★★★★★ ${rating} <span>(${count}) · Open now</span></div></div>`;
function setType(k) {
  T = k; const v = TYPES[k];
  $$("#chips button").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === k));
  fType.value = k;
  $("#fName").placeholder = v.pn; $("#fSite").placeholder = v.pw; $("#eMail").placeholder = "maria@" + v.pw;
  shopLook(k);
  $$(".qtxt").forEach(e => e.textContent = v.q);
  $$(".bName").forEach(e => e.textContent = v.n);
  $$(".pName").forEach(e => e.textContent = v.pn); $$(".tA").forEach(e => e.textContent = v.a); $$(".cmpN").forEach(e => e.textContent = v.c[0]);
  $("#aicT").innerHTML = `Try <b>${esc(v.n)}</b>. People mention fast replies and fair prices.`;
  $("#n4T").textContent = `You're #1 on Google Maps for "${v.q}" now. 6 new calls this week!`;
  $("#hpBook").textContent = v.book; grow.name(v.n);
  $("#wVal").value = v.worth; worth();
  heroLoop();
  buildList(); setChapter(Math.max(cur, 0), true);
}

/* ---------- real aerial video behind the page, picked by the visitor's time of day ---------- */
const NT = {};
const TOD = document.documentElement.dataset.t, bgv = $("#bgv"), vid = $("#bgvid");
let seeVis = 1;
function hwVideo() {
  if (RM || (navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || "")))) return false;
  try { const g = document.createElement("canvas").getContext("webgl", { failIfMajorPerformanceCaveat: true }); if (!g) return false; const d = g.getExtension("WEBGL_debug_renderer_info"); return !/swiftshader|llvmpipe|software|softpipe/i.test(String(d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER))); } catch (e) { return false; }
}
const portrait = () => innerHeight > innerWidth;
let vidAsked = false;
function startVideo() {
  if (vidAsked) return; vidAsked = true;
  if (!/[?&]video=1/.test(location.search) && !hwVideo()) return;
  const c = navigator.connection, fast = !c || (c.downlink || 10) >= 6, kind = portrait() ? "m" : "d";
  vid.src = `/assets/video/${TOD}-${kind}${fast ? "1080" : "720"}.mp4`;
  vid.addEventListener("playing", () => bgv.classList.add("on"), { once: true });
  const pl = vid.play(); if (pl && pl.catch) pl.catch(() => { });
}
["scroll", "pointerdown", "touchstart", "keydown"].forEach(e => addEventListener(e, () => (window.requestIdleCallback || setTimeout)(startVideo, { timeout: 500 }), { once: true, passive: true }));
addEventListener("load", () => {
  const im = new Image(), u = `/assets/video/${TOD}-${portrait() ? "mp" : "dp"}.webp`; im.onload = () => { if (!bgv.classList.contains("on")) bgv.style.backgroundImage = `url(${u})`; }; im.src = u;
  setTimeout(() => (window.requestIdleCallback || setTimeout)(startVideo, { timeout: 800 }), 2200);
});
const seen = new Set();
const seeIO = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? seen.add(e.target) : seen.delete(e.target)); seeVis = seen.size; if (vid.src) { if (seeVis && !document.hidden) { const pl = vid.play(); if (pl && pl.catch) pl.catch(() => { }); } else vid.pause(); } });
$$(".see").forEach(e => seeIO.observe(e));
document.addEventListener("visibilitychange", () => { if (!vid.src) return; if (document.hidden) vid.pause(); else if (seeVis) vid.play().catch(() => { }); });

/* ---------- hero phone: a search that ends with your phone ringing ---------- */
let heroRun = 0, heroVis = true;
new IntersectionObserver(es => heroVis = es[0].isIntersecting).observe($(".hstage"));
async function heroLoop() {
  const id = ++heroRun, v = TYPES[T], alive = () => id === heroRun;
  const q = $("#hpQ"), card = $("#hpMe"), ai = $("#hpAi"), aiT = $("#hpAiT"), note = $("#hpNote"), fl = $$(".hstage .float");
  $("#hpSvc").textContent = v.svc;
  const say = `For "${v.q}", try <em>${esc(v.n)}</em>. People mention fast replies and fair prices.`;
  const all = on => { card.classList.toggle("on", on); card.classList.toggle("st", on); card.classList.toggle("calling", on); ai.classList.toggle("on", on); note.classList.toggle("on", on); fl.forEach(f => f.classList.toggle("on", on)); if (on) aiT.innerHTML = say; };
  if (RM) { q.textContent = v.q; all(true); return; }
  while (alive()) {
    while (!heroVis && alive()) await wait(400);
    all(false); aiT.innerHTML = ""; q.textContent = ""; await wait(700); if (!alive()) return;
    for (let i = 1; i <= v.q.length; i++) { if (!alive()) return; q.textContent = v.q.slice(0, i); await wait(50 + Math.random() * 45); }
    await wait(350); card.classList.add("on");
    await wait(700); if (!alive()) return; card.classList.add("st");
    await wait(700); if (!alive()) return; ai.classList.add("on");
    const words = say.split(" "); for (let k = 1; k <= words.length; k++) { if (!alive()) return; aiT.innerHTML = words.slice(0, k).join(" "); await wait(55); }
    await wait(500); if (!alive()) return; note.classList.add("on"); card.classList.add("calling");
    for (const f of fl) { await wait(420); if (!alive()) return; f.classList.add("on"); }
    await wait(3600); if (!alive()) return;
    note.classList.remove("on"); card.classList.remove("calling"); fl.forEach(f => f.classList.remove("on")); await wait(500);
  }
}

/* ---------- story: one search, one phone, your business climbing step by step ---------- */
const stage = $("#stage"), chs = $$(".ch"), steps = $$("#steps6 span"), rl = $("#rl");
const LIT = [.55, .62, .72, .82, .92, 1], WARM = [0, .1, .25, .5, .75, 1], FOC = [24, 30, 26, 18, 22, 16];
const SPOT = ["Not found", "Bottom of page 1", "#2 on Google", "#1 on Google Maps", "#1 on Google Maps", "#1 on Google Maps"];
let cur = -1;
function buildList() {
  const v = TYPES[T];
  rl.innerHTML = `<div class="rme" data-id="me"><div><div class="res me"><span class="tg">You</span><div class="u">${slug(v.n)}.com</div><div class="t" id="meT">${esc(v.n)}</div><div class="st" id="meS">No reviews yet</div></div></div></div>` +
    v.c.concat(["Quick Fix " + v.svc]).map((c, i) => `<div class="res" data-id="c${i}"><div class="u">${slug(c)}.com</div><div class="t">${esc(c)}</div><div class="st">★★★★★ ${(4.8 - i * .1).toFixed(1)} <span>(${214 - i * 41}) · Open now</span></div></div>`).join("");
}
const ORDER = [["c0", "c1", "c2", "c3", "me"], ["c0", "c1", "c2", "me", "c3"], ["c0", "me", "c1", "c2", "c3"], ["me", "c0", "c1", "c2", "c3"]];
let flip = false;
function reorder(ids) {
  const els = [...rl.children], first = flip ? new Map(els.map(e => [e, e.getBoundingClientRect().top])) : null;
  ids.forEach(id => rl.appendChild(rl.querySelector(`[data-id="${id}"]`)));
  if (RM || !first) { flip = true; return; }
  els.forEach(e => { const d = first.get(e) - e.getBoundingClientRect().top; if (d) { e.style.transition = "none"; e.style.transform = `translateY(${d}px)`; } });
  requestAnimationFrame(() => requestAnimationFrame(() => els.forEach(e => { e.style.transition = ""; e.style.transform = ""; })));
}
function setChapter(i, force, inBridge) {
  stage.classList.toggle("inb", !!inBridge);
  if (i === cur && !force) return; cur = i;
  const v = TYPES[T];
  chs.forEach((c, k) => { c.classList.toggle("on", k === i); c.classList.toggle("past", k < i); });
  steps.forEach((s, k) => { s.classList.toggle("on", k === i); s.classList.toggle("pass", k < i); });
  const me = rl.querySelector('[data-id="me"]');
  me.classList.toggle("on", i >= 1);
  $("#meT").textContent = i >= 2 ? `${v.n} · ${v.svc} Near You, Open Now` : v.n;
  $("#meS").innerHTML = i >= 2 ? `★★★★★ 4.9 <span>(86) · Open now</span>` : "No reviews yet";
  $("#miss").classList.toggle("off", i >= 1);
  $("#spotV").textContent = SPOT[i]; $("#spot").classList.toggle("up", i >= 1);
  $("#mpack").classList.toggle("on", i >= 3); $("#aic").classList.toggle("on", i >= 3);
  const ib = stage.classList.contains("inb");
  $("#n1").classList.toggle("on", !ib && i === 1); $("#n4").classList.toggle("on", !ib && i === 4); $("#n5").classList.toggle("on", !ib && i === 5);
  reorder(ORDER[Math.min(i, 3)]);
}

/* ---------- "this is what busy looks like": a live lock screen per business ---------- */
const BUSY = [
  { a1: 2, b1: 46, l1: "orders today", a2: 1, b2: 38, l2: "5-star reviews this month", line: "Orders coming in faster than they can pack them.", dream: "A second store across town.", w: ["#f7a8b8", "#7b5cd6", "#3a2a66", "#c0608a"],
    did: ["Store pages Google can read", "Products in shoppers' words", "Google Maps listing", "Reviews flowing in"],
    feed: [["#0ea5e9", "$", "New order · $86", "Linen wrap dress"], ["#f59e0b", "★", "New 5-star review", "“Finally found my go-to boutique.”"], ["#0ea5e9", "$", "New order · $142", "2 items, ships today"], ["#34a853", "➚", "32 people asked for directions", "Google Maps, this week"], ["#0ea5e9", "$", "New order · $210", "3 items"]] },
  { a1: 1, b1: 14, l1: "jobs booked this week", a2: 0, b2: 22, l2: "new reviews this month", line: "Booked two weeks ahead. First Saturday off in two years.", dream: "Kids through college, on the family business.", w: ["#7dd3fc", "#1e40af", "#0f1e4a", "#2563eb"],
    did: ["Website fixed and faster", "A page for every town served", "Google Maps listing", "Named in ChatGPT answers"],
    feed: [["#34c759", "✆", "New customer calling", "from Google Maps"], ["#ef4444", "▦", "Booked: water heater check", "Tuesday, 10:00 AM"], ["#34c759", "✉", "“Can you come out today?”", "a new customer"], ["#f59e0b", "★", "New 5-star review", "“On time and fair.”"], ["#ef4444", "▦", "Booked: drain clean", "Wednesday, 2:00 PM"]] },
  { a1: 40, b1: 180, l1: "croissants sold today", a2: 9, b2: 312, l2: "reviews on Google", line: "Sold out by 11 AM. A line out the door on Saturdays.", dream: "A second shop, with Grandma's photo by the register.", w: ["#fcd34d", "#c2410c", "#4a1d0c", "#f59e0b"],
    did: ["Menu pages people can find", "Maps photos and hours", "Recommended by AI assistants", "Listed on local directories"],
    feed: [["#0ea5e9", "$", "Pickup order · 2 dozen croissants", "ready at 7:30 AM"], ["#34a853", "◉", "Busier than usual right now", "Google Maps"], ["#111111", "✳", "ChatGPT recommended you", "for “best croissants near me”"], ["#f59e0b", "★", "New 5-star review", "“Worth the line.”"], ["#0ea5e9", "$", "Birthday cake order", "Saturday pickup"]] },
  { a1: 4, b1: 29, l1: "new patients this month", a2: 2, b2: 41, l2: "5-star reviews this month", line: "New patient requests, every single day.", dream: "A second dentist, and a real family vacation.", w: ["#a7f3d0", "#0e7490", "#0b2e3a", "#14b8a6"],
    did: ["Trust pages with real reviews", "Booking that works on phones", "Google and Maps for every service", "Found in AI answers"],
    feed: [["#ef4444", "▦", "New patient: cleaning", "Monday, 9:00 AM"], ["#34c759", "✆", "New patient calling", "from Google Search"], ["#f59e0b", "★", "New 5-star review", "“Gentle and kind.”"], ["#ef4444", "▦", "New patient: kids checkup", "Tuesday, 4:00 PM"], ["#ef4444", "▦", "New patient: whitening", "Thursday, 11:00 AM"]] }
];
const DE = ["🏬", "🎓", "🥐", "🏖️"];
const BEFORE = [
  { line: "Before: a beautiful store, and almost no orders.", feed: [["#94a3b8", "0", "No new orders today", "Last order: 3 days ago"], ["#c13584", "♡", "14 likes on your new post", "but nobody bought anything"]] },
  { line: "Before: honest work, and a quiet phone.", feed: [["#94a3b8", "✆", "No calls today", "Quiet since Monday"], ["#94a3b8", "▦", "3 open days on the calendar", "this week"]] },
  { line: "Before: fresh bread every morning, and trays left over.", feed: [["#94a3b8", "$", "2 orders today", "3 trays of croissants unsold"], ["#94a3b8", "◉", "Not on Google Maps", "People nearby can't find you"]] },
  { line: "Before: a great practice, and empty chairs.", feed: [["#94a3b8", "▦", "4 open slots tomorrow", "No new patients booked"], ["#94a3b8", "✆", "No new patient calls", "this week"]] }
];
$("#bzDay").textContent = "Today, " + new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const BZN = [["🛍️", "Your boutique"], ["🔧", "Your plumbing business"], ["🥐", "Your bakery"], ["🦷", "Your dental office"]], BARS = [[.62, .7, .78, .86, .92, 1, .95], [.6, .74, .7, .88, .95, .8, .55], [.7, .66, .78, .84, .95, 1, .98], [.66, .8, .74, .9, .96, .6, .4]], LOW = [.2, .15, .25, .18, .22, .12, .2];
const bars = h => $$("#bzBars i").forEach((b, k) => b.style.setProperty("--h", h[k]));
const bzTabs = $$("#bzt button"), bzFeed = $("#bzFeed"), bzS = $("#bzs"), bzLock = $("#bzLock"), seg = $("#seg"), segB = $$("#seg button"), busySec = $("#stories");
let bzI = 0, bzRun = 0, bzAuto = !RM, bzVis = false;
const fmt = n => Math.round(n).toLocaleString("en-US");
/* iOS-style app icons, drawn here (no brand logos) */
const DAYN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const ICON = {
  order: '<svg viewBox="0 0 38 38"><defs><linearGradient id="io" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#0369a1"/></linearGradient></defs><rect width="38" height="38" fill="url(#io)"/><path d="M11 15h16l-1.4 13H12.4z" fill="#fff"/><path d="M15 15v-2a4 4 0 0 1 8 0v2" fill="none" stroke="#fff" stroke-width="2"/></svg>',
  review: '<svg viewBox="0 0 38 38"><defs><linearGradient id="ir" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><rect width="38" height="38" fill="url(#ir)"/><path d="M19 8.5l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L19 25l-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1z" fill="#fff"/></svg>',
  maps: '<svg viewBox="0 0 38 38"><rect width="38" height="38" fill="#e8f0e2"/><path d="M0 26 38 12" stroke="#fde68a" stroke-width="6"/><path d="M0 15h38M14 0v38" stroke="#fff" stroke-width="3"/><path d="M19 29c-1-4-7-6-7-12a7 7 0 0 1 14 0c0 6-6 8-7 12z" fill="#ef4444"/><circle cx="19" cy="17" r="2.6" fill="#fff"/></svg>',
  phone: '<svg viewBox="0 0 38 38"><defs><linearGradient id="ip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ef27a"/><stop offset="1" stop-color="#1fb83f"/></linearGradient></defs><rect width="38" height="38" fill="url(#ip)"/><path d="M13.5 10.5c1 0 1.6.5 2 1.4l1 2.6c.3.8 0 1.6-.6 2.1l-1.3 1c1 2.2 2.8 4 5 5l1-1.3c.6-.6 1.4-.9 2.1-.6l2.6 1c.9.4 1.4 1 1.4 2v2.2c0 1.2-1 2.1-2.2 2.1C16.6 28 10 21.4 10 13.2c0-1.2.9-2.2 2.1-2.2z" fill="#fff"/></svg>',
  message: '<svg viewBox="0 0 38 38"><defs><linearGradient id="im" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ef27a"/><stop offset="1" stop-color="#1fb83f"/></linearGradient></defs><rect width="38" height="38" fill="url(#im)"/><path d="M19 9c6.1 0 11 4 11 9s-4.9 9-11 9c-1.2 0-2.4-.2-3.5-.5L10 28.5l1.7-4.4C9.9 22.5 8 20.4 8 18c0-5 4.9-9 11-9z" fill="#fff"/></svg>',
  ai: '<svg viewBox="0 0 38 38"><rect width="38" height="38" fill="#111"/><path d="M19 8l2.4 7.1L29 17.5l-7.6 2.4L19 27l-2.4-7.1L9 17.5l7.6-2.4z" fill="#fff"/></svg>',
  social: '<svg viewBox="0 0 38 38"><defs><linearGradient id="is" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f59e0b"/><stop offset=".5" stop-color="#ec4899"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><rect width="38" height="38" fill="url(#is)"/><path d="M19 28s-9-5.4-9-11.2A4.8 4.8 0 0 1 19 14a4.8 4.8 0 0 1 9 2.8C28 22.6 19 28 19 28z" fill="#fff"/></svg>',
  quiet: '<svg viewBox="0 0 38 38"><rect width="38" height="38" fill="#9ca3af"/><path d="M11 15h16l-1.4 13H12.4z" fill="#fff" opacity=".9"/><path d="M15 15v-2a4 4 0 0 1 8 0v2" fill="none" stroke="#fff" stroke-width="2"/></svg>'
};
const calIcon = () => { const d = new Date(); return `<svg viewBox="0 0 38 38"><rect width="38" height="38" fill="#fff"/><text x="19" y="12" font-size="7.5" font-weight="700" text-anchor="middle" fill="#ef4444" font-family="-apple-system,Arial">${DAYN[d.getDay()]}</text><text x="19" y="30" font-size="17" font-weight="400" text-anchor="middle" fill="#111" font-family="-apple-system,Arial">${d.getDate()}</text></svg>`; };
const KIND = { "$": "order", "★": "review", "➚": "maps", "◉": "maps", "✆": "phone", "✉": "message", "✳": "ai", "♡": "social", "0": "quiet" };
const iconFor = f => { if (f[1] === "▦") return calIcon(); const k = f[0] === "#94a3b8" && f[1] !== "♡" ? (f[1] === "✆" ? "phone" : f[1] === "◉" ? "maps" : "quiet") : KIND[f[1]] || "order"; return ICON[k]; };
const AGO = ["now", "2m ago", "6m ago", "14m ago", "31m ago", "1h ago"];
const ntItem = (f, q) => `<div class="nt${q ? " q" : ""}"><span class="ic">${iconFor(f)}</span><div><b>${esc(f[2])}</b><span>${esc(f[3])}</span></div><small>${q ? "2h ago" : "now"}</small></div>`;
const ages = () => { if (busySec.classList.contains("before")) return; [...bzFeed.children].forEach((n, k) => { const t = n.querySelector("small"); if (t) t.textContent = AGO[Math.min(k, AGO.length - 1)]; }); bzFeed.classList.toggle("many", bzFeed.children.length > 4); };
function setMode(w) { $("#bzMode").textContent = w ? "With Business Santa" : "Before us"; $("#bzLive").textContent = w ? "Busy" : "Quiet"; bars(w ? BARS[bzI] : LOW); seg.classList.toggle("with", w); segB.forEach((b, k) => b.setAttribute("aria-selected", (k === 1) === w)); busySec.classList.toggle("before", !w); }
async function showBefore(i, id, fast) {
  const d = BUSY[i], b = BEFORE[i], alive = () => id === bzRun;
  setMode(false); ["--w1", "--w2", "--w3", "--w4"].forEach((v, k) => bzLock.style.setProperty(v, d.w[k]));
  bzS.classList.add("sw"); $("#bzDreamBox").classList.remove("on"); $("#bzDreamE").textContent = DE[i]; $("#bzIc").textContent = BZN[i][0]; $("#bzBiz").textContent = BZN[i][1]; $$(".dlt").forEach(x => x.classList.remove("on"));
  await wait(RM || fast ? 0 : 300); if (!alive()) return false;
  $("#bzL1").textContent = d.l1; $("#bzL2").textContent = d.l2; $("#bzLine").textContent = b.line; $("#bzDream").textContent = d.dream;
  $("#bzN1").textContent = fmt(d.a1); $("#bzN2").textContent = fmt(d.a2);
  $("#bzDid").innerHTML = d.did.map(x => `<li>${esc(x)}</li>`).join(""); bzFeed.innerHTML = ""; bzS.classList.remove("sw");
  for (const f of b.feed) { await wait(RM || fast ? 0 : 450); if (!alive()) return false; bzFeed.insertAdjacentHTML("afterbegin", ntItem(f, true)); }
  return true;
}
async function showWith(i, id) {
  const d = BUSY[i], alive = () => id === bzRun, lis = $$("#bzDid li");
  setMode(true); bzFeed.innerHTML = ""; bzFeed.classList.remove("many"); $("#bzLine").textContent = d.line;
  if (RM) { bzFeed.innerHTML = d.feed.slice().reverse().map(f => ntItem(f)).join(""); lis.forEach(l => l.classList.add("on")); $("#bzN1").textContent = fmt(d.b1); $("#bzN2").textContent = fmt(d.b2); $("#bzDreamBox").classList.add("on"); return true; }
  tween(4800, p => { if (alive()) { $("#bzN1").textContent = fmt(d.a1 + (d.b1 - d.a1) * p); $("#bzN2").textContent = fmt(d.a2 + (d.b2 - d.a2) * p); } });
  for (let k = 0; k < d.feed.length; k++) {
    await wait(k ? 950 : 350); if (!alive()) return false;
    bzFeed.insertAdjacentHTML("afterbegin", ntItem(d.feed[k])); ages(); if (lis[k]) lis[k].classList.add("on");
  }
  await wait(500); if (!alive()) return false;
  $("#bzD1").textContent = "+" + fmt(d.b1 - d.a1); $("#bzD2").textContent = "+" + fmt(d.b2 - d.a2); $$(".dlt").forEach(x => x.classList.add("on"));
  $("#bzDreamBox").classList.add("on");
  return true;
}
async function busy(i) {
  const id = ++bzRun, alive = () => id === bzRun; bzI = i;
  bzTabs.forEach((t, k) => { t.setAttribute("aria-selected", k === i); t.style.setProperty("--pg", 0); });
  const T = 13500, t0 = performance.now();
  const bar = () => { if (!alive()) return; const p = Math.min(1, (performance.now() - t0) / T); bzTabs[i].style.setProperty("--pg", p.toFixed(3)); if (p < 1) requestAnimationFrame(bar); };
  if (bzAuto) requestAnimationFrame(bar);
  if (!await showBefore(i, id)) return;
  await wait(RM ? 0 : 2400); if (!alive()) return;
  if (!await showWith(i, id)) return;
  await wait(Math.max(0, T - (performance.now() - t0))); if (!alive()) return;
  if (bzAuto && bzVis) busy((i + 1) % BUSY.length);
}
segB.forEach(b => b.addEventListener("click", () => { bzAuto = false; bzTabs.forEach(x => x.style.setProperty("--pg", 0)); const id = ++bzRun; if (b.dataset.m === "1") { showBefore(bzI, id, true).then(ok => ok && alive2(id) && showWith(bzI, id)); } else showBefore(bzI, id); }));
const alive2 = id => id === bzRun;
bzTabs.forEach((t, k) => t.addEventListener("click", () => { bzAuto = false; bzTabs.forEach(x => x.style.setProperty("--pg", 0)); busy(k); }));
new IntersectionObserver(es => { const was = bzVis; bzVis = es[0].isIntersecting; if (bzVis && !was) busy(bzI); if (!bzVis) bzRun++; }, { threshold: .35 }).observe($(".bzg"));

/* ---------- the technical jobs gather into four simple plans (and can be replayed) ---------- */
const berg = $(".berg"), cloud = $("#under"), chipsU = $$("#under span"), ugl = $$("#ugs .ugl");
const EASE = "cubic-bezier(.22,1,.36,1)";
function flipChips(move, dur, stagger) {
  const first = chipsU.map(c => c.getBoundingClientRect());
  move();
  if (RM) return;
  chipsU.forEach((c, k) => {
    const l = c.getBoundingClientRect(), f = first[k];
    const sx = f.width / Math.max(1, l.width), sy = f.height / Math.max(1, l.height);
    c.style.transition = "none"; c.style.transformOrigin = "0 0";
    c.style.transform = `translate(${f.left - l.left}px,${f.top - l.top}px) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => chipsU.forEach((c, k) => {
    c.style.transition = `transform ${dur}ms ${EASE} ${k * stagger}ms`; c.style.transform = "";
  })));
}
let gathered = false;
function gather() {
  if (gathered) return; gathered = true;
  flipChips(() => { chipsU.forEach(c => ugl[+c.dataset.g].appendChild(c)); berg.classList.add("grouped"); $("#ugLbl").textContent = "We take care of all of it"; }, 1300, 45);
  setTimeout(() => berg.classList.remove("busy"), 1300 + chipsU.length * 45);
}
function scatter() {
  gathered = false;
  flipChips(() => { chipsU.forEach(c => cloud.appendChild(c)); berg.classList.remove("grouped"); $("#ugLbl").textContent = "What it takes underneath"; }, 900, 20);
}
$("#ugReplay").addEventListener("click", () => { berg.classList.add("busy"); scatter(); setTimeout(gather, RM ? 0 : 1900); trackC("ReplayedPlans"); });
new IntersectionObserver((es, ob) => { if (!es[0].isIntersecting) return; ob.disconnect(); setTimeout(gather, RM ? 0 : 1800); }, { threshold: .55 }).observe(berg);

/* ---------- grow with us: the service bar and the business grow together ---------- */
const GROW = [
  ["Where you start", "A great idea, and a lot of hope.", 3],
  ["Step 1 done", "People can find you on Google.", 9],
  ["Step 2 done", "More people choose you over the rest.", 18],
  ["Step 3 done", "Customers walk through your door.", 34],
  ["Step 4 done", "People trust you before they call.", 58],
  ["Step 5 done", "ChatGPT recommends you by name.", 85],
  ["All steps working", "You're not a small shop anymore. You're a brand.", 140]
];
let grow = { set() { }, name() { } };
const grTrack = $("#grTrack"), grKnob = $("#grKnob"), grLis = $$("#grSteps li"), grSide = $(".grside");
let gS = 0, gNum = 3, gAuto = !RM, gStop = null;
function growTo(s, smooth = true) {
  s = clamp(s, 0, 6); if (smooth) grTrack.classList.add("anim");
  grTrack.style.setProperty("--g", (s / 6).toFixed(4)); growStep(s);
}
function growStep(s) {
  if (s === gS && grKnob.getAttribute("aria-valuenow") == s) return;
  gS = s; grow.set(s); grKnob.setAttribute("aria-valuenow", s);
  grLis.forEach((li, k) => li.classList.toggle("on", k < s));
  grSide.classList.add("sw");
  setTimeout(() => { $("#grStep").textContent = GROW[s][0]; $("#grWhat").textContent = GROW[s][1]; grSide.classList.remove("sw"); }, 200);
  const from = gNum, to = GROW[s][2]; gStop && gStop(); gStop = tween(900, p => { gNum = from + (to - from) * p; $("#grNum").textContent = Math.round(gNum); });
}
const userGrow = () => { gAuto = false; };
let gDrag = false;
const gAt = x => { const r = grTrack.getBoundingClientRect(), f = clamp((x - r.left) / r.width, 0, 1); grTrack.style.setProperty("--g", f.toFixed(4)); growStep(Math.round(f * 6)); };
grTrack.addEventListener("pointerdown", e => { userGrow(); gDrag = true; grTrack.classList.remove("anim"); grTrack.setPointerCapture(e.pointerId); gAt(e.clientX); });
grTrack.addEventListener("pointermove", e => { if (gDrag) gAt(e.clientX); });
["pointerup", "pointercancel"].forEach(n => grTrack.addEventListener(n, () => { if (!gDrag) return; gDrag = false; growTo(gS); }));
grKnob.addEventListener("keydown", e => { if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); userGrow(); growTo(gS + 1); } if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); userGrow(); growTo(gS - 1); } });
$$("#grSteps button").forEach(b => b.addEventListener("click", () => { userGrow(); growTo(+b.dataset.s); }));
new IntersectionObserver((es, ob) => { if (!es[0].isIntersecting) return; ob.disconnect(); grow = buildGrow($("#grSvg")); grow.name(TYPES[T].n); }, { rootMargin: "900px" }).observe($("#grow"));
new IntersectionObserver((es, ob) => {
  if (!es[0].isIntersecting) return; ob.disconnect();
  if (RM) { growTo(6, false); return; }
  (async () => { for (let s = 1; s <= 6; s++) { await wait(s === 1 ? 900 : 1900); if (!gAuto) return; growTo(s); } })();
}, { threshold: .45 }).observe($(".grg"));

/* ---------- team: the curtain, the peek, the reveal ---------- */
let inCk = false; new IntersectionObserver(e => { inCk = e[0].isIntersecting; onScroll(); }, { rootMargin: "-30% 0px -30% 0px" }).observe($("#formBox"));
const rvl = $("#reveal");
if (rvl) { const nio = new IntersectionObserver((e) => { if (!e[0].isIntersecting) return; nio.disconnect(); const im = $(".rvbg img"), go = () => rvl.classList.add("near"); im.loading = "eager"; (im.decode ? im.decode() : Promise.resolve()).then(go, go); }, { rootMargin: "200% 0px" }); nio.observe(rvl); }
/* a slow word reel beside Manav while he plans: what the plan covers */
const RW = ["Google search", "Google Maps", "Your reviews", "ChatGPT", "AI answers"], rwBox = $("#rw"); let rwI = 0, rwTm = 0;
function rwNext() {
  if (!rwBox) return; rwI = (rwI + 1) % RW.length;
  const old = rwBox.querySelector("span:not(.out)"), n = document.createElement("span"); n.className = "nx"; n.textContent = RW[rwI]; rwBox.appendChild(n);
  requestAnimationFrame(() => requestAnimationFrame(() => { n.classList.remove("nx"); if (old) { old.classList.add("out"); setTimeout(() => old.remove(), 800); } }));
}
function revealFrame(vh) {
  if (!rvl) return;
  const r = rvl.getBoundingClientRect(), p = clamp(-r.top / (r.height - vh), 0, 1);
  const o = clamp((p - .03) / .3, 0, 1), u = clamp((p - .5) / .3, 0, 1);
  rvl.style.setProperty("--open", o.toFixed(4)); rvl.style.setProperty("--rise", u.toFixed(4));
  rvl.classList.toggle("opened", o > .995); rvl.classList.toggle("up", u > .04);
  if (u > .04 || o < .5 || RM) { clearInterval(rwTm); rwTm = 0; }
  else if (!rwTm) rwTm = setInterval(rwNext, 1900);
}

/* ---------- team: tap a person in the photo ---------- */
const CREW = [
  ["jyoti", "Your main contact", "Jyoti", "Answers your messages and sends your weekly update in plain English."],
  ["manav", "Founder", "Manav", "Plans how you grow on Google, Maps and AI answers, and signs off every plan."],
  ["sam", "Technical expert", "Sam", "Fixes what stops Google from reading and showing your website."],
  ["sakshi", "Content and listings", "Sakshi", "Writes your pages and listings in the words your customers use."]
];
const tags = $$(".tag"), tc = $("#tagcard"); let crewI = 0, crewAuto = null, crewTouched = false;
function showCrew(i) {
  crewI = i; tags.forEach((t, n) => t.classList.toggle("on", n === i)); tc.classList.add("sw");
  setTimeout(() => { const c = CREW[i]; $("#tcImg").src = `/assets/img/face-${c[0]}.webp`; $("#tcRole").textContent = c[1]; $("#tcName").textContent = c[2]; $("#tcTxt").textContent = c[3]; tc.classList.remove("sw"); }, 220);
}
tags.forEach((t, n) => t.addEventListener("click", () => { crewTouched = true; clearInterval(crewAuto); showCrew(n); }));
new IntersectionObserver(es => { const on = es[0].isIntersecting; clearInterval(crewAuto); if (on && !crewTouched && !RM) crewAuto = setInterval(() => showCrew((crewI + 1) % 4), 3800); }, { threshold: .4 }).observe($("#crew"));
showCrew(0);

/* ---------- the big reveal: words light up, the phone rises, rewinds to today, takes its place ---------- */
const bws = $$(".bw"), pst = $(".pstage");
let dx = 0, lastPb = -1;
/* natural scroll: the Google screen and the step pills sit in one sticky column; the pills jump to their step */
const FLOW = stage.classList.contains("flow"), TABS = stage.classList.contains("tabs");
let pcol = null;
if (FLOW) {
  pcol = document.createElement("div"); pcol.className = "pcol"; pst.parentNode.insertBefore(pcol, pst); pcol.appendChild(pst); pcol.appendChild($("#steps6"));
  steps.forEach((s, k) => { s.setAttribute("role", "button"); s.tabIndex = 0; const go = () => chs[k].scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "center" }); s.addEventListener("click", go); s.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }); });
}

/* step player: each step plays for a few seconds, then the next; a tap picks a step; hovering pauses */
if (TABS) {
  const DUR = 5500; let stT = 0, stStart = 0, stLeft = DUR, stOn = false, stHover = false;
  const stNext = () => { setChapter((cur + 1) % chs.length, true); stArm(DUR); };
  const stArm = ms => { clearTimeout(stT); stLeft = ms; stStart = performance.now(); if (stOn && !stHover && !RM) stT = setTimeout(stNext, ms); };
  const replayFill = () => { const c = chs[cur]; if (!c) return; c.classList.remove("on"); void c.offsetWidth; c.classList.add("on"); };
  chs.forEach((ch, k) => {
    ch.tabIndex = 0; ch.setAttribute("role", "button");
    const pick = () => { if (k !== cur) setChapter(k, true); else replayFill(); stArm(DUR); trackC("StoryStep", { step: k }); };
    ch.addEventListener("click", e => { if (e.target.closest("a")) return; pick(); });
    ch.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });
  const wr = $("#stage .wrap:not(.sth)");
  wr.addEventListener("mouseenter", () => { stHover = true; clearTimeout(stT); stLeft = Math.max(400, stLeft - (performance.now() - stStart)); stage.classList.add("paused"); });
  wr.addEventListener("mouseleave", () => { stHover = false; stage.classList.remove("paused"); stArm(stLeft); });
  new IntersectionObserver(es => { const was = stOn; stOn = es[0].isIntersecting; if (stOn && !was) { if (cur < 0) setChapter(0, true); else replayFill(); stArm(DUR); } if (!stOn) clearTimeout(stT); }, { threshold: .45 }).observe(wr);
  if (RM) stage.classList.add("manual");
  /* keep the list's height steady whichever step is open, so nothing below the section moves */
  const box = $("#stage .chs");
  const lockH = () => { box.style.minHeight = ""; const was = cur; let mx = 0; stage.classList.add("measure"); chs.forEach((c, k) => { chs.forEach((d, j) => d.classList.toggle("on", j === k)); mx = Math.max(mx, box.offsetHeight); }); stage.classList.remove("measure"); chs.forEach((d, j) => d.classList.toggle("on", j === was)); box.style.minHeight = mx + "px"; };
  lockH(); addEventListener("resize", () => { clearTimeout(lockH.t); lockH.t = setTimeout(lockH, 200); });
}
function measureBridge() { const r = pst.getBoundingClientRect(); dx = MOB() ? 0 : innerWidth / 2 - (r.left + r.width / 2); }
function bridge(pb, vh) {
  if (Math.abs(pb - lastPb) < .0005) return; lastPb = pb;
  const lit = clamp(pb / .42, 0, 1) * bws.length;
  bws.forEach((w, k) => w.classList.toggle("l", k < lit));
  const bt = pb < .46 ? 1 : 1 - clamp((pb - .46) / .12, 0, 1);
  stage.style.setProperty("--bt", bt.toFixed(3)); stage.style.setProperty("--bs", clamp((pb - .38) / .1, 0, 1).toFixed(3));
  const r = clamp((pb - .56) / .2, 0, 1), m = clamp((pb - .76) / .22, 0, 1), e = t => 1 - Math.pow(1 - t, 3);
  pst.style.setProperty("--px", (dx * (1 - e(m))).toFixed(1) + "px");
  pst.style.setProperty("--py", ((1 - e(r)) * vh * .95).toFixed(1) + "px");
}

/* ---------- one scroll handler, read then write ---------- */
const hd = $("#hd"), bar = $("#bar"); let ticking = false, solid = null, barOn = null;
function onScroll() {
  ticking = false;
  const y = scrollY, vh = innerHeight, sr = stage.getBoundingClientRect();
  if (TABS) { } else if (FLOW) {
    let i = 0; const mid = vh * .55; chs.forEach((ch, k) => { if (ch.getBoundingClientRect().top < mid) i = k; }); setChapter(i);
  } else {
    const run = -sr.top, B = vh * 1.6, total = sr.height - vh;
    const pb = clamp(run / B, 0, 1), q = clamp((run - B) / (total - B), 0, 1);
    bridge(pb, vh);
    if (pb < 1) setChapter(0, false, true); else setChapter(Math.min(5, Math.floor(q * 6)));
  }
  revealFrame(vh);
  const s = y > 40; if (s !== solid) { solid = s; hd.classList.toggle("solid", s); }
  const b = y > vh * .9 && !inCk; if (b !== barOn) { barOn = b; bar.classList.toggle("on", b); }
}
addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

/* phone size follows the screen */
function sizePhone() {
  const m = MOB(), h = m ? 470 : 560, ps = m ? Math.min(1, innerHeight * .46 / h, innerWidth * .9 / 340) : Math.min(1.08, (innerHeight - 150) / h);
  const el = $(".pstage"); el.style.setProperty("--ps", ps.toFixed(3)); el.style.setProperty("--bh", h + "px");
  if (typeof pcol !== "undefined" && pcol) pcol.style.top = Math.max(84, (innerHeight - h * ps - 60) / 2).toFixed(0) + "px";
}
let lastW = innerWidth, rT = 0;
addEventListener("resize", () => {
  clearTimeout(rT); rT = setTimeout(() => {
    sizePhone(); measureBridge(); lastPb = -1;
    onScroll();
  }, 150);
});

/* ---------- reveals ---------- */
const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); rio.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: .12 });
$$(".rv,.split,.berg").forEach(e => rio.observe(e));
new IntersectionObserver((es, ob) => es.forEach(e => {
  if (!e.isIntersecting) return; ob.disconnect();
  $$(".rsum [data-n]").forEach(el => { const n = +el.dataset.n, d = +(el.dataset.d || 0), s = el.dataset.s || ""; tween(1600, p => el.textContent = (d ? (n * p).toFixed(d) : Math.round(n * p).toLocaleString("en-US")) + s); });
}), { threshold: .3 }).observe($(".rsum"));

/* ---------- sample report: the score fills in as the report "builds" ---------- */
new IntersectionObserver((es, ob) => { if (!es[0].isIntersecting) return; ob.disconnect(); const r = $("#xsr"), n = $("#xsrN"); tween(RM ? 1 : 1800, p => { const v = 38 * p; r.style.setProperty("--p", v.toFixed(1)); n.textContent = Math.round(v); }); }, { threshold: .35 }).observe($("#xrc"));
rio.observe($("#xvs"));

/* ---------- results panel: Day 1, then Month 3, counted up from the owner's own Google numbers (example) ---------- */
{
  const gp = $("#xgp"), bs = $$("#xgp [data-v]"), tg = $$("#xgp .xtg button");
  let gm = 0, gStop2;
  const gSet = m => {
    gm = m; gp.classList.toggle("m1", m === 1); tg.forEach(b => b.setAttribute("aria-pressed", +b.dataset.m === m));
    const from = bs.map(b => +b.textContent.replace("#", "")), to = bs.map(b => +b.dataset.v.split(",")[m]);
    gStop2 && gStop2(); gStop2 = tween(RM ? 1 : 1400, p => bs.forEach((b, i) => b.textContent = (b.dataset.p || "") + Math.round(from[i] + (to[i] - from[i]) * p)));
  };
  let gAuto;
  tg.forEach(b => b.addEventListener("click", () => { clearTimeout(gAuto); gSet(+b.dataset.m); }));
  new IntersectionObserver((es, ob) => { if (!es[0].isIntersecting) return; ob.disconnect(); gAuto = setTimeout(() => gSet(1), RM ? 0 : 1900); }, { threshold: .45 }).observe(gp);
}

const flag = '<svg class="flag" viewBox="0 0 19 10" aria-hidden="true"><rect width="19" height="10" fill="#B22234"/><g fill="#fff"><rect y=".77" width="19" height=".77"/><rect y="2.31" width="19" height=".77"/><rect y="3.85" width="19" height=".77"/><rect y="5.38" width="19" height=".77"/><rect y="6.92" width="19" height=".77"/><rect y="8.46" width="19" height=".77"/></g><rect width="7.6" height="5.4" fill="#3C3B6E"/></svg>';

/* ---------- footer: pick your business, go straight to the free check ---------- */
$$(".ftrack button").forEach(b => b.addEventListener("click", () => { setType(b.dataset.k); trackC("ChoseBusinessType", { type: TYPES[b.dataset.k].l, from: "footer" }); $("#check").scrollIntoView({ behavior: RM ? "auto" : "smooth" }); setTimeout(() => ckGo(Math.max(ck, 1)), 900); }));
$("#ftWa").addEventListener("click", e => { e.preventDefault(); track("Lead", { content_name: "WhatsApp footer", method: "WhatsApp" }); window.open(wa("Hi Business Santa! I'd like a free check of my business."), "_blank", "noopener"); });

/* ---------- links ---------- */
$$('[data-go="check"]').forEach(a => a.addEventListener("click", e => { e.preventDefault(); $("#check").scrollIntoView({ behavior: RM ? "auto" : "smooth" }); setTimeout(() => ckGo(ck), 900); trackC("OpenedFreeCheck"); }));
$$("[data-hand]").forEach(a => a.addEventListener("click", () => trackC("WentToServices")));

/* ---------- dream picker ---------- */
const DREAMS = {
  second: ["Picture cutting the ribbon on your second location.", "It starts with more people finding the first one.", "Open a second location"],
  weekends: ["Picture a Saturday with your family while the bookings keep coming in.", "When customers find you on their own, you stop chasing them.", "Take weekends off again"],
  hire: ["Picture handing the keys to your first employee.", "Steady customers make that hire possible.", "Hire my first people"],
  legacy: ["Picture your kids proud of the business you built.", "A business people can find is a business that lasts.", "Build something my kids can take over"],
  pay: ["Picture paying yourself what you are worth, every single month.", "More customers from people who are already searching.", "Finally pay myself properly"],
  vacation: ["Picture a real vacation, with the phone still ringing back home.", "Your website and listings keep working while you rest.", "Take my family on a real vacation"],
  slow: ["Picture a calendar with no slow months.", "Search brings customers in every season.", "No more slow months"]
};
let dream = "";
$$("#dchips button").forEach(b => b.addEventListener("click", () => {
  dream = b.dataset.d; const d = DREAMS[dream], o = $("#dout");
  $$("#dchips button").forEach(x => x.setAttribute("aria-pressed", x === b));
  o.classList.add("sw");
  setTimeout(() => { $("#dBig").textContent = d[0]; $("#dSmall").textContent = d[1]; $("#fEyb").textContent = "Your goal: " + d[2]; o.classList.remove("sw"); }, 260);
  trackC("ChoseDream", { dream: d[2] });
}));

/* ---------- worth calculator: their numbers, a real-life picture, and the plan next to it ---------- */
const money = x => "$" + Math.round(x).toLocaleString("en-US");
const EQ = [[1000, "a nice dinner out every month"], [3000, "a long weekend away with the family"], [7000, "a real family vacation"], [15000, "your first part-time hire"], [40000, "a new work truck"], [80000, "a full-time employee"], [1e12, "a second location"]];
const ppl = $("#ppl"); ppl.innerHTML = "<i></i>".repeat(30);
let wShown = 0, wStop = null;
function worth() {
  const val = +$("#wVal").value, n = +$("#wNum").value, mo = val * n, yr = mo * 12;
  $("#wValO").textContent = money(val); $("#wNumO").textContent = n;
  [...ppl.children].forEach((p, k) => p.classList.toggle("on", k < n));
  const from = wShown; wStop && wStop(); wStop = tween(600, p => { wShown = from + (mo - from) * p; $("#wMo").textContent = money(wShown); });
  $("#wMo2").textContent = money(mo); $("#wYr").textContent = money(yr);
  $("#wEq").textContent = EQ.find(e => yr < e[0])[1];
  $("#wBar").style.width = Math.max(8, Math.min(100, mo / 120 * 6)).toFixed(1) + "%";
  $("#wX").innerHTML = mo >= 120 ? `That's <b>${(mo / 120).toFixed(1)}x</b> what a plan starts at.` : "Even one extra customer a month gets you close.";
}
["#wVal", "#wNum"].forEach(s => $(s).addEventListener("input", worth));
$("#wNum").addEventListener("change", () => trackC("UsedCalculator"));
$$(".wb").forEach(b => b.addEventListener("click", () => { const r = $("#wVal"), v = +r.value, st = v < 200 ? 10 : v < 1000 ? 50 : 100; r.value = clamp(v + st * b.dataset.d, 20, 3000); worth(); }));
$$(".wn").forEach(b => b.addEventListener("click", () => { const r = $("#wNum"); r.value = clamp(+r.value + +b.dataset.d, 1, 30); worth(); trackC("UsedCalculator"); }));

/* ---------- leads ---------- */
const wa = msg => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
const details = () => ({ type: TYPES[fType.value].l, name: $("#fName").value.trim(), site: $("#fSite").value.trim(), city: $("#fCity").value.trim(), wants: $$(".gch input:checked").map(c => c.parentNode.textContent.trim().replace(/^\S+\s*/, "")).join(", ") });
const message = d => `Hi Business Santa! I'd like my free check.\n\nBusiness type: ${d.type}\nBusiness name: ${d.name}\nWebsite: ${d.site || "No website yet"}\nCity: ${d.city}` + (d.wants ? `\nI want: ${d.wants}` : "") + (dream ? `\nMy goal: ${DREAMS[dream][2]}` : "");
function check(errEl) {
  const d = details(); let m = "";
  if (!d.name) m = "Add your business name so we know who you are.";
  else if (!d.city) m = "Add your city and state, so we can check your local competition.";
  errEl.textContent = m; if (m) { ckGo(!d.name ? 1 : 2); return null; } return d;
}
["#fName", "#fCity"].forEach(s => $(s).addEventListener("input", () => { $("#fErr").textContent = ""; $("#eErr").textContent = ""; }));
/* ---------- the free check: one friendly question at a time, while a little shop builds itself ---------- */
const SHOP = { plumbing: ["🔧", "#2563eb"], restaurant: ["🍝", "#dc2626"], dental: ["🦷", "#0ea5e9"], roofing: ["🏠", "#ea580c"], salon: ["💇", "#db2777"], law: ["⚖️", "#4338ca"], store: ["🛍️", "#16a34a"], other: ["✨", "#f59e0b"] };
const shop = $("#shop"), shopW = $(".shopw"), stps = $$(".stp"); let ck = 0;
const GOALS = ["calls", "maps", "rev", "ai", "walk", "web"], GL = { calls: "More phone calls", maps: "Top of Google Maps", rev: "More 5-star reviews", ai: "Show up on ChatGPT", walk: "More customers in the door", web: "A website that brings customers" };
const goals = () => $$(".gch input:checked").map(c => c.value);
const replay = (el, c) => { if (!el) return; el.classList.remove(c); void el.offsetWidth; el.classList.add(c); };
function shopLook(k) {
  const [em, c] = SHOP[k] || SHOP.other, e = $("#shEm");
  shop.style.setProperty("--aw", c);
  if (shop.dataset.k !== k) { shop.dataset.k = k; e.textContent = em; replay(e, "sw"); replay($("#shBld"), "pop"); replay($(".awn"), "unroll"); }
  const r = $(`.btl input[value="${k}"]`); if (r) r.checked = true;
  shopText();
}
function shopText() {
  const v = TYPES[T], n = $("#fName").value.trim(), c = $("#fCity").value.trim(), w = $("#fSite").value.trim(), sg = $("#shSign");
  const t = n || v.n;
  if (sg.dataset.t !== t) { const old = sg.dataset.t || "", grew = n && t.length > old.length && t.startsWith(old); sg.innerHTML = [...t].map((ch, i) => `<span class="sgl${grew && i >= old.length ? " nw" : ""}">${esc(ch)}</span>`).join(""); sg.dataset.t = t; }
  sg.parentNode.classList.toggle("ph", !n);
  $$(".aiN").forEach(x => x.textContent = t);
  $("#mName").textContent = t;
  shop.classList.toggle("has-city", !!c && ck > 2);
  $("#mMeta").textContent = v.svc + (c ? " · " + c : "");
  $("#mWeb").textContent = w ? w.replace(/^https?:\/\//, "") : ck > 4 ? "No website yet" : "Website: not added yet";
  const g = goals(); GOALS.forEach(k => shop.classList.toggle("has-" + k, g.includes(k) || (k === "web" && !!w)));
  shop.classList.toggle("fl1", g.length >= 2 && g.length < 4); shop.classList.toggle("fl2", g.length >= 4);
  $("#shWeb").textContent = w ? w.replace(/^https?:\/\//, "").replace(/\/$/, "") : "Your new website";
}
function ckGo(n, focus = true) {
  ck = clamp(n, 0, 5);
  stps.forEach((st, i) => { st.classList.toggle("on", i === ck); st.classList.toggle("past", i < ck); st.inert = i !== ck; });
  const pc = 4 + ck / 5 * 92; $("#ckBar").style.width = pc + "%"; $("#ckGift").style.left = pc + "%";
  $("#ckN").textContent = ck + 1; $("#ckBack").hidden = ck === 0;
  for (let i = 1; i < 6; i++) shopW.classList.toggle("s" + i, ck >= i);
  if (ck === 5) $("#ckSum").innerHTML = [[0, TYPES[T].l], [1, $("#fName").value.trim()], [2, $("#fCity").value.trim()], [3, goals().length ? goals().map(k => GL[k]).join(", ") : "Not sure yet"], [4, $("#fSite").value.trim() || "No website yet"]].map(([i, t]) => `<button type="button" data-e="${i}" aria-label="Change ${esc(t)}">${esc(t)}</button>`).join("");
  shopText();
  if (focus) {
    const f = stps[ck].querySelector(ck === 0 ? "input:checked, input" : "input, .btn"); f && f.focus({ preventScroll: true });
    if (MOB()) requestAnimationFrame(() => { const r = stps[ck].getBoundingClientRect(), b = shopW.getBoundingClientRect().bottom; if (r.top < b + 8 || r.top > innerHeight * .55) scrollBy({ top: r.top - b - 14, behavior: RM ? "auto" : "smooth" }); });
  }
}
function ckNext() {
  const st = stps[ck], er = st.querySelector(".serr");
  if (ck === 1 && !$("#fName").value.trim()) { er.textContent = "Add your business name. Even a nickname works."; $("#fName").focus(); return; }
  if (ck === 2 && !$("#fCity").value.trim()) { er.textContent = "Add your city and state, like " + $("#fCity").placeholder + "."; $("#fCity").focus(); return; }
  if (er) er.textContent = "";
  if (ck === 1) { const sg = $(".sign"); sg.classList.remove("pop"); void sg.offsetWidth; sg.classList.add("pop"); }
  if (ck === 1) trackC("CheckStep", { step: "name" }); if (ck === 2) trackC("CheckStep", { step: "city" });
  ckGo(ck + 1);
}
$$(".btl input").forEach(r => r.addEventListener("change", () => { setType(r.value); trackC("ChoseBusinessType", { type: TYPES[r.value].l, from: "form" }); setTimeout(() => { if (ck === 0) ckGo(1); }, 420); }));
$$(".btl").forEach(t => t.addEventListener("click", () => { if (ck === 0 && t.querySelector("input").checked) setTimeout(() => { if (ck === 0) ckGo(1); }, 420); }));
$$("[data-next]").forEach(b => b.addEventListener("click", ckNext));
["#fName", "#fCity", "#fSite"].forEach(sl => { const el = $(sl); el.addEventListener("input", () => { const er = el.closest(".stp").querySelector(".serr"); if (er) er.textContent = ""; shopText(); }); el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); ckNext(); } }); });
$("#noSite").addEventListener("click", () => { $("#fSite").value = ""; ckGo(5); });
$$(".gch input").forEach(c => c.addEventListener("change", () => { shopText(); $("#glNext").textContent = goals().length ? "Grow my business" : "Not sure yet, skip"; if (c.checked) trackC("CheckGoal", { goal: c.value }); }));
$("#ckBack").addEventListener("click", () => ckGo(ck - 1));
$("#ckSum").addEventListener("click", e => { const b = e.target.closest("button"); if (b) ckGo(+b.dataset.e); });
$("#citySug").addEventListener("click", () => { $("#fCity").value = $("#citySug").dataset.v; shopText(); ckNext(); });
function celebrate(how) {
  shop.classList.add("open");
  if (!RM) { const cf = $("#shCf"), C = ["#fdb913", "#ef4444", "#22c55e", "#3b82f6", "#ec4899", "#fff"]; cf.innerHTML = Array.from({ length: 34 }, (_, i) => `<i style="background:${C[i % 6]};--dx:${Math.round(Math.cos(i * 2.4) * (90 + (i * 37) % 160))}px;--dy:${Math.round(-60 - (i * 53) % 170 + ((i * 29) % 3) * 60)}px;--r:${(i * 97) % 720 - 360}deg;animation-delay:${(i % 6) * 40}ms"></i>`).join(""); }
  $("#doneH").textContent = how === "wa" ? "You're open for business!" : "Got it, thank you!";
  $("#doneP").textContent = how === "wa" ? "WhatsApp just opened with your details filled in. Tap send there, and Jyoti from our team will reply with your free check." : "Jyoti from our team will reach out soon with your free check.";
  $("#ckForm").style.display = "none"; $("#done").classList.add("on");
}
ckGo(0, false);
new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); replay($("#shBld"), "pop"); replay($(".awn"), "unroll"); } }, { threshold: .5 }).observe(shop);
$("#ckForm").addEventListener("submit", e => { e.preventDefault(); if (ck < 5) return ckNext(); const d = check($("#fErr")); if (!d) return; track("Lead", { content_name: "Free check", method: "WhatsApp", business_type: d.type }); window.open(wa(message(d)), "_blank", "noopener"); celebrate("wa"); });
$("#barWa").addEventListener("click", e => { e.preventDefault(); track("Lead", { content_name: "WhatsApp bar", method: "WhatsApp" }); window.open(wa("Hi Business Santa! I'd like a free check of my business."), "_blank", "noopener"); });
$("#altBtn").addEventListener("click", () => { $("#emBox").classList.add("on"); $("#altBtn").style.display = "none"; $("#eName").focus(); });
$("#emSend").addEventListener("click", async () => {
  const d = check($("#eErr")); if (!d) return;
  const name = $("#eName").value.trim(), mail = $("#eMail").value.trim(), phone = $("#ePhone").value.trim();
  if (!name) { $("#eErr").textContent = "Add your name so we know who to reply to."; $("#eName").focus(); return; }
  if (!/^\S+@\S+\.\S+$/.test(mail)) { $("#eErr").textContent = "Add an email address we can reply to, like name@yourbusiness.com."; $("#eMail").focus(); return; }
  const btn = $("#emSend"); btn.disabled = true; btn.textContent = "Sending…";
  try {
    const r = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(CONFIG.email), {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ _subject: `Free check request: ${d.name} (${d.city})`, _template: "box", _captcha: "false", _replyto: mail, name, email: mail, phone: phone || "Not given", business_type: d.type, business_name: d.name, website: d.site || "No website yet", city: d.city, wants: d.wants || "Not chosen", goal: dream ? DREAMS[dream][2] : "Not chosen", page: location.href })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || String(j.success) === "false") throw new Error("send");
    track("Lead", { content_name: "Free check", method: "Email", business_type: d.type });
    celebrate("em");
  } catch (err) {
    btn.disabled = false; btn.textContent = "Send my request";
    $("#eErr").innerHTML = 'That didn\'t go through. Try again, or email us at <a href="mailto:' + CONFIG.email + '">' + CONFIG.email + "</a>.";
  }
});

/* ---------- local */
/* ---------- local to the visitor: their state and city, from Vercel's edge (approximate, never stored) ---------- */
const STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington, D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
let GEO = null;
function applyGeo() {
  if (!GEO) return;
  const st = STATES[GEO.region], city = GEO.city && GEO.city.length < 28 ? GEO.city : "";
  if (!st) return;
  $("#geoState").textContent = st;
  $$(".geoStateName").forEach(e => e.textContent = st);
  if (city) {
    $$(".geoCity").forEach(e => e.textContent = city + (e.closest(".gloc") ? ", " + GEO.region : ""));
    $("#fCity").placeholder = `${city}, ${GEO.region}`;
    $$(".xcty").forEach(e => e.textContent = `${city}, ${GEO.region}`);
    const sg = $("#citySug"); sg.dataset.v = `${city}, ${GEO.region}`; sg.textContent = `${city}, ${GEO.region}`; sg.hidden = false;
    if (!dream) $("#fEyb").textContent = `Imagine next month in ${city}`;
  }
}
fetch("/api/geo", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(g => { if (g && g.country === "US") { GEO = g; applyGeo(); } }).catch(() => { });

/* ---------- start: what is on screen first, the rest when the browser is idle ---------- */
try { const q = new URLSearchParams(location.search).get("type"); if (q && TYPES[q]) T = q; } catch (e) { }
sizePhone(); setType(T);
if (scrollY > 0) { measureBridge(); onScroll(); } else (window.requestIdleCallback || setTimeout)(() => { measureBridge(); onScroll(); }, { timeout: 1200 });

window.__bs = 1;
