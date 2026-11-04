import { describe, expect, it } from "vitest";
import { crackAt } from "./crack";
import { createSim, FADE_MS, type ShardSim, stepShards } from "./physics";
import { shatter } from "./shards";

const B = { w: 390, h: 700 };
const FLOOR = 844;

function sim(seed: number, s = 1): ShardSim {
  return createSim(shatter(crackAt({ x: 180, y: 320 }, s, seed, B), B, 48, s));
}

function run(s: ShardSim, dt: number, maxMs: number, bounces: Map<number, number[]>): number {
  let t = 0;
  while (
    t < maxMs &&
    stepShards(s, dt, FLOOR, (i, v) => bounces.set(i, [...(bounces.get(i) ?? []), v])) > 0
  )
    t += dt;
  return t;
}

describe("shard physics", () => {
  it("bounces every shard exactly once, then fades them all out", () => {
    for (const seed of [1, 2, 3]) {
      const s = sim(seed);
      const bounces = new Map<number, number[]>();
      const t = run(s, 16, 10_000, bounces);
      expect(t).toBeLessThan(3000);
      expect(bounces.size).toBe(s.n);
      for (const v of bounces.values()) expect(v).toHaveLength(1);
      expect([...s.alpha].every((a) => a === 0)).toBe(true);
    }
  });

  it("loses energy at the bounce", () => {
    const s = sim(4);
    const before = new Float32Array(s.n);
    let checked = 0;
    for (let k = 0; k < 400; k++) {
      before.set(s.vy);
      stepShards(s, 8, FLOOR, (i, v) => {
        expect(Math.abs(s.vy[i] ?? 0)).toBeLessThanOrEqual(0.31 * v);
        expect(v).toBeGreaterThan(0);
        checked++;
      });
    }
    expect(checked).toBe(s.n);
  });

  it("fades for 350 ms after the bounce", () => {
    expect(FADE_MS).toBe(350);
    const s = sim(5);
    const bounced = new Map<number, number>();
    let t = 0;
    while (stepShards(s, 5, FLOOR, (i) => bounced.set(i, t)) > 0) t += 5;
    expect(t - Math.max(...bounced.values())).toBeLessThanOrEqual(FADE_MS + 10);
  });

  it("stays finite at extreme or broken time steps", () => {
    const s = sim(6);
    for (const dt of [0, -16, Number.NaN, 1e9, Number.POSITIVE_INFINITY, 0.001, 50])
      stepShards(s, dt, FLOOR);
    for (const arr of [s.x, s.y, s.vx, s.vy, s.a, s.alpha])
      expect([...arr].every(Number.isFinite)).toBe(true);
    // A huge step is clamped: nothing tunnels through the floor.
    for (let i = 0; i < s.n; i++) expect(s.y[i] ?? 0).toBeLessThanOrEqual(FLOOR);
  });
});
