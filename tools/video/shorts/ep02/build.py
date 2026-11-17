# Builds this Short with the shared toolkit: narration and beat from make.py, scenes from this folder's render_short.py.
import os, sys, subprocess
sys.path.insert(0, '/home/claude/manav-seo/tools/video'); import make
make.ensure_voice()
lines = open('n.txt').read().strip().split('\n')
make.tts(lines, lambda i: f'a{i}.wav', 1.12)
total = sum(make.wav_len(f'a{i}.wav') + 0.35 for i in range(len(lines)))
make.music(total + 2)
subprocess.run([sys.executable, 'render_short.py'], check=True)
subprocess.run([sys.executable, '/home/claude/manav-seo/tools/video/finalize.py', '--check', 'short1.mp4'], check=True)
