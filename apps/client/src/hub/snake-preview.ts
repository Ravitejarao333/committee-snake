import {
  createGame,
  DEFAULT_RULES,
  type GameState,
  mulberry32,
  type Rng,
  type Rules,
  step,
} from "@committee-snake/shared";
import { HUD_ROWS, LCD_BG, LCD_PX } from "../snake/render/dots";
import { computeLcdLayout, type LcdLayout } from "../snake/render/layout";
import { drawBoard } from "../snake/render/snake";
import { choose } from "./autopilot";

/** A quarter of the real board, so the demo snake reads at card size. */
const RULES: Rules = { ...DEFAULT_RULES, width: 16, height: 10 };
const TICK_MS = 140;
/** The death blink: 3 off/on pairs, like the game's. */
const BLINK_MS = 150;
const BLINKS = 6;
/** Reduced motion draws one still frame this many ticks into a round. */
const STILL_TICKS = 40;

interface SnakePreview {
  readonly ticks: number;
}

/** A tiny LCD where the autopilot plays real rounds forever, while the card is on screen. */
export function startSnakePreview(canvas: HTMLCanvasElement, still: boolean): SnakePreview {
  const ctx = canvas.getContext("2d");
  const slot = canvas.parentElement;
  let seed = 1;
  let rng: Rng = mulberry32(seed);
  let state: GameState = createGame(rng, RULES);
  let ticks = 0;
  let deadAt = 0;
  let layout: LcdLayout | null = null;
  let visible = true;
  let last = 0;
  let acc = 0;

  const restart = (): void => {
    rng = mulberry32(++seed);
    state = createGame(rng, RULES);
  };
  const tick = (): void => {
    state = step(state, new Map([["bot", choose(state, rng, RULES)]]), rng, RULES).state;
    ticks++;
  };

  const resize = (): void => {
    if (!slot) return;
    // hudRows 0 and frame 0: the board fills the slot; drawBoard's HUD offset is undone below.
    layout = computeLcdLayout({
      availW: slot.clientWidth - 16,
      availH: slot.clientHeight - 16,
      dpr: devicePixelRatio,
      cols: RULES.width,
      rows: RULES.height,
      hudRows: 0,
      frame: 0,
    });
    canvas.width = layout.widthDev;
    canvas.height = layout.heightDev;
    canvas.style.width = `${layout.cssW}px`;
    canvas.style.height = `${layout.cssH}px`;
    draw(true);
  };

  const draw = (on: boolean): void => {
    if (!ctx || !layout) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = LCD_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(0, -HUD_ROWS * layout.pitch);
    ctx.fillStyle = LCD_PX;
    drawBoard(ctx, layout, state, { visible: on });
  };

  const frame = (now: number): void => {
    if (!visible) return;
    acc += Math.min(now - (last || now), 500);
    last = now;
    if (!state.alive) {
      deadAt ||= now;
      const blink = Math.floor((now - deadAt) / BLINK_MS);
      if (blink >= BLINKS) {
        deadAt = 0;
        acc = 0;
        restart();
      }
      draw(blink % 2 === 1);
    } else if (acc >= TICK_MS) {
      acc %= TICK_MS;
      tick();
      draw(true);
    }
    requestAnimationFrame(frame);
  };

  if (still) {
    for (let i = 0; i < STILL_TICKS && state.alive; i++) tick();
  }
  if (slot) new ResizeObserver(resize).observe(slot);
  if (!still) {
    new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e?.isIntersecting ?? true;
      if (visible && !was) {
        last = 0;
        requestAnimationFrame(frame);
      }
    }).observe(canvas);
    requestAnimationFrame(frame);
  }
  return {
    get ticks() {
      return ticks;
    },
  };
}
