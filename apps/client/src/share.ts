import type { Rect } from "./render/bars";

/** Share card size: the usual link-preview shape. */
export const SHARE_W = 1200;
export const SHARE_H = 630;
const FOOTER_H = 70;
const MARGIN = 20;

interface ShareLayout {
  /** Where the Blame Screen is fitted (fitBlame + drawBlame). */
  area: Rect;
  footer: Rect;
  /** The 8x8 snake glyph: top-left and integer dot size. */
  glyph: { x: number; y: number; unit: number };
  /** Footer text: left edge, top and font size (a multiple of 8). */
  text: { x: number; y: number; size: number };
}

/**
 * Pure share-card layout: the Blame Screen above, a 70 px footer below with a snake glyph and
 * `chars` characters of text, centred together. Everything is whole device px.
 */
export function shareLayout(w: number, h: number, chars: number): ShareLayout {
  const footer = { x: 0, y: h - FOOTER_H, w, h: FOOTER_H };
  const area = { x: MARGIN, y: MARGIN, w: w - 2 * MARGIN, h: footer.y - 2 * MARGIN };
  const unit = Math.max(1, Math.floor((FOOTER_H - 2 * MARGIN) / 8));
  const glyphW = 8 * unit;
  // Largest multiple of 8 that fits the text beside the glyph (16 px at most), min 8.
  const room = w - 2 * MARGIN - glyphW;
  const size = Math.max(8, Math.min(16, 8 * Math.floor(room / Math.max(1, chars + 1) / 8)));
  const total = glyphW + size + chars * size;
  const x = Math.floor((w - total) / 2);
  const gy = footer.y + Math.floor((FOOTER_H - glyphW) / 2);
  return {
    area,
    footer,
    glyph: { x, y: gy, unit },
    text: { x: x + glyphW + size, y: footer.y + Math.floor((FOOTER_H - size) / 2), size },
  };
}
