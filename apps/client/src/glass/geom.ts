/** Small geometry helpers shared by the pure glass modules. */

export interface Pt {
  x: number;
  y: number;
}

/** The pane, in CSS px: [0, w] × [0, h]. */
export interface Bounds {
  w: number;
  h: number;
}

/** `xs[i]`, for an index the caller knows is in range; throws rather than returning undefined. */
export function at<T>(xs: ArrayLike<T>, i: number): T {
  const v = xs[i];
  if (v === undefined) throw new RangeError(`index ${i} of ${xs.length}`);
  return v;
}

/** `xs[i]` with i taken cyclically. */
export const ring = <T>(xs: readonly T[], i: number): T =>
  at(xs, ((i % xs.length) + xs.length) % xs.length);

export const lerp = (p: Pt, q: Pt, t: number): Pt => ({
  x: p.x + (q.x - p.x) * t,
  y: p.y + (q.y - p.y) * t,
});

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const inside = (p: Pt, b: Bounds): boolean =>
  p.x >= 0 && p.x <= b.w && p.y >= 0 && p.y <= b.h;

/** Signed area (shoelace). */
export function polyArea(p: readonly Pt[]): number {
  let a = 0;
  p.forEach((q, i) => {
    const r = ring(p, i + 1);
    a += q.x * r.y - r.x * q.y;
  });
  return a / 2;
}

export function centroid(p: readonly Pt[]): Pt {
  const a = polyArea(p);
  let x = 0;
  let y = 0;
  p.forEach((q, i) => {
    const r = ring(p, i + 1);
    const f = q.x * r.y - r.x * q.y;
    x += (q.x + r.x) * f;
    y += (q.y + r.y) * f;
  });
  return { x: x / (6 * a), y: y / (6 * a) };
}

/** Even-odd point-in-polygon. */
export function contains(poly: readonly Pt[], p: Pt): boolean {
  let hit = false;
  poly.forEach((a, i) => {
    const b = ring(poly, i + 1);
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) {
      hit = !hit;
    }
  });
  return hit;
}
