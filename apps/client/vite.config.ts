import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: true,
    // One HTML entry per page, served at /snake etc. (ADR 0008).
    // The manifest drives the per-page JS budgets (scripts/check-size.ts).
    manifest: true,
    rolldownOptions: { input: { hub: "index.html", snake: "snake.html", glass: "glass.html" } },
  },
});
