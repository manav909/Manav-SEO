# Business Santa video toolkit

Long YouTube episodes (16:9) and vertical Shorts and Reels (9:16) for the "Local Visibility Check" series.
Business Santa is the main brand, "powered by SEO Season" sits under the logo, and seoseason.com is on every end card.

## Build

    pip install kokoro-onnx soundfile numpy pillow --break-system-packages
    python3 tools/video/make.py episode tools/video/episodes/<folder>
    python3 tools/video/make.py short   tools/video/shorts/<folder>

`make.py` downloads the free narrator voice once (Kokoro, voice `am_michael`, from GitHub releases), writes the narration,
writes an original background track (synthesized, no licensing), then renders with ffmpeg.

## Episode folder

- `script.py`: `EP`, `CHECKED` (date checked) and `SCENES`, a list of scene dicts. Scene kinds in `render_episode.py`:
  `hook` (cold open: `a` = two big numbers, `b` = one line), `title`, `shot` (screenshot `img`, highlight box `hl` in
  screenshot pixels, source line `cap`), `list` (rows), `compare` and `compare2` (two cards), `three` (three cards with a
  source line), `quote` (lines), `fixes` (three fixes), `cta` (free tool), `end`.
- Screenshots taken in Claude's built-in browser (Google with `&tbm=lcl&gl=us&hl=en`, ChatGPT with `?q=...&hints=search`).
  Every number on screen must be read off those screenshots, with the date and time.
- `ep01-plumbers-austin` is the reference episode (published 15 Nov 2026: https://youtu.be/F2k42karmoA).

## Short folder

- `n.txt`: one narration line per scene. `render_short.py` holds the scene layouts for Episode 1's Short
  (https://youtube.com/shorts/36zMckl8Scs): copy it into the new folder and change `scene()` for the new story.
  Word-by-word captions, pop animations and flash cuts are built in.

## Reels, covers and stories: the safe-zone kit

Read `SAFE_ZONES.md` first. Daily Reels are built with `reel_kit.py` (templates `hook`, `statement`, `tip`, `shot`,
`close`, `cover` and `render_video`); `reels/example_tip.py` is the reference (the Dallas salons Reel of 15 Nov 2026,
rebuilt). Each template centers its content in the card, shrinks type up to 18% for long text, and refuses to draw
outside the safe zone. `safezone.mockup()` previews any frame under every platform's interface. Rotate cover styles
(`yellow`, `navy`, `white`, `sky`, `coral`) so neighbouring covers on the grid never look alike.

## Rules for every video

- Safe zones (`SAFE_ZONES.md`): every word, number, logo, face and call to action inside the safe zone; the render
  checks it; look at the platform mockups before publishing and at the live post after.

- Open on the surprise in the first 5 seconds, never on a title card.
- Only facts checked by hand, dated; businesses named only positively or neutrally; company names only for clients;
  client figures with their true source and date; client quotes word for word from saved chats.
- No em or en dashes, never mention Fiverr, never stress the +91 number, no address or country.
- End hook: one clear ask (a keyword to comment, or the episode's question) plus subscribe.
- The narrator is a synthetic voice that is not any real person. YouTube's AI question asks about making a real person say
  things, altering real footage, fake realistic scenes or AI music; none apply, so the answer is No.

## Sound: never publish a silent video (Manav, 16 Nov 2026)

"I need voiceover and background music, or somewhere variations, but mute posts doesn't make sense."
The 14 Nov Chicago Reel and the 15 Nov 7:19 pm Denver HVAC Reel went out with a silent audio track; an ffprobe
"has an audio stream" check passed on them, so loudness is now measured.

- Every Reel, Short, episode, video post and video Story has sound. Default: narration over our original beat
  (`reel_voice.py`). Variations are welcome (a different beat seed, a beat-led cut with a short spoken hook), but
  never silence. If the narrator cannot be made, use the original beat alone (`reel_music.py`) and say so in the report.
- Mux and check with `python3 tools/video/finalize.py video_only.mp4 mix.wav out.mp4`. It refuses (prints SILENT and
  exits with an error) when there is no audio stream, the sound is too quiet (mean under -30 dB or peak under -12 dB)
  or it stops before the picture. Never upload a file it rejected. `make.py` runs the same check on episodes and Shorts.
- Never pick Meta's music library (licensing on business accounts); our beat is original.
- After publishing, open the live Facebook Reel and the Instagram post: the audio line must read "Original audio".
  If a live video turns out silent, tell Manav at once with a PushNotification; never delete a public post yourself.
- Feed posts on Instagram and Facebook that carry a message (tips, offers, results) go out as short narrated videos
  (10 to 25 seconds, 1080x1350 or 1080x1920, slides animated with the kit, `reel_voice.py` sound, `finalize.py` check),
  not as silent images. LinkedIn carousels (PDF documents) stay as they are.

## Design system v2 (17 Nov 2026): reel_studio, media_plan, make_reel

Why: every Reel was the same small navy card in an empty frame, photos floated or were cropped, the voice never
changed and captions never said what a post proved. Now:

* `reel_studio.py` is a brand-neutral engine with full-frame layouts: poster (hook), stat, mythfact, proof
  (screenshot shown whole, plus a magnified lens on the key line), steps, talk (founder standing on the frame edge),
  quote, book, cta and cover. Five palettes per brand. It checks the safe zone and the fonts' glyphs on every frame.
* `brand_businesssanta.py` holds the Business Santa identity (palettes, fonts, voices, beats, arcs, banned words).
* `media_plan.py` picks the next post's story arc, palettes, hook type, voice and beat so neighbours never repeat,
  and writes the caption with a "What this proves" line plus source and date; `lint()` blocks bad captions.
* `reel_voice.py --voice --speed --beat` rotates Kokoro voices (blends allowed, e.g. `am_michael+am_fenrir`) and
  shapes the pace (hook faster, ask slower). `reel_music.py` has five original styles: upbeat, pluck, lofi,
  cinematic, ambient, at the same loudness.
* `make_reel.py spec.json out/` builds the whole Reel (frames, cover, voice, beat, video, sound check, sheet.jpg and
  qa.json) and refuses to finish when a QA rule fails.
* `render_episode.py` (YouTube 16:9): `shot` scenes show the whole screenshot below the header, with the highlighted
  block outlined and repeated in a lens (`say=` adds the line it proves); the founder stands on the bottom edge in
  the CTA; list, quote, three and fixes scenes now fill the frame to the safe bottom.

Evidence screenshots for vertical video: capture them at a phone width (about 430 css px) so they read natively.
