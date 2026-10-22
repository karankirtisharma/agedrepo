import * as THREE from "three";
import { STORY } from "./content.js";
import { sharedUniforms, tickInk } from "./ink.js";
import { IntroScene } from "./scenes/intro.js";
import { ArrivalScene, WorkshopScene } from "./scenes/prologue.js";
import { IdeaScene, DesignScene } from "./scenes/workflow-a.js";
import { BuildScene, AutomateScene } from "./scenes/workflow-b.js";
import { LaunchScene, ScaleScene } from "./scenes/workflow-c.js";
import { audio, sfx } from "./audio.js";

const REGISTRY = {
  intro: IntroScene,
  arrival: ArrivalScene,
  workshop: WorkshopScene,
  idea: IdeaScene,
  design: DesignScene,
  build: BuildScene,
  automate: AutomateScene,
  launch: LaunchScene,
  scale: ScaleScene,
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpRect = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });

/**
 * Set a camera's aspect. Scenes are framed for landscape; on tall panels (phones) the
 * vertical FOV widens so the horizontal view stays as if the panel were MIN_ASPECT wide,
 * instead of cropping the sides.
 */
const MIN_ASPECT = 1.15;
function fitCamera(cam, aspect) {
  cam.aspect = aspect;
  if (cam.isPerspectiveCamera) {
    cam.userData.baseFov ??= cam.fov;
    const base = THREE.MathUtils.degToRad(cam.userData.baseFov);
    cam.fov = aspect >= MIN_ASPECT ? cam.userData.baseFov : Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(base / 2) * MIN_ASPECT) / aspect)));
  }
  cam.updateProjectionMatrix();
}

/**
 * Scroll-driven story with dive-through transitions.
 * Each scene stays pinned for `length` viewport heights (local progress 0 -> 1). In the
 * one-viewport gap after it, the camera dives into the scene's `diveTarget` while the next
 * scene bursts out of that spot as a growing comic panel. The last scene scrolls up and
 * hands over to the page sections.
 */
export class Story {
  constructor({ canvas, spacer, panelLayer, captionLayer, holdButton, flashEl, stepEl }) {
    this.canvas = canvas;
    this.spacer = spacer;
    this.panelLayer = panelLayer;
    this.captionLayer = captionLayer;
    this.hold = holdButton;
    this.flashEl = flashEl;
    this.stepEl = stepEl;

    // keep the drawing buffer only for ?at= review links so headless screenshots can capture it
    const capture = new URLSearchParams(location.search).has("at");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: capture });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.input = { holding: false, pointer: new THREE.Vector2(), time: 0, shift: 0, dive: 0, flash: (v) => this.setFlash(v) };
    this.scenes = STORY.map((cfg) => {
      const scene = new REGISTRY[cfg.id]({ renderer: this.renderer });
      return { cfg, scene, captions: cfg.captions.map((c) => this.makeCaption(c)), start: 0, end: 0 };
    });
    this.borders = [];
    this.tmpQ = new THREE.Quaternion();
    this.tmpM = new THREE.Matrix4();
    this.bindInput();
    this.resize();
  }

  makeCaption(c) {
    const el = document.createElement("p");
    el.className = "caption";
    el.innerHTML = c.text
      .split(" ")
      .map((w) => {
        const hot = /^\*.*\*[.,:;!?]*$/.test(w) || /^\*/.test(w) || /\*[.,:;!?]*$/.test(w);
        return `<span class="w${hot ? " hot" : ""}">${w.replace(/\*/g, "")}</span>`;
      })
      .join(" ");
    el.style.visibility = "hidden";
    this.captionLayer.appendChild(el);
    return { cfg: c, el, shown: false };
  }

  bindInput() {
    const down = (e) => {
      e.preventDefault();
      if (!this.input.holding) sfx("click");
      this.input.holding = true;
      this.hold.classList.add("is-holding");
    };
    const up = () => {
      this.input.holding = false;
      this.hold.classList.remove("is-holding");
    };
    this.hold.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    this.hold.addEventListener("keydown", (e) => (e.key === " " || e.key === "Enter") && down(e));
    this.hold.addEventListener("keyup", up);
    window.addEventListener("pointermove", (e) => {
      this.input.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.vp = { w, h, mobile: w < 768 };
    this.renderer.setSize(w, h, false);
    let y = 0;
    for (const s of this.scenes) {
      s.start = y;
      s.end = y + s.cfg.length * h;
      s.gap = (s.cfg.gap ?? 1) * h; // scroll spent diving into the next scene (0 = none)
      y = s.end + s.gap;
    }
    const last = this.scenes.at(-1);
    y = last.end + h; // the last scene scrolls out over one viewport
    this.total = y;
    this.spacer.style.height = `${this.total}px`;
  }

  offsetOf(id) {
    return this.scenes.find((s) => s.cfg.id === id)?.start ?? 0;
  }

  setFlash(v) {
    this.flashEl.style.opacity = String(v);
  }

  frame(scroll, dt, time) {
    const { w, h } = this.vp;
    const local = scroll - this.spacer.offsetTop;
    this.input.time = time;
    tickInk(time);

    const active = local > -h && local < this.total;
    this.canvas.style.visibility = active ? "visible" : "hidden";
    this.panelLayer.style.visibility = active ? "visible" : "hidden";
    if (!active) {
      this.sound(local >= this.total ? "sections" : "intro");
      return this.hideAll();
    }

    const r = this.renderer;
    r.setScissorTest(false);
    r.setClearColor(0x111013, 1);
    r.clear();
    r.setScissorTest(true);
    this.borderIndex = 0;

    const full = { x: 0, y: 0, w, h };
    const n = this.scenes.length;
    let pinned = null, pinnedP = 0, pinnedIndex = -1;
    let out = null, inc = null, k = 0;
    let slide = 0;
    for (let i = 0; i < n; i++) {
      const s = this.scenes[i];
      if (local >= s.start && local <= s.end) {
        pinned = s;
        pinnedIndex = i;
        pinnedP = (local - s.start) / (s.end - s.start);
      } else if (local > s.end && local < s.end + (i < n - 1 ? s.gap : h)) {
        if (i < n - 1) {
          out = s;
          inc = this.scenes[i + 1];
          k = (local - s.end) / s.gap;
        } else {
          pinnedIndex = i;
          pinned = s;
          pinnedP = 1;
          slide = (local - s.end) / h; // last scene scrolls up into the page sections
        }
      }
    }

    // scenes not on screen this frame tidy up their DOM overlays
    for (const s of this.scenes) if (s !== pinned && s !== out && s !== inc) s.scene.hide?.();

    this.panelLayer.style.clipPath = "";
    if (pinned) {
      this.input.shift = slide;
      this.input.dive = 0;
      pinned.scene.update(pinnedP, dt, this.input);
      const rect = { x: 0, y: -slide * h, w, h };
      const next = this.scenes[pinnedIndex + 1];
      const rv = pinned.scene.reveal;
      if (rv && next) {
        // the scene opens like a window onto the next one: draw the next scene first,
        // clip its panel borders to the opening, then draw this scene on top (no clear)
        this.input.shift = 1;
        next.scene.update(0, dt, this.input);
        this.renderScene(next, 0, rect);
        this.panelLayer.style.clipPath = `inset(${rv.y * h}px ${(1 - rv.x - rv.w) * w}px ${(1 - rv.y - rv.h) * h}px ${rv.x * w}px)`;
        this.input.shift = slide;
        for (const pnl of pinned.scene.layout(pinnedP, this.vp)) {
          if (pnl.visible) this.drawPanel(pinned.scene, pnl.cam, { x: rect.x + pnl.x * w, y: rect.y + pnl.y * h, w: pnl.w * w, h: pnl.h * h }, rect, true);
        }
      } else {
        this.renderScene(pinned, pinnedP, rect);
      }
    } else if (out) {
      this.renderDive(out, inc, k, dt, full);
    }
    this.sound(pinned ? pinned.cfg.id : !out ? "intro" : k < 0.5 ? out.cfg.id : inc.cfg.id, out ? k : -1);
    for (const s of this.scenes) {
      if (s === pinned) {
        s.scene.sound?.(pinnedP, s.lastP ?? pinnedP, dt, this.input);
        s.lastP = pinnedP;
      } else s.lastP = undefined;
    }

    for (let i = this.borderIndex; i < this.borders.length; i++) this.borders[i].style.display = "none";

    // captions, hold button and step label only while a scene is pinned
    for (const s of this.scenes) {
      const isPinned = s === pinned;
      s.captions.forEach((c) => this.updateCaption(c, isPinned ? pinnedP : -1, isPinned ? slide : 0));
    }
    const hold = pinned && !slide && pinned.cfg.hold && pinnedP >= pinned.cfg.hold.from && pinnedP <= pinned.cfg.hold.to ? pinned.cfg.hold : null;
    this.updateHold(hold);
    const step = pinned && !slide ? pinned.cfg.step : null;
    this.stepEl.classList.toggle("is-visible", !!step);
    if (step && this.stepEl.textContent !== step) this.stepEl.textContent = step;
  }

  /** Ambience/music follow the scene on screen; dives whoosh and burst. */
  sound(id, dive = -1) {
    audio.scene(id);
    if (dive < 0) {
      this.whooshed = this.burst = false;
      return;
    }
    if (!this.whooshed) sfx("whoosh");
    if (!this.burst && dive > 0.3) sfx("burst");
    this.whooshed = true;
    this.burst ||= dive > 0.3;
  }

  /** Outgoing scene dives into its target; incoming scene grows out of that spot. */
  renderDive(out, inc, k, dt, full) {
    const { w, h } = this.vp;
    const kd = easeInOut(k);

    // ---- outgoing: its main panel expands to the full screen, camera pushes into the target
    this.input.shift = 1; // hides the scene's DOM overlays during the move
    this.input.dive = k;
    out.scene.update(1, dt, this.input);
    const panels = out.scene.layout(1, this.vp);
    const main = panels[0];
    const cam = main.cam;
    const fromRect = { x: main.x * w, y: main.y * h, w: main.w * w, h: main.h * h };
    const rect = lerpRect(fromRect, full, easeOut(clamp01(k * 1.8)));
    let origin = { x: w / 2, y: h / 2 };
    const target = out.scene.diveTarget;
    if (target && cam.isPerspectiveCamera) {
      const q0 = cam.quaternion.clone();
      cam.position.lerp(target, kd * 0.82);
      this.tmpM.lookAt(cam.position, target, cam.up);
      this.tmpQ.setFromRotationMatrix(this.tmpM);
      cam.quaternion.copy(q0).slerp(this.tmpQ, easeOut(clamp01(k * 2)));
      fitCamera(cam, rect.w / rect.h);
      cam.updateMatrixWorld();
      const pnt = target.clone().project(cam);
      origin = { x: rect.x + (pnt.x * 0.5 + 0.5) * rect.w, y: rect.y + (1 - (pnt.y * 0.5 + 0.5)) * rect.h };
    }
    this.clearRect(full, out.scene.bg);
    // the other panels stay put and slide under the growing main panel. Their DOM borders sit
    // above the canvas, so each panel only draws (and frames) the part below the main panel.
    for (const pnl of panels.slice(1)) {
      if (!pnl.visible) continue;
      const pr = { x: pnl.x * w, y: pnl.y * h, w: pnl.w * w, h: pnl.h * h };
      const overlaps = pr.x < rect.x + rect.w && pr.x + pr.w > rect.x && pr.y < rect.y + rect.h && pr.y + pr.h > rect.y;
      const cut = overlaps ? rect.y + rect.h - pr.y : 0;
      if (cut >= pr.h) continue;
      const clip = { x: 0, y: pr.y + cut, w, h };
      if (this.drawPanel(out.scene, pnl.cam, pr, clip, true) && pnl.border) this.placeBorder(this.borderIndex++, pr.x, pr.y, pr.w, pr.h, cut);
    }
    this.clearRect(rect, out.scene.bg);
    this.drawPanel(out.scene, cam, rect, full, false);
    if (main.border && rect.w < w - 1) this.placeBorder(this.borderIndex++, rect.x, rect.y, rect.w, rect.h);

    // ---- incoming: a comic panel bursts open from the dive point and fills the screen
    const g = easeInOut(clamp01((k - 0.25) / 0.75));
    if (g > 0) {
      const grow = lerpRect({ x: origin.x, y: origin.y, w: 0, h: 0 }, full, g);
      this.input.shift = 1;
      this.input.dive = 0;
      inc.scene.update(0, dt, this.input);
      this.renderScene(inc, 0, grow);
      if (g < 0.999) this.placeBorder(this.borderIndex++, grow.x, grow.y, grow.w, grow.h);
    }
  }

  /** Draw a scene's page (background + panels) into a CSS-pixel rect on screen. */
  renderScene(s, p, rect) {
    const { w, h } = this.vp;
    this.clearRect(rect, s.scene.bg);
    for (const pnl of s.scene.layout(p, this.vp)) {
      if (!pnl.visible) continue;
      const pr = { x: rect.x + pnl.x * rect.w, y: rect.y + pnl.y * rect.h, w: pnl.w * rect.w, h: pnl.h * rect.h };
      if (this.drawPanel(s.scene, pnl.cam, pr, rect, true) && pnl.border) this.placeBorder(this.borderIndex++, pr.x, pr.y, pr.w, pr.h);
    }
  }

  clearRect(rect, color) {
    const { w, h } = this.vp;
    const x0 = Math.max(0, rect.x), x1 = Math.min(w, rect.x + rect.w);
    const y0 = Math.max(0, rect.y), y1 = Math.min(h, rect.y + rect.h);
    if (x1 <= x0 || y1 <= y0) return;
    this.renderer.setScissor(x0, h - y1, x1 - x0, y1 - y0);
    this.renderer.setClearColor(color, 1);
    this.renderer.clear();
  }

  /** Render one camera into rect `pr`, clipped to `clip` and the screen. Returns false if off screen. */
  drawPanel(scene, cam, pr, clip, setAspect) {
    const { w, h } = this.vp;
    const x0 = Math.max(0, pr.x, clip.x), x1 = Math.min(w, pr.x + pr.w, clip.x + clip.w);
    const y0 = Math.max(0, pr.y, clip.y), y1 = Math.min(h, pr.y + pr.h, clip.y + clip.h);
    if (x1 - x0 < 1 || y1 - y0 < 1 || pr.w < 1 || pr.h < 1) return false;
    if (setAspect) fitCamera(cam, pr.w / pr.h);
    sharedUniforms.uLightDir.value.copy(scene.light);
    const r = this.renderer;
    r.setViewport(pr.x, h - (pr.y + pr.h), pr.w, pr.h);
    r.setScissor(x0, h - y1, x1 - x0, y1 - y0);
    r.clearDepth();
    r.render(scene.scene, cam);
    return true;
  }

  /** Position a panel frame; `cut` hides its top `cut` pixels (where another panel covers it). */
  placeBorder(i, x, y, w, h, cut = 0) {
    let el = this.borders[i];
    if (!el) {
      el = document.createElement("div");
      el.className = "panel-border";
      this.panelLayer.appendChild(el);
      this.borders[i] = el;
    }
    el.style.display = "block";
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.clipPath = cut > 0 ? `inset(${cut}px 0 0 0)` : "";
  }

  updateCaption(c, p, shift) {
    const on = p >= c.cfg.from && p <= c.cfg.to;
    if (on !== c.shown) {
      c.shown = on;
      c.el.style.visibility = on ? "visible" : "hidden";
      if (on) {
        window.gsap?.fromTo(c.el.querySelectorAll(".w"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.025, ease: "power2.out" });
        sfx("textbox");
      }
    }
    if (!on) return;
    const m = this.vp.mobile;
    const x = m ? 0.05 : c.cfg.x, y = m ? Math.min(c.cfg.y, 0.78) : c.cfg.y, wd = m ? 0.9 : c.cfg.w;
    c.el.style.width = `${wd * 100}vw`;
    c.el.style.transform = `translate3d(${x * 100}vw, ${(y - shift) * 100}vh, 0)`;
  }

  updateHold(cfg) {
    const show = !!cfg;
    this.hold.classList.toggle("is-visible", show);
    this.hold.setAttribute("aria-hidden", String(!show));
    this.hold.tabIndex = show ? 0 : -1;
    if (cfg) this.hold.querySelector(".hold__label").textContent = cfg.label;
    if (!show && this.input.holding) {
      this.input.holding = false;
      this.hold.classList.remove("is-holding");
    }
  }

  hideAll() {
    this.panelLayer.style.clipPath = "";
    this.scenes.forEach((s) => {
      s.scene.hide?.();
      s.captions.forEach((c) => {
        c.shown = false;
        c.el.style.visibility = "hidden";
      });
    });
    this.borders.forEach((b) => (b.style.display = "none"));
    this.updateHold(null);
    this.stepEl.classList.remove("is-visible");
  }
}
