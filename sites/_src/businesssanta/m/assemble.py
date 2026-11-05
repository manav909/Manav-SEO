#!/usr/bin/env python3
"""Builds the mobile page (businesssanta/m.html) and its script from m.tpl.html and main.js.
Business types come from the desktop app.js so both pages always describe businesses the same way."""
import re, html, os, subprocess, hashlib, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(HERE, "../../../businesssanta"))
idx = open(os.path.join(SITE, "index.html")).read()
app = open(os.path.join(HERE, "..", "app.js")).read()
tpl = open(os.path.join(HERE, "m.tpl.html")).read()
main = open(os.path.join(HERE, "main.js")).read()
def cut(s, a, b, inc=False):
    i = s.index(a); j = s.index(b, i); return s[i:j + (len(b) if inc else 0)]
ld = cut(idx, '<script type="application/ld+json">', '</script>', True)
flag = cut(idx, '<rect width="19" height="10" fill="#B22234"/>', '</svg>')
waico = cut(idx, '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04', '</svg>', True)
types = cut(app, "const TYPES = {", "\n};", True)
P = {
 "search": '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
 "searchoff": '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8.5 8.5l5 5M13.5 8.5l-5 5"/>',
 "phone": '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
 "phonex": '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10 18h4M10 8.5l4 4M14 8.5l-4 4"/>',
 "dir": '<path d="M3 11l18-8-8 18-2-8z"/>',
 "pin": '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
 "ok": '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
 "rank": '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
 "list": '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
 "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5"/>',
 "tag": '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
 "plumbing": '<path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3.5 17.5l3 3 6-6a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-.6-.6-2.4z"/>',
 "restaurant": '<path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17.5 21V3c-2.2 0-3.5 3-3.5 7 0 2.5 1.2 3.5 3.5 3.5"/>',
 "dental": '<path d="M7.5 3.5C5 3.5 3.5 5.4 3.5 8c0 3 1.6 4.4 2 7.8.4 2.9 1.2 5.2 2.5 5.2s1.6-2.7 2-4.6c.3-1.4.8-2 2-2s1.7.6 2 2c.4 1.9.7 4.6 2 4.6s2.1-2.3 2.5-5.2c.4-3.4 2-4.8 2-7.8 0-2.6-1.5-4.5-4-4.5-1.8 0-2.6 1-4.5 1s-2.7-1-4.5-1z"/>',
 "roofing": '<path d="M3 11.5L12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20"/>',
 "salon": '<circle cx="6.5" cy="6.5" r="3"/><circle cx="6.5" cy="17.5" r="3"/><path d="M9 8.5L20 19M9 15.5L20 5"/>',
 "law": '<path d="M12 3.5v17M7.5 20.5h9M5 7h14M5 7l-2.5 6.5a2.6 2.6 0 0 0 5 0zM19 7l-2.5 6.5a2.6 2.6 0 0 0 5 0z"/>',
 "store": '<path d="M5 8h14l-1.2 12.5H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
 "other": '<path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z"/>',
}
svg = lambda k: f'<svg class="i" viewBox="0 0 24 24" aria-hidden="true">{P[k]}</svg>'
BI = {k: svg(k) for k in ["plumbing", "restaurant", "dental", "roofing", "salon", "law", "store", "other"]}
ICONJS = "const BI = " + json.dumps(BI) + ";"
TY = [("plumbing", "Plumbing"), ("restaurant", "Restaurant"), ("dental", "Dental"), ("roofing", "Roofing"), ("salon", "Salon or spa"), ("law", "Law office"), ("store", "Shop or store"), ("other", "Something else")]
options = "".join(f'<option value="{k}">{n}</option>' for k, n in TY)
fl = f'<svg class="flag" viewBox="0 0 19 10" aria-hidden="true">{flag}</svg>'
REV = [("T", "#2563eb", "Technical fixes", 7, "I'm not a website or technology person at all, so having someone who takes the time to explain things and answer my questions means a lot to me."),
       ("C", "#ea580c", "Full SEO package", 4, "Working with Manav was one of the best decisions I made during the launch of my business."),
       ("J", "#16a34a", "Online store SEO", 6, "They provided a very detailed report that went above and beyond what we were expecting."),
       ("M", "#db2777", "Online store SEO", 4, "The team was professional, polite, well-spoken, and highly knowledgeable.")]
reviews = "".join(f'<article class="rc"><span class="st" aria-label="5 out of 5 stars">★★★★★</span><blockquote>“{html.escape(q)}”</blockquote><div class="rw"><span class="ra" style="--c:{c}" aria-hidden="true">{a}</span><div><b>Verified client <i class="vk" aria-hidden="true"></i></b><small>{fl} United States · {s} · {d} days</small></div></div></article>' for a, c, s, d, q in REV)
out = tpl.replace("{LDJSON}", ld).replace("{FLAG}", flag).replace("{WAICO}", waico).replace("{REVIEWS}", reviews).replace("{OPTIONS}", options)
for k in ["SEARCH", "SEARCHOFF", "PHONE", "PHONEX", "DIR", "PIN", "OK", "RANK", "LIST", "USERS", "TAG"]:
    out = out.replace("{I_" + k + "}", svg(k.lower()))
js = main.replace("/*TYPES*/", types).replace("/*ICONS*/", ICONJS)
open("/tmp/bs-m.js", "w").write(js)
subprocess.run(["npx", "--yes", "esbuild@0.21.5", "/tmp/bs-m.js", "--minify", "--format=esm", "--target=es2020", "--legal-comments=none", "--outfile=/tmp/bs-m.min.js"], check=True)
mj = open("/tmp/bs-m.min.js").read(); h = hashlib.sha1(mj.encode()).hexdigest()[:10]
jsdir = os.path.join(SITE, "assets/js")
for f in os.listdir(jsdir):
    if f.startswith("m.") and f.endswith(".js"): os.remove(os.path.join(jsdir, f))
open(os.path.join(jsdir, f"m.{h}.js"), "w").write(mj)
out = out.replace("/assets/js/m.js", f"/assets/js/m.{h}.js")
left = re.findall(r"\{[A-Z_]+\}", out)
if left: sys.exit("unfilled: " + ", ".join(left))
open(os.path.join(SITE, "m.html"), "w").write(out)
print("built m.html and m." + h + ".js")
