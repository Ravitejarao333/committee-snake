/**
 * The shared Web Audio engine: one AudioContext, created on the first user gesture, plus a
 * persisted mute. Nothing touches AudioContext, window or localStorage at import time.
 */

/** Stored preference wins; otherwise touch-only devices start muted. */
export function defaultMuted(stored: string | null, coarseOnly: boolean): boolean {
  if (stored === "1") return true;
  if (stored === "0") return false;
  return coarseOnly;
}

interface EngineOptions {
  /** localStorage key for the mute preference. */
  storageKey: string;
  /** Start muted on touch-only devices when nothing is stored. */
  touchStartsMuted: boolean;
}

export interface AudioEngine {
  /** Call from every user gesture: creates/resumes the AudioContext once allowed. */
  unlock(): void;
  /** The context, if sound is on and it's running; otherwise null (play nothing). */
  live(): AudioContext | null;
  toggleMute(): boolean;
  readonly muted: boolean;
  /** AudioContext.state, or null before the first gesture. */
  readonly state: string | null;
}

export function createAudioEngine(o: EngineOptions): AudioEngine {
  const readStored = (): string | null => {
    try {
      return localStorage.getItem(o.storageKey);
    } catch {
      return null;
    }
  };
  const writeStored = (muted: boolean): void => {
    try {
      localStorage.setItem(o.storageKey, muted ? "1" : "0");
    } catch {
      // Private mode or storage disabled: the toggle still works for this visit.
    }
  };
  const coarseOnly =
    o.touchStartsMuted &&
    matchMedia("(pointer: coarse)").matches &&
    !matchMedia("(any-pointer: fine)").matches;
  let muted = defaultMuted(readStored(), coarseOnly);
  let ctx: AudioContext | null = null;

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
    live: () => (!muted && ctx?.state === "running" ? ctx : null),
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
  };
}
