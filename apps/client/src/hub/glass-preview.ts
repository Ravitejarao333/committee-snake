import { type Crack, crackAt, crackLines, reachFor } from "../glass/crack";

/** Crack spread at rest, and how fast it grows / recedes (fraction per ms). */
const REST = 0.12;
const GROW_PER_MS = 1 / 700;
const SHRINK_PER_MS = 1 / 400;
/** The same seeded crack every visit, from Break Glass's own geometry. */
const SEED = 7;
const HIT_STRENGTH = 0.6;

interface GlassPreview {
  readonly growth: number;
}

/** A frosted pane on a red box; its Break Glass crack spreads while the card is hovered or pressed. */
export function startGlassPreview(
  canvas: HTMLCanvasElement,
  card: HTMLElement,
  still: boolean,
): GlassPreview {
  const ctx = canvas.getContext("2d");
  let crack: Crack | null = null;
  let growth = still ? 1 : REST;
  let target = REST;
  let last = 0;
  let running = false;

  const draw = (): void => {
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const sky = ctx.createLinearGradient(0, 0, w, h);
    sky.addColorStop(0, "#b9c7cf");
    sky.addColorStop(1, "#7f939e");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // Two soft reflection streaks.
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(w * 0.15, 0);
    ctx.lineTo(w * 0.3, 0);
    ctx.lineTo(w * 0.05, h);
    ctx.lineTo(-w * 0.1, h);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(w * 0.38, 0);
    ctx.lineTo(w * 0.43, 0);
    ctx.lineTo(w * 0.18, h);
    ctx.lineTo(w * 0.13, h);
    ctx.fill();

    if (!crack) return;
    const lines = crackLines(crack, reachFor(crack, growth), { w, h });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [stroke, width] of [
      ["rgba(40,55,65,0.55)", 2],
      ["rgba(255,255,255,0.9)", 1],
    ] as const) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width * devicePixelRatio;
      ctx.beginPath();
      for (const line of [...lines.rays, ...lines.rings, ...lines.branches]) {
        line.forEach((p, i) => {
          if (i) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        });
      }
      ctx.stroke();
    }
  };

  const frame = (now: number): void => {
    const dt = Math.min(now - (last || now), 100);
    last = now;
    growth =
      growth < target
        ? Math.min(target, growth + dt * GROW_PER_MS)
        : Math.max(target, growth - dt * SHRINK_PER_MS);
    draw();
    if (growth === target) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  };

  const aim = (t: number): void => {
    target = t;
    if (still) {
      growth = 1;
      return;
    }
    if (!running) {
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    }
  };

  const resize = (): void => {
    canvas.width = Math.round(canvas.clientWidth * devicePixelRatio);
    canvas.height = Math.round(canvas.clientHeight * devicePixelRatio);
    const b = { w: canvas.width, h: canvas.height };
    crack = crackAt({ x: b.w * 0.62, y: b.h * 0.4 }, HIT_STRENGTH, SEED, b);
    draw();
  };
  new ResizeObserver(resize).observe(canvas);
  for (const t of ["pointerenter", "pointerdown", "focus"]) card.addEventListener(t, () => aim(1));
  for (const t of ["pointerleave", "pointercancel", "blur"]) {
    card.addEventListener(t, () => aim(REST));
  }
  return {
    get growth() {
      return growth;
    },
  };
}
