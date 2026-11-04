import { defineConfig, type Plugin } from "vite";
import { iconFiles } from "./scripts/icons.ts";

const TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  ico: "image/x-icon",
  png: "image/png",
};

/** Emits the icon files at the site root on build, and serves them from the dev server. */
function icons(): Plugin {
  let files: Record<string, string | Buffer> | null = null;
  const all = () => {
    files ??= iconFiles();
    return files;
  };
  return {
    name: "cheap-thrills-icons",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0]?.slice(1) ?? "";
        const body = all()[name];
        if (body === undefined) return next();
        res.setHeader("content-type", TYPES[name.split(".").pop() ?? ""] ?? "");
        res.end(body);
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(all())) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
}

export default defineConfig({
  // favicon.svg, favicon.ico and apple-touch-icon.png at the site root, from one mark.
  plugins: [icons()],
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
