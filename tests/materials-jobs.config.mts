import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Scoped entry point for T-10. Uses T-07b's Vitest dependency and database
// setup; it does not provision a second runner, database or session factory.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  test: {
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: "t10-unit",
          environment: "node",
          include: ["tests/unit/materials-*.test.ts"],
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "t10-integration",
          environment: "node",
          include: ["tests/integration/materials-*.test.ts"],
          setupFiles: ["tests/setup/materials-shared-setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
