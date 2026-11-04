import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, encodeIco, encodePng, iconFiles, iconSvg, rasterize } from "./icons.ts";

const px = (img: Uint8Array, size: number, x: number, y: number) =>
  Array.from(img.subarray((y * size + x) * 4, (y * size + x) * 4 + 4));

describe("icon mark", () => {
  it("is one small SVG with no text or images", () => {
    const svg = iconSvg();
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 32 32">/);
    expect(svg).not.toMatch(/<text|<image|href/);
    expect(svg.length).toBeLessThan(600);
  });

  it("reads at 16 px: transparent corners, a gold face and a dark crack through it", () => {
    const img = rasterize(16);
    expect(px(img, 16, 0, 0)[3]).toBe(0);
    const face = px(img, 16, 4, 8);
    expect(face[3]).toBe(255);
    expect(face[0]).toBeGreaterThan(200);
    // Some pixel in the middle row is mostly crack.
    const row = Array.from({ length: 6 }, (_, i) => px(img, 16, 5 + i, 8));
    expect(Math.min(...row.map((p) => p[0] ?? 255))).toBeLessThan(140);
  });

  it("fills the background for the touch icon", () => {
    const img = rasterize(180, 22, "#111111");
    expect(px(img, 180, 0, 0)).toEqual([17, 17, 17, 255]);
  });
});

describe("encoders", () => {
  it("crc32 matches the reference check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("writes a PNG whose IHDR and pixels round-trip", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]);
    const png = encodePng(2, 1, rgba);
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(1);
    const idatLen = png.readUInt32BE(33);
    const rows = inflateSync(png.subarray(41, 41 + idatLen));
    expect(Array.from(rows)).toEqual([0, ...rgba]);
  });

  it("wraps PNG frames in an ICO directory", () => {
    const a = encodePng(16, 16, rasterize(16));
    const b = encodePng(32, 32, rasterize(32));
    const ico = encodeIco([
      { size: 16, png: a },
      { size: 32, png: b },
    ]);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    expect(ico[6]).toBe(16);
    expect(ico.readUInt32LE(6 + 12)).toBe(38);
    expect(ico.readUInt32LE(22 + 12)).toBe(38 + a.length);
    expect(ico.subarray(38, 38 + a.length).equals(a)).toBe(true);
  });

  it("keeps every icon file small", () => {
    const files = iconFiles();
    expect(Object.keys(files).sort()).toEqual([
      "apple-touch-icon.png",
      "favicon.ico",
      "favicon.svg",
    ]);
    for (const body of Object.values(files)) expect(body.length).toBeLessThan(8 * 1024);
  });
});
