"""Build a Business Santa video from a folder.

Long episode:  python3 tools/video/make.py episode tools/video/episodes/ep02-roofers-phoenix
Vertical Short: python3 tools/video/make.py short tools/video/shorts/ep02

The folder holds script.py (episode) or n.txt (short, one narration line per scene)
plus its screenshots. Voice model files are downloaded once into ~/.cache/bs-voice.
"""
import os, sys, subprocess, wave, glob
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE_DIR = os.path.expanduser('~/.cache/bs-voice')
REL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
VOICE = 'am_michael'

def ensure_voice():
    os.makedirs(VOICE_DIR, exist_ok=True)
    for name, url in [('kokoro.onnx', REL + 'kokoro-v1.0.int8.onnx'), ('voices.bin', REL + 'voices-v1.0.bin')]:
        p = os.path.join(VOICE_DIR, name)
        if not os.path.exists(p):
            subprocess.run(['curl', '-sSL', '-o', p, url], check=True)

def tts(lines, prefix, speed):
    from kokoro_onnx import Kokoro
    import soundfile as sf
    k = Kokoro(os.path.join(VOICE_DIR, 'kokoro.onnx'), os.path.join(VOICE_DIR, 'voices.bin'))
    for i, line in enumerate(lines):
        a, sr = k.create(line, voice=VOICE, speed=speed, lang='en-us')
        sf.write(prefix(i), a, sr)

def music(seconds, path='music.wav'):
    # Original synthesized pad and soft pulse: no licensing issues.
    import soundfile as sf
    sr = 24000; t = np.arange(int(sr * seconds)) / sr; out = np.zeros_like(t)
    note = lambda m: 440 * 2 ** ((m - 69) / 12)
    prog = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]]
    bar = 4.0
    for bi in range(int(seconds / bar) + 1):
        ch = prog[bi % 4]; s0 = int(bi * bar * sr); s1 = min(len(t), int((bi + 1) * bar * sr) + int(0.5 * sr))
        if s0 >= len(t): break
        tt = t[s0:s1] - bi * bar; env = np.minimum(1, tt / 0.8) * np.exp(-np.maximum(0, tt - bar) * 3)
        for m in ch:
            f = note(m); out[s0:s1] += env * (0.6 * np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt + 0.3)) / len(ch)
        for b in range(4):
            k0 = s0 + int(b * sr); k1 = min(len(t), k0 + int(0.25 * sr))
            if k0 >= len(t): break
            kt = t[k0:k1] - t[k0]; out[k0:k1] += 0.35 * np.sin(2 * np.pi * 55 * kt) * np.exp(-kt * 18)
    out = np.convolve(out, np.ones(12) / 12, 'same'); out /= max(1e-9, np.max(np.abs(out))); out *= 0.11
    fade = int(2 * sr); out[:fade] *= np.linspace(0, 1, fade); out[-fade:] *= np.linspace(1, 0, fade)
    sf.write(path, out.astype(np.float32), sr)

def wav_len(p):
    with wave.open(p) as w: return w.getnframes() / w.getframerate()

def main():
    kind, folder = sys.argv[1], sys.argv[2]
    os.chdir(folder); ensure_voice()
    if kind == 'episode':
        sys.path.insert(0, '.'); import script
        tts([s['n'] for s in script.SCENES], lambda i: f'a{i:02d}.wav', 1.07)
        total = sum(wav_len(p) + 0.6 for p in sorted(glob.glob('a[0-9][0-9].wav')))
        music(total + 2)
        subprocess.run([sys.executable, os.path.join(HERE, 'render_episode.py')], check=True)
    else:
        lines = open('n.txt').read().strip().split('\n')
        tts(lines, lambda i: f'a{i}.wav', 1.12)
        total = sum(wav_len(f'a{i}.wav') + 0.35 for i in range(len(lines)))
        music(total + 2)
        subprocess.run([sys.executable, os.path.join(HERE, 'render_short.py')], check=True)

if __name__ == '__main__':
    main()
