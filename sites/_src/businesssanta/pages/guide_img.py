"""One share image per guide (1200x675 JPG for og:image and the Article and WebPage schema).
Each image carries the guide's own title, its industry colour and its first three steps,
so no two guides look the same in search results or link previews.
Only rebuilds an image when its text changes (hash kept in the file name map)."""
import os, re, hashlib, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "../../../businesssanta"))
IMG = os.path.join(OUT, "assets/img")
DST = os.path.join(IMG, "guides")
W, H = 1200, 675
NAVY, YEL, WHITE, MUT = (11, 18, 32), (253, 185, 19), (248, 250, 252), (148, 163, 184)
HUE = {"seo-for-roofers": ((234, 88, 12), "For roofers"), "seo-for-dentists": ((13, 148, 136), "For dentists"),
       "seo-for-salons-and-spas": ((219, 39, 119), "For salons and spas"), "seo-for-plumbers": ((37, 99, 235), "For plumbers"),
       "seo-for-restaurants": ((220, 38, 38), "For restaurants"), "seo-for-retail-stores": ((22, 163, 74), "For local shops"),
       None: ((124, 58, 237), "For every local business")}

def _font(size):
    ttf = os.path.join(HERE, "__pycache__", "bs-head.ttf")
    if not os.path.exists(ttf):
        os.makedirs(os.path.dirname(ttf), exist_ok=True)
        f = TTFont(os.path.join(IMG, "bs-head-800.woff2")); f.flavor = None; f.save(ttf)
    return ImageFont.truetype(ttf, size)

def _body(size):
    for p in ("/usr/share/fonts/opentype/inter/Inter-SemiBold.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def _wrap(d, text, font, width):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= width: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def _render(g):
    hue, label = HUE.get(g.get("parent"), HUE[None])
    im = Image.new("RGB", (W, H), NAVY)
    glow = Image.new("RGB", (W, H), NAVY); gd = ImageDraw.Draw(glow)
    gd.ellipse((700, -260, 1500, 520), fill=hue); gd.ellipse((-300, 420, 400, 1000), fill=tuple(int(c * .55) for c in hue))
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(170)), .55)
    d = ImageDraw.Draw(im)
    logo = Image.open(os.path.join(IMG, "logo-192.png")).convert("RGBA").resize((52, 52))
    im.paste(logo, (64, 52), logo)
    d.text((128, 58), "Business Santa", font=_font(34), fill=WHITE)
    pf = _body(22); pw = d.textlength(label.upper(), font=pf)
    d.rounded_rectangle((W - 64 - pw - 36, 56, W - 64, 100), 22, fill=hue)
    d.text((W - 64 - pw - 18, 64), label.upper(), font=pf, fill=WHITE)
    a, b = g["h1"].rstrip(":"), g["h1ac"]
    size = 64
    while True:
        tf = _font(size)
        la, lb = _wrap(d, a, tf, W - 128), _wrap(d, b, tf, W - 128)
        if len(la) + len(lb) <= 3 or size <= 46: break
        size -= 4
    y = 160
    for ln in la: d.text((64, y), ln, font=tf, fill=WHITE); y += int(size * 1.12)
    for ln in lb: d.text((64, y), ln, font=tf, fill=YEL); y += int(size * 1.12)
    y = y + 56
    sf, nf = _body(26), _font(24)
    for i, (t, _) in enumerate(g["items"][:3]):
        if y > H - 70: break
        d.ellipse((64, y, 104, y + 40), fill=YEL)
        n = str(i + 1); d.text((84 - d.textlength(n, font=nf) / 2, y + 6), n, font=nf, fill=NAVY)
        t = t if d.textlength(t, font=sf) < W - 200 else _wrap(d, t, sf, W - 230)[0] + "..."
        d.text((122, y + 5), t, font=sf, fill=WHITE); y += 58
    d.text((64, H - 52), "businesssanta.com", font=_body(22), fill=MUT)
    return im

def make(g):
    """Returns the public path for this guide's image, building it if its text changed."""
    os.makedirs(DST, exist_ok=True)
    name = g["slug"].split("/")[-1]
    key = hashlib.sha1(json.dumps([g["h1"], g["h1ac"], g.get("parent"), g["items"][:3], 4]).encode()).hexdigest()[:8]
    jpg = os.path.join(DST, f"{name}-{key}.jpg")
    if not os.path.exists(jpg):
        old = re.compile(re.escape(name) + r"-[0-9a-f]{8}\.(jpg|webp)$")
        for f in os.listdir(DST):
            if old.match(f): os.remove(os.path.join(DST, f))
        _render(g).save(jpg, quality=86, optimize=True, progressive=True)
    return f"/assets/img/guides/{name}-{key}.jpg"
