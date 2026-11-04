import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: true,
    // One HTML entry per page, served at /snake etc. (ADR 0008).
    rolldownOptions: { input: { snake: "snake.html" } },
  },
});
