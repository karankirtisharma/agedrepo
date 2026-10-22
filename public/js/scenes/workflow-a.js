import * as THREE from "three";
import { StoryScene, panel, range, ease, easeOut, lerp, clamp01, inkMesh, makeCursor, makePencil, ruledPaper, strokeDrawing, heroTexture, LAYOUT, crossed } from "./common.js";
import { audio, sfx } from "../audio.js";
import { inkMaterial, addOutline, PALETTE } from "../ink.js";
import { canvasTexture } from "../assets.js";
import { themeColor } from "../themes.js";

/** Sketchbook spread as the ground: two ruled pages and a spiral down the spine. */
function sketchbookGround(scene) {
  const paper = ruledPaper();
  paper.repeat.set(3, 4);
  for (const x of [0, -15.2]) {
    const page = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 19), inkMaterial({ color: "#ffffff", lit: 0.9, map: paper, hatchScale: 2 }));
    page.rotation.x = -Math.PI / 2;
    page.position.x = x;
    addOutline(page, 0.06);
    scene.add(page);
  }
  // page stack thickness under each page
  for (const x of [0, -15.2]) {
    const stack = inkMesh(new THREE.BoxGeometry(14.4, 0.5, 19), { color: "#e9e2d3", shade: "#111013", hatchAngle: 0 }, 0.05);
    stack.position.set(x, -0.26, 0);
    scene.add(stack);
  }
  const ringGeo = new THREE.TorusGeometry(0.55, 0.09, 8, 24);
  const ringMat = inkMaterial({ color: "#c7a25c", shade: "#3b2c12", lit: 0.5 });
  for (let z = -8.6; z <= 8.6; z += 0.86) {
    const r = new THREE.Mesh(ringGeo, ringMat);
    r.position.set(-7.6, 0.2, z);
    scene.add(r);
  }
}

// ---------------------------------------------------------------------------
// 01 Idea: a pencil draws the site on a giant sketchbook while the cursor watches
// ---------------------------------------------------------------------------
export class IdeaScene extends StoryScene {
  constructor(ctx) {
    super(ctx);
    this.bg = PALETTE.paper;
    this.light.set(-0.4, 0.9, 0.3).normalize();
    const s = this.scene;
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), inkMaterial({ color: "#b5161e", shade: "#5c080c", hatchScale: 1.6, lit: 0.6 }));
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -0.52;
    s.add(desk);
    sketchbookGround(s);

    this.drawing = strokeDrawing(LAYOUT, { width: 0.11 });
    s.add(this.drawing.group);
    // a quick hand-written arrow + scribble next to the layout
    this.scribble = strokeDrawing([{ x: 5.4, z: -4.6, w: 1.0, d: 0.01 }, { x: 5.9, z: -4.6, w: 0.01, d: 2.2 }], { width: 0.08, color: "#b5161e" });
    s.add(this.scribble.group);

    this.pencil = makePencil(9);
    this.pencil.rotation.set(0.45, 0, -0.35);
    s.add(this.pencil);

    // the hero: a big cursor standing on the page, watching the drawing appear
    this.cursor = makeCursor();
    this.cursor.position.set(6.6, 3.1, 5.6);
    this.cursor.rotation.y = -0.55;
    s.add(this.cursor);

    // sticky note on the left page
    const noteTex = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = "#e9c46a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#111013";
      g.font = "italic 64px Georgia, serif";
      g.textAlign = "center";
      g.fillText("what if", w / 2, 210);
      g.fillText("it moved?", w / 2, 300);
      g.strokeStyle = "#b5161e";
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(130, 340);
      g.quadraticCurveTo(260, 380, 390, 334);
      g.stroke();
    });
    this.note = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), inkMaterial({ color: "#ffffff", lit: 0.85, map: noteTex }));
    this.note.rotation.set(-Math.PI / 2, 0, 0.12);
    this.note.position.set(-12.4, 0.05, -3.2);
    addOutline(this.note, 0.05);
    s.add(this.note);

    this.camWide = this.camera(40);
    this.camTip = this.camera(30);
    this.camNote = this.camera(30);
    this.diveTarget = new THREE.Vector3(0, 0, -3.2); // into the sketched hero box
  }
  layout(p, vp) {
    const m = vp.mobile;
    return [
      panel(0.04, 0.05, 0.92, m ? 0.5 : 0.56, this.camWide, p, 0),
      panel(0.04, m ? 0.58 : 0.65, m ? 0.92 : 0.44, m ? 0.18 : 0.3, this.camTip, p, 0.18),
      panel(m ? 0.04 : 0.52, m ? 0.79 : 0.65, m ? 0.92 : 0.44, m ? 0.17 : 0.3, this.camNote, p, 0.42),
    ];
  }
  update(p, dt, input) {
    const t = ease(range(p, 0.06, 0.82));
    const tip = this.drawing.set(t);
    this.scribble.set(range(p, 0.82, 0.95));
    // pencil follows the line, lifting a little as it travels
    const lift = 0.12 + Math.abs(Math.sin(t * 60)) * 0.08;
    this.pencil.position.lerp(new THREE.Vector3(tip.x, tip.y + lift, tip.z), 0.35);
    if (p > 0.84) this.pencil.position.lerp(new THREE.Vector3(5.9, 0.2, -2.4), 0.2);
    // done drawing: the pencil lifts up and out of frame so the camera can dive into the sketch
    const lift2 = ease(range(p, 0.9, 1));
    this.pencil.position.y += lift2 * 14;
    this.pencil.position.x += lift2 * 6;

    // cursor bobs and turns to follow the pencil
    this.cursor.position.y = 3.1 + Math.sin(input.time * 2) * 0.15;
    const look = Math.atan2(this.pencil.position.x - this.cursor.position.x, this.pencil.position.z - this.cursor.position.z);
    this.cursor.rotation.y = lerp(this.cursor.rotation.y, look + Math.PI, 0.05);

    this.camWide.position.set(lerp(9, 6, p), lerp(15, 12, p), lerp(17, 15, p));
    this.camWide.lookAt(lerp(1, 0, p), 0, lerp(-0.5, 0.5, p));
    this.camTip.position.set(this.pencil.position.x + 3.2, 2.6, this.pencil.position.z + 3.4);
    this.camTip.lookAt(this.pencil.position.x, 0.4, this.pencil.position.z);
    this.camNote.position.set(-12.4 + Math.sin(input.time * 0.3) * 0.2, 6.5, 1.4);
    this.camNote.lookAt(this.note.position);
  }
  sound(p, prev, dt) {
    // pencil grain follows how fast the line is being drawn (stops when you stop scrolling)
    const drawn = (q) => ease(range(q, 0.06, 0.82)) + range(q, 0.82, 0.95);
    const v = Math.abs(drawn(p) - drawn(prev)) / Math.max(dt, 1e-3);
    audio.rate("pencil", Math.min(45, v * 500));
    if (crossed(prev, p, 0.18)) sfx("swish"); // close-up panel
    if (crossed(prev, p, 0.42)) sfx("pop"); // sticky note panel
    if (crossed(prev, p, 0.9)) sfx("levitate"); // pencil lifts away
  }
}

// ---------------------------------------------------------------------------
// 02 Design: the drawing pops up into a clickable layout; the cursor hops across it
// ---------------------------------------------------------------------------
export class DesignScene extends StoryScene {
  constructor(ctx) {
    super(ctx);
    this.bg = PALETTE.red;
    this.light.set(-0.5, 0.85, 0.35).normalize();
    const s = this.scene;
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), inkMaterial({ color: "#b5161e", shade: "#5c080c", hatchScale: 1.6, lit: 0.6 }));
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -0.52;
    s.add(desk);
    sketchbookGround(s);
    s.add(strokeDrawing(LAYOUT, { width: 0.11 }).group); // the finished sketch stays on the page underneath
    s.children.at(-1).children.forEach((m) => (m.scale.x = Math.max(m.scale.x, 1e-4)));

    // pop-up blocks: same rectangles as the sketch, rising off the page
    this.layoutGroup = new THREE.Group();
    s.add(this.layoutGroup);
    const heroTex = heroTexture();
    // blocks rise as grey wireframe blocks; the cursor paints each one its colour as it lands
    this.grey = new THREE.Color("#cfc9bd");
    this.blocks = LAYOUT.map((r, i) => {
      const geo = new THREE.BoxGeometry(r.w, r.h, r.d);
      geo.translate(0, r.h / 2, 0);
      const m = inkMesh(geo, { color: this.grey.clone(), shade: "#111013", hatchScale: 1.1, lit: 0.2 }, 0.04);
      m.position.set(r.x + r.w / 2, 0, r.z + r.d / 2);
      m.userData = { delay: i * 0.07, press: 0, target: new THREE.Color(themeColor(r.color)), lit: r.color === "#111013" ? 1 : 0.2 };
      if (i === 1) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(r.w * 0.92, r.d * 0.85), inkMaterial({ color: "#ffffff", lit: 1, map: heroTex, opacity: 0 }));
        face.material.transparent = true;
        face.rotation.x = -Math.PI / 2;
        face.position.y = r.h + 0.01;
        m.add(face);
        this.heroFace = face;
      }
      if (i === 3 || i === 4) {
        const img = inkMesh(new THREE.BoxGeometry(r.w * 0.8, 0.06, r.d * 0.5), { color: "#6e0b10", shade: "#111013", hatchAngle: 0.8 }, 0.02);
        img.position.set(0, r.h + 0.03, -r.d * 0.15);
        m.add(img);
        m.userData.img = img;
      }
      this.layoutGroup.add(m);
      return m;
    });

    // palette chips floating beside the page; a chip bobs when its colour is applied
    this.chips = ["#111013", "#b5161e", "#c7a25c", "#efe9dd", "#6e0b10"].map((c, i) => {
      const chip = inkMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 28), { color: c, shade: "#111013", lit: 0.5 }, 0.04);
      chip.position.set(7.4, 0.6, -5 + i * 1.5);
      chip.userData.color = c;
      s.add(chip);
      return chip;
    });

    this.cursor = makeCursor({ outline: 0.06 });
    this.cursor.rotation.z = Math.PI * 0.85; // tip pointing down: clicking
    this.cursor.scale.setScalar(1.05);
    s.add(this.cursor);
    // hop route: every block, top to bottom (nav, hero, button, card, card, footer)
    this.route = [0, 1, 2, 3, 4, 5];

    this.tilt = new THREE.Vector2();
    this.cam = this.camera(38);
    this.diveTarget = new THREE.Vector3(0, 1.15, -3.2); // into the "YOUR IDEA, LIVE." block
  }
  layout(p) {
    return [{ x: 0, y: 0, w: 1, h: 1, cam: this.cam, border: false, visible: true }];
  }
  update(p, dt, input) {
    // blocks rise in a stagger
    for (const b of this.blocks) {
      const k = easeOut(clamp01((range(p, 0.05, 0.5) - b.userData.delay) / 0.45));
      b.userData.press = lerp(b.userData.press, 0, 0.15);
      b.scale.y = Math.max(0.001, k * (1 - b.userData.press * 0.35));
    }
    // whole layout tilts toward the pointer
    this.tilt.lerp(input.pointer, 0.06);
    this.layoutGroup.rotation.x = this.tilt.y * -0.06;
    this.layoutGroup.rotation.z = this.tilt.x * -0.06;

    // cursor hops from block to block
    const hop = range(p, 0.45, 0.95) * (this.route.length - 1);
    const i = Math.min(this.route.length - 2, Math.floor(hop));
    const f = hop - i;
    const a = this.blocks[this.route[i]], b = this.blocks[this.route[i + 1]];
    const ha = LAYOUT[this.route[i]].h, hb = LAYOUT[this.route[i + 1]].h;
    const x = lerp(a.position.x, b.position.x, ease(f));
    const z = lerp(a.position.z, b.position.z, ease(f));
    const y = lerp(ha, hb, f) + Math.sin(f * Math.PI) * 2.2 + 0.05;
    this.cursor.position.set(x, p < 0.45 ? lerp(6, ha + 0.05, range(p, 0.3, 0.45)) : y, z);
    if (f > 0.92 && p > 0.45) b.userData.press = 1; // "click" on landing
    this.cursor.visible = p > 0.3;

    // paint: each block takes its colour as the cursor lands on it (scrubs both ways)
    const landed = p < 0.45 ? range(p, 0.38, 0.45) - 1 : hop; // block route[0] gets painted on the first landing
    const chipBob = new Map();
    this.route.forEach((bi, idx) => {
      const blk = this.blocks[bi];
      const paint = clamp01((landed - idx + 0.15) / 0.2);
      const u = blk.material.uniforms;
      u.uColor.value.copy(this.grey).lerp(blk.userData.target, paint);
      u.uLit.value = lerp(0.2, blk.userData.lit, paint);
      if (blk.userData.img) blk.userData.img.visible = paint > 0.5;
      if (paint > 0 && paint < 1) chipBob.set(LAYOUT[bi].color, Math.sin(paint * Math.PI));
      if (bi === 1) this.heroFace.material.uniforms.uOpacity.value = paint;
    });
    this.chips.forEach((chip, i) => {
      chip.position.y = 0.6 + Math.sin(input.time * 1.4 + i) * 0.12 + (chipBob.get(chip.userData.color) || 0) * 1.4;
      chip.rotation.x = (chipBob.get(chip.userData.color) || 0) * 0.6;
    });

    const o = ease(range(p, 0, 0.6));
    this.cam.position.set(lerp(0.5, 11, o), lerp(24, 10, o), lerp(2, 15, o));
    this.cam.lookAt(0, 0.5, -0.5);
  }
  sound(p, prev) {
    // a pop as each block rises off the page
    this.blocks.forEach((b, i) => crossed(prev, p, 0.07 + 0.45 * b.userData.delay) && sfx("pop", { n: i }));
    if (crossed(prev, p, 0.3)) sfx("levitate"); // the cursor drops in
    // a marimba note, climbing the scale, as the cursor lands and paints each block
    const landed = (q) => (q < 0.45 ? range(q, 0.38, 0.45) - 1 : range(q, 0.45, 0.95) * (this.route.length - 1));
    this.route.forEach((_, idx) => crossed(landed(prev), landed(p), idx - 0.1) && sfx("paint", { n: idx }));
  }
}
