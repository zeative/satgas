# Fonts with a point of view

Type is the first thing that tells a person this was designed. Defaults (Geist, Inter, system-ui) and the stock "elegant"
serifs make every product look like the same template. Pick from here, by the character of the target's own type.

Every family below is free for commercial use. Load it in `index.html`:

- Google Fonts: `<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap" rel="stylesheet">`
- Fontshare (ITF's free library, the faces most featured Dribbble shots use): `<link href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700&display=swap" rel="stylesheet">`

## Never

Never: Geist, Inter, Inter Tight, Roboto, Open Sans, Lato, Poppins, Montserrat, DM Sans, Manrope, Plus Jakarta Sans,
Outfit, Figtree, Nunito, Space Grotesk, Jost, system-ui alone.

Never as a display serif: Playfair Display, Instrument Serif, Fraunces, Cormorant, DM Serif Display, EB Garamond, Lora,
Libre Baskerville, Newsreader, Cinzel.

These are what every generated page already uses. A serif at all only when the target's own headlines are serif.

## Display faces, by character

| Character | Fontshare | Google Fonts |
|---|---|---|
| Wide, loud, geometric | Clash Display, Panchang, Clash Grotesk | Unbounded, Syne, Krona One, Michroma, Archivo (wdth 125) |
| Tall, condensed, poster | Tanker, Bebas Neue (Fontshare) | Big Shoulders Display, Anton, Barlow Condensed, Saira Condensed |
| Warm, quirky grotesk | Cabinet Grotesk, Chillax, General Sans | Bricolage Grotesque, Familjen Grotesk, Darker Grotesque, Funnel Display |
| Crisp, technical | Switzer, Supreme | Schibsted Grotesk, Host Grotesk, Instrument Sans, Geologica |
| Round, soft, friendly | Pally, Ranade | Fredoka, Gabarito, M PLUS Rounded 1c |
| Chunky, playful | Stardom, Britney | Bagel Fat One, Dela Gothic One, Tilt Warp, Titan One |
| Serif with character | Zodiak, Gambetta, Erode, Boska, Sentient, Bespoke Serif, Melodrama | Young Serif, Gloock, Bodoni Moda, Libre Caslon Display, Gilda Display |
| Mono, for figures and meta | — | Martian Mono, JetBrains Mono, IBM Plex Mono, Azeret Mono, Chivo Mono |

## Text faces

Satoshi, General Sans, Switzer, Supreme, Author (Fontshare); Hanken Grotesk, Instrument Sans, Schibsted Grotesk, Onest,
Albert Sans, Golos Text (Google Fonts).

## How to choose

1. Name the target's type: wide or condensed, geometric or humanist, quirky or neutral, serif or sans, how heavy. Write
   it in `design/directions.md` next to each direction.
2. Pick a display face of that character and a text face that is different from it. A product with one family for
   everything looks unfinished, unless that family has real display cuts (Bricolage Grotesque's optical sizes,
   Archivo's widths).
3. Each of the three directions gets its own display face, from different rows.
4. See them set before you commit: `node <this skill>/scripts/fonts.mjs "Clash Display" "Satoshi" "Young Serif"` makes
   `design/fonts.png`, each face at headline (600 and 800) and body size with the product's own words. Ask for a width
   with `"Archivo:wdth=125"`, then set it with `font-stretch: 125%` on the display token's users.
5. Set them in `src/index.css`: `--font-display` for headlines and big figures, `--font-sans` for text, `--font-mono`
   for figures when the target uses a mono. ui-check fails when a font is missing or on the never list.
