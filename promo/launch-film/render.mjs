// Renders the launch film to MP4: seeks the paused timeline one frame at a time, so no frame is ever dropped.
//   node promo/launch-film/render.mjs                   whole film -> out/satgas-launch.mp4
//   node promo/launch-film/render.mjs --stills 1,5.5    PNG stills at those seconds -> out/
//   --scale 2 renders 3840x2160, --jobs 1 renders in a single browser page (the default is one per core, up to 4)
// Needs Playwright with Chromium, and FFmpeg on PATH for the MP4.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const fps = Number(flag("--fps") ?? 30);
const scale = Number(flag("--scale") ?? 1);
const jobs = Number(flag("--jobs") ?? Math.min(4, availableParallelism()));
const stills = flag("--stills")?.split(",").map(Number);

const { chromium } = createRequire(import.meta.url)("playwright");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
async function openFilm() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(join(here, "index.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__timelines?.root && [...document.images].every((img) => img.complete));
  return page;
}
const seek = (page, time) =>
  page.evaluate((t) => {
    window.__timelines.root.time(t);
    window.__frame?.();
  }, time);
const ffmpeg = (ffmpegArgs, stdin = "ignore") => {
  const child = spawn("ffmpeg", ["-y", "-loglevel", "error", ...ffmpegArgs], { stdio: [stdin, "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
  return { child, done };
};

if (stills) {
  const page = await openFilm();
  for (const time of stills) {
    await seek(page, time);
    await page.screenshot({ path: join(out, `still-${time.toFixed(2).padStart(5, "0")}.png`) });
  }
  console.log(`${stills.length} stills in ${out}`);
} else {
  const file = flag("--out") ?? join(out, "satgas-launch.mp4");
  const first = await openFilm();
  const duration = await first.evaluate(() => window.__timelines.root.duration());
  const frames = Math.round(duration * fps);
  const encode = ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p"];
  // Each job renders its own run of frames to a part; the parts start on a keyframe, so joining them is a plain copy.
  const perJob = Math.ceil(frames / jobs);
  const parts = [];
  await Promise.all(
    Array.from({ length: jobs }, async (_, job) => {
      const from = job * perJob;
      const to = Math.min(frames, from + perJob);
      if (from >= to) return;
      const part = join(out, `.part-${job}.mp4`);
      parts[job] = part;
      const page = job === 0 ? first : await openFilm();
      const input = ["-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-"];
      const { child, done } = ffmpeg([...input, ...encode, part], "pipe");
      for (let frame = from; frame < to; frame++) {
        await seek(page, frame / fps);
        const png = await page.screenshot({ type: "png" });
        if (!child.stdin.write(png)) await new Promise((resolve) => child.stdin.once("drain", resolve));
      }
      child.stdin.end();
      await done;
      console.log(`frames ${from} to ${to - 1} done`);
    }),
  );
  const list = join(out, ".parts.txt");
  writeFileSync(
    list,
    parts
      .filter(Boolean)
      .map((part) => `file '${part}'\n`)
      .join(""),
  );
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", file]).done;
  for (const part of [...parts.filter(Boolean), list]) rmSync(part);
  console.log(`${frames} frames, ${duration}s -> ${file}`);
}
await browser.close();
