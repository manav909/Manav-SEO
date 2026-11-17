"""Business Santa vertical design kit (1080x1920): Reels, Shorts, covers and stories that read cleanly on every platform.

The look: a full-bleed navy backdrop with soft decoration (it may run under the platforms' buttons and captions,
nothing there needs to be read), and one content card that sits exactly inside the safe zone from safezone.py.
The brand rides on the card as a folder tab (logo, Business Santa, businesssanta.com), so it is always visible and
never under Instagram's username row, YouTube's buttons or Facebook's caption.

Every Stage records what it draws; draw() refuses content outside the safe zone and finish() runs the pixel check
against the background, so a leak stops the render instead of reaching the feed.

Typical use (see tools/video/reels/example_tip.py):
    from reel_kit import Stage, hook, statement, tip, shot, close, cover
    frames = [hook(...), statement(...), tip(1, ...), close()]
    cover(...).save('cover.jpg')
    render_video(frames, durs, 'video_only.mp4')
"""
import os, math, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import safezone

W, H, FPS = 1080, 1920, 30
NAVY, NAVY_D, CARD = (11, 18, 40), (5, 8, 18), (20, 31, 58)
YEL, WHITE, MUT, SKY, CORAL = (253, 185, 19), (255, 255, 255), (178, 188, 208), (120, 200, 255), (255, 128, 112)
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
IMG = os.path.join(REPO, 'sites', 'businesssanta', 'assets', 'img')
HEAD = os.path.join(HERE, 'assets', 'bshead.ttf')
INTER = '/usr/share/fonts/opentype/inter/Inter-%s.otf'

# Card geometry: the card IS the safe zone (decoration may extend a few pixels past it).
TAB = (72, 300, 744, 392)           # brand tab on top of the card
CARD_BOX = (60, 384, 1020, 1400)    # card body
PAD = 44
X0 = 72 + PAD                        # content left edge (116)
X1_UP, X1_LOW = 1008 - PAD, 912 - 8  # content right edge above / below y 840 (buttons on the right below 840)
Y0, Y1 = 392 + 40, 1400 - 52         # content top / bottom (progress bar below)
CAPTION_Y = 1300                     # lane for word-by-word captions in Shorts (inside the card, above usernames)


def F(size, kind='head'):
    return ImageFont.truetype(HEAD if kind == 'head' else INTER % kind, size)


def _circle(im, d):
    im = im.resize((d, d), Image.LANCZOS); m = Image.new('L', (d, d), 0)
    ImageDraw.Draw(m).ellipse((0, 0, d - 1, d - 1), fill=255); im.putalpha(m); return im


LOGO = _circle(Image.open(os.path.join(IMG, 'logo-512.png')).convert('RGBA'), 64)
MANAV = Image.open(os.path.join(IMG, 'manav-cut-860.webp')).convert('RGBA')


def backdrop(accent=YEL, card=True, brand=True, card_color=CARD):
    """Background layer: gradient, a soft map-dot pattern, a glow, the card and its brand tab.
    The tab text is part of the background because it is fixed brand art inside the safe zone."""
    im = Image.new('RGB', (W, H), NAVY); d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H; d.line([(0, y), (W, y)], fill=tuple(int(NAVY[k] * (1 - t) + NAVY_D[k] * t) for k in range(3)))
    dots = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(dots)
    for yy in range(30, H, 54):
        for xx in range(30 + (27 if (yy // 54) % 2 else 0), W, 54):
            dd.ellipse((xx - 3, yy - 3, xx + 3, yy + 3), fill=(255, 255, 255, 16))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    gd.ellipse((560, -260, 1400, 520), fill=accent + (46,)); gd.ellipse((-420, 1420, 520, 2240), fill=accent + (30,))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    im.paste(glow, (0, 0), glow); im.paste(dots, (0, 0), dots)
    d = ImageDraw.Draw(im)
    if card:
        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle(
            (CARD_BOX[0] + 10, CARD_BOX[1] + 24, CARD_BOX[2] + 10, CARD_BOX[3] + 24), 44, fill=(0, 0, 0, 120))
        sh = sh.filter(ImageFilter.GaussianBlur(22)); im.paste(sh, (0, 0), sh); d = ImageDraw.Draw(im)
        d.rounded_rectangle(CARD_BOX, 44, fill=card_color)
        d.rounded_rectangle((CARD_BOX[0], CARD_BOX[1], CARD_BOX[2], CARD_BOX[1] + 10), 6, fill=accent)
        if brand:
            d.rounded_rectangle(TAB, 30, fill=card_color)
            d.rectangle((TAB[0], TAB[1] + 40, TAB[2], CARD_BOX[1] + 10), fill=card_color)
            d.rounded_rectangle((CARD_BOX[0], CARD_BOX[1], CARD_BOX[2], CARD_BOX[1] + 10), 6, fill=accent)
            d.rectangle((TAB[0] + 30, CARD_BOX[1], TAB[2] - 30, CARD_BOX[1] + 10), fill=card_color)
            im.paste(LOGO, (TAB[0] + 18, TAB[1] + 14), LOGO)
            d.text((TAB[0] + 96, TAB[1] + 46), 'Business Santa', font=F(38), fill=WHITE, anchor='lm')
            x = TAB[0] + 96 + d.textlength('Business Santa', font=F(38)) + 22
            d.ellipse((x, TAB[1] + 42, x + 8, TAB[1] + 50), fill=accent)
            d.text((x + 22, TAB[1] + 48), 'businesssanta.com', font=F(28, 'SemiBold'), fill=accent, anchor='lm')
    return im


class Stage:
    """One frame. Draw content with the helpers; every box is checked against the safe zone."""

    def __init__(self, accent=YEL, card=True, brand=True, card_color=CARD, fmt='vertical'):
        self.fmt = fmt; self.accent = accent
        self.bg = backdrop(accent, card, brand, card_color)
        self.im = self.bg.copy(); self.d = ImageDraw.Draw(self.im)

    def _ok(self, box, what):
        if not safezone.inside(box, self.fmt):
            raise safezone.SafeZoneError(f'{what!r} at {tuple(int(v) for v in box)} is outside the {self.fmt} safe zone')

    def right_edge(self, y0, y1):
        return X1_UP if y1 <= 840 else X1_LOW

    def text(self, xy, txt, font, fill, anchor='la'):
        box = self.d.textbbox(xy, txt, font=font, anchor=anchor); self._ok(box, txt)
        self.d.text(xy, txt, font=font, fill=fill, anchor=anchor); return box

    def fit(self, txt, maxw, start, kind='head', min_size=40):
        s = start
        while s > min_size and self.d.textlength(txt, font=F(s, kind)) > maxw:
            s -= 4
        return F(s, kind)

    def wrap(self, txt, font, maxw):
        out, cur = [], ''
        for w in txt.split():
            t = (cur + ' ' + w).strip()
            if self.d.textlength(t, font=font) <= maxw: cur = t
            else: out.append(cur); cur = w
        if cur: out.append(cur)
        return out

    def para(self, x, y, txt, size, fill, kind='head', gap=1.16, maxw=None):
        """Wrapped text; lines that reach below y 840 wrap to the narrower width that clears the buttons."""
        f = F(size, kind); step = int(size * gap)
        lines = self._lines(x, y, txt, f, step, maxw)
        if len(lines) > 1 and len(lines[-1].split()) == 1:  # no single-word last line: rebalance
            for cut in range(20, 400, 20):
                alt = self._lines(x, y, txt, f, step, min(maxw or 10 ** 6, X1_UP - x) - cut)
                if len(alt) == len(lines) and len(alt[-1].split()) > 1:
                    lines = alt; break
        if len(lines) > 1 and len(lines[-1].split()) == 1:  # still a widow (e.g. "Set special / hours."): shrink up to 12%
            for s2 in range(size - 2, int(size * 0.88) - 1, -2):
                f2 = F(s2, kind); alt = self._lines(x, y, txt, f2, int(s2 * gap), maxw)
                if len(alt) == 1 or len(alt[-1].split()) > 1:
                    f, step, lines = f2, int(s2 * gap), alt; break
            else:
                print(f'reel_kit: single-word last line left in "{txt}"; reword it')
        for ln in lines:
            self.text((x, y), ln, f, fill); y += step
        return y

    def _lines(self, x, y, txt, f, step, maxw):
        words = txt.split(); out = []
        while words:
            mw = min(maxw or 10 ** 6, self.right_edge(y, y + step) - x)
            line = words[0]
            while len(words) > len(line.split()) and self.d.textlength(line + ' ' + words[len(line.split())], font=f) <= mw:
                line = line + ' ' + words[len(line.split())]
            out.append(line); words = words[len(line.split()):]; y += step
        return out

    def box(self, rect, radius, fill, what='box'):
        self._ok(rect, what); self.d.rounded_rectangle(rect, radius, fill=fill)

    def paste(self, img, xy, what='image'):
        box = (xy[0], xy[1], xy[0] + img.width, xy[1] + img.height); self._ok(box, what)
        self.im.paste(img, xy, img if img.mode == 'RGBA' else None)

    def star(self, cx, cy, r, col):
        pts = [(cx + (r if i % 2 == 0 else r * 0.45) * math.cos(-math.pi / 2 + i * math.pi / 5),
                cy + (r if i % 2 == 0 else r * 0.45) * math.sin(-math.pi / 2 + i * math.pi / 5)) for i in range(10)]
        self._ok((cx - r, cy - r, cx + r, cy + r), 'star'); self.d.polygon(pts, fill=col)

    def pin(self, cx, cy, r, col):
        self._ok((cx - r, cy - r, cx + r, cy + 2.1 * r), 'pin')
        self.d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)
        self.d.polygon([(cx - r * .86, cy + r * .5), (cx + r * .86, cy + r * .5), (cx, cy + r * 2.1)], fill=col)
        self.d.ellipse((cx - r * .42, cy - r * .42, cx + r * .42, cy + r * .42), fill=CARD)

    def finish(self, name='frame'):
        safezone.check(self.im, self.bg, self.fmt, name)
        return self


# ---------- scene templates ----------
# Each template lays its content out, measures it, and centers it vertically in the card so no card looks half empty.

def _centered(accent, build, name, **kw):
    """Lay out, measure, center vertically; shrink type a little (down to 82%) when the text is long."""
    err = None
    for k in (1.0, 0.94, 0.88, 0.82):
        try:
            probe = Stage(accent, **kw); bottom = build(probe, Y0, k)
        except safezone.SafeZoneError as e:
            err = e; continue
        if bottom > Y1:
            err = f'bottom {bottom} > {Y1}'; continue
        for off in range(max(0, (Y1 - bottom) // 2), -1, -8):  # as centered as the wrap allows
            try:
                s = Stage(accent, **kw)
                if build(s, Y0 + off, k) <= Y1:
                    return s.finish(name)
            except safezone.SafeZoneError:
                pass
        s = Stage(accent, **kw); build(s, Y0, k)
        return s.finish(name)
    raise safezone.SafeZoneError(f'{name}: content does not fit the card even at 82% size, shorten the text ({err})')


def hook(big, kicker, line1, line2, accent=YEL, footer=None):
    """big: 1 or 2 short words per line, e.g. ['DALLAS', 'SALONS']; kicker under them, e.g. '+ SPAS, TEXAS'."""
    def build(s, y0, k=1.0):
        block_h = 64 + int(172 * k) * len(big) + (78 if kicker else 0)
        s.box((X0, y0, X1_LOW, y0 + block_h), 36, accent, 'hook block')
        y = y0 + 36
        for w in big:
            f = s.fit(w, X1_LOW - X0 - 88, int(180 * k)); s.text((X0 + 44, y), w, f, NAVY); y += int(172 * k)
        if kicker:
            s.text((X0 + 48, y + 22), kicker, F(int(50 * k)), NAVY)
        y = s.para(X0, y0 + block_h + 48, line1, int(62 * k), WHITE)
        y = s.para(X0, y + 12, line2, int(62 * k), accent)
        if footer:
            s.box((X0, y + 30, X0 + 120, y + 38), 4, accent, 'rule')
            y = s.para(X0, y + 60, footer, int(46 * k), MUT)
        return y
    return _centered(accent, build, 'hook')


def statement(label, quote, source, accent=YEL):
    def build(s, y0, k=1.0):
        s.text((X0, y0), label, F(int(60 * k)), accent)
        top = y0 + 110; f = F(int(70 * k))
        lines = s.wrap(quote, f, X1_LOW - X0 - 100); h = 170 + len(lines) * int(84 * k)
        s.box((X0, top, X1_LOW, top + h), 34, WHITE, 'quote card')
        s.text((X0 + 40, top + 6), '\u201c', F(int(190 * k)), accent)
        y = top + 130
        for ln in lines:
            s.text((X0 + 50, y), ln, f, NAVY); y += int(84 * k)
        return s.para(X0, top + h + 36, source, int(38 * k), MUT, kind='SemiBold', maxw=X1_LOW - X0)
    return _centered(accent, build, 'statement')


def tip(n, title, body, accent=YEL, label='TIP'):
    """label: the word beside the number badge ('TIP', or e.g. 'STEP', 'LESSON'); '' shows the badge only."""
    def build(s, y0, k=1.0):
        s.box((X0, y0, X0 + 210, y0 + 210), 105, accent, 'tip badge')
        s.text((X0 + 105, y0 + 110), str(n), F(int(156 * k)), NAVY, anchor='mm')
        if label:
            s.text((X0 + 250, y0 + 64), f'{label} {n}' if label in ('TIP', 'STEP') else label, F(int(88 * k)), accent)
        y = s.para(X0, y0 + 280, title, int(104 * k), WHITE)
        s.box((X0, y + 30, X0 + 260, y + 44), 7, accent, 'rule')
        return s.para(X0, y + 88, body, int(62 * k), MUT)
    return _centered(accent, build, f'tip {n}')


def shot(image_path, title, date_line, accent=YEL):
    """A real screenshot, scaled to fit the card without cropping words. Crop the file to the answer first.

    Readability (16 Nov 2026): a whole ChatGPT answer from an 800 px wide window shrank to about 55% and its text
    was unreadable on a phone. Keep the scale at 0.95 or more: if the crop is tall, split it into two shot()
    scenes (for example picks 1 and 2, then picks 3 and 4), each cut between list items, never inside one."""
    sc0 = Image.open(image_path).convert('RGB')
    _z = min((X1_LOW - X0) / sc0.width, (Y1 - 80 - (Y0 + 110)) / sc0.height)
    if _z < 0.95:
        print(f'reel_kit.shot: {os.path.basename(image_path)} would be shown at {_z:.0%}; text may be too small '
              'to read on a phone. Split it into two shot() scenes.')
    def build(s, y0, k=1.0):
        y = s.para(X0, y0, title, int(60 * k), WHITE)
        top = y + 40; maxw, maxh = X1_LOW - X0, Y1 - 80 - top
        z = min(maxw / sc0.width, maxh / sc0.height); sc = sc0.resize((int(sc0.width * z), int(sc0.height * z)), Image.LANCZOS)
        x = X0 + (maxw - sc.width) // 2
        s.box((x - 6, top - 6, x + sc.width + 6, top + sc.height + 6), 18, accent, 'shot frame')
        s.paste(sc, (x, top), 'screenshot')
        s.text((X0, top + sc.height + 24), date_line, F(int(34 * k), 'SemiBold'), MUT)
        return top + sc.height + 70
    return _centered(accent, build, 'shot')


def close(accent=YEL, points=('Google Maps', 'Google Search', 'ChatGPT')):
    s = Stage(accent)
    y = s.para(X0, Y0 + 10, 'Want us to check yours?', 96, accent)
    y = s.para(X0, y + 18, 'Free Google and ChatGPT visibility check', 60, WHITE)
    s.box((X0, y + 36, X0 + 540, y + 140), 52, accent, 'url pill')
    s.text((X0 + 270, y + 90), 'businesssanta.com', F(52), NAVY, anchor='mm')
    m = MANAV.copy(); m.thumbnail((470, 1396 - (y + 180)))
    s.paste(m, (X1_LOW - m.width, 1396 - m.height), 'founder photo')
    py = y + 230
    for ptxt in points:
        s.box((X0, py + 8, X0 + 44, py + 52), 22, accent, 'check dot')
        s.text((X0 + 22, py + 31), 'v', F(30), NAVY, anchor='mm')
        s.text((X0 + 66, py), ptxt, F(50), WHITE); py += 86
    return s.finish('close')


COVER_STYLES = {  # rotate so neighbouring covers on the grid never look alike
    'yellow': dict(bg=YEL, ink=NAVY, panel=NAVY, panel_ink=WHITE),
    'navy': dict(bg=NAVY, ink=YEL, panel=YEL, panel_ink=NAVY),
    'white': dict(bg=(246, 247, 250), ink=NAVY, panel=YEL, panel_ink=NAVY),
    'sky': dict(bg=(32, 92, 168), ink=WHITE, panel=YEL, panel_ink=NAVY),
    'coral': dict(bg=(232, 92, 74), ink=WHITE, panel=NAVY, panel_ink=WHITE),
}


def cover(big, sub, style='yellow', tag=None):
    """1080x1920 cover: biggest words = trade and city (or the topic), all inside the safe zone and the grid crop."""
    st = COVER_STYLES[style]
    bg = Image.new('RGB', (W, H), st['bg']); d = ImageDraw.Draw(bg)
    for yy in range(30, H, 54):
        for xx in range(30, W, 54):
            d.ellipse((xx - 3, yy - 3, xx + 3, yy + 3), fill=tuple(min(255, max(0, c + (14 if sum(st['bg']) < 380 else -14))) for c in st['bg']))
    def build(y0):
        s = Stage.__new__(Stage); s.fmt = 'vertical'; s.accent = st['ink']; s.bg = bg; s.im = bg.copy(); s.d = ImageDraw.Draw(s.im)
        s.box((X0, 300, X0 + 470, 384), 42, st['panel'], 'brand pill')
        s.im.paste(LOGO, (X0 + 12, 310), LOGO)
        s.text((X0 + 92, 342), 'Business Santa', F(36), st['panel_ink'], anchor='lm')
        y = y0
        for w in big:
            f = s.fit(w, X1_UP - X0, 240)
            if y + f.size > 840:
                f = s.fit(w, X1_LOW - X0, 240)
            s.text((X0, y), w, f, st['ink']); y += int(f.size * 1.04)
        lines = s.wrap(sub, F(72), X1_LOW - X0 - 80)
        h = 64 + 88 * len(lines)
        s.box((X0, y + 34, X1_LOW, y + 34 + h), 38, st['panel'], 'cover panel')
        yy = y + 66
        for ln in lines:
            s.text((X0 + 40, yy), ln, F(72), st['panel_ink']); yy += 88
        y = y + 34 + h
        if tag:
            s.box((X0, y + 44, X0 + 120, y + 52), 4, st['ink'], 'rule')
            y = s.para(X0, y + 76, tag, 46, st['ink'], kind='SemiBold')
        return s, y
    s, bottom = build(440)
    s, _ = build(440 + max(0, (1380 - bottom) // 2))
    safezone.check(s.im, bg, 'vertical', 'cover')
    return s.im


# ---------- video ----------

def render_video(stages, durs, out='video_only.mp4', progress=True, crf=28):
    """Each Stage shown for its duration with a short slide-in; a progress bar runs along the card's bottom edge."""
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                          '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf), '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    total = sum(durs); t0 = 0.0
    for s, dur in zip(stages, durs):
        n = round((t0 + dur) * FPS) - round(t0 * FPS)
        for f in range(n):
            t = f / FPS
            if t < 0.3:
                k = 1 - (1 - t / 0.3) ** 3
                fr = s.bg.copy()
                layer = s.im.crop((0, 300, W, 1400)); bgl = s.bg.crop((0, 300, W, 1400))
                fr.paste(Image.blend(bgl, layer, k), (0, 300))
            else:
                fr = s.im.copy()
            if progress:
                dd = ImageDraw.Draw(fr); x1 = X0 + int((X1_LOW - X0) * (t0 + t) / total)
                dd.rounded_rectangle((X0, 1370, X1_LOW, 1378), 4, fill=(40, 54, 86)); dd.rounded_rectangle((X0, 1370, max(X0 + 8, x1), 1378), 4, fill=s.accent)
            p.stdin.write(fr.tobytes())
        t0 += dur
    p.stdin.close(); p.wait()
    return out
