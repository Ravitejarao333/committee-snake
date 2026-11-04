import type { BlameReport, PlayerId } from "@committee-snake/shared";
import { type ShareResult, sharePng } from "../fx/share";
import { canvasPng, drawShareFooter, SHARE_H, SHARE_W, shareLayout } from "../ui/share-footer";
import { SITE_NAME } from "../ui/site";
import { fitBlame } from "./render/blame";
import { drawBlame } from "./render/blame-draw";
import { drawBitmap, FONT, LCD_BG, LCD_PX } from "./render/lcd";
import { GLYPH } from "./render/sprites";

const FILE_NAME = "committee-snake-blame.png";

/** Draw the Blame Screen as a 1200x630 share card with a URL footer, as a PNG. */
export function renderShare(
  report: BlameReport,
  names: ReadonlyMap<PlayerId, string>,
): Promise<Blob> {
  const label = `${SITE_NAME} · ${location.host}`;
  const s = shareLayout(SHARE_W, SHARE_H, label.length);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2D canvas unavailable"));
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = LCD_BG;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  drawBlame(ctx, fitBlame(report, names, s.area.w, s.area.h), s.area);
  drawShareFooter(ctx, s, {
    label,
    font: FONT,
    bar: LCD_PX,
    ink: LCD_BG,
    mark: (c, x, y, unit) => drawBitmap(c, GLYPH.snake, x, y, unit),
  });
  return canvasPng(canvas);
}

/** Share the Blame Screen PNG: native sheet, else a download. */
export const shareBlame = (png: Promise<Blob>): Promise<ShareResult> =>
  sharePng(png, { fileName: FILE_NAME, w: SHARE_W, h: SHARE_H });
