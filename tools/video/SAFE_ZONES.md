# Safe zones: what every Business Santa video and image must respect

Set on 15 Nov 2026 after Manav found our top-left logo sitting under Instagram's username and "Original audio" line
on every Reel. Each platform draws its own interface on top of what we publish. Nothing that has to be read
(words, numbers, logo, face, link, call to action) may sit under that interface. Only background decoration may.

The numbers live in `safezone.py` (`SAFE`, `OVERLAYS`, `GRID_CROP`) and are checked automatically.

## Vertical 1080x1920: Reels, Shorts, Reel covers, LinkedIn vertical video

| Platform | Covers the top | Covers the bottom | Covers the right side |
|---|---|---|---|
| Instagram Reels | "Reels" bar and camera, to about y 200 | username, Follow, caption, audio line from about y 1480 | like, comment, share, audio from about y 1080 |
| Instagram post view (profile, tap a Reel) | username and audio row, to about y 160 | as Reels | as Reels |
| Facebook Reels | to about y 190 | from about y 1460 | from about y 1050 |
| YouTube Shorts | search and menu, to about y 170 | channel, Subscribe, title, sound from about y 1440 | buttons from about y 880 |
| Stories (Reel reshared or native) | progress bar and name, to about y 250 | reply bar from about y 1700 | none |

Our safe zone (the intersection, with margin): **x 72 to 1008 and y 300 to 1400; below y 840 the right edge is 912.**
The profile grid shows Reel covers as a 3:4 center crop (rows 240 to 1680), which the safe zone already sits inside.

How we design for it (`reel_kit.py`): a full-bleed navy backdrop (decoration only) and one content card that is
exactly the safe zone. The brand rides on the card as a folder tab (logo, Business Santa, businesssanta.com) at
y 300 to 392, so it is visible on every platform and never under a username row. Word-by-word captions in Shorts
use the lane at y 1300 inside the card. Covers keep the brand pill at y 300 and the biggest words below it.

## Other formats

| Format | Size | Safe zone | Why |
|---|---|---|---|
| Native Story (made as a story) | 1080x1920 | x 72 to 1008, y 270 to 1640 | progress bar and name on top, reply bar and link sticker at the bottom |
| Feed post or carousel slide | 1080x1350 | x 72 to 1008, y 60 to 1260 | profile grid shows the center 1012 px; tag and sound icons bottom left |
| YouTube episode | 1920x1080 | x 96 to 1824, y 100 to 930 | title bar in embeds and when paused; controls and YouTube captions at the bottom |
| YouTube thumbnail | 1280x720 | keep clear of x 1060 to 1280, y 600 to 720 | the time stamp sits bottom right, the watched bar along the bottom |
| LinkedIn and X images | as feed | as feed | they crop previews to the center |

## The check, every time, before anything is published

1. Draw decoration into a background image and content on top (the kit does this).
2. `safezone.check(frame, background, fmt)` on every scene's final frame and on the cover. It fails the render if
   any content pixel lands outside the safe zone. `Stage` helpers also refuse to draw outside it.
3. `safezone.mockup(frame, out)` writes a side by side preview under Instagram Reels, Instagram post view,
   Facebook Reels, YouTube Shorts, a Story and the profile grid. Look at it for the hook frame, one middle frame,
   the closing frame and the cover before uploading. Also look for blank areas, cut words, overlaps and widows.
4. After publishing, look at the live post the way a viewer does: the Reel in Instagram's post view and the Reels
   grid, the Short on the channel's Shorts tab. If anything is covered, cut off or wrong, say so in the report and
   fix the template the same day, so the next post is right.

Command line: `python3 tools/video/safezone.py frame.png background.png vertical` checks and writes `frame_mockup.jpg`.
