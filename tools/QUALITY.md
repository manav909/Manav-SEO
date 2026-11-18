# Quality log: every problem found, its cause and the fix

Kept by the daily quality audit (11:07 am India time). Newest first. Read it before you build or post anything,
so the same mistake is never made twice. Each entry: date, what, where, cause, fix, prevented by.

## 18 Nov 2026

0. **Instagram Reel caption with a YouTube link that cannot be tapped.**
   Where: Instagram Reel "This Durham, NC HVAC company is No. 2 on Google" (17 Nov, 9:31 pm). The caption says
   "Full client story on our YouTube channel: https://youtu.be/J9auh_mLMV0"; Instagram does not link URLs in captions,
   so viewers see a dead address. The Facebook copy of the same Reel is fine (Facebook links URLs).
   Cause: the caption was written once for Facebook and reused on Instagram; the caption lint only checked for "#" in URLs.
   Fix: not edited by the audit (the post is otherwise correct; editing live captions is kept for typos); listed for
   Manav as optional. Prevented by: media_plan.lint(platform='instagram') now refuses any http, https or youtu.be address
   in an Instagram caption and says what to write instead ("YouTube @BusinessSantaofficial", "businesssanta.com (link in bio)").

   Also audited, no problems: 18 Nov 1:30 am Facebook post (AI answers got our business wrong), 17 Nov 11:00 pm Houston
   restaurants fake review Reel (Facebook and Instagram) and its YouTube Short, 17 Nov 7:45 pm Thanksgiving hours Reel
   (9 days to 26 Nov is right), and on businesssanta.com the 2 new client stories, results, guides and the 2 new guides
   (titles and descriptions in range, no em or en dashes, no banned words, no +91, 78 internal links and images all 200).

## 16 Nov 2026

0. **Reels published with a silent audio track (found by Manav).**
   Where: Facebook and Instagram Reels of 14 Nov (Chicago plumbers, frozen pipes) and 15 Nov 7:19 pm (Denver HVAC,
   "I asked ChatGPT"); earlier Reels not yet measured. Measured on the live Facebook Reels on 16 Nov: an audio track is
   there but its peak level is 0 (silence). The 15 Nov 11:22 pm Dallas salons Reel has narration and the beat.
   Cause: the Reel task's only sound check was "ffprobe shows an audio stream", which a silent track passes; when the
   narrator did not run (most likely its packages were missing on that run's fresh machine; a fresh machine on 16 Nov
   also lacked soundfile), nothing stopped the upload.
   Fix: old Reels cannot get new sound on Meta after posting; listed for Manav (keep or remove is his call).
   Prevented by: tools/video/finalize.py measures loudness and refuses silent or too quiet files (SOUND OK or SILENT);
   make.py runs it on every episode and Short; the "Sound" section in SAFE_ZONES.md and README.md; the Reel task and the
   weekly content batch now mux with finalize.py, and Instagram and Facebook feed posts go out as short narrated videos
   instead of silent images (update_trigger, 16 Nov).

1. **Facebook Reels say "Business Santa is in Dallas, TX" (and Denver, CO).**
   Where: the Business Santa Facebook Page, Reels of 15 Nov (7:19 pm Denver HVAC, 11:22 pm Dallas salons).
   Cause: the Reel task adds a city in the composer's Location field; on Facebook it publishes as a check-in that
   says the business is in that city, which is not true (we serve those cities, we are not there).
   Fix: not edited by the audit (needs switching into the Page); listed for Manav with the recommendation to remove
   the location from both posts. Prevented by: the Reel task and the YouTube episode task no longer add a Location;
   the city goes in the hook, caption and hashtags instead.

2. **Instagram caption with a broken link and a stray hashtag.**
   Where: Instagram Reel "Dallas salons and spas" (15 Nov, 11:22 pm). The caption ended with
   `https://www.businesssanta.com/christmas-marketing-for-small-business#offer`: Instagram does not link URLs in
   captions and turned `#offer` into a hashtag glued to the URL.
   Cause: the Reel task pastes the offer URL with its `#offer` anchor into one caption shared by Facebook and Instagram.
   Fix: caption edited on Instagram to "One-time $149 Holiday Google tune-up until Dec 10: businesssanta.com (link in bio)".
   Prevented by: Reel task rule: never paste a URL containing "#" in a caption; write the offer line as above.

3. **Headlines ending on one word (widows) on the website.**
   Where: businesssanta.com at phone width, for example the 12 Days page H1 ("...nominate a business you / love"), the
   Dream Closets NYC story H1 ("... closet / company"), and most "Get a free check for your business" boxes.
   Cause: the shared page CSS had no line balancing for headings.
   Fix: `text-wrap: balance` on h1, h2, h3 and `text-wrap: pretty` on paragraphs and list items in
   `pages/build_pages.py` (all inner pages) and `m/m.tpl.html` (phone home page; the desktop home page already had it).
   Re-checked by script at 390 and 1280 px on every page changed in the last 26 hours: 0 single-word last lines.
   Prevented by: it lives in the shared CSS, so every new page gets it.

4. **Every site build regenerated the fake-review guide's share image.**
   Where: `sites/businesssanta/assets/img/guides/remove-fake-google-reviews-*.jpg` (seen on 15 Nov by the story
   release run and again today).
   Cause: the live page was built from text ("for example Spam or Off topic") that was later lost from
   `pages/content.py` ("for example Spam"), so the image hash no longer matched and each build made a new image.
   Fix: `content.py` brought back in line with the live page (the live text is the correct one: Google's report
   reasons include both Spam and Off topic). Builds now reproduce the live image name.
   Prevented by: after `sh build.sh`, `git status` must show no image churn you did not intend.

5. **Pre-kit Reels (13 to 15 Nov) stay as they are.** The Denver and Dallas Reels of 15 Nov were made before the safe
   zone kit: the top-left brand sits under the username row in the Story reshare and in the YouTube Shorts grid crop,
   covers end on one word ("rush", "to?", "review."), and some frames are half empty. Posted Reels and covers cannot be
   edited. Prevented by: tools/video/reel_kit.py and SAFE_ZONES.md (15 Nov); the next Reels are the first real test.

6. **ChatGPT screenshot too small to read** (found by the 7:13 pm Reel run before publishing, Atlanta HVAC).
   Where: the first render put the whole answer in one shot() scene at about 72% scale; on a phone the business names
   and ratings were unreadable. Fix: split into two shot() scenes (picks 1 and 2, picks 3 and 4), shown at full size.
   Prevented by: reel_kit.shot() now prints a warning when a screenshot would be shown under 95%.

7. **Accidental Instagram repost during engagement** (same run). The like heart sits in a different place in the photo
   post view than in the Reel view; a click meant for the heart hit Repost on @atlcoolingheating's post. Seen on the
   profile's Reposts tab within a minute and undone (the tab is empty again). Prevented by: zoom on the action row and
   click the heart from that screenshot on every post; check the Reposts tab at the end of every engagement session.

Also seen, not ours to change without Manav (listed in the 16 Nov audit message): the Facebook Page service area
shows "New City, NY" (a town in Rockland County) instead of New York City; the Page shows "Always open" as hours.

## 15 Nov 2026

1. **Logo under Instagram's username row on every Reel; bottom lines under captions and buttons** (found by Manav).
   Cause: no safe zones. Fix and prevention: tools/video/safezone.py, reel_kit.py, SAFE_ZONES.md, renderers check
   themselves (commit e60b21f).
2. **Two Reels showed the same Instagram cover** (the shared closing scene). Cause: the composer's suggested
   thumbnail. Prevention: COVER RULE, every Reel uploads its own cover.
3. **Facebook's multi-photo collage cut a word on carousel slide 1.** Prevention: 'feed45cover' safe zone (x 100 to 980).
