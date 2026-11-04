import { mulberry32 } from "@committee-snake/shared";
import { buzz } from "../fx/haptics";
import { createParticles } from "../fx/particles";
import type { ShareResult } from "../fx/share";
import { gestureGate } from "../ui/gesture-gate";
import { type Crack, crackAt, crackLines, hitSeed, reachFor } from "./crack";
import { hitDamage, oneTapLeft, paneStrength } from "./damage";
import {
  type CrackArt,
  crackArt,
  dimGlass,
  drawRemnant,
  drawShards,
  fit,
  paintCracks,
  paintPane,
  polyPaths,
  type ShardArt,
  shardArt,
  strokeCracks,
} from "./draw";
import { createFx, type FxFrame, remnantAlpha } from "./fx";
import type { Bounds, Pt } from "./geom";
import {
  commitHit,
  components,
  crackDist,
  createNetwork,
  type Seg,
  type Traced,
  trace,
  web,
} from "./network";
import { createSlivers, remnant } from "./payoff";
import { createSim, type ShardSim, stepShards } from "./physics";
import type { Reveal } from "./reveals";
import { nextPaneSeed, paneFromHash, revealFor, revealIndex } from "./select";
import { shatter } from "./shards";
import { renderGlassShare, shareReveal } from "./share-render";
import { createGlassSound } from "./sound";
import { MoveTrack, strength } from "./strength";
import { FLAKES, GROW, REMNANT_MS } from "./tuning";

type Phase = "intact" | "cracked" | "shattering" | "revealed" | "sliding";

const COUNT_KEY = "break-glass:broken";
const CAP = 48;
const CAP_DEGRADED = 24;
const SLIDE_MS = 350;
const NEXT_PANE_MS = 2000;
const FRAME_BUDGET_MS = 3;
const KEY_STRENGTH = 0.55;
/** While a press is held, check its growing strength this often (in a timer task, not a frame). */
const GROW_TICK_MS = 40;
/** The glass round the reveal darkens over this long. */
const DIM_MS = 250;

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
const slivers = createSlivers();
const approach = new MoveTrack();
const drag = new MoveTrack();

/** A landed hit: its crack and how hard it was. */
interface Hit {
  crack: Crack;
  s: number;
}
interface Live extends Hit {
  id: number;
  downAt: number;
  approach: number;
  /** How far the press is from the nearest older crack, px (for the weak-spot bonus). */
  near: number;
  traced: Traced;
  art: CrackArt;
}

let phase: Phase = "intact";
let b: Bounds = { w: 1, h: 1 };
let dpr = 1;
let paneSeed = paneFromHash(location.hash) ?? nextPaneSeed(rng, []);
const recent: number[] = [];
let hitIndex = 0;
let hits: Hit[] = [];
let net = createNetwork(b);
let webSegs: Seg[] = [];
let dealt = 0;
let paneMax = paneStrength(paneSeed);
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
let growTimer = 0;
let shatterAt = Number.NEGATIVE_INFINITY;
let remnantPaths: Path2D[] = [];
/** Where the reveal sits, for the light through the hole. */
let litAt: Pt = { x: 0, y: 0 };
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
    flick: drag.speed(now),
    diag: diag(),
  });
const ratio = (): number => dealt / paneMax;
/** Older cracks reach further as the pane takes damage. */
const reachOf = (h: Hit): number => reachFor(h.crack, h.s) * (1 + GROW * ratio());

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

/** Rebuild the network from every landed hit, its hairline web, and the cracks layer. */
function rebuild(): void {
  net = createNetwork(b);
  for (const h of hits)
    commitHit(net, trace(net, h.crack.hit, crackLines(h.crack, reachOf(h), b), h.s, h.crack.seed));
  webSegs = web(net, ratio(), paneSeed);
  if (crackCtx) {
    crackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintCracks(crackCtx, paneLayer, crackArt([...net.segs, ...webSegs]), b.w, b.h, flat);
  }
}

/** A press's crack at strength s, joined onto the network (not added to it yet). */
function retrace(crack: Crack, s: number): { traced: Traced; art: CrackArt } {
  const traced = trace(net, crack.hit, crackLines(crack, reachOf({ crack, s }), b), s, crack.seed);
  return { traced, art: crackArt(traced.segs) };
}

const damageOf = (crack: Crack, s: number, near: number): number =>
  hitDamage(s, crack.hit, b, near);

/** Tiny flakes off the impact point. */
function flakes(p: Pt, s: number): void {
  particles.emit(
    {
      x: p.x,
      y: p.y,
      count: FLAKES,
      speed: 70 + 140 * s,
      life: 900,
      gravity: 900,
      size: 1.6,
      colors: ["#eef6f9", "#cfdfe6", "#ffffff"],
    },
    rng.next,
  );
}

/** A hit that didn't break the pane: count its damage, grow the network, creak, maybe wobble. */
function land(crack: Crack, s: number, near: number, now: number): void {
  dealt += damageOf(crack, s, near);
  hits.push({ crack, s });
  rebuild();
  sound.creak(ratio());
  if (oneTapLeft(dealt, paneMax)) fx.wobble(now);
  phase = "cracked";
  kick();
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
  litAt = {
    x: Math.min(Math.max(at.x, hw), b.w - hw),
    y: Math.min(Math.max(at.y, hh), b.h - hh),
  };
  revealEl.textContent = r.text;
  revealEl.dataset.kind = r.kind;
  revealEl.style.left = `${litAt.x}px`;
  revealEl.style.top = `${litAt.y}px`;
  revealEl.classList.add("lit");
}

function breakPane(crack: Crack, s: number, now: number): void {
  clearInterval(growTimer);
  const shards = shatter(crack, b, cap, s);
  sim = createSim(shards);
  art = shardArt(shards, net.segs);
  hits = [];
  dealt = 0;
  net = createNetwork(b);
  webSegs = [];
  live = null;
  crackCtx?.clearRect(0, 0, b.w, b.h);
  phase = "shattering";
  shatterFrames = [];
  shatterS = s;
  shatterAt = now;
  remnantPaths = polyPaths(remnant(b, paneSeed));
  slivers.emit(crack.hit.x, crack.hit.y, s, rng.next);
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
  paneMax = paneStrength(paneSeed);
  revealEl.classList.remove("lit");
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
  const sp = e.pointerType === "mouse" ? approach.speed(e.timeStamp) : 0;
  const s = strength({ approach: sp, heldMs: 0, flick: 0, diag: diag() });
  const crack = newCrack(p, s);
  const near = crackDist(net, p);
  if (dealt + damageOf(crack, s, near) >= paneMax) {
    breakPane(crack, s, now);
    return;
  }
  drag.clear();
  drag.push(now, p.x, p.y);
  live = { crack, s, id: e.pointerId, downAt: now, approach: sp, near, ...retrace(crack, s) };
  const id = e.pointerId;
  growTimer = window.setInterval(() => grow(id), GROW_TICK_MS);
  phase = "cracked";
  playHit(s);
  flakes(p, s);
  // Same task as the press: the crack is on screen at the next composite, not a frame later.
  render(now, fx.frame(now));
  kick();
}

/** Whether the live press, now at strength s, breaks the pane (and if so, break it). */
function breaks(l: Live, s: number, now: number): boolean {
  if (dealt + damageOf(l.crack, s, l.near) < paneMax) return false;
  breakPane(l.crack, s, now);
  return true;
}

/** A held press grows its crack, and breaks the pane once it's hard enough. */
function grow(id: number): void {
  if (!live || live.id !== id) return;
  const now = performance.now();
  const s = strengthNow(live, now);
  if (breaks(live, s, now) || s < live.s + 0.04) return;
  live.s = s;
  Object.assign(live, retrace(live.crack, s));
  kick();
}

function up(e: PointerEvent): void {
  if (!live || e.pointerId !== live.id) return;
  const now = performance.now();
  const l = live;
  clearInterval(growTimer);
  const s = Math.max(l.s, strengthNow(l, now));
  if (breaks(l, s, now)) return;
  live = null;
  land(l.crack, s, l.near, now);
}

function update(dt: number, now: number): void {
  // Shatters and crack growth happen in input and timer tasks, never inside a frame (see grow()).
  if (phase === "shattering" && sim) {
    const left = stepShards(sim, dt, b.h, () => sound.tinkle(shatterS));
    if (left === 0) revealed();
  }
  if (phase === "sliding" && now - slideAt >= SLIDE_MS) phase = "intact";
  particles.step(dt);
  slivers.step(dt);
}

function render(now: number, f: FxFrame): void {
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, b.w, b.h);
  if (phase === "intact" || phase === "cracked") {
    // f.dx carries the wobble before the last hit.
    ctx.setTransform(dpr, 0, 0, dpr, f.dx * dpr, 0);
    ctx.drawImage(paneLayer, 0, 0, b.w, b.h);
    ctx.drawImage(crackLayer, 0, 0, b.w, b.h);
    if (live) strokeCracks(ctx, live.art, flat);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  } else if (phase === "sliding") {
    const t = Math.min(1, (now - slideAt) / SLIDE_MS);
    const e = 1 - (1 - t) ** 3;
    ctx.drawImage(paneLayer, 0, -b.h * (1 - e), b.w, b.h);
  } else if (phase === "shattering" || phase === "revealed") {
    if (sim && art) drawShards(ctx, sim, art, dpr, f.dx, f.dy, flat);
    const since = now - shatterAt;
    drawRemnant(ctx, remnantPaths, remnantAlpha(since));
    // The reveal is lit through the hole while the glass round it darkens.
    if (!flat && since < REMNANT_MS)
      dimGlass(ctx, litAt, 70, Math.min(1, since / DIM_MS), b.w, b.h);
  }
  slivers.draw(ctx);
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
    particles.alive > 0 ||
    slivers.alive > 0 ||
    t - shatterAt < REMNANT_MS;
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
  rebuild();
  const now = performance.now();
  render(now, fx.frame(now));
}

/** Space or Enter anywhere but on a control is a medium hit near the middle; two break a pane. */
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
  const k = mulberry32(paneSeed + hits.length * 7919);
  const p = { x: b.w * (0.3 + 0.4 * k.next()), y: b.h * (0.3 + 0.4 * k.next()) };
  const crack = newCrack(p, KEY_STRENGTH);
  const near = crackDist(net, p);
  if (dealt + damageOf(crack, KEY_STRENGTH, near) >= paneMax) {
    breakPane(crack, KEY_STRENGTH, now);
    return;
  }
  playHit(KEY_STRENGTH);
  flakes(p, KEY_STRENGTH);
  land(crack, KEY_STRENGTH, near, now);
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
    breaks(live, strengthNow(live, now), now);
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
        return hits.length + (live ? 1 : 0);
      },
      get damage() {
        return { dealt, max: paneMax };
      },
      get components() {
        return components(net);
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
