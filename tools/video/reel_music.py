"""Original synthesized tracks for Reels and Shorts (no samples, no licensing issues).
Usage: python3 reel_music.py <seconds> <out.wav> [seed] [style]

Styles (17 Nov 2026, so Reels stop sounding the same):
  upbeat     112-124 bpm four-on-the-floor, chord stabs, arpeggio (the original track)
  pluck      100-108 bpm, plucked marimba-like melody over soft kick and shaker, bright and friendly
  lofi       76-86 bpm, swung soft drums, warm electric-piano chords with a little wobble, calm and confident
  cinematic  90 bpm pulse, low drone, rising eighth-note ostinato and a swell every 4 bars, for proof and reveals
  ambient    no drums: slow pad, low drone and soft bells, for reflection and meditation content
"""
import sys, numpy as np, soundfile as sf

STYLES = ['upbeat', 'pluck', 'lofi', 'cinematic', 'ambient']


def _render(seconds, seed, style):
    sr = 44100; n = int(sr * seconds); out = np.zeros(n); rng = np.random.default_rng(seed)
    note = lambda m: 440 * 2 ** ((m - 69) / 12)
    progs = [[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
             [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],
             [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]],
             [[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 43, 47]]]
    prog = progs[seed % len(progs)]

    def add(start, sig, gain=1.0):
        s = int(start * sr)
        if s >= n or s < 0: return
        e = min(n, s + len(sig)); out[s:e] += gain * sig[:e - s]

    def env(dur, a=0.005, r=6.0):
        t = np.arange(int(dur * sr)) / sr
        return t, np.minimum(1, t / a) * np.exp(-t * r)

    def tone(m, dur, a, r, harm=(1, 0.3), detune=0.0):
        t, e = env(dur, a, r); f = note(m)
        sig = sum(h * np.sin(2 * np.pi * f * (k + 1) * t * (1 + detune)) for k, h in enumerate(harm))
        return sig * e

    if style == 'pluck':
        bpm = 100 + (seed % 3) * 4; beat = 60 / bpm
        for b in range(int(seconds / beat) + 1):
            tb = b * beat; ch = prog[(b // 4) % 4]
            t, e = env(0.25, 0.002, 14); f = 48 + 40 * np.exp(-t * 35); add(tb, np.sin(2 * np.pi * np.cumsum(f) / sr) * e, 0.55)
            for h in (0.5, 0.75):
                t, e = env(0.05, 0.001, 80); add(tb + h * beat, rng.standard_normal(len(t)) * e, 0.07)
            pat = [ch[0] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12]
            for j, m in enumerate(pat[:2] if b % 2 else pat[2:]):
                add(tb + j * beat / 2, tone(m, 0.35, 0.002, 9, (1, 0.5, 0.2)), 0.22)
            if b % 4 == 0:
                for m in ch: add(tb, tone(m - 12, beat * 4, 0.3, 0.6, (1, 0.2)), 0.07)
            add(tb, tone(ch[0] - 24, beat * 0.9, 0.01, 3, (1, 0.4)), 0.25)
    elif style == 'lofi':
        bpm = 76 + (seed % 3) * 5; beat = 60 / bpm
        for b in range(int(seconds / beat) + 1):
            tb = b * beat; ch = prog[(b // 4) % 4]
            if b % 4 in (0, 2) or (b % 4 == 3 and seed % 2):
                t, e = env(0.3, 0.003, 10); f = 45 + 50 * np.exp(-t * 25); add(tb, np.sin(2 * np.pi * np.cumsum(f) / sr) * e, 0.6)
            if b % 4 in (1, 3):
                t, e = env(0.18, 0.002, 18); add(tb, np.convolve(rng.standard_normal(len(t)), np.ones(6) / 6, 'same') * e, 0.25)
            for h in (0, 0.58):  # swung hats
                t, e = env(0.04, 0.001, 90); add(tb + h * beat, rng.standard_normal(len(t)) * e, 0.05)
            if b % 4 == 0:
                for j, m in enumerate(ch + [ch[0] + 12, ch[1] + 12]):
                    add(tb + j * 0.012, tone(m, beat * 4, 0.02, 0.9, (1, 0.25, 0.08), detune=0.002 * np.sin(b)), 0.09)
                add(tb, tone(ch[0] - 24, beat * 3.5, 0.02, 0.8, (1, 0.3)), 0.28)
    elif style == 'cinematic':
        bpm = 90; beat = 60 / bpm
        drone_t = np.arange(n) / sr
        out += 0.10 * (np.sin(2 * np.pi * note(prog[0][0] - 24) * drone_t) + 0.5 * np.sin(2 * np.pi * note(prog[0][0] - 12) * drone_t))
        for b in range(int(seconds / beat) + 1):
            tb = b * beat; ch = prog[(b // 4) % 4]; bar = b // 4
            t, e = env(0.5, 0.002, 6); f = 40 + 30 * np.exp(-t * 20)
            if b % 2 == 0: add(tb, np.sin(2 * np.pi * np.cumsum(f) / sr) * e, 0.7)
            for j in range(2):
                m = [ch[0], ch[2], ch[1] + 12, ch[2]][(b * 2 + j) % 4] + 12
                add(tb + j * beat / 2, tone(m, beat * 0.45, 0.005, 6, (1, 0.6, 0.3)), 0.10 + 0.04 * (b % 4))
            if b % 16 == 12:
                t = np.arange(int(beat * 4 * sr)) / sr; sw = np.sin(np.pi * t / t[-1]) ** 2
                add(tb, sw * rng.standard_normal(len(t)) * 0.12 + sw * np.sin(2 * np.pi * note(ch[2]) * t) * 0.1)
    elif style == 'ambient':
        t_all = np.arange(n) / sr; bar = 6.0
        out += 0.08 * np.sin(2 * np.pi * note(prog[0][0] - 24) * t_all) + 0.05 * np.sin(2 * np.pi * note(prog[0][0] - 17) * t_all)
        for bi in range(int(seconds / bar) + 1):
            ch = prog[bi % 4]
            for m in ch:
                add(bi * bar, tone(m, bar + 2, 1.8, 0.35, (1, 0.15)), 0.08)
            for j in range(3):
                m = ch[(j + bi) % 3] + 24
                add(bi * bar + 0.7 + j * 1.9 + rng.uniform(0, 0.3), tone(m, 3.0, 0.002, 1.6, (1, 0.0, 0.25, 0.0, 0.1)), 0.06)
    else:
        return None
    return out, sr


def track(seconds, path, seed=0, style='upbeat'):
    if style != 'upbeat':
        r = _render(seconds, seed, style)
        if r is not None:
            out, sr = r
            out = np.convolve(out, np.ones(3) / 3, 'same')
            out /= max(1e-9, np.max(np.abs(out))); out = np.tanh(out * 1.3) * 0.55
            out *= min(1.0, 0.10 / max(1e-9, float(np.sqrt((out ** 2).mean()))))  # same loudness for every style
            fade = int(1.2 * sr); out[:int(0.15 * sr)] *= np.linspace(0, 1, int(0.15 * sr)); out[-fade:] *= np.linspace(1, 0, fade)
            sf.write(path, np.stack([out, out], 1).astype(np.float32), sr)
            return
    _upbeat(seconds, path, seed)


def _upbeat(seconds, path, seed=0):
    sr = 44100; n = int(sr * seconds); out = np.zeros(n)
    rng = np.random.default_rng(seed)
    bpm = 112 + (seed % 4) * 4; beat = 60 / bpm
    note = lambda m: 440 * 2 ** ((m - 69) / 12)
    progs = [[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
             [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],
             [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]]]
    prog = progs[seed % len(progs)]
    def add(start, sig):
        s = int(start * sr)
        if s >= n: return
        e = min(n, s + len(sig)); out[s:e] += sig[:e - s]
    def env(dur, a=0.005, r=6.0):
        t = np.arange(int(dur * sr)) / sr
        return t, np.minimum(1, t / a) * np.exp(-t * r)
    nbeats = int(seconds / beat) + 1
    for b in range(nbeats):
        tb = b * beat; bar = b // 4; ch = prog[bar % 4]
        # kick on every beat
        t, e = env(0.35, 0.002, 9); f = 50 + 70 * np.exp(-t * 30)
        add(tb, 0.9 * np.sin(2 * np.pi * np.cumsum(f) / sr) * e)
        # clap on 2 and 4
        if b % 4 in (1, 3):
            t, e = env(0.2, 0.001, 22); add(tb, 0.35 * rng.standard_normal(len(t)) * e)
        # offbeat hats
        t, e = env(0.06, 0.001, 70); add(tb + beat / 2, 0.12 * rng.standard_normal(len(t)) * e)
        # bass on 8ths
        for h in (0, 0.5):
            t, e = env(beat / 2, 0.005, 5); add(tb + h * beat, 0.35 * np.sign(np.sin(2 * np.pi * note(ch[0] - 24) * t)) * e * 0.6)
        # chord stab on the offbeat
        t, e = env(beat * 0.45, 0.004, 7)
        stab = sum(np.sin(2 * np.pi * note(m) * t) + 0.3 * np.sin(2 * np.pi * 2 * note(m) * t) for m in ch) / len(ch)
        add(tb + beat / 2, 0.28 * stab * e)
        # simple lead arpeggio in the second half of each 8 bar phrase
        if (bar % 8) >= 4:
            m = ch[(b % 3)] + 12; t, e = env(beat * 0.5, 0.004, 8)
            add(tb, 0.16 * np.sin(2 * np.pi * note(m) * t) * e)
    out = np.convolve(out, np.ones(3) / 3, 'same')
    out /= max(1e-9, np.max(np.abs(out))); out = np.tanh(out * 1.4) * 0.55
    fade = int(1.0 * sr); out[:int(0.1 * sr)] *= np.linspace(0, 1, int(0.1 * sr)); out[-fade:] *= np.linspace(1, 0, fade)
    sf.write(path, np.stack([out, out], 1).astype(np.float32), sr)

if __name__ == '__main__':
    track(float(sys.argv[1]), sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0, sys.argv[4] if len(sys.argv) > 4 else 'upbeat')
