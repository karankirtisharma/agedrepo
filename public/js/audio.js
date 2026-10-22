// Sound for the whole site, generated in the browser (no audio files):
//  - ambience beds (wind, hum, train rumble, conveyor, city) cross-faded per scene
//  - a soft music pad whose chord changes scene by scene (minor -> major as the story resolves)
//  - one-shot effects (pencil, paint notes, typing, press thunk, whooshes...)
// Nothing plays until the visitor turns sound on (a click, so browsers allow audio).

let ctx = null;
let enabled = false;
const bus = {};
const beds = {};
const rates = {}; // continuous "events per second" channels (pencil, typing, clicks...)
let pad = null;
let boost = null;
let boostLevel = 0, boostApplied = 0;
let noise = null;

const KEY = "ruddix-sound";
export function soundPreference() {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

function makeNoise() {
  const len = ctx.sampleRate * 2;
  const white = ctx.createBuffer(1, len, ctx.sampleRate);
  const brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const w = white.getChannelData(0), b = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    w[i] = Math.random() * 2 - 1;
    last = (last + 0.02 * w[i]) / 1.02;
    b[i] = last * 3.5;
  }
  return { white, brown };
}

function loopSource(buffer) {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.start();
  return s;
}

function lfo(freq, depth, target) {
  const o = ctx.createOscillator();
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
  return o;
}

function start() {
  ctx = new AudioContext();
  noise = makeNoise();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 8;
  limiter.connect(ctx.destination);
  bus.master = ctx.createGain();
  bus.master.gain.value = 0;
  bus.master.connect(limiter);
  for (const [k, v] of Object.entries({ music: 0.16, amb: 0.5, sfx: 0.7 })) {
    bus[k] = ctx.createGain();
    bus[k].gain.value = v;
    bus[k].connect(bus.master);
  }

  // ---- ambience beds (each ends in a gain we fade per scene) ----
  const bed = (name, build) => {
    const g = ctx.createGain();
    g.gain.value = 0;
    build(g);
    g.connect(bus.amb);
    beds[name] = g;
  };
  bed("wind", (out) => {
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 500;
    f.Q.value = 0.8;
    lfo(0.08, 320, f.frequency);
    loopSource(noise.brown).connect(f).connect(out);
  });
  bed("hum", (out) => {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 320;
    for (const [hz, gain] of [[55, 0.6], [82.4, 0.35], [110.2, 0.15]]) {
      const o = ctx.createOscillator();
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(f);
      o.start();
    }
    f.connect(out);
  });
  bed("rumble", (out) => {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.value = 0.8;
    lfo(5.5, 0.25, g.gain);
    loopSource(noise.brown).connect(f).connect(g).connect(out);
  });
  bed("conveyor", (out) => {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1300;
    bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    lfo(6, 0.2, g.gain);
    loopSource(noise.white).connect(bp).connect(g).connect(out);
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = 46;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    const sg = ctx.createGain();
    sg.gain.value = 0.25;
    saw.connect(lp).connect(sg).connect(out);
    saw.start();
  });
  bed("city", (out) => {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 480;
    loopSource(noise.brown).connect(f).connect(out);
  });

  // ---- music pad: four detuned saw voices through a slowly breathing low-pass ----
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.6;
  lfo(0.05, 300, filter.frequency);
  const padGain = ctx.createGain();
  padGain.gain.value = 0.9;
  filter.connect(padGain).connect(bus.music);
  const voices = [];
  for (let i = 0; i < 4; i++) {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.detune.value = det;
      o.frequency.value = mtof(50);
      const g = ctx.createGain();
      g.gain.value = 0.06;
      o.connect(g).connect(filter);
      o.start();
      voices.push({ o, i });
    }
  }
  pad = { voices, gain: padGain };

  // ---- hold-to-boost tone ----
  const bo = ctx.createOscillator();
  bo.type = "sawtooth";
  bo.frequency.value = 180;
  const blp = ctx.createBiquadFilter();
  blp.type = "lowpass";
  blp.frequency.value = 600;
  const bg = ctx.createGain();
  bg.gain.value = 0;
  bo.connect(blp).connect(bg).connect(bus.sfx);
  bo.start();
  boost = { osc: bo, gain: bg, filter: blp };
}

// ---------------------------------------------------------------------------
// one-shot building blocks
// ---------------------------------------------------------------------------
function tone(type, freq, dur, peak, { to, attack = 0.005, at = 0, out = bus.sfx } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function burstNoise(dur, peak, { type = "bandpass", f = 1000, to, q = 1, attack = 0.004, at = 0, brown = false, out = bus.sfx } = {}) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = brown ? noise.brown : noise.white;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(f, t);
  if (to) filt.frequency.exponentialRampToValueAtTime(to, t + dur);
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  s.connect(filt).connect(g).connect(out);
  s.start(t, Math.random());
  s.stop(t + attack + dur + 0.05);
}

const marimba = (midi, peak = 0.22, at = 0) => {
  tone("sine", mtof(midi), 0.7, peak, { at });
  tone("sine", mtof(midi) * 4, 0.12, peak * 0.25, { at });
};

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

const SHOTS = {
  tick: () => tone("square", 2300, 0.025, 0.04),
  textbox: () => tone("square", 2300, 0.025, 0.04),
  click: () => tone("triangle", 900, 0.05, 0.1, { to: 480 }),
  levitate: () => tone("sine", 520, 0.35, 0.05, { to: 780 }),
  swish: () => burstNoise(0.45, 0.18, { f: 700, to: 2600, q: 1.4, attack: 0.15 }),
  whoosh: () => burstNoise(1.0, 0.32, { f: 260, to: 3600, q: 1.1, attack: 0.45 }),
  burst: () => {
    tone("sine", 130, 0.35, 0.4, { to: 42 });
    burstNoise(0.16, 0.22, { type: "lowpass", f: 1200 });
  },
  pencil: () => burstNoise(rnd(0.03, 0.08), rnd(0.04, 0.09), { type: "highpass", f: rnd(2500, 4500), q: 0.7 }),
  pop: ({ n = 0 } = {}) => {
    tone("sine", 320 + n * 35, 0.14, 0.22, { to: 150 });
    tone("square", 2000, 0.012, 0.03);
  },
  paint: ({ n = 0 } = {}) => marimba(72 + PENTA[n % PENTA.length]),
  key: () => burstNoise(0.018, rnd(0.08, 0.16), { f: rnd(1700, 3600), q: 3 }),
  snap: () => {
    tone("square", 1500, 0.035, 0.07, { to: 700 });
    burstNoise(0.03, 0.08, { type: "highpass", f: 3000 });
  },
  chime: () => [76, 79, 83, 88].forEach((m, i) => marimba(m, 0.16, i * 0.09)),
  thunk: () => {
    tone("sine", 110, 0.4, 0.6, { to: 38 });
    burstNoise(0.12, 0.3, { type: "lowpass", f: 650 });
  },
  clank: () => {
    tone("triangle", rnd(780, 860), 0.07, 0.05);
    tone("triangle", rnd(1280, 1380), 0.05, 0.035);
  },
  door: () => {
    burstNoise(0.85, 0.16, { f: 450, to: 950, q: 2, attack: 0.2 });
    tone("sine", 140, 0.18, 0.18, { at: 0.85, to: 80 });
  },
  step: () => {
    burstNoise(0.09, 0.22, { type: "lowpass", f: 380, brown: true });
    tone("sine", 72, 0.08, 0.12);
  },
  clack: () => {
    burstNoise(0.05, 0.14, { type: "lowpass", f: 700 });
    burstNoise(0.05, 0.1, { type: "lowpass", f: 600, at: 0.13 });
  },
  user: () => tone("square", rnd(2400, 3400), 0.014, rnd(0.015, 0.035)),
  success: () => {
    [62, 66, 69, 74].forEach((m) => tone("triangle", mtof(m), 1.6, 0.06, { attack: 0.05 }));
    SHOTS.chime();
  },
};

/** Fire a one-shot effect by name. */
export function sfx(name, opts) {
  if (!enabled || !ctx) return;
  SHOTS[name]?.(opts);
}

// ---------------------------------------------------------------------------
// scenes: ambience levels + pad chord per scene
// ---------------------------------------------------------------------------
const SCENES = {
  //            ambience levels                                      pad chord (midi)
  intro: { beds: { hum: 0.5, wind: 0.12 }, chord: [50, 53, 57, 64] },            // Dm9
  arrival: { beds: { wind: 0.45, hum: 0.25, rumble: 0.18, city: 0.2 }, chord: [46, 50, 53, 57] },  // Bbmaj7
  workshop: { beds: { rumble: 0.6, hum: 0.25 }, chord: [43, 46, 50, 57] },       // Gm9
  idea: { beds: { hum: 0.14 }, chord: [41, 45, 48, 52] },                         // Fmaj7
  design: { beds: { hum: 0.18 }, chord: [45, 48, 52, 55] },                       // Am7
  build: { beds: { hum: 0.22 }, chord: [50, 53, 57, 60] },                        // Dm7
  automate: { beds: { conveyor: 0.5, hum: 0.18 }, chord: [43, 46, 50, 53] },     // Gm7
  launch: { beds: { wind: 0.6, city: 0.3 }, chord: [46, 50, 53, 60] },           // Bbmaj9
  scale: { beds: { hum: 0.25, wind: 0.08 }, chord: [50, 54, 57, 64] },           // Dmaj9: resolves
  sections: { beds: {}, chord: [50, 54, 57, 61], quiet: true },
};
let currentScene = null;
const sceneLevels = {};

export const audio = {
  /** Cross-fade ambience and move the pad to this scene's chord. */
  scene(id) {
    if (!ctx || id === currentScene || !SCENES[id]) return;
    currentScene = id;
    const cfg = SCENES[id];
    const t = ctx.currentTime;
    for (const name of Object.keys(beds)) {
      sceneLevels[name] = cfg.beds[name] || 0;
      beds[name].gain.setTargetAtTime(sceneLevels[name], t, 0.8);
    }
    pad.voices.forEach(({ o, i }) => o.frequency.setTargetAtTime(mtof(cfg.chord[i]), t, 1.2));
    pad.gain.gain.setTargetAtTime(cfg.quiet ? 0.45 : 0.9, t, 1.5);
  },
  /** Scale a bed relative to the scene's level (e.g. wind with speed), or set a rate channel. */
  bed(name, mult) {
    if (!ctx || !beds[name]) return;
    beds[name].gain.setTargetAtTime((sceneLevels[name] || 0) * mult, ctx.currentTime, 0.15);
  },
  rate(name, perSecond) {
    rates[name] = { r: perSecond, acc: rates[name]?.acc || 0 };
  },
  /** Engine tone for hold-to-speed-up, 0..1. Like rates, it lasts one frame. */
  boost(level) {
    boostLevel = level;
  },
  /** Called every frame: fires rate-based effects (pencil grains, typing, clicks...). Rates last one frame. */
  tick(dt) {
    if (ctx && boostLevel !== boostApplied) {
      const t = ctx.currentTime;
      boost.gain.gain.setTargetAtTime(boostLevel * 0.06, t, 0.08);
      boost.osc.frequency.setTargetAtTime(180 + boostLevel * 220, t, 0.25);
      boost.filter.frequency.setTargetAtTime(500 + boostLevel * 1500, t, 0.25);
      boostApplied = boostLevel;
    }
    boostLevel = 0;
    for (const [name, ch] of Object.entries(rates)) {
      if (enabled && ctx && ch.r) {
        ch.acc += ch.r * dt * rnd(0.6, 1.4);
        for (let n = 0; ch.acc >= 1 && n < 4; n++) {
          ch.acc -= 1;
          SHOTS[name]?.();
        }
        ch.acc = Math.min(ch.acc, 1);
      }
      ch.r = 0;
    }
  },
  /** For the console: what the sound layer is doing right now. */
  state: () => ({ context: ctx?.state, enabled, scene: currentScene }),
};

// ---------------------------------------------------------------------------
// on / off
// ---------------------------------------------------------------------------
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch {}
  if (on && !ctx) start();
  if (!ctx) return;
  if (on) ctx.resume();
  bus.master.gain.cancelScheduledValues(ctx.currentTime);
  bus.master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.25);
  document.querySelectorAll("#sound").forEach((b) => b.setAttribute("aria-pressed", String(on)));
}

export function isSoundOn() {
  return enabled;
}
