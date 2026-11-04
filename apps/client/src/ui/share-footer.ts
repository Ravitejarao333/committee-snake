/** A share card's rectangle, in whole canvas px. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Share card size: the usual link-preview shape. */
export const SHARE_W = 1200;
export const SHARE_H = 630;
const FOOTER_H = 70;
const MARGIN = 20;

interface ShareLayout {
  /** Where the game draws its card content. */
  area: Rect;
  footer: Rect;
  /** The 8x8 mark beside the footer text: top-left and integer dot size. */
  glyph: { x: number; y: number; unit: number };
  /** Footer text: left edge, top and font size (a multiple of 8). */
  text: { x: number; y: number; size: number };
}

/**
 * Pure share-card layout: the game's content above, a 70 px footer below with an 8x8 mark and
 * `chars` monospace characters of text, centred together. Everything is whole device px.
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

interface FooterStyle {
  label: string;
  font: string;
  /** Footer bar colour. */
  bar: string;
  /** Text and mark colour. */
  ink: string;
  /** Draws the 8x8 mark at (x, y) with `unit` px per dot, in the current fill style. */
  mark(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number): void;
}

/** The site footer every share card carries: a bar, the game's mark and `label`. */
export function drawShareFooter(
  ctx: CanvasRenderingContext2D,
  s: ShareLayout,
  style: FooterStyle,
): void {
  ctx.fillStyle = style.bar;
  ctx.fillRect(s.footer.x, s.footer.y, s.footer.w, s.footer.h);
  ctx.fillStyle = style.ink;
  style.mark(ctx, s.glyph.x, s.glyph.y, s.glyph.unit);
  ctx.font = `${s.text.size}px ${style.font}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(style.label, s.text.x, s.text.y);
}

/** The canvas as a PNG blob. */
export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}
