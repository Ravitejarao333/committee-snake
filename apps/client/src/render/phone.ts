/**
 * Builds the candybar frame: earpiece, bezel, a status strip on the LCD
 * colour, the LCD slot and a 3x4 keypad. Original shape; no logos.
 */
export interface Phone {
  readonly canvas: HTMLCanvasElement;
  /** The element the LCD measures to size itself. */
  readonly slot: HTMLElement;
  readonly keypad: HTMLElement;
  light(key: string, on: boolean): void;
  setMuted(muted: boolean): void;
  setCapacity(n: number, max: number): void;
}

interface KeySpec {
  key: string;
  letters: string;
  label?: string;
  /** Focusable but inactive this milestone. */
  soon?: boolean;
}

const KEYS: readonly KeySpec[] = [
  { key: "1", letters: "" },
  { key: "2", letters: "ABC", label: "Vote up" },
  { key: "3", letters: "DEF" },
  { key: "4", letters: "GHI", label: "Vote left" },
  { key: "5", letters: "JKL", label: "Emotes (coming soon)", soon: true },
  { key: "6", letters: "MNO", label: "Vote right" },
  { key: "7", letters: "PQRS" },
  { key: "8", letters: "TUV", label: "Vote down" },
  { key: "9", letters: "WXYZ" },
  { key: "*", letters: "", label: "Toggle sound" },
  { key: "0", letters: "+" },
  { key: "#", letters: "", label: "Leave room (unavailable)", soon: true },
];

function keyHtml(k: KeySpec): string {
  const face = `<span class="key-d">${k.key}</span><span class="key-l">${k.letters}</span>`;
  if (!k.label) {
    return `<button type="button" class="key key-inert" data-key="${k.key}" tabindex="-1" aria-hidden="true">${face}</button>`;
  }
  const soon = k.soon ? ' aria-disabled="true"' : "";
  const pressed = k.key === "*" ? ' aria-pressed="true"' : "";
  return `<button type="button" class="key" data-key="${k.key}" aria-label="${k.label}"${soon}${pressed}>${face}</button>`;
}

const SPEAKER = `<svg class="glyph" viewBox="0 0 9 7" aria-hidden="true" shape-rendering="crispEdges"><path d="M0 2h2v3H0zM2 2h1V1h1V0h1v7H4V6H3V5H2z"/><path class="on" d="M6 2h1v3H6zM8 1h1v5H8z"/><path class="off" d="M6 1h1v1H6zM7 2h1v1H7zM8 1h1v1H8zM6 5h1v1H6zM7 4h1v1H7zM8 5h1v1H8zM7 3h1v1H7z"/></svg>`;

const TEMPLATE = `
<div class="phone">
  <div class="earpiece" aria-hidden="true"></div>
  <div class="bezel">
    <div class="screen">
      <div class="status" aria-hidden="true">
        <span class="signal"><i></i><i></i><i></i><i></i></span><span class="net">local</span>
        <span class="mute">${SPEAKER}</span>
        <span class="cap">1/24</span><span class="battery"><i></i></span>
      </div>
      <div class="lcd-slot"><canvas id="lcd" role="img" aria-label="Snake game screen"></canvas></div>
    </div>
  </div>
  <div class="keypad" role="group" aria-label="Keypad">${KEYS.map(keyHtml).join("")}</div>
  <div class="chin" aria-hidden="true"></div>
</div>`;

function must<T extends Element>(root: ParentNode, sel: string, type: new () => T): T {
  const el = root.querySelector(sel);
  if (!(el instanceof type)) throw new Error(`phone: missing ${sel}`);
  return el;
}

export function createPhone(app: HTMLElement): Phone {
  app.innerHTML = TEMPLATE;
  const canvas = must(app, "#lcd", HTMLCanvasElement);
  const slot = must(app, ".lcd-slot", HTMLElement);
  const keypad = must(app, ".keypad", HTMLElement);
  const mute = must(app, ".mute", HTMLElement);
  const battery = must(app, ".battery i", HTMLElement);
  const cap = must(app, ".cap", HTMLElement);
  const buttons = new Map<string, HTMLButtonElement>();
  for (const b of keypad.querySelectorAll<HTMLButtonElement>("button[data-key]")) {
    const k = b.dataset.key;
    if (k) buttons.set(k, b);
  }
  const star = buttons.get("*");

  return {
    canvas,
    slot,
    keypad,
    light(key, on) {
      buttons.get(key)?.classList.toggle("lit", on);
    },
    setMuted(muted) {
      mute.classList.toggle("is-muted", muted);
      // Pressed = sound on, so "Toggle sound, pressed" reads naturally.
      star?.setAttribute("aria-pressed", String(!muted));
    },
    setCapacity(n, max) {
      cap.textContent = `${n}/${max}`;
      battery.style.width = `${Math.round((Math.min(n, max) / max) * 100)}%`;
    },
  };
}
