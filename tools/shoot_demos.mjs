// Screenshots every demo in public/demos/demos.json into thumbnails for the Portfolio page.
//
//   node tools/shoot_demos.mjs            only demos without a thumbnail yet
//   node tools/shoot_demos.mjs --all      re-shoot everything
//   node tools/shoot_demos.mjs veloria    re-shoot one (by id)
//
// Drives the installed Chrome headless over the DevTools protocol (no installs): a 1440x900
// desktop view, a real-time wait so intro animations finish (a demo can set "wait" in ms in
// demos.json), then two WebP sizes per demo: public/demos/thumbs/<id>-1200.webp and <id>-600.webp.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "demos", "thumbs");
const demos = JSON.parse(readFileSync(join(ROOT, "public", "demos", "demos.json"), "utf8"));
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));
const W = 1440, H = 900, PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const todo = demos.filter((d) => args.includes("--all") || args.includes(d.id) || (!args.length && !existsSync(join(OUT, `${d.id}-1200.webp`))));
if (!todo.length) process.exit(console.log("All thumbnails exist. Use --all or an id to re-shoot."));
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), "demo-shots-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--mute-audio", "about:blank"], { stdio: "ignore" });

/** Open a tab and return a tiny DevTools client for it. */
async function openTab() {
  for (let i = 0; i < 50; i++) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
      let id = 0;
      const pending = new Map(), listeners = [];
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg), pending.delete(msg.id);
        else listeners.forEach((f) => f(msg));
      };
      const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
      const once = (method) => new Promise((r) => listeners.push((m) => m.method === method && r(m)));
      return { send, once, close: () => fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {}) };
    } catch {
      await sleep(200); // Chrome still starting
    }
  }
  throw new Error("Chrome did not start");
}

try {
  for (const d of todo) {
    const tab = await openTab();
    await tab.send("Page.enable");
    await tab.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const loaded = tab.once("Page.loadEventFired");
    await tab.send("Page.navigate", { url: d.url });
    await Promise.race([loaded, sleep(30000)]);
    await sleep(d.wait ?? 5000); // real time, so intros and fade-ins finish
    for (const w of [1200, 600]) {
      const { result } = await tab.send("Page.captureScreenshot", { format: "webp", quality: 78, clip: { x: 0, y: 0, width: W, height: H, scale: w / W } });
      writeFileSync(join(OUT, `${d.id}-${w}.webp`), Buffer.from(result.data, "base64"));
    }
    await tab.close();
    console.log("shot", d.id);
  }
} finally {
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}
