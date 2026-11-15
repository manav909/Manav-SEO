"""Original synthesized upbeat track for Reels and Shorts (no samples, no licensing issues).
Usage: python3 reel_music.py <seconds> <out.wav> [seed]"""
import sys, numpy as np, soundfile as sf

def track(seconds, path, seed=0):
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
    track(float(sys.argv[1]), sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
