import * as THREE from "three";
import { StoryScene, panel, range, ease, lerp, makeIcon, instanced, inkMesh, mat4, glow, crossed } from "./common.js";
import { audio, sfx } from "../audio.js";
import { inkMaterial, inkify, addOutline, PALETTE, sharedUniforms } from "../ink.js";
import { canvasTexture, cloneModel } from "../assets.js";
import { BRAND } from "../content.js";

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** The hooded founder (blender/build_props.py) in ink materials, with handles for posing the arms. */
function makeFigure({ robe = "#d8c6a6", shade = "#111013", outline = 0.012 } = {}) {
  const root = cloneModel("figure");
  inkify(root, {
    Robe: { color: robe, shade, hatchScale: 1.6 },
    Hood: { color: robe, shade, hatchScale: 1.6 },
    Arm: { color: robe, shade, hatchScale: 1.6 },
    FaceShadow: { color: "#111013", lit: 1 },
  }, { color: "#e7d2b6", shade });
  root.traverse((o) => {
    if (o.isMesh && o.name.includes("Hand")) o.material = inkMaterial({ color: "#e7d2b6", shade });
  });
  addOutline(root, outline);
  const armL = root.getObjectByName("ArmL");
  const armR = root.getObjectByName("ArmR");
  return { root, armL, armR, restL: armL.rotation.clone(), restR: armR.rotation.clone() };
}

function raiseArm(fig, side, amount, spread = 0.2) {
  const arm = side === "R" ? fig.armR : fig.armL;
  const rest = side === "R" ? fig.restR : fig.restL;
  arm.rotation.x = rest.x - amount * 2.3;
  arm.rotation.y = rest.y + (side === "R" ? -1 : 1) * spread * amount;
}

// ---------------------------------------------------------------------------
// Arrival: midnight. The studio carriage doors slide open on glowing light; he steps in.
// ---------------------------------------------------------------------------
export class ArrivalScene extends StoryScene {
  constructor(ctx) {
    super(ctx);
    this.bg = PALETTE.ink;
    this.light.set(0.3, 0.6, 0.8).normalize();
    const s = this.scene;
    const body = { color: "#5a1d1c", shade: "#111013", hatchScale: 1.4, hatchAngle: 1.57 };

    // carriage side wall with a door gap in the middle
    for (const x of [-4.2, 4.2]) {
      const wall = inkMesh(box(6.4, 3.4, 0.3), body, 0.02);
      wall.position.set(x, 1.7, 0);
      s.add(wall);
    }
    const top = inkMesh(box(2.2, 0.7, 0.3), body, 0.02);
    top.position.set(0, 3.05, 0);
    s.add(top);
    const roof = inkMesh(new THREE.CylinderGeometry(1.2, 1.2, 15, 32, 1, false, 0, Math.PI), { ...body, color: "#3d1414" }, 0.02);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(1, 1, 0.5);
    roof.position.set(0, 3.4, -0.4);
    s.add(roof);
    for (const x of [-6, -4.4, -2.8, 2.8, 4.4, 6]) {
      const w = inkMesh(box(1.1, 0.9, 0.05), { color: "#e8432f", lit: 1 }, 0.03);
      w.position.set(x, 2.2, 0.17);
      s.add(w);
    }

    // studio sign above the doorway
    const signTex = canvasTexture(1024, 256, (g, w, h) => {
      g.fillStyle = "#111013";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#c7a25c";
      g.lineWidth = 10;
      g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = "#efe9dd";
      g.textAlign = "center";
      g.textBaseline = "middle";
      const text = `${BRAND.name} ${BRAND.sub}`.toUpperCase();
      let size = 150;
      do {
        g.font = `${size}px Limelight`;
        size -= 6;
      } while (g.measureText(text).width > w - 110 && size > 40);
      g.fillText(text, w / 2, h / 2 + 8);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), inkMaterial({ color: "#ffffff", lit: 1, map: signTex }));
    sign.position.set(0, 3.15, 0.2);
    addOutline(sign, 0.01);
    s.add(sign);

    // sliding doors
    this.doorL = inkMesh(box(1.1, 2.7, 0.12), { ...body, color: "#6b2422" }, 0.02);
    this.doorR = this.doorL.clone();
    this.doorL.position.set(-0.55, 1.35, 0.2);
    this.doorR.position.set(0.55, 1.35, 0.2);
    s.add(this.doorL, this.doorR);

    // light inside the doorway: ripples follow the pointer
    this.light2 = new THREE.ShaderMaterial({
      uniforms: { ...sharedUniforms, uPointer: { value: new THREE.Vector2(0.5, 0.5) }, uRed: { value: PALETTE.red }, uDeep: { value: PALETTE.redDark } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec2 uPointer; uniform vec3 uRed; uniform vec3 uDeep; uniform float uTime; uniform sampler2D uHatch;
        varying vec2 vUv;
        void main(){
          float d = distance(vUv, uPointer);
          float ring = sin(d * 38.0 - uTime * 3.0) * 0.5 + 0.5;
          float l = texture2D(uHatch, vec2(vUv.x * 2.0 + ring * 0.02, vUv.y)).r;
          vec3 c = mix(uRed, uDeep, step(0.75, l) * 0.6 + smoothstep(0.2, 0.9, vUv.y) * 0.25);
          c = mix(c, vec3(1.0, 0.85, 0.7), smoothstep(0.75, 0.95, ring) * smoothstep(0.5, 0.0, d) * 0.5);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.7), this.light2);
    inside.position.set(0, 1.35, -0.3);
    s.add(inside);
    this.spill = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5), inkMaterial({ color: "#c0262a", lit: 1, opacity: 0.0 }));
    this.spill.rotation.x = -Math.PI / 2;
    this.spill.position.set(0, 0.01, 2.6);
    s.add(this.spill);
    const ground = inkMesh(box(30, 0.2, 14), { color: "#1d1b1d", shade: "#000000", hatchAngle: 0.4 }, 0);
    ground.position.set(0, -0.1, 5);
    s.add(ground);

    this.fig = makeFigure({ robe: "#c9b593" });
    this.fig.root.position.set(0.2, 0, 4.6);
    this.fig.root.rotation.y = Math.PI; // back to camera
    s.add(this.fig.root);

    this.cam = this.camera(40);
    this.diveTarget = new THREE.Vector3(0, 1.4, -0.3); // through the open doorway
  }
  layout(p) {
    return [panel(0.04, 0.05, 0.92, 0.9, this.cam, p, 0, true)];
  }
  update(p, dt, input) {
    const open = ease(range(p, 0.04, 0.32));
    this.doorL.position.x = -0.55 - open * 1.05;
    this.doorR.position.x = 0.55 + open * 1.05;
    this.spill.material.uniforms.uOpacity.value = open * 0.55;
    this.spill.material.transparent = true;
    this.doorOpen = open; // read by the sound layer

    const target = new THREE.Vector2(input.pointer.x * 0.5 + 0.5, input.pointer.y * 0.5 + 0.5);
    this.light2.uniforms.uPointer.value.lerp(target, 0.08);

    raiseArm(this.fig, "R", ease(range(p, 0.42, 0.56)) * 0.55);
    const step = ease(range(p, 0.58, 0.86));
    this.step = step;
    this.fig.root.position.z = lerp(4.6, 0.6, step);
    this.fig.root.position.y = Math.abs(Math.sin(step * Math.PI * 4)) * 0.04;

    // camera follows him toward the doorway
    const push = ease(range(p, 0.55, 1));
    this.cam.position.set(0, lerp(1.8, 1.6, push), lerp(11, 4.2, push));
    this.cam.lookAt(0, 1.4, -2);
  }
  sound(p, prev) {
    if (crossed(prev, p, 0.05) || crossed(p, prev, 0.3)) sfx("door"); // opens, or closes when scrolling back
    const steps = Math.floor(this.step * 4);
    if (steps !== this.lastStep && this.lastStep !== undefined && this.step > 0 && this.step < 1) sfx("step");
    this.lastStep = steps;
  }
}

// ---------------------------------------------------------------------------
// Workshop: the long carriage. Velvet seats, lamps, arches; at the end a bench with
// the studio's tools. He walks to it, and the camera dives into the sketchbook.
// ---------------------------------------------------------------------------
export class WorkshopScene extends StoryScene {
  constructor(ctx) {
    super(ctx);
    this.bg = PALETTE.red;
    this.light.set(0.2, 0.9, 0.4).normalize();
    const s = this.scene;
    const red = { color: "#c22027", shade: "#3a0507", hatchScale: 1.3 };
    const len = 46;

    const floor = inkMesh(box(4.2, 0.2, len), { color: "#a3171d", shade: "#2b0405", hatchAngle: 1.57, hatchScale: 0.9 }, 0);
    floor.position.set(0, -0.1, -len / 2 + 3);
    s.add(floor);
    const rib = new THREE.TorusGeometry(2.05, 0.11, 8, 40, Math.PI);
    const ribs = [];
    for (let i = 0; i < 18; i++) ribs.push(mat4(0, 1.2, 2 - i * 2.4));
    s.add(instanced(rib, { color: "#d43a2f", shade: "#2a0405" }, ribs, 0.02));
    for (const x of [-2.05, 2.05]) {
      const wall = inkMesh(box(0.1, 3.2, len), { ...red, hatchAngle: 0 }, 0);
      wall.position.set(x, 1.6, -len / 2 + 3);
      s.add(wall);
    }
    const seats = [];
    for (let i = 0; i < 15; i++) seats.push(mat4(-1.45, 0.45, 1 - i * 2.4), mat4(1.45, 0.45, 1 - i * 2.4));
    s.add(instanced(box(0.9, 0.9, 0.7), { color: "#7d1016", shade: "#1a0203", hatchScale: 0.9 }, seats, 0.02));
    const lamps = [];
    for (let i = 0; i < 18; i++) lamps.push(mat4(0, 2.9, 0.8 - i * 2.4));
    s.add(instanced(new THREE.SphereGeometry(0.12, 16, 12), { color: "#ffd9a0", lit: 1 }, lamps, 0.01));

    // the bench at the far end with the studio's three tools
    const end = -len + 5;
    const bench = inkMesh(box(3.2, 1.1, 0.9), { color: "#5b0d10", shade: "#120102" }, 0.02);
    bench.position.set(0, 0.55, end);
    s.add(bench);
    this.tools = ["laptop", "sketchbook", "camera"].map((kind, i) => {
      const t = makeIcon(kind, { glow: 0.25, seed: i + 3 });
      t.scale.setScalar(2.4);
      t.position.set(-0.95 + i * 0.95, 1.12, end);
      if (kind === "sketchbook") this.sketchbook = t;
      s.add(t);
      return t;
    });
    const halo = glow("#ffe2b0", 3.2, 0.7);
    halo.position.set(0, 1.5, end - 0.2);
    s.add(halo);

    this.fig = makeFigure({ robe: "#d8c6a6", shade: "#2a0405" });
    this.fig.root.rotation.y = Math.PI;
    s.add(this.fig.root);

    this.cam = this.camera(44);
    this.camTools = this.camera(26);
    this.len = len;
    this.end = end;
    this.diveTarget = new THREE.Vector3(0, 1.16, end); // into the open sketchbook
  }
  layout(p, vp) {
    const out = [{ x: 0, y: 0, w: 1, h: 1, cam: this.cam, border: false, visible: true }];
    out.push(panel(vp.mobile ? 0.08 : 0.6, vp.mobile ? 0.58 : 0.52, vp.mobile ? 0.84 : 0.34, vp.mobile ? 0.26 : 0.38, this.camTools, p, 0.62));
    return out;
  }
  update(p, dt, input) {
    const z = lerp(4, this.end + 6.5, ease(p));
    this.cam.position.set(Math.sin(p * 9) * 0.06, lerp(1.55, 1.9, range(p, 0.7, 1)), z);
    this.cam.lookAt(0, lerp(1.4, 1.15, range(p, 0.7, 1)), z - 10);
    // he walks ahead down the aisle and stops beside the bench
    const walk = ease(range(p, 0, 0.92));
    this.walk = walk;
    this.fig.root.position.set(lerp(-0.4, -1.35, range(p, 0.6, 0.92)), Math.abs(Math.sin(walk * Math.PI * 14)) * 0.035, lerp(1, this.end + 1.2, walk));
    this.fig.root.rotation.y = Math.PI + range(p, 0.85, 1) * 0.7; // turns toward the bench
    this.camTools.position.set(0.7, 2.0, this.end + 1.9);
    this.camTools.lookAt(0, 1.2, this.end);
    this.tools.forEach((t, i) => (t.rotation.y = Math.sin(input.time * 0.6 + i) * 0.15));
  }
  sound(p, prev, dt) {
    const v = Math.abs(p - prev) / Math.max(dt, 1e-3);
    // the carriage rumbles harder and the rail joints clack faster as you move down it
    audio.bed("rumble", 0.8 + Math.min(1, v * 2) * 0.6);
    audio.rate("clack", Math.min(3, v * 8));
    const steps = Math.floor(this.walk * 14);
    if (steps !== this.lastStep && this.lastStep !== undefined && this.walk > 0 && this.walk < 1) sfx("step");
    this.lastStep = steps;
    if (crossed(prev, p, 0.62)) sfx("swish"); // tools close-up panel
    if (crossed(prev, p, 0.9)) sfx("chime");
  }
}
