#!/usr/bin/env node
// M1 browser smoke test: drives headless Chrome over the DevTools Protocol (no deps).
// 1. pnpm --filter @committee-snake/client dev        (serves http://localhost:5173)
// 2. node scripts/smoke/m1.mjs [url] [outDir]          (CHROME_PATH overrides the browser)
// Plays desktop 1366×768, mobile 390×844@3× and reduced-motion; screenshots to outDir.
// Exits 1 on any failed check or console error/warning. Needs the dev-only `window.__cs` hook.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "http://localhost:5173";
// Default to a fresh private dir rather than a predictable shared /tmp path.
const outDir = process.argv[3] ?? mkdtempSync(join(tmpdir(), "cs-smoke-"));
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (line) => process.stdout.write(`${line}\n`);
const failures = [];
const check = (ok, label) => {
  say(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) failures.push(label);
};

// --- Chrome + CDP plumbing ---------------------------------------------------
// Pick a free port up front instead of reading Chrome's DevToolsActivePort file.
const port = await new Promise((resolve, reject) => {
  const srv = createServer().listen(0, "127.0.0.1", () => {
    const { port: p } = srv.address();
    srv.close(() => resolve(p));
  });
  srv.on("error", reject);
});
const profile = mkdtempSync(join(tmpdir(), "cs-chrome-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--mute-audio",
  ],
  { stdio: "ignore" },
);
const cleanup = () => {
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
};

async function waitForDevtools() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return;
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  throw new Error(`Chrome did not start (${chromePath})`);
}

async function connect() {
  await waitForDevtools();
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(`${data.error.message}`));
      else resolve(data.result);
    } else if (data.method) {
      for (const fn of listeners) fn(data.method, data.params);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, on: (fn) => listeners.push(fn), close: () => ws.close() };
}

// --- helpers on top of CDP ---------------------------------------------------
const evaluate = async (cdp, expression) => {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
const cs = (cdp) =>
  evaluate(
    cdp,
    `(() => { const c = window.__cs; if (!c) return null; return { phase: c.phase, tick: c.tick, alive: c.alive,
      score: c.score, layout: c.layout, canvas: c.canvas, audioState: c.audioState, muted: c.muted,
      motion: c.motion, soundsPlayed: c.soundsPlayed }; })()`,
  );
async function waitFor(cdp, label, pred, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = await cs(cdp);
    if (s && pred(s)) return s;
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(await cs(cdp))}`);
}
const KEYS = {
  Enter: { code: "Enter", vk: 13 },
  ArrowUp: { code: "ArrowUp", vk: 38 },
  a: { code: "KeyA", vk: 65 },
  8: { code: "Digit8", vk: 56 },
  6: { code: "Numpad6", vk: 102 },
};
async function press(cdp, key) {
  const { code, vk } = KEYS[key];
  // Windows codes only: on macOS a native code of 13 is a different key and hides the headless tab.
  const base = { key, code, windowsVirtualKeyCode: vk };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}
async function tap(cdp, dataKey) {
  const r = await evaluate(
    cdp,
    `(() => { const b = document.querySelector('[data-key="${dataKey}"]')?.getBoundingClientRect();
      return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()`,
  );
  if (!r) throw new Error(`no keypad button [data-key="${dataKey}"]`);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [r] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
async function shot(cdp, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  say(`  shot ${file}`);
}

// --- scenarios ---------------------------------------------------------------
const SCENARIOS = [
  { name: "desktop-1366x768", width: 1366, height: 768, dpr: 1, mobile: false, reduced: false },
  { name: "mobile-390x844", width: 390, height: 844, dpr: 3, mobile: true, reduced: false },
  {
    name: "desktop-reduced-motion",
    width: 1366,
    height: 768,
    dpr: 1,
    mobile: false,
    reduced: true,
  },
];

async function play(cdp, sc, problems) {
  say(`\n${sc.name}`);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: sc.width,
    height: sc.height,
    deviceScaleFactor: sc.dpr,
    mobile: sc.mobile,
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: sc.mobile,
    maxTouchPoints: sc.mobile ? 5 : 1,
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: sc.reduced ? "reduce" : "no-preference" }],
  });
  const before = problems.length;
  // Fresh storage per scenario so a persisted mute from one run can't leak into the next.
  await cdp.send("Storage.clearDataForOrigin", {
    origin: new URL(url).origin,
    storageTypes: "local_storage",
  });
  await cdp.send("Page.navigate", { url });
  await waitFor(cdp, "lobby", (s) => s.phase === "lobby");
  await evaluate(cdp, "document.fonts.ready.then(() => true)");
  await sleep(400);
  await shot(cdp, `${sc.name}-1-lobby`);

  const vote = (k) => (sc.mobile ? tap(cdp, k) : press(cdp, k));
  if (sc.mobile) await tap(cdp, "2");
  else await press(cdp, "Enter");
  await waitFor(cdp, "playing", (s) => s.phase === "playing", 10_000);
  // Head starts mid-board heading right: up, left, down, right stays well inside the walls.
  const plan = sc.mobile ? ["2", "4", "8", "6"] : ["ArrowUp", "a", "8", "6"];
  for (const k of plan) {
    const t = (await cs(cdp)).tick;
    await vote(k);
    await waitFor(cdp, `tick ${t + 2}`, (s) => s.tick >= t + 2 || !s.alive);
  }
  const mid = await waitFor(cdp, "10 ticks", (s) => s.tick >= 10);
  check(mid.alive, `alive after ${mid.tick} ticks (score ${mid.score})`);
  await shot(cdp, `${sc.name}-2-playing`);

  const { layout: l, canvas: c } = mid;
  check(
    [l.dot, l.gap, l.pitch, l.widthDev, l.heightDev].every(Number.isInteger),
    `integer layout ${JSON.stringify(l)}`,
  );
  check(
    c.width === l.widthDev && c.height === l.heightDev,
    `backing store ${c.width}×${c.height} = layout`,
  );
  check(
    Math.abs(c.clientWidth * sc.dpr - c.width) <= sc.dpr,
    `css ${c.clientWidth}px × dpr ${sc.dpr} ≈ ${c.width}`,
  );
  if (sc.mobile) check(mid.muted, "sound off by default on touch");
  else
    check(
      mid.audioState === "running" && mid.soundsPlayed > 0,
      `audio ${mid.audioState}, ${mid.soundsPlayed} sounds`,
    );
  const m = mid.motion;
  if (sc.reduced) check(!m.shimmer && !m.ramp && !m.ghost, `reduced motion: ${JSON.stringify(m)}`);
  else check(m.shimmer && m.ramp && m.ghost, `motion on: ${JSON.stringify(m)}`);

  await waitFor(cdp, "game over", (s) => s.phase === "over", 30_000);
  await sleep(300);
  await shot(cdp, `${sc.name}-3-over`);
  check(problems.length === before, `no console errors/warnings (${problems.length - before})`);
}

const problems = [];
try {
  mkdirSync(outDir, { recursive: true });
  const cdp = await connect();
  cdp.on((method, p) => {
    if (method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(p.type))
      problems.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(" ")}`);
    if (method === "Runtime.exceptionThrown")
      problems.push(
        `exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`,
      );
    if (method === "Log.entryAdded" && ["error", "warning"].includes(p.entry.level))
      problems.push(`log.${p.entry.level}: ${p.entry.text} ${p.entry.url ?? ""}`);
  });
  for (const domain of ["Page", "Runtime", "Log"]) await cdp.send(`${domain}.enable`);
  for (const sc of SCENARIOS) await play(cdp, sc, problems);
  for (const p of problems) say(`  ! ${p}`);
  cdp.close();
} catch (err) {
  failures.push(String(err));
  say(`  FAIL ${err}`);
} finally {
  cleanup();
}
say(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
