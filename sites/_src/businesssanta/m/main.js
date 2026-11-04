/* Business Santa, mobile. A reel: one full screen at a time, the next one follows your finger. Every screen ends with a way in. */
const CONFIG = { whatsapp: "917009775189", email: "seo@businesssanta.com", metaPixelId: "28943176985310116" };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOB = () => true;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = ms => new Promise(r => setTimeout(r, ms));
let dream = null;
$("#yr").textContent = new Date().getFullYear();
{ const h = new Date().getHours(); if (h < 7 || h >= 19) document.documentElement.classList.add("night"); }

/* Meta Pixel: queued now, the script loads after the first touch */
!function (f) { if (f.fbq) return; const n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; }(window);
fbq("init", CONFIG.metaPixelId); fbq("track", "PageView");
let pxOn = false;
const loadPixel = () => { if (pxOn) return; pxOn = true; const t = document.createElement("script"); t.async = true; t.src = "https://connect.facebook.net/en_US/fbevents.js"; document.head.appendChild(t); };
["pointerdown", "touchstart", "wheel"].forEach(e => addEventListener(e, loadPixel, { once: true, passive: true }));
addEventListener("load", () => setTimeout(loadPixel, 5000));
["pointerdown", "touchstart", "wheel", "keydown"].forEach(e => addEventListener(e, () => $("#s1").classList.add("lux"), { once: true, passive: true }));
const track = (ev, d) => { try { fbq("track", ev, d || {}); } catch (e) { } };
const trackC = (ev, d) => { try { fbq("trackCustom", ev, d || {}); } catch (e) { } };

/*TYPES*/
/*ICONS*/
let T = "plumbing", picked = false;
try { const q = new URLSearchParams(location.search).get("type"); if (q && TYPES[q]) { T = q; picked = true; } } catch (e) { }

/* the results board on screens 2 to 4: p is where a row starts, q is where it ends */
const row = (name, rank, me, p, q, isNew) => `<div class="rw${me ? " me" : ""}${isNew ? " in" : ""}" style="--p:${p};--q:${q}"><span class="rk${p !== q ? " ch" : ""}"><span class="k1">${p + 1}</span><span class="k2">${q + 1}</span></span><div><b>${esc(name)}</b><small><i>★★★★★</i> ${rank}</small></div>${me ? '<span class="tg">You</span>' : ""}</div>`;
function boards() {
  const v = TYPES[T], c = v.c, r = ["4.8 (214)", "4.7 (173)", "4.6 (132)"];
  $("#r2").innerHTML = c.map((n, i) => row(n, r[i], false, i, i)).join("");
  $("#r3").innerHTML = c.map((n, i) => row(n, r[i], false, i, i)).join("") + row(v.n, "New on Google", true, 3, 3, true);
  $("#r4").innerHTML = row(c[0], r[0], false, 0, 0) + row(c[1], r[1], false, 1, 2) + row(c[2], r[2], false, 2, 3) + row(v.n, "4.9 (86)", true, 3, 1);
}

function setType(k) {
  T = k; const v = TYPES[k];
  $$("#chips button").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === k));
  $$(".tw").forEach(e => e.textContent = v.a);
  $$(".q").forEach(e => e.textContent = v.q);
  $$(".bn").forEach(e => e.textContent = v.n);
  $$(".svc").forEach(e => e.textContent = v.svc);
  $("#dIc").innerHTML = BI[k];
  const ft = $("#fType"); if (ft) ft.value = k;
  $("#fName").placeholder = v.pn; $("#fSite").placeholder = v.pw; $("#eMail").placeholder = "maria@" + v.pw;
  shopLook(k); $("#shEm").innerHTML = BI[k];
  boards(); if (cur === 0) hero(); if (cur === 5) result();
}
$$("#chips button").forEach(b => b.addEventListener("click", () => { picked = true; setType(b.dataset.k); trackC("ChoseBusinessType", { type: TYPES[b.dataset.k].l, from: "mobile hero" }); }));

/* screen 1: the search, the listing, the call */
let hRun = 0;
async function hero() {
  const id = ++hRun, alive = () => id === hRun && cur === 0, v = TYPES[T];
  const q = $("#hQ"), card = $("#hCard"), toast = $("#hToast");
  if (RM) { q.textContent = v.q; card.classList.add("on"); toast.classList.add("on"); return; }
  while (alive()) {
    card.classList.remove("on"); toast.classList.remove("on"); q.textContent = ""; await wait(450); if (!alive()) return;
    for (let i = 1; i <= v.q.length; i++) { if (!alive()) return; q.textContent = v.q.slice(0, i); await wait(46 + Math.random() * 38); }
    await wait(250); if (!alive()) return; card.classList.add("on");
    await wait(1300); if (!alive()) return; toast.classList.add("on");
    await wait(4400);
  }
}

/* screen 6: the day after we are done */
let rRun = 0;
const fi = (f, t) => `<div class="fi"><span class="ii" style="background:${f[0]};color:${f[1]}">${f[2]}</span><div><b>${esc(f[3])}</b><small>${esc(f[4])}</small></div><em>${t}</em></div>`;
async function result() {
  const id = ++rRun, alive = () => id === rRun && cur === 5, v = TYPES[T], feed = $("#feed");
  const F = [["#dcfce7", "#15803d", UI.phone, "New customer calling", "found you on Google Maps"], ["#dbeafe", "#1d4ed8", UI.cal, "New booking", v.book], ["#fef3c7", "#b45309", UI.star, "New 5-star review", "“Fast, friendly and fair.”"], ["#f3e8ff", "#7e22ce", UI.spark, "ChatGPT recommended you", `for “${v.q}”`], ["#e0f2fe", "#0369a1", UI.pin, "18 people asked for directions", "Google Maps, this week"], ["#dcfce7", "#15803d", UI.phone, "New customer calling", "found you on Google"]];
  feed.innerHTML = ""; $("#k1").textContent = "0"; $("#k2").textContent = "0";
  if (RM) { feed.innerHTML = F.slice(0, 3).map(f => fi(f, "now")).join(""); $("#k1").textContent = "+14"; $("#k2").textContent = "+9"; return; }
  await wait(650);
  for (let k = 0; k < F.length; k++) {
    if (!alive()) return;
    feed.insertAdjacentHTML("afterbegin", fi(F[k], "now"));
    [...feed.children].forEach((n, j) => { const t = n.querySelector("em"); if (t) t.textContent = ["now", "2m ago", "9m ago"][j] || ""; });
    while (feed.children.length > 3) feed.lastElementChild.remove();
    $("#k1").textContent = "+" + [3, 5, 6, 8, 11, 14][k]; $("#k2").textContent = "+" + [1, 2, 4, 5, 7, 9][k];
    await wait(1050);
  }
}
$("#dDay").textContent = "Today, " + new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/* reviews: swipe sideways, dots follow */
const rcar = $("#rcar"), rds = $("#rdots");
rds.innerHTML = [...rcar.children].map(() => "<i></i>").join("");
const rdot = () => { const w = rcar.children[0].offsetWidth + 12, i = Math.round(rcar.scrollLeft / w); [...rds.children].forEach((d, k) => d.classList.toggle("on", k === i)); };
rcar.addEventListener("scroll", rdot, { passive: true });

const fType = $("#fType");
/*FORM*/
{ const ckGo0 = ckGo; ckGo = (n, f) => { ckGo0(n, f); $("#ckN2").textContent = ck + 1; }; }
$$(".btl").forEach(l => { const k = l.querySelector("input").value, t = l.querySelector(".te"); if (t && BI[k]) t.innerHTML = BI[k]; });
$$(".gch").forEach(l => { const k = l.querySelector("input").value, t = l.querySelector("span"); if (t && GI[k]) t.innerHTML = GI[k]; });

/* the free check sheet: opens from any screen, keeps the business they picked */
const sheet = $("#sheet");
let shOpen = false;
function openCheck(from) {
  if (shOpen) return; shOpen = true;
  sheet.classList.add("vis"); requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("on")));
  replay($("#shBld"), "pop"); replay($(".awn"), "unroll");
  if (ck === 0 && picked) ckGo(1, false); else ckGo(ck, false);
  trackC("OpenedFreeCheck", { from: "mobile " + from, screen: cur + 1 });
}
function closeCheck() { shOpen = false; sheet.classList.remove("on"); document.activeElement && document.activeElement.blur(); setTimeout(() => { if (!shOpen) sheet.classList.remove("vis"); }, 520); }
$("#shX").addEventListener("click", closeCheck);
$$("[data-check]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); openCheck(a.dataset.check); }));
$$("[data-wa]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); track("Lead", { content_name: "WhatsApp " + a.dataset.wa, method: "WhatsApp" }); window.open(wa(`Hi Business Santa! I run a ${TYPES[T].l.toLowerCase()} business and I'd like a free check.`), "_blank", "noopener"); }));

/* the reel */
const reel = $("#reel"), SCR = $$(".sc"), N = SCR.length, prog = $("#prog");
prog.innerHTML = SCR.map(() => "<i></i>").join("");
const bars = [...prog.children];
let cur = -1, busy = false;
const seen = new Set();
function place(i, dy = 0, anim = false) {
  const h = reel.clientHeight;
  SCR.forEach((s, k) => {
    const near = Math.abs(k - i) <= 1;
    s.classList.toggle("n", near); s.classList.toggle("mv", anim);
    s.style.setProperty("--o", k - i);
    s.style.transform = near ? `translate3d(0,${(k - i) * h + dy}px,0)` : "";
  });
}
function go(i, how) {
  i = clamp(i, 0, N - 1);
  if (i === cur) { place(cur, 0, true); return; }
  const first = cur < 0; cur = i; busy = true;
  place(i, 0, !first && !RM);
  setTimeout(() => { busy = false; }, first ? 0 : 560);
  SCR.forEach((s, k) => s.classList.toggle("on", k === i));
  bars.forEach((b, k) => b.classList.toggle("d", k <= i));
  if (i === 0) hero(); else hRun++;
  if (i === 5) result(); else rRun++;
  if (i === 8) setTimeout(rdot, 300);
  if (!seen.has(i)) { seen.add(i); trackC("MobileScreen", { screen: i + 1, name: SCR[i].getAttribute("aria-label"), how: how || "swipe" }); }
}
/* finger follows: drag the screen, let go to flip */
let sy = 0, sx = 0, st = 0, dy = 0, drag = false, lock = "";
reel.addEventListener("touchstart", e => {
  if (shOpen || busy) return; const t = e.touches[0]; sy = t.clientY; sx = t.clientX; st = performance.now(); dy = 0; drag = true; lock = "";
  lock = e.target.closest(".chipr, .rcar") ? "maybe-x" : "";
}, { passive: true });
reel.addEventListener("touchmove", e => {
  if (!drag) return; const t = e.touches[0], ddy = t.clientY - sy, ddx = t.clientX - sx;
  if (lock === "maybe-x" || lock === "") { if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) lock = Math.abs(ddx) > Math.abs(ddy) ? "x" : "y"; else return; }
  if (lock !== "y") return;
  dy = ddy; const edge = (cur === 0 && dy > 0) || (cur === N - 1 && dy < 0);
  place(cur, edge ? dy * .25 : dy, false);
}, { passive: true });
const end = () => {
  if (!drag) return; drag = false; if (lock !== "y") return;
  const h = reel.clientHeight, v = Math.abs(dy) / Math.max(1, performance.now() - st);
  if ((dy < -h * .16 || (dy < -30 && v > .35)) && cur < N - 1) go(cur + 1);
  else if ((dy > h * .16 || (dy > 30 && v > .35)) && cur > 0) go(cur - 1);
  else place(cur, 0, true);
};
reel.addEventListener("touchend", end); reel.addEventListener("touchcancel", end);
let wl = 0;
reel.addEventListener("wheel", e => { if (shOpen) return; e.preventDefault(); const now = performance.now(); if (busy || now - wl < 650 || Math.abs(e.deltaY) < 12) return; wl = now; go(cur + (e.deltaY > 0 ? 1 : -1), "wheel"); }, { passive: false });
addEventListener("keydown", e => { if (shOpen) { if (e.key === "Escape") closeCheck(); return; } if (["ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(cur + 1, "key"); } if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); go(cur - 1, "key"); } });
$$("[data-goto]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); if (shOpen) closeCheck(); go(+a.dataset.goto, "logo"); }));
addEventListener("resize", () => place(cur, 0, false));
/* keyboard focus inside a screen brings that screen into view */
reel.addEventListener("focusin", e => { const s = e.target.closest(".sc"); if (s) { const i = SCR.indexOf(s); if (i !== cur) go(i, "focus"); reel.scrollTop = 0; } });

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
go(0, "load");
