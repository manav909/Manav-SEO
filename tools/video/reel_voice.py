"""Narration plus background music for a daily Reel or Short.

Usage: python3 tools/video/reel_voice.py lines.txt <seed> [min seconds per scene, comma separated]

lines.txt holds one narration line per scene (written for the ear: "A C", "two thousand nine",
"business santa dot com"). Writes in the current folder:
  durs.json  seconds per scene (render each scene for exactly this long)
  voice.wav  the narration placed at each scene start
  mix.wav    narration on top, original beat underneath (ducked under the voice)
Then mux:  ffmpeg -i video_only.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k -ar 44100 -shortest out.mp4

Variety (17 Nov 2026: "same boring voice, no variety"). Options after the positional arguments:
  --voice NAME       a Kokoro voice (am_michael, af_heart, am_fenrir, af_bella, am_puck, af_nicole ...),
                     or a blend 'am_michael+am_fenrir' (equal mix) or 'af_heart:0.7+af_bella:0.3'. Default: picked
                     from the seed out of VOICES, so consecutive Reels sound different.
  --lang en-us|en-gb|hi   language for the phonemes (hi for Hindi voices hf_alpha, hf_beta, hm_omega, hm_psi)
  --speed 1.08       base speed. The hook (first line) runs 6% faster, the last line (the ask) 6% slower,
                     and lines in between vary a little, so the read has shape instead of one flat pace.
  --beat STYLE       upbeat | pluck | lofi | cinematic | ambient (see reel_music.py). Default from the seed.
Kokoro voices are synthetic and are not any real person.
"""
import os, sys, json, subprocess
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from make import ensure_voice, VOICE_DIR, VOICE

VOICES = ['am_michael', 'af_heart', 'am_fenrir', 'af_bella', 'am_puck', 'af_nicole', 'am_michael+am_fenrir', 'af_heart+af_bella']
BEATS = ['upbeat', 'pluck', 'lofi', 'cinematic']


def voice_style(k, spec):
    """'name', 'a+b' or 'a:0.7+b:0.3' -> a style vector (or the name when it is a single voice)."""
    if '+' not in spec and ':' not in spec:
        return spec
    parts = [p.split(':') for p in spec.split('+')]
    ws = [float(p[1]) if len(p) > 1 else 1.0 for p in parts]; tot = sum(ws)
    return sum(k.get_voice_style(p[0]) * (w / tot) for p, w in zip(parts, ws))


def opts(argv):
    o, pos, i = {}, [], 0
    while i < len(argv):
        if argv[i].startswith('--'):
            o[argv[i][2:]] = argv[i + 1]; i += 2
        else:
            pos.append(argv[i]); i += 1
    return o, pos


def main():
    o, pos = opts(sys.argv[1:])
    lines = [l.strip() for l in open(pos[0], encoding='utf-8') if l.strip()]
    seed = int(pos[1]) if len(pos) > 1 else 0
    mins = [float(x) for x in pos[2].split(',')] if len(pos) > 2 else []
    vname = o.get('voice') or VOICES[seed % len(VOICES)]
    lang = o.get('lang') or ('en-gb' if vname.startswith('b') else 'hi' if vname[:1] == 'h' else 'en-us')
    base = float(o.get('speed', 1.08)); beat = o.get('beat') or BEATS[(seed // len(VOICES) + seed) % len(BEATS)]
    ensure_voice()
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(VOICE_DIR, 'kokoro.onnx'), os.path.join(VOICE_DIR, 'voices.bin'))
    voice = voice_style(k, vname)
    print(f'voice {vname} ({lang}), speed {base}, beat {beat}')
    json.dump({'voice': vname, 'lang': lang, 'speed': base, 'beat': beat}, open('voice_meta.json', 'w'))
    clips, durs, sr = [], [], 24000
    for i, ln in enumerate(lines):
        sp = base * (1.06 if i == 0 else 0.94 if i == len(lines) - 1 else (1.0 + 0.03 * ((i * 7 + seed) % 3 - 1)))
        a, sr = k.create(ln, voice=voice, speed=sp, lang=lang)
        clips.append(a)
        durs.append(round(max(mins[i] if i < len(mins) else 0, len(a) / sr + 0.7), 3))
    json.dump(durs, open('durs.json', 'w'))
    n = int(sum(durs) * sr); voice = np.zeros(n); t0 = 0
    for a, d in zip(clips, durs):
        s = int((t0 + 0.25) * sr); voice[s:s + len(a)] += a[:max(0, n - s)]; t0 += d
    voice = voice / max(1e-9, np.abs(voice).max()) * 0.9
    sf.write('voice.wav', voice.astype(np.float32), sr)
    subprocess.run([sys.executable, os.path.join(HERE, 'reel_music.py'), str(n / sr), 'music.wav', str(seed), beat], check=True)
    m, _ = sf.read('music.wav'); m = m.mean(1)
    m = np.interp(np.linspace(0, len(m) - 1, n), np.arange(len(m)), m)
    env = np.convolve(np.abs(voice), np.ones(int(0.25 * sr)) / (0.25 * sr), 'same')
    env = np.clip(env / (env.max() + 1e-9) * 4, 0, 1)
    mix = voice + m * (0.45 - 0.30 * env)
    mix = mix / np.abs(mix).max() * 0.95
    sf.write('mix.wav', np.stack([mix, mix], 1).astype(np.float32), sr)
    print('scene seconds:', durs, 'total:', round(n / sr, 2))


if __name__ == '__main__':
    main()
