// Entry screen: a giant version of the nav pill with three choices.
// Picking one shrinks the whole screen into the real navbar pill (top right), then
// starts the story, wipes to the portfolio, or glides to the contact section.
import { reduceMotion } from "./ui.js";
import { setSound, soundPreference, sfx } from "./audio.js";

const $ = (s) => document.querySelector(s);

/** Show the entry screen. `actions` = { story(), portfolio(), contact() }. Resolves once a choice has played out. */
export function showEntry(lenis, actions) {
  const entry = $("#entry");
  const params = new URLSearchParams(location.search);
  // skip for deep links (#contact from the portfolio, ?at= review links)
  if (!entry || location.hash || params.has("at")) {
    entry?.remove();
    return Promise.resolve();
  }
  const { gsap } = window;
  lenis.stop();
  entry.hidden = false;
  document.querySelector(".site-header").classList.remove("is-hidden");

  if (!reduceMotion) {
    gsap.from(".entry__word", { yPercent: 110, duration: 1.2, ease: "expo.out", stagger: 0.08, clearProps: "transform" });
    gsap.from(".entry__num, .entry__hint, .entry__kicker, .entry__tag", { autoAlpha: 0, y: 10, duration: 0.8, ease: "power3.out", stagger: 0.04, delay: 0.3 });
  }
  entry.querySelector(".entry__nav button").focus({ preventScroll: true });

  // sound is on by default; the visitor's pick is the click that lets the browser start audio
  const soundBtn = entry.querySelector(".entry__sound");
  let soundOn = soundPreference();
  const showSound = () => {
    soundBtn.setAttribute("aria-pressed", String(soundOn));
    soundBtn.querySelector("span").textContent = soundOn ? "on" : "off";
  };
  showSound();
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    showSound();
  });

  return new Promise((resolve) => {
    entry.querySelectorAll("[data-go]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const go = btn.dataset.go;
        entry.dataset.leaving = ""; // the story behind starts rendering again (see main.js)
        setSound(soundOn);
        sfx("click");
        sfx("swish");
        morphToNav(entry, btn, go).then(() => {
          entry.remove();
          lenis.start();
          actions[go]?.();
          resolve(go);
        });
      }, { once: true })
    );
  });
}

/** Shrink the full-screen panel into the header pill, swapping big labels for the small nav row. */
function morphToNav(entry, picked, go) {
  const { gsap } = window;
  const panel = entry.querySelector(".entry__panel");
  const pill = $(".site-header .pill");
  const navTarget = { story: "#nav-story", portfolio: '.pill a[href="portfolio.html"]', contact: "#nav-contact" }[go];
  if (reduceMotion) return Promise.resolve();

  const to = pill.getBoundingClientRect();
  const from = panel.getBoundingClientRect();
  const others = [...entry.querySelectorAll("[data-go]")].filter((b) => b !== picked);
  return new Promise((done) => {
    // the panel is sized by `inset`; free its right/bottom edges so width/height can animate
    gsap.set(panel, { left: from.left, top: from.top, width: from.width, height: from.height, right: "auto", bottom: "auto" });
    const tl = gsap.timeline({ onComplete: done });
    window.__entryTl = tl; // debug handle (scrub the morph from the console)
    tl.to(picked, { backgroundColor: "var(--ink)", color: "var(--paper)", duration: 0.25, ease: "power2.out" })
      .to(others, { autoAlpha: 0.15, duration: 0.25 }, "<")
      .to(".entry__kicker, .entry__foot, .entry__hint, .entry__num", { autoAlpha: 0, duration: 0.25 }, "<")
      .to(entry, { backgroundColor: "rgba(0,0,0,0)", duration: 0.5 }, "<0.15")
      // the big words drop away as the panel shrinks
      .to(".entry__word", { yPercent: -110, autoAlpha: 0, duration: 0.4, ease: "power3.in", stagger: 0.03 }, "<0.05")
      // the panel flies up to the navbar and becomes it
      .fromTo(panel,
        { left: from.left, top: from.top, width: from.width, height: from.height },
        { left: to.left, top: to.top, width: to.width, height: to.height, borderWidth: 2, duration: 1.0, ease: "expo.inOut" }, "<0.15")
      .to(".entry__mini", { autoAlpha: 1, duration: 0.3 }, "-=0.35")
      .to(entry, { autoAlpha: 0, duration: 0.25 })
      .fromTo(navTarget, { backgroundColor: "var(--ink)", color: "var(--paper)" }, { backgroundColor: "rgba(0,0,0,0)", color: "var(--ink)", duration: 0.8, clearProps: "backgroundColor,color" }, "<");
  });
}
