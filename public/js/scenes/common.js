import * as THREE from "three";
import { cloneModel, canvasTexture } from "../assets.js";
import { inkMaterial, addOutline, PALETTE } from "../ink.js";

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const range = (p, a, b) => clamp01((p - a) / (b - a));
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Base class: one THREE.Scene, a light direction and a layout of camera panels. */
export class StoryScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.bg = PALETTE.paper;           // page colour behind the panels
    this.light = new THREE.Vector3(0.45, 0.8, 0.5).normalize();
  }
  camera(fov = 35, near = 0.1, far = 400) {
    return new THREE.PerspectiveCamera(fov, 1, near, far);
  }
  // Override: return [{ x, y, w, h, cam, border, appear }] in page fractions
  layout(_p, _vp) {
    return [];
  }
  update(_p, _dt, _input) {}
}

/** A panel that slides up into place as `p` passes `appear`. */
export function panel(x, y, w, h, cam, p, appear = 0, border = true) {
  // appear <= 0: present from the first frame (it is what the dive transition grows into)
  const a = appear <= 0 ? 1 : easeOut(range(p, appear, appear + 0.07));
  return { x, y: y + (1 - a) * 0.06, w, h, cam, border, visible: a > 0.001 };
}

// Ink colours per part of the three service objects (mesh names from blender/build_icons.py)
const ICON_PARTS = {
  Frame: { color: "#efe9dd", shade: "#111013", hatchScale: 1.2 },
  Bar: { color: "#111013", lit: 1 },
  Dot: { color: "#b5161e", lit: 1 },
  BlockButton: { color: "#c7a25c", shade: "#3b2c12", lit: 0.4 },
  Block: { color: "#b5161e", shade: "#3a0507", hatchScale: 0.9 },
  Cursor: { color: "#111013", lit: 1 },
  Gear: { color: "#efe9dd", shade: "#111013", hatchScale: 1.0, hatchAngle: 0.8 },
  Flow: { color: "#b5161e", shade: "#3a0507", lit: 0.5 },
  Node: { color: "#c7a25c", shade: "#3b2c12", lit: 0.4 },
  Rack: { color: "#efe9dd", shade: "#111013", hatchScale: 1.1, hatchAngle: 1.57 },
  Led: { color: "#b5161e", lit: 1 },
  Slot: { color: "#111013", lit: 1 },
  ChartBar: { color: "#b5161e", lit: 0.8 },
  Chart: { color: "#efe9dd", shade: "#111013", lit: 0.3 },
  // studio tools (blender/build_tools.py)
  Body: { color: "#2b272a", shade: "#000000", hatchScale: 0.9 },
  Lid: { color: "#2b272a", shade: "#000000", hatchScale: 0.9 },
  Keys: { color: "#111013", lit: 1 },
  Pad: { color: "#3a3538", lit: 0.6 },
  Grip: { color: "#111013", shade: "#000000" },
  Top: { color: "#2b272a", shade: "#000000" },
  Button: { color: "#c7a25c", shade: "#3b2c12", lit: 0.4 },
  Dial: { color: "#c7a25c", shade: "#3b2c12", lit: 0.4 },
  LensMount: { color: "#c7a25c", shade: "#3b2c12", lit: 0.3 },
  LensRing: { color: "#c7a25c", shade: "#3b2c12", lit: 0.3 },
  LensGlass: { color: "#9fb6d8", shade: "#111013", lit: 0.6 },
  Lens: { color: "#1c1a1c", shade: "#000000", hatchAngle: 1.57 },
  Cover: { color: "#6e0b10", shade: "#111013" },
  Stack: { color: "#efe9dd", shade: "#111013", lit: 0.6 },
  Ring: { color: "#c7a25c", lit: 0.6 },
  PencilTip: { color: "#111013", lit: 1 },
  Pencil: { color: "#e0b43c", shade: "#3b2c12", lit: 0.4 },
};

/** Glowing screen texture: fake UI / code lines, varied per seed. */
export function screenTexture(seed = 0) {
  return canvasTexture(320, 200, (g, w, h) => {
    g.fillStyle = "#1a0d0f";
    g.fillRect(0, 0, w, h);
    let r = seed * 9301 + 49297;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = "#b5161e";
    g.fillRect(12, 12, w - 24, 18);
    for (let y = 44; y < h - 12; y += 14) {
      g.fillStyle = rnd() > 0.75 ? "#c7a25c" : "#efe9dd";
      g.fillRect(12 + (rnd() > 0.6 ? 16 : 0), y, 30 + rnd() * (w - 80), 6);
    }
  });
}

/** Sketchbook page: a hand-drawn website wireframe in pencil on paper. */
export function sketchTexture(seed = 0) {
  return canvasTexture(280, 400, (g, w, h) => {
    g.fillStyle = "#f6f0e2";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#3a3530";
    g.lineWidth = 3;
    g.lineCap = "round";
    let r = seed * 7919 + 1;
    const j = () => ((r = (r * 9301 + 49297) % 233280) / 233280 - 0.5) * 4; // pencil wobble
    const rect = (x, y, rw, rh) => {
      g.beginPath();
      g.moveTo(x + j(), y + j());
      g.lineTo(x + rw + j(), y + j());
      g.lineTo(x + rw + j(), y + rh + j());
      g.lineTo(x + j(), y + rh + j());
      g.closePath();
      g.stroke();
    };
    rect(24, 30, w - 48, 34);
    rect(24, 84, w - 48, 120);
    g.beginPath();
    g.moveTo(30, 90);
    g.lineTo(w - 30, 198);
    g.moveTo(w - 30, 90);
    g.lineTo(30, 198);
    g.stroke();
    for (let i = 0; i < 2; i++) rect(24 + i * ((w - 48) / 2 + 6), 224, (w - 60) / 2, 90);
    g.strokeStyle = "#b5161e";
    rect(24, 334, 90, 30);
    g.strokeStyle = "#3a3530";
    for (let y = 340; y < 364; y += 10) {
      g.beginPath();
      g.moveTo(130, y + j());
      g.lineTo(w - 30, y + j());
      g.stroke();
    }
  });
}

/**
 * A Blender object in ink materials: service icons ("web" | "automation" | "saas")
 * or studio tools ("laptop" | "camera" | "sketchbook").
 */
export function makeIcon(kind, { outline = 0.0018, glow = 0, seed = 1 } = {}) {
  const root = cloneModel(kind);
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name.startsWith("Display")) {
      o.material = inkMaterial({ color: "#ffffff", lit: 1, map: screenTexture(seed) });
      o.userData.noOutline = true;
      return;
    }
    if (o.name.startsWith("Page")) {
      o.material = inkMaterial({ color: "#ffffff", lit: 0.8, map: sketchTexture(seed + o.name.length), hatchScale: 1.6 });
      o.userData.noOutline = true;
      return;
    }
    // longest matching prefix wins (BlockButton before Block, ChartBar before Chart)
    const key = Object.keys(ICON_PARTS).filter((k) => o.name.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    const opts = { ...(ICON_PARTS[key] || ICON_PARTS.Frame) };
    if (glow) opts.lit = Math.min(1, (opts.lit || 0) + glow);
    o.material = inkMaterial(opts);
  });
  addOutline(root, outline);
  return root;
}

/** Fluted column: shaft with base and capital, height h, radius r. */
export function columnGeometry(h = 6, r = 0.35, flutes = 16) {
  const prof = [
    [r * 1.45, 0], [r * 1.45, r * 0.35], [r * 1.2, r * 0.5], [r, r * 0.8],
    [r, h - r * 0.9], [r * 1.25, h - r * 0.55], [r * 1.5, h - r * 0.35], [r * 1.5, h],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, flutes * 4);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y > r * 0.85 && v.y < h - r * 0.95) {
      const a = Math.atan2(v.z, v.x);
      const k = 1 - 0.06 * Math.pow(Math.abs(Math.cos(a * flutes * 0.5)), 3);
      v.x *= k;
      v.z *= k;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Instanced copies of a geometry at the given matrices, with ink material + outline. */
export function instanced(geo, matOpts, matrices, outline = 0.02) {
  const mesh = new THREE.InstancedMesh(geo, inkMaterial(matOpts), matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  if (outline) addOutline(mesh, outline);
  return mesh;
}

export function inkMesh(geo, matOpts, outline = 0.02) {
  const m = new THREE.Mesh(geo, inkMaterial(matOpts));
  if (outline) addOutline(m, outline);
  return m;
}

export const mat4 = (x = 0, y = 0, z = 0, ry = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));

// ---------------------------------------------------------------------------
// Workflow-story building blocks
// ---------------------------------------------------------------------------

/** The story's hero: a chunky 3D mouse cursor (tip at the origin, pointing up-left). */
export function makeCursor({ color = "#efe9dd", outline = 0.05, depth = 0.35 } = {}) {
  const s = new THREE.Shape();
  const pts = [[0, 0], [0, -2.6], [0.62, -2.0], [1.05, -3.0], [1.5, -2.8], [1.08, -1.82], [1.9, -1.82]];
  s.moveTo(...pts[0]);
  pts.slice(1).forEach((p) => s.lineTo(...p));
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  geo.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(geo, inkMaterial({ color, shade: "#111013", hatchScale: 1.2, hatchAngle: 0.7 }));
  addOutline(m, outline);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** A giant hexagonal pencil, tip at the origin pointing down -Y. */
export function makePencil(len = 9) {
  const g = new THREE.Group();
  const body = inkMesh(new THREE.CylinderGeometry(0.32, 0.32, len, 6), { color: "#e0b43c", shade: "#3b2c12", hatchScale: 1.0, hatchAngle: 1.57 }, 0.04);
  body.position.y = len / 2 + 0.9;
  const wood = inkMesh(new THREE.ConeGeometry(0.32, 0.75, 6), { color: "#e7d2b6", shade: "#3b2c12" }, 0.03);
  wood.rotation.x = Math.PI;
  wood.position.y = 0.53;
  const lead = inkMesh(new THREE.ConeGeometry(0.11, 0.3, 6), { color: "#111013", lit: 1 }, 0);
  lead.rotation.x = Math.PI;
  lead.position.y = 0.15;
  const ferrule = inkMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 12), { color: "#c7a25c", shade: "#3b2c12", hatchAngle: 1.57 }, 0.03);
  ferrule.position.y = len + 1.15;
  const eraser = inkMesh(new THREE.CylinderGeometry(0.31, 0.31, 0.45, 12), { color: "#d9796f", shade: "#5c080c" }, 0.03);
  eraser.position.y = len + 1.6;
  g.add(body, wood, lead, ferrule, eraser);
  return g;
}

/** Ruled sketchbook paper texture (repeats). */
export function ruledPaper() {
  const t = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = "#f3eee3";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(60,80,120,0.22)";
    g.lineWidth = 2;
    for (let y = 32; y < h; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The website the client sketches, in page units (x right, z down the page).
 * Idea draws it as strokes; Design pops the same rectangles up as blocks.
 */
export const LAYOUT = [
  { x: -4.6, z: -6.6, w: 9.2, d: 1.0, h: 0.35, color: "#111013" },   // nav bar
  { x: -4.6, z: -5.0, w: 9.2, d: 3.6, h: 1.1, color: "#b5161e" },    // hero
  { x: -4.6, z: -0.8, w: 2.4, d: 0.8, h: 0.6, color: "#c7a25c" },    // button
  { x: -4.6, z: 0.6, w: 4.3, d: 3.2, h: 0.8, color: "#efe9dd" },     // card A
  { x: 0.3, z: 0.6, w: 4.3, d: 3.2, h: 0.8, color: "#efe9dd" },      // card B
  { x: -4.6, z: 4.4, w: 9.2, d: 1.4, h: 0.45, color: "#6e0b10" },    // footer
];

/**
 * Thick ink strokes that draw themselves along rectangle outlines.
 * Returns { group, set(t) } where t 0..1 is how much of the drawing is done, plus the
 * pencil-tip position at t (so a pencil can follow the line).
 */
export function strokeDrawing(rects, { y = 0.03, width = 0.09, color = "#111013" } = {}) {
  const group = new THREE.Group();
  const segs = [];
  for (const r of rects) {
    const c = [[r.x, r.z], [r.x + r.w, r.z], [r.x + r.w, r.z + r.d], [r.x, r.z + r.d], [r.x, r.z]];
    for (let i = 0; i < 4; i++) segs.push({ a: c[i], b: c[i + 1] });
  }
  const mat = inkMaterial({ color, lit: 1 });
  let total = 0;
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    s.len = Math.hypot(dx, dz);
    s.start = total;
    total += s.len;
    const geo = new THREE.BoxGeometry(1, 0.02, width);
    geo.translate(0.5, 0, 0);
    s.mesh = new THREE.Mesh(geo, mat);
    s.mesh.position.set(s.a[0], y, s.a[1]);
    s.mesh.rotation.y = -Math.atan2(dz, dx);
    // slight hand-drawn wobble
    s.mesh.rotation.z = (Math.random() - 0.5) * 0.01;
    group.add(s.mesh);
  }
  const tip = new THREE.Vector3();
  return {
    group,
    tip,
    set(t) {
      const d = t * total;
      for (const s of segs) {
        const k = Math.min(1, Math.max(0, (d - s.start) / s.len));
        s.mesh.scale.x = Math.max(0.0001, k * s.len);
        s.mesh.visible = k > 0;
        if (k > 0 && k < 1) tip.set(s.a[0] + (s.b[0] - s.a[0]) * k, y, s.a[1] + (s.b[1] - s.a[1]) * k);
      }
      if (t >= 1) tip.set(segs.at(-1).b[0], y, segs.at(-1).b[1]);
      return tip;
    },
  };
}

/** The hero block's headline texture (shared by Design, Build and the site texture). */
export function heroTexture() {
  return canvasTexture(1024, 400, (g, w, h) => {
    g.fillStyle = "#b5161e";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#efe9dd";
    g.font = "136px Limelight";
    g.textAlign = "center";
    g.fillText("YOUR IDEA,", w / 2, 180);
    g.fillText("LIVE.", w / 2, 320);
    g.fillStyle = "#c7a25c";
    g.fillRect(w / 2 - 140, 348, 280, 12);
  });
}

/**
 * The client's website as a 3D object: the exact LAYOUT sketched in Idea and popped up in
 * Design, now standing upright inside a browser frame (faces +Z). Build assembles it,
 * Launch folds it into a paper plane.
 */
export function makeSite() {
  const group = new THREE.Group();
  const W = 11, H = 15.2;
  const frame = inkMesh(new THREE.BoxGeometry(W, H, 0.5), { color: "#efe9dd", shade: "#111013", hatchScale: 1.4 }, 0.06);
  frame.name = "Frame";
  group.add(frame);
  const bar = inkMesh(new THREE.BoxGeometry(W, 0.9, 0.6), { color: "#111013", lit: 1 }, 0.04);
  bar.position.set(0, H / 2 - 0.45, 0.05);
  bar.name = "Bar";
  group.add(bar);
  for (let i = 0; i < 3; i++) {
    const dot = inkMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 16), { color: "#c7a25c", lit: 1 }, 0);
    dot.rotation.x = Math.PI / 2;
    dot.position.set(-W / 2 + 0.6 + i * 0.5, H / 2 - 0.45, 0.4);
    bar.add(dot);
    dot.position.sub(bar.position);
  }
  const hero = heroTexture();
  const blocks = LAYOUT.map((r, i) => {
    const b = inkMesh(new THREE.BoxGeometry(r.w, r.d, r.h), { color: r.color, shade: "#111013", hatchScale: 1.1, lit: r.color === "#111013" ? 1 : 0.2 }, 0.04);
    // page coords (x right, z down) -> site coords (x right, y up), raised off the face by its height
    b.position.set(r.x + r.w / 2, -(r.z + r.d / 2) - 0.6, 0.25 + r.h / 2);
    b.name = `Block${i}`;
    if (i === 1) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(r.w * 0.92, r.d * 0.85), inkMaterial({ color: "#ffffff", lit: 1, map: hero }));
      face.position.z = r.h / 2 + 0.01;
      b.add(face);
    }
    if (i === 3 || i === 4) {
      const img = inkMesh(new THREE.BoxGeometry(r.w * 0.8, r.d * 0.5, 0.06), { color: "#6e0b10", shade: "#111013", hatchAngle: 0.8 }, 0.02);
      img.position.set(0, r.d * 0.15, r.h / 2 + 0.03);
      b.add(img);
    }
    group.add(b);
    return b;
  });
  return { group, frame, bar, blocks };
}

/** Flat picture of the finished site, for the hundreds of windows in Scale. */
export function siteTexture() {
  return canvasTexture(330, 456, (g, w, h) => {
    const sx = w / 11, sy = h / 15.2;
    g.fillStyle = "#efe9dd";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#111013";
    g.fillRect(0, 0, w, 0.9 * sy);
    g.fillStyle = "#c7a25c";
    for (let i = 0; i < 3; i++) g.fillRect((0.45 + i * 0.5) * sx, 0.3 * sy, 0.3 * sx, 0.3 * sy);
    for (const r of LAYOUT) {
      g.fillStyle = r.color;
      g.fillRect((r.x + 5.5) * sx, (r.z + 7.6 + 0.6) * sy, r.w * sx, r.d * sy);
    }
    g.fillStyle = "#efe9dd";
    g.font = `${Math.round(0.9 * sy)}px Limelight`;
    g.textAlign = "center";
    g.fillText("YOUR IDEA,", w / 2, (LAYOUT[1].z + 7.6 + 0.6 + 1.5) * sy);
    g.fillText("LIVE.", w / 2, (LAYOUT[1].z + 7.6 + 0.6 + 2.6) * sy);
    g.strokeStyle = "#111013";
    g.lineWidth = 8;
    g.strokeRect(0, 0, w, h);
  });
}

/** Folded paper plane (nose along -Z), a few flat triangles. */
export function paperPlaneGeometry() {
  // wings lift up from the fold (dihedral) so the V shape reads from any angle
  const v = [
    0, 0, -2.4,   -1.7, 0.55, 1.2,   0, -0.05, 0.9,   // left wing
    0, 0, -2.4,    0, -0.05, 0.9,   1.7, 0.55, 1.2,   // right wing
    0, 0, -2.4,    0, -0.85, 0.9,    0, -0.05, 0.9,   // keel (left face)
    0, 0, -2.4,    0, -0.05, 0.9,   0, -0.85, 0.9,    // keel (right face)
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((v.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

/** Additive glow sprite (soft disc). */
export function glow(color = "#fff4d6", size = 1, strength = 1) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(uColor * a * a * uStrength, 1.0); }`,
  });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  return s;
}
