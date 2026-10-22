// Background music: one calm piano track (CC0, see music/CREDITS.txt), looping quietly.
// On by default. Browsers only allow audio after a click or key press, so it starts on the
// first one; the sound button mutes it and the choice is remembered.

const KEY = "ruddix-sound";
const VOLUME = 0.4;
let ctx = null, gain = null, el = null;
let enabled = false;

export function soundPreference() {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

function start() {
  el = new Audio("music/theme.mp3");
  el.loop = true;
  el.preload = "auto";
  // volume goes through Web Audio: iOS ignores an <audio> element's own volume
  ctx = new AudioContext();
  gain = ctx.createGain();
  gain.gain.value = 0;
  ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);
  // pause while the tab is hidden, pick up again on return
  document.addEventListener("visibilitychange", () => {
    if (!enabled) return;
    if (document.hidden) el.pause();
    else el.play().catch(() => {});
  });
}

export function setSound(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch {}
  if (on && !el) start();
  if (el) {
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    if (on) {
      ctx.resume();
      el.play().catch(() => {});
      gain.gain.linearRampToValueAtTime(VOLUME, t + 2.5);
    } else {
      gain.gain.linearRampToValueAtTime(0, t + 0.6);
      setTimeout(() => !enabled && el.pause(), 700);
    }
  }
  document.querySelectorAll("#sound").forEach((b) => b.setAttribute("aria-pressed", String(on)));
}

export function isSoundOn() {
  return enabled;
}
