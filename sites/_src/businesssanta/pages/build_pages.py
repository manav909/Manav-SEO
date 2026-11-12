#!/usr/bin/env python3
"""Builds the Business Santa SEO pages (industries, local SEO hub, AI search, guides) as fast static HTML,
plus sitemap.xml. Run after editing content.py. One URL per page, same HTML for phones and desktops."""
import os, json, html, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import SITE, TODAY, INDUSTRIES, HUB, AI_PAGE, GUIDES, GOOGLE_LOCAL, ROOF_EXTRA, ROOF_GUIDES
ALLG = GUIDES + ROOF_GUIDES

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../businesssanta"))
E = html.escape
ORG = {"@id": f"{SITE}/#org"}
FOUNDER = {"@id": f"{SITE}/#manav"}
PRICES = [("On-page SEO fixes", 120), ("Technical SEO fixes", 160)]
WA = "https://wa.me/917009775189?text=" + "Hi%20Business%20Santa%2C%20I%27d%20like%20a%20free%20check%20for%20my%20business."

CSS = """@font-face{font-family:"BS Head";src:url(/assets/img/bs-head-800.woff2) format("woff2");font-weight:600 900;font-display:swap}
@font-face{font-family:"BS Serif";src:url(/assets/img/bs-serif-i.woff2) format("woff2");font-style:italic;font-weight:400;font-display:swap}
:root{--y:#FDB913;--yd:#8a5a00;--ink:#0f172a;--ink2:#334155;--mut:#64748b;--line:#e5e7eb;--soft:#f8fafc;--navy:#0b1220;--f:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--fh:"BS Head",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;--fs:"BS Serif",Georgia,serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;font:17px/1.6 var(--f);color:var(--ink2);background:#fff}
a{color:var(--ink)}img{max-width:100%;height:auto}
.w{max-width:780px;margin:0 auto;padding:0 20px}
.hd{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line)}
.hd .w{display:flex;align-items:center;justify-content:space-between;height:60px;max-width:1080px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font:800 1.05rem var(--fh);letter-spacing:-.02em}.brand img{border-radius:50%}.brand i{font-style:normal;color:var(--yd)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;border-radius:999px;background:var(--y);color:#111;font:800 1rem var(--fh);text-decoration:none;letter-spacing:-.01em}
.btn.dk{background:var(--navy);color:#fff;padding:10px 16px;font-size:.92rem}
.btn.wa{background:#25D366;color:#052e16}
.crumb{margin:22px 0 0;font-size:.85rem;color:var(--mut)}.crumb a{color:var(--mut)}
h1,h2,h3{font-family:var(--fh);font-weight:800;color:var(--ink);letter-spacing:-.03em;margin:0}
h1{margin-top:14px;font-size:clamp(2.2rem,6vw,3.4rem);line-height:1.02;letter-spacing:-.04em}
h2{margin-top:52px;font-size:clamp(1.65rem,4.5vw,2.2rem);line-height:1.08}
h3{font-size:1.15rem;line-height:1.25;letter-spacing:-.015em}
.ac{font-family:var(--fs);font-style:italic;font-weight:400;letter-spacing:-.01em;color:var(--yd);font-size:1.08em}
h1 .ac{display:block;color:var(--ink)}h1 .ac span{background:linear-gradient(transparent 64%,rgba(253,185,19,.7) 64%,rgba(253,185,19,.7) 92%,transparent 92%)}
.ans{margin:22px 0 0;padding:18px 20px;border-left:4px solid var(--y);background:#fffaeb;border-radius:0 14px 14px 0;color:var(--ink);font-size:1.08rem}
.lead{font-size:1.08rem}
.qs{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0;padding:0;list-style:none}.qs li{padding:8px 14px;border-radius:999px;background:var(--soft);box-shadow:0 0 0 1px var(--line);font-size:.93rem;color:var(--ink)}
.qs li::before{content:"\\201C"}.qs li::after{content:"\\201D"}
.grid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:18px}@media(min-width:700px){.grid{grid-template-columns:1fr 1fr}}
.card{padding:18px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px var(--line),0 8px 24px rgba(15,23,42,.05)}.card p{margin:6px 0 0;font-size:.97rem}
ol.steps{counter-reset:s;list-style:none;margin:18px 0 0;padding:0}ol.steps li{counter-increment:s;position:relative;padding:0 0 18px 50px}ol.steps li::before{content:counter(s);position:absolute;left:0;top:0;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--y);color:#111;font:800 .95rem var(--fh)}
ol.steps b{display:block;color:var(--ink);font-family:var(--fh);letter-spacing:-.01em}
.price{display:grid;grid-template-columns:1fr;gap:10px;margin-top:16px}@media(min-width:700px){.price{grid-template-columns:repeat(3,1fr)}}
.price div{padding:16px;border-radius:16px;background:var(--soft);box-shadow:0 0 0 1px var(--line)}.price b{display:block;font:800 1.5rem var(--fh);color:var(--ink)}.price span{font-size:.9rem}
.faq details{border-bottom:1px solid var(--line)}.faq summary{cursor:pointer;list-style:none;padding:16px 28px 16px 0;position:relative;font:800 1.05rem var(--fh);color:var(--ink);letter-spacing:-.01em}.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";position:absolute;right:4px;top:12px;font-size:1.4rem;color:var(--yd)}.faq details[open] summary::after{content:"\\2212"}.faq p{margin:0 0 16px}
.cta{margin:56px 0 0;padding:28px 22px;border-radius:24px;background:var(--navy);color:#cbd5e1;text-align:center}.cta h2{margin:0;color:#fff}.cta .ac{color:var(--y)}.cta p{margin:10px auto 18px;max-width:520px}
.cta .row{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.by{display:flex;align-items:center;gap:14px;margin:40px 0 0;padding:16px;border-radius:18px;background:var(--soft)}.by img{border-radius:50%;flex:none}.by p{margin:2px 0 0;font-size:.92rem}
.src{margin-top:10px;font-size:.88rem;color:var(--mut)}
.rel{margin:48px 0 0}.rel ul{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;padding:0;list-style:none}.rel a{display:inline-block;padding:8px 14px;border-radius:999px;background:var(--soft);box-shadow:0 0 0 1px var(--line);text-decoration:none;font-size:.92rem}
.proof{margin-top:18px}.proof .sum{display:flex;align-items:center;gap:12px;margin-bottom:12px}.proof .sum b{font:800 2.2rem var(--fh);color:var(--ink)}.proof .sum span{font-size:.92rem}.st{color:#f5a400;letter-spacing:2px}
.rv{display:grid;grid-template-columns:1fr;gap:12px}@media(min-width:760px){.rv{grid-template-columns:repeat(3,1fr)}}
.rv article{padding:16px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px var(--line)}.rv h3{margin:6px 0 0;font-size:1.02rem}.rv blockquote{margin:8px 0 10px;font-size:.95rem;color:var(--ink2)}.rv small{color:var(--mut);font-size:.82rem}
.mid{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:40px 0 0;padding:18px 20px;border-radius:18px;background:#fff3c4}.mid p{margin:0;color:var(--ink);font-weight:700}
.lead-f{margin:56px 0 0;padding:26px 20px;border-radius:24px;background:var(--navy);color:#cbd5e1}.lead-f h2{margin:0;color:#fff}.lead-f .ac{color:var(--y)}.lead-f>p{margin:10px 0 16px}
.lead-f form{display:grid;grid-template-columns:1fr;gap:10px}@media(min-width:700px){.lead-f form{grid-template-columns:1fr 1fr}.lead-f .full{grid-column:1/-1}}
.lead-f label{display:block;font-size:.85rem;color:#e2e8f0}.lead-f label small{color:#94a3b8}.lead-f input{display:block;width:100%;margin-top:4px;padding:12px 14px;border:1px solid #334155;border-radius:12px;background:#0f172a;color:#fff;font:16px var(--f)}
.lead-f input.bad{border-color:#f87171}.lead-f .err{min-height:1px;color:#fca5a5;font-size:.9rem}.lead-f button{width:100%;border:0;cursor:pointer}.lead-f .or{margin:12px 0;text-align:center;color:#94a3b8;font-size:.85rem}
.lead-f .done{display:none;padding:18px;border-radius:16px;background:#052e16;color:#bbf7d0}.lead-f .done.on{display:block}.lead-f .priv{margin:4px 0 0;font-size:.8rem;color:#94a3b8}.lead-f .priv a{color:#cbd5e1}
.kw{margin-top:14px}.kw h3{margin:22px 0 0}
.clu{margin:40px 0 0;padding:18px 20px;border-radius:18px;box-shadow:0 0 0 2px var(--y)}.clu h2{margin:0;font-size:1.35rem}.clu ul{margin:10px 0 0;padding-left:1.1em}.clu li{margin:6px 0}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:9;display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(255,255,255,.97);box-shadow:0 -6px 20px rgba(15,23,42,.08);transition:transform .25s}
.bar .btn{flex:1}.bar .btn.wa{flex:none;padding:12px 16px}.bar.hide{transform:translateY(110%)}@media(min-width:900px){.bar{display:none}}
body{padding-bottom:76px}@media(min-width:900px){body{padding-bottom:0}}
.ft{margin-top:64px;padding:28px 0 40px;border-top:1px solid var(--line);font-size:.88rem;color:var(--mut)}.ft .ftg{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;max-width:1080px}.ft nav{display:flex;flex-direction:column;gap:7px}.ft nav b{font:800 .95rem var(--fh);color:var(--ink);margin-bottom:2px}.ft a{color:var(--mut);text-decoration:none}.ft a:hover{color:var(--ink);text-decoration:underline}.ft .ftc{max-width:1080px;margin-top:26px;padding-top:16px;border-top:1px solid var(--line)}@media(max-width:760px){.ft .ftg{grid-template-columns:1fr 1fr;gap:26px 18px}}
"""

JS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "track.js")).read() + r"""
(function(){var B=window.BST,MAIL="seo@businesssanta.com",k=(document.getElementById("lf")||{}).dataset;if(k&&k.type)B.type(k.type.charAt(0).toUpperCase()+k.type.slice(1));
document.querySelectorAll("[data-wa]").forEach(function(a){a.addEventListener("click",function(){B.contact("WhatsApp","WhatsApp "+a.dataset.wa)})});
document.querySelectorAll('a[href="#check"]').forEach(function(a){a.addEventListener("click",function(){B.event("OpenedFreeCheck",{from:a.closest(".bar")?"bar":a.closest(".mid")?"mid":"header"})})});
var f=document.getElementById("lf"),er=document.getElementById("lfErr"),b=document.getElementById("lfB");if(!f)return;
function v(id){return document.getElementById(id).value.trim()}function bad(id,m){var el=document.getElementById(id);el.classList.add("bad");el.focus();er.textContent=m;B.formError("page check",id);return false}
f.addEventListener("input",function(e){e.target.classList.remove("bad");er.textContent=""});
f.addEventListener("submit",function(e){e.preventDefault();er.textContent="";
if(!v("lfN"))return bad("lfN","Add your business name so we know who you are.");if(!v("lfC"))return bad("lfC","Add your city and state, so we can check your local competition.");
if(!v("lfW"))return bad("lfW","Add your name so we know who to reply to.");if(!/^\S+@\S+\.\S+$/.test(v("lfE")))return bad("lfE","Add an email we can send your check to.");
b.disabled=true;b.textContent="Sending...";var t=f.dataset.type;
fetch("https://formsubmit.co/ajax/"+encodeURIComponent(MAIL),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({_subject:"Free check request: "+v("lfN")+" ("+v("lfC")+")",_template:"box",_captcha:"false",_replyto:v("lfE"),name:v("lfW"),email:v("lfE"),phone:v("lfP")||"Not given",business_type:t,business_name:v("lfN"),website:v("lfS")||"No website yet",city:v("lfC"),page:location.href,came_from:B.sourceText()})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok||String(j.success)==="false")throw 0})})
.then(function(){B.lead({content_name:"Free check",method:"Email",business_type:t},{email:v("lfE"),phone:v("lfP"),name:v("lfW"),city:v("lfC")});f.style.display="none";document.getElementById("lfD").classList.add("on")})
.catch(function(){b.disabled=false;b.textContent="Send me my free check";er.innerHTML='That didn\'t go through. Try again, or email us at <a href="mailto:'+MAIL+'">'+MAIL+"</a>."})});
var bar=document.getElementById("bar"),ck=document.getElementById("check");if(bar&&ck&&"IntersectionObserver"in window)new IntersectionObserver(function(es){bar.classList.toggle("hide",es[0].isIntersecting)},{rootMargin:"0px 0px -10% 0px"}).observe(ck);
})();"""

def page_links(cur):
    items = [(f"/{p['slug']}", p["h1"]) for p in INDUSTRIES] + [("/local-seo", "Local SEO for any business"), ("/ai-search-optimization", "Get recommended by ChatGPT")] + [(f"/{g['slug']}", g["h1"].rstrip(":") + ": " + g["h1ac"] if g["h1"].endswith(":") else g["h1"] + " " + g["h1ac"]) for g in ALLG]
    return [(u, t) for u, t in items if u != "/" + cur]

# Site-wide link lists. Footers on every page (inner pages, desktop home, mobile home) are built from these,
# the same lists the sitemap uses, so a new page shows up everywhere on the next build.
# Give a new page a short "nav" label in content.py; otherwise one is derived.
_GNAV = {"guides/google-business-profile-checklist": "Google profile checklist",
         "guides/why-my-business-is-not-on-google-maps": "Not on Google Maps?",
         "guides/roofing-seo-keywords": "Roofing SEO keywords",
         "guides/google-business-profile-for-roofers": "Google profile for roofers",
         "guides/roofing-leads-after-a-storm": "Storm season leads",
         "guides/roofing-seo-cost": "Roofing SEO cost"}
def _ilabel(p): return p.get("nav") or {"retail stores and boutiques": "Retail stores"}.get(p["noun"], p["noun"]).capitalize()
def _glabel(g): return g.get("nav") or _GNAV.get(g["slug"]) or g["h1"].rstrip(":?")
IND_LINKS = [("/" + p["slug"], _ilabel(p)) for p in INDUSTRIES]
GUIDE_LINKS = [("/" + g["slug"], _glabel(g)) for g in ALLG]
SVC_LINKS = [("/local-seo", "Local SEO services"), ("/ai-search-optimization", "Get recommended by ChatGPT")]
def _nav(label, links, cls=""):
    return f'<nav aria-label="{label}"{cls}><b>{label}</b>' + "".join(f'<a href="{u}">{E(t)}</a>' for u, t in links) + "</nav>"

FOOTER = ('<footer class="ft"><div class="w ftg">'
    + _nav("Services", [("/", "Home")] + SVC_LINKS + [("https://seoseason.com/businesssanta", "Services and prices"), ("/#check", "Free check")])
    + _nav("By industry", IND_LINKS) + _nav("Guides", GUIDE_LINKS)
    + _nav("Company", [("https://seoseason.com/", "SEO Season"), ("https://www.instagram.com/businesssanta", "Instagram"), ("/privacy", "Privacy"), ("/terms", "Terms"), ("mailto:seo@businesssanta.com", "seo@businesssanta.com")])
    + '</div><div class="w ftc">© 2026 Business Santa, powered by SEO Season. Serving small businesses in all 50 states.</div></footer>')

# Who we are, on every page: Google and AI assistants read each page on its own, so each one names the business,
# its founder and the website, matching the full description on the home page (same @id values).
import home_ld
def _site_nodes():
    keep = {"WebSite": None,
            "Organization": ["@type", "@id", "name", "alternateName", "url", "logo", "image", "description", "email", "areaServed", "founder", "parentOrganization", "sameAs", "contactPoint"],
            "Person": ["@type", "@id", "name", "jobTitle", "url", "worksFor", "description"]}
    out = []
    for n in home_ld.org():
        t = n["@type"] if isinstance(n["@type"], str) else n["@type"][0]
        if n["@id"] == f"{SITE}/#site": out.append(n)
        elif n["@id"] == f"{SITE}/#org": out.append({k: n[k] for k in keep["Organization"] if k in n})
        elif n["@id"] == f"{SITE}/#manav": out.append({k: n[k] for k in keep["Person"] if k in n})
        elif n["@id"] == f"{home_ld.SS}/#org": out.append({k: n[k] for k in ("@type", "@id", "name", "url") if k in n})
    return out
SITE_NODES = _site_nodes()

def shell(slug, title, desc, body, graph, crumb_name, og_type="website", parent=None):
    url = f"{SITE}/{slug}"
    par = next((i for i in INDUSTRIES if i["slug"] == parent), None)
    graph = [
        {"@type": "WebPage", "@id": url + "#page", "url": url, "name": title, "description": desc, "inLanguage": "en-US",
         "isPartOf": {"@id": f"{SITE}/#site"}, "about": ORG, "dateModified": TODAY,
         "breadcrumb": {"@id": url + "#crumb"}},
        {"@type": "BreadcrumbList", "@id": url + "#crumb", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Business Santa", "item": SITE + "/"},
            *([{"@type": "ListItem", "position": 2, "name": par["h1"], "item": f"{SITE}/{par['slug']}"}] if par else []),
            {"@type": "ListItem", "position": 3 if par else 2, "name": crumb_name, "item": url}]},
    ] + graph + SITE_NODES
    ld = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":"))
    rel = "".join(f'<li><a href="{u}">{E(t)}</a></li>' for u, t in page_links(slug))
    return f"""<!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#0b1220">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" as="font" type="font/woff2" href="/assets/img/bs-head-800.woff2" crossorigin>
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Business Santa">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:image" content="{SITE}/assets/img/og.jpg">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary_large_image">
<style>{CSS}</style>
<script type="application/ld+json">{ld}</script>
</head>
<body>
<header class="hd"><div class="w"><a class="brand" href="/"><img src="/assets/img/logo-96.webp" alt="" width="36" height="36">Business <i>Santa</i></a><a class="btn dk" href="#check">Free check</a></div></header>
<main class="w">
<nav class="crumb" aria-label="Breadcrumb"><a href="/">Business Santa</a> › {f'<a href="/{par["slug"]}">{E(par["h1"])}</a> › ' if par else ''}<span>{E(crumb_name)}</span></nav>
{body}
<section class="rel"><h2>More from Business Santa</h2><ul>{rel}</ul></section>
</main>
<div class="bar" id="bar"><a class="btn" href="#check">Get my free check</a><a class="btn wa" href="{WA}" rel="noopener" data-wa="bar" aria-label="Message us on WhatsApp">WhatsApp</a></div>
{FOOTER}
<script>{JS}</script>
</body>
</html>
"""

def h1(a, ac):
    return f'<h1>{E(a)} <span class="ac"><span>{E(ac)}</span></span></h1>'

def faq_html(faq):
    return '<div class="faq">' + "".join(f"<details><summary>{E(q)}</summary><p>{E(a)}</p></details>" for q, a in faq) + "</div>"

def faq_ld(url, faq):
    return {"@type": "FAQPage", "@id": url + "#faq", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}

def service_ld(url, name, desc, stype):
    return {"@type": "Service", "@id": url + "#service", "name": name, "serviceType": stype, "description": desc,
            "provider": ORG, "areaServed": {"@type": "Country", "name": "United States"}, "url": url,
            "offers": [{"@type": "Offer", "name": n, "price": str(p), "priceCurrency": "USD", "priceSpecification": {"@type": "PriceSpecification", "minPrice": p, "priceCurrency": "USD"}} for n, p in PRICES]
                      + [{"@type": "Offer", "name": "Free check", "price": "0", "priceCurrency": "USD"}]}

def price_html():
    return ('<div class="price" data-track="pricing"><div><b>Free</b><span>Your first check, from a real person. No card, no contract.</span></div>'
            '<div><b>From $120</b><span>On-page SEO fixes, one time.</span></div>'
            '<div><b>From $160</b><span>Technical SEO fixes, one time.</span></div></div>'
            '<p class="src">Monthly SEO, AI search and full packages are quoted after the free check. <a href="https://seoseason.com/businesssanta">See every service and price</a>.</p>')

REV = [("Patient, plain-English help", "I\u2019m not a website or technology person at all, so having someone who takes the time to explain things and answer my questions means a lot to me.", "Technical SEO"),
       ("Technical problems, solved", "Manav and team were exceptional. I had a lot of technical SEO issues with my new website\u2026", "Technical SEO"),
       ("Worth 5 to 10 times what I paid", "The quality and depth of research was extraordinary, easily worth 5-10 times what I paid", "Full SEO package")]

def proof_html(who):
    cards = "".join(f'<article><span class="st" aria-label="5 out of 5 stars">\u2605\u2605\u2605\u2605\u2605</span><h3>{E(h)}</h3><blockquote>\u201c{E(q)}\u201d</blockquote><small>Verified client, United States \u00b7 {E(sv)}</small></article>' for h, q, sv in REV)
    return (f'<h2>What owners <span class="ac">say about us</span></h2><div class="proof" data-track="reviews"><div class="sum"><b>4.9</b><span><span class="st">\u2605\u2605\u2605\u2605\u2605</span><br>Average rating from 2,000+ projects over 10+ years</span></div><div class="rv">{cards}</div></div>'
            f'<div class="mid"><p>Want to know what is holding your {E(who)} back?</p><a class="btn" href="#check">Get my free check</a></div>')

def form_html(k, who):
    return (f'<section class="lead-f" id="check" data-track="form"><h2>Get a free check for your <span class="ac">{E(who)}</span></h2>'
            '<p>A real person on our team checks how you show up on Google, Google Maps and ChatGPT, and sends you a short plain-English report with your top 3 fixes. No card, no contract.</p>'
            f'<form id="lf" novalidate data-type="{E(k)}"><label>Business name<input id="lfN" autocomplete="organization" required></label><label>City and state<input id="lfC" autocomplete="address-level2" placeholder="Austin, TX" required></label>'
            '<label>Your name<input id="lfW" autocomplete="name" required></label><label>Email<input id="lfE" type="email" inputmode="email" autocomplete="email" required></label>'
            '<label>Phone <small>(optional)</small><input id="lfP" type="tel" inputmode="tel" autocomplete="tel"></label><label>Website <small>(optional)</small><input id="lfS" inputmode="url" autocomplete="url"></label>'
            '<div class="err full" id="lfErr" role="alert"></div><button class="btn full" type="submit" id="lfB">Send me my free check</button>'
            '<p class="priv full">We only use your details to reply to you. <a href="/privacy">Privacy policy</a></p></form>'
            '<div class="done" id="lfD" role="status"><b>Got it, thank you!</b> Jyoti from our team will reach out soon with your free check.</div>'
            f'<div class="or">or</div><a class="btn wa" href="{WA}" rel="noopener" data-wa="form" style="width:100%">Message us on WhatsApp</a></section>')

def cta(k, who):
    return form_html(k, who)

def _old_cta(k, who):
    return (f'<section class="cta"><h2>Get a free check for your <span class="ac">{E(who)}</span></h2>'
            '<p>A real person on our team checks how you show up on Google, Google Maps and ChatGPT, and sends you a short plain-English report with your top 3 fixes.</p>'
            f'<div class="row"><a class="btn" href="/?type={k}#check">Get my free check</a><a class="btn wa" href="{WA}" rel="noopener">WhatsApp us</a></div></section>')

def byline():
    return ('<div class="by"><img src="/assets/img/logo-96.webp" alt="Manav S" width="56" height="56" loading="lazy">'
            '<div><b>Written by Manav S</b><p>Founder of Business Santa and SEO Season. 10+ years in SEO and 2,000+ projects for businesses in the US and worldwide. '
            f'Updated November 2026.</p></div></div>')

def google_src():
    u, t = GOOGLE_LOCAL
    return f'<p class="src">Source: <a href="{u}" rel="noopener">{E(t)}</a>.</p>'

def cluster_html(parent, cur=None):
    gs = [g for g in ROOF_GUIDES if g["parent"] == parent and g["slug"] != cur]
    if not gs: return ""
    par = next(i for i in INDUSTRIES if i["slug"] == parent)
    li = "".join(f'<li><a href="/{g["slug"]}">{E(g["title"].split(" | ")[0])}</a></li>' for g in gs)
    back = f'<li><a href="/{parent}">{E(par["h1"])}: the full guide</a></li>' if cur else ""
    return f'<section class="clu"><h2>{E(par["h1"])} guides</h2><ul>{back}{li}</ul></section>'

def extra_html(p):
    if p["slug"] != "seo-for-roofers": return ""
    return "".join(f"<h2>{h}</h2>{b}" for h, b in ROOF_EXTRA) + cluster_html("seo-for-roofers")

def build_industry(p):
    url = f"{SITE}/{p['slug']}"
    fixes = "".join(f'<div class="card"><h3>{E(t)}</h3><p>{E(d)}</p></div>' for t, d in p["fixes"])
    body = f"""{h1(p['h1'], p['h1ac'])}
<p class="ans">{E(p['answer'])}</p>
<p class="lead">{E(p['intro'])}</p>
<h2>What your customers <span class="ac">type into Google</span></h2>
<p>These are the searches that bring {E(p['noun'])} new customers. Each one needs your business to look relevant, close and trusted.</p>
<ul class="qs">{''.join(f'<li>{E(q)}</li>' for q in p['searches'])}</ul>
<h2>What we fix for <span class="ac">{E(p['noun'])}</span></h2>
<div class="grid">{fixes}</div>
{proof_html(p['biz'])}
<h2>How Google picks the <span class="ac">top 3 on the map</span></h2>
<p>Google ranks local results on three things: <b>relevance</b> (how well your profile matches the search), <b>distance</b> (how close you are to the person searching) and <b>prominence</b> (how well known and well reviewed you are). You cannot move your shop, so we work on relevance and prominence: a complete profile, pages that match each service, steady reviews and consistent listings.</p>
{google_src()}
<h2>Showing up in <span class="ac">ChatGPT and AI answers</span></h2>
<p>{E(p['ai'])} <a href="/ai-search-optimization">How AI search optimization works</a>.</p>
{extra_html(p)}
<h2>How it <span class="ac">works</span></h2>
<ol class="steps"><li><b>Tell us about your {E(p['biz'])}</b>A one minute form, or a WhatsApp message.</li><li><b>Get your free check</b>A real person checks Google, Google Maps, ChatGPT and your website, and sends you a short report with your top 3 fixes.</li><li><b>You decide</b>Do the fixes yourself, or have us do them. You approve every change, and you see the results in your own Google account.</li></ol>
<h2>What it <span class="ac">costs</span></h2>
{price_html()}
<h2>Questions {E(p['noun'])} <span class="ac">ask us</span></h2>
{faq_html(p['faq'])}
{cta(p['k'], p['biz'])}"""
    graph = [service_ld(url, p["title"].split(":")[0], p["answer"], "Local SEO"), faq_ld(url, p["faq"])]
    return shell(p["slug"], p["title"], p["desc"], body, graph, p["h1"])

def build_hub(p):
    url = f"{SITE}/{p['slug']}"
    parts = "".join(f'<div class="card"><h3>{E(t)}</h3><p>{E(d)}</p></div>' for t, d in p["parts"])
    inds = "".join(f'<div class="card"><h3><a href="/{i["slug"]}">{E(i["h1"])}</a></h3><p>{E(i["searches"][0])}, {E(i["searches"][1])} and more.</p></div>' for i in INDUSTRIES)
    body = f"""{h1(p['h1'], p['h1ac'])}
<p class="ans">{E(p['answer'])}</p>
<p class="lead">{E(p['intro'])}</p>
<h2>What local SEO <span class="ac">includes</span></h2>
<div class="grid">{parts}</div>
<h2>How Google picks the <span class="ac">top 3 on the map</span></h2>
<p>Google ranks local results on <b>relevance</b>, <b>distance</b> and <b>prominence</b>. Distance is fixed by where you are. Relevance and prominence are what local SEO improves: a complete Google Business Profile, pages for each service, reviews, and the same details everywhere online.</p>
{google_src()}
<h2>Local SEO <span class="ac">for your industry</span></h2>
<div class="grid">{inds}</div>
<h2>What it <span class="ac">costs</span></h2>
{price_html()}
<h2>Common <span class="ac">questions</span></h2>
{faq_html(p['faq'])}
{cta(p['k'], 'business')}"""
    graph = [service_ld(url, "Local SEO services for small businesses", p["answer"], "Local SEO"), faq_ld(url, p["faq"])]
    return shell(p["slug"], p["title"], p["desc"], body, graph, "Local SEO services")

def build_ai(p):
    url = f"{SITE}/{p['slug']}"
    how = "".join(f'<div class="card"><h3>{E(t)}</h3><p>{E(d)}</p></div>' for t, d in p["how"])
    steps = "".join(f"<li><b>{E(t)}</b>{E(d)}</li>" for t, d in p["steps"])
    body = f"""{h1(p['h1'], p['h1ac'])}
<p class="ans">{E(p['answer'])}</p>
<h2>How AI assistants <span class="ac">choose a business</span></h2>
<div class="grid">{how}</div>
<h2>What we <span class="ac">do</span></h2>
<ol class="steps">{steps}</ol>
<h2>What it <span class="ac">costs</span></h2>
{price_html()}
<h2>Common <span class="ac">questions</span></h2>
{faq_html(p['faq'])}
{cta(p['k'], 'business')}"""
    graph = [service_ld(url, "AI search optimization (GEO) for local businesses", p["answer"], "Generative engine optimization"), faq_ld(url, p["faq"])]
    return shell(p["slug"], p["title"], p["desc"], body, graph, "AI search optimization")

def build_guide(g):
    url = f"{SITE}/{g['slug']}"
    items = "".join(f"<li><b>{E(t)}</b>{E(d)}</li>" for t, d in g["items"])
    groups = "".join(f'<h3>{E(n)}</h3><ul class="qs">{"".join(f"<li>{E(q)}</li>" for q in qs)}</ul>' for n, qs in g.get("groups", []))
    groups = f'<h2>The keywords, <span class="ac">by job</span></h2><div class="kw">{groups}</div><h2>How to <span class="ac">use them</span></h2>' if groups else ""
    body = f"""{h1(g['h1'], g['h1ac'])}
<p class="ans">{E(g['answer'])}</p>
{groups}
{"" if groups else '<h2>The <span class="ac">list</span></h2>'}
<ol class="steps">{items}</ol>
{google_src()}
<h2>Common <span class="ac">questions</span></h2>
{faq_html(g['faq'])}
{byline()}
{cluster_html(g["parent"], g["slug"]) if g.get("parent") else ""}
{cta('roofing' if g.get("parent") == "seo-for-roofers" else 'other', 'roofing company' if g.get("parent") == "seo-for-roofers" else 'business')}"""
    art = {"@type": "Article", "@id": url + "#article", "headline": g["title"].split(" | ")[0], "description": g["desc"],
           "author": FOUNDER, "publisher": ORG, "datePublished": TODAY, "dateModified": TODAY, "inLanguage": "en-US",
           "mainEntityOfPage": {"@id": url + "#page"}, "image": f"{SITE}/assets/img/og.jpg"}
    graph = [art, faq_ld(url, g["faq"]),
             {"@type": "ItemList", "name": g["h1"] + " " + g["h1ac"], "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": t} for i, (t, d) in enumerate(g["items"])]}]
    return shell(g["slug"], g["title"], g["desc"], body, graph, g["h1"].rstrip(":") if g.get("parent") else g["h1"] + " " + g["h1ac"], og_type="article", parent=g.get("parent"))

def write(slug, s):
    assert "—" not in s and "–" not in s, f"dash in {slug}"
    f = os.path.join(OUT, slug + ".html"); os.makedirs(os.path.dirname(f), exist_ok=True)
    open(f, "w").write(s)

ind, svc, gds = [], [], []
for p in INDUSTRIES: write(p["slug"], build_industry(p)); ind.append(p["slug"])
write(HUB["slug"], build_hub(HUB)); svc.append(HUB["slug"])
write(AI_PAGE["slug"], build_ai(AI_PAGE)); svc.append(AI_PAGE["slug"])
for g in ALLG: write(g["slug"], build_guide(g)); gds.append(g["slug"])

# Sitemap: every page built above is listed automatically.
# <lastmod> is the day a page's HTML last really changed (tracked by content hash in lastmod.json),
# not the build day, so Google keeps trusting it.
import hashlib, subprocess, datetime
LM = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lastmod.json")
state = json.load(open(LM)) if os.path.exists(LM) else {}
now = datetime.datetime.now(datetime.timezone.utc).date().isoformat()

def files_for(u):
    return ["index.html", "home-phone.html"] if u == "" else [u + ".html"]

def lastmod(u):
    fs = [os.path.join(OUT, f) for f in files_for(u) if os.path.exists(os.path.join(OUT, f))]
    h = hashlib.sha1(b"".join(re.sub(rb'/assets/js/app\.[0-9a-f]+\.js', b'', open(f, "rb").read()) for f in fs)).hexdigest()
    old = state.get(u)
    if old and old[0] == h: return old[1]
    d = now
    if not old:  # first time we see this page: use its last commit date if it has one
        try:
            g = subprocess.run(["git", "log", "-1", "--format=%cs", "--"] + fs, cwd=OUT, capture_output=True, text=True).stdout.strip()
            d = g or now
        except Exception: pass
    state[u] = [h, d]; return d

# One flat sitemap: Google reads every URL on the first fetch. (A sitemap index only pays off past thousands of URLs;
# its child files wait in Search Console as "Couldn't fetch" until Google gets round to them.)
rows = [(u, lastmod(u)) for u in [""] + svc + ind + gds + ["privacy", "terms"]]
open(os.path.join(OUT, "sitemap.xml"), "w").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join(f"  <url><loc>{SITE}/{u}</loc><lastmod>{d}</lastmod></url>\n" for u, d in rows) + "</urlset>\n")
for old in ("sitemap-main.xml", "sitemap-industries.xml", "sitemap-guides.xml"):
    if os.path.exists(os.path.join(OUT, old)): os.remove(os.path.join(OUT, old))
json.dump(state, open(LM, "w"), indent=1, sort_keys=True)
print("built", len(ind) + len(svc) + len(gds), "pages and sitemap.xml with", len(rows), "URLs")

# Home page footers (desktop index.html and the mobile template) get the same link lists, between <!--FTNAV--> markers.
def _patch(path, inner):
    s = open(path).read()
    n = re.sub(r"<!--FTNAV-->.*?<!--/FTNAV-->", lambda m: "<!--FTNAV-->" + inner + "<!--/FTNAV-->", s, count=1, flags=re.S)
    assert "<!--FTNAV-->" in n, path
    if n != s: open(path, "w").write(n)
_HOME = os.path.normpath(os.path.join(OUT, "index.html"))
_MTPL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../m/m.tpl.html"))
_patch(_HOME, '<nav aria-label="Services"><b>Services</b>' + "".join(f'<a href="{u}">{E(t)}</a>' for u, t in SVC_LINKS)
       + '<a href="#check" data-go="check">Free check</a><a href="https://seoseason.com/businesssanta?utm_source=businesssanta.com&amp;utm_medium=landing&amp;utm_campaign=footer" data-hand="1">Services and prices</a></nav>\n    '
       + _nav("By industry", IND_LINKS) + "\n    " + _nav("Guides", GUIDE_LINKS))
_patch(_MTPL, '<nav class="fti" aria-label="Services and industries">' + "".join(f'<a href="{u}">{E(t)}</a>' for u, t in SVC_LINKS[:1] + IND_LINKS + [("/ai-search-optimization", "ChatGPT and AI search")]) + "</nav>"
       + '<nav class="fti" aria-label="Guides">' + "".join(f'<a href="{u}">{E(t)}</a>' for u, t in GUIDE_LINKS) + "</nav>")
print("footers updated")
