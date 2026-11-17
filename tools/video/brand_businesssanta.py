"""Business Santa brand for reel_studio. One identity (navy, Santa yellow, Inter Tight and Anton), five palettes so
neighbouring posts never look alike. Rotate palettes and formats with media_plan.py; never use the same palette for
two posts in a row on one platform."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'sites', 'businesssanta', 'assets', 'img')

NAVY, NAVY_D, YEL, WHITE = (11, 18, 40), (5, 8, 20), (253, 185, 19), (255, 255, 255)
SKY, CORAL, PAPER = (24, 82, 160), (232, 92, 74), (246, 244, 238)

BRAND = {
    'name': 'Business Santa',
    'url': 'businesssanta.com',
    'logo': os.path.join(IMG, 'logo-512.png'),
    'person': os.path.join(IMG, 'manav-cut-1180.webp'),
    'face_box': (0.20, 0.0, 0.48, 0.20),   # where the face sits in the cut-out, as fractions of the photo
    'fonts': {
        'display': 'Anton-Regular.ttf',      # tall condensed headline type for hooks and numbers
        'head': os.path.join(HERE, 'assets', 'bshead.ttf'),   # Inter Tight ExtraBold, the site's heading face
        'body': 'Medium', 'body_bold': 'Bold',  # Inter
        'serif': 'DMSerifDisplay-Regular.ttf',
    },
    'palettes': {
        'navy':  dict(bg=NAVY, bg2=NAVY_D, ink=WHITE, accent=YEL, accent_ink=NAVY, muted=(178, 188, 208),
                      panel=WHITE, panel_ink=NAVY, chip=YEL, chip_ink=NAVY, bad=CORAL, panel_soft=(26, 38, 70)),
        'yellow': dict(bg=YEL, bg2=(255, 204, 64), ink=NAVY, accent=(24, 82, 160), accent_ink=WHITE, muted=(70, 58, 20),
                       panel=NAVY, panel_ink=WHITE, chip=NAVY, chip_ink=YEL, bad=(196, 52, 40), panel_soft=(255, 214, 102)),
        'paper': dict(bg=PAPER, bg2=(232, 230, 222), ink=NAVY, accent=(214, 72, 50), accent_ink=WHITE, muted=(84, 92, 110),
                      panel=NAVY, panel_ink=WHITE, chip=NAVY, chip_ink=YEL, bad=(214, 72, 50), panel_soft=(228, 226, 218)),
        'sky':   dict(bg=SKY, bg2=(12, 48, 104), ink=WHITE, accent=YEL, accent_ink=NAVY, muted=(196, 216, 242),
                      panel=WHITE, panel_ink=NAVY, chip=WHITE, chip_ink=NAVY, bad=CORAL, panel_soft=(40, 100, 180)),
        'coral': dict(bg=CORAL, bg2=(196, 62, 50), ink=WHITE, accent=NAVY, accent_ink=WHITE, muted=(255, 226, 218),
                      panel=WHITE, panel_ink=NAVY, chip=NAVY, chip_ink=YEL, bad=NAVY, panel_soft=(244, 120, 100)),
    },
    'voices': {  # American voices only (17 Nov 2026: US accent and tone for everything Business Santa). Blends 'a+b'.
        'en': ['am_michael', 'af_heart', 'am_fenrir', 'af_bella', 'am_puck', 'af_nicole', 'am_michael+am_fenrir', 'af_heart+af_bella'],
    },
    'lang': 'en-us',
    'audience': 'US small business owners and the people they serve: US cities, US trades, US spelling, US dates (Nov 14, 2026), dollars',
    'beats': ['upbeat', 'pluck', 'lofi', 'cinematic'],
    'speed': (1.02, 1.12),
    'experiments': [],   # new formats from the weekly trend scan, tried before they join the rotation
    'arcs': ['proof_story', 'myth_bust', 'quick_tip', 'case_study', 'live_test', 'number_drop'],
    # Content series (17 Nov 2026): similar within a series so viewers feel at home, different between series.
    # Each keeps its badge, palettes, narrator voice, beat family and cover palette; share = how often it runs.
    'series': {
        'chatgpt': dict(label='I ASKED CHATGPT', fill=WHITE, ink=NAVY, palettes=['navy', 'sky'], arcs=['live_test', 'myth_bust'],
                        voice='af_heart', beats=['cinematic', 'pluck'], cover='sky', share=2),
        'wins':    dict(label='CLIENT WIN', fill=YEL, ink=NAVY, palettes=['navy', 'yellow'], arcs=['case_study', 'proof_story'],
                        voice='am_michael', beats=['cinematic', 'upbeat'], cover='yellow', share=2),
        'fix':     dict(label='60-SECOND FIX', fill=CORAL, ink=WHITE, palettes=['paper', 'sky'], arcs=['quick_tip', 'number_drop'],
                        voice='am_puck', beats=['lofi', 'pluck'], cover='paper', share=2),
        'myth':    dict(label='MYTH OR FACT', fill=NAVY, ink=YEL, palettes=['coral', 'paper'], arcs=['myth_bust', 'number_drop'],
                        voice='af_bella', beats=['pluck', 'upbeat'], cover='coral', share=1),
        'holiday': dict(label='12 DAYS OF SANTA', fill=(200, 30, 45), ink=WHITE, palettes=['coral', 'yellow', 'navy'],
                        arcs=['proof_story', 'quick_tip', 'case_study'], voice='am_michael+am_fenrir', beats=['upbeat'], cover='coral', share=0.5),
    },
    'forbidden': ['fiverr', '—', '–'],  # never on Business Santa; no em or en dashes anywhere
}
