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
