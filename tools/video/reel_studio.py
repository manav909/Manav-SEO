"""reel_studio: a brand-neutral design engine for vertical Reels and Shorts (1080x1920) and feed posts (1080x1350).

Why it exists (17 Nov 2026 review): every Reel was the same small navy card in the middle of an empty frame, photos
floated or were cropped, and a viewer scrolling the grid saw the same post again and again. This engine gives each
brand a family of distinct, full-frame layouts that share one identity, so a feed reads as one brand without two
posts looking alike.

Rules the engine enforces on every frame:
  * Every word, number, logo and face sits inside the platform safe zone (safezone.py). Decoration (colour fields,
    ghost type, patterns, a blurred copy of a screenshot, the lower body of a photo) may run under the platform
    interface, because nothing there has to be read.
  * Screenshots are always shown whole (fit, never crop). If a screenshot would be too small to read, the engine
    says so and the caller splits it into two scenes.
  * A person's photo is always anchored to an edge of the frame or sits inside a shape. It never floats.
  * Layouts fill the safe zone: type is sized up until the block fills the space, so there are no dead areas.
  * Two words of a line never end alone on the last line (no widows); long text shrinks a little, then fails loudly.

A brand is a plain dict (see brand_businesssanta.py for the shape). Formats:
  poster   big stacked words, the scroll-stopping hook             stat     one huge number with its meaning
  mythfact the myth crossed out, the fact underneath                proof    a real screenshot shown whole, with source
  steps    a short checklist or 1-2-3                                talk     the founder anchored at the bottom, a line in a bubble
  quote    a line set large in the brand's serif, for reflection      cta      the offer, the founder, the address
  cover    the Reel cover (grid safe), built from poster with a style
Every format takes pal= (one of the brand's palettes) so scenes and posts rotate colour as well as layout.

Video: render(scenes, durs, out) gives each scene a slow camera drift on the background, a short rise-and-fade for the
content, and a quick dissolve between scenes.
"""
import os, math, random, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, 'assets', 'fonts')
INTER = '/usr/share/fonts/opentype/inter/Inter-%s.otf'

GEOM = {
    # canvas, safe rectangles, top of content, bottom of content
    'vertical': dict(size=(1080, 1920), safe=[(72, 300, 1008, 840), (72, 840, 912, 1400)], top=300, bottom=1400),
    'feed45': dict(size=(1080, 1350), safe=[(72, 60, 1008, 1260)], top=60, bottom=1260),
}


class LayoutError(Exception):
    pass


_CMAPS = {}


def missing_glyphs(f, txt):
    """Characters the font cannot draw (they would print as empty boxes). Spaces and joiners are ignored."""
    path = getattr(f, 'path', None)
    if not path:
        return []
    if path not in _CMAPS:
        try:
            from fontTools.ttLib import TTFont
            _CMAPS[path] = set(TTFont(path, lazy=True).getBestCmap())
        except Exception:
            _CMAPS[path] = None
    cm = _CMAPS[path]
    if cm is None:
        return []
    return sorted({ch for ch in txt if not ch.isspace() and ord(ch) not in cm and ch not in '\u200c\u200d'})


def font(path, size):
    if not os.path.isabs(path) and not os.path.exists(path):
        p2 = os.path.join(FONTS, path)
        path = p2 if os.path.exists(p2) else INTER % path
    return ImageFont.truetype(path, int(size), layout_engine=ImageFont.Layout.RAQM)


def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


class Frame:
    """Two layers: bg (decoration, may bleed anywhere) and fg (content, must stay in the safe zone)."""

    def __init__(self, brand, pal, fmt='vertical'):
        g = GEOM[fmt]
        self.brand, self.pal, self.fmt = brand, brand['palettes'][pal] if isinstance(pal, str) else pal, fmt
        self.palname = pal if isinstance(pal, str) else 'custom'
        self.W, self.H = g['size']; self.safe = g['safe']; self.top, self.bottom = g['top'], g['bottom']
        self.x0 = min(r[0] for r in self.safe)
        self.bg = Image.new('RGB', (self.W, self.H), self.pal['bg'])
        self.fg = Image.new('RGBA', (self.W, self.H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.fg); self.bd = ImageDraw.Draw(self.bg)
        self.notes = []

    # ---- geometry
    def x1(self, y0, y1):
        """Right edge of content for a band of rows (narrower where the platform puts its buttons)."""
        def at(yy):
            yy = max(self.top, min(self.bottom - 1, int(yy)))
            return max(r[2] for r in self.safe if r[1] <= yy < r[3])
        return min(at(y0), at(y1 - 1))

    def inside(self, box):
        x0, y0, x1, y1 = box
        x0 += 3  # a glyph may overhang its pen position by a pixel or two; that is not a leak
        if x0 < self.x0 or y0 < self.top or y1 > self.bottom:
            return False
        return x1 <= self.x1(y0, y1)

    def _ok(self, box, what):
        box = tuple(int(round(v)) for v in box)
        if not self.inside(box):
            raise LayoutError(f'{what!r} at {box} is outside the {self.fmt} safe zone {self.safe}')

    # ---- fonts
    def F(self, role, size):
        return font(self.brand['fonts'][role], size)

    def tw(self, txt, f):
        return self.d.textlength(txt, font=f)

    # ---- content drawing (checked)
    def text(self, xy, txt, f, fill, anchor='la', what=None):
        box = self.d.textbbox(xy, txt, font=f, anchor=anchor)
        miss = missing_glyphs(f, txt)
        if miss:
            raise LayoutError(f'font {os.path.basename(f.path)} has no glyph for {miss} in {txt!r}; use a font that covers them')
        if 0 < self.x0 - box[0] <= 16:   # a matra or a slanted glyph overhangs the pen position: nudge it in
            xy = (xy[0] + self.x0 - box[0], xy[1]); box = self.d.textbbox(xy, txt, font=f, anchor=anchor)
        self._ok(box, what or txt)
        self.d.text(xy, txt, font=f, fill=fill, anchor=anchor); return box

    def box(self, rect, r, fill, what='box', outline=None, width=0):
        self._ok(rect, what)  # rect is exclusive at the right and bottom, like text boxes
        self.d.rounded_rectangle((rect[0], rect[1], rect[2] - 1, rect[3] - 1), r, fill=fill, outline=outline, width=width)

    def paste(self, img, xy, what='image'):
        img = img.convert('RGBA'); box = (xy[0], xy[1], xy[0] + img.width, xy[1] + img.height); self._ok(box, what)
        self.fg.alpha_composite(img, (int(xy[0]), int(xy[1])))

    def shadow(self, rect, r, strength=110, blur=26, dy=18):
        """Soft drop shadow under a content panel (drawn on the background, so it may bleed)."""
        sh = Image.new('RGBA', (self.W, self.H), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle((rect[0] + 6, rect[1] + dy, rect[2] + 6, rect[3] + dy), r, fill=(0, 0, 0, strength))
        sh = sh.filter(ImageFilter.GaussianBlur(blur)); self.bg.paste(sh, (0, 0), sh)

    # ---- text layout
    def lines(self, txt, f, x, y, step, maxw=None, margin=0):
        """Greedy wrap that respects the narrower right edge lower down; avoids a one-word last line."""
        def run(cut):
            cut += margin
            words, out, yy = txt.split(), [], y
            while words:
                mw = min(maxw or 10 ** 6, self.x1(yy, yy + step) - x) - cut
                ln = words[0]; i = 1
                while i < len(words) and self.tw(ln + ' ' + words[i], f) <= mw:
                    ln += ' ' + words[i]; i += 1
                out.append(ln); words = words[i:]; yy += step
            return out
        best = run(0)
        if len(best) > 1 and len(best[-1].split()) == 1:
            for cut in range(24, 420, 24):
                alt = run(cut)
                if len(alt) == len(best) and len(alt[-1].split()) > 1:
                    return alt
        return best

    def para(self, x, y, txt, role, size, fill, gap=1.18, maxw=None, measure=False, align='left'):
        f = self.F(role, size); step = int(size * gap)
        ls = self.lines(txt, f, x, y, step, maxw)
        if measure:
            return y + step * len(ls), ls
        for ln in ls:
            if align == 'center':
                cx = (x + min(maxw or 10 ** 6, self.x1(y, y + step) - x) / 2 + x) / 2 if False else x + (min(maxw or 10 ** 6, self.x1(y, y + step) - x)) / 2
                self.text((cx, y), ln, f, fill, anchor='ma')
            else:
                self.text((x, y), ln, f, fill)
            y += step
        return y

    def _lines_margin(self, txt, f, x, y, step):
        return self.lines(txt, f, x, y, step, None, margin=24)

    def rich(self, x, y, txt, role, size, ink, accent, maxw=None, gap=1.0, measure=False, nowrap=False):
        """Words wrapped in *stars* print in the accent colour. Returns the bottom y."""
        f = self.F(role, size); step = int(size * gap)
        plain = txt.replace('*', '')
        # words are drawn one by one, so leave a small margin for spacing that differs from the whole-line measure
        mw = (maxw if maxw else None)
        ls = [plain] if nowrap else self.lines(plain, f, x, y, step, (mw - 24) if mw else None) if mw else [plain] if nowrap else self._lines_margin(plain, f, x, y, step)
        if measure:
            return y + step * len(ls)
        hot = set(); on = False; idx = 0
        for tok in txt.split():
            st = tok.startswith('*'); en = tok.endswith('*')
            if st: on = True
            if on: hot.add(idx)
            if en: on = False
            idx += 1
        wi = 0
        for ln in ls:
            xx = x
            for w in ln.split():
                self.text((xx, y), w, f, accent if wi in hot else ink); xx += self.tw(w + ' ', f); wi += 1
            y += step
        return y

    # ---- brand chip (logo + name), always inside the safe zone
    def chip(self, y=None, x=None, dark=None, small=False):
        p = self.pal; y = self.top if y is None else y; x = self.x0 if x is None else x
        h = 64 if small else 76; f = self.F('head', 30 if small else 34)
        name = self.brand['name']; w = int(h + 14 + self.tw(name, f) + 30)
        fill = p.get('chip', p['ink']); ink = p.get('chip_ink', p['bg'])
        self.box((x, y, x + w, y + h), h // 2, fill, 'brand chip')
        logo = Image.open(self.brand['logo']).convert('RGBA').resize((h - 12, h - 12), Image.LANCZOS)
        m = Image.new('L', logo.size, 0); ImageDraw.Draw(m).ellipse((0, 0, logo.width - 1, logo.height - 1), fill=255); logo.putalpha(ImageChops.multiply(logo.getchannel('A'), m))
        self.paste(logo, (x + 6, y + 6), 'logo')
        self.text((x + h + 8, y + h / 2), name, f, ink, anchor='lm')
        if SERIES:   # the series badge: same label, colours and size on every post of a series
            sf = self.F('display', 40 if not small else 34); lab = SERIES['label']; sw = int(self.tw(lab, sf) + 56)
            sx = x + w + 14
            if sx + sw > self.x1(y, y + h):   # no room beside the chip: its own row underneath
                sx, y2 = x, y + h + 12
            else:
                y2 = y
            bf, bi = SERIES.get('fill', p['accent']), SERIES.get('ink', p['accent_ink'])
            if sum(abs(a - b) for a, b in zip(bf, p['bg'])) < 120:   # badge would vanish into this background
                bf, bi = bi, bf
            self.box((sx, y2, sx + sw, y2 + h), h // 2, bf, 'series badge')
            self.text((sx + 28, y2 + h / 2), lab, sf, bi, anchor='lm')
        return (x, y, x + w, y + h)

    # ---- decoration (background layer only)
    def deco_gradient(self, a=None, b=None):
        a = a or self.pal['bg']; b = b or self.pal.get('bg2', self.pal['bg'])
        for yy in range(self.H):
            self.bd.line([(0, yy), (self.W, yy)], fill=mix(a, b, yy / self.H))

    def deco_ghost(self, word, size=None, y=None, alpha=22, angle=0, role='display'):
        """Huge pale word behind the content, cut by the frame edges."""
        size = size or int(self.H * 0.36)
        lay = Image.new('RGBA', (self.W * 2, size * 2), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
        c = self.pal['ink'] if lum(self.pal['bg']) < 140 else self.pal['ink']
        ld.text((20, 20), word, font=self.F(role, size), fill=c + (alpha,))
        if angle:
            lay = lay.rotate(angle, expand=True)
        yy = self.H - int(size * 1.15) if y is None else y
        self.bg.paste(lay, (-30, yy), lay)

    def deco_dots(self, step=48, r=3, alpha=18):
        lay = Image.new('RGBA', (self.W, self.H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
        for yy in range(20, self.H, step):
            for xx in range(20 + (step // 2 if (yy // step) % 2 else 0), self.W, step):
                ld.ellipse((xx - r, yy - r, xx + r, yy + r), fill=self.pal['ink'] + (alpha,))
        self.bg.paste(lay, (0, 0), lay)

    def deco_band(self, color, y0, y1, slant=80):
        self.bd.polygon([(0, y0 + slant), (self.W, y0), (self.W, y1), (0, y1 + slant)], fill=color)

    def deco_rings(self, cx, cy, r, color, n=4, gap=70, width=3):
        for i in range(n):
            rr = r + i * gap; self.bd.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=color, width=width)

    def deco_grain(self, amount=10, seed=1):
        rnd = random.Random(seed)
        noise = Image.effect_noise((self.W // 2, self.H // 2), 40).resize((self.W, self.H)).convert('L')
        tint = Image.new('RGB', (self.W, self.H), self.pal['ink'])
        self.bg = Image.composite(tint, self.bg, noise.point(lambda v: int(max(0, v - 128) * amount / 128)))
        self.bd = ImageDraw.Draw(self.bg)

    def deco_glow(self, cx, cy, r, color, alpha=70):
        lay = Image.new('RGBA', (self.W, self.H), (0, 0, 0, 0))
        ImageDraw.Draw(lay).ellipse((cx - r, cy - r, cx + r, cy + r), fill=color + (alpha,))
        lay = lay.filter(ImageFilter.GaussianBlur(r // 2)); self.bg.paste(lay, (0, 0), lay)

    def portrait_arch(self, box, what='portrait', img=None):
        """For brands with a rectangular portrait (brand['portrait'], face centre at brand['face_center'] as fractions):
        the photo fills an arch-topped window inside the safe zone, with a thin accent outline. Never floats, never
        cuts the face: the crop is centred on the face."""
        x0, y0, x1, y1 = [int(v) for v in box]; w, h = x1 - x0, y1 - y0
        img = img or self.brand.get('portrait') or self.brand.get('art')
        if not img:
            raise LayoutError('no image for the arch: pass art_img= (a book cover or artwork); this brand shows no face')
        src = Image.open(img).convert('RGB')
        fx, fy = self.brand.get('face_center', (0.5, 0.4)) if img == self.brand.get('portrait') else (0.5, 0.42)
        z = max(w / src.width, h / src.height) * 1.02
        im = src.resize((int(src.width * z), int(src.height * z)), Image.LANCZOS)
        cx = min(max(0, int(fx * im.width - w / 2)), im.width - w); cy = min(max(0, int(fy * im.height - h * 0.45)), im.height - h)
        im = im.crop((cx, cy, cx + w, cy + h)).convert('RGBA')
        m = Image.new('L', (w, h), 0); md = ImageDraw.Draw(m)
        md.ellipse((0, 0, w - 1, w - 1), fill=255); md.rectangle((0, w // 2, w - 1, h - 1), fill=255)
        im.putalpha(m)
        self.shadow((x0, y0 + w // 4, x1, y1), 30, 140, 30, 20)
        self._ok(box, what)
        self.fg.alpha_composite(im, (x0, y0))
        def arch(ww, hh):
            mm = Image.new('L', (ww, hh), 0); d2 = ImageDraw.Draw(mm)
            d2.ellipse((0, 0, ww - 1, ww - 1), fill=255); d2.rectangle((0, ww // 2, ww - 1, hh - 1), fill=255); return mm
        ol = arch(w + 24, h + 24); inner = Image.new('L', ol.size, 0); inner.paste(arch(w + 16, h + 16), (4, 4))
        ol = ImageChops.subtract(ol, inner)
        layer = Image.new('RGBA', ol.size, self.pal['accent'] + (255,)); layer.putalpha(ol)
        bx = (x0 - 12, y0 - 12, x1 + 12, y1 + 12); self._ok(bx, 'arch outline')
        self.fg.alpha_composite(layer, (x0 - 12, y0 - 12))
        return box, (x0 + w * 0.25, y0 + h * 0.15, x0 + w * 0.75, y0 + h * 0.75)

    def person(self, height, anchor='left', xoff=0):
        """Founder cut-out on the background layer, standing on the bottom edge of the frame. Returns its box.
        The face (top fifth) must land inside the safe zone; it is checked."""
        src = Image.open(self.brand['person']).convert('RGBA')
        z = height / src.height; im = src.resize((int(src.width * z), int(height)), Image.LANCZOS)
        x = {'left': -int(im.width * 0.06), 'right': self.W - int(im.width * 0.94), 'center': (self.W - im.width) // 2}[anchor] + xoff
        y = self.H - im.height
        self.bg.paste(im, (x, y), im)
        fb = self.brand.get('face_box', (0.22, 0.0, 0.62, 0.24))  # face as fractions of the photo
        face = (x + im.width * fb[0], y + im.height * fb[1], x + im.width * fb[2], y + im.height * fb[3])
        self._ok(face, 'founder face')
        return (x, y, x + im.width, y + im.height), face

    # ---- output
    def image(self):
        out = self.bg.convert('RGBA'); out.alpha_composite(self.fg)
        if getattr(self, 'typing', None):
            (tx, ty), q, f, col = self.typing; ImageDraw.Draw(out).text((tx, ty), q, font=f, fill=col, anchor='lm')
        return out.convert('RGB')

    def finish(self, name='frame'):
        a = self.fg.getchannel('A')
        m = Image.new('L', (self.W, self.H), 255); md = ImageDraw.Draw(m)
        for r in self.safe:
            md.rectangle((r[0], r[1], r[2] - 1, r[3] - 1), fill=0)
        leak = ImageChops.multiply(a.point(lambda v: 255 if v > 24 else 0), m)
        n = sum(leak.histogram()[1:])
        if n > 20:
            raise LayoutError(f'{name}: {n} content pixels outside the safe zone around {leak.getbbox()}')
        self.name = name
        return self


# ---------------- layout helper: fill the zone ----------------

def _fill(build, lo=0.6, hi=1.6, target=None, name='scene'):
    """build(scale, measure) -> bottom y. Finds the largest scale whose block fits, then centres it vertically."""
    best = None; s = hi
    while s >= lo - 1e-9:
        try:
            b = build(s, True)
            if b is not None:
                best = s; break
        except LayoutError:
            pass
        s = round(s - 0.04, 3)
    if best is None:
        raise LayoutError(f'{name}: the text does not fit even at {lo:.0%}; shorten it')
    return best


# ---------------- formats ----------------

def poster(brand, lines, kicker=None, pal='primary', fmt='vertical', ghost=None, name='poster'):
    """Hook scene. lines: 2 to 4 short lines; *word* prints in the accent colour. kicker: one line under them."""
    def frame():
        fr = Frame(brand, pal, fmt); p = fr.pal
        fr.deco_gradient(); fr.deco_dots(alpha=14)
        fr.deco_band(mix(p['bg'], p['ink'], 0.07), fr.H - 520, fr.H, slant=-120)
        if ghost:
            fr.deco_ghost(ghost, alpha=20)
        return fr

    def lay(fr, s, measure):
        p = fr.pal; top = fr.top + 120; avail_bot = fr.bottom - 30
        sizes = []
        for ln in lines:
            plain = ln.replace('*', '')
            f0 = fr.F('display', 100); w100 = fr.tw(plain, f0)
            yb = top + sum(int(z * 1.02) for z in sizes)
            z = min(int(100 * (fr.x1(yb, yb + 300) - fr.x0) / max(1, w100)), int(300 * s))
            while z > 40:   # exact fit: one line each, never wrapped
                bb = fr.d.textbbox((fr.x0, yb), plain, font=fr.F('display', z))
                if bb[2] <= fr.x1(bb[1], bb[3]) - 4:
                    break
                z -= 4
            sizes.append(z)
        y = top; blocks = []
        for ln, z in zip(lines, sizes):
            blocks.append((ln, z, y)); y += int(z * 1.02)
        if kicker:
            kb, _ = fr.para(fr.x0, y + 84, kicker, 'body_bold', int(52 * min(1.5, s)), p['muted'], measure=True)
        else:
            kb = y
        if kb > avail_bot:
            raise LayoutError('poster too tall')
        if measure:
            return kb
        off = max(0, (avail_bot - kb) // 2)
        for ln, z, yy in blocks:
            fr.rich(fr.x0, yy + off, ln, 'display', z, p['ink'], p['accent'], gap=1.02, nowrap=True)
        if kicker:
            yk = y + off + 48
            fr.box((fr.x0, yk, fr.x0 + 90, yk + 10), 5, p['accent'], 'rule')
            fr.para(fr.x0, yk + 36, kicker, 'body_bold', int(52 * min(1.5, s)), p['muted'])
        return kb + off

    s = _fill(lambda sc, m: lay(frame(), sc, False), lo=0.5, hi=1.5, name=name)   # full trial draw on a probe
    fr = frame(); fr.chip(); lay(fr, s, False)
    return fr.finish(name)


def stat(brand, number, label, context=None, pal='primary', fmt='vertical', name='stat'):
    """One big number (e.g. '3x', '47%', '#1') with what it means and where it comes from."""
    fr = Frame(brand, pal, fmt); p = fr.pal
    fr.deco_gradient(); fr.deco_rings(fr.W - 120, fr.top + 330, 260, mix(p['bg'], p['accent'], 0.22), n=5)
    fr.deco_glow(fr.W - 160, fr.top + 330, 420, p['accent'], 40)
    fr.chip()
    f = fr.F('display', 100); w = fr.tw(number, f)
    z = min(int(100 * (fr.x1(fr.top, 840) - fr.x0 - 10) / w), 560)
    y = fr.top + 120; fz = fr.F('display', z)
    bb = fr.d.textbbox((0, 0), number, font=fz)
    if fr.top + 120 + (bb[3] - bb[1]) > 840:   # keep the number above the button column
        z = int(z * (840 - fr.top - 130) / (bb[3] - bb[1])); fz = fr.F('display', z); bb = fr.d.textbbox((0, 0), number, font=fz)
    fr.text((fr.x0 - bb[0], y - bb[1]), number, fz, p['accent'])
    y += (bb[3] - bb[1]) + 34
    fr.box((fr.x0, y, fr.x0 + 140, y + 12), 6, p['ink'], 'rule'); y += 46
    # fill the rest: label large, context smaller, both sized to the space
    def go(s, measure):
        yy, _ = fr.para(fr.x0, y, label, 'head', int(78 * s), p['ink'], measure=True)
        if context:
            yy, _ = fr.para(fr.x0, yy + 26, context, 'body', int(44 * s), p['muted'], measure=True)
        if yy > fr.bottom - 20:
            raise LayoutError('stat too tall')
        if measure:
            return yy
        yy = fr.para(fr.x0, y, label, 'head', int(78 * s), p['ink'])
        if context:
            fr.para(fr.x0, yy + 26, context, 'body', int(44 * s), p['muted'])
    s = _fill(go, lo=0.6, hi=1.25, name=name); go(s, False)
    return fr.finish(name)


def mythfact(brand, myth, fact, pal='primary', fmt='vertical', name='mythfact', labels=('MYTH', 'FACT')):
    """The common belief, crossed out, above what is actually true. Both panels grow with their text to fill the zone."""
    fr = Frame(brand, pal, fmt); p = fr.pal
    fr.deco_gradient(); fr.deco_dots(alpha=12); fr.deco_ghost('?', size=int(fr.H * 0.42), y=fr.H - int(fr.H * 0.44), alpha=14)
    fr.chip()
    top = fr.top + 110; bot = fr.bottom - 10; gap = 44; x0 = fr.x0

    def go(s, measure):
        lab = int(60 * min(s, 1.3))
        y = top + 36 + lab + 26
        w1 = fr.x1(top, top + 400) - x0
        yb1, _ = fr.para(x0 + 44, y, myth, 'head', int(54 * s), p['muted'], maxw=w1 - 88, measure=True)
        h1 = yb1 + 36 - top
        t2 = top + h1 + gap
        w2 = fr.x1(t2, bot) - x0
        yb2, _ = fr.para(x0 + 44, t2 + 36 + lab + 26, fact, 'head', int(64 * s), p['accent_ink'], maxw=w2 - 88, measure=True)
        if yb2 + 36 > bot:
            raise LayoutError('myth and fact too long')
        if measure:
            return yb2
        spare = bot - (yb2 + 36)
        h1 += spare // 3; t2 = top + h1 + gap; b2 = bot
        r1 = (x0, top, x0 + w1, top + h1)
        fr.shadow(r1, 40, 60); fr.box(r1, 40, p.get('panel_soft', mix(p['bg'], p['ink'], 0.10)), 'myth panel')
        fr.text((x0 + 44, top + 36), labels[0], fr.F('display', lab), p['muted'])
        cx, cy = r1[2] - 80, top + 36 + lab // 2 + 6
        fr._ok((cx - 32, cy - 32, cx + 32, cy + 32), 'cross')
        fr.d.line((cx - 28, cy - 28, cx + 28, cy + 28), fill=p['bad'], width=12); fr.d.line((cx - 28, cy + 28, cx + 28, cy - 28), fill=p['bad'], width=12)
        fr.para(x0 + 44, y + (h1 - (yb1 + 36 - top)) // 2, myth, 'head', int(54 * s), p['muted'], maxw=w1 - 88)
        r2 = (x0, t2, x0 + fr.x1(t2, b2) - x0, b2)
        fr.shadow(r2, 40, 110); fr.box(r2, 40, p['accent'], 'fact panel')
        fr.text((x0 + 44, t2 + 36), labels[1], fr.F('display', lab), p['accent_ink'])
        cx, cy = r2[2] - 80, t2 + 36 + lab // 2 + 6
        fr._ok((cx - 36, cy - 30, cx + 38, cy + 30), 'check')
        fr.d.line((cx - 32, cy, cx - 8, cy + 24), fill=p['accent_ink'], width=13); fr.d.line((cx - 8, cy + 24, cx + 34, cy - 24), fill=p['accent_ink'], width=13)
        body_h = (yb2 - (t2 + 36 + lab + 26 - (spare // 3 + gap) * 0)) if False else None
        ytxt = t2 + 36 + lab + 26
        hb, _ = fr.para(x0 + 44, ytxt, fact, 'head', int(64 * s), p['accent_ink'], maxw=w2 - 88, measure=True)
        fr.para(x0 + 44, ytxt + max(0, (b2 - 36 - hb)) // 2, fact, 'head', int(64 * s), p['accent_ink'], maxw=w2 - 88)
        return yb2
    s = _fill(go, 0.55, 1.6, name=name); go(s, False)
    return fr.finish(name)


def proof(brand, image, title, source, pal='primary', fmt='vertical', name='proof', region=None, lens=None, callout=None):
    """A real screenshot, shown whole, as evidence.

    image   the screenshot file. For vertical video capture evidence at a phone width (about 430 css px) so it reads
            natively; a desktop screenshot is wide and its text comes out small.
    region  (x0, y0, x1, y1): one complete block of the screenshot (a whole result card, a whole answer). Put its
            edges in the white space between blocks so no word is ever cut. Without it the whole image is shown.
    lens    (x0, y0, x1, y1) inside the region: the key line (the client's name, the ranking, the answer sentence).
            It is shown again, magnified, in a lens under the screenshot with a connector, so it can be read on a phone
            even when the screenshot itself is small. Again: whole words only, edges in white space.
    callout one short line in big type that says what the screenshot proves, e.g. 'Hays is the first HVAC website'.
    The background is a blurred, darkened copy of the same screenshot filling the frame."""
    fr = Frame(brand, pal, fmt); p = fr.pal
    full = Image.open(image).convert('RGB')
    sc = full.crop(region) if region else full
    cov = ImageOps.fit(sc, (fr.W // 4, fr.H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(10)).resize((fr.W, fr.H), Image.BILINEAR)
    fr.bg = Image.blend(cov, Image.new('RGB', (fr.W, fr.H), p['bg']), 0.80); fr.bd = ImageDraw.Draw(fr.bg)
    fr.chip()
    src_f = fr.F('body_bold', 30); src_h = 56

    def go(s, measure, final=False):
        y = fr.top + 104
        y = fr.rich(fr.x0, y, title, 'head', int(58 * s), p['ink'], p['accent'], gap=1.12, measure=not final) + int(24 * s)
        maxw = fr.x1(y, fr.bottom) - fr.x0 - 16
        z = min(maxw / sc.width, 1.4)
        h = int(sc.height * z)
        lens_h = 0
        if lens:
            lw, lh = lens[2] - lens[0], lens[3] - lens[1]
            lz = min(maxw / lw, 2.6); lens_h = int(lh * lz) + 70
        call_h = 0
        if callout:
            cb, _ = fr.para(fr.x0, 0, callout, 'display', int(64 * s), p['ink'], gap=1.05, measure=True); call_h = cb + 20
        need = h + 16 + lens_h + call_h + src_h + 52
        if y + need > fr.bottom:
            # shrink the screenshot itself before giving up, but never below 45%
            room = fr.bottom - y - (16 + lens_h + call_h + src_h + 40)
            z = room / sc.height; h = int(sc.height * z)
            if z < 0.45 or z * sc.width < 300:
                raise LayoutError('proof too tall')
        if measure:
            return y + need
        spare = max(0, fr.bottom - (y + need)) // 4
        im = sc.resize((int(sc.width * z), h), Image.LANCZOS)
        x = fr.x0 + 8 + (maxw - im.width) // 2; yy = y + 8 + spare
        rad = 20
        mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), rad, fill=255)
        rim = im.convert('RGBA'); rim.putalpha(mask)
        fr.shadow((x, yy, x + im.width, yy + im.height), rad, 150, 30, 22)
        fr.box((x - 8, yy - 8, x + im.width + 8, yy + im.height + 8), rad + 8, p['accent'], 'screenshot frame')
        fr.paste(rim, (x, yy), 'screenshot')
        fr.shot_scale = z
        yy += im.height + 8
        if lens:
            # outline the key line on the screenshot, then show it magnified
            ox, oy = x + (lens[0]) * z, (yy - 8 - im.height) + lens[1] * z
            ow, oh = (lens[2] - lens[0]) * z, (lens[3] - lens[1]) * z
            fr.box((ox - 4, oy - 4, ox + ow + 4, oy + oh + 4), 8, None, 'lens marker', outline=p['accent'], width=4)
            piece = sc.crop(lens); lw2 = int(piece.width * lz); lh2 = int(piece.height * lz)
            piece = piece.resize((lw2, lh2), Image.LANCZOS)
            ly = yy + 40 + spare; lx = fr.x0 + 8 + (maxw - lw2) // 2
            fr.d.line((ox + ow / 2, oy + oh + 4, lx + lw2 / 2, ly - 8), fill=p['accent'], width=5)
            m2 = Image.new('L', piece.size, 0); ImageDraw.Draw(m2).rounded_rectangle((0, 0, lw2 - 1, lh2 - 1), 14, fill=255)
            pr = piece.convert('RGBA'); pr.putalpha(m2)
            fr.shadow((lx, ly, lx + lw2, ly + lh2), 14, 170, 24, 16)
            fr.box((lx - 8, ly - 8, lx + lw2 + 8, ly + lh2 + 8), 22, p['accent'], 'lens frame')
            fr.paste(pr, (lx, ly), 'lens')
            yy = ly + lh2 + 8 + 22
        if callout:
            yy = fr.para(fr.x0, yy + 14 + spare, callout, 'display', int(64 * s), p['ink'], gap=1.05)
        sy = yy + 30
        w = fr.tw(source, src_f) + 56
        fr.box((fr.x0, sy, fr.x0 + w, sy + src_h), 28, p.get('chip', p['ink']), 'source pill')
        fr.text((fr.x0 + 28, sy + src_h / 2), source, src_f, p.get('chip_ink', p['bg']), anchor='lm')
        return sy + src_h

    s = _fill(lambda sc_, m: go(sc_, m), 0.7, 1.3, name=name)
    go(s, False, final=True)
    if fr.shot_scale < 0.62 and not lens:
        fr.notes.append(f'{os.path.basename(image)} shows at {fr.shot_scale:.0%} with no lens: add lens= on the key line, '
                        'or split it into two proof scenes, so it can be read on a phone')
        print('reel_studio.proof:', fr.notes[-1])
    return fr.finish(name)


def steps(brand, title, items, pal='primary', fmt='vertical', name='steps', numbered=True):
    fr = Frame(brand, pal, fmt); p = fr.pal
    fr.deco_gradient(); fr.deco_ghost(str(len(items)), size=int(fr.H * 0.5), y=fr.H - int(fr.H * 0.52), alpha=16)
    fr.chip()

    def go(s, measure):
        y = fr.top + 112
        yb = fr.rich(fr.x0, y, title, 'display', int(84 * s), p['ink'], p['accent'], gap=1.04, measure=measure)
        y = yb + int(36 * s)
        rows = []
        for i, it in enumerate(items):
            d = int(84 * s)
            x1 = fr.x1(y, y + d + 40)
            yb2, _ = fr.para(fr.x0 + d + 30 + 28, y + 26, it, 'head', int(46 * s), p['panel_ink'], maxw=x1 - fr.x0 - d - 30 - 56, measure=True)
            h = max(d + 40, yb2 - y + 26)
            rows.append((y, h, d)); y += h + int(22 * s)
        if y > fr.bottom - 10:
            raise LayoutError('steps too tall')
        if measure:
            return y
        extra = (fr.bottom - 20 - y) // max(1, len(rows))   # spread leftover space between rows
        rows = [(yy + i * extra, h, d) for i, (yy, h, d) in enumerate(rows)]
        for i, (it, (yy, h, d)) in enumerate(zip(items, rows)):
            x1 = fr.x1(yy, yy + h)
            fr.shadow((fr.x0, yy, x1, yy + h), 30, 60, 16, 10)
            fr.box((fr.x0, yy, x1, yy + h), 30, p['panel'], 'step row')
            fr.box((fr.x0 + 20, yy + 20, fr.x0 + 20 + d, yy + 20 + d), d // 2, p['accent'], 'badge')
            fr.text((fr.x0 + 20 + d / 2, yy + 20 + d / 2), str(i + 1) if numbered else '✓', fr.F('display', int(d * 0.6)), p['accent_ink'], anchor='mm')
            fr.para(fr.x0 + d + 58, yy + 26, it, 'head', int(46 * s), p['panel_ink'], maxw=x1 - fr.x0 - d - 86)
        return y
    s = _fill(go, 0.55, 1.7, name=name)
    go(s, False)
    return fr.finish(name)


def talk(brand, line, pal='primary', fmt='vertical', name='talk', tag=None, art_img=None):
    """The founder stands on the bottom edge; his line sits in a bubble above, pointing at him."""
    fr = Frame(brand, pal, fmt); p = fr.pal
    fr.deco_gradient(); fr.deco_glow(330, fr.H - 700, 520, p['accent'], 60)
    if brand.get('person') and not art_img:
        pbox, face = fr.person(int(fr.H * 0.55), 'left', xoff=-20)
    else:
        pbox, face = fr.portrait_arch((fr.x0 + 30, 830, fr.x0 + 30 + 560, 1388), img=art_img)
    fr.chip()
    top = fr.top + 100; bot = int(face[1]) - 70
    x0 = fr.x0; x1 = fr.x1(top, bot)

    def go(s, measure):
        yb, _ = fr.para(x0 + 46, top + 40, line, 'head', int(66 * s), p['panel_ink'], maxw=x1 - x0 - 92, measure=True)
        if yb + 40 > bot:
            raise LayoutError('talk line too long')
        if measure:
            return yb
        r = (x0, top, x1, yb + 40)
        fr.shadow(r, 40, 100)
        fr.box(r, 40, p['panel'], 'bubble')
        tx = int((face[0] + face[2]) / 2) + 40
        fr.d.polygon([(tx - 40, r[3] - 2), (tx + 40, r[3] - 2), (tx - 10, r[3] + 52)], fill=p['panel'])
        fr._ok((tx - 40, r[3], tx + 40, r[3] + 52), 'bubble tail')
        fr.box((x0 + 46, top + 18, x0 + 126, top + 26), 4, p['accent'], 'rule')
        fr.para(x0 + 46, top + 40, line, 'head', int(66 * s), p['panel_ink'], maxw=x1 - x0 - 92)
        return yb
    s = _fill(go, 0.55, 1.45, name=name); go(s, False)
    if tag:
        f = fr.F('body_bold', 34); w = fr.tw(tag, f) + 60; xr = 900
        y = fr.bottom - 96
        fr.box((xr - w, y, xr, y + 70), 35, p['accent'], 'name tag')
        fr.text((xr - w / 2, y + 35), tag, f, p['accent_ink'], anchor='mm')
    return fr.finish(name)


def quote(brand, text, attribution=None, pal='primary', fmt='vertical', name='quote'):
    """Reflection scene: one line set large in the brand serif, generous margins, a quiet ornament."""
    fr = Frame(brand, pal, fmt); p = fr.pal
    fr.deco_gradient(); fr.deco_grain(8)
    fr.deco_rings(fr.W // 2, fr.H // 2, 380, mix(p['bg'], p['accent'], 0.16), n=4, gap=110, width=2)
    fr.chip(small=True)

    def go(s, measure):
        top = fr.top + 150
        yb, _ = fr.para(fr.x0 + 20, top, text, 'serif', int(84 * s), p['ink'], gap=1.36, maxw=fr.x1(top, fr.bottom) - fr.x0 - 40, measure=True)
        yb2 = yb + (110 if attribution else 0)
        if yb2 > fr.bottom - 30:
            raise LayoutError('quote too long')
        if measure:
            return yb2
        off = max(0, (fr.bottom - 30 - yb2) // 2)
        fr.text((fr.x0, top + off - 120), '“', fr.F('serif', 200), p['accent'], what='quote mark')
        yy = fr.para(fr.x0 + 20, top + off, text, 'serif', int(84 * s), p['ink'], gap=1.36, maxw=fr.x1(top, fr.bottom) - fr.x0 - 40)
        if attribution:
            fr.box((fr.x0 + 20, yy + 34, fr.x0 + 110, yy + 40), 3, p['accent'], 'rule')
            fr.text((fr.x0 + 20, yy + 62), attribution, fr.F('body_bold', 38), p['muted'])
        return yb2
    s = _fill(go, 0.5, 1.9, name=name); go(s, False)
    return fr.finish(name)


def cta(brand, headline, offer, url=None, pal='primary', fmt='vertical', name='cta', art_img=None):
    """Closing scene: the ask at the top, the founder standing on the bottom edge, the address as a lower third."""
    fr = Frame(brand, pal, fmt); p = fr.pal
    fr.deco_gradient(); fr.deco_glow(fr.W // 2, fr.H - 500, 560, p['accent'], 70)
    if brand.get('person') and not art_img:
        pbox, face = fr.person(int(fr.H * 0.60), 'center', xoff=60)
    else:
        pbox, face = fr.portrait_arch((fr.x0 + 150, 760, fr.x0 + 150 + 540, 1250), img=art_img)
    fr.chip()
    top = fr.top + 104; lim = int(min(face[1], pbox[1])) - 40

    def go(s, measure):
        yb = fr.rich(fr.x0, top, headline, 'display', int(92 * s), p['ink'], p['accent'], gap=1.04, measure=True)
        yb2, _ = fr.para(fr.x0, yb + 20, offer, 'head', int(48 * s), p['muted'], measure=True)
        if yb2 > lim:
            raise LayoutError('cta text too tall')
        if measure:
            return yb2
        yb = fr.rich(fr.x0, top, headline, 'display', int(92 * s), p['ink'], p['accent'], gap=1.04)
        fr.para(fr.x0, yb + 20, offer, 'head', int(48 * s), p['muted'])
        return yb2
    s = _fill(go, 0.5, 1.6, name=name); go(s, False)
    url = url or brand['url']
    f = fr.F('display', 56); w = min(fr.x1(1260, 1380) - fr.x0, fr.tw(url, f) + 120)
    r = (fr.x0 + (fr.x1(1260, 1380) - fr.x0 - w) // 2, 1270, fr.x0 + (fr.x1(1260, 1380) - fr.x0 - w) // 2 + w, 1380)
    fr.shadow(r, 55, 140)
    fr.box(r, 55, p['accent'], 'url bar')
    fr.text(((r[0] + r[2]) / 2, (r[1] + r[3]) / 2), url, f, p['accent_ink'], anchor='mm')
    return fr.finish(name)


def cover(brand, lines, sub=None, pal='primary', name='cover'):
    """Reel cover: poster layout; everything also sits inside the 3:4 profile-grid crop (rows 240 to 1680)."""
    return poster(brand, lines, sub, pal=pal, name=name, ghost=None)


def book(brand, cover_img, line, sub=None, pal='primary', fmt='vertical', name='book', badge=None):
    """A book (or a report, a PDF) shown whole as a physical object: cover with depth and a page edge, one line that
    says why it matters, an optional badge ('Out now', 'Free chapter 1')."""
    fr = Frame(brand, pal, fmt); p = fr.pal
    fr.deco_gradient(); fr.deco_glow(fr.W // 2, 900, 520, p['accent'], 60); fr.deco_dots(alpha=10)
    fr.chip()
    cv = Image.open(cover_img).convert('RGB')

    def go(s, measure):
        y = fr.top + 110
        yb = fr.rich(fr.x0, y, line, 'display', int(76 * s), p['ink'], p['accent'], gap=1.08, measure=True)
        if sub:
            yb, _ = fr.para(fr.x0, yb + 14, sub, 'body', int(40 * s), p['muted'], measure=True)
        top = yb + 50; bot = fr.bottom - 30
        maxw = fr.x1(top, bot) - fr.x0 - 60
        z = min(maxw / cv.width, (bot - top) / cv.height)
        if z * cv.height < 420:
            raise LayoutError('book cover too small')
        if measure:
            return bot
        fr.rich(fr.x0, y, line, 'display', int(76 * s), p['ink'], p['accent'], gap=1.08)
        if sub:
            yb0 = fr.rich(fr.x0, y, line, 'display', int(76 * s), p['ink'], p['accent'], gap=1.08, measure=True)
            fr.para(fr.x0, yb0 + 14, sub, 'body', int(40 * s), p['muted'])
        im = cv.resize((int(cv.width * z), int(cv.height * z)), Image.LANCZOS)
        x = fr.x0 + 20 + (maxw - im.width) // 2; yy = top + (bot - top - im.height) // 2
        fr.shadow((x, yy, x + im.width + 14, yy + im.height), 6, 170, 34, 26)
        fr.box((x + 8, yy + 8, x + im.width + 14, yy + im.height - 4), 4, (236, 232, 222), 'page edge')
        spine = Image.new('RGBA', (16, im.height), (0, 0, 0, 0)); sd = ImageDraw.Draw(spine)
        for i in range(16):
            sd.line((i, 0, i, im.height), fill=(0, 0, 0, int(90 * (1 - i / 16))))
        cvr = im.convert('RGBA'); cvr.alpha_composite(spine, (0, 0))
        fr.paste(cvr, (x, yy), 'book cover')
        if badge:
            f = fr.F('body_bold', 34); w = fr.tw(badge, f) + 60
            bx = min(x + im.width - w // 2, fr.x1(yy, yy + 70) - w)
            fr.box((bx, yy + 40, bx + w, yy + 110), 35, p['accent'], 'badge')
            fr.text((bx + w / 2, yy + 75), badge, f, p['accent_ink'], anchor='mm')
        return bot
    s = _fill(go, 0.55, 1.3, name=name); go(s, False)
    return fr.finish(name)


def photo(brand, image, lines, kicker=None, pal='primary', fmt='vertical', name='photo', focus=(0.5, 0.35), credit=None):
    """People first: a full-bleed photo (a real owner at work, a customer, a street of shops) with the hook set over a
    soft scrim in the lower part of the safe zone. The photo is decoration (it may run under the platform interface);
    focus=(fx, fy) keeps the subject's face in view when the photo is cropped to fill the frame. Only photos we may
    use: our own, a client's with permission, or a free-licence stock photo recorded in assets/people/LICENSES.json.
    credit: a short credit line when the licence asks for one."""
    fr = Frame(brand, pal, fmt); p = fr.pal
    src = Image.open(image).convert('RGB')
    z = max(fr.W / src.width, fr.H / src.height); im = src.resize((int(src.width * z) + 1, int(src.height * z) + 1), Image.LANCZOS)
    cx = int(min(max(0, focus[0] * im.width - fr.W / 2), im.width - fr.W)); cy = int(min(max(0, focus[1] * im.height - fr.H * 0.4), im.height - fr.H))
    fr.bg = im.crop((cx, cy, cx + fr.W, cy + fr.H)); fr.bd = ImageDraw.Draw(fr.bg)
    scrim = Image.new('L', (1, fr.H))
    for yy in range(fr.H):
        t = max(0.0, (yy - fr.H * 0.38) / (fr.H * 0.42)); scrim.putpixel((0, yy), int(235 * min(1, t) ** 1.4))
    dark = Image.new('RGB', (fr.W, fr.H), p.get('bg2', p['bg']))
    fr.bg = Image.composite(dark, fr.bg, scrim.resize((fr.W, fr.H))); fr.bd = ImageDraw.Draw(fr.bg)
    top_scrim = Image.new('L', (1, fr.H))
    for yy in range(fr.H):
        top_scrim.putpixel((0, yy), int(150 * max(0, 1 - yy / 520)))
    fr.bg = Image.composite(dark, fr.bg, top_scrim.resize((fr.W, fr.H))); fr.bd = ImageDraw.Draw(fr.bg)
    fr.chip()
    ink = (255, 255, 255)

    def go(s, measure):
        y0 = 860; sizes = []
        for ln in lines:
            plain = ln.replace('*', ''); z = int(150 * s)
            while z > 40 and fr.tw(plain, fr.F('display', z)) > fr.x1(900, 1390) - fr.x0 - 4:
                z -= 4
            sizes.append(z)
        h = sum(int(z * 1.02) for z in sizes)
        kb = 0
        if kicker:
            kb = fr.para(fr.x0, 1000, kicker, 'body_bold', int(46 * min(s, 1.2)), ink, measure=True)[0] - 1000 + 62
        top = fr.bottom - 20 - h - kb
        if top < y0:
            raise LayoutError('photo text too tall')
        if measure:
            return fr.bottom
        y = top
        for ln, z in zip(lines, sizes):
            fr.rich(fr.x0, y, ln, 'display', z, ink, p['accent'] if lum(p['accent']) > 110 else (253, 185, 19), gap=1.02, nowrap=True); y += int(z * 1.02)
        if kicker:
            fr.box((fr.x0, y + 30, fr.x0 + 90, y + 38), 4, p['accent'] if lum(p['accent']) > 110 else (253, 185, 19), 'rule')
            fr.para(fr.x0, y + 58, kicker, 'body_bold', int(46 * min(s, 1.2)), ink)
        return fr.bottom
    sc = _fill(go, 0.5, 1.2, name=name); go(sc, False)
    if credit:
        fr.text((fr.x1(fr.bottom - 40, fr.bottom) - 4, fr.bottom - 4), credit, fr.F('body', 20), (220, 220, 220), anchor='rd', what='photo credit')
    return fr.finish(name)


def art(brand, image, title, facts=(), source=None, pal='primary', fmt='vertical', name='art'):
    """Knowledge hero: a diagram or artwork shown whole (a chakra, a map, a book page, a chart), the title above it
    and up to 4 fact chips under it ('तत्व: पृथ्वी', 'बीज मंत्र: लं'). source: where the facts come from
    (a text, a book of his, a page on his site). For facts, not for faces."""
    fr = Frame(brand, pal, fmt); p = fr.pal
    fr.deco_gradient(); fr.deco_glow(fr.W // 2, 900, 560, p['accent'], 55); fr.deco_dots(alpha=10)
    fr.chip()
    src = Image.open(image).convert('RGBA')

    def go(s, measure):
        y = fr.top + 108
        yb = fr.rich(fr.x0, y, title, 'display', int(74 * s), p['ink'], p['accent'], gap=1.08, measure=True)
        chip_f = fr.F('body_bold', int(38 * min(s, 1.15))); ch = int(38 * min(s, 1.15) * 1.9)
        rows, row, wsum = [], [], 0
        maxw = fr.x1(1000, 1400) - fr.x0
        for f in facts:
            w = int(fr.tw(f, chip_f) + 56)
            if row and wsum + w + 16 > maxw:
                rows.append(row); row, wsum = [], 0
            row.append((f, w)); wsum += w + 16
        if row:
            rows.append(row)
        chips_h = len(rows) * (ch + 16)
        src_h = 50 if source else 0
        top = yb + 34; bot = fr.bottom - 20 - chips_h - src_h - 24
        aw = fr.x1(top, bot) - fr.x0
        z = min(aw / src.width, (bot - top) / src.height)
        if z * src.height < 380:
            raise LayoutError('art too small')
        if measure:
            return bot
        fr.rich(fr.x0, y, title, 'display', int(74 * s), p['ink'], p['accent'], gap=1.08)
        im = src.resize((int(src.width * z), int(src.height * z)), Image.LANCZOS)
        x = fr.x0 + (aw - im.width) // 2; yy = top + (bot - top - im.height) // 2
        fr.paste(im, (x, yy), 'art')
        cy = yy + im.height + 30
        for r in rows:
            cx = fr.x0
            for f, w in r:
                fr.box((cx, cy, cx + w, cy + ch), ch // 2, p['panel'], 'fact chip')
                fr.text((cx + w / 2, cy + ch / 2), f, chip_f, p['panel_ink'], anchor='mm')
                cx += w + 16
            cy += ch + 16
        if source:
            fr.text((fr.x0, cy + 6), source, fr.F('body', 30), p['muted'], what='source')
        return bot
    sc = _fill(go, 0.6, 1.3, name=name); go(sc, False)
    return fr.finish(name)


def search(brand, query, image, title=None, label=None, pal='primary', fmt='vertical', name='search', region=None, lens=None):
    """Search demo: a search bar where the query types itself (in the video), then the REAL result as a screenshot,
    shown whole, with a lens on the key result. Only real searches, captured the same day, with the date in label.
    Shows viewers how to reach the topic themselves."""
    fr = Frame(brand, pal, fmt); p = fr.pal
    sc = Image.open(image).convert('RGB')
    if region:
        sc = sc.crop(region)
    fr.deco_gradient(); fr.deco_dots(alpha=10)
    fr.chip()
    y = fr.top + 104
    if title:
        y = fr.rich(fr.x0, y, title, 'head', 58, p['ink'], p['accent'], gap=1.12) + 24
    bar = (fr.x0, y, fr.x1(y, y + 110), y + 110)
    fr.shadow(bar, 55, 90, 20, 12)
    fr.box(bar, 55, (255, 255, 255), 'search bar')
    gx, gy = bar[0] + 60, bar[1] + 55
    fr.d.ellipse((gx - 20, gy - 20, gx + 14, gy + 14), outline=(90, 96, 110), width=6)
    fr.d.line((gx + 10, gy + 10, gx + 26, gy + 26), fill=(90, 96, 110), width=7)
    qf = fr.F('body_bold', 42)
    while fr.tw(query, qf) > bar[2] - bar[0] - 140 and qf.size > 26:
        qf = fr.F('body_bold', qf.size - 2)
    fr.typing = ((bar[0] + 104, gy), query, qf, (30, 34, 44))
    top = bar[3] + 40; bot = fr.bottom - 80
    maxw = fr.x1(top, bot) - fr.x0 - 16
    z = min(maxw / sc.width, (bot - top) / sc.height, 1.4)
    im = sc.resize((int(sc.width * z), int(sc.height * z)), Image.LANCZOS)
    x = fr.x0 + 8 + (maxw - im.width) // 2; yy = top + max(0, (bot - top - im.height) // 3)
    mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), 18, fill=255)
    rim = im.convert('RGBA'); rim.putalpha(mask)
    fr.shadow((x, yy, x + im.width, yy + im.height), 18, 150, 28, 20)
    fr.box((x - 8, yy - 8, x + im.width + 8, yy + im.height + 8), 26, p['accent'], 'result frame')
    fr.paste(rim, (x, yy), 'result')
    if lens:
        ox, oy = x + lens[0] * z, yy + lens[1] * z
        fr.box((ox - 4, oy - 4, ox + (lens[2] - lens[0]) * z + 4, oy + (lens[3] - lens[1]) * z + 4), 8, None, 'lens marker', outline=p['accent'], width=5)
    if label:
        f = fr.F('body_bold', 30); w = fr.tw(label, f) + 56; sy = yy + im.height + 28
        fr.box((fr.x0, sy, fr.x0 + w, sy + 56), 28, p.get('chip', p['ink']), 'label')
        fr.text((fr.x0 + 28, sy + 28), label, f, p.get('chip_ink', p['bg']), anchor='lm')
    fr.shot_scale = z
    return fr.finish(name)


FORMATS = dict(art=art, search=search, photo=photo, book=book, poster=poster, stat=stat, mythfact=mythfact, proof=proof, steps=steps, talk=talk, quote=quote, cta=cta, cover=cover)


SERIES = None


def build(brand, scenes, series=None):
    """scenes: list of dicts like {'f': 'poster', 'pal': 'yellow', 'lines': [...], ...} -> list of finished Frames.
    series: a key of brand['series']; its badge rides next to the brand chip on every frame and the cover."""
    global SERIES
    SERIES = brand.get('series', {}).get(series) if series else None
    out = []
    for sc in scenes:
        sc = dict(sc); f = FORMATS[sc.pop('f')]
        out.append(f(brand, **sc))
    return out


# ---------------- video ----------------

def _ease(t):
    return 1 - (1 - t) ** 3


def render(frames, durs, out='video_only.mp4', fps=30, crf=26, dissolve=0.18):
    """Background drifts slowly (alternating zoom in and out), content rises 36 px and fades in over 0.4 s,
    scenes dissolve into each other. Content stays inside the safe zone at all times (it only moves up into place)."""
    W, H = frames[0].W, frames[0].H
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps),
                          '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
                         stdin=subprocess.PIPE)
    prev_last = None
    for i, (fr, dur) in enumerate(zip(frames, durs)):
        n = max(1, round(dur * fps)); zin = (i % 2 == 0)
        bg = fr.bg.convert('RGBA'); fg = fr.fg
        nd = int(dissolve * fps)
        for k in range(n):
            t = k / max(1, n - 1)
            z = 1.0 + 0.045 * (t if zin else 1 - t)
            if abs(z - 1) > 1e-3:
                bw, bh = int(W * z), int(H * z)
                b = bg.resize((bw, bh), Image.BILINEAR).crop(((bw - W) // 2, (bh - H) // 2, (bw - W) // 2 + W, (bh - H) // 2 + H))
            else:
                b = bg.copy()
            te = k / fps
            if te < 0.4:
                e = _ease(te / 0.4); dy = int(36 * (1 - e))
                layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); layer.alpha_composite(fg, (0, 0))
                layer = layer.crop((0, 0, W, H - dy)); a = layer.getchannel('A').point(lambda v, e=e: int(v * e)); layer.putalpha(a)
                b.alpha_composite(layer, (0, dy))
            else:
                b.alpha_composite(fg)
            img = b.convert('RGB')
            if getattr(fr, 'typing', None):   # the search query types itself in the first 1.6 s, then a caret blinks
                (tx, ty), q, f, col = fr.typing; td = ImageDraw.Draw(img)
                shown = q[:max(0, min(len(q), int(len(q) * (te - 0.35) / 1.25)))] if te > 0.35 else ''
                td.text((tx, ty), shown, font=f, fill=col, anchor='lm')
                if int(te * 2) % 2 == 0 or len(shown) < len(q):
                    cx2 = tx + td.textlength(shown, font=f) + 4; td.line((cx2, ty - f.size * 0.55, cx2, ty + f.size * 0.55), fill=col, width=3)
            if prev_last is not None and k < nd:
                img = Image.blend(prev_last, img, (k + 1) / (nd + 1))
            p.stdin.write(img.tobytes())
            if k == n - 1:
                prev_last = img
    p.stdin.close(); p.wait()
    return out


def contact_sheet(frames, path, cols=4, w=270):
    h = int(w * frames[0].H / frames[0].W); rows = math.ceil(len(frames) / cols)
    sheet = Image.new('RGB', (cols * (w + 12) + 12, rows * (h + 12) + 12), (30, 30, 30))
    for i, fr in enumerate(frames):
        im = fr.image().resize((w, h), Image.LANCZOS)
        sheet.paste(im, (12 + (i % cols) * (w + 12), 12 + (i // cols) * (h + 12)))
    sheet.save(path, quality=88)
    return path
