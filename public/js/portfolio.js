import { loadAssets } from "./assets.js";
import { setInkTextures } from "./ink.js";
import { Stage } from "./stage.js";
import { sfx } from "./audio.js";
import { BRAND, PROJECTS } from "./content.js";
import { fillBrand, smoothScroll, setupReveals, setupWipe, autoHideHeader, setupThemeToggle, setupSectionPanels, reduceMotion } from "./ui.js";

window.sfx = sfx;
const $ = (s) => document.querySelector(s);

function fillProjects() {
  $("#pf-grid").innerHTML = PROJECTS.map(
    (p, i) => `
    <a class="project" href="${p.url}" target="_blank" rel="noopener" style="--tone:${p.color}">
      <div class="project__art">
        <span class="project__index">0${i + 1}</span>
        <div class="project__view" data-view="icon:${p.art}" aria-hidden="true"></div>
        <span class="project__hatch" aria-hidden="true"></span>
      </div>
      <div class="project__meta">
        <h2 class="project__name">${p.name}</h2>
        <p class="project__type label">${p.type} · ${p.year}</p>
        <p class="project__result">${p.result}</p>
        <ul class="tags">${p.tags.map((t) => `<li>${t}</li>`).join("")}</ul>
        <span class="project__go label">View project &nearr;</span>
      </div>
    </a>`
  ).join("");
  $("#pf-grid").setAttribute("data-reveal-stagger", "");
  $("#pf-notion").href = BRAND.notion;
  $("#pf-book").href = BRAND.booking;
}

async function boot() {
  const { gsap } = window;
  fillBrand();
  fillProjects();
  setupWipe();
  setupThemeToggle();
  const assets = await loadAssets((t) => ($("#loader-pct").textContent = `${Math.round(t * 100)}%`));
  setInkTextures({ hatch: assets.textures.hatch, noise: assets.textures.noise });
  const stage = new Stage($("#stage-canvas"));
  const lenis = smoothScroll();
  window.lenis = lenis;
  setupReveals();
  setupSectionPanels(".pf-library, .pf .contact");
  autoHideHeader(lenis);
  $("#loader").classList.add("is-done");
  if (!reduceMotion) gsap.from(".pf-library .library", { y: 80, autoAlpha: 0, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: ".pf-library", start: "top 85%" } });

  addEventListener("resize", () => {
    stage.resize();
    lenis.resize();
  });
  let last = 0;
  gsap.ticker.add((time) => {
    const dt = Math.min(0.05, time - last || 0.016);
    last = time;
    lenis.raf(time * 1000);
    stage.frame(dt, time);
  });
}

boot().catch((err) => {
  console.error(err);
  $("#loader-pct").textContent = "Something went wrong loading the page. Check the console.";
});
