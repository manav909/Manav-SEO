/* Business Santa landing page. Native scrolling, compositor-only animations, no libraries. */
import { createNight } from "./night.js";

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
let sakTitle = "", sakDesc = "", aiAnswer = "";
function setType(k) {
  T = k; const v = TYPES[k];
  $$("#chips button").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === k));
  fType.value = k;
  $("#fName").placeholder = v.pn; $("#fSite").placeholder = v.pw; $("#eMail").placeholder = "maria@" + v.pw;
  $$(".qtxt").forEach(e => e.textContent = v.q);
  $("#resBefore").innerHTML = v.c.map((c, i) => res(c, (4.6 + i * .1).toFixed(1), 120 + i * 47, false)).join("");
  $("#bResults").innerHTML = res(v.n, "4.9", 86, true) + res(v.c[0], "4.7", 164, false) + res(v.c[1], "4.6", 97, false);
  $$(".bName").forEach(e => e.textContent = v.n); $("#mapName").textContent = v.n;
  $("#aiQ").textContent = `Who's a good ${v.a} near me?`;
  aiAnswer = `A great option nearby is <b>${esc(v.n)}</b>. People mention fast replies, fair prices and friendly service.`;
  $("#bAiQ").textContent = `Who's a good ${v.a} near me?`;
  $("#bAiA").innerHTML = `A great option nearby is <b>${esc(v.n)}</b>, and customers mention:<ul><li>Fast replies</li><li>Fair, upfront prices</li><li>Friendly service</li></ul>`;
  $("#bBook").textContent = v.book; $("#hpBook").textContent = v.book;
  $("#sakWhy").textContent = `People type ${v.why}, not fancy business words.`;
  $("#sakUrl").textContent = $("#sakUrl2").textContent = slug(v.n) + ".com";
  $("#sakKw").innerHTML = "<small>Words your customers actually type</small>" + v.qs.map(q => `<span>${esc(q)}</span>`).join("");
  sakTitle = `${v.n} | ${v.svc} in Your Town`; sakDesc = `Open now. Fast, friendly ${v.a} service with upfront prices. Call today or book online.`;
  $("#wVal").value = v.worth; worth();
  heroLoop();
  if (cur >= 0) { const c = cur; cur = -1; setChapter(c); }
}

/* ---------- the street behind the page ---------- */
const NS = { lit: .15, warm: 0, focus: 24, cz: 0 }, NT = { lit: .55, warm: 0, focus: 24, cz: 0 };
let night = null, seeVis = 1, lastF = 0;
const cv = $("#night");
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || !seeVis) return;
  if (MOB() && now - lastF < 31) return; lastF = now;
  for (const k in NT) NS[k] += (NT[k] - NS[k]) * .05;
  night.render(now);
}
function startNight() {
  try { night = createNight(cv, NS, document.documentElement.dataset.t); } catch (e) { return; }
  cv.classList.add("on");
  if (RM) { Object.assign(NS, NT, { lit: .8, warm: .6 }); night.render(performance.now(), true); return; }
  requestAnimationFrame(frame);
}
/* the street starts after the page has settled, or as soon as the visitor moves */
let nightAsked = false;
const askNight = () => { if (nightAsked) return; nightAsked = true; (window.requestIdleCallback || setTimeout)(startNight, { timeout: 600 }); };
["scroll", "pointerdown", "pointermove", "touchstart", "keydown"].forEach(e => addEventListener(e, askNight, { once: true, passive: true }));
addEventListener("load", () => setTimeout(askNight, 2500));
const seen = new Set();
const seeIO = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? seen.add(e.target) : seen.delete(e.target)); seeVis = seen.size; });
$$(".see").forEach(e => seeIO.observe(e));
if (matchMedia("(pointer:fine)").matches) addEventListener("pointermove", e => night && night.look(e.clientX / innerWidth - .5, e.clientY / innerHeight - .5), { passive: true });

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

/* ---------- story: sticky scenes that play themselves as you scroll ---------- */
const stage = $("#stage"), chs = $$(".ch"), svs = $$(".sv"), steps = $$("#steps6 span");
const LIT = [.55, .62, .72, .82, .92, 1], WARM = [0, .1, .25, .5, .75, 1], FOC = [24, 30, 26, 18, 22, 16];
const CTX = [null, ["Website fixed", "by Sam, our technical expert"], ["Written in your customers' words", "by Sakshi"], ["On the map and in AI answers", "led by Manav"], ["Weekly update sent", "by Jyoti"], ["New call from Google", "while you work"]];
let cur = -1, stops = [], ctxT = 0;
const stopAll = () => { stops.forEach(f => f()); stops = []; clearTimeout(ctxT); };
function setChapter(i) {
  if (i === cur) return; cur = i; stopAll();
  chs.forEach((c, k) => { c.classList.toggle("on", k === i); c.classList.toggle("past", k < i); });
  svs.forEach((c, k) => c.classList.toggle("on", k === i));
  steps.forEach((s, k) => { s.classList.toggle("on", k === i); s.classList.toggle("pass", k < i); });
  if (!stage.dataset.left) { NT.lit = LIT[i]; NT.warm = WARM[i]; NT.focus = FOC[i]; }
  const cx = $("#ctx"); cx.classList.remove("on");
  if (CTX[i]) ctxT = setTimeout(() => { $("#ctxT").innerHTML = `${CTX[i][0]}<small>${CTX[i][1]}</small>`; cx.classList.add("on"); }, 1500);
  play(i);
}
function play(i) {
  const v = TYPES[T], d = RM ? 1 : 1;
  if (i === 1) {
    const ring = $("#samRing"), rows = $$("#samList div");
    rows.forEach(r => r.classList.remove("ok"));
    const set = p => {
      const sv = Math.round(54 + 42 * p); $("#samNum").textContent = sv; ring.style.setProperty("--v", sv);
      ring.style.setProperty("--c", sv < 70 ? "#ef4444" : sv < 88 ? "#f59e0b" : "#22c55e");
      $("#samLbl").textContent = sv < 70 ? "Needs work" : sv < 88 ? "Getting better" : "Healthy";
      $("#samTxt").textContent = sv < 70 ? "Google has trouble reading this site." : sv < 88 ? "Problems are being fixed." : "Google can read and trust this site.";
      rows.forEach((r, k) => { r.classList.toggle("ok", p > .2 + k * .22); r.querySelector("em").textContent = p > .2 + k * .22 ? "Fixed" : "Problem"; });
    };
    set(0); if (RM) set(1); else stops.push(tween(2400 * d, set));
  }
  if (i === 2) {
    const t = $("#sakTitle"), ds = $("#sakDesc"), kw = $$("#sakKw span");
    kw.forEach(k => k.classList.remove("on")); t.innerHTML = ""; ds.textContent = "";
    const fin = () => { t.textContent = sakTitle; ds.textContent = sakDesc; kw.forEach((k, j) => setTimeout(() => k.classList.add("on"), j * 180)); };
    if (RM) fin(); else stops.push(tween(1500, p => { const n = Math.round(p * sakTitle.length); t.innerHTML = esc(sakTitle.slice(0, n)) + '<span class="caret"></span>'; }, fin));
  }
  if (i === 3) {
    const a = $("#aiA"), plain = aiAnswer.replace(/<[^>]+>/g, ""); a.innerHTML = "";
    if (RM) a.innerHTML = aiAnswer; else { const t0 = setTimeout(() => stops.push(tween(1800, p => { a.innerHTML = esc(plain.slice(0, Math.round(p * plain.length))) + '<span class="caret" style="background:#111"></span>'; }, () => a.innerHTML = aiAnswer)), 900); stops.push(() => clearTimeout(t0)); }
  }
  if (i === 4) {
    const m = $$(".msg"); m.forEach(x => x.classList.remove("on"));
    m.forEach((x, k) => { const t = setTimeout(() => x.classList.add("on"), RM ? 0 : 400 + k * 650); stops.push(() => clearTimeout(t)); });
  }
}

/* ---------- example stories ---------- */
function playStory(card) {
  if (card.dataset.played) return; card.dataset.played = 1;
  const scn = card.querySelector(".scn"), lis = card.querySelectorAll(".did li");
  lis.forEach((li, i) => setTimeout(() => li.classList.add("on"), 250 + i * 260));
  setTimeout(() => {
    scn.classList.remove("before"); card.classList.add("go");
    card.querySelectorAll(".cnt").forEach(el => { const a = +el.dataset.a, b = +el.dataset.b; tween(2200, p => el.textContent = Math.round(a + (b - a) * p)); });
    const k = card.dataset.k;
    if (k === "shop") {
      const feed = card.querySelector(".feed"), items = [["#2041", "$86", "Linen wrap dress"], ["#2042", "$142", "2 items"], ["#2043", "$64", "Silk scarf"], ["#2044", "$210", "3 items"], ["#2045", "$98", "Summer blouse"]];
      items.forEach((it, i) => setTimeout(() => { feed.insertAdjacentHTML("afterbegin", `<div><i>$</i><span><b>New order ${it[0]} &middot; ${it[1]}</b><span>${it[2]}</span></span></div>`); if (feed.children.length > 4) feed.lastElementChild.remove(); }, i * 520));
    }
    if (k === "plum") card.querySelectorAll(".cal .j").forEach((j, i) => setTimeout(() => j.classList.add("on"), i * 90));
  }, 250 + lis.length * 260 + 150);
}
$$(".cal .d").forEach((d, di) => { for (let i = 0; i < 4; i++) d.insertAdjacentHTML("beforeend", `<div class="j${(di * 4 + i) % 7 === 0 ? " on" : ""}">${["Leak repair", "Water heater", "Drain clean", "Pipe fix"][i]}</div>`); });
const stories = $("#stories"), strack = $("#strack"), cards = $$(".sto[data-k]");
let hz = false, hzDist = 0, cardX = [];
function layoutStories() {
  hz = innerWidth > 900;
  if (!hz) { stories.style.height = ""; strack.style.transform = ""; return; }
  strack.style.transform = "translate3d(0,0,0)";
  hzDist = Math.max(0, strack.scrollWidth - innerWidth);
  stories.style.height = (hzDist + innerHeight) + "px";
  cardX = cards.map(c => c.offsetLeft);
}
const storyIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !hz) playStory(e.target); }), { threshold: .5 });
cards.forEach(c => storyIO.observe(c));

/* ---------- one scroll handler, read then write ---------- */
const hd = $("#hd"), bar = $("#bar"); let ticking = false, solid = null, barOn = null;
function onScroll() {
  ticking = false;
  const y = scrollY, vh = innerHeight, sr = stage.getBoundingClientRect(), tr = hz ? stories.getBoundingClientRect() : null;
  const p = clamp(-sr.top / (sr.height - vh), 0, 1);
  stage.dataset.left = sr.bottom < vh * .6 ? 1 : "";
  if (stage.dataset.left) { NT.lit = 1; NT.warm = 1; NT.focus = 20; }
  setChapter(Math.min(5, Math.floor(p * 6)));
  if (stage.dataset.left && cur === 5) { NT.lit = 1; NT.warm = 1; }
  NT.cz = clamp(y / (vh * 9), 0, 1) * 7;
  if (tr) {
    const x = clamp(-tr.top, 0, hzDist);
    strack.style.transform = `translate3d(${-x}px,0,0)`;
    cards.forEach((c, i) => { if (cardX[i] - x < innerWidth * .62) playStory(c); });
  }
  const s = y > 40; if (s !== solid) { solid = s; hd.classList.toggle("solid", s); }
  const b = y > vh * .9; if (b !== barOn) { barOn = b; bar.classList.toggle("on", b); }
}
addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

/* phone size follows the screen */
function sizePhone() {
  const ps = MOB() ? Math.min(.74, innerHeight * .44 / 620, innerWidth * .86 / 300) : Math.min(1, innerHeight * .82 / 620);
  $(".pstage").style.setProperty("--ps", ps.toFixed(3));
}
let lastW = innerWidth, rT = 0;
addEventListener("resize", () => {
  clearTimeout(rT); rT = setTimeout(() => {
    sizePhone(); layoutStories();
    if (night && Math.abs(innerWidth - lastW) > 2) { lastW = innerWidth; night.resize(); }
    onScroll();
  }, 150);
});

/* ---------- reveals ---------- */
const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); rio.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: .12 });
$$(".rv,.split,.berg").forEach(e => rio.observe(e));
$$("#under span").forEach((e, i) => e.style.setProperty("--i", i));
$$(".tile").forEach(t => t.addEventListener("pointermove", e => { const r = t.getBoundingClientRect(); t.style.setProperty("--mx", (e.clientX - r.left) + "px"); t.style.setProperty("--my", (e.clientY - r.top) + "px"); }, { passive: true }));
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

/* ---------- start: what is on screen first, the rest when the browser is idle ---------- */
sizePhone(); setType(T); onScroll();
(window.requestIdleCallback || setTimeout)(() => { layoutStories(); onScroll(); }, { timeout: 1500 });
