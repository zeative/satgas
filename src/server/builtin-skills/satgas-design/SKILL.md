---
name: satgas-design
description: "Where everything visual gets its material: backgrounds, patterns, icons, logos, fonts, avatars, photos, animations, colour scales, motion libraries and reference shots, taken from licensed sources by a script that saves the real files into the project and records each one. Load it for anything people look at, before the first line of markup, even when the request never mentions design: a website, landing page, app screen, dashboard, component, deck, poster, social graphic, banner, illustration, a document with visuals, an HTML page on the board."
---

# Satgas design sources

A generated page gives itself away by what it draws on the spot: a blob for a background, an icon traced by hand, a font nobody chose, a logo replaced by a letter in a circle. This skill takes that material from proven, licensed sources instead, and saves the real files into the project. Hallmark still decides how the page looks; this decides what it is made of.

## The rule

1. **Take from the sources first.** Draw your own only when nothing here fits the brief, and say in your report what you drew and why.
2. **One source per kind on a page.** One icon set, one or two font families, one illustration style.
3. **Fit it to the brief.** Pass the palette in `--colors`, recolour SVGs to the tokens, size images to where they sit.
4. **Credit what asks for it.** `design/sources.md` marks those; copy the credit line into the page's footer or the project's notices.

## The script

Run it from the project's folder. It writes into the project and records every file in `design/sources.md`, with where it came from and its license; that file is the proof the material is real, so never edit it by hand.

```sh
node <this skill's folder>/scripts/source.mjs list            # every source, what it gives, its license
```

| Need | Command |
| --- | --- |
| A background in the page's colours | `bg mesh --colors "#0b0b0f,#3a1a0c,#d0561d" --size 1920x1080 --out assets/hero.jpg` (another `--seed` gives another image) |
| A grain, noise, fluid or wave backdrop | `bg fffuel <gggrain\|nnnoise\|ffflux\|sssurf\|uuunion\|ssspot\|bbburst> --colors "#a,#b" --out assets/bg.svg` |
| A ready gradient photo | `bg gradientshub blue` lists matches, then `bg gradientshub <name> --size 1920x1080 --out assets/bg.jpg` |
| A repeating pattern | `pattern hero` lists the 87, then `pattern hero topography --color "#d0561d" --opacity 0.3` |
| Icons | `icon lucide house search arrow-right` (or `tabler`, or `phosphor --weight bold`) |
| A brand's logo | `logo stripe github` in their colours, `logo stripe --mono` for one colour |
| A font, self-hosted | `font "Space Grotesk" --weights 400,500` then link `assets/fonts/space-grotesk.css` |
| People, avatars | `avatar notionists ana budi`, `avatar open-peeps citra` |
| Photos | `photo unsplash "coffee bar morning light" --count 3` |
| A small animation | `lottie "success check"`, played with `lib lottie-web` |
| A colour scale | `color radix slate amber` gives light and dark CSS variables |
| Motion libraries, vendored | `lib gsap scrolltrigger` or `lib motion` |
| References to study | `ref https://linear.app https://stripe.com` screenshots each at 1280 and 390 into `design/refs/` |

Components come from their own tools, not this script: `bunx shadcn@latest add <component>` in a React and Tailwind project; Radix Primitives, Magic UI, React Bits, HyperUI and Uiverse are read and adapted, never pasted in with their demo styling. `list components` shows them.

## Gotchas

- **Order the colours.** `--colors` fills a generator's colour fields in order, and the first is usually the backdrop: on a dark page put the dark colour first, or the texture disappears into it.
- **Photos need a key.** Unsplash and Pexels refuse requests without one. Ask the person with `request_secret` on the satgas_team connector for a free key, then pass `--key-file <the path it returns>`.
- **Gradient Lab is to look at, not to export.** Its export and share link ask for an email, so it is listed as a reference; render the background with `bg mesh` instead.
- **References are studied, never copied.** `ref` shots go in `design/refs/` to compare the build against; never put them, or text lifted from them, into the page.
- **A rendered background is an image.** Use it with `background-image` or an `<img>`; keep text on its calm part and check the contrast there.
- **Nothing is installed globally.** Fonts, icons and libraries land in the project as files, so the page works offline and needs no CDN.
