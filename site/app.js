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
