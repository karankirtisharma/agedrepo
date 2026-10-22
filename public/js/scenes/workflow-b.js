import * as THREE from "three";
import { StoryScene, panel, range, ease, easeOut, lerp, clamp01, makeIcon, inkMesh, makeCursor, makeSite, siteTexture, strokeDrawing, LAYOUT, crossed } from "./common.js";
import { audio, sfx } from "../audio.js";
import { inkMaterial, PALETTE } from "../ink.js";
import { canvasTexture } from "../assets.js";
import { SAVED } from "../content.js";
import { themeColor } from "../themes.js";

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ---------------------------------------------------------------------------
// 03 Build: hold to compile; code streams out of the laptop and assembles the site
// ---------------------------------------------------------------------------
export class BuildScene extends StoryScene {
  constructor(ctx) {
    super(ctx);
    this.bg = PALETTE.ink;
    this.light.set(-0.4, 0.7, 0.6).normalize();
    const s = this.scene;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), inkMaterial({ color: "#b5161e", shade: "#5c080c", lit: 0.75, hatchScale: 1.4 }));
    wall.position.z = -4;
    s.add(wall);
    const floor = inkMesh(box(40, 0.4, 10), { color: "#6e0b10", shade: "#111013", hatchAngle: 1.57 }, 0);
    floor.position.set(0, -3.2, 0);
    s.add(floor);

    // laptop on the left, streaming code
    this.laptop = makeIcon("laptop", { seed: 4, outline: 0.0016 });
    this.laptop.scale.setScalar(9);
    this.laptop.position.set(-5.2, -3.0, 0.5);
    this.laptop.rotation.y = 0.7;
    s.add(this.laptop);

    // the website designed in the previous scene, assembling from scattered blocks
    const site = makeSite();
    this.site = site.group;
    this.site.scale.setScalar(0.32);
    this.site.position.set(2.6, 0.2, 0);
    this.site.rotation.y = -0.18;
    s.add(this.site);
    this.frame = site.frame;
    // the pencil wireframe from the Idea scene, drawn on the empty frame; real blocks snap onto it
    const sketch = strokeDrawing(LAYOUT, { width: 0.12 });
    sketch.set(1);
    sketch.group.rotation.x = Math.PI / 2; // page (x, z) -> site face (x, -z)
    sketch.group.position.set(0, -0.6, 0.27);
    this.site.add(sketch.group);
    this.parts = [site.bar, ...site.blocks].map((o, k) => {
      const home = o.position.clone();
      const a = (k * 2.399) % (Math.PI * 2);
      // parked in a loose ring around the frame (site units), not thrown at the camera
      // ring sits just outside the 11 x 15 frame so every waiting part reads as "not placed yet"
      const away = new THREE.Vector3(Math.cos(a) * 15, Math.sin(a) * 11, 2.5 + (k % 3));
      return { o, home, away, spin: new THREE.Euler(0, (k % 2 ? 1 : -1) * 0.35, (k % 3 - 1) * 0.25), delay: (k % 7) * 0.06 };
    });

    // the cursor helps: it hovers over the site and clicks while you hold
    this.cursor = makeCursor({ outline: 0.05 });
    this.cursor.scale.setScalar(0.55);
    this.cursor.rotation.set(0, -0.3, 0.25);
    s.add(this.cursor);

    // code bars flying from the laptop screen to the site
    this.bars = new THREE.InstancedMesh(box(0.5, 0.07, 0.07), inkMaterial({ color: "#efe9dd", lit: 1 }), 60);
    this.barData = Array.from({ length: 60 }, (_, i) => ({ t: i / 60, w: 0.4 + Math.random() * 1.4, lane: Math.random() - 0.5, gold: Math.random() > 0.8 }));
    this.dummy = new THREE.Object3D();
    s.add(this.bars);

    this.barBg = inkMesh(box(4.4, 0.14, 0.05), { color: "#111013", lit: 1 }, 0.01);
    this.barBg.position.set(2.4, -2.55, 0.6);
    this.bar = inkMesh(box(4.4, 0.14, 0.06), { color: "#efe9dd", lit: 1 }, 0);
    this.bar.geometry.translate(2.2, 0, 0);
    this.bar.position.set(0.2, -2.55, 0.61);
    s.add(this.barBg, this.bar);

    this.built = 0;
    this.flow = 0;
    this.cam = this.camera(40);
    this.cam.position.set(-0.5, 0.4, 11);
    this.diveTarget = new THREE.Vector3(2.6, 1.4, 0.3); // into the finished site's hero block
  }
  layout(p) {
    return [panel(0.04, 0.05, 0.92, 0.9, this.cam, p, 0, true)];
  }
  update(p, dt, input) {
    // scrolling builds the site; holding builds it faster (and streams the code)
    const holding = input.holding && p > 0.08 && p < 0.92;
    if (p < 0.03) this.holdBuilt = 0;
    if (holding) this.holdBuilt = clamp01((this.holdBuilt ?? 0) + dt * 0.35);
    this.built = Math.max(this.holdBuilt ?? 0, ease(range(p, 0.06, 0.86)));
    this.flow = lerp(this.flow, holding ? 1 : 0.35 * (1 - this.built), 0.1);

    this.frame.scale.setScalar(0.75 + easeOut(range(this.built, 0, 0.25)) * 0.25);
    for (const part of this.parts) {
      const t = ease(clamp01((this.built - part.delay) / 0.5));
      part.o.position.lerpVectors(part.away, part.home, t);
      part.o.rotation.set(part.spin.x * (1 - t), part.spin.y * (1 - t), part.spin.z * (1 - t));
      part.o.scale.setScalar(0.7 + 0.3 * t);
    }
    this.bar.scale.x = Math.max(0.001, this.built);

    // cursor bobs beside the site and taps down while you hold
    const tap = holding ? Math.abs(Math.sin(input.time * 9)) * 0.35 : 0;
    this.cursor.position.set(5.2, 2.2 + Math.sin(input.time * 1.6) * 0.15 - tap, 1.6);

    // code stream: bars travel an arc from the laptop screen into the site while holding
    const from = new THREE.Vector3(-4.4, -1.2, 1.2), to = new THREE.Vector3(2.4, 0.2, 0.6);
    this.barData.forEach((b, i) => {
      b.t = (b.t + dt * (0.25 + this.flow * 0.9)) % 1;
      const t = b.t;
      const pos = new THREE.Vector3().lerpVectors(from, to, t);
      pos.y += Math.sin(t * Math.PI) * 2.4 + b.lane * 0.8;
      pos.z += b.lane * 1.2;
      this.dummy.position.copy(pos);
      const vis = this.flow * Math.sin(t * Math.PI);
      this.dummy.scale.set(b.w * vis + 0.0001, vis + 0.0001, 1);
      this.dummy.updateMatrix();
      this.bars.setMatrixAt(i, this.dummy.matrix);
    });
    this.bars.instanceMatrix.needsUpdate = true;

    this.site.position.y = 0.2 + Math.sin(input.time * 1.2) * 0.05;
    this.site.position.x = 2.6 + (holding ? (Math.random() - 0.5) * 0.02 : 0);
    // on tall (phone) panels aim at the site rather than between laptop and site
    const tall = this.cam.aspect < 1;
    this.cam.position.set(lerp(-0.5, 0.6, p) + (tall ? 1.6 : 0), 0.4, tall ? 13 : 11);
    this.cam.lookAt(tall ? 1.6 : -0.5, -0.4, 0);
    this.holding = holding;
  }
  sound() {
    // keys clatter while code streams; each part snaps in as it lands; a chime when it's all built
    audio.rate("key", Math.max(0, this.flow - 0.2) * 22);
    audio.rate("tick", this.holding ? 2.9 : 0); // cursor taps
    const prev = this.soundBuilt ?? this.built;
    for (const part of this.parts) if (crossed(prev, this.built, part.delay + 0.45)) sfx("snap");
    if (crossed(prev, this.built, 0.995)) sfx("chime");
    this.soundBuilt = this.built;
  }
}

// ---------------------------------------------------------------------------
// 04 Automate: an isometric blueprint machine. A hopper drops TASK cards onto a
// conveyor, gears process them, a press stamps them DONE and they slide into bins.
// A monitor shows the live site and the hours saved. Hold to speed it all up.
// ---------------------------------------------------------------------------
function cardTexture(text, bg, fg) {
  return canvasTexture(256, 160, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 8;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg;
    g.font = "700 46px Archivo";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

/** Paper with a technical-drawing grid, for the machine's floor. */
function blueprintFloor() {
  const t = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = "#efe9dd";
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.18;
    g.strokeStyle = "#111013";
    g.lineWidth = 1;
    for (let i = 0; i <= w; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
    }
    g.globalAlpha = 0.45;
    g.strokeStyle = "#b5161e";
    g.lineWidth = 2;
    for (let i = 0; i <= w; i += 128) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  return t;
}

const BELT_Y = 1.25;          // top of the belt
const BELT_X0 = -8, BELT_X1 = 7;
const PRESS_X = 1.8, GEAR_X = -3.2;
const BINS = [
  { label: "CRM", z: -2.6 },
  { label: "INVOICES", z: 0 },
  { label: "EMAIL", z: 2.6 },
];

export class AutomateScene extends StoryScene {
  constructor(ctx) {
    super(ctx);
    this.bg = PALETTE.paper;
    this.light.set(-0.5, 0.85, 0.35).normalize();
    const s = this.scene;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), inkMaterial({ color: "#ffffff", lit: 1, map: blueprintFloor() }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);

    // belt on legs, with moving slats and end rollers
    const belt = inkMesh(box(BELT_X1 - BELT_X0, 0.4, 2.4), { color: "#3a3538", shade: "#111013", hatchAngle: 1.57 }, 0.04);
    belt.position.set((BELT_X0 + BELT_X1) / 2, BELT_Y - 0.2, 0);
    s.add(belt);
    for (const x of [BELT_X0 + 0.6, (BELT_X0 + BELT_X1) / 2, BELT_X1 - 0.6]) {
      for (const z of [-1, 1]) {
        const leg = inkMesh(box(0.25, BELT_Y - 0.4, 0.25), { color: "#111013", lit: 1 }, 0.02);
        leg.position.set(x, (BELT_Y - 0.4) / 2, z);
        s.add(leg);
      }
    }
    for (const x of [BELT_X0, BELT_X1]) {
      const roller = inkMesh(new THREE.CylinderGeometry(0.3, 0.3, 2.5, 18), { color: "#c7a25c", shade: "#3b2c12" }, 0.03);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(x, BELT_Y - 0.2, 0);
      s.add(roller);
    }
    this.slats = new THREE.InstancedMesh(box(0.1, 0.03, 2.3), inkMaterial({ color: "#111013", lit: 1 }), 50);
    s.add(this.slats);
    this.dummy = new THREE.Object3D();

    // hopper above the start of the belt
    const hopper = inkMesh(new THREE.CylinderGeometry(1.4, 0.45, 1.8, 4, 1, true), { color: "#efe9dd", shade: "#111013", side: THREE.DoubleSide }, 0.04);
    hopper.rotation.y = Math.PI / 4;
    hopper.position.set(BELT_X0 + 0.5, 4.6, 0);
    s.add(hopper);
    const chute = inkMesh(box(0.9, 1.2, 0.9), { color: "#b5161e", shade: "#3a0507" }, 0.03);
    chute.position.set(BELT_X0 + 0.5, 3.3, 0);
    s.add(chute);

    // gears station (from the automation model), standing behind the belt
    this.gears = makeIcon("automation", { outline: 0.0015 });
    this.gears.scale.setScalar(9);
    this.gears.position.set(GEAR_X, BELT_Y - 0.1, -1.6);
    s.add(this.gears);
    this.gearA = this.gears.getObjectByName("GearA");
    this.gearB = this.gears.getObjectByName("GearB");

    // stamping press over the belt
    for (const z of [-1.4, 1.4]) {
      const post = inkMesh(box(0.35, 3.6, 0.35), { color: "#b5161e", shade: "#3a0507" }, 0.03);
      post.position.set(PRESS_X, BELT_Y + 1.8, z);
      s.add(post);
    }
    const head = inkMesh(box(1.6, 0.5, 3.2), { color: "#b5161e", shade: "#3a0507" }, 0.03);
    head.position.set(PRESS_X, BELT_Y + 3.6, 0);
    s.add(head);
    this.press = inkMesh(box(1.3, 0.6, 1.8), { color: "#c7a25c", shade: "#3b2c12", hatchAngle: 1.57 }, 0.03);
    s.add(this.press);

    // sorting bins past the end of the belt
    this.bins = BINS.map((b) => {
      const g = new THREE.Group();
      const body = inkMesh(box(2.2, 1.2, 2.0), { color: "#efe9dd", shade: "#111013" }, 0.04);
      body.position.y = 0.6;
      g.add(body);
      const tex = canvasTexture(256, 96, (c, w, h) => {
        c.fillStyle = "#111013";
        c.fillRect(0, 0, w, h);
        c.fillStyle = "#efe9dd";
        c.font = "700 44px Archivo";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(b.label, w / 2, h / 2 + 2);
      });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.75), inkMaterial({ color: "#ffffff", lit: 1, map: tex }));
      label.position.set(1.11, 0.6, 0);
      label.rotation.y = Math.PI / 2;
      g.add(label);
      g.position.set(BELT_X1 + 2.6, 0, b.z);
      s.add(g);
      return g;
    });

    // monitor showing the live site and the hours saved
    this.screenCanvas = document.createElement("canvas");
    this.screenCanvas.width = 640;
    this.screenCanvas.height = 360;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.siteImg = siteTexture().image;
    const monitor = new THREE.Group();
    const bezel = inkMesh(box(5.4, 3.2, 0.3), { color: "#111013", lit: 1 }, 0.04);
    monitor.add(bezel);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.8), inkMaterial({ color: "#ffffff", lit: 1, map: this.screenTex }));
    screen.position.z = 0.16;
    monitor.add(screen);
    const stand = inkMesh(box(0.3, 3.2, 0.3), { color: "#111013", lit: 1 }, 0.02);
    stand.position.y = -3.2;
    monitor.add(stand);
    monitor.position.set(4.6, 6.0, -3.6);
    monitor.rotation.y = -0.35;
    s.add(monitor);
    this.monitor = monitor;
    this.lastHours = -1;

    // task cards: TASK going in, DONE coming out
    this.texTask = cardTexture("TASK", "#efe9dd", "#111013");
    this.texDone = cardTexture("DONE", "#b5161e", "#efe9dd");
    this.cards = Array.from({ length: 10 }, (_, i) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.85), inkMaterial({ color: "#ffffff", lit: 1, map: this.texTask }));
      c.userData = { phase: i / 10, bin: i % 3 };
      s.add(c);
      return c;
    });

    // the cursor supervises, pointing at the monitor
    this.cursor = makeCursor({ outline: 0.05 });
    this.cursor.scale.setScalar(0.6);
    this.cursor.rotation.set(0, -0.6, 0.4);
    s.add(this.cursor);

    this.speed = 1;
    this.run = 0;
    this.cam = this.camera(24); // long lens from far away: a near-isometric drawing
    this.diveTarget = new THREE.Vector3();
    this.camLook = new THREE.Vector3(1.2, 2.4, 0);
  }
  layout(p) {
    return [panel(0.04, 0.05, 0.92, 0.9, this.cam, p, 0, true)];
  }
  drawScreen(hours) {
    const g = this.screenCanvas.getContext("2d");
    const w = this.screenCanvas.width, h = this.screenCanvas.height;
    g.fillStyle = themeColor("#111013");
    g.fillRect(0, 0, w, h);
    g.drawImage(this.siteImg, 18, 18, 230, 318);
    g.fillStyle = themeColor("#c7a25c");
    g.font = "700 26px Archivo";
    g.fillText(SAVED.label.toUpperCase(), 280, 120);
    g.fillStyle = themeColor("#efe9dd");
    g.font = "92px Limelight";
    g.fillText(hours.toLocaleString("en-US"), 276, 220);
    g.fillStyle = themeColor("#b5161e");
    g.fillRect(280, 250, Math.min(330, 330 * (hours / SAVED.to)), 14);
    this.screenTex.needsUpdate = true;
  }
  update(p, dt, input) {
    this.speed = lerp(this.speed, input.holding ? 3.2 : 1, 0.06);
    this.run += dt * this.speed * 0.12;

    this.gearA.rotation.z += dt * this.speed * 1.2;
    this.gearB.rotation.z -= dt * this.speed * 1.2 * 1.4;

    const len = BELT_X1 - BELT_X0;
    for (let i = 0; i < 50; i++) {
      const x = BELT_X0 + ((((i / 50) + this.run * 4) % 1 + 1) % 1) * len;
      this.dummy.position.set(x, BELT_Y + 0.01, 0);
      this.dummy.updateMatrix();
      this.slats.setMatrixAt(i, this.dummy.matrix);
    }
    this.slats.instanceMatrix.needsUpdate = true;

    // each card: drop from the hopper (0-0.12), ride the belt (0.12-0.82), drop into its bin (0.82-1)
    let nearest = 99;
    for (const c of this.cards) {
      const u = (c.userData.phase + this.run) % 1;
      const pos = c.position;
      if (u < 0.12) {
        const t = u / 0.12;
        pos.set(BELT_X0 + 0.5, lerp(3.0, BELT_Y + 0.05, t * t), 0);
        c.rotation.set(0, (1 - t) * 1.2, (1 - t) * 0.5);
      } else if (u < 0.82) {
        const t = (u - 0.12) / 0.7;
        pos.set(lerp(BELT_X0 + 0.5, BELT_X1, t), BELT_Y + 0.05, 0);
        c.rotation.set(0, 0, 0);
        nearest = Math.min(nearest, Math.abs(pos.x - PRESS_X));
      } else {
        const t = (u - 0.82) / 0.18;
        const bin = BINS[c.userData.bin];
        pos.set(lerp(BELT_X1, BELT_X1 + 2.6, t), BELT_Y + 0.05 + Math.sin(t * Math.PI) * 1.2 - t * 0.2, lerp(0, bin.z, t));
        c.rotation.set(0, 0, -t * 0.8);
      }
      const done = pos.x > PRESS_X;
      const map = done ? this.texDone : this.texTask;
      if (c.material.uniforms.uMap.value !== map) c.material.uniforms.uMap.value = map;
      c.visible = !(u > 0.97);
    }
    const slam = Math.exp(-nearest * nearest * 10);
    this.slam = slam;
    this.press.position.set(PRESS_X, lerp(BELT_Y + 3.0, BELT_Y + 0.45, slam), 0);

    // monitor counter: climbs with progress, faster while holding
    const hours = Math.round(SAVED.to * easeOut(clamp01(range(p, 0.08, 0.9) + (this.speed - 1) * 0.03)));
    if (hours !== this.lastHours) {
      this.lastHours = hours;
      this.drawScreen(hours);
    }

    this.cursor.position.set(2.2, 6.6 + Math.sin(input.time * 1.6) * 0.2, -1.2);

    // near-isometric camera, slowly orbiting
    const a = lerp(-0.85, -0.6, p);
    const r = lerp(21, 19, p);
    this.cam.position.set(1 + Math.sin(a) * r, 15.5, Math.cos(a) * r);
    this.cam.lookAt(this.camLook);
    this.monitor.updateMatrixWorld();
    this.diveTarget.set(0, 0, 0.2).applyMatrix4(this.monitor.matrixWorld); // into the monitor
  }
  sound() {
    // the machine runs louder and faster while you hold: belt hum, gear teeth, a thunk per stamp
    const fast = (this.speed - 1) / 2.2;
    audio.bed("conveyor", 0.8 + fast * 0.7, 1 + fast * 0.35);
    audio.rate("clank", this.speed * 2.6);
    audio.boost(fast * 0.5);
    if (crossed(this.soundSlam ?? 1, this.slam, 0.85)) sfx("thunk");
    this.soundSlam = this.slam;
    if (this.lastHours !== this.soundHours) audio.rate("tick", 14); // counter rolling
    this.soundHours = this.lastHours;
  }
}
