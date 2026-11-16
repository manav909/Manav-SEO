"""Platform safe zones for everything Business Santa publishes, plus an automatic check and mockup previews.

Why: Instagram, Facebook and YouTube draw their own interface (username, "Original audio", captions, buttons,
progress bars) on top of our videos and images. Anything we put under that interface is hidden or looks broken
(15 Nov 2026: our top-left logo sat under Instagram's username and audio line on every Reel).

Rule: every word, number, logo, face and call to action sits inside SAFE for its format. Only background
decoration may extend into the platform zones. Renderers draw decoration into the background image and content
on top; check() compares the two and fails if any content pixel lands outside the safe zone.

Formats (all coordinates in pixels of the file we export):
  vertical  1080x1920  Reels (Instagram, Facebook), YouTube Shorts, Reel covers, LinkedIn vertical video
  story     1080x1920  Instagram and Facebook Stories made as stories (not Reel reshares)
  feed45    1080x1350  Instagram and Facebook feed posts and carousels (profile grid shows a 3:4 center crop)
  feed45cover 1080x1350  first slide of a carousel (Facebook's multi-photo collage crops it to about 2:3)
  yt169     1920x1080  long YouTube episodes (player title bar on top in embeds, controls and captions at the bottom)
  thumb169  1280x720   YouTube thumbnails (time stamp bottom right, watched bar along the bottom)

Usage:
  from safezone import inside, check, mockup
  inside((x0, y0, x1, y1), 'vertical')          -> True or False
  check(frame, background, 'vertical')          -> raises SafeZoneError listing where content leaks
  mockup('frame.png', 'mockup.jpg')             -> side by side preview under each platform's interface
  python3 tools/video/safezone.py frame.png [background.png] [format]   (check and write frame_mockup.jpg)
"""
import sys
from PIL import Image, ImageDraw, ImageChops, ImageFont

SIZES = {'vertical': (1080, 1920), 'story': (1080, 1920), 'feed45': (1080, 1350), 'feed45cover': (1080, 1350), 'yt169': (1920, 1080), 'thumb169': (1280, 720)}

# Where each platform draws its interface on a 1080x1920 vertical video (measured from the apps, Nov 2026,
# with a margin). Used for the mockups and to derive SAFE below.
OVERLAYS = {
    'Instagram Reels': [('top', (0, 0, 1080, 200)), ('right', (948, 1080, 1080, 1760)),
                        ('bottom', (0, 1480, 960, 1800)), ('nav', (0, 1800, 1080, 1920))],
    'Instagram post view': [('userrow', (0, 0, 1080, 160)), ('right', (948, 1080, 1080, 1760)),
                            ('bottom', (0, 1480, 960, 1800)), ('nav', (0, 1800, 1080, 1920))],
    'Facebook Reels': [('top', (0, 0, 1080, 190)), ('right', (948, 1050, 1080, 1700)),
                       ('bottom', (0, 1460, 960, 1820)), ('nav', (0, 1820, 1080, 1920))],
    'YouTube Shorts': [('top', (0, 0, 1080, 170)), ('right', (940, 880, 1080, 1700)),
                       ('bottom', (0, 1440, 940, 1780)), ('nav', (0, 1780, 1080, 1920))],
    'Story': [('top', (0, 0, 1080, 250)), ('bottom', (0, 1700, 1080, 1920))],
}

# Safe rectangles per format: content must fit inside the union of these.
SAFE = {
    # top 300 clears every top bar (Stories 250); bottom 1400 clears captions and usernames (Shorts 1440);
    # below y 840 the right side stops at 912 to clear the like, comment and share buttons (Shorts from 880).
    'vertical': [(72, 300, 1008, 840), (72, 840, 912, 1400)],
    'story': [(72, 270, 1008, 1640)],
    # profile grid shows the center 1012x1350; tag and sound icons sit bottom left
    'feed45': [(72, 60, 1008, 1260)],
    # first slide of a carousel: Facebook's multi-photo collage shows it as a 2:3 center crop (about x 90 to 990),
    # seen on 16 Nov 2026 when "4 things" lost its first word and "1/7" was cut in the Business Suite preview
    'feed45cover': [(100, 60, 980, 1260)],
    'yt169': [(96, 100, 1824, 930)],
    'thumb169': [(48, 40, 1232, 600), (48, 600, 1060, 680)],
}

# Instagram's profile grid shows Reel covers as a 3:4 crop from the center: rows 240 to 1680 of a 1080x1920 cover.
GRID_CROP = (0, 240, 1080, 1680)


class SafeZoneError(Exception):
    pass


def inside(box, fmt='vertical'):
    """True if the box lies inside the safe zone (it may span several safe rectangles)."""
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    if x1 <= x0 or y1 <= y0:
        return True
    for yy in range(y0, y1, 4):  # every row of the box must be covered horizontally by one safe rectangle
        ok = any(r[0] <= x0 and x1 <= r[2] and r[1] <= yy <= r[3] for r in SAFE[fmt])
        if not ok:
            return False
    return any(r[0] <= x0 and x1 <= r[2] and r[1] <= y1 - 1 <= r[3] for r in SAFE[fmt])


def unsafe_mask(fmt):
    w, h = SIZES[fmt]
    m = Image.new('L', (w, h), 255)
    d = ImageDraw.Draw(m)
    for r in SAFE[fmt]:
        d.rectangle((r[0], r[1], r[2] - 1, r[3] - 1), fill=0)
    return m


def leaks(frame, background, fmt='vertical', threshold=48):
    """Return (count, bbox) of content pixels outside the safe zone: pixels that differ from the background."""
    f = frame.convert('RGB'); b = background.convert('RGB')
    if f.size != SIZES[fmt] or b.size != SIZES[fmt]:
        raise SafeZoneError(f'{fmt} files must be {SIZES[fmt]}, got {f.size} and {b.size}')
    diff = ImageChops.difference(f, b).convert('L').point(lambda v: 255 if v > threshold else 0)
    diff = ImageChops.multiply(diff, unsafe_mask(fmt))
    return sum(1 for v in diff.getdata() if v), diff.getbbox()


def check(frame, background, fmt='vertical', name='frame', tolerance=40):
    n, bbox = leaks(frame, background, fmt)
    if n > tolerance:
        raise SafeZoneError(f'{name}: {n} content pixels outside the {fmt} safe zone, around {bbox}. '
                            f'Safe zone: {SAFE[fmt]}')
    return True


def _font(size, bold=True):
    try:
        return ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-%s.otf' % ('Bold' if bold else 'Medium'), size)
    except OSError:
        return ImageFont.load_default()


def _ui(im, platform, debug=False):
    """Draw a realistic stand-in for the platform interface on a 1080x1920 frame."""
    im = im.convert('RGB').copy()
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    W = 1080
    white = (255, 255, 255, 235)
    for kind, (x0, y0, x1, y1) in OVERLAYS[platform]:
        if kind in ('top', 'userrow'):
            for y in range(y0, y1):  # top gradient
                d.line([(0, y), (W, y)], fill=(0, 0, 0, int(150 * (1 - (y - y0) / (y1 - y0)))))
        if kind == 'bottom':
            for y in range(y0 - 120, 1920):
                d.line([(0, y), (W, y)], fill=(0, 0, 0, int(min(170, 170 * (y - y0 + 120) / 260))))
    f1, f2 = _font(40), _font(34, False)
    if platform == 'Instagram post view':
        d.ellipse((24, 22, 130, 128), outline=white, width=5); d.ellipse((36, 34, 118, 116), fill=(230, 230, 230, 255))
        d.text((156, 34), 'businesssanta', font=f1, fill=white); d.text((156, 84), 'businesssanta  Original audio', font=f2, fill=white)
        d.rectangle((960, 60, 1040, 66), fill=white); d.rectangle((980, 84, 1040, 90), fill=white)
    elif platform == 'Story':
        for k in range(3):
            d.rounded_rectangle((24 + k * 347, 28, 24 + k * 347 + 335, 36), 4, fill=white if k == 0 else (255, 255, 255, 110))
        d.ellipse((36, 66, 126, 156), fill=(230, 230, 230, 255)); d.text((146, 92), 'businesssanta  2h', font=f1, fill=white)
        d.rounded_rectangle((36, 1760, 860, 1860), 50, outline=white, width=4); d.text((80, 1790), 'Send message', font=f2, fill=white)
        d.text((900, 1785), '<3', font=f1, fill=white)
    else:
        top_label = {'Instagram Reels': 'Reels', 'Facebook Reels': 'Reels', 'YouTube Shorts': ''}[platform]
        if top_label:
            d.text((48, 70), top_label, font=_font(56), fill=white)
        d.ellipse((960, 74, 1030, 144), outline=white, width=5)
        rx0 = {'Instagram Reels': 960, 'Facebook Reels': 960, 'YouTube Shorts': 955}[platform]
        ry = {'Instagram Reels': 1130, 'Facebook Reels': 1100, 'YouTube Shorts': 930}[platform]
        for k in range(5):
            y = ry + k * 125
            d.ellipse((rx0, y, rx0 + 80, y + 80), outline=white, width=6)
            d.text((rx0 + 40, y + 98), ['12', '3', '', '', ''][k], font=_font(28), fill=white, anchor='mm')
        by = {'Instagram Reels': 1560, 'Facebook Reels': 1540, 'YouTube Shorts': 1500}[platform]
        d.ellipse((40, by, 120, by + 80), fill=(230, 230, 230, 255))
        d.text((140, by + 18), 'businesssanta', font=f1, fill=white)
        d.rounded_rectangle((470, by + 10, 640, by + 70), 16, outline=white, width=3)
        d.text((555, by + 40), 'Subscribe' if 'YouTube' in platform else 'Follow', font=_font(30), fill=white, anchor='mm')
        d.text((40, by + 110), 'Caption line one shows here on top of the', font=f2, fill=white)
        d.text((40, by + 158), 'video, and line two ends with ... more', font=f2, fill=white)
        d.text((40, by + 214), 'businesssanta  Original audio', font=_font(30, False), fill=white)
        d.rectangle((0, 1820, 1080, 1920), fill=(0, 0, 0, 255))
        for k in range(5):
            d.rounded_rectangle((90 + k * 210, 1850, 150 + k * 210, 1890), 10, outline=white, width=4)
    if debug:
        dd = ImageDraw.Draw(ov)
        for r in SAFE['vertical']:
            dd.rectangle(r, outline=(0, 230, 120, 255), width=4)
    im.paste(ov, (0, 0), ov)
    return im


def mockup(frame_path, out_path, debug=False, height=960):
    """Preview a 1080x1920 frame under each platform's interface plus the profile grid crop, side by side."""
    fr = Image.open(frame_path).convert('RGB')
    panels = [(p, _ui(fr, p, debug)) for p in OVERLAYS]
    g = fr.crop(GRID_CROP)
    grid = Image.new('RGB', (1080, 1920), (250, 250, 250)); gd = ImageDraw.Draw(grid)
    tile = g.resize((356, 475))
    for r in range(3):
        for c in range(3):
            x, y = 2 + c * 359, 300 + r * 478
            if r == 0 and c == 0:
                grid.paste(tile, (x, y))
            else:
                gd.rectangle((x, y, x + 355, y + 474), fill=(214, 218, 224))
    gd.text((40, 120), 'Profile grid (3:4 crop)', font=_font(52), fill=(20, 20, 20))
    panels.append(('Instagram grid', grid))
    w = int(1080 * height / 1920); gap = 24
    sheet = Image.new('RGB', (len(panels) * (w + gap) + gap, height + 90), (245, 246, 248))
    sd = ImageDraw.Draw(sheet)
    for k, (name, p) in enumerate(panels):
        x = gap + k * (w + gap)
        sheet.paste(p.resize((w, height)), (x, 70))
        sd.text((x, 22), name, font=_font(30), fill=(20, 24, 32))
    sheet.save(out_path, quality=85)
    return out_path


if __name__ == '__main__':
    fp = sys.argv[1]
    fmt = sys.argv[3] if len(sys.argv) > 3 else 'vertical'
    if len(sys.argv) > 2:
        check(Image.open(fp), Image.open(sys.argv[2]), fmt, fp)
        print('safe zone check passed:', fp)
    if fmt == 'vertical':
        print('mockup:', mockup(fp, fp.rsplit('.', 1)[0] + '_mockup.jpg'))
