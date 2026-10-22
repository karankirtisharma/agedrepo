// Shared page UI: brand copy, scroll reveals, page-to-page column wipe, smooth scroll.
import { BRAND } from "./content.js";

export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fill every [data-brand] / [data-link] element from content.js. */
export function fillBrand() {
  document.querySelectorAll("[data-brand]").forEach((el) => (el.textContent = BRAND[el.dataset.brand]));
  document.querySelectorAll("[data-link]").forEach((el) => {
    const k = el.dataset.link;
    if (k === "email") {
      el.href = `mailto:${BRAND.email}`;
      el.textContent = BRAND.email;
    } else el.href = BRAND[k];
  });
}

/** Lenis smooth scroll driven by GSAP's ticker, wired into ScrollTrigger. */
export function smoothScroll() {
  const { gsap, ScrollTrigger, Lenis } = window;
  gsap.registerPlugin(ScrollTrigger);
  // a slightly slower follow and lighter wheel give the story weight: it glides rather than snaps
  const lenis = new Lenis({ lerp: reduceMotion ? 1 : 0.07, wheelMultiplier: 0.85, touchMultiplier: 1.2, smoothWheel: !reduceMotion });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

/**
 * Scroll reveals.
 *  data-reveal="lines": each child <span> rises out of a mask, staggered
 *  data-reveal: the element fades and lifts in
 */
export function setupReveals(root = document) {
  const { gsap } = window;
  if (reduceMotion) return;
  root.querySelectorAll('[data-reveal="lines"]').forEach((el) => {
    const lines = [...el.children];
    lines.forEach((l) => {
      if (l.parentElement.classList.contains("mask")) return;
      const m = document.createElement("span");
      m.className = "mask";
      l.replaceWith(m);
      m.appendChild(l);
    });
    gsap.from(lines, {
      yPercent: 110,
      rotate: 2,
      duration: 1.1,
      ease: "expo.out",
      stagger: 0.09,
      scrollTrigger: { trigger: el, start: "top 85%" },
    });
  });
  root.querySelectorAll("[data-reveal]:not([data-reveal='lines'])").forEach((el) => {
    gsap.from(el, { y: 40, autoAlpha: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%" } });
  });
  root.querySelectorAll("[data-reveal-stagger]").forEach((el) => {
    gsap.from(el.children, { y: 60, autoAlpha: 0, duration: 1, ease: "power3.out", stagger: 0.12, scrollTrigger: { trigger: el, start: "top 85%" } });
  });
}

/**
 * Sections open like comic panels: each enters inset (an ink gutter around it) and
 * expands to full width as it scrolls up, the same language as the story's panel bursts.
 * The px insets are stored on the element so 3D views inside are clipped to match.
 */
export function setupSectionPanels(selector) {
  const { gsap } = window;
  if (reduceMotion) return;
  const els = [...document.querySelectorAll(selector)];
  // what the inset uncovers is the colour of the section above (not the page's ink), so a panel
  // opens over matching colour with no black gutter. Colours are read before any wrapping.
  const under = els.map((el) => {
    const prev = el.previousElementSibling;
    const c = prev ? getComputedStyle(prev).backgroundColor : "";
    return c && c !== "transparent" && c !== "rgba(0, 0, 0, 0)" ? c : null;
  });
  els.forEach((el, i) => {
    if (!under[i]) return;
    const wrap = document.createElement("div");
    wrap.className = "panel-under";
    wrap.style.backgroundColor = under[i];
    el.before(wrap);
    wrap.appendChild(el);
  });
  els.forEach((el) => {
    el.dataset.clip = "";
    const st = { t: 0 };
    const apply = () => {
      const k = 1 - st.t;
      const mobile = innerWidth < 768;
      const top = k * innerHeight * (mobile ? 0.04 : 0.08);
      const side = k * innerWidth * (mobile ? 0.03 : 0.05);
      el._inset = { top, right: side, bottom: 0, left: side };
      el.style.clipPath = st.t >= 0.999 ? "none" : `inset(${top}px ${side}px 0px ${side}px)`;
    };
    apply();
    gsap.to(st, {
      t: 1,
      ease: "none",
      onUpdate: apply,
      scrollTrigger: { trigger: el, start: "top bottom", end: "top 30%", scrub: true, onRefresh: apply },
    });
  });
}

/** Column wipe between pages: covers on leave, uncovers on arrival. */
export function setupWipe() {
  const { gsap } = window;
  const cols = document.querySelectorAll(".wipe span");
  let arrived = false;
  try {
    arrived = sessionStorage.getItem("wipe") === "1";
    sessionStorage.removeItem("wipe");
  } catch {}
  if (arrived && !reduceMotion) {
    gsap.set(cols, { scaleY: 1, transformOrigin: "50% 0%" });
    gsap.to(cols, { scaleY: 0, duration: 0.7, ease: "power3.inOut", stagger: { each: 0.05, from: "random" }, delay: 0.1 });
  }
  document.querySelectorAll("a[data-wipe]").forEach((a) => {
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || reduceMotion) return;
      e.preventDefault();
      try { sessionStorage.setItem("wipe", "1"); } catch {}
      gsap.set(cols, { transformOrigin: "50% 100%" });
      gsap.to(cols, {
        scaleY: 1,
        duration: 0.6,
        ease: "power3.inOut",
        stagger: { each: 0.05, from: "random" },
        onComplete: () => (location.href = a.href),
      });
    });
  });
}

/** Header hides on scroll down, returns on scroll up. */
export function autoHideHeader(lenis) {
  const header = document.querySelector(".site-header");
  let last = 0;
  lenis.on("scroll", ({ scroll }) => {
    const down = scroll > last && scroll > 200;
    header.classList.toggle("is-hidden", down);
    last = scroll;
  });
}
