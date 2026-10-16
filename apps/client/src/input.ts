import { actionForKey, KEYPAD_FOR_DIR, type KeyAction } from "./keymap";

/** Minimum time a key stays lit, so a quick tap is still visible. */
const MIN_FLASH_MS = 90;

export interface InputHandlers {
  /** Every gesture, before the action: lets audio unlock. */
  gesture(): void;
  /** `repeat` is a held key auto-repeating: refresh the vote silently. */
  action(a: KeyAction, repeat: boolean): void;
}

interface InputDeps {
  keypad: HTMLElement;
  light(key: string, on: boolean): void;
}

function padKeyFor(a: KeyAction): string | null {
  if (a.kind === "vote") return KEYPAD_FOR_DIR[a.dir];
  if (a.kind === "mute") return "*";
  if (a.kind === "emote") return "5";
  return null;
}

function actionForPad(key: string): KeyAction {
  switch (key) {
    case "2":
      return { kind: "vote", dir: "U" };
    case "4":
      return { kind: "vote", dir: "L" };
    case "6":
      return { kind: "vote", dir: "R" };
    case "8":
      return { kind: "vote", dir: "D" };
    case "*":
      return { kind: "mute" };
    case "5":
      return { kind: "emote" };
    default:
      return { kind: "ignore" }; // "#": leave room, unavailable offline
  }
}

export function attachInput(deps: InputDeps, on: InputHandlers): void {
  /** pad key -> sources holding it down (key codes or pointer ids). */
  const held = new Map<string, Set<string>>();
  const litAt = new Map<string, number>();
  const timers = new Map<string, number>();

  const press = (pad: string, source: string): void => {
    let set = held.get(pad);
    if (!set) {
      set = new Set();
      held.set(pad, set);
    }
    set.add(source);
    const t = timers.get(pad);
    if (t !== undefined) clearTimeout(t);
    litAt.set(pad, performance.now());
    deps.light(pad, true);
  };

  const release = (pad: string, source: string): void => {
    const set = held.get(pad);
    if (!set?.delete(source) || set.size > 0) return;
    const wait = MIN_FLASH_MS - (performance.now() - (litAt.get(pad) ?? 0));
    const off = (): void => {
      timers.delete(pad);
      if ((held.get(pad)?.size ?? 0) === 0) deps.light(pad, false);
    };
    if (wait <= 0) off();
    else timers.set(pad, window.setTimeout(off, wait));
  };

  const releaseAll = (): void => {
    for (const [pad, set] of held) for (const s of [...set]) release(pad, s);
  };

  const fromKeypad = (t: EventTarget | null): t is HTMLButtonElement =>
    t instanceof HTMLButtonElement && deps.keypad.contains(t);

  window.addEventListener("keydown", (e) => {
    // Enter/Space on a focused keypad button arrive as a click (detail 0) instead.
    if (fromKeypad(e.target) && (e.key === "Enter" || e.key === " ")) return;
    const a = actionForKey(e);
    if (a.kind === "ignore") return;
    if (a.kind !== "other" || e.key === " ") e.preventDefault();
    if (e.repeat) {
      if (a.kind === "vote") on.action(a, true);
      return;
    }
    on.gesture();
    const pad = padKeyFor(a);
    if (pad) press(pad, e.code);
    on.action(a, false);
  });

  window.addEventListener("keyup", (e) => {
    const pad = padKeyFor(actionForKey({ key: e.key, code: e.code }));
    if (pad) release(pad, e.code);
    // Shift released before 8: the "*" press was stored under the same code.
    if (pad !== "*") release("*", e.code);
  });
  window.addEventListener("blur", releaseAll);

  const padOf = (t: EventTarget | null): string | null => {
    const b = t instanceof Element ? t.closest("button[data-key]") : null;
    if (!(b instanceof HTMLButtonElement) || !deps.keypad.contains(b)) return null;
    if (b.classList.contains("key-inert")) return null;
    return b.dataset.key ?? null;
  };

  deps.keypad.addEventListener("pointerdown", (e) => {
    const pad = padOf(e.target);
    if (!pad || e.button > 0) return;
    e.preventDefault(); // no focus ring flash, no text selection on long-press
    if (e.target instanceof Element) e.target.setPointerCapture(e.pointerId);
    on.gesture();
    press(pad, `p${e.pointerId}`);
    on.action(actionForPad(pad), false);
  });
  const up = (e: PointerEvent): void => {
    on.gesture(); // pointerup is a user activation for touch, pointerdown isn't
    for (const pad of held.keys()) release(pad, `p${e.pointerId}`);
  };
  deps.keypad.addEventListener("pointerup", up);
  deps.keypad.addEventListener("pointercancel", up);

  deps.keypad.addEventListener("click", (e) => {
    if (e.detail !== 0) return; // real pointer clicks were handled on pointerdown
    const pad = padOf(e.target);
    if (!pad) return;
    on.gesture();
    press(pad, "kbd");
    release(pad, "kbd");
    on.action(actionForPad(pad), false);
  });
}
