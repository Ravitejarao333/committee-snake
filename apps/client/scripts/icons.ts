/**
 * The Cheap Thrills mark, a cracked coin, as favicon.svg, favicon.ico (16/32/48 PNG frames) and
 * apple-touch-icon.png (vite.config.ts emits them; scripts/og/ draws the mark on the OG cards). One geometry feeds both the SVG and
 * a small supersampling rasterizer, so the files can't drift. No image dependencies: PNG is
 * zlib + CRC32, ICO is a header around the PNGs.
 */
import { deflateSync } from "node:zlib";

type Pt = readonly [number, number];
type Shape =
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string }
  | { kind: "poly"; pts: readonly Pt[]; fill: string };

/** Drawn in a 32-unit square, back to front. */
const VIEW = 32;
const SHAPES: readonly Shape[] = [
  { kind: "circle", cx: 16, cy: 16, r: 15, fill: "#b8780c" },
  { kind: "circle", cx: 16, cy: 16, r: 12.5, fill: "#f5c03a" },
  // A jagged crack top to bottom, inside the rim.
  {
    kind: "poly",
    pts: [
      [17.5, 1.5],
      [12.5, 10],
      [17.5, 14.5],
      [12, 21.5],
      [15, 30.5],
      [16.5, 30.5],
      [15.5, 22],
      [21.5, 14],
      [16.5, 10],
      [19, 1.5],
    ],
    fill: "#2b1a03",
  },
];
/** apple-touch-icon: iOS wants an opaque square, so the coin sits on the hub's background. */
const TOUCH_BG = "#111111";
const TOUCH_SIZE = 180;
const TOUCH_PAD = 22;
const ICO_SIZES = [16, 32, 48] as const;

export function iconSvg(): string {
  const body = SHAPES.map((s) =>
    s.kind === "circle"
      ? `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"/>`
      : `<path fill="${s.fill}" d="M${s.pts.map(([x, y]) => `${x} ${y}`).join("L")}Z"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}">${body}</svg>`;
}

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

function inside(s: Shape, x: number, y: number): boolean {
  if (s.kind === "circle") return (x - s.cx) ** 2 + (y - s.cy) ** 2 <= s.r ** 2;
  let hit = false;
  for (let i = 0, j = s.pts.length - 1; i < s.pts.length; j = i++) {
    const [xi, yi] = s.pts[i] as Pt;
    const [xj, yj] = s.pts[j] as Pt;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * RGBA pixels of the mark at `size` px, 8×8 samples per pixel. `pad` px of margin on each side;
 * `bg` fills the square first (otherwise it's transparent).
 */
export function rasterize(size: number, pad = 0, bg?: string): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const ss = 8;
  const scale = VIEW / (size - 2 * pad);
  const fills = SHAPES.map((s) => rgb(s.fill));
  const back = bg ? rgb(bg) : null;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px - pad + (sx + 0.5) / ss) * scale;
          const y = (py - pad + (sy + 0.5) / ss) * scale;
          let c = back;
          SHAPES.forEach((s, i) => {
            if (inside(s, x, y)) c = fills[i] ?? c;
          });
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a++;
        }
      }
      const o = (py * size + px) * 4;
      if (a) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((255 * a) / (ss * ss));
    }
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 255] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** An 8-bit RGBA PNG. */
export function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++)
    rows.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** An ICO whose frames are PNGs (supported by every browser that reads favicon.ico). */
export function encodeIco(frames: readonly { size: number; png: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(frames.length, 4);
  let offset = head.length;
  frames.forEach((f, i) => {
    const e = 6 + 16 * i;
    head[e] = f.size % 256;
    head[e + 1] = f.size % 256;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(f.png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += f.png.length;
  });
  return Buffer.concat([head, ...frames.map((f) => f.png)]);
}

/** Every icon file, by its path at the site root. */
export function iconFiles(): Record<string, string | Buffer> {
  const at = (size: number) => encodePng(size, size, rasterize(size));
  return {
    "favicon.svg": iconSvg(),
    "favicon.ico": encodeIco(ICO_SIZES.map((size) => ({ size, png: at(size) }))),
    "apple-touch-icon.png": encodePng(
      TOUCH_SIZE,
      TOUCH_SIZE,
      rasterize(TOUCH_SIZE, TOUCH_PAD, TOUCH_BG),
    ),
  };
}
