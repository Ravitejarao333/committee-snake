/**
 * Unlocks audio on the first real user activation. On touch, pointerdown isn't an activation
 * (Chrome and Safari only count the release), so the first touch unlocks at pointerup and its
 * sound plays then; every later hit plays at down. Mouse and keyboard unlock at once.
 * Shows a one-time hint until the first unlock.
 */

interface GateOptions {
  unlock(): void;
  /** The "tap to turn sound on" hint; hidden for good after the first unlock. */
  hint: HTMLElement | null;
  /** localStorage key remembering the hint was seen. */
  hintKey: string;
  /** Called once, right after the first unlock. */
  onUnlock?(): void;
}

export function gestureGate(o: GateOptions): void {
  let seen = false;
  try {
    seen = localStorage.getItem(o.hintKey) === "1";
  } catch {
    // No storage: show the hint each visit.
  }
  if (o.hint) o.hint.hidden = seen;
  let done = false;

  const fire = (): void => {
    o.unlock();
    if (done || navigator.userActivation?.isActive === false) return;
    done = true;
    o.hint?.classList.add("gone");
    try {
      localStorage.setItem(o.hintKey, "1");
    } catch {
      // Fine: the hint just shows again next time.
    }
    o.onUnlock?.();
  };

  const opts = { capture: true, passive: true } as const;
  addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse") fire();
    },
    opts,
  );
  addEventListener("pointerup", fire, opts);
  addEventListener("touchend", fire, opts);
  addEventListener("keydown", fire, opts);
}
