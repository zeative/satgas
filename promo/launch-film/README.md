# Launch film

A 36-second launch film for Satgas, 1920×1080 at 30 fps, written as one HTML page.

It follows the HyperFrames composition shape used by [Null Motion](https://github.com/blixvip/NullMotion): a fixed-size
`#root`, and one paused GSAP timeline exposed as `window.__timelines.root`. Nothing runs on its own clock, so any frame
can be drawn by seeking the timeline. The kinetic headline, prompt composer, hub-and-nodes and click moves are adapted
from Null Motion's templates (MIT).

Fonts, faces, brand marks and GSAP come from `site/assets`, so the film uses the landing page's own look.

| Time | Scene                                                          |
| ---- | -------------------------------------------------------------- |
| 0:00 | Hook: four agent terminals, one of them stuck                  |
| 0:04 | Logo and tagline                                               |
| 0:08 | 01 Ask: one request typed into the composer                    |
| 0:13 | 02 Plan: the lead hires four members                           |
| 0:18 | 03 Work: results land on the board as tasks finish             |
| 0:25 | Three proof beats: real files, diffs and undo, your own agents |
| 0:31 | End card                                                       |

## Preview

Open `index.html#play` in a browser to watch it in real time.

## Render

Needs Playwright with Chromium, and FFmpeg on `PATH`.

```sh
node promo/launch-film/render.mjs                  # out/satgas-launch.mp4
node promo/launch-film/render.mjs --stills 5.6,24  # PNG stills at those seconds
node promo/launch-film/render.mjs --scale 2        # 3840×2160
```

The film has no sound. Add music or a voice-over in an editor, or with
`ffmpeg -i out/satgas-launch.mp4 -i music.mp3 -c:v copy -shortest out/with-music.mp4`.

Edit the copy in `index.html`, the timing in `film.js` and the look in `film.css`.
