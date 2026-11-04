import { avatarBits } from "@committee-snake/shared";
import { avatarBitmap } from "./avatar";
import type { Rect } from "./bars";
import { type BlameFit, type Line, lineCols, softkeyRect } from "./blame";
import { drawBitmap, FONT, LCD_BG, LCD_PX } from "./lcd";
import { GLYPH, rotate } from "./sprites";

/** The arrow glyph points up; these turns aim it at each direction. */
const ARROW_TURN = { U: "R", R: "D", D: "L", L: "U" } as const;
const FATAL = "FATAL";

const centred = (l: Line): boolean => l.kind === "text" || l.kind === "caption";

/**
 * Draw a fitted Blame Screen into `area` of any 2D context (the LCD or the share card).
 * Titles and the caption are centred; tally, people and award rows share one left edge.
 */
export function drawBlame(ctx: CanvasRenderingContext2D, fit: BlameFit, area: Rect): void {
  const { size, lineH } = fit;
  const u = size / 8;
  const body = fit.lines.filter((l) => l.kind !== "softkey");
  const blockCols = Math.max(0, ...body.filter((l) => !centred(l)).map(lineCols));
  const left = area.x + Math.floor((area.w - blockCols * size) / 2);
  const mid = area.x + Math.floor(area.w / 2);
  const top = area.y + Math.max(0, Math.floor((area.h - lineH - body.length * lineH) / 2));
  const pad = (lineH - size) / 2;
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = "top";
  ctx.fillStyle = LCD_PX;

  const text = (s: string, x: number, y: number, align: CanvasTextAlign = "left"): void => {
    ctx.textAlign = align;
    ctx.fillText(s, x, y + pad);
  };

  body.forEach((l, i) => {
    const y = top + i * lineH;
    const gy = y + pad;
    switch (l.kind) {
      case "blank":
        return;
      case "text":
      case "caption":
        text(l.text, mid, y, "center");
        return;
      case "tally": {
        drawBitmap(ctx, rotate(GLYPH.arrow, ARROW_TURN[l.dir]), left, gy, u);
        text(l.text, left + 2 * size, y);
        if (!l.fatal) return;
        // FATAL as a small inverse tag.
        const tx = left + (3 + l.text.length) * size;
        ctx.fillRect(tx, y, (FATAL.length + 2) * size, lineH);
        ctx.fillStyle = LCD_BG;
        text(FATAL, tx + size, y);
        ctx.fillStyle = LCD_PX;
        return;
      }
      case "people":
        drawBitmap(ctx, GLYPH[l.glyph], left, gy, u);
        text(l.text, left + 2 * size, y);
        return;
      case "award":
        l.players.forEach((id, k) => {
          drawBitmap(ctx, avatarBitmap(avatarBits(id)), left + k * size, gy, u);
        });
        text(l.text, left + (l.players.length + 1) * size, y);
        return;
    }
  });

  const key = fit.lines.find((l) => l.kind === "softkey");
  if (!key) return;
  const r = softkeyRect(fit, area.w, area.h);
  ctx.fillRect(area.x + r.x, area.y + r.y, r.w, r.h);
  ctx.fillStyle = LCD_BG;
  text(key.text, area.x + r.x + Math.floor(r.w / 2), area.y + r.y, "center");
  ctx.fillStyle = LCD_PX;
}
