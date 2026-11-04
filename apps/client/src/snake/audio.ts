/**
 * Square-wave beeps (docs/PLAN.md §2.4) on the shared engine (fx/audio). Nothing touches
 * AudioContext, window or localStorage at import time: `createAudio` does, on demand.
 */
import { createAudioEngine } from "../fx/audio";

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

export function createAudio(): Audio {
  const engine = createAudioEngine({ storageKey: STORAGE_KEY, touchStartsMuted: true });
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

  return {
    unlock: engine.unlock,
    play(name) {
      const ctx = engine.live();
      if (!ctx) return;
      let t = ctx.currentTime + 0.005;
      for (const n of SOUNDS[name]) {
        if (n.hz > 0) note(ctx, n, t);
        t += n.ms / 1000;
      }
      played++;
    },
    toggleMute: engine.toggleMute,
    get muted() {
      return engine.muted;
    },
    get state() {
      return engine.state;
    },
    get played() {
      return played;
    },
  };
}
