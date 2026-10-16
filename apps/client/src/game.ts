import {
  type BlameReport,
  blameReport,
  countVotes,
  createGame,
  currentTps,
  type Dir,
  expireVotes,
  type GameState,
  mulberry32,
  nextTickDelayMs,
  type PlayerId,
  pushVote,
  type Rng,
  recordTick,
  settleVotes,
  step,
  type VoteCount,
  type VoteQueue,
} from "@committee-snake/shared";
import type { Audio } from "./audio";
import type { InputHandlers } from "./input";
import type { KeyAction } from "./keymap";
import { isShareKey } from "./keymap";
import {
  advance,
  canSkip,
  canStart,
  countdown,
  countdownDigit,
  dying,
  lobby,
  type Phase,
  powerAt,
  visibleAt,
} from "./phase";
import { createBarsPainter } from "./render/bars-draw";
import { fitBlame, lineText, softkeyRect } from "./render/blame";
import { drawBlame } from "./render/blame-draw";
import type { LcdLayout } from "./render/layout";
import {
  type Afterimage,
  drawHud,
  GRID,
  type Layer,
  type Lcd,
  type Motion,
  type Overlay,
} from "./render/lcd";
import type { Phone } from "./render/phone";
import { type BoardView, drawBoard, segmentSprite } from "./render/snake";
import { keyVoters, leaders, rosterEntries } from "./roster";
import { runDueTicks } from "./scheduler";
import { autoStartAt, claim, lobbyText, MAX_SEATS, type Seat, type Seats, seatIds } from "./seats";
import { type CopyResult, copyPng, renderShare, type ShareResult, sharePng } from "./share-browser";

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
  readonly seats: { id: PlayerId; name: string }[];
  readonly lobbyText: string[];
  readonly bars: {
    counts: Record<string, number>;
    nonsense: number;
    byDir: Record<string, PlayerId[]>;
  };
  readonly blame: BlameReport | null;
  readonly blameText: string[];
  readonly lastShare: ShareResult | null;
  readonly lastCopy: CopyResult | null;
  readonly hidden: boolean;
}

declare global {
  interface Window {
    __cs?: CsDevHook;
  }
}

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
  let seats: Seats = [];
  let nextTickAt = 0;
  let paused = false;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const paintBars = createBarsPainter(GRID);
  /** Bars snapshot, refreshed on every press and every tick. */
  let bars: VoteCount = countVotes(new Map(), "R");
  let winner: Dir | null = null;
  let tickAt = Number.NEGATIVE_INFINITY;
  let afterimage: Afterimage | null = null;
  let dirty = true;
  let lastVisible = true;
  let blame: BlameReport | null = null;
  let lastShare: ShareResult | null = null;
  let lastCopy: CopyResult | null = null;
  // Round stats for awards.
  let stats = new Map();

  lcd.onChange(() => {
    dirty = true;
  });

  /** Bars, roster strip and keypad glow/dots, from the live votes (every press and tick). */
  const showVotes = (now: number): void => {
    const live = state?.alive ? expireVotes(votes, now).live : new Map<PlayerId, never>();
    bars = countVotes(live, state?.dir ?? "R");
    phone.setRoster(rosterEntries(seats, votes, live));
    phone.showVotes(leaders(bars), keyVoters(seats, live));
  };

  const barsLayer: Layer = (ctx, l, now) =>
    paintBars(ctx, l, { count: bars, order: seatIds(seats), winner, tickAt }, now, lcd.motion);

  const blameLayer: Layer = (ctx, l) => {
    if (!blame) return;
    const names = new Map(seats.map((s) => [s.id, s.name]));
    const fit = fitBlame(blame, names, l.widthDev, l.heightDev);
    drawBlame(ctx, fit, { x: 0, y: 0, w: l.widthDev, h: l.heightDev });
  };

  const join = (seat: Seat, now: number): void => {
    const next = claim(seats, seat, now);
    if (next === seats) return;
    seats = next;
    phone.setCapacity(seats.length, MAX_SEATS);
    showVotes(now);
  };

  const start = (now: number): void => {
    rng = mulberry32(freshSeed());
    state = createGame(rng);
    votes = new Map();
    winner = null;
    afterimage = null;
    blame = null;
    lastShare = null;
    lastCopy = null;
    stats = new Map();
    phase = countdown(now);
    dirty = true;
    showVotes(now);
  };

  const tick = (s: GameState, now: number): void => {
    const live = expireVotes(votes, now);
    const { state: next, events } = step(s, live.live, rng);
    state = next;
    // Record tick stats before settling votes.
    stats = recordTick(stats, seatIds(seats), live.live, next.dir);
    votes = settleVotes(votes, next.dir);
    winner = next.dir;
    tickAt = now;
    for (const e of events) {
      if (e.kind === "turn") audio.play("turn");
      else if (e.kind === "eat" || e.kind === "bonus-eat") audio.play("eat");
      else if (e.kind === "bonus-spawn") audio.play("bonus");
      else if (e.kind === "death") {
        audio.play("death");
        // Generate the blame report immediately.
        blame = blameReport({ state: next, fatal: e.tally, finalVotes: live.live, stats }, rng);
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
    showVotes(now);
  };

  /** Enter, Space or a tap on the LCD: P1 joins if nobody has, then the round starts. */
  const startNow = (now: number): void => {
    if (seats.length === 0) join(0, now);
    start(now);
  };

  const action = (a: KeyAction, repeat: boolean): boolean => {
    if (a.kind === "ignore") return false;
    const now = performance.now();
    if (a.kind === "mute") {
      const muted = audio.toggleMute();
      phone.setMuted(muted);
      if (!muted) audio.play("vote");
      return true;
    }
    if (a.kind === "copy") {
      if (phase.name === "blame" && blame) {
        const names = new Map(seats.map((s) => [s.id, s.name]));
        copyPng(renderShare(blame, names)).then((result) => {
          lastCopy = result;
        });
        return true;
      }
      return false;
    }
    if (phase.name === "blame" && canSkip(phase, now)) {
      if (!repeat) phase = lobby(now);
      dirty = true;
      return true;
    }
    if (a.kind === "start" && canStart(phase)) {
      if (!repeat) startNow(now);
      return true;
    }
    if (phase.name === "blame" && isShareKey(a)) {
      if (blame) {
        const names = new Map(seats.map((s) => [s.id, s.name]));
        sharePng(renderShare(blame, names)).then((result) => {
          lastShare = result;
        });
      }
      return true;
    }
    if (a.kind !== "vote") return true;
    join(a.seat, now);
    if (phase.name === "lobby") return true;
    const id = seats.find((s) => s.seat === a.seat)?.id;
    if (!id) return true;
    votes.set(id, pushVote(votes.get(id), { dir: a.dir, at: now }));
    showVotes(now);
    if (!repeat) audio.play("vote");
    return true;
  };

  const lcdTap = (x: number, y: number): void => {
    const now = performance.now();
    if (phase.name === "lobby") {
      startNow(now);
    } else if (phase.name === "blame" && blame) {
      // Check if the tap hit the SHARE soft key.
      const names = new Map(seats.map((s) => [s.id, s.name]));
      const fit = fitBlame(blame, names, lcd.layout.widthDev, lcd.layout.heightDev);
      const keyRect = softkeyRect(fit, lcd.layout.widthDev, lcd.layout.heightDev);
      if (
        x >= keyRect.x &&
        x < keyRect.x + keyRect.w &&
        y >= keyRect.y &&
        y < keyRect.y + keyRect.h
      ) {
        sharePng(renderShare(blame, names)).then((result) => {
          lastShare = result;
        });
      }
    }
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
    if (phase.name === "lobby") {
      const lines = lobbyText(seats, coarse);
      // The last line ("ENTER TO START") blinks.
      if (!prompt) lines[lines.length - 1] = "";
      return { kind: "text", lines };
    }
    const n = countdownDigit(phase, now);
    return n === null ? null : { kind: "digit", n };
  };

  const frame = (now: number): void => {
    const before = phase.name;
    phase = advance(phase, now);
    if (phase.name === "lobby") {
      const at = autoStartAt(seats, phase.since);
      if (at !== null && now >= at) start(now);
    }
    if (phase.name !== before) {
      dirty = true;
      if (phase.name === "playing" && state) nextTickAt = phase.since + nextTickDelayMs(state);
      if (phase.name === "blame") audio.play("dun");
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
        });
        drawBoard(ctx, l, view, { visible });
      });
    }
    lcd.composite(now, {
      power: lcd.motion.ramp ? powerAt(phase, now) : 1,
      board: phase.name !== "blame",
      afterimage,
      overlay: overlay(now),
      layers: phase.name === "blame" ? [blameLayer] : [barsLayer],
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
      get seats() {
        return seats.map(({ id, name }) => ({ id, name }));
      },
      get lobbyText() {
        return lobbyText(seats, coarse);
      },
      get bars() {
        return { counts: bars.counts, nonsense: bars.nonsense, byDir: bars.byDir };
      },
      get blame() {
        return blame;
      },
      get blameText() {
        if (!blame) return [];
        const names = new Map(seats.map((s) => [s.id, s.name]));
        const fit = fitBlame(blame, names, lcd.layout.widthDev, lcd.layout.heightDev);
        return fit.lines.map(lineText);
      },
      get lastShare() {
        return lastShare;
      },
      get lastCopy() {
        return lastCopy;
      },
      get hidden() {
        return document.hidden;
      },
    };
  }

  phone.setCapacity(0, MAX_SEATS);
  showVotes(performance.now());
  return { handlers: { gesture: () => audio.unlock(), action, lcdTap }, frame };
}
