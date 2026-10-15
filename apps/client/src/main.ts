import {
  createGame,
  currentTps,
  DEFAULT_RULES,
  type Dir,
  type GameState,
  mulberry32,
  step,
} from "@committee-snake/shared";

/**
 * M0/M1 scaffold: runs the pure simulation locally with a single voter so the
 * repo has something playable on day one. Rendering, LCD effects, keypad and
 * the Blame Screen land in M1–M2 under src/render/ (see docs/PLAN.md §7).
 */
function mustCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.querySelector<HTMLCanvasElement>("#lcd");
  if (!canvas) throw new Error("missing #lcd canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  return { canvas, ctx };
}
const { canvas, ctx } = mustCanvas();
ctx.imageSmoothingEnabled = false;

const KEYS: Record<string, Dir> = {
  ArrowUp: "U",
  ArrowDown: "D",
  ArrowLeft: "L",
  ArrowRight: "R",
  w: "U",
  s: "D",
  a: "L",
  d: "R",
};

const votes = new Map<string, Dir>();
window.addEventListener("keydown", (e) => {
  const dir = KEYS[e.key];
  if (dir) {
    votes.set("you", dir);
    e.preventDefault();
  }
});

let rng = mulberry32(Date.now() >>> 0);
let state: GameState = createGame(rng);
let lastTick = performance.now();

function draw(s: GameState): void {
  const cw = canvas.width / DEFAULT_RULES.width;
  const ch = canvas.height / DEFAULT_RULES.height;
  const c = ctx;
  c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--lcd-bg");
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--lcd-px");
  for (const [x, y] of s.snake) c.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2);
  const [fx, fy] = s.food;
  c.fillRect(fx * cw + cw / 4, fy * ch + ch / 4, cw / 2, ch / 2);
  if (s.bonus) {
    const [bx, by] = s.bonus.cell;
    c.fillRect(bx * cw + 1, by * ch + ch / 3, cw * 2 - 2, ch / 3);
  }
}

function frame(now: number): void {
  const interval = 1000 / currentTps(state);
  if (now - lastTick >= interval) {
    lastTick = now;
    state = step(state, votes, rng).state;
    if (!state.alive) {
      // M2 replaces this with the Blame Screen.
      rng = mulberry32((Date.now() ^ state.tick) >>> 0);
      state = createGame(rng);
      votes.clear();
    }
  }
  draw(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
