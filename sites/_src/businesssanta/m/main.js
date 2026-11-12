/* Business Santa, mobile. A plain landing page: one clear offer, proof, and a short form. */
const CONFIG = { whatsapp: "917009775189", email: "seo@businesssanta.com", metaPixelId: "3294418987387872" };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
$("#yr").textContent = new Date().getFullYear();

/*TRACK*/
const BST = window.BST;
const track = (ev, d) => BST.std(ev, d);
const trackC = (ev, d) => BST.event(ev, d);

/*TYPES*/
/*ICONS*/

/* the business type: from the ad link (?type=dental), or picked in the form */
let T = "plumbing", fromAd = false;
try { const q = new URLSearchParams(location.search).get("type"); if (q && TYPES[q]) { T = q; fromAd = true; } } catch (e) { }
const put = (e, s) => { if (e.textContent !== s) e.textContent = s; };
function setType(k, ad) {
  try { BST.type(TYPES[k].l); } catch (e) { }
  T = k; const v = TYPES[k];
  $$(".q").forEach(e => put(e, v.q));
  $$(".bn").forEach(e => put(e, v.n));
  $$(".tfor").forEach(e => put(e, ad ? "for a " + v.a : "for your business"));
  const hi = $("#hIc"); if (hi && hi.dataset.k !== k) { hi.innerHTML = BI[k]; hi.dataset.k = k; }
  $("#fType").value = k;
  $("#fName").placeholder = v.pn; $("#fSite").placeholder = v.pw; $("#eMail").placeholder = "maria@" + v.pw;
  $$(".pn2").forEach(e => put(e, v.pn)); $$(".cmp").forEach(e => put(e, v.c[0])); $$(".svl").forEach(e => put(e, v.a));
  $$("#inds button").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === k && (ad || picked)));
  const iq = $("#indq"); if (iq) iq.innerHTML = v.qs.map(q => `<li>${SRCH}${esc(q)}</li>`).join("");
  const IL = { plumbing: ["seo-for-plumbers", "plumbers"], dental: ["seo-for-dentists", "dentists"], roofing: ["seo-for-roofers", "roofers"], law: ["seo-for-law-firms", "law firms"], restaurant: ["seo-for-restaurants", "restaurants"], salon: ["seo-for-salons-and-spas", "salons and spas"], store: ["seo-for-retail-stores", "retail stores"], other: ["local-seo", "local businesses"] }[k];
  const il = $("#indl"); if (il && IL) { il.href = "/" + IL[0]; put(il, `How we help ${IL[1]} get found`); }
}
let picked = false;
$$("#inds button").forEach(b => b.addEventListener("click", () => { picked = true; setType(b.dataset.k, true); trackC("ChoseBusinessType", { type: TYPES[b.dataset.k].l, from: "mobile tiles" }); }));
$$("[data-pk]").forEach(a => a.addEventListener("click", () => trackC("ViewedPackage", { pkg: a.dataset.pk, from: "mobile" })));
$("#fType").addEventListener("change", () => { picked = true; setType($("#fType").value, true); trackC("ChoseBusinessType", { type: TYPES[T].l, from: "mobile form" }); });

/* buttons: every "free check" button goes to the form; WhatsApp opens with the business type filled in */
/* sections below the fold skip layout until the visitor first touches or scrolls the page */
const cvOff = () => document.documentElement.classList.add("cv0");
["scroll", "pointerdown", "touchstart", "keydown"].forEach(e => addEventListener(e, cvOff, { once: true, passive: true }));
if (location.hash) cvOff();
$$("[data-go]").forEach(a => a.addEventListener("click", e => {
  e.preventDefault(); cvOff(); requestAnimationFrame(() => $("#check").scrollIntoView({ behavior: "smooth", block: "start" }));
  trackC("OpenedFreeCheck", { from: "mobile" });
  setTimeout(() => { const n = $("#fName"); if (n && !n.value) n.focus({ preventScroll: true }); }, 700);
}));
const wa = msg => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
$$("[data-wa]").forEach(a => a.addEventListener("click", e => {
  e.preventDefault(); BST.contact("WhatsApp", "WhatsApp " + a.dataset.wa);
  const n = $("#fName").value.trim(), c = $("#fCity").value.trim();
  window.open(wa(`Hi Business Santa! I'd like a free check for my ${TYPES[T].l.toLowerCase()} business` + (n ? ` (${n}${c ? ", " + c : ""})` : "") + "."), "_blank", "noopener");
}));

/* the form: email the request to the team, no WhatsApp needed */
const err = $("#fErr");
const show = (el, msg) => { BST.formError("mobile check", el.id); el.closest(".fl").after(err); err.textContent = msg; el.classList.add("bad"); el.focus(); };
const need = (id, msg) => { const el = $(id); if (el.value.trim()) return true; show(el, msg); return false; };
$$("#mForm input").forEach(i => i.addEventListener("input", () => { i.classList.remove("bad"); err.textContent = ""; }));
$("#mForm").addEventListener("submit", async e => {
  e.preventDefault(); err.textContent = "";
  if (!need("#fName", "Add your business name so we know who you are.")) return;
  if (!need("#fCity", "Add your city and state, so we can check your local competition.")) return;
  if (!need("#eName", "Add your name so we know who to reply to.")) return;
  const mail = $("#eMail").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(mail)) { show($("#eMail"), "Add an email we can send your check to, like name@yourbusiness.com."); return; }
  const btn = $("#fSend"); btn.disabled = true; btn.textContent = "Sending...";
  const d = { type: TYPES[T].l, name: $("#fName").value.trim(), city: $("#fCity").value.trim(), site: $("#fSite").value.trim(), who: $("#eName").value.trim(), phone: $("#ePhone").value.trim() };
  try {
    const r = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(CONFIG.email), {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ _subject: `Free check request: ${d.name} (${d.city})`, _template: "box", _captcha: "false", _replyto: mail, name: d.who, email: mail, phone: d.phone || "Not given", business_type: d.type, business_name: d.name, website: d.site || "No website yet", city: d.city, page: location.href, came_from: BST.sourceText() })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || String(j.success) === "false") throw new Error("send");
    BST.lead({ content_name: "Free check", method: "Email", business_type: d.type }, { email: mail, phone: d.phone, name: d.who, city: d.city });
    $("#mForm").style.display = "none"; $("#done").classList.add("on");
  } catch (x) {
    btn.disabled = false; btn.textContent = "Send me my free check"; btn.before(err);
    err.innerHTML = 'That didn\'t go through. Try again, or email us at <a href="mailto:' + CONFIG.email + '">' + CONFIG.email + "</a>.";
  }
});

/* the bottom bar steps aside while the form is on screen */
const bar = $("#bar");
/* the bar comes in once the hero button has scrolled away, so one button is on screen at a time */
const hcta = $(".hero .ctas");
if (hcta) new IntersectionObserver(es => bar.classList.toggle("pre", es[0].isIntersecting)).observe(hcta); else bar.classList.remove("pre");
new IntersectionObserver(es => bar.classList.toggle("hide", es[0].isIntersecting), { rootMargin: "0px 0px -20% 0px" }).observe($("#check"));

/* where the visitor is: their state and city (approximate, never stored) */
const STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington, D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
fetch("/api/geo", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(g => {
  if (!g || g.country !== "US") return; const st = STATES[g.region]; if (!st) return;
  $$(".geoState").forEach(e => put(e, st));
  const city = g.city && g.city.length < 28 ? g.city : ""; if (city) { $("#fCity").placeholder = `${city}, ${g.region}`; $$(".cty").forEach(e => e.textContent = `${city}, ${g.region}`); }
}).catch(() => { });

setType(T, fromAd);

/* videos: they start loading after the page has loaded (or on the first touch), play muted while on screen, and a tap turns the sound on */
const VIDS = $$("video[data-src]");
let vOk = false;
const onScreen = v => { const r = v.getBoundingClientRect(); return r.bottom > innerHeight * .25 && r.top < innerHeight * .75; };
const vRun = v => { if (!vOk) return; if (!v.src) v.src = v.dataset.src; v.play().catch(() => { }); };
const vio = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? vRun(e.target) : e.target.pause()), { threshold: .5 });
const vStart = () => { if (vOk) return; vOk = true; VIDS.forEach(v => { if (onScreen(v)) vRun(v); }); };
VIDS.forEach(v => vio.observe(v));
addEventListener("load", () => setTimeout(vStart, 3000));
["scroll", "pointerdown", "touchstart"].forEach(e => addEventListener(e, vStart, { once: true, passive: true }));
const sndSet = (b, on) => { b.classList.toggle("on", on); b.lastElementChild.textContent = on ? "Sound on" : b.dataset.t; };
$$(".snd").forEach(b => {
  b.dataset.t = b.lastElementChild.textContent;
  const v = $("#" + b.dataset.v);
  const tap = () => {
    vOk = true;
    const on = v.muted;
    VIDS.forEach(o => { if (o !== v && !o.muted) { o.muted = true; sndSet($(`.snd[data-v="${o.id}"]`), false); } });
    v.muted = !on; sndSet(b, on);
    if (on) { if (!v.src) v.src = v.dataset.src; v.currentTime = 0; v.play().catch(() => { }); trackC("PlayedVideo", { video: v.id === "hv" ? "hero" : "manav", from: "mobile" }); }
  };
  b.addEventListener("click", tap); v.addEventListener("click", tap);
});

/* sample report: tabs and swipe stay in step */
const rsw = $("#rsw"), rtb = $$(".rtabs button");
if (rsw && rtb.length) {
  rtb.forEach(b => b.addEventListener("click", () => { rsw.scrollTo({ left: +b.dataset.i * rsw.clientWidth, behavior: "smooth" }); trackC("SampleReportTab", { tab: b.textContent }); }));
  const pg = [...rsw.children], fit = i => { rsw.style.height = pg[i].offsetHeight + "px"; };
  let ri = 0;
  /* size the report card only when it comes near the screen, so the page load does no extra layout work */
  new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { o.disconnect(); requestAnimationFrame(() => { fit(ri); new ResizeObserver(() => fit(ri)).observe(pg[0]); }); } }, { rootMargin: "600px 0px" }).observe(rsw);
  rsw.addEventListener("scroll", () => { const i = Math.round(rsw.scrollLeft / rsw.clientWidth); if (i !== ri) { ri = i; fit(i); rtb.forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-pressed", k === i); }); rtb[i].parentNode.scrollTo({ left: rtb[i].offsetLeft - 12, behavior: "smooth" }); } }, { passive: true });
}

/* reviews: swipe, with dots */
const rv = $("#rv"), rvd = $("#rvd");
if (rv && rvd) {
  const cards = [...rv.children]; rvd.innerHTML = cards.map(() => "<i></i>").join("");
  const dots = [...rvd.children]; let ci = -1;
  const mark = () => { const w = cards[0].offsetWidth + 12, i = Math.max(0, Math.min(cards.length - 1, Math.round(rv.scrollLeft / w))); if (i !== ci) { ci = i; dots.forEach((d, k) => d.classList.toggle("on", k === i)); } };
  rv.addEventListener("scroll", mark, { passive: true }); ci = 0; dots[0].classList.add("on");
}
