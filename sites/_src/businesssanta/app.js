/* Business Santa landing page: story timeline, UI and leads. */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { createScene } from "./scene.js";
gsap.registerPlugin(ScrollTrigger);

const CONFIG = { whatsapp: "917009775189", email: "seo@businesssanta.com", metaPixelId: "28943176985310116" };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOB = () => innerWidth <= 760;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
$("#yr").textContent = new Date().getFullYear();

/* ---------- Meta Pixel ---------- */
!function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
fbq("init", CONFIG.metaPixelId); fbq("track", "PageView");
const track = (ev, d) => { try { window.fbq && fbq("track", ev, d || {}); } catch (e) { } };
const trackC = (ev, d) => { try { window.fbq && fbq("trackCustom", ev, d || {}); } catch (e) { } };

/* ---------- business types ---------- */
const TYPES = {
  plumbing: { worth: 350, l: "Plumbing", pn: "Rivera Plumbing", pw: "riveraplumbing.com", sign: "YOUR PLUMBING CO.", n: "Your Plumbing Co.", q: "plumber near me", svc: "Plumber", qs: ["plumber near me", "emergency plumber open now", "water heater repair", "who fixes leaky pipes"], c: ["Mike's Plumbing", "FastFlow Pipe Co.", "City Rooter Pros"], a: "plumber", why: '"plumber near me"', book: "Water heater check, tomorrow 10 AM" },
  restaurant: { worth: 60, l: "Restaurant", pn: "Rosa's Kitchen", pw: "rosaskitchen.com", sign: "YOUR RESTAURANT", n: "Your Restaurant", q: "best restaurant near me", svc: "Restaurant", qs: ["best restaurant near me", "dinner open late", "takeout near me", "good spot for date night"], c: ["Tony's Grill", "Main Street Diner", "The Corner Kitchen"], a: "restaurant", why: '"dinner near me"', book: "Table for 4, Friday 7 PM" },
  dental: { worth: 300, l: "Dental", pn: "Lakeside Dental", pw: "lakesidedental.com", sign: "YOUR DENTAL OFFICE", n: "Your Dental Office", q: "dentist near me", svc: "Dentist", qs: ["dentist near me", "emergency dentist today", "teeth cleaning near me", "dentist taking new patients"], c: ["Bright Smile Dental", "Family Dental Care", "Downtown Dentistry"], a: "dentist", why: '"dentist near me"', book: "New patient cleaning, Monday 9 AM" },
  roofing: { worth: 1500, l: "Roofing", pn: "Summit Roofing", pw: "summitroofing.com", sign: "YOUR ROOFING CO.", n: "Your Roofing Co.", q: "roofer near me", svc: "Roofer", qs: ["roofer near me", "roof leak repair", "storm damage roof", "new roof cost"], c: ["Top Notch Roofing", "Peak Roof Pros", "All Weather Roofing"], a: "roofer", why: '"roof leak repair"', book: "Free roof estimate, Thursday 2 PM" },
  salon: { worth: 80, l: "Salon or spa", pn: "Bella Hair Studio", pw: "bellahairstudio.com", sign: "YOUR SALON", n: "Your Salon", q: "hair salon near me", svc: "Hair salon", qs: ["hair salon near me", "haircut open now", "nail salon walk in", "best massage nearby"], c: ["Glow Studio", "Main Street Cuts", "Luxe Hair Bar"], a: "salon", why: '"haircut near me"', book: "Cut and color, Saturday 11 AM" },
  law: { worth: 1500, l: "Law office", pn: "Carter Law Firm", pw: "carterlawfirm.com", sign: "YOUR LAW OFFICE", n: "Your Law Office", q: "lawyer near me", svc: "Lawyer", qs: ["lawyer near me", "car accident lawyer", "free consultation attorney", "family lawyer near me"], c: ["Smith and Cole Law", "Justice Legal Group", "Parker Law Office"], a: "lawyer", why: '"lawyer near me"', book: "Free consultation, Wednesday 3 PM" },
  store: { worth: 50, l: "Shop or store", pn: "Willow Gift Shop", pw: "willowgiftshop.com", sign: "YOUR STORE", n: "Your Store", q: "gift shop near me", svc: "Gift shop", qs: ["gift shop near me", "store open Sunday", "local boutique", "unique gifts nearby"], c: ["The Gift Box", "Maple and Co.", "Corner Boutique"], a: "shop", why: '"gift shop near me"', book: "Order pickup, today 5 PM" },
  other: { worth: 150, l: "Something else", pn: "Rivera and Sons", pw: "riveraandsons.com", sign: "YOUR BUSINESS", n: "Your Business", q: "best service near me", svc: "Local business", qs: ["best service near me", "open now near me", "top rated near me", "who can help with this"], c: ["Main Street Pros", "Hometown Experts", "City Service Co."], a: "local business", why: '"near me"', book: "Appointment, tomorrow 10 AM" }
};
let T = "plumbing", world = null;
const last = { sam: -1, sak: -1, ai: -1, chat: -1 };
const fType = $("#fType"), chips = $("#chips");
for (const [k, v] of Object.entries(TYPES)) {
  const b = document.createElement("button"); b.type = "button"; b.textContent = v.l; b.dataset.k = k; b.setAttribute("aria-pressed", k === T);
  b.addEventListener("click", () => { setType(k); trackC("ChoseBusinessType", { type: v.l }); }); chips.appendChild(b);
  const o = document.createElement("option"); o.value = k; o.textContent = v.l; fType.appendChild(o);
}
fType.addEventListener("change", () => setType(fType.value));
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "");
function res(name, rating, count, me) {
  return `<div class="res${me ? " me" : ""}"><div class="u">${slug(name)}.com</div><div class="t">${esc(name)}</div><div class="st">★★★★★ ${rating} <span>(${count}) · Open now</span></div></div>`;
}
let sakTitle = "", sakDesc = "", aiAnswer = "";
function setType(k) {
  T = k; const v = TYPES[k];
  $$("#chips button").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === k));
  fType.value = k;
  $("#fName").placeholder = v.pn; $("#fSite").placeholder = v.pw; $("#eMail").placeholder = "maria@" + v.pw;
  $$(".qtxt").forEach(e => e.textContent = v.q);
  $("#resBefore").innerHTML = v.c.map((c, i) => res(c, (4.6 + i * .1).toFixed(1), 120 + i * 47, false)).join("");
  $("#resAfter").innerHTML = res(v.n, "4.9", 86, true) + res(v.c[0], "4.7", 164, false) + res(v.c[1], "4.6", 97, false) + res(v.c[2], "4.5", 71, false);
  $("#bResults").innerHTML = res(v.n, "4.9", 86, true) + res(v.c[0], "4.7", 164, false) + res(v.c[1], "4.6", 97, false);
  $$(".bName").forEach(e => e.textContent = v.n); $("#mapName").textContent = v.n;
  $("#aiQ").textContent = `Who's a good ${v.a} near me?`;
  aiAnswer = `A great option nearby is <b>${esc(v.n)}</b>, and people mention fast replies, fair prices and friendly service.`;
  $("#bAiQ").textContent = `Who's a good ${v.a} near me?`;
  $("#bAiA").innerHTML = `A great option nearby is <b>${esc(v.n)}</b>, and customers mention:<ul><li>Fast replies</li><li>Fair, upfront prices</li><li>Friendly service</li></ul>`;
  $("#bBook").textContent = v.book;
  $("#sakWhy").textContent = `People type ${v.why}, not fancy business words.`;
  $("#sakUrl").textContent = slug(v.n) + ".com";
  sakTitle = `${v.n} | ${v.svc} in Your Town`; sakDesc = `Open now. Fast, friendly ${v.a} service with upfront prices. Call today or book online.`;
  if (world) world.setSign(v.sign);
  $("#wVal").value = v.worth; if (typeof worth === "function") worth();
  last.sak = -1; last.ai = -1;
}

/* ---------- 3D world ---------- */
const S = { cx: 0, cy: 4.6, cz: 36, lx: 0, ly: 5.6, lz: 0, scan: 0, wire: 0, fixed: 0, sign: 0, signLit: 0, pin: 0, ring: 0, attract: 0, door: 0, lit: 0, sig: 1, kw: 0, ai: 0, chat: 0, samv: 0 };
try { world = createScene($("#gl"), S); } catch (e) { console.warn("WebGL unavailable", e); document.documentElement.classList.add("no-gl"); }
setType(T);
addEventListener("resize", () => { world && world.resize(); ScrollTrigger.refresh(); });

/* ---------- smooth scroll ---------- */
let lenis = null;
if (!RM) {
  lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const goTo = (el) => { if (lenis) lenis.scrollTo(el, { offset: -20, duration: 1.6 }); else el.scrollIntoView(); };

/* ---------- story timeline ---------- */
const K = {
  hero: [0, 4.6, 36, 0, 5.6, 0],
  prob: [-9, 3.4, 24, -6, 4.2, 0],
  sam: [5.5, 5.2, 17, 0, 5.6, 0],
  sak: [-3, 5, 11, 0, 4.6, 0],
  man: [0, 10, 28, 0, 8.4, 0],
  jyo: [3.2, 2.6, 13.5, 0, 2.6, 0],
  res: [0, 8.5, 40, 0, 5.2, 0],
  cta: [0, 6.5, 35, 0, 5.6, 0]
};
if (MOB()) Object.assign(K, {
  hero: [0, 4.2, 40, 0, 6.4, 0], prob: [-6, 3.6, 30, -4, 5.4, 0], sam: [3, 5.4, 24, 0, 6.6, 0], sak: [-1.5, 5, 17, 0, 5.4, 0],
  man: [0, 8, 34, 0, 10.8, 0], jyo: [2.4, 3, 17, 0, 3.4, 0], res: [0, 8, 46, 0, 7, 0], cta: [0, 6.5, 40, 0, 7, 0]
});
const tl = gsap.timeline({ defaults: { ease: "none" }, paused: true });
const cam = (k, at, d = .8, ease = "power2.inOut") => tl.to(S, { cx: K[k][0], cy: K[k][1], cz: K[k][2], lx: K[k][3], ly: K[k][4], lz: K[k][5], duration: d, ease }, at);
const show = (sel, at, d = .3) => tl.fromTo(sel, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: d, ease: "power3.out" }, at);
const hide = (sel, at, d = .25) => tl.to(sel, { autoAlpha: 0, y: -30, duration: d, ease: "power2.in" }, at);
function person(sel, at, out) {
  const c = $(sel);
  tl.fromTo(c, { autoAlpha: 0, x: MOB() ? 0 : -60, y: MOB() ? 80 : 0, clipPath: "inset(0% 100% 0% 0% round 28px)" },
    { autoAlpha: 1, x: 0, y: 0, clipPath: "inset(0% 0% 0% 0% round 28px)", duration: .35, ease: "power3.out" }, at);
  tl.fromTo(c.querySelectorAll(".kick,h2,p"), { y: 28, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .22, stagger: .06, ease: "power3.out" }, at + .1);
  tl.fromTo(c.querySelector(".get"), { y: 20, autoAlpha: 0, scale: .96 }, { y: 0, autoAlpha: 1, scale: 1, duration: .22, ease: "back.out(2)" }, at + .3);
  tl.fromTo(c.querySelector(".by"), { x: -20, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .2, ease: "power3.out" }, at + .38);
  tl.to(c, { autoAlpha: 0, x: MOB() ? 0 : -40, y: MOB() ? 60 : 0, duration: .25, ease: "power2.in" }, out);
}
/* hero */
tl.set("#pHero", { autoAlpha: 1, y: 0 }, 0);
hide("#pHero", .55);
/* problem */
cam("prob", .5, .9);
show("#pProblem", .95); tl.fromTo("#hPhone", { autoAlpha: 0, y: 80, rotate: 4 }, { autoAlpha: 1, y: 0, rotate: 0, duration: .35, ease: "power3.out" }, 1.0);
hide("#pProblem", 1.85); tl.to("#hPhone", { autoAlpha: 0, y: 60, duration: .25 }, 1.85);
/* Sam */
cam("sam", 1.95, .8);
person("#cSam", 2.15, 3.35);
show("#hSam", 2.35);
tl.to(S, { wire: 1, duration: .2 }, 2.35);
tl.to(S, { scan: 1, samv: 1, duration: .6, ease: "power1.inOut" }, 2.5);
tl.to(S, { fixed: 1, duration: .25 }, 2.95);
tl.to(S, { wire: 0, duration: .2 }, 3.2);
hide("#hSam", 3.35);
/* Sakshi */
cam("sak", 3.3, .8);
person("#cSak", 3.5, 4.7);
show("#hSak", 3.7);
tl.to(S, { sign: 1, kw: 1, duration: .55 }, 3.75);
tl.to(S, { signLit: 1, duration: .2, ease: "power2.out" }, 4.3);
hide("#hSak", 4.7);
/* Manav */
cam("man", 4.65, .8);
person("#cMan", 4.85, 6.05);
tl.to(S, { pin: 1, duration: .4, ease: "bounce.out" }, 5.0);
tl.to(S, { ring: 1, duration: .45, ease: "power2.out" }, 5.4);
tl.to(S, { attract: .55, duration: .6 }, 5.4);
show("#hMan", 5.4); tl.to(S, { ai: 1, duration: .4 }, 5.5);
hide("#hMan", 6.05);
/* Jyoti */
cam("jyo", 6.0, .8);
person("#cJyo", 6.2, 7.45);
tl.to(S, { door: 1, duration: .4, ease: "power2.inOut" }, 6.4);
tl.to(S, { lit: 1, duration: .6 }, 6.7);
show("#hJyo", 6.55); tl.to(S, { chat: 1, duration: .6 }, 6.65);
hide("#hJyo", 7.45);
/* result */
cam("res", 7.4, 1, "power2.inOut");
tl.to(S, { attract: .95, duration: .8 }, 7.5);
show("#pResult", 7.85);
tl.fromTo("#hPhone", { autoAlpha: 0, y: 80 }, { autoAlpha: 1, y: 0, duration: .35, ease: "power3.out" }, 7.9);
tl.set("#svBefore", { opacity: 0 }, 7.9); tl.set("#svAfter", { opacity: 1 }, 7.9);
tl.to("#call", { opacity: 1, duration: .15 }, 8.35);
hide("#pResult", 8.85); tl.to("#hPhone", { autoAlpha: 0, y: 60, duration: .25 }, 8.85);
/* call to action */
cam("cta", 8.9, .7);
show("#pCta", 9.1);
tl.to({}, { duration: .4 }, 9.4);
const TOTAL = tl.duration();

const CH = [["The problem", 0, 1.9], ["Get seen", 1.9, 3.35], ["Get chosen", 3.35, 4.7], ["Get recommended", 4.7, 6.05], ["Stay in the loop", 6.05, 7.45], ["Get calls", 7.45, TOTAL]];
$("#prog").innerHTML = CH.map(c => `<span>${c[0]}</span><i><b></b></i>`).join("").replace(/<i><b><\/b><\/i>$/, "");
const progLabels = $$("#prog span"), progBars = $$("#prog i b");

const storyST = ScrollTrigger.create({
  trigger: "#stage", start: "top top", end: () => "+=" + Math.round(innerHeight * (MOB() ? 8 : 7)),
  pin: true, scrub: RM ? true : 1.1, animation: tl,
  onUpdate: self => {
    const t = self.progress * TOTAL;
    CH.forEach((c, i) => { progLabels[i].classList.toggle("on", t >= c[1] && t < c[2]); if (progBars[i]) progBars[i].style.transform = `scaleX(${clamp((t - c[1]) / (c[2] - c[1]), 0, 1)})`; });
    $("#hint").style.opacity = self.progress > .01 ? 0 : 1;
  }
});

/* ---------- per-frame HUD updates ---------- */
const labels = $("#labels");
const kwEls = [0, 1, 2].map(() => { const e = document.createElement("div"); e.className = "kw"; labels.appendChild(e); return e; });
function hudFrame() {
  const v = TYPES[T];
  /* Sam: health meter and ticks */
  const sv = Math.round(54 + 42 * S.samv);
  if (sv !== last.sam) {
    last.sam = sv; $("#samNum").textContent = sv; const r = $("#samRing"); r.style.setProperty("--v", sv);
    r.style.setProperty("--c", sv < 70 ? "#ff5d6c" : sv < 88 ? "#FDB913" : "#2fd58a");
    $("#samLbl").textContent = sv < 70 ? "Needs work" : sv < 88 ? "Getting better" : "Healthy";
    $("#samTxt").textContent = sv < 70 ? "Google has trouble reading this site." : sv < 88 ? "Problems are being fixed." : "Google can read and trust this site.";
    $$("#samTicks li").forEach((li, i) => li.classList.toggle("on", S.samv > .3 + i * .25));
  }
  /* Sakshi: Google snippet typing */
  const n = Math.round(S.sign * sakTitle.length);
  if (n !== last.sak) { last.sak = n; $("#sakTitle").innerHTML = esc(sakTitle.slice(0, n)) + (n < sakTitle.length ? '<span class="caret"></span>' : ""); $("#sakDesc").textContent = n >= sakTitle.length ? sakDesc : ""; }
  /* Manav: AI answer typing */
  const plain = aiAnswer.replace(/<[^>]+>/g, ""), m = Math.round(S.ai * plain.length);
  if (m !== last.ai) { last.ai = m; $("#aiA").innerHTML = m >= plain.length ? aiAnswer : esc(plain.slice(0, m)) + '<span class="caret" style="background:#151826"></span>'; }
  /* Jyoti: chat messages */
  const c = Math.floor(S.chat * 4.2);
  if (c !== last.chat) { last.chat = c; ["#m1", "#m2", "#m3", "#m4"].forEach((s, i) => $(s).classList.toggle("on", i < c)); }
  /* keyword chips flying into the sign */
  if (world) {
    const sign = world.anchors.sign;
    kwEls.forEach((e, i) => {
      const p = clamp(S.kw * 1.6 - i * .3, 0, 1), on = S.kw > 0 && S.kw < 1 && p > 0 && p < 1;
      e.style.opacity = on ? Math.sin(Math.PI * p) : 0; if (!on) return;
      e.textContent = v.qs[i];
      const sx = [-7, 0, 7][i], ex = sign[0] + (i - 1) * 1.6;
      const x = sx + (ex - sx) * p, y = 1.4 + (sign[1] - 1.4) * p + Math.sin(Math.PI * p) * 2.2, z = 6 * (1 - p) + sign[2] * p;
      const [px, py] = world.project(x, y, z); e.style.transform = `translate(${px}px,${py}px) translate(-50%,-50%) scale(${.8 + .4 * (1 - p)})`;
    });
  }
}

/* search pills popping above the street during the first two chapters */
let pi = 0;
function popPill() {
  if (!world || !stageVisible || tl.time() > 1.9) return;
  const v = TYPES[T]; const spots = world.anchors.street();
  for (let tries = 0; tries < 6; tries++) {
    const a = spots[(pi + tries) % spots.length]; const [x, y, ok] = world.project(a.x, a.y + 1.6, a.z);
    const minX = MOB() ? 130 : innerWidth * .5;
    if (ok && x > minX && x < innerWidth - (MOB() ? 130 : 80) && y > (MOB() ? innerHeight * .5 : 120) && y < innerHeight - 60) {
      pi += tries + 1;
      const b = document.createElement("div"); b.className = "pill"; b.textContent = v.qs[pi % v.qs.length];
      b.style.left = x + "px"; b.style.top = y + "px"; labels.appendChild(b);
      requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add("show")));
      setTimeout(() => { b.classList.remove("show"); setTimeout(() => b.remove(), 500); }, 2200); return;
    }
  }
  pi++;
}
if (!RM) setInterval(popPill, 1100);

/* render loop: only while the story is on screen */
let stageVisible = true;
new IntersectionObserver(es => es.forEach(e => stageVisible = e.isIntersecting), { threshold: 0 }).observe($("#stage"));
gsap.ticker.add(() => { if (world && !document.hidden) world.render(performance.now()); if (stageVisible) hudFrame(); });

/* the street stays alive behind the whole page: dim it under the sections, glide the camera, open it up at the end */
gsap.timeline({ scrollTrigger: { trigger: "#get", start: "top bottom", endTrigger: "#final", end: "bottom bottom", scrub: 1.6 } })
  .fromTo("#dim", { opacity: 0 }, { opacity: .8, duration: .08, ease: "none", immediateRender: false }, 0)
  .fromTo(S, { cx: K.cta[0], cy: K.cta[1], cz: K.cta[2], lx: K.cta[3], ly: K.cta[4], lz: 0 }, { cx: -16, cy: 3.6, cz: 22, lx: -8, ly: 4.6, lz: 0, duration: .35, ease: "sine.inOut", immediateRender: false }, 0)
  .to(S, { cx: 14, cy: 4.4, cz: 20, lx: 6, ly: 5, duration: .35, ease: "sine.inOut" }, .35)
  .to(S, { cx: 0, cy: 5.4, cz: MOB() ? 34 : 27, lx: 0, ly: MOB() ? 7 : 5.8, duration: .3, ease: "power2.inOut" }, .7);
gsap.fromTo("#dim", { opacity: .8 }, { opacity: .12, ease: "none", immediateRender: false, scrollTrigger: { trigger: "#final", start: "top 75%", end: "center center", scrub: 1 } });

/* each scroll in the story lands on a finished scene */
const SNAPS = [0, 1.45, 3.15, 4.5, 5.9, 7.25, 8.6, TOTAL];
let snapTimer = null;
function doSnap(dir) {
  const y = lenis.scroll, a = storyST.start, b = storyST.end;
  if (y < a - 2 || y > b + 2) return;
  const p = (y - a) / (b - a) * TOTAL;
  if (SNAPS.some(v => Math.abs(v - p) < .06)) return;
  const tgt = dir >= 0 ? SNAPS.find(v => v >= p) : [...SNAPS].reverse().find(v => v <= p);
  if (tgt == null) return;
  lenis.scrollTo(a + tgt / TOTAL * (b - a), { duration: 1.1, easing: t => 1 - Math.pow(1 - t, 3) });
}
if (lenis) lenis.on("scroll", l => { clearTimeout(snapTimer); const d = l.direction; snapTimer = setTimeout(() => doSnap(d), 170); });

/* ---------- section reveals ---------- */
$$(".split").forEach(h => { h.innerHTML = h.textContent.split(" ").map(w => `<span class="w"><span>${esc(w)}</span></span>`).join(" "); });
$$(".split").forEach(h => gsap.to(h.querySelectorAll(".w>span"), { y: 0, duration: 1, ease: "power4.out", stagger: .045, scrollTrigger: { trigger: h, start: "top 85%" } }));
$$(".rv").forEach(el => gsap.to(el, { opacity: 1, y: 0, duration: 1.1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%", onEnter: () => el.classList.add("in") } }));
gsap.utils.toArray(".bento .tile").forEach((el, i) => gsap.fromTo(el, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: "power3.out", delay: (i % 2) * .12, scrollTrigger: { trigger: el, start: "top 88%", onEnter: () => el.classList.add("in") } }));
gsap.to("#under span", { opacity: 1, y: 0, ease: "power2.out", stagger: .06, scrollTrigger: { trigger: ".berg", start: "top 75%", end: "bottom 60%", scrub: 1 } });
gsap.to(".office img", { scale: 1, ease: "none", scrollTrigger: { trigger: ".office", start: "top bottom", end: "bottom top", scrub: true } });
gsap.fromTo(".final .bgp img", { yPercent: -10 }, { yPercent: 6, ease: "none", scrollTrigger: { trigger: ".final", start: "top bottom", end: "bottom top", scrub: true } });
$$(".tile").forEach(t => t.addEventListener("pointermove", e => { const r = t.getBoundingClientRect(); t.style.setProperty("--mx", (e.clientX - r.left) + "px"); t.style.setProperty("--my", (e.clientY - r.top) + "px"); }));
new IntersectionObserver((es, ob) => es.forEach(e => { if (!e.isIntersecting) return; ob.disconnect(); $$(".num b").forEach(el => { const n = +el.dataset.n, d = +(el.dataset.d || 0), s = el.dataset.s || ""; const o = { v: 0 }; gsap.to(o, { v: n, duration: 1.6, ease: "power3.out", onUpdate: () => el.textContent = (d ? o.v.toFixed(d) : Math.round(o.v).toLocaleString("en-US")) + s }); }); }), { threshold: .3 }).observe($(".nums"));

/* header and mobile bar */
ScrollTrigger.create({ start: 40, onUpdate: s => $("#hd").classList.toggle("solid", s.scroll() > 40) });
ScrollTrigger.create({ trigger: "#get", start: "top 80%", onToggle: s => $("#bar").classList.toggle("on", s.isActive || s.progress > 0), end: "max" });

/* work history strip (real projects and clients' own words) */
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
$("#track").innerHTML = JOBS.map(jobHTML).join("") + JOBS.map(jobHTML).join("");
$$("#track .job").slice(JOBS.length).forEach(e => e.setAttribute("aria-hidden", "true"));

/* links */
$$('[data-go="check"]').forEach(a => a.addEventListener("click", e => { e.preventDefault(); goTo($("#check")); setTimeout(() => $("#fName").focus({ preventScroll: true }), 1500); trackC("OpenedFreeCheck"); }));
$$('a[href="#get"]').forEach(a => a.addEventListener("click", e => { e.preventDefault(); goTo($("#get")); }));
$$("[data-hand]").forEach(a => a.addEventListener("click", () => trackC("WentToServices")));

/* ---------- worth calculator ---------- */
function worth() {
  const val = +$("#wVal").value, n = +$("#wNum").value, f = x => "$" + Math.round(x).toLocaleString("en-US");
  $("#wValO").textContent = f(val); $("#wNumO").textContent = n; $("#wMo").textContent = f(val * n); $("#wYr").textContent = f(val * n * 12);
}
["#wVal", "#wNum"].forEach(s => $(s).addEventListener("input", () => { worth(); }));
$("#wNum").addEventListener("change", () => trackC("UsedCalculator"));

/* ---------- leads ---------- */
const wa = msg => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
const details = () => ({ type: TYPES[fType.value].l, name: $("#fName").value.trim(), site: $("#fSite").value.trim(), city: $("#fCity").value.trim() });
const message = d => `Hi Business Santa! I'd like my free check.\n\nBusiness type: ${d.type}\nBusiness name: ${d.name}\nWebsite: ${d.site || "No website yet"}\nCity: ${d.city}`;
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
      body: JSON.stringify({ _subject: `Free check request: ${d.name} (${d.city})`, _template: "box", _captcha: "false", _replyto: mail, name, email: mail, phone: phone || "Not given", business_type: d.type, business_name: d.name, website: d.site || "No website yet", city: d.city, page: location.href })
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
