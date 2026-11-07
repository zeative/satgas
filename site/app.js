// The landing page's few behaviours: the hero board plays its run once, the board scales to its column, the nav gains
// a surface on scroll, the quick start copies, and the star count comes from GitHub when it answers.

const scene = document.getElementById("scene");
const stage = scene?.querySelector(".stage");
const canvas = scene?.querySelector(".canvas");

// The board is drawn at 860 wide; narrower columns get it scaled down whole, never reflowed.
if (stage && canvas) {
  const fit = () => {
    const k = Math.min(1, canvas.clientWidth / 860);
    stage.style.transform = `scale(${k})`;
    stage.style.left = `${Math.max(0, (canvas.clientWidth - 860 * k) / 2)}px`;
  };
  new ResizeObserver(fit).observe(canvas);
  fit();
}

// The team's page is a desktop page; each frame shrinks it whole to its own width.
for (const frame of document.querySelectorAll(".mk-frame")) {
  const fitPage = () => frame.style.setProperty("--k", String(frame.clientWidth / 1280));
  new ResizeObserver(fitPage).observe(frame);
  fitPage();
}

// One play of the run: who was hired, the lines to them, their steps, then what they made. Reduced motion skips to the end.
if (scene && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  scene.classList.add("play");
  const items = [...scene.querySelectorAll(".land[data-at]")];
  const start = () => {
    for (const el of items) setTimeout(() => el.classList.add("in"), Number(el.dataset.at));
    for (const el of scene.querySelectorAll("[data-count]")) {
      const to = Number(el.dataset.count);
      let n = 1;
      el.textContent = `${n} step`;
      const tick = setInterval(() => {
        n++;
        el.textContent = `${n} steps`;
        if (n >= to) clearInterval(tick);
      }, 3000 / to);
    }
  };
  const seen = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    seen.disconnect();
    start();
  });
  seen.observe(scene);
}

// How it works: one step open at a time. It moves on by itself while in view, until someone picks a step.
const flow = document.querySelector("[data-flow]");
let flowCtl = null;
if (flow) {
  const tabs = [...flow.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
  const MS = 6000;
  let at = 0;
  let timer = 0;
  const show = (i) => {
    at = (i + tabs.length) % tabs.length;
    tabs.forEach((t, n) => {
      t.classList.toggle("on", n === at);
      t.setAttribute("aria-selected", String(n === at));
      t.tabIndex = n === at ? 0 : -1;
      if (panels[n]) panels[n].hidden = n !== at;
    });
  };
  const stop = () => {
    clearInterval(timer);
    timer = 0;
    flow.classList.remove("auto");
  };
  const run = () => {
    if (timer || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    flow.style.setProperty("--flow-ms", `${MS}ms`);
    flow.classList.add("auto");
    timer = setInterval(() => {
      // Restart the bar's fill for the next step.
      flow.classList.remove("auto");
      void flow.offsetWidth;
      show(at + 1);
      flow.classList.add("auto");
    }, MS);
  };
  for (const [n, t] of tabs.entries())
    t.addEventListener("click", () => {
      stop();
      show(n);
    });
  flow.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    stop();
    show(at + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1));
    tabs[at].focus();
  });
  let picked = false;
  for (const t of tabs)
    t.addEventListener("pointerdown", () => {
      picked = true;
    });
  // Scroll takes over on wide screens, so the timer only runs while nothing else drives the steps.
  flowCtl = { show, stop, count: tabs.length, scrolled: false };
  new IntersectionObserver(([e]) => (e?.isIntersecting && !picked && !flowCtl.scrolled ? run() : stop()), {
    threshold: 0.4,
  }).observe(flow);
  show(0);
}

// Scroll motion. Everything here is extra: without GSAP, or with reduced motion, the page reads complete as it is.
const gsap = window.gsap;
const ST = window.ScrollTrigger;
if (gsap && ST && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  gsap.registerPlugin(ST);
  document.documentElement.classList.add("motion");

  // The manifesto lights word by word, so it gets split once into spans.
  for (const p of document.querySelectorAll("[data-words]")) {
    const words = p.textContent.trim().split(/\s+/);
    p.textContent = "";
    for (const [i, w] of words.entries()) {
      const s = document.createElement("span");
      s.className = /^(team|watch|canvas\.)$/.test(w) ? "w hl" : "w";
      s.textContent = w;
      p.append(s, i < words.length - 1 ? " " : "");
    }
    gsap.to(p.querySelectorAll(".w"), {
      opacity: 1,
      stagger: 0.1,
      ease: "none",
      scrollTrigger: { trigger: p, start: "top 80%", end: "bottom 45%", scrub: true },
    });
  }

  gsap.to(".aura", { yPercent: 18, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

  for (const el of document.querySelectorAll("[data-reveal]"))
    gsap.from(el, { y: 32, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } });

  for (const [sel, each] of [
    ["[data-line]", 0.12],
    ["[data-type]", 0.45],
  ]) {
    const items = gsap.utils.toArray(sel);
    if (!items.length) continue;
    gsap.from(items, {
      opacity: 0,
      x: -8,
      duration: 0.4,
      stagger: each,
      ease: "power2.out",
      scrollTrigger: { trigger: items[0].parentElement, start: "top 75%", once: true },
    });
  }

  const finalBg = document.querySelector(".final-bg");
  if (finalBg)
    gsap.fromTo(
      finalBg,
      { scale: 1.15 },
      { scale: 1, ease: "none", scrollTrigger: { trigger: ".final-panel", start: "top bottom", end: "bottom bottom", scrub: true } },
    );

  // Connectors draw themselves once a board scrolls in, then the live one starts flowing.
  for (const box of document.querySelectorAll("[data-edges]"))
    ST.create({
      trigger: box,
      start: "top 70%",
      once: true,
      onEnter: () => {
        const paths = [...box.querySelectorAll(".edges > path")];
        for (const p of paths) {
          const len = p.getTotalLength();
          gsap.fromTo(
            p,
            { strokeDasharray: len, strokeDashoffset: len },
            {
              strokeDashoffset: 0,
              duration: 0.9,
              delay: 0.25 * paths.indexOf(p),
              ease: "power2.inOut",
              onComplete: () => {
                p.style.strokeDasharray = "";
                p.style.strokeDashoffset = "";
                p.classList.toggle("live", p.dataset.live !== undefined);
                if (p === paths.at(-1)) box.classList.add("flowing");
              },
            },
          );
        }
        box.classList.add("drawn");
      },
    });

  // A teammate selects each headline as it comes in, the way a colleague would on a shared board.
  const picks = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        picks.unobserve(e.target);
        e.target.classList.add("picked");
        setTimeout(() => e.target.classList.remove("picked"), 2600);
      }
    },
    { threshold: 0.9 },
  );
  for (const t of document.querySelectorAll(".tn")) picks.observe(t);

  // Each cursor walks from card to card as its board scrolls past.
  for (const cur of document.querySelectorAll(".cur[data-path]")) {
    const box = cur.parentElement;
    const ids = cur.dataset.path.split(" ");
    const at = (id, axis) => {
      const r = document.getElementById(id)?.getBoundingClientRect();
      const o = box.getBoundingClientRect();
      if (!r) return 0;
      return axis === "x" ? r.left - o.left + r.width * 0.7 : r.top - o.top + r.height * 0.6;
    };
    const tl = gsap.timeline({
      scrollTrigger: { trigger: box, start: "top 75%", end: "bottom 45%", scrub: 0.6, invalidateOnRefresh: true },
    });
    tl.set(cur, { x: () => at(ids[0], "x"), y: () => at(ids[0], "y") });
    for (const id of ids.slice(1)) tl.to(cur, { x: () => at(id, "x"), y: () => at(id, "y"), ease: "power1.inOut", duration: 1 });
  }

  const mm = gsap.matchMedia();
  mm.add("(min-width: 961px)", () => {
    // Each window rises a little inside its painting while the frame scrolls past; the frame itself never moves.
    for (const win of document.querySelectorAll(".f-win"))
      gsap.fromTo(
        win,
        { y: 64 },
        { y: -16, ease: "none", scrollTrigger: { trigger: win.parentElement, start: "top bottom", end: "bottom top", scrub: true } },
      );

    // How it works pins and the scroll walks the four steps, but only when the whole section fits the screen.
    const how = document.getElementById("how");
    if (how && flowCtl && how.offsetHeight < innerHeight) {
      flowCtl.stop();
      flowCtl.scrolled = true;
      const st = ST.create({
        trigger: how,
        start: "center center",
        end: `+=${flowCtl.count * 600}`,
        pin: true,
        onUpdate: (self) => {
          const at = self.progress * flowCtl.count;
          flowCtl.show(Math.min(flowCtl.count - 1, Math.floor(at)));
          // The open step's line fills with the scroll inside that step.
          flow.style.setProperty("--fill", String(self.progress >= 1 ? 1 : at - Math.floor(at)));
        },
      });
      return () => {
        st.kill();
        flow.style.removeProperty("--fill");
        flowCtl.scrolled = false;
      };
    }
  });
}

// The board's connectors: each container lists "from>to" card ids; a trailing * marks the edge where work is flowing now.
const SVG = "http://www.w3.org/2000/svg";
// A comet is three dashes sharing one head: a long faint tail, a body, and a bright tip.
const COMET = [24, 10, 3];
const GLOW =
  '<defs><filter id="pulse-glow" filterUnits="userSpaceOnUse" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>';
for (const box of document.querySelectorAll("[data-edges]")) {
  const svg = document.createElementNS(SVG, "svg");
  svg.classList.add("edges");
  svg.setAttribute("aria-hidden", "true");
  box.prepend(svg);
  const to = box.dataset.pulse;
  const pairs = box.dataset.edges.split(/\s+/).map((s) => ({ live: s.endsWith("*"), ids: s.replace("*", "").split(">") }));
  const draw = () => {
    svg.replaceChildren();
    if (to) svg.insertAdjacentHTML("beforeend", GLOW);
    const o = box.getBoundingClientRect();
    for (const { live, ids } of pairs) {
      const a = document.getElementById(ids[0])?.getBoundingClientRect();
      const b = document.getElementById(ids[1])?.getBoundingClientRect();
      if (!a || !b) continue;
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      let x1, y1, x2, y2, d, back;
      // Side to side when the cards sit in a row, top to bottom when one is under the other.
      if (Math.abs(dx) > Math.abs(dy)) {
        const ltr = dx > 0;
        x1 = (ltr ? a.right : a.left) - o.left;
        x2 = (ltr ? b.left : b.right) - o.left;
        y1 = a.top + a.height / 2 - o.top;
        y2 = b.top + b.height / 2 - o.top;
        const k = (x2 - x1) / 2;
        d = `M${x1} ${y1} C${x1 + k} ${y1} ${x2 - k} ${y2} ${x2} ${y2}`;
        back = `M${x2} ${y2} C${x2 - k} ${y2} ${x1 + k} ${y1} ${x1} ${y1}`;
      } else {
        const down = dy > 0;
        x1 = a.left + a.width / 2 - o.left;
        x2 = b.left + b.width / 2 - o.left;
        y1 = (down ? a.bottom : a.top) - o.top;
        y2 = (down ? b.top : b.bottom) - o.top;
        const k = (y2 - y1) / 2;
        d = `M${x1} ${y1} C${x1} ${y1 + k} ${x2} ${y2 - k} ${x2} ${y2}`;
        back = `M${x2} ${y2} C${x2} ${y2 - k} ${x1} ${y1 + k} ${x1} ${y1}`;
      }
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("d", d);
      if (live) path.dataset.live = "";
      svg.append(path);
      if (to) {
        const g = document.createElementNS(SVG, "g");
        g.classList.add("comet");
        g.setAttribute("filter", "url(#pulse-glow)");
        for (const len of COMET) {
          const s = document.createElementNS(SVG, "path");
          // Comets always fly toward the target, so a wire leaving it is traced backwards.
          s.setAttribute("d", ids[0] === to ? back : d);
          s.setAttribute("pathLength", "100");
          s.style.strokeDasharray = `${len} 200`;
          s.style.strokeDashoffset = String(len);
          g.append(s);
        }
        svg.append(g);
      }
      for (const [cx, cy, id] of [
        [x1, y1, ids[0]],
        [x2, y2, ids[1]],
      ]) {
        if (id === to) continue;
        const dot = document.createElementNS(SVG, "circle");
        dot.setAttribute("cx", String(cx));
        dot.setAttribute("cy", String(cy));
        dot.setAttribute("r", "3");
        svg.append(dot);
      }
      if (box.classList.contains("drawn") || !window.gsap) path.classList.toggle("live", live);
    }
    box.comets = [...svg.querySelectorAll(".comet")];
  };
  new ResizeObserver(draw).observe(box);
  draw();
  box.drawEdges = draw;
}

// Cards can be picked up and moved like on the real board, and their wires follow. Touch keeps scrolling the page.
if (matchMedia("(pointer: fine)").matches)
  for (const box of document.querySelectorAll(".cv-in")) {
    let top = 4;
    let frame = 0;
    const redraw = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        box.drawEdges?.();
      });
    };
    for (const card of box.querySelectorAll(".nd, .hub")) {
      if (card.parentElement?.closest(".nd")) continue;
      card.classList.add("movable");
      let hold = null;
      card.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("a, button, input, textarea, summary, [contenteditable]")) return;
        e.preventDefault();
        const [tx = 0, ty = 0] = (card.style.translate || "0px 0px").split(" ").map((v) => parseFloat(v) || 0);
        const r = card.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        // A card stays on its own board, so nothing can be dragged off the page.
        const lim = { x0: b.left - r.left + tx, x1: b.right - r.right + tx, y0: b.top - r.top + ty, y1: b.bottom - r.bottom + ty };
        hold = { x: e.clientX, y: e.clientY, tx, ty, lim, moved: false };
        card.setPointerCapture(e.pointerId);
      });
      card.addEventListener("pointermove", (e) => {
        if (!hold) return;
        const dx = e.clientX - hold.x;
        const dy = e.clientY - hold.y;
        if (!hold.moved && Math.hypot(dx, dy) < 4) return;
        if (!hold.moved) {
          hold.moved = true;
          card.classList.add("dragging");
          card.style.zIndex = String(++top);
        }
        const { x0, x1, y0, y1 } = hold.lim;
        const nx = Math.min(Math.max(hold.tx + dx, x0), x1);
        const ny = Math.min(Math.max(hold.ty + dy, y0), y1);
        card.style.translate = `${nx}px ${ny}px`;
        redraw();
      });
      const drop = () => {
        if (hold?.moved) card.classList.remove("dragging");
        hold = null;
      };
      card.addEventListener("pointerup", drop);
      card.addEventListener("pointercancel", drop);
    }
  }

// Each wire sends one comet at a time, speeding up into the mark, which flares as it lands.
if (gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches)
  for (const box of document.querySelectorAll("[data-pulse]")) {
    const mark = document.getElementById(box.dataset.pulse);
    let seen = false;
    new IntersectionObserver(([e]) => {
      seen = !!e?.isIntersecting;
    }).observe(box);
    const next = (i, wait) => gsap.delayedCall(wait, () => (seen && box.classList.contains("flowing") ? fly(i) : next(i, 1)));
    const fly = (i) => {
      const head = { h: 0 };
      let landed = false;
      gsap.to(head, {
        h: 100 + COMET[0],
        duration: gsap.utils.random(1.4, 1.9),
        ease: "power2.in",
        onUpdate: () => {
          const g = box.comets?.[i];
          if (g) for (const [n, s] of [...g.children].entries()) s.style.strokeDashoffset = String(COMET[n] - head.h);
          if (!landed && head.h >= 100 && mark) {
            landed = true;
            mark.classList.remove("hit");
            void mark.offsetWidth;
            mark.classList.add("hit");
          }
        },
        onComplete: () => next(i, gsap.utils.random(1.6, 4.2)),
      });
    };
    for (const i of (box.comets ?? []).keys()) next(i, gsap.utils.random(0.2, 3));
  }

const nav = document.querySelector(".nav");
const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

for (const btn of document.querySelectorAll("[data-copy]")) {
  btn.addEventListener("click", async () => {
    const label = btn.querySelector("span");
    try {
      await navigator.clipboard.writeText(btn.dataset.copy ?? "");
      if (label) label.textContent = "Copied";
    } catch {
      if (label) label.textContent = "Select and copy";
    }
    setTimeout(() => {
      if (label) label.textContent = "Copy";
    }, 1600);
  });
}

// The hero names the latest release, so the page never needs an edit when a new one ships.
const release = document.querySelector("[data-release]");
if (release) {
  fetch("https://api.github.com/repos/zeative/satgas/releases/latest", { headers: { accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((rel) => {
      if (typeof rel?.tag_name === "string" && /^v\d+(\.\d+)*$/.test(rel.tag_name)) release.textContent = rel.tag_name;
    })
    .catch(() => {});
}

// Only a number GitHub actually gave is shown.
const stars = document.querySelector("[data-stars]");
if (stars) {
  fetch("https://api.github.com/repos/zeative/satgas", { headers: { accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((repo) => {
      const n = repo?.stargazers_count;
      // A young repo's handful of stars says nothing to a visitor; the link alone stays.
      if (typeof n !== "number" || n < 100) return;
      stars.textContent = n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
      stars.hidden = false;
    })
    .catch(() => {});
}
