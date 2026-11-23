import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Import the original T-07b setup, never copy its environment/migration logic.
const sharedSetup = resolve("tests/setup/test-database-setup.ts");
if (!existsSync(sharedSetup)) {
  throw new Error(
    "T-10 integration requires T-07b (#20): merge its test-database-setup.ts and auth-test-students.ts first. No fallback database is used.",
  );
}
await import(/* @vite-ignore */ sharedSetup);
