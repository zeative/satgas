# The bar

What a finished interface meets, whoever built it. The build works to it, the check measures part of it, and the review holds the rest. Every rule here came from a real failure.

## Three laws that outrank taste

1. **Honesty before beauty.** Show nothing the page does not know. An unknown value reads as unknown, not zero. No invented numbers, testimonials, logos, progress or sample data dressed as real.
2. **Failure never disguises itself.** A failed state looks different from one not started, a refused action says why, and a warning about something that cannot be undone is never folded away.
3. **Every path has a second path.** What a mouse can do, a keyboard can do. Colour always has a word or shape beside it. Every animation has a still version that still reads.

## Hierarchy

- Each screen answers one question for its visitor ("can I book a table tonight?", "which deploy failed?"). Write it down. Its answer is visible on the first screen at 1280 and at 390, without scrolling.
- One primary action per screen, at most one secondary beside it.
- About seven blocks of information at once; past that, the eye scans at random.
- Look away and back: what catches the eye first must be the answer. If it is not, the weights are wrong.
- When columns stack on a phone, the order still answers the question; a side column never lands above the main one.

## Polish, in this order

Finish each pass across the whole page before the next, because each changes how the later ones read. (Adapted from [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky, CC BY 4.0; condensed and changed for Satgas.)

1. **Spacing**: everything on a 4px grid; the same gap for the same relation; tighter inside a group than between groups; edges and icon columns line up.
2. **Colour**: one neutral ramp, three text roles (primary, secondary, muted), one accent used rarely for the action or the one figure that matters. No hue gradients on surfaces, no glows, no coloured shadows. Hairline borders at 6 to 10% of the text colour.
3. **Icons**: one set, one size, one stroke; they take their text's colour. No emoji as icons. A known brand is shown by its real, coloured logo, never a generic glyph.
4. **Copy**: headlines say what this does for whom, in words that would not fit a competitor. Buttons name what happens. No exclamation marks, hype words, greeting headlines or periods on labels. A line under a title that only restates it goes.
5. **Type**: one family for the interface, at most one partner (a display face or a mono). About five sizes from a ratio, weights 400 and 500 (600 rarely). Hierarchy from size and colour, not weight. Sentence case, no tracked capitals, `tabular-nums` for figures. Body lines 60 to 80 characters.
6. **Layout**: real proportions for the kind of page; long headlines align left; a hero is one idea with one action; the first screen is composed as a whole, with no dead band.
7. **Details**: nested radii (inner = outer minus the padding, never below 4); cards in a row share one shape and height; counts and meta are quiet text, not pills; focus is visible; every hover has a reason.
8. **Visuals**: one rich moment the product owns (its real photo, its real screen, a chart drawn with care). Decorative blobs, orbs and fake windows go.
9. **Motion**: only where it explains a change; transform and opacity only; never `transition: all`; reduced motion honoured.

## Density by kind

- **Marketing and editorial pages** breathe: generous section spacing (64 to 128px), a large display headline, a capped text column.
- **App screens and dashboards** are compact, like the tools people use all day: controls 28 to 32px tall (36 only for the one that leads), 14px text with 12px meta, 16px icons, 8px radius on controls, 12px on cards, 16px on dialogs, card padding 16px, grid gaps 12px, menu rows 28px. A small dialog is a header and one action row, with no reserved empty height.

## Every region that shows data has five states

Loading (shaped like what is coming, never random widths), empty (why, and the one action that fixes it), failed (what, why, a way out; stale data stays on screen under the notice), refreshing (a quiet marker, no skeleton), populated. Pictures get a fixed box from the first render and a fallback, never a broken-image icon. Forms keep labels visible, validate on blur, attach errors to their field, and never lose what was typed.

## Small things that decide it

- Commands, paths, env vars, model ids and endpoints in copy are inline code.
- At most one line of muted text per block; a second one is usually saying the first again.
- No control shows when it cannot be used yet; no plumbing (how something is wired) shown to people who only need the choice and its state.
- Nothing grows beside a neighbour and leaves a hole; a truncating line has room to truncate (`min-width: 0`).

## Phones

- Check at 320, 390, 768 and 1024 wide. Open menus, dialogs and popovers at 390 too; a page check does not see them.
- The page never scrolls sideways: `overflow-x: clip` on `html` and `body`, wide content scrolls inside its own box, grid tracks are `minmax(0, 1fr)`, a one-column grid says so.
- Controls revealed on hover stay visible where there is no hover (`@media (hover: none)`). Targets are at least 44px on touch, never crowded.
- The page is rebuilt for the phone, not shrunk: readable sizes, the action within thumb reach, secondary content behind disclosure.

## Weight

A page that looks good and loads slowly is not done.

- Pictures carry `width` and `height`, are sized for where they show (no 4000px photo in a 600px slot), use `loading="lazy"` below the first screen and `decoding="async"`. The first picture loads eagerly.
- At most two font families, `font-display: swap`, the faces the first screen needs preloaded.
- A static page needs no framework. No library for an effect a few lines of CSS can do.

## Verify like a person would

- Read every screenshot, at both widths, before reporting. If a screenshot looks crowded or uneven, fix it; do not list it as a note.
- A page with light and dark themes is checked in both.
- Check every state you built (empty, failed, loading, open menus), not only the finished one.
