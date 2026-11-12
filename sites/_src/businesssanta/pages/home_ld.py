#!/usr/bin/env python3
"""Structured data for businesssanta.com home pages.
graph(faq, videos) returns the JSON-LD for one home page; run directly to rewrite the block in index.html
(desktop), with the desktop FAQ read from the page itself so the markup always matches what people see.
The mobile page gets its own FAQ and its videos in m/assemble.py."""
import json, re, os, html

SITE = "https://www.businesssanta.com"
SS = "https://seoseason.com"
TODAY = "2026-11-06"

def org():
    team = [("jyoti", "Jyoti", "Client Success Lead"), ("sam", "Sam", "Technical SEO Specialist"), ("sakshi", "Sakshi", "Content and On-Page SEO Specialist")]
    return [
     {"@type": "WebSite", "@id": f"{SITE}/#site", "url": f"{SITE}/", "name": "Business Santa", "alternateName": "Business Santa by SEO Season",
      "inLanguage": "en-US", "publisher": {"@id": f"{SITE}/#org"}},
     {"@type": ["Organization", "ProfessionalService"], "@id": f"{SITE}/#org", "name": "Business Santa", "alternateName": "Business Santa SEO",
      "url": f"{SITE}/", "logo": {"@type": "ImageObject", "url": f"{SITE}/assets/img/logo-512.png", "width": 512, "height": 512},
      "image": f"{SITE}/assets/img/og.jpg",
      "description": "Business Santa helps US small businesses show up on Google, Google Maps and AI assistants like ChatGPT, with local SEO, technical SEO and AI search optimization done by a real team. Powered by SEO Season.",
      "slogan": "Get found by customers near you.",
      "email": "seo@businesssanta.com",
      "areaServed": {"@type": "Country", "name": "United States"},
      "founder": {"@id": f"{SITE}/#manav"},
      "employee": [{"@id": f"{SITE}/#manav"}] + [{"@id": f"{SITE}/#{k}"} for k, _, _ in team],
      "parentOrganization": {"@id": f"{SS}/#org"},
      "brand": {"@type": "Brand", "name": "Business Santa"},
      "sameAs": ["https://www.instagram.com/businesssanta", f"{SS}/businesssanta"],
      "contactPoint": [{"@type": "ContactPoint", "contactType": "customer support", "email": "seo@businesssanta.com", "telephone": "+91-70097-75189",
                        "areaServed": "US", "availableLanguage": ["English"]}],
      "knowsAbout": ["Local SEO", "Google Business Profile optimization", "Google Maps ranking", "Technical SEO", "On-page SEO",
                     "WordPress and Yoast SEO", "Shopify SEO", "Google Search Console", "Generative engine optimization (GEO)", "Answer engine optimization (AEO)",
                     "AI search visibility in ChatGPT, Google AI Overviews, Gemini and Perplexity"],
      "hasOfferCatalog": {"@type": "OfferCatalog", "name": "Business Santa SEO services", "itemListElement": [
        {"@type": "Offer", "name": "Free check", "description": "A real person checks how your business shows up on Google, Google Maps and ChatGPT and sends a short report with your top 3 fixes.", "price": "0", "priceCurrency": "USD", "url": f"{SITE}/#check"},
        {"@type": "Offer", "name": "On-page SEO fixes", "price": "120", "priceCurrency": "USD", "priceSpecification": {"@type": "PriceSpecification", "minPrice": 120, "priceCurrency": "USD"}, "itemOffered": {"@type": "Service", "name": "On-page SEO"}},
        {"@type": "Offer", "name": "Technical SEO fixes", "price": "160", "priceCurrency": "USD", "priceSpecification": {"@type": "PriceSpecification", "minPrice": 160, "priceCurrency": "USD"}, "itemOffered": {"@type": "Service", "name": "Technical SEO and Google Search Console fixes"}},
        {"@type": "Offer", "name": "Local SEO", "itemOffered": {"@type": "Service", "name": "Local SEO and Google Business Profile optimization", "url": f"{SITE}/local-seo"}},
        {"@type": "Offer", "name": "AI search optimization", "itemOffered": {"@type": "Service", "name": "AI search optimization (GEO)", "url": f"{SITE}/ai-search-optimization"}},
        {"@type": "Offer", "name": "Monthly SEO", "itemOffered": {"@type": "Service", "name": "Monthly SEO"}},
        {"@type": "Offer", "name": "Shopify SEO", "itemOffered": {"@type": "Service", "name": "Shopify store SEO"}}]}},
     {"@type": "Person", "@id": f"{SITE}/#manav", "name": "Manav S", "jobTitle": "Founder", "image": f"{SITE}/assets/img/logo-512.png",
      "worksFor": [{"@id": f"{SITE}/#org"}, {"@id": f"{SS}/#org"}], "url": f"{SS}/",
      "description": "Founder of Business Santa and SEO Season, with 10+ years in SEO and 2,000+ projects delivered.",
      "knowsAbout": ["SEO", "Local SEO", "Technical SEO", "Generative engine optimization", "AI search"]},
    ] + [{"@type": "Person", "@id": f"{SITE}/#{k}", "name": n, "jobTitle": j, "worksFor": {"@id": f"{SITE}/#org"}} for k, n, j in team] + [
     {"@type": "Organization", "@id": f"{SS}/#org", "name": "SEO Season", "url": f"{SS}/", "founder": {"@id": f"{SITE}/#manav"},
      "description": "SEO Season is the SEO and AI search intelligence platform built by Manav S. It powers Business Santa's audits and work.",
      "subOrganization": {"@id": f"{SITE}/#org"}},
    ]

def clean(o):
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items() if v is not None}
    if isinstance(o, list): return [clean(v) for v in o]
    return o

def graph(faq, videos=(), title="", desc=""):
    g = org() + [
     {"@type": "WebPage", "@id": f"{SITE}/#page", "url": f"{SITE}/", "name": title, "description": desc, "inLanguage": "en-US",
      "isPartOf": {"@id": f"{SITE}/#site"}, "about": {"@id": f"{SITE}/#org"}, "primaryImageOfPage": f"{SITE}/assets/img/og.jpg", "dateModified": TODAY},
     {"@type": "FAQPage", "@id": f"{SITE}/#faq", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]},
    ] + list(videos)
    return '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@graph": clean(g)}, ensure_ascii=False, separators=(",", ":")) + "</script>"

def text(h):
    t = re.sub(r"<[^>]+>", " ", h); t = html.unescape(re.sub(r"\s+", " ", t)).strip()
    return re.sub(r"\s+([.,!?])", r"\1", t)

def faqs_from(page):
    out = []
    for q, a in re.findall(r"<details[^>]*>\s*<summary[^>]*>(.*?)</summary>(.*?)</details>", page, re.S):
        out.append((text(q), text(a)))
    return out

def meta(page, name):
    m = re.search(r'<meta name="%s" content="([^"]*)"' % name, page) if name == "description" else re.search(r"<title>(.*?)</title>", page)
    return html.unescape(m.group(1))

if __name__ == "__main__":
    p = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../businesssanta/index.html"))
    s = open(p).read()
    faq = [(q, a) for q, a in faqs_from(s) if "services page" not in a]
    new = graph(faq, title=meta(s, "title"), desc=meta(s, "description"))
    s = re.sub(r'<script type="application/ld\+json">.*?</script>', lambda m: new, s, count=1, flags=re.S)
    open(p, "w").write(s)
    print("home LD:", len(faq), "questions")
