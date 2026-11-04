#!/usr/bin/env node
// Route smoke test against the built site behind the Worker (no browser, no deps).
// 1. pnpm --filter @committee-snake/server dev     (builds the client, serves http://localhost:8787)
// 2. node scripts/smoke/routes.mjs [url] [oldUrl]
// After a deploy: node scripts/smoke/routes.mjs https://cheap-thrills.<sub>.workers.dev \
//   https://committee-snake.<sub>.workers.dev  (oldUrl adds the old host's 301 checks).
// Each page is told apart by its <meta name="page"> tag and its <title>. The routing itself is Workers Static
// Assets defaults (ADR 0008): auto-trailing-slash for snake.html/glass.html, and the SPA fallback
// to index.html (the hub) for unknown paths. Exits 1 on any failed check.
const base = process.argv[2] ?? "http://localhost:8787";
const old = process.argv[3];
const TITLES = {
  hub: "Cheap Thrills",
  snake: "Committee Snake · Cheap Thrills",
  glass: "Break Glass · Cheap Thrills",
};

const say = (line) => process.stdout.write(`${line}\n`);
const failures = [];
const check = (ok, label) => {
  say(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) failures.push(label);
};

const get = (path) => fetch(new URL(path, base), { redirect: "manual" });
const pageOf = (html) => /<meta name="page" content="([a-z]+)"/.exec(html)?.[1] ?? null;
const titleOf = (html) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? null;

async function page(path, want) {
  const res = await get(path);
  const html = res.ok ? await res.text() : "";
  const got = pageOf(html);
  const title = titleOf(html);
  check(
    res.status === 200 && got === want && title === TITLES[want],
    `${path} → ${want} (${res.status}, page ${got}, "${title}")`,
  );
}

async function redirect(path, to) {
  const res = await get(path);
  const loc = res.headers.get("location");
  const target = loc && new URL(loc, base).pathname;
  check(
    res.status >= 300 && res.status < 400 && target === to,
    `${path} redirects to ${to} (${res.status} ${loc})`,
  );
}

say(`routes at ${base}`);
await page("/", "hub");
await page("/snake", "snake");
await page("/glass", "glass");
await redirect("/snake/", "/snake");
await redirect("/snake.html", "/snake");
await redirect("/glass.html", "/glass");
await page("/nope/deep", "hub");

const health = await get("/health");
const type = health.headers.get("content-type") ?? "";
check(health.ok && type.includes("json"), `/health is JSON (${health.status}, ${type})`);

// The Vite manifest drives the size check but is listed in public/.assetsignore.
const manifest = await get("/.vite/manifest.json");
const body = await manifest.text();
check(
  !(manifest.headers.get("content-type") ?? "").includes("json") && pageOf(body) === "hub",
  `/.vite/manifest.json is not deployed (falls back to the hub)`,
);

for (const path of ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png", "/og/glass.png"]) {
  const res = await get(path);
  const type = res.headers.get("content-type") ?? "";
  check(
    res.status === 200 && type.startsWith("image/"),
    `${path} is an image (${res.status}, ${type})`,
  );
}

if (old) {
  say(`old host ${old}`);
  const want = new URL(base).host;
  for (const path of ["/", "/snake", "/glass?x=1", "/health"]) {
    const res = await fetch(new URL(path, old), { redirect: "manual" });
    const loc = res.headers.get("location") ?? "";
    const to = loc && new URL(loc);
    check(
      res.status === 301 && to && to.host === want && `${to.pathname}${to.search}` === path,
      `${path} 301s to the same path on ${want} (${res.status} ${loc})`,
    );
  }
}

say(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
