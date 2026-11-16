"""Week of 17 to 23 Nov 2026: the 7 Instagram and Facebook feed posts rebuilt as narrated videos (SOUND RULE, 16 Nov 2026).

Manav, 16 Nov 2026: "mute posts doesn't make sense", then "rebuild ... always keep the quality best".
Each post is a 1080x1920 video made with the safe-zone kit (tools/video/reel_kit.py), narration over our original beat
(reel_voice.py), checked by finalize.py (must print SOUND OK), with its own cover in a rotating style.
Facts and wording come from captions.md and the cards in this folder, which were checked when the week was planned.

Run:  python3 tools/social/2026-11-17/videos.py [post ...]      (default: all 7)
Writes video/<post>/: <post>.mp4, cover.jpg, mockup_hook.jpg, mockup_cover.jpg, frame_*.png (mp4 and wav are not committed).
"""
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
VID = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'video')
sys.path.insert(0, VID)
from reel_kit import hook, statement, tip, shot, close, cover, render_video, SKY, CORAL, YEL  # noqa: E402
import safezone  # noqa: E402

C = lambda f: os.path.join(HERE, f)
CLOSE_LINE = 'Want us to check yours? Get a free Google and ChatGPT check at business santa dot com.'

POSTS = {
    'tue17_hours': dict(seed=17, style='sky', cover=(['HOLIDAY', 'HOURS'], 'Set them on Google before Thanksgiving', 'Takes about 5 minutes'),
        scenes=lambda: [
            hook(['HOLIDAY', 'HOURS'], 'ON GOOGLE', 'Thanksgiving is 9 days away.', 'Shoppers check your hours first.'),
            tip(1, 'Set main hours first.', 'Then Edit profile, Hours, Special hours.'),
            tip(2, 'Confirm every holiday.', 'Even the days you are open.', SKY),
            tip(3, 'Add your own dates.', 'Like short hours on Christmas Eve.', CORAL),
            tip(4, 'Match everywhere.', 'Apple Maps, Bing, Yelp, Facebook and your website.'),
            close()],
        lines=['Thanksgiving is nine days away. Shoppers check your hours on Google before they drive over.',
               'Tip one. Set your main hours first, then open Edit profile, Hours, and Special hours.',
               'Tip two. Confirm every holiday, even the days you are open.',
               'Tip three. Add your own dates, like short hours on Christmas Eve.',
               'Tip four. Make your hours match on Apple Maps, Bing, Yelp, Facebook and your website.',
               CLOSE_LINE],
        mins=[4.5, 4, 3.5, 3.5, 4.5, 4.5]),
    'wed18_offer': dict(seed=18, style='coral', cover=(['$149', 'TUNE-UP'], 'Holiday Google tune-up, until Dec 10', 'One time, no contract'),
        scenes=lambda: [
            hook(['$149', 'TUNE-UP'], 'HOLIDAY GOOGLE', 'Christmas shoppers decide fast,', 'mostly on their phones.'),
            tip(1, 'Holiday hours, set.', 'For Thanksgiving, Christmas and New Year.', label=''),
            tip(2, 'Christmas posts and photos.', 'Fresh, on your Google profile.', SKY, label=''),
            tip(3, 'A ChatGPT check.', 'What it says when people ask for a business like yours.', CORAL, label=''),
            shot(C('wed18_offer.png'), 'One time. No contract.', 'Usually done in 3 to 7 days. Offer ends Dec 10.'),
            close()],
        lines=['Christmas shoppers decide fast, mostly on their phones. Meet our one hundred forty nine dollar Holiday Google tune-up.',
               'One. Your holiday hours, set for Thanksgiving, Christmas and New Year.',
               'Two. Christmas offer posts and fresh photos on your Google profile.',
               'Three. A ChatGPT check: what it says when people ask for a business like yours.',
               'One time, no contract, usually done in three to seven days. The offer ends December tenth.',
               CLOSE_LINE],
        mins=[5, 3.5, 3.5, 4, 5, 4.5]),
    'thu19_showdown': dict(seed=19, style='white', cover=(['AUSTIN', 'PLUMBERS'], 'Google and ChatGPT picked different plumbers', 'Checked by hand, 15 Nov 2026'),
        scenes=lambda: [
            hook(['AUSTIN', 'PLUMBERS'], 'GOOGLE VS CHATGPT', 'Same question to both:', 'who is the best plumber in Austin?'),
            shot(C('thu19_showdown.png'), 'They picked different plumbers.', 'Checked by hand on 15 Nov 2026, Austin TX.'),
            tip(1, 'Win both lists.', 'ChatGPT pointed to outside list sites and review counts, not just Google.', SKY, label='LESSON'),
            close()],
        lines=['We asked Google and ChatGPT the same question. Who is the best plumber in Austin, Texas?',
               "None of Google's top three made ChatGPT's list of five. ChatGPT's top two picks sat at number seven and number eight on Google.",
               'The lesson: ChatGPT pointed to outside list sites and review counts, not just Google.',
               'Want your trade and city checked? Get a free Google and ChatGPT check at business santa dot com.'],
        mins=[4.5, 7, 5, 4.5]),
    'fri20_result': dict(seed=20, style='navy', cover=(['DURHAM', 'HVAC'], '#2 on Google for "hvac company durham nc"', 'Client result, checked 14 Nov 2026'),
        scenes=lambda: [
            hook(['DURHAM', 'HVAC'], 'NORTH CAROLINA', '#2 on Google for', '"hvac company durham nc".'),
            shot(C('fri20_result.png'), 'Client result: Hays HVAC', 'Ranking checked 14 Nov 2026. Story page figures.'),
            tip(1, 'What got it there.', 'Foundation SEO, then monthly links, blogs and service page content.', SKY, label='HOW'),
            statement("THE OWNER'S WORDS", 'Yes I want to keep working with you.', 'Hays HVAC, client chat, January 2026'),
            close()],
        lines=['An H V A C company in Durham, North Carolina is number two on Google for H V A C company Durham N C.',
               'Their November twenty twenty five report showed fifty four point two thousand Google impressions, and the average position moved from forty one point nine to twenty four point five in December.',
               'What got it there: foundation SEO, then monthly links, blogs and service page content.',
               "In the owner's words: yes, I want to keep working with you.",
               CLOSE_LINE],
        mins=[5, 8, 4.5, 3.5, 4.5]),
    'sat21_sbs': dict(seed=21, style='yellow', cover=(['SMALL', 'BUSINESS', 'SATURDAY'], '4 Google fixes before Nov 28', None),
        scenes=lambda: [
            hook(['SMALL', 'BUSINESS'], 'SATURDAY, NOV 28', 'One week to make sure', '"near me" shoppers pick you.'),
            tip(1, 'Confirm weekend hours.', 'On Google, for the whole weekend.'),
            tip(2, 'Post one clear offer.', 'With the dates on it.', SKY),
            tip(3, 'Add fresh photos.', 'Of the shop and the team.', CORAL),
            tip(4, 'Ask for reviews.', 'That weekend, from every happy customer.'),
            close()],
        lines=['Small Business Saturday is November twenty eighth. One week to make sure near me shoppers pick you.',
               'Tip one. Confirm your hours on Google for the whole weekend.',
               'Tip two. Post one clear offer, with the dates on it.',
               'Tip three. Add fresh photos of the shop and the team.',
               'Tip four. Ask for reviews that weekend, from every happy customer.',
               CLOSE_LINE],
        mins=[5, 3.5, 3.5, 3.5, 3.5, 4.5]),
    'sun22_thisorthat': dict(seed=22, style='coral', cover=(['A OR B?'], 'What does your Google profile show for Thanksgiving?', 'Comment your answer'),
        scenes=lambda: [
            hook(['A OR B?'], 'THANKSGIVING IS THURSDAY', 'What does your Google profile', 'show right now?'),
            shot(C('sun22_thisorthat.png'), 'Comment A or B.', 'Then score your profile free, in 2 minutes.'),
            tip(1, 'Score it free.', '12 yes or no questions. A score out of 100 and your fixes in order.', SKY, label='FREE'),
            close()],
        lines=['Thanksgiving is Thursday. What does your Google profile show right now?',
               'A, holiday hours confirmed. Or B, not set yet. Comment A or B.',
               'Then score your profile free. Twelve yes or no questions, a score out of one hundred, and your fixes in order.',
               CLOSE_LINE],
        mins=[4, 5, 6, 4.5]),
    'mon23_12days': dict(seed=23, style='sky', cover=(['12 DAYS'], 'of Business Santa: free Holiday Google tune-ups', 'Nominations open'),
        scenes=lambda: [
            hook(['12 DAYS'], 'OF BUSINESS SANTA', '12 free Holiday Google tune-ups,', 'December 1 to 12.'),
            shot(C('mon23_12days.png'), 'Nominations are open.', 'One US small business a day, December 1 to 12.'),
            tip(1, 'Tag them below.', 'Your barber, the bakery on the corner, the plumber who saved your Christmas.', CORAL, label='NOMINATE'),
            close()],
        lines=['Twelve days of Business Santa. From December first to twelfth, we give one US small business a day a free Holiday Google tune-up.',
               'Holiday hours, Christmas posts and photos, and a ChatGPT check. Nominations are open now.',
               'Who deserves it? Your barber, the bakery on the corner, the plumber who saved your Christmas. Tag them below. Owners can nominate themselves too.',
               CLOSE_LINE],
        mins=[6, 5, 7, 4.5]),
}


def build(name):
    p = POSTS[name]
    out = os.path.join(HERE, 'video', name); os.makedirs(out, exist_ok=True); os.chdir(out)
    stages = p['scenes']()
    assert len(stages) == len(p['lines']) == len(p['mins']), name
    for i, s in enumerate(stages):
        s.im.save(f'frame_{i}.png')
    big, sub, tag = p['cover']
    cover(big, sub, p['style'], tag).save('cover.jpg', quality=90)
    safezone.mockup('frame_0.png', 'mockup_hook.jpg'); safezone.mockup('cover.jpg', 'mockup_cover.jpg')
    open('lines.txt', 'w').write('\n'.join(p['lines']) + '\n')
    subprocess.run([sys.executable, os.path.join(VID, 'reel_voice.py'), 'lines.txt', str(p['seed']), ','.join(map(str, p['mins']))], check=True)
    render_video(stages, json.load(open('durs.json')))
    subprocess.run([sys.executable, os.path.join(VID, 'finalize.py'), 'video_only.mp4', 'mix.wav', f'{name}.mp4'], check=True)
    for f in ('video_only.mp4', 'voice.wav', 'music.wav'):
        if os.path.exists(f): os.remove(f)
    print('built', name)


if __name__ == '__main__':
    for n in (sys.argv[1:] or list(POSTS)):
        build(n)
