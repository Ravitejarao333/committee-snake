#!/usr/bin/env node
// Client browser smoke test: drives headless Chrome over the DevTools Protocol (no deps).
// 1. pnpm --filter @committee-snake/client dev        (serves http://localhost:5173)
// 2. node scripts/smoke/client.mjs [url] [outDir]      (CHROME_PATH overrides the browser)
// Solo rounds at 1366×768, 390×844@3× and reduced motion, then a 3-seat hot-seat round at both
// sizes: bars, Blame Screen, share PNG and copy. Screenshots and the PNG go to outDir.
// Exits 1 on any failed check or console error/warning. Needs the dev-only `window.__cs` hook.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** One CDP session over a WebSocket: `send(method, params)` plus an event listener list. */
async function open(wsUrl) {
  const ws = new WebSocket(wsUrl);
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

/** A page session, plus a browser session for downloads and permissions. */
async function connect() {
  await waitForDevtools();
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
  ).json();
  return {
    page: await open(target.webSocketDebuggerUrl),
    browser: await open(version.webSocketDebuggerUrl),
  };
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
      motion: c.motion, soundsPlayed: c.soundsPlayed, seats: c.seats, lobbyText: c.lobbyText,
      bars: c.bars, blame: c.blame, blameText: c.blameText, lastShare: c.lastShare,
      lastCopy: c.lastCopy, hidden: document.hidden }; })()`,
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
  ArrowDown: { code: "ArrowDown", vk: 40 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
  w: { code: "KeyW", vk: 87 },
  i: { code: "KeyI", vk: 73 },
  l: { code: "KeyL", vk: 76 },
  s: { code: "KeyS", vk: 83 },
  c: { code: "KeyC", vk: 67 },
  x: { code: "KeyX", vk: 88 },
};
const CTRL = 2;
async function press(cdp, key, modifiers = 0) {
  const { code, vk } = KEYS[key];
  // Windows codes only: on macOS a native code of 13 is a different key and hides the headless tab.
  const base = { key, code, windowsVirtualKeyCode: vk, modifiers };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}
async function touchAt(cdp, selector) {
  const r = await evaluate(
    cdp,
    `(() => { const b = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
      return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()`,
  );
  if (!r) throw new Error(`nothing at ${selector}`);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [r] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const tap = (cdp, dataKey) => touchAt(cdp, `[data-key="${dataKey}"]`);
async function shot(cdp, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  say(`  shot ${file}`);
}
/** Width and height from a PNG's IHDR chunk, or null if it isn't a PNG. */
function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.toString("latin1", 1, 4) !== "PNG") return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// --- scenarios ---------------------------------------------------------------
const DESKTOP = { width: 1366, height: 768, dpr: 1, mobile: false };
const MOBILE = { width: 390, height: 844, dpr: 3, mobile: true };
const SCENARIOS = [
  { name: "desktop-1366x768", ...DESKTOP, reduced: false, mode: "solo", share: "download" },
  { name: "mobile-390x844", ...MOBILE, reduced: false, mode: "solo", share: "native" },
  { name: "desktop-reduced-motion", ...DESKTOP, reduced: true, mode: "solo" },
  { name: "hotseat-1366x768", ...DESKTOP, reduced: false, mode: "hotseat", share: "download" },
  { name: "hotseat-390x844", ...MOBILE, reduced: false, mode: "hotseat" },
];

async function load(cdp, sc) {
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
  // Fresh storage per scenario so a persisted mute from one run can't leak into the next.
  await cdp.send("Storage.clearDataForOrigin", {
    origin: new URL(url).origin,
    storageTypes: "local_storage",
  });
  await cdp.send("Page.navigate", { url });
  await waitFor(cdp, "lobby", (s) => s.phase === "lobby");
  await evaluate(cdp, "document.fonts.ready.then(() => true)");
  await sleep(400);
}

function checkLayout(sc, s) {
  const { layout: l, canvas: c } = s;
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
  if (sc.width === 1366) check(l.dot >= 4, `dot ${l.dot} ≥ 4 at 1366×768`);
}

/** Wait for the Blame Screen, give it a moment to reveal, and screenshot it. */
async function blame(cdp, sc) {
  const s = await waitFor(cdp, "blame screen", (x) => x.phase === "blame" && x.blame, 40_000);
  await sleep(400);
  await shot(cdp, `${sc.name}-blame`);
  return s;
}

/** Share from the Blame Screen: `download` (no Web Share) or `native` (stubbed navigator.share). */
async function share(cdp, sc) {
  if (sc.share === "download") {
    await evaluate(cdp, "Object.defineProperty(navigator, 'canShare', { value: undefined }), true");
    const file = join(outDir, "committee-snake-blame.png");
    rmSync(file, { force: true });
    await press(cdp, "s");
    const s = await waitFor(cdp, "share download", (x) => x.lastShare);
    for (let i = 0; i < 40 && !existsSync(file); i++) await sleep(100);
    const size = existsSync(file) ? pngSize(file) : null;
    check(s.lastShare.via === "download", `share fell back to download (${s.lastShare.via})`);
    check(
      size?.w === 1200 && size?.h === 630,
      `downloaded PNG is 1200×630 (${JSON.stringify(size)})`,
    );
    if (size) say(`  png  ${file}`);
    await press(cdp, "c", CTRL);
    const copied = await waitFor(cdp, "copy", (x) => x.lastCopy, 5_000).catch(() => null);
    // Headless may refuse clipboard writes; log it rather than fail the run.
    say(
      `  ${copied?.lastCopy === "ok" ? "ok  " : "note"} Ctrl+C copy: ${copied?.lastCopy ?? "no result"}`,
    );
  } else {
    await evaluate(
      cdp,
      `(() => { navigator.canShare = () => true;
        navigator.share = async (d) => { window.__shared = { n: d.files?.length ?? 0, type: d.files?.[0]?.type }; };
        return true; })()`,
    );
    await press(cdp, "s");
    const s = await waitFor(cdp, "native share", (x) => x.lastShare);
    const shared = await evaluate(cdp, "window.__shared ?? null");
    check(
      s.lastShare.via === "share" && shared?.n === 1 && shared.type === "image/png",
      `native share got one PNG (${JSON.stringify(shared)}, ${s.lastShare.w}×${s.lastShare.h})`,
    );
  }
}

async function solo(cdp, sc) {
  await shot(cdp, `${sc.name}-1-lobby`);
  const vote = (k) => (sc.mobile ? tap(cdp, k) : press(cdp, k));
  if (sc.mobile) {
    await tap(cdp, "2"); // claims P1
    await touchAt(cdp, "#lcd"); // tap the screen to start
  } else await press(cdp, "Enter");
  await waitFor(cdp, "playing", (s) => s.phase === "playing", 10_000);
  // Head starts mid-board heading right: up, left, down, right stays well inside the walls.
  const plan = sc.mobile
    ? ["2", "4", "8", "6"]
    : ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
  for (const k of plan) {
    const t = (await cs(cdp)).tick;
    await vote(k);
    await waitFor(cdp, `tick ${t + 2}`, (s) => s.tick >= t + 2 || !s.alive);
  }
  const mid = await waitFor(cdp, "10 ticks", (s) => s.tick >= 10);
  check(mid.alive, `alive after ${mid.tick} ticks (score ${mid.score})`);
  await shot(cdp, `${sc.name}-2-playing`);
  checkLayout(sc, mid);
  if (sc.mobile) check(mid.muted, "sound off by default on touch");
  else
    check(
      mid.audioState === "running" && mid.soundsPlayed > 0,
      `audio ${mid.audioState}, ${mid.soundsPlayed} sounds`,
    );
  const m = mid.motion;
  const anim = [m.shimmer, m.ramp, m.ghost, m.slide, m.pulse];
  if (sc.reduced)
    check(
      anim.every((x) => x === false),
      `reduced motion: ${JSON.stringify(m)}`,
    );
  else
    check(
      anim.every((x) => x === true),
      `motion on: ${JSON.stringify(m)}`,
    );

  const b = await blame(cdp, sc);
  check(b.blame.solo && b.blame.awards.length === 0, "solo blame: solo, no awards");
  check(
    b.blameText.some((line) => line.includes("YOU DID THIS ALONE")),
    `solo blame text: ${JSON.stringify(b.blameText)}`,
  );
  if (sc.share) await share(cdp, sc);
}

async function hotseat(cdp, sc) {
  // Three seats claim from the lobby: P1 arrows, P2 WASD, P3 IJKL.
  for (const k of ["ArrowUp", "w", "i"]) await press(cdp, k);
  const lobby = await waitFor(cdp, "3 seats", (s) => s.seats?.length === 3);
  check(
    lobby.lobbyText.some((line) => line.includes("3 PLAYERS. PRESS A KEY TO JOIN.")),
    `lobby text: ${JSON.stringify(lobby.lobbyText)}`,
  );
  await shot(cdp, `${sc.name}-1-lobby`);
  await press(cdp, "Enter");
  await waitFor(cdp, "playing", (s) => s.phase === "playing", 10_000);

  // Vote them apart: P1 and P2 up, P3 right. Up wins 2-1 every tick until the top wall.
  const votes = ["ArrowUp", "w", "l"];
  for (const k of votes) await press(cdp, k);
  const split = await waitFor(
    cdp,
    "bars 2-1",
    (s) => s.bars?.counts.U === 2 && s.bars.counts.R === 1,
  );
  check(
    JSON.stringify(split.bars.byDir.U) === '["p1","p2"]' &&
      JSON.stringify(split.bars.byDir.R) === '["p3"]',
    `bars split 2-1: ${JSON.stringify(split.bars)}`,
  );
  await sleep(250);
  await shot(cdp, `${sc.name}-2-bars`);
  checkLayout(sc, split);
  // Re-press inside the 4 s expiry until the snake hits the wall.
  for (let i = 0; i < 20; i++) {
    const s = await cs(cdp);
    if (s.phase !== "playing") break;
    for (const k of votes) await press(cdp, k);
    await sleep(1_200);
  }

  const b = await blame(cdp, sc);
  const r = b.blame;
  check(
    r.cause === "wall" && r.fatalDir === "U" && !r.solo,
    `died into the top wall voting up (${r.cause}, ${r.fatalDir})`,
  );
  check(
    JSON.stringify(r.assassins) === '["p1","p2"]',
    `assassins p1, p2: ${JSON.stringify(r.assassins)}`,
  );
  check(JSON.stringify(r.savers) === '["p3"]', `tried to save it p3: ${JSON.stringify(r.savers)}`);
  const text = b.blameText.join("\n");
  check(
    /ASSASSINS: ARROWS, WASD/.test(text) && /TRIED TO SAVE IT: IJKL/.test(text),
    `blame names the seats: ${JSON.stringify(b.blameText)}`,
  );
  check(r.awards.length >= 1 && r.awards.length <= 3, `${r.awards.length} award(s)`);
  if (sc.share) await share(cdp, sc);

  // Skip back to the lobby (after 1.5 s); seats survive the round.
  await sleep(1_600);
  await press(cdp, "x");
  const back = await waitFor(cdp, "lobby again", (s) => s.phase === "lobby", 5_000);
  check(back.seats?.length === 3, `seats kept in the lobby (${back.seats?.length})`);
}

async function play(cdp, sc, problems) {
  say(`\n${sc.name}`);
  const before = problems.length;
  await load(cdp, sc);
  if (sc.mode === "hotseat") await hotseat(cdp, sc);
  else await solo(cdp, sc);
  check(problems.length === before, `no console errors/warnings (${problems.length - before})`);
}

const problems = [];
try {
  mkdirSync(outDir, { recursive: true });
  const { page: cdp, browser } = await connect();
  await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: outDir });
  await browser.send("Browser.grantPermissions", {
    origin: new URL(url).origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
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
  browser.close();
} catch (err) {
  failures.push(String(err));
  say(`  FAIL ${err}`);
} finally {
  cleanup();
}
say(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
