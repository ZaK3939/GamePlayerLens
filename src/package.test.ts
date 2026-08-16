import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

describe("npm package contract", () => {
  it("publishes the GamePlayerLens CLI with all runtime assets", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8"),
    ) as {
      name?: string;
      private?: boolean;
      bin?: Record<string, string>;
      engines?: Record<string, string>;
      files?: string[];
      scripts?: Record<string, string>;
    };
    const tsconfig = JSON.parse(
      await readFile(join(process.cwd(), "tsconfig.json"), "utf8"),
    ) as {include?: string[]; exclude?: string[]};

    expect(manifest.name).toBe("game-player-lens");
    expect(manifest.version).toBe("0.5.0");
    expect(manifest.private).toBe(false);
    expect(manifest.bin).toEqual({"game-player-lens": "dist/cli.js"});
    expect(manifest.engines?.node).toBe(">=22");
    expect(manifest.files).toEqual([
      "dist",
      "knowledge/rubrics",
      "knowledge/templates",
      "docs/guides",
      "docs/reference",
      "skills",
      "README.md",
    ]);
    expect(manifest.scripts?.build).toBe("node scripts/clean-dist.mjs && tsc");
    expect(manifest.scripts?.["check:package"]).toBeDefined();
    expect(manifest.scripts?.prepare).toBe("npm run build");
    expect(manifest.scripts?.prepack).toBeUndefined();
    expect(manifest.scripts?.["smoke:package"]).toBeDefined();
    expect(tsconfig.include).toEqual(["src/**/*.ts"]);
    expect(tsconfig.exclude).toEqual([
      "src/**/*.test.ts",
      "src/**/*.live.test.ts",
    ]);
  });
});
