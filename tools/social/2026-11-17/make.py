"""Week of Tue 17 to Mon 23 Nov 2026: feed posts, carousels, Stories and LinkedIn cards for Business Santa.

Facts come from our live pages (sites/businesssanta), Episode 1 (tools/video/episodes/ep01-plumbers-austin,
checked by hand 15 Nov 2026) and Google Business Profile Help as cited on those pages.
Run: python3 tools/social/2026-11-17/make.py   (every image is safe-zone checked; a failure stops the run)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from card_kit import Card  # noqa: E402

OUT = HERE
report = []


def save(card, name):
    path, fill = card.save(os.path.join(OUT, name))
    report.append((name, fill))


HOURS_URL = 'businesssanta.com/guides/holiday-hours-on-google'
SRC_HOURS = 'Source: Google Business Profile Help, "How to set special hours"'

# ---------- Tue 17 Nov: carousel, holiday hours before Thanksgiving (7 slides) ----------
n = 7
c = Card('feed45cover', counter=f'1/{n}', bg_variant=0)
c.kicker('9 DAYS TO THANKSGIVING').title('Set your holiday hours on Google *before Thanksgiving*', size=104)
c.body('5 steps, about 5 minutes. Shoppers check your hours before they drive over.')
c.footer_hint('Swipe for the steps  >')
save(c, 'tue17_hours_1.png')
steps = [
    ('Step 1', 'Set your *main hours* first', 'Special hours only show when your profile is set to Open with main hours.'),
    ('Step 2', 'Open *Special hours*', 'In your Business Profile: Edit profile, then Hours, then the pencil next to Special hours.'),
    ('Step 3', 'Confirm every holiday, *even if you are open*', 'Google says to confirm hours for official holidays even when they are the same as usual.'),
    ('Step 4', 'Add *your own dates*', 'Christmas Eve short hours, a staff party, or late opening for last-minute shoppers.'),
    ('Step 5', 'Match *every listing*', 'Same hours on Apple Maps, Bing, Yelp, Facebook and your website. Then check Google a day later.'),
]
for k, (kick, t, b) in enumerate(steps, start=2):
    c = Card('feed45', counter=f'{k}/{n}', bg_variant=k)
    c.kicker(kick.upper()).title(t, size=96).body(b, size=52).note(SRC_HOURS)
    c.footer_hint('Swipe  >')
    save(c, f'tue17_hours_{k}.png')
c = Card('feed45', counter=f'{n}/{n}', bg_variant=1)
c.kicker('FREE LOOK').title('Not sure what Google shows *for your business?*', size=96)
c.body('Comment *CHECK* and your city. We will look at your Google profile and tell you what to fix first.')
c.footer_url(HOURS_URL, label='The full guide:')
save(c, 'tue17_hours_7.png')

# ---------- Wed 18 Nov: offer card, $149 Holiday Google tune-up ----------
c = Card('feed45', bg_variant=2)
c.kicker('CHRISTMAS OFFER, UNTIL DEC 10').title('Holiday Google tune-up *$149*', size=110)
c.bullets(['Holiday hours set for Thanksgiving, Christmas and New Year',
           'Christmas offer posts and fresh photos on your Google profile',
           'A ChatGPT check: what it says about businesses like yours'])
c.note('One-time price, no contract. Usually done in 3 to 7 days.', size=34)
c.footer_url('businesssanta.com/christmas-marketing-for-small-business', label='Claim it with a free check:')
save(c, 'wed18_offer.png')

# ---------- Thu 19 Nov: Google vs ChatGPT showdown (Episode 1 finding) ----------
c = Card('feed45', bg_variant=0)
c.kicker('GOOGLE VS CHATGPT').title('Google and ChatGPT picked *different plumbers* in Austin', size=90)
c.stats([('0', "of Google's top 3 made ChatGPT's list of 5"), ('#7, #8', "where ChatGPT's top two picks sat on Google")])
c.note('Winning Google Maps does not mean you win ChatGPT. Checked by hand on 15 Nov 2026, Austin TX. Local Visibility Check, Episode 1.', size=34)
c.footer_url('youtube.com/@BusinessSantaofficial', label='Watch the full episode:')
save(c, 'thu19_showdown.png')

# ---------- Fri 20 Nov: client result, Hays HVAC Durham NC ----------
c = Card('feed45', bg_variant=1)
c.kicker('CLIENT RESULT').title('HVAC in Durham, NC: *#2~on~Google* for "hvac company durham nc"', size=92)
c.stats([('54.2K', 'Google impressions in the Nov 2025 report'), ('41.9 to 24.5', 'average Google position, Dec 2025')])
c.note('Hays HVAC. Ranking: Google US, checked 14 Nov 2026. Figures as stated on our client story page.', size=34)
c.footer_url('businesssanta.com/results/hvac-seo-durham-nc', label='Read the story:')
save(c, 'fri20_result.png')

# ---------- Sat 21 Nov: carousel, Small Business Saturday checklist (6 slides) ----------
SBS_URL = 'businesssanta.com/guides/small-business-saturday-checklist'
n = 6
c = Card('feed45cover', counter=f'1/{n}', bg_variant=2)
c.kicker('ONE WEEK TO GO').title('Small Business Saturday is *November~28*', size=106)
c.body('4 things to fix on Google this week, so "near me" shoppers pick you.')
c.footer_hint('Swipe for the list  >')
save(c, 'sat21_sbs_1.png')
sbs = [
    ('Hours', 'Confirm hours for *the whole weekend*', 'Thanksgiving, Black Friday, Saturday and Sunday, set as special hours on Google and matched everywhere else.'),
    ('Offer', 'Post *one clear offer*', 'On your Google profile, with start and end dates and simple terms. Vague offers bring calls and unhappy reviews.'),
    ('Photos', 'Add *fresh photos*', 'The shop front, the holiday window, the counter and your team. Shoppers want to recognize the place.'),
    ('Reviews', 'Ask for reviews *that weekend*', 'A short link or QR code at the counter. Recent reviews help the next shopper choose you.'),
]
for k, (kick, t, b) in enumerate(sbs, start=2):
    c = Card('feed45', counter=f'{k}/{n}', bg_variant=k)
    c.kicker(kick.upper()).title(t, size=98).body(b, size=52)
    c.footer_hint('Swipe  >')
    save(c, f'sat21_sbs_{k}.png')
c = Card('feed45', counter=f'{n}/{n}', bg_variant=0)
c.kicker('SAVE THIS').title('The full checklist has *8 steps*', size=100)
c.body('Pickup, phones, why shop with you and Cyber Monday too. Comment *SATURDAY* and we will send the link.')
c.footer_url(SBS_URL, label='Read it here:')
save(c, 'sat21_sbs_6.png')

# ---------- Sun 22 Nov: this or that, Google profile score ----------
c = Card('feed45', bg_variant=1)
c.kicker('THIS OR THAT').title('Thanksgiving is Thursday. *What does your Google profile show?*', size=86)
c.options(['A  Holiday hours confirmed', 'B  Not set yet'])
c.body('Comment *A* or *B* below. Then score your profile free: 12 yes or no questions, 2 minutes.', size=46)
c.footer_url('businesssanta.com/google-profile-score')
save(c, 'sun22_thisorthat.png')

# ---------- Mon 23 Nov: 12 Days of Business Santa nominations ----------
c = Card('feed45', bg_variant=2)
c.kicker('12 DAYS OF BUSINESS SANTA').title('*12 free Holiday Google tune-ups* for small businesses', size=100)
c.body('One US small business a day, December 1 to 12. Nominations are open now.', size=48)
c.body('*Tag a business* that deserves it: your barber, the bakery, the plumber who saved Christmas.', size=48, color=(255, 255, 255))
c.footer_url('businesssanta.com/12-days-of-business-santa', label='Nominate in a minute:')
save(c, 'mon23_12days.png')

# ---------- LinkedIn extras ----------
c = Card('feed45', bg_variant=0)
c.kicker('CLIENT RESULT').title('*11+ leads in 10 days* for a New York City closet company', size=92)
c.stats([('11+', 'leads from Google Ads, 9 to 19 Jan 2026'), ('900+', 'negative keywords, so ads skip searches that never buy')])
c.note('Dream Closets NYC. Figures as stated on our client story page.', size=34)
c.footer_url('businesssanta.com/results/custom-closet-leads-nyc', label='Read the story:')
save(c, 'li_thu19_closets.png')

c = Card('feed45', bg_variant=1)
c.kicker('FOR AGENCIES AND WEB DESIGNERS').title('White-label local SEO, *under your brand*', size=98)
c.bullets(['Google Maps and Business Profile work', 'Local SEO and AI search (ChatGPT, Perplexity, Google AI)',
           'Google and Meta ads', 'Reports you send as your own'])
c.footer_url('businesssanta.com/white-label-local-seo')
save(c, 'li_fri20_whitelabel.png')

# ---------- LinkedIn Wed 18: document carousel, same slides with a cover dated for Wednesday ----------
c = Card('feed45cover', counter='1/7', bg_variant=0)
c.kicker('8 DAYS TO THANKSGIVING').title('Set your holiday hours on Google *before Thanksgiving*', size=104)
c.body('5 steps, about 5 minutes. Shoppers check your hours before they drive over.')
c.footer_hint('Swipe for the steps  >')
save(c, 'li_wed18_hours_1.png')
from PIL import Image  # noqa: E402
pages = [Image.open(os.path.join(OUT, 'li_wed18_hours_1.png')).convert('RGB')] + \
        [Image.open(os.path.join(OUT, f'tue17_hours_{k}.png')).convert('RGB') for k in range(2, 8)]
pages[0].save(os.path.join(OUT, 'li_wed18_holiday_hours.pdf'), save_all=True, append_images=pages[1:], resolution=150)

# ---------- YouTube community Fri 20: standalone tip card (no counter, no swipe hint) ----------
c = Card('feed45', bg_variant=2)
c.kicker('HOLIDAY HOURS TIP').title('Confirm every holiday on Google, *even if you are open*', size=96)
c.body('Google says to confirm hours for official holidays even when they are the same as usual.', size=50)
c.note(SRC_HOURS)
c.footer_url(HOURS_URL, label='The full guide:')
save(c, 'yt_fri20_tip.png')

# ---------- Stories (3 a day: question, tip, today's page) ----------
STORIES = {
    'tue17': [('QUICK QUESTION', 'Have you set *holiday hours* on Google yet?', 'Reply YES or NOT YET. We read every reply.'),
              ('TIP', 'Confirm Thanksgiving hours *even if you are open*', 'Google says confirmed holiday hours show shoppers your hours are accurate.'),
              ('NEW POST', 'Holiday hours in *5 steps*', 'Today on our feed, and the full guide here:', HOURS_URL)],
    'wed18': [('QUICK QUESTION', 'Do you know what *ChatGPT* says about your business?', 'Reply YES or NO. We can check it for you.'),
              ('TIP', 'Add *fresh photos* before the holidays', 'The shop front, your team, the holiday window. Shoppers want to recognize you.'),
              ('OFFER', 'Holiday Google tune-up *$149*', 'Until December 10. Hours, posts, photos and a ChatGPT check.', 'businesssanta.com/christmas-marketing-for-small-business')],
    'thu19': [('GUESS', 'Did Google and ChatGPT pick *the same plumbers* in Austin?', 'Reply YES or NO, then see the answer on our feed.'),
              ('TIP', 'ChatGPT reads *what other websites say* about you', 'List sites, reviews and ratings shaped its picks in our Austin check.'),
              ('WATCH', 'Google vs ChatGPT, *Episode 1*', 'Plumbers in Austin TX, checked by hand on 15 Nov 2026.', 'youtube.com/@BusinessSantaofficial')],
    'fri20': [('QUICK QUESTION', 'Do you track where you rank *on Google*?', 'Reply YES or NOT YET.'),
              ('TIP', 'One page *per service*', 'Service plus city pages win the searches that pay, and AI answers read them too.'),
              ('CLIENT RESULT', 'HVAC in Durham, NC: *#2 on Google*', 'For "hvac company durham nc", checked 14~Nov~2026.', 'businesssanta.com/results/hvac-seo-durham-nc')],
    'sat21': [('QUICK QUESTION', 'Is Small Business Saturday *big for you?*', 'Reply YES or NO.'),
              ('TIP', 'Post *one clear offer* on Google', 'Start and end dates, simple terms. Vague offers bring unhappy reviews.'),
              ('CHECKLIST', 'Small Business Saturday, *Nov~28*', 'The 8-step checklist to get found that weekend.', SBS_URL)],
    'sun22': [('QUICK QUESTION', 'Thanksgiving hours on Google: *set or not yet?*', 'Reply SET or NOT YET.'),
              ('TIP', 'Reply to *every review*', 'Good and bad. It is part of how active your profile looks.'),
              ('FREE TOOL', 'Score your Google profile *in 2 minutes*', '12 yes or no questions, a score out of 100 and your fixes in order.', 'businesssanta.com/google-profile-score')],
    'mon23': [('QUICK QUESTION', 'Which local business *deserves a gift* this year?', 'Reply with its name and city.'),
              ('HOW IT WORKS', 'Nominate, we pick 12, *we do the work*', 'One business a day, December 1 to 12, with the owner\'s OK.'),
              ('NOMINATE', '12 Days of *Business Santa*', 'A free Holiday Google tune-up for 12 US small businesses.', 'businesssanta.com/12-days-of-business-santa')],
}
for day, frames in STORIES.items():
    for k, fr in enumerate(frames, start=1):
        c = Card('story', counter=f'{k}/3', bg_variant=k)
        c.kicker(fr[0]).title(fr[1], size=104, min_size=70).body(fr[2], size=54)
        if len(fr) > 3:
            c.footer_url(fr[3], label='Link:')
        else:
            c.footer_hint('Tap to reply')
        save(c, f'story_{day}_{k}.png')

for name, fill in report:
    print(f'{name:28s} fill {fill}')
