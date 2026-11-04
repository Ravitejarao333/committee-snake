import { mulberry32 } from "@committee-snake/shared";

/** Crack length at rest, and how fast it grows / recedes (fraction per ms). */
const REST = 0.12;
const GROW_PER_MS = 1 / 700;
const SHRINK_PER_MS = 1 / 400;
const RAYS = 7;
const STEPS = 9;

type Point = readonly [number, number];

/** Seeded hairline: jittered rays from one point, in unit coordinates of the pane. */
function hairline(seed: number): Point[][] {
  const rng = mulberry32(seed);
  const rays: Point[][] = [];
  for (let r = 0; r < RAYS; r++) {
    let a = ((r + rng.next() * 0.6) / RAYS) * Math.PI * 2;
    const len = 0.25 + rng.next() * 0.45;
    let x = 0;
    let y = 0;
    const ray: Point[] = [[0, 0]];
    for (let i = 0; i < STEPS; i++) {
      a += (rng.next() - 0.5) * 0.5;
      x += (Math.cos(a) * len) / STEPS;
      y += (Math.sin(a) * len) / STEPS;
      ray.push([x, y]);
    }
    rays.push(ray);
  }
  return rays;
}

interface GlassPreview {
  readonly growth: number;
}

/** A frosted pane on a red box; its hairline crack grows while the card is hovered or pressed. */
export function startGlassPreview(
  canvas: HTMLCanvasElement,
  card: HTMLElement,
  still: boolean,
): GlassPreview {
  const ctx = canvas.getContext("2d");
  const rays = hairline(7);
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

    const ox = w * 0.62;
    const oy = h * 0.4;
    const s = Math.min(w, h);
    const shown = growth * STEPS;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [stroke, width] of [
      ["rgba(40,55,65,0.55)", 2],
      ["rgba(255,255,255,0.9)", 1],
    ] as const) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width * devicePixelRatio;
      ctx.beginPath();
      for (const ray of rays) {
        ctx.moveTo(ox, oy);
        for (let i = 1; i <= Math.ceil(shown) && i < ray.length; i++) {
          const p = ray[i];
          const q = ray[i - 1];
          if (!p || !q) continue;
          // The last segment grows smoothly instead of popping in.
          const f = Math.min(1, shown - (i - 1));
          ctx.lineTo(ox + (q[0] + (p[0] - q[0]) * f) * s, oy + (q[1] + (p[1] - q[1]) * f) * s);
        }
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
