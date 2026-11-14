// Satgas launch film: one paused GSAP timeline, exposed the HyperFrames way as window.__timelines.root.
// Nothing here runs on its own clock, so any frame can be drawn by seeking the timeline.
const gsap = window.gsap;
const $ = (sel) => document.querySelector(sel);
const FACES = "../../site/assets/faces";
const CHECK =
  '<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.4 6.6 11.4 12.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SPIN =
  '<svg class="spin" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="24 14" stroke-linecap="round"/></svg>';
const WAIT =
  '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 3"/></svg>';

const DURATION = 36.5;
const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });

const show = (sel, at, duration = 0.4) => tl.to(sel, { autoAlpha: 1, duration, ease: "power1.out" }, at);
const hide = (sel, at, duration = 0.35) => tl.to(sel, { autoAlpha: 0, duration, ease: "power1.in" }, at);
// Lines rise out of their masks, the kinetic-headline move.
const rise = (sel, at, vars = {}) => {
  gsap.set(sel, { yPercent: 112 });
  tl.to(sel, { yPercent: 0, duration: 0.8, ease: "power4.out", stagger: 0.1, ...vars }, at);
};
const land = (sel, at, vars = {}) => {
  gsap.set(sel, { opacity: 0, y: 26 });
  tl.to(sel, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", ...vars }, at);
};

// ── 1. Hook ────────────────────────────────────────────────────────────────
const TERMS = [
  {
    title: "claude — api",
    x: 150,
    y: 50,
    rot: -2,
    lines: [
      ["c", "$ claude"],
      ["", "● Read src/routes/orders.ts"],
      ["", "● Edit src/routes/orders.ts"],
      ["d", "  + 42  − 17"],
      ["", "● Bash bun test orders"],
      ["r", "  14 pass · 2 fail"],
      ["", "● Read tests/orders.test.ts"],
      ["", "● Edit src/lib/price.ts"],
      ["d", "  + 6  − 3"],
      ["", "● Bash bun test orders"],
      ["g", "  16 pass"],
      ["", '● Grep "formatPrice" src/'],
      ["", "● Edit src/routes/cart.ts"],
      ["d", "  + 11  − 4"],
      ["", "● Bash bun run typecheck"],
      ["g", "  no errors"],
      ["", "● Read src/routes/refunds.ts"],
      ["", "● Edit src/routes/refunds.ts"],
      ["d", "  + 23  − 9"],
      ["", "● Bash bun test"],
      ["g", "  212 pass"],
      ["c", "Done. Orders use formatPrice."],
    ],
  },
  {
    title: "codex — web",
    x: 1010,
    y: 30,
    rot: 1.6,
    lines: [
      ["c", "$ codex"],
      ["", '> exec rg "Hero" src/web'],
      ["", "> patch src/web/hero.tsx"],
      ["d", "  @@ -18,7 +18,12 @@"],
      ["", "> exec bun run build"],
      ["g", "  built in 2.41s"],
      ["", "> patch src/web/styles.css"],
      ["d", "  @@ -102,4 +102,9 @@"],
      ["", "> exec bun x prettier --write ."],
      ["", "> patch src/web/pricing.tsx"],
      ["d", "  @@ -5,3 +5,21 @@"],
      ["", "> exec bun run build"],
      ["g", "  built in 2.38s"],
      ["", "> exec git diff --stat"],
      ["d", "  3 files changed, 41 insertions"],
      ["", "> patch src/web/footer.tsx"],
      ["", "> exec bun run build"],
      ["g", "  built in 2.40s"],
      ["", "> patch src/web/nav.tsx"],
      ["d", "  @@ -1,6 +1,9 @@"],
      ["", "> exec bun run build"],
      ["g", "  built in 2.44s"],
    ],
  },
  {
    title: "claude — tests",
    x: 190,
    y: 640,
    rot: 1.2,
    stuck: true,
    lines: [
      ["c", "$ claude"],
      ["", "● Read tests/checkout.test.ts"],
      ["", "● Bash bun test checkout"],
      ["r", "  3 fail"],
      ["", "● Edit tests/checkout.test.ts"],
      ["d", "  + 9  − 2"],
      ["", "● Bash rm -rf dist"],
      ["a", "  Allow this command?  (y/n)"],
      ["c", '  <span class="blink">▍</span>'],
    ],
  },
  {
    title: "codex — docs",
    x: 1000,
    y: 660,
    rot: -1.5,
    lines: [
      ["c", "$ codex"],
      ["", "> exec ls docs"],
      ["", "> patch docs/setup.md"],
      ["d", "  @@ -1,4 +1,30 @@"],
      ["", "> patch docs/api.md"],
      ["d", "  @@ -40,6 +40,58 @@"],
      ["", "> exec bun x markdownlint docs"],
      ["g", "  0 problems"],
      ["", "> patch README.md"],
      ["d", "  @@ -12,3 +12,9 @@"],
      ["", "> patch docs/deploy.md"],
      ["d", "  @@ -0,0 +1,44 @@"],
      ["", "> exec bun x markdownlint docs"],
      ["g", "  0 problems"],
      ["", "> patch docs/faq.md"],
      ["d", "  @@ -3,2 +3,19 @@"],
      ["", "> exec git status --short"],
      ["d", "  M docs/setup.md  M docs/api.md"],
      ["", "> patch docs/changelog.md"],
      ["", "> exec bun x markdownlint docs"],
      ["g", "  0 problems"],
      ["c", "Docs updated."],
    ],
  },
];

const termsEl = $("#terms");
for (const [i, t] of TERMS.entries()) {
  const el = document.createElement("div");
  el.className = "term";
  el.id = `t${i}`;
  el.style.left = `${t.x}px`;
  el.style.top = `${t.y}px`;
  const lines = t.lines.map(([c, text]) => `<p class="${c}">${text}</p>`).join("");
  const badge = t.stuck ? "<b>waiting 4m 12s</b>" : "";
  el.innerHTML = `<div class="tbar"><i></i><i></i><i></i><span>${t.title}</span>${badge}</div><div class="tbody"><div class="lines">${lines}</div></div>${t.stuck ? '<div class="halt"></div>' : ""}`;
  termsEl.appendChild(el);
}

gsap.set("#glow", { opacity: 0 });
tl.set("#s1", { autoAlpha: 1 }, 0);
for (const [i, t] of TERMS.entries()) {
  const el = `#t${i}`;
  gsap.set(el, { opacity: 0, y: 70, scale: 0.94, rotation: t.rot });
  tl.to(el, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "expo.out" }, 0.1 + i * 0.1);
  if (!t.stuck) tl.to(`${el} .lines`, { y: -(t.lines.length - 12) * 26, duration: 4.3, ease: "none" }, 0.3);
}
gsap.set(".term .tbar b, .term .halt, .hook .scrim", { opacity: 0 });
tl.to(".blink", { opacity: 0, duration: 0.4, repeat: 10, yoyo: true, ease: "steps(1)" }, 0.3);
tl.to(".hook .scrim", { opacity: 1, duration: 0.5, ease: "power1.out" }, 0.85);
rise("#hook1 .mask > span", 1.0);
tl.to("#hook1 .mask > span", { yPercent: -112, duration: 0.45, ease: "power3.in" }, 2.2);
rise("#hook2 .mask > span", 2.6);
tl.to("#t0, #t1, #t3", { opacity: 0.4, duration: 0.5, ease: "power1.out" }, 2.75);
tl.to(".term .halt, .term .tbar b", { opacity: 1, duration: 0.35, ease: "power1.out" }, 2.85);
tl.to("#t2", { scale: 1.035, duration: 0.5, ease: "back.out(2)" }, 2.85);
tl.to("#hook2 .mask > span", { yPercent: -112, duration: 0.4, ease: "power3.in" }, 3.9);
tl.to(".hook .scrim", { opacity: 0, duration: 0.3 }, 3.95);
// Every terminal falls into the one point the logo grows from.
for (const [i, t] of TERMS.entries()) {
  tl.to(
    `#t${i}`,
    { x: 915 - (t.x + 380), y: 470 - (t.y + 190), scale: 0.03, rotation: 0, opacity: 0, duration: 0.55, ease: "power3.in" },
    4.05 + i * 0.03,
  );
}
hide("#s1", 4.65, 0.05);

// ── 2. Logo and tagline ────────────────────────────────────────────────────
tl.set("#s2", { autoAlpha: 1 }, 4.4);
gsap.set("#spark", { scale: 0 });
gsap.set("#logo", { opacity: 0, scale: 0.82 });
gsap.set("#lg-a", { opacity: 0 });
gsap.set("#lg-b, #lg-c", { scale: 0, transformOrigin: "50% 50%" });
gsap.set(".lg-path", { strokeDasharray: 1, strokeDashoffset: 1, opacity: 0 });
gsap.set("#lg-ring", { opacity: 0, scale: 0.5 });
tl.to("#spark", { scale: 1, duration: 0.3, ease: "back.out(2.6)" }, 4.5);
tl.to("#glow", { opacity: 1, duration: 1.2, ease: "power1.out" }, 4.5);
tl.to("#logo", { opacity: 1, scale: 1, duration: 0.6, ease: "expo.out" }, 4.72);
tl.set("#lg-a", { opacity: 1 }, 4.8);
tl.to("#spark", { opacity: 0, duration: 0.15 }, 4.85);
tl.set(".lg-path", { opacity: 1 }, 5.0);
tl.to(".lg-path", { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" }, 5.0);
tl.to("#lg-b", { scale: 1, duration: 0.45, ease: "back.out(3)" }, 5.45);
tl.to("#lg-c", { scale: 1, duration: 0.45, ease: "back.out(3)" }, 5.52);
tl.to("#lg-ring", { opacity: 0.9, duration: 0.08 }, 5.5);
tl.to("#lg-ring", { scale: 3.4, opacity: 0, duration: 0.7, ease: "power2.out" }, 5.55);
tl.to("#logo", { y: -200, scale: 0.5, duration: 0.8, ease: "power3.inOut" }, 5.95);
rise(".tg", 6.2, { stagger: 0.14, duration: 0.9 });
land("#tg-micro", 7.0, { y: 0 });
tl.to("#s2", { autoAlpha: 0, y: -36, duration: 0.4, ease: "power2.in" }, 8.2);

// ── 3. Ask ─────────────────────────────────────────────────────────────────
const SEG = [
  ["Launch ", ""],
  ["Kopi Senja", "b"],
  [". A landing page, a launch email and a waitlist for a coffee subscription.", ""],
];
const FULL = SEG.reduce((n, [text]) => n + text.length, 0);
const typed = $("#typed");
const typing = { n: 0 };
let drawn = -1;
function renderTyped() {
  const n = Math.round(typing.n);
  if (n === drawn) return;
  drawn = n;
  typed.replaceChildren();
  let used = 0;
  for (const [text, bold] of SEG) {
    if (used >= n) break;
    const part = text.slice(0, n - used);
    const node = bold ? document.createElement("b") : document.createTextNode(part);
    if (bold) node.textContent = part;
    typed.appendChild(node);
    used += text.length;
  }
}
// The renderer calls this after every seek, so the typed text never depends on callbacks firing.
window.__frame = renderTyped;

tl.set("#s3", { autoAlpha: 1 }, 8.5);
gsap.set("#composer", { opacity: 0, y: 70, scale: 0.96 });
gsap.set(".chapter", { x: -24 });
tl.to("#glow", { x: 0, y: 40, scale: 0.9, duration: 1.2, ease: "power2.inOut" }, 8.3);
tl.to("#composer", { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "expo.out" }, 8.55);
tl.to("#ch1", { autoAlpha: 1, x: 0, duration: 0.6 }, 8.7);
tl.to(typing, { n: FULL, duration: 2.2, ease: "none", onUpdate: renderTyped }, 9.2);
tl.to("#caret", { opacity: 0, duration: 0.32, repeat: 3, yoyo: true, ease: "steps(1)" }, 11.4);
gsap.set("#cursor", { x: 1230, y: 960 });
show("#cursor", 11.35, 0.2);
tl.to("#cursor", { x: 1434, y: 634, duration: 0.8, ease: "power3.inOut" }, 11.4);
tl.to("#send", { scale: 0.86, duration: 0.1, ease: "power2.in" }, 12.25);
tl.to("#send", { scale: 1, duration: 0.35, ease: "back.out(2.6)" }, 12.35);
tl.fromTo("#send-ripple", { scale: 1, opacity: 0.55 }, { scale: 4.2, opacity: 0, duration: 0.6, ease: "power2.out" }, 12.3);
hide("#cursor", 12.55, 0.2);
tl.to("#composer", { y: -150, scale: 0.8, opacity: 0, duration: 0.5, ease: "power3.in" }, 12.65);
tl.to("#ch1", { autoAlpha: 0, x: 24, duration: 0.3, ease: "power2.in" }, 12.8);
hide("#s3", 13.15, 0.05);

// ── 4. Plan ────────────────────────────────────────────────────────────────
const MEMBERS = [
  {
    id: "dewi",
    name: "Dewi",
    role: "Market researcher",
    h: 150,
    x: 480,
    task: "Find rival prices",
    wait: "Queued",
    doing: "Reading four shops",
    steps: 6,
  },
  {
    id: "raka",
    name: "Raka",
    role: "Copywriter",
    h: 240,
    x: 800,
    task: "Write the launch copy",
    wait: "Queued",
    doing: "Writing brief.md",
    steps: 5,
  },
  {
    id: "sinta",
    name: "Sinta",
    role: "Frontend engineer",
    h: 330,
    x: 1120,
    task: "Build the landing page",
    wait: "Queued",
    doing: "Editing index.html",
    steps: 9,
  },
  {
    id: "bima",
    name: "Bima",
    role: "QA reviewer",
    h: 55,
    x: 1440,
    task: "Check it on a phone",
    wait: "Waiting for Sinta",
    doing: "Reading index.html",
    steps: 4,
  },
];
const membersEl = $("#members");
for (const m of MEMBERS) {
  const el = document.createElement("div");
  el.className = "member";
  el.id = `m-${m.id}`;
  el.style.left = `${m.x}px`;
  el.innerHTML = `<div class="mhead"><div class="face" style="--h: ${m.h}"><img src="${FACES}/${m.id}.svg" alt=""><span class="badge">${CHECK}</span></div><b>${m.name}</b><span>${m.role}</span></div>
    <div class="task"><strong>${m.task}</strong><span class="st wait">${WAIT}${m.wait}</span><span class="st run">${SPIN}${m.doing}</span><span class="st done">${CHECK}Done · ${m.steps} steps</span></div>`;
  membersEl.appendChild(el);
}
// A mask draws the dashed wires in: trunk, then the bar outward, then the drops.
const wires = $("#wires");
wires.insertAdjacentHTML(
  "afterbegin",
  `<defs><mask id="wire-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1600">
    <path class="wm wm-a" pathLength="1" d="M960 392V440"/><path class="wm wm-b" pathLength="1" d="M960 440H480"/><path class="wm wm-b" pathLength="1" d="M960 440H1440"/>
    <path class="wm wm-c" pathLength="1" d="M480 440V482"/><path class="wm wm-c" pathLength="1" d="M800 440V482"/><path class="wm wm-c" pathLength="1" d="M1120 440V482"/><path class="wm wm-c" pathLength="1" d="M1440 440V482"/>
  </mask></defs>`,
);
for (const path of wires.querySelectorAll(":scope > path")) path.setAttribute("mask", "url(#wire-mask)");
gsap.set(".wm", {
  stroke: "#fff",
  strokeWidth: 10,
  fill: "none",
  strokeDasharray: 1,
  strokeDashoffset: 1,
  strokeLinecap: "butt",
  opacity: 1,
});

tl.set("#s4", { autoAlpha: 1 }, 13.1);
gsap.set("#cam", { y: 70 });
gsap.set("#lead", { opacity: 0, scale: 0.6, y: 20 });
gsap.set("#bubble", { opacity: 0, scale: 0.5 });
gsap.set(".member .mhead", { opacity: 0, scale: 0.6, y: -14 });
gsap.set(".member .task", { opacity: 0, y: 24 });
gsap.set(".st.run, .st.done", { autoAlpha: 0 });
gsap.set(".badge", { scale: 0 });
gsap.set(".spin", { transformOrigin: "50% 50%" });
tl.to("#glow", { y: -160, scale: 1.05, duration: 1.4, ease: "power2.inOut" }, 12.9);
tl.to("#lead", { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "back.out(1.7)" }, 13.2);
tl.to("#ch2", { autoAlpha: 1, x: 0, duration: 0.6 }, 13.35);
tl.to("#bubble", { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 13.6);
tl.to(".wm-a", { strokeDashoffset: 0, duration: 0.22, ease: "none" }, 14.1);
tl.to(".wm-b", { strokeDashoffset: 0, duration: 0.45, ease: "power2.out" }, 14.3);
tl.to(".wm-c", { strokeDashoffset: 0, duration: 0.2, ease: "none", stagger: 0.04 }, 14.6);
tl.to(".member .mhead", { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: "back.out(1.8)", stagger: 0.1 }, 14.75);
tl.to(".member .task", { opacity: 1, y: 0, duration: 0.5, stagger: 0.08 }, 15.25);
tl.to(".spin", { rotation: 360 * 12, duration: 10, ease: "none" }, 15);

const swap = (id, from, to, at) => {
  tl.to(`#m-${id} .st.${from}`, { autoAlpha: 0, duration: 0.15 }, at);
  tl.to(`#m-${id} .st.${to}`, { autoAlpha: 1, duration: 0.2 }, at + 0.1);
};
const finish = (id, at) => {
  swap(id, "run", "done", at);
  tl.to(`#m-${id} .badge`, { scale: 1, duration: 0.45, ease: "back.out(2.6)" }, at + 0.05);
  tl.to(`#m-${id} .task`, { borderColor: "rgb(92 196 134 / 0.45)", duration: 0.3 }, at);
};
swap("dewi", "wait", "run", 15.95);
swap("raka", "wait", "run", 16.05);
swap("sinta", "wait", "run", 16.15);
gsap.set("#bubble", { transformOrigin: "0 20px" });

// The counter is four stacked labels; each fades in as the number changes.
const counter = $("#counter");
counter.innerHTML = `<i class="dot"></i>${["3 running", "2 running", "1 running", "4 of 4 done"].map((text, i) => `<span id="cnt${i}">${text}</span>`).join("")}`;
gsap.set("#cnt1, #cnt2, #cnt3", { autoAlpha: 0 });
const count = (i, at) => {
  tl.to(`#cnt${i - 1}`, { autoAlpha: 0, duration: 0.12 }, at);
  tl.to(`#cnt${i}`, { autoAlpha: 1, duration: 0.18 }, at + 0.08);
};
show("#counter", 16.1, 0.4);
tl.to("#ch2", { autoAlpha: 0, x: 24, duration: 0.3, ease: "power2.in" }, 17.9);

// ── 5. Work: the camera pulls back and results land ────────────────────────
// Past the lead, down to the row of members and the board under them.
tl.to("#cam", { scale: 0.8, y: -152, duration: 1.1, ease: "power3.inOut" }, 18.05);
tl.to("#lead, #bubble, #wire-trunk", { opacity: 0, duration: 0.4, ease: "power1.in" }, 18.05);
tl.to("#glow", { y: 120, scale: 1.25, duration: 1.4, ease: "power2.inOut" }, 18.05);
tl.to("#ch3", { autoAlpha: 1, x: 0, duration: 0.6 }, 18.5);

gsap.set(".card", { opacity: 0, y: 46, scale: 0.96 });
const card = (sel, at) => tl.to(sel, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "expo.out" }, at);
card("#c-table", 19.1);
land("#c-table .tr", 19.25, { stagger: 0.07, y: 0, duration: 0.3 });
finish("dewi", 19.95);
count(1, 19.95);
gsap.set("#c-note", { rotation: -5 });
tl.to("#c-note", { opacity: 1, y: 0, scale: 1, rotation: 1.5, duration: 0.6, ease: "back.out(1.6)" }, 20.2);
card("#c-doc", 20.5);
land("#c-doc .dl", 20.65, { stagger: 0.07, y: 0, duration: 0.3 });
finish("raka", 21.25);
count(2, 21.25);
card("#c-mail", 21.4);
card("#c-page", 21.6);
land("#c-page .pg", 21.85, { stagger: 0.09, duration: 0.5 });
finish("sinta", 22.95);
swap("bima", "wait", "run", 23.05);
finish("bima", 24.05);
count(3, 24.05);
tl.to("#counter .dot", { backgroundColor: "#5cc486", duration: 0.2 }, 24.05);
tl.to("#cam", { scale: 0.62, opacity: 0, duration: 0.45, ease: "power2.in" }, 24.6);
tl.to("#ch3", { autoAlpha: 0, x: 24, duration: 0.3, ease: "power2.in" }, 24.6);
hide("#counter", 24.6, 0.3);
hide("#s4", 25.05, 0.05);

// ── 6. Proof beats ─────────────────────────────────────────────────────────
tl.set("#s6", { autoAlpha: 1 }, 24.95);
tl.to("#glow", { y: 0, scale: 1, duration: 1, ease: "power2.inOut" }, 24.7);
const beat = (id, at, length) => {
  tl.set(id, { autoAlpha: 1 }, at);
  rise(`${id} .mask > span`, at + 0.05, { duration: 0.7 });
  land(`${id} .row > *`, at + 0.4, { stagger: 0.06, duration: 0.45 });
  tl.to(id, { autoAlpha: 0, y: -30, duration: 0.28, ease: "power2.in" }, at + length - 0.28);
};
beat("#b1", 25.0, 2.1);
beat("#b2", 27.1, 2.15);
tl.to("#revert", { scale: 0.92, duration: 0.1, ease: "power2.in" }, 28.2);
tl.to("#revert", { scale: 1, backgroundColor: "#2c2c30", duration: 0.35, ease: "back.out(2.4)" }, 28.3);
tl.to(".diff .add", { opacity: 0.35, duration: 0.3 }, 28.3);
tl.to(".diff .del", { backgroundColor: "rgb(237 237 240 / 0.06)", color: "#ededf0", duration: 0.3 }, 28.3);
beat("#b3", 29.25, 2.2);

// ── 7. End card ────────────────────────────────────────────────────────────
tl.set("#s7", { autoAlpha: 1 }, 31.4);
gsap.set("#lockup", { opacity: 0, y: 24, scale: 0.92 });
gsap.set("#cta", { opacity: 0, scale: 0.8 });
tl.to("#glow", { y: 60, scale: 1.3, duration: 1.6, ease: "power2.inOut" }, 31.2);
tl.to("#lockup", { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "expo.out" }, 31.5);
rise("#end-line", 31.75, { duration: 0.95 });
tl.to("#cta", { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.7)" }, 32.4);
land("#end-micro", 32.75, { y: 0 });
tl.set("#cursor", { x: 1380, y: 1000 }, 32.7);
show("#cursor", 32.8, 0.2);
tl.to("#cursor", { x: 1090, y: 742, duration: 0.85, ease: "power3.inOut" }, 32.85);
tl.to("#cta", { scale: 0.95, duration: 0.1, ease: "power2.in" }, 33.75);
tl.to("#cta", { scale: 1, duration: 0.4, ease: "back.out(2.4)" }, 33.85);
tl.fromTo("#cta-ripple", { scale: 0, opacity: 0.5, x: 130 }, { scale: 22, opacity: 0, duration: 0.8, ease: "power2.out" }, 33.8);
hide("#cursor", 34.5, 0.3);
tl.to("#glow", { scale: 1.42, duration: 2.6, ease: "sine.inOut" }, 33.9);
tl.set({}, {}, DURATION);

window.__timelines = window.__timelines || {};
window.__timelines.root = tl;
window.startRender = () => tl;
if (location.hash === "#play") tl.play(0);
