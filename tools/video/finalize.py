"""Put the sound on a finished video and refuse to hand over anything silent.

Manav, 16 Nov 2026: "I need voiceover and background music, or somewhere variations, but mute posts
doesn't make sense". The 14 Nov Chicago Reel and the 15 Nov 7:19 pm Denver HVAC Reel went out with a
silent audio track. An ffprobe check ("has an audio stream") passed on them, so this script measures
the loudness instead.

Usage:
  python3 tools/video/finalize.py video_only.mp4 mix.wav out.mp4   mux the sound, then check out.mp4
  python3 tools/video/finalize.py --check out.mp4                  only check a finished file

mix.wav comes from reel_voice.py (narration over our original beat). If the voice cannot be made,
make a beat with reel_music.py and pass that instead: a variation is fine, silence never is.
Exits with an error (and prints SILENT) when the file has no audio stream, or the sound is too quiet
(mean volume under -30 dB or peak under -12 dB), or the sound is much shorter than the picture.
Never upload a file this script rejected.
"""
import re, subprocess, sys


def probe(path, what):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', what, '-show_entries', 'format=duration:stream=duration,codec_type',
                          '-of', 'default=nw=1', path], capture_output=True, text=True).stdout
    return out


def check(path):
    has_audio = 'codec_type=audio' in probe(path, 'a')
    if not has_audio:
        sys.exit(f'SILENT: {path} has no audio stream. Mux mix.wav before uploading.')
    vol = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    mean = float(re.search(r'mean_volume: (-?[\d.]+|-inf) dB', vol).group(1).replace('-inf', '-200'))
    peak = float(re.search(r'max_volume: (-?[\d.]+|-inf) dB', vol).group(1).replace('-inf', '-200'))
    durs = [float(x) for x in re.findall(r'duration=([\d.]+)', probe(path, 'a') + probe(path, 'v'))]
    a_len = float(re.findall(r'duration=([\d.]+)', probe(path, 'a'))[0]) if re.findall(r'duration=([\d.]+)', probe(path, 'a')) else 0
    total = max(durs) if durs else 0
    print(f'{path}: audio mean {mean} dB, peak {peak} dB, audio {a_len:.1f}s of {total:.1f}s')
    if mean < -30 or peak < -12:
        sys.exit(f'SILENT: {path} is too quiet to count as sound (needs mean above -30 dB and peak above -12 dB).')
    if total and a_len < total - 1.5:
        sys.exit(f'SILENT: the sound stops {total - a_len:.1f}s before the picture ends.')
    print('SOUND OK')


if __name__ == '__main__':
    if sys.argv[1] == '--check':
        check(sys.argv[2])
    else:
        video, mix, out = sys.argv[1:4]
        import os
        if not os.path.exists(mix):
            sys.exit(f'SILENT: {mix} does not exist. Run reel_voice.py (or reel_music.py for a beat) first; pip install kokoro-onnx soundfile numpy --break-system-packages if it fails.')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-shortest', out], check=True)
        check(out)
