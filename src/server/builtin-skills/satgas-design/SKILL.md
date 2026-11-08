---
name: satgas-design
description: "How anything visual gets made in Satgas so it does not come out plain: an art direction from real reference sites, one visual moment that carries the page, and the material for it (backgrounds, patterns, icons, logos, fonts, characters, photos, animations, colour scales, motion libraries) taken from licensed sources by a script that saves the real files, then a review against the references. Load it for anything people look at, before the first line of markup, even when the request never mentions design: a website, landing page, app screen, dashboard, game, deck, poster, social graphic, banner, illustration, a document with visuals, an HTML page on the board."
---

# Satgas design

Plain pages come from three habits: no reference to aim at, nothing on the page worth remembering, and only the cheapest material (a font and a few icons) taken from anywhere. This skill fixes all three. Hallmark still sets the floor (spacing, contrast, no slop); this sets the ceiling.

Every visual deliverable goes through four steps, in order. A step without its evidence did not happen.

1. **Direction.** Find three reference sites that are clearly better than an average site in the same field, and shoot them with `ref`. Write `design/direction.md`: what each reference does that we take (specific: "a full-bleed photo collage with a tight serif headline over it", never "clean and modern"), the moment you will build (below), the palette as hex values, the type pair, and the motion. When your task is the art direction itself, also put the reference shots and the palette on the board.
2. **The moment.** Build the one centerpiece first, from the menu below and the map for what you are making. It sits in the first screen and takes at least a third of it.
3. **Build** the rest around it, with material from the map. Quiet chrome, one accent; the moment carries the colour.
4. **Review.** Run `review` on the result. It fails a page without a moment, with broken pictures or a page wider than a phone. Open `design/review/compare.jpg`, the build next to its references, name the three biggest gaps in your report, fix them, and run `review` again. Two rounds at most.

## What you are making, and where its material comes from

Read the row that matches the work and use every column. These are where to look first, not the only things allowed.

| Making | Study with `ref` | The moment | Background and texture | Type | Pictures and icons | Motion |
| --- | --- | --- | --- | --- | --- | --- |
| A software, app or AI product site | 3 leaders in the category, plus `recent.design`, `saaslandingpage.com` | A product preview built in code: the real screen with plausible data, in a window frame, over a glow | `bg mesh` dark with the brand colour, `bg fffuel gggrain` over it at low opacity | `font` a grotesk (Geist, Inter Tight, General Sans) | `icon lucide`, integration logos with `logo` | `lib motion`: the preview rises in, numbers tween |
| A café, restaurant, shop or local business | 3 respected places of the same kind, `onepagelove.com` | Photo-led: a collage or full-bleed of real photos (`photo`), or an illustrated scene of the place | `pattern hero` (topography, texture) or `bg fffuel gggrain` warm, never a flat fill | `font` a characterful serif or display from Fontshare, a calm sans for text | `photo unsplash`/`pexels` (key), `icon phosphor` duotone, `logo whatsapp` | `lib gsap scrolltrigger`: the menu and photos reveal as you scroll |
| An event, festival, launch or promo | `recent.design`, past editions of similar events | A loud poster-like hero: huge display type over a rendered scene | `bg fffuel bbburst` or `ffflux`, or `bg mesh` with saturated colours | `font` a bold display from Fontshare | `avatar open-peeps` crowds, `icon tabler` | `lottie "confetti"` or a GSAP intro timeline |
| A game in the browser | 3 polished web or mobile games of the same kind | The playfield itself: characters, sprites and juicy feedback, never a form with a button | `bg fffuel ssspot` or `uuunion` behind the board | `font` a playful display | `avatar` (DiceBear) characters, `lottie` for win and lose, `icon phosphor` | `lib gsap`: shake, pop and particles on every action |
| A poster, social graphic or banner | 3 posters in the same genre | One image doing all the work: a rendered scene with the key number or word huge over it | `bg mesh` or `bg gradientshub`, `bg fffuel gggrain` on top | `font` a display face, at most two families | `logo` when a brand appears | none (still image) |
| A portfolio, personal, agency or editorial site | `onepagelove.com`, `siteinspire.com`, 3 studios in the field | Kinetic type or a curated work grid with real pictures | `pattern hero` subtle, or plain paper with `bg fffuel nnnoise` | `font` an editorial serif with a grotesk | `photo` or the person's own work | `lib gsap scrolltrigger` for the type |
| Something for kids, schools, communities or a playful brand | 3 friendly brands of the same kind | An illustrated scene of people doing the thing | `bg fffuel uuunion` or `ssspot`, bright | `font` a rounded display | `avatar open-peeps`, `avatar notionists`, `icon phosphor --weight duotone` | `lottie` characters, `lib motion` springs |
| A dashboard, admin or app screen | `vercel.com/geist`, `primer.style`, 3 products in the field | The main chart, drawn with care, with real-looking data | none: surfaces only | `font` a grotesk with tabular figures | `icon lucide`, `color radix` for the scales | `lib motion` for state changes only |
| A deck or report | 3 decks or reports from the field | One rendered cover and one striking chart | `bg mesh` cover, `pattern hero` dividers | `font` a display for titles, a sans for text | `icon lucide` | none |

How it should feel changes the picks: calm or premium wants `bg mesh` at low contrast and lots of space; bold wants `bbburst`, saturated colours and huge type; warm wants grain, a serif and photos; technical wants a dark mesh, a grotesk and a product preview; playful wants characters, rounded type and Lottie.

## The moment

The page is remembered for one thing. Without an image generator, build it from these:

- **A rendered scene:** `bg mesh` full bleed in the palette, grain over it, the headline on its calm part.
- **A product preview in code:** the real interface with believable data, in a device or window frame.
- **An illustrated scene:** Open Peeps or DiceBear characters composed with patterns and shapes into one picture of the thing happening.
- **An animated centrepiece:** a Lottie animation, or a composition GSAP brings to life.
- **Real photos, art-directed:** cropped hard, duotoned or set in a collage, never one stock photo in a box.
- **Kinetic type:** a display face set huge, textured, moving on scroll.
- **A data moment:** one chart people would screenshot.

A small icon, a plain gradient fill, a centred headline with two buttons, or a single stock photo in a rounded box is not a moment.

## The script

Run it from the folder that holds the page or app (for a Vite app, the app's own folder). It records every file it writes in `design/sources.md` with where it came from and its license; that file is the proof the material is real, so never write it by hand.

```sh
node <this skill's folder>/scripts/source.mjs list            # every source, what it gives, its license
```

| Need | Command |
| --- | --- |
| References to study | `ref https://site-a https://site-b https://site-c` shoots each at 1280 and 390 into `design/refs/` |
| A rendered background | `bg mesh --colors "#0b0b0f,#3a1a0c,#d0561d" --size 1920x1080 --out assets/hero.jpg` (another `--seed` gives another image) |
| Grain, noise, fluid, waves, shapes | `bg fffuel <gggrain\|nnnoise\|ffflux\|sssurf\|uuunion\|ssspot\|bbburst> --colors "#a,#b" --out assets/bg.svg` |
| A ready gradient picture | `bg gradientshub blue` lists matches, then `bg gradientshub <name> --size 1920x1080 --out assets/bg.jpg` |
| A repeating pattern | `pattern hero` lists the 87, then `pattern hero topography --color "#d0561d" --opacity 0.3` |
| Icons | `icon lucide house search` (or `tabler`, or `phosphor --weight duotone`) |
| A brand's logo | `logo stripe github` in their colours, `logo stripe --mono` for one colour |
| A font, self-hosted | `font "Space Grotesk" --weights 400,500`, then link `assets/fonts/space-grotesk.css`; Fontshare families (Chillax, Satoshi, General Sans) come by the same command |
| Characters and avatars | `avatar open-peeps ana budi citra`, `avatar notionists ana` |
| Photos | `photo unsplash "coffee bar morning light" --count 6` |
| An animation | `lottie "success check"`, played with `lib lottie-web` |
| A colour scale | `color radix slate amber` gives light and dark CSS variables |
| Motion libraries | `lib gsap scrolltrigger` or `lib motion` |
| The review | `review index.html` (or the app's address) after building; it compares with `design/refs/` |
| Something from outside the list | `note assets/x.svg --from https://where.it.came.from --license "CC0"` |

Components come from their own tools: `bunx shadcn@latest add <component>` in a React and Tailwind project; Radix Primitives, Magic UI, React Bits, HyperUI and Uiverse are read and adapted, never pasted in with their demo styling.

## Gotchas

- **Fonts and icons alone are not material.** A page whose `design/sources.md` holds only fonts and icons has skipped the map; go back to your row.
- **Find references by searching.** Look up the best sites in the field (award galleries, the category's leaders), then shoot them with `ref`. A site that blocks the browser is skipped; replace it.
- **A theme names a font: fetch that font.** When hallmark's theme sets the family, pass that exact family to `font`.
- **Order the colours.** `--colors` fills a generator's fields in order and the first is usually the backdrop: on a dark page put the dark colour first.
- **Photos need a key.** Unsplash and Pexels refuse requests without one. Ask with `request_secret` on the satgas_team connector for a free key, then pass `--key-file <the path it returns>`. Until then, pick another moment rather than a stock picture from elsewhere.
- **Gradient Lab is to look at, not to export.** Its export asks for an email; render backgrounds with `bg mesh`.
- **References are studied, never copied.** Never put their shots, text or layout wholesale into the page.
- **Nothing is installed globally.** Fonts, icons and libraries land in the project as files, so the page works offline.
