"""Example: the 15 Nov 2026 Dallas salons tip Reel rebuilt with the safe-zone kit.
Run from a work folder that holds durs.json and mix.wav from reel_voice.py:
    python3 /home/claude/manav-seo/tools/video/reels/example_tip.py
Writes video_only.mp4, cover.jpg, frame_*.png and a platform mockup sheet per frame."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from reel_kit import hook, statement, tip, close, cover, render_video, SKY, CORAL, YEL
import safezone

stages = [
    hook(['DALLAS', 'SALONS'], '+ SPAS, TEXAS', 'The holiday booking rush is here.', 'Will Google Maps show you first?',
         footer='3 review habits that help.'),
    statement("GOOGLE'S OWN WORDS", 'More reviews and positive ratings can help your business’s local ranking.',
              'Source: Google Business Profile Help, "Tips to improve your local ranking on Google"'),
    tip(1, 'Ask every client.', 'Text your Google review link after the visit, or put a QR code at the front desk.'),
    tip(2, 'Reply to every review.', 'Short, warm, and by name.', SKY),
    tip(3, 'Never buy reviews.', 'No discounts or freebies for reviews either. Google strictly prohibits it.', CORAL),
    close(),
]
for i, s in enumerate(stages):
    s.im.save(f'frame_{i}.png')
cover(['DALLAS', 'SALONS'], '3 Google review habits before the holiday rush', 'yellow', 'Google Maps tips for Texas salons').save('cover.jpg', quality=90)
safezone.mockup('frame_0.png', 'mockup_hook.jpg'); safezone.mockup('cover.jpg', 'mockup_cover.jpg')
if os.path.exists('durs.json'):
    render_video(stages, json.load(open('durs.json')))
print('ok')
