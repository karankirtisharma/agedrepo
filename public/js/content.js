// All editable copy, links and story timing live here.
// PLACEHOLDER values are marked: swap them for real ones before launch.
// Words wrapped in *asterisks* are highlighted red in story captions.

export const BRAND = {
  name: "Ruddix",
  sub: "Studio",
  tagline: "Websites people remember. Systems that run themselves.",
  kicker: "Creative web · Automation · SaaS",
  email: "karankirti.work@gmail.com",            // swap for a studio address when you have one
  booking: "https://cal.com/",                    // PLACEHOLDER booking link
  instagram: "https://www.instagram.com/",        // PLACEHOLDER
  linkedin: "https://www.linkedin.com/",          // PLACEHOLDER
  x: "https://x.com/",                            // PLACEHOLDER
  notion: "https://www.notion.so/",               // PLACEHOLDER: Notion page with the 50+ demos
  demoCount: "50+",
};

// Story scenes in scroll order. `length` = how long the scene stays pinned, in viewport heights.
// Captions show while the scene's local progress is between `from` and `to` (0..1).
// x / y / w are fractions of the viewport (phones stack captions automatically).
// The story follows Ruddix's workflow: Idea, Design, Build, Automate, Launch, Scale.
// The main character is the cursor.
export const STORY = [
  // gap: 0 = no dive; the intro's caret opens straight onto the Arrival scene
  { id: "intro", length: 1.5, gap: 0, captions: [] },
  {
    id: "arrival",
    length: 2.6,
    captions: [
      { from: 0.06, to: 0.42, x: 0.52, y: 0.1, w: 0.42, text: "Midnight. One idea, no team, and a launch date that *won't move*." },
      { from: 0.48, to: 0.9, x: 0.05, y: 0.66, w: 0.38, text: "Then the studio doors slide open. *Someone's still working.*" },
    ],
  },
  {
    id: "workshop",
    length: 2.8,
    captions: [
      { from: 0.1, to: 0.48, x: 0.52, y: 0.64, w: 0.42, text: "A studio on rails that never really *closes*." },
      { from: 0.56, to: 0.95, x: 0.06, y: 0.1, w: 0.4, text: "At the far end, three tools on the bench. *Sketch it. Build it. Ship it.*" },
    ],
  },
  {
    id: "idea",
    length: 2.6,
    step: "01 Idea",
    captions: [
      { from: 0.06, to: 0.46, x: 0.05, y: 0.08, w: 0.4, text: "Every launch starts the same way: a *scribble* on the back of something." },
      { from: 0.52, to: 0.95, x: 0.54, y: 0.68, w: 0.4, text: "Bring us the rough version. We'll find the *story* in it." },
    ],
  },
  {
    id: "design",
    length: 2.6,
    step: "02 Design",
    captions: [
      { from: 0.08, to: 0.46, x: 0.05, y: 0.1, w: 0.38, text: "Lines become *layouts*." },
      { from: 0.52, to: 0.95, x: 0.55, y: 0.7, w: 0.4, text: "Layouts become something you can *click*. Move your mouse: it moves back." },
    ],
  },
  {
    id: "build",
    length: 2.4,
    step: "03 Build",
    hold: { from: 0.1, to: 0.92, label: "Hold to build" },
    captions: [
      { from: 0.1, to: 0.5, x: 0.55, y: 0.1, w: 0.38, text: "Press and *hold* to build." },
      { from: 0.62, to: 0.95, x: 0.55, y: 0.1, w: 0.38, text: "Front end, back end, motion. *Compiled* and clean." },
    ],
  },
  {
    id: "automate",
    length: 2.6,
    step: "04 Automate",
    hold: { from: 0.12, to: 0.9, label: "Hold to speed up" },
    captions: [
      { from: 0.1, to: 0.5, x: 0.05, y: 0.08, w: 0.4, text: "Busywork goes in one end." },
      { from: 0.52, to: 0.92, x: 0.05, y: 0.08, w: 0.4, text: "Finished work comes out the other. *Nobody touches it twice.*" },
    ],
  },
  {
    id: "launch",
    length: 2.6,
    step: "05 Launch",
    hold: { from: 0.12, to: 0.9, label: "Hold to boost" },
    captions: [
      { from: 0.1, to: 0.6, x: 0.05, y: 0.1, w: 0.4, text: "Fold it. Aim it. *Ship it.*" },
    ],
  },
  {
    id: "scale",
    length: 2.6,
    step: "06 Scale",
    captions: [
      { from: 0.1, to: 0.5, x: 0.05, y: 0.1, w: 0.4, text: "Then a thousand people show up at once." },
      { from: 0.55, to: 0.95, x: 0.55, y: 0.74, w: 0.38, text: "*It holds.* That's the whole point." },
    ],
  },
];

// Counter shown during the automate scene
export const SAVED = { label: "Hours saved", to: 1240 };

// Numbers that count up during the launch scene
export const METRICS = [
  { label: "Visitors", to: 128400, suffix: "" },
  { label: "Leads", to: 3912, suffix: "" },
  { label: "Uptime", to: 99.98, suffix: "%", decimals: 2 },
];

export const MANIFESTO = {
  headline: ["Built to be", "remembered"],
  left: "A creative web studio for brands that refuse to blend in",
  right: "Front end, back end, and everything that runs between",
  center: "Est. after midnight",
  body: "Ruddix designs and builds websites people talk about, automations that quietly save hours every week, and SaaS products from the first sketch to the last deploy.",
};

// Service hierarchy: the first is the lead offer. `model` picks the 3D object.
export const SERVICES = [
  {
    model: "web",
    name: "Creative web development",
    line: "Story-driven websites with WebGL, motion and the craft to back it up.",
    tags: ["WebGL & 3D", "Scroll stories", "Next.js / Nuxt", "CMS"],
  },
  {
    model: "automation",
    name: "Automation",
    line: "Workflows, integrations and AI agents that do the busywork for you.",
    tags: ["n8n / Make", "CRM sync", "AI agents", "Internal tools"],
  },
  {
    model: "saas",
    name: "SaaS products",
    line: "Front end and back end, from MVP to the version your customers pay for.",
    tags: ["Product design", "APIs & databases", "Auth & billing", "Dashboards"],
  },
];
export const EXTRA_SERVICE = { name: "Motion graphics", line: "Optional add-on: launch films, product loops and animated brand systems." };

export const PROCESS = [
  { model: "web", title: ["Discover", "& design"], body: "One call to understand the goal. Then a direction, a story and screens you can click through within days." },
  { model: "automation", title: ["Build", "& automate"], body: "Front end, back end and the automations around them, built in short loops so you see progress every week." },
  { model: "saas", title: ["Launch", "& scale"], body: "We ship, measure and keep going: performance, analytics and the next feature on the list." },
];

// Work page. PLACEHOLDER projects: replace names, copy, links and art.
export const PROJECTS = [
  { name: "Nightfall Atlas", type: "Immersive travel story", tags: ["Web", "WebGL", "Motion"], result: "A scroll-driven 3D journey across six cities.", year: "2026", url: "https://example.com/nightfall", color: "#b5161e", art: "web" },
  { name: "Ledgerline", type: "SaaS for freelancers", tags: ["SaaS", "Front end", "Back end"], result: "Invoicing and cash-flow dashboard, MVP to paid in 10 weeks.", year: "2026", url: "https://example.com/ledgerline", color: "#111013", art: "saas" },
  { name: "Orbit Ops", type: "Automation suite", tags: ["Automation", "AI agents"], result: "Lead routing and CRM sync that saves a sales team 20 hours a week.", year: "2025", url: "https://example.com/orbit-ops", color: "#c7a25c", art: "automation" },
  { name: "Halcyon Spirits", type: "Ink-style brand story", tags: ["Web", "3D", "Motion"], result: "A comic-book WebGL story with hold-to-pour interactions.", year: "2026", url: "https://example.com/halcyon", color: "#6e0b10", art: "web" },
];
