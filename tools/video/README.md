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

## Rules for every video

- Open on the surprise in the first 5 seconds, never on a title card.
- Only facts checked by hand, dated; businesses named only positively or neutrally; company names only for clients;
  client figures with their true source and date; client quotes word for word from saved chats.
- No em or en dashes, never mention Fiverr, never stress the +91 number, no address or country.
- End hook: one clear ask (a keyword to comment, or the episode's question) plus subscribe.
- The narrator is a synthetic voice that is not any real person. YouTube's AI question asks about making a real person say
  things, altering real footage, fake realistic scenes or AI music; none apply, so the answer is No.
