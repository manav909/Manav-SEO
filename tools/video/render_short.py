import subprocess, wave, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W, H, FPS = 1080, 1920, 30
NAVY = (11, 18, 32); NAVY2 = (24, 36, 62); YEL = (253, 185, 19); WHITE = (255, 255, 255); MUT = (170, 182, 200)
IMG = '/home/claude/manav-seo/sites/businesssanta/assets/img/'
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import safezone
from reel_kit import backdrop, X0, X1_LOW, CAPTION_Y
F = lambda s: ImageFont.truetype(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'bshead.ttf'), s)
I = lambda s, w='ExtraBold': ImageFont.truetype(f'/usr/share/fonts/opentype/inter/Inter-{w}.otf', s)
N = open('n.txt').read().split('\n')
PAD = 0.35
durs = [wave.open(f'a{i}.wav').getnframes() / 24000 + PAD for i in range(len(N))]

def ease(t, a, d=0.35):
    x = max(0.0, min(1.0, (t - a) / d)); return 1 - (1 - x) ** 3
def pop(t, a, d=0.3):  # overshoot scale
    x = max(0.0, min(1.0, (t - a) / d)); return 1 + 0.25 * math.sin(math.pi * x) * (1 - x) if x < 1 else 1.0

logo = Image.open(IMG + 'logo-512.png').convert('RGBA').resize((110, 110), Image.LANCZOS)
mk = Image.new('L', (110, 110), 0); ImageDraw.Draw(mk).ellipse((0, 0, 110, 110), fill=255); logo.putalpha(mk)
manav = Image.open(IMG + 'manav-cut-860.webp').convert('RGBA')

# SAFE ZONE (Manav, 15 Nov 2026): the brand rides on the card tab of reel_kit.backdrop(); every word stays inside
# safezone.SAFE['vertical'] (x 72..1008 above y 840, x 72..912 below, y 300..1400). main() checks the last frame
# of every scene against the background and stops the render if anything leaks under the platforms' buttons.
BG = backdrop()
CX_UP, CX_LOW = W // 2, (X0 + X1_LOW) // 2  # centers above and below y 840

def header(im, d):
    pass  # brand is part of BG (card tab), inside the safe zone

def text_center(d, y, txt, font, fill, scale=1.0, im=None):
    f2 = font if scale == 1.0 else ImageFont.truetype(font.path, int(font.size * scale))
    d.text((CX_UP if y < 760 else CX_LOW, y), txt, font=f2, fill=fill, anchor='mm')

def screen(im, d, img, hl, t, T, top=540):
    sc = Image.open(img).convert('RGB'); bw, bh = X1_LOW - X0, 560
    hx0, hy0, hx1, hy1 = hl; k = ease(t, 0.2, 1.4)
    sw0 = min(sc.width, sc.height * bw / bh); sh0 = sw0 * bh / bw
    sw1 = max((hx1 - hx0) * 1.15, 300); sh1 = sw1 * bh / bw
    sw = sw0 + (sw1 - sw0) * k; shh = sh0 + (sh1 - sh0) * k
    cx = sc.width / 2 + ((hx0 + hx1) / 2 - sc.width / 2) * k; cy = sc.height / 2 + ((hy0 + hy1) / 2 - sc.height / 2) * k
    x0 = max(0, min(sc.width - sw, cx - sw / 2)); y0 = max(0, min(sc.height - shh, cy - shh / 2))
    cr = sc.crop((int(x0), int(y0), int(x0 + sw), int(y0 + shh))).resize((bw, bh), Image.LANCZOS)
    dd = ImageDraw.Draw(cr); sx, sy = bw / sw, bh / shh
    if t > 0.9:
        dd.rounded_rectangle(((hx0 - x0) * sx, (hy0 - y0) * sy, (hx1 - x0) * sx, (hy1 - y0) * sy), 14, outline=YEL, width=8)
    m = Image.new('L', (bw, bh), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, bw, bh), 30, fill=255)
    im.paste(cr, (X0, top), m)
    d.rounded_rectangle((X0 - 4, top - 4, X0 + bw + 4, top + bh + 4), 34, outline=YEL, width=5)

def scene(i, im, d, t, T):
    if i == 0:
        s1 = pop(t, 0.15); s2 = pop(t, 1.6)
        if t > 0.15: text_center(d, 600, '#11', F(290), WHITE, s1)
        if t > 1.0: text_center(d, 790, 'to', I(64, 'SemiBold'), MUT)
        if t > 1.6: text_center(d, 990, '#1', F(360), YEL, s2)
        if t > 2.6: text_center(d, 1190, 'on Google, in about 2 hours', I(48, 'Bold'), WHITE)
    elif i == 1:
        text_center(d, 480, 'Same search, same morning', F(60), WHITE)
        screen(im, d, 'google.jpg', (48, 279, 332, 382), t, T)
        if t > T * 0.35:
            y = 1120 + int((1 - ease(t, T * 0.35)) * 40)
            d.rounded_rectangle((X0, y, 500, y + 130), 30, fill=(40, 52, 78)); d.text((308, y + 40), '5 am', font=I(36, 'SemiBold'), fill=MUT, anchor='mm'); d.text((308, y + 92), '#11  Closed', font=F(46), fill=(240, 120, 120), anchor='mm')
        if t > T * 0.6:
            y = 1120 + int((1 - ease(t, T * 0.6)) * 40)
            d.rounded_rectangle((520, y, X1_LOW, y + 130), 30, fill=YEL); d.text(((520 + X1_LOW) // 2, y + 40), '7:15 am', font=I(36, 'SemiBold'), fill=NAVY, anchor='mm'); d.text(((520 + X1_LOW) // 2, y + 92), '#1  Open', font=F(46), fill=NAVY, anchor='mm')
    elif i == 2:
        text_center(d, 480, 'Then we asked ChatGPT', F(64), WHITE)
        screen(im, d, 'chatgpt.jpg', (240, 218, 722, 330), t, T)
        if t > T * 0.5:
            y = 1120 + int((1 - ease(t, T * 0.5)) * 40); sc = pop(t, T * 0.5)
            d.rounded_rectangle((X0, y, X1_LOW, y + 130), 65, fill=YEL)
            text_center(d, y + 65, "It skipped Google's top 3", F(54), NAVY, sc)
    elif i == 3:
        text_center(d, 500, 'Do this now', F(86), YEL)
        for k, (a, b) in enumerate([('1', 'Keep your hours right on Google'), ('2', 'Get listed on the sites ChatGPT reads')]):
            a0 = 0.3 + k * T * 0.4
            if t < a0: continue
            y = 610 + k * 280 + int((1 - ease(t, a0)) * 60)
            d.rounded_rectangle((X0, y, X1_LOW, y + 240), 36, fill=(40, 52, 78))
            d.ellipse((X0 + 30, y + 70, X0 + 130, y + 170), fill=YEL); d.text((X0 + 80, y + 120), a, font=F(60), fill=NAVY, anchor='mm')
            words = b.split(); l1 = ' '.join(words[:len(words) // 2 + 1]); l2 = ' '.join(words[len(words) // 2 + 1:])
            d.text((X0 + 160, y + 85), l1, font=I(46, 'Bold'), fill=WHITE, anchor='lm'); d.text((X0 + 160, y + 155), l2, font=I(46, 'Bold'), fill=WHITE, anchor='lm')
    else:
        m = manav.copy(); m.thumbnail((440, 540))
        im.paste(m, (CX_UP - m.width // 2, 450 + int((1 - ease(t, 0.1)) * 60)), m)
        d.rounded_rectangle((X0, 1020, X1_LOW, 1140), 60, fill=YEL); text_center(d, 1080, 'Full breakdown on our channel', F(50), NAVY, pop(t, 0.2))
        text_center(d, 1200, 'Comment your trade + city', I(50, 'Bold'), WHITE)

def captions(i, im, d, t, T):
    words = N[i].split(); total = sum(len(w) + 1 for w in words); tt = T - PAD; acc = 0
    times = []
    for w in words:
        times.append((acc / total * tt, (acc + len(w) + 1) / total * tt, w)); acc += len(w) + 1
    cur = [j for j, (a, b, w) in enumerate(times) if a <= t < b]
    if not cur: return
    j = cur[0]; g0 = (j // 3) * 3; grp = times[g0:g0 + 3]
    size = 70; gap = 20
    while size > 40 and sum(d.textlength(w.upper(), font=F(size)) for _, _, w in grp) + gap * (len(grp) - 1) > X1_LOW - X0 - 20:
        size -= 4
    font = F(size)
    widths = [d.textlength(w.upper(), font=font) for _, _, w in grp]; x = CX_LOW - (sum(widths) + gap * (len(grp) - 1)) / 2
    y = CAPTION_Y
    for k, (a, b, w) in enumerate(grp):
        on = (g0 + k) == j
        f = ImageFont.truetype(font.path, int(size * min(1.08, pop(t, a, 0.2)))) if on else font
        d.text((x + widths[k] / 2, y), w.upper(), font=f, fill=YEL if on else WHITE, anchor='mm', stroke_width=6, stroke_fill=(0, 0, 0))
        x += widths[k] + gap

def main():
    with open('alist.txt', 'w') as f:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', str(PAD), 'pad.wav'], check=True)
        for i in range(len(N)): f.write(f"file 'a{i}.wav'\nfile 'pad.wav'\n")
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'alist.txt', 'voice_only.wav'], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'voice_only.wav', '-i', 'music.wav', '-filter_complex', '[1:a]volume=1.4[m];[0:a][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95', 'voice.wav'], check=True)
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', 'voice.wav',
                          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', 'short1.mp4'], stdin=subprocess.PIPE)
    for i, T in enumerate(durs):
        for fi in range(int(round(T * FPS))):
            t = fi / FPS
            im = BG.copy(); d = ImageDraw.Draw(im); header(im, d)
            scene(i, im, d, t, T); captions(i, im, d, t, T)
            if t < 0.15 and i > 0:  # quick flash transition
                im = Image.blend(im, Image.new('RGB', (W, H), YEL), 0.35 * (1 - t / 0.15))
            if fi == int(round(T * FPS)) - 1:  # last frame of the scene: nothing may sit under platform buttons
                safezone.check(im, BG, 'vertical', f'short scene {i}')
            p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()
main()
