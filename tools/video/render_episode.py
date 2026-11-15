import sys, re, subprocess, wave, os
sys.path.insert(0, '.')
import script as _sc
SCENES = _sc.SCENES
EP = getattr(_sc, 'EP', 1)
CHECKED = getattr(_sc, 'CHECKED', '')
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import safezone
LEAKS = []

W, H, FPS = 1920, 1080, 30
NAVY = (11, 18, 32); NAVY2 = (20, 30, 52); YEL = (253, 185, 19); WHITE = (255, 255, 255); MUT = (160, 172, 192)
IMG = '/home/claude/manav-seo/sites/businesssanta/assets/img/'
HEAD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'bshead.ttf')
INTER = '/usr/share/fonts/opentype/inter/Inter-%s.otf'

def F(size, kind='head'):
    if kind == 'head': return ImageFont.truetype(HEAD, size)
    return ImageFont.truetype(INTER % kind, size)

logo = Image.open(IMG + 'logo-512.png').convert('RGBA')
def circ(im, d):
    im = im.resize((d, d), Image.LANCZOS)
    m = Image.new('L', (d, d), 0); ImageDraw.Draw(m).ellipse((0, 0, d, d), fill=255)
    im.putalpha(m); return im
logo_s = circ(logo, 72); logo_b = circ(logo, 200)
manav = Image.open(IMG + 'manav-cut-860.webp').convert('RGBA')

def dur(i):
    with wave.open(f'a{i:02d}.wav') as w: return w.getnframes() / w.getframerate()

def wrap(d, text, font, maxw):
    words, lines, cur = text.split(), [], ''
    for wd in words:
        t = (cur + ' ' + wd).strip()
        if d.textlength(t, font=font) <= maxw: cur = t
        else: lines.append(cur); cur = wd
    if cur: lines.append(cur)
    return lines

def base(header=True):
    im = Image.new('RGB', (W, H), NAVY)
    d = ImageDraw.Draw(im)
    for y in range(H):  # soft vertical gradient
        c = tuple(int(NAVY[k] + (NAVY2[k] - NAVY[k]) * y / H) for k in range(3))
        d.line([(0, y), (W, y)], fill=c)
    if not header:
        return im
    # SAFE ZONE (15 Nov 2026): YouTube's title bar covers the top ~100 px in embeds and when paused, so the brand
    # header starts at y 100 (safezone.SAFE['yt169']).
    im.paste(logo_s, (96, 100), logo_s)
    d.text((184, 106), 'Business Santa', font=F(34), fill=WHITE)
    d.text((184, 146), 'powered by SEO Season', font=F(20, 'SemiBold'), fill=YEL)
    d.text((W - 96, 122), f'LOCAL VISIBILITY CHECK  |  EP {EP}', font=F(20, 'Bold'), fill=MUT, anchor='ra')
    return im

PLAIN = None

def ease(t, a, dur=0.45):
    x = max(0.0, min(1.0, (t - a) / dur)); return 1 - (1 - x) ** 3

def hook(d, im, s, t, T):
    p1 = ease(t, 0.2); p2 = ease(t, 1.6); p3 = ease(t, T * 0.55)
    if p1 > 0:
        d.text((W // 2 - 330, 420 + int((1 - p1) * 60)), s['a'][0], font=F(260), fill=WHITE, anchor='mm')
    if p2 > 0:
        d.text((W // 2, 420), '>', font=F(160), fill=MUT, anchor='mm')
        d.text((W // 2 + 330, 420 + int((1 - p2) * 60)), s['a'][1], font=F(300), fill=YEL, anchor='mm')
        d.text((W // 2, 600), 'on Google, in about 2 hours', font=F(48, 'SemiBold'), fill=MUT, anchor='mm')
    if p3 > 0:
        y = 760 + int((1 - p3) * 50)
        d.rounded_rectangle((W // 2 - 620, y - 60, W // 2 + 620, y + 60), 60, fill=YEL)
        d.text((W // 2, y), s['b'], font=F(56), fill=NAVY, anchor='mm')

def title(d, im, s, t):
    d.text((W // 2, 300), s['tag'], font=F(30, 'Bold'), fill=YEL, anchor='mm')
    d.text((W // 2, 450), s['big'], font=F(118), fill=WHITE, anchor='mm')
    d.text((W // 2, 570), s['sub'], font=F(54, 'SemiBold'), fill=MUT, anchor='mm')
    d.rounded_rectangle((W // 2 - 260, 660, W // 2 + 260, 668), 4, fill=YEL)

def heading(d, txt):
    d.text((120, 190), txt, font=F(64), fill=WHITE)
    d.rounded_rectangle((120, 278, 300, 286), 4, fill=YEL)

def shot(d, im, s, t, T):
    sc = Image.open(s['img']).convert('RGB')
    boxw, boxh = 1300, 700
    hx0, hy0, hx1, hy1 = s['hl']
    k = ease(t, T * 0.35, 1.6)
    # source window: from the whole screenshot to a window around the highlight (aspect boxw:boxh)
    sw0, sh0 = sc.width, sc.width * boxh / boxw
    cxh, cyh = (hx0 + hx1) / 2, (hy0 + hy1) / 2
    sw1 = min(max((hx1 - hx0) * 1.6, 360), sc.width * 0.8, sc.height * 0.95 * boxw / boxh); sh1 = sw1 * boxh / boxw
    sw = sw0 + (sw1 - sw0) * k; shh = sh0 + (sh1 - sh0) * k
    cx = (sw0 / 2) + (cxh - sw0 / 2) * k; cy = (sh0 / 2) + (cyh - sh0 / 2) * k
    x0s = max(0, min(sc.width - sw, cx - sw / 2)); y0s = max(0, min(sc.height - shh, cy - shh / 2))
    crop = sc.crop((int(x0s), int(y0s), int(x0s + sw), int(y0s + shh))).resize((boxw, boxh), Image.LANCZOS)
    if t > T * 0.25:
        dd = ImageDraw.Draw(crop); sx = boxw / sw; sy = boxh / shh
        dd.rounded_rectangle(((hx0 - x0s) * sx, (hy0 - y0s) * sy, (hx1 - x0s) * sx, (hy1 - y0s) * sy), 10, outline=YEL, width=6)
    x0, y0 = (W - boxw) // 2, 150
    sh = Image.new('RGBA', (boxw + 40, crop.height + 40), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((20, 20, boxw + 20, crop.height + 20), 18, fill=(0, 0, 0, 140))
    sh = sh.filter(ImageFilter.GaussianBlur(14)); im.paste(sh, (x0 - 20, y0 - 10), sh)
    m = Image.new('L', crop.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, crop.width, crop.height), 18, fill=255)
    im.paste(crop, (x0, y0), m)
    d.rounded_rectangle((x0 - 3, y0 - 3, x0 + boxw + 3, y0 + crop.height + 3), 20, outline=YEL, width=3)
    d.text((W // 2, y0 + crop.height + 22), s['cap'], font=F(24, 'SemiBold'), fill=MUT, anchor='mt')

def listing(d, im, s, t, T):
    heading(d, s['title'])
    n = len(s['rows']); rh = 150 if n <= 3 else 100
    for k, row in enumerate(s['rows']):
        a0 = 0.6 + k * (T * 0.7 / n)
        if t < a0: continue
        y = 330 + k * (rh + 14) + int((1 - ease(t, a0)) * 50)
        d.rounded_rectangle((120, y, W - 120, y + rh), 18, fill=(28, 40, 66))
        d.ellipse((150, y + rh // 2 - 34, 218, y + rh // 2 + 34), fill=YEL)
        d.text((184, y + rh // 2), row[0], font=F(40), fill=NAVY, anchor='mm')
        d.text((250, y + rh // 2), row[1], font=F(46 if n <= 3 else 40, 'Bold'), fill=WHITE, anchor='lm')
        right = row[2] + ('   ' + row[3] if row[3] else '')
        d.text((W - 160, y + rh // 2), right, font=F(38 if n <= 3 else 34, 'SemiBold'), fill=YEL if 'not' not in row[2] else MUT, anchor='rm')

def compare(d, im, s, t, T):
    heading(d, s['title'])
    d.text((120, 320), s['who'], font=F(40, 'SemiBold'), fill=MUT)
    for k, (a, b, c) in enumerate([s['left'], s['right']]):
        a0 = 0.5 + k * T * 0.45
        if t < a0: continue
        x = 120 + k * 860 + int((1 - ease(t, a0)) * 80)
        d.rounded_rectangle((x, 400, x + 800, 860), 26, fill=(28, 40, 66), outline=YEL if k else (60, 74, 100), width=4)
        d.text((x + 400, 470), a, font=F(46, 'SemiBold'), fill=MUT, anchor='mm')
        d.text((x + 400, 630), b, font=F(200), fill=YEL if k else WHITE, anchor='mm')
        d.text((x + 400, 790), c, font=F(46, 'Bold'), fill=(120, 220, 140) if k else (240, 120, 120), anchor='mm')

def compare2(d, im, s, t, T):
    heading(d, s['title'])
    for k, (a, b, c) in enumerate([s['left'], s['right']]):
        a0 = 0.5 + k * T * 0.3
        if t < a0: continue
        x = 120 + k * 860 + int((1 - ease(t, a0)) * 80)
        d.rounded_rectangle((x, 340, x + 800, 860), 26, fill=(28, 40, 66))
        d.text((x + 400, 420), a, font=F(48, 'Bold'), fill=WHITE, anchor='mm')
        d.text((x + 400, 560), b, font=F(84), fill=MUT, anchor='mm')
        d.text((x + 400, 680), 'ranked', font=F(36, 'SemiBold'), fill=MUT, anchor='mm')
        d.text((x + 400, 780), c, font=F(130), fill=YEL, anchor='mm')

def three(d, im, s, t, T):
    heading(d, s['title'])
    for k, (a, b) in enumerate(s['items']):
        a0 = 0.5 + k * T * 0.28
        if t < a0: continue
        x = 120 + k * 573
        d_off = int((1 - ease(t, a0)) * 50)
        x = x
        d.rounded_rectangle((x, 340, x + 533, 780), 26, fill=(28, 40, 66), outline=YEL if k == 2 else (60, 74, 100), width=3)
        d.text((x + 266, 430), str(k + 1), font=F(90), fill=YEL, anchor='mm')
        d.text((x + 266, 540), a, font=F(54), fill=WHITE, anchor='mm')
        for j, ln in enumerate(wrap(d, b, F(34, 'Regular'), 440)):
            d.text((x + 266, 620 + j * 46), ln, font=F(34, 'Regular'), fill=MUT, anchor='mm')
    d.text((W // 2, 820), s['cap'], font=F(26, 'SemiBold'), fill=MUT, anchor='mt')

def quote(d, im, s, t, T):
    heading(d, s['title'])
    for k, ln in enumerate(s['lines']):
        a0 = 0.6 + k * T * 0.28
        if t < a0: continue
        y = 350 + k * 150 + int((1 - ease(t, a0)) * 50)
        d.rounded_rectangle((120, y, W - 120, y + 120), 18, fill=(28, 40, 66))
        d.rounded_rectangle((120, y, 134, y + 120), 7, fill=YEL)
        d.text((180, y + 60), ln, font=F(46, 'SemiBold'), fill=WHITE, anchor='lm')

def fixes(d, im, s, t, T):
    heading(d, s['title'])
    for k, ln in enumerate(s['items']):
        a0 = 1.5 + k * T * 0.26
        if t < a0: continue
        y = 330 + k * 170 + int((1 - ease(t, a0)) * 50)
        d.rounded_rectangle((120, y, W - 120, y + 150), 18, fill=(28, 40, 66))
        d.ellipse((150, y + 41, 218, y + 109), fill=YEL)
        d.text((184, y + 75), str(k + 1), font=F(40), fill=NAVY, anchor='mm')
        ls = wrap(d, ln, F(40, 'SemiBold'), W - 420)
        for j, l in enumerate(ls):
            d.text((250, y + 75 + (j - (len(ls) - 1) / 2) * 50), l, font=F(40, 'SemiBold'), fill=WHITE, anchor='lm')

def cta(d, im, s, t, T):
    heading(d, s['title'])
    d.rounded_rectangle((120, 340, 1180, 800), 26, fill=(28, 40, 66))
    for j, (a, b) in enumerate([('12', 'yes or no questions'), ('100', 'point score'), ('Your fixes', 'in order, on the page')]):
        d.text((180, 420 + j * 120), a, font=F(70), fill=YEL, anchor='lm')
        d.text((180 + d.textlength(a, font=F(70)) + 30, 420 + j * 120), b, font=F(42, 'SemiBold'), fill=WHITE, anchor='lm')
    d.rounded_rectangle((120, 820, 1180, 916), 48, fill=YEL)
    d.text((650, 868), s['url'], font=F(44), fill=NAVY, anchor='mm')
    m = manav.copy(); m.thumbnail((520, 600))  # whole photo inside the safe zone (above YouTube's controls)
    im.paste(m, (1300, 924 - m.height), m)

def end(d, im, s, t, T):
    im.paste(logo_b, (W // 2 - 100, 220), logo_b)
    d.text((W // 2, 500), 'Business Santa', font=F(96), fill=WHITE, anchor='mm')
    d.text((W // 2, 590), 'powered by SEO Season', font=F(44, 'SemiBold'), fill=YEL, anchor='mm')
    d.text((W // 2, 700), 'Comment your trade and city for a future episode', font=F(40, 'SemiBold'), fill=MUT, anchor='mm')
    d.text((W // 2, 780), 'businesssanta.com   |   seoseason.com', font=F(36, 'Bold'), fill=WHITE, anchor='mm')
    d.text((W // 2, 990), f'All results checked by hand on Google and ChatGPT, {CHECKED}.', font=F(24, 'Regular'), fill=MUT, anchor='mm')

DRAW = dict(hook=hook, title=title, shot=shot, list=listing, compare=compare, compare2=compare2, three=three, quote=quote, fixes=fixes, cta=cta, end=end)

def captions(text, T):
    for a,b in [('T X','TX'),('A B C','ABC'),('Contractors Ranked','ContractorsRanked'),('business santa dot com','businesssanta.com'),('O and M','O & M'),('seven hundred eighty seven','787'),('four hundred forty one','441'),('sixty three','63'),('eighteen thousand','18,000'),('four point nine','4.9'),('four point eight','4.8'),('seven fifteen in the morning','7:15 in the morning'),('one hundred','100'),('number eleven','number 11'),('number seven','number 7'),('number eight','number 8')]:
        text=text.replace(a,b)
    sents = re.split(r'(?<=[.?!])\s+', text.strip())
    tot = sum(len(x) for x in sents); out = []; t0 = 0
    for x in sents:
        dt = T * len(x) / tot; out.append((t0, t0 + dt, x)); t0 += dt
    return out

def main():
    global PLAIN
    PLAIN = base(header=False)
    PAD = 0.6
    durs = [dur(i) + PAD for i in range(len(SCENES))]
    # audio: concat each clip followed by PAD silence
    with open('alist.txt', 'w') as f:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', str(PAD), 'pad.wav'], check=True)
        for i in range(len(SCENES)): f.write(f"file 'a{i:02d}.wav'\nfile 'pad.wav'\n")
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'alist.txt', '-c:a', 'pcm_s16le', 'voice_only.wav'], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'voice_only.wav', '-i', 'music.wav', '-filter_complex', '[1:a]volume=1.0[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95', 'voice.wav'], check=True)
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-i', 'voice.wav', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
                          '-c:a', 'aac', '-b:a', '160k', '-shortest', f'episode{EP}.mp4'], stdin=subprocess.PIPE)
    capf = F(34, 'SemiBold')
    for i, s in enumerate(SCENES):
        T = durs[i]; caps = captions(s['n'], T - PAD)
        static = base(); ds = ImageDraw.Draw(static)
        animated = True
        nframes = int(round(T * FPS)); last_key = None; last = None
        for fi in range(nframes):
            t = fi / FPS
            key = None if animated else ((sum(1 for c in caps if c[0] <= t), int(t * 4)) if t >= 0.35 else fi)
            if animated or key != last_key:
                im = static.copy(); d = ImageDraw.Draw(im)
                DRAW[s['kind']](d, im, s, t, T) if s['kind'] not in ('title',) else title(d, im, s, t)
                if fi == nframes - 1:  # safe zone report for the last frame of each scene (captions excluded)
                    try:
                        safezone.check(im, PLAIN, 'yt169', f'scene {i} ({s["kind"]})', tolerance=4000)
                    except safezone.SafeZoneError as e:
                        LEAKS.append(str(e))
                cur = [c for c in caps if c[0] <= t < c[1]]
                if cur and s['kind'] not in ('title', 'end', 'hook'):
                    ls = wrap(d, cur[0][2], capf, 1500)[:2]
                    bh = 20 + 46 * len(ls)
                    d.rounded_rectangle((W // 2 - 790, H - 40 - bh, W // 2 + 790, H - 40), 16, fill=(0, 0, 0))
                    for j, l in enumerate(ls):
                        d.text((W // 2, H - 40 - bh + 10 + j * 46), l, font=capf, fill=WHITE, anchor='mt')
                if t < 0.35:
                    im = Image.blend(Image.new('RGB', (W, H), NAVY), im, t / 0.35)
                last = im.tobytes(); last_key = key
            p.stdin.write(last)
        print('scene', i, 'done', flush=True)
    p.stdin.close(); p.wait()
    if LEAKS:
        open('safezone_report.txt', 'w').write('\n'.join(LEAKS) + '\n')
        print('SAFE ZONE: content near the YouTube title bar or controls, see safezone_report.txt:\n' + '\n'.join(LEAKS))

main()
