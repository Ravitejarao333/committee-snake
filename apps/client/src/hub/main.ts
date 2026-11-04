import { startGlassPreview } from "./glass-preview";
import { startSnakePreview } from "./snake-preview";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvasIn = (game: string): HTMLCanvasElement | null =>
  document.querySelector(`.card[data-game="${game}"] canvas`);

const snakeCanvas = canvasIn("snake");
const glassCanvas = canvasIn("glass");
const glassCard = glassCanvas?.closest<HTMLElement>(".card");
const snake = snakeCanvas ? startSnakePreview(snakeCanvas, still) : null;
const glass = glassCanvas && glassCard ? startGlassPreview(glassCanvas, glassCard, still) : null;

if (import.meta.env.DEV) {
  // Smoke-test hook (scripts/smoke/client.mjs); never shipped.
  Object.defineProperty(window, "__hub", {
    value: {
      get snakeTicks() {
        return snake?.ticks ?? 0;
      },
      get glassGrowth() {
        return glass?.growth ?? 0;
      },
    },
  });
}
