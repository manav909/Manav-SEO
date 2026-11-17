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

Gradual improvement (17 Nov 2026: "keep experimenting by learning trends, don't settle for one or two designs"):
  * score(history_path, title, metrics) stores each post's results (views, avg watch %, saves, shares, follows).
  * next_post weights arcs, hook types and palettes by their results (more wins, more use), but keeps exploring:
    every 5th post (or explore=True) is an EXPERIMENT: an untested arc, hook or layout variant, or one of the
    brand's 'experiments' (new formats added from the weekly trend scan), marked plan['experiment'].
  * The weekly strategy council reads report(history_path): what won, what to retire, which experiment to promote
    into the regular rotation, and which new trend to try next week.

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
    # knowledge-led arcs with no face (Manu Vishranti, 18 Nov 2026): facts, art and the book that goes deeper
    'fact_reveal': ['poster', 'art', 'mythfact', 'book', 'cta'],
    'deep_dive':   ['poster', 'art', 'steps', 'book', 'cta'],
    'mystery':     ['poster', 'quote', 'art', 'book', 'cta'],
    'myth_book':   ['poster', 'mythfact', 'art', 'book', 'cta'],
    'search_demo': ['poster', 'search', 'book', 'cta'],
}

def _load(path):
    try:
        return json.load(open(path))
    except Exception:
        return []


def _fresh(options, used, avoid, rnd, weights=None):
    recent = used[-avoid:] if avoid else []
    pool = [o for o in options if o not in recent] or list(options)
    if weights:
        ws = [max(0.2, weights.get(o, 1.0)) for o in pool]
        return rnd.choices(pool, ws)[0]
    return rnd.choice(pool)


def _perf(hist, key):
    """Average result score per option of `key` (1.0 = average post), from posts that have metrics."""
    rows = [h for h in hist if h.get('score') is not None]
    if len(rows) < 4:
        return {}
    mean = sum(h['score'] for h in rows) / len(rows) or 1
    out = {}
    for h in rows:
        out.setdefault(h.get(key), []).append(h['score'] / mean)
    return {k: sum(v) / len(v) for k, v in out.items()}


def _score(m):
    """One number per post from its metrics: watch time and saves and shares count most."""
    v = m.get('views', 0) or 0
    if not v:
        return None
    return (v ** 0.5) * (0.5 + (m.get('watch', 30) or 30) / 100) * (1 + 20 * ((m.get('saves', 0) or 0) + 2 * (m.get('shares', 0) or 0) + 3 * (m.get('follows', 0) or 0)) / v)


def next_post(brand, history_path, kind='reel', seed=None, lang='en', explore=None, series=None):
    """Series (17 Nov 2026: "similarity within a category feels comfortable, different for different"): each of the
    brand's series keeps its own badge, palettes, narrator voice, beat family and cover palette, so its posts are
    recognisable; variety comes from rotating series, arcs and hooks. Pass series= to force one (e.g. from the
    weekly plan); otherwise the least recently used series, weighted by brand['series'][k]['share']."""
    hist = _load(history_path)
    rnd = random.Random(seed if seed is not None else datetime.date.today().toordinal() * 7 + len(hist))
    explore = (len(hist) % 5 == 4) if explore is None else explore
    sers = brand.get('series', {})
    if sers and not series:
        last = [h.get('series') for h in hist]
        cands = [k for k in sers if k not in last[-1:]] or list(sers)
        series = rnd.choices(cands, [sers[k].get('share', 1) for k in cands])[0]
    S = sers.get(series, {})
    arcs = S.get('arcs') or brand.get('arcs') or list(ARCS)
    tried = {h.get('arc') for h in hist}
    experiment = None
    if explore:
        new = [a for a in ARCS if a not in tried] + list(brand.get('experiments', []))
        if brand.get('no_face'):   # never an arc that needs a face or a people photo
            new = [a for a in new if a not in ARCS or not ({'talk', 'photo'} & set(ARCS[a]))]
        if new:
            experiment = rnd.choice(new)
    arc = experiment if experiment in ARCS else _fresh(arcs, [h.get('arc') for h in hist], 2, rnd, _perf(hist, 'arc'))
    hook = _fresh(list(HOOKS), [h.get('hook') for h in hist], 3, rnd, None if explore else _perf(hist, 'hook'))
    pals = S.get('palettes') or list(brand['palettes'])
    last_pals = [h.get('palettes', [None])[0] for h in hist]
    first = _fresh(pals, last_pals, 2, rnd)
    seq = [first]
    for _ in ARCS[arc][1:]:
        seq.append(_fresh([p for p in pals if p != seq[-1]], seq, 1, rnd))
    voices = brand.get('voices', {}).get(lang) or ['am_michael']
    voice = S.get('voice') or _fresh(voices, [h.get('voice') for h in hist], 3, rnd)   # one narrator per series
    beat = _fresh(S.get('beats') or brand.get('beats', ['upbeat']), [h.get('beat') for h in hist], 1 if S else 2, rnd)
    cover = S.get('cover') or _fresh(pals, [h.get('cover') for h in hist], 3, rnd)
    vlang = S.get('lang') or brand.get('lang') or 'en-us'
    return {'kind': kind, 'lang': vlang, 'series': series, 'series_label': S.get('label'), 'arc': arc, 'scenes': ARCS[arc], 'palettes': seq, 'hook': hook,
            'hook_rule': HOOKS[hook][0], 'hook_pattern': HOOKS[hook][1], 'voice': voice, 'beat': beat,
            'cover': cover, 'speed': round(rnd.uniform(*brand.get('speed', (1.02, 1.12))), 2),
            'experiment': experiment}


def record(history_path, plan, title=''):
    hist = _load(history_path)
    hist.append({k: plan.get(k) for k in ('kind', 'series', 'arc', 'hook', 'voice', 'beat', 'cover', 'palettes', 'experiment')} |
                {'title': title, 'date': datetime.date.today().isoformat()})
    os.makedirs(os.path.dirname(os.path.abspath(history_path)), exist_ok=True)
    json.dump(hist[-60:], open(history_path, 'w'), indent=1, ensure_ascii=False)


def score(history_path, title, metrics):
    """Attach a post's results, e.g. {'views': 820, 'watch': 41, 'saves': 6, 'shares': 2, 'follows': 1}."""
    hist = _load(history_path)
    for h in reversed(hist):
        if h.get('title') == title:
            h['metrics'] = metrics; h['score'] = _score(metrics); break
    json.dump(hist, open(history_path, 'w'), indent=1, ensure_ascii=False)


def report(history_path):
    """For the weekly council: average result per arc, hook, voice, beat and experiment (1.0 = average)."""
    hist = _load(history_path)
    return {k: dict(sorted(_perf(hist, k).items(), key=lambda kv: -kv[1])) for k in ('series', 'arc', 'hook', 'voice', 'beat', 'experiment')}


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
