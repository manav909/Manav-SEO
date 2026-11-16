"""Business Santa card kit: feed posts, carousel slides (1080x1350) and native Stories (1080x1920).
Use 'feed45cover' for the first slide of a carousel: Facebook's multi-photo collage crops it to about 2:3.

Every card is drawn in two layers: decoration first (saved as the background), content on top. Each card is then
checked with tools/video/safezone.py check() against its format ('feed45' or 'story'), so no word, logo or link can
land under Instagram's or Facebook's interface. Text blocks auto-shrink to fit, avoid single-word last lines, and
the stack is centered in the content area so there are no half-empty cards.

Text markup: wrap words in *stars* to color them yellow, e.g. "Set holiday hours *before Thanksgiving*".

Usage:
    from card_kit import Card
    c = Card('feed45', counter='1/7')
    c.kicker('9 DAYS TO THANKSGIVING'); c.title('Set your hours *before Thursday*'); c.body('...')
    c.footer_url('businesssanta.com/guides/holiday-hours-on-google')
    c.save('out/slide1.png')            # renders, runs safezone.check, writes slide1.png and slide1_bg.png
"""
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'tools', 'video'))
import safezone  # noqa: E402

NAVY = (11, 18, 32)
NAVY2 = (20, 31, 54)
YELLOW = (253, 185, 19)
WHITE = (255, 255, 255)
SOFT = (203, 211, 226)
MUTED = (143, 155, 179)

HEAD = os.path.join(REPO, 'tools', 'video', 'assets', 'bshead.ttf')
INTER = '/usr/share/fonts/opentype/inter/Inter-%s.otf'
LOGO = os.path.join(REPO, 'sites', 'businesssanta', 'assets', 'img', 'logo-512.png')

# Layout per format: safe zone (from safezone.SAFE), header row, content box, footer row.
LAYOUT = {
    'feed45': dict(size=(1080, 1350), safe=(72, 60, 1008, 1260), header=106, content=(72, 215, 1008, 1120), footer=1150),
    'feed45cover': dict(size=(1080, 1350), safe=(100, 60, 980, 1260), header=106, content=(100, 215, 980, 1120), footer=1150),
    'story': dict(size=(1080, 1920), safe=(72, 270, 1008, 1640), header=310, content=(72, 440, 1008, 1450), footer=1490),
}


def font(kind, size):
    if kind == 'head':
        return ImageFont.truetype(HEAD, size)
    return ImageFont.truetype(INTER % kind, size)


def _tokens(text):
    """Split markup into (word, highlighted) tokens. *stars* mark yellow words (punctuation may follow the closing
    star), and a ~ joins words that must stay on one line ("Nov~28")."""
    out, hl = [], False
    for w in text.split():
        start = w.startswith('*')
        m = re.search(r'\*([.,!?:;)"]*)$', w)
        end = bool(m) and len(w.strip('*')) > 0
        if start:
            hl = True
        word = w.lstrip('*')
        if m:
            word = word[:len(word) - len(m.group(0))] + m.group(1)
        out.append((word.replace('~', ' '), hl))
        if end:
            hl = False
    return out


def _wrap(draw, toks, f, width):
    lines, cur = [], []
    for t in toks:
        trial = cur + [t]
        if cur and draw.textlength(' '.join(w for w, _ in trial), font=f) > width:
            lines.append(cur); cur = [t]
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def wrap_balanced(draw, text, f, width):
    """Greedy wrap, then narrow the measure until the last line has at least two words (no widows)."""
    toks = _tokens(text)
    lines = _wrap(draw, toks, f, width)
    w = width
    while len(lines) > 1 and len(lines[-1]) < 2 and w > width * 0.6:
        w -= 12
        trial = _wrap(draw, toks, f, w)
        if len(trial) > len(lines):
            # narrowing added a line; accept only if the new last line is no longer a widow
            if len(trial[-1]) >= 2:
                lines = trial
            break
        lines = trial
    return lines


class Card:
    def __init__(self, fmt='feed45', counter=None, bg_variant=0):
        self.fmt = fmt
        self.L = LAYOUT[fmt]
        self.counter = counter
        self.bg_variant = bg_variant
        self.blocks = []
        self.footer = None

    # ----- blocks -----
    def kicker(self, text, color=YELLOW):
        self.blocks.append(('kicker', text, color)); return self

    def title(self, text, size=92, min_size=58):
        self.blocks.append(('title', text, size, min_size)); return self

    def body(self, text, size=50, min_size=40, color=SOFT):
        self.blocks.append(('body', text, size, min_size, color)); return self

    def bullets(self, items, size=46, min_size=38):
        self.blocks.append(('bullets', items, size, min_size)); return self

    def stat(self, number, label, size=200):
        self.blocks.append(('stat', number, label, size)); return self

    def stats(self, pairs):
        """Two or three stat tiles side by side: [(number, label), ...]."""
        self.blocks.append(('stats', pairs)); return self

    def options(self, items):
        """Answer options for a question post: ['A  Holiday hours confirmed', 'B  Not set yet']."""
        self.blocks.append(('options', items)); return self

    def note(self, text, size=32):
        self.blocks.append(('note', text, size)); return self

    def footer_url(self, url, label=None):
        self.footer = ('url', url, label); return self

    def footer_hint(self, text):
        self.footer = ('hint', text); return self

    # ----- drawing -----
    def background(self):
        W, H = self.L['size']
        bg = Image.new('RGB', (W, H), NAVY)
        glow = Image.new('L', (W, H), 0)
        g = ImageDraw.Draw(glow)
        if self.bg_variant % 3 == 0:
            g.ellipse((W - 420, -380, W + 380, 420), fill=70)
            g.ellipse((-420, H - 360, 360, H + 420), fill=40)
        elif self.bg_variant % 3 == 1:
            g.ellipse((-380, -380, 420, 420), fill=60)
            g.ellipse((W - 360, H - 420, W + 420, H + 360), fill=50)
        else:
            g.ellipse((W // 2 - 600, -700, W // 2 + 600, 300), fill=55)
        glow = glow.filter(ImageFilter.GaussianBlur(140))
        tint = Image.new('RGB', (W, H), (60, 52, 20))
        bg = Image.composite(tint, bg, glow)
        d = ImageDraw.Draw(bg)
        # thin brand rule along the very bottom edge and a dotted corner, both pure decoration
        d.rectangle((0, H - 12, W, H), fill=YELLOW)
        return bg

    def _measure(self, d, scale):
        """Lay out blocks at a font scale; return list of (height, draw_fn) and total height."""
        x0, y0, x1, y1 = self.L['content']
        width = x1 - x0
        items = []
        for b in self.blocks:
            kind = b[0]
            if kind == 'kicker':
                f = font('Bold', 34)
                tw = d.textlength(b[1], font=f)
                h = 64

                def fn(y, b=b, f=f, tw=tw):
                    d.rounded_rectangle((x0, y, x0 + tw + 48, y + 64), 32, fill=b[2])
                    d.text((x0 + 24, y + 32), b[1], font=f, fill=NAVY, anchor='lm')
                items.append((h, fn, 34))
            elif kind == 'title':
                size = max(b[3], int(b[2] * scale))
                f = font('head', size)
                lines = wrap_balanced(d, b[1], f, width)
                for _ in range(4):  # still a one-word last line: try a slightly smaller size
                    if len(lines) < 2 or len(lines[-1]) > 1:
                        break
                    size -= 4; f = font('head', size); lines = wrap_balanced(d, b[1], f, width)
                lh = int(size * 1.12)
                h = lh * len(lines)

                def fn(y, lines=lines, f=f, lh=lh):
                    for k, ln in enumerate(lines):
                        x = x0
                        for w, hl in ln:
                            d.text((x, y + k * lh), w, font=f, fill=YELLOW if hl else WHITE)
                            x += d.textlength(w + ' ', font=f)
                items.append((h, fn, 40))
            elif kind == 'body':
                size = max(b[3], int(b[2] * scale))
                f = font('Medium', size)
                lines = wrap_balanced(d, b[1], f, width)
                lh = int(size * 1.36)
                h = lh * len(lines)

                def fn(y, lines=lines, f=f, lh=lh, color=b[4]):
                    for k, ln in enumerate(lines):
                        x = x0
                        for w, hl in ln:
                            d.text((x, y + k * lh), w, font=f, fill=YELLOW if hl else color)
                            x += d.textlength(w + ' ', font=f)
                items.append((h, fn, 36))
            elif kind == 'bullets':
                size = max(b[3], int(b[2] * scale))
                f = font('SemiBold', size)
                lh = int(size * 1.3)
                rows = []
                for it in b[1]:
                    rows.append(wrap_balanced(d, it, f, width - 70))
                h = sum(lh * len(r) for r in rows) + 26 * (len(rows) - 1)

                def fn(y, rows=rows, f=f, lh=lh, size=size):
                    yy = y
                    for r in rows:
                        cy = yy + int(size * 0.62)
                        d.ellipse((x0 + 4, cy - 13, x0 + 30, cy + 13), fill=YELLOW)
                        for k, ln in enumerate(r):
                            x = x0 + 70
                            for w, hl in ln:
                                d.text((x, yy + k * lh), w, font=f, fill=YELLOW if hl else WHITE)
                                x += d.textlength(w + ' ', font=f)
                        yy += lh * len(r) + 26
                items.append((h, fn, 36))
            elif kind == 'stat':
                size = int(b[3] * min(1, scale + 0.1))
                fnum = font('head', size)
                flab = font('SemiBold', max(38, int(48 * scale)))
                lab = wrap_balanced(d, b[2], flab, width)
                lh = int(flab.size * 1.3)
                h = int(size * 1.0) + 16 + lh * len(lab)

                def fn(y, fnum=fnum, flab=flab, lab=lab, lh=lh, size=size, b=b):
                    d.text((x0, y - int(size * 0.1)), b[1], font=fnum, fill=YELLOW)
                    for k, ln in enumerate(lab):
                        d.text((x0, y + size + 16 + k * lh), ' '.join(w for w, _ in ln), font=flab, fill=WHITE)
                items.append((h, fn, 40))
            elif kind == 'stats':
                n = len(b[1]); gap = 24
                tw = (width - gap * (n - 1)) // n
                fnum = font('head', 96 if n == 2 else 80)
                while max(d.textlength(num, font=fnum) for num, _ in b[1]) > tw - 56 and fnum.size > 48:
                    fnum = font('head', fnum.size - 4)  # long numbers shrink to fit their tile
                flab = font('SemiBold', 38 if n == 2 else 34)
                labs = [wrap_balanced(d, lab, flab, tw - 56) for _, lab in b[1]]
                lh = int(flab.size * 1.3)
                h = 40 + fnum.size + 20 + lh * max(len(l) for l in labs) + 36

                def fn(y, b=b, tw=tw, gap=gap, fnum=fnum, flab=flab, labs=labs, lh=lh, h=h):
                    for k, (num, _) in enumerate(b[1]):
                        x = x0 + k * (tw + gap)
                        d.rounded_rectangle((x, y, x + tw, y + h), 28, fill=NAVY2, outline=(48, 64, 96), width=3)
                        d.text((x + 28, y + 34), num, font=fnum, fill=YELLOW)
                        for j, ln in enumerate(labs[k]):
                            d.text((x + 28, y + 40 + fnum.size + 20 + j * lh), ' '.join(w for w, _ in ln), font=flab, fill=WHITE)
                items.append((h, fn, 40))
            elif kind == 'options':
                f = font('Bold', 50)
                rh = 116
                h = rh * len(b[1]) + 24 * (len(b[1]) - 1)

                def fn(y, b=b, f=f, rh=rh):
                    for k, it in enumerate(b[1]):
                        yy = y + k * (rh + 24)
                        d.rounded_rectangle((x0, yy, x1 - 4, yy + rh), 30, fill=NAVY2, outline=YELLOW, width=4)
                        letter, rest = it.split(' ', 1)
                        d.ellipse((x0 + 24, yy + 22, x0 + 96, yy + 94), fill=YELLOW)
                        d.text((x0 + 60, yy + 58), letter, font=f, fill=NAVY, anchor='mm')
                        d.text((x0 + 124, yy + 58), rest.strip(), font=f, fill=WHITE, anchor='lm')
                items.append((h, fn, 40))
            elif kind == 'note':
                f = font('Medium', b[2])
                lines = wrap_balanced(d, b[1], f, width)
                lh = int(b[2] * 1.35)
                h = lh * len(lines)

                def fn(y, lines=lines, f=f, lh=lh):
                    for k, ln in enumerate(lines):
                        d.text((x0, y + k * lh), ' '.join(w for w, _ in ln), font=f, fill=MUTED)
                items.append((h, fn, 30))
        total = sum(h for h, _, _ in items) + sum(g for _, _, g in items[:-1])
        return items, total

    def render(self):
        W, H = self.L['size']
        bg = self.background()
        im = bg.copy()
        d = ImageDraw.Draw(im)
        x0, y0, x1, y1 = self.L['content']
        # header: logo + wordmark (+ counter on the right)
        hy = self.L['header']
        logo = Image.open(LOGO).convert('RGBA').resize((78, 78), Image.LANCZOS)
        im.paste(logo, (x0, hy - 39), logo)
        d.text((x0 + 96, hy), 'Business Santa', font=font('head', 42), fill=WHITE, anchor='lm')
        if self.counter:
            d.text((x1, hy), self.counter, font=font('Bold', 34), fill=YELLOW, anchor='rm')
        # content stack: shrink until it fits, then center vertically
        scale = 1.0
        while True:
            items, total = self._measure(d, scale)
            if total <= (y1 - y0) or scale < 0.55:
                break
            scale -= 0.04
        # short cards grow their text (up to 1.4x) so the card is filled, not half empty
        while scale >= 1.0 and total < 0.8 * (y1 - y0) and scale < 1.4:
            bigger, btotal = self._measure(d, scale + 0.04)
            if btotal > 0.9 * (y1 - y0):
                break
            scale += 0.04; items, total = bigger, btotal
        if total > (y1 - y0):
            raise ValueError(f'content does not fit ({total} > {y1 - y0}); shorten the text')
        self.fill = total / (y1 - y0)
        y = y0 + ((y1 - y0) - total) // 2
        for h, fn, gap in items:
            fn(y)
            y += h + gap
        # footer
        fy = self.L['footer']
        if self.footer and self.footer[0] == 'url':
            f = font('Bold', 38)
            url = self.footer[1]
            while d.textlength(url, font=f) > (x1 - x0) - 80 and f.size > 28:
                f = font('Bold', f.size - 2)
            tw = d.textlength(url, font=f)
            label = self.footer[2]
            if label:
                d.text((x0, fy + 2), label, font=font('SemiBold', 30), fill=SOFT, anchor='lt')
                py = fy + 40
            else:
                py = fy + 10
            d.rounded_rectangle((x0, py, x0 + tw + 56, py + 64), 32, fill=YELLOW)
            d.text((x0 + 28, py + 32), url, font=f, fill=NAVY, anchor='lm')
        elif self.footer and self.footer[0] == 'hint':
            d.text((x1, fy + 40), self.footer[1], font=font('Bold', 38), fill=YELLOW, anchor='rm')
        return im, bg

    def save(self, path):
        im, bg = self.render()
        safezone.check(im, bg, self.fmt, name=os.path.basename(path))
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        im.save(path)
        bg.save(path.replace('.png', '_bg.png'))
        return path, round(self.fill, 2)
