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
  $$(".qtxt").forEach(e => e.textContent = v.q);
  $$(".bName").forEach(e => e.textContent = v.n);
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
bgv.style.backgroundImage = `url(/assets/video/${TOD}-${portrait() ? "mq" : "dq"}.jpg)`;
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
  const q = $("#hpQ"), box = $("#hpRes"), note = $("#hpNote"), fl = $$(".hstage .float");
  box.innerHTML = `<div class="rwrap" id="hpMe"><div>${res(v.n, "4.9", 86, true)}</div></div>` + v.c.map((c, i) => res(c, (4.7 - i * .1).toFixed(1), 164 - i * 31, false)).join("");
  const me = $("#hpMe"), comps = [...box.querySelectorAll(":scope > .res")];
  const all = on => { me.classList.toggle("on", on); comps.forEach(c => c.classList.toggle("on", on)); note.classList.toggle("on", on); fl.forEach(f => f.classList.toggle("on", on)); };
  if (RM) { q.textContent = v.q; all(true); return; }
  while (alive()) {
    while (!heroVis && alive()) await wait(400);
    all(false); q.textContent = ""; await wait(700); if (!alive()) return;
    for (let i = 1; i <= v.q.length; i++) { if (!alive()) return; q.textContent = v.q.slice(0, i); await wait(50 + Math.random() * 45); }
    await wait(250); comps.forEach((c, i) => setTimeout(() => c.classList.add("on"), i * 120));
    await wait(1400); if (!alive()) return; me.classList.add("on");
    await wait(1000); if (!alive()) return; note.classList.add("on");
    for (const f of fl) { await wait(420); if (!alive()) return; f.classList.add("on"); }
    await wait(3400); if (!alive()) return;
    note.classList.remove("on"); fl.forEach(f => f.classList.remove("on")); await wait(500);
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
const BEFORE = [
  { line: "Before: a beautiful store, and almost no orders.", feed: [["#94a3b8", "0", "No new orders today", "Last order: 3 days ago"], ["#c13584", "♡", "14 likes on your new post", "but nobody bought anything"]] },
  { line: "Before: honest work, and a quiet phone.", feed: [["#94a3b8", "✆", "No calls today", "Quiet since Monday"], ["#94a3b8", "▦", "3 open days on the calendar", "this week"]] },
  { line: "Before: fresh bread every morning, and trays left over.", feed: [["#94a3b8", "$", "2 orders today", "3 trays of croissants unsold"], ["#94a3b8", "◉", "Not on Google Maps", "People nearby can't find you"]] },
  { line: "Before: a great practice, and empty chairs.", feed: [["#94a3b8", "▦", "4 open slots tomorrow", "No new patients booked"], ["#94a3b8", "✆", "No new patient calls", "this week"]] }
];
const bzTabs = $$("#bzt button"), bzFeed = $("#bzFeed"), bzS = $("#bzs"), bzLock = $("#bzLock"), seg = $("#seg"), segB = $$("#seg button"), busySec = $("#stories");
let bzI = 0, bzRun = 0, bzAuto = !RM, bzVis = false;
const fmt = n => Math.round(n).toLocaleString("en-US");
const ntItem = (f, q) => `<div class="nt${q ? " q" : ""}"><i style="background:${f[0]}">${f[1]}</i><div><b>${esc(f[2])}</b><span>${esc(f[3])}</span></div><small>${q ? "2h ago" : "now"}</small></div>`;
function setMode(w) { seg.classList.toggle("with", w); segB.forEach((b, k) => b.setAttribute("aria-selected", (k === 1) === w)); busySec.classList.toggle("before", !w); }
async function showBefore(i, id, fast) {
  const d = BUSY[i], b = BEFORE[i], alive = () => id === bzRun;
  setMode(false); ["--w1", "--w2", "--w3", "--w4"].forEach((v, k) => bzLock.style.setProperty(v, d.w[k]));
  bzS.classList.add("sw"); $("#bzDream").parentElement.classList.remove("on"); $$(".dlt").forEach(x => x.classList.remove("on"));
  await wait(RM || fast ? 0 : 300); if (!alive()) return false;
  $("#bzL1").textContent = d.l1; $("#bzL2").textContent = d.l2; $("#bzLine").textContent = b.line; $("#bzDream").textContent = d.dream;
  $("#bzN1").textContent = fmt(d.a1); $("#bzN2").textContent = fmt(d.a2);
  $("#bzDid").innerHTML = d.did.map(x => `<li>${esc(x)}</li>`).join(""); bzFeed.innerHTML = ""; bzS.classList.remove("sw");
  for (const f of b.feed) { await wait(RM || fast ? 0 : 450); if (!alive()) return false; bzFeed.insertAdjacentHTML("afterbegin", ntItem(f, true)); }
  return true;
}
async function showWith(i, id) {
  const d = BUSY[i], alive = () => id === bzRun, lis = $$("#bzDid li");
  setMode(true); bzFeed.innerHTML = ""; $("#bzLine").textContent = d.line;
  if (RM) { bzFeed.innerHTML = d.feed.slice().reverse().map(f => ntItem(f)).join(""); lis.forEach(l => l.classList.add("on")); $("#bzN1").textContent = fmt(d.b1); $("#bzN2").textContent = fmt(d.b2); $("#bzDream").parentElement.classList.add("on"); return true; }
  tween(4800, p => { if (alive()) { $("#bzN1").textContent = fmt(d.a1 + (d.b1 - d.a1) * p); $("#bzN2").textContent = fmt(d.a2 + (d.b2 - d.a2) * p); } });
  for (let k = 0; k < d.feed.length; k++) {
    await wait(k ? 950 : 350); if (!alive()) return false;
    bzFeed.insertAdjacentHTML("afterbegin", ntItem(d.feed[k])); if (lis[k]) lis[k].classList.add("on");
  }
  await wait(500); if (!alive()) return false;
  $("#bzD1").textContent = "+" + fmt(d.b1 - d.a1); $("#bzD2").textContent = "+" + fmt(d.b2 - d.a2); $$(".dlt").forEach(x => x.classList.add("on"));
  $("#bzDream").parentElement.classList.add("on");
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
const rvl = $("#reveal");
function revealFrame(vh) {
  if (!rvl) return;
  const r = rvl.getBoundingClientRect(), p = clamp(-r.top / (r.height - vh), 0, 1);
  rvl.style.setProperty("--rise", clamp(p / .5, 0, 1).toFixed(4));
  const o = clamp((p - .4) / .38, 0, 1); rvl.style.setProperty("--open", o.toFixed(4)); rvl.classList.toggle("opened", o > .995);
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
const bws = $$(".bw"), pst = $(".pstage"), rwc = $("#rwc"), rwcT = $("#rwcT");
let dx = 0, lastPb = -1;
function measureBridge() { const r = pst.getBoundingClientRect(); dx = MOB() ? 0 : innerWidth / 2 - (r.left + r.width / 2); }
function bridge(pb, vh) {
  if (Math.abs(pb - lastPb) < .0005) return; lastPb = pb;
  const lit = clamp(pb / .42, 0, 1) * bws.length;
  bws.forEach((w, k) => w.classList.toggle("l", k < lit));
  const bt = pb < .46 ? clamp(pb / .06, 0, 1) : 1 - clamp((pb - .46) / .12, 0, 1);
  stage.style.setProperty("--bt", bt.toFixed(3)); stage.style.setProperty("--bs", clamp((pb - .38) / .1, 0, 1).toFixed(3));
  const r = clamp((pb - .56) / .2, 0, 1), m = clamp((pb - .76) / .22, 0, 1), e = t => 1 - Math.pow(1 - t, 3);
  pst.style.setProperty("--px", (dx * (1 - e(m))).toFixed(1) + "px");
  pst.style.setProperty("--py", ((1 - e(r)) * vh * .95).toFixed(1) + "px");
  rwc.classList.toggle("on", pb > .58 && pb < .9); rwc.classList.toggle("rew", pb >= .66);
  rwcT.textContent = pb >= .66 ? "↺ Rewind. This is you today." : "This could be you";
}

/* ---------- one scroll handler, read then write ---------- */
const hd = $("#hd"), bar = $("#bar"); let ticking = false, solid = null, barOn = null;
function onScroll() {
  ticking = false;
  const y = scrollY, vh = innerHeight, sr = stage.getBoundingClientRect();
  const run = -sr.top, B = vh * 1.6, total = sr.height - vh;
  const pb = clamp(run / B, 0, 1), q = clamp((run - B) / (total - B), 0, 1);
  bridge(pb, vh);
  if (pb < 1) setChapter(pb < .66 ? 3 : 0, false, true); else setChapter(Math.min(5, Math.floor(q * 6)));
  revealFrame(vh);
  const s = y > 40; if (s !== solid) { solid = s; hd.classList.toggle("solid", s); }
  const b = y > vh * .9; if (b !== barOn) { barOn = b; bar.classList.toggle("on", b); }
}
addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

/* phone size follows the screen */
function sizePhone() {
  const ps = MOB() ? Math.min(.74, innerHeight * .44 / 620, innerWidth * .86 / 300) : Math.min(1.1, (innerHeight - 150) / 620);
  $(".pstage").style.setProperty("--ps", ps.toFixed(3));
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
$$("#under span").forEach((e, i) => e.style.setProperty("--i", i));
new IntersectionObserver((es, ob) => es.forEach(e => {
  if (!e.isIntersecting) return; ob.disconnect();
  $$(".num b").forEach(el => { const n = +el.dataset.n, d = +(el.dataset.d || 0), s = el.dataset.s || ""; tween(1600, p => el.textContent = (d ? (n * p).toFixed(d) : Math.round(n * p).toLocaleString("en-US")) + s); });
}), { threshold: .3 }).observe($(".nums"));

/* ---------- work history strip ---------- */
const JOBS = [
  { u: "thecini07", svc: "Technical fixes", d: 7, q: "I'm not a website or technology person at all, so having someone who takes the time to explain things and answer my questions means a lot to me." },
  { u: "metablazetoken", svc: "Online store SEO", d: 4, q: "The team was professional, polite, well-spoken, and highly knowledgeable." },
  { u: "jahlisa", svc: "Online store SEO", d: 6, q: "They provided a very detailed report that went above and beyond what we were expecting." },
  { u: "concord79", svc: "Full SEO package", d: 4, q: "Working with Manav was one of the best decisions I made during the launch of my business." },
  { u: "vkannan09", svc: "Technical fixes", d: 3, q: "Manav and team were exceptional." },
  { u: "lightcommittee", svc: "Google-readable pages", d: 3, q: "Hired to fix my schema across main service pages and blog pages." }
];
const flag = '<svg class="flag" viewBox="0 0 19 10" aria-hidden="true"><rect width="19" height="10" fill="#B22234"/><g fill="#fff"><rect y=".77" width="19" height=".77"/><rect y="2.31" width="19" height=".77"/><rect y="3.85" width="19" height=".77"/><rect y="5.38" width="19" height=".77"/><rect y="6.92" width="19" height=".77"/><rect y="8.46" width="19" height=".77"/></g><rect width="7.6" height="5.4" fill="#3C3B6E"/></svg>';
const jobHTML = j => `<article class="job"><div class="top"><span class="svc">${esc(j.svc)}</span><span class="s5" aria-label="5 out of 5 stars">★★★★★</span></div><blockquote>“${esc(j.q)}”</blockquote><div class="meta"><span>${flag} United States</span><span>Done in ${j.d} days</span><span>${esc(j.u)}</span></div></article>`;
new IntersectionObserver((es, ob) => { if (!es[0].isIntersecting) return; ob.disconnect(); $("#track").innerHTML = JOBS.map(jobHTML).join("") + JOBS.map(jobHTML).join(""); $$("#track .job").slice(JOBS.length).forEach(e => e.setAttribute("aria-hidden", "true")); }, { rootMargin: "600px" }).observe($("#reviews"));

/* ---------- footer: pick your business, go straight to the free check ---------- */
$$(".ftrack button").forEach(b => b.addEventListener("click", () => { setType(b.dataset.k); trackC("ChoseBusinessType", { type: TYPES[b.dataset.k].l, from: "footer" }); $("#check").scrollIntoView({ behavior: RM ? "auto" : "smooth" }); setTimeout(() => $("#fName").focus({ preventScroll: true }), 1100); }));
$("#ftWa").addEventListener("click", e => { e.preventDefault(); track("Lead", { content_name: "WhatsApp footer", method: "WhatsApp" }); window.open(wa("Hi Business Santa! I'd like a free check of my business."), "_blank", "noopener"); });

/* ---------- links ---------- */
$$('[data-go="check"]').forEach(a => a.addEventListener("click", e => { e.preventDefault(); $("#check").scrollIntoView({ behavior: RM ? "auto" : "smooth" }); setTimeout(() => $("#fName").focus({ preventScroll: true }), 1100); trackC("OpenedFreeCheck"); }));
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

/* ---------- worth calculator ---------- */
function worth() {
  const val = +$("#wVal").value, n = +$("#wNum").value, f = x => "$" + Math.round(x).toLocaleString("en-US");
  $("#wValO").textContent = f(val); $("#wNumO").textContent = n; $("#wMo").textContent = f(val * n); $("#wYr").textContent = f(val * n * 12);
}
["#wVal", "#wNum"].forEach(s => $(s).addEventListener("input", worth));
$("#wNum").addEventListener("change", () => trackC("UsedCalculator"));

/* ---------- leads ---------- */
const wa = msg => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
const details = () => ({ type: TYPES[fType.value].l, name: $("#fName").value.trim(), site: $("#fSite").value.trim(), city: $("#fCity").value.trim() });
const message = d => `Hi Business Santa! I'd like my free check.\n\nBusiness type: ${d.type}\nBusiness name: ${d.name}\nWebsite: ${d.site || "No website yet"}\nCity: ${d.city}` + (dream ? `\nMy goal: ${DREAMS[dream][2]}` : "");
function check(errEl) {
  const d = details(); let m = "";
  if (!d.name) m = "Add your business name so we know who you are.";
  else if (!d.city) m = "Add your city and state, so we can check your local competition.";
  errEl.textContent = m; if (m) { $(!d.name ? "#fName" : "#fCity").focus(); return null; } return d;
}
["#fName", "#fCity"].forEach(s => $(s).addEventListener("input", () => { $("#fErr").textContent = ""; $("#eErr").textContent = ""; }));
$("#ckForm").addEventListener("submit", e => { e.preventDefault(); const d = check($("#fErr")); if (!d) return; track("Lead", { content_name: "Free check", method: "WhatsApp", business_type: d.type }); window.open(wa(message(d)), "_blank", "noopener"); });
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
      body: JSON.stringify({ _subject: `Free check request: ${d.name} (${d.city})`, _template: "box", _captcha: "false", _replyto: mail, name, email: mail, phone: phone || "Not given", business_type: d.type, business_name: d.name, website: d.site || "No website yet", city: d.city, goal: dream ? DREAMS[dream][2] : "Not chosen", page: location.href })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || String(j.success) === "false") throw new Error("send");
    track("Lead", { content_name: "Free check", method: "Email", business_type: d.type });
    $("#ckForm").style.display = "none"; $("#done").classList.add("on");
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
    if (!dream) $("#fEyb").textContent = `Imagine next month in ${city}`;
  }
}
fetch("/api/geo", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(g => { if (g && g.country === "US") { GEO = g; applyGeo(); } }).catch(() => { });

/* ---------- start: what is on screen first, the rest when the browser is idle ---------- */
sizePhone(); setType(T);
if (scrollY > 0) { measureBridge(); onScroll(); } else (window.requestIdleCallback || setTimeout)(() => { measureBridge(); onScroll(); }, { timeout: 1200 });

window.__bs = 1;
