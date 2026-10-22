import * as THREE from "three";
import { StoryScene, range, ease, easeOut, lerp, clamp01, inkMesh, makeCursor, makeSite, siteTexture, instanced, paperPlaneGeometry, crossed } from "./common.js";
import { audio, sfx } from "../audio.js";
import { canvasTexture } from "../assets.js";
import { inkMaterial, addOutline, PALETTE } from "../ink.js";
import { METRICS } from "../content.js";
import { themeColor } from "../themes.js";

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ---------------------------------------------------------------------------
// 05 Launch: launch day at dawn. The site folds into a paper plane and flies across
// a scrolling skyline (three parallax layers) past a WE'RE LIVE sign, toward the sun.
// Hold to boost.
// ---------------------------------------------------------------------------
const SPAN = 140; // width of one skyline strip; strips wrap around

function skylineStrip({ z, minH, maxH, color, windows, seed }) {
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const group = new THREE.Group();
  const towers = [], lights = [];
  for (let x = -SPAN / 2; x < SPAN / 2; ) {
    const w = 2 + rnd() * 4;
    const h = minH + Math.pow(rnd(), 1.6) * (maxH - minH);
    towers.push(new THREE.Matrix4().compose(new THREE.Vector3(x + w / 2, h / 2, 0), new THREE.Quaternion(), new THREE.Vector3(w, h, 3)));
    if (windows) {
      for (let k = 0; k < h * w * 0.35; k++) {
        if (rnd() > 0.55) continue;
        lights.push(new THREE.Matrix4().makeTranslation(x + 0.4 + rnd() * (w - 0.8), 0.6 + rnd() * (h - 1.2), 1.52));
      }
    }
    x += w + rnd() * 0.6;
  }
  group.add(instanced(box(1, 1, 1), { color, shade: "#111013", hatchScale: 1.2, hatchAngle: 1.57, lit: 0.35 }, towers, 0.05));
  if (lights.length) {
    const lm = new THREE.InstancedMesh(box(0.35, 0.22, 0.02), new THREE.MeshBasicMaterial({ color: themeColor("#ffcf7a") }), lights.length);
    lights.forEach((m, i) => lm.setMatrixAt(i, m));
    group.add(lm);
  }
  group.position.z = z;
  return group;
}

export class LaunchScene extends StoryScene {
  constructor(ctx) {
    super(ctx);
    this.bg = PALETTE.ink;
    this.light.set(0.6, 0.5, 0.6).normalize();
    const s = this.scene;

    // dawn sky: a gradient backdrop in the world (navy overhead, glow at the horizon), and a sun that rises
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 220),
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: { uTop: { value: new THREE.Color(themeColor("#111013")) }, uBottom: { value: new THREE.Color(themeColor("#c7a25c")) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; varying vec2 vUv;
          void main(){ float t = smoothstep(0.38, 0.72, vUv.y); gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0); }`,
      })
    );
    sky.position.set(0, 40, -120);
    s.add(sky);
    // dark ground under the city, so the horizon glow only shows above the skyline
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 260), inkMaterial({ color: "#111013", lit: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -7.9, -100);
    s.add(ground);
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(9, 64), inkMaterial({ color: "#e9c46a", lit: 1 }));
    s.add(this.sun);
    const sunRing = new THREE.Mesh(new THREE.RingGeometry(10.5, 11.2, 64), inkMaterial({ color: "#efe9dd", lit: 1, opacity: 0.35 }));
    this.sun.add(sunRing);

    // three skyline layers, each made of two strips that wrap for endless scrolling
    this.layers = [
      { z: -70, speed: 0.15, opts: { minH: 10, maxH: 30, color: "#7d1016", windows: false, seed: 3 } },
      { z: -40, speed: 0.4, opts: { minH: 6, maxH: 20, color: "#3a3538", windows: true, seed: 7 } },
      { z: -16, speed: 1, opts: { minH: 3, maxH: 11, color: "#111013", windows: true, seed: 11 } },
    ].map((L) => {
      const strips = [0, 1].map((n) => {
        const st = skylineStrip({ z: L.z, ...L.opts });
        st.position.set(n * SPAN, -8, L.z);
        s.add(st);
        return st;
      });
      return { ...L, strips, offset: 0 };
    });

    // rooftop sign on the near layer
    const signTex = canvasTexture(512, 192, (g, w, h) => {
      g.fillStyle = "#111013";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#c7a25c";
      g.lineWidth = 10;
      g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = "#c7a25c";
      g.font = "96px Limelight";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("WE'RE LIVE", w / 2, h / 2 + 6);
    });
    this.sign = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), inkMaterial({ color: "#ffffff", lit: 1, map: signTex }));
    addOutline(board, 0.05);
    this.sign.add(board);
    for (const x of [-3, 3]) {
      const leg = inkMesh(box(0.25, 3, 0.25), { color: "#111013", lit: 1 }, 0.02);
      leg.position.set(x, -3.2, 0);
      this.sign.add(leg);
    }
    s.add(this.sign);
    this.signX = 30;

    // the site built two scenes ago folds away...
    this.site = makeSite().group;
    s.add(this.site);
    // ...into a paper plane flying left to right, the cursor riding on top
    this.plane = new THREE.Group();
    const body = new THREE.Mesh(paperPlaneGeometry(), inkMaterial({ color: "#efe9dd", shade: "#111013", hatchScale: 1.2, side: THREE.DoubleSide }));
    addOutline(body, 0.04);
    body.rotation.y = -Math.PI / 2; // nose (-Z) now points +X
    this.plane.add(body);
    this.rider = makeCursor({ outline: 0.05 });
    this.rider.scale.setScalar(0.3);
    this.rider.position.set(0.4, 1.1, 0);
    this.rider.rotation.set(0, 0, 0.5);
    this.plane.add(this.rider);
    s.add(this.plane);

    // orange ribbon trail
    this.trail = new THREE.InstancedMesh(box(0.7, 0.12, 0.12), inkMaterial({ color: "#c7a25c", lit: 1 }), 70);
    this.trailPts = Array.from({ length: 70 }, () => new THREE.Vector3(-100, 0, 0));
    this.trailTimer = 0;
    s.add(this.trail);

    // wind streaks
    this.streaks = new THREE.InstancedMesh(box(1, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: themeColor("#efe9dd") }), 90);
    this.streakData = Array.from({ length: 90 }, () => ({ x: Math.random() * 80 - 40, y: Math.random() * 16 - 4, z: Math.random() * 10 - 6, l: 1 + Math.random() * 4 }));
    s.add(this.streaks);
    this.dummy = new THREE.Object3D();

    this.metricsEl = document.getElementById("metrics");
    this.metricsEl.innerHTML = METRICS.map((m) => `<div class="metric"><span class="metric__value">0</span><span class="metric__label">${m.label}</span></div>`).join("");
    this.values = [...this.metricsEl.querySelectorAll(".metric__value")];

    this.speed = 1;
    this.travel = 0;
    this.cam = this.camera(36, 0.1, 400);
    this.diveTarget = new THREE.Vector3();
  }
  layout() {
    return [{ x: 0, y: 0, w: 1, h: 1, cam: this.cam, border: false, visible: true }];
  }
  hide() {
    this.metricsEl.style.visibility = "hidden";
  }
  update(p, dt, input) {
    this.speed = lerp(this.speed, input.holding ? 3 : 1, 0.05);
    const fly = range(p, 0.12, 0.3); // the world starts moving once the plane exists
    const v = dt * this.speed * 9 * fly;
    this.travel += v;

    // sun rises with progress
    const rise = ease(range(p, 0, 1));
    this.sun.position.set(18, lerp(-6, 9, rise), -90);

    // parallax skyline
    for (const L of this.layers) {
      L.offset = (L.offset + v * L.speed) % SPAN;
      L.strips.forEach((st, n) => (st.position.x = n * SPAN - L.offset - SPAN / 2));
    }
    this.signX -= v;
    if (this.signX < -40) this.signX = 60;
    this.sign.position.set(this.signX, 7.5, -15);

    // fold: the site shrinks and spins away as the plane takes its place
    const fold = ease(range(p, 0.02, 0.2));
    this.site.visible = fold < 1;
    const s0 = 0.2;
    this.site.scale.set(s0 * (1 - fold) + 0.0001, s0 * (1 - fold * 0.7), s0);
    this.site.rotation.set(0, fold * Math.PI, fold * 0.6);
    this.site.position.set(-1, 3, 4);

    // plane: bobs and banks; at the end it climbs toward the sun
    const climb = ease(range(p, 0.86, 1));
    this.plane.scale.setScalar(Math.max(0.001, easeOut(range(p, 0.1, 0.24))) * 1.5);
    this.plane.position.set(lerp(-1, 7, climb) + Math.sin(input.time * 0.5) * 0.6, 3 + Math.sin(input.time * 1.3) * 0.35 + climb * 5, 4);
    this.plane.rotation.set(Math.sin(input.time * 0.9) * 0.15, 0, 0.08 + Math.sin(input.time * 1.3) * 0.06 + climb * 0.45);
    this.rider.position.y = 1.1 + Math.abs(Math.sin(input.time * 3)) * 0.08;
    this.diveTarget.copy(this.plane.position);

    // trail: dashes dropped behind the plane drift left with the near skyline
    this.trailTimer += dt;
    if (this.trailTimer > 0.04 && p > 0.15) {
      this.trailTimer = 0;
      this.trailPts.unshift(this.plane.position.clone().add(new THREE.Vector3(-1.6, -0.2, 0)));
      this.trailPts.length = 70;
    }
    this.trailPts.forEach((pt, i) => {
      pt.x -= v;
      this.dummy.position.copy(pt);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(Math.max(0.001, 1 - i / 70));
      this.dummy.updateMatrix();
      this.trail.setMatrixAt(i, this.dummy.matrix);
    });
    this.trail.instanceMatrix.needsUpdate = true;

    this.streakData.forEach((d, i) => {
      d.x -= dt * 26 * this.speed * Math.max(0.2, fly);
      if (d.x < -40) d.x = 40;
      this.dummy.position.set(d.x, d.y, d.z);
      this.dummy.scale.set(d.l * (0.5 + this.speed * 0.7), 1, 1);
      this.dummy.updateMatrix();
      this.streaks.setMatrixAt(i, this.dummy.matrix);
    });
    this.streaks.instanceMatrix.needsUpdate = true;

    // side-on camera, easing back a little as the scene opens up
    // slightly above the plane so its folded wings read, easing back as the scene opens up
    const tall = this.cam.aspect < 1; // phones: keep the plane centred
    this.cam.position.set(lerp(-1, 1.5, p), lerp(7.5, 9, p), lerp(13, 18, ease(p)));
    if (tall) this.cam.lookAt(this.plane.position.x, this.plane.position.y + 1, this.plane.position.z - 4);
    else this.cam.lookAt(lerp(-0.5, 2, p), lerp(3, 4.5, p), 0);
    if (input.holding) this.cam.position.y += (Math.random() - 0.5) * 0.04;

    const k = easeOut(clamp01(range(p, 0.2, 0.9) + this.travel * 0.0006));
    METRICS.forEach((m, i) => {
      const val = m.to * k;
      this.values[i].textContent = (m.decimals ? val.toFixed(m.decimals) : Math.round(val).toLocaleString("en-US")) + m.suffix;
    });
    this.metricsEl.style.visibility = Math.abs(input.shift) < 0.02 ? "visible" : "hidden";
    this.metricsEl.style.opacity = String(range(p, 0.18, 0.28));
  }
  sound(p, prev) {
    // wind picks up with flight speed; holding adds the boost engine
    const fly = range(p, 0.12, 0.3);
    audio.bed("wind", 0.5 + fly * 0.5 * this.speed);
    audio.boost(((this.speed - 1) / 2) * 0.8);
    if (crossed(prev, p, 0.04)) sfx("swish"); // the site folds
    if (crossed(prev, p, 0.12)) sfx("pop"); // ...into a plane
    if (p > 0.2 && p < 0.9 && Math.abs(p - prev) > 0) audio.rate("tick", 10); // metrics counting up
    if (crossed(prev, p, 0.86)) sfx("levitate"); // climbs toward the sun
  }
}

// ---------------------------------------------------------------------------
// 06 Scale: a swarm of browser windows flies in and locks into a giant R
// ---------------------------------------------------------------------------
function rTargets(spacing = 1.0) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.font = "60px Limelight";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("R", 32, 35);
  const data = g.getImageData(0, 0, 64, 64).data;
  const pts = [];
  // sample every 2px: dense enough that the letter reads as one shape
  for (let y = 0; y < 64; y += 2) {
    for (let x = 0; x < 64; x += 2) {
      if (data[(y * 64 + x) * 4 + 3] > 128) pts.push(new THREE.Vector3((x - 32) * spacing * 0.62, (32 - y) * spacing * 0.48, 0));
    }
  }
  return pts;
}

export class ScaleScene extends StoryScene {
  constructor(ctx) {
    super(ctx);
    this.bg = PALETTE.red;
    this.light.set(-0.3, 0.6, 0.8).normalize();
    const s = this.scene;
    this.targets = rTargets();
    const n = this.targets.length;
    // every window shows the same finished site: a thousand people on one launch
    this.swarm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 1.59, 0.06), inkMaterial({ color: "#ffffff", lit: 0.85, map: siteTexture(), hatchScale: 1.6 }), n);
    addOutline(this.swarm, 0.04);
    s.add(this.swarm);
    // every copy starts stacked as ONE site card in the middle, then they deal out into the R
    this.starts = this.targets.map((_, i) => new THREE.Vector3(0, 0, 8 + i * 0.0006));
    this.spins = this.targets.map(() => new THREE.Euler((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2));
    this.delays = this.targets.map(() => Math.random() * 0.45);
    this.dummy = new THREE.Object3D();

    this.cursor = makeCursor({ outline: 0.08 });
    this.cursor.scale.setScalar(2.2);
    s.add(this.cursor);

    // "a thousand people show up": tiny user cursors stream in from the edges and click windows
    const cursorGeo = makeCursor().children[0].geometry;
    const users = 160;
    this.users = new THREE.InstancedMesh(cursorGeo, inkMaterial({ color: "#efe9dd", shade: "#111013", lit: 0.6 }), users);
    addOutline(this.users, 0.09);
    s.add(this.users);
    this.userData = Array.from({ length: users }, () => {
      const a = Math.random() * Math.PI * 2;
      const win = Math.floor(Math.random() * n);
      return {
        from: new THREE.Vector3(Math.cos(a) * 46, Math.sin(a) * 30, 6 + Math.random() * 6),
        win,
        arrive: 0.5 + Math.random() * 0.32, // progress at which it reaches its window
        tilt: (Math.random() - 0.5) * 0.6,
      };
    });
    // when each window gets clicked (for a small pop)
    this.clickedAt = new Array(n).fill(2);
    for (const u of this.userData) this.clickedAt[u.win] = Math.min(this.clickedAt[u.win], u.arrive);

    this.cam = this.camera(45, 0.1, 400);
    this.diveTarget = new THREE.Vector3(0, 0, 0);
  }
  layout() {
    return [{ x: 0, y: 0, w: 1, h: 1, cam: this.cam, border: false, visible: true }];
  }
  update(p, dt, input) {
    const k = range(p, 0.04, 0.72);
    for (let i = 0; i < this.targets.length; i++) {
      const t = ease(clamp01((k - this.delays[i]) / 0.5));
      this.dummy.position.lerpVectors(this.starts[i], this.targets[i], t);
      // a little arc toward the camera mid-flight, then the locked-in windows breathe in a slow wave
      this.dummy.position.z += Math.sin(t * Math.PI) * 4 + t * Math.sin(input.time * 1.5 + this.targets[i].x * 0.2) * 0.25;
      const sp = this.spins[i], wob = Math.sin(t * Math.PI);
      this.dummy.rotation.set(sp.x * wob, sp.y * wob, sp.z * wob);
      // a quick pop when a user's cursor clicks this window
      const pop = Math.exp(-Math.pow((p - this.clickedAt[i]) / 0.015, 2)) * 0.25;
      this.dummy.scale.setScalar(lerp(2.6, 0.62, t) * (1 + pop));
      this.dummy.updateMatrix();
      this.swarm.setMatrixAt(i, this.dummy.matrix);
    }
    this.swarm.instanceMatrix.needsUpdate = true;

    // user cursors fly in, tap their window and hover there
    this.userData.forEach((u, i) => {
      const t = ease(clamp01((p - (u.arrive - 0.16)) / 0.16));
      const tgt = this.targets[u.win];
      this.dummy.position.set(
        lerp(u.from.x, tgt.x + 0.25, t),
        lerp(u.from.y, tgt.y - 0.2, t),
        lerp(u.from.z, 1.2, t) + (t >= 1 ? Math.abs(Math.sin(input.time * 4 + i)) * 0.25 : 0)
      );
      this.dummy.rotation.set(0, 0, u.tilt);
      this.dummy.scale.setScalar(t > 0 ? 0.34 : 0.0001);
      this.dummy.updateMatrix();
      this.users.setMatrixAt(i, this.dummy.matrix);
    });
    this.users.instanceMatrix.needsUpdate = true;

    // the cursor flies in and clicks the R
    const c = ease(range(p, 0.72, 0.95));
    this.cursor.position.set(lerp(30, 3, c), lerp(-20, 1, c), lerp(10, 4, c) - Math.sin(range(p, 0.92, 1) * Math.PI) * 1.2);
    this.cursor.rotation.set(0, -0.3, 0.2);

    // starts square-on to the single card, then drifts as the R forms
    const e = ease(p);
    this.cam.position.set(Math.sin(p * 1.2) * 6 * e, lerp(0, 1, e), lerp(30, 40, e));
    this.cam.lookAt(0, 0, 0);
  }
  sound(p, prev, dt) {
    // cards dealing out flutter; every user who arrives clicks; the hero click lands the chord
    const v = Math.abs(range(p, 0.04, 0.72) - range(prev, 0.04, 0.72)) / Math.max(dt, 1e-3);
    audio.rate("pencil", Math.min(30, v * 120));
    let arrivals = 0;
    for (const u of this.userData) if (crossed(prev, p, u.arrive)) arrivals++;
    for (let i = 0; i < Math.min(3, arrivals); i++) sfx("user");
    if (crossed(prev, p, 0.95)) sfx("success");
  }
}
