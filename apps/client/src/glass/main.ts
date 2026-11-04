import { mulberry32 } from "@committee-snake/shared";
import { buzz } from "../fx/haptics";
import { createParticles } from "../fx/particles";
import type { ShareResult } from "../fx/share";
import { gestureGate } from "../ui/gesture-gate";
import { type Crack, type CrackLines, crackAt, crackLines, hitSeed, reachFor } from "./crack";
import { drawShards, fit, paintPane, type ShardArt, shardArt, strokeCrack } from "./draw";
import { createFx, type FxFrame } from "./fx";
import type { Bounds, Pt } from "./geom";
import { createSim, type ShardSim, stepShards } from "./physics";
import type { Reveal } from "./reveals";
import { nextPaneSeed, paneFromHash, revealFor, revealIndex } from "./select";
import { shatter } from "./shards";
import { renderGlassShare, shareReveal } from "./share-render";
import { createGlassSound } from "./sound";
import { FLICK_SHATTER, HOLD_SHATTER_MS, MoveTrack, strength } from "./strength";

type Phase = "intact" | "cracked" | "shattering" | "revealed" | "sliding";

const COUNT_KEY = "break-glass:broken";
const CAP = 48;
const CAP_DEGRADED = 24;
const SLIDE_MS = 350;
const NEXT_PANE_MS = 2000;
const FRAME_BUDGET_MS = 3;
const KEY_STRENGTH = 0.55;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};
const pane = $("pane");
const canvas = $<HTMLCanvasElement>("glass");
const revealEl = $("reveal");
/** The next pane's reveal, laid out unseen ahead of time so a shatter never forces a layout. */
const twin = $("reveal-next");
const lastBtn = $<HTMLButtonElement>("last");
const muteBtn = $<HTMLButtonElement>("mute");
const localOut = document.querySelector<HTMLElement>("#broken [data-local]");
const nounOut = document.querySelector<HTMLElement>("#broken [data-noun]");
const ctx = canvas.getContext("2d", { desynchronized: true });
if (!ctx) throw new Error("2D canvas unavailable");
const paneLayer = document.createElement("canvas");
const crackLayer = document.createElement("canvas");
const paneCtx = paneLayer.getContext("2d");
const crackCtx = crackLayer.getContext("2d");

const rng = mulberry32((Date.now() ^ (Math.random() * 2 ** 32)) >>> 0);
const sound = createGlassSound(mulberry32(rng.int(2 ** 31)));
const fx = createFx(mulberry32(rng.int(2 ** 31)));
const particles = createParticles();
const approach = new MoveTrack();
const drag = new MoveTrack();

interface Hit {
  crack: Crack;
  lines: CrackLines;
}
interface Live extends Hit {
  id: number;
  downAt: number;
  area: number;
  pressure: number;
  approach: number;
  s: number;
}

let phase: Phase = "intact";
let b: Bounds = { w: 1, h: 1 };
let dpr = 1;
let paneSeed = paneFromHash(location.hash) ?? nextPaneSeed(rng, []);
const recent: number[] = [];
let hitIndex = 0;
let cracks: Hit[] = [];
let live: Live | null = null;
let sim: ShardSim | null = null;
let art: ShardArt | null = null;
let shown: { reveal: Reveal; pane: number } | null = null;
let slideAt = 0;
let nextTimer = 0;
let pendingSound: number | null = null;
let cap = CAP;
let shatterS = 0;
let flat = false;
let shatterFrames: number[] = [];
const frameMs: number[] = [];
const timeScaleLog: number[] = [];
let lastShare: ShareResult | null = null;
let holdTimer = 0;
/** How long the last shatter took to set up (outside any frame), ms. */
let breakMs = 0;

const readCount = (): number => {
  try {
    return Number(localStorage.getItem(COUNT_KEY)) || 0;
  } catch {
    return 0;
  }
};
let broken = readCount();
const showCount = (): void => {
  if (localOut) localOut.textContent = String(broken);
  if (nounOut) nounOut.textContent = broken === 1 ? "pane" : "panes";
};

const diag = (): number => Math.hypot(b.w, b.h);
const local = (e: PointerEvent): Pt => {
  const r = pane.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
const strengthNow = (l: Live, now: number): number =>
  strength({
    approach: l.approach,
    heldMs: Math.max(0, now - l.downAt),
    area: l.area,
    pressure: l.pressure,
    flick: drag.speed(now),
    diag: diag(),
  });

function playHit(s: number): void {
  if (!sound.engine.live()) {
    pendingSound = s;
    return;
  }
  sound.impact(s);
  sound.crackle(s);
}

function newCrack(p: Pt, s: number): Crack {
  const crack = crackAt(p, s, hitSeed(paneSeed, p.x, p.y, hitIndex), b);
  hitIndex++;
  return crack;
}

function commit(h: Hit): void {
  cracks.push(h);
  if (crackCtx) strokeCrack(crackCtx, h.lines, flat);
}

function stage(): void {
  const r = revealFor(paneSeed);
  twin.textContent = r.text;
  twin.dataset.kind = r.kind;
}

/** Show `r` centred on `at`, kept inside the pane. Reads the twin's size before writing anything. */
function placeReveal(r: Reveal, at: Pt): void {
  const hw = twin.offsetWidth / 2 + 8;
  const hh = twin.offsetHeight / 2 + 8;
  revealEl.textContent = r.text;
  revealEl.dataset.kind = r.kind;
  revealEl.style.left = `${Math.min(Math.max(at.x, hw), b.w - hw)}px`;
  revealEl.style.top = `${Math.min(Math.max(at.y, hh), b.h - hh)}px`;
}

function breakPane(crack: Crack, s: number, now: number): void {
  clearTimeout(holdTimer);
  const shards = shatter(crack, b, cap, s);
  sim = createSim(shards);
  art = shardArt(
    shards,
    cracks.map((c) => c.lines),
  );
  cracks = [];
  live = null;
  crackCtx?.clearRect(0, 0, b.w, b.h);
  phase = "shattering";
  shatterFrames = [];
  shatterS = s;
  fx.shatter(crack.hit.x, crack.hit.y, s, now);
  playHit(s);
  buzz([12, 30, 20]);
  particles.emit(
    {
      x: crack.hit.x,
      y: crack.hit.y,
      count: 24,
      speed: 300 + 500 * s,
      life: 600,
      gravity: 1400,
      size: 2.5,
      colors: ["#e6f0f4", "#ffffff", "#b8ccd6"],
    },
    rng.next,
  );
  const reveal = revealFor(paneSeed);
  shown = { reveal, pane: paneSeed };
  placeReveal(reveal, crack.hit);
  broken++;
  try {
    localStorage.setItem(COUNT_KEY, String(broken));
  } catch {
    // The count still shows for this visit.
  }
  showCount();
  lastBtn.textContent = `pane #${paneSeed} · share`;
  lastBtn.hidden = false;
  breakMs = performance.now() - now;
  kick();
}

function revealed(): void {
  phase = "revealed";
  sim = null;
  art = null;
  const r = shown?.reveal;
  if (r?.kind === "prize") {
    particles.emit(
      {
        x: revealEl.offsetLeft,
        y: revealEl.offsetTop,
        count: 40,
        speed: 420,
        life: 1100,
        gravity: 500,
        size: r.anim === "confetti" ? 6 : 3.5,
        colors:
          r.anim === "confetti"
            ? ["#e63946", "#f4a261", "#2a9d8f", "#457b9d"]
            : ["#ffd23f", "#fff3b0", "#f4a100"],
      },
      rng.next,
    );
    kick();
  }
  nextTimer = window.setTimeout(nextPane, NEXT_PANE_MS);
}

function nextPane(): void {
  clearTimeout(nextTimer);
  if (phase !== "revealed") return;
  recent.push(revealIndex(paneSeed));
  paneSeed = nextPaneSeed(rng, recent);
  history.replaceState(null, "", `#${paneSeed}`);
  stage();
  hitIndex = 0;
  phase = "sliding";
  slideAt = performance.now();
  kick();
}

async function share(): Promise<void> {
  if (!shown) return;
  lastShare = await shareReveal(renderGlassShare(shown.reveal, shown.pane), shown.pane);
}

function down(e: PointerEvent): void {
  const now = performance.now();
  const p = local(e);
  if (phase === "revealed") {
    const r = revealEl.getBoundingClientRect();
    const onReveal =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (onReveal) void share();
    else nextPane();
    return;
  }
  if (phase !== "intact" && phase !== "cracked") return;
  pane.setPointerCapture(e.pointerId);
  const area = e.pointerType === "mouse" ? 0 : e.width * e.height;
  const sp = e.pointerType === "mouse" ? approach.speed(e.timeStamp) : 0;
  const s = strength({
    approach: sp,
    heldMs: 0,
    area,
    pressure: e.pressure,
    flick: 0,
    diag: diag(),
  });
  const near = 0.25 * Math.min(b.w, b.h);
  if (cracks.some((c) => Math.hypot(c.crack.hit.x - p.x, c.crack.hit.y - p.y) < near)) {
    breakPane(newCrack(p, Math.max(s, 0.5)), Math.max(s, 0.5), now);
    return;
  }
  const crack = newCrack(p, s);
  if (s >= 1) {
    breakPane(crack, s, now);
    return;
  }
  drag.clear();
  drag.push(now, p.x, p.y);
  const lines = crackLines(crack, reachFor(crack, s), b);
  live = {
    crack,
    lines,
    id: e.pointerId,
    downAt: now,
    area,
    pressure: e.pressure,
    approach: sp,
    s,
  };
  const id = e.pointerId;
  holdTimer = window.setTimeout(() => hold(id), HOLD_SHATTER_MS);
  phase = "cracked";
  playHit(s);
  // Same task as the press: the crack is on screen at the next composite, not a frame later.
  render(now, fx.frame(now));
  kick();
}

/** A press held this long shatters by itself. */
function hold(id: number): void {
  if (!live || live.id !== id) return;
  const now = performance.now();
  breakPane(live.crack, Math.max(strengthNow(live, now), 0.9), now);
}

function up(e: PointerEvent): void {
  if (!live || e.pointerId !== live.id) return;
  const now = performance.now();
  const l = live;
  clearTimeout(holdTimer);
  const s = strengthNow(l, now);
  if (drag.speed(now) / diag() >= FLICK_SHATTER) {
    breakPane(l.crack, Math.max(s, 0.8), now);
    return;
  }
  live = null;
  commit({ crack: l.crack, lines: crackLines(l.crack, reachFor(l.crack, s), b) });
  kick();
}

function update(dt: number, now: number): void {
  // Shatters happen in input and timer tasks, never inside a frame (see hold() and pointermove).
  if (live) {
    const s = strengthNow(live, now);
    if (s > live.s) {
      live.s = s;
      live.lines = crackLines(live.crack, reachFor(live.crack, s), b);
    }
  }
  if (phase === "shattering" && sim) {
    const left = stepShards(sim, dt, b.h, () => sound.tinkle(shatterS));
    if (left === 0) revealed();
  }
  if (phase === "sliding" && now - slideAt >= SLIDE_MS) phase = "intact";
  particles.step(dt);
}

function render(now: number, f: FxFrame): void {
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, b.w, b.h);
  if (phase === "intact" || phase === "cracked") {
    ctx.drawImage(paneLayer, 0, 0, b.w, b.h);
    ctx.drawImage(crackLayer, 0, 0, b.w, b.h);
    if (live) strokeCrack(ctx, live.lines, flat);
  } else if (phase === "sliding") {
    const t = Math.min(1, (now - slideAt) / SLIDE_MS);
    const e = 1 - (1 - t) ** 3;
    ctx.drawImage(paneLayer, 0, -b.h * (1 - e), b.w, b.h);
  } else if (phase === "shattering" && sim && art) {
    drawShards(ctx, sim, art, dpr, f.dx, f.dy, flat);
  }
  particles.draw(ctx);
  fx.drawFlash(ctx, now);
}

function degrade(ms: number): void {
  if (flat || phase !== "shattering") return;
  shatterFrames.push(ms);
  if (shatterFrames.length < 20) return;
  const sorted = [...shatterFrames].sort((x, y) => x - y);
  if ((sorted[Math.floor(sorted.length * 0.95)] ?? 0) > FRAME_BUDGET_MS) {
    cap = CAP_DEGRADED;
    sound.setVoices(6);
    flat = true;
  }
}

let raf = 0;
let last = 0;
function tick(): void {
  raf = 0;
  performance.mark("glass:a");
  const t = performance.now();
  const dt = last ? t - last : 16;
  last = t;
  const f = fx.frame(t);
  if (timeScaleLog.length < 600) timeScaleLog.push(f.scale);
  update(dt * f.scale, t);
  render(t, f);
  const m = performance.measure("glass:frame", "glass:a");
  frameMs.push(m.duration);
  if (frameMs.length > 600) frameMs.shift();
  degrade(m.duration);
  performance.clearMarks("glass:a");
  performance.clearMeasures("glass:frame");
  const busy =
    live !== null ||
    phase === "shattering" ||
    phase === "sliding" ||
    fx.busy(t) ||
    particles.alive > 0;
  if (busy) raf = requestAnimationFrame(tick);
  else last = 0;
}
function kick(): void {
  if (!raf) raf = requestAnimationFrame(tick);
}

function resize(): void {
  const r = pane.getBoundingClientRect();
  b = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  dpr = Math.min(3, devicePixelRatio || 1);
  for (const c of [canvas, paneLayer, crackLayer]) fit(c, b.w, b.h, dpr);
  if (paneCtx) {
    paneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintPane(paneCtx, b.w, b.h);
  }
  if (crackCtx) {
    crackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const c of cracks) strokeCrack(crackCtx, c.lines, flat);
  }
  const now = performance.now();
  render(now, fx.frame(now));
}

/** Space or Enter anywhere but on a control is a medium hit; a second one breaks the pane. */
function keyHit(e: KeyboardEvent): void {
  if (e.key !== " " && e.key !== "Enter") return;
  if (e.target instanceof HTMLElement && e.target.closest("button, a")) return;
  e.preventDefault();
  const now = performance.now();
  if (phase === "revealed") {
    nextPane();
    return;
  }
  if (phase !== "intact" && phase !== "cracked") return;
  const prev = cracks.at(-1);
  if (prev) {
    breakPane(newCrack(prev.crack.hit, KEY_STRENGTH), KEY_STRENGTH, now);
    return;
  }
  const k = mulberry32(paneSeed);
  const p = { x: b.w * (0.3 + 0.4 * k.next()), y: b.h * (0.3 + 0.4 * k.next()) };
  const crack = newCrack(p, KEY_STRENGTH);
  commit({ crack, lines: crackLines(crack, reachFor(crack, KEY_STRENGTH), b) });
  phase = "cracked";
  playHit(KEY_STRENGTH);
  kick();
}

const showMute = (): void => {
  muteBtn.setAttribute("aria-pressed", String(sound.engine.muted));
  muteBtn.textContent = sound.engine.muted ? "sound off" : "sound on";
};

pane.addEventListener("pointermove", (e) => {
  const p = local(e);
  if (live && e.pointerId === live.id) {
    const now = performance.now();
    drag.push(now, p.x, p.y);
    const s = strengthNow(live, now);
    if (s >= 1) breakPane(live.crack, s, now);
  } else approach.push(e.timeStamp, p.x, p.y);
});
pane.addEventListener("pointerdown", down);
pane.addEventListener("pointerup", up);
pane.addEventListener("pointercancel", up);
addEventListener("keydown", keyHit);
pane.addEventListener("contextmenu", (e) => e.preventDefault());
lastBtn.addEventListener("click", () => void share());
muteBtn.addEventListener("click", () => {
  sound.engine.toggleMute();
  showMute();
});
gestureGate({
  unlock: sound.engine.unlock,
  hint: document.getElementById("hint"),
  hintKey: "break-glass:hinted",
  onUnlock() {
    // The first touch only counts as a gesture at release; play its hit now.
    if (pendingSound !== null) {
      const s = pendingSound;
      pendingSound = null;
      queueMicrotask(() => playHit(s));
    }
  },
});
new ResizeObserver(resize).observe(pane);
document.addEventListener("visibilitychange", () => {
  last = 0;
});
stage();
showCount();
showMute();
resize();
document.documentElement.dataset.ready = "1";

if (import.meta.env.DEV) {
  // Smoke-test hook (scripts/smoke/glass.mjs); never shipped.
  Object.defineProperty(window, "__glass", {
    value: {
      get phase() {
        return phase;
      },
      get cracks() {
        return cracks.length + (live ? 1 : 0);
      },
      get shards() {
        return sim?.n ?? 0;
      },
      get broken() {
        return broken;
      },
      get paneSeed() {
        return paneSeed;
      },
      get reveal() {
        return shown?.reveal ?? null;
      },
      timeScaleLog,
      get shakeMs() {
        return fx.shakeMs;
      },
      frameMs: () => [...frameMs],
      get audioState() {
        return sound.engine.state;
      },
      get soundsPlayed() {
        return { ...sound.played };
      },
      get lastShare() {
        return lastShare;
      },
      get breakMs() {
        return breakMs;
      },
    },
  });
}
