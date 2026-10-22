import * as THREE from "three";
import { StoryScene, range, ease } from "./common.js";
import { sharedUniforms, PALETTE } from "../ink.js";

// A blinking text caret under the title. On scroll it stretches to full height,
// then widens until it splits the screen open onto paper (the Idea scene).
export class IntroScene extends StoryScene {
  constructor(ctx) {
    super(ctx);
    this.bg = PALETTE.ink;
    this.cam = this.camera();
    this.mat = new THREE.ShaderMaterial({
      depthWrite: false,
      transparent: true,
      uniforms: {
        ...sharedUniforms,
        uReveal: { value: 0 },
        uTall: { value: 0 },
        uWide: { value: 0 },
        uBlink: { value: 1 },
        uAspect: { value: 1 },
        uInk: { value: PALETTE.ink },
        uPaper: { value: PALETTE.paper },
        uRed: { value: PALETTE.red },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.5, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uHatch; uniform sampler2D uNoise;
        uniform float uTime; uniform float uTall; uniform float uWide; uniform float uBlink; uniform float uAspect;
        uniform vec3 uInk; uniform vec3 uPaper; uniform vec3 uRed; uniform float uReveal;
        varying vec2 vUv;
        void main(){
          // faint vertical hatch drifting across the ink, like a page seen in the dark
          float l = texture2D(uHatch, vec2(vUv.x * uAspect * 1.4 + uTime * 0.01, vUv.y * 0.6)).r;
          vec3 col = mix(uInk, vec3(0.16, 0.15, 0.16), step(0.86, l) * 0.6);

          // caret: starts under the title, grows tall, then wide
          float cy = mix(0.12, 0.5, uTall);
          float hh = mix(0.045, 0.6, uTall);
          float hw = mix(0.006, 0.62, uWide);
          vec2 d = abs(vec2((vUv.x - 0.5) * uAspect / max(uAspect, 1.0), vUv.y - cy));
          // ragged ink edge
          float n = texture2D(uNoise, vUv * vec2(3.0, 8.0) + floor(uTime * 6.0) * 0.13).r - 0.5;
          float inside = step(d.x, hw + n * 0.01 * uWide) * step(d.y, hh);
          float blinkOn = mix(step(0.45, fract(uTime * 1.1)), 1.0, uBlink);
          vec3 caret = mix(uPaper, uPaper * 0.96, step(0.9, l));
          col = mix(col, caret, inside * blinkOn);
          // red rim on the opening edges as it splits
          float rim = step(abs(d.x - hw), 0.004 + uWide * 0.006) * step(d.y, hh) * step(0.02, uWide);
          col = mix(col, uRed, rim);
          float g = texture2D(uNoise, gl_FragCoord.xy / 256.0 + floor(uTime * 8.0) * 0.31).r - 0.5;
          // once the caret opens, its inside turns transparent: the next scene shows through
          float alpha = 1.0 - inside * blinkOn * uReveal * (1.0 - rim);
          gl_FragColor = vec4(col + g * 0.035, alpha);
        }
      `,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.title = document.getElementById("intro-title");
  }
  layout(p, vp) {
    this.mat.uniforms.uAspect.value = vp.w / vp.h;
    return [{ x: 0, y: 0, w: 1, h: 1, cam: this.cam, border: false, visible: true }];
  }
  hide() {
    this.title.style.visibility = "hidden";
  }
  /** The caret's opening as screen fractions {x, y, w, h} (top-left origin), mirroring the shader. */
  caretRect(tall, wide, aspect) {
    const cy = 0.12 + (0.5 - 0.12) * tall, hh = 0.045 + (0.6 - 0.045) * tall, hw = 0.006 + (0.62 - 0.006) * wide;
    const hwX = aspect >= 1 ? hw : hw / aspect;
    const x0 = Math.max(0, 0.5 - hwX), x1 = Math.min(1, 0.5 + hwX);
    const yTop = Math.max(0, 1 - (cy + hh)), yBot = Math.min(1, 1 - (cy - hh));
    return { x: x0, y: yTop, w: x1 - x0, h: yBot - yTop };
  }
  update(p, _dt, input) {
    const u = this.mat.uniforms;
    u.uBlink.value = p < 0.12 ? 0 : 1; // blinks until you start scrolling
    u.uTall.value = ease(range(p, 0.12, 0.5));
    u.uWide.value = ease(range(p, 0.5, 1));
    // once the caret is a full-height line it becomes a window onto the Idea scene
    u.uReveal.value = p > 0.4 ? 1 : 0;
    this.reveal = p > 0.4 ? this.caretRect(u.uTall.value, u.uWide.value, u.uAspect.value) : null;
    const t = range(p, 0.08, 0.42);
    this.title.style.opacity = String(1 - t);
    this.title.style.transform = `translate3d(0, ${-input.shift * 100 - t * 8}vh, 0)`;
    this.title.style.visibility = Math.abs(input.shift) < 1 && t < 1 ? "visible" : "hidden";
  }
}
