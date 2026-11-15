"""Narration plus background music for a daily Reel or Short.

Usage: python3 tools/video/reel_voice.py lines.txt <seed> [min seconds per scene, comma separated]

lines.txt holds one narration line per scene (written for the ear: "A C", "two thousand nine",
"business santa dot com"). Writes in the current folder:
  durs.json  seconds per scene (render each scene for exactly this long)
  voice.wav  the narration placed at each scene start
  mix.wav    narration on top, original beat underneath (ducked under the voice)
Then mux:  ffmpeg -i video_only.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k -ar 44100 -shortest out.mp4
The voice is Kokoro am_michael, a synthetic voice that is not any real person (same as the episodes).
"""
import os, sys, json, subprocess
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from make import ensure_voice, VOICE_DIR, VOICE


def main():
    lines = [l.strip() for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    mins = [float(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 else []
    ensure_voice()
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(VOICE_DIR, 'kokoro.onnx'), os.path.join(VOICE_DIR, 'voices.bin'))
    clips, durs, sr = [], [], 24000
    for i, ln in enumerate(lines):
        a, sr = k.create(ln, voice=VOICE, speed=1.15, lang='en-us')
        clips.append(a)
        durs.append(round(max(mins[i] if i < len(mins) else 0, len(a) / sr + 0.7), 3))
    json.dump(durs, open('durs.json', 'w'))
    n = int(sum(durs) * sr); voice = np.zeros(n); t0 = 0
    for a, d in zip(clips, durs):
        s = int((t0 + 0.25) * sr); voice[s:s + len(a)] += a[:max(0, n - s)]; t0 += d
    voice = voice / max(1e-9, np.abs(voice).max()) * 0.9
    sf.write('voice.wav', voice.astype(np.float32), sr)
    subprocess.run([sys.executable, os.path.join(HERE, 'reel_music.py'), str(n / sr), 'music.wav', str(seed)], check=True)
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
