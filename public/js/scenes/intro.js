import * as THREE from "three";
import { StoryScene, range, ease } from "./common.js";
import { sharedUniforms, PALETTE } from "../ink.js";
import { reduceMotion } from "../ui.js";

// Hero. Dry-brush ink strokes drift across the dark and part around the pointer. The title
// is printed in a shader: ragged letterpress edges, paper speckle and an 8 fps "boil" like
// hand-inked title cards. The pointer leaves a wake (an offscreen trail texture); inside it
// the letters show their blueprint construction (outline, hatching, grid) and fast flicks
// spatter red ink. On scroll the title burns away and a brush stroke paints the next scene in.

// pointer trail: R = ink density, GB = velocity. Ping-ponged between two render targets.
const TRAIL_FRAG = /* glsl */ `
  uniform sampler2D uPrev; uniform vec2 uA; uniform vec2 uB; uniform vec2 uVel;
  uniform float uAspect; uniform float uRadius; uniform float uAmount; uniform float uDecay;
  varying vec2 vUv;
  float seg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }
  void main() {
    vec4 prev = texture2D(uPrev, vUv - texture2D(uPrev, vUv).gb * 0.0006); // ink drifts on its own momentum
    vec2 p = vec2(vUv.x * uAspect, vUv.y);
    float d = seg(p, uA, uB);
    float s = exp(-d * d / (uRadius * uRadius)) * uAmount;
    float dens = min(prev.r * uDecay + s, 1.6);
    vec2 vel = mix(prev.gb * uDecay, uVel, clamp(s, 0.0, 1.0));
    gl_FragColor = vec4(dens, vel, 1.0);
  }
`;

const HERO_FRAG = /* glsl */ `
  uniform sampler2D uHatch; uniform sampler2D uNoise; uniform sampler2D uTrail;
  uniform sampler2D uTitle; uniform sampler2D uTitleSoft;
  uniform float uTime; uniform float uAspect; uniform float uIntro; uniform float uBurn; uniform float uBoil;
  uniform float uSweep; uniform float uOpen;
  uniform vec2 uPtr; uniform vec4 uTitleRect;
  uniform vec3 uInk; uniform vec3 uPaper; uniform vec3 uRed; uniform vec3 uBrass;
  varying vec2 vUv;

  float n2(vec2 q) { return texture2D(uNoise, q).r; }
  float fbm(vec2 q) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * n2(q); q = q * 2.03 + 0.17; a *= 0.5; }
    return s / 0.9375;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = vec2(uv.x * uAspect, uv.y);
    vec4 tr = texture2D(uTrail, uv);
    float dens = clamp(tr.r, 0.0, 1.5);
    vec2 vel = tr.gb;
    float boil = uBoil;

    // ---- dry-brush strokes, parting around the pointer ----
    vec2 toP = p - uPtr;
    float dp = length(toP);
    vec2 part = toP / max(dp, 1e-3) * exp(-dp * dp / 0.045) * 0.07;
    // long horizontal swathes: low-frequency domain-warped noise, stretched along x
    vec2 q = (p + part - vel * dens * 0.015) * vec2(0.35, 1.6);
    q.x -= uTime * 0.012;
    float warp = fbm(q * 0.05 + vec2(0.0, uTime * 0.004));
    float body = fbm(q * vec2(0.035, 0.05) + vec2(warp * 0.18, warp * 0.1));
    float body2 = fbm(q * vec2(0.03, 0.06) + 3.7 + warp * 0.14);
    float stroke = smoothstep(0.43, 0.5, body);
    float stroke2 = smoothstep(0.54, 0.59, body2);
    // dry-brush bristles: the hatch texture turned sideways, following the warp
    float bristle = texture2D(uHatch, vec2(q.y * 0.9 + warp * 0.8, q.x * 0.04)).r;
    float dry = smoothstep(0.3, 0.55, bristle) * (0.55 + 0.45 * n2(q * vec2(0.4, 3.0)));
    vec3 inkHi = mix(uInk, uPaper, 0.13);
    vec3 col = uInk;
    col = mix(col, inkHi, stroke * dry);
    col = mix(col, uInk * 0.62, stroke2 * smoothstep(0.25, 0.5, bristle));

    // ---- title ----
    vec2 jitter = (vec2(n2(uv * 2.0 + boil), n2(uv * 2.0 + boil + 0.5)) - 0.5) * 0.0022;
    vec2 tuv = (uv - vel * dens * 0.0045 + jitter - uTitleRect.xy) / uTitleRect.zw;
    float inRect = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
    float hard = texture2D(uTitle, tuv).a * inRect;
    float soft = texture2D(uTitleSoft, tuv).a * inRect;
    float field = mix(hard, soft, 0.5);
    float edge = (n2(tuv * vec2(7.0, 3.0) + boil) - 0.5) * 0.24 + (n2(tuv * vec2(30.0, 12.0) + boil) - 0.5) * 0.1;
    // ink-in on load, burn away on scroll: both run along one ragged noise field
    float dis = n2(uv * vec2(uAspect, 1.0) * 0.9) * 0.75 + n2(uv * 4.0) * 0.25;
    float shown = smoothstep(1.0 - uIntro, 1.02 - uIntro, dis) * smoothstep(uBurn, uBurn + 0.02, dis);
    float letter = smoothstep(0.4, 0.48, field + edge) * shown;
    float ember = smoothstep(0.4, 0.48, field + edge) * smoothstep(uBurn + 0.07, uBurn + 0.02, dis) * step(0.001, uBurn) * shown;

    float speck = n2(uv * vec2(uAspect, 1.0) * 3.3 + boil * 0.3);
    vec3 printed = mix(uPaper, uPaper * 0.82, step(0.7, speck));

    // the wake: blueprint construction of the same letters
    float lens = smoothstep(0.06, 0.55, dens);
    float outline = (1.0 - smoothstep(0.0, 0.05, abs(field + edge * 0.3 - 0.44))) * inRect * shown;
    float diag = step(0.58, texture2D(uHatch, vec2((p.x + p.y) * 2.6, (p.y - p.x) * 0.25)).r);
    float grid = max(step(0.982, fract(p.x * 22.0)), step(0.982, fract(p.y * 22.0)));

    col = mix(col, mix(col, uBrass, 0.35), grid * lens * 0.45);
    col = mix(col, printed, letter * (1.0 - lens));
    col = mix(col, mix(uInk, uBrass, 0.85), letter * lens * diag);
    col = mix(col, uRed, outline * lens);
    col = mix(col, uRed, ember);

    // spattered drops, only in a fast wake; they shrink as the ink fades
    float fling = clamp((dens * length(vel) - 0.35) * 0.6, 0.0, 1.0);
    float big = smoothstep(0.86 - fling * 0.12, 0.87 - fling * 0.12, n2(p * 0.85 + 11.3));
    float small = smoothstep(0.88 - fling * 0.12, 0.89 - fling * 0.12, n2(p * 2.1 + 5.1));
    col = mix(col, uRed, max(big, small) * step(0.01, fling));

    // ---- the way in: one broad brush stroke paints across the middle, left to right, then
    // widens to fill the screen. The next scene shows through the paint. ----
    float bristles = texture2D(uHatch, vec2(uv.y * 2.6, uv.x * 0.12)).r;   // lines along the stroke
    float wander = (fbm(vec2(uv.x * 0.08, 0.37)) - 0.5) * 0.22 * (1.0 - uOpen); // the stroke's centre line
    float halfH = mix(0.045, 0.64, uOpen);
    float side = halfH + (bristles - 0.5) * 0.035 + (n2(uv * vec2(0.4, 3.0)) - 0.5) * 0.05 * (0.5 + uOpen);
    float inY = side - abs(uv.y - 0.5 - wander);                             // > 0 inside
    float tip = uSweep * 1.3 - 0.15 + (n2(vec2(uv.y * 3.0, 0.71)) - 0.5) * 0.14 + (bristles - 0.5) * 0.1;
    float inX = tip - uv.x;                                                  // > 0 behind the head
    float paint = step(0.0, inY) * step(0.0, inX) * step(0.001, uSweep);
    // a thin wet red rim where the paint meets the dark
    float rim = paint * (1.0 - step(0.0035, min(inY, inX * 0.4))) * step(0.5, n2(uv * vec2(0.6, 1.8))) * (1.0 - step(0.999, uOpen));
    col = mix(col, mix(uRed, uInk, 0.35), rim);

    float g = n2(gl_FragCoord.xy / 256.0 + boil * 1.8) - 0.5;
    float alpha = 1.0 - paint * (1.0 - rim);
    gl_FragColor = vec4(col + g * 0.04, alpha);
  }
`;

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.5, 1.0); }`;

export class IntroScene extends StoryScene {
  constructor(ctx) {
    super(ctx);
    this.bg = PALETTE.ink;
    this.cam = this.camera();
    this.title = document.getElementById("intro-title");
    this.h1 = this.title.querySelector("h1");

    const rt = () => new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.trail = [rt(), rt()];
    this.trailMat = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uVel: { value: new THREE.Vector2() },
        uAspect: { value: 1 }, uRadius: { value: 0.07 }, uAmount: { value: 0 }, uDecay: { value: 0.97 },
      },
      vertexShader: VERT,
      fragmentShader: TRAIL_FRAG,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.trailScene = new THREE.Scene();
    const tq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.trailMat);
    tq.frustumCulled = false;
    this.trailScene.add(tq);

    this.mat = new THREE.ShaderMaterial({
      depthWrite: false,
      transparent: true,
      uniforms: {
        ...sharedUniforms,
        uTrail: { value: this.trail[0].texture },
        uTitle: { value: null },
        uTitleSoft: { value: null },
        uTitleRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uPtr: { value: new THREE.Vector2(-9, -9) },
        uIntro: { value: reduceMotion ? 1 : 0 },
        uBurn: { value: 0 },
        uBoil: { value: 0 },
        uSweep: { value: 0 },
        uOpen: { value: 0 },
        uAspect: { value: 1 },
        uInk: { value: PALETTE.ink },
        uPaper: { value: PALETTE.paper },
        uRed: { value: PALETTE.red },
        uBrass: { value: PALETTE.brass },
      },
      vertexShader: VERT,
      fragmentShader: HERO_FRAG,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);

    this.ptr = new THREE.Vector2(-9, -9); // smoothed pointer, in (x * aspect, y) uv space
    this.lastPointer = new THREE.Vector2(9, 9);
    this.movedAt = -99;
    this.clock = 0;
    this.titleShift = 0;
    this.size = "";
  }

  layout(p, vp) {
    this.mat.uniforms.uAspect.value = this.trailMat.uniforms.uAspect.value = vp.w / vp.h;
    const key = `${vp.w}x${vp.h}`;
    if (key !== this.size) {
      this.size = key;
      this.buildTitle(vp);
    }
    return [{ x: 0, y: 0, w: 1, h: 1, cam: this.cam, border: false, visible: true }];
  }

  /** Print the (visually hidden) DOM title into textures at exactly its on-screen position. */
  buildTitle(vp) {
    const k = Math.min(2, devicePixelRatio || 1);
    const box = this.h1.getBoundingClientRect();
    const padX = box.width * 0.08, padY = box.height * 0.12;
    const r = { x: box.left - padX, y: box.top - this.titleShift - padY, w: box.width + padX * 2, h: box.height + padY * 2 };
    const c = document.createElement("canvas");
    c.width = Math.ceil(r.w * k);
    c.height = Math.ceil(r.h * k);
    const g = c.getContext("2d");
    const cs = getComputedStyle(this.h1);
    g.font = `${parseFloat(cs.fontSize) * k}px ${cs.fontFamily}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    for (const span of this.h1.children) {
      const s = span.getBoundingClientRect();
      g.fillText(span.textContent.toUpperCase(), (s.left + s.width / 2 - r.x) * k, (s.top - this.titleShift + s.height / 2 - r.y) * k + parseFloat(cs.fontSize) * k * 0.05);
    }
    // a soft copy (downscaled, so bilinear sampling blurs it) gives the shader a distance-like field
    const soft = document.createElement("canvas");
    soft.width = Math.max(1, Math.round(c.width / 7));
    soft.height = Math.max(1, Math.round(c.height / 7));
    soft.getContext("2d").drawImage(c, 0, 0, soft.width, soft.height);
    const tex = (cv) => {
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.NoColorSpace;
      return t;
    };
    const u = this.mat.uniforms;
    u.uTitle.value?.dispose();
    u.uTitleSoft.value?.dispose();
    u.uTitle.value = tex(c);
    u.uTitleSoft.value = tex(soft);
    this.titleRect = { x: r.x / vp.w, y: 1 - (r.y + r.h) / vp.h, w: r.w / vp.w, h: r.h / vp.h };
  }

  hide() {
    this.title.style.visibility = "hidden";
  }

  update(p, dt, input) {
    const u = this.mat.uniforms;
    const aspect = u.uAspect.value;
    this.clock += dt;
    u.uBoil.value = reduceMotion ? 0 : Math.floor(this.clock * 8) * 0.173;
    // the title inks in over 1.8 s of real time whenever the hero comes back on screen
    if (this.lastSeen === undefined || input.time - this.lastSeen > 2) this.shownAt = input.time;
    this.lastSeen = input.time;
    if (!reduceMotion) u.uIntro.value = Math.min(1, (input.time - this.shownAt) / 1.8);

    // pointer, or a slow ghost path when it has been still for a while (phones, idle mice)
    if (!input.pointer.equals(this.lastPointer)) {
      this.lastPointer.copy(input.pointer);
      this.movedAt = this.clock;
    }
    const target = new THREE.Vector2((input.pointer.x * 0.5 + 0.5) * aspect, input.pointer.y * 0.5 + 0.5);
    const idle = THREE.MathUtils.clamp((this.clock - this.movedAt - 2.5) / 1.5, 0, 1);
    if (idle > 0) {
      const t = this.clock * 0.35;
      const ghost = new THREE.Vector2((0.5 + Math.sin(t) * 0.32 + Math.sin(t * 2.3) * 0.06) * aspect, 0.55 + Math.sin(t * 1.7) * 0.16);
      target.lerp(ghost, idle);
    }
    const prev = this.ptr.x < -5 ? target.clone() : this.ptr.clone();
    this.ptr.lerp(target, 1 - Math.pow(0.0015, dt));
    u.uPtr.value.copy(this.ptr);

    // trail pass (offscreen; a render target keeps its own viewport and scissor)
    const tu = this.trailMat.uniforms;
    // (clamped: a long frame would otherwise read as a violent flick)
    const vel = this.ptr.clone().sub(prev).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 3);
    tu.uA.value.copy(prev);
    tu.uB.value.copy(this.ptr);
    tu.uVel.value.copy(vel);
    tu.uAmount.value = Math.min(1, vel.length() * 0.6) * 0.5;
    tu.uDecay.value = Math.pow(0.5, dt / 0.55);
    tu.uPrev.value = this.trail[0].texture;
    const r = this.ctx.renderer;
    r.setRenderTarget(this.trail[1]);
    r.render(this.trailScene, this.cam);
    r.setRenderTarget(null);
    this.trail.reverse();
    u.uTrail.value = this.trail[0].texture;

    // scroll: the copy fades, the title burns away, then the brush stroke paints the way in
    const t = range(p, 0.06, 0.36);
    u.uBurn.value = ease(t) * 1.05;
    u.uSweep.value = ease(range(p, 0.28, 0.62));
    u.uOpen.value = ease(range(p, 0.55, 1));
    // the next scene is drawn underneath once the stroke starts; its panel frames (DOM, above the
    // canvas) fade in as the paint finishes filling the screen
    this.reveal = u.uSweep.value > 0 ? { x: 0, y: 0, w: 1, h: 1, fade: range(u.uOpen.value, 0.8, 1) } : null;

    this.titleShift = (-input.shift - t * 0.08) * innerHeight;
    if (this.titleRect) u.uTitleRect.value.set(this.titleRect.x, this.titleRect.y - this.titleShift / innerHeight, this.titleRect.w, this.titleRect.h);
    this.title.style.opacity = String(1 - range(p, 0.03, 0.2));
    this.title.style.transform = `translate3d(0, ${this.titleShift}px, 0)`;
    this.title.style.visibility = Math.abs(input.shift) < 1 && t < 1 ? "visible" : "hidden";
  }
}
