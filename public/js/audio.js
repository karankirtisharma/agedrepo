// Sound for the whole site, from recorded CC0 / CC-BY effects in /sfx (credits: sfx/CREDITS.txt):
//  - ambience loops (wind, train, city, conveyor) cross-faded per scene
//  - one-shot effects (doors, footsteps, pencil, paper drops, keys, metal, whooshes...)
// Nothing loads or plays until the visitor turns sound on (a click, so browsers allow audio).

let ctx = null;
let enabled = false;
const bus = {};
const beds = {}; // loop name -> { gain, src }
const buffers = {}; // sample name -> [AudioBuffer variants]
const rates = {}; // continuous "events per second" channels (pencil, typing, clicks...)
let boostLevel = 0, boostApplied = 0;

const KEY = "ruddix-sound";
export function soundPreference() {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

const rnd = (a, b) => a + Math.random() * (b - a);

// sample name -> number of variants (files are sfx/<name>.mp3, or sfx/<name>-1.mp3 ... when > 1)
const SAMPLES = {
  click: 1, caption: 1, rise: 1, swish: 3, dive: 2, burst: 1, pencil: 5, pop: 4, note: 1, key: 6,
  snap: 3, chime: 1, success: 1, thunk: 2, gear: 2, "door-open": 1, "door-close": 1, step: 5, carpet: 5, user: 1,
};
const LOOPS = ["wind", "train", "city", "conveyor", "boost"];

async function load(name, count) {
  const files = count === 1 ? [`sfx/${name}.mp3`] : Array.from({ length: count }, (_, i) => `sfx/${name}-${i + 1}.mp3`);
  buffers[name] = await Promise.all(files.map(async (f) => ctx.decodeAudioData(await (await fetch(f)).arrayBuffer())));
}

function start() {
  ctx = new AudioContext();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.ratio.value = 6;
  limiter.connect(ctx.destination);
  bus.master = ctx.createGain();
  bus.master.gain.value = 0;
  bus.master.connect(limiter);
  for (const [k, v] of Object.entries({ amb: 0.6, sfx: 0.8 })) {
    bus[k] = ctx.createGain();
    bus[k].gain.value = v;
    bus[k].connect(bus.master);
  }
  // loops start silent and keep running; scenes only move their gain (and speed)
  for (const name of LOOPS) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(name === "boost" ? bus.sfx : bus.amb);
    beds[name] = { gain, src: null };
    load(name, 1).then(() => {
      const src = ctx.createBufferSource();
      src.buffer = buffers[name][0];
      src.loop = true;
      src.connect(gain);
      src.start(0, Math.random() * src.buffer.duration);
      beds[name].src = src;
    }).catch((e) => console.warn("sound not loaded:", name, e));
  }
  for (const [name, count] of Object.entries(SAMPLES)) load(name, count).catch((e) => console.warn("sound not loaded:", name, e));
}

/** Play one variant of a sample. */
function play(name, { vol = 0.5, rate = 1, pick } = {}) {
  const list = buffers[name];
  if (!list?.length) return;
  const src = ctx.createBufferSource();
  src.buffer = list[pick ?? Math.floor(Math.random() * list.length)];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(bus.sfx);
  src.start();
}

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

// effect names used around the site -> which sample, how loud, how pitched
const SHOTS = {
  click: () => play("click", { vol: 0.5 }),
  textbox: () => play("caption", { vol: 0.3 }),
  tick: () => play("user", { vol: 0.08, rate: rnd(1.5, 1.8) }),
  levitate: () => play("rise", { vol: 0.3 }),
  swish: () => play("swish", { vol: 0.45, rate: rnd(0.9, 1.05) }),
  whoosh: () => play("dive", { vol: 0.75, rate: rnd(0.78, 0.88) }),
  burst: () => play("burst", { vol: 0.5 }),
  pencil: () => play("pencil", { vol: rnd(0.15, 0.25), rate: rnd(0.9, 1.25) }),
  pop: ({ n = 0 } = {}) => play("pop", { vol: 0.4, pick: n % 4, rate: 1 + n * 0.03 }),
  paint: ({ n = 0 } = {}) => play("note", { vol: 0.4, rate: Math.pow(2, PENTA[n % PENTA.length] / 12) }),
  key: () => play("key", { vol: rnd(0.15, 0.25), rate: rnd(0.9, 1.15) }),
  snap: () => play("snap", { vol: 0.35, rate: rnd(0.95, 1.1) }),
  chime: () => play("chime", { vol: 0.45 }),
  thunk: () => play("thunk", { vol: 0.45, rate: rnd(0.9, 1.0) }),
  clank: () => play("gear", { vol: 0.12, rate: rnd(0.9, 1.25) }),
  door: () => play("door-open", { vol: 0.6 }),
  doorClose: () => play("door-close", { vol: 0.5 }),
  step: () => play("step", { vol: 0.4, rate: rnd(0.92, 1.05) }),
  carpet: () => play("carpet", { vol: 0.45, rate: rnd(0.92, 1.05) }),
  user: () => play("user", { vol: rnd(0.06, 0.14), rate: rnd(0.8, 1.4) }),
  success: () => play("success", { vol: 0.55 }),
};

/** Fire a one-shot effect by name. */
export function sfx(name, opts) {
  if (!enabled || !ctx) return;
  SHOTS[name]?.(opts);
}

// ---------------------------------------------------------------------------
// scenes: ambience levels per scene
// ---------------------------------------------------------------------------
const SCENES = {
  intro: { city: 0.12 },
  arrival: { wind: 0.35, city: 0.4, train: 0.2 },
  workshop: { train: 0.8 },
  idea: { city: 0.06 },
  design: { city: 0.06 },
  build: { city: 0.06 },
  automate: { conveyor: 0.55 },
  launch: { wind: 0.7, city: 0.25 },
  scale: { city: 0.25, wind: 0.1 },
  sections: {},
};
let currentScene = null;
const sceneLevels = {};

export const audio = {
  /** Cross-fade the ambience loops to this scene's mix. */
  scene(id) {
    if (!ctx || id === currentScene || !SCENES[id]) return;
    currentScene = id;
    const t = ctx.currentTime;
    for (const name of LOOPS) {
      if (name === "boost") continue;
      sceneLevels[name] = SCENES[id][name] || 0;
      beds[name].gain.gain.setTargetAtTime(sceneLevels[name], t, 0.8);
    }
  },
  /** Scale a loop relative to the scene's level (e.g. wind with speed), optionally changing its speed. */
  bed(name, mult, speed) {
    if (!ctx || !beds[name]) return;
    const t = ctx.currentTime;
    beds[name].gain.gain.setTargetAtTime((sceneLevels[name] || 0) * mult, t, 0.15);
    if (speed && beds[name].src) beds[name].src.playbackRate.setTargetAtTime(speed, t, 0.2);
  },
  rate(name, perSecond) {
    rates[name] = { r: perSecond, acc: rates[name]?.acc || 0 };
  },
  /** Engine loop for hold-to-speed-up, 0..1. Like rates, it lasts one frame. */
  boost(level) {
    boostLevel = level;
  },
  /** Called every frame: fires rate-based effects (pencil, typing, clicks...). Rates last one frame. */
  tick(dt) {
    if (ctx && boostLevel !== boostApplied) {
      const t = ctx.currentTime, b = beds.boost;
      b.gain.gain.setTargetAtTime(boostLevel * 0.5, t, 0.1);
      b.src?.playbackRate.setTargetAtTime(0.8 + boostLevel * 0.6, t, 0.25);
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
  state: () => ({ context: ctx?.state, enabled, scene: currentScene, loaded: Object.keys(buffers).length }),
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
