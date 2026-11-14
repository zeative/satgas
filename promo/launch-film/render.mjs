// Renders the launch film to MP4: seeks the paused timeline one frame at a time, so no frame is ever dropped.
//   node promo/launch-film/render.mjs                   whole film -> out/satgas-launch.mp4 (silent picture)
//   node promo/launch-film/render.mjs --stills 1,5.5    PNG stills at those seconds -> out/
//   node promo/launch-film/render.mjs --serve           serve the film at http://localhost:4700 to watch it live
//   --from 4 --to 8 renders part of it, --fps 30 halves the frames, --jobs 1 uses a single browser,
//   --raw skips the finishing pass (bloom and grain), --dir writes somewhere other than out/.
// Needs `npm install` in this folder (three.js), Playwright with Chromium, and FFmpeg on PATH.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const out = resolve(flag("--dir") ?? join(here, "out"));
const fps = Number(flag("--fps") ?? 60);
const jobs = Number(flag("--jobs") ?? Math.min(4, availableParallelism()));
const stills = flag("--stills")?.split(",").map(Number);

// The film imports modules, which a browser will not load from file://, so it is served from the repository root.
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
Object.assign(TYPES, {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
});
const server = createServer((req, res) => {
  const file = normalize(join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!file.startsWith(repo) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
});
await new Promise((ready) => server.listen(args.includes("--serve") ? 4700 : 0, "127.0.0.1", ready));
const url = `http://127.0.0.1:${server.address().port}/promo/launch-film/index.html`;

if (args.includes("--serve")) {
  console.log(`${url}#play`);
} else {
  const { chromium } = createRequire(import.meta.url)("playwright");
  mkdirSync(out, { recursive: true });
  // One browser per job: pages in the same browser share a compositor and would take turns.
  async function openFilm() {
    const browser = await chromium.launch({ args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    page.on("pageerror", (error) => console.error(`page error: ${error.message}`));
    page.on("console", (message) => message.type() === "error" && console.error(`page: ${message.text()}`));
    await page.goto(url);
    await page.waitForFunction(() => window.__ready && [...document.images].every((img) => img.complete), null, { timeout: 120000 });
    return { browser, page };
  }
  const seek = (page, time) =>
    page.evaluate((t) => {
      window.__timelines.root.time(t);
      window.__frame();
    }, time);
  const ffmpeg = (ffmpegArgs, stdin = "ignore") => {
    const child = spawn("ffmpeg", ["-y", "-loglevel", "error", ...ffmpegArgs], { stdio: [stdin, "inherit", "inherit"] });
    const done = new Promise((ok, fail) => {
      child.on("error", fail);
      child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`))));
    });
    return { child, done };
  };
  // The finishing pass: highlights bloom into their surroundings, then fine grain that changes every frame.
  const FINISH =
    "format=gbrp,split[a][b];[b]curves=all='0/0 0.5/0 1/1',gblur=sigma=26[glow];[a][glow]blend=all_mode=screen:all_opacity=0.38,noise=alls=5:allf=t,format=yuv420p";
  const finish = args.includes("--raw") ? ["-pix_fmt", "yuv420p"] : ["-filter_complex", FINISH];

  if (stills) {
    const { browser, page } = await openFilm();
    for (const time of stills) {
      await seek(page, time);
      const raw = join(out, `.still-${time.toFixed(2)}.png`);
      await page.screenshot({ path: raw });
      const file = join(out, `still-${time.toFixed(2).padStart(5, "0")}.png`);
      await ffmpeg(["-i", raw, ...finish, "-frames:v", "1", "-update", "1", "-pix_fmt", "rgb24", file]).done;
      rmSync(raw);
    }
    console.log(`${stills.length} stills in ${out}`);
    await browser.close();
  } else {
    const file = flag("--out") ?? join(out, "satgas-launch.mp4");
    const first = await openFilm();
    const duration = await first.page.evaluate(() => window.__timelines.root.duration());
    const start = Math.round(Number(flag("--from") ?? 0) * fps);
    const end = Math.round(Number(flag("--to") ?? duration) * fps);
    const encode = [...finish, "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-r", String(fps)];
    // Each job renders its own run of frames to a part; the parts start on a keyframe, so joining them is a plain copy.
    const perJob = Math.ceil((end - start) / jobs);
    const parts = [];
    let drawn = 0;
    const began = Date.now();
    await Promise.all(
      Array.from({ length: jobs }, async (_, job) => {
        const from = start + job * perJob;
        const to = Math.min(end, from + perJob);
        if (from >= to) return;
        const part = join(out, `.part-${job}.mp4`);
        parts[job] = part;
        const { browser, page } = job === 0 ? first : await openFilm();
        const input = ["-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-"];
        const { child, done } = ffmpeg([...input, ...encode, part], "pipe");
        for (let frame = from; frame < to; frame++) {
          await seek(page, frame / fps);
          const png = await page.screenshot({ type: "png" });
          if (!child.stdin.write(png)) await new Promise((drain) => child.stdin.once("drain", drain));
          if (++drawn % 120 === 0) console.log(`${drawn} of ${end - start} frames, ${((Date.now() - began) / 1000).toFixed(0)}s`);
        }
        child.stdin.end();
        await done;
        await browser.close();
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
    console.log(`${end - start} frames at ${fps} fps -> ${file}`);
  }
  server.close();
}
