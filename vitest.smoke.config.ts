import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
    include: ["./scripts/smoke-phase-43.test.ts"],
    fileParallelism: false,
    alias: {
      "server-only": resolve(__dirname, "./src/tests/mocks/server-only.ts"),
      "@": resolve(__dirname, "./src"),
    },
  },
  resolve: {
    alias: {
      "server-only": resolve(__dirname, "./src/tests/mocks/server-only.ts"),
      "@": resolve(__dirname, "./src"),
    },
  },
});
