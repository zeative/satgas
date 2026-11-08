---
name: satgas-design
description: "How anything visual gets made in Satgas so it looks like a professional made it: two grey wireframes the person approves first, then its one memorable moment built alone and approved, then the quiet rest from real references and real material (photos, logos, fonts, icons, animations, motion libraries, colour scales) taken from licensed sources by a script that saves the files, then a review that fails the tells of generated work. Load it for anything people look at, before the first line of markup, even when the request never mentions design: a website, landing page, app screen, dashboard, game, deck, poster, social graphic, banner, illustration, a document with visuals, an HTML page on the board."
---

# Satgas design

The goal is work a professional would sign: it looks made by someone who knows this field, with real content and real pictures, not assembled by a tool. Hallmark sets the floor (spacing, contrast, states); this sets the bar above it.

## The default look: modern, current, elegant

Unless the person asks for another style, everything looks like what a top product or studio would ship today, and it has one thing people remember. Slop spreads colour and effects over everything. Flat work has none anywhere. Good work keeps almost everything quiet and spends it all on one moment.

The quiet base, which is everything except the moment:

- **Surfaces:** near-white, near-black, or one confident flat colour, from one neutral ramp, with a single accent.
- **Type:** a contemporary grotesk or a refined modern serif, at normal weights, with a real jump between sizes.
- **Layout:** a strict grid, generous space, hairlines instead of boxes.
- **Motion:** quick and subtle.
- **Never, unless asked:** retro, vintage, rustic, kitsch, childish or cartoon looks, paper and print textures, slab, ornamental, blackletter, pixel or handwritten faces, even when the subject is old or traditional. A traditional coffee shop still gets a modern site.
- **Hallmark themes:** do not deal one. Pick from `cobalt`, `console`, `dusk`, `grid`, `ink`, `midnight`, `refract`, `ribbon`, `rim`, `studio`, `vantage`, whichever fits the work; a game or a playful brief picks from them too.

## The moment

One element, two at most, carries nearly all the colour, material, depth and motion of the work. It is made from the product's own real thing: its data, its pieces, its subject. It shows what the product does instead of saying it. It lives where people spend the most time: a game's moment is its play and a tool's is its main screen. When it opens on a first screen, it carries on into that main screen instead of ending there.

Write it in one sentence, as `Moment:` in `design/direction.md`: what it shows and what makes it move. Then test the sentence:

- **Swap the name.** Put another product's name in the sentence. If it still fits, it is decoration; think again.
- **Say it to a stranger.** If they would not ask to see it, it is not the moment.
- **Take it away.** If the page would be just as good without it, it is not the moment.

What does not count: a bigger heading, a photo in a box, a gradient or grain backdrop, floating cards, a tilted screenshot, a glow, a nicely styled table that just sits there.

The shape of an answer, never to be copied: a billing product whose overdue row turns into a sent message, gets its reply and pays itself, with the total falling beside it; a typing race where each right letter pushes your car past the others; a fleet map where a truck running late lights its route and raises the alert; an architect's site where a villa photo folds into its floor plan as you scroll.

How to make it rich, with no image generator: real photos used large, and everything else built in code. Give it depth with layers, real light and shadow, and a scale several times anything around it. Tie its motion to what is happening, so every move means something, and let it play by itself so it shows on a small card. Spend the time here: it gets more care than the rest of the page together.

## Three rounds

Something new that people look at goes in three rounds, and each ends by asking the person. The structure is approved first, then the moment, and only then the rest, so a weak idea costs one piece and not a whole site.

A change to something that exists skips the wireframes. When it asks for more life, a new look, or says the work is flat or plain, it starts at round two.

## Round one: wireframes, then stop

Build nothing else in this round: no colours, no pictures, no fonts, no page in the project's real files.

1. **Study.** Search for three sites or pieces clearly better than average in the same field, and shoot them with `ref`.
2. **Write `design/direction.md`:** what each reference does that we take (specific: "menu as a plain price list in two columns", never "clean and modern"), the kind of picture the work will use and where it comes from, the palette as hex values, the type pair, and the `Moment:` line.
3. **Make two wireframes** with `wireframe a b`, then edit them. They are only grey and white blocks, with no text, pictures or icons at all: `.h1`, `.h2`, `.h3` and `.line` bars where words go, `.img` where a picture goes, `.btn` for actions, `.card` and `.tint` for surfaces. Size and place each block as it will really be, the moment's block largest of all. The two options differ in structure, not decoration: another order of sections, another hero, another way to show the main thing. A game shows its screens one under the other (start, playing, win). A poster shows its real proportions. Run `wireframe check` on both before you report.
4. **Stop and ask.** The words live in your report, since the wireframes have none: name the two options, say section by section what each block will hold and how they differ, state the moment, say which you recommend, and ask the person to pick one or say what to change. The wireframes show on the board by themselves.

When they ask for changes, change the wireframes and ask again.

## Round two: the moment alone, then stop

Build only the moment, as `design/moment.html`: one file that runs by itself with no build step, at its real size, with its real type, colours, material and motion, on the page's real background. Everything around it stays out. A game makes it a real slice that plays itself until someone touches it.

1. **Take its material** from your row of the map below, with the script.
2. **Build it, then look.** Shoot it at rest and in the middle of its motion, and open both. Fix what looks cheap: thin depth, stiff timing, a corner that gives away it was generated. Do this at least twice.
3. **Stop and ask.** Say in your report what it shows and ask the person whether this is the feeling they want. It shows on the board by itself.

When they say it is flat or wrong, bring a different idea, not a polish of the same one. Build nothing else until they approve.

## Round three: the rest, kept quiet

Follow the chosen wireframe's structure and copy; where reality forces a change, say so in your report.

1. **Move the moment in** as it was approved, without redrawing it, and carry it into the screen people spend the most time on.
2. **Take the rest of the material** from your row of the map, with the script, and build everything around the moment from the quiet base. Anything that starts competing with the moment gets calmer.
3. **Review.** Run `review` on the result. It fails a page without a main visual, with broken pictures, wider than a phone, or showing the tells below. Open `design/review/compare.jpg`, the build next to its references, name the three biggest gaps in your report, fix them, and run it again. Two rounds at most.

## What you are making, and where its material comes from

Read the row that matches the work and use it. Real pictures come first; a page without any is the exception and has to earn it through its type or its product.

| Making | Study with `ref` | The main visual | Pictures and icons | Type | Motion |
| --- | --- | --- | --- | --- | --- |
| A software, app or AI product site | 3 leaders in the category, `recent.design`, `saaslandingpage.com` | The real product built in code: the actual screen with believable data, large | Integration logos with `logo`, `icon lucide` | `font` one grotesk (Geist, Inter Tight, General Sans) at 400 and 500 | `lib motion`: one rise on load |
| A café, restaurant, shop or local business | 3 respected places of the same kind, `onepagelove.com` | Real photos, large and cropped with intent: the place, the people, the product | `photo openverse` (or `unsplash`, `pexels` with a key), `logo whatsapp`, `icon phosphor` | `font` a text serif or a warm grotesk from Fontshare, at normal weights | `lib gsap scrolltrigger`, used lightly |
| An event, festival, launch or promo | `recent.design`, past editions of similar events | Real photos of such events, or a strict typographic layout on one flat colour | `photo openverse`, `avatar open-peeps` only if the brief is playful | `font` one strong display at a normal weight, one text face | `lib gsap` for one opening move |
| A game in the browser | 3 polished games of the same kind (shoot them or their store pages) | The playfield fills the screen: pieces, numbers and feedback are the design, not a form inside a card | `lottie` for win and lose, `icon phosphor`, `bg fffuel ssspot` or `uuunion` only as a quiet backdrop | `font` a display with character, a clear text face | `lib gsap`: every action answers |
| A poster, social graphic or banner | 3 posters in the same genre | One real photo used boldly, or pure type on a flat colour; the key word or number set with care | `photo openverse`, `logo` when a brand appears | `font` a display at a normal weight, at most two families | none |
| A portfolio, personal, agency or editorial site | `onepagelove.com`, `siteinspire.com`, 3 studios in the field | The work itself, or strict type on paper | The person's own work, `photo openverse` | `font` an editorial serif with a grotesk | `lib gsap scrolltrigger` for reveals only |
| Something for kids, schools or a playful community | 3 friendly brands of the same kind | Real photos of people doing the thing, or an illustrated scene | `photo openverse`, `avatar open-peeps`, `avatar notionists`, `icon phosphor` | `font` a rounded text face | `lottie`, `lib motion` |
| A dashboard, admin or app screen | `vercel.com/geist`, `primer.style`, 3 products in the field | The main table or chart, with real-looking data | `icon lucide`, `color radix` for the scales | `font` a grotesk with tabular figures | `lib motion` for state changes only |
| A deck or report | 3 decks or reports from the field | One real cover photo and one chart drawn with care | `photo openverse`, `icon lucide` | `font` a text serif or grotesk | none |

## The tells

These are what make work read as generated. `review` fails the ones it can measure; hold yourself to the rest.

- **A gradient as the design:** a mesh or grainy gradient hero, a large gradient fill, gradient text. `bg mesh` and `bg gradientshub` are for a quiet section or when the person asks, never the page's main visual.
- **Fat display headings:** weight 800 or 900. Hierarchy comes from size and colour, at 400 to 600.
- **Tracked uppercase labels** above headings (`KEDAI KOPI LOKAL`), and a label above every section.
- **The template hero:** a big headline with two buttons on the left and one picture in a rounded box on the right, or a small card floating over the hero.
- **Shapes standing in for a picture:** a sun drawn from CSS, blobs, circles, decorative lines. A moment drawn in code is fine when it shows the product's real thing.
- **Neo-brutalism by default:** thick black borders with hard offset shadows, every control a pill.
- **Equal cards in a row,** each with an icon, a title and a vague line.
- **Copy that fits any business:** exclamation marks, hype words, invented numbers and claims.
- **One stock photo in a box,** as the only picture on the page.

Adapted from unslop's list of signs by Damir Sokolovsky (@heydamir), CC BY 4.0.

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
| Photos | `photo openverse "coffee bar morning light" --count 6` needs no key and records the credits to show; `unsplash` and `pexels` need one |
| Wireframes | `wireframe a b` starts `design/wireframe-a.html` and `-b.html` in grey blocks; `wireframe check design/wireframe-a.html` refuses text and pictures |
| An animation | `lottie "success check"`, played with `lib lottie-web` |
| A colour scale | `color radix slate amber` gives light and dark CSS variables |
| Motion libraries | `lib gsap scrolltrigger` or `lib motion` |
| The review | `review index.html` (or the app's address) after building; it compares with `design/refs/` |
| Something from outside the list | `note assets/x.svg --from https://where.it.came.from --license "CC0"` |

Components come from their own tools: `bunx shadcn@latest add <component>` in a React and Tailwind project; Radix Primitives, Magic UI, React Bits, HyperUI and Uiverse are read and adapted, never pasted in with their demo styling.

## Gotchas

- **`design/moment.html` loads material by relative path:** `../assets/...`, since it sits inside `design/`.
- **Fonts and icons alone are not material.** A page whose `design/sources.md` holds only fonts and icons has skipped the map; go back to your row.
- **Credit the photos.** Openverse photos carry a license that asks for a credit; put the lines `design/sources.md` lists in the page's footer.
- **Check every photo before using it.** Search results can be off topic or low quality; open each one, and search again with other words when it does not fit.
- **Find references by searching.** Look up the best sites in the field (award galleries, the category's leaders), then shoot them with `ref`. A site that blocks the browser is skipped; replace it.
- **A theme names a font: fetch that font.** When hallmark's theme sets the family, pass that exact family to `font`.
- **Order the colours.** `--colors` fills a generator's fields in order and the first is usually the backdrop: on a dark page put the dark colour first.
- **Unsplash and Pexels need a key.** Ask with `request_secret` on the satgas_team connector for a free one, then pass `--key-file <the path it returns>`, or use `photo openverse`.
- **Gradient Lab is to look at, not to export.** Its export asks for an email; render backgrounds with `bg mesh`.
- **References are studied, never copied.** Never put their shots, text or layout wholesale into the page.
- **Nothing is installed globally.** Fonts, icons and libraries land in the project as files, so the page works offline.
