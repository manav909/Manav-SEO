/* Business Santa, mobile. One full screen per swipe; every screen plays when it is fully in view. */
const CONFIG = { whatsapp: "917009775189", email: "seo@businesssanta.com", metaPixelId: "28943176985310116" };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOB = () => true;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = ms => new Promise(r => setTimeout(r, ms));
let dream = null;
$("#yr").textContent = new Date().getFullYear();

/* Meta Pixel: queued now, script loads after the first touch */
!function (f) { if (f.fbq) return; const n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; }(window);
fbq("init", CONFIG.metaPixelId); fbq("track", "PageView");
let pxOn = false;
const loadPixel = () => { if (pxOn) return; pxOn = true; const t = document.createElement("script"); t.async = true; t.src = "https://connect.facebook.net/en_US/fbevents.js"; document.head.appendChild(t); };
["scroll", "pointerdown", "touchstart"].forEach(e => addEventListener(e, loadPixel, { once: true, passive: true }));
addEventListener("load", () => { setTimeout(loadPixel, 5000); $("#s1").classList.add("lux"); });
const track = (ev, d) => { try { fbq("track", ev, d || {}); } catch (e) { } };
const trackC = (ev, d) => { try { fbq("trackCustom", ev, d || {}); } catch (e) { } };

/*TYPES*/
let T = "plumbing";
try { const q = new URLSearchParams(location.search).get("type"); if (q && TYPES[q]) T = q; } catch (e) { }
const ICONS = { plumbing: "🔧", restaurant: "🍝", dental: "🦷", roofing: "🏠", salon: "💇", law: "⚖️", store: "🛍️", other: "✨" };

/* the results board on screens 2 to 4: p is where a row starts, q is where it ends */
const row = (name, rank, me, p, q, isNew) => {
  const k = q === undefined || q === p ? `<span class="k1">${p + 1}</span>` : `<span class="k1">${p + 1}</span><span class="k2">${q + 1}</span>`;
  return `<div class="rw${me ? " me" : ""}${isNew ? " in" : ""}" style="--p:${p};--q:${q === undefined ? p : q}"><span class="rk">${k}</span><div><b>${esc(name)}</b><small><i>★★★★★</i> ${rank}</small></div>${me ? '<span class="tg">You</span>' : ""}</div>`;
};
function boards() {
  const v = TYPES[T], c = v.c, r = ["4.8 (214)", "4.7 (173)", "4.6 (132)"];
  $("#r2").innerHTML = c.map((n, i) => row(n, r[i], false, i)).join("");
  $("#r3").innerHTML = c.map((n, i) => row(n, r[i], false, i)).join("") + row(v.n, "New on Google", true, 3, 3, true);
  $("#r4").innerHTML = row(c[0], r[0], false, 0, 0) + row(c[1], r[1], false, 1, 2) + row(c[2], r[2], false, 2, 3) + row(v.n, "4.9 (86)", true, 3, 1);
}

function setType(k) {
  T = k; const v = TYPES[k];
  $$("#chips button").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === k));
  $$(".tw").forEach(e => e.textContent = v.a);
  $$(".q").forEach(e => e.textContent = v.q);
  $$(".bn").forEach(e => e.textContent = v.n);
  $$(".svc").forEach(e => e.textContent = v.svc);
  $("#dIc").textContent = ICONS[k] || "✨";
  const ft = $("#fType"); if (ft) ft.value = k;
  $("#fName").placeholder = v.pn; $("#fSite").placeholder = v.pw; $("#eMail").placeholder = "maria@" + v.pw;
  shopLook(k); boards(); if (cur === 0) hero(); if (cur === 5) result();
}
$$("#chips button").forEach(b => b.addEventListener("click", () => { setType(b.dataset.k); trackC("ChoseBusinessType", { type: TYPES[b.dataset.k].l, from: "mobile hero" }); }));

/* screen 1: the search, the listing, the call */
let hRun = 0;
async function hero() {
  const id = ++hRun, alive = () => id === hRun && cur === 0, v = TYPES[T];
  const q = $("#hQ"), card = $("#hCard"), ai = $("#hAi"), toast = $("#hToast");
  const off = () => [card, ai, toast].forEach(e => e.classList.remove("on"));
  if (RM) { q.textContent = v.q; [card, ai, toast].forEach(e => e.classList.add("on")); return; }
  while (alive()) {
    off(); q.textContent = ""; await wait(500); if (!alive()) return;
    for (let i = 1; i <= v.q.length; i++) { if (!alive()) return; q.textContent = v.q.slice(0, i); await wait(48 + Math.random() * 40); }
    await wait(300); if (!alive()) return; card.classList.add("on");
    await wait(1100); if (!alive()) return; ai.classList.add("on");
    await wait(1200); if (!alive()) return; toast.classList.add("on");
    await wait(4200);
  }
}

/* screen 6: the day after we are done */
let rRun = 0;
async function result() {
  const id = ++rRun, alive = () => id === rRun && cur === 5, v = TYPES[T], feed = $("#feed");
  const F = [["#dcfce7", "📞", "New customer calling", "from Google Maps"], ["#dbeafe", "📅", "New booking", v.book], ["#fef3c7", "⭐", "New 5-star review", "“Fast, friendly and fair.”"], ["#f3e8ff", "✳️", "ChatGPT recommended you", `for “${v.q}”`], ["#e0f2fe", "📍", "18 people asked for directions", "Google Maps, this week"], ["#dcfce7", "📞", "New customer calling", "from Google Search"]];
  feed.innerHTML = ""; $("#k1").textContent = "0"; $("#k2").textContent = "0";
  if (RM) { feed.innerHTML = F.slice(0, 4).map(f => fi(f, "now")).join(""); $("#k1").textContent = "+14"; $("#k2").textContent = "+9"; return; }
  await wait(700);
  for (let k = 0; k < F.length; k++) {
    if (!alive()) return;
    feed.insertAdjacentHTML("afterbegin", fi(F[k], "now"));
    [...feed.children].forEach((n, j) => { const t = n.querySelector("em"); if (t) t.textContent = ["now", "2m ago", "9m ago", "21m ago", "1h ago", "2h ago"][j] || ""; });
    while (feed.children.length > 3) feed.lastElementChild.remove();
    $("#k1").textContent = "+" + [3, 5, 6, 8, 11, 14][k]; $("#k2").textContent = "+" + [1, 2, 4, 5, 7, 9][k];
    await wait(1000);
  }
}
const fi = (f, t) => `<div class="fi"><span class="ii" style="background:${f[0]}">${f[1]}</span><div><b>${esc(f[2])}</b><small>${esc(f[3])}</small></div><em>${t}</em></div>`;
$("#dDay").textContent = "Today, " + new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/* reviews: swipe dots */
const rcar = $("#rcar"), rds = $("#rdots");
rds.innerHTML = [...rcar.children].map(() => "<i></i>").join("");
const rdot = () => { const w = rcar.children[0].offsetWidth + 12, i = Math.round(rcar.scrollLeft / w); [...rds.children].forEach((d, k) => d.classList.toggle("on", k === i)); };
rcar.addEventListener("scroll", rdot, { passive: true }); requestAnimationFrame(() => setTimeout(rdot, 1500));

const fType = $("#fType");
/*FORM*/

/* screens: one at a time. The visible one gets .on, the rail follows, and the screen's own story plays */
const SCR = $$(".sc"), rail = $("#rail"), tcta = $("#tcta");
let cur = -1;
rail.innerHTML = SCR.map((s, i) => `<button type="button" aria-label="${esc(s.getAttribute("aria-label") || "Screen " + (i + 1))}"></button>`).join("");
const dots = [...rail.children];
dots.forEach((d, i) => d.addEventListener("click", () => SCR[i].scrollIntoView({ behavior: RM ? "auto" : "smooth" })));
const seen = new Set();
function enter(i) {
  if (i === cur) return; cur = i;
  SCR.forEach((s, k) => s.classList.toggle("on", k === i));
  dots.forEach((d, k) => d.classList.toggle("on", k === i));
  tcta.classList.toggle("hid", SCR[i].id === "s10");
  if (i === 0) hero(); else hRun++;
  if (i === 5) result(); else rRun++;
  if (SCR[i].id === "s10") { replay($("#shBld"), "pop"); replay($(".awn"), "unroll"); }
  if (!seen.has(i)) { seen.add(i); trackC("MobileScreen", { screen: i + 1, name: SCR[i].getAttribute("aria-label") }); }
}
const sio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) enter(SCR.indexOf(e.target)); }), { threshold: .6 });
SCR.forEach(s => sio.observe(s));
$$('[data-go="s10"], #tcta').forEach(a => a.addEventListener("click", e => { e.preventDefault(); $("#s10").scrollIntoView({ behavior: RM ? "auto" : "smooth" }); trackC("OpenedFreeCheck", { from: "mobile" }); }));
$("#ftWa").addEventListener("click", e => { e.preventDefault(); track("Lead", { content_name: "WhatsApp footer", method: "WhatsApp" }); window.open(wa("Hi Business Santa! I'd like a free check of my business."), "_blank", "noopener"); });

/* where the visitor is: their state and city (approximate, never stored) */
const STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington, D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
fetch("/api/geo", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(g => {
  if (!g || g.country !== "US") return; const st = STATES[g.region]; if (!st) return;
  $$(".geoState").forEach(e => e.textContent = st);
  const city = g.city && g.city.length < 28 ? g.city : ""; if (!city) return;
  $("#fCity").placeholder = `${city}, ${g.region}`;
  const sg = $("#citySug"); sg.dataset.v = `${city}, ${g.region}`; sg.textContent = `${city}, ${g.region}`; sg.hidden = false;
}).catch(() => { });

setType(T);
