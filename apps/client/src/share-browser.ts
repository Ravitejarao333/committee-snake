import type { BlameReport, PlayerId } from "@committee-snake/shared";
import { fitBlame } from "./render/blame";
import { drawBlame } from "./render/blame-draw";
import { drawBitmap, FONT, LCD_BG, LCD_PX } from "./render/lcd";
import { GLYPH } from "./render/sprites";
import { SHARE_H, SHARE_W, shareLayout } from "./share";

const FILE_NAME = "committee-snake-blame.png";

export interface ShareResult {
  via: "share" | "download" | "cancelled";
  w: number;
  h: number;
  bytes: number;
}

export type CopyResult = "ok" | "unsupported" | "failed";

/** Draw the Blame Screen as a 1200x630 share card with a URL footer, as a PNG. */
export function renderShare(
  report: BlameReport,
  names: ReadonlyMap<PlayerId, string>,
): Promise<Blob> {
  const footer = `committee-snake · ${location.host}`;
  const s = shareLayout(SHARE_W, SHARE_H, footer.length);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2D canvas unavailable"));
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = LCD_BG;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  drawBlame(ctx, fitBlame(report, names, s.area.w, s.area.h), s.area);
  ctx.fillStyle = LCD_PX;
  ctx.fillRect(s.footer.x, s.footer.y, s.footer.w, s.footer.h);
  ctx.fillStyle = LCD_BG;
  drawBitmap(ctx, GLYPH.snake, s.glyph.x, s.glyph.y, s.glyph.unit);
  ctx.font = `${s.text.size}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(footer, s.text.x, s.text.y);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

/** Native share sheet when it takes files, otherwise a download. */
export async function sharePng(png: Promise<Blob>): Promise<ShareResult> {
  const blob = await png;
  const done = (via: ShareResult["via"]): ShareResult => ({
    via,
    w: SHARE_W,
    h: SHARE_H,
    bytes: blob.size,
  });
  const file = new File([blob], FILE_NAME, { type: "image/png" });
  const data: ShareData = { files: [file], url: location.href };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return done("share");
    } catch {
      // Dismissed, or the sheet refused the file: nothing more to do.
      return done("cancelled");
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = FILE_NAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return done("download");
}

/** Copy the PNG to the clipboard (Ctrl/Cmd+C), where ClipboardItem exists. */
export async function copyPng(png: Promise<Blob>): Promise<CopyResult> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return "unsupported";
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return "ok";
  } catch {
    return "failed";
  }
}
