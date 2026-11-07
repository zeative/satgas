# Reviewing a design

You review work you did not build, so you can see what its maker stopped seeing. Be specific and be strict: "the hero headline and the subhead are 2px apart in size, so neither leads" helps; "looks good" does not.

## 1. Evidence first

1. `satgas design check <page>`. Every high finding is a defect, whatever else is true.
2. Open both screenshots, desktop and phone, and the full-page ones. Look at them before you read any code.
3. `satgas design compare <build desktop.png> <reference desktop.png> ...` with the references from `design/refs/`, and look at the picture.
4. Read `design/brief.md`: the page is judged against what it set out to be.

## 2. The rubric

Score each from 1 to 5 against what a 5 looks like. Write one line of evidence for every score: what you saw, and where.

| | A 5 looks like |
| --- | --- |
| Focal point | Each screen has one thing that clearly leads, and the eye knows where to go next. |
| Type | A scale you can read off (about five sizes), two weights doing the work, a body text that is comfortable to read (60 to 80 characters a line). |
| Spacing | One rhythm: the same gaps for the same relations, tighter inside a group than between groups, edges that line up. |
| Colour | Quiet neutrals, one accent used rarely, every text readable, colour that means something. |
| Pictures | Real pictures of the real thing, cropped with intent, sharp at both widths. No stand-in decoration. |
| Copy | Says what this place or product does, for whom, in plain words; would not fit a competitor's page. No invented numbers or quotes. |
| Phone | Rebuilt for the phone, not shrunk: readable sizes, nothing sideways, targets you can tap, the action within reach. |
| Against the references | Holds its own next to the best reference in the comparison picture. |

Then walk [`craft.md`](craft.md): its three laws, the hierarchy test, the five states of each region that shows data, the phone rules and page weight. Each break is a finding.

## 3. Act

- Any score under 4, and every high finding: fix it if your task may change the files, otherwise hand it back as a ranked list with the fix for each.
- Fix the worst first: one change to the focal point or the type scale usually beats ten small ones. Within a fix, follow the craft bar's polish order: spacing, colour, icons, copy, type, layout, details, visuals, motion.
- Run the check again and take new screenshots after fixing. Report the scores and the check's counts before and after.
