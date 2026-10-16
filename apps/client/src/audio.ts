/**
 * Square-wave beeps (docs/PLAN.md §2.4). Nothing touches AudioContext,
 * window or localStorage at import time: `createAudio` does, on demand.
 */
export type SoundName = "vote" | "turn" | "eat" | "bonus" | "death" | "dun";

/** One note; `hz: 0` is a rest. */
interface Note {
  readonly hz: number;
  readonly ms: number;
}

export const SOUNDS: Readonly<Record<SoundName, readonly Note[]>> = {
  vote: [{ hz: 880, ms: 30 }],
  turn: [{ hz: 440, ms: 20 }],
  eat: [
    { hz: 660, ms: 60 },
    { hz: 990, ms: 60 },
  ],
  bonus: [
    { hz: 1320, ms: 40 },
    { hz: 0, ms: 40 },
    { hz: 1320, ms: 40 },
    { hz: 0, ms: 40 },
    { hz: 1320, ms: 40 },
  ],
  death: [
    { hz: 494, ms: 150 },
    { hz: 440, ms: 150 },
    { hz: 392, ms: 150 },
    { hz: 330, ms: 300 },
  ],
  dun: [{ hz: 110, ms: 250 }],
};

export const GAIN = 0.06;
/** Attack and release ramps, so square edges don't click. */
export const EDGE_MS = 2;

const STORAGE_KEY = "committee-snake:muted";

/** Stored preference wins; otherwise touch-only devices start muted. */
export function defaultMuted(stored: string | null, coarseOnly: boolean): boolean {
  if (stored === "1") return true;
  if (stored === "0") return false;
  return coarseOnly;
}

export interface Audio {
  /** Call from every user gesture: creates/resumes the AudioContext once allowed. */
  unlock(): void;
  play(name: SoundName): void;
  toggleMute(): boolean;
  readonly muted: boolean;
  /** AudioContext.state, or null before the first gesture. */
  readonly state: string | null;
  readonly played: number;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Private mode or storage disabled: the toggle still works for this visit.
  }
}

export function createAudio(): Audio {
  const coarseOnly =
    matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
  let muted = defaultMuted(readStored(), coarseOnly);
  let ctx: AudioContext | null = null;
  let played = 0;

  const note = (c: AudioContext, n: Note, t: number): void => {
    const dur = n.ms / 1000;
    const edge = EDGE_MS / 1000;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    osc.frequency.value = n.hz;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(GAIN, t + edge);
    gain.gain.setValueAtTime(GAIN, t + dur - edge);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur);
  };

  const unlock = (): void => {
    if (!ctx) {
      // Only create once sound is wanted and the browser counts this as a gesture,
      // otherwise Chrome logs an autoplay warning (touchstart isn't an activation).
      if (muted || navigator.userActivation?.isActive === false) return;
      try {
        ctx = new AudioContext();
      } catch {
        return;
      }
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  };

  return {
    unlock,
    play(name) {
      if (muted || !ctx || ctx.state !== "running") return;
      let t = ctx.currentTime + 0.005;
      for (const n of SOUNDS[name]) {
        if (n.hz > 0) note(ctx, n, t);
        t += n.ms / 1000;
      }
      played++;
    },
    toggleMute() {
      muted = !muted;
      writeStored(muted);
      unlock();
      return muted;
    },
    get muted() {
      return muted;
    },
    get state() {
      return ctx ? ctx.state : null;
    },
    get played() {
      return played;
    },
  };
}
