import {
  createGame,
  currentTps,
  expireVotes,
  type GameState,
  mulberry32,
  nextTickDelayMs,
  type PlayerId,
  pushVote,
  type Rng,
  settleVotes,
  step,
  type VoteQueue,
} from "@committee-snake/shared";
import type { Audio } from "./audio";
import type { InputHandlers } from "./input";
import { KEYPAD_FOR_DIR, type KeyAction } from "./keymap";
import {
  advance,
  canStart,
  countdown,
  countdownDigit,
  dying,
  lobby,
  type Phase,
  powerAt,
  visibleAt,
} from "./phase";
import type { LcdLayout } from "./render/layout";
import { type Afterimage, drawHud, type Lcd, type Motion, type Overlay } from "./render/lcd";
import type { Phone } from "./render/phone";
import { type BoardView, drawBoard, segmentSprite } from "./render/snake";
import { runDueTicks } from "./scheduler";

/** Shape of the dev-only smoke-test hook (stripped from production builds). */
interface CsDevHook {
  readonly phase: string;
  readonly tick: number;
  readonly alive: boolean;
  readonly score: number;
  readonly layout: LcdLayout;
  readonly canvas: { width: number; height: number; clientWidth: number; clientHeight: number };
  readonly audioState: string | null;
  readonly muted: boolean;
  readonly motion: Motion;
  readonly soundsPlayed: number;
}

declare global {
  interface Window {
    __cs?: CsDevHook;
  }
}

const ME: PlayerId = "you";
const BLINK_PROMPT_MS = 600;

/** Lobby attract screen: a still snake about to bite. */
const DEMO: BoardView = {
  tick: 0,
  dir: "R",
  alive: true,
  food: [22, 18],
  bonus: null,
  snake: [
    [21, 18],
    [20, 18],
    [19, 18],
    [18, 18],
    [17, 18],
    [17, 17],
    [16, 17],
    [15, 17],
    [14, 17],
    [14, 18],
    [13, 18],
    [12, 18],
    [11, 18],
  ],
};

function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now() >>> 0;
}

interface Driver {
  readonly handlers: InputHandlers;
  frame(now: number): void;
}

export function createDriver(lcd: Lcd, phone: Phone, audio: Audio): Driver {
  let phase: Phase = lobby(performance.now());
  let state: GameState | null = null;
  // One mulberry32 stream per round, used only by createGame/step (ADR 0005).
  let rng: Rng = mulberry32(0);
  let votes = new Map<PlayerId, VoteQueue>();
  let nextTickAt = 0;
  let napping = false;
  let paused = false;
  let afterimage: Afterimage | null = null;
  let dirty = true;
  let lastVisible = true;

  lcd.onChange(() => {
    dirty = true;
  });

  /** Light the keypad for the live head, and dimly for the queued press (ADR 0007). */
  const showVotes = (): void => {
    const q = state?.alive && !napping ? votes.get(ME) : undefined;
    phone.showVotes(
      q ? KEYPAD_FOR_DIR[q.head.dir] : null,
      q?.pending ? KEYPAD_FOR_DIR[q.pending.dir] : null,
    );
  };

  const start = (now: number): void => {
    rng = mulberry32(freshSeed());
    state = createGame(rng);
    votes = new Map();
    napping = false;
    afterimage = null;
    phase = countdown(now);
    dirty = true;
    showVotes();
  };

  const tick = (s: GameState, now: number): void => {
    const live = expireVotes(votes, now);
    const { state: next, events } = step(s, live.live, rng);
    state = next;
    votes = settleVotes(votes, next.dir);
    napping = live.napping.has(ME);
    for (const e of events) {
      if (e.kind === "turn") audio.play("turn");
      else if (e.kind === "eat" || e.kind === "bonus-eat") audio.play("eat");
      else if (e.kind === "bonus-spawn") audio.play("bonus");
      else if (e.kind === "death") {
        audio.play("death");
        phase = dying(now);
      }
    }
    // Same length after a move means the tail cell was vacated: leave an afterimage.
    const last = s.snake.length - 1;
    const tail = s.snake[last];
    afterimage =
      next.alive && tail && next.snake.length === s.snake.length
        ? { cell: tail, bitmap: segmentSprite(s, last, false), at: now }
        : null;
    dirty = true;
    showVotes();
  };

  const action = (a: KeyAction, repeat: boolean): void => {
    if (a.kind === "ignore") return;
    const now = performance.now();
    if (a.kind === "mute") {
      const muted = audio.toggleMute();
      phone.setMuted(muted);
      if (!muted) audio.play("vote");
      return;
    }
    if (!repeat && canStart(phase)) start(now);
    if (a.kind !== "vote") return;
    votes.set(ME, pushVote(votes.get(ME), { dir: a.dir, at: now }));
    if (napping) {
      napping = false;
      dirty = true;
    }
    showVotes();
    if (!repeat) audio.play("vote");
  };

  document.addEventListener("visibilitychange", () => {
    const now = performance.now();
    if (document.hidden) {
      paused = phase.name === "playing" || phase.name === "countdown";
    } else if (paused) {
      // Solo nicety: come back to a 3-2-1 instead of a dead snake.
      paused = false;
      phase = countdown(now);
      dirty = true;
    }
  });

  const overlay = (now: number): Overlay | null => {
    const prompt =
      !lcd.motion.ramp || Math.floor(now / BLINK_PROMPT_MS) % 2 === 0 ? "PRESS ANY KEY" : "";
    if (phase.name === "lobby") return { kind: "text", lines: ["COMMITTEE SNAKE", "", prompt] };
    if (phase.name === "over") {
      return { kind: "text", lines: ["GAME OVER", `SCORE ${state?.score ?? 0}`, prompt] };
    }
    const n = countdownDigit(phase, now);
    return n === null ? null : { kind: "digit", n };
  };

  const frame = (now: number): void => {
    const before = phase.name;
    phase = advance(phase, now);
    if (phase.name !== before) {
      dirty = true;
      if (phase.name === "playing" && state) nextTickAt = phase.since + nextTickDelayMs(state);
      if (phase.name === "over") audio.play("dun");
    }
    if (phase.name === "playing" && !paused) {
      nextTickAt = runDueTicks(nextTickAt, now, () => {
        if (phase.name !== "playing" || !state) return null;
        tick(state, now);
        return nextTickDelayMs(state);
      });
    }
    const visible = visibleAt(phase, now);
    if (visible !== lastVisible) {
      lastVisible = visible;
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      const view = state ?? DEMO;
      lcd.drawBoard((ctx, l) => {
        drawHud(ctx, l, {
          score: state?.score ?? 0,
          len: view.snake.length,
          tps: state ? currentTps(state) : 3,
          napping,
        });
        drawBoard(ctx, l, view, { visible });
      });
    }
    lcd.composite(now, {
      power: lcd.motion.ramp ? powerAt(phase, now) : 1,
      afterimage,
      overlay: overlay(now),
    });
  };

  if (import.meta.env.DEV) {
    window.__cs = {
      get phase() {
        return phase.name;
      },
      get tick() {
        return state?.tick ?? 0;
      },
      get alive() {
        return state?.alive ?? true;
      },
      get score() {
        return state?.score ?? 0;
      },
      get layout() {
        return lcd.layout;
      },
      get canvas() {
        const c = phone.canvas;
        return {
          width: c.width,
          height: c.height,
          clientWidth: c.clientWidth,
          clientHeight: c.clientHeight,
        };
      },
      get audioState() {
        return audio.state;
      },
      get muted() {
        return audio.muted;
      },
      get motion() {
        return { ...lcd.motion };
      },
      get soundsPlayed() {
        return audio.played;
      },
    };
  }

  return { handlers: { gesture: () => audio.unlock(), action }, frame };
}
