#!/usr/bin/env node
// Break Glass browser smoke test over the DevTools Protocol (no deps), same plumbing as client.mjs.
// 1. pnpm --filter @committee-snake/client dev        (serves http://localhost:5173)
// 2. node scripts/smoke/glass.mjs [url] [outDir]       (CHROME_PATH overrides the browser)
// /glass#1234 at 390×844@3× with touch and a 4× CPU throttle, at 1366×768 with a mouse, and with
// reduced motion: crack on press, the damage model (5 centre taps, 7 edge taps, one long press or
// hard swipe each shatter), the crack network and creak, the reveal, the counter across reloads,
// the share PNG, the next pane, and the per-frame budget.
// Exits 1 on any failed check or console error/warning. Needs the dev-only `__glass` hook.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "http://localhost:5173";
const glassUrl = new URL("/glass#1234", url).href;
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
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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
const glass = (cdp) =>
  evaluate(
    cdp,
    `(() => { const g = window.__glass; if (!g) return null; return { phase: g.phase,
      cracks: g.cracks, shards: g.shards, broken: g.broken, paneSeed: g.paneSeed, reveal: g.reveal,
      shakeMs: g.shakeMs, minScale: Math.min(1, ...g.timeScaleLog), audioState: g.audioState,
      soundsPlayed: g.soundsPlayed, lastShare: g.lastShare, breakMs: g.breakMs,
      damage: g.damage, components: g.components,
      revealText: document.getElementById("reveal").textContent,
      last: document.getElementById("last").textContent,
      count: document.querySelector("#broken [data-local]").textContent,
      hint: !document.getElementById("hint").hidden }; })()`,
  );
async function waitFor(cdp, label, pred, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = await glass(cdp);
    if (s && pred(s)) return s;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(await glass(cdp))}`);
}
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
/** The viewport point at fractions (fx, fy) of `selector`'s box. */
async function pointIn(cdp, selector, fx = 0.5, fy = 0.5) {
  const { result: doc } = await cdp.send("Runtime.evaluate", { expression: "document" });
  const { result } = await cdp.send("Runtime.callFunctionOn", {
    objectId: doc.objectId,
    functionDeclaration: `function (sel, fx, fy) { const b = this.querySelector(sel)?.getBoundingClientRect();
      return b ? { x: b.x + b.width * fx, y: b.y + b.height * fy } : null; }`,
    arguments: [{ value: selector }, { value: fx }, { value: fy }],
    returnByValue: true,
  });
  if (!result.value) throw new Error(`nothing at ${selector}`);
  return result.value;
}
/**
 * Press at `p` (touch or left mouse), run `during` while down, then release. The mouse rests on
 * `p` first so the jump there doesn't read as a swing, unless `swing` is set.
 */
async function pressAt(cdp, sc, p, during = async () => undefined, swing = false) {
  if (sc.mobile) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
    await during();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    const btn = { ...p, button: "left", clickCount: 1 };
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...p });
    if (!swing) await sleep(80);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...btn });
    await during();
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...btn });
  }
}
/** Tap each point in turn until the pane breaks; how many taps it took (or Infinity). */
async function tapUntilBroken(cdp, sc, pts) {
  const before = (await glass(cdp)).broken;
  for (let i = 0; i < pts.length; i++) {
    await pressAt(cdp, sc, pts[i]);
    await sleep(60);
    const s = await glass(cdp);
    if (s.broken > before) return i + 1;
  }
  return Number.POSITIVE_INFINITY;
}
/** From the reveal, tap beside it for the next pane. */
async function nextPaneNow(cdp, sc) {
  await waitFor(cdp, "revealed", (x) => x.phase === "revealed", 5_000);
  await pressAt(cdp, sc, await pointIn(cdp, "#pane", 0.05, 0.95));
  await waitFor(cdp, "pane", (x) => x.phase === "intact", 3_000);
}
const pixels = (cdp) =>
  evaluate(
    cdp,
    `(() => { const d = document.getElementById("glass").toDataURL(); return d.length + ":" + d.slice(-64); })()`,
  );
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? 0;

// --- scenarios ---------------------------------------------------------------
const SCENARIOS = [
  { name: "glass-390x844", width: 390, height: 844, dpr: 3, mobile: true, cpu: 4, reduced: false },
  {
    name: "glass-1366x768",
    width: 1366,
    height: 768,
    dpr: 1,
    mobile: false,
    cpu: 1,
    reduced: false,
  },
  {
    name: "glass-reduced-motion",
    width: 1366,
    height: 768,
    dpr: 1,
    mobile: false,
    cpu: 1,
    reduced: true,
  },
];

async function emulate(cdp, sc) {
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
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: sc.cpu });
  await cdp.send("Storage.clearDataForOrigin", {
    origin: new URL(url).origin,
    storageTypes: "local_storage",
  });
}

async function load(cdp) {
  await cdp.send("Page.navigate", { url: "about:blank" });
  await cdp.send("Page.navigate", { url: glassUrl });
  await waitFor(cdp, "ready", (s) => s.phase === "intact");
  // A fresh session per scenario, so the first shatter gets its slow motion.
  await evaluate(cdp, "sessionStorage.clear(), true");
}

async function share(cdp, sc) {
  const p = await pointIn(cdp, "#reveal");
  if (sc.mobile) {
    await evaluate(
      cdp,
      `(() => { navigator.canShare = () => true;
        navigator.share = async (d) => { window.__shared = { n: d.files?.length ?? 0, type: d.files?.[0]?.type, name: d.files?.[0]?.name }; };
        return true; })()`,
    );
    await pressAt(cdp, sc, p);
    const s = await waitFor(cdp, "native share", (x) => x.lastShare);
    const shared = await evaluate(cdp, "window.__shared ?? null");
    check(
      s.lastShare.via === "share" && shared?.n === 1 && shared.type === "image/png",
      `tapping the reveal opens the share sheet with one PNG (${JSON.stringify(shared)})`,
    );
    check(
      s.lastShare.w === 1200 && s.lastShare.h === 630,
      `share card is 1200×630 (${s.lastShare.w}×${s.lastShare.h})`,
    );
  } else {
    await evaluate(cdp, "Object.defineProperty(navigator, 'canShare', { value: undefined }), true");
    const file = join(outDir, "break-glass-1234.png");
    rmSync(file, { force: true });
    await pressAt(cdp, sc, p);
    const s = await waitFor(cdp, "share download", (x) => x.lastShare);
    for (let i = 0; i < 40 && !existsSync(file); i++) await sleep(100);
    const size = existsSync(file) ? pngSize(file) : null;
    check(s.lastShare.via === "download", `share fell back to download (${s.lastShare.via})`);
    check(
      size?.w === 1200 && size?.h === 630,
      `downloaded PNG is 1200×630 (${JSON.stringify(size)})`,
    );
    if (size) say(`  png  ${file}`);
  }
}

async function run(cdp, sc) {
  await emulate(cdp, sc);
  await load(cdp);
  const title = await evaluate(cdp, "document.title");
  check(title === "Break Glass · Cheap Thrills", `title "${title}"`);
  let s = await glass(cdp);
  check(
    s.paneSeed === 1234 && s.hint && s.count === "0",
    `pane #1234 intact, hint shown, count 0 (${JSON.stringify({ seed: s.paneSeed, hint: s.hint, count: s.count })})`,
  );
  await shot(cdp, `${sc.name}-1-intact`);

  // 1. One press cracks, in the same task as the press.
  const before = await pixels(cdp);
  const a = await pointIn(cdp, "#pane", 0.45, 0.4);
  let mid = null;
  await pressAt(cdp, sc, a, async () => {
    mid = await glass(cdp);
  });
  check(
    mid.phase === "cracked" && mid.cracks === 1,
    `press cracks at once (${mid.phase}, ${mid.cracks} crack)`,
  );
  check((await pixels(cdp)) !== before, "crack is on the canvas");
  await sleep(300);
  s = await glass(cdp);
  check(
    s.phase === "cracked" && s.cracks === 1,
    `a short tap leaves one crack (${s.phase}, ${s.cracks})`,
  );
  check(
    s.soundsPlayed.impact >= 1 && s.audioState === "running",
    `first hit is heard (${JSON.stringify(s.soundsPlayed)}, ${s.audioState})`,
  );
  await shot(cdp, `${sc.name}-2-crack`);

  // 2. Taps far apart join one crack network, each with a creak, and the pane holds.
  await pressAt(cdp, sc, await pointIn(cdp, "#pane", 0.15, 0.8));
  await pressAt(cdp, sc, await pointIn(cdp, "#pane", 0.85, 0.15));
  await sleep(100);
  s = await glass(cdp);
  check(
    s.phase === "cracked" && s.cracks === 3 && s.components < 3,
    `3 spread taps: one network in ${s.components} piece(s) (<3), ${s.damage.dealt.toFixed(0)}/${s.damage.max.toFixed(0)} damage`,
  );
  check(s.soundsPlayed.creak >= 3, `a creak under each hit (${s.soundsPlayed.creak})`);
  await shot(cdp, `${sc.name}-2b-network`);
  // Taps in the middle finish it off.
  const c0 = await pointIn(cdp, "#pane", 0.5, 0.5);
  const more = await tapUntilBroken(
    cdp,
    sc,
    Array.from({ length: 6 }, (_, i) => ({ x: c0.x + 9 * i, y: c0.y - 7 * i })),
  );
  check(more <= 5, `centre taps finish the damaged pane (${more} more)`);
  s = await waitFor(cdp, "shattering", (x) => x.phase === "shattering", 2_000);
  check(s.shards > 0 && s.shards <= 48, `the pane shatters into ${s.shards} shards (≤48)`);
  await sleep(120);
  await shot(cdp, `${sc.name}-3-shatter`);
  s = await waitFor(cdp, "revealed", (x) => x.phase === "revealed", 5_000);
  check(s.reveal && s.revealText === s.reveal.text, `reveal shows "${s.revealText}"`);
  check(
    s.last.includes("#1234") && s.count === "1" && s.broken === 1,
    `strip reads "${s.last}", count ${s.count}`,
  );
  check(s.soundsPlayed.tinkle > 0, `tinkles on landing (${s.soundsPlayed.tinkle})`);
  if (sc.reduced) {
    check(
      s.shakeMs === 0 && s.minScale >= 1,
      `reduced motion: no shake, no slow motion (${s.shakeMs} ms, ×${s.minScale})`,
    );
  } else {
    check(
      s.shakeMs > 0 && s.minScale < 1,
      `shake and first-shatter slow motion (${s.shakeMs} ms, ×${s.minScale})`,
    );
  }
  await shot(cdp, `${sc.name}-4-reveal`);

  // 3. Tap the reveal to share it, then the next pane slides in by itself.
  await share(cdp, sc);
  s = await waitFor(cdp, "next pane", (x) => x.phase === "intact" && x.paneSeed !== 1234, 4_000);
  check(true, `next pane #${s.paneSeed} after 2 s`);

  // 4. A fresh pane breaks in at most 5 centre taps, or 7 taps round the frame.
  const c = await pointIn(cdp, "#pane", 0.5, 0.5);
  const centre = await tapUntilBroken(
    cdp,
    sc,
    Array.from({ length: 8 }, (_, i) => ({ x: c.x + (i % 3) * 6, y: c.y + (i % 2) * 6 })),
  );
  check(centre <= 5, `5 centre taps shatter (took ${centre})`);
  await nextPaneNow(cdp, sc);
  const ring = [
    [0.04, 0.05],
    [0.96, 0.3],
    [0.5, 0.03],
    [0.03, 0.6],
    [0.97, 0.9],
    [0.3, 0.97],
    [0.97, 0.06],
    [0.04, 0.95],
    [0.7, 0.97],
  ];
  const edgePts = [];
  for (const [fx, fy] of ring) edgePts.push(await pointIn(cdp, "#pane", fx, fy));
  const edge = await tapUntilBroken(cdp, sc, edgePts);
  check(edge <= 7, `7 edge taps shatter (took ${edge})`);
  await nextPaneNow(cdp, sc);

  // 5. One gesture on the centre shatters: a long press, or a hard swipe.
  await pressAt(cdp, sc, c, async () => {
    await sleep(600);
  });
  s = await waitFor(
    cdp,
    "long-press shatter",
    (x) => x.phase === "shattering" || x.phase === "revealed",
    2_000,
  ).catch(() => glass(cdp));
  check(s.broken === 4, `a 600 ms press shatters by itself (${s.phase}, broken ${s.broken})`);
  await nextPaneNow(cdp, sc);
  if (sc.mobile) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [c] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: c.x + i * 30, y: c.y - i * 12 }],
      });
      await sleep(8);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    for (let i = 8; i >= 1; i--) {
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: c.x - i * 40,
        y: c.y - i * 20,
      });
      await sleep(4);
    }
    await pressAt(cdp, sc, c, undefined, true);
  }
  s = await waitFor(cdp, "swipe shatter", (x) => x.broken === 5, 2_000).catch(() => glass(cdp));
  check(s.broken === 5, `one hard centre swipe shatters (${s.phase}, broken ${s.broken})`);
  await waitFor(cdp, "revealed", (x) => x.phase === "revealed", 5_000);

  // 6. Frame budget over every frame drawn so far: update + draw, from performance.measure.
  const ms = await evaluate(cdp, "window.__glass.frameMs()");
  const p = p95(ms);
  const max = Math.max(0, ...ms);
  check(ms.length > 30, `measured ${ms.length} frames`);
  check(p < 3, `frame p95 ${p.toFixed(2)} ms < 3 ms (cpu ×${sc.cpu})`);
  check(max < 8, `frame max ${max.toFixed(2)} ms < 8 ms (cpu ×${sc.cpu})`);
  say(
    `  info last shatter set-up (in its input task): ${(await glass(cdp)).breakMs.toFixed(2)} ms`,
  );

  // 7. The count survives a reload.
  const broken = s.broken;
  await cdp.send("Page.reload");
  await sleep(300);
  s = await waitFor(cdp, "reloaded", (x) => x.phase === "intact");
  check(s.count === String(broken), `count ${s.count} after reload`);
}

const problems = [];
try {
  mkdirSync(outDir, { recursive: true });
  const { page: cdp, browser } = await connect();
  await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: outDir });
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
  for (const sc of SCENARIOS) {
    say(`\n${sc.name}`);
    const before = problems.length;
    await run(cdp, sc);
    check(problems.length === before, `no console errors/warnings (${problems.length - before})`);
  }
  cdp.close();
  browser.close();
} catch (err) {
  failures.push(String(err));
  say(`  FAIL ${err}`);
} finally {
  for (const p of problems) say(`  ! ${p}`);
  cleanup();
}
say(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
