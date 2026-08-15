import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.live.test.ts"],
    // Atomic publication can spend up to 7.5 s publishing and another 7.5 s
    // cleaning a temporary file when Windows file scanners hold either path.
    // Let the storage contract finish so tests assert its result instead of
    // abandoning live filesystem work at Vitest's 5 s default.
    testTimeout: 20_000,
  },
});
