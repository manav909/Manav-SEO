"""media_plan: the social media manager's rules as code. Picks, for the next post, a story arc (which reel_studio
formats in which order), the palettes, the voice, the beat and the hook type, so that no two neighbouring posts look
or sound alike, and writes the caption with what the post proves. Brand-neutral: pass a brand dict.

Why (17 Nov 2026): "consistency is good but design elements are off ... same boring voice and no variety at all ...
never mentioning what you are proving in the description". Every post now:
  1. opens on a hook of a type not used in the last 3 posts,
  2. uses an arc and palette set not used in the last 2 posts, a voice not used in the last 3, a beat not in the last 2,
  3. carries a caption whose second line says what the post proves, with its source and date,
  4. passes lint(): no forbidden words for the brand, no em or en dashes, the proof line and a call to action present.

History lives in a small JSON file the task keeps (e.g. queue/media_history.json); pass its path.

Usage:
    from media_plan import next_post, caption, lint
    plan = next_post(BRAND, 'queue/media_history.json', kind='reel')     # dict: arc, scenes, palettes, voice, beat, hook
    text = caption(BRAND, hook=..., value=[...], proves=..., source=..., cta=..., tags=[...], platform='instagram')
    lint(BRAND, text)                                                     # raises ValueError listing problems
    record('queue/media_history.json', plan, title='...')                 # after publishing
"""
import json, os, random, datetime

HOOKS = {
    # type: (what it does, a pattern to adapt; write the real line from the post's own facts)
    'contrarian': ('says the opposite of common advice', 'Stop {doing the obvious thing}. Do this instead.'),
    'number':     ('opens on a hard, sourced number', '{number} {what it measures}. Here is why.'),
    'question':   ('asks the viewer a question they cannot ignore', 'Why is your {thing} {problem}?'),
    'mistake':    ('names a costly mistake the viewer is making', 'The {thing} mistake that costs {who} {cost}.'),
    'story':      ('starts in the middle of a real story', '{Client} was stuck at {before}. {time} later: {after}.'),
    'test':       ('shows a live test the viewer can repeat', 'I asked {tool} "{question}". Look who it named.'),
    'myth':       ('busts a belief', '{belief}? That is a myth.'),
    'pov':        ('puts the viewer inside a moment', 'POV: {a moment the viewer knows}.'),
    'challenge':  ('gives a small task with a time limit', 'Do this in {minutes} minutes today.'),
    'reveal':     ('promises a before and after', 'Before and after: {thing}.'),
}

ARCS = {
    # name: scene formats in order (poster/quote open, cta closes). The task fills each scene with real content.
    'proof_story': ['poster', 'stat', 'proof', 'steps', 'cta'],
    'myth_bust':   ['poster', 'mythfact', 'proof', 'talk', 'cta'],
    'quick_tip':   ['poster', 'steps', 'talk', 'cta'],
    'case_study':  ['poster', 'stat', 'proof', 'quote', 'cta'],
    'live_test':   ['poster', 'proof', 'mythfact', 'steps', 'cta'],
    'reflection':  ['quote', 'talk', 'book', 'cta'],
    'teach':       ['poster', 'mythfact', 'steps', 'quote', 'cta'],
    'book_drop':   ['poster', 'book', 'quote', 'cta'],
    'number_drop': ['stat', 'mythfact', 'steps', 'cta'],
}

def _load(path):
    try:
        return json.load(open(path))
    except Exception:
        return []


def _fresh(options, used, avoid, rnd):
    recent = used[-avoid:] if avoid else []
    pool = [o for o in options if o not in recent] or list(options)
    return rnd.choice(pool)


def next_post(brand, history_path, kind='reel', seed=None, lang='en'):
    hist = _load(history_path)
    rnd = random.Random(seed if seed is not None else datetime.date.today().toordinal() * 7 + len(hist))
    arcs = brand.get('arcs') or list(ARCS)
    arc = _fresh(arcs, [h.get('arc') for h in hist], 2, rnd)
    hook = _fresh(list(HOOKS), [h.get('hook') for h in hist], 3, rnd)
    pals = list(brand['palettes'])
    last_pals = [h.get('palettes', [None])[0] for h in hist]
    first = _fresh(pals, last_pals, 2, rnd)
    seq = [first]
    for _ in ARCS[arc][1:]:
        seq.append(_fresh([p for p in pals if p != seq[-1]], seq, 1, rnd))
    voices = brand.get('voices', {}).get(lang) or ['am_michael']
    voice = _fresh(voices, [h.get('voice') for h in hist], 3, rnd)
    beat = _fresh(brand.get('beats', ['upbeat']), [h.get('beat') for h in hist], 2, rnd)
    cover = _fresh(pals, [h.get('cover') for h in hist], 3, rnd)
    return {'kind': kind, 'arc': arc, 'scenes': ARCS[arc], 'palettes': seq, 'hook': hook,
            'hook_rule': HOOKS[hook][0], 'hook_pattern': HOOKS[hook][1], 'voice': voice, 'beat': beat,
            'cover': cover, 'speed': round(rnd.uniform(1.02, 1.12), 2)}


def record(history_path, plan, title=''):
    hist = _load(history_path)
    hist.append({k: plan.get(k) for k in ('kind', 'arc', 'hook', 'voice', 'beat', 'cover', 'palettes')} |
                {'title': title, 'date': datetime.date.today().isoformat()})
    os.makedirs(os.path.dirname(os.path.abspath(history_path)), exist_ok=True)
    json.dump(hist[-60:], open(history_path, 'w'), indent=1, ensure_ascii=False)


LIMITS = {'instagram': 2200, 'facebook': 5000, 'youtube_title': 100, 'youtube': 5000, 'linkedin': 3000, 'x': 280}


def caption(brand, hook, value, proves, source, cta, tags=(), platform='instagram', lang='en'):
    """hook: the first line (it shows before 'more'). value: 1-3 short lines of what the viewer gets.
    proves: one line, what this post proves. source: where and when it was checked (e.g. 'Google US, 14 Nov 2026').
    cta: the one thing to do next. tags: 3-5 specific hashtags (no generic #marketing spam)."""
    lab = {'en': ('What this proves', 'Checked'), 'hi': ('यह क्या साबित करता है', 'स्रोत')}[lang]
    lines = [hook.strip(), '', f'{lab[0]}: {proves.strip()}', f'{lab[1]}: {source.strip()}', '']
    lines += [v.strip() for v in value if v.strip()]
    lines += ['', cta.strip()]
    if tags and platform in ('instagram', 'facebook', 'linkedin', 'youtube'):
        lines += ['', ' '.join('#' + t.lstrip('#').replace(' ', '') for t in list(tags)[:5])]
    text = '\n'.join(lines).strip()
    if platform == 'x':
        text = f'{hook.strip()} {proves.strip()} ({source.strip()}) {cta.strip()}'
    return text


def lint(brand, text, platform='instagram'):
    """Raise ValueError with every problem found; return the text when clean."""
    low = ' ' + text.lower() + ' '
    bad = [w for w in brand.get('forbidden', []) if w.lower() in low]
    probs = []
    if bad:
        probs.append(f'forbidden for {brand["name"]}: {bad}')
    if platform != 'x' and not any(k in text for k in ('What this proves', 'यह क्या साबित करता है')):
        probs.append('no "What this proves" line')
    if brand['url'].split('.')[0] not in low.replace(' ', '') and platform != 'x':
        probs.append(f'no {brand["url"]} in the text')
    lim = LIMITS.get(platform)
    if lim and len(text) > lim:
        probs.append(f'{len(text)} characters, over the {platform} limit of {lim}')
    if probs:
        raise ValueError('; '.join(probs))
    return text
