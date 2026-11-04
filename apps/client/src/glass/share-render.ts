import { type ShareResult, sharePng } from "../fx/share";
import { canvasPng, drawShareFooter, SHARE_H, SHARE_W, shareLayout } from "../ui/share-footer";
import type { Reveal } from "./reveals";

const RED = "#a3161a";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** 8x8 broken pane, matching the favicon. */
function mark(ctx: CanvasRenderingContext2D, x: number, y: number, u: number): void {
  ctx.fillRect(x, y, 8 * u, u);
  ctx.fillRect(x, y + 7 * u, 8 * u, u);
  ctx.fillRect(x, y, u, 8 * u);
  ctx.fillRect(x + 7 * u, y, u, 8 * u);
  for (const [cx, cy, w, h] of [
    [4, 2, 1, 2],
    [3, 4, 1, 1],
    [5, 4, 1, 2],
    [2, 5, 1, 1],
  ] as const) {
    ctx.fillRect(x + cx * u, y + cy * u, w * u, h * u);
  }
}

/** The reveal behind pane #`pane` as a 1200x630 card with the site footer. */
export function renderGlassShare(reveal: Reveal, pane: number): Promise<Blob> {
  const label = `break glass · ${location.host} · pane #${pane}`;
  const s = shareLayout(SHARE_W, SHARE_H, label.length);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2D canvas unavailable"));
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  const a = s.area;
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(a.x, a.y, a.w, a.h);
  ctx.fillStyle = "#fff";
  ctx.font = `800 26px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("IN CASE OF BOREDOM, BREAK GLASS.", SHARE_W / 2, a.y / 2 + 10);
  ctx.fillStyle = reveal.kind === "memo" ? RED : "#222";
  let size = 56;
  ctx.font = `700 ${size}px ${FONT}`;
  while (size > 24 && ctx.measureText(reveal.text).width > a.w - 80) {
    size -= 4;
    ctx.font = `700 ${size}px ${FONT}`;
  }
  ctx.fillText(reveal.text, SHARE_W / 2, a.y + a.h / 2);
  drawShareFooter(ctx, s, { label, font: FONT, bar: "#111", ink: "#fff", mark });
  return canvasPng(canvas);
}

export const shareReveal = (png: Promise<Blob>, pane: number): Promise<ShareResult> =>
  sharePng(png, { fileName: `break-glass-${pane}.png`, w: SHARE_W, h: SHARE_H });
