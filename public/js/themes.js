// Colour schemes. Scenes and textures are authored in the Crimson palette; every colour
// passes through themeColor(), which swaps it for the active theme's equivalent.
// Default: Blueprint. Switch with the theme button (or ?theme=crimson); the choice is remembered.

export const THEMES = {
  blueprint: {
    label: "Blueprint",
    map: {
      "#111013": "#0b1626", // ink -> navy black
      "#efe9dd": "#f2ede2", // paper
      "#f6f0e2": "#f4efe5",
      "#f3eee3": "#f4efe5",
      "#fbf7ee": "#f7f3ea",
      "#e9e2d3": "#e4dfd4",
      "#e7d2b6": "#e9dcc6",
      "#b5161e": "#2451a6", // accent surfaces -> blueprint blue
      "#c22027": "#2b5cb8",
      "#d43a2f": "#3a6cc8",
      "#6e0b10": "#132c5c", // deep accent -> deep blue
      "#7d1016": "#1a3a75",
      "#5b0d10": "#10264f",
      "#5c080c": "#0f2147",
      "#3a0507": "#0b1a38",
      "#2a0405": "#081430",
      "#1a0203": "#060f24",
      "#120102": "#050c1d",
      "#a3171d": "#1f4796",
      "#c7a25c": "#ff6b2c", // brass -> signal orange
      "#3b2c12": "#5a2208",
      "#e0b43c": "#ffb703",
      "#e9c46a": "#ffd166",
      "#d9796f": "#ff8fa3",
      "#2b272a": "#16233a", // dark greys -> navy greys
      "#1c1a1c": "#0f1a2c",
      "#3a3538": "#22324d",
      "#e8432f": "#ff6b2c",
      "#ffcf7a": "#ffd166",
      "#9fb6d8": "#9fd3ff",
      "#1a0d0f": "#081226",
    },
  },
  crimson: { label: "Crimson", map: {} },
};

const KEY = "ruddix-theme";

function pick() {
  const q = new URLSearchParams(location.search).get("theme");
  if (q && THEMES[q]) return q;
  try {
    const s = localStorage.getItem(KEY);
    if (s && THEMES[s]) return s;
  } catch {}
  return "blueprint";
}

export const THEME = pick();
document.documentElement.dataset.theme = THEME;
const MAP = THEMES[THEME].map;

/** Swap a Crimson-palette colour for the active theme's colour (unknown colours pass through). */
export function themeColor(c) {
  if (typeof c !== "string") return c;
  return MAP[c.toLowerCase()] || c;
}

export function setTheme(name) {
  try { localStorage.setItem(KEY, name); } catch {}
}

export function nextTheme() {
  const names = Object.keys(THEMES);
  return names[(names.indexOf(THEME) + 1) % names.length];
}
