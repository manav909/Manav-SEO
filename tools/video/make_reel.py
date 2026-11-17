"""Build a finished Reel / Short from one JSON spec, with the QA gate built in.

    python3 tools/video/make_reel.py spec.json out_dir

spec.json:
{
  "brand": "brand_businesssanta",            # module name of the brand file next to this script
  "english": false,                          # use the brand's English display fonts (brands that have english())
  "series": "chatgpt",                       # a key of brand['series'] (badge, palettes, voice, cover)
  "voice": "af_heart", "lang": "en-us", "speed": 1.06, "beat": "lofi", "seed": 12,   # from media_plan.next_post
  "scenes": [ {"f": "poster", "pal": "navy", "lines": ["..."], "kicker": "...", "n": "narration for this scene"}, ... ],
  "cover": {"lines": ["..."], "sub": "...", "pal": "yellow"}
}
Writes: final.mp4 (sound checked), cover.jpg, sheet.jpg (all scenes, for the log), qa.json.
Fails loudly (non-zero exit) when a scene breaks the safe zone, a font lacks a glyph, a screenshot is too small with
no lens, the sound is silent, or two neighbouring scenes share a palette. Never publish a Reel this script rejected.
"""
import os, sys, json, subprocess, importlib

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import reel_studio as R


def main():
    spec = json.load(open(sys.argv[1], encoding='utf-8')); out = os.path.abspath(sys.argv[2]); os.makedirs(out, exist_ok=True)
    bm = importlib.import_module(spec['brand']); brand = bm.english() if spec.get('english') else bm.BRAND
    scenes = [dict(s) for s in spec['scenes']]
    lines = [s.pop('n') for s in scenes]
    qa = {'problems': [], 'notes': []}
    pals = [s.get('pal') for s in scenes]
    for a, b in zip(pals, pals[1:]):
        if a == b:
            qa['problems'].append(f'two scenes in a row use the palette {a}')
    frames = R.build(brand, scenes, series=spec.get('series'))
    for f in frames:
        qa['notes'] += f.notes
    if any('no lens' in n for n in qa['notes']):
        qa['problems'].append('a screenshot is too small to read and has no lens')
    if qa['problems']:
        json.dump(qa, open(os.path.join(out, 'qa.json'), 'w'), indent=1, ensure_ascii=False)
        sys.exit('QA FAILED: ' + '; '.join(qa['problems']))
    R.contact_sheet(frames, os.path.join(out, 'sheet.jpg'), cols=min(4, len(frames)), w=300)
    c = spec.get('cover')
    if c:
        R.cover(brand, c['lines'], c.get('sub'), pal=c.get('pal', pals[0])).image().save(os.path.join(out, 'cover.jpg'), quality=92)
    os.chdir(out)
    open('n.txt', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    cmd = [sys.executable, os.path.join(HERE, 'reel_voice.py'), 'n.txt', str(spec.get('seed', 0))]
    for k in ('voice', 'lang', 'speed', 'beat'):
        if spec.get(k):
            cmd += ['--' + k, str(spec[k])]
    subprocess.run(cmd, check=True)
    durs = json.load(open('durs.json'))
    if durs[0] > 5.5 or not 15 <= sum(durs) <= 45:
        qa['problems'].append(f'timing: hook scene {durs[0]:.1f}s (max 5.5), total {sum(durs):.1f}s (15 to 45); shorten the lines')
        json.dump(qa, open('qa.json', 'w'), indent=1, ensure_ascii=False)
        sys.exit('QA FAILED: ' + qa['problems'][-1])
    R.render(frames, durs, 'video_only.mp4')
    subprocess.run([sys.executable, os.path.join(HERE, 'finalize.py'), 'video_only.mp4', 'mix.wav', 'final.mp4'], check=True)
    qa['durations'] = durs; qa['voice'] = json.load(open('voice_meta.json'))
    json.dump(qa, open('qa.json', 'w'), indent=1, ensure_ascii=False)
    print('OK', os.path.join(out, 'final.mp4'))


if __name__ == '__main__':
    main()
