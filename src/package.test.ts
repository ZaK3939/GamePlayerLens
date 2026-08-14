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
      files?: string[];
      scripts?: Record<string, string>;
    };

    expect(manifest.name).toBe("game-player-lens");
    expect(manifest.private).toBe(false);
    expect(manifest.bin).toEqual({"game-player-lens": "dist/cli.js"});
    expect(manifest.files).toEqual(expect.arrayContaining([
      "dist",
      "docs/guides",
      "docs/reference",
      "knowledge/rubrics",
      "knowledge/templates",
      "skills",
    ]));
    expect(manifest.scripts?.prepack).toBe("pnpm build");
    expect(manifest.scripts?.["smoke:package"]).toBeDefined();
  });
});
