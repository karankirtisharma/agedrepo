import * as THREE from "three";
import { sharedUniforms } from "./ink.js";
import { makeIcon, lerp } from "./scenes/common.js";

/**
 * Renders small 3D views into DOM boxes marked data-view="icon:web" (or automation,
 * saas, laptop, camera, sketchbook). One fixed canvas, scissored per box.
 * Hovering or focusing the box's card lifts and turns the object.
 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const capture = new URLSearchParams(location.search).has("at");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: capture });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setScissorTest(true);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.light = new THREE.Vector3(-0.5, 0.7, 0.6).normalize();
    this.views = [...document.querySelectorAll("[data-view]")].map((el) => this.makeView(el));
    this.resize();
  }

  makeView(el) {
    const [, kind] = el.dataset.view.split(":");
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
    const obj = makeIcon(kind, { outline: 0.0015, seed: el.dataset.view.length });
    // centre the object on its own bounds so every model frames the same way
    const bounds = new THREE.Box3().setFromObject(obj);
    const centre = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3()).length();
    obj.position.sub(centre);
    const pivot = new THREE.Group();
    pivot.add(obj);
    scene.add(pivot);
    cam.position.set(0, size * 0.35, size * 2.1);
    cam.lookAt(0, 0, 0);
    const view = { el, kind, scene, cam, obj: pivot, lift: 0, hover: false, phase: Math.random() * 6 };
    const host = el.closest("article, figure, a") || el;
    host.addEventListener("pointerenter", () => {
      view.hover = true;
      window.sfx?.("levitate");
    });
    host.addEventListener("pointerleave", () => (view.hover = false));
    host.addEventListener("focusin", () => (view.hover = true));
    host.addEventListener("focusout", () => (view.hover = false));
    // pointer tilt within the host
    host.addEventListener("pointermove", (e) => {
      const r = host.getBoundingClientRect();
      view.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      view.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    view.tx = view.ty = 0;
    view.rx = view.ry = 0;
    return view;
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  frame(dt, time) {
    const H = innerHeight, W = innerWidth;
    const visible = this.views.filter((v) => {
      const r = v.el.getBoundingClientRect();
      v.rect = r;
      // views are cut to every [data-clip] box around them (the carousel, a section's panel inset),
      // so 3D objects follow the same clipping as the HTML around them
      const c = { left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(W, r.right), bottom: Math.min(H, r.bottom) };
      for (let a = v.el.closest("[data-clip]"); a; a = a.parentElement?.closest("[data-clip]")) {
        const b = a.getBoundingClientRect();
        const i = a._inset || { top: 0, right: 0, bottom: 0, left: 0 };
        c.left = Math.max(c.left, b.left + i.left);
        c.top = Math.max(c.top, b.top + i.top);
        c.right = Math.min(c.right, b.right - i.right);
        c.bottom = Math.min(c.bottom, b.bottom - i.bottom);
      }
      v.clip = c;
      return v.clip.right > v.clip.left && v.clip.bottom > v.clip.top;
    });
    this.canvas.style.visibility = visible.length ? "visible" : "hidden";
    if (!visible.length) return;

    const r = this.renderer;
    r.setScissor(0, 0, W, H);
    r.clear();
    sharedUniforms.uLightDir.value.copy(this.light);
    for (const v of visible) {
      const { left, top, width, height } = v.rect;
      const gy = H - top - height;
      // frame-rate independent easing toward the hover / pointer targets
      const k = 1 - Math.pow(0.001, dt);
      v.lift = lerp(v.lift, v.hover ? 1 : 0, k * 0.9);
      v.rx = lerp(v.rx, v.hover ? v.ty * 0.25 : 0, k);
      v.ry = lerp(v.ry, v.hover ? v.tx * 0.5 : 0, k);
      v.obj.position.y = v.lift * 0.03 + Math.sin(time * 1.1 + v.phase) * 0.006;
      v.obj.rotation.set(0.12 + v.rx + Math.sin(time * 0.7 + v.phase) * 0.04, -0.5 + Math.sin(time * 0.35 + v.phase) * 0.35 + v.ry + v.lift * 0.4, Math.sin(time * 0.5 + v.phase) * 0.03);
      v.obj.scale.setScalar(1 + v.lift * 0.08);
      v.cam.aspect = width / height;
      v.cam.updateProjectionMatrix();
      const cl = v.clip;
      r.setViewport(left, gy, width, height);
      r.setScissor(cl.left, H - cl.bottom, cl.right - cl.left, cl.bottom - cl.top);
      r.render(v.scene, v.cam);
    }
  }
}
