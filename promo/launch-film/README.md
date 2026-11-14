# Launch film

A 33-second launch film for Satgas, 1920×1080 at 60 fps, written as one HTML page and rendered to MP4.

It follows the HyperFrames composition shape used by [Null Motion](https://github.com/blixvip/NullMotion): a fixed-size
`#root`, and one paused GSAP timeline exposed as `window.__timelines.root`. Nothing runs on its own clock, so any frame
can be drawn by seeking the timeline. The kinetic headline, prompt composer, hub-and-nodes and click moves are adapted
from Null Motion's templates (MIT).

| Time | Scene                                                                               |
| ---- | ----------------------------------------------------------------------------------- |
| 0:00 | Hook: a wall of four agent terminals, one of them stuck. They collapse into a point |
| 0:04 | The mark forms from that point as a 3D object, then the tagline                     |
| 0:08 | 01 Ask: one request typed into the composer, which becomes the lead's speech bubble |
| 0:12 | 02 Plan: the lead hires four members down lit wires                                 |
| 0:16 | 03 Work: the camera whips down to the board, results land as tasks finish           |
| 0:22 | Three proof beats cut with whip pans: real files, diffs and undo, your own agents   |
| 0:28 | End card                                                                            |

The cuts sit on the music's grid: 100 BPM, with the logo hit, the send click, the whip and the end card on its bars.

## How it is built

- `index.html`, `film.css`, `film.js`: the scenes, the look and the timeline. Type, panels and UI are plain HTML.
- `gl/backdrop.js`: the stage behind every scene, one fragment shader (flowing light, a floor in perspective, dust,
  shock rings, speed lines). The timeline moves its light; it has no clock of its own.
- `gl/mark.js`: the Satgas mark as a 3D object in three.js. Its pose is plain state the timeline animates.
- `render.mjs`: seeks frame by frame in headless Chromium, then a finishing pass in FFmpeg adds bloom and film grain.
- `audio/`: the sound. `cues.json` places a music bed and every sound effect on the film's clock, `mix.py` mixes them.

Fonts, faces, brand marks and GSAP come from `site/assets`, so the film uses the landing page's own look.

## Render

Needs Playwright with Chromium, FFmpeg on `PATH`, and Python 3 with numpy for the sound.

```sh
cd promo/launch-film
npm install                                    # three.js, used only to draw the film
node render.mjs --out out/picture.mp4          # the silent picture; about 18 minutes on four cores
sh audio/fetch.sh                              # downloads the sounds listed in audio/sources.json
python3 audio/mix.py out/picture.mp4 out/satgas-launch.mp4
```

```sh
node render.mjs --serve                # watch it live in a browser
node render.mjs --stills 5.3,24        # finished PNG stills at those seconds
node render.mjs --from 4 --to 8        # render part of it
python3 audio/mix.py out/picture.mp4 out/music-only.mp4 --no-sfx
```

## Sound

The music and sound effects are from [Mixkit](https://mixkit.co), used under its free licences. Those licences allow
them inside a video but not handing the files on by themselves, so the audio is not in this repository:
`audio/sources.json` lists each file and `audio/fetch.sh` downloads it.

Edit the copy in `index.html`, the timing in `film.js`, the look in `film.css` and the sound in `audio/cues.json`.
