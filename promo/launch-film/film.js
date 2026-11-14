// Satgas launch film: one paused GSAP timeline, exposed the HyperFrames way as window.__timelines.root.
// Nothing runs on its own clock. The timeline moves the page and two plain state objects (the backdrop's light and
// the 3D mark's pose); window.__frame() then draws both canvases from that state, so any frame can be drawn by seeking.
import { createBackdrop } from "./gl/backdrop.js";
import { createMark } from "./gl/mark.js";

const gsap = window.gsap;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const FACES = "../../site/assets/faces";
const CHECK =
  '<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.4 6.6 11.4 12.5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SPIN =
  '<svg class="spin" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="24 14" stroke-linecap="round"/></svg>';
const WAIT =
  '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 3"/></svg>';

const DURATION = 33;
await document.fonts.ready;
const backdrop = createBackdrop($("#backdrop"));
const mark = createMark($("#mark"));
const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });

// State the canvases are drawn from, and the small jobs that run after every seek.
const B = {
  t: 0,
  lx: 0.5,
  ly: 0.6,
  glow: 0.4,
  warm: 0.12,
  floor: 1,
  horizon: -0.14,
  camx: 0,
  camy: 0,
  pr: 0,
  ps: 0,
  flash: 0,
  streak: 0,
  silk: 0.8,
};
const M = {
  vis: 0,
  x: 0,
  y: -30,
  size: 300,
  rx: 0.35,
  ry: -0.62,
  rz: 0,
  slab: 0.6,
  a: 0,
  b: 0,
  c: 0,
  draw: 0,
  glow: 0,
  sweep: -1,
  sweepOn: 0,
};
const appliers = [];

const show = (sel, at, duration = 0.4) => tl.to(sel, { autoAlpha: 1, duration, ease: "power1.out" }, at);
const hide = (sel, at, duration = 0.35) => tl.to(sel, { autoAlpha: 0, duration, ease: "power1.in" }, at);
const land = (sel, at, vars = {}) => {
  gsap.set(sel, { opacity: 0, y: 26 });
  tl.to(sel, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", ...vars }, at);
};

// Splits a heading into words and characters, and records where each character sits on its line.
function split(root) {
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== 3) {
        walk(child);
        continue;
      }
      const frag = document.createDocumentFragment();
      for (const word of child.textContent.split(/(\s+)/)) {
        if (!word) continue;
        if (/^\s+$/.test(word)) {
          frag.append(document.createTextNode(" "));
          continue;
        }
        const w = document.createElement("span");
        w.className = "w";
        for (const c of word) {
          const ch = document.createElement("span");
          ch.className = "ch";
          ch.textContent = c;
          w.append(ch);
        }
        frag.append(w);
      }
      child.replaceWith(frag);
    }
  };
  walk(root);
  const chars = [...root.querySelectorAll(".ch")];
  for (const ch of chars) {
    const line = ch.closest(".ln") || root;
    ch.style.setProperty("--cx", `${Math.round(ch.getBoundingClientRect().left - line.getBoundingClientRect().left)}px`);
  }
  return chars;
}
const typeIn = (chars, at, vars = {}) => {
  gsap.set(chars, { opacity: 0, yPercent: 55, filter: "blur(14px)" });
  tl.to(chars, { opacity: 1, yPercent: 0, filter: "blur(0px)", duration: 0.62, ease: "power3.out", stagger: 0.022, ...vars }, at);
};
const typeOut = (chars, at, vars = {}) =>
  tl.to(chars, { opacity: 0, yPercent: -45, filter: "blur(12px)", duration: 0.34, ease: "power2.in", stagger: 0.01, ...vars }, at);
// A band of light crossing the letters. The gradient lives in line coordinates, so it reads as one sweep.
const sheen = (el, at, duration = 0.9) =>
  tl.fromTo(el, { "--sx": "-320px" }, { "--sx": `${$(el).offsetWidth + 320}px`, duration, ease: "power2.inOut" }, at);

// Motion blur for a whole scene: a directional blur whose strength the timeline drives during fast moves.
function motionBlur(sel) {
  const id = `mb-${sel.replace(/\W/g, "")}`;
  $("#filters").insertAdjacentHTML(
    "beforeend",
    `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0"/></filter>`,
  );
  const node = $(`#${id} feGaussianBlur`);
  const el = $(sel);
  const state = { x: 0, y: 0 };
  appliers.push(() => {
    const on = state.x > 0.05 || state.y > 0.05;
    if (on) node.setAttribute("stdDeviation", `${state.x.toFixed(2)} ${state.y.toFixed(2)}`);
    el.style.filter = on ? `url(#${id})` : "";
  });
  return (at, duration, x, y) => {
    tl.to(state, { x, y, duration: duration * 0.5, ease: "power2.in" }, at);
    tl.to(state, { x: 0, y: 0, duration: duration * 0.5, ease: "power2.out" }, at + duration * 0.5);
  };
}
const hit = (at, strength = 0.9, ring = 0.5) => {
  tl.set("#flash", { opacity: strength * 0.5 }, at);
  tl.to("#flash", { opacity: 0, duration: 0.34, ease: "power2.out" }, at + 0.04);
  tl.set(B, { flash: strength, pr: 0, ps: ring }, at);
  tl.to(B, { flash: 0, duration: 0.4, ease: "power2.out" }, at + 0.03);
  tl.to(B, { pr: 1.7, ps: 0, duration: 1.1, ease: "power2.out" }, at + 0.02);
};

// ── 1. Hook ────────────────────────────────────────────────────────────────
const TERMS = [
  {
    title: "claude — api",
    x: 120,
    y: 40,
    z: 0,
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
    x: 1040,
    y: 10,
    z: -240,
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
    x: 170,
    y: 650,
    z: -110,
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
    x: 1030,
    y: 670,
    z: -330,
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

const wall = $("#wall");
for (const [i, t] of TERMS.entries()) {
  const el = document.createElement("div");
  el.className = "term";
  el.id = `t${i}`;
  el.style.left = `${t.x}px`;
  el.style.top = `${t.y}px`;
  const lines = t.lines.map(([c, text]) => `<p class="${c}">${text}</p>`).join("");
  const badge = t.stuck ? "<b>waiting 4m 12s</b>" : "";
  el.innerHTML = `<div class="tbar"><i></i><i></i><i></i><span>${t.title}</span>${badge}</div><div class="tbody"><div class="lines">${lines}</div></div>${t.stuck ? '<div class="halt"></div>' : ""}`;
  wall.appendChild(el);
}
const hook1 = split($("#hook1"));
const hook2 = split($("#hook2"));
const blurS1 = motionBlur("#s1");

// Frame 0 is already a finished picture: the wall is up, the first line is set, and the camera is moving.
gsap.set("#s1", { autoAlpha: 1 });
gsap.set("#wall", { rotationY: -17, rotationX: 6, z: -150, transformOrigin: "50% 50%" });
tl.to("#wall", { rotationY: -6, rotationX: 2.5, z: 40, duration: 4.1, ease: "none" }, 0);
for (const [i, t] of TERMS.entries()) {
  gsap.set(`#t${i}`, { z: t.z, filter: `blur(${(-t.z / 150).toFixed(1)}px)` });
  if (!t.stuck) tl.to(`#t${i} .lines`, { y: -(t.lines.length - 11) * 26, duration: 4.2, ease: "none" }, 0);
}
gsap.set(".term .tbar b, .term .halt", { opacity: 0 });
gsap.set(hook2, { opacity: 0 });
tl.to(".blink", { opacity: 0, duration: 0.4, repeat: 10, yoyo: true, ease: "steps(1)" }, 0);
tl.fromTo("#hook1", { scale: 1.1 }, { scale: 1, duration: 1.3, ease: "expo.out" }, 0);
tl.fromTo(B, { glow: 0.35 }, { glow: 0.7, duration: 1.2, ease: "power2.out" }, 0);
typeOut(hook1, 1.5);
typeIn(hook2, 1.75);
// The stuck one comes forward; the rest fall back.
tl.to("#t2", { z: 250, filter: "blur(0px)", duration: 0.7, ease: "back.out(1.5)" }, 1.85);
tl.to("#t0, #t1, #t3", { opacity: 0.32, duration: 0.5, ease: "power1.out" }, 1.85);
tl.to(".term .halt, .term .tbar b", { opacity: 1, duration: 0.12, repeat: 3, yoyo: true, ease: "steps(1)" }, 1.95);
tl.to(B, { lx: 0.34, ly: 0.3, glow: 0.3, duration: 0.6, ease: "power2.out" }, 1.85);
typeOut(hook2, 3.3);
tl.to(".hook .scrim", { opacity: 0, duration: 0.3 }, 3.35);
// Everything is pulled into one point. That point becomes the first node of the mark.
for (const [i, t] of TERMS.entries()) {
  tl.to(
    `#t${i}`,
    {
      x: 960 - (t.x + 380),
      y: 520 - (t.y + 190),
      z: -1400,
      scale: 0.04,
      rotation: i % 2 ? 26 : -22,
      duration: 0.62,
      ease: "power3.in",
    },
    3.45 + i * 0.04,
  );
  tl.to(`#t${i}`, { opacity: 1, duration: 0.3 }, 3.45 + i * 0.04);
  tl.to(`#t${i}`, { opacity: 0, duration: 0.1 }, 3.97 + i * 0.04);
}
blurS1(3.6, 0.55, 8, 8);
tl.to(B, { glow: 1.25, lx: 0.5, ly: 0.52, duration: 0.62, ease: "power3.in" }, 3.5);
hide("#s1", 4.14, 0.02);

// ── 2. The mark, then the promise ──────────────────────────────────────────
const tg1 = split($("#tg1"));
const tg2 = split($("#tg2"));
hit(4.15, 0.95, 0.4);
tl.set(B, { warm: 1, streak: 0, silk: 1 }, 4.15);
tl.to(B, { glow: 0.62, duration: 0.5 }, 4.15);
tl.set("#s2", { autoAlpha: 1 }, 4.15);
tl.set(M, { vis: 1, size: 620 }, 4.15);
tl.fromTo(M, { size: 620 }, { size: 300, duration: 0.75, ease: "expo.out", immediateRender: false }, 4.15);
tl.to(M, { slab: 1, duration: 0.55, ease: "back.out(1.6)" }, 4.15);
tl.to(M, { a: 1, duration: 0.45, ease: "back.out(2.4)" }, 4.17);
tl.to(M, { ry: -0.22, rx: 0.12, duration: 1.5, ease: "power3.out" }, 4.15);
tl.to(M, { draw: 1, duration: 0.56, ease: "power2.inOut" }, 4.75);
// The amber node lights up: a second, smaller hit.
tl.to(M, { b: 1, duration: 0.45, ease: "back.out(3)" }, 5.35);
tl.to(M, { c: 1, duration: 0.45, ease: "back.out(3)" }, 5.43);
tl.to(M, { glow: 1.5, duration: 0.14, ease: "power2.out" }, 5.35);
tl.to(M, { glow: 0.5, duration: 0.8, ease: "power2.out" }, 5.49);
hit(5.37, 0.3, 0.28);
tl.to(M, { sweepOn: 1, duration: 0.3 }, 5.5);
tl.fromTo(M, { sweep: -1 }, { sweep: 1, duration: 1.0, ease: "power1.inOut", immediateRender: false }, 5.5);
tl.to(M, { sweepOn: 0, duration: 0.3 }, 6.25);
tl.to(M, { y: -268, size: 156, ry: 0, rx: 0, duration: 0.8, ease: "power3.inOut" }, 5.7);
tl.to(B, { ly: 0.74, glow: 0.6, duration: 0.8, ease: "power3.inOut" }, 5.7);
typeIn(tg1, 5.98, { stagger: 0.026 });
typeIn(tg2, 6.22, { stagger: 0.026 });
land("#tg-micro", 6.8, { y: 0 });
sheen("#tg2", 6.75, 0.85);
sheen("#tg1", 6.65, 0.85);
// The promise flies through the camera; the composer is already waiting behind it.
tl.to("#tagline", { scale: 7, transformOrigin: "50% 42%", filter: "blur(22px)", duration: 0.5, ease: "power3.in" }, 7.38);
tl.to("#tagline", { opacity: 0, duration: 0.12, ease: "power1.in" }, 7.62);
tl.to(M, { size: 1500, y: -1300, duration: 0.5, ease: "power3.in" }, 7.38);
tl.to(M, { vis: 0, duration: 0.16 }, 7.5);
tl.to(B, { streak: 0.8, duration: 0.3, ease: "power2.in" }, 7.4);
tl.to(B, { streak: 0, duration: 0.4, ease: "power2.out" }, 7.75);
hide("#s2", 7.9, 0.02);

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
appliers.push(() => {
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
});

tl.set("#s3", { autoAlpha: 1 }, 7.5);
gsap.set("#composer", { opacity: 0, z: -1100, y: 90, rotationX: 16, filter: "blur(14px)", transformOrigin: "0 0" });
gsap.set(".chapter", { x: -24 });
gsap.set("#composer .sheen", { xPercent: -140 });
tl.to("#composer", { opacity: 1, z: 0, y: 0, rotationX: 3, filter: "blur(0px)", duration: 0.9, ease: "expo.out" }, 7.72);
tl.to("#composer", { rotationX: 0, duration: 3, ease: "sine.inOut" }, 8.4);
tl.to(B, { lx: 0.5, ly: 0.52, glow: 0.75, horizon: -0.2, duration: 0.9, ease: "power3.out" }, 7.55);
tl.to("#composer .sheen", { xPercent: 520, duration: 0.9, ease: "power2.inOut" }, 8.4);
tl.set("#composer .sheen", { opacity: 0 }, 9.32);
tl.to("#ch1", { autoAlpha: 1, x: 0, duration: 0.6 }, 8.0);
show("#rail", 8.0, 0.5);
tl.to("#r1", { opacity: 1, duration: 0.3 }, 8.0);
tl.to(typing, { n: FULL, duration: 1.8, ease: "none" }, 8.95);
tl.to("#caret", { opacity: 0, duration: 0.3, repeat: 1, yoyo: true, ease: "steps(1)" }, 10.8);
gsap.set("#cursor", { x: 1230, y: 1000 });
show("#cursor", 10.55, 0.2);
tl.to("#cursor", { x: 1612, y: 644, duration: 0.72, ease: "power3.inOut" }, 10.58);
tl.to(B, { lx: 0.843, ly: 0.4, duration: 0.7, ease: "power3.inOut" }, 10.62);
tl.to("#send", { scale: 0.84, duration: 0.09, ease: "power2.in" }, 11.33);
tl.to("#send", { scale: 1, duration: 0.35, ease: "back.out(2.8)" }, 11.42);
// The ring grows by its size, not by scaling, so its line stays thin.
tl.fromTo(
  "#send-shock",
  { width: 60, height: 60, opacity: 1 },
  { width: 2600, height: 2600, opacity: 0, duration: 0.85, ease: "power2.out", immediateRender: false },
  11.37,
);
tl.set(B, { pr: 0, ps: 0.55 }, 11.37);
tl.to(B, { pr: 1.9, ps: 0, duration: 0.9, ease: "power2.out" }, 11.38);
hide("#cursor", 11.53, 0.15);
// The request shrinks into the lead's speech bubble, at the bubble's own rectangle.
tl.to("#composer", { x: 852.5, y: -114.3, scale: 488 / 1500, duration: 0.6, ease: "power3.inOut" }, 11.58);
tl.set("#composer", { opacity: 0 }, 12.16);
tl.to("#ch1", { autoAlpha: 0, x: 24, duration: 0.3, ease: "power2.in" }, 11.6);
hide("#s3", 12.26, 0.02);

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
    <div class="task glass"><strong>${m.task}</strong><span class="st wait">${WAIT}${m.wait}</span><span class="st run">${SPIN}${m.doing}</span><span class="st done">${CHECK}Done · ${m.steps} steps</span><i class="bar"><u></u></i></div>`;
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
for (const path of wires.querySelectorAll(":scope > .wire")) path.setAttribute("mask", "url(#wire-mask)");
gsap.set(".wm", {
  stroke: "#fff",
  strokeWidth: 10,
  fill: "none",
  strokeDasharray: 1,
  strokeDashoffset: 1,
  strokeLinecap: "butt",
  opacity: 1,
});
const blurS4 = motionBlur("#s4");

tl.set("#s4", { autoAlpha: 1 }, 11.6);
gsap.set("#cam", { y: -58, scale: 1.22 });
gsap.set(".dots", { opacity: 0 });
gsap.set("#lead", { opacity: 0, scale: 0.5, y: 24 });
gsap.set("#bubble", { autoAlpha: 0 });
gsap.set(".member .mhead", { opacity: 0, scale: 0.5, y: -18 });
gsap.set(".member .task", { opacity: 0, y: 28 });
gsap.set(".st.run, .st.done", { autoAlpha: 0 });
gsap.set(".badge", { scale: 0 });
gsap.set(".spin", { transformOrigin: "50% 50%" });
gsap.set(".wires .spark", { opacity: 0 });
gsap.set(".face .halo", { opacity: 0, scale: 0.7 });
tl.to(".dots", { opacity: 1, duration: 0.8 }, 11.65);
tl.to(B, { floor: 0, lx: 0.5, ly: 0.74, glow: 0.8, duration: 0.8, ease: "power3.inOut" }, 11.6);
tl.to("#lead", { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "back.out(1.9)" }, 12.12);
tl.to(".face .halo", { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(2)" }, 12.24);
tl.set("#bubble", { autoAlpha: 1 }, 12.16);
tl.to("#ch2", { autoAlpha: 1, x: 0, duration: 0.6 }, 12.2);
tl.to("#rl1", { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, 11.65);
tl.to("#r2", { opacity: 1, duration: 0.3 }, 12.1);
tl.to("#r1", { opacity: 0.6, duration: 0.3 }, 12.1);
tl.to(".wm-a", { strokeDashoffset: 0, duration: 0.2, ease: "none" }, 12.3);
tl.to(".wm-b", { strokeDashoffset: 0, duration: 0.38, ease: "power2.out" }, 12.42);
tl.to(".wm-c", { strokeDashoffset: 0, duration: 0.18, ease: "none", stagger: 0.03 }, 12.68);
// A pulse of light runs down each wire to the member it hires.
// GSAP rounds a dash offset in px to whole numbers, so the offset is kept as plain state and written each frame.
for (const [i, path] of $$(".wires .spark").entries()) {
  const dash = { at: 0.1 };
  appliers.push(() => {
    path.style.strokeDashoffset = dash.at.toFixed(4);
  });
  tl.to(dash, { at: -1.02, duration: 0.66, ease: "power1.in" }, 12.3 + i * 0.03);
}
tl.set(".wires .spark", { opacity: 1 }, 12.3);
tl.set(".wires .spark", { opacity: 0 }, 13.09);
tl.to(".member .mhead", { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: "back.out(2)", stagger: 0.09 }, 12.72);
tl.to(".member .task", { opacity: 1, y: 0, duration: 0.5, stagger: 0.07 }, 13.08);
tl.to(".spin", { rotation: 360 * 11, duration: 9, ease: "none" }, 13.5);
tl.to("#cam", { scale: 1.26, y: -66, duration: 3.5, ease: "sine.inOut" }, 12.5);

const swap = (id, from, to, at) => {
  tl.to(`#m-${id} .st.${from}`, { autoAlpha: 0, duration: 0.15 }, at);
  tl.to(`#m-${id} .st.${to}`, { autoAlpha: 1, duration: 0.2 }, at + 0.1);
};
const run = (id, at, until) => {
  swap(id, "wait", "run", at);
  tl.to(`#m-${id} .bar u`, { scaleX: 1, duration: until - at, ease: "power1.inOut" }, at);
};
const finish = (id, at) => {
  swap(id, "run", "done", at);
  tl.to(`#m-${id} .badge`, { scale: 1, duration: 0.45, ease: "back.out(2.8)" }, at + 0.05);
  tl.to(`#m-${id} .bar u`, { backgroundImage: "linear-gradient(90deg, #2f8a55, #7fe0a8)", duration: 0.2 }, at);
};
run("dewi", 13.75, 17.75);
run("raka", 13.83, 18.9);
run("sinta", 13.91, 20.5);

// The counter is four stacked labels; each fades in as the number changes.
const counter = $("#counter");
counter.innerHTML = `<i class="dot"></i>${["3 running", "2 running", "1 running", "4 of 4 done"].map((text, i) => `<span id="cnt${i}">${text}</span>`).join("")}`;
gsap.set("#cnt1, #cnt2, #cnt3", { autoAlpha: 0 });
const count = (i, at) => {
  tl.to(`#cnt${i - 1}`, { autoAlpha: 0, duration: 0.12 }, at);
  tl.to(`#cnt${i}`, { autoAlpha: 1, duration: 0.18 }, at + 0.08);
};
show("#counter", 13.8, 0.4);
tl.to("#ch2", { autoAlpha: 0, x: 24, duration: 0.3, ease: "power2.in" }, 16.0);

// ── 5. Work: the camera whips down past the lead to the board ──────────────
tl.to("#cam", { scale: 0.8, y: -152, duration: 0.9, ease: "power4.inOut" }, 16.15);
tl.fromTo("#cam", { rotationX: 0 }, { rotationX: 11, duration: 0.45, ease: "power2.in" }, 16.15);
tl.to("#cam", { rotationX: 0, duration: 0.7, ease: "power3.out" }, 16.6);
blurS4(16.2, 0.8, 0, 30);
tl.to("#lead, #bubble, #wire-trunk", { autoAlpha: 0, duration: 0.3, ease: "power1.in" }, 16.15);
tl.to(B, { ly: 0.5, glow: 0.7, camy: 3.4, duration: 0.9, ease: "power4.inOut" }, 16.15);
tl.to("#ch3", { autoAlpha: 1, x: 0, duration: 0.6 }, 16.65);
tl.to("#rl2", { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, 16.2);
tl.to("#r3", { opacity: 1, duration: 0.3 }, 16.65);
tl.to("#r2", { opacity: 0.6, duration: 0.3 }, 16.65);
tl.to("#cam", { rotationY: 2.2, scale: 0.815, duration: 4.6, ease: "sine.inOut" }, 17.1);
tl.to(B, { camx: 0.35, duration: 4.6, ease: "sine.inOut" }, 17.1);

// Each card drops onto the board from in front of the camera.
gsap.set(".card", { opacity: 0, y: 50, z: 340, rotationX: -14, filter: "blur(10px)" });
const card = (sel, at) => tl.to(sel, { opacity: 1, y: 0, z: 0, rotationX: 0, filter: "blur(0px)", duration: 0.62, ease: "expo.out" }, at);
card("#c-table", 17.0);
land("#c-table .tr", 17.15, { stagger: 0.06, y: 0, duration: 0.3 });
finish("dewi", 17.75);
count(1, 17.75);
gsap.set("#c-note", { rotation: -6 });
tl.to(
  "#c-note",
  { opacity: 1, y: 0, z: 0, rotationX: 0, rotation: 1.5, filter: "blur(0px)", duration: 0.62, ease: "back.out(1.5)" },
  17.95,
);
card("#c-doc", 18.2);
land("#c-doc .dl", 18.35, { stagger: 0.06, y: 0, duration: 0.3 });
finish("raka", 18.9);
count(2, 18.9);
card("#c-mail", 19.05);
card("#c-page", 19.25);
land("#c-page .pg", 19.3, { stagger: 0.035, duration: 0.4 });
finish("sinta", 20.5);
run("bima", 20.6, 21.5);
finish("bima", 21.5);
count(3, 21.5);
tl.to("#counter .dot", { backgroundColor: "#5cc486", color: "#5cc486", duration: 0.2 }, 21.5);
tl.to("#counter", { scale: 1.08, duration: 0.12, ease: "power2.out" }, 21.5);
tl.to("#counter", { scale: 1, duration: 0.4, ease: "back.out(2.5)" }, 21.62);
// Into the page Sinta built: the camera dives at the card until its paper fills the frame.
tl.to("#cam", { scale: 3.7, x: -296, y: -3700, rotationY: 0, duration: 0.9, ease: "power4.in" }, 21.85);
blurS4(22.3, 0.5, 10, 26);
tl.to("#ch3, #counter, #rail", { autoAlpha: 0, duration: 0.25, ease: "power1.in" }, 22.15);
hide("#s4", 22.75, 0.02);

// ── 6. Proof beats, cut together with whip pans ────────────────────────────
const blurS6 = motionBlur("#s6");
tl.set("#s6", { autoAlpha: 1 }, 22.7);
hit(22.75, 1, 0.3);
tl.set(B, { floor: 1, horizon: -0.17, camx: 0, lx: 0.5, ly: 0.56, glow: 0.85 }, 22.72);
const beat = (id, at, length, enter) => {
  const lines = $$(`${id} .ln`);
  for (const line of lines) split(line);
  tl.set(id, { autoAlpha: 1 }, at);
  if (enter === "slam") {
    gsap.set(lines, { scale: 1.5, opacity: 0, filter: "blur(18px)" });
    tl.to(lines, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "expo.out", stagger: 0.08 }, at + 0.04);
  } else {
    tl.fromTo(id, enter === "below" ? { y: 760 } : { x: 900 }, { x: 0, y: 0, duration: 0.5, ease: "expo.out" }, at);
  }
  gsap.set(`${id} .panel`, { opacity: 0, y: 60, rotationX: -18, transformPerspective: 1400, transformOrigin: "50% 0" });
  tl.to(`${id} .panel`, { opacity: 1, y: 0, rotationX: 0, duration: 0.6, ease: "expo.out" }, at + 0.22);
  land(`${id} .prow, ${id} .row > *`, at + 0.36, { stagger: 0.055, duration: 0.4, y: 0 });
  sheen(`${id} h2`, at + 0.55, 0.85);
  return at + length;
};
// A whip moves everything: the outgoing beat, the blur, and the stage behind it.
const whip = (from, at, vertical) => {
  tl.to(from, vertical ? { y: -900, duration: 0.3, ease: "power3.in" } : { x: -1100, duration: 0.3, ease: "power3.in" }, at - 0.3);
  tl.set(from, { autoAlpha: 0 }, at);
  blurS6(at - 0.26, 0.56, vertical ? 0 : 70, vertical ? 56 : 0);
  tl.to(
    B,
    vertical ? { camy: "+=3.2", duration: 0.6, ease: "power3.inOut" } : { camx: "+=3.4", duration: 0.6, ease: "power3.inOut" },
    at - 0.3,
  );
  if (vertical) return;
  tl.to(B, { streak: 0.7, duration: 0.2, ease: "power2.in" }, at - 0.24);
  tl.to(B, { streak: 0, duration: 0.35, ease: "power2.out" }, at);
};
const b2at = beat("#b1", 22.75, 1.8, "slam");
whip("#b1", b2at);
tl.to(B, { lx: 0.66, ly: 0.6, duration: 0.5, ease: "power3.inOut" }, b2at - 0.25);
const b3at = beat("#b2", b2at, 1.8, "right");
tl.to("#revert", { scale: 0.92, duration: 0.1, ease: "power2.in" }, b2at + 1.05);
tl.to("#revert", { scale: 1, duration: 0.35, ease: "back.out(2.6)" }, b2at + 1.15);
tl.to(".diffp .add", { opacity: 0.3, duration: 0.3 }, b2at + 1.15);
tl.to(
  ".diffp .del",
  { backgroundImage: "linear-gradient(90deg, rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.03))", color: "#ededf0", duration: 0.3 },
  b2at + 1.15,
);
whip("#b2", b3at, true);
tl.to(B, { lx: 0.4, ly: 0.58, duration: 0.5, ease: "power3.inOut" }, b3at - 0.25);
const endAt = beat("#b3", b3at, 1.8, "below");
// The last beat collapses into the point the mark lands on.
tl.to(
  "#b3",
  { scale: 0.08, opacity: 0, filter: "blur(16px)", transformOrigin: "50% 30%", duration: 0.38, ease: "power3.in" },
  endAt - 0.38,
);
tl.to(B, { glow: 1.2, lx: 0.5, ly: 0.62, duration: 0.36, ease: "power3.in" }, endAt - 0.38);
hide("#s6", endAt, 0.02);

// ── 7. End card ────────────────────────────────────────────────────────────
const wordmark = split($("#wordmark"));
const endLine = split($("#end-line"));
hit(endAt, 1, 0.4);
tl.set(B, { streak: 0, horizon: -0.2 }, endAt);
tl.to(B, { glow: 1, duration: 0.5 }, endAt);
tl.set("#s7", { autoAlpha: 1 }, endAt);
tl.set(M, { vis: 1, x: -229, y: -40, size: 760, ry: -1.3, rx: 0.5, slab: 1, a: 1, b: 1, c: 1, draw: 1, sweep: -1, rz: 0 }, endAt);
// These start values must not be applied before their time: the same state is animated earlier in the film.
tl.fromTo(
  M,
  { size: 760, y: -40, ry: -1.3, rx: 0.5 },
  { size: 172, y: -262, ry: 0, rx: 0, duration: 0.8, ease: "expo.out", immediateRender: false },
  endAt,
);
tl.fromTo(M, { glow: 1.6 }, { glow: 0.55, duration: 0.9, ease: "power2.out", immediateRender: false }, endAt);
typeIn(wordmark, endAt + 0.18, { stagger: 0.035 });
typeIn(endLine, endAt + 0.42, { stagger: 0.022 });
gsap.set("#cta", { opacity: 0, scale: 0.7 });
gsap.set("#cta-sheen", { xPercent: -140 });
tl.to("#cta", { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, endAt + 1.05);
land("#end-micro", endAt + 1.4, { y: 0 });
tl.to("#cta-sheen", { xPercent: 640, duration: 0.8, ease: "power2.inOut" }, endAt + 1.5);
tl.set("#cta-sheen", { opacity: 0 }, endAt + 2.35);
sheen("#end-line", endAt + 1.75, 1.0);
sheen("#wordmark", endAt + 1.65, 0.8);
tl.to(M, { sweepOn: 1, duration: 0.25 }, endAt + 1.6);
tl.fromTo(M, { sweep: -1 }, { sweep: 1, duration: 0.9, ease: "power1.inOut", immediateRender: false }, endAt + 1.6);
tl.to(M, { sweepOn: 0, duration: 0.3 }, endAt + 2.3);
tl.set("#cursor", { x: 1420, y: 1010 }, endAt + 1.9);
show("#cursor", endAt + 2.0, 0.2);
tl.to("#cursor", { x: 1246, y: 752, duration: 0.8, ease: "power3.inOut" }, endAt + 2.05);
tl.to("#cta", { scale: 0.95, duration: 0.09, ease: "power2.in" }, endAt + 2.9);
tl.to("#cta", { scale: 1, duration: 0.4, ease: "back.out(2.6)" }, endAt + 2.99);
tl.fromTo("#cta-ripple", { opacity: 0.6 }, { opacity: 0, duration: 0.7, ease: "power2.out", immediateRender: false }, endAt + 2.94);
tl.set(B, { pr: 0, ps: 0.3 }, endAt + 2.94);
tl.to(B, { pr: 1.6, ps: 0, duration: 1.0, ease: "power2.out" }, endAt + 2.95);
tl.to("#cursor", { x: 1420, y: 900, autoAlpha: 0, duration: 0.6, ease: "power2.in" }, endAt + 3.25);
// The hold stays alive: the mark turns a little, the light breathes and drifts.
tl.to(M, { ry: 0.1, duration: 1.6, ease: "sine.inOut" }, endAt + 0.9);
tl.to(M, { ry: -0.07, duration: 2.2, ease: "sine.inOut" }, endAt + 2.5);
tl.to(M, { glow: 0.85, duration: 1.2, ease: "sine.inOut", repeat: 2, yoyo: true }, endAt + 1.0);
tl.to(B, { lx: 0.56, ly: 0.66, camx: 0.3, duration: DURATION - endAt - 0.4, ease: "sine.inOut" }, endAt + 0.4);
tl.to("#s7", { scale: 1.02, transformOrigin: "50% 50%", duration: DURATION - endAt - 0.5, ease: "sine.inOut" }, endAt + 0.5);
tl.set({}, {}, DURATION);

// Draws both canvases, and everything else that follows the timeline, for the time the timeline is at.
function frame() {
  B.t = tl.time();
  for (const apply of appliers) apply();
  backdrop.render(B);
  mark.render(M);
}
window.__frame = frame;
window.__timelines = window.__timelines || {};
window.__timelines.root = tl;
window.startRender = () => tl;
frame();
window.__ready = true;
if (location.hash === "#play") {
  gsap.ticker.add(frame);
  tl.play(0);
}
