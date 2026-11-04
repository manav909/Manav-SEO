#!/usr/bin/env python3
"""Builds the mobile page (businesssanta/m.html) and its script.
The shop scene, the free check form and their styles are copied from the desktop index.html on every build,
so both pages always share one form. Business types and lead sending come from app.js the same way."""
import re, base64, html, os, subprocess, hashlib, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(HERE, "../../../businesssanta"))
idx = open(os.path.join(SITE, "index.html")).read()
app = open(os.path.join(HERE, "..", "app.js")).read()
tpl = open(os.path.join(HERE, "m.tpl.html")).read()
main = open(os.path.join(HERE, "main.js")).read()

def cut(s, a, b, inc_b=False):
    i = s.index(a); j = s.index(b, i)
    return s[i:j + (len(b) if inc_b else 0)]

shop = cut(idx, '<div class="shopw rv" aria-hidden="true">', '<div class="form rv" id="formBox">')
form = cut(idx, '<div class="form rv" id="formBox">', '<div class="done" id="done"')
done = cut(idx, '<div class="done" id="done"', '</p></div>', True)
form = form + done + "\n</div>"
shopcss = cut(idx, '.shopw{position:relative;--spr', '@media (prefers-reduced-motion:reduce){.shop *')
formcss = cut(idx, '.fh{display:flex', '@media (max-width:760px){.ckx')
base = []
for sel in ['.btn:active{', '.btn svg{', '.form{', '.form h3{', '.form .sub{', '.fl{', '.fl span{', '.fl span small{', '.fl input,.fl select{', '.fl input:focus,.fl select:focus{', '.two{', '.err{', '.form .btn{', '.btn.wa{', '.btn.wa:hover{', '.alt{', '.em{', '.em.on{', '.btn.dk{', '.done{', '.done.on{', '.done i{', '.priv{']:
    m = re.search(re.escape(sel) + r'[^}]*}', idx); base.append(m.group(0))
ld = cut(idx, '<script type="application/ld+json">', '</script>', True)
flag = cut(idx, '<rect width="19" height="10" fill="#B22234"/>', '</svg>')
waico = cut(idx, '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04', '</svg>', True)
poster = base64.b64encode(open(os.path.join(SITE, "assets/video/night-mq.jpg"), "rb").read()).decode()

types = cut(app, "const TYPES = {", "\n};", True)
leads = cut(app, "/* ---------- leads ---------- */", "/* ---------- local")
leads = "\n".join(l for l in leads.split("\n") if not l.startswith('$("#barWa")') and "if (MOB()) requestAnimationFrame(() => { const r = stps[ck]" not in l)


P = {
 "phone": '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
 "pin": '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
 "ok": '<path d="M5 12l5 5 9-10"/>',
 "up": '<path d="M6 15l6-6 6 6"/>',
 "alert": '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.5h.01"/>',
 "spark": '<path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z"/>',
 "star": '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
 "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5"/>',
 "shield": '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
 "check": '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
 "msg": '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
 "unlock": '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 7.6-1.7"/>',
 "key": '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l2.5 2.5M18.5 4.5L21 7"/>',
 "gift": '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5M12 8C10 4 6.5 4.5 7 7c.3 1.2 2.6 1 5 1zM12 8c2-4 5.5-3.5 5-1-.3 1.2-2.6 1-5 1z"/>',
 "x": '<path d="M6 6l12 12M18 6L6 18"/>',
 "cal": '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
 "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
 "enter": '<path d="M14 3h5v18h-5"/><path d="M3 12h11M10 8l4 4-4 4"/>',
 "plumbing": '<path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3.5 17.5l3 3 6-6a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-.6-.6-2.4z"/>',
 "restaurant": '<path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17.5 21V3c-2.2 0-3.5 3-3.5 7 0 2.5 1.2 3.5 3.5 3.5"/>',
 "dental": '<path d="M7.5 3.5C5 3.5 3.5 5.4 3.5 8c0 3 1.6 4.4 2 7.8.4 2.9 1.2 5.2 2.5 5.2s1.6-2.7 2-4.6c.3-1.4.8-2 2-2s1.7.6 2 2c.4 1.9.7 4.6 2 4.6s2.1-2.3 2.5-5.2c.4-3.4 2-4.8 2-7.8 0-2.6-1.5-4.5-4-4.5-1.8 0-2.6 1-4.5 1s-2.7-1-4.5-1z"/>',
 "roofing": '<path d="M3 11.5L12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20"/>',
 "salon": '<circle cx="6.5" cy="6.5" r="3"/><circle cx="6.5" cy="17.5" r="3"/><path d="M9 8.5L20 19M9 15.5L20 5"/>',
 "law": '<path d="M12 3.5v17M7.5 20.5h9M5 7h14M5 7l-2.5 6.5a2.6 2.6 0 0 0 5 0zM19 7l-2.5 6.5a2.6 2.6 0 0 0 5 0z"/>',
 "store": '<path d="M5 8h14l-1.2 12.5H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
 "other": '<path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9zM19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2-2.2-.8 2.2-.8z"/>',
}
svg = lambda k, w=None: f'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"{f" style=\"width:{w}px;height:{w}px\"" if w else ""}>{P[k]}</svg>'
import json
BI = {k: svg(k) for k in ["plumbing","restaurant","dental","roofing","salon","law","store","other"]}
GI = {"calls": svg("phone"), "maps": svg("pin"), "rev": svg("star"), "ai": svg("spark"), "walk": svg("enter"), "web": svg("globe")}
UI = {k: svg(k) for k in ["phone","cal","star","spark","pin"]}
ICONJS = "const BI = " + json.dumps(BI) + ", GI = " + json.dumps(GI) + ", UI = " + json.dumps(UI) + ";"

TY = [("plumbing", "Plumbing"), ("restaurant", "Restaurant"), ("dental", "Dental"), ("roofing", "Roofing"), ("salon", "Salon or spa"), ("law", "Law office"), ("store", "Shop or store"), ("other", "Something else")]
chips = "".join(f'<button type="button" data-k="{k}" aria-pressed="{"true" if k == "plumbing" else "false"}">{svg(k)}{n}</button>' for k, n in TY)
ico = lambda d: f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{d}</svg>'
actions = f'<span>{ico("<path d=\"M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2\"/>")}Call</span><span>{ico("<path d=\"M3 11l18-8-8 18-2-8z\"/>")}Directions</span><span>{ico("<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18\"/>")}Website</span>'
mapsvg = '<svg viewBox="0 0 360 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="360" height="110" fill="#e8efe3"/><path d="M0 70h360M130 0v110M0 24h360M262 0v110" stroke="#fff" stroke-width="9"/><path d="M0 104L360 38" stroke="#ffd27a" stroke-width="11"/><rect x="22" y="36" width="92" height="26" rx="4" fill="#cfe3c4"/><circle cx="70" cy="86" r="5" fill="#9aa0a6"/><circle cx="300" cy="60" r="5" fill="#9aa0a6"/></svg>'
search = '<svg viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
REV = [("T", "#2563eb", "Technical fixes", 7, "I'm not a website or technology person at all, so having someone who takes the time to explain things and answer my questions means a lot to me.", True),
       ("M", "#db2777", "Online store SEO", 4, "The team was professional, polite, well-spoken, and highly knowledgeable.", False),
       ("J", "#16a34a", "Online store SEO", 6, "They provided a very detailed report that went above and beyond what we were expecting.", False),
       ("C", "#ea580c", "Full SEO package", 4, "Working with Manav was one of the best decisions I made during the launch of my business.", False),
       ("V", "#7c3aed", "Technical fixes", 3, "Manav and team were exceptional.", False)]
fl = f'<svg class="flag" viewBox="0 0 19 10" aria-hidden="true">{flag}</svg>'
reviews = "".join(f'<article class="rc{" f" if f else ""}"><div class="rct"><span class="st5" aria-label="5 out of 5 stars">★★★★★</span><em>{s}</em></div><blockquote>“{html.escape(q)}”</blockquote><div class="rwh"><span class="ra" style="--c:{c}" aria-hidden="true">{a}</span><div><b>Verified client <i class="vk" aria-hidden="true"></i></b><small>{fl} United States · Done in {d} days</small></div></div></article>' for a, c, s, d, q, f in REV)

out = (tpl.replace("{LDJSON}", ld).replace("{POSTER}", poster).replace("{BASECSS}", "\n".join(base)).replace("{SHOPCSS}", shopcss).replace("{FORMCSS}", formcss)
       .replace("{SHOP}", shop).replace("{FORM}", form).replace("{FLAG}", flag).replace("{CHIPS}", chips).replace("{ACTIONS}", actions).replace("{MAPSVG}", mapsvg)
       .replace("{SEARCHICO}", search).replace("{WAICO}", waico).replace("{REVIEWS}", reviews))
for k, w in [("PIN", 0), ("PHONE", 0), ("OK", 0), ("UP", 0), ("ALERT", 0), ("SPARK", 0), ("CHECK", 0), ("MSG", 0), ("UNLOCK", 0), ("KEY", 0), ("X", 0)]:
    out = out.replace("{I_" + k + "}", svg(k.lower()))
for k, n in [("STAR_S", "star"), ("USERS_S", "users"), ("SHIELD_S", "shield"), ("GIFT_S", "gift")]:
    out = out.replace("{I_" + k + "}", svg(n, 12))
js = main.replace("/*TYPES*/", types).replace("/*ICONS*/", ICONJS).replace("/*FORM*/", leads)
open("/tmp/bs-m.js", "w").write(js)
subprocess.run(["npx", "--yes", "esbuild@0.21.5", "/tmp/bs-m.js", "--minify", "--format=esm", "--target=es2020", "--legal-comments=none", "--outfile=/tmp/bs-m.min.js"], check=True)
mj = open("/tmp/bs-m.min.js").read(); h = hashlib.sha1(mj.encode()).hexdigest()[:10]
jsdir = os.path.join(SITE, "assets/js")
for f in os.listdir(jsdir):
    if f.startswith("m.") and f.endswith(".js"): os.remove(os.path.join(jsdir, f))
open(os.path.join(jsdir, f"m.{h}.js"), "w").write(mj)
out = out.replace('/assets/js/m.js', f'/assets/js/m.{h}.js')
left = re.findall(r"\{[A-Z]+\}", out)
if left: sys.exit("unfilled: " + ", ".join(left))
open(os.path.join(SITE, "m.html"), "w").write(out)
print("built m.html and m." + h + ".js")
