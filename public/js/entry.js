// Entry screen: a giant version of the nav pill with three choices.
// Picking one shrinks the whole screen into the real navbar pill (top right), then
// starts the story, wipes to the portfolio, or glides to the contact section.
import { reduceMotion } from "./ui.js";
import { setSound, soundPreference } from "./audio.js";

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

/**
 * Shrink the full-screen panel into the header pill. The menu empties first, the bare panel
 * flies onto the pill and takes its exact box (padding 0, 2px border), and only then the real
 * pill appears underneath and the panel fades off it, so the hand-over is invisible.
 */
function morphToNav(entry, picked, go) {
  const { gsap } = window;
  const panel = entry.querySelector(".entry__panel");
  const pill = $(".site-header .pill");
  const navTarget = { story: "#nav-story", portfolio: '.pill a[href="portfolio.html"]', contact: "#nav-contact" }[go];
  if (reduceMotion) return Promise.resolve();

  const to = pill.getBoundingClientRect();
  const from = panel.getBoundingClientRect();
  return new Promise((done) => {
    // the panel is sized by `inset`; free its right/bottom edges so width/height can animate
    gsap.set(panel, { left: from.left, top: from.top, width: from.width, height: from.height, right: "auto", bottom: "auto", autoRound: false });
    gsap.set(pill, { autoAlpha: 0 }); // the real pill waits under the landing spot
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(pill, { clearProps: "opacity,visibility" });
        done();
      },
    });
    window.__entryTl = tl; // debug handle (scrub the morph from the console)
    tl.to(picked, { backgroundColor: "var(--ink)", color: "var(--paper)", duration: 0.2, ease: "power2.out" })
      // the menu empties: words drop, everything else (the picked highlight too) fades out
      .to(".entry__word", { yPercent: -110, duration: 0.45, ease: "power3.in", stagger: 0.04 }, "+=0.05")
      .to(".entry__kicker, .entry__foot, .entry__hint, .entry__num", { autoAlpha: 0, duration: 0.3 }, "<")
      .to(".entry__nav", { autoAlpha: 0, duration: 0.35 }, "<0.15")
      .to(entry, { backgroundColor: "rgba(0,0,0,0)", duration: 0.7, ease: "power2.inOut" }, "<")
      // the bare panel flies up and takes the pill's exact box
      .fromTo(panel,
        { left: from.left, top: from.top, width: from.width, height: from.height },
        { left: to.left, top: to.top, width: to.width, height: to.height, borderWidth: 2, padding: 0, duration: 1.05, ease: "expo.inOut", autoRound: false }, "<0.1")
      // landed: snap to the pill's live box (sub-pixel layout shifts), show the real pill beneath
      // and fade the panel off it, so the labels seem to ink in
      .add(() => {
        const b = pill.getBoundingClientRect();
        gsap.set(panel, { left: b.left, top: b.top, width: b.width, height: b.height, autoRound: false });
      })
      .set(pill, { autoAlpha: 1 })
      .to(entry, { autoAlpha: 0, duration: 0.45, ease: "power1.out" })
      .fromTo(navTarget, { backgroundColor: "var(--ink)", color: "var(--paper)" }, { backgroundColor: "rgba(0,0,0,0)", color: "var(--ink)", duration: 0.9, delay: 0.15, clearProps: "backgroundColor,color" }, "<");
  });
}
