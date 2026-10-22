import * as THREE from "three";

// Shared palette
const col = (hex) => new THREE.Color(hex);
export const PALETTE = {
  paper: col("#efe9dd"),
  ink: col("#111013"),
  red: col("#b5161e"),
  redDark: col("#6e0b10"),
  brass: col("#c7a25c"),
};

const shared = {
  uHatch: { value: null },   // wavy vertical line texture (textures/hatch.png)
  uNoise: { value: null },   // soft noise for rough tone edges
  uTime: { value: 0 },
  uLightDir: { value: new THREE.Vector3(0.45, 0.8, 0.5).normalize() },
};

export function setInkTextures({ hatch, noise }) {
  for (const t of [hatch, noise]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  shared.uHatch.value = hatch;
  shared.uNoise.value = noise;
}

export function tickInk(time) {
  shared.uTime.value = time;
}

const inkVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    #ifdef USE_INSTANCING
      world = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    #else
      vNormalW = normalize(mat3(modelMatrix) * normal);
    #endif
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const inkFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uShade;
  uniform vec3 uInk;
  uniform sampler2D uHatch;
  uniform sampler2D uNoise;
  uniform sampler2D uMap;
  uniform float uUseMap;
  uniform float uHatchScale;
  uniform float uHatchAngle;
  uniform float uLit;          // raises the tone (1 = fully lit, ignores light)
  uniform float uOpacity;
  uniform float uRim;          // 1 = draw an ink rim at grazing angles (used for glass instead of a hull outline)
  uniform vec3 uLightDir;
  uniform float uTime;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;

  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    if (uRim > 0.5) {
      float fr = 1.0 - abs(dot(n, normalize(cameraPosition - vPosW)));
      if (fr > 0.8) { gl_FragColor = vec4(uInk, 1.0); return; }
      if (fr > 0.6) { gl_FragColor = vec4(uColor, uOpacity + 0.35); return; }
    }
    float ndl = dot(n, normalize(uLightDir));
    float tone = mix(ndl * 0.5 + 0.5, 1.0, uLit);

    // Rough, hand-drawn tone edges: jitter the thresholds with noise that "boils" slowly
    float boil = floor(uTime * 6.0) * 0.137;
    float jitter = texture2D(uNoise, gl_FragCoord.xy / 420.0 + boil).r - 0.5;
    tone += jitter * 0.12;

    // Screen-space hatch lines, rotated per material
    float c = cos(uHatchAngle), s = sin(uHatchAngle);
    vec2 hp = mat2(c, -s, s, c) * gl_FragCoord.xy / uHatchScale;
    float line = texture2D(uHatch, hp).r;

    vec3 base = uColor;
    if (uUseMap > 0.5) base *= texture2D(uMap, vUv).rgb;

    vec3 col;
    if (tone > 0.62) {
      col = base;
    } else if (tone > 0.34) {
      // mid tones: line density follows the tone
      float k = smoothstep(0.34, 0.62, tone);
      col = mix(uShade, base, step(1.0 - k * 0.9, line));
    } else {
      // shadows: mostly ink with sparse light lines
      col = mix(uInk, uShade, step(0.92, line) * smoothstep(0.1, 0.34, tone));
    }
    gl_FragColor = vec4(col, uOpacity);
  }
`;

/**
 * Ink material. `color` = lit colour, `shade` = colour of hatch strokes / mid tone.
 */
export function inkMaterial({ color = "#efe9dd", shade, ink = "#111013", hatchScale = 2.2, hatchAngle = 0, lit = 0, map = null, opacity = 1, rim = 0, side = THREE.FrontSide } = {}) {
  // a textured surface keeps its colour white so the map shows as drawn
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  return new THREE.ShaderMaterial({
    vertexShader: inkVertex,
    fragmentShader: inkFragment,
    side,
    transparent: opacity < 1,
    uniforms: {
      ...shared,
      uColor: { value: c },
      uShade: { value: shade ? new THREE.Color(shade) : new THREE.Color(ink) },
      uInk: { value: new THREE.Color(ink) },
      uMap: { value: map },
      uUseMap: { value: map ? 1 : 0 },
      uHatchScale: { value: hatchScale * 256 },
      uHatchAngle: { value: hatchAngle },
      uLit: { value: lit },
      uOpacity: { value: opacity },
      uRim: { value: rim },
    },
  });
}

/** Material for clear glass: faint fill plus an ink rim; skip hull outlines on these meshes. */
export function glassMaterial(mesh, { color = "#fbf7ee", opacity = 0.16 } = {}) {
  mesh.material = inkMaterial({ color, lit: 1, opacity, rim: 1, side: THREE.DoubleSide });
  mesh.material.depthWrite = false;
  mesh.userData.noOutline = true;
  mesh.renderOrder = 2;
  return mesh.material;
}

// Inverted hull outline: back faces pushed out along the normal, drawn solid ink.
const outlineMat = (width, color) =>
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uWidth: { value: width }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        vec3 p = position + normal * uWidth;
        #ifdef USE_INSTANCING
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        #else
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        #endif
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
  });

/** Add an ink outline to every mesh under `root`. Width is in object units. */
export function addOutline(root, width = 0.01, color = "#111013") {
  const meshes = [];
  root.traverse((o) => o.isMesh && !o.userData.isOutline && !o.userData.noOutline && meshes.push(o));
  for (const m of meshes) {
    const Ctor = m.isInstancedMesh ? THREE.InstancedMesh : THREE.Mesh;
    const outline = m.isInstancedMesh ? new Ctor(m.geometry, outlineMat(width, color), m.count) : new Ctor(m.geometry, outlineMat(width, color));
    if (m.isInstancedMesh) outline.instanceMatrix = m.instanceMatrix;
    outline.userData.isOutline = true;
    outline.renderOrder = -1;
    m.add(outline);
  }
  return root;
}

/** Apply ink materials to a loaded model. `byName` maps mesh-name prefixes to material options. */
export function inkify(root, byName = {}, fallback = {}) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    const key = Object.keys(byName).find((k) => o.name.startsWith(k));
    o.material = inkMaterial(key ? byName[key] : fallback);
  });
  return root;
}

/** Flat full-screen-ish backdrop plane with a vertical gradient and grain. */
export function backdrop({ top = "#111013", bottom = "#111013", grain = 0.06 } = {}) {
  return new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: { ...shared, uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) }, uGrain: { value: grain } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uBottom; uniform float uGrain; uniform sampler2D uNoise; uniform float uTime;
      varying vec2 vUv;
      void main(){
        vec3 c = mix(uBottom, uTop, vUv.y);
        float g = texture2D(uNoise, gl_FragCoord.xy / 256.0 + floor(uTime * 8.0) * 0.31).r - 0.5;
        gl_FragColor = vec4(c + g * uGrain, 1.0);
      }
    `,
  });
}

export function backdropMesh(opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdrop(opts));
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

export const sharedUniforms = shared;
