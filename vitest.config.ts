import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";
import path from "path";

const rootDir = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.join(rootDir),
    },
  },
});
