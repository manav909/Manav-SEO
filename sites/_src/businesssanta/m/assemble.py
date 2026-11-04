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

TY = [("plumbing", "Plumbing"), ("restaurant", "Restaurant"), ("dental", "Dental"), ("roofing", "Roofing"), ("salon", "Salon or spa"), ("law", "Law office"), ("store", "Shop or store"), ("other", "Something else")]
chips = "".join(f'<button type="button" data-k="{k}" aria-pressed="{"true" if k == "plumbing" else "false"}">{n}</button>' for k, n in TY)
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
js = main.replace("/*TYPES*/", types).replace("/*FORM*/", leads)
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
