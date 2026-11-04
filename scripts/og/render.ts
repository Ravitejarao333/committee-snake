// Renders the 1200×630 Open Graph cards into apps/client/public/og/ with headless Chrome
// (`--screenshot`, no deps). The outputs are committed; rerun after changing a card:
//   node scripts/og/render.ts            (CHROME_PATH overrides the browser)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { iconSvg } from "../../apps/client/scripts/icons.ts";

const W = 1200;
const H = 630;
const HOST = "cheap-thrills.ravitejarao333.workers.dev";
const OUT = join(import.meta.dirname, "..", "..", "apps", "client", "public", "og");
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");

const coin = (px: number): string =>
  iconSvg().replace("<svg ", `<svg width="${px}" height="${px}" `);

/** The share-card footer, as every game's PNG share draws it. */
const footer = `<div class="foot">${coin(30)}<span>cheapthrills · ${HOST}</span></div>`;

const page = (css: string, body: string): string => `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; font-family: ${SANS}; }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; height: 70px; background: #111;
    display: flex; align-items: center; justify-content: center; gap: 14px; color: #fff;
    font: 500 22px ui-monospace, Menlo, monospace; }
  ${css}
</style></head><body>${body}${footer}</body></html>`;

/** A small seeded LCG, so every render draws the same crack and snake. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function crackSvg(cx: number, cy: number, w: number, h: number): string {
  const r = lcg(7);
  const paths: string[] = [];
  const rays = 11;
  const ends: [number, number][][] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + r() * 0.4;
    const len = 180 + r() * 260;
    const pts: [number, number][] = [[cx, cy]];
    for (let k = 1; k <= 5; k++) {
      const d = (len * k) / 5;
      const j = (r() - 0.5) * 0.25;
      pts.push([cx + Math.cos(a + j) * d, cy + Math.sin(a + j) * d]);
    }
    ends.push(pts);
    paths.push(`M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}`);
  }
  // Two broken rings joining neighbouring rays.
  for (const k of [1, 2]) {
    for (let i = 0; i < rays; i++) {
      if (r() < 0.3) continue;
      const a = ends[i]?.[k];
      const b = ends[(i + 1) % rays]?.[k];
      if (a && b)
        paths.push(`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
    }
  }
  const d = paths.join("");
  return `<svg class="crack" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="${d}" stroke="rgba(30,45,55,0.55)" stroke-width="4"/>
    <path d="${d}" stroke="rgba(255,255,255,0.95)" stroke-width="1.6" transform="translate(-1,-1)"/>
  </svg>`;
}

function snakeSvg(): string {
  const cell = 22;
  const cols = 22;
  const rows = 14;
  const body: [number, number][] = [];
  // A snake that turns three times, the way a committee steers.
  for (let x = 2; x <= 12; x++) body.push([x, 10]);
  for (let y = 9; y >= 4; y--) body.push([12, y]);
  for (let x = 13; x <= 18; x++) body.push([x, 4]);
  for (let y = 5; y <= 7; y++) body.push([18, y]);
  const rect = ([x, y]: [number, number]) =>
    `<rect x="${x * cell + 2}" y="${y * cell + 2}" width="${cell - 4}" height="${cell - 4}"/>`;
  return `<svg width="${cols * cell}" height="${rows * cell}" fill="#43523d">
    ${body.map(rect).join("")}
    <rect x="${16 * cell + 6}" y="${11 * cell + 6}" width="${cell - 12}" height="${cell - 12}"/>
    <rect x="1" y="1" width="${cols * cell - 2}" height="${rows * cell - 2}" fill="none"
      stroke="#43523d" stroke-width="4"/>
  </svg>`;
}

const CARDS: Record<string, string> = {
  hub: page(
    `body { background: #111; color: #ececec; }
     .wrap { position: absolute; inset: 0 0 70px; display: flex; align-items: center; gap: 64px;
       padding: 0 96px; }
     h1 { font-size: 112px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
     p { margin-top: 20px; font-size: 40px; color: #9a9a9a; }
     .games { display: flex; gap: 16px; margin-top: 44px; }
     .games span { padding: 12px 22px; border-radius: 12px; font-size: 28px; font-weight: 650; }
     .snake { background: #c7f0d8; color: #43523d; }
     .glass { background: #a3161a; color: #fff; }`,
    `<div class="wrap">${coin(260)}<div><h1>Cheap Thrills</h1>
      <p>Small games. Big feelings. No sign-up.</p>
      <div class="games"><span class="snake">Committee Snake</span><span class="glass">Break Glass</span></div>
    </div></div>`,
  ),
  snake: page(
    `body { background: #c7f0d8; color: #43523d; }
     .wrap { position: absolute; inset: 0 0 70px; display: flex; align-items: center; gap: 48px;
       padding: 0 64px; }
     h1 { font-size: 84px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.02; }
     p { margin-top: 24px; font-size: 32px; line-height: 1.3; max-width: 520px; }`,
    `<div class="wrap"><div><h1>Committee<br>Snake</h1>
      <p>Everyone votes. The snake dies. Someone gets blamed.</p></div>${snakeSvg()}</div>`,
  ),
  glass: page(
    `body { background: #a3161a; }
     .label { position: absolute; top: 26px; left: 0; right: 0; text-align: center; color: #fff;
       font-size: 30px; font-weight: 800; letter-spacing: 0.04em; }
     .pane { position: absolute; left: 56px; right: 56px; top: 84px; bottom: 112px;
       border-radius: 8px; overflow: hidden; box-shadow: inset 0 0 0 6px #7d0f12;
       background: linear-gradient(135deg, #d5e2e8, #8ea3ae); }
     .pane::before { content: ""; position: absolute; inset: 0;
       background: linear-gradient(105deg, transparent 18%, rgba(255,255,255,0.28) 18% 27%,
         transparent 27% 34%, rgba(255,255,255,0.16) 34% 37%, transparent 37%); }
     .crack { position: absolute; inset: 0; }
     h1 { position: absolute; left: 56px; bottom: 52px; font-size: 104px; font-weight: 800;
       letter-spacing: -0.02em; color: #1d2a30; }`,
    `<p class="label">IN CASE OF BOREDOM, BREAK GLASS.</p>
     <div class="pane">${crackSvg(760, 180, 1088, 434)}<h1>Break Glass</h1></div>`,
  ),
};

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "ct-og-"));
try {
  for (const [name, html] of Object.entries(CARDS)) {
    const src = join(tmp, `${name}.html`);
    const out = join(OUT, `${name}.png`);
    writeFileSync(src, html);
    execFileSync(
      chromePath,
      [
        "--headless=new",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--user-data-dir=${join(tmp, "profile")}`,
        `--window-size=${W},${H}`,
        `--screenshot=${out}`,
        `file://${src}`,
      ],
      { stdio: "ignore" },
    );
    process.stdout.write(`${out} ${statSync(out).size} bytes\n`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
