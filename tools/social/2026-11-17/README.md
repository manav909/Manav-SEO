# Week of Tue 17 to Mon 23 Nov 2026

Made by the weekly social content batch on 16 Nov 2026. `python3 tools/social/2026-11-17/make.py` rebuilds every
image and runs the safe-zone check on each one. Captions are in `captions.md`.

Scheduled (all times US Eastern):

| Date | Feed post, Instagram and Facebook | Stories (3, IG and FB) | LinkedIn | YouTube community |
| --- | --- | --- | --- | --- |
| Tue 17 | 9:15 am, carousel `tue17_hours_*` | 12:15 pm | 10:00 am, `thu19_showdown` (Episode 1 finding) | |
| Wed 18 | 9:15 am, offer card `wed18_offer` | 12:15 pm | 4:00 pm, document `li_wed18_holiday_hours.pdf` | 11:00 am, text poll |
| Thu 19 | 9:15 am, `thu19_showdown` | 12:15 pm | 10:00 am, `li_thu19_closets` | |
| Fri 20 | 9:15 am, `fri20_result` | 12:15 pm | 3:30 pm, `li_fri20_whitelabel` | 11:00 am, image `yt_fri20_tip` |
| Sat 21 | 10:15 am, carousel `sat21_sbs_*` | 12:15 pm | | |
| Sun 22 | 10:15 am, `sun22_thisorthat` | 12:15 pm | | 10:00 am, Episode 1 video post |
| Mon 23 | 9:15 am, `mon23_12days` | 12:15 pm | 10:00 am, `mon23_12days` | |

Note: the first slides of both carousels and the LinkedIn document cover were rebuilt after scheduling with the new
`feed45cover` safe zone (Facebook's multi-photo collage crops slide 1 to about 2:3). The scheduled versions used
the older feed45 layout; their text sits 18 to 28 px from that crop on the left and right edges.

## Rebuilt with sound, 16 Nov 2026

Manav, 16 Nov 2026: "mute posts doesn't make sense", then "rebuild ... always keep the quality best". The 7 Instagram and
Facebook feed posts above were rebuilt as narrated videos (voice over our original beat) with `videos.py`, each passing
`tools/video/finalize.py` (SOUND OK, about -21 dB mean), with its own cover, and scheduled as Reels to both platforms at
the same slots (Tue to Fri and Mon 9:15 am, Sat and Sun 10:15 am US Eastern) with the captions from `captions.md`.
The 14 original image posts were moved to Drafts in Meta Business Suite (not deleted). Frames, covers and mockups are in
`video/<post>/`; the mp4 and wav files are not committed (`python3 tools/social/2026-11-17/videos.py` rebuilds them).
