import { loadAssets } from "./assets.js";
import { setInkTextures } from "./ink.js";
import { Story } from "./story.js";
import { Stage } from "./stage.js";
import { setSound, isSoundOn, soundPreference } from "./audio.js";
import { BRAND, MANIFESTO, SERVICES, EXTRA_SERVICE, PROCESS } from "./content.js";
import { fillBrand, smoothScroll, setupReveals, setupWipe, autoHideHeader, setupSectionPanels, reduceMotion } from "./ui.js";
import { showEntry } from "./entry.js";

const $ = (s) => document.querySelector(s);

// ---------- copy from content.js into the DOM sections ----------
function fillCopy() {
  fillBrand();
  const n = MANIFESTO.headline.length;
  $("#m-headline").innerHTML = MANIFESTO.headline.map((l, i) => `<span class="${i === 0 ? "orn-start" : ""} ${i === n - 1 ? "orn-end" : ""}">${l}</span>`).join("");
  $("#m-left").textContent = MANIFESTO.left;
  $("#m-right").textContent = MANIFESTO.right;
  $("#m-center").textContent = MANIFESTO.center;
  $("#m-body").textContent = MANIFESTO.body;

  $("#services-grid").innerHTML = SERVICES.map(
    (s, i) => `
    <article class="service${i === 0 ? " service--lead" : ""}" tabindex="0">
      <div class="service__view" data-view="icon:${s.model}" aria-hidden="true"></div>
      <p class="service__num label">0${i + 1}</p>
      <h3 class="service__name">${s.name}</h3>
      <p class="service__line">${s.line}</p>
      <ul class="tags">${s.tags.map((t) => `<li>${t}</li>`).join("")}</ul>
    </article>`
  ).join("");
  $("#services-grid").setAttribute("data-reveal-stagger", "");
  $("#services-extra").innerHTML = `<strong>${EXTRA_SERVICE.name}</strong> ${EXTRA_SERVICE.line}`;

  $("#process-track").innerHTML = PROCESS.map(
    (d, i) => `
    <article class="card" aria-roledescription="slide" aria-label="Step ${i + 1} of ${PROCESS.length}">
      <header class="card__head"><span>${BRAND.name} ${BRAND.sub}</span><span>How we work</span><span>0${i + 1} / 0${PROCESS.length}</span></header>
      <div class="card__body">
        <h3 class="card__title">${d.title.map((t) => `<span>${t}</span>`).join("")}</h3>
        <p class="card__text">${d.body}</p>
      </div>
      <div class="card__glass" data-view="icon:${d.model}" aria-hidden="true"></div>
    </article>`
  ).join("");
  $("#process-dots").innerHTML = PROCESS.map((_, i) => `<button type="button" aria-label="Show step ${i + 1}"></button>`).join("");

  $("#contact-book").href = BRAND.booking;
  $("#contact-email").href = `mailto:${BRAND.email}`;
  $("#contact-email").textContent = BRAND.email;
}

// ---------- process carousel: slides with a staggered text entrance ----------
function initCarousel() {
  const { gsap } = window;
  const track = $("#process-track");
  const cards = [...track.children];
  const dots = [...document.querySelectorAll("#process-dots button")];
  let index = 0;
  const go = (i, instant = false) => {
    index = (i + cards.length) % cards.length;
    gsap.to(track, { xPercent: -100 * index, duration: instant || reduceMotion ? 0 : 1.1, ease: "expo.inOut" });
    dots.forEach((d, k) => d.setAttribute("aria-current", String(k === index)));
    if (!instant && !reduceMotion) {
      const card = cards[index];
      gsap.fromTo(card.querySelectorAll(".card__title span, .card__text"), { yPercent: 40, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.9, ease: "expo.out", stagger: 0.07, delay: 0.35 });
    }
  };
  $("#process-prev").addEventListener("click", () => go(index - 1));
  $("#process-next").addEventListener("click", () => go(index + 1));
  dots.forEach((d, k) => d.addEventListener("click", () => go(k)));
  go(0, true);
}

// ---------- boot ----------
async function boot() {
  const { gsap } = window;
  fillCopy();
  setupWipe();
  document.documentElement.classList.add("is-locked");
  const pct = $("#loader-pct");
  const assets = await loadAssets((t) => (pct.textContent = `${Math.round(t * 100)}%`));
  setInkTextures({ hatch: assets.textures.hatch, noise: assets.textures.noise });

  const story = new Story({
    canvas: $("#story-canvas"),
    spacer: $("#story"),
    panelLayer: $("#panel-layer"),
    captionLayer: $("#caption-layer"),
    holdButton: $("#hold"),
    flashEl: $("#flash"),
    stepEl: $("#step"),
  });
  const stage = new Stage($("#stage-canvas"));
  const lenis = smoothScroll();
  // handles for debugging in the console
  window.lenis = lenis;
  window.__story = story;
  window.__stage = stage;

  initCarousel();
  setupReveals();
  setupSectionPanels("#manifesto, #services, #process, .retail, #contact");
  autoHideHeader(lenis);

  $("#loader").classList.add("is-done");
  document.documentElement.classList.remove("is-locked");
  $("#intro-title").classList.add("is-in");
  // entry screen: Story / Portfolio / Contact, morphing into the navbar once picked
  showEntry(lenis, {
    story: () => lenis.scrollTo(0, { immediate: true }),
    portfolio: () => document.querySelector('.pill a[href="portfolio.html"]').click(),
    contact: () => lenis.scrollTo("#contact", { duration: 2.6 }),
  });
  if (!reduceMotion) {
    gsap.from("#intro-title p", { y: 16, autoAlpha: 0, duration: 1, ease: "power3.out", stagger: 0.1, delay: 0.6 });
  }

  $("#nav-story").addEventListener("click", () => lenis.scrollTo($("#story").offsetTop + story.offsetOf("arrival"), { duration: 2.2 }));
  $("#nav-contact").addEventListener("click", () => lenis.scrollTo("#contact", { duration: 2.2 }));
  $("#sound").addEventListener("click", () => setSound(!isSoundOn()));
  // browsers only allow audio after a click or key press: start sound on the first one anywhere
  // (unless the visitor turned it off; the entry menu and the sound button handle themselves)
  const unlock = (e) => {
    if (e.target.closest?.("#sound, #entry") || isSoundOn() || !soundPreference()) return;
    setSound(true);
  };
  addEventListener("pointerdown", unlock, { once: true });
  addEventListener("keydown", unlock, { once: true });

  let resizeT;
  addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      story.resize();
      stage.resize();
      lenis.resize();
      window.ScrollTrigger.refresh();
    }, 150);
  });

  // ?at=workshop:0.5 jumps into a story scene; ?at=#services jumps to a section (handy for review links)
  const at = new URLSearchParams(location.search).get("at");
  if (at) {
    const [id, f] = at.split(":");
    const s = story.scenes.find((x) => x.cfg.id === id);
    const y = s ? s.start + (s.end - s.start) * Number(f || 0.5) : $(id)?.offsetTop;
    if (y != null) requestAnimationFrame(() => lenis.scrollTo(y, { immediate: true, force: true }));
  }

  // one clock for everything: Lenis, the story canvas and the 3D views
  // while the entry screen fully covers the page, the story isn't drawn (keeps its entrance smooth)
  // (one frame is still drawn up front so its shaders are compiled before the entry morphs away)
  const entry = $("#entry");
  const covered = () => entry?.isConnected && !entry.hidden && !("leaving" in entry.dataset);
  let last = 0, warmed = false;
  gsap.ticker.add((time) => {
    const dt = Math.min(0.05, time - last || 0.016);
    last = time;
    lenis.raf(time * 1000);
    if (!covered() || !warmed) {
      story.frame(lenis.scroll, dt, time);
      warmed = true;
    }
    stage.frame(dt, time);
  });
}

boot().catch((err) => {
  console.error(err);
  $("#loader-pct").textContent = "Something went wrong loading the scene. Check the console.";
});
