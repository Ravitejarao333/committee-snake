import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/shared/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
